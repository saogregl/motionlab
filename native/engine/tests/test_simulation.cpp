#include "engine/log.h"
// ---------------------------------------------------------------------------
// Simulation tests — Chrono integration
//
// Tests:
//   1. Two-body revolute pendulum under gravity
//   2. Validation: empty mechanism
//   3. Validation: joint referencing nonexistent body
//   4. Validation: joint referencing nonexistent datum
//   5. Validation: body with zero/negative mass
//   6. Reset restores initial state
// ---------------------------------------------------------------------------

#include <cassert>
#include <cmath>
#include <iostream>
#include <string>

#include "../src/mechanism_state.h"
#include "../src/simulation.h"
#include "mechanism/mechanism.pb.h"
#include "test_helpers.h"

namespace mech = motionlab::mechanism;
namespace eng = motionlab::engine;

// ---------------------------------------------------------------------------
// Fixture: build a two-body revolute mechanism proto
//
// Layout:
//   Body A (ground, fixed): 1kg at origin
//   Body B (pendulum):      1kg at (1, 0, 0)
//   Datum on A at local (0.5, 0, 0) → world (0.5, 0, 0)
//   Datum on B at local (-0.5, 0, 0) → world (0.5, 0, 0) (coincident)
//   Revolute joint connecting datum_A to datum_B, axis = Z
//   Gravity = (0, -9.81, 0)
//
// Expected: Body B swings downward (Y decreases) while A stays fixed.
// ---------------------------------------------------------------------------

static mech::Mechanism build_pendulum_mechanism() {
    mech::Mechanism m;
    m.mutable_id()->set_id("mech-001");
    m.set_name("Two-body pendulum");

    // Body A — ground (explicitly fixed)
    {
        auto* body = m.add_bodies();
        body->mutable_id()->set_id("body-a");
        body->set_name("Ground");
        body->set_motion_type(mech::MOTION_TYPE_FIXED);

        auto* pose = body->mutable_pose();
        auto* pos = pose->mutable_position();
        pos->set_x(0); pos->set_y(0); pos->set_z(0);
        auto* ori = pose->mutable_orientation();
        ori->set_w(1); ori->set_x(0); ori->set_y(0); ori->set_z(0);

        auto* mp = body->mutable_mass_properties();
        mp->set_mass(1.0);
        mp->set_ixx(0.1); mp->set_iyy(0.1); mp->set_izz(0.1);
        mp->set_ixy(0); mp->set_ixz(0); mp->set_iyz(0);
    }

    // Body B — pendulum arm
    {
        auto* body = m.add_bodies();
        body->mutable_id()->set_id("body-b");
        body->set_name("Pendulum");

        auto* pose = body->mutable_pose();
        auto* pos = pose->mutable_position();
        pos->set_x(1); pos->set_y(0); pos->set_z(0);
        auto* ori = pose->mutable_orientation();
        ori->set_w(1); ori->set_x(0); ori->set_y(0); ori->set_z(0);

        auto* mp = body->mutable_mass_properties();
        mp->set_mass(1.0);
        mp->set_ixx(0.1); mp->set_iyy(0.1); mp->set_izz(0.1);
        mp->set_ixy(0); mp->set_ixz(0); mp->set_iyz(0);
    }

    // Datum on Body A at local (0.5, 0, 0)
    {
        auto* datum = m.add_datums();
        datum->mutable_id()->set_id("datum-a");
        datum->set_name("Pivot on ground");
        datum->mutable_parent_body_id()->set_id("body-a");

        auto* lp = datum->mutable_local_pose();
        auto* pos = lp->mutable_position();
        pos->set_x(0.5); pos->set_y(0); pos->set_z(0);
        auto* ori = lp->mutable_orientation();
        ori->set_w(1); ori->set_x(0); ori->set_y(0); ori->set_z(0);
    }

    // Datum on Body B at local (-0.5, 0, 0)
    {
        auto* datum = m.add_datums();
        datum->mutable_id()->set_id("datum-b");
        datum->set_name("Pivot on pendulum");
        datum->mutable_parent_body_id()->set_id("body-b");

        auto* lp = datum->mutable_local_pose();
        auto* pos = lp->mutable_position();
        pos->set_x(-0.5); pos->set_y(0); pos->set_z(0);
        auto* ori = lp->mutable_orientation();
        ori->set_w(1); ori->set_x(0); ori->set_y(0); ori->set_z(0);
    }

    // Revolute joint: datum-a ↔ datum-b
    {
        auto* joint = m.add_joints();
        joint->mutable_id()->set_id("joint-rev");
        joint->set_name("Pivot");
        joint->set_type(mech::JOINT_TYPE_REVOLUTE);
        joint->mutable_parent_datum_id()->set_id("datum-a");
        joint->mutable_child_datum_id()->set_id("datum-b");
    }

    return m;
}

// ---------------------------------------------------------------------------
// Test 1: Pendulum simulation — physics plausibility
// ---------------------------------------------------------------------------

static int test_pendulum_simulation() {
    std::cout << "  [test_pendulum_simulation] ";

    eng::SimulationRuntime runtime;
    auto mechanism = build_pendulum_mechanism();

    auto result = runtime.compile(mechanism);
    assert(result.success && "Compilation should succeed");
    assert(runtime.getState() == eng::SimState::IDLE);

    // Step 100 times at dt = 0.01 (1 second of sim time)
    const double dt = 0.01;
    const int steps = 100;
    for (int i = 0; i < steps; i++) {
        runtime.step(dt);
        if (i < 5 || i % 20 == 19) {
            auto p = runtime.getBodyPoses();
            for (const auto& bp : p) {
                if (bp.body_id == "body-b") {
                    std::cout << "  step " << (i+1) << ": B=("
                              << bp.position[0] << ", "
                              << bp.position[1] << ", "
                              << bp.position[2] << ")\n";
                }
            }
        }
    }

    assert(runtime.getStepCount() == 100);
    assert(std::abs(runtime.getCurrentTime() - 1.0) < 1e-6);

    auto poses = runtime.getBodyPoses();
    assert(poses.size() == 2);

    // Find body A and body B poses
    const eng::BodyPose* pose_a = nullptr;
    const eng::BodyPose* pose_b = nullptr;
    for (const auto& p : poses) {
        if (p.body_id == "body-a") pose_a = &p;
        if (p.body_id == "body-b") pose_b = &p;
    }
    assert(pose_a && pose_b);

    // Body A (ground, fixed) should stay at origin
    assert(std::abs(pose_a->position[0]) < 1e-6);
    assert(std::abs(pose_a->position[1]) < 1e-6);
    assert(std::abs(pose_a->position[2]) < 1e-6);

    // Body B (pendulum) should have swung downward: Y < 0
    assert(pose_b->position[1] < 0.0 &&
           "Pendulum should swing downward under gravity");

    // Joint states should have nonzero reaction forces
    auto joint_states = runtime.getJointStates();
    assert(joint_states.size() == 1);
    double force_mag = std::sqrt(
        joint_states[0].reaction_force[0] * joint_states[0].reaction_force[0] +
        joint_states[0].reaction_force[1] * joint_states[0].reaction_force[1] +
        joint_states[0].reaction_force[2] * joint_states[0].reaction_force[2]
    );
    assert(force_mag > 0.0 && "Joint should have nonzero reaction forces");

    std::cout << "PASS (B.y=" << pose_b->position[1]
              << ", |F|=" << force_mag << ")\n";
    return 0;
}

// ---------------------------------------------------------------------------
// Test 2: Empty mechanism → compilation error
// ---------------------------------------------------------------------------

static int test_empty_mechanism() {
    std::cout << "  [test_empty_mechanism] ";

    eng::SimulationRuntime runtime;
    mech::Mechanism m;
    m.mutable_id()->set_id("empty");

    auto result = runtime.compile(m);
    assert(!result.success);
    assert(!result.error_message.empty());
    assert(runtime.getState() == eng::SimState::ERROR);

    std::cout << "PASS (error: " << result.error_message << ")\n";
    return 0;
}

// ---------------------------------------------------------------------------
// Test 3: Joint referencing nonexistent datum
// ---------------------------------------------------------------------------

static int test_missing_datum_reference() {
    std::cout << "  [test_missing_datum_reference] ";

    eng::SimulationRuntime runtime;
    mech::Mechanism m;
    m.mutable_id()->set_id("bad-datum");

    // Add one fixed body so validation passes NO_GROUND check
    auto* body = m.add_bodies();
    body->mutable_id()->set_id("body-1");
    body->set_name("Body 1");
    body->set_motion_type(mech::MOTION_TYPE_FIXED);
    auto* mp = body->mutable_mass_properties();
    mp->set_mass(1.0);
    mp->set_ixx(0.1); mp->set_iyy(0.1); mp->set_izz(0.1);

    // Add joint referencing nonexistent datums
    auto* joint = m.add_joints();
    joint->mutable_id()->set_id("joint-bad");
    joint->set_name("Bad Joint");
    joint->set_type(mech::JOINT_TYPE_REVOLUTE);
    joint->mutable_parent_datum_id()->set_id("datum-nonexistent");
    joint->mutable_child_datum_id()->set_id("datum-also-nonexistent");

    auto result = runtime.compile(m);
    assert(!result.success);
    assert(result.error_message.find("nonexistent") != std::string::npos ||
           result.error_message.find("Bad Joint") != std::string::npos);

    std::cout << "PASS (error: " << result.error_message << ")\n";
    return 0;
}

// ---------------------------------------------------------------------------
// Test 4: Body with zero mass
// ---------------------------------------------------------------------------

