#pragma once

#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include "mechanism/mechanism.pb.h"

namespace motionlab::engine {

class MechanismState {
public:
    using BodyEntry = motionlab::mechanism::Body;
    using DatumEntry = motionlab::mechanism::Datum;
    using JointEntry = motionlab::mechanism::Joint;
    using LoadEntry = motionlab::mechanism::Load;
    using ActuatorEntry = motionlab::mechanism::Actuator;
    using SensorEntry = motionlab::mechanism::Sensor;
    using GeometryEntry = motionlab::mechanism::Geometry;

    struct JointResult {
        std::optional<JointEntry> entry;
        std::string error;
    };

    struct LoadResult {
        std::optional<LoadEntry> entry;
        std::string error;
    };

    struct ActuatorResult {
        std::optional<ActuatorEntry> entry;
        std::string error;
    };

    struct SensorResult {
        std::optional<SensorEntry> entry;
        std::string error;
    };

    struct GeometryResult {
        std::optional<GeometryEntry> entry;
        std::vector<DatumEntry> updated_datums;
        std::string error;
    };

    // Body lifecycle
    void add_body(const std::string& id, const std::string& name);
    void add_body(const std::string& id, const std::string& name,
                  const double pos[3], const double orient[4],
                  double mass, const double com[3], const double inertia[6],
                  bool is_fixed = false);
    std::string create_body(const std::string& name,
                            const double pos[3], const double orient[4],
                            const motionlab::mechanism::MassProperties* mass = nullptr,
                            bool is_fixed = false);
    bool delete_body(const std::string& body_id);
    bool rename_body(const std::string& body_id, const std::string& new_name);
    bool has_body(const std::string& id) const;
    const BodyEntry* get_body(const std::string& id) const;
    bool set_body_fixed(const std::string& id, bool is_fixed);
    bool set_body_pose(const std::string& id, const double pos[3], const double orient[4]);
    size_t body_count() const;

    // Geometry CRUD
    GeometryResult add_geometry(const std::string& id, const std::string& name,
                                const std::string& parent_body_id,
                                const double pos[3], const double orient[4],
                                const motionlab::mechanism::MassProperties& computed_mass,
                                const motionlab::mechanism::AssetReference* source_asset_ref = nullptr,
                                uint32_t face_count = 0,
                                const motionlab::mechanism::PrimitiveSource* primitive_source = nullptr);
    bool remove_geometry(const std::string& geometry_id);
    bool rename_geometry(const std::string& geometry_id, const std::string& new_name);
    const GeometryEntry* get_geometry(const std::string& id) const;
    size_t geometry_count() const;

    // Update primitive geometry (regenerated B-Rep with new params)
    GeometryResult update_geometry_primitive(
        const std::string& geometry_id,
        const motionlab::mechanism::MassProperties& computed_mass,
        uint32_t face_count,
        const motionlab::mechanism::PrimitiveSource& primitive_source);

    // Update collision config on a geometry
    GeometryResult update_geometry_collision_config(
        const std::string& geometry_id,
        const motionlab::mechanism::CollisionConfig& collision_config);

    // Update geometry local pose (relative to parent body)
    GeometryResult update_geometry_local_pose(const std::string& geometry_id,
                                              const double pos[3], const double orient[4]);

    // Geometry attachment
    GeometryResult attach_geometry(const std::string& geometry_id,
                                   const std::string& body_id,
                                   const double pos[3], const double orient[4]);
    GeometryResult detach_geometry(const std::string& geometry_id);

    // Reparent geometry to a different body, preserving world-space position
    GeometryResult reparent_geometry(const std::string& geometry_id,
                                     const std::string& target_body_id);

    // Compound body operations (atomic multi-step)
    struct CompoundBodyResult {
        std::string created_body_id;
        std::vector<std::string> dissolved_body_ids;
        std::vector<std::string> modified_body_ids;
        std::vector<DatumEntry> reparented_datums;
        std::string error;
    };
    CompoundBodyResult make_compound_body(const std::vector<std::string>& geometry_ids,
                                          const std::string& name,
                                          bool is_fixed,
                                          bool dissolve_empty,
                                          const std::string& reference_body_id = "");

    // Reparent all datums from source body to target body, preserving world-space positions.
    std::vector<DatumEntry> reparent_datums(const std::string& source_body_id,
                                             const std::string& target_body_id);

    struct SplitResult {
        std::string created_body_id;
        std::vector<DatumEntry> updated_datums;
        std::string error;
    };
    SplitResult split_body(const std::string& source_body_id,
                           const std::vector<std::string>& geometry_ids,
                           const std::string& name,
                           bool is_fixed);

