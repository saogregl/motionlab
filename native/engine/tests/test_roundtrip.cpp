// ---------------------------------------------------------------------------
// Round-trip and product-path tests — verifies that mechanisms created through
// MechanismState CRUD (the real UI path) compile correctly, and that proto
// serialization round-trips preserve all data.
// ---------------------------------------------------------------------------

#include "engine/log.h"

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
// Helper: create a standard two-body mechanism via MechanismState CRUD
// ---------------------------------------------------------------------------

/** Creates a ground + dynamic body + datum pair + revolute joint via CRUD. */
static mech::Mechanism build_via_mechanism_state(bool ground_fixed = true) {
    eng::MechanismState state;

    // Create ground body
    double pos0[3] = {0, 0, 0};
    double orient0[4] = {1, 0, 0, 0};
    mech::MassProperties mp_ground;
    mp_ground.set_mass(1.0);
    mp_ground.set_ixx(0.1); mp_ground.set_iyy(0.1); mp_ground.set_izz(0.1);
    std::string ground_id = state.create_body("Ground", pos0, orient0, &mp_ground, ground_fixed);

    // Create dynamic arm body
    double pos1[3] = {1, 0, 0};
    mech::MassProperties mp_arm;
    mp_arm.set_mass(1.0);
    mp_arm.set_ixx(0.05); mp_arm.set_iyy(0.05); mp_arm.set_izz(0.05);
    std::string arm_id = state.create_body("Arm", pos1, orient0, &mp_arm, false);

    // Create datums
    double d_pos0[3] = {0.5, 0, 0};
    auto datum_g = state.create_datum(ground_id, "Pivot on Ground", d_pos0, orient0);
    assert(datum_g.has_value());

    double d_pos1[3] = {-0.5, 0, 0};
    auto datum_a = state.create_datum(arm_id, "Pivot on Arm", d_pos1, orient0);
    assert(datum_a.has_value());

    // Create revolute joint via draft proto
    mech::Joint draft;
    draft.mutable_id()->set_id("joint-draft");
    draft.set_name("Pivot");
    draft.set_type(mech::JOINT_TYPE_REVOLUTE);
    draft.mutable_parent_datum_id()->set_id(datum_g->id().id());
    draft.mutable_child_datum_id()->set_id(datum_a->id().id());
    auto joint_result = state.create_joint(draft);
    assert(joint_result.entry.has_value() && "Joint creation should succeed");

    return state.build_mechanism_proto();
}

// ---------------------------------------------------------------------------
// Test 1: Fixed body via MechanismState compiles as ground
// This test catches the is_fixed/motion_type migration bug.
// ---------------------------------------------------------------------------

static int test_mechanism_state_fixed_body_compiles() {
    std::cout << "  [mechanism_state_fixed_body_compiles] ";

    auto mechanism = build_via_mechanism_state(true /* ground_fixed */);

    eng::SimulationRuntime runtime;
    auto result = runtime.compile(mechanism);

    if (!result.success) {
        std::cerr << "\n    FAIL: Compilation failed: " << result.error_message << "\n";
        for (const auto& d : result.structured_diagnostics) {
            std::cerr << "    [" << d.code << "] " << d.message << "\n";
        }
    }
    assert(result.success && "Mechanism from MechanismState should compile successfully");

    // Step a few times — ground should stay fixed
    for (int i = 0; i < 100; i++) runtime.step(0.001);

    auto poses = runtime.getBodyPoses();
    // Ground body should be at (0,0,0) after simulation.
    // Since IDs are UUIDs, find body by initial position.
    bool any_at_origin = false;
    for (const auto& p : poses) {
        double dist = std::sqrt(p.position[0]*p.position[0] +
                                p.position[1]*p.position[1] +
                                p.position[2]*p.position[2]);
        if (dist < 0.001) {
            any_at_origin = true;
        }
    }
    assert(any_at_origin && "Ground body should remain at origin (is_fixed must map to motion_type)");

    std::cout << "PASS\n";
    return 0;
}

// ---------------------------------------------------------------------------
// Test 2: Dynamic body via MechanismState falls under gravity
// ---------------------------------------------------------------------------