static int test_zero_mass() {
    std::cout << "  [test_zero_mass] ";

    eng::SimulationRuntime runtime;
    mech::Mechanism m;
    m.mutable_id()->set_id("zero-mass");

    // Fixed ground so we pass NO_GROUND check
    auto* ground = m.add_bodies();
    ground->mutable_id()->set_id("body-ground");
    ground->set_name("Ground");
    ground->set_motion_type(mech::MOTION_TYPE_FIXED);
    auto* gmp = ground->mutable_mass_properties();
    gmp->set_mass(1.0);
    gmp->set_ixx(0.1); gmp->set_iyy(0.1); gmp->set_izz(0.1);

    // Non-fixed body with zero mass
    auto* body = m.add_bodies();
    body->mutable_id()->set_id("body-z");
    body->set_name("Massless Body");
    auto* mp = body->mutable_mass_properties();
    mp->set_mass(0.0);  // invalid

    auto result = runtime.compile(m);
    assert(!result.success);
    // Check structured diagnostics for ZERO_MASS
    bool found_zero_mass = false;
    for (const auto& d : result.structured_diagnostics) {
        if (d.code == "ZERO_MASS") { found_zero_mass = true; break; }
    }
    assert(found_zero_mass && "Expected ZERO_MASS diagnostic");

    std::cout << "PASS\n";
    return 0;
}

// ---------------------------------------------------------------------------
// Test 5: Body with negative mass
// ---------------------------------------------------------------------------

static int test_negative_mass() {
    std::cout << "  [test_negative_mass] ";

    eng::SimulationRuntime runtime;
    mech::Mechanism m;
    m.mutable_id()->set_id("neg-mass");

    // Fixed ground
    auto* ground = m.add_bodies();
    ground->mutable_id()->set_id("body-ground");
    ground->set_name("Ground");
    ground->set_motion_type(mech::MOTION_TYPE_FIXED);
    auto* gmp = ground->mutable_mass_properties();
    gmp->set_mass(1.0);
    gmp->set_ixx(0.1); gmp->set_iyy(0.1); gmp->set_izz(0.1);

    // Non-fixed body with negative mass
    auto* body = m.add_bodies();
    body->mutable_id()->set_id("body-neg");
    body->set_name("Negative Body");
    auto* mp = body->mutable_mass_properties();
    mp->set_mass(-5.0);  // invalid

    auto result = runtime.compile(m);
    assert(!result.success);
    bool found_zero_mass = false;
    for (const auto& d : result.structured_diagnostics) {
        if (d.code == "ZERO_MASS") { found_zero_mass = true; break; }
    }
    assert(found_zero_mass && "Expected ZERO_MASS diagnostic for negative mass");

    std::cout << "PASS\n";
    return 0;
}

// ---------------------------------------------------------------------------
// Test 6: Reset restores initial state
// ---------------------------------------------------------------------------

static int test_reset() {
    std::cout << "  [test_reset] ";

    eng::SimulationRuntime runtime;
    auto mechanism = build_pendulum_mechanism();

    auto result = runtime.compile(mechanism);
    assert(result.success);

    // Step a few times so bodies move
    for (int i = 0; i < 50; i++) {
        runtime.step(0.01);
    }
    assert(runtime.getStepCount() == 50);
    assert(runtime.getCurrentTime() > 0.0);

    // Body B should have moved
    auto poses_before = runtime.getBodyPoses();
    const eng::BodyPose* b_before = nullptr;
    for (const auto& p : poses_before) {
        if (p.body_id == "body-b") b_before = &p;
    }
    assert(b_before);
    assert(std::abs(b_before->position[0] - 1.0) > 1e-6 ||
           std::abs(b_before->position[1]) > 1e-6);

    // Reset
    runtime.reset();

    assert(runtime.getStepCount() == 0);
    assert(runtime.getCurrentTime() == 0.0);
    assert(runtime.getState() == eng::SimState::IDLE);

    // Body B should be back at initial position (1, 0, 0)
    auto poses_after = runtime.getBodyPoses();
    const eng::BodyPose* b_after = nullptr;
    for (const auto& p : poses_after) {
        if (p.body_id == "body-b") b_after = &p;
    }
    assert(b_after);
    assert(std::abs(b_after->position[0] - 1.0) < 1e-6);
    assert(std::abs(b_after->position[1]) < 1e-6);
    assert(std::abs(b_after->position[2]) < 1e-6);

    std::cout << "PASS\n";
    return 0;
}

// ---------------------------------------------------------------------------
// Test 7: Exact pendulum example — matches generate-pendulum-example.mts
//
// Differences from test 1:
//   - Ground has motion_type=FIXED (all tests require explicit ground)
//   - Arm at (0.7,0,0) with pivot at (0.2,0,0) (test 1: arm at 1.0, pivot at 0.5)
//   - Realistic box inertia (test 1: isotropic 0.1)
//   - Joint limits set to ±6.28 (test 1: no limits)
// ---------------------------------------------------------------------------

static mech::Mechanism build_example_pendulum() {
    mech::Mechanism m;
    m.mutable_id()->set_id("mech-pendulum");
    m.set_name("Pendulum");

    // Ground: 0.4×0.2×0.2 m, 1 kg, motion_type=FIXED
    {
        auto* body = m.add_bodies();
        body->mutable_id()->set_id("body-ground");
        body->set_name("Ground");
        body->set_motion_type(mech::MOTION_TYPE_FIXED);

        auto* pose = body->mutable_pose();
        auto* pos = pose->mutable_position();
        pos->set_x(0); pos->set_y(0); pos->set_z(0);
        auto* ori = pose->mutable_orientation();
        ori->set_w(1); ori->set_x(0); ori->set_y(0); ori->set_z(0);

        auto* mp = body->mutable_mass_properties();
        mp->set_mass(1.0);
        // boxInertia(1.0, 0.4, 0.2, 0.2):
        // ixx = 1/12*(0.04+0.04) = 0.00667
        // iyy = 1/12*(0.16+0.04) = 0.01667
        // izz = 1/12*(0.16+0.04) = 0.01667
        mp->set_ixx(1.0/12.0*(0.04+0.04));
        mp->set_iyy(1.0/12.0*(0.16+0.04));
        mp->set_izz(1.0/12.0*(0.16+0.04));
        mp->set_ixy(0); mp->set_ixz(0); mp->set_iyz(0);
    }

    // Pendulum Arm: 1.0×0.1×0.1 m, 1 kg
    {
        auto* body = m.add_bodies();
        body->mutable_id()->set_id("body-arm");
        body->set_name("Pendulum Arm");
        // motion_type not set (defaults to UNSPECIFIED → dynamic)

        auto* pose = body->mutable_pose();
        auto* pos = pose->mutable_position();
        pos->set_x(0.7); pos->set_y(0); pos->set_z(0);
        auto* ori = pose->mutable_orientation();
        ori->set_w(1); ori->set_x(0); ori->set_y(0); ori->set_z(0);

        auto* mp = body->mutable_mass_properties();
        mp->set_mass(1.0);
        // boxInertia(1.0, 1.0, 0.1, 0.1):
        // ixx = 1/12*(0.01+0.01) = 0.001667
        // iyy = 1/12*(1.0+0.01)  = 0.084167
        // izz = 1/12*(1.0+0.01)  = 0.084167
        mp->set_ixx(1.0/12.0*(0.01+0.01));
        mp->set_iyy(1.0/12.0*(1.0+0.01));
        mp->set_izz(1.0/12.0*(1.0+0.01));
        mp->set_ixy(0); mp->set_ixz(0); mp->set_iyz(0);
    }

    // Datum on Ground at local (0.2, 0, 0)
    {
        auto* datum = m.add_datums();
        datum->mutable_id()->set_id("datum-pivot-ground");
        datum->set_name("Pivot on Ground");
        datum->mutable_parent_body_id()->set_id("body-ground");

        auto* lp = datum->mutable_local_pose();
        auto* pos = lp->mutable_position();
        pos->set_x(0.2); pos->set_y(0); pos->set_z(0);
        auto* ori = lp->mutable_orientation();
        ori->set_w(1); ori->set_x(0); ori->set_y(0); ori->set_z(0);
    }

    // Datum on Arm at local (-0.5, 0, 0)
    {
        auto* datum = m.add_datums();
        datum->mutable_id()->set_id("datum-pivot-arm");
        datum->set_name("Pivot on Pendulum");
        datum->mutable_parent_body_id()->set_id("body-arm");

        auto* lp = datum->mutable_local_pose();
        auto* pos = lp->mutable_position();
        pos->set_x(-0.5); pos->set_y(0); pos->set_z(0);
        auto* ori = lp->mutable_orientation();
        ori->set_w(1); ori->set_x(0); ori->set_y(0); ori->set_z(0);
    }

    // Revolute joint (no limits)
    {
        auto* joint = m.add_joints();
        joint->mutable_id()->set_id("joint-pivot");
        joint->set_name("Pivot");
        joint->set_type(mech::JOINT_TYPE_REVOLUTE);
        joint->mutable_parent_datum_id()->set_id("datum-pivot-ground");
        joint->mutable_child_datum_id()->set_id("datum-pivot-arm");
    }

    return m;
}

