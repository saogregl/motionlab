#include "mechanism_state.h"
#include "engine/log.h"
#include "mechanism/mechanism.pb.h"
#include "uuid.h"

#include <cstring>

namespace motionlab::engine {

void MechanismState::add_body(const std::string& id, const std::string& name) {
    bodies_[id] = BodyEntry{id, name, {0,0,0}, {1,0,0,0}, 0.0, {0,0,0}, {0,0,0,0,0,0}};
}

void MechanismState::add_body(const std::string& id, const std::string& name,
                              const double pos[3], const double orient[4],
                              double mass, const double com[3], const double inertia[6],
                              bool is_fixed) {
    BodyEntry entry;
    entry.id = id;
    entry.name = name;
    std::memcpy(entry.position, pos, 3 * sizeof(double));
    std::memcpy(entry.orientation, orient, 4 * sizeof(double));
    entry.mass = mass;
    std::memcpy(entry.center_of_mass, com, 3 * sizeof(double));
    std::memcpy(entry.inertia, inertia, 6 * sizeof(double));
    entry.is_fixed = is_fixed;
    bodies_[id] = entry;
}

bool MechanismState::set_body_fixed(const std::string& id, bool is_fixed) {
    auto it = bodies_.find(id);
    if (it == bodies_.end()) return false;
    it->second.is_fixed = is_fixed;
    return true;
}

bool MechanismState::has_body(const std::string& id) const {
    return bodies_.find(id) != bodies_.end();
}

std::optional<MechanismState::DatumEntry> MechanismState::create_datum(
    const std::string& parent_body_id,
    const std::string& name,
    const double pos[3], const double orient[4]) {

    if (!has_body(parent_body_id)) {
        return std::nullopt;
    }

    DatumEntry entry;
    entry.id = generate_uuidv7();
    entry.name = name;
    entry.parent_body_id = parent_body_id;
    std::memcpy(entry.position, pos, 3 * sizeof(double));
    std::memcpy(entry.orientation, orient, 4 * sizeof(double));

    datums_[entry.id] = entry;
    return entry;
}

bool MechanismState::delete_datum(const std::string& datum_id) {
    if (is_datum_referenced_by_joint(datum_id)) {
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

    it->second.name = new_name;
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

    std::memcpy(it->second.position, pos, 3 * sizeof(double));
    std::memcpy(it->second.orientation, orient, 4 * sizeof(double));
    return it->second;
}

const MechanismState::DatumEntry* MechanismState::get_datum(const std::string& id) const {
    auto it = datums_.find(id);
    if (it == datums_.end()) return nullptr;
    return &it->second;
}

size_t MechanismState::body_count() const {
    return bodies_.size();
}

size_t MechanismState::datum_count() const {
    return datums_.size();
}

MechanismState::JointResult MechanismState::create_joint(
    const std::string& parent_datum_id,
    const std::string& child_datum_id,
    int type, const std::string& name,
    double lower_limit, double upper_limit) {

    // Validate parent datum exists
    auto parent_it = datums_.find(parent_datum_id);
    if (parent_it == datums_.end()) {
        return JointResult{{}, "Parent datum not found: " + parent_datum_id};
    }

    // Validate child datum exists
    auto child_it = datums_.find(child_datum_id);
    if (child_it == datums_.end()) {
        return JointResult{{}, "Child datum not found: " + child_datum_id};
    }

    // Validate different parent bodies
    if (parent_it->second.parent_body_id == child_it->second.parent_body_id) {
        spdlog::warn("Joint '{}' rejected: datums {} and {} are on the same body ({})",
                     name, parent_datum_id, child_datum_id, parent_it->second.parent_body_id);
        return JointResult{{}, "Parent and child datums must be on different bodies"};
    }

    // Validate joint type (1=REVOLUTE..6=PLANAR)
    if (type < 1 || type > 6) {
        return JointResult{{}, "Invalid joint type"};
    }

    // Validate limits for types that support them (REVOLUTE, PRISMATIC, CYLINDRICAL)
    if (type == 1 || type == 2 || type == 5) {
        if (lower_limit > upper_limit) {
            return JointResult{{}, "Lower limit must be <= upper limit"};
        }
    }

    // Zero limits for types that don't support them (FIXED, SPHERICAL, PLANAR)
    if (type == 3 || type == 4 || type == 6) {
        lower_limit = 0.0;
        upper_limit = 0.0;
    }

    JointEntry entry;
    entry.id = generate_uuidv7();
    entry.name = name;
    entry.type = type;
    entry.parent_datum_id = parent_datum_id;
    entry.child_datum_id = child_datum_id;
    entry.lower_limit = lower_limit;
    entry.upper_limit = upper_limit;

    joints_[entry.id] = entry;
    return JointResult{entry, ""};
}

MechanismState::JointResult MechanismState::update_joint(
    const std::string& joint_id,
    const std::optional<std::string>& name,
    const std::optional<int>& type,
    const std::optional<double>& lower_limit,
    const std::optional<double>& upper_limit) {

    auto it = joints_.find(joint_id);
    if (it == joints_.end()) {
        return JointResult{{}, "Joint not found: " + joint_id};
    }

    auto& entry = it->second;

    if (name.has_value()) {
        entry.name = name.value();
    }
    if (type.has_value()) {
        int t = type.value();
        if (t < 1 || t > 6) {
            return JointResult{{}, "Invalid joint type"};
        }
        entry.type = t;
    }
    if (lower_limit.has_value()) {
        entry.lower_limit = lower_limit.value();
    }
    if (upper_limit.has_value()) {
        entry.upper_limit = upper_limit.value();
    }

    // Re-validate limits after update
    if (entry.type == 1 || entry.type == 2 || entry.type == 5) {
        if (entry.lower_limit > entry.upper_limit) {
            return JointResult{{}, "Lower limit must be <= upper limit"};
        }
    }

    // Zero limits for types that don't support them (FIXED, SPHERICAL, PLANAR)
    if (entry.type == 3 || entry.type == 4 || entry.type == 6) {
        entry.lower_limit = 0.0;
        entry.upper_limit = 0.0;
    }

    return JointResult{entry, ""};
}

bool MechanismState::delete_joint(const std::string& joint_id) {
    return joints_.erase(joint_id) > 0;
}

const MechanismState::JointEntry* MechanismState::get_joint(const std::string& id) const {
    auto it = joints_.find(id);
    if (it == joints_.end()) return nullptr;
    return &it->second;
}

size_t MechanismState::joint_count() const {
    return joints_.size();
}

bool MechanismState::is_datum_referenced_by_joint(const std::string& datum_id) const {
    for (const auto& [_, joint] : joints_) {
        if (joint.parent_datum_id == datum_id || joint.child_datum_id == datum_id) {
            return true;
        }
    }
    return false;
}

void MechanismState::clear() {
    bodies_.clear();
    datums_.clear();
    joints_.clear();
}

void MechanismState::load_from_proto(const mechanism::Mechanism& mech) {
    clear();

    for (const auto& body : mech.bodies()) {
        double pos[3] = {
            body.pose().position().x(),
            body.pose().position().y(),
            body.pose().position().z()
        };
        double orient[4] = {
            body.pose().orientation().w(),
            body.pose().orientation().x(),
            body.pose().orientation().y(),
            body.pose().orientation().z()
        };
        double com[3] = {
            body.mass_properties().center_of_mass().x(),
            body.mass_properties().center_of_mass().y(),
            body.mass_properties().center_of_mass().z()
        };
        double inertia[6] = {
            body.mass_properties().ixx(),
            body.mass_properties().iyy(),
            body.mass_properties().izz(),
            body.mass_properties().ixy(),
            body.mass_properties().ixz(),
            body.mass_properties().iyz()
        };
        add_body(body.id().id(), body.name(), pos, orient,
                 body.mass_properties().mass(), com, inertia,
                 body.is_fixed());
    }

    for (const auto& datum : mech.datums()) {
        DatumEntry entry;
        entry.id = datum.id().id();
        entry.name = datum.name();
        entry.parent_body_id = datum.parent_body_id().id();
        entry.position[0] = datum.local_pose().position().x();
        entry.position[1] = datum.local_pose().position().y();
        entry.position[2] = datum.local_pose().position().z();
        entry.orientation[0] = datum.local_pose().orientation().w();
        entry.orientation[1] = datum.local_pose().orientation().x();
        entry.orientation[2] = datum.local_pose().orientation().y();
        entry.orientation[3] = datum.local_pose().orientation().z();
        datums_[entry.id] = entry;
    }

    for (const auto& joint : mech.joints()) {
        JointEntry entry;
        entry.id = joint.id().id();
        entry.name = joint.name();
        entry.type = static_cast<int>(joint.type());
        entry.parent_datum_id = joint.parent_datum_id().id();
        entry.child_datum_id = joint.child_datum_id().id();
        entry.lower_limit = joint.lower_limit();
        entry.upper_limit = joint.upper_limit();
        joints_[entry.id] = entry;
    }
}

mechanism::Mechanism MechanismState::build_mechanism_proto() const {
    mechanism::Mechanism mech;
    mech.mutable_id()->set_id("sim-mechanism");
    mech.set_name("Current Mechanism");

    for (const auto& [id, body] : bodies_) {
        auto* pb = mech.add_bodies();
        pb->mutable_id()->set_id(body.id);
        pb->set_name(body.name);

        auto* pose = pb->mutable_pose();
        auto* pos = pose->mutable_position();
        pos->set_x(body.position[0]);
        pos->set_y(body.position[1]);
        pos->set_z(body.position[2]);
        auto* rot = pose->mutable_orientation();
        rot->set_w(body.orientation[0]);
        rot->set_x(body.orientation[1]);
        rot->set_y(body.orientation[2]);
        rot->set_z(body.orientation[3]);

        auto* mp = pb->mutable_mass_properties();
        mp->set_mass(body.mass);
        auto* com = mp->mutable_center_of_mass();
        com->set_x(body.center_of_mass[0]);
        com->set_y(body.center_of_mass[1]);
        com->set_z(body.center_of_mass[2]);
        mp->set_ixx(body.inertia[0]);
        mp->set_iyy(body.inertia[1]);
        mp->set_izz(body.inertia[2]);
        mp->set_ixy(body.inertia[3]);
        mp->set_ixz(body.inertia[4]);
        mp->set_iyz(body.inertia[5]);

        pb->set_is_fixed(body.is_fixed);
    }

    for (const auto& [id, datum] : datums_) {
        auto* pd = mech.add_datums();
        pd->mutable_id()->set_id(datum.id);
        pd->set_name(datum.name);
        pd->mutable_parent_body_id()->set_id(datum.parent_body_id);

        auto* pose = pd->mutable_local_pose();
        auto* pos = pose->mutable_position();
        pos->set_x(datum.position[0]);
        pos->set_y(datum.position[1]);
        pos->set_z(datum.position[2]);
        auto* rot = pose->mutable_orientation();
        rot->set_w(datum.orientation[0]);
        rot->set_x(datum.orientation[1]);
        rot->set_y(datum.orientation[2]);
        rot->set_z(datum.orientation[3]);
    }

    for (const auto& [id, joint] : joints_) {
        auto* pj = mech.add_joints();
        pj->mutable_id()->set_id(joint.id);
        pj->set_name(joint.name);
        pj->set_type(static_cast<mechanism::JointType>(joint.type));
        pj->mutable_parent_datum_id()->set_id(joint.parent_datum_id);
        pj->mutable_child_datum_id()->set_id(joint.child_datum_id);
        pj->set_lower_limit(joint.lower_limit);
        pj->set_upper_limit(joint.upper_limit);
    }

    return mech;
}

} // namespace motionlab::engine
