#pragma once
// ---------------------------------------------------------------------------
// Test helpers — fluent Mechanism proto builder and simulation runners
// ---------------------------------------------------------------------------

#include <cassert>
#include <cmath>
#include <iostream>
#include <string>
#include <vector>

#include "../src/simulation.h"
#include "mechanism/mechanism.pb.h"

namespace mech = motionlab::mechanism;
namespace eng = motionlab::engine;

// ---------------------------------------------------------------------------
// Quaternion helpers
// ---------------------------------------------------------------------------

/** Build a unit quaternion [w,x,y,z] from an axis-angle representation. */
inline void quat_from_axis_angle(const double axis[3], double angle_rad, double out[4]) {
    double half = angle_rad * 0.5;
    double s = std::sin(half);
    double c = std::cos(half);
    // Normalise axis
    double len = std::sqrt(axis[0]*axis[0] + axis[1]*axis[1] + axis[2]*axis[2]);
    assert(len > 1e-12 && "axis must be nonzero");
    double nx = axis[0] / len, ny = axis[1] / len, nz = axis[2] / len;
    out[0] = c;
    out[1] = nx * s;
    out[2] = ny * s;
    out[3] = nz * s;
}

/** Convenience: axis as initializer list → returns quat as struct. */
struct Quat4 { double q[4]; };
inline Quat4 make_quat(double ax, double ay, double az, double angle_rad) {
    Quat4 r;
    double axis[3] = {ax, ay, az};
    quat_from_axis_angle(axis, angle_rad, r.q);
    return r;
}

constexpr double IDENTITY_QUAT[4] = {1, 0, 0, 0};
constexpr double PI = 3.14159265358979323846;

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

inline void assert_near(double actual, double expected, double tol, const char* msg) {
    if (std::abs(actual - expected) > tol) {
        std::cerr << "FAIL: " << msg << ": expected " << expected
                  << ", got " << actual << " (diff="
                  << std::abs(actual - expected) << ", tol=" << tol << ")\n";
        assert(false);
    }
}

inline void assert_vec3_near(const double a[3], const double e[3], double tol, const char* msg) {
    for (int i = 0; i < 3; i++) {
        if (std::abs(a[i] - e[i]) > tol) {
            std::cerr << "FAIL: " << msg << " [" << i << "]: expected " << e[i]
                      << ", got " << a[i] << " (diff="
                      << std::abs(a[i] - e[i]) << ", tol=" << tol << ")\n";
            assert(false);
        }
    }
}

inline void assert_quat_near(const double a[4], const double e[4], double tol, const char* msg) {
    // Quaternions q and -q represent the same rotation; compare both signs
    double diff_pos = 0, diff_neg = 0;
    for (int i = 0; i < 4; i++) {
        diff_pos += (a[i] - e[i]) * (a[i] - e[i]);
        diff_neg += (a[i] + e[i]) * (a[i] + e[i]);
    }
    double diff = std::sqrt(std::min(diff_pos, diff_neg));
    if (diff > tol) {
        std::cerr << "FAIL: " << msg << ": quat diff=" << diff << " > tol=" << tol
                  << "\n  actual:   [" << a[0] << ", " << a[1] << ", " << a[2] << ", " << a[3] << "]"
                  << "\n  expected: [" << e[0] << ", " << e[1] << ", " << e[2] << ", " << e[3] << "]\n";
        assert(false);
    }
}

// ---------------------------------------------------------------------------
// Body/Joint lookup helpers
// ---------------------------------------------------------------------------

inline const eng::BodyPose& find_body(const std::vector<eng::BodyPose>& poses,
                                       const std::string& id) {
    for (const auto& p : poses) {
        if (p.body_id == id) return p;
    }
    std::cerr << "FAIL: body '" << id << "' not found in poses\n";
    assert(false && "body not found");
    // unreachable, but keeps compiler happy
    static eng::BodyPose dummy;
    return dummy;
}

inline const eng::JointState& find_joint(const std::vector<eng::JointState>& states,
                                          const std::string& id) {
    for (const auto& s : states) {
        if (s.joint_id == id) return s;
    }
    std::cerr << "FAIL: joint '" << id << "' not found in states\n";
    assert(false && "joint not found");
    static eng::JointState dummy;
    return dummy;
}

// ---------------------------------------------------------------------------
// SimResult + run_sim
// ---------------------------------------------------------------------------

