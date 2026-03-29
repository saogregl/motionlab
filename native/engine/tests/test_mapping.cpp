// ---------------------------------------------------------------------------
// Mapping correctness tests — verifies that the engine's proto-to-Chrono
// mapping produces mechanisms that behave according to the authored intent.
//
// Each test builds a mechanism proto, compiles it, steps the simulation,
// and checks behavioral invariants (constrained DOFs stay fixed, free DOFs
// move correctly, motors track commands, loads accelerate as expected).
// ---------------------------------------------------------------------------

#include "engine/log.h"

#include <cassert>
#include <cmath>
#include <iostream>
#include <string>

#include "../src/simulation.h"
#include "mechanism/mechanism.pb.h"
#include "test_helpers.h"

namespace mech = motionlab::mechanism;
namespace eng = motionlab::engine;

// Tolerances
static constexpr double POS_TOL = 1e-3;       // position (m)
static constexpr double VEL_TOL = 5e-2;       // velocity (m/s or rad/s)
static constexpr double CONSTRAINT_TOL = 1e-4; // constraint drift (m)
static constexpr double ANGLE_TOL = 5e-2;      // joint angle (rad)

// ===================================================================
// BODY MAPPING
// ===================================================================

static int test_body_position() {
    std::cout << "  [body_position] ";
    auto m = MechanismBuilder("body-pos")
        .addFixedBody("ground", 3.0, 5.0, 7.0)
        .build();

    auto sr = run_sim(m, 0.001, 10);
    const auto& g = find_body(sr.poses, "ground");
    assert_near(g.position[0], 3.0, 1e-10, "ground X");
    assert_near(g.position[1], 5.0, 1e-10, "ground Y");
    assert_near(g.position[2], 7.0, 1e-10, "ground Z");

    std::cout << "PASS\n";
    return 0;
}

static int test_body_orientation() {
    std::cout << "  [body_orientation] ";
    // Fixed body with 45° rotation around Z
    auto q = make_quat(0, 0, 1, PI / 4);
    auto m = MechanismBuilder("body-ori")
        .addFixedBody("ground")
        .build();
    // Modify orientation directly on the proto
    auto mod = m;
    auto* body = mod.mutable_bodies(0);
    body->mutable_pose()->mutable_orientation()->set_w(q.q[0]);
    body->mutable_pose()->mutable_orientation()->set_x(q.q[1]);
    body->mutable_pose()->mutable_orientation()->set_y(q.q[2]);
    body->mutable_pose()->mutable_orientation()->set_z(q.q[3]);

    auto sr = run_sim(mod, 0.001, 10);
    const auto& g = find_body(sr.poses, "ground");
    assert_quat_near(g.orientation, q.q, 1e-10, "ground orientation should match authored");

    std::cout << "PASS\n";
    return 0;
}

static int test_body_mass_gravity() {
    std::cout << "  [body_mass_gravity] ";
    // 2 kg body at y=10, no joints, free fall under gravity (0, -9.81, 0)
    // After 0.5s: y ≈ 10 - 0.5*9.81*0.25 = 10 - 1.22625 = 8.77375
    auto m = MechanismBuilder("mass-grav")
        .addFixedBody("ground")
        .addBody("ball", 2.0, 0, 10, 0)
        .build();

    double dt = 0.001;
    int steps = 500; // 0.5s
    auto sr = run_sim(m, dt, steps);
    const auto& ball = find_body(sr.poses, "ball");

    double t = dt * steps;
    double expected_y = 10.0 - 0.5 * 9.81 * t * t;
    assert_near(ball.position[1], expected_y, 5e-3, "free-fall Y position");
    assert_near(ball.position[0], 0.0, POS_TOL, "free-fall X should stay zero");
    assert_near(ball.position[2], 0.0, POS_TOL, "free-fall Z should stay zero");

    std::cout << "PASS (y=" << ball.position[1] << ", expected=" << expected_y << ")\n";
    return 0;
}

static int test_body_inertia_torque() {
    std::cout << "  [body_inertia_torque] ";
    // Body with Izz=0.5 kg·m², torque 2.0 N·m around Z.
    // α = τ/I = 2.0/0.5 = 4.0 rad/s²
    // After 0.2s: ω ≈ 4.0 * 0.2 = 0.8 rad/s
    // Angle ≈ 0.5 * 4.0 * 0.04 = 0.08 rad
    auto m = MechanismBuilder("inertia-torque")
        .addFixedBody("ground")
        .addBody("spinner", 1.0, 0, 0, 0)
            .withInertia(0.5, 0.5, 0.5)
        // Datum at body center for torque application
        .addDatum("d-spin", "spinner", 0, 0, 0)
        .addPointTorque("torque-z", "d-spin", 0, 0, 2.0) // 2 N·m around Z
        .build();

    // Disable gravity for clean test
    eng::SimulationConfig config;
    config.gravity[0] = 0; config.gravity[1] = 0; config.gravity[2] = 0;

    double dt = 0.001;
    int steps = 200; // 0.2s
    auto sr = run_sim(m, dt, steps, config);
    const auto& spinner = find_body(sr.poses, "spinner");

    // Check that the body has rotated around Z:
    // Quaternion should show rotation around Z axis.
    // For small angles, orientation ≈ (cos(θ/2), 0, 0, sin(θ/2))
    double alpha = 2.0 / 0.5; // τ/I = 4 rad/s²
    double t = dt * steps;
    double expected_angle = 0.5 * alpha * t * t; // ≈ 0.08 rad

    // Extract rotation angle from quaternion (rotation around Z for axis-aligned case)
    double angle = 2.0 * std::acos(std::min(1.0, std::abs(spinner.orientation[0])));
    assert_near(angle, expected_angle, ANGLE_TOL, "rotation angle from torque");

    std::cout << "PASS (angle=" << angle << " rad, expected=" << expected_angle << ")\n";
    return 0;
}

