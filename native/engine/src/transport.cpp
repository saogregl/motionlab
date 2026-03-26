#include "engine/log.h"
#include "engine/transport.h"
#include "engine/version.h"

#include <ixwebsocket/IXWebSocketServer.h>
#include <ixwebsocket/IXNetSystem.h>
#include "protocol/transport.pb.h"
#include "mechanism/mechanism.pb.h"

#include "cad_import.h"
#include "primitive_generator.h"
#include "asset_cache.h"
#include "face_classifier.h"
#include "mechanism_state.h"
#include "shape_registry.h"
#include "transport_import_project_context.h"
#include "transport_runtime_session.h"
#include "uuid.h"

#include <algorithm>
#include <atomic>
#include <cctype>
#include <chrono>
#include <condition_variable>
#include <deque>
#include <filesystem>
#include <functional>
#include <iostream>
#include <mutex>
#include <string>
#include <thread>
#include <utility>

namespace motionlab {

// ──────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────

const char* engine_state_string(EngineState state) {
    switch (state) {
        case EngineState::INITIALIZING:  return "initializing";
        case EngineState::READY:         return "ready";
        case EngineState::BUSY:          return "busy";
        case EngineState::ERRORED:       return "error";
        case EngineState::SHUTTING_DOWN: return "shutting_down";
    }
    return "unknown";
}

void log_status(EngineState state, const std::string& message) {
    std::cout << "[ENGINE] status=" << engine_state_string(state);
    if (!message.empty()) {
        std::cout << " " << message;
    }
    std::cout << std::endl << std::flush;
}

std::optional<EngineConfig> parse_args(int argc, char* argv[]) {
    EngineConfig config{};
    bool has_port = false;
    bool has_token = false;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--port" && i + 1 < argc) {
            try {
                int port = std::stoi(argv[++i]);
                if (port < 1 || port > 65535) return std::nullopt;
                config.port = static_cast<uint16_t>(port);
                has_port = true;
            } catch (...) {
                return std::nullopt;
            }
        } else if (arg == "--session-token" && i + 1 < argc) {
            config.session_token = argv[++i];
            has_token = true;
        }
    }

    if (!has_port || !has_token) return std::nullopt;
    return config;
}

// ──────────────────────────────────────────────
// Cache directory
// ──────────────────────────────────────────────

static std::filesystem::path get_cache_directory() {
#ifdef _WIN32
    const char* home = std::getenv("USERPROFILE");
#else
    const char* home = std::getenv("HOME");
#endif
    if (!home) home = ".";
    return std::filesystem::path(home) / ".motionlab" / "cache" / "assets";
}

// ──────────────────────────────────────────────
// TransportServer implementation
// ──────────────────────────────────────────────

struct TransportServer::Impl {
    std::unique_ptr<ix::WebSocketServer> server;
    std::string session_token;
    std::mutex conn_mutex;
    std::mutex send_mutex_;
    std::weak_ptr<ix::WebSocket> active_conn;
    ix::WebSocket* active_ws = nullptr;
    bool has_connection = false;
    bool authenticated = false;
    uint64_t connection_epoch = 0;
    std::atomic<bool> running{false};
    engine::MechanismState mechanism_state;
    engine::ShapeRegistry shape_registry;
    transport_detail::ImportProjectContext import_project;
    transport_detail::RuntimeSession runtime_session;

    // Serialized command execution — keep heavy work and state mutation off
    // the WebSocket callback thread while preserving command order.
    std::thread job_thread;
    std::mutex job_mutex;
    std::condition_variable job_cv;
    std::deque<std::function<void()>> job_queue;
    bool stop_jobs = false;

    explicit Impl(std::string token)
        : session_token(std::move(token))
        , import_project(mechanism_state, shape_registry, get_cache_directory()) {
        runtime_session.set_send_event_callback(
            [this](ix::WebSocket& ws, const protocol::Event& event) { send_event(ws, event); });
        start_job_thread();
    }

    ~Impl() {
        stop_job_thread();
        runtime_session.stop();
    }

    void start_job_thread() {
        job_thread = std::thread([this]() { job_loop(); });
    }

    void stop_job_thread() {
        {
            std::lock_guard<std::mutex> lock(job_mutex);
            stop_jobs = true;
            job_queue.clear();
        }
        job_cv.notify_all();
        if (job_thread.joinable()) {
            job_thread.join();
        }
    }

    void clear_pending_jobs() {
        std::lock_guard<std::mutex> lock(job_mutex);
        job_queue.clear();
    }

    void job_loop() {
        while (true) {
            std::function<void()> job;
            {
                std::unique_lock<std::mutex> lock(job_mutex);
                job_cv.wait(lock, [this]() { return stop_jobs || !job_queue.empty(); });
                if (stop_jobs && job_queue.empty()) {
                    return;
                }
                job = std::move(job_queue.front());
                job_queue.pop_front();
            }
            job();
        }
    }

    template <typename Fn>
    void post_job(Fn&& fn) {
        {
            std::lock_guard<std::mutex> lock(job_mutex);
            if (stop_jobs) return;
            job_queue.emplace_back(std::forward<Fn>(fn));
        }
        job_cv.notify_one();
    }

    uint64_t active_connection_epoch() {
        std::lock_guard<std::mutex> lock(conn_mutex);
        return connection_epoch;
    }

    ix::WebSocket* current_ws(uint64_t expected_epoch) {
        std::lock_guard<std::mutex> lock(conn_mutex);
        if (!authenticated || !active_ws || connection_epoch != expected_epoch) {
            return nullptr;
        }
        return active_ws;
    }

    template <typename CommandT, typename Method>
    void enqueue_command(uint64_t sequence_id, CommandT payload, Method method) {
        const uint64_t epoch = active_connection_epoch();
        post_job([this, sequence_id, epoch, payload = std::move(payload), method]() mutable {
            ix::WebSocket* ws = current_ws(epoch);
            if (!ws) return;
            std::invoke(method, this, *ws, sequence_id, payload);
        });
    }

    void send_event(ix::WebSocket& ws, const protocol::Event& event) {
        std::string serialized;
        event.SerializeToString(&serialized);
        std::lock_guard<std::mutex> lock(send_mutex_);
        ws.sendBinary(serialized);
    }