struct SimResult {
    std::vector<eng::BodyPose> poses;
    std::vector<eng::JointState> joints;
    double time = 0;
    uint64_t steps = 0;
};

inline SimResult run_sim(const mech::Mechanism& m, double dt, int num_steps,
                         const eng::SimulationConfig& config = eng::SimulationConfig{}) {
    eng::SimulationRuntime runtime;
    auto result = runtime.compile(m, config);
    if (!result.success) {
        std::cerr << "Compilation failed: " << result.error_message << "\n";
        for (const auto& d : result.structured_diagnostics) {
            std::cerr << "  [" << d.code << "] " << d.message << "\n";
        }
    }
    assert(result.success && "Compilation must succeed");

    for (int i = 0; i < num_steps; i++) {
        runtime.step(dt);
    }

    SimResult sr;
    sr.poses = runtime.getBodyPoses();
    sr.joints = runtime.getJointStates();
    sr.time = runtime.getCurrentTime();
    sr.steps = runtime.getStepCount();
    return sr;
}

/** Run simulation and collect trajectory at every step. */
struct TrajectoryFrame {
    double time;
    std::vector<eng::BodyPose> poses;
    std::vector<eng::JointState> joints;
};

inline std::vector<TrajectoryFrame> run_trajectory(const mech::Mechanism& m, double dt, int num_steps,
                                                    const eng::SimulationConfig& config = eng::SimulationConfig{}) {
    eng::SimulationRuntime runtime;
    auto result = runtime.compile(m, config);
    assert(result.success && "Compilation must succeed");

    std::vector<TrajectoryFrame> frames;
    frames.reserve(num_steps);
    for (int i = 0; i < num_steps; i++) {
        runtime.step(dt);
        frames.push_back({runtime.getCurrentTime(), runtime.getBodyPoses(), runtime.getJointStates()});
    }
    return frames;
}

// ---------------------------------------------------------------------------
// Fluent MechanismBuilder
// ---------------------------------------------------------------------------

class MechanismBuilder {
public:
    explicit MechanismBuilder(const std::string& name = "test-mechanism") {
        mech_.mutable_id()->set_id(name);
        mech_.set_name(name);
    }

    // --- Bodies ---

    MechanismBuilder& addFixedBody(const std::string& id,
                                    double px = 0, double py = 0, double pz = 0) {
        auto* body = mech_.add_bodies();
        body->mutable_id()->set_id(id);
        body->set_name(id);
        body->set_motion_type(mech::MOTION_TYPE_FIXED);
        set_pose(body->mutable_pose(), px, py, pz, 1, 0, 0, 0);
        auto* mp = body->mutable_mass_properties();
        mp->set_mass(1.0);
        mp->set_ixx(0.1); mp->set_iyy(0.1); mp->set_izz(0.1);
        last_body_id_ = id;
        return *this;
    }

    MechanismBuilder& addBody(const std::string& id, double mass,
                               double px = 0, double py = 0, double pz = 0) {
        auto* body = mech_.add_bodies();
        body->mutable_id()->set_id(id);
        body->set_name(id);
        body->set_motion_type(mech::MOTION_TYPE_DYNAMIC);
        set_pose(body->mutable_pose(), px, py, pz, 1, 0, 0, 0);
        auto* mp = body->mutable_mass_properties();
        mp->set_mass(mass);
        mp->set_ixx(0.1); mp->set_iyy(0.1); mp->set_izz(0.1);
        last_body_id_ = id;
        return *this;
    }

    MechanismBuilder& addBodyWithOrientation(const std::string& id, double mass,
                                              double px, double py, double pz,
                                              double qw, double qx, double qy, double qz) {
        auto* body = mech_.add_bodies();
        body->mutable_id()->set_id(id);
        body->set_name(id);
        body->set_motion_type(mech::MOTION_TYPE_DYNAMIC);
        set_pose(body->mutable_pose(), px, py, pz, qw, qx, qy, qz);
        auto* mp = body->mutable_mass_properties();
        mp->set_mass(mass);
        mp->set_ixx(0.1); mp->set_iyy(0.1); mp->set_izz(0.1);
        last_body_id_ = id;
        return *this;
    }

    /** Set center of mass offset on the last added body. */
    MechanismBuilder& withCenterOfMass(double cx, double cy, double cz) {
        assert(!last_body_id_.empty());
        for (int i = 0; i < mech_.bodies_size(); i++) {
            if (mech_.bodies(i).id().id() == last_body_id_) {
                auto* com = mech_.mutable_bodies(i)->mutable_mass_properties()->mutable_center_of_mass();
                com->set_x(cx); com->set_y(cy); com->set_z(cz);
                break;
            }
        }
        return *this;
    }