// ===================================================================
// JOINT MAPPING — DEFAULT AXIS (Z)
// ===================================================================

static int test_revolute_constrains_xy() {
    std::cout << "  [revolute_constrains_xy] ";
    // Ground + pendulum arm with revolute joint at origin.
    // Joint axis = Z (default). Under gravity (-Y), body swings in XY plane.
    // Pivot point (datum) should stay at its world position.
    // Body Z coordinate should stay constant.
    auto m = MechanismBuilder("rev-xy")
        .addFixedBody("ground")
        .addBody("arm", 1.0, 1, 0, 0)
        .addDatum("d-g", "ground", 0, 0, 0)
        .addDatum("d-a", "arm", -1, 0, 0) // datum at left end of arm, coincident with ground datum
        .addRevoluteJoint("pivot", "d-g", "d-a")
        .build();

    auto frames = run_trajectory(m, 0.001, 500);

    for (const auto& frame : frames) {
        const auto& arm = find_body(frame.poses, "arm");
        // Z should stay zero (motion confined to XY plane)
        assert_near(arm.position[2], 0.0, CONSTRAINT_TOL, "revolute: Z must stay zero");
    }

    // Verify body actually moved (not stuck)
    const auto& final_arm = find_body(frames.back().poses, "arm");
    assert(std::abs(final_arm.position[1]) > 0.01 && "arm should swing under gravity");

    std::cout << "PASS\n";
    return 0;
}

static int test_revolute_reaction_nonzero() {
    std::cout << "  [revolute_reaction_nonzero] ";
    auto m = MechanismBuilder("rev-react")
        .addFixedBody("ground")
        .addBody("arm", 1.0, 1, 0, 0)
        .addDatum("d-g", "ground", 0, 0, 0)
        .addDatum("d-a", "arm", -1, 0, 0)
        .addRevoluteJoint("pivot", "d-g", "d-a")
        .build();

    auto sr = run_sim(m, 0.001, 100);
    const auto& j = find_joint(sr.joints, "pivot");
    double mag = std::sqrt(j.reaction_force[0]*j.reaction_force[0] +
                           j.reaction_force[1]*j.reaction_force[1] +
                           j.reaction_force[2]*j.reaction_force[2]);
    assert(mag > 0.1 && "revolute joint should have nonzero reaction forces under gravity");

    std::cout << "PASS (|F|=" << mag << ")\n";
    return 0;
}

static int test_prismatic_constrains_to_z() {
    std::cout << "  [prismatic_constrains_to_z] ";
    // Prismatic joint along Z (default axis). Gravity in -Y.
    // Body should only slide along Z. X, Y should stay constant.
    // But gravity is perpendicular to Z → body shouldn't move at all
    // (prismatic constrains to Z-translation only, gravity acts in -Y
    //  which is a constrained direction → body stays put, reaction absorbs gravity).
    auto m = MechanismBuilder("pris-z")
        .addFixedBody("ground")
        .addBody("slider", 1.0, 0, 0, 1)
        .addDatum("d-g", "ground", 0, 0, 0)
        .addDatum("d-s", "slider", 0, 0, -1) // coincident
        .addPrismaticJoint("slide", "d-g", "d-s")
        .build();

    auto frames = run_trajectory(m, 0.001, 300);

    for (const auto& frame : frames) {
        const auto& s = find_body(frame.poses, "slider");
        // X and Y should stay at initial values
        assert_near(s.position[0], 0.0, CONSTRAINT_TOL, "prismatic: X constrained");
        assert_near(s.position[1], 0.0, CONSTRAINT_TOL, "prismatic: Y constrained");
    }

    std::cout << "PASS\n";
    return 0;
}