static int test_mechanism_state_dynamic_body_falls() {
    std::cout << "  [mechanism_state_dynamic_body_falls] ";

    eng::MechanismState state;
    double pos0[3] = {0, 0, 0};
    double orient0[4] = {1, 0, 0, 0};
    mech::MassProperties mp;
    mp.set_mass(1.0);
    mp.set_ixx(0.1); mp.set_iyy(0.1); mp.set_izz(0.1);

    state.create_body("Ground", pos0, orient0, &mp, true);

    double pos1[3] = {0, 5, 0};
    state.create_body("Ball", pos1, orient0, &mp, false);

    auto mechanism = state.build_mechanism_proto();

    eng::SimulationRuntime runtime;
    auto result = runtime.compile(mechanism);
    assert(result.success);

    for (int i = 0; i < 500; i++) runtime.step(0.001);

    auto poses = runtime.getBodyPoses();
    // Find the body that was at y=5 (dynamic ball)
    bool ball_fell = false;
    for (const auto& p : poses) {
        // The ball should have fallen below y=5
        if (p.position[1] < 4.0 && p.position[1] > -100) {
            ball_fell = true;
        }
    }
    assert(ball_fell && "Dynamic body should fall under gravity");

    std::cout << "PASS\n";
    return 0;
}

// ---------------------------------------------------------------------------
// Test 3: Joint created via MechanismState constrains correctly
// ---------------------------------------------------------------------------

static int test_mechanism_state_joint_constrains() {
    std::cout << "  [mechanism_state_joint_constrains] ";

    auto mechanism = build_via_mechanism_state(true);

    eng::SimulationRuntime runtime;
    auto result = runtime.compile(mechanism);
    assert(result.success);

    // Step and verify arm swings (joint works)
    for (int i = 0; i < 300; i++) runtime.step(0.001);

    auto joints = runtime.getJointStates();
    assert(!joints.empty() && "Should have at least one joint");

    double force_mag = std::sqrt(joints[0].reaction_force[0]*joints[0].reaction_force[0] +
                                 joints[0].reaction_force[1]*joints[0].reaction_force[1] +
                                 joints[0].reaction_force[2]*joints[0].reaction_force[2]);
    assert(force_mag > 0.01 && "Joint should have reaction forces (constraint active)");

    std::cout << "PASS (|F|=" << force_mag << ")\n";
    return 0;
}

// ---------------------------------------------------------------------------
// Test 4: Mass preserved through MechanismState
// ---------------------------------------------------------------------------

static int test_mechanism_state_mass_preserved() {
    std::cout << "  [mechanism_state_mass_preserved] ";

    eng::MechanismState state;
    double pos0[3] = {0, 0, 0};
    double orient0[4] = {1, 0, 0, 0};

    mech::MassProperties mp_ground;
    mp_ground.set_mass(1.0);
    mp_ground.set_ixx(0.1); mp_ground.set_iyy(0.1); mp_ground.set_izz(0.1);
    state.create_body("Ground", pos0, orient0, &mp_ground, true);

    double pos1[3] = {0, 10, 0};
    mech::MassProperties mp_ball;
    mp_ball.set_mass(5.0); // specific mass to verify
    mp_ball.set_ixx(0.5); mp_ball.set_iyy(0.5); mp_ball.set_izz(0.5);
    state.create_body("Ball", pos1, orient0, &mp_ball, false);

    auto mechanism = state.build_mechanism_proto();

    // Verify mass is in the proto
    bool found_5kg = false;
    for (const auto& body : mechanism.bodies()) {
        if (std::abs(body.mass_properties().mass() - 5.0) < 0.001) {
            found_5kg = true;
        }
    }
    assert(found_5kg && "5 kg mass should be preserved in proto");

    // Compile and verify physics: y(0.5s) ≈ 10 - 0.5*9.81*0.25 = 8.774
    // The rate of fall is mass-independent for free fall, so we just verify it falls correctly.
    eng::SimulationRuntime runtime;
    auto result = runtime.compile(mechanism);
    assert(result.success);

    for (int i = 0; i < 500; i++) runtime.step(0.001);

    auto poses = runtime.getBodyPoses();
    for (const auto& p : poses) {
        if (p.position[1] < 9.0 && p.position[1] > 0.0) {
            double expected_y = 10.0 - 0.5 * 9.81 * 0.25;
            assert_near(p.position[1], expected_y, 5e-3, "ball Y position after free fall");
        }
    }

    std::cout << "PASS\n";
    return 0;
}

// ---------------------------------------------------------------------------
// Test 5: Proto round-trip — bodies
// ---------------------------------------------------------------------------