    /** Set inertia on the last added body. */
    MechanismBuilder& withInertia(double ixx, double iyy, double izz,
                                   double ixy = 0, double ixz = 0, double iyz = 0) {
        assert(!last_body_id_.empty());
        for (int i = 0; i < mech_.bodies_size(); i++) {
            if (mech_.bodies(i).id().id() == last_body_id_) {
                auto* mp = mech_.mutable_bodies(i)->mutable_mass_properties();
                mp->set_ixx(ixx); mp->set_iyy(iyy); mp->set_izz(izz);
                mp->set_ixy(ixy); mp->set_ixz(ixz); mp->set_iyz(iyz);
                break;
            }
        }
        return *this;
    }

    // --- Datums ---

    MechanismBuilder& addDatum(const std::string& id, const std::string& parent_body_id,
                                double lx = 0, double ly = 0, double lz = 0) {
        auto* datum = mech_.add_datums();
        datum->mutable_id()->set_id(id);
        datum->set_name(id);
        datum->mutable_parent_body_id()->set_id(parent_body_id);
        set_pose(datum->mutable_local_pose(), lx, ly, lz, 1, 0, 0, 0);
        return *this;
    }

    MechanismBuilder& addDatumWithOrientation(const std::string& id,
                                               const std::string& parent_body_id,
                                               double lx, double ly, double lz,
                                               double qw, double qx, double qy, double qz) {
        auto* datum = mech_.add_datums();
        datum->mutable_id()->set_id(id);
        datum->set_name(id);
        datum->mutable_parent_body_id()->set_id(parent_body_id);
        set_pose(datum->mutable_local_pose(), lx, ly, lz, qw, qx, qy, qz);
        return *this;
    }

    // --- Joints ---

    MechanismBuilder& addJoint(const std::string& id, mech::JointType type,
                                const std::string& parent_datum_id,
                                const std::string& child_datum_id) {
        auto* joint = mech_.add_joints();
        joint->mutable_id()->set_id(id);
        joint->set_name(id);
        joint->set_type(type);
        joint->mutable_parent_datum_id()->set_id(parent_datum_id);
        joint->mutable_child_datum_id()->set_id(child_datum_id);
        last_joint_id_ = id;
        return *this;
    }

    MechanismBuilder& addRevoluteJoint(const std::string& id,
                                        const std::string& parent_datum_id,
                                        const std::string& child_datum_id) {
        return addJoint(id, mech::JOINT_TYPE_REVOLUTE, parent_datum_id, child_datum_id);
    }

    MechanismBuilder& addPrismaticJoint(const std::string& id,
                                         const std::string& parent_datum_id,
                                         const std::string& child_datum_id) {
        return addJoint(id, mech::JOINT_TYPE_PRISMATIC, parent_datum_id, child_datum_id);
    }

    MechanismBuilder& addFixedJoint(const std::string& id,
                                     const std::string& parent_datum_id,
                                     const std::string& child_datum_id) {
        return addJoint(id, mech::JOINT_TYPE_FIXED, parent_datum_id, child_datum_id);
    }

    /** Set prismatic limits on the last added joint. */
    MechanismBuilder& withPrismaticLimits(double lower, double upper) {
        assert(!last_joint_id_.empty());
        for (int i = 0; i < mech_.joints_size(); i++) {
            if (mech_.joints(i).id().id() == last_joint_id_) {
                auto* cfg = mech_.mutable_joints(i)->mutable_prismatic();
                cfg->mutable_translation_limit()->set_lower(lower);
                cfg->mutable_translation_limit()->set_upper(upper);
                break;
            }
        }
        return *this;
    }

    /** Set revolute limits on the last added joint. */
    MechanismBuilder& withRevoluteLimits(double lower, double upper) {
        assert(!last_joint_id_.empty());
        for (int i = 0; i < mech_.joints_size(); i++) {
            if (mech_.joints(i).id().id() == last_joint_id_) {
                auto* cfg = mech_.mutable_joints(i)->mutable_revolute();
                cfg->mutable_angle_limit()->set_lower(lower);
                cfg->mutable_angle_limit()->set_upper(upper);
                break;
            }
        }
        return *this;
    }

