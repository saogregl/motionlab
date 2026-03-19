#pragma once

#include <optional>
#include <string>
#include <unordered_map>

namespace motionlab::mechanism {
class Mechanism;
}

namespace motionlab::engine {

class MechanismState {
public:
    // Body tracking (populated from import results)
    void add_body(const std::string& id, const std::string& name);
    void add_body(const std::string& id, const std::string& name,
                  const double pos[3], const double orient[4],
                  double mass, const double com[3], const double inertia[6]);
    bool has_body(const std::string& id) const;

    // Build a Mechanism proto from current state
    motionlab::mechanism::Mechanism build_mechanism_proto() const;

    // Load state from a Mechanism proto (preserving original IDs)
    void load_from_proto(const motionlab::mechanism::Mechanism& mech);

    // Datum CRUD
    struct DatumEntry {
        std::string id, name, parent_body_id;
        double position[3];
        double orientation[4]; // w,x,y,z
    };

    std::optional<DatumEntry> create_datum(const std::string& parent_body_id,
                                            const std::string& name,
                                            const double pos[3], const double orient[4]);
    bool delete_datum(const std::string& datum_id);
    std::optional<DatumEntry> rename_datum(const std::string& datum_id,
                                            const std::string& new_name);
    const DatumEntry* get_datum(const std::string& id) const;

    // Joint CRUD
    struct JointEntry {
        std::string id, name;
        int type; // 1=REVOLUTE, 2=PRISMATIC, 3=FIXED
        std::string parent_datum_id, child_datum_id;
        double lower_limit, upper_limit;
    };

    struct JointResult {
        std::optional<JointEntry> entry;
        std::string error;
    };

    JointResult create_joint(const std::string& parent_datum_id,
                             const std::string& child_datum_id,
                             int type, const std::string& name,
                             double lower_limit, double upper_limit);
    JointResult update_joint(const std::string& joint_id,
                             const std::optional<std::string>& name,
                             const std::optional<int>& type,
                             const std::optional<double>& lower_limit,
                             const std::optional<double>& upper_limit);
    bool delete_joint(const std::string& joint_id);
    const JointEntry* get_joint(const std::string& id) const;
    size_t joint_count() const;
    bool is_datum_referenced_by_joint(const std::string& datum_id) const;

    size_t body_count() const;
    size_t datum_count() const;
    void clear();

private:
    struct BodyEntry {
        std::string id, name;
        double position[3] = {0, 0, 0};
        double orientation[4] = {1, 0, 0, 0}; // w,x,y,z
        double mass = 0.0;
        double center_of_mass[3] = {0, 0, 0};
        double inertia[6] = {0, 0, 0, 0, 0, 0}; // ixx,iyy,izz,ixy,ixz,iyz
    };
    std::unordered_map<std::string, BodyEntry> bodies_;
    std::unordered_map<std::string, DatumEntry> datums_;
    std::unordered_map<std::string, JointEntry> joints_;
};

} // namespace motionlab::engine
