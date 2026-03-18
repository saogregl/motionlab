#include "mechanism_state.h"
#include "uuid.h"

#include <cstring>

namespace motionlab::engine {

void MechanismState::add_body(const std::string& id, const std::string& name) {
    bodies_[id] = BodyEntry{id, name};
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
        return JointResult{{}, "Parent and child datums must be on different bodies"};
    }

    // Validate joint type (1=REVOLUTE, 2=PRISMATIC, 3=FIXED)
    if (type < 1 || type > 3) {
        return JointResult{{}, "Invalid joint type"};
    }

    // Validate limits for REVOLUTE/PRISMATIC
    if (type == 1 || type == 2) {
        if (lower_limit > upper_limit) {
            return JointResult{{}, "Lower limit must be <= upper limit"};
        }
    }

    // FIXED joints: zero the limits
    if (type == 3) {
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
        if (t < 1 || t > 3) {
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
    if (entry.type == 1 || entry.type == 2) {
        if (entry.lower_limit > entry.upper_limit) {
            return JointResult{{}, "Lower limit must be <= upper limit"};
        }
    }

    // FIXED joints: zero the limits
    if (entry.type == 3) {
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

} // namespace motionlab::engine