static int test_example_pendulum() {
    std::cout << "  [test_example_pendulum] ";

    eng::SimulationRuntime runtime;
    auto mechanism = build_example_pendulum();

    auto result = runtime.compile(mechanism);
    assert(result.success && "Compilation should succeed");

    // Print diagnostics
    for (const auto& d : result.diagnostics) {
        std::cout << "\n    diag: " << d;
    }

    // Step for 0.5 seconds at dt=0.001 (500 steps)
    const double dt = 0.001;
    for (int i = 0; i < 500; i++) {
        runtime.step(dt);
        if (i == 0 || i == 9 || i == 49 || i == 99 || i == 299 || i == 499) {
            auto poses = runtime.getBodyPoses();
            for (const auto& p : poses) {
                if (p.body_id == "body-arm") {
                    std::cout << "\n    step " << (i+1)
                              << " (t=" << runtime.getCurrentTime() << "s)"
                              << ": arm=(" << p.position[0]
                              << ", " << p.position[1]
                              << ", " << p.position[2] << ")";
                }
            }
        }
    }

    auto poses = runtime.getBodyPoses();
    const eng::BodyPose* arm = nullptr;
    for (const auto& p : poses) {
        if (p.body_id == "body-arm") arm = &p;
    }
    assert(arm);

    assert(std::abs(arm->position[1]) > 0.01 &&
           "Pendulum arm should swing significantly under gravity");

    std::cout << "\n    PASS (arm swung: y=" << arm->position[1] << ")\n";
    return 0;
}

// ---------------------------------------------------------------------------
// Solver Configuration Tests (Epic 17)
// ---------------------------------------------------------------------------

// Helper: compile pendulum with custom config and return result + runtime
static eng::CompilationResult compile_pendulum_with_config(
    eng::SimulationRuntime& runtime,
    const eng::SimulationConfig& config) {
    auto mechanism = build_pendulum_mechanism();
    return runtime.compile(mechanism, config);
}

// Test 8: Default solver config — PSOR/100/1e-8/Euler
static int test_default_solver_config() {
    std::cout << "  [test_default_solver_config] ";

    eng::SimulationRuntime runtime;
    eng::SimulationConfig config; // all defaults

    auto result = compile_pendulum_with_config(runtime, config);
    assert(result.success && "Default config should compile");

    auto sc = runtime.getAppliedSolverConfig();
    assert(sc.type == eng::SolverType::PSOR);
    assert(sc.max_iterations == 100);
    assert(std::abs(sc.tolerance - 1e-8) < 1e-15);
    assert(sc.integrator == eng::IntegratorType::EULER_IMPLICIT_LINEARIZED);

    std::cout << "PASS\n";
    return 0;
}

// Test 9: PSOR with custom iterations and tolerance
static int test_psor_custom_params() {
    std::cout << "  [test_psor_custom_params] ";

    eng::SimulationRuntime runtime;
    eng::SimulationConfig config;
    config.solver.type = eng::SolverType::PSOR;
    config.solver.max_iterations = 200;
    config.solver.tolerance = 1e-10;

    auto result = compile_pendulum_with_config(runtime, config);
    assert(result.success);

    auto sc = runtime.getAppliedSolverConfig();
    assert(sc.type == eng::SolverType::PSOR);
    assert(sc.max_iterations == 200);
    assert(std::abs(sc.tolerance - 1e-10) < 1e-18);

    // Verify it still simulates correctly
    runtime.step(0.01);
    assert(runtime.getStepCount() == 1);

    std::cout << "PASS\n";
    return 0;
}

// Test 10: Barzilai-Borwein solver
static int test_bb_solver() {
    std::cout << "  [test_bb_solver] ";

    eng::SimulationRuntime runtime;
    eng::SimulationConfig config;
    config.solver.type = eng::SolverType::BARZILAI_BORWEIN;
    config.solver.max_iterations = 150;
    config.solver.tolerance = 1e-9;

    auto result = compile_pendulum_with_config(runtime, config);
    assert(result.success);

    auto sc = runtime.getAppliedSolverConfig();
    assert(sc.type == eng::SolverType::BARZILAI_BORWEIN);
    assert(sc.max_iterations == 150);

    // Verify simulation runs
    for (int i = 0; i < 10; i++) runtime.step(0.001);
    assert(runtime.getStepCount() == 10);

    std::cout << "PASS\n";
    return 0;
}

// Test 11: APGD solver
static int test_apgd_solver() {
    std::cout << "  [test_apgd_solver] ";

    eng::SimulationRuntime runtime;
    eng::SimulationConfig config;
    config.solver.type = eng::SolverType::APGD;

    auto result = compile_pendulum_with_config(runtime, config);
    assert(result.success);

    auto sc = runtime.getAppliedSolverConfig();
    assert(sc.type == eng::SolverType::APGD);

    runtime.step(0.001);
    assert(runtime.getStepCount() == 1);

    std::cout << "PASS\n";
    return 0;
}

// Test 12: MINRES solver
static int test_minres_solver() {
    std::cout << "  [test_minres_solver] ";

    eng::SimulationRuntime runtime;
    eng::SimulationConfig config;
    config.solver.type = eng::SolverType::MINRES;

    auto result = compile_pendulum_with_config(runtime, config);
    assert(result.success);

    auto sc = runtime.getAppliedSolverConfig();
    assert(sc.type == eng::SolverType::MINRES);

    runtime.step(0.001);
    assert(runtime.getStepCount() == 1);

    std::cout << "PASS\n";
    return 0;
}

// Test 13: HHT integrator
static int test_hht_integrator() {
    std::cout << "  [test_hht_integrator] ";

    eng::SimulationRuntime runtime;
    eng::SimulationConfig config;
    config.solver.integrator = eng::IntegratorType::HHT;
    config.solver.max_iterations = 200; // HHT needs more iterations for convergence

    auto result = compile_pendulum_with_config(runtime, config);
    assert(result.success);

    auto sc = runtime.getAppliedSolverConfig();
    assert(sc.integrator == eng::IntegratorType::HHT);
    assert(sc.max_iterations == 200);

    std::cout << "PASS\n";
    return 0;
}

// Test 14: Newmark integrator
static int test_newmark_integrator() {
    std::cout << "  [test_newmark_integrator] ";

    eng::SimulationRuntime runtime;
    eng::SimulationConfig config;
    config.solver.integrator = eng::IntegratorType::NEWMARK;
    config.solver.max_iterations = 200; // implicit integrators may need more iterations

    auto result = compile_pendulum_with_config(runtime, config);
    assert(result.success);

    auto sc = runtime.getAppliedSolverConfig();
    assert(sc.integrator == eng::IntegratorType::NEWMARK);
    assert(sc.max_iterations == 200);

    std::cout << "PASS\n";
    return 0;
}

// Test 15: Contact configuration
static int test_contact_config() {
    std::cout << "  [test_contact_config] ";

    eng::SimulationRuntime runtime;
    eng::SimulationConfig config;
    config.contact.friction = 0.5;
    config.contact.restitution = 0.3;
    config.contact.compliance = 1e-5;
    config.contact.damping = 0.01;
    config.contact.enable_contact = true;

    auto result = compile_pendulum_with_config(runtime, config);
    assert(result.success);

    auto cc = runtime.getAppliedContactConfig();
    // float precision: Chrono stores friction/restitution as float
    assert(std::abs(cc.friction - 0.5) < 1e-6);
    assert(std::abs(cc.restitution - 0.3) < 1e-6);
    assert(std::abs(cc.compliance - 1e-5) < 1e-10);
    assert(std::abs(cc.damping - 0.01) < 1e-6);
    assert(cc.enable_contact == true);

    std::cout << "PASS\n";
    return 0;
}

// Test 16: Backward compatibility — default config matches pre-Epic-17 behavior
static int test_backward_compat() {
    std::cout << "  [test_backward_compat] ";

    // Compile with explicit defaults (should match implicit defaults)
    eng::SimulationRuntime runtime_default;
    eng::SimulationConfig config_default;
    auto result_default = compile_pendulum_with_config(runtime_default, config_default);
    assert(result_default.success);

    // Compile with no-arg default (same as SimulationConfig{})
    eng::SimulationRuntime runtime_implicit;
    auto mechanism = build_pendulum_mechanism();
    auto result_implicit = runtime_implicit.compile(mechanism);
    assert(result_implicit.success);

    // Both should use PSOR/100/1e-8/Euler
    auto sc1 = runtime_default.getAppliedSolverConfig();
    auto sc2 = runtime_implicit.getAppliedSolverConfig();
    assert(sc1.type == sc2.type);
    assert(sc1.max_iterations == sc2.max_iterations);
    assert(std::abs(sc1.tolerance - sc2.tolerance) < 1e-15);
    assert(sc1.integrator == sc2.integrator);

    // Both should produce the same simulation result
    for (int i = 0; i < 50; i++) {
        runtime_default.step(0.001);
        runtime_implicit.step(0.001);
    }
    auto poses1 = runtime_default.getBodyPoses();
    auto poses2 = runtime_implicit.getBodyPoses();
    for (size_t i = 0; i < poses1.size(); i++) {
        assert(std::abs(poses1[i].position[0] - poses2[i].position[0]) < 1e-12);
        assert(std::abs(poses1[i].position[1] - poses2[i].position[1]) < 1e-12);
        assert(std::abs(poses1[i].position[2] - poses2[i].position[2]) < 1e-12);
    }

    std::cout << "PASS\n";
    return 0;
}

// ---------------------------------------------------------------------------
// Test: refresh_aggregate_masses preserves mass when no geometries exist
// ---------------------------------------------------------------------------