static int test_prismatic_free_slide() {
    std::cout << "  [prismatic_free_slide] ";
    // Prismatic joint along Z, gravity in -Z direction.
    // Body should slide in Z: z(t) = z0 - 0.5*g*t²
    auto m = MechanismBuilder("pris-slide")
        .addFixedBody("ground")
        .addBody("slider", 1.0, 0, 0, 2)
        .addDatum("d-g", "ground", 0, 0, 0)
        .addDatum("d-s", "slider", 0, 0, -2) // coincident at origin
        .addPrismaticJoint("slide", "d-g", "d-s")
        .build();

    eng::SimulationConfig config;
    config.gravity[0] = 0; config.gravity[1] = 0; config.gravity[2] = -9.81;

    double dt = 0.001;
    int steps = 500;
    auto sr = run_sim(m, dt, steps, config);
    const auto& s = find_body(sr.poses, "slider");

    double t = dt * steps;
    double expected_z = 2.0 - 0.5 * 9.81 * t * t;
    assert_near(s.position[2], expected_z, 5e-3, "prismatic free-slide Z");
    assert_near(s.position[0], 0.0, CONSTRAINT_TOL, "prismatic: X stays zero");
    assert_near(s.position[1], 0.0, CONSTRAINT_TOL, "prismatic: Y stays zero");

    std::cout << "PASS (z=" << s.position[2] << ", expected=" << expected_z << ")\n";
    return 0;
}

static int test_prismatic_with_limits() {
    std::cout << "  [prismatic_with_limits] ";
    // Prismatic along Z with limits [0, 0.5]. Gravity in -Z.
    // Slider starts at z=0.5 (upper limit). It should slide down to z=0 (lower limit) and stop.
    auto m = MechanismBuilder("pris-lim")
        .addFixedBody("ground")
        .addBody("slider", 1.0, 0, 0, 0.5)
        .addDatum("d-g", "ground", 0, 0, 0)
        .addDatum("d-s", "slider", 0, 0, -0.5) // coincident at origin
        .addPrismaticJoint("slide", "d-g", "d-s")
            .withPrismaticLimits(0.0, 0.5)
        .build();

    eng::SimulationConfig config;
    config.gravity[0] = 0; config.gravity[1] = 0; config.gravity[2] = -9.81;

    auto sr = run_sim(m, 0.001, 2000, config); // 2 seconds
    const auto& s = find_body(sr.poses, "slider");

    // Body should be near the lower limit (z ≈ 0) or above, not below
    assert(s.position[2] >= -CONSTRAINT_TOL && "slider should not pass below lower limit");

    std::cout << "PASS (z=" << s.position[2] << ")\n";
    return 0;
}

static int test_fixed_no_relative_motion() {
    std::cout << "  [fixed_no_relative_motion] ";
    // Two dynamic bodies connected by fixed joint. Under gravity, they should
    // fall together with constant relative pose.
    auto m = MechanismBuilder("fixed")
        .addFixedBody("ground")
        .addBody("a", 1.0, 0, 5, 0)
        .addBody("b", 1.0, 1, 5, 0)
        .addDatum("d-a", "a", 0.5, 0, 0)
        .addDatum("d-b", "b", -0.5, 0, 0)
        .addFixedJoint("fix", "d-a", "d-b")
        .build();

    // No gravity constraint between a,b and ground — they fall freely together
    eng::SimulationConfig config;
    auto frames = run_trajectory(m, 0.001, 300, config);

    // Relative position between a and b should stay constant
    double initial_dx = 1.0; // b.x - a.x = 1 - 0 = 1
    double initial_dy = 0.0; // same Y
    double initial_dz = 0.0;

    for (const auto& frame : frames) {
        const auto& a = find_body(frame.poses, "a");
        const auto& b = find_body(frame.poses, "b");
        double dx = b.position[0] - a.position[0];
        double dy = b.position[1] - a.position[1];
        double dz = b.position[2] - a.position[2];
        assert_near(dx, initial_dx, CONSTRAINT_TOL, "fixed: relative X");
        assert_near(dy, initial_dy, CONSTRAINT_TOL, "fixed: relative Y");
        assert_near(dz, initial_dz, CONSTRAINT_TOL, "fixed: relative Z");
    }

    std::cout << "PASS\n";
    return 0;
}

static int test_spherical_no_translation() {
    std::cout << "  [spherical_no_translation] ";
    // Spherical joint: body can rotate freely but distance from anchor stays constant.
    auto m = MechanismBuilder("spher")
        .addFixedBody("ground")
        .addBody("ball", 1.0, 1, 0, 0)
            .withInertia(0.01, 0.01, 0.01)
        .addDatum("d-g", "ground", 0, 0, 0)
        .addDatum("d-b", "ball", -1, 0, 0)  // coincident at origin
        .addJoint("sj", mech::JOINT_TYPE_SPHERICAL, "d-g", "d-b")
        .build();

    auto frames = run_trajectory(m, 0.001, 500);

    for (const auto& frame : frames) {
        const auto& ball = find_body(frame.poses, "ball");
        // Distance from origin to ball center should be ~1.0
        // (ball is at (1,0,0) with datum at (-1,0,0), so pivot is at origin,
        //  and ball center is always 1.0 from pivot)
        double dist = std::sqrt(ball.position[0]*ball.position[0] +
                                ball.position[1]*ball.position[1] +
                                ball.position[2]*ball.position[2]);
        assert_near(dist, 1.0, CONSTRAINT_TOL, "spherical: distance from anchor");
    }

    std::cout << "PASS\n";
    return 0;
}

