#include "mechanism_state.h"

#include <cmath>
#include <array>
#include <cstring>
#include <set>

#include "engine/log.h"
#include "pose_math.h"
#include "uuid.h"

namespace motionlab::engine {

namespace mech = motionlab::mechanism;

namespace {

struct MassContribution {
    double mass = 0.0;
    std::array<double, 3> com = {0.0, 0.0, 0.0};
    double inertia[3][3] = {
        {0.0, 0.0, 0.0},
        {0.0, 0.0, 0.0},
        {0.0, 0.0, 0.0},
    };
};

std::string make_range_error(const mech::Range& range, const std::string& label) {
    if (range.lower() > range.upper()) {
        return label + " lower limit must be <= upper limit";
    }
    return {};
}

// Quaternion multiply: q = (w, x, y, z)
void quat_mul(const double a[4], const double b[4], double out[4]) {
    out[0] = a[0]*b[0] - a[1]*b[1] - a[2]*b[2] - a[3]*b[3];
    out[1] = a[0]*b[1] + a[1]*b[0] + a[2]*b[3] - a[3]*b[2];
    out[2] = a[0]*b[2] - a[1]*b[3] + a[2]*b[0] + a[3]*b[1];
    out[3] = a[0]*b[3] + a[1]*b[2] - a[2]*b[1] + a[3]*b[0];
}

// Conjugate (inverse for unit quaternion)
void quat_conj(const double q[4], double out[4]) {
    out[0] = q[0]; out[1] = -q[1]; out[2] = -q[2]; out[3] = -q[3];
}

// Rotate vector by quaternion: q * (0,v) * q^-1
void quat_rotate(const double q[4], const double v[3], double out[3]) {
    double qv[4] = {0, v[0], v[1], v[2]};
    double qc[4]; quat_conj(q, qc);
    double tmp[4]; quat_mul(q, qv, tmp);
    double result[4]; quat_mul(tmp, qc, result);
    out[0] = result[1]; out[1] = result[2]; out[2] = result[3];
}

void quat_to_matrix(const double q[4], double out[3][3]) {
    const double w = q[0];
    const double x = q[1];
    const double y = q[2];
    const double z = q[3];

    out[0][0] = 1.0 - 2.0 * (y * y + z * z);
    out[0][1] = 2.0 * (x * y - z * w);
    out[0][2] = 2.0 * (x * z + y * w);
    out[1][0] = 2.0 * (x * y + z * w);
    out[1][1] = 1.0 - 2.0 * (x * x + z * z);
    out[1][2] = 2.0 * (y * z - x * w);
    out[2][0] = 2.0 * (x * z - y * w);
    out[2][1] = 2.0 * (y * z + x * w);
    out[2][2] = 1.0 - 2.0 * (x * x + y * y);
}

void mass_properties_to_tensor(const mech::MassProperties& mp, double out[3][3]) {
    out[0][0] = mp.ixx();
    out[0][1] = mp.ixy();
    out[0][2] = mp.ixz();
    out[1][0] = mp.ixy();
    out[1][1] = mp.iyy();
    out[1][2] = mp.iyz();
    out[2][0] = mp.ixz();
    out[2][1] = mp.iyz();
    out[2][2] = mp.izz();
}

void rotate_tensor(const double orient[4], const double input[3][3], double out[3][3]) {
    double rot[3][3];
    quat_to_matrix(orient, rot);

    double tmp[3][3] = {
        {0.0, 0.0, 0.0},
        {0.0, 0.0, 0.0},
        {0.0, 0.0, 0.0},
    };

    for (int i = 0; i < 3; ++i) {
        for (int j = 0; j < 3; ++j) {
            for (int k = 0; k < 3; ++k) {
                tmp[i][j] += rot[i][k] * input[k][j];
            }
        }
    }

    for (int i = 0; i < 3; ++i) {
        for (int j = 0; j < 3; ++j) {
            out[i][j] = 0.0;
            for (int k = 0; k < 3; ++k) {
                out[i][j] += tmp[i][k] * rot[j][k];
            }
        }
    }
}

MassContribution transform_mass_properties(const mech::MassProperties& mp,
                                           const double pos[3],
                                           const double orient[4]) {
    MassContribution contribution;
    contribution.mass = mp.mass();
    if (contribution.mass <= 0.0) {
        return contribution;
    }

    const double source_com[3] = {
        mp.center_of_mass().x(),
        mp.center_of_mass().y(),
        mp.center_of_mass().z(),
    };
    double rotated_com[3];
    quat_rotate(orient, source_com, rotated_com);
    contribution.com = {
        pos[0] + rotated_com[0],
        pos[1] + rotated_com[1],
        pos[2] + rotated_com[2],
    };

    double source_inertia[3][3];
    mass_properties_to_tensor(mp, source_inertia);
    rotate_tensor(orient, source_inertia, contribution.inertia);
    return contribution;
}

void add_parallel_axis_term(double inertia[3][3], double mass, const std::array<double, 3>& delta) {
    const double dx = delta[0];
    const double dy = delta[1];
    const double dz = delta[2];
    const double d2 = dx * dx + dy * dy + dz * dz;

    inertia[0][0] += mass * (d2 - dx * dx);
    inertia[1][1] += mass * (d2 - dy * dy);
    inertia[2][2] += mass * (d2 - dz * dz);
    inertia[0][1] -= mass * dx * dy;
    inertia[1][0] -= mass * dx * dy;
    inertia[0][2] -= mass * dx * dz;
    inertia[2][0] -= mass * dx * dz;
    inertia[1][2] -= mass * dy * dz;
    inertia[2][1] -= mass * dy * dz;
}

mech::MassProperties aggregate_mass_contributions(const std::vector<MassContribution>& contributions) {
    mech::MassProperties result;

    double total_mass = 0.0;
    double cx = 0.0;
    double cy = 0.0;
    double cz = 0.0;
    for (const auto& contribution : contributions) {
        if (contribution.mass <= 0.0) {
            continue;
        }
        total_mass += contribution.mass;
        cx += contribution.mass * contribution.com[0];
        cy += contribution.mass * contribution.com[1];
        cz += contribution.mass * contribution.com[2];
    }
    if (total_mass <= 0.0) {
        return result;
    }

    cx /= total_mass;
    cy /= total_mass;
    cz /= total_mass;

    double total_inertia[3][3] = {
        {0.0, 0.0, 0.0},
        {0.0, 0.0, 0.0},
        {0.0, 0.0, 0.0},
    };

    for (const auto& contribution : contributions) {
        if (contribution.mass <= 0.0) {
            continue;
        }
        for (int i = 0; i < 3; ++i) {
            for (int j = 0; j < 3; ++j) {
                total_inertia[i][j] += contribution.inertia[i][j];
            }
        }
        add_parallel_axis_term(total_inertia, contribution.mass, {
            contribution.com[0] - cx,
            contribution.com[1] - cy,
            contribution.com[2] - cz,
        });
    }

    result.set_mass(total_mass);
    result.mutable_center_of_mass()->set_x(cx);
    result.mutable_center_of_mass()->set_y(cy);
    result.mutable_center_of_mass()->set_z(cz);
    result.set_ixx(total_inertia[0][0]);
    result.set_iyy(total_inertia[1][1]);
    result.set_izz(total_inertia[2][2]);
    result.set_ixy(total_inertia[0][1]);
    result.set_ixz(total_inertia[0][2]);
    result.set_iyz(total_inertia[1][2]);
    return result;
}

} // namespace

mech::Pose MechanismState::make_pose(const double pos[3], const double orient[4]) {
    mech::Pose pose;
    pose.mutable_position()->set_x(pos[0]);
    pose.mutable_position()->set_y(pos[1]);
    pose.mutable_position()->set_z(pos[2]);
    pose.mutable_orientation()->set_w(orient[0]);
    pose.mutable_orientation()->set_x(orient[1]);
    pose.mutable_orientation()->set_y(orient[2]);
    pose.mutable_orientation()->set_z(orient[3]);
    return pose;
}

// ──────────────────────────────────────────────
// Body lifecycle
// ──────────────────────────────────────────────

void MechanismState::add_body(const std::string& id, const std::string& name) {
    double pos[3] = {0.0, 0.0, 0.0};
    double orient[4] = {1.0, 0.0, 0.0, 0.0};
    double com[3] = {0.0, 0.0, 0.0};
    double inertia[6] = {0.0, 0.0, 0.0, 0.0, 0.0, 0.0};
    add_body(id, name, pos, orient, 0.0, com, inertia, false);
}

void MechanismState::add_body(const std::string& id, const std::string& name,
                              const double pos[3], const double orient[4],
                              double mass, const double com[3], const double inertia[6],
                              bool is_fixed) {
    mech::Body body;
    body.mutable_id()->set_id(id);
    body.set_name(name);
    *body.mutable_pose() = make_pose(pos, orient);

    auto* mp = body.mutable_mass_properties();
    mp->set_mass(mass);
    mp->mutable_center_of_mass()->set_x(com[0]);
    mp->mutable_center_of_mass()->set_y(com[1]);
    mp->mutable_center_of_mass()->set_z(com[2]);
    mp->set_ixx(inertia[0]);
    mp->set_iyy(inertia[1]);
    mp->set_izz(inertia[2]);
    mp->set_ixy(inertia[3]);
    mp->set_ixz(inertia[4]);
    mp->set_iyz(inertia[5]);
    body.set_is_fixed(is_fixed);
    body.set_motion_type(is_fixed ? mech::MOTION_TYPE_FIXED : mech::MOTION_TYPE_DYNAMIC);
    bodies_[id] = std::move(body);
}

std::string MechanismState::create_body(const std::string& name,
                                         const double pos[3], const double orient[4],
                                         const mech::MassProperties* mass,
                                         bool is_fixed) {
    std::string id = generate_uuidv7();
    spdlog::debug("MechanismState::create_body id={} name='{}' is_fixed={} mass_override={}",
                  id, name, is_fixed, mass != nullptr);
    mech::Body body;
    body.mutable_id()->set_id(id);
    body.set_name(name);
    *body.mutable_pose() = make_pose(pos, orient);
    if (mass) {
        *body.mutable_mass_properties() = *mass;
        body.set_mass_override(true);
        spdlog::debug("  mass={:.4f}", mass->mass());
    }
    body.set_is_fixed(is_fixed);
    body.set_motion_type(is_fixed ? mech::MOTION_TYPE_FIXED : mech::MOTION_TYPE_DYNAMIC);
    bodies_[id] = std::move(body);
    spdlog::debug("  bodies count={}", bodies_.size());
    return id;
}

bool MechanismState::delete_body(const std::string& body_id) {
    auto it = bodies_.find(body_id);
    if (it == bodies_.end()) return false;

    // Cascade: collect and remove geometries attached to this body
    std::vector<std::string> geom_ids;
    for (const auto& [gid, geom] : geometries_) {
        if (geom.parent_body_id().id() == body_id) {
            geom_ids.push_back(gid);
        }
    }
    for (const auto& gid : geom_ids) {
        geometries_.erase(gid);
    }

    // Cascade: collect datums on this body
    std::vector<std::string> datum_ids;
    for (const auto& [did, datum] : datums_) {
        if (datum.parent_body_id().id() == body_id) {
            datum_ids.push_back(did);
        }
    }

    // Cascade: collect joints referencing those datums
    std::vector<std::string> joint_ids;
    for (const auto& [jid, joint] : joints_) {
        for (const auto& did : datum_ids) {
            if (joint.parent_datum_id().id() == did || joint.child_datum_id().id() == did) {
                joint_ids.push_back(jid);
                break;
            }
        }
    }

    // Cascade: collect actuators referencing those joints
    std::vector<std::string> actuator_ids;
    for (const auto& [aid, actuator] : actuators_) {
        for (const auto& jid : joint_ids) {
            bool matches = false;
            switch (actuator.config_case()) {
                case mech::Actuator::kRevoluteMotor:
                    matches = actuator.revolute_motor().joint_id().id() == jid;
                    break;
                case mech::Actuator::kPrismaticMotor:
                    matches = actuator.prismatic_motor().joint_id().id() == jid;
                    break;
                default:
                    break;
            }
            if (matches) {
                actuator_ids.push_back(aid);
                break;
            }
        }
    }

    // Cascade: collect loads referencing those datums
    std::vector<std::string> load_ids;
    for (const auto& [lid, load] : loads_) {
        for (const auto& did : datum_ids) {
            bool matches = false;
            switch (load.config_case()) {
                case mech::Load::kPointForce:
                    matches = load.point_force().datum_id().id() == did;
                    break;
                case mech::Load::kPointTorque:
                    matches = load.point_torque().datum_id().id() == did;
                    break;
                case mech::Load::kLinearSpringDamper:
                    matches = load.linear_spring_damper().parent_datum_id().id() == did ||
                              load.linear_spring_damper().child_datum_id().id() == did;
                    break;
                default:
                    break;
            }
            if (matches) {
                load_ids.push_back(lid);
                break;
            }
        }
    }

    // Delete in reverse-dependency order
    for (const auto& id : actuator_ids) actuators_.erase(id);
    for (const auto& id : load_ids) loads_.erase(id);
    for (const auto& id : joint_ids) joints_.erase(id);
    for (const auto& id : datum_ids) datums_.erase(id);
    bodies_.erase(it);

    return true;
}

bool MechanismState::rename_body(const std::string& body_id, const std::string& new_name) {
    auto it = bodies_.find(body_id);
    if (it == bodies_.end()) return false;
    it->second.set_name(new_name);
    return true;
}

bool MechanismState::has_body(const std::string& id) const {
    return bodies_.contains(id);
}

const MechanismState::BodyEntry* MechanismState::get_body(const std::string& id) const {
    auto it = bodies_.find(id);
    return it != bodies_.end() ? &it->second : nullptr;
}

bool MechanismState::set_body_fixed(const std::string& id, bool is_fixed) {
    auto it = bodies_.find(id);
    if (it == bodies_.end()) {
        return false;
    }
    it->second.set_is_fixed(is_fixed);
    it->second.set_motion_type(is_fixed ? mech::MOTION_TYPE_FIXED : mech::MOTION_TYPE_DYNAMIC);
    return true;
}

bool MechanismState::set_body_pose(const std::string& id, const double pos[3], const double orient[4]) {
    auto it = bodies_.find(id);
    if (it == bodies_.end()) return false;
    auto* pose = it->second.mutable_pose();
    auto* p = pose->mutable_position();
    p->set_x(pos[0]);
    p->set_y(pos[1]);
    p->set_z(pos[2]);
    auto* o = pose->mutable_orientation();
    o->set_w(orient[0]);
    o->set_x(orient[1]);
    o->set_y(orient[2]);
    o->set_z(orient[3]);
    return true;
}

size_t MechanismState::body_count() const {
    return bodies_.size();
}

// ──────────────────────────────────────────────
// Geometry CRUD
// ──────────────────────────────────────────────

MechanismState::GeometryResult MechanismState::add_geometry(
    const std::string& id, const std::string& name,
    const std::string& parent_body_id,
    const double pos[3], const double orient[4],
    const mech::MassProperties& computed_mass,
    const mech::AssetReference* source_asset_ref,
    uint32_t face_count,
    const mech::PrimitiveSource* primitive_source) {
    if (!has_body(parent_body_id)) {
        return {{}, {}, "Parent body not found: " + parent_body_id};
    }

    mech::Geometry geom;
    geom.mutable_id()->set_id(id);
    geom.set_name(name);
    geom.mutable_parent_body_id()->set_id(parent_body_id);
    *geom.mutable_local_pose() = make_pose(pos, orient);
    *geom.mutable_computed_mass_properties() = computed_mass;
    if (source_asset_ref) {
        *geom.mutable_source_asset_ref() = *source_asset_ref;
    }
    if (primitive_source) {
        *geom.mutable_primitive_source() = *primitive_source;
    }
    geom.set_face_count(face_count);
    geometries_[id] = geom;

    // Recompute parent body mass if no override
    update_body_aggregate_mass(parent_body_id);

    return {geom, {}, {}};
}

bool MechanismState::remove_geometry(const std::string& geometry_id) {
    auto it = geometries_.find(geometry_id);
    if (it == geometries_.end()) return false;

    std::string parent_id = it->second.parent_body_id().id();
    geometries_.erase(it);

    if (!parent_id.empty()) {
        update_body_aggregate_mass(parent_id);
    }
    return true;
}

bool MechanismState::rename_geometry(const std::string& geometry_id, const std::string& new_name) {
    auto it = geometries_.find(geometry_id);
    if (it == geometries_.end()) return false;
    it->second.set_name(new_name);
    return true;
}

MechanismState::GeometryResult MechanismState::update_geometry_primitive(
    const std::string& geometry_id,
    const mech::MassProperties& computed_mass,
    uint32_t face_count,
    const mech::PrimitiveSource& primitive_source) {
    auto it = geometries_.find(geometry_id);
    if (it == geometries_.end()) {
        return {{}, {}, "Geometry not found: " + geometry_id};
    }
    *it->second.mutable_computed_mass_properties() = computed_mass;
    *it->second.mutable_primitive_source() = primitive_source;
    it->second.set_face_count(face_count);

    auto updated_datums = clear_face_datum_provenance_for_geometry(geometry_id);

    std::string parent_id = it->second.parent_body_id().id();
    if (!parent_id.empty()) {
        update_body_aggregate_mass(parent_id);
    }
    return {it->second, updated_datums, {}};
}

MechanismState::GeometryResult MechanismState::update_geometry_collision_config(
    const std::string& geometry_id,
    const mech::CollisionConfig& collision_config) {
    auto it = geometries_.find(geometry_id);
    if (it == geometries_.end()) {
        return {{}, {}, "Geometry not found: " + geometry_id};
    }
    *it->second.mutable_collision_config() = collision_config;
    return {it->second, {}, {}};
}

const MechanismState::GeometryEntry* MechanismState::get_geometry(const std::string& id) const {
    auto it = geometries_.find(id);
    return it == geometries_.end() ? nullptr : &it->second;
}

size_t MechanismState::geometry_count() const {
    return geometries_.size();
}

// ──────────────────────────────────────────────
// Update geometry local pose
// ──────────────────────────────────────────────

MechanismState::GeometryResult MechanismState::update_geometry_local_pose(
    const std::string& geometry_id, const double pos[3], const double orient[4]) {
    auto geom_it = geometries_.find(geometry_id);
    if (geom_it == geometries_.end()) {
        return {{}, {}, "Geometry not found: " + geometry_id};
    }

    *geom_it->second.mutable_local_pose() = make_pose(pos, orient);
    auto updated_datums = sync_face_datums_for_geometry(geometry_id);

    // Recompute parent body aggregate mass (center of mass shifts with geometry pose)
    std::string parent_id = geom_it->second.parent_body_id().id();
    if (!parent_id.empty()) {
        update_body_aggregate_mass(parent_id);
    }

    return {geom_it->second, updated_datums, {}};
}

// ──────────────────────────────────────────────
// Geometry attachment
// ──────────────────────────────────────────────

MechanismState::GeometryResult MechanismState::attach_geometry(
    const std::string& geometry_id, const std::string& body_id,
    const double pos[3], const double orient[4]) {
    auto geom_it = geometries_.find(geometry_id);
    if (geom_it == geometries_.end()) {
        return {{}, {}, "Geometry not found: " + geometry_id};
    }
    if (!has_body(body_id)) {
        return {{}, {}, "Target body not found: " + body_id};
    }

    std::string old_parent = geom_it->second.parent_body_id().id();
    geom_it->second.mutable_parent_body_id()->set_id(body_id);
    *geom_it->second.mutable_local_pose() = make_pose(pos, orient);

    // Recompute mass for old parent (if it exists and different)
    if (!old_parent.empty() && old_parent != body_id) {
        update_body_aggregate_mass(old_parent);
    }
    // Recompute mass for new parent
    update_body_aggregate_mass(body_id);

    auto updated_datums = sync_face_datums_for_geometry(geometry_id);
    return {geom_it->second, updated_datums, {}};
}

MechanismState::GeometryResult MechanismState::detach_geometry(const std::string& geometry_id) {
    auto geom_it = geometries_.find(geometry_id);
    if (geom_it == geometries_.end()) {
        return {{}, {}, "Geometry not found: " + geometry_id};
    }

    if (geometry_has_linked_datums(geometry_id)) {
        return {{}, {}, "Cannot detach geometry with face-linked datums: " + geometry_id};
    }

    std::string old_parent = geom_it->second.parent_body_id().id();
    geom_it->second.mutable_parent_body_id()->clear_id();

    if (!old_parent.empty()) {
        update_body_aggregate_mass(old_parent);
    }

    return {geom_it->second, {}, {}};
}

// ──────────────────────────────────────────────
// Reparent geometry (world-position preserving)
// ──────────────────────────────────────────────

MechanismState::GeometryResult MechanismState::reparent_geometry(
    const std::string& geometry_id, const std::string& target_body_id) {
    auto geom_it = geometries_.find(geometry_id);
    if (geom_it == geometries_.end()) {
        return {{}, {}, "Geometry not found: " + geometry_id};
    }
    if (!has_body(target_body_id)) {
        return {{}, {}, "Target body not found: " + target_body_id};
    }

    // Compute geometry's current world pose
    double world_pos[3], world_orient[4];
    std::string old_parent_id = geom_it->second.parent_body_id().id();
    double geom_local_pos[3], geom_local_orient[4];
    extract_pose_arrays(geom_it->second.local_pose(), geom_local_pos, geom_local_orient);

    if (!old_parent_id.empty() && has_body(old_parent_id)) {
        const auto& old_body = bodies_.at(old_parent_id);
        double body_pos[3], body_orient[4];
        extract_pose_arrays(old_body.pose(), body_pos, body_orient);
        compose_pose(body_pos, body_orient, geom_local_pos, geom_local_orient,
                     world_pos, world_orient);
    } else {
        // Unparented geometry — local pose is world pose
        std::memcpy(world_pos, geom_local_pos, sizeof(world_pos));
        std::memcpy(world_orient, geom_local_orient, sizeof(world_orient));
    }

    // Compute new local pose: inverse(target_body_pose) * world_pose
    const auto& target_body = bodies_.at(target_body_id);
    double target_pos[3], target_orient[4];
    extract_pose_arrays(target_body.pose(), target_pos, target_orient);

    double inv_pos[3], inv_orient[4];
    inverse_pose(target_pos, target_orient, inv_pos, inv_orient);

    double new_local_pos[3], new_local_orient[4];
    compose_pose(inv_pos, inv_orient, world_pos, world_orient,
                 new_local_pos, new_local_orient);

    return attach_geometry(geometry_id, target_body_id, new_local_pos, new_local_orient);
}

// ──────────────────────────────────────────────
// Compound body operations
// ──────────────────────────────────────────────

MechanismState::CompoundBodyResult MechanismState::make_compound_body(
    const std::vector<std::string>& geometry_ids,
    const std::string& name, bool is_fixed, bool dissolve_empty,
    const std::string& reference_body_id) {

    if (geometry_ids.empty()) {
        return {{}, {}, {}, {}, "No geometry IDs provided"};
    }

    // Validate all geometry IDs exist
    for (const auto& gid : geometry_ids) {
        if (geometries_.find(gid) == geometries_.end()) {
            return {{}, {}, {}, {}, "Geometry not found: " + gid};
        }
    }

    // Compute each geometry's world pose and gather source-body participation.
    struct GeomWorldPose {
        double pos[3];
        double orient[4];
    };
    std::vector<GeomWorldPose> world_poses(geometry_ids.size());
    std::set<std::string> old_parent_ids;
    std::unordered_map<std::string, size_t> selected_geometry_counts;

    for (size_t i = 0; i < geometry_ids.size(); ++i) {
        const auto& geom = geometries_.at(geometry_ids[i]);
        double local_pos[3], local_orient[4];
        extract_pose_arrays(geom.local_pose(), local_pos, local_orient);

        std::string parent_id = geom.parent_body_id().id();
        if (!parent_id.empty()) {
            old_parent_ids.insert(parent_id);
            selected_geometry_counts[parent_id] += 1;
        }

        if (!parent_id.empty() && has_body(parent_id)) {
            const auto& body = bodies_.at(parent_id);
            double body_pos[3], body_orient[4];
            extract_pose_arrays(body.pose(), body_pos, body_orient);
            compose_pose(body_pos, body_orient, local_pos, local_orient,
                         world_poses[i].pos, world_poses[i].orient);
        } else {
            std::memcpy(world_poses[i].pos, local_pos, sizeof(local_pos));
            std::memcpy(world_poses[i].orient, local_orient, sizeof(local_orient));
        }
    }

    // Validate: no joint would connect the compound body to itself
    // (both datums on bodies being merged)
    for (const auto& [jid, joint] : joints_) {
        const auto* pd = get_datum(joint.parent_datum_id().id());
        const auto* cd = get_datum(joint.child_datum_id().id());
        if (!pd || !cd) continue;
        bool parent_on_merged = old_parent_ids.count(pd->parent_body_id().id()) > 0;
        bool child_on_merged = old_parent_ids.count(cd->parent_body_id().id()) > 0;
        if (parent_on_merged && child_on_merged) {
            return {{}, {}, {}, {},
                "Cannot merge: joint '" + joint.name() +
                "' would connect the resulting body to itself"};
        }
    }

    const auto is_fully_selected_override_body = [&](const std::string& body_id) {
        return !body_id.empty() &&
               has_body(body_id) &&
               bodies_.at(body_id).mass_override() &&
               selected_geometry_counts.contains(body_id) &&
               selected_geometry_counts.at(body_id) == get_body_geometries(body_id).size();
    };

    // Determine compound body origin: use reference body's pose if provided, else
    // place the new body at the selected assembly's world center of mass.
    double new_body_pos[3], new_body_orient[4];
    if (!reference_body_id.empty() && has_body(reference_body_id)) {
        const auto& ref_body = bodies_.at(reference_body_id);
        extract_pose_arrays(ref_body.pose(), new_body_pos, new_body_orient);
        spdlog::debug("[make-body] using reference body '{}' pose: [{:.6f}, {:.6f}, {:.6f}]",
                      reference_body_id, new_body_pos[0], new_body_pos[1], new_body_pos[2]);
    } else {
        std::vector<MassContribution> origin_contributions;
        origin_contributions.reserve(geometry_ids.size() + old_parent_ids.size());

        for (const auto& old_id : old_parent_ids) {
            if (!is_fully_selected_override_body(old_id)) {
                continue;
            }

            const auto& body = bodies_.at(old_id);
            double body_pos[3], body_orient[4];
            extract_pose_arrays(body.pose(), body_pos, body_orient);
            origin_contributions.push_back(transform_mass_properties(
                body.mass_properties(), body_pos, body_orient));
        }

        for (size_t i = 0; i < geometry_ids.size(); ++i) {
            const auto& geom = geometries_.at(geometry_ids[i]);
            const std::string parent_id = geom.parent_body_id().id();
            if (is_fully_selected_override_body(parent_id)) {
                continue;
            }

            origin_contributions.push_back(transform_mass_properties(
                geom.computed_mass_properties(), world_poses[i].pos, world_poses[i].orient));
        }

        const auto aggregate = aggregate_mass_contributions(origin_contributions);
        if (aggregate.mass() > 0.0) {
            new_body_pos[0] = aggregate.center_of_mass().x();
            new_body_pos[1] = aggregate.center_of_mass().y();
            new_body_pos[2] = aggregate.center_of_mass().z();
            spdlog::debug("[make-body] world center of mass (new body pose): [{:.6f}, {:.6f}, {:.6f}]",
                          new_body_pos[0], new_body_pos[1], new_body_pos[2]);
        } else {
            double cx = 0.0, cy = 0.0, cz = 0.0;
            for (const auto& world_pose : world_poses) {
                cx += world_pose.pos[0];
                cy += world_pose.pos[1];
                cz += world_pose.pos[2];
            }
            double n_geoms = static_cast<double>(geometry_ids.size());
            new_body_pos[0] = cx / n_geoms;
            new_body_pos[1] = cy / n_geoms;
            new_body_pos[2] = cz / n_geoms;
            spdlog::debug("[make-body] fallback origin average (zero mass): [{:.6f}, {:.6f}, {:.6f}]",
                          new_body_pos[0], new_body_pos[1], new_body_pos[2]);
        }
        new_body_orient[0] = 1.0; new_body_orient[1] = 0.0;
        new_body_orient[2] = 0.0; new_body_orient[3] = 0.0;
    }

    // Create the new body
    std::string new_body_id = create_body(name, new_body_pos, new_body_orient, nullptr, is_fixed);

    // Compute inverse of new body pose
    double inv_pos[3], inv_orient[4];
    inverse_pose(new_body_pos, new_body_orient, inv_pos, inv_orient);

    CompoundBodyResult result;
    result.created_body_id = new_body_id;

    bool preserve_override_mass = false;
    std::vector<MassContribution> override_contributions;

    for (const auto& old_id : old_parent_ids) {
        if (!has_body(old_id)) continue;
        const auto& body = bodies_.at(old_id);
        if (!body.mass_override()) continue;

        const auto body_geometries = get_body_geometries(old_id);
        const size_t selected_count = selected_geometry_counts.contains(old_id)
            ? selected_geometry_counts.at(old_id)
            : 0;
        if (selected_count != body_geometries.size()) {
            continue;
        }

        double old_body_pos[3], old_body_orient[4];
        extract_pose_arrays(body.pose(), old_body_pos, old_body_orient);
        double rel_pos[3], rel_orient[4];
        compose_pose(inv_pos, inv_orient, old_body_pos, old_body_orient, rel_pos, rel_orient);
        override_contributions.push_back(transform_mass_properties(
            body.mass_properties(), rel_pos, rel_orient));
        preserve_override_mass = true;
    }

    if (preserve_override_mass) {
        for (size_t i = 0; i < geometry_ids.size(); ++i) {
            const auto& geom = geometries_.at(geometry_ids[i]);
            const std::string parent_id = geom.parent_body_id().id();
            if (is_fully_selected_override_body(parent_id)) {
                continue;
            }

            double new_local_pos[3], new_local_orient[4];
            compose_pose(inv_pos, inv_orient, world_poses[i].pos, world_poses[i].orient,
                         new_local_pos, new_local_orient);
            override_contributions.push_back(transform_mass_properties(
                geom.computed_mass_properties(), new_local_pos, new_local_orient));
        }
    }

    // Attach each geometry with computed local pose and move linked face datums with it.
    for (size_t i = 0; i < geometry_ids.size(); ++i) {
        double new_local_pos[3], new_local_orient[4];
        compose_pose(inv_pos, inv_orient, world_poses[i].pos, world_poses[i].orient,
                     new_local_pos, new_local_orient);
        spdlog::debug("[make-body] geom '{}': world=[{:.6f},{:.6f},{:.6f}] -> local=[{:.6f},{:.6f},{:.6f}]",
                      geometry_ids[i],
                      world_poses[i].pos[0], world_poses[i].pos[1], world_poses[i].pos[2],
                      new_local_pos[0], new_local_pos[1], new_local_pos[2]);
        auto attach_result = attach_geometry(geometry_ids[i], new_body_id, new_local_pos, new_local_orient);
        result.reparented_datums.insert(result.reparented_datums.end(),
                                        attach_result.updated_datums.begin(),
                                        attach_result.updated_datums.end());
    }

    if (preserve_override_mass && has_body(new_body_id)) {
        auto& new_body = bodies_.at(new_body_id);
        new_body.set_mass_override(true);
        *new_body.mutable_mass_properties() = aggregate_mass_contributions(override_contributions);
    }

    // Check old parents for dissolution. If a body is being dissolved, preserve any
    // remaining manual/body-local datums by reparenting them to the new compound.
    for (const auto& old_id : old_parent_ids) {
        if (old_id == new_body_id) continue;
        if (!has_body(old_id)) continue;

        auto remaining_geoms = get_body_geometries(old_id);
        if (dissolve_empty && remaining_geoms.empty()) {
            auto reparented = reparent_datums(old_id, new_body_id);
            result.reparented_datums.insert(result.reparented_datums.end(),
                                            reparented.begin(), reparented.end());
            delete_body(old_id);
            result.dissolved_body_ids.push_back(old_id);
        } else {
            result.modified_body_ids.push_back(old_id);
        }
    }

    return result;
}

MechanismState::SplitResult MechanismState::split_body(
    const std::string& source_body_id,
    const std::vector<std::string>& geometry_ids,
    const std::string& name, bool is_fixed) {

    if (geometry_ids.empty()) {
        return {{}, {}, "No geometry IDs provided"};
    }
    if (!has_body(source_body_id)) {
        return {{}, {}, "Source body not found: " + source_body_id};
    }

    // Validate all geometries belong to source body
    for (const auto& gid : geometry_ids) {
        auto it = geometries_.find(gid);
        if (it == geometries_.end()) {
            return {{}, {}, "Geometry not found: " + gid};
        }
        if (it->second.parent_body_id().id() != source_body_id) {
            return {{}, {}, "Geometry " + gid + " does not belong to source body"};
        }
    }

    // Compute each geometry's world pose
    const auto& source_body = bodies_.at(source_body_id);
    double body_pos[3], body_orient[4];
    extract_pose_arrays(source_body.pose(), body_pos, body_orient);

    struct GeomWorldPose {
        double pos[3];
        double orient[4];
    };
    std::vector<GeomWorldPose> world_poses(geometry_ids.size());
    double cx = 0.0, cy = 0.0, cz = 0.0;

    for (size_t i = 0; i < geometry_ids.size(); ++i) {
        const auto& geom = geometries_.at(geometry_ids[i]);
        double local_pos[3], local_orient[4];
        extract_pose_arrays(geom.local_pose(), local_pos, local_orient);
        compose_pose(body_pos, body_orient, local_pos, local_orient,
                     world_poses[i].pos, world_poses[i].orient);
        cx += world_poses[i].pos[0];
        cy += world_poses[i].pos[1];
        cz += world_poses[i].pos[2];
    }

    double n = static_cast<double>(geometry_ids.size());
    double new_body_pos[3] = {cx / n, cy / n, cz / n};
    double new_body_orient[4] = {1.0, 0.0, 0.0, 0.0};

    std::string new_body_id = create_body(name, new_body_pos, new_body_orient, nullptr, is_fixed);

    double inv_pos[3], inv_orient[4];
    inverse_pose(new_body_pos, new_body_orient, inv_pos, inv_orient);

    SplitResult result;
    result.created_body_id = new_body_id;

    for (size_t i = 0; i < geometry_ids.size(); ++i) {
        double new_local_pos[3], new_local_orient[4];
        compose_pose(inv_pos, inv_orient, world_poses[i].pos, world_poses[i].orient,
                     new_local_pos, new_local_orient);
        auto attach_result = attach_geometry(geometry_ids[i], new_body_id, new_local_pos, new_local_orient);
        result.updated_datums.insert(result.updated_datums.end(),
                                     attach_result.updated_datums.begin(),
                                     attach_result.updated_datums.end());
    }

    return result;
}

// ──────────────────────────────────────────────
// Mass management
// ──────────────────────────────────────────────

std::vector<const MechanismState::GeometryEntry*> MechanismState::get_body_geometries(
    const std::string& body_id) const {
    std::vector<const GeometryEntry*> result;
    for (const auto& [_, geom] : geometries_) {
        if (geom.parent_body_id().id() == body_id) {
            result.push_back(&geom);
        }
    }
    return result;
}

mech::MassProperties MechanismState::compute_aggregate_mass(const std::string& body_id) const {
    std::vector<MassContribution> contributions;
    for (const auto* geom : get_body_geometries(body_id)) {
        double local_pos[3], local_orient[4];
        extract_pose_arrays(geom->local_pose(), local_pos, local_orient);
        contributions.push_back(transform_mass_properties(
            geom->computed_mass_properties(), local_pos, local_orient));
    }
    return aggregate_mass_contributions(contributions);
}

bool MechanismState::set_mass_override(const std::string& body_id, bool override,
                                        const mech::MassProperties* user_mass) {
    auto it = bodies_.find(body_id);
    if (it == bodies_.end()) return false;

    it->second.set_mass_override(override);
    if (override && user_mass) {
        *it->second.mutable_mass_properties() = *user_mass;
    } else if (!override) {
        // Recompute from geometries
        *it->second.mutable_mass_properties() = compute_aggregate_mass(body_id);
    }
    return true;
}

void MechanismState::update_body_aggregate_mass(const std::string& body_id) {
    auto it = bodies_.find(body_id);
    if (it == bodies_.end()) return;
    if (it->second.mass_override()) return;
    if (get_body_geometries(body_id).empty()) return;  // preserve existing mass
    *it->second.mutable_mass_properties() = compute_aggregate_mass(body_id);
}

void MechanismState::refresh_aggregate_masses() {
    for (auto& [id, body] : bodies_) {
        if (!body.mass_override()) {
            auto agg = compute_aggregate_mass(id);
            if (agg.mass() > 0.0) {
                *body.mutable_mass_properties() = agg;
            }
        }
    }
}

// ──────────────────────────────────────────────
// Datum CRUD
// ──────────────────────────────────────────────

std::optional<MechanismState::DatumEntry> MechanismState::create_datum(
    const std::string& parent_body_id,
    const std::string& name,
    const double pos[3], const double orient[4]) {
    if (!has_body(parent_body_id)) {
        spdlog::warn("MechanismState::create_datum '{}' failed: parent body '{}' not found (bodies count={})",
                     name, parent_body_id, bodies_.size());
        return std::nullopt;
    }

    mech::Datum datum;
    std::string id = generate_uuidv7();
    datum.mutable_id()->set_id(id);
    datum.set_name(name);
    datum.mutable_parent_body_id()->set_id(parent_body_id);
    *datum.mutable_local_pose() = make_pose(pos, orient);
    datums_[id] = datum;
    spdlog::debug("MechanismState::create_datum id={} name='{}' parent={} (datums count={})",
                  id, name, parent_body_id, datums_.size());
    return datum;
}

bool MechanismState::delete_datum(const std::string& datum_id) {
    if (is_datum_referenced_by_joint(datum_id) || is_datum_referenced_by_load(datum_id)) {
        return false;
    }
    return datums_.erase(datum_id) > 0;
}

std::optional<MechanismState::DatumEntry> MechanismState::rename_datum(
    const std::string& datum_id,
    const std::string& new_name) {
    auto it = datums_.find(datum_id);
    if (it == datums_.end()) {
        return std::nullopt;
    }
    it->second.set_name(new_name);
    return it->second;
}

std::optional<MechanismState::DatumEntry> MechanismState::update_datum_pose(
    const std::string& datum_id,
    const double pos[3],
    const double orient[4]) {
    auto it = datums_.find(datum_id);
    if (it == datums_.end()) {
        return std::nullopt;
    }
    *it->second.mutable_local_pose() = make_pose(pos, orient);
    return it->second;
}

std::optional<MechanismState::DatumEntry> MechanismState::set_datum_face_attachment(
    const std::string& datum_id,
    const std::string& source_geometry_id,
    uint32_t source_face_index,
    const double source_geometry_local_pos[3],
    const double source_geometry_local_orient[4],
    mech::DatumSurfaceClass surface_class,
    const mech::DatumFaceGeometryInfo* face_geometry) {
    auto it = datums_.find(datum_id);
    if (it == datums_.end()) {
        return std::nullopt;
    }

    it->second.mutable_source_geometry_id()->set_id(source_geometry_id);
    it->second.set_source_face_index(source_face_index);
    *it->second.mutable_source_geometry_local_pose() =
        make_pose(source_geometry_local_pos, source_geometry_local_orient);
    it->second.set_surface_class(surface_class);
    if (face_geometry) {
        *it->second.mutable_face_geometry() = *face_geometry;
    } else {
        it->second.clear_face_geometry();
    }

    return it->second;
}

const MechanismState::DatumEntry* MechanismState::get_datum(const std::string& id) const {
    auto it = datums_.find(id);
    return it == datums_.end() ? nullptr : &it->second;
}

size_t MechanismState::datum_count() const {
    return datums_.size();
}

bool MechanismState::geometry_has_linked_datums(const std::string& geometry_id) const {
    for (const auto& [_, datum] : datums_) {
        if (datum.source_geometry_id().id() == geometry_id && datum.has_source_face_index()) {
            return true;
        }
    }
    return false;
}

std::vector<MechanismState::DatumEntry> MechanismState::sync_face_datums_for_geometry(
    const std::string& geometry_id) {
    std::vector<DatumEntry> updated;
    const auto geom_it = geometries_.find(geometry_id);
    if (geom_it == geometries_.end()) return updated;

    const auto& geometry = geom_it->second;
    if (geometry.parent_body_id().id().empty()) return updated;

    double geom_pos[3], geom_orient[4];
    extract_pose_arrays(geometry.local_pose(), geom_pos, geom_orient);

    for (auto& [_, datum] : datums_) {
        if (datum.source_geometry_id().id() != geometry_id || !datum.has_source_geometry_local_pose()) {
            continue;
        }

        double source_pos[3], source_orient[4];
        extract_pose_arrays(datum.source_geometry_local_pose(), source_pos, source_orient);

        double new_local_pos[3], new_local_orient[4];
        compose_pose(geom_pos, geom_orient, source_pos, source_orient,
                     new_local_pos, new_local_orient);

        datum.mutable_parent_body_id()->set_id(geometry.parent_body_id().id());
        *datum.mutable_local_pose() = make_pose(new_local_pos, new_local_orient);
        updated.push_back(datum);
    }

    return updated;
}

std::vector<MechanismState::DatumEntry> MechanismState::clear_face_datum_provenance_for_geometry(
    const std::string& geometry_id) {
    std::vector<DatumEntry> updated;
    for (auto& [_, datum] : datums_) {
        if (datum.source_geometry_id().id() != geometry_id) continue;
        datum.clear_source_geometry_id();
        datum.clear_source_face_index();
        datum.clear_source_geometry_local_pose();
        datum.set_surface_class(mech::DATUM_SURFACE_CLASS_UNSPECIFIED);
        datum.clear_face_geometry();
        updated.push_back(datum);
    }
    return updated;
}

std::vector<MechanismState::DatumEntry> MechanismState::co_translate_datums(
    const std::string& body_id,
    const mech::Pose& old_body_pose,
    const mech::Pose& new_body_pose) {
    std::vector<DatumEntry> updated;

    // Extract old body pose as arrays (w, x, y, z)
    const double old_q[4] = {
        old_body_pose.orientation().w(),
        old_body_pose.orientation().x(),
        old_body_pose.orientation().y(),
        old_body_pose.orientation().z()
    };
    const double old_p[3] = {
        old_body_pose.position().x(),
        old_body_pose.position().y(),
        old_body_pose.position().z()
    };

    // Extract new body pose
    const double new_q[4] = {
        new_body_pose.orientation().w(),
        new_body_pose.orientation().x(),
        new_body_pose.orientation().y(),
        new_body_pose.orientation().z()
    };
    const double new_p[3] = {
        new_body_pose.position().x(),
        new_body_pose.position().y(),
        new_body_pose.position().z()
    };

    // Precompute inverse of new body rotation
    double new_q_inv[4];
    quat_conj(new_q, new_q_inv);

    for (auto& [did, datum] : datums_) {
        if (datum.parent_body_id().id() != body_id) continue;

        const auto& lp = datum.local_pose();
        const double local_pos[3] = {
            lp.position().x(), lp.position().y(), lp.position().z()
        };
        const double local_q[4] = {
            lp.orientation().w(), lp.orientation().x(),
            lp.orientation().y(), lp.orientation().z()
        };

        // 1. Compute world position under old body pose
        double world_pos[3];
        quat_rotate(old_q, local_pos, world_pos);
        world_pos[0] += old_p[0];
        world_pos[1] += old_p[1];
        world_pos[2] += old_p[2];

        // Compute world orientation under old body pose
        double world_q[4];
        quat_mul(old_q, local_q, world_q);

        // 2. Compute new local position under new body pose
        const double delta[3] = {
            world_pos[0] - new_p[0],
            world_pos[1] - new_p[1],
            world_pos[2] - new_p[2]
        };
        double new_local_pos[3];
        quat_rotate(new_q_inv, delta, new_local_pos);

        // Compute new local orientation under new body pose
        double new_local_q[4];
        quat_mul(new_q_inv, world_q, new_local_q);

        // 3. Update datum's local_pose in place
        *datum.mutable_local_pose() = make_pose(new_local_pos, new_local_q);

        // 4. Collect updated datum
        updated.push_back(datum);
    }

    return updated;
}

std::vector<MechanismState::DatumEntry> MechanismState::reparent_datums(
    const std::string& source_body_id,
    const std::string& target_body_id) {
    std::vector<DatumEntry> reparented;
    if (!has_body(source_body_id) || !has_body(target_body_id)) return reparented;
    if (source_body_id == target_body_id) return reparented;

    const auto& src_body = bodies_.at(source_body_id);
    double src_pos[3], src_orient[4];
    extract_pose_arrays(src_body.pose(), src_pos, src_orient);

    const auto& tgt_body = bodies_.at(target_body_id);
    double tgt_pos[3], tgt_orient[4];
    extract_pose_arrays(tgt_body.pose(), tgt_pos, tgt_orient);

    double inv_tgt_pos[3], inv_tgt_orient[4];
    inverse_pose(tgt_pos, tgt_orient, inv_tgt_pos, inv_tgt_orient);

    for (auto& [did, datum] : datums_) {
        if (datum.parent_body_id().id() != source_body_id) continue;

        double local_pos[3], local_orient[4];
        extract_pose_arrays(datum.local_pose(), local_pos, local_orient);

        // Compute datum world pose via source body
        double world_pos[3], world_orient[4];
        compose_pose(src_pos, src_orient, local_pos, local_orient, world_pos, world_orient);

        // Compute new local pose relative to target body
        double new_local_pos[3], new_local_orient[4];
        compose_pose(inv_tgt_pos, inv_tgt_orient, world_pos, world_orient,
                     new_local_pos, new_local_orient);

        // Update datum in place
        datum.mutable_parent_body_id()->set_id(target_body_id);
        *datum.mutable_local_pose() = make_pose(new_local_pos, new_local_orient);
        reparented.push_back(datum);
    }

    return reparented;
}

// ──────────────────────────────────────────────
// Joint CRUD
// ──────────────────────────────────────────────

void MechanismState::clear_legacy_joint_limits(mech::Joint* joint) {
    joint->set_lower_limit(0.0);
    joint->set_upper_limit(0.0);
}

void MechanismState::populate_legacy_joint_limits(mech::Joint* joint) {
    clear_legacy_joint_limits(joint);
    switch (joint->config_case()) {
        case mech::Joint::kRevolute:
            if (joint->revolute().has_angle_limit()) {
                joint->set_lower_limit(joint->revolute().angle_limit().lower());
                joint->set_upper_limit(joint->revolute().angle_limit().upper());
            }
            break;
        case mech::Joint::kPrismatic:
            if (joint->prismatic().has_translation_limit()) {
                joint->set_lower_limit(joint->prismatic().translation_limit().lower());
                joint->set_upper_limit(joint->prismatic().translation_limit().upper());
            }
            break;
        case mech::Joint::kCylindrical:
            if (joint->cylindrical().has_translation_limit()) {
                joint->set_lower_limit(joint->cylindrical().translation_limit().lower());
                joint->set_upper_limit(joint->cylindrical().translation_limit().upper());
            }
            break;
        case mech::Joint::kDistance:
            if (joint->distance().has_distance_limit()) {
                joint->set_lower_limit(joint->distance().distance_limit().lower());
                joint->set_upper_limit(joint->distance().distance_limit().upper());
            }
            break;
        default:
            break;
    }
}

void MechanismState::upgrade_legacy_joint(mech::Joint* joint) {
    if (joint->config_case() != mech::Joint::CONFIG_NOT_SET) {
        populate_legacy_joint_limits(joint);
        return;
    }

    switch (joint->type()) {
        case mech::JOINT_TYPE_REVOLUTE:
            if (joint->lower_limit() != 0.0 || joint->upper_limit() != 0.0) {
                auto* cfg = joint->mutable_revolute();
                cfg->mutable_angle_limit()->set_lower(joint->lower_limit());
                cfg->mutable_angle_limit()->set_upper(joint->upper_limit());
            } else {
                joint->mutable_revolute();
            }
            break;
        case mech::JOINT_TYPE_PRISMATIC:
            if (joint->lower_limit() != 0.0 || joint->upper_limit() != 0.0) {
                auto* cfg = joint->mutable_prismatic();
                cfg->mutable_translation_limit()->set_lower(joint->lower_limit());
                cfg->mutable_translation_limit()->set_upper(joint->upper_limit());
            } else {
                joint->mutable_prismatic();
            }
            break;
        case mech::JOINT_TYPE_FIXED:
            joint->mutable_fixed();
            break;
        case mech::JOINT_TYPE_SPHERICAL:
            joint->mutable_spherical();
            break;
        case mech::JOINT_TYPE_CYLINDRICAL:
            if (joint->lower_limit() != 0.0 || joint->upper_limit() != 0.0) {
                auto* cfg = joint->mutable_cylindrical();
                cfg->mutable_translation_limit()->set_lower(joint->lower_limit());
                cfg->mutable_translation_limit()->set_upper(joint->upper_limit());
            } else {
                joint->mutable_cylindrical();
            }
            break;
        case mech::JOINT_TYPE_PLANAR:
            joint->mutable_planar();
            break;
        case mech::JOINT_TYPE_UNIVERSAL:
            joint->mutable_universal();
            break;
        case mech::JOINT_TYPE_DISTANCE:
            if (joint->lower_limit() != 0.0 || joint->upper_limit() != 0.0) {
                auto* cfg = joint->mutable_distance();
                cfg->mutable_distance_limit()->set_lower(joint->lower_limit());
                cfg->mutable_distance_limit()->set_upper(joint->upper_limit());
            } else {
                joint->mutable_distance();
            }
            break;
        case mech::JOINT_TYPE_POINT_LINE:
            joint->mutable_point_line();
            break;
        case mech::JOINT_TYPE_POINT_PLANE:
            joint->mutable_point_plane();
            break;
        default:
            break;
    }
    populate_legacy_joint_limits(joint);
}

std::string MechanismState::validate_joint(mech::Joint* joint) const {
    if (!joint->has_parent_datum_id() || !joint->has_child_datum_id()) {
        return "Joint must reference both a parent and child datum";
    }

    const auto parent_it = datums_.find(joint->parent_datum_id().id());
    if (parent_it == datums_.end()) {
        return "Parent datum not found: " + joint->parent_datum_id().id();
    }

    const auto child_it = datums_.find(joint->child_datum_id().id());
    if (child_it == datums_.end()) {
        return "Child datum not found: " + joint->child_datum_id().id();
    }

    if (parent_it->second.parent_body_id().id() == child_it->second.parent_body_id().id()) {
        return "Parent and child datums must be on different bodies";
    }

    upgrade_legacy_joint(joint);

    const auto expect_config = [&](bool ok, const std::string& label) -> std::string {
        return ok ? std::string{} : "Joint config does not match type: " + label;
    };

    switch (joint->type()) {
        case mech::JOINT_TYPE_REVOLUTE:
            if (auto err = expect_config(joint->config_case() == mech::Joint::kRevolute, "revolute"); !err.empty()) return err;
            if (joint->revolute().has_angle_limit()) return make_range_error(joint->revolute().angle_limit(), "Angle");
            break;
        case mech::JOINT_TYPE_PRISMATIC:
            if (auto err = expect_config(joint->config_case() == mech::Joint::kPrismatic, "prismatic"); !err.empty()) return err;
            if (joint->prismatic().has_translation_limit()) return make_range_error(joint->prismatic().translation_limit(), "Translation");
            break;
        case mech::JOINT_TYPE_FIXED:
            if (auto err = expect_config(joint->config_case() == mech::Joint::kFixed, "fixed"); !err.empty()) return err;
            break;
        case mech::JOINT_TYPE_SPHERICAL:
            if (auto err = expect_config(joint->config_case() == mech::Joint::kSpherical, "spherical"); !err.empty()) return err;
            break;
        case mech::JOINT_TYPE_CYLINDRICAL:
            if (auto err = expect_config(joint->config_case() == mech::Joint::kCylindrical, "cylindrical"); !err.empty()) return err;
            if (joint->cylindrical().has_translation_limit()) {
                if (auto err = make_range_error(joint->cylindrical().translation_limit(), "Translation"); !err.empty()) return err;
            }
            if (joint->cylindrical().has_rotation_limit()) {
                if (auto err = make_range_error(joint->cylindrical().rotation_limit(), "Rotation"); !err.empty()) return err;
            }
            break;
        case mech::JOINT_TYPE_PLANAR:
            if (auto err = expect_config(joint->config_case() == mech::Joint::kPlanar, "planar"); !err.empty()) return err;
            if (joint->planar().has_translation_x_limit()) {
                if (auto err = make_range_error(joint->planar().translation_x_limit(), "Planar X"); !err.empty()) return err;
            }
            if (joint->planar().has_translation_y_limit()) {
                if (auto err = make_range_error(joint->planar().translation_y_limit(), "Planar Y"); !err.empty()) return err;
            }
            if (joint->planar().has_rotation_limit()) {
                if (auto err = make_range_error(joint->planar().rotation_limit(), "Planar rotation"); !err.empty()) return err;
            }
            break;
        case mech::JOINT_TYPE_UNIVERSAL:
            if (auto err = expect_config(joint->config_case() == mech::Joint::kUniversal, "universal"); !err.empty()) return err;
            if (joint->universal().has_rotation_x_limit()) {
                if (auto err = make_range_error(joint->universal().rotation_x_limit(), "Universal X"); !err.empty()) return err;
            }
            if (joint->universal().has_rotation_y_limit()) {
                if (auto err = make_range_error(joint->universal().rotation_y_limit(), "Universal Y"); !err.empty()) return err;
            }
            break;
        case mech::JOINT_TYPE_DISTANCE:
            if (auto err = expect_config(joint->config_case() == mech::Joint::kDistance, "distance"); !err.empty()) return err;
            if (joint->distance().has_distance_limit()) return make_range_error(joint->distance().distance_limit(), "Distance");
            break;
        case mech::JOINT_TYPE_POINT_LINE:
            if (auto err = expect_config(joint->config_case() == mech::Joint::kPointLine, "point-line"); !err.empty()) return err;
            break;
        case mech::JOINT_TYPE_POINT_PLANE:
            if (auto err = expect_config(joint->config_case() == mech::Joint::kPointPlane, "point-plane"); !err.empty()) return err;
            break;
        default:
            return "Invalid joint type";
    }

    clear_legacy_joint_limits(joint);
    return {};
}

MechanismState::JointResult MechanismState::create_joint(const JointEntry& draft) {
    mech::Joint joint = draft;
    joint.mutable_id()->set_id(generate_uuidv7());
    auto error = validate_joint(&joint);
    if (!error.empty()) {
        return {{}, error};
    }

    joints_[joint.id().id()] = joint;
    return {joint, {}};
}

MechanismState::JointResult MechanismState::update_joint(const JointEntry& joint) {
    if (!joint.has_id()) {
        return {{}, "Joint not found: "};
    }

    auto it = joints_.find(joint.id().id());
    if (it == joints_.end()) {
        return {{}, "Joint not found: " + joint.id().id()};
    }

    mech::Joint updated = joint;
    auto error = validate_joint(&updated);
    if (!error.empty()) {
        return {{}, error};
    }

    it->second = updated;
    return {updated, {}};
}

bool MechanismState::delete_joint(const std::string& joint_id) {
    if (is_joint_referenced_by_actuator(joint_id)) {
        return false;
    }
    return joints_.erase(joint_id) > 0;
}

const MechanismState::JointEntry* MechanismState::get_joint(const std::string& id) const {
    auto it = joints_.find(id);
    return it == joints_.end() ? nullptr : &it->second;
}

size_t MechanismState::joint_count() const {
    return joints_.size();
}

bool MechanismState::is_datum_referenced_by_joint(const std::string& datum_id) const {
    for (const auto& [_, joint] : joints_) {
        if (joint.parent_datum_id().id() == datum_id || joint.child_datum_id().id() == datum_id) {
            return true;
        }
    }
    return false;
}

// ──────────────────────────────────────────────
// Load CRUD
// ──────────────────────────────────────────────

std::string MechanismState::validate_load(const mech::Load& load) const {
    switch (load.config_case()) {
        case mech::Load::kPointForce:
            if (!datums_.contains(load.point_force().datum_id().id())) {
                return "Load datum not found: " + load.point_force().datum_id().id();
            }
            break;
        case mech::Load::kPointTorque:
            if (!datums_.contains(load.point_torque().datum_id().id())) {
                return "Load datum not found: " + load.point_torque().datum_id().id();
            }
            break;
        case mech::Load::kLinearSpringDamper:
            if (!datums_.contains(load.linear_spring_damper().parent_datum_id().id())) {
                return "Parent datum not found: " + load.linear_spring_damper().parent_datum_id().id();
            }
            if (!datums_.contains(load.linear_spring_damper().child_datum_id().id())) {
                return "Child datum not found: " + load.linear_spring_damper().child_datum_id().id();
            }
            if (load.linear_spring_damper().stiffness() < 0.0) {
                return "Spring stiffness must be >= 0";
            }
            if (load.linear_spring_damper().damping() < 0.0) {
                return "Spring damping must be >= 0";
            }
            break;
        case mech::Load::CONFIG_NOT_SET:
            return "Load config is required";
    }
    return {};
}

MechanismState::LoadResult MechanismState::create_load(const LoadEntry& draft) {
    mech::Load load = draft;
    load.mutable_id()->set_id(generate_uuidv7());
    auto error = validate_load(load);
    if (!error.empty()) {
        return {{}, error};
    }
    loads_[load.id().id()] = load;
    return {load, {}};
}

MechanismState::LoadResult MechanismState::update_load(const LoadEntry& load) {
    if (!load.has_id()) {
        return {{}, "Load not found: "};
    }
    auto it = loads_.find(load.id().id());
    if (it == loads_.end()) {
        return {{}, "Load not found: " + load.id().id()};
    }
    auto error = validate_load(load);
    if (!error.empty()) {
        return {{}, error};
    }
    it->second = load;
    return {load, {}};
}

bool MechanismState::delete_load(const std::string& load_id) {
    return loads_.erase(load_id) > 0;
}

const MechanismState::LoadEntry* MechanismState::get_load(const std::string& id) const {
    auto it = loads_.find(id);
    return it == loads_.end() ? nullptr : &it->second;
}

size_t MechanismState::load_count() const {
    return loads_.size();
}

bool MechanismState::is_datum_referenced_by_load(const std::string& datum_id) const {
    for (const auto& [_, load] : loads_) {
        switch (load.config_case()) {
            case mech::Load::kPointForce:
                if (load.point_force().datum_id().id() == datum_id) return true;
                break;
            case mech::Load::kPointTorque:
                if (load.point_torque().datum_id().id() == datum_id) return true;
                break;
            case mech::Load::kLinearSpringDamper:
                if (load.linear_spring_damper().parent_datum_id().id() == datum_id ||
                    load.linear_spring_damper().child_datum_id().id() == datum_id) {
                    return true;
                }
                break;
            case mech::Load::CONFIG_NOT_SET:
                break;
        }
    }
    return false;
}

// ──────────────────────────────────────────────
// Actuator CRUD
// ──────────────────────────────────────────────

std::string MechanismState::validate_actuator(const mech::Actuator& actuator) const {
    const auto require_joint = [&](const std::string& joint_id, mech::JointType expected_type) -> std::string {
        const auto it = joints_.find(joint_id);
        if (it == joints_.end()) {
            return "Actuator joint not found: " + joint_id;
        }
        if (it->second.type() != expected_type) {
            return "Actuator joint type does not match actuator kind";
        }
        return {};
    };

    switch (actuator.config_case()) {
        case mech::Actuator::kRevoluteMotor: {
            auto error = require_joint(actuator.revolute_motor().joint_id().id(), mech::JOINT_TYPE_REVOLUTE);
            if (!error.empty()) return error;
            if (actuator.revolute_motor().control_mode() == mech::ACTUATOR_CONTROL_MODE_UNSPECIFIED) {
                return "Actuator control mode is required";
            }
            break;
        }
        case mech::Actuator::kPrismaticMotor: {
            auto error = require_joint(actuator.prismatic_motor().joint_id().id(), mech::JOINT_TYPE_PRISMATIC);
            if (!error.empty()) return error;
            if (actuator.prismatic_motor().control_mode() == mech::ACTUATOR_CONTROL_MODE_UNSPECIFIED) {
                return "Actuator control mode is required";
            }
            break;
        }
        case mech::Actuator::CONFIG_NOT_SET:
            return "Actuator config is required";
    }
    return {};
}

MechanismState::ActuatorResult MechanismState::create_actuator(const ActuatorEntry& draft) {
    mech::Actuator actuator = draft;
    actuator.mutable_id()->set_id(generate_uuidv7());
    auto error = validate_actuator(actuator);
    if (!error.empty()) {
        return {{}, error};
    }
    actuators_[actuator.id().id()] = actuator;
    return {actuator, {}};
}

MechanismState::ActuatorResult MechanismState::update_actuator(const ActuatorEntry& actuator) {
    if (!actuator.has_id()) {
        return {{}, "Actuator not found: "};
    }
    auto it = actuators_.find(actuator.id().id());
    if (it == actuators_.end()) {
        return {{}, "Actuator not found: " + actuator.id().id()};
    }
    auto error = validate_actuator(actuator);
    if (!error.empty()) {
        return {{}, error};
    }
    it->second = actuator;
    return {actuator, {}};
}

bool MechanismState::delete_actuator(const std::string& actuator_id) {
    return actuators_.erase(actuator_id) > 0;
}

const MechanismState::ActuatorEntry* MechanismState::get_actuator(const std::string& id) const {
    auto it = actuators_.find(id);
    return it == actuators_.end() ? nullptr : &it->second;
}

size_t MechanismState::actuator_count() const {
    return actuators_.size();
}

bool MechanismState::is_joint_referenced_by_actuator(const std::string& joint_id) const {
    for (const auto& [_, actuator] : actuators_) {
        switch (actuator.config_case()) {
            case mech::Actuator::kRevoluteMotor:
                if (actuator.revolute_motor().joint_id().id() == joint_id) return true;
                break;
            case mech::Actuator::kPrismaticMotor:
                if (actuator.prismatic_motor().joint_id().id() == joint_id) return true;
                break;
            case mech::Actuator::CONFIG_NOT_SET:
                break;
        }
    }
    return false;
}

// ──────────────────────────────────────────────
// Proto serialization
// ──────────────────────────────────────────────

void MechanismState::clear() {
    bodies_.clear();
    datums_.clear();
    joints_.clear();
    loads_.clear();
    actuators_.clear();
    geometries_.clear();
}

void MechanismState::load_from_proto(const mech::Mechanism& mech_proto) {
    clear();
    for (const auto& body : mech_proto.bodies()) {
        bodies_[body.id().id()] = body;
    }
    for (const auto& datum : mech_proto.datums()) {
        datums_[datum.id().id()] = datum;
    }
    for (const auto& joint_src : mech_proto.joints()) {
        mech::Joint joint = joint_src;
        upgrade_legacy_joint(&joint);
        joints_[joint.id().id()] = joint;
    }
    for (const auto& load : mech_proto.loads()) {
        loads_[load.id().id()] = load;
    }
    for (const auto& actuator : mech_proto.actuators()) {
        actuators_[actuator.id().id()] = actuator;
    }
    for (const auto& geom : mech_proto.geometries()) {
        geometries_[geom.id().id()] = geom;
    }
}

mech::Mechanism MechanismState::build_mechanism_proto() const {
    mech::Mechanism mech_proto;
    mech_proto.mutable_id()->set_id("sim-mechanism");
    mech_proto.set_name("Current Mechanism");

    for (const auto& [_, body] : bodies_) {
        *mech_proto.add_bodies() = body;
    }
    for (const auto& [_, datum] : datums_) {
        *mech_proto.add_datums() = datum;
    }
    for (const auto& [_, joint_src] : joints_) {
        mech::Joint* joint = mech_proto.add_joints();
        *joint = joint_src;
        populate_legacy_joint_limits(joint);
    }
    for (const auto& [_, load] : loads_) {
        *mech_proto.add_loads() = load;
    }
    for (const auto& [_, actuator] : actuators_) {
        *mech_proto.add_actuators() = actuator;
    }
    for (const auto& [_, geom] : geometries_) {
        *mech_proto.add_geometries() = geom;
    }

    return mech_proto;
}

std::optional<mech::Body> MechanismState::build_body_proto(const std::string& body_id) const {
    auto it = bodies_.find(body_id);
    if (it == bodies_.end()) {
        return std::nullopt;
    }
    return it->second;
}

} // namespace motionlab::engine