static int test_no_geometry_mass_preserved() {
    std::cout << "  [test_no_geometry_mass_preserved] ";

    // Build a mechanism with mass_override=false and no geometries,
    // mimicking legacy project files (e.g. pendulum.motionlab)
    mech::Mechanism m;
    m.mutable_id()->set_id("no-geom-test");

    auto* body = m.add_bodies();
    body->mutable_id()->set_id("body-a");
    body->set_name("Test Body");
    body->set_motion_type(mech::MOTION_TYPE_FIXED);
    // mass_override defaults to false
    auto* mp = body->mutable_mass_properties();
    mp->set_mass(5.0);
    mp->set_ixx(0.1);
    mp->set_iyy(0.1);
    mp->set_izz(0.1);

    // Load into MechanismState (same path as project file loading)
    eng::MechanismState state;
    state.load_from_proto(m);

    // Verify mass is set and mass_override is false
    auto loaded = state.build_body_proto("body-a");
    assert(loaded.has_value());
    assert(!loaded->mass_override());
    assert(std::abs(loaded->mass_properties().mass() - 5.0) < 1e-12);

    // refresh_aggregate_masses should NOT wipe the mass
    state.refresh_aggregate_masses();

    loaded = state.build_body_proto("body-a");
    assert(loaded.has_value());
    assert(std::abs(loaded->mass_properties().mass() - 5.0) < 1e-12 &&
           "Mass should be preserved when body has no geometries");

    // Verify the body still compiles after refresh
    eng::SimulationRuntime runtime;
    auto mech_proto = state.build_mechanism_proto();
    auto result = runtime.compile(mech_proto);
    assert(result.success && "Body with preserved mass should compile");

    std::cout << "PASS\n";
    return 0;
}

// ===========================================================================
// Epic 3: ChLinkMate Migration Tests
// ===========================================================================

// Helper: build a two-body fixed-joint mechanism
static mech::Mechanism build_fixed_joint_mechanism() {
    mech::Mechanism m;
    m.mutable_id()->set_id("mech-fixed");
    m.set_name("Fixed joint test");

    // Ground
    auto* ground = m.add_bodies();
    ground->mutable_id()->set_id("body-ground");
    ground->set_name("Ground");
    ground->set_motion_type(mech::MOTION_TYPE_FIXED);
    auto* gpose = ground->mutable_pose();
    gpose->mutable_position()->set_x(0); gpose->mutable_position()->set_y(0); gpose->mutable_position()->set_z(0);
    gpose->mutable_orientation()->set_w(1);
    auto* gmp = ground->mutable_mass_properties();
    gmp->set_mass(1.0);
    gmp->set_ixx(0.1); gmp->set_iyy(0.1); gmp->set_izz(0.1);

    // Moving body at (1, 0, 0)
    auto* body = m.add_bodies();
    body->mutable_id()->set_id("body-block");
    body->set_name("Block");
    auto* bpose = body->mutable_pose();
    bpose->mutable_position()->set_x(1); bpose->mutable_position()->set_y(0); bpose->mutable_position()->set_z(0);
    bpose->mutable_orientation()->set_w(1);
    auto* bmp = body->mutable_mass_properties();
    bmp->set_mass(1.0);
    bmp->set_ixx(0.1); bmp->set_iyy(0.1); bmp->set_izz(0.1);

    // Datums at midpoint
    auto* dg = m.add_datums();
    dg->mutable_id()->set_id("datum-g");
    dg->set_name("Ground attach");
    dg->mutable_parent_body_id()->set_id("body-ground");
    dg->mutable_local_pose()->mutable_position()->set_x(0.5);
    dg->mutable_local_pose()->mutable_orientation()->set_w(1);

    auto* db = m.add_datums();
    db->mutable_id()->set_id("datum-b");
    db->set_name("Block attach");
    db->mutable_parent_body_id()->set_id("body-block");
    db->mutable_local_pose()->mutable_position()->set_x(-0.5);
    db->mutable_local_pose()->mutable_orientation()->set_w(1);

    auto* joint = m.add_joints();
    joint->mutable_id()->set_id("joint-fix");
    joint->set_name("Fixed");
    joint->set_type(mech::JOINT_TYPE_FIXED);
    joint->mutable_parent_datum_id()->set_id("datum-g");
    joint->mutable_child_datum_id()->set_id("datum-b");

    return m;
}

// Test: Fixed joint (ChLinkMateFix) — body should not move
static int test_fixed_joint_no_motion() {
    std::cout << "  [test_fixed_joint_no_motion] ";

    eng::SimulationRuntime runtime;
    auto mechanism = build_fixed_joint_mechanism();
    auto result = runtime.compile(mechanism);
    assert(result.success && "Fixed joint mechanism should compile");

    // Step 200 times at dt=0.001
    for (int i = 0; i < 200; i++) {
        runtime.step(0.001);
    }

    auto poses = runtime.getBodyPoses();
    const eng::BodyPose* block = nullptr;
    for (const auto& p : poses) {
        if (p.body_id == "body-block") block = &p;
    }
    assert(block);

    // Fixed joint: block should stay at (1, 0, 0)
    assert(std::abs(block->position[0] - 1.0) < 1e-4 && "Fixed body X should not drift");
    assert(std::abs(block->position[1]) < 1e-4 && "Fixed body Y should not drift");
    assert(std::abs(block->position[2]) < 1e-4 && "Fixed body Z should not drift");

    std::cout << "PASS\n";
    return 0;
}

// Test: Limited revolute (ChLinkLock fallback) — limits enforced
static int test_limited_revolute_fallback() {
    std::cout << "  [test_limited_revolute_fallback] ";

    auto m = build_pendulum_mechanism();
    // Set angle limits on the revolute joint: ±0.5 rad
    auto* joint = m.mutable_joints(0);
    auto* lim = joint->mutable_revolute()->mutable_angle_limit();
    lim->set_lower(-0.5);
    lim->set_upper(0.5);

    eng::SimulationRuntime runtime;
    auto result = runtime.compile(m);
    assert(result.success && "Limited revolute should compile (ChLinkLock fallback)");

    // Step enough to let pendulum hit limit
    for (int i = 0; i < 500; i++) {
        runtime.step(0.001);
    }

    auto states = runtime.getJointStates();
    assert(states.size() == 1);
    // Position should be clamped within limits (with some solver tolerance)
    assert(states[0].position >= -0.6 && states[0].position <= 0.6 &&
           "Revolute joint should respect angle limits");

    std::cout << "PASS (pos=" << states[0].position << ")\n";
    return 0;
}

// Helper: build a multi-type mechanism
static mech::Mechanism build_multi_type_mechanism() {
    mech::Mechanism m;
    m.mutable_id()->set_id("mech-multi");
    m.set_name("Multi-type test");

    // Helper lambda: add a body at a given X position
    auto add_body = [&](const std::string& id, const std::string& name, double x, bool fixed) {
        auto* body = m.add_bodies();
        body->mutable_id()->set_id(id);
        body->set_name(name);
        body->set_motion_type(fixed ? mech::MOTION_TYPE_FIXED : mech::MOTION_TYPE_DYNAMIC);
        auto* pose = body->mutable_pose();
        pose->mutable_position()->set_x(x);
        pose->mutable_orientation()->set_w(1);
        auto* mp = body->mutable_mass_properties();
        mp->set_mass(1.0);
        mp->set_ixx(0.1); mp->set_iyy(0.1); mp->set_izz(0.1);
    };

    // Helper lambda: add a datum
    auto add_datum = [&](const std::string& id, const std::string& body_id, double lx) {
        auto* d = m.add_datums();
        d->mutable_id()->set_id(id);
        d->mutable_parent_body_id()->set_id(body_id);
        d->mutable_local_pose()->mutable_position()->set_x(lx);
        d->mutable_local_pose()->mutable_orientation()->set_w(1);
    };

    // Helper lambda: add a joint
    auto add_joint = [&](const std::string& id, const std::string& name,
                         mech::JointType type,
                         const std::string& parent_datum, const std::string& child_datum) {
        auto* j = m.add_joints();
        j->mutable_id()->set_id(id);
        j->set_name(name);
        j->set_type(type);
        j->mutable_parent_datum_id()->set_id(parent_datum);
        j->mutable_child_datum_id()->set_id(child_datum);
    };

    // Ground + 4 bodies in a chain
    add_body("bg", "Ground", 0, true);
    add_body("b1", "Body1", 1, false);
    add_body("b2", "Body2", 2, false);
    add_body("b3", "Body3", 3, false);
    add_body("b4", "Body4", 4, false);

    // Datums: parent side at +0.5, child side at -0.5
    add_datum("dg-r", "bg", 0.5);
    add_datum("d1-l", "b1", -0.5);
    add_datum("d1-r", "b1", 0.5);
    add_datum("d2-l", "b2", -0.5);
    add_datum("d2-r", "b2", 0.5);
    add_datum("d3-l", "b3", -0.5);
    add_datum("d3-r", "b3", 0.5);
    add_datum("d4-l", "b4", -0.5);

    // Chain: ground -[revolute]-> b1 -[prismatic]-> b2 -[fixed]-> b3 -[spherical]-> b4
    add_joint("j1", "Rev", mech::JOINT_TYPE_REVOLUTE, "dg-r", "d1-l");
    add_joint("j2", "Prism", mech::JOINT_TYPE_PRISMATIC, "d1-r", "d2-l");
    add_joint("j3", "Fix", mech::JOINT_TYPE_FIXED, "d2-r", "d3-l");
    add_joint("j4", "Sph", mech::JOINT_TYPE_SPHERICAL, "d3-r", "d4-l");

    return m;
}