static int test_cylindrical_z_only() {
    std::cout << "  [cylindrical_z_only] ";
    // Cylindrical joint: body can rotate and translate along Z, but X,Y constrained.
    auto m = MechanismBuilder("cyl")
        .addFixedBody("ground")
        .addBody("piston", 1.0, 0, 0, 1)
        .addDatum("d-g", "ground", 0, 0, 0)
        .addDatum("d-p", "piston", 0, 0, -1) // coincident
        .addJoint("cj", mech::JOINT_TYPE_CYLINDRICAL, "d-g", "d-p")
        .build();

    eng::SimulationConfig config;
    config.gravity[0] = 0; config.gravity[1] = 0; config.gravity[2] = -9.81;

    auto frames = run_trajectory(m, 0.001, 300, config);

    for (const auto& frame : frames) {
        const auto& p = find_body(frame.poses, "piston");
        assert_near(p.position[0], 0.0, CONSTRAINT_TOL, "cylindrical: X constrained");
        assert_near(p.position[1], 0.0, CONSTRAINT_TOL, "cylindrical: Y constrained");
    }

    // Z should have moved (sliding under gravity along Z)
    const auto& final_p = find_body(frames.back().poses, "piston");
    assert(final_p.position[2] < 1.0 - 0.01 && "cylindrical: body should slide in Z");

    std::cout << "PASS\n";
    return 0;
}

static int test_distance_maintained() {
    std::cout << "  [distance_maintained] ";
    // Distance joint: maintains fixed distance between two points.
    auto m = MechanismBuilder("dist")
        .addFixedBody("ground")
        .addBody("bob", 1.0, 1, 0, 0)
            .withInertia(0.01, 0.01, 0.01)
        .addDatum("d-g", "ground", 0, 0, 0)
        .addDatum("d-b", "bob", 0, 0, 0)  // at bob center
        .addJoint("dj", mech::JOINT_TYPE_DISTANCE, "d-g", "d-b")
        .build();

    auto frames = run_trajectory(m, 0.001, 500);

    for (const auto& frame : frames) {
        const auto& bob = find_body(frame.poses, "bob");
        double dist = std::sqrt(bob.position[0]*bob.position[0] +
                                bob.position[1]*bob.position[1] +
                                bob.position[2]*bob.position[2]);
        // Distance from ground datum (origin) to bob datum (bob center) should stay ≈ 1.0
        assert_near(dist, 1.0, CONSTRAINT_TOL, "distance joint: dist maintained");
    }

    std::cout << "PASS\n";
    return 0;
}

static int test_planar_normal_constrained() {
    std::cout << "  [planar_normal_constrained] ";
    // Planar joint with default Z axis: body should stay at constant Z (the normal direction).
    // Motion in X, Y (and rotation around Z) is free.
    auto m = MechanismBuilder("planar")
        .addFixedBody("ground")
        .addBody("plate", 1.0, 1, 0, 0)
            .withInertia(0.1, 0.1, 0.1)
        .addDatum("d-g", "ground", 0, 0, 0)
        .addDatum("d-p", "plate", -1, 0, 0) // coincident at origin
        .addJoint("pj", mech::JOINT_TYPE_PLANAR, "d-g", "d-p")
        .build();

    auto frames = run_trajectory(m, 0.001, 300);

    for (const auto& frame : frames) {
        const auto& p = find_body(frame.poses, "plate");
        // Z of the plate should stay at initial value (0 for the datum-connected point)
        // Since body center is at (1,0,0) and datum is at (-1,0,0), the constrained
        // point is at world origin. The body center's Z should stay 0.
        assert_near(p.position[2], 0.0, CONSTRAINT_TOL, "planar: Z (normal) constrained");
    }

    std::cout << "PASS\n";
    return 0;
}

// ===================================================================
// JOINT MAPPING — ROTATED DATUM AXIS
// ===================================================================

static int test_revolute_rotated_x_axis() {
    std::cout << "  [revolute_rotated_x_axis] ";
    // Datum rotated 90° around Y so that local Z → world X.
    // Revolute joint should constrain rotation around world X axis.
    // Under gravity (-Y), body should swing in YZ plane, X stays constant.
    auto q = make_quat(0, 1, 0, PI / 2); // 90° around Y: local Z → world X

    auto m = MechanismBuilder("rev-rotx")
        .addFixedBody("ground")
        .addBody("arm", 1.0, 0, 0, 1)
            .withInertia(0.01, 0.01, 0.01)
        .addDatumWithOrientation("d-g", "ground", 0, 0, 0, q.q[0], q.q[1], q.q[2], q.q[3])
        .addDatumWithOrientation("d-a", "arm", 0, 0, -1, q.q[0], q.q[1], q.q[2], q.q[3])
        .addRevoluteJoint("pivot", "d-g", "d-a")
        .build();

    auto frames = run_trajectory(m, 0.001, 500);

    for (const auto& frame : frames) {
        const auto& arm = find_body(frame.poses, "arm");
        // Rotation around X means body swings in YZ plane.
        // X position of arm center should stay constant.
        assert_near(arm.position[0], 0.0, CONSTRAINT_TOL, "revolute-X: X stays constant");
    }

    // Body should actually move (Y or Z changes)
    const auto& final_arm = find_body(frames.back().poses, "arm");
    double yz_move = std::abs(final_arm.position[1]) + std::abs(final_arm.position[2] - 1.0);
    assert(yz_move > 0.01 && "arm should swing in YZ plane");

    std::cout << "PASS\n";
    return 0;
}

