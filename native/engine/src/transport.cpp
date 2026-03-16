#include "engine/transport.h"
#include "engine/version.h"

#include <ixwebsocket/IXWebSocketServer.h>
#include <ixwebsocket/IXNetSystem.h>
#include "protocol/transport.pb.h"

#include <atomic>
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

    explicit Impl(std::string token) : session_token(std::move(token)) {}

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
