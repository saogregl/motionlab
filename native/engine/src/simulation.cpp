#include "simulation.h"

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <memory>
#include <string>
#include <unordered_map>
#include <unordered_set>

#include "chrono/functions/ChFunctionConst.h"
#include "chrono/physics/ChBody.h"
#include "chrono/physics/ChBodyAuxRef.h"
#include "chrono/physics/ChLink.h"
#include "chrono/physics/ChLinkDistance.h"
#include "chrono/physics/ChLinkLock.h"
#include "chrono/physics/ChLinkMotorLinearForce.h"
#include "chrono/physics/ChLinkMotorLinearPosition.h"
#include "chrono/physics/ChLinkMotorLinearSpeed.h"
#include "chrono/physics/ChLinkMotorRotationAngle.h"
#include "chrono/physics/ChLinkMotorRotationSpeed.h"
#include "chrono/physics/ChLinkMotorRotationTorque.h"
#include "chrono/physics/ChLinkTSDA.h"
#include "chrono/physics/ChLinkUniversal.h"
#include "chrono/physics/ChContactMaterialNSC.h"
#include "chrono/physics/ChSystemNSC.h"
#include "chrono/collision/ChCollisionShapeBox.h"
#include "chrono/collision/ChCollisionShapeSphere.h"
#include "chrono/collision/ChCollisionShapeCylinder.h"
#include "chrono/solver/ChSolverPSOR.h"
#include "chrono/solver/ChSolverBB.h"
#include "chrono/solver/ChSolverAPGD.h"
#include "chrono/solver/ChIterativeSolverLS.h"

#include "engine/log.h"
#include "mechanism/mechanism.pb.h"

using namespace chrono;

namespace motionlab::engine {

namespace mech = motionlab::mechanism;

namespace {

struct WorldFrame {
    ChVector3d pos;
    ChQuaterniond rot;
};

WorldFrame compute_datum_world_frame(const mech::Pose& body_pose,
                                     const mech::Pose& datum_local_pose) {
    const auto& bp = body_pose.position();
    const auto& bo = body_pose.orientation();
    ChVector3d body_pos(bp.x(), bp.y(), bp.z());
    ChQuaterniond body_rot(bo.w(), bo.x(), bo.y(), bo.z());

    const auto& dp = datum_local_pose.position();
    const auto& dr = datum_local_pose.orientation();
    ChVector3d datum_local_pos(dp.x(), dp.y(), dp.z());
    ChQuaterniond datum_local_rot(dr.w(), dr.x(), dr.y(), dr.z());

    return {body_rot.Rotate(datum_local_pos) + body_pos, body_rot * datum_local_rot};
}

bool body_is_fixed(const mech::Body& body) {
    return body.motion_type() == mech::MOTION_TYPE_FIXED;
}

ChVector3d vec3_to_chrono(const mech::Vec3& v) {
    return {v.x(), v.y(), v.z()};
}

std::array<double, 3> chrono_vec_to_array(const ChVector3d& v) {
    return {v.x(), v.y(), v.z()};
}

void set_vec3(mech::Vec3* out, const ChVector3d& v) {
    out->set_x(v.x());
    out->set_y(v.y());
    out->set_z(v.z());
}

double angle_from_quat_z(const ChQuaterniond& q) {
    return 2.0 * std::atan2(q.e3(), q.e0());
}

void append_scalar_channel(std::vector<ChannelDescriptor>& out,
                           const std::string& id,
                           const std::string& name,
                           const std::string& unit) {
    out.push_back({id, name, unit, 1});
}

void append_vector_channel(std::vector<ChannelDescriptor>& out,
                           const std::string& id,
                           const std::string& name,
                           const std::string& unit) {
    out.push_back({id, name, unit, 2});
}

ChannelValue make_scalar_value(const std::string& id, double value) {
    ChannelValue cv;
    cv.channel_id = id;
    cv.data_type = 1;
    cv.scalar = value;
    return cv;
}

ChannelValue make_vector_value(const std::string& id, const ChVector3d& value) {
    ChannelValue cv;
    cv.channel_id = id;
    cv.data_type = 2;
    cv.vector[0] = value.x();
    cv.vector[1] = value.y();
    cv.vector[2] = value.z();
    return cv;
}

static const char* solver_type_name(SolverType type) {
    switch (type) {
        case SolverType::PSOR: return "PSOR";
        case SolverType::BARZILAI_BORWEIN: return "BARZILAI_BORWEIN";
        case SolverType::APGD: return "APGD";
        case SolverType::MINRES: return "MINRES";
    }
    return "UNKNOWN";
}

static const char* integrator_type_name(IntegratorType type) {
    switch (type) {
        case IntegratorType::EULER_IMPLICIT_LINEARIZED: return "EULER_IMPLICIT_LINEARIZED";
        case IntegratorType::HHT: return "HHT";
        case IntegratorType::NEWMARK: return "NEWMARK";
    }
    return "UNKNOWN";
}

// ---------------------------------------------------------------------------
// Constraints removed per joint type (matching frontend dof-counter.ts):
//   constraints_removed = 6 - DOF_per_joint
// ---------------------------------------------------------------------------
int constraints_removed_for_joint(mech::JointType type) {
    switch (type) {
        case mech::JOINT_TYPE_FIXED:       return 6;
        case mech::JOINT_TYPE_REVOLUTE:    return 5;
        case mech::JOINT_TYPE_PRISMATIC:   return 5;
        case mech::JOINT_TYPE_SPHERICAL:   return 3;
        case mech::JOINT_TYPE_CYLINDRICAL: return 4;
        case mech::JOINT_TYPE_PLANAR:      return 3;
        case mech::JOINT_TYPE_UNIVERSAL:   return 4;
        case mech::JOINT_TYPE_DISTANCE:    return 1;
        case mech::JOINT_TYPE_POINT_LINE:  return 2;
        case mech::JOINT_TYPE_POINT_PLANE: return 3;
        default: return 0;
    }
}

// ---------------------------------------------------------------------------
// Union-Find for connected components
// ---------------------------------------------------------------------------
struct UnionFind {
    std::unordered_map<std::string, std::string> parent;
    std::unordered_map<std::string, int> rank;

    void make_set(const std::string& id) {
        if (parent.find(id) == parent.end()) {
            parent[id] = id;
            rank[id] = 0;
        }
    }

    std::string find(const std::string& id) {
        if (parent[id] != id)
            parent[id] = find(parent[id]);
        return parent[id];
    }