static int test_revolute_rotated_y_axis() {
    std::cout << "  [revolute_rotated_y_axis] ";
    // Datum rotated 90° around X so that local Z → world Y.
    // Revolute around world Y. Under gravity (-Y), this is rotation around gravity direction.
    // Need sideways initial offset to get motion.
    auto q = make_quat(1, 0, 0, PI / 2); // 90° around X: local Z → world Y

    auto m = MechanismBuilder("rev-roty")
        .addFixedBody("ground")
        .addBody("arm", 1.0, 1, 0, 0) // offset in X
            .withInertia(0.01, 0.01, 0.01)
        .addDatumWithOrientation("d-g", "ground", 0, 0, 0, q.q[0], q.q[1], q.q[2], q.q[3])
        .addDatumWithOrientation("d-a", "arm", -1, 0, 0, q.q[0], q.q[1], q.q[2], q.q[3])
        .addRevoluteJoint("pivot", "d-g", "d-a")
        .build();

    // Gravity in -Y means no torque around Y axis (gravity along rotation axis).
    // Apply small -X gravity instead to get motion in the XZ plane.
    eng::SimulationConfig config;
    config.gravity[0] = -9.81; config.gravity[1] = 0; config.gravity[2] = 0;

    auto frames = run_trajectory(m, 0.001, 500, config);

    for (const auto& frame : frames) {
        const auto& arm = find_body(frame.poses, "arm");
        // Rotation around Y means Y should stay constant
        assert_near(arm.position[1], 0.0, CONSTRAINT_TOL, "revolute-Y: Y stays constant");
    }

    std::cout << "PASS\n";
    return 0;
}

static int test_prismatic_rotated_to_y() {
    std::cout << "  [prismatic_rotated_to_y] ";
    // Datum rotated so local Z → world Y (90° around X).
    // Prismatic should constrain sliding to world Y only.
    auto q = make_quat(1, 0, 0, PI / 2);

    auto m = MechanismBuilder("pris-y")
        .addFixedBody("ground")
        .addBody("slider", 1.0, 0, 2, 0)
        .addDatumWithOrientation("d-g", "ground", 0, 0, 0, q.q[0], q.q[1], q.q[2], q.q[3])
        .addDatumWithOrientation("d-s", "slider", 0, -2, 0, q.q[0], q.q[1], q.q[2], q.q[3])
        .addPrismaticJoint("slide", "d-g", "d-s")
        .build();

    // Gravity in -Y: aligned with the prismatic axis → body slides in Y
    auto frames = run_trajectory(m, 0.001, 300);

    for (const auto& frame : frames) {
        const auto& s = find_body(frame.poses, "slider");
        assert_near(s.position[0], 0.0, CONSTRAINT_TOL, "prismatic-Y: X constrained");
        assert_near(s.position[2], 0.0, CONSTRAINT_TOL, "prismatic-Y: Z constrained");
    }

    // Body should have moved in Y (fallen under gravity)
    const auto& final_s = find_body(frames.back().poses, "slider");
    assert(final_s.position[1] < 2.0 - 0.01 && "slider should fall in Y direction");

    std::cout << "PASS (y=" << final_s.position[1] << ")\n";
    return 0;
}

static int test_prismatic_rotated_to_x() {
    std::cout << "  [prismatic_rotated_to_x] ";
    // Datum rotated so local Z → world X (90° around Y).
    // Gravity in -X → body slides in X.
    auto q = make_quat(0, 1, 0, PI / 2);

    auto m = MechanismBuilder("pris-x")
        .addFixedBody("ground")
        .addBody("slider", 1.0, 2, 0, 0)
        .addDatumWithOrientation("d-g", "ground", 0, 0, 0, q.q[0], q.q[1], q.q[2], q.q[3])
        .addDatumWithOrientation("d-s", "slider", -2, 0, 0, q.q[0], q.q[1], q.q[2], q.q[3])
        .addPrismaticJoint("slide", "d-g", "d-s")
        .build();

    eng::SimulationConfig config;
    config.gravity[0] = -9.81; config.gravity[1] = 0; config.gravity[2] = 0;

    auto frames = run_trajectory(m, 0.001, 300, config);

    for (const auto& frame : frames) {
        const auto& s = find_body(frame.poses, "slider");
        assert_near(s.position[1], 0.0, CONSTRAINT_TOL, "prismatic-X: Y constrained");
        assert_near(s.position[2], 0.0, CONSTRAINT_TOL, "prismatic-X: Z constrained");
    }

    const auto& final_s = find_body(frames.back().poses, "slider");
    assert(final_s.position[0] < 2.0 - 0.01 && "slider should move in -X");

    std::cout << "PASS (x=" << final_s.position[0] << ")\n";
    return 0;
}