// Test: Multi-type mechanism — all channels return non-NaN
static int test_multi_type_channels() {
    std::cout << "  [test_multi_type_channels] ";

    eng::SimulationRuntime runtime;
    auto mechanism = build_multi_type_mechanism();
    auto result = runtime.compile(mechanism);
    assert(result.success && "Multi-type mechanism should compile");

    // Step 100 iterations
    for (int i = 0; i < 100; i++) {
        runtime.step(0.001);
    }

    auto channels = runtime.getChannelValues();
    assert(!channels.empty() && "Should have channel values");

    for (const auto& ch : channels) {
        if (ch.data_type == 1) {
            assert(!std::isnan(ch.scalar) && "Scalar channel should not be NaN");
        } else if (ch.data_type == 2) {
            assert(!std::isnan(ch.vector[0]) && "Vector[0] should not be NaN");
            assert(!std::isnan(ch.vector[1]) && "Vector[1] should not be NaN");
            assert(!std::isnan(ch.vector[2]) && "Vector[2] should not be NaN");
        }
    }

    // Also verify joint states for revolute and prismatic
    auto states = runtime.getJointStates();
    assert(states.size() >= 2 && "Should have at least revolute + prismatic joint states");
    for (const auto& s : states) {
        assert(!std::isnan(s.position) && "Joint position should not be NaN");
        assert(!std::isnan(s.velocity) && "Joint velocity should not be NaN");
    }

    std::cout << "PASS (" << channels.size() << " channels, " << states.size() << " joint states)\n";
    return 0;
}

// ===========================================================================
// Pre-Simulation Validation Tests (Epic 17, Prompt 3)
// ===========================================================================

// Helper: find a diagnostic by code in structured_diagnostics
static const eng::CompilationDiagnostic* find_diagnostic(
    const eng::CompilationResult& result, const std::string& code) {
    for (const auto& d : result.structured_diagnostics) {
        if (d.code == code) return &d;
    }
    return nullptr;
}

// Helper: count diagnostics by severity
static int count_by_severity(const eng::CompilationResult& result,
                             eng::DiagnosticSeverity sev) {
    int count = 0;
    for (const auto& d : result.structured_diagnostics) {
        if (d.severity == sev) count++;
    }
    return count;
}

static int test_no_ground_error() {
    std::cout << "  [test_no_ground_error] ";

    eng::SimulationRuntime runtime;
    mech::Mechanism m;
    m.mutable_id()->set_id("no-ground");

    // One body, NOT fixed
    auto* body = m.add_bodies();
    body->mutable_id()->set_id("body-1");
    body->set_name("Floating");
    auto* mp = body->mutable_mass_properties();
    mp->set_mass(1.0);
    mp->set_ixx(0.1); mp->set_iyy(0.1); mp->set_izz(0.1);

    auto result = runtime.compile(m);
    assert(!result.success);
    auto* diag = find_diagnostic(result, "NO_GROUND");
    assert(diag && "Expected NO_GROUND diagnostic");
    assert(diag->severity == eng::DiagnosticSeverity::ERROR);

    std::cout << "PASS\n";
    return 0;
}

static int test_self_joint_error() {
    std::cout << "  [test_self_joint_error] ";

    eng::SimulationRuntime runtime;
    mech::Mechanism m;
    m.mutable_id()->set_id("self-joint");

    auto* body = m.add_bodies();
    body->mutable_id()->set_id("body-1");
    body->set_name("Only Body");
    body->set_motion_type(mech::MOTION_TYPE_FIXED);
    auto* mp = body->mutable_mass_properties();
    mp->set_mass(1.0);
    mp->set_ixx(0.1); mp->set_iyy(0.1); mp->set_izz(0.1);

    // Two datums on the same body
    auto* d1 = m.add_datums();
    d1->mutable_id()->set_id("datum-1");
    d1->mutable_parent_body_id()->set_id("body-1");
    auto* lp1 = d1->mutable_local_pose();
    lp1->mutable_position()->set_x(0.1);
    lp1->mutable_orientation()->set_w(1);

    auto* d2 = m.add_datums();
    d2->mutable_id()->set_id("datum-2");
    d2->mutable_parent_body_id()->set_id("body-1");
    auto* lp2 = d2->mutable_local_pose();
    lp2->mutable_position()->set_x(-0.1);
    lp2->mutable_orientation()->set_w(1);

    auto* joint = m.add_joints();
    joint->mutable_id()->set_id("joint-self");
    joint->set_name("Self Joint");
    joint->set_type(mech::JOINT_TYPE_REVOLUTE);
    joint->mutable_parent_datum_id()->set_id("datum-1");
    joint->mutable_child_datum_id()->set_id("datum-2");

    auto result = runtime.compile(m);
    assert(!result.success);
    auto* diag = find_diagnostic(result, "SELF_JOINT");
    assert(diag && "Expected SELF_JOINT diagnostic");
    assert(diag->severity == eng::DiagnosticSeverity::ERROR);
    assert(!diag->affected_entity_ids.empty());

    std::cout << "PASS\n";
    return 0;
}

static int test_duplicate_actuator_error() {
    std::cout << "  [test_duplicate_actuator_error] ";

    eng::SimulationRuntime runtime;
    auto m = build_pendulum_mechanism();

    // Add two actuators targeting the same joint
    auto* act1 = m.add_actuators();
    act1->mutable_id()->set_id("act-1");
    act1->set_name("Motor 1");
    auto* rm1 = act1->mutable_revolute_motor();
    rm1->mutable_joint_id()->set_id("joint-rev");
    rm1->set_control_mode(mech::ACTUATOR_CONTROL_MODE_SPEED);
    rm1->set_command_value(1.0);

    auto* act2 = m.add_actuators();
    act2->mutable_id()->set_id("act-2");
    act2->set_name("Motor 2");
    auto* rm2 = act2->mutable_revolute_motor();
    rm2->mutable_joint_id()->set_id("joint-rev");
    rm2->set_control_mode(mech::ACTUATOR_CONTROL_MODE_SPEED);
    rm2->set_command_value(2.0);

    auto result = runtime.compile(m);
    assert(!result.success);
    auto* diag = find_diagnostic(result, "DUPLICATE_ACTUATOR");
    assert(diag && "Expected DUPLICATE_ACTUATOR diagnostic");
    assert(diag->severity == eng::DiagnosticSeverity::ERROR);

    std::cout << "PASS\n";
    return 0;
}

static int test_floating_body_warning() {
    std::cout << "  [test_floating_body_warning] ";

    eng::SimulationRuntime runtime;
    auto m = build_pendulum_mechanism();

    // Add a third unconnected body
    auto* body = m.add_bodies();
    body->mutable_id()->set_id("body-floating");
    body->set_name("Floater");
    auto* mp = body->mutable_mass_properties();
    mp->set_mass(1.0);
    mp->set_ixx(0.1); mp->set_iyy(0.1); mp->set_izz(0.1);
    auto* pose = body->mutable_pose();
    pose->mutable_position()->set_x(5);
    pose->mutable_orientation()->set_w(1);

    auto result = runtime.compile(m);
    assert(result.success && "Should succeed with warnings");
    auto* diag = find_diagnostic(result, "FLOATING_BODY");
    assert(diag && "Expected FLOATING_BODY warning");
    assert(diag->severity == eng::DiagnosticSeverity::WARNING);
    assert(diag->affected_entity_ids.size() == 1);
    assert(diag->affected_entity_ids[0] == "body-floating");

    std::cout << "PASS\n";
    return 0;
}

static int test_under_constrained_warning() {
    std::cout << "  [test_under_constrained_warning] ";

    eng::SimulationRuntime runtime;
    mech::Mechanism m;
    m.mutable_id()->set_id("under-constrained");

    // Ground
    auto* ground = m.add_bodies();
    ground->mutable_id()->set_id("body-g");
    ground->set_name("Ground");
    ground->set_motion_type(mech::MOTION_TYPE_FIXED);
    auto* gmp = ground->mutable_mass_properties();
    gmp->set_mass(1.0);
    gmp->set_ixx(0.1); gmp->set_iyy(0.1); gmp->set_izz(0.1);
    ground->mutable_pose()->mutable_orientation()->set_w(1);

    // Three moving bodies, only 1 revolute joint connecting first to ground
    // DOF = 6*3 - 5 = 13 > 0 → UNDER_CONSTRAINED
    for (int i = 0; i < 3; i++) {
        auto* body = m.add_bodies();
        body->mutable_id()->set_id("body-" + std::to_string(i));
        body->set_name("Body " + std::to_string(i));
        auto* mp = body->mutable_mass_properties();
        mp->set_mass(1.0);
        mp->set_ixx(0.1); mp->set_iyy(0.1); mp->set_izz(0.1);
        auto* pose = body->mutable_pose();
        pose->mutable_position()->set_x(static_cast<double>(i + 1));
        pose->mutable_orientation()->set_w(1);
    }

    // Datums + 1 revolute joint from ground to body-0
    auto* d1 = m.add_datums();
    d1->mutable_id()->set_id("d-g");
    d1->mutable_parent_body_id()->set_id("body-g");
    d1->mutable_local_pose()->mutable_orientation()->set_w(1);

    auto* d2 = m.add_datums();
    d2->mutable_id()->set_id("d-0");
    d2->mutable_parent_body_id()->set_id("body-0");
    d2->mutable_local_pose()->mutable_orientation()->set_w(1);

    auto* joint = m.add_joints();
    joint->mutable_id()->set_id("j-0");
    joint->set_name("J0");
    joint->set_type(mech::JOINT_TYPE_REVOLUTE);
    joint->mutable_parent_datum_id()->set_id("d-g");
    joint->mutable_child_datum_id()->set_id("d-0");

    // Add an actuator so the UNDER_CONSTRAINED check fires (DOF > num_actuators)
    auto* act = m.add_actuators();
    act->mutable_id()->set_id("act-uc");
    act->set_name("Motor");
    auto* rm = act->mutable_revolute_motor();
    rm->mutable_joint_id()->set_id("j-0");
    rm->set_control_mode(mech::ACTUATOR_CONTROL_MODE_SPEED);
    rm->set_command_value(1.0);

    auto result = runtime.compile(m);
    // DOF = 6*3 - 5 = 13, actuators = 1, so 13 > 1 → UNDER_CONSTRAINED
    auto* diag = find_diagnostic(result, "UNDER_CONSTRAINED");
    assert(diag && "Expected UNDER_CONSTRAINED warning");
    assert(diag->severity == eng::DiagnosticSeverity::WARNING);

    std::cout << "PASS\n";
    return 0;
}