    void handle_message(std::shared_ptr<ix::ConnectionState> /*state*/,
                        ix::WebSocket& ws,
                        const ix::WebSocketMessagePtr& msg) {
        if (msg->type == ix::WebSocketMessageType::Open) {
            std::lock_guard<std::mutex> lock(conn_mutex);
            if (has_connection) {
                ws.close(4001, "Only one client connection allowed");
                return;
            }
            has_connection = true;
            authenticated = false;
            ++connection_epoch;
            active_ws = &ws;
            runtime_session.set_active_ws(&ws);
            return;
        }

        if (msg->type == ix::WebSocketMessageType::Close) {
            clear_pending_jobs();
            runtime_session.stop();
            std::lock_guard<std::mutex> lock(conn_mutex);
            has_connection = false;
            authenticated = false;
            ++connection_epoch;
            active_ws = nullptr;
            runtime_session.clear_active_ws();
            return;
        }

        if (msg->type != ix::WebSocketMessageType::Message) return;

        // Reject non-binary frames
        if (!msg->binary) {
            ws.close(4003, "Only binary frames accepted");
            return;
        }

        protocol::Command cmd;
        if (!cmd.ParseFromString(msg->str)) {
            ws.close(4003, "Invalid protobuf command");
            return;
        }

        switch (cmd.payload_case()) {
            case protocol::Command::kHandshake:
                handle_handshake(ws, cmd.sequence_id(), cmd.handshake());
                break;
            case protocol::Command::kPing:
                handle_ping(ws, cmd.sequence_id(), cmd.ping());
                break;
            case protocol::Command::kImportAsset:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.import_asset(), &Impl::handle_import_asset);
                break;
            case protocol::Command::kCreateDatum:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.create_datum(), &Impl::handle_create_datum);
                break;
            case protocol::Command::kDeleteDatum:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.delete_datum(), &Impl::handle_delete_datum);
                break;
            case protocol::Command::kRenameDatum:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.rename_datum(), &Impl::handle_rename_datum);
                break;
            case protocol::Command::kCreateDatumFromFace:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.create_datum_from_face(), &Impl::handle_create_datum_from_face);
                break;
            case protocol::Command::kUpdateBody:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.update_body(), &Impl::handle_update_body);
                break;
            case protocol::Command::kUpdateDatumPose:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.update_datum_pose(), &Impl::handle_update_datum_pose);
                break;
            case protocol::Command::kCreateJoint:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.create_joint(), &Impl::handle_create_joint);
                break;
            case protocol::Command::kUpdateJoint:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.update_joint(), &Impl::handle_update_joint);
                break;
            case protocol::Command::kDeleteJoint:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.delete_joint(), &Impl::handle_delete_joint);
                break;
            case protocol::Command::kCreateLoad:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.create_load(), &Impl::handle_create_load);
                break;
            case protocol::Command::kUpdateLoad:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.update_load(), &Impl::handle_update_load);
                break;
            case protocol::Command::kDeleteLoad:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.delete_load(), &Impl::handle_delete_load);
                break;
            case protocol::Command::kCreateActuator:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.create_actuator(), &Impl::handle_create_actuator);
                break;
            case protocol::Command::kUpdateActuator:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.update_actuator(), &Impl::handle_update_actuator);
                break;
            case protocol::Command::kDeleteActuator:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.delete_actuator(), &Impl::handle_delete_actuator);
                break;
            case protocol::Command::kCompileMechanism:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.compile_mechanism(), &Impl::handle_compile_mechanism);
                break;
            case protocol::Command::kSimulationControl:
                if (!authenticated) break;
                runtime_session.handle_simulation_control(cmd.simulation_control());
                break;
            case protocol::Command::kScrub:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.scrub(), &Impl::handle_scrub);
                break;
            case protocol::Command::kSaveProject:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.save_project(), &Impl::handle_save_project);
                break;
            case protocol::Command::kLoadProject:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.load_project(), &Impl::handle_load_project);
                break;
            case protocol::Command::kRelocateAsset:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.relocate_asset(), &Impl::handle_relocate_asset);
                break;
            case protocol::Command::kNewProject:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.new_project(), &Impl::handle_new_project);
                break;
            case protocol::Command::kCreateBody:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.create_body(), &Impl::handle_create_body);
                break;
            case protocol::Command::kDeleteBody:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.delete_body(), &Impl::handle_delete_body);
                break;
            case protocol::Command::kAttachGeometry:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.attach_geometry(), &Impl::handle_attach_geometry);
                break;
            case protocol::Command::kDetachGeometry:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.detach_geometry(), &Impl::handle_detach_geometry);
                break;
            case protocol::Command::kUpdateMassProperties:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.update_mass_properties(), &Impl::handle_update_mass_properties);
                break;
            case protocol::Command::kCreatePrimitiveBody:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.create_primitive_body(), &Impl::handle_create_primitive_body);
                break;
            case protocol::Command::kUpdatePrimitive:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.update_primitive(), &Impl::handle_update_primitive);
                break;
            case protocol::Command::kUpdateCollisionConfig:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.update_collision_config(), &Impl::handle_update_collision_config);
                break;
            case protocol::Command::kPlaceAssetInScene:
                if (!authenticated) break;
                enqueue_command(cmd.sequence_id(), cmd.place_asset_in_scene(), &Impl::handle_place_asset_in_scene);
                break;
            default:
                break;
        }
    }

    void handle_handshake(ix::WebSocket& ws, uint64_t sequence_id,
                          const protocol::Handshake& hs) {
        bool compatible = (hs.session_token() == session_token)
                       && (hs.protocol().name() == PROTOCOL_NAME)
                       && (hs.protocol().version() == PROTOCOL_VERSION);

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* ack = event.mutable_handshake_ack();
        ack->set_compatible(compatible);
        auto* ep = ack->mutable_engine_protocol();
        ep->set_name(PROTOCOL_NAME);
        ep->set_version(PROTOCOL_VERSION);
        ack->set_engine_version(MOTIONLAB_ENGINE_VERSION_STRING);
        send_event(ws, event);

        if (compatible) {
            authenticated = true;
            spdlog::info("Client authenticated, protocol v{}", PROTOCOL_VERSION);

            protocol::Event status_event;
            auto* status = status_event.mutable_engine_status();
            status->set_state(protocol::EngineStatus::STATE_READY);
            send_event(ws, status_event);
        } else {
            spdlog::warn("Handshake rejected: token_match={} name_match={} version_match={} (client_v={} engine_v={})",
                         hs.session_token() == session_token,
                         hs.protocol().name() == PROTOCOL_NAME,
                         hs.protocol().version() == PROTOCOL_VERSION,
                         hs.protocol().version(),
                         PROTOCOL_VERSION);
            ws.close(4002, "Incompatible handshake");
        }
    }

    void handle_ping(ix::WebSocket& ws, uint64_t sequence_id,
                     const protocol::Ping& ping) {
        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* pong = event.mutable_pong();
        pong->set_timestamp(ping.timestamp());
        send_event(ws, event);
    }

    void handle_import_asset(ix::WebSocket& ws, uint64_t sequence_id,
                              const protocol::ImportAssetCommand& cmd) {
        import_project.handle_import_asset(
            ws, sequence_id, cmd,
            [this](ix::WebSocket& target_ws, const protocol::Event& event) {
                send_event(target_ws, event);
            });
    }

    void populate_proto_datum(mechanism::Datum* datum,
                               const engine::MechanismState::DatumEntry& entry) {
        *datum = entry;
    }

    protocol::FaceSurfaceClass to_proto_surface_class(engine::FaceDatumSurfaceClass surface_class) {
        switch (surface_class) {
            case engine::FaceDatumSurfaceClass::Planar:
                return protocol::FACE_SURFACE_CLASS_PLANAR;
            case engine::FaceDatumSurfaceClass::Cylindrical:
                return protocol::FACE_SURFACE_CLASS_CYLINDRICAL;
            case engine::FaceDatumSurfaceClass::Conical:
                return protocol::FACE_SURFACE_CLASS_CONICAL;
            case engine::FaceDatumSurfaceClass::Spherical:
                return protocol::FACE_SURFACE_CLASS_SPHERICAL;
            case engine::FaceDatumSurfaceClass::Toroidal:
                return protocol::FACE_SURFACE_CLASS_TOROIDAL;
            case engine::FaceDatumSurfaceClass::Other:
            default:
                return protocol::FACE_SURFACE_CLASS_OTHER;
        }
    }

    void handle_create_datum(ix::WebSocket& ws, uint64_t sequence_id,
                              const protocol::CreateDatumCommand& cmd) {
        double pos[3] = {0, 0, 0};
        double orient[4] = {1, 0, 0, 0}; // w,x,y,z identity

        if (cmd.has_local_pose()) {
            if (cmd.local_pose().has_position()) {
                pos[0] = cmd.local_pose().position().x();
                pos[1] = cmd.local_pose().position().y();
                pos[2] = cmd.local_pose().position().z();
            }
            if (cmd.local_pose().has_orientation()) {
                orient[0] = cmd.local_pose().orientation().w();
                orient[1] = cmd.local_pose().orientation().x();
                orient[2] = cmd.local_pose().orientation().y();
                orient[3] = cmd.local_pose().orientation().z();
            }
        }

        std::string parent_id = cmd.has_parent_body_id() ? cmd.parent_body_id().id() : "";
        auto result = mechanism_state.create_datum(parent_id, cmd.name(), pos, orient);

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* cr = event.mutable_create_datum_result();
        if (result.has_value()) {
            populate_proto_datum(cr->mutable_datum(), result.value());
            spdlog::debug("Created datum '{}' (id={}) on body {}", cmd.name(), result->id().id(), parent_id);
        } else {
            spdlog::warn("Failed to create datum '{}': parent body not found: {}", cmd.name(), parent_id);
            cr->set_error_message("Parent body not found: " + parent_id);
        }
        send_event(ws, event);
    }

    void handle_create_datum_from_face(ix::WebSocket& ws, uint64_t sequence_id,
                                       const protocol::CreateDatumFromFaceCommand& cmd) {
        const std::string geometry_id = cmd.has_geometry_id() ? cmd.geometry_id().id() : "";

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* result = event.mutable_create_datum_from_face_result();

        const auto* geometry = mechanism_state.get_geometry(geometry_id);
        if (!geometry) {
            result->set_error_message("Geometry not found: " + geometry_id);
            send_event(ws, event);
            return;
        }

        const std::string body_id = geometry->parent_body_id().id();
        if (!mechanism_state.has_body(body_id)) {
            result->set_error_message("Parent body not found for geometry: " + geometry_id);
            send_event(ws, event);
            return;
        }

        if (!import_project.ensure_geometry_shape_loaded(geometry_id)) {
            result->set_error_message("Face-aware datum creation unavailable for geometry: " + geometry_id);
            send_event(ws, event);
            return;
        }

        const TopoDS_Shape* shape = shape_registry.get(geometry_id);

        if (!shape) {
            result->set_error_message("Face-aware datum creation unavailable for geometry: " + geometry_id);
            send_event(ws, event);
            return;
        }

        auto face_pose = engine::classify_face_for_datum(*shape, cmd.face_index());
        if (!face_pose.has_value()) {
            result->set_error_message("Face index out of range for geometry: " + geometry_id);
            send_event(ws, event);
            return;
        }

        const double length_scale = import_project.geometry_length_scale(geometry_id);
        for (double& component : face_pose->position) {
            component *= length_scale;
        }

        auto datum = mechanism_state.create_datum(body_id, cmd.name(), face_pose->position, face_pose->orientation);
        if (!datum.has_value()) {
            result->set_error_message("Failed to create datum for body: " + body_id);
            send_event(ws, event);
            return;
        }

        auto* success = result->mutable_success();
        populate_proto_datum(success->mutable_datum(), datum.value());
        success->set_face_index(cmd.face_index());
        success->set_surface_class(to_proto_surface_class(face_pose->surface_class));
        success->mutable_geometry_id()->set_id(geometry_id);

        // Populate enriched face geometry metadata
        auto* fg = success->mutable_face_geometry();
        if (face_pose->axis_direction.has_value()) {
            auto* ad = fg->mutable_axis_direction();
            ad->set_x((*face_pose->axis_direction)[0]);
            ad->set_y((*face_pose->axis_direction)[1]);
            ad->set_z((*face_pose->axis_direction)[2]);
        }
        if (face_pose->normal.has_value()) {
            auto* n = fg->mutable_normal();
            n->set_x((*face_pose->normal)[0]);
            n->set_y((*face_pose->normal)[1]);
            n->set_z((*face_pose->normal)[2]);
        }
        if (face_pose->radius.has_value()) {
            fg->set_radius(*face_pose->radius * length_scale);
        }
        if (face_pose->secondary_radius.has_value()) {
            fg->set_secondary_radius(*face_pose->secondary_radius * length_scale);
        }
        if (face_pose->semi_angle.has_value()) {
            fg->set_semi_angle(*face_pose->semi_angle);
        }

        send_event(ws, event);
    }

    void handle_delete_datum(ix::WebSocket& ws, uint64_t sequence_id,
                              const protocol::DeleteDatumCommand& cmd) {
        std::string datum_id = cmd.has_datum_id() ? cmd.datum_id().id() : "";
        bool ok = mechanism_state.delete_datum(datum_id);

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* dr = event.mutable_delete_datum_result();
        if (ok) {
            dr->mutable_deleted_id()->set_id(datum_id);
        } else {
            dr->set_error_message("Datum not found: " + datum_id);
        }
        send_event(ws, event);
    }

    void handle_rename_datum(ix::WebSocket& ws, uint64_t sequence_id,
                              const protocol::RenameDatumCommand& cmd) {
        std::string datum_id = cmd.has_datum_id() ? cmd.datum_id().id() : "";
        auto result = mechanism_state.rename_datum(datum_id, cmd.name());

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* rr = event.mutable_rename_datum_result();
        if (result.has_value()) {
            populate_proto_datum(rr->mutable_datum(), result.value());
        } else {
            rr->set_error_message("Datum not found: " + datum_id);
        }
        send_event(ws, event);
    }

    void handle_update_datum_pose(ix::WebSocket& ws, uint64_t sequence_id,
                                  const protocol::UpdateDatumPoseCommand& cmd) {
        double pos[3] = {0, 0, 0};
        double orient[4] = {1, 0, 0, 0};

        if (cmd.has_new_local_pose()) {
            if (cmd.new_local_pose().has_position()) {
                pos[0] = cmd.new_local_pose().position().x();
                pos[1] = cmd.new_local_pose().position().y();
                pos[2] = cmd.new_local_pose().position().z();
            }
            if (cmd.new_local_pose().has_orientation()) {
                orient[0] = cmd.new_local_pose().orientation().w();
                orient[1] = cmd.new_local_pose().orientation().x();
                orient[2] = cmd.new_local_pose().orientation().y();
                orient[3] = cmd.new_local_pose().orientation().z();
            }
        }

        std::string datum_id = cmd.has_datum_id() ? cmd.datum_id().id() : "";
        auto result = mechanism_state.update_datum_pose(datum_id, pos, orient);

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* rr = event.mutable_update_datum_pose_result();
        if (result.has_value()) {
            populate_proto_datum(rr->mutable_datum(), result.value());
        } else {
            rr->set_error_message("Datum not found: " + datum_id);
        }
        send_event(ws, event);
    }

    void populate_proto_joint(mechanism::Joint* proto_joint,
                               const engine::MechanismState::JointEntry& entry) {
        *proto_joint = entry;
    }

    void populate_proto_load(mechanism::Load* proto_load,
                              const engine::MechanismState::LoadEntry& entry) {
        *proto_load = entry;
    }

    void populate_proto_actuator(mechanism::Actuator* proto_actuator,
                                  const engine::MechanismState::ActuatorEntry& entry) {
        *proto_actuator = entry;
    }

    void handle_update_body(ix::WebSocket& ws, uint64_t sequence_id,
                             const protocol::UpdateBodyCommand& cmd) {
        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* result = event.mutable_update_body_result();

        std::string body_id = cmd.has_body_id() ? cmd.body_id().id() : "";
        if (body_id.empty() || !mechanism_state.has_body(body_id)) {
            result->set_error_message("Body not found: " + body_id);
            send_event(ws, event);
            return;
        }

        if (cmd.has_is_fixed()) {
            mechanism_state.set_body_fixed(body_id, cmd.is_fixed());
        }
        if (cmd.has_name()) {
            mechanism_state.rename_body(body_id, cmd.name());
        }
        if (cmd.has_pose()) {
            double pos[3] = {
                cmd.pose().position().x(),
                cmd.pose().position().y(),
                cmd.pose().position().z()
            };
            double orient[4] = {
                cmd.pose().orientation().w(),
                cmd.pose().orientation().x(),
                cmd.pose().orientation().y(),
                cmd.pose().orientation().z()
            };
            mechanism_state.set_body_pose(body_id, pos, orient);
        }

        // Build response Body proto from mechanism_state
        auto body_proto = mechanism_state.build_body_proto(body_id);
        if (body_proto.has_value()) {
            *result->mutable_body() = std::move(body_proto.value());
        }

        send_event(ws, event);
    }

    // ──────────────────────────────────────────────
    // Body & Geometry CRUD (Epic 13)
    // ──────────────────────────────────────────────

    void handle_create_body(ix::WebSocket& ws, uint64_t sequence_id,
                             const protocol::CreateBodyCommand& cmd) {
        double pos[3] = {0, 0, 0};
        double orient[4] = {1, 0, 0, 0};
        if (cmd.has_pose()) {
            pos[0] = cmd.pose().position().x();
            pos[1] = cmd.pose().position().y();
            pos[2] = cmd.pose().position().z();
            orient[0] = cmd.pose().orientation().w();
            orient[1] = cmd.pose().orientation().x();
            orient[2] = cmd.pose().orientation().y();
            orient[3] = cmd.pose().orientation().z();
        }

        const mechanism::MassProperties* mass_ptr = cmd.has_mass_properties() ? &cmd.mass_properties() : nullptr;
        std::string body_id = mechanism_state.create_body(cmd.name(), pos, orient, mass_ptr, cmd.is_fixed());

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* result = event.mutable_create_body_result();
        auto body_proto = mechanism_state.build_body_proto(body_id);
        if (body_proto.has_value()) {
            *result->mutable_body() = std::move(body_proto.value());
            spdlog::debug("Created body '{}' (id={})", cmd.name(), body_id);
        }
        send_event(ws, event);
    }

    void handle_delete_body(ix::WebSocket& ws, uint64_t sequence_id,
                             const protocol::DeleteBodyCommand& cmd) {
        std::string body_id = cmd.has_body_id() ? cmd.body_id().id() : "";

        // Clean up import context data
        import_project.remove_body_data(body_id);

        bool ok = mechanism_state.delete_body(body_id);

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* result = event.mutable_delete_body_result();
        if (ok) {
            result->mutable_deleted_id()->set_id(body_id);
            spdlog::debug("Deleted body (id={})", body_id);
        } else {
            result->set_error_message("Body not found: " + body_id);
        }
        send_event(ws, event);
    }

    void handle_attach_geometry(ix::WebSocket& ws, uint64_t sequence_id,
                                 const protocol::AttachGeometryCommand& cmd) {
        std::string geom_id = cmd.has_geometry_id() ? cmd.geometry_id().id() : "";
        std::string body_id = cmd.has_target_body_id() ? cmd.target_body_id().id() : "";
        const auto* existing_geometry = mechanism_state.get_geometry(geom_id);
        const std::string old_parent_id = existing_geometry ? existing_geometry->parent_body_id().id() : "";
        double pos[3] = {0, 0, 0};
        double orient[4] = {1, 0, 0, 0};
        if (cmd.has_local_pose()) {
            pos[0] = cmd.local_pose().position().x();
            pos[1] = cmd.local_pose().position().y();
            pos[2] = cmd.local_pose().position().z();
            orient[0] = cmd.local_pose().orientation().w();
            orient[1] = cmd.local_pose().orientation().x();
            orient[2] = cmd.local_pose().orientation().y();
            orient[3] = cmd.local_pose().orientation().z();
        }

        auto result = mechanism_state.attach_geometry(geom_id, body_id, pos, orient);

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* ar = event.mutable_attach_geometry_result();
        if (result.entry.has_value()) {
            *ar->mutable_geometry() = result.entry.value();
            import_project.reparent_geometry_data(geom_id, old_parent_id, body_id);
            if (!old_parent_id.empty() && old_parent_id != body_id) {
                auto old_parent_body = mechanism_state.build_body_proto(old_parent_id);
                if (old_parent_body.has_value()) {
                    *ar->mutable_old_parent_body() = std::move(old_parent_body.value());
                }
            }
            auto new_parent_body = mechanism_state.build_body_proto(body_id);
            if (new_parent_body.has_value()) {
                *ar->mutable_new_parent_body() = std::move(new_parent_body.value());
            }
        } else {
            ar->set_error_message(result.error);
        }
        send_event(ws, event);
    }

    void handle_detach_geometry(ix::WebSocket& ws, uint64_t sequence_id,
                                 const protocol::DetachGeometryCommand& cmd) {
        std::string geom_id = cmd.has_geometry_id() ? cmd.geometry_id().id() : "";
        const auto* existing_geometry = mechanism_state.get_geometry(geom_id);
        const std::string old_parent_id = existing_geometry ? existing_geometry->parent_body_id().id() : "";
        auto result = mechanism_state.detach_geometry(geom_id);

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* dr = event.mutable_detach_geometry_result();
        if (result.entry.has_value()) {
            dr->mutable_detached_id()->set_id(geom_id);
            *dr->mutable_geometry() = result.entry.value();
            import_project.reparent_geometry_data(geom_id, old_parent_id, "");
            if (!old_parent_id.empty()) {
                auto former_parent_body = mechanism_state.build_body_proto(old_parent_id);
                if (former_parent_body.has_value()) {
                    *dr->mutable_former_parent_body() = std::move(former_parent_body.value());
                }
            }
        } else {
            dr->set_error_message(result.error);
        }
        send_event(ws, event);
    }

    void handle_update_mass_properties(ix::WebSocket& ws, uint64_t sequence_id,
                                        const protocol::UpdateMassPropertiesCommand& cmd) {
        std::string body_id = cmd.has_body_id() ? cmd.body_id().id() : "";

        const mechanism::MassProperties* mass_ptr = cmd.has_mass_properties() ? &cmd.mass_properties() : nullptr;
        bool ok = mechanism_state.set_mass_override(body_id, cmd.mass_override(), mass_ptr);

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* result = event.mutable_update_mass_properties_result();
        if (ok) {
            auto body_proto = mechanism_state.build_body_proto(body_id);
            if (body_proto.has_value()) {
                *result->mutable_body() = std::move(body_proto.value());
            }
        } else {
            result->set_error_message("Body not found: " + body_id);
        }
        send_event(ws, event);
    }

    void handle_create_primitive_body(ix::WebSocket& ws, uint64_t sequence_id,
                                       const protocol::CreatePrimitiveBodyCommand& cmd) {
        double density = cmd.density() > 0 ? cmd.density() : 1000.0;

        auto prim = engine::generate_primitive(cmd.shape(), cmd.params(), density);

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* result = event.mutable_create_primitive_body_result();

        if (!prim.success) {
            result->set_error_message(prim.error_message);
            send_event(ws, event);
            return;
        }

        std::string body_id = engine::generate_uuidv7();
        std::string geometry_id = engine::generate_uuidv7();

        // Default name from shape type
        std::string name = cmd.name();
        if (name.empty()) {
            switch (cmd.shape()) {
                case mechanism::PRIMITIVE_SHAPE_BOX:      name = "Box"; break;
                case mechanism::PRIMITIVE_SHAPE_CYLINDER:  name = "Cylinder"; break;
                case mechanism::PRIMITIVE_SHAPE_SPHERE:    name = "Sphere"; break;
                default:                                   name = "Primitive"; break;
            }
        }

        // Extract position
        double pos[3] = {0, 0, 0};
        if (cmd.has_position()) {
            pos[0] = cmd.position().x();
            pos[1] = cmd.position().y();
            pos[2] = cmd.position().z();
        }
        double orient[4] = {1, 0, 0, 0};

        // Register body in mechanism state
        mechanism_state.add_body(body_id, name, pos, orient,
                                  prim.mass_properties.mass,
                                  prim.mass_properties.center_of_mass.data(),
                                  prim.mass_properties.inertia.data());

        // Build mass properties proto for geometry
        mechanism::MassProperties geom_mass;
        geom_mass.set_mass(prim.mass_properties.mass);
        geom_mass.mutable_center_of_mass()->set_x(prim.mass_properties.center_of_mass[0]);
        geom_mass.mutable_center_of_mass()->set_y(prim.mass_properties.center_of_mass[1]);
        geom_mass.mutable_center_of_mass()->set_z(prim.mass_properties.center_of_mass[2]);
        geom_mass.set_ixx(prim.mass_properties.inertia[0]);
        geom_mass.set_iyy(prim.mass_properties.inertia[1]);
        geom_mass.set_izz(prim.mass_properties.inertia[2]);
        geom_mass.set_ixy(prim.mass_properties.inertia[3]);
        geom_mass.set_ixz(prim.mass_properties.inertia[4]);
        geom_mass.set_iyz(prim.mass_properties.inertia[5]);

        // Build PrimitiveSource for persistence
        mechanism::PrimitiveSource prim_source;
        prim_source.set_shape(cmd.shape());
        *prim_source.mutable_params() = cmd.params();

        // Register geometry with primitive source (no AssetReference)
        double g_pos[3] = {0, 0, 0};
        double g_orient[4] = {1, 0, 0, 0};
        auto geom_result = mechanism_state.add_geometry(
            geometry_id, name, body_id,
            g_pos, g_orient, geom_mass,
            nullptr, prim.face_count, &prim_source);

        if (!geom_result.error.empty()) {
            result->set_error_message(geom_result.error);
            send_event(ws, event);
            return;
        }

        // Store B-Rep shape for face-aware picking
        if (prim.brep_shape) {
            shape_registry.store(geometry_id, *prim.brep_shape);
        }

        // Build GeometryImportResult for the response
        auto* gir = result->mutable_geometry();
        gir->set_geometry_id(geometry_id);
        gir->set_body_id(body_id);
        gir->set_name(name);
        auto* gir_mesh = gir->mutable_display_mesh();
        gir_mesh->mutable_vertices()->Assign(prim.mesh.vertices.begin(), prim.mesh.vertices.end());
        gir_mesh->mutable_indices()->Assign(prim.mesh.indices.begin(), prim.mesh.indices.end());
        gir_mesh->mutable_normals()->Assign(prim.mesh.normals.begin(), prim.mesh.normals.end());
        gir->mutable_part_index()->Assign(prim.mesh.part_index.begin(), prim.mesh.part_index.end());
        *gir->mutable_computed_mass_properties() = geom_mass;
        auto* gir_pose = gir->mutable_pose();
        gir_pose->mutable_position()->set_x(pos[0]);
        gir_pose->mutable_position()->set_y(pos[1]);
        gir_pose->mutable_position()->set_z(pos[2]);
        gir_pose->mutable_orientation()->set_w(1.0);

        // Populate primitive source and face count on the response
        *gir->mutable_primitive_source() = prim_source;
        gir->set_face_count(prim.face_count);

        // Populate body proto in the result
        auto body_proto = mechanism_state.build_body_proto(body_id);
        if (body_proto.has_value()) {
            *result->mutable_body() = std::move(body_proto.value());
        }

        // Register in import project context for save/load
        import_project.register_primitive_geometry(geometry_id, body_id, *gir);

        spdlog::info("Created primitive body '{}' (body={}, geom={}, shape={})",
                     name, body_id, geometry_id, static_cast<int>(cmd.shape()));
        send_event(ws, event);
    }

    // ──────────────────────────────────────────────
    // Update primitive dimensions (Scene Building C4)
    // ──────────────────────────────────────────────

    void handle_update_primitive(ix::WebSocket& ws, uint64_t sequence_id,
                                  const protocol::UpdatePrimitiveCommand& cmd) {
        std::string geom_id = cmd.has_geometry_id() ? cmd.geometry_id().id() : "";

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* result = event.mutable_update_primitive_result();

        const auto* existing = mechanism_state.get_geometry(geom_id);
        if (!existing) {
            result->set_error_message("Geometry not found: " + geom_id);
            send_event(ws, event);
            return;
        }
        if (!existing->has_primitive_source()) {
            result->set_error_message("Geometry is not a primitive: " + geom_id);
            send_event(ws, event);
            return;
        }

        // Use existing density or command override
        double density = cmd.density() > 0 ? cmd.density() : 1000.0;
        auto shape = existing->primitive_source().shape();

        auto prim = engine::generate_primitive(shape, cmd.params(), density);
        if (!prim.success) {
            result->set_error_message(prim.error_message);
            send_event(ws, event);
            return;
        }

        // Build updated mass and source protos
        mechanism::MassProperties geom_mass;
        geom_mass.set_mass(prim.mass_properties.mass);
        geom_mass.mutable_center_of_mass()->set_x(prim.mass_properties.center_of_mass[0]);
        geom_mass.mutable_center_of_mass()->set_y(prim.mass_properties.center_of_mass[1]);
        geom_mass.mutable_center_of_mass()->set_z(prim.mass_properties.center_of_mass[2]);
        geom_mass.set_ixx(prim.mass_properties.inertia[0]);
        geom_mass.set_iyy(prim.mass_properties.inertia[1]);
        geom_mass.set_izz(prim.mass_properties.inertia[2]);
        geom_mass.set_ixy(prim.mass_properties.inertia[3]);
        geom_mass.set_ixz(prim.mass_properties.inertia[4]);
        geom_mass.set_iyz(prim.mass_properties.inertia[5]);

        mechanism::PrimitiveSource prim_source;
        prim_source.set_shape(shape);
        *prim_source.mutable_params() = cmd.params();

        auto geom_result = mechanism_state.update_geometry_primitive(
            geom_id, geom_mass, prim.face_count, prim_source);
        if (!geom_result.entry.has_value()) {
            result->set_error_message(geom_result.error);
            send_event(ws, event);
            return;
        }

        // Replace B-Rep in shape registry
        if (prim.brep_shape) {
            shape_registry.store(geom_id, *prim.brep_shape);
        }

        // Build success response
        auto* success = result->mutable_success();
        *success->mutable_geometry() = geom_result.entry.value();
        auto* dm = success->mutable_display_mesh();
        dm->mutable_vertices()->Assign(prim.mesh.vertices.begin(), prim.mesh.vertices.end());
        dm->mutable_indices()->Assign(prim.mesh.indices.begin(), prim.mesh.indices.end());
        dm->mutable_normals()->Assign(prim.mesh.normals.begin(), prim.mesh.normals.end());
        success->mutable_part_index()->Assign(prim.mesh.part_index.begin(), prim.mesh.part_index.end());
        success->set_face_count(prim.face_count);

        // Return updated parent body with recomputed aggregate mass
        std::string parent_id = existing->parent_body_id().id();
        if (!parent_id.empty()) {
            auto body_proto = mechanism_state.build_body_proto(parent_id);
            if (body_proto.has_value()) {
                *success->mutable_parent_body() = std::move(body_proto.value());
            }
        }

        spdlog::info("Updated primitive geometry '{}' (geom={}, shape={})",
                     existing->name(), geom_id, static_cast<int>(shape));
        send_event(ws, event);
    }

    // ──────────────────────────────────────────────
    // Collision config authoring (Scene Building E1)
    // ──────────────────────────────────────────────

    void handle_update_collision_config(ix::WebSocket& ws, uint64_t sequence_id,
                                         const protocol::UpdateCollisionConfigCommand& cmd) {
        std::string geom_id = cmd.has_geometry_id() ? cmd.geometry_id().id() : "";

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* result = event.mutable_update_collision_config_result();

        const auto* existing = mechanism_state.get_geometry(geom_id);
        if (!existing) {
            result->set_error_message("Geometry not found: " + geom_id);
            send_event(ws, event);
            return;
        }

        mechanism::CollisionConfig resolved = cmd.collision_config();

        // Auto-fit: compute dimensions from B-Rep bounding box when values are zero
        if (resolved.shape_type() != mechanism::COLLISION_SHAPE_TYPE_NONE) {
            bool needs_autofit = false;
            switch (resolved.shape_type()) {
                case mechanism::COLLISION_SHAPE_TYPE_BOX:
                    needs_autofit = resolved.half_extents().x() <= 0 &&
                                    resolved.half_extents().y() <= 0 &&
                                    resolved.half_extents().z() <= 0;
                    break;
                case mechanism::COLLISION_SHAPE_TYPE_SPHERE:
                    needs_autofit = resolved.radius() <= 0;
                    break;
                case mechanism::COLLISION_SHAPE_TYPE_CYLINDER:
                    needs_autofit = resolved.radius() <= 0 && resolved.height() <= 0;
                    break;
                default:
                    break;
            }

            if (needs_autofit) {
                // Compute bounding box from display mesh vertices
                const auto& mesh = existing->display_mesh();
                double min_x = 1e30, min_y = 1e30, min_z = 1e30;
                double max_x = -1e30, max_y = -1e30, max_z = -1e30;
                for (int i = 0; i + 2 < mesh.vertices_size(); i += 3) {
                    double vx = mesh.vertices(i);
                    double vy = mesh.vertices(i + 1);
                    double vz = mesh.vertices(i + 2);
                    min_x = std::min(min_x, vx); max_x = std::max(max_x, vx);
                    min_y = std::min(min_y, vy); max_y = std::max(max_y, vy);
                    min_z = std::min(min_z, vz); max_z = std::max(max_z, vz);
                }
                double hx = (max_x - min_x) * 0.5;
                double hy = (max_y - min_y) * 0.5;
                double hz = (max_z - min_z) * 0.5;
                double cx = (max_x + min_x) * 0.5;
                double cy = (max_y + min_y) * 0.5;
                double cz = (max_z + min_z) * 0.5;

                switch (resolved.shape_type()) {
                    case mechanism::COLLISION_SHAPE_TYPE_BOX:
                        resolved.mutable_half_extents()->set_x(hx);
                        resolved.mutable_half_extents()->set_y(hy);
                        resolved.mutable_half_extents()->set_z(hz);
                        break;
                    case mechanism::COLLISION_SHAPE_TYPE_SPHERE:
                        resolved.set_radius(std::max({hx, hy, hz}));
                        break;
                    case mechanism::COLLISION_SHAPE_TYPE_CYLINDER:
                        resolved.set_radius(std::max(hx, hz));
                        resolved.set_height(hy * 2.0);
                        break;
                    default:
                        break;
                }

                // Center offset at bounding box center
                resolved.mutable_offset()->set_x(cx);
                resolved.mutable_offset()->set_y(cy);
                resolved.mutable_offset()->set_z(cz);
            }
        }

        auto geom_result = mechanism_state.update_geometry_collision_config(geom_id, resolved);
        if (!geom_result.entry.has_value()) {
            result->set_error_message(geom_result.error);
            send_event(ws, event);
            return;
        }

        auto* success = result->mutable_success();
        *success->mutable_geometry() = geom_result.entry.value();
        *success->mutable_resolved_config() = resolved;

        spdlog::info("Updated collision config for geometry '{}' (geom={}, shape={})",
                     existing->name(), geom_id, static_cast<int>(resolved.shape_type()));
        send_event(ws, event);
    }

    void handle_create_joint(ix::WebSocket& ws, uint64_t sequence_id,
                              const protocol::CreateJointCommand& cmd) {
        auto result = mechanism_state.create_joint(cmd.draft());

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* cr = event.mutable_create_joint_result();
        if (result.entry.has_value()) {
            populate_proto_joint(cr->mutable_joint(), result.entry.value());
            spdlog::debug("Created joint '{}' (id={})",
                          result.entry->name(), result.entry->id().id());
        } else {
            spdlog::warn("Failed to create joint: {}", result.error);
            cr->set_error_message(result.error);
        }
        send_event(ws, event);
    }

    void handle_update_joint(ix::WebSocket& ws, uint64_t sequence_id,
                              const protocol::UpdateJointCommand& cmd) {
        auto result = mechanism_state.update_joint(cmd.joint());

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* ur = event.mutable_update_joint_result();
        if (result.entry.has_value()) {
            populate_proto_joint(ur->mutable_joint(), result.entry.value());
        } else {
            ur->set_error_message(result.error);
        }
        send_event(ws, event);
    }

    void handle_delete_joint(ix::WebSocket& ws, uint64_t sequence_id,
                              const protocol::DeleteJointCommand& cmd) {
        std::string joint_id = cmd.has_joint_id() ? cmd.joint_id().id() : "";
        bool ok = mechanism_state.delete_joint(joint_id);

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* dr = event.mutable_delete_joint_result();
        if (ok) {
            dr->mutable_deleted_id()->set_id(joint_id);
        } else {
            dr->set_error_message("Joint not found: " + joint_id);
        }
        send_event(ws, event);
    }

    void handle_create_load(ix::WebSocket& ws, uint64_t sequence_id,
                             const protocol::CreateLoadCommand& cmd) {
        auto result = mechanism_state.create_load(cmd.draft());

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* cr = event.mutable_create_load_result();
        if (result.entry.has_value()) {
            populate_proto_load(cr->mutable_load(), result.entry.value());
        } else {
            cr->set_error_message(result.error);
        }
        send_event(ws, event);
    }

    void handle_update_load(ix::WebSocket& ws, uint64_t sequence_id,
                             const protocol::UpdateLoadCommand& cmd) {
        auto result = mechanism_state.update_load(cmd.load());

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* ur = event.mutable_update_load_result();
        if (result.entry.has_value()) {
            populate_proto_load(ur->mutable_load(), result.entry.value());
        } else {
            ur->set_error_message(result.error);
        }
        send_event(ws, event);
    }

    void handle_delete_load(ix::WebSocket& ws, uint64_t sequence_id,
                             const protocol::DeleteLoadCommand& cmd) {
        const std::string load_id = cmd.has_load_id() ? cmd.load_id().id() : "";
        bool ok = mechanism_state.delete_load(load_id);

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* dr = event.mutable_delete_load_result();
        if (ok) {
            dr->mutable_deleted_id()->set_id(load_id);
        } else {
            dr->set_error_message("Load not found: " + load_id);
        }
        send_event(ws, event);
    }

    void handle_create_actuator(ix::WebSocket& ws, uint64_t sequence_id,
                                 const protocol::CreateActuatorCommand& cmd) {
        auto result = mechanism_state.create_actuator(cmd.draft());

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* cr = event.mutable_create_actuator_result();
        if (result.entry.has_value()) {
            populate_proto_actuator(cr->mutable_actuator(), result.entry.value());
        } else {
            cr->set_error_message(result.error);
        }
        send_event(ws, event);
    }

    void handle_update_actuator(ix::WebSocket& ws, uint64_t sequence_id,
                                 const protocol::UpdateActuatorCommand& cmd) {
        auto result = mechanism_state.update_actuator(cmd.actuator());

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* ur = event.mutable_update_actuator_result();
        if (result.entry.has_value()) {
            populate_proto_actuator(ur->mutable_actuator(), result.entry.value());
        } else {
            ur->set_error_message(result.error);
        }
        send_event(ws, event);
    }

    void handle_delete_actuator(ix::WebSocket& ws, uint64_t sequence_id,
                                 const protocol::DeleteActuatorCommand& cmd) {
        const std::string actuator_id = cmd.has_actuator_id() ? cmd.actuator_id().id() : "";
        bool ok = mechanism_state.delete_actuator(actuator_id);

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* dr = event.mutable_delete_actuator_result();
        if (ok) {
            dr->mutable_deleted_id()->set_id(actuator_id);
        } else {
            dr->set_error_message("Actuator not found: " + actuator_id);
        }
        send_event(ws, event);
    }

    // ──────────────────────────────────────────────
    // Project persistence (Epic 6.4)
    // ──────────────────────────────────────────────

    void handle_save_project(ix::WebSocket& ws, uint64_t sequence_id,
                              const protocol::SaveProjectCommand& cmd) {
        import_project.handle_save_project(
            ws, sequence_id, cmd,
            [this](ix::WebSocket& target_ws, const protocol::Event& event) {
                send_event(target_ws, event);
            },
            [this]() { runtime_session.stop_thread(); });
    }

    void handle_load_project(ix::WebSocket& ws, uint64_t sequence_id,
                              const protocol::LoadProjectCommand& cmd) {
        import_project.handle_load_project(
            ws, sequence_id, cmd,
            [this](ix::WebSocket& target_ws, const protocol::Event& event) {
                send_event(target_ws, event);
            },
            [this]() { runtime_session.stop_thread(); });
    }

    void handle_relocate_asset(ix::WebSocket& ws, uint64_t sequence_id,
                                const protocol::RelocateAssetCommand& cmd) {
        import_project.handle_relocate_asset(
            ws, sequence_id, cmd,
            [this](ix::WebSocket& target_ws, const protocol::Event& event) {
                send_event(target_ws, event);
            });
    }

    void handle_place_asset_in_scene(ix::WebSocket& ws, uint64_t sequence_id,
                                      const protocol::PlaceAssetInSceneCommand& cmd) {
        import_project.handle_place_asset_in_scene(
            ws, sequence_id, cmd,
            [this](ix::WebSocket& target_ws, const protocol::Event& event) {
                send_event(target_ws, event);
            });
    }

    void handle_new_project(ix::WebSocket& ws, uint64_t sequence_id,
                             const protocol::NewProjectCommand& /*cmd*/) {
        runtime_session.stop_thread();
        mechanism_state.clear();
        shape_registry.clear();
        import_project.clear();

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* result = event.mutable_new_project_result();
        result->set_success(true);
        send_event(ws, event);
    }

    // ──────────────────────────────────────────────
    // Simulation lifecycle (Epic 7.2)
    // ──────────────────────────────────────────────

    void handle_compile_mechanism(ix::WebSocket& ws, uint64_t sequence_id,
                                    const protocol::CompileMechanismCommand& compile_cmd) {
        // Pre-compile: ensure aggregate masses are current for all non-override bodies
        mechanism_state.refresh_aggregate_masses();
        runtime_session.handle_compile_mechanism(
            ws, sequence_id, compile_cmd, mechanism_state.build_mechanism_proto());
    }

    void handle_scrub(ix::WebSocket& ws, uint64_t sequence_id,
                      const protocol::ScrubCommand& cmd) {
        static_cast<void>(ws);
        static_cast<void>(sequence_id);
        runtime_session.handle_scrub(cmd);
    }
};

TransportServer::TransportServer(std::string session_token)
    : impl_(std::make_unique<Impl>(std::move(session_token)))
{
    ix::initNetSystem();
}

TransportServer::~TransportServer() {
    stop();
    ix::uninitNetSystem();
}

void TransportServer::init(uint16_t port) {
    impl_->server = std::make_unique<ix::WebSocketServer>(
        port, "127.0.0.1");
    impl_->server->disablePerMessageDeflate();

    impl_->server->setOnClientMessageCallback(
        [this](std::shared_ptr<ix::ConnectionState> state,
               ix::WebSocket& ws,
               const ix::WebSocketMessagePtr& msg) {
            impl_->handle_message(state, ws, msg);
        });
}

void TransportServer::run() {
    auto res = impl_->server->listen();
    if (!res.first) {
        std::cerr << "[ENGINE] listen failed: " << res.second << std::endl;
        return;
    }
    impl_->running = true;
    impl_->server->start();

    log_status(EngineState::READY);

    // Block until stop() is called
    while (impl_->running) {
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
}

void TransportServer::stop() {
    impl_->stop_job_thread();
    impl_->runtime_session.stop();
    impl_->running = false;
    if (impl_->server) {
        impl_->server->stop();
    }
}

} // namespace motionlab
