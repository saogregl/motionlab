#include "engine/transport.h"
#include "engine/version.h"

#include <ixwebsocket/IXWebSocketServer.h>
#include <ixwebsocket/IXNetSystem.h>
#include "protocol/transport.pb.h"
#include "mechanism/mechanism.pb.h"

#include "cad_import.h"
#include "asset_cache.h"
#include "mechanism_state.h"
#include "uuid.h"

#include <algorithm>
#include <atomic>
#include <filesystem>
#include <iostream>
#include <mutex>
#include <string>

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
            return;
        }

        if (msg->type == ix::WebSocketMessageType::Close) {
            std::lock_guard<std::mutex> lock(conn_mutex);
            has_connection = false;
            authenticated = false;
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

            protocol::Event status_event;
            auto* status = status_event.mutable_engine_status();
            status->set_state(protocol::EngineStatus::STATE_READY);
            send_event(ws, status_event);
        } else {
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
        std::string file_path = cmd.file_path();

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
                    // Register bodies in mechanism state from cache
                    for (const auto& body : result.bodies()) {
                        mechanism_state.add_body(body.body_id(), body.name());
                    }
                    protocol::Event event;
                    event.set_sequence_id(sequence_id);
                    *event.mutable_import_asset_result() = std::move(result);
                    send_event(ws, event);
                    return;
                }
                // Parse failed — treat as cache miss, fall through
            }
        }

        // Cache miss — run import
        engine::CadImporter importer;
        engine::ImportOptions import_opts{density, tess_quality};

        // Detect file format from extension
        std::string lower_path = file_path;
        std::transform(lower_path.begin(), lower_path.end(), lower_path.begin(),
                        [](unsigned char c) { return static_cast<char>(std::tolower(c)); });

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
            mechanism_state.add_body(pb->body_id(), pb->name());

            // DisplayMesh
            auto* mesh = pb->mutable_display_mesh();
            mesh->mutable_vertices()->Assign(body.mesh.vertices.begin(),
                                              body.mesh.vertices.end());
            mesh->mutable_indices()->Assign(body.mesh.indices.begin(),
                                             body.mesh.indices.end());
            mesh->mutable_normals()->Assign(body.mesh.normals.begin(),
                                             body.mesh.normals.end());

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
        }

        // Cache on success
        if (import_result.success && !cache_key.empty()) {
            std::string serialized;
            proto_result.SerializeToString(&serialized);
            asset_cache.store(cache_key, serialized);
        }

        // Send event
        protocol::Event event;
        event.set_sequence_id(sequence_id);
        *event.mutable_import_asset_result() = std::move(proto_result);
        send_event(ws, event);
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
            auto* datum = cr->mutable_datum();
            datum->mutable_id()->set_id(result->id);
            datum->set_name(result->name);
            datum->mutable_parent_body_id()->set_id(result->parent_body_id);
            auto* pose = datum->mutable_local_pose();
            auto* p = pose->mutable_position();
            p->set_x(result->position[0]);
            p->set_y(result->position[1]);
            p->set_z(result->position[2]);
            auto* q = pose->mutable_orientation();
            q->set_w(result->orientation[0]);
            q->set_x(result->orientation[1]);
            q->set_y(result->orientation[2]);
            q->set_z(result->orientation[3]);
        } else {
            cr->set_error_message("Parent body not found: " + parent_id);
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
            auto* datum = rr->mutable_datum();
            datum->mutable_id()->set_id(result->id);
            datum->set_name(result->name);
            datum->mutable_parent_body_id()->set_id(result->parent_body_id);
            auto* pose = datum->mutable_local_pose();
            auto* p = pose->mutable_position();
            p->set_x(result->position[0]);
            p->set_y(result->position[1]);
            p->set_z(result->position[2]);
            auto* q = pose->mutable_orientation();
            q->set_w(result->orientation[0]);
            q->set_x(result->orientation[1]);
            q->set_y(result->orientation[2]);
            q->set_z(result->orientation[3]);
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
        } else {
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
    impl_->running = false;
    if (impl_->server) {
        impl_->server->stop();
    }
}

} // namespace motionlab