    void unite(const std::string& a, const std::string& b) {
        auto ra = find(a);
        auto rb = find(b);
        if (ra == rb) return;
        if (rank[ra] < rank[rb]) std::swap(ra, rb);
        parent[rb] = ra;
        if (rank[ra] == rank[rb]) rank[ra]++;
    }
};

// ---------------------------------------------------------------------------
// validate_mechanism — accumulates structured diagnostics
// ---------------------------------------------------------------------------
static void validate_mechanism(
    const mech::Mechanism& mechanism,
    const std::unordered_map<std::string, const mech::Body*>& body_lookup,
    const std::unordered_map<std::string, const mech::Datum*>& datum_lookup,
    CompilationResult& result)
{
    auto emit = [&](DiagnosticSeverity sev, const std::string& code,
                    const std::string& msg, const std::string& suggestion,
                    std::vector<std::string> ids = {}) {
        CompilationDiagnostic d;
        d.severity = sev;
        d.code = code;
        d.message = msg;
        d.suggestion = suggestion;
        d.affected_entity_ids = std::move(ids);
        result.structured_diagnostics.push_back(std::move(d));
    };

    // E1: No bodies
    if (mechanism.bodies_size() == 0) {
        emit(DiagnosticSeverity::ERROR, "NO_BODIES",
             "Mechanism has no bodies",
             "Import at least one CAD file to create bodies");
        return; // nothing else to check
    }

    // E2: No ground
    bool has_ground = false;
    for (const auto& body : mechanism.bodies()) {
        if (body_is_fixed(body)) { has_ground = true; break; }
    }
    if (!has_ground) {
        emit(DiagnosticSeverity::ERROR, "NO_GROUND",
             "No fixed body in mechanism — at least one body must be fixed to define ground",
             "Select a body and toggle 'Fixed' in the Body Inspector, or add a Fixed joint to the ground");
    }

    // E3: Zero-mass non-fixed bodies
    for (const auto& body : mechanism.bodies()) {
        if (body_is_fixed(body)) continue;
        if (body.has_mass_properties() && body.mass_properties().mass() <= 0.0) {
            emit(DiagnosticSeverity::ERROR, "ZERO_MASS",
                 "Body '" + body.name() + "' has zero or negative mass but is not fixed",
                 "Set a positive mass in body properties, or mark the body as fixed",
                 {body.id().id()});
        }
    }

    // E4: Self-joint (both datums on same body)
    for (const auto& joint : mechanism.joints()) {
        auto pit = datum_lookup.find(joint.parent_datum_id().id());
        auto cit = datum_lookup.find(joint.child_datum_id().id());
        if (pit != datum_lookup.end() && cit != datum_lookup.end()) {
            const auto& parent_body_id = pit->second->parent_body_id().id();
            const auto& child_body_id = cit->second->parent_body_id().id();
            if (parent_body_id == child_body_id) {
                std::string body_name;
                auto bit = body_lookup.find(parent_body_id);
                if (bit != body_lookup.end()) body_name = bit->second->name();
                emit(DiagnosticSeverity::ERROR, "SELF_JOINT",
                     "Joint '" + joint.name() + "' connects two datums on the same body '" + body_name + "'",
                     "A joint must connect datums on different bodies — reassign one of the datums",
                     {joint.id().id(), parent_body_id});
            }
        }
    }

    // E5: Duplicate actuators on same joint
    {
        std::unordered_map<std::string, std::string> seen; // joint_id -> first actuator id
        for (const auto& actuator : mechanism.actuators()) {
            std::string joint_id;
            switch (actuator.config_case()) {
                case mech::Actuator::kRevoluteMotor:
                    joint_id = actuator.revolute_motor().joint_id().id();
                    break;
                case mech::Actuator::kPrismaticMotor:
                    joint_id = actuator.prismatic_motor().joint_id().id();
                    break;
                default: continue;
            }
            if (joint_id.empty()) continue;
            auto it = seen.find(joint_id);
            if (it != seen.end()) {
                emit(DiagnosticSeverity::ERROR, "DUPLICATE_ACTUATOR",
                     "Multiple actuators target the same joint — only one actuator per joint is supported",
                     "Remove one of the conflicting actuators",
                     {it->second, actuator.id().id(), joint_id});
            } else {
                seen[joint_id] = actuator.id().id();
            }
        }
    }

    // --- Warnings ---

    // Build set of bodies referenced by joints or loads (via datums)
    std::unordered_set<std::string> connected_bodies;
    for (const auto& joint : mechanism.joints()) {
        auto pit = datum_lookup.find(joint.parent_datum_id().id());
        auto cit = datum_lookup.find(joint.child_datum_id().id());
        if (pit != datum_lookup.end())
            connected_bodies.insert(pit->second->parent_body_id().id());
        if (cit != datum_lookup.end())
            connected_bodies.insert(cit->second->parent_body_id().id());
    }
    for (const auto& load : mechanism.loads()) {
        switch (load.config_case()) {
            case mech::Load::kPointForce: {
                auto dit = datum_lookup.find(load.point_force().datum_id().id());
                if (dit != datum_lookup.end())
                    connected_bodies.insert(dit->second->parent_body_id().id());
                break;
            }
            case mech::Load::kPointTorque: {
                auto dit = datum_lookup.find(load.point_torque().datum_id().id());
                if (dit != datum_lookup.end())
                    connected_bodies.insert(dit->second->parent_body_id().id());
                break;
            }
            case mech::Load::kLinearSpringDamper: {
                auto p = datum_lookup.find(load.linear_spring_damper().parent_datum_id().id());
                auto c = datum_lookup.find(load.linear_spring_damper().child_datum_id().id());
                if (p != datum_lookup.end())
                    connected_bodies.insert(p->second->parent_body_id().id());
                if (c != datum_lookup.end())
                    connected_bodies.insert(c->second->parent_body_id().id());
                break;
            }
            default: break;
        }
    }

    // W1: Floating bodies
    for (const auto& body : mechanism.bodies()) {
        if (body_is_fixed(body)) continue;
        if (connected_bodies.find(body.id().id()) == connected_bodies.end()) {
            emit(DiagnosticSeverity::WARNING, "FLOATING_BODY",
                 "Body '" + body.name() + "' has no joints or loads connecting it to the mechanism",
                 "Add a joint to connect this body, or remove it if it's not part of the mechanism",
                 {body.id().id()});
        }
    }

    // W2/W3: DOF analysis (Gruebler's equation)
    {
        int moving_bodies = 0;
        for (const auto& body : mechanism.bodies()) {
            if (!body_is_fixed(body)) moving_bodies++;
        }
        int total_constraints = 0;
        for (const auto& joint : mechanism.joints()) {
            total_constraints += constraints_removed_for_joint(joint.type());
        }
        int dof = 6 * moving_bodies - total_constraints;

        // Compare DOF against number of actuated joints. A mechanism with
        // DOF == num_actuators is correctly driven. Only warn when DOF exceeds
        // actuated DOFs, indicating uncovered free motion.
        int num_actuators = mechanism.actuators_size();
        if (mechanism.joints_size() > 0 && num_actuators > 0 && dof > num_actuators) {
            emit(DiagnosticSeverity::WARNING, "UNDER_CONSTRAINED",
                 "Mechanism has " + std::to_string(dof) +
                     " degrees of freedom but only " + std::to_string(num_actuators) +
                     " actuator(s)",
                 "Add more joints or constraints, or add actuators for the free DOFs");
        }
        if (dof < 0) {
            emit(DiagnosticSeverity::WARNING, "OVER_CONSTRAINED",
                 "Mechanism may be over-constrained — joints remove " +
                     std::to_string(total_constraints) + " DOF from " +
                     std::to_string(6 * moving_bodies) + " available",
                 "Check for redundant constraints. Consider using spherical or distance joints instead of fixed joints where possible");
        }
    }

    // I1: Disconnected subgroups
    if (mechanism.joints_size() > 0) {
        UnionFind uf;
        for (const auto& body : mechanism.bodies()) {
            uf.make_set(body.id().id());
        }
        for (const auto& joint : mechanism.joints()) {
            auto pit = datum_lookup.find(joint.parent_datum_id().id());
            auto cit = datum_lookup.find(joint.child_datum_id().id());
            if (pit != datum_lookup.end() && cit != datum_lookup.end()) {
                uf.unite(pit->second->parent_body_id().id(),
                         cit->second->parent_body_id().id());
            }
        }
        // Also unite bodies connected by spring/damper loads
        for (const auto& load : mechanism.loads()) {
            if (load.config_case() == mech::Load::kLinearSpringDamper) {
                auto p = datum_lookup.find(load.linear_spring_damper().parent_datum_id().id());
                auto c = datum_lookup.find(load.linear_spring_damper().child_datum_id().id());
                if (p != datum_lookup.end() && c != datum_lookup.end()) {
                    uf.unite(p->second->parent_body_id().id(),
                             c->second->parent_body_id().id());
                }
            }
        }

        std::unordered_map<std::string, std::vector<std::string>> components;
        for (const auto& body : mechanism.bodies()) {
            components[uf.find(body.id().id())].push_back(body.id().id());
        }
        if (components.size() > 1) {
            // Find the largest component (assume it's the "main" chain)
            size_t max_size = 0;
            std::string main_root;
            for (const auto& [root, members] : components) {
                if (members.size() > max_size) {
                    max_size = members.size();
                    main_root = root;
                }
            }
            std::vector<std::string> smaller_ids;
            for (const auto& [root, members] : components) {
                if (root != main_root) {
                    for (const auto& id : members) smaller_ids.push_back(id);
                }
            }
            emit(DiagnosticSeverity::INFO, "DISCONNECTED_SUBGROUPS",
                 "Mechanism has " + std::to_string(components.size()) + " separate kinematic chains",
                 "This is usually intentional, but verify all bodies are connected as expected",
                 std::move(smaller_ids));
        }
    }
}

} // namespace

struct SimulationRuntime::Impl {
    SimState state = SimState::IDLE;
    double current_time = 0.0;
    uint64_t step_count = 0;
    double timestep = 0.001;

