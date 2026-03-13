#include <iostream>
#include "engine/version.h"

/**
 * MotionLab Engine — entry point.
 *
 * This executable will:
 * - Parse CLI arguments (port, session token)
 * - Initialize subsystems (CAD, dynamics, transport)
 * - Listen on a loopback WebSocket endpoint
 * - Serve the frontend via the versioned protocol
 *
 * For now, it prints version info and exits.
 */
int main(int argc, char* argv[]) {
    std::cout << "MotionLab Engine v"
              << MOTIONLAB_ENGINE_VERSION_MAJOR << "."
              << MOTIONLAB_ENGINE_VERSION_MINOR << "."
              << MOTIONLAB_ENGINE_VERSION_PATCH
              << std::endl;

    std::cout << "Status: placeholder — no subsystems initialized" << std::endl;

    // Future: parse args, start transport, enter event loop
    return 0;
}