// ===================================================================
// MOTOR / ACTUATOR MAPPING
// ===================================================================

static int test_motor_revolute_speed() {
    std::cout << "  [motor_revolute_speed] ";
    // Revolute motor with speed command = 2.0 rad/s
    // After settling, joint velocity should track command.
    auto m = MechanismBuilder("motor-rev-spd")
        .addFixedBody("ground")
        .addBody("arm", 1.0, 1, 0, 0)
            .withInertia(0.1, 0.1, 0.1)
        .addDatum("d-g", "ground", 0, 0, 0)
        .addDatum("d-a", "arm", -1, 0, 0)
        .addRevoluteJoint("pivot", "d-g", "d-a")
        .addRevoluteMotor("motor", "pivot", mech::ACTUATOR_CONTROL_MODE_SPEED, 2.0)
        .build();

    eng::SimulationConfig config;
    config.gravity[0] = 0; config.gravity[1] = 0; config.gravity[2] = 0;

    auto sr = run_sim(m, 0.001, 500, config);
    const auto& j = find_joint(sr.joints, "pivot");
    assert_near(j.velocity, 2.0, VEL_TOL, "revolute motor speed");

    std::cout << "PASS (vel=" << j.velocity << ")\n";
    return 0;
}

static int test_motor_revolute_position() {
    std::cout << "  [motor_revolute_position] ";
    // Revolute motor with position command = π/4
    auto m = MechanismBuilder("motor-rev-pos")
        .addFixedBody("ground")
        .addBody("arm", 1.0, 1, 0, 0)
            .withInertia(0.1, 0.1, 0.1)
        .addDatum("d-g", "ground", 0, 0, 0)
        .addDatum("d-a", "arm", -1, 0, 0)
        .addRevoluteJoint("pivot", "d-g", "d-a")
        .addRevoluteMotor("motor", "pivot", mech::ACTUATOR_CONTROL_MODE_POSITION, PI / 4)
        .build();

    eng::SimulationConfig config;
    config.gravity[0] = 0; config.gravity[1] = 0; config.gravity[2] = 0;

    auto sr = run_sim(m, 0.001, 1000, config); // 1 second to converge
    const auto& j = find_joint(sr.joints, "pivot");
    assert_near(j.position, PI / 4, ANGLE_TOL, "revolute motor position");

    std::cout << "PASS (pos=" << j.position << ")\n";
    return 0;
}

static int test_motor_revolute_torque() {
    std::cout << "  [motor_revolute_torque] ";
    // Revolute motor with torque command = 5.0 N·m
    // Body inertia Izz = 0.5 → α = τ/I = 10 rad/s²
    // After 0.2s: ω ≈ 2.0 rad/s
    auto m = MechanismBuilder("motor-rev-torq")
        .addFixedBody("ground")
        .addBody("arm", 1.0, 0, 0, 0)
            .withInertia(0.5, 0.5, 0.5)
        .addDatum("d-g", "ground", 0, 0, 0)
        .addDatum("d-a", "arm", 0, 0, 0)
        .addRevoluteJoint("pivot", "d-g", "d-a")
        .addRevoluteMotor("motor", "pivot", mech::ACTUATOR_CONTROL_MODE_EFFORT, 5.0)
        .build();

    eng::SimulationConfig config;
    config.gravity[0] = 0; config.gravity[1] = 0; config.gravity[2] = 0;

    double dt = 0.001;
    int steps = 200; // 0.2s
    auto sr = run_sim(m, dt, steps, config);
    const auto& j = find_joint(sr.joints, "pivot");

    double expected_vel = (5.0 / 0.5) * (dt * steps); // α*t = 10 * 0.2 = 2.0
    assert_near(j.velocity, expected_vel, VEL_TOL, "revolute motor torque → velocity");

    std::cout << "PASS (vel=" << j.velocity << ", expected=" << expected_vel << ")\n";
    return 0;
}

static int test_motor_prismatic_speed() {
    std::cout << "  [motor_prismatic_speed] ";
    // Prismatic motor with speed command = 0.5 m/s
    auto m = MechanismBuilder("motor-pris-spd")
        .addFixedBody("ground")
        .addBody("slider", 1.0, 0, 0, 0)
        .addDatum("d-g", "ground", 0, 0, 0)
        .addDatum("d-s", "slider", 0, 0, 0)
        .addPrismaticJoint("slide", "d-g", "d-s")
        .addPrismaticMotor("motor", "slide", mech::ACTUATOR_CONTROL_MODE_SPEED, 0.5)
        .build();

    eng::SimulationConfig config;
    config.gravity[0] = 0; config.gravity[1] = 0; config.gravity[2] = 0;

    auto sr = run_sim(m, 0.001, 500, config);
    const auto& j = find_joint(sr.joints, "slide");
    assert_near(j.velocity, 0.5, VEL_TOL, "prismatic motor speed");

    std::cout << "PASS (vel=" << j.velocity << ")\n";
    return 0;
}