    std::unique_ptr<ChSystemNSC> system;
    std::unordered_map<std::string, std::shared_ptr<ChBody>> body_map;

    struct JointRuntime {
        std::shared_ptr<ChLink> link;
        int joint_type = 0;
        std::string name;
    };
    std::unordered_map<std::string, JointRuntime> joint_map;

    struct PointLoadRuntime {
        std::string id;
        std::string name;
        std::shared_ptr<ChBody> body;
        ChVector3d vector{0, 0, 0};
        ChVector3d point_local{0, 0, 0};
        bool local_frame = true;
        bool torque_only = false;
    };
    std::unordered_map<std::string, PointLoadRuntime> point_loads;

    struct SpringRuntime {
        std::string id;
        std::string name;
        std::shared_ptr<ChLinkTSDA> link;
    };
    std::unordered_map<std::string, SpringRuntime> springs;

    struct ActuatorRuntime {
        std::string id;
        std::string name;
        int control_mode = 0;
        double command_value = 0.0;
        std::shared_ptr<ChLinkMotorRotation> rotation_motor;
        std::shared_ptr<ChLinkMotorLinear> linear_motor;
    };
    std::unordered_map<std::string, ActuatorRuntime> actuators;

    std::unordered_map<std::string, BodyPose> initial_poses;

    std::shared_ptr<ChContactMaterialNSC> contact_material;

