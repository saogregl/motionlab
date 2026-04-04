#pragma once

#include <cstdint>
#include <memory>
#include <optional>
#include <string>

#include <spdlog/spdlog.h>

namespace motionlab {

// Source of truth: schemas/protocol/transport.proto
constexpr const char* PROTOCOL_NAME = "motionlab";
constexpr uint32_t PROTOCOL_VERSION = 6;

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
    spdlog::level::level_enum log_level = spdlog::level::info;
    bool log_level_set = false;  // true when --log-level was passed on CLI
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
