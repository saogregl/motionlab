#include "engine/log.h"
#include "engine/transport.h"
#include "engine/version.h"

#include <ixwebsocket/IXWebSocketServer.h>
#include <ixwebsocket/IXNetSystem.h>
#include "protocol/transport.pb.h"
#include "mechanism/mechanism.pb.h"

#include "cad_import.h"
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
            spdlog::warn("Handshake rejected: token_match={} proto_match={}",
                         hs.session_token() == session_token,
                         hs.protocol().name() == PROTOCOL_NAME);
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
        datum->mutable_id()->set_id(entry.id);
        datum->set_name(entry.name);
        datum->mutable_parent_body_id()->set_id(entry.parent_body_id);
        auto* pose = datum->mutable_local_pose();
        auto* p = pose->mutable_position();
        p->set_x(entry.position[0]);
        p->set_y(entry.position[1]);
        p->set_z(entry.position[2]);
        auto* q = pose->mutable_orientation();
        q->set_w(entry.orientation[0]);
        q->set_x(entry.orientation[1]);
        q->set_y(entry.orientation[2]);
        q->set_z(entry.orientation[3]);
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
            spdlog::debug("Created datum '{}' (id={}) on body {}", cmd.name(), result->id, parent_id);
        } else {
            spdlog::warn("Failed to create datum '{}': parent body not found: {}", cmd.name(), parent_id);
            cr->set_error_message("Parent body not found: " + parent_id);
        }
        send_event(ws, event);
    }

    void handle_create_datum_from_face(ix::WebSocket& ws, uint64_t sequence_id,
                                       const protocol::CreateDatumFromFaceCommand& cmd) {
        const std::string body_id = cmd.has_parent_body_id() ? cmd.parent_body_id().id() : "";
        if (!import_project.ensure_body_shape_loaded(body_id)) {
            protocol::Event event;
            event.set_sequence_id(sequence_id);
            auto* result = event.mutable_create_datum_from_face_result();
            result->set_error_message("Face-aware datum creation unavailable for body: " + body_id);
            send_event(ws, event);
            return;
        }
        const TopoDS_Shape* shape = shape_registry.get(body_id);

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* result = event.mutable_create_datum_from_face_result();

        if (!mechanism_state.has_body(body_id)) {
            result->set_error_message("Parent body not found: " + body_id);
            send_event(ws, event);
            return;
        }

        if (!shape) {
            result->set_error_message("Face-aware datum creation unavailable for body: " + body_id);
            send_event(ws, event);
            return;
        }

        auto face_pose = engine::classify_face_for_datum(*shape, cmd.face_index());
        if (!face_pose.has_value()) {
            result->set_error_message("Face index out of range for body: " + body_id);
            send_event(ws, event);
            return;
        }

        const double length_scale = import_project.body_length_scale(body_id);
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
        proto_joint->mutable_id()->set_id(entry.id);
        proto_joint->set_name(entry.name);
        proto_joint->set_type(static_cast<mechanism::JointType>(entry.type));
        proto_joint->mutable_parent_datum_id()->set_id(entry.parent_datum_id);
        proto_joint->mutable_child_datum_id()->set_id(entry.child_datum_id);
        proto_joint->set_lower_limit(entry.lower_limit);
        proto_joint->set_upper_limit(entry.upper_limit);
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

        // Build response Body proto from mechanism_state
        auto body_proto = mechanism_state.build_body_proto(body_id);
        if (body_proto.has_value()) {
            *result->mutable_body() = std::move(body_proto.value());
        }

        send_event(ws, event);
    }

    void handle_create_joint(ix::WebSocket& ws, uint64_t sequence_id,
                              const protocol::CreateJointCommand& cmd) {
        std::string parent_datum_id = cmd.has_parent_datum_id() ? cmd.parent_datum_id().id() : "";
        std::string child_datum_id = cmd.has_child_datum_id() ? cmd.child_datum_id().id() : "";
        int type = static_cast<int>(cmd.type());

        auto result = mechanism_state.create_joint(
            parent_datum_id, child_datum_id, type,
            cmd.name(), cmd.lower_limit(), cmd.upper_limit());

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* cr = event.mutable_create_joint_result();
        if (result.entry.has_value()) {
            populate_proto_joint(cr->mutable_joint(), result.entry.value());
            spdlog::debug("Created joint '{}' (id={}) type={} datums={}->{}",
                          cmd.name(), result.entry->id, type, parent_datum_id, child_datum_id);
        } else {
            spdlog::warn("Failed to create joint '{}': {}", cmd.name(), result.error);
            cr->set_error_message(result.error);
        }
        send_event(ws, event);
    }

    void handle_update_joint(ix::WebSocket& ws, uint64_t sequence_id,
                              const protocol::UpdateJointCommand& cmd) {
        std::string joint_id = cmd.has_joint_id() ? cmd.joint_id().id() : "";

        std::optional<std::string> name;
        std::optional<int> type;
        std::optional<double> lower_limit;
        std::optional<double> upper_limit;

        if (cmd.has_name()) name = cmd.name();
        if (cmd.has_type()) type = static_cast<int>(cmd.type());
        if (cmd.has_lower_limit()) lower_limit = cmd.lower_limit();
        if (cmd.has_upper_limit()) upper_limit = cmd.upper_limit();

        auto result = mechanism_state.update_joint(joint_id, name, type, lower_limit, upper_limit);

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

    // ──────────────────────────────────────────────
    // Simulation lifecycle (Epic 7.2)
    // ──────────────────────────────────────────────

    void handle_compile_mechanism(ix::WebSocket& ws, uint64_t sequence_id,
                                    const protocol::CompileMechanismCommand& compile_cmd) {
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
