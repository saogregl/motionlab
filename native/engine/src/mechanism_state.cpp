#include "mechanism_state.h"

#include <cmath>
#include <array>
#include <cstring>

#include "engine/log.h"
#include "uuid.h"

namespace motionlab::engine {

namespace mech = motionlab::mechanism;

namespace {

std::string make_range_error(const mech::Range& range, const std::string& label) {
    if (range.lower() > range.upper()) {
        return label + " lower limit must be <= upper limit";
    }
    return {};
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
    bodies_[id] = std::move(body);
}

std::string MechanismState::create_body(const std::string& name,
                                         const double pos[3], const double orient[4],
                                         const mech::MassProperties* mass,
                                         bool is_fixed) {
    std::string id = generate_uuidv7();
    mech::Body body;
    body.mutable_id()->set_id(id);
    body.set_name(name);
    *body.mutable_pose() = make_pose(pos, orient);
    if (mass) {
        *body.mutable_mass_properties() = *mass;
        body.set_mass_override(true);
    }
    body.set_is_fixed(is_fixed);
    bodies_[id] = std::move(body);
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

bool MechanismState::set_body_fixed(const std::string& id, bool is_fixed) {
    auto it = bodies_.find(id);
    if (it == bodies_.end()) {
        return false;
    }
    it->second.set_is_fixed(is_fixed);
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
    uint32_t face_count) {
    if (!has_body(parent_body_id)) {
        return {{}, "Parent body not found: " + parent_body_id};
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
    geom.set_face_count(face_count);
    geometries_[id] = geom;

    // Recompute parent body mass if no override
    update_body_aggregate_mass(parent_body_id);

    return {geom, {}};
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

const MechanismState::GeometryEntry* MechanismState::get_geometry(const std::string& id) const {
    auto it = geometries_.find(id);
    return it == geometries_.end() ? nullptr : &it->second;
}

size_t MechanismState::geometry_count() const {
    return geometries_.size();
}

// ──────────────────────────────────────────────
// Geometry attachment
// ──────────────────────────────────────────────

MechanismState::GeometryResult MechanismState::attach_geometry(
    const std::string& geometry_id, const std::string& body_id,
    const double pos[3], const double orient[4]) {
    auto geom_it = geometries_.find(geometry_id);
    if (geom_it == geometries_.end()) {
        return {{}, "Geometry not found: " + geometry_id};
    }
    if (!has_body(body_id)) {
        return {{}, "Target body not found: " + body_id};
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

    return {geom_it->second, {}};
}

MechanismState::GeometryResult MechanismState::detach_geometry(const std::string& geometry_id) {
    auto geom_it = geometries_.find(geometry_id);
    if (geom_it == geometries_.end()) {
        return {{}, "Geometry not found: " + geometry_id};
    }

    std::string old_parent = geom_it->second.parent_body_id().id();
    geom_it->second.mutable_parent_body_id()->clear_id();

    if (!old_parent.empty()) {
        update_body_aggregate_mass(old_parent);
    }

    return {geom_it->second, {}};
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
    mech::MassProperties result;
    auto geoms = get_body_geometries(body_id);
    if (geoms.empty()) return result;

    const auto geometry_com_in_body_frame = [](const MechanismState::GeometryEntry& geom) {
        const auto& pose = geom.local_pose();
        const auto& com = geom.computed_mass_properties().center_of_mass();
        return std::array<double, 3>{
            pose.position().x() + com.x(),
            pose.position().y() + com.y(),
            pose.position().z() + com.z(),
        };
    };

    // Step 1: total mass
    double total_mass = 0.0;
    for (const auto* g : geoms) {
        total_mass += g->computed_mass_properties().mass();
    }
    if (total_mass <= 0.0) return result;

    // Step 2: combined center of mass (weighted average)
    double cx = 0.0, cy = 0.0, cz = 0.0;
    for (const auto* g : geoms) {
        double m = g->computed_mass_properties().mass();
        const auto com = geometry_com_in_body_frame(*g);
        cx += m * com[0];
        cy += m * com[1];
        cz += m * com[2];
    }
    cx /= total_mass;
    cy /= total_mass;
    cz /= total_mass;

    // Step 3: combined inertia via parallel axis theorem
    // I_total = sum( I_i + m_i * (|d_i|^2 * I_3x3 - d_i * d_i^T) )
    // where d_i = CoM_i - combined_CoM
    double ixx = 0, iyy = 0, izz = 0, ixy = 0, ixz = 0, iyz = 0;
    for (const auto* g : geoms) {
        const auto& mp = g->computed_mass_properties();
        const auto com = geometry_com_in_body_frame(*g);
        double m = mp.mass();
        double dx = com[0] - cx;
        double dy = com[1] - cy;
        double dz = com[2] - cz;
        double d2 = dx*dx + dy*dy + dz*dz;

        ixx += mp.ixx() + m * (d2 - dx*dx);  // m * (dy^2 + dz^2)
        iyy += mp.iyy() + m * (d2 - dy*dy);  // m * (dx^2 + dz^2)
        izz += mp.izz() + m * (d2 - dz*dz);  // m * (dx^2 + dy^2)
        ixy += mp.ixy() - m * dx * dy;
        ixz += mp.ixz() - m * dx * dz;
        iyz += mp.iyz() - m * dy * dz;
    }

    result.set_mass(total_mass);
    result.mutable_center_of_mass()->set_x(cx);
    result.mutable_center_of_mass()->set_y(cy);
    result.mutable_center_of_mass()->set_z(cz);
    result.set_ixx(ixx);
    result.set_iyy(iyy);
    result.set_izz(izz);
    result.set_ixy(ixy);
    result.set_ixz(ixz);
    result.set_iyz(iyz);

    return result;
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
    *it->second.mutable_mass_properties() = compute_aggregate_mass(body_id);
}

void MechanismState::refresh_aggregate_masses() {
    for (auto& [id, body] : bodies_) {
        if (!body.mass_override()) {
            *body.mutable_mass_properties() = compute_aggregate_mass(id);
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
        return std::nullopt;
    }

    mech::Datum datum;
    datum.mutable_id()->set_id(generate_uuidv7());
    datum.set_name(name);
    datum.mutable_parent_body_id()->set_id(parent_body_id);
    *datum.mutable_local_pose() = make_pose(pos, orient);
    datums_[datum.id().id()] = datum;
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

const MechanismState::DatumEntry* MechanismState::get_datum(const std::string& id) const {
    auto it = datums_.find(id);
    return it == datums_.end() ? nullptr : &it->second;
}

size_t MechanismState::datum_count() const {
    return datums_.size();
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
