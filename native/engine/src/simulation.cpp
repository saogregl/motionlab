// ---------------------------------------------------------------------------
// SimulationRuntime — Chrono 8.0 integration
//
// Chrono version: 8.0.0 (via vcpkg port "chronoengine")
// Modules used:  ChronoEngine core only (no Irrlicht, vehicle, postprocess)
// Contact system: NSC (Non-Smooth Contact) — suitable for constrained
//   multibody dynamics without requiring SMC penalty parameters.
// Gotchas:
//   - Chrono quaternions are (w, x, y, z); our proto Quat is also (w, x, y, z).
//   - Chrono's default gravity is (0, -9.81, 0) matching our Y-up convention.
//   - Joint frames use Z-axis as the constraint axis (revolute rotation axis,
//     prismatic translation axis).
//   - ChLinkLock family requires the joint frame in absolute coordinates.
//     We compute this from the parent datum's body pose + datum local pose.
// ---------------------------------------------------------------------------

#include "simulation.h"

#include <unordered_map>

#include "chrono/physics/ChBody.h"
#include "chrono/physics/ChLinkLock.h"
#include "chrono/physics/ChSystemNSC.h"

#include "mechanism/mechanism.pb.h"

using namespace chrono;

namespace motionlab::engine {

// ---------------------------------------------------------------------------
// Impl
// ---------------------------------------------------------------------------

struct SimulationRuntime::Impl {
    SimState state = SimState::IDLE;
    double current_time = 0.0;
    uint64_t step_count = 0;

    // Chrono system — created fresh on each compile()
    std::unique_ptr<ChSystemNSC> system;

    // Authored-ID → Chrono body mapping
    std::unordered_map<std::string, std::shared_ptr<ChBody>> body_map;

    // Authored-ID → Chrono link mapping
    struct LinkEntry {
        std::shared_ptr<ChLinkLock> link;
        int joint_type; // motionlab::mechanism::JointType enum value
    };
    std::unordered_map<std::string, LinkEntry> link_map;