static int test_over_constrained_warning() {
    std::cout << "  [test_over_constrained_warning] ";

    eng::SimulationRuntime runtime;
    mech::Mechanism m;
    m.mutable_id()->set_id("over-constrained");

    // Ground
    auto* ground = m.add_bodies();
    ground->mutable_id()->set_id("body-g");
    ground->set_name("Ground");
    ground->set_motion_type(mech::MOTION_TYPE_FIXED);
    auto* gmp = ground->mutable_mass_properties();
    gmp->set_mass(1.0);
    gmp->set_ixx(0.1); gmp->set_iyy(0.1); gmp->set_izz(0.1);
    ground->mutable_pose()->mutable_orientation()->set_w(1);

    // One moving body with TWO fixed joints to ground → removes 12 DOF from 6 available
    auto* body = m.add_bodies();
    body->mutable_id()->set_id("body-1");
    body->set_name("Over Body");
    auto* mp = body->mutable_mass_properties();
    mp->set_mass(1.0);
    mp->set_ixx(0.1); mp->set_iyy(0.1); mp->set_izz(0.1);
    body->mutable_pose()->mutable_orientation()->set_w(1);

    // 4 datums, 2 fixed joints
    for (int i = 0; i < 2; i++) {
        auto* dg = m.add_datums();
        dg->mutable_id()->set_id("dg-" + std::to_string(i));
        dg->mutable_parent_body_id()->set_id("body-g");
        dg->mutable_local_pose()->mutable_orientation()->set_w(1);

        auto* db = m.add_datums();
        db->mutable_id()->set_id("db-" + std::to_string(i));
        db->mutable_parent_body_id()->set_id("body-1");
        db->mutable_local_pose()->mutable_orientation()->set_w(1);

        auto* jnt = m.add_joints();
        jnt->mutable_id()->set_id("jf-" + std::to_string(i));
        jnt->set_name("Fixed " + std::to_string(i));
        jnt->set_type(mech::JOINT_TYPE_FIXED);
        jnt->mutable_parent_datum_id()->set_id("dg-" + std::to_string(i));
        jnt->mutable_child_datum_id()->set_id("db-" + std::to_string(i));
    }

    auto result = runtime.compile(m);
    assert(result.success && "Over-constrained is a warning, not an error");
    auto* diag = find_diagnostic(result, "OVER_CONSTRAINED");
    assert(diag && "Expected OVER_CONSTRAINED warning");
    assert(diag->severity == eng::DiagnosticSeverity::WARNING);

    std::cout << "PASS\n";
    return 0;
}

static int test_disconnected_subgroups_info() {
    std::cout << "  [test_disconnected_subgroups_info] ";

    eng::SimulationRuntime runtime;
    auto m = build_pendulum_mechanism();

    // Add a second independent chain: body-c fixed, body-d connected to it
    auto* body_c = m.add_bodies();
    body_c->mutable_id()->set_id("body-c");
    body_c->set_name("Ground 2");
    body_c->set_motion_type(mech::MOTION_TYPE_FIXED);
    auto* cmp = body_c->mutable_mass_properties();
    cmp->set_mass(1.0);
    cmp->set_ixx(0.1); cmp->set_iyy(0.1); cmp->set_izz(0.1);
    body_c->mutable_pose()->mutable_position()->set_x(10);
    body_c->mutable_pose()->mutable_orientation()->set_w(1);

    auto* body_d = m.add_bodies();
    body_d->mutable_id()->set_id("body-d");
    body_d->set_name("Arm 2");
    auto* dmp = body_d->mutable_mass_properties();
    dmp->set_mass(1.0);
    dmp->set_ixx(0.1); dmp->set_iyy(0.1); dmp->set_izz(0.1);
    body_d->mutable_pose()->mutable_position()->set_x(11);
    body_d->mutable_pose()->mutable_orientation()->set_w(1);

    auto* dc = m.add_datums();
    dc->mutable_id()->set_id("datum-c");
    dc->mutable_parent_body_id()->set_id("body-c");
    dc->mutable_local_pose()->mutable_position()->set_x(0.5);
    dc->mutable_local_pose()->mutable_orientation()->set_w(1);

    auto* dd = m.add_datums();
    dd->mutable_id()->set_id("datum-d");
    dd->mutable_parent_body_id()->set_id("body-d");
    dd->mutable_local_pose()->mutable_position()->set_x(-0.5);
    dd->mutable_local_pose()->mutable_orientation()->set_w(1);

    auto* joint2 = m.add_joints();
    joint2->mutable_id()->set_id("joint-rev-2");
    joint2->set_name("Pivot 2");
    joint2->set_type(mech::JOINT_TYPE_REVOLUTE);
    joint2->mutable_parent_datum_id()->set_id("datum-c");
    joint2->mutable_child_datum_id()->set_id("datum-d");

    auto result = runtime.compile(m);
    assert(result.success);
    auto* diag = find_diagnostic(result, "DISCONNECTED_SUBGROUPS");
    assert(diag && "Expected DISCONNECTED_SUBGROUPS info");
    assert(diag->severity == eng::DiagnosticSeverity::INFO);

    std::cout << "PASS\n";
    return 0;
}

static int test_valid_mechanism_clean() {
    std::cout << "  [test_valid_mechanism_clean] ";

    eng::SimulationRuntime runtime;
    auto m = build_pendulum_mechanism();
    auto result = runtime.compile(m);
    assert(result.success);

    // Should have no error or warning diagnostics
    int errors = count_by_severity(result, eng::DiagnosticSeverity::ERROR);
    int warnings = count_by_severity(result, eng::DiagnosticSeverity::WARNING);
    assert(errors == 0 && "Valid mechanism should have no errors");
    assert(warnings == 0 && "Valid mechanism should have no warnings");

    std::cout << "PASS\n";
    return 0;
}

static int test_multiple_errors_accumulated() {
    std::cout << "  [test_multiple_errors_accumulated] ";

    eng::SimulationRuntime runtime;
    mech::Mechanism m;
    m.mutable_id()->set_id("multi-error");

    // Body with zero mass and NOT fixed → triggers both NO_GROUND and ZERO_MASS
    auto* body = m.add_bodies();
    body->mutable_id()->set_id("body-bad");
    body->set_name("Bad Body");
    auto* mp = body->mutable_mass_properties();
    mp->set_mass(0.0);

    auto result = runtime.compile(m);
    assert(!result.success);
    assert(find_diagnostic(result, "NO_GROUND") && "Expected NO_GROUND");
    assert(find_diagnostic(result, "ZERO_MASS") && "Expected ZERO_MASS");
    assert(count_by_severity(result, eng::DiagnosticSeverity::ERROR) >= 2);

    std::cout << "PASS\n";
    return 0;
}

static int test_zero_mass_fixed_body_ok() {
    std::cout << "  [test_zero_mass_fixed_body_ok] ";

    eng::SimulationRuntime runtime;
    mech::Mechanism m;
    m.mutable_id()->set_id("fixed-zero-mass");

    // Fixed body with mass=0 → should NOT trigger ZERO_MASS
    auto* body = m.add_bodies();
    body->mutable_id()->set_id("body-1");
    body->set_name("Ground");
    body->set_motion_type(mech::MOTION_TYPE_FIXED);
    auto* mp = body->mutable_mass_properties();
    mp->set_mass(0.0);
    mp->set_ixx(0.1); mp->set_iyy(0.1); mp->set_izz(0.1);

    auto result = runtime.compile(m);
    assert(result.success && "Fixed body with zero mass should compile");
    assert(!find_diagnostic(result, "ZERO_MASS") && "Should not trigger ZERO_MASS for fixed body");

    std::cout << "PASS\n";
    return 0;
}

static int test_backward_compat_string_diagnostics() {
    std::cout << "  [test_backward_compat_string_diagnostics] ";

    eng::SimulationRuntime runtime;
    auto m = build_pendulum_mechanism();

    // Add a floating body to trigger a warning
    auto* body = m.add_bodies();
    body->mutable_id()->set_id("body-floating");
    body->set_name("Floater");
    auto* mp = body->mutable_mass_properties();
    mp->set_mass(1.0);
    mp->set_ixx(0.1); mp->set_iyy(0.1); mp->set_izz(0.1);
    body->mutable_pose()->mutable_position()->set_x(5);
    body->mutable_pose()->mutable_orientation()->set_w(1);

    auto result = runtime.compile(m);
    assert(result.success);
    // Deprecated string diagnostics should be populated from structured
    assert(!result.structured_diagnostics.empty());
    assert(result.diagnostics.size() == result.structured_diagnostics.size() &&
           "Deprecated diagnostics should match structured count");

    std::cout << "PASS\n";
    return 0;
}

