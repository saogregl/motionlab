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

#include "../src/simulation.h"
#include "mechanism/mechanism.pb.h"

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

    // Body A — ground (first body = fixed by convention)
    {
        auto* body = m.add_bodies();
        body->mutable_id()->set_id("body-a");
        body->set_name("Ground");

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

    // Add one body
    auto* body = m.add_bodies();
    body->mutable_id()->set_id("body-1");
    body->set_name("Body 1");
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

    auto* body = m.add_bodies();
    body->mutable_id()->set_id("body-z");
    body->set_name("Massless Body");
    auto* mp = body->mutable_mass_properties();
    mp->set_mass(0.0);  // invalid

    auto result = runtime.compile(m);
    assert(!result.success);
    assert(result.error_message.find("Massless Body") != std::string::npos ||
           result.error_message.find("zero") != std::string::npos ||
           result.error_message.find("negative") != std::string::npos);

    std::cout << "PASS (error: " << result.error_message << ")\n";
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

    auto* body = m.add_bodies();
    body->mutable_id()->set_id("body-neg");
    body->set_name("Negative Body");
    auto* mp = body->mutable_mass_properties();
    mp->set_mass(-5.0);  // invalid

    auto result = runtime.compile(m);
    assert(!result.success);
    assert(result.error_message.find("Negative Body") != std::string::npos);

    std::cout << "PASS (error: " << result.error_message << ")\n";
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
//   - Ground has is_fixed=true (test 1 relies on first-body convention)
//   - Arm at (0.7,0,0) with pivot at (0.2,0,0) (test 1: arm at 1.0, pivot at 0.5)
//   - Realistic box inertia (test 1: isotropic 0.1)
//   - Joint limits set to ±6.28 (test 1: no limits)
// ---------------------------------------------------------------------------

static mech::Mechanism build_example_pendulum() {
    mech::Mechanism m;
    m.mutable_id()->set_id("mech-pendulum");
    m.set_name("Pendulum");

    // Ground: 0.4×0.2×0.2 m, 1 kg, is_fixed=true
    {
        auto* body = m.add_bodies();
        body->mutable_id()->set_id("body-ground");
        body->set_name("Ground");
        body->set_is_fixed(true);

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
        // is_fixed NOT set (defaults false)

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

    if (failures == 0) {
        std::cout << "\nAll simulation tests passed.\n";
    } else {
        std::cout << "\n" << failures << " test(s) FAILED.\n";
    }
    return failures;
}
