#pragma once

#include <spdlog/spdlog.h>
#include <spdlog/sinks/stdout_color_sinks.h>

namespace motionlab {

// Call once at startup. Logs to stderr so stdout remains free for
// the [ENGINE] status=<state> Electron supervision contract.
inline void init_logging(spdlog::level::level_enum level = spdlog::level::info) {
    if (spdlog::get("engine")) return;  // already initialized
    auto logger = spdlog::stderr_color_mt("engine");
    logger->set_level(level);
    logger->set_pattern("[%Y-%m-%d %H:%M:%S.%e] [%n] [%^%l%$] %v");
    spdlog::set_default_logger(logger);
}

} // namespace motionlab