static int test_motor_prismatic_force() {
    std::cout << "  [motor_prismatic_force] ";
    // Prismatic motor with force = 10 N on 2 kg body → a = 5 m/s²
    // After 0.2s: v ≈ 1.0 m/s, displacement ≈ 0.1 m
    auto m = MechanismBuilder("motor-pris-force")
        .addFixedBody("ground")
        .addBody("slider", 2.0, 0, 0, 0)
        .addDatum("d-g", "ground", 0, 0, 0)
        .addDatum("d-s", "slider", 0, 0, 0)
        .addPrismaticJoint("slide", "d-g", "d-s")
        .addPrismaticMotor("motor", "slide", mech::ACTUATOR_CONTROL_MODE_EFFORT, 10.0)
        .build();

    eng::SimulationConfig config;
    config.gravity[0] = 0; config.gravity[1] = 0; config.gravity[2] = 0;

    double dt = 0.001;
    int steps = 200;
    auto sr = run_sim(m, dt, steps, config);
    const auto& j = find_joint(sr.joints, "slide");

    double t = dt * steps;
    double a = 10.0 / 2.0; // F/m
    double expected_vel = a * t; // 5.0 * 0.2 = 1.0
    assert_near(j.velocity, expected_vel, VEL_TOL, "prismatic motor force → velocity");

    std::cout << "PASS (vel=" << j.velocity << ", expected=" << expected_vel << ")\n";
    return 0;
}

// ===================================================================
// LOAD MAPPING
// ===================================================================

static int test_point_force_world_frame() {
    std::cout << "  [point_force_world_frame] ";
    // 10 N in +X (world frame) on a 2 kg body → a = 5 m/s² in X
    // Body initially rotated 90° around Z — force should STILL act in +X (world frame)
    auto q90z = make_quat(0, 0, 1, PI / 2);

    auto m = MechanismBuilder("force-world")
        .addFixedBody("ground")
        .addBodyWithOrientation("ball", 2.0, 0, 0, 0, q90z.q[0], q90z.q[1], q90z.q[2], q90z.q[3])
        .addDatum("d-ball", "ball", 0, 0, 0)
        .addPointForce("fx", "d-ball", 10, 0, 0, mech::REFERENCE_FRAME_WORLD)
        .build();

    eng::SimulationConfig config;
    config.gravity[0] = 0; config.gravity[1] = 0; config.gravity[2] = 0;

    double dt = 0.001;
    int steps = 200;
    auto sr = run_sim(m, dt, steps, config);
    const auto& ball = find_body(sr.poses, "ball");

    double t = dt * steps;
    double expected_x = 0.5 * (10.0 / 2.0) * t * t; // 0.5 * 5 * 0.04 = 0.1
    assert_near(ball.position[0], expected_x, POS_TOL, "world force: X displacement");
    assert_near(ball.position[1], 0.0, POS_TOL, "world force: Y stays zero");

    std::cout << "PASS (x=" << ball.position[0] << ", expected=" << expected_x << ")\n";
    return 0;
}

static int test_point_force_local_frame() {
    std::cout << "  [point_force_local_frame] ";
    // 10 N in +X (body-local frame) on a body rotated 90° around Z.
    // Body-local +X after 90° Z rotation = world +Y.
    // So the body should accelerate in +Y.
    auto q90z = make_quat(0, 0, 1, PI / 2);

    auto m = MechanismBuilder("force-local")
        .addFixedBody("ground")
        .addBodyWithOrientation("ball", 2.0, 0, 0, 0, q90z.q[0], q90z.q[1], q90z.q[2], q90z.q[3])
        .addDatum("d-ball", "ball", 0, 0, 0)
        .addPointForce("fx", "d-ball", 10, 0, 0, mech::REFERENCE_FRAME_DATUM_LOCAL)
        .build();

    eng::SimulationConfig config;
    config.gravity[0] = 0; config.gravity[1] = 0; config.gravity[2] = 0;

    double dt = 0.001;
    int steps = 200;
    auto sr = run_sim(m, dt, steps, config);
    const auto& ball = find_body(sr.poses, "ball");

    double t = dt * steps;
    // Initially force is in body-local +X = world +Y.
    // Point force at center doesn't cause rotation, so direction stays constant.
    (void)t;
    assert_near(ball.position[0], 0.0, POS_TOL, "local force: X should be ~zero (force is in body +X = world +Y)");
    assert(ball.position[1] > 0.01 && "local force: body should move in +Y (body-local X = world Y)");

    std::cout << "PASS (y=" << ball.position[1] << ")\n";
    return 0;
}