    /** Set revolute damping on the last added joint. */
    MechanismBuilder& withRevoluteDamping(double damping) {
        assert(!last_joint_id_.empty());
        for (int i = 0; i < mech_.joints_size(); i++) {
            if (mech_.joints(i).id().id() == last_joint_id_) {
                mech_.mutable_joints(i)->mutable_revolute()->set_damping(damping);
                break;
            }
        }
        return *this;
    }

    /** Set prismatic damping on the last added joint. */
    MechanismBuilder& withPrismaticDamping(double damping) {
        assert(!last_joint_id_.empty());
        for (int i = 0; i < mech_.joints_size(); i++) {
            if (mech_.joints(i).id().id() == last_joint_id_) {
                mech_.mutable_joints(i)->mutable_prismatic()->set_damping(damping);
                break;
            }
        }
        return *this;
    }

    // --- Loads ---

    MechanismBuilder& addPointForce(const std::string& id, const std::string& datum_id,
                                     double fx, double fy, double fz,
                                     mech::ReferenceFrame frame = mech::REFERENCE_FRAME_WORLD) {
        auto* load = mech_.add_loads();
        load->mutable_id()->set_id(id);
        load->set_name(id);
        auto* pf = load->mutable_point_force();
        pf->mutable_datum_id()->set_id(datum_id);
        pf->mutable_vector()->set_x(fx);
        pf->mutable_vector()->set_y(fy);
        pf->mutable_vector()->set_z(fz);
        pf->set_reference_frame(frame);
        return *this;
    }

    MechanismBuilder& addPointTorque(const std::string& id, const std::string& datum_id,
                                      double tx, double ty, double tz,
                                      mech::ReferenceFrame frame = mech::REFERENCE_FRAME_WORLD) {
        auto* load = mech_.add_loads();
        load->mutable_id()->set_id(id);
        load->set_name(id);
        auto* pt = load->mutable_point_torque();
        pt->mutable_datum_id()->set_id(datum_id);
        pt->mutable_vector()->set_x(tx);
        pt->mutable_vector()->set_y(ty);
        pt->mutable_vector()->set_z(tz);
        pt->set_reference_frame(frame);
        return *this;
    }

    MechanismBuilder& addSpringDamper(const std::string& id,
                                       const std::string& parent_datum_id,
                                       const std::string& child_datum_id,
                                       double stiffness, double damping,
                                       double rest_length) {
        auto* load = mech_.add_loads();
        load->mutable_id()->set_id(id);
        load->set_name(id);
        auto* sd = load->mutable_linear_spring_damper();
        sd->mutable_parent_datum_id()->set_id(parent_datum_id);
        sd->mutable_child_datum_id()->set_id(child_datum_id);
        sd->set_stiffness(stiffness);
        sd->set_damping(damping);
        sd->set_rest_length(rest_length);
        return *this;
    }

    // --- Actuators ---

    MechanismBuilder& addRevoluteMotor(const std::string& id, const std::string& joint_id,
                                        mech::ActuatorControlMode mode, double command) {
        auto* act = mech_.add_actuators();
        act->mutable_id()->set_id(id);
        act->set_name(id);
        auto* rm = act->mutable_revolute_motor();
        rm->mutable_joint_id()->set_id(joint_id);
        rm->set_control_mode(mode);
        rm->set_command_value(command);
        return *this;
    }

    MechanismBuilder& addPrismaticMotor(const std::string& id, const std::string& joint_id,
                                         mech::ActuatorControlMode mode, double command) {
        auto* act = mech_.add_actuators();
        act->mutable_id()->set_id(id);
        act->set_name(id);
        auto* pm = act->mutable_prismatic_motor();
        pm->mutable_joint_id()->set_id(joint_id);
        pm->set_control_mode(mode);
        pm->set_command_value(command);
        return *this;
    }

    // --- Build ---

    mech::Mechanism build() const { return mech_; }

private:
    mech::Mechanism mech_;
    std::string last_body_id_;
    std::string last_joint_id_;

    static void set_pose(mech::Pose* pose,
                          double px, double py, double pz,
                          double qw, double qx, double qy, double qz) {
        auto* pos = pose->mutable_position();
        pos->set_x(px); pos->set_y(py); pos->set_z(pz);
        auto* ori = pose->mutable_orientation();
        ori->set_w(qw); ori->set_x(qx); ori->set_y(qy); ori->set_z(qz);
    }
};