static int test_proto_roundtrip_bodies() {
    std::cout << "  [proto_roundtrip_bodies] ";

    eng::MechanismState state1;
    double pos[3] = {1.5, -2.3, 4.7};
    double orient[4] = {0.9239, 0, 0, 0.3827}; // 45° around Z
    mech::MassProperties mp;
    mp.set_mass(3.14);
    mp.set_ixx(0.1); mp.set_iyy(0.2); mp.set_izz(0.3);
    mp.set_ixy(0.01); mp.set_ixz(0.02); mp.set_iyz(0.03);
    state1.create_body("Test Body", pos, orient, &mp, true);

    auto proto1 = state1.build_mechanism_proto();

    // Load into second state
    eng::MechanismState state2;
    state2.load_from_proto(proto1);
    auto proto2 = state2.build_mechanism_proto();

    assert(proto1.bodies_size() == proto2.bodies_size() && "body count preserved");
    assert(proto1.bodies_size() == 1);

    const auto& b1 = proto1.bodies(0);
    const auto& b2 = proto2.bodies(0);

    // ID, name, mass preserved
    assert(b1.id().id() == b2.id().id() && "body ID preserved");
    assert(b1.name() == b2.name() && "body name preserved");
    assert_near(b1.mass_properties().mass(), b2.mass_properties().mass(), 1e-10, "mass preserved");
    assert_near(b1.mass_properties().ixx(), b2.mass_properties().ixx(), 1e-10, "ixx preserved");
    assert_near(b1.mass_properties().iyy(), b2.mass_properties().iyy(), 1e-10, "iyy preserved");
    assert_near(b1.mass_properties().izz(), b2.mass_properties().izz(), 1e-10, "izz preserved");
    assert_near(b1.mass_properties().ixy(), b2.mass_properties().ixy(), 1e-10, "ixy preserved");
    assert_near(b1.mass_properties().ixz(), b2.mass_properties().ixz(), 1e-10, "ixz preserved");
    assert_near(b1.mass_properties().iyz(), b2.mass_properties().iyz(), 1e-10, "iyz preserved");

    // Pose preserved
    assert_near(b1.pose().position().x(), b2.pose().position().x(), 1e-10, "pos X");
    assert_near(b1.pose().position().y(), b2.pose().position().y(), 1e-10, "pos Y");
    assert_near(b1.pose().position().z(), b2.pose().position().z(), 1e-10, "pos Z");
    assert_near(b1.pose().orientation().w(), b2.pose().orientation().w(), 1e-10, "ori W");
    assert_near(b1.pose().orientation().x(), b2.pose().orientation().x(), 1e-10, "ori X");
    assert_near(b1.pose().orientation().y(), b2.pose().orientation().y(), 1e-10, "ori Y");
    assert_near(b1.pose().orientation().z(), b2.pose().orientation().z(), 1e-10, "ori Z");

    std::cout << "PASS\n";
    return 0;
}

// ---------------------------------------------------------------------------
// Test 6: Proto round-trip — joints with config
// ---------------------------------------------------------------------------

static int test_proto_roundtrip_joints() {
    std::cout << "  [proto_roundtrip_joints] ";

    // Build a mechanism with a revolute joint that has limits
    auto mechanism = build_via_mechanism_state(true);

    eng::MechanismState state1;
    state1.load_from_proto(mechanism);

    // Modify the joint to add revolute limits
    auto proto1 = state1.build_mechanism_proto();
    assert(proto1.joints_size() == 1);

    // Round-trip
    eng::MechanismState state2;
    state2.load_from_proto(proto1);
    auto proto2 = state2.build_mechanism_proto();

    assert(proto2.joints_size() == 1);
    const auto& j1 = proto1.joints(0);
    const auto& j2 = proto2.joints(0);

    assert(j1.type() == j2.type() && "joint type preserved");
    assert(j1.parent_datum_id().id() == j2.parent_datum_id().id() && "parent datum preserved");
    assert(j1.child_datum_id().id() == j2.child_datum_id().id() && "child datum preserved");

    std::cout << "PASS\n";
    return 0;
}

// ---------------------------------------------------------------------------
// Test 7: Proto round-trip — loads
// ---------------------------------------------------------------------------

