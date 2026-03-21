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
#include "ring_buffer.h"
#include "simulation.h"
#include "uuid.h"

#include <algorithm>
#include <atomic>
#include <cctype>
#include <chrono>
#include <condition_variable>
#include <filesystem>
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
    std::weak_ptr<ix::WebSocket> active_conn;
    bool has_connection = false;
    bool authenticated = false;
    std::atomic<bool> running{false};
    engine::AssetCache asset_cache;
    engine::MechanismState mechanism_state;
    engine::ShapeRegistry shape_registry;

    // Simulation (Epic 7.2)
    engine::SimulationRuntime simulation_runtime;
    enum class SimCommand { NONE, PLAY, PAUSE, STEP_ONCE, RESET, SHUTDOWN, SCRUB };
    std::thread sim_thread;
    std::mutex sim_mutex;
    std::condition_variable sim_cv;
    SimCommand sim_command{SimCommand::NONE};
    double scrub_target_time = 0.0;
    ix::WebSocket* active_ws = nullptr;
    std::atomic<engine::SimState> published_sim_state{engine::SimState::IDLE};

    // Project persistence (Epic 6.4) — cached import results for save/load
    std::unordered_map<std::string, protocol::BodyImportResult> body_import_results_;

    // Ring buffer + trace streaming (Epic 8.1)
    engine::SimulationRingBuffer ring_buffer;
    uint64_t trace_batch_step = 0;
    size_t trace_channel_index = 0;
    std::vector<engine::ChannelDescriptor> channel_descriptors;

    // Channel-to-joint lookup for trace extraction
    struct ChannelMapping {
        std::string joint_id;
        int measurement; // 0=position, 1=velocity, 2=reaction_force, 3=reaction_torque
    };
    std::vector<ChannelMapping> channel_mappings;

    double sim_dt = 0.001;  // updated from SimulationSettings at compile time
    static constexpr double FRAME_INTERVAL = 1.0 / 60.0;
    static constexpr int TRACE_BATCH_INTERVAL = 10;

    explicit Impl(std::string token)
        : session_token(std::move(token))
        , asset_cache(get_cache_directory()) {}

    void send_event(ix::WebSocket& ws, const protocol::Event& event) {
        std::string serialized;
        event.SerializeToString(&serialized);
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
            active_ws = &ws;
            return;
        }

        if (msg->type == ix::WebSocketMessageType::Close) {
            stop_sim_thread();
            std::lock_guard<std::mutex> lock(conn_mutex);
            has_connection = false;
            authenticated = false;
            active_ws = nullptr;
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
                handle_import_asset(ws, cmd.sequence_id(), cmd.import_asset());
                break;
            case protocol::Command::kCreateDatum:
                if (!authenticated) break;
                handle_create_datum(ws, cmd.sequence_id(), cmd.create_datum());
                break;
            case protocol::Command::kDeleteDatum:
                if (!authenticated) break;
                handle_delete_datum(ws, cmd.sequence_id(), cmd.delete_datum());
                break;
            case protocol::Command::kRenameDatum:
                if (!authenticated) break;
                handle_rename_datum(ws, cmd.sequence_id(), cmd.rename_datum());
                break;
            case protocol::Command::kCreateDatumFromFace:
                if (!authenticated) break;
                handle_create_datum_from_face(ws, cmd.sequence_id(), cmd.create_datum_from_face());
                break;
            case protocol::Command::kUpdateBody:
                if (!authenticated) break;
                handle_update_body(ws, cmd.sequence_id(), cmd.update_body());
                break;
            case protocol::Command::kUpdateDatumPose:
                if (!authenticated) break;
                handle_update_datum_pose(ws, cmd.sequence_id(), cmd.update_datum_pose());
                break;
            case protocol::Command::kCreateJoint:
                if (!authenticated) break;
                handle_create_joint(ws, cmd.sequence_id(), cmd.create_joint());
                break;
            case protocol::Command::kUpdateJoint:
                if (!authenticated) break;
                handle_update_joint(ws, cmd.sequence_id(), cmd.update_joint());
                break;
            case protocol::Command::kDeleteJoint:
                if (!authenticated) break;
                handle_delete_joint(ws, cmd.sequence_id(), cmd.delete_joint());
                break;
            case protocol::Command::kCompileMechanism:
                if (!authenticated) break;
                handle_compile_mechanism(ws, cmd.sequence_id(), cmd.compile_mechanism());
                break;
            case protocol::Command::kSimulationControl:
                if (!authenticated) break;
                handle_simulation_control(ws, cmd.sequence_id(), cmd.simulation_control());
                break;
            case protocol::Command::kScrub:
                if (!authenticated) break;
                handle_scrub(ws, cmd.sequence_id(), cmd.scrub());
                break;
            case protocol::Command::kSaveProject:
                if (!authenticated) break;
                handle_save_project(ws, cmd.sequence_id(), cmd.save_project());
                break;
            case protocol::Command::kLoadProject:
                if (!authenticated) break;
                handle_load_project(ws, cmd.sequence_id(), cmd.load_project());
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
        spdlog::info("Importing asset: {}", cmd.file_path());
        std::string file_path = cmd.file_path();
        std::string lower_path = file_path;
        std::transform(lower_path.begin(), lower_path.end(), lower_path.begin(),
                        [](unsigned char c) { return static_cast<char>(std::tolower(c)); });

        // Extract options with defaults
        double density = 1000.0;
        double tess_quality = 0.1;
        if (cmd.has_import_options()) {
            const auto& opts = cmd.import_options();
            if (opts.density_override() > 0.0) density = opts.density_override();
            if (opts.tessellation_quality() > 0.0) tess_quality = opts.tessellation_quality();
        }

        // Compute cache key and check cache
        std::string cache_key = asset_cache.compute_cache_key(file_path, density, tess_quality);
        if (!cache_key.empty()) {
            auto cached = asset_cache.lookup(cache_key);
            if (cached.has_value()) {
                protocol::ImportAssetResult result;
                if (result.ParseFromString(cached.value())) {
                    bool cache_has_topology = true;
                    for (const auto& body : result.bodies()) {
                        if (body.part_index_size() == 0) {
                            cache_has_topology = false;
                            break;
                        }
                    }

                    if (cache_has_topology) {
                        engine::CadImporter topology_importer;
                        engine::ImportOptions topology_opts{density, tess_quality};
                        engine::ImportResult topology_result;
                        if (lower_path.ends_with(".iges") || lower_path.ends_with(".igs")) {
                            topology_result = topology_importer.import_iges_topology(file_path, topology_opts);
                        } else {
                            topology_result = topology_importer.import_step_topology(file_path, topology_opts);
                        }

                        if (topology_result.success && topology_result.bodies.size() == static_cast<size_t>(result.bodies_size())) {
                            for (int i = 0; i < result.bodies_size(); ++i) {
                                const auto& cached_body = result.bodies(i);
                                const auto& topo_body = topology_result.bodies[static_cast<size_t>(i)];
                                // Store full body data for simulation compilation
                                double cb_pos[3] = {
                                    cached_body.pose().position().x(),
                                    cached_body.pose().position().y(),
                                    cached_body.pose().position().z()
                                };
                                double cb_orient[4] = {
                                    cached_body.pose().orientation().w(),
                                    cached_body.pose().orientation().x(),
                                    cached_body.pose().orientation().y(),
                                    cached_body.pose().orientation().z()
                                };
                                double cb_com[3] = {
                                    cached_body.mass_properties().center_of_mass().x(),
                                    cached_body.mass_properties().center_of_mass().y(),
                                    cached_body.mass_properties().center_of_mass().z()
                                };
                                double cb_inertia[6] = {
                                    cached_body.mass_properties().ixx(),
                                    cached_body.mass_properties().iyy(),
                                    cached_body.mass_properties().izz(),
                                    cached_body.mass_properties().ixy(),
                                    cached_body.mass_properties().ixz(),
                                    cached_body.mass_properties().iyz()
                                };
                                mechanism_state.add_body(cached_body.body_id(), cached_body.name(),
                                                         cb_pos, cb_orient,
                                                         cached_body.mass_properties().mass(),
                                                         cb_com, cb_inertia);
                                body_import_results_[cached_body.body_id()] = cached_body;  // store for save/load
                                if (topo_body.brep_shape) {
                                    shape_registry.store(cached_body.body_id(), *topo_body.brep_shape);
                                }
                            }

                            spdlog::info("Import cache hit: {} bodies from {}",
                                         result.bodies_size(), file_path);
                            protocol::Event event;
                            event.set_sequence_id(sequence_id);
                            *event.mutable_import_asset_result() = std::move(result);
                            send_event(ws, event);
                            return;
                        }
                    }
                }
                // Parse failed — treat as cache miss, fall through
            }
        }

        // Cache miss — run import
        engine::CadImporter importer;
        engine::ImportOptions import_opts{density, tess_quality};

        engine::ImportResult import_result;
        if (lower_path.ends_with(".iges") || lower_path.ends_with(".igs")) {
            import_result = importer.import_iges(file_path, import_opts);
        } else {
            import_result = importer.import_step(file_path, import_opts);
        }

        // Map to proto result
        protocol::ImportAssetResult proto_result;
        proto_result.set_success(import_result.success);
        proto_result.set_error_message(import_result.error_message);

        for (const auto& diag : import_result.diagnostics) {
            proto_result.add_diagnostics(diag);
        }

        // Extract original filename from path
        std::string original_filename;
        {
            auto pos = file_path.find_last_of("/\\");
            original_filename = (pos != std::string::npos)
                ? file_path.substr(pos + 1) : file_path;
        }

        for (const auto& body : import_result.bodies) {
            auto* pb = proto_result.add_bodies();
            pb->set_body_id(engine::generate_uuidv7());
            pb->set_name(body.name);

            // DisplayMesh
            auto* mesh = pb->mutable_display_mesh();
            mesh->mutable_vertices()->Assign(body.mesh.vertices.begin(),
                                              body.mesh.vertices.end());
            mesh->mutable_indices()->Assign(body.mesh.indices.begin(),
                                             body.mesh.indices.end());
            mesh->mutable_normals()->Assign(body.mesh.normals.begin(),
                                             body.mesh.normals.end());
            pb->mutable_part_index()->Assign(body.mesh.part_index.begin(),
                                              body.mesh.part_index.end());

            // MassProperties
            auto* mp = pb->mutable_mass_properties();
            mp->set_mass(body.mass_properties.mass);
            auto* com = mp->mutable_center_of_mass();
            com->set_x(body.mass_properties.center_of_mass[0]);
            com->set_y(body.mass_properties.center_of_mass[1]);
            com->set_z(body.mass_properties.center_of_mass[2]);
            mp->set_ixx(body.mass_properties.inertia[0]);
            mp->set_iyy(body.mass_properties.inertia[1]);
            mp->set_izz(body.mass_properties.inertia[2]);
            mp->set_ixy(body.mass_properties.inertia[3]);
            mp->set_ixz(body.mass_properties.inertia[4]);
            mp->set_iyz(body.mass_properties.inertia[5]);

            // Pose — quaternion swap: CadImporter [x,y,z,w] → proto Quat [w,x,y,z]
            auto* pose = pb->mutable_pose();
            auto* pos = pose->mutable_position();
            pos->set_x(body.translation[0]);
            pos->set_y(body.translation[1]);
            pos->set_z(body.translation[2]);
            auto* rot = pose->mutable_orientation();
            rot->set_w(body.rotation[3]);  // CadImporter w is at index 3
            rot->set_x(body.rotation[0]);  // CadImporter x is at index 0
            rot->set_y(body.rotation[1]);  // CadImporter y is at index 1
            rot->set_z(body.rotation[2]);  // CadImporter z is at index 2

            // AssetReference
            auto* asset_ref = pb->mutable_source_asset_ref();
            asset_ref->set_content_hash(import_result.content_hash);
            asset_ref->set_original_filename(original_filename);

            // Store full body data for simulation compilation
            // Note: orientation stored as [w,x,y,z] in MechanismState
            double body_orient[4] = {body.rotation[3], body.rotation[0],
                                      body.rotation[1], body.rotation[2]};
            mechanism_state.add_body(pb->body_id(), pb->name(),
                                     body.translation.data(), body_orient,
                                     body.mass_properties.mass,
                                     body.mass_properties.center_of_mass.data(),
                                     body.mass_properties.inertia.data());

            body_import_results_[pb->body_id()] = *pb;  // store for save/load

            if (body.brep_shape) {
                shape_registry.store(pb->body_id(), *body.brep_shape);
            }
        }

        // Cache on success
        if (import_result.success && !cache_key.empty()) {
            std::string serialized;
            proto_result.SerializeToString(&serialized);
            asset_cache.store(cache_key, serialized);
        }

        if (import_result.success) {
            spdlog::info("Imported {} bodies from {}", import_result.bodies.size(), file_path);
        } else {
            spdlog::error("Import failed: {}", file_path);
            for (const auto& d : import_result.diagnostics)
                spdlog::error("  {}", d);
        }

        // Send event
        protocol::Event event;
        event.set_sequence_id(sequence_id);
        *event.mutable_import_asset_result() = std::move(proto_result);
        send_event(ws, event);
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
        auto mech = mechanism_state.build_mechanism_proto();
        for (const auto& body : mech.bodies()) {
            if (body.id().id() == body_id) {
                *result->mutable_body() = body;
                break;
            }
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
        stop_sim_thread();

        mechanism::ProjectFile project_file;
        project_file.set_version(1);

        // Metadata
        auto* meta = project_file.mutable_metadata();
        meta->set_name(cmd.project_name());
        auto now = std::chrono::system_clock::now();
        auto time_t = std::chrono::system_clock::to_time_t(now);
        char buf[64];
        std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", std::gmtime(&time_t));
        meta->set_created_at(buf);
        meta->set_modified_at(buf);

        // Mechanism
        *project_file.mutable_mechanism() = mechanism_state.build_mechanism_proto();

        // Body display data
        for (const auto& body : project_file.mechanism().bodies()) {
            auto it = body_import_results_.find(body.id().id());
            if (it != body_import_results_.end()) {
                auto* bdd = project_file.add_body_display_data();
                bdd->set_body_id(body.id().id());
                *bdd->mutable_display_mesh() = it->second.display_mesh();
                bdd->mutable_part_index()->CopyFrom(it->second.part_index());
            }
        }

        // Serialize
        std::string serialized;
        project_file.SerializeToString(&serialized);

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* result = event.mutable_save_project_result();
        result->set_project_data(serialized);
        send_event(ws, event);
    }

    void handle_load_project(ix::WebSocket& ws, uint64_t sequence_id,
                              const protocol::LoadProjectCommand& cmd) {
        stop_sim_thread();

        mechanism::ProjectFile project_file;
        if (!project_file.ParseFromString(cmd.project_data())) {
            protocol::Event event;
            event.set_sequence_id(sequence_id);
            auto* result = event.mutable_load_project_result();
            result->set_error_message("Failed to parse project file");
            send_event(ws, event);
            return;
        }

        if (project_file.version() == 0 || project_file.version() > 1) {
            protocol::Event event;
            event.set_sequence_id(sequence_id);
            auto* result = event.mutable_load_project_result();
            result->set_error_message("Unsupported project file version: " +
                                       std::to_string(project_file.version()));
            send_event(ws, event);
            return;
        }

        // Rebuild mechanism state
        mechanism_state.clear();
        mechanism_state.load_from_proto(project_file.mechanism());

        // Build display data lookup
        std::unordered_map<std::string, const mechanism::BodyDisplayData*> display_lookup;
        for (const auto& bdd : project_file.body_display_data()) {
            display_lookup[bdd.body_id()] = &bdd;
        }

        // Rebuild body_import_results_ and build response bodies
        body_import_results_.clear();
        protocol::LoadProjectSuccess success;
        *success.mutable_mechanism() = project_file.mechanism();
        *success.mutable_metadata() = project_file.metadata();

        for (const auto& body : project_file.mechanism().bodies()) {
            auto* bir = success.add_bodies();
            bir->set_body_id(body.id().id());
            bir->set_name(body.name());
            *bir->mutable_mass_properties() = body.mass_properties();
            *bir->mutable_pose() = body.pose();

            // Source asset ref
            auto* ref = bir->mutable_source_asset_ref();
            ref->set_original_filename(body.name());

            auto disp_it = display_lookup.find(body.id().id());
            if (disp_it != display_lookup.end()) {
                *bir->mutable_display_mesh() = disp_it->second->display_mesh();
                bir->mutable_part_index()->CopyFrom(disp_it->second->part_index());
            }

            // Store for future saves
            body_import_results_[body.id().id()] = *bir;
        }

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* result = event.mutable_load_project_result();
        *result->mutable_success() = std::move(success);
        send_event(ws, event);
    }

    // ──────────────────────────────────────────────
    // Simulation lifecycle (Epic 7.2)
    // ──────────────────────────────────────────────

    void stop_sim_thread() {
        if (sim_thread.joinable()) {
            {
                std::lock_guard<std::mutex> lock(sim_mutex);
                sim_command = SimCommand::SHUTDOWN;
            }
            sim_cv.notify_one();
            sim_thread.join();
        }
        published_sim_state.store(engine::SimState::IDLE);
    }

    void handle_compile_mechanism(ix::WebSocket& ws, uint64_t sequence_id,
                                    const protocol::CompileMechanismCommand& compile_cmd) {
        // Stop any existing sim thread before recompiling
        stop_sim_thread();
        published_sim_state.store(engine::SimState::COMPILING);

        // Extract simulation settings (use defaults if not provided)
        engine::SimulationConfig config;
        if (compile_cmd.has_settings()) {
            const auto& settings = compile_cmd.settings();
            if (settings.timestep() > 0) {
                config.timestep = settings.timestep();
            }
            if (settings.has_gravity()) {
                config.gravity[0] = settings.gravity().x();
                config.gravity[1] = settings.gravity().y();
                config.gravity[2] = settings.gravity().z();
            }
        }

        spdlog::info("Compiling mechanism...");
        auto mech_proto = mechanism_state.build_mechanism_proto();
        auto result = simulation_runtime.compile(mech_proto, config);
        sim_dt = config.timestep;

        // Reset ring buffer and trace state
        ring_buffer.clear();
        trace_batch_step = 0;
        trace_channel_index = 0;
        channel_descriptors.clear();
        channel_mappings.clear();

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* cr = event.mutable_compilation_result();
        cr->set_success(result.success);
        cr->set_error_message(result.error_message);
        for (const auto& diag : result.diagnostics) {
            cr->add_diagnostics(diag);
        }

        if (result.success) {
            // Get channel descriptors and populate proto + lookup
            channel_descriptors = simulation_runtime.getChannelDescriptors();
            for (size_t i = 0; i < channel_descriptors.size(); ++i) {
                const auto& desc = channel_descriptors[i];
                auto* ch = cr->add_channels();
                ch->set_channel_id(desc.channel_id);
                ch->set_name(desc.name);
                ch->set_unit(desc.unit);
                ch->set_data_type(static_cast<protocol::ChannelDataType>(desc.data_type));

                // Build mapping: parse channel_id "joint/<id>/<measurement>"
                ChannelMapping mapping;
                // Extract joint_id: between first and last '/'
                auto first_slash = desc.channel_id.find('/');
                auto last_slash = desc.channel_id.rfind('/');
                if (first_slash != std::string::npos && last_slash != std::string::npos && first_slash != last_slash) {
                    mapping.joint_id = desc.channel_id.substr(first_slash + 1, last_slash - first_slash - 1);
                    std::string meas = desc.channel_id.substr(last_slash + 1);
                    if (meas == "position") mapping.measurement = 0;
                    else if (meas == "velocity") mapping.measurement = 1;
                    else if (meas == "reaction_force") mapping.measurement = 2;
                    else if (meas == "reaction_torque") mapping.measurement = 3;
                    else mapping.measurement = -1;
                }
                channel_mappings.push_back(mapping);
            }
        }

        send_event(ws, event);

        if (result.success) {
            spdlog::info("Compilation succeeded: {} channels", channel_descriptors.size());
            published_sim_state.store(engine::SimState::PAUSED);
            // Start simulation thread (idle, waiting for commands)
            sim_command = SimCommand::NONE;
            sim_thread = std::thread([this]() { simulation_loop(); });
            send_sim_state_event();
        } else {
            spdlog::error("Compilation failed: {}", result.error_message);
            published_sim_state.store(engine::SimState::ERROR);
        }
    }

    void handle_simulation_control(ix::WebSocket& ws, uint64_t sequence_id,
                                    const protocol::SimulationControlCommand& cmd) {
        static const char* action_names[] = {"UNSPECIFIED", "PLAY", "PAUSE", "STEP", "RESET"};
        int action_idx = static_cast<int>(cmd.action());
        spdlog::info("Simulation control: {}", (action_idx >= 0 && action_idx <= 4) ? action_names[action_idx] : "UNKNOWN");

        SimCommand sc = SimCommand::NONE;
        switch (cmd.action()) {
            case protocol::SIMULATION_ACTION_PLAY:  sc = SimCommand::PLAY; break;
            case protocol::SIMULATION_ACTION_PAUSE: sc = SimCommand::PAUSE; break;
            case protocol::SIMULATION_ACTION_STEP:  sc = SimCommand::STEP_ONCE; break;
            case protocol::SIMULATION_ACTION_RESET: sc = SimCommand::RESET; break;
            default: return;
        }
        {
            std::lock_guard<std::mutex> lock(sim_mutex);
            sim_command = sc;
        }
        sim_cv.notify_one();
    }

    void simulation_loop() {
        bool playing = false;

        while (true) {
            std::unique_lock<std::mutex> lock(sim_mutex);

            if (!playing) {
                sim_cv.wait(lock, [this]() {
                    return sim_command != SimCommand::NONE;
                });
            } else {
                // In play mode, check for new commands without blocking
                // (use zero-duration wait to drain the command)
                sim_cv.wait_for(lock, std::chrono::milliseconds(0));
            }

            SimCommand cmd = sim_command;
            sim_command = SimCommand::NONE;
            lock.unlock();

            switch (cmd) {
                case SimCommand::SHUTDOWN:
                    return;

                case SimCommand::PLAY:
                    playing = true;
                    published_sim_state.store(engine::SimState::RUNNING);
                    send_sim_state_event();
                    break;

                case SimCommand::PAUSE:
                    playing = false;
                    simulation_runtime.pause();
                    published_sim_state.store(engine::SimState::PAUSED);
                    send_sim_state_event();
                    break;

                case SimCommand::STEP_ONCE:
                    playing = false;
                    simulation_runtime.step(sim_dt);
                    simulation_runtime.pause();
                    published_sim_state.store(engine::SimState::PAUSED);
                    send_sim_frame();
                    send_sim_state_event();
                    break;

                case SimCommand::RESET:
                    playing = false;
                    simulation_runtime.reset();
                    published_sim_state.store(engine::SimState::IDLE);
                    send_sim_frame();
                    send_sim_state_event();
                    break;

                case SimCommand::SCRUB:
                    // Handled inline by handle_scrub(), not via sim loop
                    break;

                case SimCommand::NONE:
                    break;
            }

            if (playing) {
                // Continuous play: step physics and send frames at ~60fps
                auto frame_start = std::chrono::steady_clock::now();

                // Step physics for one frame interval worth of simulation time
                double accumulated = 0.0;
                while (accumulated < FRAME_INTERVAL) {
                    // Check for interrupting commands
                    {
                        std::lock_guard<std::mutex> lk(sim_mutex);
                        if (sim_command != SimCommand::NONE) break;
                    }
                    simulation_runtime.step(sim_dt);
                    accumulated += sim_dt;
                }

                // Read poses and joint states once
                auto poses = simulation_runtime.getBodyPoses();
                auto joint_states = simulation_runtime.getJointStates();

                // Push to ring buffer
                engine::BufferedFrame bf;
                bf.sim_time = simulation_runtime.getCurrentTime();
                bf.step_count = simulation_runtime.getStepCount();
                bf.body_poses = poses;
                bf.joint_states = joint_states;
                ring_buffer.push(bf);

                // Send frame using pre-read data
                send_sim_frame_data(poses, joint_states,
                                    simulation_runtime.getCurrentTime(),
                                    simulation_runtime.getStepCount());

                // Trace batching: send one channel's trace every N frames
                trace_batch_step++;
                if (!channel_descriptors.empty() &&
                    trace_batch_step >= static_cast<uint64_t>(TRACE_BATCH_INTERVAL)) {
                    trace_batch_step = 0;
                    send_trace_batch();
                }

                // Rate-limit to ~60fps wall time
                auto frame_end = std::chrono::steady_clock::now();
                auto elapsed = std::chrono::duration<double>(frame_end - frame_start).count();
                if (elapsed < FRAME_INTERVAL) {
                    std::this_thread::sleep_for(
                        std::chrono::duration<double>(FRAME_INTERVAL - elapsed));
                }
            }
        }
    }

    void send_sim_frame() {
        if (!active_ws) return;
        auto poses = simulation_runtime.getBodyPoses();
        auto joint_states = simulation_runtime.getJointStates();
        send_sim_frame_data(poses, joint_states,
                            simulation_runtime.getCurrentTime(),
                            simulation_runtime.getStepCount());
    }

    void send_sim_frame_data(const std::vector<engine::BodyPose>& poses,
                             const std::vector<engine::JointState>& joint_states,
                             double sim_time, uint64_t step_count) {
        if (!active_ws) return;

        protocol::SimulationFrame frame;
        frame.set_sim_time(sim_time);
        frame.set_step_count(step_count);

        for (const auto& bp : poses) {
            auto* pd = frame.add_body_poses();
            pd->set_body_id(bp.body_id);
            auto* pos = pd->mutable_position();
            pos->set_x(bp.position[0]);
            pos->set_y(bp.position[1]);
            pos->set_z(bp.position[2]);
            auto* rot = pd->mutable_orientation();
            rot->set_w(bp.orientation[0]);
            rot->set_x(bp.orientation[1]);
            rot->set_y(bp.orientation[2]);
            rot->set_z(bp.orientation[3]);
        }

        for (const auto& js : joint_states) {
            auto* pj = frame.add_joint_states();
            pj->set_joint_id(js.joint_id);
            pj->set_position(js.position);
            pj->set_velocity(js.velocity);
            auto* rf = pj->mutable_reaction_force();
            rf->set_x(js.reaction_force[0]);
            rf->set_y(js.reaction_force[1]);
            rf->set_z(js.reaction_force[2]);
            auto* rt = pj->mutable_reaction_torque();
            rt->set_x(js.reaction_torque[0]);
            rt->set_y(js.reaction_torque[1]);
            rt->set_z(js.reaction_torque[2]);
        }

        protocol::Event event;
        *event.mutable_simulation_frame() = std::move(frame);
        std::string serialized;
        event.SerializeToString(&serialized);
        active_ws->sendBinary(serialized);
    }

    void send_trace_batch() {
        if (!active_ws || channel_descriptors.empty()) return;

        size_t idx = trace_channel_index % channel_descriptors.size();
        trace_channel_index++;

        const auto& desc = channel_descriptors[idx];
        const auto& mapping = channel_mappings[idx];

        // Get recent frames from ring buffer (last ~0.5s worth)
        double newest = ring_buffer.newest_time();
        auto frames = ring_buffer.find_window(newest - 0.25, 0.25);
        if (frames.empty()) return;

        protocol::SimulationTrace trace;
        trace.set_channel_id(desc.channel_id);

        for (const auto* bf : frames) {
            // Find the joint state for this channel's joint
            const engine::JointState* js = nullptr;
            for (const auto& s : bf->joint_states) {
                if (s.joint_id == mapping.joint_id) {
                    js = &s;
                    break;
                }
            }
            if (!js) continue;

            auto* sample = trace.add_samples();
            sample->set_time(bf->sim_time);

            switch (mapping.measurement) {
                case 0: // position
                    sample->set_scalar(js->position);
                    break;
                case 1: // velocity
                    sample->set_scalar(js->velocity);
                    break;
                case 2: { // reaction_force
                    auto* v = sample->mutable_vector();
                    v->set_x(js->reaction_force[0]);
                    v->set_y(js->reaction_force[1]);
                    v->set_z(js->reaction_force[2]);
                    break;
                }
                case 3: { // reaction_torque
                    auto* v = sample->mutable_vector();
                    v->set_x(js->reaction_torque[0]);
                    v->set_y(js->reaction_torque[1]);
                    v->set_z(js->reaction_torque[2]);
                    break;
                }
                default:
                    break;
            }
        }

        protocol::Event event;
        *event.mutable_simulation_trace() = std::move(trace);
        std::string serialized;
        event.SerializeToString(&serialized);
        active_ws->sendBinary(serialized);
    }

    void handle_scrub(ix::WebSocket& ws, uint64_t sequence_id,
                      const protocol::ScrubCommand& cmd) {
        // Pause simulation if running
        {
            std::lock_guard<std::mutex> lock(sim_mutex);
            if (sim_command == SimCommand::PLAY ||
                published_sim_state.load() == engine::SimState::RUNNING) {
                sim_command = SimCommand::PAUSE;
            }
            sim_cv.notify_one();
        }

        auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(250);
        while (published_sim_state.load() == engine::SimState::RUNNING &&
               std::chrono::steady_clock::now() < deadline) {
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
        }

        double target = cmd.time();

        // Look up nearest buffered frame (takes read lock, doesn't block sim thread)
        const auto* frame = ring_buffer.find_nearest(target);
        if (frame) {
            send_sim_frame_data(frame->body_poses, frame->joint_states,
                                frame->sim_time, frame->step_count);

            // Send trace events for all channels in a ±1s window
            auto window_frames = ring_buffer.find_window(target, 1.0);
            if (!window_frames.empty()) {
                for (size_t i = 0; i < channel_descriptors.size(); ++i) {
                    const auto& desc = channel_descriptors[i];
                    const auto& mapping = channel_mappings[i];

                    protocol::SimulationTrace trace;
                    trace.set_channel_id(desc.channel_id);

                    for (const auto* wf : window_frames) {
                        const engine::JointState* js = nullptr;
                        for (const auto& s : wf->joint_states) {
                            if (s.joint_id == mapping.joint_id) {
                                js = &s;
                                break;
                            }
                        }
                        if (!js) continue;

                        auto* sample = trace.add_samples();
                        sample->set_time(wf->sim_time);

                        switch (mapping.measurement) {
                            case 0: sample->set_scalar(js->position); break;
                            case 1: sample->set_scalar(js->velocity); break;
                            case 2: {
                                auto* v = sample->mutable_vector();
                                v->set_x(js->reaction_force[0]);
                                v->set_y(js->reaction_force[1]);
                                v->set_z(js->reaction_force[2]);
                                break;
                            }
                            case 3: {
                                auto* v = sample->mutable_vector();
                                v->set_x(js->reaction_torque[0]);
                                v->set_y(js->reaction_torque[1]);
                                v->set_z(js->reaction_torque[2]);
                                break;
                            }
                            default: break;
                        }
                    }

                    protocol::Event trace_event;
                    *trace_event.mutable_simulation_trace() = std::move(trace);
                    std::string serialized;
                    trace_event.SerializeToString(&serialized);
                    active_ws->sendBinary(serialized);
                }
            }
        }

        published_sim_state.store(engine::SimState::PAUSED);
        send_sim_state_event();
    }

    void send_sim_state_event() {
        if (!active_ws) return;

        auto state = published_sim_state.load();
        protocol::SimStateEnum proto_state;
        switch (state) {
            case engine::SimState::IDLE:      proto_state = protocol::SIM_STATE_IDLE; break;
            case engine::SimState::COMPILING:  proto_state = protocol::SIM_STATE_COMPILING; break;
            case engine::SimState::RUNNING:    proto_state = protocol::SIM_STATE_RUNNING; break;
            case engine::SimState::PAUSED:     proto_state = protocol::SIM_STATE_PAUSED; break;
            case engine::SimState::ERROR:      proto_state = protocol::SIM_STATE_ERROR; break;
            default:                           proto_state = protocol::SIM_STATE_IDLE; break;
        }

        protocol::Event event;
        auto* se = event.mutable_simulation_state();
        se->set_state(proto_state);
        se->set_sim_time(simulation_runtime.getCurrentTime());
        se->set_step_count(simulation_runtime.getStepCount());

        std::string serialized;
        event.SerializeToString(&serialized);
        active_ws->sendBinary(serialized);
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
    impl_->stop_sim_thread();
    impl_->running = false;
    if (impl_->server) {
        impl_->server->stop();
    }
}

} // namespace motionlab