    // Applied config — for test introspection
    SolverConfig applied_solver;
    ContactConfig applied_contact;
};

SimulationRuntime::SimulationRuntime() : impl_(std::make_unique<Impl>()) {}
SimulationRuntime::~SimulationRuntime() = default;

CompilationResult SimulationRuntime::compile(const mech::Mechanism& mechanism,
                                             const SimulationConfig& config) {
    using clock = std::chrono::steady_clock;
    const auto t_start = clock::now();

    CompilationResult result;
    impl_->state = SimState::COMPILING;
    result.success = false;

    // --- Build lookup tables ---
    std::unordered_map<std::string, const mech::Body*> body_lookup;
    for (const auto& body : mechanism.bodies()) {
        if (body.has_id()) {
            body_lookup[body.id().id()] = &body;
        }
    }

    std::unordered_map<std::string, const mech::Datum*> datum_lookup;
    for (const auto& datum : mechanism.datums()) {
        if (datum.has_id()) {
            datum_lookup[datum.id().id()] = &datum;
        }
    }

    // --- Phase 1: Validation (all checks, accumulate diagnostics) ---
    validate_mechanism(mechanism, body_lookup, datum_lookup, result);

    bool has_errors = std::any_of(
        result.structured_diagnostics.begin(),
        result.structured_diagnostics.end(),
        [](const auto& d) { return d.severity == DiagnosticSeverity::ERROR; });

    if (has_errors) {
        result.error_message = "Compilation failed — see diagnostics";
        // Populate deprecated string diagnostics for backward compat
        for (const auto& sd : result.structured_diagnostics) {
            result.diagnostics.push_back(sd.message);
        }
        impl_->state = SimState::ERROR;
        return result;
    }

    // --- Phase 2: Build actuator lookup (needed for Chrono creation) ---
    std::unordered_map<std::string, const mech::Actuator*> actuator_by_joint;
    for (const auto& actuator : mechanism.actuators()) {
        std::string joint_id;
        switch (actuator.config_case()) {
            case mech::Actuator::kRevoluteMotor:
                joint_id = actuator.revolute_motor().joint_id().id();
                break;
            case mech::Actuator::kPrismaticMotor:
                joint_id = actuator.prismatic_motor().joint_id().id();
                break;
            case mech::Actuator::CONFIG_NOT_SET:
                continue;
        }
        if (!joint_id.empty()) {
            actuator_by_joint[joint_id] = &actuator;
        }
    }

    // --- Phase 3: Create Chrono system ---
    impl_->system = std::make_unique<ChSystemNSC>();
    impl_->system->SetGravitationalAcceleration(
        ChVector3d(config.gravity[0], config.gravity[1], config.gravity[2]));
    impl_->timestep = config.timestep;

    // --- Solver ---
    switch (config.solver.type) {
        case SolverType::PSOR: {
            auto solver = chrono_types::make_shared<ChSolverPSOR>();
            solver->SetMaxIterations(config.solver.max_iterations);
            solver->SetTolerance(config.solver.tolerance);
            impl_->system->SetSolver(solver);
            break;
        }
        case SolverType::BARZILAI_BORWEIN: {
            auto solver = chrono_types::make_shared<ChSolverBB>();
            solver->SetMaxIterations(config.solver.max_iterations);
            solver->SetTolerance(config.solver.tolerance);
            impl_->system->SetSolver(solver);
            break;
        }
        case SolverType::APGD: {
            auto solver = chrono_types::make_shared<ChSolverAPGD>();
            solver->SetMaxIterations(config.solver.max_iterations);
            solver->SetTolerance(config.solver.tolerance);
            impl_->system->SetSolver(solver);
            break;
        }
        case SolverType::MINRES: {
            auto solver = chrono_types::make_shared<ChSolverMINRES>();
            solver->SetMaxIterations(config.solver.max_iterations);
            solver->SetTolerance(config.solver.tolerance);
            impl_->system->SetSolver(solver);
            break;
        }
    }

    // --- Integrator ---
    switch (config.solver.integrator) {
        case IntegratorType::EULER_IMPLICIT_LINEARIZED:
            impl_->system->SetTimestepperType(ChTimestepper::Type::EULER_IMPLICIT_LINEARIZED);
            break;
        case IntegratorType::HHT:
            impl_->system->SetTimestepperType(ChTimestepper::Type::HHT);
            break;
        case IntegratorType::NEWMARK:
            impl_->system->SetTimestepperType(ChTimestepper::Type::NEWMARK);
            break;
    }

    spdlog::info("Solver: type={}, max_iter={}, tol={:.2e}, integrator={}",
                 solver_type_name(config.solver.type),
                 config.solver.max_iterations,
                 config.solver.tolerance,
                 integrator_type_name(config.solver.integrator));

    // --- Contact material (no collision shapes yet; material stored for future epic) ---
    auto mat = chrono_types::make_shared<ChContactMaterialNSC>();
    mat->SetFriction(static_cast<float>(config.contact.friction));
    mat->SetRestitution(static_cast<float>(config.contact.restitution));
    mat->SetCompliance(static_cast<float>(config.contact.compliance));
    mat->SetDampingF(static_cast<float>(config.contact.damping));
    impl_->contact_material = mat;

    spdlog::info("Contact: friction={:.3f}, restitution={:.3f}, compliance={:.2e}, damping={:.2e}, enabled={}",
                 config.contact.friction, config.contact.restitution,
                 config.contact.compliance, config.contact.damping,
                 config.contact.enable_contact);

    impl_->applied_solver = config.solver;
    impl_->applied_contact = config.contact;

    impl_->body_map.clear();
    impl_->joint_map.clear();
    impl_->point_loads.clear();
    impl_->springs.clear();
    impl_->actuators.clear();
    impl_->initial_poses.clear();
    impl_->current_time = 0.0;
    impl_->step_count = 0;

    for (const auto& body : mechanism.bodies()) {
        const std::string id = body.id().id();
        auto ch_body = chrono_types::make_shared<ChBodyAuxRef>();

        const auto& mp = body.mass_properties();
        ch_body->SetMass(mp.mass());
        ch_body->SetInertiaXX({mp.ixx(), mp.iyy(), mp.izz()});
        ch_body->SetInertiaXY({mp.ixy(), mp.ixz(), mp.iyz()});

        const auto& p = body.pose();
        ChVector3d pos(p.position().x(), p.position().y(), p.position().z());
        ChQuaterniond rot(p.orientation().w(), p.orientation().x(),
                          p.orientation().y(), p.orientation().z());
        ch_body->SetFrameRefToAbs(ChFrame<>(pos, rot));

        const auto& com = mp.center_of_mass();
        ch_body->SetFrameCOMToRef(ChFrame<>(ChVector3d(com.x(), com.y(), com.z())));

        ch_body->SetFixed(body_is_fixed(body));

        impl_->system->AddBody(ch_body);
        impl_->body_map[id] = ch_body;

        BodyPose initial;
        initial.body_id = id;
        initial.position[0] = pos.x();
        initial.position[1] = pos.y();
        initial.position[2] = pos.z();
        initial.orientation[0] = rot.e0();
        initial.orientation[1] = rot.e1();
        initial.orientation[2] = rot.e2();
        initial.orientation[3] = rot.e3();
        impl_->initial_poses[id] = initial;
    }

    // --- Collision shapes (per-geometry, aggregated per-body) ---
    if (config.contact.enable_contact) {
        int collision_shape_count = 0;
        for (const auto& geom : mechanism.geometries()) {
            if (!geom.has_collision_config() ||
                geom.collision_config().shape_type() == mech::COLLISION_SHAPE_TYPE_NONE) {
                continue;
            }

            const std::string body_id = geom.parent_body_id().id();
            auto body_it = impl_->body_map.find(body_id);
            if (body_it == impl_->body_map.end()) continue;

            auto ch_body = body_it->second;
            ch_body->EnableCollision(true);

            const auto& cc = geom.collision_config();
            const auto& lp = geom.local_pose();

            // Shape frame = geometry local_pose + collision offset
            ChVector3d shape_pos(
                lp.position().x() + cc.offset().x(),
                lp.position().y() + cc.offset().y(),
                lp.position().z() + cc.offset().z());
            ChQuaterniond shape_rot(
                lp.orientation().w(), lp.orientation().x(),
                lp.orientation().y(), lp.orientation().z());

            switch (cc.shape_type()) {
                case mech::COLLISION_SHAPE_TYPE_BOX: {
                    ch_body->AddCollisionShape(
                        chrono_types::make_shared<ChCollisionShapeBox>(
                            impl_->contact_material,
                            cc.half_extents().x() * 2.0,
                            cc.half_extents().y() * 2.0,
                            cc.half_extents().z() * 2.0),
                        ChFrame<>(shape_pos, shape_rot));
                    ++collision_shape_count;
                    break;
                }
                case mech::COLLISION_SHAPE_TYPE_SPHERE: {
                    ch_body->AddCollisionShape(
                        chrono_types::make_shared<ChCollisionShapeSphere>(
                            impl_->contact_material, cc.radius()),
                        ChFrame<>(shape_pos, shape_rot));
                    ++collision_shape_count;
                    break;
                }
                case mech::COLLISION_SHAPE_TYPE_CYLINDER: {
                    ch_body->AddCollisionShape(
                        chrono_types::make_shared<ChCollisionShapeCylinder>(
                            impl_->contact_material, cc.radius(), cc.height()),
                        ChFrame<>(shape_pos, shape_rot));
                    ++collision_shape_count;
                    break;
                }
                default:
                    break;
            }
        }
        if (collision_shape_count > 0) {
            spdlog::info("Registered {} collision shape(s) from geometry configs", collision_shape_count);
        }
    } else {
        for (auto& [id, body] : impl_->body_map) {
            body->EnableCollision(false);
        }
        spdlog::info("Contact disabled: collision turned off on all bodies");
    }

    for (const auto& joint : mechanism.joints()) {
        const auto parent_it = datum_lookup.find(joint.parent_datum_id().id());
        const auto child_it = datum_lookup.find(joint.child_datum_id().id());
        if (parent_it == datum_lookup.end() || child_it == datum_lookup.end()) {
            result.error_message = "Joint '" + joint.name() + "' references nonexistent datum";
            impl_->state = SimState::ERROR;
            return result;
        }

        const auto* parent_datum = parent_it->second;
        const auto* child_datum = child_it->second;
        const auto parent_body_proto_it = body_lookup.find(parent_datum->parent_body_id().id());
        const auto child_body_proto_it = body_lookup.find(child_datum->parent_body_id().id());
        const auto parent_body_it = impl_->body_map.find(parent_datum->parent_body_id().id());
        const auto child_body_it = impl_->body_map.find(child_datum->parent_body_id().id());
        if (parent_body_proto_it == body_lookup.end() ||
            child_body_proto_it == body_lookup.end() ||
            parent_body_it == impl_->body_map.end() ||
            child_body_it == impl_->body_map.end()) {
            result.error_message = "Joint '" + joint.name() + "' references nonexistent body";
            impl_->state = SimState::ERROR;
            return result;
        }

        const auto* parent_body_proto = parent_body_proto_it->second;
        auto parent_body = parent_body_it->second;
        auto child_body = child_body_it->second;

        WorldFrame parent_wf = compute_datum_world_frame(parent_body_proto->pose(), parent_datum->local_pose());
        const auto actuator_it = actuator_by_joint.find(joint.id().id());

        std::shared_ptr<ChLink> link;
        if (actuator_it != actuator_by_joint.end()) {
            const auto& actuator = *actuator_it->second;
            if (joint.type() == mech::JOINT_TYPE_REVOLUTE) {
                switch (actuator.revolute_motor().control_mode()) {
                    case mech::ACTUATOR_CONTROL_MODE_POSITION: {
                        auto motor = chrono_types::make_shared<ChLinkMotorRotationAngle>();
                        motor->SetAngleFunction(
                            chrono_types::make_shared<ChFunctionConst>(actuator.revolute_motor().command_value()));
                        motor->Initialize(parent_body, child_body, ChFramed(parent_wf.pos, parent_wf.rot));
                        link = motor;
                        impl_->actuators[actuator.id().id()] = {
                            actuator.id().id(), actuator.name(),
                            static_cast<int>(actuator.revolute_motor().control_mode()),
                            actuator.revolute_motor().command_value(), motor, nullptr};
                        break;
                    }
                    case mech::ACTUATOR_CONTROL_MODE_SPEED: {
                        auto motor = chrono_types::make_shared<ChLinkMotorRotationSpeed>();
                        motor->SetSpeedFunction(
                            chrono_types::make_shared<ChFunctionConst>(actuator.revolute_motor().command_value()));
                        motor->Initialize(parent_body, child_body, ChFramed(parent_wf.pos, parent_wf.rot));
                        link = motor;
                        impl_->actuators[actuator.id().id()] = {
                            actuator.id().id(), actuator.name(),
                            static_cast<int>(actuator.revolute_motor().control_mode()),
                            actuator.revolute_motor().command_value(), motor, nullptr};
                        break;
                    }
                    case mech::ACTUATOR_CONTROL_MODE_EFFORT: {
                        auto motor = chrono_types::make_shared<ChLinkMotorRotationTorque>();
                        motor->SetTorqueFunction(
                            chrono_types::make_shared<ChFunctionConst>(actuator.revolute_motor().command_value()));
                        motor->Initialize(parent_body, child_body, ChFramed(parent_wf.pos, parent_wf.rot));
                        link = motor;
                        impl_->actuators[actuator.id().id()] = {
                            actuator.id().id(), actuator.name(),
                            static_cast<int>(actuator.revolute_motor().control_mode()),
                            actuator.revolute_motor().command_value(), motor, nullptr};
                        break;
                    }
                    default:
                        break;
                }
            } else if (joint.type() == mech::JOINT_TYPE_PRISMATIC) {
                switch (actuator_it->second->prismatic_motor().control_mode()) {
                    case mech::ACTUATOR_CONTROL_MODE_POSITION: {
                        auto motor = chrono_types::make_shared<ChLinkMotorLinearPosition>();
                        motor->SetMotionFunction(
                            chrono_types::make_shared<ChFunctionConst>(actuator.prismatic_motor().command_value()));
                        motor->Initialize(parent_body, child_body, ChFramed(parent_wf.pos, parent_wf.rot));
                        link = motor;
                        impl_->actuators[actuator.id().id()] = {
                            actuator.id().id(), actuator.name(),
                            static_cast<int>(actuator.prismatic_motor().control_mode()),
                            actuator.prismatic_motor().command_value(), nullptr, motor};
                        break;
                    }
                    case mech::ACTUATOR_CONTROL_MODE_SPEED: {
                        auto motor = chrono_types::make_shared<ChLinkMotorLinearSpeed>();
                        motor->SetSpeedFunction(
                            chrono_types::make_shared<ChFunctionConst>(actuator.prismatic_motor().command_value()));
                        motor->Initialize(parent_body, child_body, ChFramed(parent_wf.pos, parent_wf.rot));
                        link = motor;
                        impl_->actuators[actuator.id().id()] = {
                            actuator.id().id(), actuator.name(),
                            static_cast<int>(actuator.prismatic_motor().control_mode()),
                            actuator.prismatic_motor().command_value(), nullptr, motor};
                        break;
                    }
                    case mech::ACTUATOR_CONTROL_MODE_EFFORT: {
                        auto motor = chrono_types::make_shared<ChLinkMotorLinearForce>();
                        motor->SetForceFunction(
                            chrono_types::make_shared<ChFunctionConst>(actuator.prismatic_motor().command_value()));
                        motor->Initialize(parent_body, child_body, ChFramed(parent_wf.pos, parent_wf.rot));
                        link = motor;
                        impl_->actuators[actuator.id().id()] = {
                            actuator.id().id(), actuator.name(),
                            static_cast<int>(actuator.prismatic_motor().control_mode()),
                            actuator.prismatic_motor().command_value(), nullptr, motor};
                        break;
                    }
                    default:
                        break;
                }
            }

            // Motors embed the joint constraint (SpindleConstraint::REVOLUTE /
            // GuideConstraint::PRISMATIC by default). If the joint also defines
            // limits or damping, those are silently ignored when a motor is active.
            if (link) {
                bool has_limits = false;
                bool has_damping = false;
                if (joint.type() == mech::JOINT_TYPE_REVOLUTE) {
                    has_limits = joint.has_revolute() && joint.revolute().has_angle_limit();
                    has_damping = joint.has_revolute() && joint.revolute().damping() > 0.0;
                } else if (joint.type() == mech::JOINT_TYPE_PRISMATIC) {
                    has_limits = joint.has_prismatic() && joint.prismatic().has_translation_limit();
                    has_damping = joint.has_prismatic() && joint.prismatic().damping() > 0.0;
                }
                if (has_limits || has_damping) {
                    result.diagnostics.push_back(
                        "Joint '" + joint.name() + "': limits/damping ignored when motor is active");
                }
            }
        }

        if (!link) {
            switch (joint.type()) {

            case mech::JOINT_TYPE_REVOLUTE: {
                auto lock = chrono_types::make_shared<ChLinkLockRevolute>();
                lock->Initialize(parent_body, child_body, ChFramed(parent_wf.pos, parent_wf.rot));
                if (joint.has_revolute() && joint.revolute().has_angle_limit()) {
                    lock->LimitRz().SetActive(true);
                    lock->LimitRz().SetMin(joint.revolute().angle_limit().lower());
                    lock->LimitRz().SetMax(joint.revolute().angle_limit().upper());
                }
                if (joint.has_revolute() && joint.revolute().damping() > 0.0) {
                    lock->ForceRz().SetActive(true);
                    lock->ForceRz().SetDampingCoefficient(joint.revolute().damping());
                }
                link = lock;
                break;
            }

            case mech::JOINT_TYPE_PRISMATIC: {
                auto lock = chrono_types::make_shared<ChLinkLockPrismatic>();
                lock->Initialize(parent_body, child_body, ChFramed(parent_wf.pos, parent_wf.rot));
                if (joint.has_prismatic() && joint.prismatic().has_translation_limit()) {
                    lock->LimitZ().SetActive(true);
                    lock->LimitZ().SetMin(joint.prismatic().translation_limit().lower());
                    lock->LimitZ().SetMax(joint.prismatic().translation_limit().upper());
                }
                if (joint.has_prismatic() && joint.prismatic().damping() > 0.0) {
                    lock->ForceZ().SetActive(true);
                    lock->ForceZ().SetDampingCoefficient(joint.prismatic().damping());
                }
                link = lock;
                break;
            }

            case mech::JOINT_TYPE_FIXED: {
                auto lock = chrono_types::make_shared<ChLinkLockLock>();
                lock->Initialize(parent_body, child_body, ChFramed(parent_wf.pos, parent_wf.rot));
                link = lock;
                break;
            }

            case mech::JOINT_TYPE_SPHERICAL: {
                auto lock = chrono_types::make_shared<ChLinkLockSpherical>();
                lock->Initialize(parent_body, child_body, ChFramed(parent_wf.pos, parent_wf.rot));
                link = lock;
                break;
            }

            case mech::JOINT_TYPE_CYLINDRICAL: {
                auto lock = chrono_types::make_shared<ChLinkLockCylindrical>();
                lock->Initialize(parent_body, child_body, ChFramed(parent_wf.pos, parent_wf.rot));
                if (joint.has_cylindrical() && joint.cylindrical().has_translation_limit()) {
                    lock->LimitZ().SetActive(true);
                    lock->LimitZ().SetMin(joint.cylindrical().translation_limit().lower());
                    lock->LimitZ().SetMax(joint.cylindrical().translation_limit().upper());
                }
                if (joint.has_cylindrical() && joint.cylindrical().has_rotation_limit()) {
                    lock->LimitRz().SetActive(true);
                    lock->LimitRz().SetMin(joint.cylindrical().rotation_limit().lower());
                    lock->LimitRz().SetMax(joint.cylindrical().rotation_limit().upper());
                }
                if (joint.has_cylindrical() && joint.cylindrical().translational_damping() > 0.0) {
                    lock->ForceZ().SetActive(true);
                    lock->ForceZ().SetDampingCoefficient(joint.cylindrical().translational_damping());
                }
                if (joint.has_cylindrical() && joint.cylindrical().rotational_damping() > 0.0) {
                    lock->ForceRz().SetActive(true);
                    lock->ForceRz().SetDampingCoefficient(joint.cylindrical().rotational_damping());
                }
                link = lock;
                break;
            }

            case mech::JOINT_TYPE_PLANAR: {
                auto lock = chrono_types::make_shared<ChLinkLockPlanar>();
                lock->Initialize(parent_body, child_body, ChFramed(parent_wf.pos, parent_wf.rot));
                link = lock;
                break;
            }

            case mech::JOINT_TYPE_POINT_LINE: {
                auto lock = chrono_types::make_shared<ChLinkLockPointLine>();
                lock->Initialize(parent_body, child_body, ChFramed(parent_wf.pos, parent_wf.rot));
                link = lock;
                break;
            }

            case mech::JOINT_TYPE_POINT_PLANE: {
                auto lock = chrono_types::make_shared<ChLinkLockPointPlane>();
                lock->Initialize(parent_body, child_body, ChFramed(parent_wf.pos, parent_wf.rot));
                link = lock;
                break;
            }

            case mech::JOINT_TYPE_UNIVERSAL: {
                auto universal = chrono_types::make_shared<ChLinkUniversal>();
                universal->Initialize(parent_body, child_body, ChFrame<>(parent_wf.pos, parent_wf.rot));
                link = universal;
                if (joint.has_universal() &&
                    (joint.universal().has_rotation_x_limit() || joint.universal().has_rotation_y_limit())) {
                    result.diagnostics.push_back(
                        "Joint '" + joint.name() + "': universal limits are not enforced in this pass.");
                }
                break;
            }

            case mech::JOINT_TYPE_DISTANCE: {
                auto distance = chrono_types::make_shared<ChLinkDistance>();
                const auto& p1 = parent_datum->local_pose().position();
                const auto& p2 = child_datum->local_pose().position();
                distance->Initialize(parent_body, child_body, true,
                                     {p1.x(), p1.y(), p1.z()},
                                     {p2.x(), p2.y(), p2.z()},
                                     true);
                link = distance;
                if (joint.has_distance() && joint.distance().has_distance_limit()) {
                    result.diagnostics.push_back(
                        "Joint '" + joint.name() + "': distance limit range is approximated as a fixed distance in this pass.");
                }
                break;
            }

            default:
                break;
            } // switch
        }

        if (!link) {
            result.error_message = "Unsupported joint type during compile";
            impl_->state = SimState::ERROR;
            return result;
        }

        impl_->system->AddLink(link);
        impl_->joint_map[joint.id().id()] = {link, static_cast<int>(joint.type()), joint.name()};
    }

    for (const auto& load : mechanism.loads()) {
        switch (load.config_case()) {
            case mech::Load::kPointForce: {
                const auto datum_it = datum_lookup.find(load.point_force().datum_id().id());
                if (datum_it == datum_lookup.end()) {
                    result.error_message = "Load '" + load.name() + "' references nonexistent datum";
                    impl_->state = SimState::ERROR;
                    return result;
                }
                const auto* datum = datum_it->second;
                auto body = impl_->body_map[datum->parent_body_id().id()];
                const auto& p = datum->local_pose().position();
                impl_->point_loads[load.id().id()] = {
                    load.id().id(), load.name(), body,
                    vec3_to_chrono(load.point_force().vector()),
                    {p.x(), p.y(), p.z()},
                    load.point_force().reference_frame() != mech::REFERENCE_FRAME_WORLD,
                    false};
                break;
            }
            case mech::Load::kPointTorque: {
                const auto datum_it = datum_lookup.find(load.point_torque().datum_id().id());
                if (datum_it == datum_lookup.end()) {
                    result.error_message = "Load '" + load.name() + "' references nonexistent datum";
                    impl_->state = SimState::ERROR;
                    return result;
                }
                const auto* datum = datum_it->second;
                auto body = impl_->body_map[datum->parent_body_id().id()];
                const auto& p = datum->local_pose().position();
                impl_->point_loads[load.id().id()] = {
                    load.id().id(), load.name(), body,
                    vec3_to_chrono(load.point_torque().vector()),
                    {p.x(), p.y(), p.z()},
                    load.point_torque().reference_frame() != mech::REFERENCE_FRAME_WORLD,
                    true};
                break;
            }
            case mech::Load::kLinearSpringDamper: {
                const auto parent_it = datum_lookup.find(load.linear_spring_damper().parent_datum_id().id());
                const auto child_it = datum_lookup.find(load.linear_spring_damper().child_datum_id().id());
                if (parent_it == datum_lookup.end() || child_it == datum_lookup.end()) {
                    result.error_message = "Spring load '" + load.name() + "' references nonexistent datum";
                    impl_->state = SimState::ERROR;
                    return result;
                }
                auto spring = chrono_types::make_shared<ChLinkTSDA>();
                const auto& p1 = parent_it->second->local_pose().position();
                const auto& p2 = child_it->second->local_pose().position();
                spring->Initialize(impl_->body_map[parent_it->second->parent_body_id().id()],
                                   impl_->body_map[child_it->second->parent_body_id().id()],
                                   true,
                                   {p1.x(), p1.y(), p1.z()},
                                   {p2.x(), p2.y(), p2.z()});
                spring->SetRestLength(load.linear_spring_damper().rest_length());
                spring->SetSpringCoefficient(load.linear_spring_damper().stiffness());
                spring->SetDampingCoefficient(load.linear_spring_damper().damping());
                impl_->system->AddLink(spring);
                impl_->springs[load.id().id()] = {load.id().id(), load.name(), spring};
                break;
            }
            case mech::Load::CONFIG_NOT_SET:
                result.error_message = "Load config is required";
                impl_->state = SimState::ERROR;
                return result;
        }
    }

    // Populate deprecated string diagnostics from structured diagnostics
    for (const auto& sd : result.structured_diagnostics) {
        result.diagnostics.push_back(sd.message);
    }

    const auto t_end = clock::now();
    const auto total_ms = std::chrono::duration_cast<std::chrono::milliseconds>(t_end - t_start).count();
    spdlog::debug("compile: total={}ms bodies={} joints={} loads={} actuators={}",
        total_ms,
        mechanism.bodies_size(),
        mechanism.joints_size(),
        mechanism.loads_size(),
        mechanism.actuators_size());

    result.success = true;
    impl_->state = SimState::IDLE;
    return result;
}

void SimulationRuntime::step(double dt) {
    if (!impl_->system) {
        return;
    }

    impl_->state = SimState::RUNNING;
    for (auto& [_, body] : impl_->body_map) {
        body->EmptyAccumulators();
    }
    for (const auto& [_, load] : impl_->point_loads) {
        if (load.torque_only) {
            load.body->AccumulateTorque(load.vector, load.local_frame);
        } else {
            if (load.local_frame) {
                load.body->AccumulateForce(load.vector, load.point_local, true);
            } else {
                const auto world_point = load.body->TransformPointLocalToParent(load.point_local);
                load.body->AccumulateForce(load.vector, world_point, false);
            }
        }
    }

    impl_->system->DoStepDynamics(dt);
    impl_->current_time += dt;
    impl_->step_count++;
}

void SimulationRuntime::pause() {
    if (impl_->system) {
        impl_->state = SimState::PAUSED;
    }
}

void SimulationRuntime::reset() {
    if (!impl_->system) {
        return;
    }

    for (auto& [id, body] : impl_->body_map) {
        const auto pose_it = impl_->initial_poses.find(id);
        if (pose_it == impl_->initial_poses.end()) {
            continue;
        }
        const auto& pose = pose_it->second;
        if (auto aux = std::dynamic_pointer_cast<ChBodyAuxRef>(body)) {
            aux->SetFrameRefToAbs(ChFrame<>(
                ChVector3d(pose.position[0], pose.position[1], pose.position[2]),
                ChQuaterniond(pose.orientation[0], pose.orientation[1], pose.orientation[2], pose.orientation[3])));
        } else {
            body->SetPos({pose.position[0], pose.position[1], pose.position[2]});
            body->SetRot({pose.orientation[0], pose.orientation[1], pose.orientation[2], pose.orientation[3]});
        }
        body->SetPosDt({0, 0, 0});
        body->SetRotDt({1, 0, 0, 0});
        body->EmptyAccumulators();
    }

    impl_->current_time = 0.0;
    impl_->step_count = 0;
    impl_->state = SimState::IDLE;
}

SimState SimulationRuntime::getState() const {
    return impl_->state;
}

double SimulationRuntime::getCurrentTime() const {
    return impl_->current_time;
}

uint64_t SimulationRuntime::getStepCount() const {
    return impl_->step_count;
}

SolverConfig SimulationRuntime::getAppliedSolverConfig() const {
    return impl_->applied_solver;
}

ContactConfig SimulationRuntime::getAppliedContactConfig() const {
    // Read back from the actual Chrono material for verification
    ContactConfig c = impl_->applied_contact;
    if (impl_->contact_material) {
        c.friction = impl_->contact_material->GetSlidingFriction();
        c.restitution = impl_->contact_material->GetRestitution();
        c.compliance = impl_->contact_material->GetCompliance();
        c.damping = impl_->contact_material->GetDampingF();
    }
    return c;
}

std::vector<BodyPose> SimulationRuntime::getBodyPoses() const {
    std::vector<BodyPose> poses;
    poses.reserve(impl_->body_map.size());
    for (const auto& [id, body] : impl_->body_map) {
        BodyPose pose;
        pose.body_id = id;
        const auto& ref = body->GetFrameRefToAbs();
        const auto pos = ref.GetPos();
        const auto rot = ref.GetRot();
        pose.position[0] = pos.x();
        pose.position[1] = pos.y();
        pose.position[2] = pos.z();
        pose.orientation[0] = rot.e0();
        pose.orientation[1] = rot.e1();
        pose.orientation[2] = rot.e2();
        pose.orientation[3] = rot.e3();
        poses.push_back(pose);
    }
    return poses;
}

std::vector<JointState> SimulationRuntime::getJointStates() const {
    std::vector<JointState> states;
    for (const auto& [id, entry] : impl_->joint_map) {
        JointState state{};
        state.joint_id = id;
        const auto reaction = entry.link->GetReaction2();
        state.reaction_force[0] = reaction.force.x();
        state.reaction_force[1] = reaction.force.y();
        state.reaction_force[2] = reaction.force.z();
        state.reaction_torque[0] = reaction.torque.x();
        state.reaction_torque[1] = reaction.torque.y();
        state.reaction_torque[2] = reaction.torque.z();

        if (entry.joint_type == mech::JOINT_TYPE_REVOLUTE) {
            if (auto motor = std::dynamic_pointer_cast<ChLinkMotorRotation>(entry.link)) {
                state.position = motor->GetMotorAngle();
                state.velocity = motor->GetMotorAngleDt();
            } else if (auto lock = std::dynamic_pointer_cast<ChLinkLock>(entry.link)) {
                const auto& rel_rot = lock->GetRelCoordsys().rot;
                state.position = angle_from_quat_z(rel_rot);
                state.velocity = lock->GetRelativeAngVel().z();
            }
            states.push_back(state);
        } else if (entry.joint_type == mech::JOINT_TYPE_PRISMATIC) {
            if (auto motor = std::dynamic_pointer_cast<ChLinkMotorLinear>(entry.link)) {
                state.position = motor->GetMotorPos();
                state.velocity = motor->GetMotorPosDt();
            } else if (auto lock = std::dynamic_pointer_cast<ChLinkLock>(entry.link)) {
                state.position = lock->GetRelCoordsys().pos.z();
                state.velocity = lock->GetRelCoordsysDt().pos.z();
            }
            states.push_back(state);
        }
    }
    return states;
}

std::vector<ChannelDescriptor> SimulationRuntime::getChannelDescriptors() const {
    std::vector<ChannelDescriptor> descriptors;

    for (const auto& [id, entry] : impl_->joint_map) {
        const std::string prefix = "joint/" + id + "/";
        switch (entry.joint_type) {
            case mech::JOINT_TYPE_REVOLUTE:
                append_scalar_channel(descriptors, prefix + "coord/rot_z", entry.name + " Rotation", "rad");
                append_scalar_channel(descriptors, prefix + "coord_rate/rot_z", entry.name + " Angular Velocity", "rad/s");
                break;
            case mech::JOINT_TYPE_PRISMATIC:
                append_scalar_channel(descriptors, prefix + "coord/trans_z", entry.name + " Translation", "m");
                append_scalar_channel(descriptors, prefix + "coord_rate/trans_z", entry.name + " Translation Rate", "m/s");
                break;
            case mech::JOINT_TYPE_CYLINDRICAL:
                append_scalar_channel(descriptors, prefix + "coord/trans_z", entry.name + " Translation", "m");
                append_scalar_channel(descriptors, prefix + "coord_rate/trans_z", entry.name + " Translation Rate", "m/s");
                append_scalar_channel(descriptors, prefix + "coord/rot_z", entry.name + " Rotation", "rad");
                append_scalar_channel(descriptors, prefix + "coord_rate/rot_z", entry.name + " Angular Velocity", "rad/s");
                break;
            case mech::JOINT_TYPE_PLANAR:
                append_scalar_channel(descriptors, prefix + "coord/trans_x", entry.name + " Translation X", "m");
                append_scalar_channel(descriptors, prefix + "coord/trans_z", entry.name + " Translation Z", "m");
                append_scalar_channel(descriptors, prefix + "coord_rate/trans_x", entry.name + " Translation Rate X", "m/s");
                append_scalar_channel(descriptors, prefix + "coord_rate/trans_z", entry.name + " Translation Rate Z", "m/s");
                break;
            case mech::JOINT_TYPE_SPHERICAL:
            case mech::JOINT_TYPE_UNIVERSAL:
                append_vector_channel(descriptors, prefix + "coord/rot_vec", entry.name + " Rotation Vector", "rad");
                append_vector_channel(descriptors, prefix + "coord_rate/ang_vel", entry.name + " Angular Velocity", "rad/s");
                break;
            case mech::JOINT_TYPE_DISTANCE:
                append_scalar_channel(descriptors, prefix + "coord/distance", entry.name + " Distance", "m");
                append_scalar_channel(descriptors, prefix + "coord_rate/distance", entry.name + " Distance Rate", "m/s");
                break;
            default:
                break;
        }
        append_vector_channel(descriptors, prefix + "reaction_force", entry.name + " Reaction Force", "N");
        append_vector_channel(descriptors, prefix + "reaction_torque", entry.name + " Reaction Torque", "Nm");
    }

    for (const auto& [id, load] : impl_->point_loads) {
        const auto prefix = "load/" + id + "/";
        append_vector_channel(descriptors, prefix + (load.torque_only ? "applied_torque" : "applied_force"),
                              load.name + (load.torque_only ? " Torque" : " Force"),
                              load.torque_only ? "Nm" : "N");
    }

    for (const auto& [id, spring] : impl_->springs) {
        const auto prefix = "load/" + id + "/";
        append_scalar_channel(descriptors, prefix + "length", spring.name + " Length", "m");
        append_scalar_channel(descriptors, prefix + "length_rate", spring.name + " Length Rate", "m/s");
        append_scalar_channel(descriptors, prefix + "force", spring.name + " Force", "N");
    }

    for (const auto& [id, actuator] : impl_->actuators) {
        const auto prefix = "actuator/" + id + "/";
        append_scalar_channel(descriptors, prefix + "command", actuator.name + " Command", "");
        append_scalar_channel(descriptors, prefix + "effort", actuator.name + " Effort",
                              actuator.rotation_motor ? "Nm" : "N");
    }

    return descriptors;
}

std::vector<ChannelValue> SimulationRuntime::getChannelValues() const {
    std::vector<ChannelValue> values;

    for (const auto& [id, entry] : impl_->joint_map) {
        const auto prefix = "joint/" + id + "/";
        const auto reaction = entry.link->GetReaction2();
        values.push_back(make_vector_value(prefix + "reaction_force", reaction.force));
        values.push_back(make_vector_value(prefix + "reaction_torque", reaction.torque));

        if (entry.joint_type == mech::JOINT_TYPE_REVOLUTE) {
            double pos = 0.0;
            double vel = 0.0;
            if (auto motor = std::dynamic_pointer_cast<ChLinkMotorRotation>(entry.link)) {
                pos = motor->GetMotorAngle();
                vel = motor->GetMotorAngleDt();
            } else if (auto lock = std::dynamic_pointer_cast<ChLinkLock>(entry.link)) {
                pos = angle_from_quat_z(lock->GetRelCoordsys().rot);
                vel = lock->GetRelativeAngVel().z();
            }
            values.push_back(make_scalar_value(prefix + "coord/rot_z", pos));
            values.push_back(make_scalar_value(prefix + "coord_rate/rot_z", vel));
        } else if (entry.joint_type == mech::JOINT_TYPE_PRISMATIC) {
            double pos = 0.0;
            double vel = 0.0;
            if (auto motor = std::dynamic_pointer_cast<ChLinkMotorLinear>(entry.link)) {
                pos = motor->GetMotorPos();
                vel = motor->GetMotorPosDt();
            } else if (auto lock = std::dynamic_pointer_cast<ChLinkLock>(entry.link)) {
                pos = lock->GetRelCoordsys().pos.z();
                vel = lock->GetRelCoordsysDt().pos.z();
            }
            values.push_back(make_scalar_value(prefix + "coord/trans_z", pos));
            values.push_back(make_scalar_value(prefix + "coord_rate/trans_z", vel));
        } else if (entry.joint_type == mech::JOINT_TYPE_CYLINDRICAL) {
            if (auto lock = std::dynamic_pointer_cast<ChLinkLock>(entry.link)) {
                values.push_back(make_scalar_value(prefix + "coord/trans_z", lock->GetRelCoordsys().pos.z()));
                values.push_back(make_scalar_value(prefix + "coord_rate/trans_z", lock->GetRelCoordsysDt().pos.z()));
                values.push_back(make_scalar_value(prefix + "coord/rot_z", angle_from_quat_z(lock->GetRelCoordsys().rot)));
                values.push_back(make_scalar_value(prefix + "coord_rate/rot_z", lock->GetRelativeAngVel().z()));
            }
        } else if (entry.joint_type == mech::JOINT_TYPE_PLANAR) {
            if (auto lock = std::dynamic_pointer_cast<ChLinkLock>(entry.link)) {
                values.push_back(make_scalar_value(prefix + "coord/trans_x", lock->GetRelCoordsys().pos.x()));
                values.push_back(make_scalar_value(prefix + "coord/trans_z", lock->GetRelCoordsys().pos.z()));
                values.push_back(make_scalar_value(prefix + "coord_rate/trans_x", lock->GetRelCoordsysDt().pos.x()));
                values.push_back(make_scalar_value(prefix + "coord_rate/trans_z", lock->GetRelCoordsysDt().pos.z()));
            }
        } else if (entry.joint_type == mech::JOINT_TYPE_SPHERICAL || entry.joint_type == mech::JOINT_TYPE_UNIVERSAL) {
            if (auto universal = std::dynamic_pointer_cast<ChLinkUniversal>(entry.link)) {
                const auto frame1 = universal->GetFrame1Rel();
                const auto frame2 = universal->GetFrame2Rel();
                ChQuaterniond q = frame2.GetRot().GetConjugate() * frame1.GetRot();
                values.push_back(make_vector_value(prefix + "coord/rot_vec", {q.e1(), q.e2(), q.e3()}));
                values.push_back(make_vector_value(prefix + "coord_rate/ang_vel", reaction.torque));
            } else if (auto lock = std::dynamic_pointer_cast<ChLinkLock>(entry.link)) {
                const auto& rel = lock->GetRelCoordsys();
                values.push_back(make_vector_value(prefix + "coord/rot_vec",
                    {rel.rot.e1(), rel.rot.e2(), rel.rot.e3()}));
                values.push_back(make_vector_value(prefix + "coord_rate/ang_vel", lock->GetRelativeAngVel()));
            }
        } else if (entry.joint_type == mech::JOINT_TYPE_DISTANCE) {
            if (auto distance = std::dynamic_pointer_cast<ChLinkDistance>(entry.link)) {
                values.push_back(make_scalar_value(prefix + "coord/distance", distance->GetCurrentDistance()));
                values.push_back(make_scalar_value(prefix + "coord_rate/distance", 0.0));
            }
        }
    }

    for (const auto& [id, load] : impl_->point_loads) {
        values.push_back(make_vector_value("load/" + id + "/" + (load.torque_only ? "applied_torque" : "applied_force"),
                                           load.vector));
    }

    for (const auto& [id, spring] : impl_->springs) {
        values.push_back(make_scalar_value("load/" + id + "/length", spring.link->GetLength()));
        values.push_back(make_scalar_value("load/" + id + "/length_rate", spring.link->GetVelocity()));
        values.push_back(make_scalar_value("load/" + id + "/force", spring.link->GetForce()));
    }

    for (const auto& [id, actuator] : impl_->actuators) {
        values.push_back(make_scalar_value("actuator/" + id + "/command", actuator.command_value));
        if (actuator.rotation_motor) {
            values.push_back(make_scalar_value("actuator/" + id + "/effort",
                                               actuator.rotation_motor->GetMotorTorque()));
        } else if (actuator.linear_motor) {
            values.push_back(make_scalar_value("actuator/" + id + "/effort",
                                               actuator.linear_motor->GetMotorForce()));
        }
    }

    return values;
}

} // namespace motionlab::engine
