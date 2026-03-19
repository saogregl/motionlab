#pragma once

#include <memory>
#include <string>
#include <vector>

// Forward declaration — Mechanism proto type. No Chrono headers here.
namespace motionlab::mechanism {
class Mechanism;
}

namespace motionlab::engine {

// ---------------------------------------------------------------------------
// Public types — mechanism IR, NOT Chrono types
// ---------------------------------------------------------------------------

enum class SimState { IDLE, COMPILING, RUNNING, PAUSED, ERROR };

struct BodyPose {
    std::string body_id;
    double position[3];
    double orientation[4]; // quaternion (w, x, y, z)
};

struct JointState {
    std::string joint_id;
    double position;          // generalized coordinate (rad or m)
    double velocity;          // generalized velocity (rad/s or m/s)
    double reaction_force[3];
    double reaction_torque[3];
};

struct ChannelDescriptor {
    std::string channel_id;
    std::string name;
    std::string unit;
    int data_type; // 1 = SCALAR, 2 = VEC3
};

struct CompilationResult {
    bool success = false;
    std::string error_message;
    std::vector<std::string> diagnostics;
};

// ---------------------------------------------------------------------------
// SimulationRuntime — Chrono integration behind pimpl
// ---------------------------------------------------------------------------

/**
 * Compiles a Mechanism proto into a Chrono dynamics system and steps it.
 *
 * - compile() walks the authored Mechanism (bodies, datums, joints) and
 *   creates the corresponding Chrono objects.
 * - step() advances the simulation by dt.
 * - getBodyPoses() / getJointStates() read back current state.
 * - reset() restores all bodies to their initial authored poses.
 *
 * Chrono headers are confined to simulation.cpp via the pimpl.
 */
class SimulationRuntime {
public:
    SimulationRuntime();
    ~SimulationRuntime();

    // Non-copyable, non-movable (owns Chrono system)
    SimulationRuntime(const SimulationRuntime&) = delete;
    SimulationRuntime& operator=(const SimulationRuntime&) = delete;

    CompilationResult compile(const motionlab::mechanism::Mechanism& mechanism);
    void step(double dt);
    void reset();

    SimState getState() const;
    std::vector<BodyPose> getBodyPoses() const;
    std::vector<JointState> getJointStates() const;
    std::vector<ChannelDescriptor> getChannelDescriptors() const;
    double getCurrentTime() const;
    uint64_t getStepCount() const;

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace motionlab::engine