static int test_point_torque() {
    std::cout << "  [point_torque] ";
    // Torque 3.0 N·m around Z on unconstrained body with Izz = 0.3 kg·m²
    // α = 3.0/0.3 = 10 rad/s²
    // After 0.1s: ω = 1.0 rad/s, angle ≈ 0.05 rad
    auto m = MechanismBuilder("torque-z")
        .addFixedBody("ground")
        .addBody("top", 1.0, 0, 0, 0)
            .withInertia(0.3, 0.3, 0.3)
        .addDatum("d-top", "top", 0, 0, 0)
        .addPointTorque("tz", "d-top", 0, 0, 3.0)
        .build();

    eng::SimulationConfig config;
    config.gravity[0] = 0; config.gravity[1] = 0; config.gravity[2] = 0;

    double dt = 0.001;
    int steps = 100;
    auto sr = run_sim(m, dt, steps, config);
    const auto& top = find_body(sr.poses, "top");

    double t = dt * steps;
    double alpha = 3.0 / 0.3;
    double expected_angle = 0.5 * alpha * t * t; // 0.5 * 10 * 0.01 = 0.05

    double angle = 2.0 * std::acos(std::min(1.0, std::abs(top.orientation[0])));
    assert_near(angle, expected_angle, ANGLE_TOL, "torque rotation angle");

    std::cout << "PASS (angle=" << angle << ", expected=" << expected_angle << ")\n";
    return 0;
}

static int test_spring_damper_restoring() {
    std::cout << "  [spring_damper_restoring] ";
    // Spring-damper between ground and slider on prismatic joint.
    // k=100 N/m, c=1.0 (light damping), rest_length=1.0.
    // Slider at z=1.5 (spring stretched by 0.5) → should be pulled toward z=1.0 (equilibrium).
    // Verify: slider moves toward equilibrium within first 0.1s.
    auto m = MechanismBuilder("spring")
        .addFixedBody("ground")
        .addBody("slider", 1.0, 0, 0, 1.5)
        .addDatum("d-g", "ground", 0, 0, 0)
        .addDatum("d-s", "slider", 0, 0, -1.5) // coincident at origin
        .addDatum("d-g-spring", "ground", 0, 0, 0) // spring anchor
        .addDatum("d-s-spring", "slider", 0, 0, 0) // spring attachment at slider center
        .addPrismaticJoint("slide", "d-g", "d-s")
        .addSpringDamper("spring", "d-g-spring", "d-s-spring", 100.0, 1.0, 1.0)
        .build();

    eng::SimulationConfig config;
    config.gravity[0] = 0; config.gravity[1] = 0; config.gravity[2] = 0;

    // Run for 0.1s — slider should move toward equilibrium (z ≈ 1.0)
    auto frames = run_trajectory(m, 0.001, 100, config);

    // Initial position: z=1.5
    // After some time, slider should have moved closer to equilibrium (z < 1.5)
    const auto& mid = find_body(frames[49].poses, "slider");
    const auto& final_s = find_body(frames.back().poses, "slider");

    assert(mid.position[2] < 1.5 - 0.01 &&
           "spring: slider should move toward equilibrium (z decreases)");

    // X and Y should stay zero (prismatic constrains to Z)
    assert_near(final_s.position[0], 0.0, CONSTRAINT_TOL, "spring: X constrained");
    assert_near(final_s.position[1], 0.0, CONSTRAINT_TOL, "spring: Y constrained");

    std::cout << "PASS (z_mid=" << mid.position[2] << ", z_final=" << final_s.position[2] << ")\n";
    return 0;
}

// ===================================================================
// Main
// ===================================================================

int main() {
    motionlab::init_logging(spdlog::level::err);
    std::cout << "test_mapping:\n";
    int failures = 0;

    std::cout << "  --- Body Mapping ---\n";
    failures += test_body_position();
    failures += test_body_orientation();
    failures += test_body_mass_gravity();
    failures += test_body_inertia_torque();

    std::cout << "  --- Joint Mapping (Default Axis Z) ---\n";
    failures += test_revolute_constrains_xy();
    failures += test_revolute_reaction_nonzero();
    failures += test_prismatic_constrains_to_z();
    failures += test_prismatic_free_slide();
    failures += test_prismatic_with_limits();
    failures += test_fixed_no_relative_motion();
    failures += test_spherical_no_translation();
    failures += test_cylindrical_z_only();
    failures += test_distance_maintained();
    failures += test_planar_normal_constrained();

    std::cout << "  --- Joint Mapping (Rotated Datum) ---\n";
    failures += test_revolute_rotated_x_axis();
    failures += test_revolute_rotated_y_axis();
    failures += test_prismatic_rotated_to_y();
    failures += test_prismatic_rotated_to_x();

    std::cout << "  --- Motor/Actuator Mapping ---\n";
    failures += test_motor_revolute_speed();
    failures += test_motor_revolute_position();
    failures += test_motor_revolute_torque();
    failures += test_motor_prismatic_speed();
    failures += test_motor_prismatic_force();

    std::cout << "  --- Load Mapping ---\n";
    failures += test_point_force_world_frame();
    failures += test_point_force_local_frame();
    failures += test_point_torque();
    failures += test_spring_damper_restoring();

    std::cout << "  All mapping tests passed.\n";
    return failures;
}