    // Initial body poses for reset()
    std::unordered_map<std::string, BodyPose> initial_poses;
};

// ---------------------------------------------------------------------------
// Construction / destruction
// ---------------------------------------------------------------------------

SimulationRuntime::SimulationRuntime()
    : impl_(std::make_unique<Impl>()) {}

SimulationRuntime::~SimulationRuntime() = default;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

namespace {

// Compute world-space frame for a datum given its parent body's pose and
// the datum's local_pose. Returns position and orientation in absolute coords.
struct WorldFrame {
    ChVector<> pos;
    ChQuaternion<> rot;
};

WorldFrame compute_datum_world_frame(
    const motionlab::mechanism::Pose& body_pose,
    const motionlab::mechanism::Pose& datum_local_pose
) {
    // Body world pose
    const auto& bp = body_pose.position();
    const auto& bo = body_pose.orientation();
    ChVector<> body_pos(bp.x(), bp.y(), bp.z());
    ChQuaternion<> body_rot(bo.w(), bo.x(), bo.y(), bo.z());

    // Datum local pose
    const auto& dp = datum_local_pose.position();
    const auto& dr = datum_local_pose.orientation();
    ChVector<> datum_local_pos(dp.x(), dp.y(), dp.z());
    ChQuaternion<> datum_local_rot(dr.w(), dr.x(), dr.y(), dr.z());

    // World = body_rot * local_pos + body_pos
    ChVector<> world_pos = body_rot.Rotate(datum_local_pos) + body_pos;
    ChQuaternion<> world_rot = body_rot * datum_local_rot;

    return { world_pos, world_rot };
}

} // anonymous namespace

// ---------------------------------------------------------------------------
// compile()
// ---------------------------------------------------------------------------

CompilationResult SimulationRuntime::compile(
    const motionlab::mechanism::Mechanism& mechanism
) {
    CompilationResult result;
    result.success = false;
    impl_->state = SimState::COMPILING;

    // --- Validation ---

    if (mechanism.bodies_size() == 0) {
        result.error_message = "Mechanism has no bodies";
        result.diagnostics.push_back("At least one body is required to compile a simulation.");
        impl_->state = SimState::ERROR;
        return result;
    }

    // Build lookup maps for bodies and datums
    std::unordered_map<std::string, const motionlab::mechanism::Body*> body_lookup;
    for (const auto& body : mechanism.bodies()) {
        if (!body.has_id()) continue;
        body_lookup[body.id().id()] = &body;
    }

    std::unordered_map<std::string, const motionlab::mechanism::Datum*> datum_lookup;
    for (const auto& datum : mechanism.datums()) {
        if (!datum.has_id()) continue;
        datum_lookup[datum.id().id()] = &datum;
    }

    // Validate joints reference existing bodies and datums
    for (const auto& joint : mechanism.joints()) {
        const std::string joint_name = joint.name().empty()
            ? joint.id().id() : joint.name();

        if (!joint.has_parent_datum_id() || !joint.has_child_datum_id()) {
            result.error_message = "Joint '" + joint_name + "' is missing datum references";
            result.diagnostics.push_back(
                "Joint '" + joint_name + "' must reference both a parent and child datum.");
            impl_->state = SimState::ERROR;
            return result;
        }

        const auto parent_it = datum_lookup.find(joint.parent_datum_id().id());
        if (parent_it == datum_lookup.end()) {
            result.error_message = "Joint '" + joint_name +
                "' references nonexistent parent datum '" + joint.parent_datum_id().id() + "'";
            impl_->state = SimState::ERROR;
            return result;
        }

        const auto child_it = datum_lookup.find(joint.child_datum_id().id());
        if (child_it == datum_lookup.end()) {
            result.error_message = "Joint '" + joint_name +
                "' references nonexistent child datum '" + joint.child_datum_id().id() + "'";
            impl_->state = SimState::ERROR;
            return result;
        }

        // Validate that datum parent bodies exist
        const auto* parent_datum = parent_it->second;
        if (body_lookup.find(parent_datum->parent_body_id().id()) == body_lookup.end()) {
            result.error_message = "Datum '" + parent_datum->name() +
                "' references nonexistent parent body '" +
                parent_datum->parent_body_id().id() + "'";
            impl_->state = SimState::ERROR;
            return result;
        }

        const auto* child_datum = child_it->second;
        if (body_lookup.find(child_datum->parent_body_id().id()) == body_lookup.end()) {
            result.error_message = "Datum '" + child_datum->name() +
                "' references nonexistent parent body '" +
                child_datum->parent_body_id().id() + "'";
            impl_->state = SimState::ERROR;
            return result;
        }
    }

    // Validate body mass properties
    for (const auto& body : mechanism.bodies()) {
        if (body.has_mass_properties() && body.mass_properties().mass() <= 0) {
            const std::string body_name = body.name().empty()
                ? body.id().id() : body.name();
            result.error_message = "Body '" + body_name +
                "' has zero or negative mass (" +
                std::to_string(body.mass_properties().mass()) + ")";
            impl_->state = SimState::ERROR;
            return result;
        }
    }

    // --- Build Chrono system ---

    impl_->system = std::make_unique<ChSystemNSC>();
    impl_->system->SetGravitationalAcceleration(ChVector<>(0, -9.81, 0));
    impl_->body_map.clear();
    impl_->link_map.clear();
    impl_->initial_poses.clear();
    impl_->current_time = 0.0;
    impl_->step_count = 0;

    // Create Chrono bodies
    bool first_body = true;
    for (const auto& body : mechanism.bodies()) {
        const std::string id = body.id().id();
        auto ch_body = chrono_types::make_shared<ChBody>();

        // Mass properties
        double mass = 1.0;
        ChVector<> inertia_xx(0.1, 0.1, 0.1);
        ChVector<> inertia_xy(0.0, 0.0, 0.0);

        if (body.has_mass_properties()) {
            const auto& mp = body.mass_properties();
            mass = mp.mass();
            inertia_xx = ChVector<>(mp.ixx(), mp.iyy(), mp.izz());
            inertia_xy = ChVector<>(mp.ixy(), mp.ixz(), mp.iyz());
        }

        ch_body->SetMass(mass);
        ch_body->SetInertiaXX(inertia_xx);
        ch_body->SetInertiaXY(inertia_xy);

        // Pose
        ChVector<> pos(0, 0, 0);
        ChQuaternion<> rot(1, 0, 0, 0); // identity quaternion (w=1)

        if (body.has_pose()) {
            const auto& p = body.pose();
            if (p.has_position()) {
                pos = ChVector<>(p.position().x(), p.position().y(), p.position().z());
            }
            if (p.has_orientation()) {
                rot = ChQuaternion<>(
                    p.orientation().w(),
                    p.orientation().x(),
                    p.orientation().y(),
                    p.orientation().z()
                );
            }
        }

        ch_body->SetPos(pos);
        ch_body->SetRot(rot);

        // First body is treated as ground (fixed) by convention
        if (first_body) {
            ch_body->SetFixed(true);
            first_body = false;
            result.diagnostics.push_back(
                "Body '" + body.name() + "' treated as ground (fixed).");
        }

        impl_->system->AddBody(ch_body);
        impl_->body_map[id] = ch_body;

        // Save initial pose for reset
        BodyPose initial;
        initial.body_id = id;
        initial.position[0] = pos.x();
        initial.position[1] = pos.y();
        initial.position[2] = pos.z();
        initial.orientation[0] = rot.e0(); // w
        initial.orientation[1] = rot.e1(); // x
        initial.orientation[2] = rot.e2(); // y
        initial.orientation[3] = rot.e3(); // z
        impl_->initial_poses[id] = initial;
    }

    // Check for disconnected bodies (bodies not referenced by any joint)
    std::unordered_map<std::string, bool> body_connected;
    for (const auto& [id, _] : impl_->body_map) {
        body_connected[id] = false;
    }
    for (const auto& joint : mechanism.joints()) {
        const auto* parent_datum = datum_lookup[joint.parent_datum_id().id()];
        const auto* child_datum = datum_lookup[joint.child_datum_id().id()];
        body_connected[parent_datum->parent_body_id().id()] = true;
        body_connected[child_datum->parent_body_id().id()] = true;
    }
    for (const auto& [id, connected] : body_connected) {
        if (!connected && impl_->body_map.size() > 1) {
            const auto* body = body_lookup[id];
            result.diagnostics.push_back(
                "Warning: Body '" + body->name() +
                "' is not connected to any joint.");
        }
    }

    // Create Chrono joints
    for (const auto& joint : mechanism.joints()) {
        const std::string joint_id = joint.id().id();
        const std::string joint_name = joint.name().empty() ? joint_id : joint.name();

        const auto* parent_datum = datum_lookup[joint.parent_datum_id().id()];
        const auto* child_datum = datum_lookup[joint.child_datum_id().id()];

        auto parent_body_it = impl_->body_map.find(parent_datum->parent_body_id().id());
        auto child_body_it = impl_->body_map.find(child_datum->parent_body_id().id());

        const auto* parent_body_proto = body_lookup[parent_datum->parent_body_id().id()];

        // Compute world frame for the joint from the parent datum
        WorldFrame wf = compute_datum_world_frame(
            parent_body_proto->pose(),
            parent_datum->local_pose()
        );

        std::shared_ptr<ChLinkLock> ch_link;

        switch (joint.type()) {
            case motionlab::mechanism::JOINT_TYPE_REVOLUTE:
                ch_link = chrono_types::make_shared<ChLinkLockRevolute>();
                break;
            case motionlab::mechanism::JOINT_TYPE_PRISMATIC:
                ch_link = chrono_types::make_shared<ChLinkLockPrismatic>();
                break;
            case motionlab::mechanism::JOINT_TYPE_FIXED:
                ch_link = chrono_types::make_shared<ChLinkLockLock>();
                break;
            default:
                result.diagnostics.push_back(
                    "Warning: Joint '" + joint_name +
                    "' has unspecified type, defaulting to fixed.");
                ch_link = chrono_types::make_shared<ChLinkLockLock>();
                break;
        }

        ch_link->Initialize(
            parent_body_it->second,
            child_body_it->second,
            ChCoordsys<>(wf.pos, wf.rot)
        );

        impl_->system->AddLink(ch_link);
        impl_->link_map[joint_id] = { ch_link, static_cast<int>(joint.type()) };
    }

    result.success = true;
    impl_->state = SimState::IDLE;
    return result;
}

// ---------------------------------------------------------------------------
// step()
// ---------------------------------------------------------------------------

void SimulationRuntime::step(double dt) {
    if (!impl_->system) return;
    impl_->state = SimState::RUNNING;
    impl_->system->DoStepDynamics(dt);
    impl_->current_time += dt;
    impl_->step_count++;
}

// ---------------------------------------------------------------------------
// reset()
// ---------------------------------------------------------------------------

void SimulationRuntime::reset() {
    if (!impl_->system) return;

    for (auto& [id, ch_body] : impl_->body_map) {
        const auto it = impl_->initial_poses.find(id);
        if (it == impl_->initial_poses.end()) continue;

        const auto& pose = it->second;
        ch_body->SetPos(ChVector<>(pose.position[0], pose.position[1], pose.position[2]));
        ch_body->SetRot(ChQuaternion<>(
            pose.orientation[0], pose.orientation[1],
            pose.orientation[2], pose.orientation[3]
        ));
        ch_body->SetPosDt(ChVector<>(0, 0, 0));
        ch_body->SetRotDt(ChQuaternion<>(1, 0, 0, 0));
    }

    impl_->current_time = 0.0;
    impl_->step_count = 0;
    impl_->state = SimState::IDLE;
}

// ---------------------------------------------------------------------------
// Readback
// ---------------------------------------------------------------------------

SimState SimulationRuntime::getState() const {
    return impl_->state;
}

double SimulationRuntime::getCurrentTime() const {
    return impl_->current_time;
}

uint64_t SimulationRuntime::getStepCount() const {
    return impl_->step_count;
}

std::vector<BodyPose> SimulationRuntime::getBodyPoses() const {
    std::vector<BodyPose> poses;
    poses.reserve(impl_->body_map.size());

    for (const auto& [id, ch_body] : impl_->body_map) {
        BodyPose bp;
        bp.body_id = id;

        const auto& pos = ch_body->GetPos();
        bp.position[0] = pos.x();
        bp.position[1] = pos.y();
        bp.position[2] = pos.z();

        const auto& rot = ch_body->GetRot();
        bp.orientation[0] = rot.e0(); // w
        bp.orientation[1] = rot.e1(); // x
        bp.orientation[2] = rot.e2(); // y
        bp.orientation[3] = rot.e3(); // z

        poses.push_back(std::move(bp));
    }

    return poses;
}

std::vector<JointState> SimulationRuntime::getJointStates() const {
    std::vector<JointState> states;
    states.reserve(impl_->link_map.size());

    for (const auto& [id, entry] : impl_->link_map) {
        JointState js;
        js.joint_id = id;

        // Generalized coordinate — depends on joint type
        // Revolute: relative rotation angle around Z axis
        // Prismatic: relative displacement along Z axis
        const auto& rel_pos = entry.link->GetRelM().GetPos();
        const auto& rel_rot = entry.link->GetRelM().GetRot();

        if (entry.joint_type == motionlab::mechanism::JOINT_TYPE_REVOLUTE) {
            // Relative angle from quaternion — extract rotation around Z
            // For small angles: angle ≈ 2 * atan2(qz, qw)
            js.position = 2.0 * std::atan2(rel_rot.e3(), rel_rot.e0());
            // Relative angular velocity around Z
            const auto& rel_wvel = entry.link->GetRelWvel();
            js.velocity = rel_wvel.z();
        } else if (entry.joint_type == motionlab::mechanism::JOINT_TYPE_PRISMATIC) {
            js.position = rel_pos.z();
            const auto& rel_vel = entry.link->GetRelMDt().GetPos();
            js.velocity = rel_vel.z();
        } else {
            js.position = 0.0;
            js.velocity = 0.0;
        }

        // Reaction forces/torques (in link frame)
        const auto react_force = entry.link->GetReaction2().force;
        const auto react_torque = entry.link->GetReaction2().torque;

        js.reaction_force[0] = react_force.x();
        js.reaction_force[1] = react_force.y();
        js.reaction_force[2] = react_force.z();

        js.reaction_torque[0] = react_torque.x();
        js.reaction_torque[1] = react_torque.y();
        js.reaction_torque[2] = react_torque.z();

        states.push_back(std::move(js));
    }

    return states;
}

} // namespace motionlab::engine
