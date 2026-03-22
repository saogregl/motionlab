#include "engine/log.h"
#include "engine/transport.h"
#include "engine/version.h"

#include <atomic>
#include <csignal>
#include <iostream>

#ifdef _WIN32
#include <windows.h>
#endif

static std::atomic<bool> g_shutdown_requested{false};
static motionlab::TransportServer* g_server = nullptr;

static void request_shutdown() {
    if (!g_shutdown_requested.exchange(true)) {
        if (g_server) {
            g_server->stop();
        }
    }
}

static void signal_handler(int /*sig*/) {
    request_shutdown();
}

#ifdef _WIN32
static BOOL WINAPI console_ctrl_handler(DWORD event) {
    if (event == CTRL_C_EVENT || event == CTRL_BREAK_EVENT || event == CTRL_CLOSE_EVENT) {
        request_shutdown();
        return TRUE;
    }
    return FALSE;
}
#endif

int main(int argc, char* argv[]) {
    motionlab::init_logging();

    auto config = motionlab::parse_args(argc, argv);
    if (!config) {
        std::cerr << "Usage: motionlab-engine --port <port> --session-token <token>"
                  << std::endl;
        return 1;
    }

    std::signal(SIGINT, signal_handler);
#ifdef _WIN32
    SetConsoleCtrlHandler(console_ctrl_handler, TRUE);
#else
    std::signal(SIGTERM, signal_handler);
#endif

    motionlab::log_status(motionlab::EngineState::INITIALIZING,
        "port=" + std::to_string(config->port));

    motionlab::TransportServer server(config->session_token);
    g_server = &server;

    server.init(config->port);
    server.run(); // Blocks until stop() is called

    g_server = nullptr;
    motionlab::log_status(motionlab::EngineState::SHUTTING_DOWN);

    return 0;
}