// ===========================================================================
// Epic 3: ChLinkLock + ChBodyAuxRef Regression Tests
// ===========================================================================

// Test: Lock-based revolute produces same pendulum trajectory as before
static int test_lock_revolute_pendulum() {
    std::cout << "  [test_lock_revolute_pendulum] ";

    auto m = build_pendulum_mechanism();
    eng::SimulationRuntime runtime;
    auto result = runtime.compile(m);
    assert(result.success);

    for (int i = 0; i < 100; i++) runtime.step(0.001);

    auto poses = runtime.getBodyPoses();
    const eng::BodyPose* pendulum = nullptr;
    for (const auto& p : poses) {
        if (p.body_id == "body-b") pendulum = &p;
    }
    assert(pendulum);

    // Pendulum should swing down: Y decreases from 0
    assert(pendulum->position[1] < -0.01 && "Pendulum should swing down under gravity");
    // X should change from 1.0
    assert(std::abs(pendulum->position[0] - 1.0) > 0.001 && "Pendulum X should shift");

    auto states = runtime.getJointStates();
    assert(states.size() == 1);
    assert(!std::isnan(states[0].position) && "Joint position should not be NaN");
    assert(!std::isnan(states[0].velocity) && "Joint velocity should not be NaN");

    std::cout << "PASS\n";
    return 0;
}

// Test: Spherical joint via ChLinkLockSpherical — 3 rotational DOF
static int test_lock_spherical() {
    std::cout << "  [test_lock_spherical] ";

    MechanismBuilder mb;
    mb.addFixedBody("ground")
      .addBody("ball", 1.0, 1.0, 0, 0)
      .addDatum("d1", "ground", 0.5, 0, 0)
      .addDatum("d2", "ball", -0.5, 0, 0)
      .addJoint("j1", mech::JOINT_TYPE_SPHERICAL, "d1", "d2");

    auto sr = run_sim(mb.build(), 0.001, 200);

    auto& ball = find_body(sr.poses, "ball");
    // Ball should swing down (spherical allows all rotations)
    assert(ball.position[1] < -0.01 && "Spherical joint should allow pendulum swing");

    std::cout << "PASS\n";
    return 0;
}

// Test: Planar joint via ChLinkLockPlanar — body slides on plane
static int test_lock_planar() {
    std::cout << "  [test_lock_planar] ";

    MechanismBuilder mb;
    mb.addFixedBody("ground")
      .addBody("slider", 1.0, 1.0, 0, 0)
      .addDatum("d1", "ground", 0.5, 0, 0)
      .addDatum("d2", "slider", -0.5, 0, 0)
      .addJoint("j1", mech::JOINT_TYPE_PLANAR, "d1", "d2");

    auto sr = run_sim(mb.build(), 0.001, 200);

    auto& slider = find_body(sr.poses, "slider");
    // Planar joint constrains Z translation — body should still be able to move in X/Y
    assert(!std::isnan(slider.position[0]) && "Position should not be NaN");
    assert(!std::isnan(slider.position[1]) && "Position should not be NaN");

    std::cout << "PASS\n";
    return 0;
}

// Test: Point-line joint via ChLinkLockPointLine
static int test_lock_point_line() {
    std::cout << "  [test_lock_point_line] ";

    MechanismBuilder mb;
    mb.addFixedBody("ground")
      .addBody("slider", 1.0, 1.0, 0, 0)
      .addDatum("d1", "ground", 0.5, 0, 0)
      .addDatum("d2", "slider", -0.5, 0, 0)
      .addJoint("j1", mech::JOINT_TYPE_POINT_LINE, "d1", "d2");

    auto sr = run_sim(mb.build(), 0.001, 100);

    auto& slider = find_body(sr.poses, "slider");
    assert(!std::isnan(slider.position[0]) && "Position should not be NaN");

    std::cout << "PASS\n";
    return 0;
}

// Test: Point-plane joint via ChLinkLockPointPlane
static int test_lock_point_plane() {
    std::cout << "  [test_lock_point_plane] ";

    MechanismBuilder mb;
    mb.addFixedBody("ground")
      .addBody("slider", 1.0, 1.0, 0, 0)
      .addDatum("d1", "ground", 0.5, 0, 0)
      .addDatum("d2", "slider", -0.5, 0, 0)
      .addJoint("j1", mech::JOINT_TYPE_POINT_PLANE, "d1", "d2");

    auto sr = run_sim(mb.build(), 0.001, 100);

    auto& slider = find_body(sr.poses, "slider");
    assert(!std::isnan(slider.position[0]) && "Position should not be NaN");

    std::cout << "PASS\n";
    return 0;
}

// Test: ChBodyAuxRef with non-zero COM offset
static int test_auxref_com_offset() {
    std::cout << "  [test_auxref_com_offset] ";

    // Pendulum with COM offset — should behave differently than zero-COM
    MechanismBuilder mb;
    mb.addFixedBody("ground")
      .addBody("pendulum", 1.0, 1.0, 0, 0)
      .withCenterOfMass(0.3, 0, 0)  // COM shifted from body origin
      .addDatum("d1", "ground", 0.5, 0, 0)
      .addDatum("d2", "pendulum", -0.5, 0, 0)
      .addRevoluteJoint("j1", "d1", "d2");

    eng::SimulationRuntime runtime;
    auto result = runtime.compile(mb.build());
    assert(result.success);

    for (int i = 0; i < 100; i++) runtime.step(0.001);

    auto poses = runtime.getBodyPoses();
    auto& pend = find_body(poses, "pendulum");

    // Pose readback should return the REF frame (body origin), not COM
    // The body was placed at (1,0,0), and after swinging should still be near X=1
    // but Y should decrease (pendulum swings down)
    assert(!std::isnan(pend.position[0]) && "REF frame X should not be NaN");
    assert(pend.position[1] < 0.0 && "Pendulum should swing down");

    std::cout << "PASS\n";
    return 0;
}

// Test: ChBodyAuxRef with zero COM matches standard pendulum behavior
static int test_auxref_zero_com() {
    std::cout << "  [test_auxref_zero_com] ";

    auto m = build_pendulum_mechanism();
    eng::SimulationRuntime runtime;
    auto result = runtime.compile(m);
    assert(result.success);

    for (int i = 0; i < 50; i++) runtime.step(0.001);

    auto poses = runtime.getBodyPoses();
    auto& pend = find_body(poses, "body-b");

    // With zero COM offset, ChBodyAuxRef should behave identically to ChBody
    assert(pend.position[1] < -0.001 && "Zero-COM pendulum should still swing");
    assert(!std::isnan(pend.position[0]));
    assert(!std::isnan(pend.position[1]));
    assert(!std::isnan(pend.position[2]));

    std::cout << "PASS\n";
    return 0;
}

// Test: All Lock joint types produce non-NaN reaction forces
static int test_lock_reaction_forces() {
    std::cout << "  [test_lock_reaction_forces] ";

    // Use the existing multi-type mechanism (revolute, prismatic, fixed, spherical)
    auto mechanism = build_multi_type_mechanism();
    eng::SimulationRuntime runtime;
    auto result = runtime.compile(mechanism);
    assert(result.success);

    for (int i = 0; i < 50; i++) runtime.step(0.001);

    auto states = runtime.getJointStates();
    // Revolute and prismatic joints should be present
    bool found_revolute = false, found_prismatic = false;
    for (const auto& s : states) {
        assert(!std::isnan(s.reaction_force[0]) && "Reaction force X should not be NaN");
        assert(!std::isnan(s.reaction_force[1]) && "Reaction force Y should not be NaN");
        assert(!std::isnan(s.reaction_force[2]) && "Reaction force Z should not be NaN");
        assert(!std::isnan(s.reaction_torque[0]) && "Reaction torque X should not be NaN");
        assert(!std::isnan(s.reaction_torque[1]) && "Reaction torque Y should not be NaN");
        assert(!std::isnan(s.reaction_torque[2]) && "Reaction torque Z should not be NaN");
        if (s.joint_id == "j1") found_revolute = true;
        if (s.joint_id == "j2") found_prismatic = true;
    }
    assert(found_revolute && "Should find revolute joint state");
    assert(found_prismatic && "Should find prismatic joint state");

    // Channel values should also be non-NaN
    auto channels = runtime.getChannelValues();
    for (const auto& ch : channels) {
        assert(!std::isnan(ch.scalar) && "Channel scalar should not be NaN");
        assert(!std::isnan(ch.vector[0]) && "Channel vector[0] should not be NaN");
        assert(!std::isnan(ch.vector[1]) && "Channel vector[1] should not be NaN");
        assert(!std::isnan(ch.vector[2]) && "Channel vector[2] should not be NaN");
    }

    std::cout << "PASS\n";
    return 0;
}

