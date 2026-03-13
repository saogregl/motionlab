#include <iostream>
#include <cassert>
#include "engine/version.h"

/**
 * Placeholder test runner for the native engine.
 * Will be replaced with a proper test framework (e.g., GoogleTest) later.
 */
int main() {
    // Verify version constants are defined
    assert(MOTIONLAB_ENGINE_VERSION_MAJOR == 0);
    assert(MOTIONLAB_ENGINE_VERSION_MINOR == 0);
    assert(MOTIONLAB_ENGINE_VERSION_PATCH == 1);

    std::cout << "All engine tests passed." << std::endl;
    return 0;
}
