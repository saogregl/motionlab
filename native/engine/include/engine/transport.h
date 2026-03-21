#pragma once

#include <cstdint>
#include <memory>
#include <optional>
#include <string>

namespace motionlab {

// Source of truth: schemas/protocol/transport.proto
constexpr const char* PROTOCOL_NAME = "motionlab";
constexpr uint32_t PROTOCOL_VERSION = 2;

enum class EngineState {
    INITIALIZING,
    READY,
    BUSY,
    ERRORED,
    SHUTTING_DOWN
};

const char* engine_state_string(EngineState state);

struct EngineConfig {
    uint16_t port;
    std::string session_token;
};

std::optional<EngineConfig> parse_args(int argc, char* argv[]);

void log_status(EngineState state, const std::string& message = "");

class TransportServer {
public:
    explicit TransportServer(std::string session_token);
    ~TransportServer();

    TransportServer(const TransportServer&) = delete;
    TransportServer& operator=(const TransportServer&) = delete;

    void init(uint16_t port);
    void run();
    void stop();

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace motionlab