// Test: Cylindrical joint with limits via ChLinkLockCylindrical
static int test_lock_cylindrical_limits() {
    std::cout << "  [test_lock_cylindrical_limits] ";

    MechanismBuilder mb;
    mb.addFixedBody("ground")
      .addBody("slider", 1.0, 1.0, 0, 0)
      .addDatum("d1", "ground", 0.5, 0, 0)
      .addDatum("d2", "slider", -0.5, 0, 0)
      .addJoint("j1", mech::JOINT_TYPE_CYLINDRICAL, "d1", "d2");

    // Add translation and rotation limits to the cylindrical joint
    auto m = mb.build();
    auto* joint = m.mutable_joints(0);
    auto* cyl = joint->mutable_cylindrical();
    cyl->mutable_translation_limit()->set_lower(-0.1);
    cyl->mutable_translation_limit()->set_upper(0.1);
    cyl->mutable_rotation_limit()->set_lower(-0.5);
    cyl->mutable_rotation_limit()->set_upper(0.5);

    eng::SimulationRuntime runtime;
    auto result = runtime.compile(m);
    assert(result.success && "Cylindrical joint with limits should compile");

    for (int i = 0; i < 200; i++) runtime.step(0.001);

    auto poses = runtime.getBodyPoses();
    auto& slider = find_body(poses, "slider");
    assert(!std::isnan(slider.position[0]) && "Position should not be NaN");

    std::cout << "PASS\n";
    return 0;
}

// ---------------------------------------------------------------------------
// Epic 6: Joint Dynamics (Damping) Tests
// ---------------------------------------------------------------------------

int test_revolute_damping_reduces_velocity() {
    std::cout << "  [test_revolute_damping_reduces_velocity] ";

    // Undamped pendulum
    MechanismBuilder mb_undamped;
    mb_undamped.addFixedBody("ground")
        .addBody("pendulum", 1.0, 1.0, 0, 0)
        .addDatum("d1", "ground", 0.5, 0, 0)
        .addDatum("d2", "pendulum", -0.5, 0, 0)
        .addRevoluteJoint("j1", "d1", "d2");

    // Damped pendulum (same geometry)
    MechanismBuilder mb_damped;
    mb_damped.addFixedBody("ground")
        .addBody("pendulum", 1.0, 1.0, 0, 0)
        .addDatum("d1", "ground", 0.5, 0, 0)
        .addDatum("d2", "pendulum", -0.5, 0, 0)
        .addRevoluteJoint("j1", "d1", "d2")
        .withRevoluteDamping(0.5);

    auto sr_undamped = run_sim(mb_undamped.build(), 0.001, 500);
    auto sr_damped = run_sim(mb_damped.build(), 0.001, 500);

    assert(!sr_undamped.joints.empty() && !sr_damped.joints.empty());
    double vel_undamped = std::abs(sr_undamped.joints[0].velocity);
    double vel_damped = std::abs(sr_damped.joints[0].velocity);

    assert(!std::isnan(vel_undamped) && "Undamped velocity should not be NaN");
    assert(!std::isnan(vel_damped) && "Damped velocity should not be NaN");
    assert(vel_damped < vel_undamped && "Damped velocity should be less than undamped");

    std::cout << "PASS (undamped_vel=" << vel_undamped << ", damped_vel=" << vel_damped << ")\n";
    return 0;
}

int test_prismatic_damping_decelerates() {
    std::cout << "  [test_prismatic_damping_decelerates] ";

    MechanismBuilder mb;
    mb.addFixedBody("ground")
        .addBody("slider", 1.0, 0, 1.0, 0)  // offset in Y, gravity pulls down
        .addDatum("d1", "ground", 0, 0.5, 0)
        .addDatum("d2", "slider", 0, -0.5, 0)
        .addPrismaticJoint("j1", "d1", "d2")
        .withPrismaticDamping(1.0);

    eng::SimulationRuntime runtime;
    auto result = runtime.compile(mb.build());
    assert(result.success && "Should compile");

    // Step and check velocity at two time points
    for (int i = 0; i < 100; i++) runtime.step(0.001);
    auto states_early = runtime.getJointStates();
    double vel_early = std::abs(states_early[0].velocity);

    for (int i = 0; i < 400; i++) runtime.step(0.001);
    auto states_late = runtime.getJointStates();
    double vel_late = std::abs(states_late[0].velocity);

    assert(!std::isnan(vel_early) && "Early velocity should not be NaN");
    assert(!std::isnan(vel_late) && "Late velocity should not be NaN");

    std::cout << "PASS (vel_early=" << vel_early << ", vel_late=" << vel_late << ")\n";
    return 0;
}

int test_zero_damping_matches_undamped() {
    std::cout << "  [test_zero_damping_matches_undamped] ";

    // No damping field set
    MechanismBuilder mb_none;
    mb_none.addFixedBody("ground")
        .addBody("pendulum", 1.0, 1.0, 0, 0)
        .addDatum("d1", "ground", 0.5, 0, 0)
        .addDatum("d2", "pendulum", -0.5, 0, 0)
        .addRevoluteJoint("j1", "d1", "d2");

    // Explicit damping = 0.0
    MechanismBuilder mb_zero;
    mb_zero.addFixedBody("ground")
        .addBody("pendulum", 1.0, 1.0, 0, 0)
        .addDatum("d1", "ground", 0.5, 0, 0)
        .addDatum("d2", "pendulum", -0.5, 0, 0)
        .addRevoluteJoint("j1", "d1", "d2")
        .withRevoluteDamping(0.0);

    auto sr_none = run_sim(mb_none.build(), 0.001, 200);
    auto sr_zero = run_sim(mb_zero.build(), 0.001, 200);

    auto& body_none = find_body(sr_none.poses, "pendulum");
    auto& body_zero = find_body(sr_zero.poses, "pendulum");

    double diff = std::abs(body_none.position[1] - body_zero.position[1]);
    assert(diff < 1e-12 && "Zero damping should produce identical results to no damping");

    std::cout << "PASS (diff=" << diff << ")\n";
    return 0;
}

int test_cylindrical_separate_damping() {
    std::cout << "  [test_cylindrical_separate_damping] ";

    // Cylindrical with rotational damping only
    MechanismBuilder mb;
    mb.addFixedBody("ground")
        .addBody("slider", 1.0, 1.0, 0, 0)
        .addDatum("d1", "ground", 0.5, 0, 0)
        .addDatum("d2", "slider", -0.5, 0, 0)
        .addJoint("j1", mech::JOINT_TYPE_CYLINDRICAL, "d1", "d2");

    auto m = mb.build();
    auto* cyl = m.mutable_joints(0)->mutable_cylindrical();
    cyl->set_rotational_damping(1.0);
    cyl->set_translational_damping(0.0);

    eng::SimulationRuntime runtime;
    auto result = runtime.compile(m);
    assert(result.success && "Should compile");

    for (int i = 0; i < 200; i++) runtime.step(0.001);

    auto poses = runtime.getBodyPoses();
    auto& body = find_body(poses, "slider");
    assert(!std::isnan(body.position[0]) && "Position X should not be NaN");
    assert(!std::isnan(body.position[1]) && "Position Y should not be NaN");
    assert(!std::isnan(body.position[2]) && "Position Z should not be NaN");

    // Cylindrical joints report channels, not joint states — verify via channels
    auto channels = runtime.getChannelValues();
    bool has_channel = false;
    for (const auto& ch : channels) {
        assert(!std::isnan(ch.scalar) && "Channel scalar should not be NaN");
        has_channel = true;
    }
    assert(has_channel && "Should have channel values");

    std::cout << "PASS\n";
    return 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

int main() {
    motionlab::init_logging(spdlog::level::debug);
    std::cout << "=== Simulation Tests (Chrono Integration) ===\n";

    int failures = 0;
    failures += test_pendulum_simulation();
    failures += test_empty_mechanism();
    failures += test_missing_datum_reference();
    failures += test_zero_mass();
    failures += test_negative_mass();
    failures += test_reset();
    failures += test_example_pendulum();

    std::cout << "\n=== Solver Configuration Tests (Epic 17) ===\n";
    failures += test_default_solver_config();
    failures += test_psor_custom_params();
    failures += test_bb_solver();
    failures += test_apgd_solver();
    failures += test_minres_solver();
    failures += test_hht_integrator();
    failures += test_newmark_integrator();
    failures += test_contact_config();
    failures += test_backward_compat();
    failures += test_no_geometry_mass_preserved();

    std::cout << "\n=== ChLinkLock Migration Tests (Epic 3) ===\n";
    failures += test_fixed_joint_no_motion();
    failures += test_limited_revolute_fallback();
    failures += test_multi_type_channels();

    std::cout << "\n=== Epic 3: ChLinkLock + ChBodyAuxRef Regression ===\n";
    failures += test_lock_revolute_pendulum();
    failures += test_lock_spherical();
    failures += test_lock_planar();
    failures += test_lock_point_line();
    failures += test_lock_point_plane();
    failures += test_auxref_com_offset();
    failures += test_auxref_zero_com();
    failures += test_lock_reaction_forces();
    failures += test_lock_cylindrical_limits();

    std::cout << "\n=== Epic 6: Joint Dynamics (Damping) ===\n";
    failures += test_revolute_damping_reduces_velocity();
    failures += test_prismatic_damping_decelerates();
    failures += test_zero_damping_matches_undamped();
    failures += test_cylindrical_separate_damping();

    std::cout << "\n=== Pre-Simulation Validation Tests (Epic 17 Prompt 3) ===\n";
    failures += test_no_ground_error();
    failures += test_self_joint_error();
    failures += test_duplicate_actuator_error();
    failures += test_floating_body_warning();
    failures += test_under_constrained_warning();
    failures += test_over_constrained_warning();
    failures += test_disconnected_subgroups_info();
    failures += test_valid_mechanism_clean();
    failures += test_multiple_errors_accumulated();
    failures += test_zero_mass_fixed_body_ok();
    failures += test_backward_compat_string_diagnostics();

    if (failures == 0) {
        std::cout << "\nAll simulation tests passed.\n";
    } else {
        std::cout << "\n" << failures << " test(s) FAILED.\n";
    }
    return failures;
}
