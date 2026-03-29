// ---------------------------------------------------------------------------
// Pose math unit tests — verifies frame composition, quaternion rotation,
// and inverse operations in isolation (no Chrono dependency).
// ---------------------------------------------------------------------------

#include <cassert>
#include <cmath>
#include <iostream>

#include "../src/pose_math.h"
#include "test_helpers.h"

namespace pm = motionlab::engine;

static constexpr double TOL = 1e-10;

// ---------------------------------------------------------------------------
// quat_rotate_vec3 tests
// ---------------------------------------------------------------------------

static int test_quat_rotate_identity() {
    std::cout << "  [quat_rotate_identity] ";
    double q[4] = {1, 0, 0, 0};  // identity
    double v[3] = {3.0, -2.0, 7.0};
    double out[3];
    pm::quat_rotate_vec3(q, v, out);
    double expected[3] = {3.0, -2.0, 7.0};
    assert_vec3_near(out, expected, TOL, "identity rotation should leave vector unchanged");
    std::cout << "PASS\n";
    return 0;
}

static int test_quat_rotate_90z() {
    std::cout << "  [quat_rotate_90z] ";
    // 90 degrees around Z: (1,0,0) → (0,1,0)
    auto q = make_quat(0, 0, 1, PI / 2);
    double v[3] = {1, 0, 0};
    double out[3];
    pm::quat_rotate_vec3(q.q, v, out);
    double expected[3] = {0, 1, 0};
    assert_vec3_near(out, expected, TOL, "90° Z rotation: (1,0,0)→(0,1,0)");
    std::cout << "PASS\n";
    return 0;
}

static int test_quat_rotate_90x() {
    std::cout << "  [quat_rotate_90x] ";
    // 90 degrees around X: (0,1,0) → (0,0,1)
    auto q = make_quat(1, 0, 0, PI / 2);
    double v[3] = {0, 1, 0};
    double out[3];
    pm::quat_rotate_vec3(q.q, v, out);
    double expected[3] = {0, 0, 1};
    assert_vec3_near(out, expected, TOL, "90° X rotation: (0,1,0)→(0,0,1)");
    std::cout << "PASS\n";
    return 0;
}

static int test_quat_rotate_90y() {
    std::cout << "  [quat_rotate_90y] ";
    // 90 degrees around Y: (0,0,1) → (1,0,0)
    auto q = make_quat(0, 1, 0, PI / 2);
    double v[3] = {0, 0, 1};
    double out[3];
    pm::quat_rotate_vec3(q.q, v, out);
    double expected[3] = {1, 0, 0};
    assert_vec3_near(out, expected, TOL, "90° Y rotation: (0,0,1)→(1,0,0)");
    std::cout << "PASS\n";
    return 0;
}

static int test_quat_rotate_180z() {
    std::cout << "  [quat_rotate_180z] ";
    // 180 degrees around Z: (1,0,0) → (-1,0,0)
    auto q = make_quat(0, 0, 1, PI);
    double v[3] = {1, 0, 0};
    double out[3];
    pm::quat_rotate_vec3(q.q, v, out);
    double expected[3] = {-1, 0, 0};
    assert_vec3_near(out, expected, TOL, "180° Z rotation: (1,0,0)→(-1,0,0)");
    std::cout << "PASS\n";
    return 0;
}

// ---------------------------------------------------------------------------
// quat_multiply tests
// ---------------------------------------------------------------------------

static int test_quat_multiply_identity() {
    std::cout << "  [quat_multiply_identity] ";
    auto q = make_quat(1, 2, 3, 0.7);
    double id[4] = {1, 0, 0, 0};

    double out1[4], out2[4];
    pm::quat_multiply(q.q, id, out1);   // q * identity
    pm::quat_multiply(id, q.q, out2);   // identity * q

    assert_quat_near(out1, q.q, TOL, "q * identity = q");
    assert_quat_near(out2, q.q, TOL, "identity * q = q");
    std::cout << "PASS\n";
    return 0;
}

static int test_quat_multiply_sequence() {
    std::cout << "  [quat_multiply_sequence] ";
    // 90° Z then 90° Z = 180° Z
    auto q90 = make_quat(0, 0, 1, PI / 2);
    auto q180 = make_quat(0, 0, 1, PI);

    double out[4];
    pm::quat_multiply(q90.q, q90.q, out);
    assert_quat_near(out, q180.q, TOL, "90°Z * 90°Z = 180°Z");
    std::cout << "PASS\n";
    return 0;
}

// ---------------------------------------------------------------------------
// compose_pose tests
// ---------------------------------------------------------------------------