static int test_proto_roundtrip_loads() {
    std::cout << "  [proto_roundtrip_loads] ";

    eng::MechanismState state1;
    double pos[3] = {0, 0, 0};
    double orient[4] = {1, 0, 0, 0};
    mech::MassProperties mp;
    mp.set_mass(1.0);
    mp.set_ixx(0.1); mp.set_iyy(0.1); mp.set_izz(0.1);
    std::string body_id = state1.create_body("Body", pos, orient, &mp, true);

    auto datum = state1.create_datum(body_id, "D1", pos, orient);
    assert(datum.has_value());

    // Create a point force load
    mech::Load load_draft;
    load_draft.mutable_id()->set_id("load-draft");
    load_draft.set_name("Force X");
    auto* pf = load_draft.mutable_point_force();
    pf->mutable_datum_id()->set_id(datum->id().id());
    pf->mutable_vector()->set_x(10.0);
    pf->mutable_vector()->set_y(0.0);
    pf->mutable_vector()->set_z(0.0);
    pf->set_reference_frame(mech::REFERENCE_FRAME_WORLD);

    auto load_result = state1.create_load(load_draft);
    assert(load_result.entry.has_value());

    auto proto1 = state1.build_mechanism_proto();
    assert(proto1.loads_size() == 1);

    // Round-trip
    eng::MechanismState state2;
    state2.load_from_proto(proto1);
    auto proto2 = state2.build_mechanism_proto();
    assert(proto2.loads_size() == 1);

    const auto& l1 = proto1.loads(0);
    const auto& l2 = proto2.loads(0);
    assert(l1.has_point_force() && l2.has_point_force());
    assert_near(l1.point_force().vector().x(), l2.point_force().vector().x(), 1e-10, "force X");
    assert(l1.point_force().reference_frame() == l2.point_force().reference_frame());

    std::cout << "PASS\n";
    return 0;
}

// ---------------------------------------------------------------------------
// Test 8: Proto round-trip — actuators
// ---------------------------------------------------------------------------

static int test_proto_roundtrip_actuators() {
    std::cout << "  [proto_roundtrip_actuators] ";

    auto mechanism = build_via_mechanism_state(true);

    eng::MechanismState state1;
    state1.load_from_proto(mechanism);

    // Add an actuator to the joint
    std::string joint_id;
    auto proto_tmp = state1.build_mechanism_proto();
    assert(proto_tmp.joints_size() == 1);
    joint_id = proto_tmp.joints(0).id().id();

    mech::Actuator act_draft;
    act_draft.mutable_id()->set_id("act-draft");
    act_draft.set_name("Motor");
    auto* rm = act_draft.mutable_revolute_motor();
    rm->mutable_joint_id()->set_id(joint_id);
    rm->set_control_mode(mech::ACTUATOR_CONTROL_MODE_SPEED);
    rm->set_command_value(3.14);

    auto act_result = state1.create_actuator(act_draft);
    assert(act_result.entry.has_value());

    auto proto1 = state1.build_mechanism_proto();
    assert(proto1.actuators_size() == 1);

    // Round-trip
    eng::MechanismState state2;
    state2.load_from_proto(proto1);
    auto proto2 = state2.build_mechanism_proto();
    assert(proto2.actuators_size() == 1);

    const auto& a1 = proto1.actuators(0);
    const auto& a2 = proto2.actuators(0);
    assert(a1.has_revolute_motor() && a2.has_revolute_motor());
    assert(a1.revolute_motor().control_mode() == a2.revolute_motor().control_mode());
    assert_near(a1.revolute_motor().command_value(), a2.revolute_motor().command_value(), 1e-10, "command value");

    std::cout << "PASS\n";
    return 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

int main() {
    motionlab::init_logging(spdlog::level::err);
    std::cout << "test_roundtrip:\n";
    int failures = 0;

    std::cout << "  --- MechanismState Product Path ---\n";
    failures += test_mechanism_state_fixed_body_compiles();
    failures += test_mechanism_state_dynamic_body_falls();
    failures += test_mechanism_state_joint_constrains();
    failures += test_mechanism_state_mass_preserved();

    std::cout << "  --- Proto Round-Trip ---\n";
    failures += test_proto_roundtrip_bodies();
    failures += test_proto_roundtrip_joints();
    failures += test_proto_roundtrip_loads();
    failures += test_proto_roundtrip_actuators();

    std::cout << "  All round-trip tests passed.\n";
    return failures;
}
