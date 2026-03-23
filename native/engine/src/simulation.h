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

struct ChannelValue {
    std::string channel_id;
    int data_type = 0;
    double scalar = 0.0;
    double vector[3] = {0.0, 0.0, 0.0};
};

enum class SolverType { PSOR, BARZILAI_BORWEIN, APGD, MINRES };
enum class IntegratorType { EULER_IMPLICIT_LINEARIZED, HHT, NEWMARK };

struct SolverConfig {
    SolverType type = SolverType::PSOR;
    int max_iterations = 100;
    double tolerance = 1e-8;
    IntegratorType integrator = IntegratorType::EULER_IMPLICIT_LINEARIZED;
};

struct ContactConfig {
    double friction = 0.3;
    double restitution = 0.0;
    double compliance = 0.0;
    double damping = 0.0;
    bool enable_contact = true;
};

struct SimulationConfig {
    double timestep = 0.001;
    double gravity[3] = {0, -9.81, 0};
    double duration = 10.0;
    SolverConfig solver;
    ContactConfig contact;
};

struct CompilationDiagnostic {
    int severity = 0; // 0=info, 1=warning, 2=error
    std::string message;
    std::vector<std::string> affected_entity_ids;
    std::string suggestion;
    std::string code;
};

struct CompilationResult {
    bool success = false;
    std::string error_message;
    std::vector<std::string> diagnostics; // keep for backward compat
    std::vector<CompilationDiagnostic> structured_diagnostics;
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

    CompilationResult compile(const motionlab::mechanism::Mechanism& mechanism,
                              const SimulationConfig& config = SimulationConfig{});
    void step(double dt);
    void pause();
    void reset();

    SimState getState() const;
    std::vector<BodyPose> getBodyPoses() const;
    std::vector<JointState> getJointStates() const;
    std::vector<ChannelDescriptor> getChannelDescriptors() const;
    std::vector<ChannelValue> getChannelValues() const;
    double getCurrentTime() const;
    uint64_t getStepCount() const;

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace motionlab::engine
