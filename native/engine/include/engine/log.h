#pragma once

#include <spdlog/spdlog.h>
#include <spdlog/sinks/stdout_color_sinks.h>

#include <cstdlib>

namespace motionlab {

// Call once at startup. Logs to stderr so stdout remains free for
// the [ENGINE] status=<state> Electron supervision contract.
//
// Priority: explicit level arg > MOTIONLAB_LOG_LEVEL env var > info default.
inline void init_logging(spdlog::level::level_enum level = spdlog::level::info,
                         bool level_explicitly_set = false) {
    if (spdlog::get("engine")) return;  // already initialized

    // Check env var fallback when no explicit level was provided
    if (!level_explicitly_set) {
        const char* env = std::getenv("MOTIONLAB_LOG_LEVEL");
        if (env) {
            auto env_level = spdlog::level::from_str(env);
            // from_str returns off for unrecognized strings
            if (env_level != spdlog::level::off || std::string(env) == "off") {
                level = env_level;
            }
        }
    }

    auto logger = spdlog::stderr_color_mt("engine");
    logger->set_level(level);
    logger->set_pattern("[%Y-%m-%d %H:%M:%S.%e] [%n] [%^%l%$] %v");
    spdlog::set_default_logger(logger);
}

} // namespace motionlab