static int test_compose_identity() {
    std::cout << "  [compose_identity] ";
    double parent_pos[3] = {0, 0, 0};
    double parent_ori[4] = {1, 0, 0, 0};
    double local_pos[3] = {1.5, -2.3, 4.7};
    auto local_ori = make_quat(0, 1, 0, 0.5);

    double out_pos[3], out_ori[4];
    pm::compose_pose(parent_pos, parent_ori, local_pos, local_ori.q, out_pos, out_ori);

    assert_vec3_near(out_pos, local_pos, TOL, "identity parent: world pos = local pos");
    assert_quat_near(out_ori, local_ori.q, TOL, "identity parent: world ori = local ori");
    std::cout << "PASS\n";
    return 0;
}

static int test_compose_translate_only() {
    std::cout << "  [compose_translate_only] ";
    // Parent at (1,0,0), identity orientation; local at (0,1,0)
    // World should be (1,1,0)
    double parent_pos[3] = {1, 0, 0};
    double parent_ori[4] = {1, 0, 0, 0};
    double local_pos[3] = {0, 1, 0};
    double local_ori[4] = {1, 0, 0, 0};

    double out_pos[3], out_ori[4];
    pm::compose_pose(parent_pos, parent_ori, local_pos, local_ori, out_pos, out_ori);

    double expected_pos[3] = {1, 1, 0};
    assert_vec3_near(out_pos, expected_pos, TOL, "translate only: (1,0,0)+(0,1,0)=(1,1,0)");
    std::cout << "PASS\n";
    return 0;
}

static int test_compose_rotate_only() {
    std::cout << "  [compose_rotate_only] ";
    // Parent at origin, rotated 90° around Z; local at (1,0,0)
    // After rotation: (1,0,0) → (0,1,0); world = (0,1,0)
    double parent_pos[3] = {0, 0, 0};
    auto parent_ori = make_quat(0, 0, 1, PI / 2);
    double local_pos[3] = {1, 0, 0};
    double local_ori[4] = {1, 0, 0, 0};

    double out_pos[3], out_ori[4];
    pm::compose_pose(parent_pos, parent_ori.q, local_pos, local_ori, out_pos, out_ori);

    double expected_pos[3] = {0, 1, 0};
    assert_vec3_near(out_pos, expected_pos, TOL, "rotate only: 90°Z * (1,0,0) = (0,1,0)");
    std::cout << "PASS\n";
    return 0;
}

static int test_compose_full() {
    std::cout << "  [compose_full] ";
    // Parent at (2, 3, 0), rotated 90° around Z
    // Local at (1, 0, 0) → rotated to (0, 1, 0) → world = (2, 4, 0)
    double parent_pos[3] = {2, 3, 0};
    auto parent_ori = make_quat(0, 0, 1, PI / 2);
    double local_pos[3] = {1, 0, 0};
    double local_ori[4] = {1, 0, 0, 0};

    double out_pos[3], out_ori[4];
    pm::compose_pose(parent_pos, parent_ori.q, local_pos, local_ori, out_pos, out_ori);

    double expected_pos[3] = {2, 4, 0};
    assert_vec3_near(out_pos, expected_pos, TOL, "full compose: (2,3,0)+90°Z*(1,0,0)=(2,4,0)");
    std::cout << "PASS\n";
    return 0;
}

// ---------------------------------------------------------------------------
// inverse_pose tests
// ---------------------------------------------------------------------------

static int test_inverse_roundtrip() {
    std::cout << "  [inverse_roundtrip] ";
    // Compose a pose then invert it; pose * inverse(pose) should = identity
    double pos[3] = {5, -3, 2};
    auto ori = make_quat(1, 2, 3, 1.2);

    double inv_pos[3], inv_ori[4];
    pm::inverse_pose(pos, ori.q, inv_pos, inv_ori);

    // Compose original with inverse → should get identity
    double result_pos[3], result_ori[4];
    pm::compose_pose(pos, ori.q, inv_pos, inv_ori, result_pos, result_ori);

    double zero[3] = {0, 0, 0};
    double id[4] = {1, 0, 0, 0};
    assert_vec3_near(result_pos, zero, TOL, "pose * inverse = identity position");
    assert_quat_near(result_ori, id, TOL, "pose * inverse = identity orientation");
    std::cout << "PASS\n";
    return 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

int main() {
    std::cout << "test_pose_math:\n";
    int failures = 0;
    failures += test_quat_rotate_identity();
    failures += test_quat_rotate_90z();
    failures += test_quat_rotate_90x();
    failures += test_quat_rotate_90y();
    failures += test_quat_rotate_180z();
    failures += test_quat_multiply_identity();
    failures += test_quat_multiply_sequence();
    failures += test_compose_identity();
    failures += test_compose_translate_only();
    failures += test_compose_rotate_only();
    failures += test_compose_full();
    failures += test_inverse_roundtrip();
    std::cout << "  All pose math tests passed.\n";
    return failures;
}