    // Mass management
    std::vector<const GeometryEntry*> get_body_geometries(const std::string& body_id) const;
    motionlab::mechanism::MassProperties compute_aggregate_mass(const std::string& body_id) const;
    bool set_mass_override(const std::string& body_id, bool override,
                           const motionlab::mechanism::MassProperties* user_mass = nullptr);

    // Refresh aggregate masses for all non-override bodies
    void refresh_aggregate_masses();

    // Proto serialization
    motionlab::mechanism::Mechanism build_mechanism_proto() const;
    std::optional<motionlab::mechanism::Body> build_body_proto(const std::string& body_id) const;
    void load_from_proto(const motionlab::mechanism::Mechanism& mech);

    // Datum CRUD
    std::optional<DatumEntry> create_datum(const std::string& parent_body_id,
                                           const std::string& name,
                                           const double pos[3], const double orient[4]);
    bool delete_datum(const std::string& datum_id);
    std::optional<DatumEntry> rename_datum(const std::string& datum_id,
                                           const std::string& new_name);
    std::optional<DatumEntry> update_datum_pose(const std::string& datum_id,
                                                const double pos[3],
                                                const double orient[4]);
    std::optional<DatumEntry> set_datum_face_attachment(
        const std::string& datum_id,
        const std::string& source_geometry_id,
        uint32_t source_face_index,
        const double source_geometry_local_pos[3],
        const double source_geometry_local_orient[4],
        motionlab::mechanism::DatumSurfaceClass surface_class,
        const motionlab::mechanism::DatumFaceGeometryInfo* face_geometry = nullptr);
    const DatumEntry* get_datum(const std::string& id) const;
    size_t datum_count() const;

    // Co-translate datums so their world positions stay fixed when a body moves.
    std::vector<DatumEntry> co_translate_datums(
        const std::string& body_id,
        const motionlab::mechanism::Pose& old_body_pose,
        const motionlab::mechanism::Pose& new_body_pose);

    // Joint CRUD
    JointResult create_joint(const JointEntry& draft);
    JointResult update_joint(const JointEntry& joint);
    bool delete_joint(const std::string& joint_id);
    const JointEntry* get_joint(const std::string& id) const;
    size_t joint_count() const;
    bool is_datum_referenced_by_joint(const std::string& datum_id) const;

    // Load CRUD
    LoadResult create_load(const LoadEntry& draft);
    LoadResult update_load(const LoadEntry& load);
    bool delete_load(const std::string& load_id);
    const LoadEntry* get_load(const std::string& id) const;
    size_t load_count() const;
    bool is_datum_referenced_by_load(const std::string& datum_id) const;

    // Actuator CRUD
    ActuatorResult create_actuator(const ActuatorEntry& draft);
    ActuatorResult update_actuator(const ActuatorEntry& actuator);
    bool delete_actuator(const std::string& actuator_id);
    const ActuatorEntry* get_actuator(const std::string& id) const;
    size_t actuator_count() const;
    bool is_joint_referenced_by_actuator(const std::string& joint_id) const;

    // Sensor CRUD
    SensorResult create_sensor(const SensorEntry& draft);
    SensorResult update_sensor(const SensorEntry& sensor);
    bool delete_sensor(const std::string& sensor_id);
    const SensorEntry* get_sensor(const std::string& id) const;
    size_t sensor_count() const;

    void clear();

private:
    static motionlab::mechanism::Pose make_pose(const double pos[3], const double orient[4]);
    static void populate_legacy_joint_limits(motionlab::mechanism::Joint* joint);
    static void clear_legacy_joint_limits(motionlab::mechanism::Joint* joint);
    static void upgrade_legacy_joint(motionlab::mechanism::Joint* joint);

    std::string validate_joint(motionlab::mechanism::Joint* joint) const;
    std::string validate_load(const motionlab::mechanism::Load& load) const;
    std::string validate_actuator(const motionlab::mechanism::Actuator& actuator) const;
    std::string validate_sensor(const motionlab::mechanism::Sensor& sensor) const;

    void update_body_aggregate_mass(const std::string& body_id);
    bool geometry_has_linked_datums(const std::string& geometry_id) const;
    std::vector<DatumEntry> sync_face_datums_for_geometry(const std::string& geometry_id);
    std::vector<DatumEntry> clear_face_datum_provenance_for_geometry(const std::string& geometry_id);

    std::unordered_map<std::string, BodyEntry> bodies_;
    std::unordered_map<std::string, DatumEntry> datums_;
    std::unordered_map<std::string, JointEntry> joints_;
    std::unordered_map<std::string, LoadEntry> loads_;
    std::unordered_map<std::string, ActuatorEntry> actuators_;
    std::unordered_map<std::string, SensorEntry> sensors_;
    std::unordered_map<std::string, GeometryEntry> geometries_;
};

} // namespace motionlab::engine
