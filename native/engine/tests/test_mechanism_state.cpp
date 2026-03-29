#include "../src/mechanism_state.h"
#include "../src/pose_math.h"
#include "engine/log.h"

#include <cassert>
#include <cmath>
#include <iostream>
#include <regex>
#include <string>

namespace eng = motionlab::engine;
namespace mech = motionlab::mechanism;

namespace {

void add_body(eng::MechanismState& state, const std::string& id, const std::string& name, bool is_fixed = false) {
    const double pos[3] = {0.0, 0.0, 0.0};
    const double orient[4] = {1.0, 0.0, 0.0, 0.0};
    const double com[3] = {0.0, 0.0, 0.0};
    const double inertia[6] = {0.1, 0.1, 0.1, 0.0, 0.0, 0.0};
    state.add_body(id, name, pos, orient, 1.0, com, inertia, is_fixed);
}

std::optional<mech::Datum> add_datum(eng::MechanismState& state,
                                     const std::string& body_id,
                                     const std::string& name,
                                     double x) {
    const double pos[3] = {x, 0.0, 0.0};
    const double orient[4] = {1.0, 0.0, 0.0, 0.0};
    return state.create_datum(body_id, name, pos, orient);
}

void add_geometry(eng::MechanismState& state,
                  const std::string& geometry_id,
                  const std::string& name,
                  const std::string& body_id,
                  double x) {
    mech::MassProperties mp;
    mp.set_mass(1.0);
    mp.set_ixx(0.01);
    mp.set_iyy(0.01);
    mp.set_izz(0.01);
    const double pos[3] = {x, 0.0, 0.0};
    const double orient[4] = {1.0, 0.0, 0.0, 0.0};
    auto result = state.add_geometry(geometry_id, name, body_id, pos, orient, mp);
    assert(result.entry.has_value());
}

std::optional<mech::Datum> add_face_linked_datum(eng::MechanismState& state,
                                                 const std::string& body_id,
                                                 const std::string& geometry_id,
                                                 const std::string& name,
                                                 double body_local_x,
                                                 double geometry_local_x,
                                                 uint32_t face_index = 0) {
    const double body_local_pos[3] = {body_local_x, 0.0, 0.0};
    const double geom_local_pos[3] = {geometry_local_x, 0.0, 0.0};
    const double orient[4] = {1.0, 0.0, 0.0, 0.0};
    auto datum = state.create_datum(body_id, name, body_local_pos, orient);
    if (!datum.has_value()) {
        return datum;
    }

    mech::DatumFaceGeometryInfo face_geometry;
    face_geometry.mutable_axis_direction()->set_z(1.0);
    auto annotated = state.set_datum_face_attachment(
        datum->id().id(),
        geometry_id,
        face_index,
        geom_local_pos,
        orient,
        mech::DATUM_SURFACE_CLASS_CYLINDRICAL,
        &face_geometry);
    assert(annotated.has_value());
    return annotated;
}

mech::Joint make_revolute_joint_draft(const std::string& parent_datum_id,
                                      const std::string& child_datum_id,
                                      const std::string& name,
                                      double lower = -3.14,
                                      double upper = 3.14) {
    mech::Joint joint;
    joint.set_name(name);
    joint.set_type(mech::JOINT_TYPE_REVOLUTE);
    joint.mutable_parent_datum_id()->set_id(parent_datum_id);
    joint.mutable_child_datum_id()->set_id(child_datum_id);
    auto* cfg = joint.mutable_revolute();
    cfg->mutable_angle_limit()->set_lower(lower);
    cfg->mutable_angle_limit()->set_upper(upper);
    return joint;
}

mech::Load make_point_force_load_draft(const std::string& datum_id, const std::string& name) {
    mech::Load load;
    load.set_name(name);
    auto* cfg = load.mutable_point_force();
    cfg->mutable_datum_id()->set_id(datum_id);
    cfg->mutable_vector()->set_x(0.0);
    cfg->mutable_vector()->set_y(-10.0);
    cfg->mutable_vector()->set_z(0.0);
    cfg->set_reference_frame(mech::REFERENCE_FRAME_WORLD);
    return load;
}

mech::Actuator make_revolute_motor_draft(const std::string& joint_id,
                                         const std::string& name,
                                         mech::ActuatorControlMode mode = mech::ACTUATOR_CONTROL_MODE_SPEED) {
    mech::Actuator actuator;
    actuator.set_name(name);
    auto* cfg = actuator.mutable_revolute_motor();
    cfg->mutable_joint_id()->set_id(joint_id);
    cfg->set_control_mode(mode);
    cfg->set_command_value(2.0);
    return actuator;
}

void test_datum_crud() {
    eng::MechanismState state;
    add_body(state, "body-001", "Ground", true);

    auto datum = add_datum(state, "body-001", "Origin", 1.0);
    assert(datum.has_value());
    assert(datum->name() == "Origin");
    assert(datum->parent_body_id().id() == "body-001");
    assert(datum->local_pose().position().x() == 1.0);
    assert(state.datum_count() == 1);

    std::regex uuid_re("^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$");
    assert(std::regex_match(datum->id().id(), uuid_re));

    auto renamed = state.rename_datum(datum->id().id(), "Renamed");
    assert(renamed.has_value());
    assert(renamed->name() == "Renamed");

    const double new_pos[3] = {4.0, 5.0, 6.0};
    const double new_orient[4] = {0.5, 0.5, 0.5, 0.5};
    auto updated = state.update_datum_pose(datum->id().id(), new_pos, new_orient);
    assert(updated.has_value());
    assert(updated->local_pose().position().z() == 6.0);
    assert(updated->local_pose().orientation().w() == 0.5);

    assert(state.delete_datum(datum->id().id()));
    assert(state.datum_count() == 0);

    std::cout << "  PASS: datum CRUD" << std::endl;
}

void test_joint_load_actuator_lifecycle() {
    eng::MechanismState state;
    add_body(state, "body-a", "Ground", true);
    add_body(state, "body-b", "Link");

    auto d1 = add_datum(state, "body-a", "A", 0.0);
    auto d2 = add_datum(state, "body-b", "B", 0.0);
    assert(d1.has_value() && d2.has_value());

    auto joint_result = state.create_joint(make_revolute_joint_draft(d1->id().id(), d2->id().id(), "Rev1"));
    assert(joint_result.entry.has_value());
    assert(joint_result.error.empty());
    const auto joint_id = joint_result.entry->id().id();
    assert(state.joint_count() == 1);
    assert(state.get_joint(joint_id) != nullptr);

    auto updated_joint = *joint_result.entry;
    updated_joint.set_name("Rev1Updated");
    updated_joint.mutable_revolute()->mutable_angle_limit()->set_upper(1.57);
    auto update_result = state.update_joint(updated_joint);
    assert(update_result.entry.has_value());
    assert(update_result.entry->name() == "Rev1Updated");
    assert(update_result.entry->revolute().angle_limit().upper() == 1.57);

    auto load_result = state.create_load(make_point_force_load_draft(d2->id().id(), "GravityAssist"));
    assert(load_result.entry.has_value());
    assert(load_result.error.empty());
    const auto load_id = load_result.entry->id().id();
    assert(state.load_count() == 1);
    assert(!state.delete_datum(d2->id().id()));
    assert(state.is_datum_referenced_by_load(d2->id().id()));

    auto actuator_result = state.create_actuator(make_revolute_motor_draft(joint_id, "Motor1"));
    assert(actuator_result.entry.has_value());
    assert(actuator_result.error.empty());
    const auto actuator_id = actuator_result.entry->id().id();
    assert(state.actuator_count() == 1);
    assert(!state.delete_joint(joint_id));
    assert(state.is_joint_referenced_by_actuator(joint_id));

    assert(state.delete_actuator(actuator_id));
    assert(state.delete_load(load_id));
    assert(state.delete_joint(joint_id));
    assert(state.delete_datum(d2->id().id()));

    std::cout << "  PASS: joint/load/actuator lifecycle" << std::endl;
}

void test_validation_rules() {
    eng::MechanismState state;
    add_body(state, "body-a", "Ground", true);
    add_body(state, "body-b", "Slider");

    auto d1 = add_datum(state, "body-a", "A", 0.0);
    auto d2 = add_datum(state, "body-b", "B", 0.0);
    assert(d1.has_value() && d2.has_value());

    auto bad_joint = make_revolute_joint_draft(d1->id().id(), d2->id().id(), "BadJoint");
    bad_joint.set_type(mech::JOINT_TYPE_PRISMATIC);
    auto joint_result = state.create_joint(bad_joint);
    assert(!joint_result.entry.has_value());
    assert(!joint_result.error.empty());

    auto good_joint = state.create_joint(make_revolute_joint_draft(d1->id().id(), d2->id().id(), "Rev1"));
    assert(good_joint.entry.has_value());

    auto bad_load = make_point_force_load_draft("missing-datum", "BadLoad");
    auto load_result = state.create_load(bad_load);
    assert(!load_result.entry.has_value());
    assert(!load_result.error.empty());

    mech::Actuator bad_actuator;
    bad_actuator.set_name("BadMotor");
    auto* prismatic = bad_actuator.mutable_prismatic_motor();
    prismatic->mutable_joint_id()->set_id(good_joint.entry->id().id());
    prismatic->set_control_mode(mech::ACTUATOR_CONTROL_MODE_SPEED);
    prismatic->set_command_value(1.0);
    auto actuator_result = state.create_actuator(bad_actuator);
    assert(!actuator_result.entry.has_value());
    assert(!actuator_result.error.empty());

    std::cout << "  PASS: validation rules" << std::endl;
}

void test_joint_type_configs() {
    eng::MechanismState state;
    add_body(state, "body-a", "Ground", true);
    add_body(state, "body-b", "Link1");
    add_body(state, "body-c", "Link2");
    add_body(state, "body-d", "Link3");
    add_body(state, "body-e", "Link4");
    add_body(state, "body-f", "Link5");

    auto da = add_datum(state, "body-a", "DA", 0.0);
    auto db = add_datum(state, "body-b", "DB", 1.0);
    auto dc = add_datum(state, "body-c", "DC", 2.0);
    auto dd = add_datum(state, "body-d", "DD", 3.0);
    auto de = add_datum(state, "body-e", "DE", 4.0);
    auto df = add_datum(state, "body-f", "DF", 5.0);
    assert(da.has_value() && db.has_value() && dc.has_value());
    assert(dd.has_value() && de.has_value() && df.has_value());

    // 1. Prismatic joint with translation limit
    {
        mech::Joint joint;
        joint.set_name("PrismaticJoint");
        joint.set_type(mech::JOINT_TYPE_PRISMATIC);
        joint.mutable_parent_datum_id()->set_id(da->id().id());
        joint.mutable_child_datum_id()->set_id(db->id().id());
        auto* cfg = joint.mutable_prismatic();
        cfg->mutable_translation_limit()->set_lower(-0.5);
        cfg->mutable_translation_limit()->set_upper(0.5);

        auto result = state.create_joint(joint);
        assert(result.entry.has_value());
        assert(result.error.empty());
        assert(result.entry->config_case() == mech::Joint::kPrismatic);
        assert(result.entry->prismatic().translation_limit().lower() == -0.5);
        assert(result.entry->prismatic().translation_limit().upper() == 0.5);
    }

    // 2. Fixed joint
    {
        mech::Joint joint;
        joint.set_name("FixedJoint");
        joint.set_type(mech::JOINT_TYPE_FIXED);
        joint.mutable_parent_datum_id()->set_id(da->id().id());
        joint.mutable_child_datum_id()->set_id(dc->id().id());
        joint.mutable_fixed();

        auto result = state.create_joint(joint);
        assert(result.entry.has_value());
        assert(result.error.empty());
        assert(result.entry->config_case() == mech::Joint::kFixed);
    }

    // 3. Spherical joint
    {
        mech::Joint joint;
        joint.set_name("SphericalJoint");
        joint.set_type(mech::JOINT_TYPE_SPHERICAL);
        joint.mutable_parent_datum_id()->set_id(da->id().id());
        joint.mutable_child_datum_id()->set_id(dd->id().id());
        joint.mutable_spherical();

        auto result = state.create_joint(joint);
        assert(result.entry.has_value());
        assert(result.error.empty());
        assert(result.entry->config_case() == mech::Joint::kSpherical);
    }

    // 4. Cylindrical joint with dual limits
    {
        mech::Joint joint;
        joint.set_name("CylindricalJoint");
        joint.set_type(mech::JOINT_TYPE_CYLINDRICAL);
        joint.mutable_parent_datum_id()->set_id(da->id().id());
        joint.mutable_child_datum_id()->set_id(de->id().id());
        auto* cfg = joint.mutable_cylindrical();
        cfg->mutable_translation_limit()->set_lower(-1.0);
        cfg->mutable_translation_limit()->set_upper(1.0);
        cfg->mutable_rotation_limit()->set_lower(-3.14);
        cfg->mutable_rotation_limit()->set_upper(3.14);

        auto result = state.create_joint(joint);
        assert(result.entry.has_value());
        assert(result.error.empty());
        assert(result.entry->config_case() == mech::Joint::kCylindrical);
        assert(result.entry->cylindrical().translation_limit().lower() == -1.0);
        assert(result.entry->cylindrical().rotation_limit().upper() == 3.14);
    }

    // 5. Planar joint with multi-axis limits
    {
        mech::Joint joint;
        joint.set_name("PlanarJoint");
        joint.set_type(mech::JOINT_TYPE_PLANAR);
        joint.mutable_parent_datum_id()->set_id(da->id().id());
        joint.mutable_child_datum_id()->set_id(df->id().id());
        auto* cfg = joint.mutable_planar();
        cfg->mutable_translation_x_limit()->set_lower(-2.0);
        cfg->mutable_translation_x_limit()->set_upper(2.0);
        cfg->mutable_translation_y_limit()->set_lower(-1.5);
        cfg->mutable_translation_y_limit()->set_upper(1.5);
        cfg->mutable_rotation_limit()->set_lower(-1.57);
        cfg->mutable_rotation_limit()->set_upper(1.57);

        auto result = state.create_joint(joint);
        assert(result.entry.has_value());
        assert(result.error.empty());
        assert(result.entry->config_case() == mech::Joint::kPlanar);
        assert(result.entry->planar().translation_x_limit().lower() == -2.0);
        assert(result.entry->planar().translation_y_limit().upper() == 1.5);
        assert(result.entry->planar().rotation_limit().upper() == 1.57);
    }

    // 6. Negative test: JOINT_TYPE_UNSPECIFIED should fail
    {
        mech::Joint joint;
        joint.set_name("UnspecifiedJoint");
        joint.set_type(mech::JOINT_TYPE_UNSPECIFIED);
        joint.mutable_parent_datum_id()->set_id(da->id().id());
        joint.mutable_child_datum_id()->set_id(db->id().id());

        auto result = state.create_joint(joint);
        assert(!result.entry.has_value());
        assert(!result.error.empty());
    }

    std::cout << "  PASS: joint type configs" << std::endl;
}

void test_spring_damper_load_and_prismatic_motor() {
    eng::MechanismState state;
    add_body(state, "body-a", "Ground", true);
    add_body(state, "body-b", "Link");

    auto da = add_datum(state, "body-a", "DA", 0.0);
    auto db = add_datum(state, "body-b", "DB", 1.0);
    assert(da.has_value() && db.has_value());

    // Linear spring-damper load
    {
        mech::Load load;
        load.set_name("SpringDamper1");
        auto* cfg = load.mutable_linear_spring_damper();
        cfg->mutable_parent_datum_id()->set_id(da->id().id());
        cfg->mutable_child_datum_id()->set_id(db->id().id());
        cfg->set_stiffness(100.0);
        cfg->set_damping(5.0);
        cfg->set_rest_length(0.5);

        auto result = state.create_load(load);
        assert(result.entry.has_value());
        assert(result.error.empty());
        assert(result.entry->config_case() == mech::Load::kLinearSpringDamper);
        assert(result.entry->linear_spring_damper().stiffness() == 100.0);
        assert(result.entry->linear_spring_damper().damping() == 5.0);
        assert(result.entry->linear_spring_damper().rest_length() == 0.5);
        assert(state.load_count() == 1);
    }

    // Prismatic motor actuator (needs a prismatic joint first)
    {
        mech::Joint joint;
        joint.set_name("PrismaticForMotor");
        joint.set_type(mech::JOINT_TYPE_PRISMATIC);
        joint.mutable_parent_datum_id()->set_id(da->id().id());
        joint.mutable_child_datum_id()->set_id(db->id().id());
        joint.mutable_prismatic()->mutable_translation_limit()->set_lower(-1.0);
        joint.mutable_prismatic()->mutable_translation_limit()->set_upper(1.0);

        auto joint_result = state.create_joint(joint);
        assert(joint_result.entry.has_value());
        const auto joint_id = joint_result.entry->id().id();

        mech::Actuator actuator;
        actuator.set_name("PrismaticMotor1");
        auto* cfg = actuator.mutable_prismatic_motor();
        cfg->mutable_joint_id()->set_id(joint_id);
        cfg->set_control_mode(mech::ACTUATOR_CONTROL_MODE_SPEED);
        cfg->set_command_value(0.5);

        auto result = state.create_actuator(actuator);
        assert(result.entry.has_value());
        assert(result.error.empty());
        assert(result.entry->config_case() == mech::Actuator::kPrismaticMotor);
        assert(result.entry->prismatic_motor().command_value() == 0.5);
        assert(state.actuator_count() == 1);
    }

    std::cout << "  PASS: spring-damper load and prismatic motor" << std::endl;
}

void test_proto_roundtrip_and_legacy_migration() {
    eng::MechanismState state;
    add_body(state, "body-a", "Ground", true);
    add_body(state, "body-b", "Link");

    auto d1 = add_datum(state, "body-a", "A", 0.0);
    auto d2 = add_datum(state, "body-b", "B", 0.0);
    assert(d1.has_value() && d2.has_value());

    auto joint = state.create_joint(make_revolute_joint_draft(d1->id().id(), d2->id().id(), "Rev1"));
    auto load = state.create_load(make_point_force_load_draft(d2->id().id(), "GravityAssist"));
    auto actuator = state.create_actuator(make_revolute_motor_draft(joint.entry->id().id(), "Motor1"));
    assert(joint.entry.has_value());
    assert(load.entry.has_value());
    assert(actuator.entry.has_value());

    auto mechanism = state.build_mechanism_proto();
    assert(mechanism.bodies_size() == 2);
    assert(mechanism.datums_size() == 2);
    assert(mechanism.joints_size() == 1);
    assert(mechanism.loads_size() == 1);
    assert(mechanism.actuators_size() == 1);
    // source_asset_ref is deprecated — body no longer carries it

    eng::MechanismState reloaded;
    reloaded.load_from_proto(mechanism);
    assert(reloaded.body_count() == 2);
    assert(reloaded.datum_count() == 2);
    assert(reloaded.joint_count() == 1);
    assert(reloaded.load_count() == 1);
    assert(reloaded.actuator_count() == 1);
    assert(reloaded.get_joint(joint.entry->id().id()) != nullptr);
    assert(reloaded.get_load(load.entry->id().id()) != nullptr);
    assert(reloaded.get_actuator(actuator.entry->id().id()) != nullptr);

    mech::Mechanism legacy;
    legacy.mutable_id()->set_id("legacy");
    auto* body1 = legacy.add_bodies();
    body1->mutable_id()->set_id("legacy-body-a");
    body1->set_name("Ground");
    body1->mutable_mass_properties()->set_mass(1.0);
    body1->mutable_pose()->mutable_orientation()->set_w(1.0);
    body1->set_is_fixed(true);

    auto* body2 = legacy.add_bodies();
    body2->mutable_id()->set_id("legacy-body-b");
    body2->set_name("Link");
    body2->mutable_mass_properties()->set_mass(1.0);
    body2->mutable_pose()->mutable_orientation()->set_w(1.0);

    auto* datum1 = legacy.add_datums();
    datum1->mutable_id()->set_id("legacy-datum-a");
    datum1->set_name("A");
    datum1->mutable_parent_body_id()->set_id("legacy-body-a");
    datum1->mutable_local_pose()->mutable_orientation()->set_w(1.0);

    auto* datum2 = legacy.add_datums();
    datum2->mutable_id()->set_id("legacy-datum-b");
    datum2->set_name("B");
    datum2->mutable_parent_body_id()->set_id("legacy-body-b");
    datum2->mutable_local_pose()->mutable_orientation()->set_w(1.0);

    auto* legacy_joint = legacy.add_joints();
    legacy_joint->mutable_id()->set_id("legacy-joint");
    legacy_joint->set_name("LegacyRev");
    legacy_joint->set_type(mech::JOINT_TYPE_REVOLUTE);
    legacy_joint->mutable_parent_datum_id()->set_id("legacy-datum-a");
    legacy_joint->mutable_child_datum_id()->set_id("legacy-datum-b");
    legacy_joint->set_lower_limit(-1.0);
    legacy_joint->set_upper_limit(1.0);

    eng::MechanismState migrated;
    migrated.load_from_proto(legacy);
    const auto* migrated_joint = migrated.get_joint("legacy-joint");
    assert(migrated_joint != nullptr);
    assert(migrated_joint->config_case() == mech::Joint::kRevolute);
    assert(migrated_joint->revolute().angle_limit().lower() == -1.0);
    assert(migrated_joint->revolute().angle_limit().upper() == 1.0);

    auto migrated_mechanism = migrated.build_mechanism_proto();
    assert(migrated_mechanism.joints_size() == 1);
    assert(migrated_mechanism.joints(0).config_case() == mech::Joint::kRevolute);
    // build_mechanism_proto() dual-writes deprecated legacy limit fields alongside
    // typed configs for backward compatibility with older readers.
    assert(migrated_mechanism.joints(0).lower_limit() == -1.0);
    assert(migrated_mechanism.joints(0).upper_limit() == 1.0);

    std::cout << "  PASS: proto roundtrip and legacy migration" << std::endl;
}

void test_geometry_crud() {
    eng::MechanismState state;
    add_body(state, "body-a", "Ground");

    mech::MassProperties mp;
    mp.set_mass(2.5);
    mp.mutable_center_of_mass()->set_x(0.1);
    mp.set_ixx(0.01); mp.set_iyy(0.02); mp.set_izz(0.03);

    const double pos[3] = {0, 0, 0};
    const double orient[4] = {1, 0, 0, 0};

    auto result = state.add_geometry("geom-1", "Wheel", "body-a", pos, orient, mp);
    assert(result.entry.has_value());
    assert(state.geometry_count() == 1);
    assert(state.get_geometry("geom-1") != nullptr);
    assert(state.get_geometry("geom-1")->name() == "Wheel");

    // Cannot add to nonexistent body
    auto bad = state.add_geometry("geom-2", "Bad", "body-nonexistent", pos, orient, mp);
    assert(!bad.entry.has_value());
    assert(state.geometry_count() == 1);

    // Remove
    assert(state.remove_geometry("geom-1"));
    assert(state.geometry_count() == 0);
    assert(state.get_geometry("geom-1") == nullptr);

    std::cout << "  PASS: geometry CRUD" << std::endl;
}

void test_mass_aggregation() {
    eng::MechanismState state;
    const double pos[3] = {0, 0, 0};
    const double orient[4] = {1, 0, 0, 0};
    std::string body_id = state.create_body("TestBody", pos, orient);

    // Single geometry — body mass should equal geometry mass
    mech::MassProperties mp1;
    mp1.set_mass(2.0);
    mp1.mutable_center_of_mass()->set_x(0); mp1.mutable_center_of_mass()->set_y(0); mp1.mutable_center_of_mass()->set_z(0);
    mp1.set_ixx(0.1); mp1.set_iyy(0.2); mp1.set_izz(0.3);
    mp1.set_ixy(0); mp1.set_ixz(0); mp1.set_iyz(0);
    state.add_geometry("g1", "Part1", body_id, pos, orient, mp1);

    auto agg = state.compute_aggregate_mass(body_id);
    assert(agg.mass() == 2.0);
    assert(agg.ixx() == 0.1);

    // Body mass should also be 2.0 (auto-aggregated, no override)
    auto body_proto = state.build_body_proto(body_id);
    assert(body_proto.has_value());
    assert(body_proto->mass_properties().mass() == 2.0);

    // Two geometries with offset CoMs
    mech::MassProperties mp2;
    mp2.set_mass(3.0);
    mp2.mutable_center_of_mass()->set_x(1.0); mp2.mutable_center_of_mass()->set_y(0); mp2.mutable_center_of_mass()->set_z(0);
    mp2.set_ixx(0.1); mp2.set_iyy(0.2); mp2.set_izz(0.3);
    mp2.set_ixy(0); mp2.set_ixz(0); mp2.set_iyz(0);
    state.add_geometry("g2", "Part2", body_id, pos, orient, mp2);

    agg = state.compute_aggregate_mass(body_id);
    assert(agg.mass() == 5.0);
    // CoM = (2*0 + 3*1) / 5 = 0.6
    assert(std::abs(agg.center_of_mass().x() - 0.6) < 1e-10);
    assert(std::abs(agg.center_of_mass().y()) < 1e-10);

    // Verify parallel axis theorem for Ixx
    // I_total_xx = I1_xx + m1*(dy1^2+dz1^2) + I2_xx + m2*(dy2^2+dz2^2)
    // d1 = (0-0.6, 0, 0), d2 = (1-0.6, 0, 0) = (0.4, 0, 0)
    // Ixx: 0.1 + 2*(0+0) + 0.1 + 3*(0+0) = 0.2 (no y/z offset)
    assert(std::abs(agg.ixx() - 0.2) < 1e-10);
    // Iyy: 0.2 + 2*(0.36+0) + 0.2 + 3*(0.16+0) = 0.4 + 0.72 + 0.48 = 1.6
    assert(std::abs(agg.iyy() - 1.6) < 1e-10);

    // Geometry local pose translation shifts the effective CoM in body frame
    const double offset_pos[3] = {2.0, 0.0, 0.0};
    mech::MassProperties mp3;
    mp3.set_mass(1.0);
    mp3.mutable_center_of_mass()->set_x(0.5);
    mp3.set_ixx(0.01);
    mp3.set_iyy(0.01);
    mp3.set_izz(0.01);
    auto shifted_body_id = state.create_body("ShiftedBody", pos, orient);
    state.add_geometry("g-shift", "ShiftedPart", shifted_body_id, offset_pos, orient, mp3);

    auto shifted_agg = state.compute_aggregate_mass(shifted_body_id);
    assert(std::abs(shifted_agg.center_of_mass().x() - 2.5) < 1e-10);
    assert(std::abs(shifted_agg.center_of_mass().y()) < 1e-10);

    // Geometry local rotation must rotate both COM offset and inertia tensor
    const double s = std::sqrt(2.0) / 2.0;
    const double rot90z[4] = {s, 0.0, 0.0, s};
    mech::MassProperties rotated_mp;
    rotated_mp.set_mass(4.0);
    rotated_mp.mutable_center_of_mass()->set_x(1.0);
    rotated_mp.set_ixx(0.1);
    rotated_mp.set_iyy(0.2);
    rotated_mp.set_izz(0.3);
    auto rotated_body_id = state.create_body("RotatedBody", pos, orient);
    const double translated_pos[3] = {2.0, 0.0, 0.0};
    state.add_geometry("g-rot", "RotatedPart", rotated_body_id, translated_pos, rot90z, rotated_mp);

    auto rotated_agg = state.compute_aggregate_mass(rotated_body_id);
    assert(std::abs(rotated_agg.mass() - 4.0) < 1e-10);
    assert(std::abs(rotated_agg.center_of_mass().x() - 2.0) < 1e-10);
    assert(std::abs(rotated_agg.center_of_mass().y() - 1.0) < 1e-10);
    assert(std::abs(rotated_agg.ixx() - 0.2) < 1e-10);
    assert(std::abs(rotated_agg.iyy() - 0.1) < 1e-10);
    assert(std::abs(rotated_agg.izz() - 0.3) < 1e-10);

    std::cout << "  PASS: mass aggregation" << std::endl;
}

void test_mass_override() {
    eng::MechanismState state;
    const double pos[3] = {0, 0, 0};
    const double orient[4] = {1, 0, 0, 0};
    std::string body_id = state.create_body("TestBody", pos, orient);

    mech::MassProperties mp;
    mp.set_mass(2.0);
    mp.set_ixx(0.1); mp.set_iyy(0.1); mp.set_izz(0.1);
    state.add_geometry("g1", "Part1", body_id, pos, orient, mp);

    // No override — body mass = geometry mass
    auto body = state.build_body_proto(body_id);
    assert(body->mass_properties().mass() == 2.0);
    assert(!body->mass_override());

    // Set override
    mech::MassProperties user_mass;
    user_mass.set_mass(5.0);
    user_mass.set_ixx(1.0); user_mass.set_iyy(1.0); user_mass.set_izz(1.0);
    assert(state.set_mass_override(body_id, true, &user_mass));
    body = state.build_body_proto(body_id);
    assert(body->mass_properties().mass() == 5.0);
    assert(body->mass_override());

    // Revert to computed
    assert(state.set_mass_override(body_id, false));
    body = state.build_body_proto(body_id);
    assert(body->mass_properties().mass() == 2.0);
    assert(!body->mass_override());

    std::cout << "  PASS: mass override" << std::endl;
}

void test_body_lifecycle() {
    eng::MechanismState state;
    const double pos[3] = {0, 0, 0};
    const double orient[4] = {1, 0, 0, 0};

    // Create body with no mass
    std::string id1 = state.create_body("Empty", pos, orient);
    assert(state.has_body(id1));
    auto body = state.build_body_proto(id1);
    assert(body->mass_properties().mass() == 0.0);

    // Create body with mass (override)
    mech::MassProperties mp;
    mp.set_mass(3.0);
    std::string id2 = state.create_body("Heavy", pos, orient, &mp, true);
    assert(state.has_body(id2));
    body = state.build_body_proto(id2);
    assert(body->mass_properties().mass() == 3.0);
    assert(body->mass_override());
    assert(body->is_fixed());

    // Rename
    assert(state.rename_body(id1, "Renamed"));
    body = state.build_body_proto(id1);
    assert(body->name() == "Renamed");

    // Delete cascade
    add_body(state, "body-c", "BodyC");
    auto d1 = add_datum(state, "body-c", "D1", 0.0);
    auto d2 = add_datum(state, id1, "D2", 1.0);
    assert(d1.has_value() && d2.has_value());
    auto joint = state.create_joint(make_revolute_joint_draft(d1->id().id(), d2->id().id(), "J1"));
    assert(joint.entry.has_value());

    // Add geometry to body-c
    mech::MassProperties gmp;
    gmp.set_mass(1.0);
    state.add_geometry("geom-c", "GeomC", "body-c", pos, orient, gmp);

    // Delete body-c should cascade: geometry, datum, joint
    assert(state.delete_body("body-c"));
    assert(!state.has_body("body-c"));
    assert(state.get_geometry("geom-c") == nullptr);
    assert(state.get_datum(d1->id().id()) == nullptr);
    assert(state.get_joint(joint.entry->id().id()) == nullptr);

    std::cout << "  PASS: body lifecycle" << std::endl;
}

void test_attach_detach_geometry() {
    eng::MechanismState state;
    const double pos[3] = {0, 0, 0};
    const double orient[4] = {1, 0, 0, 0};

    std::string body_a = state.create_body("BodyA", pos, orient);
    std::string body_b = state.create_body("BodyB", pos, orient);

    mech::MassProperties mp;
    mp.set_mass(2.0);
    mp.set_ixx(0.1); mp.set_iyy(0.1); mp.set_izz(0.1);
    state.add_geometry("g1", "Geom1", body_a, pos, orient, mp);

    // Body A has mass 2.0, Body B has mass 0
    assert(state.build_body_proto(body_a)->mass_properties().mass() == 2.0);
    assert(state.build_body_proto(body_b)->mass_properties().mass() == 0.0);

    // Attach geometry to body B
    auto result = state.attach_geometry("g1", body_b, pos, orient);
    assert(result.entry.has_value());
    assert(result.entry->parent_body_id().id() == body_b);

    // Body A preserves its prior mass when left empty; Body B now reflects the geometry
    assert(state.build_body_proto(body_a)->mass_properties().mass() == 2.0);
    assert(state.build_body_proto(body_b)->mass_properties().mass() == 2.0);

    // Detach geometry
    auto detach_result = state.detach_geometry("g1");
    assert(detach_result.entry.has_value());
    assert(state.build_body_proto(body_b)->mass_properties().mass() == 2.0);

    std::cout << "  PASS: attach/detach geometry" << std::endl;
}

void test_face_linked_datum_tracks_geometry_pose_and_reparent() {
    eng::MechanismState state;
    const double origin[3] = {0, 0, 0};
    const double orient[4] = {1, 0, 0, 0};

    std::string body_a = state.create_body("BodyA", origin, orient);
    const double body_b_pos[3] = {5.0, 0.0, 0.0};
    std::string body_b = state.create_body("BodyB", body_b_pos, orient);
    add_geometry(state, "g1", "Geom1", body_a, 0.0);

    auto linked = add_face_linked_datum(state, body_a, "g1", "AxisDatum", 0.25, 0.25);
    assert(linked.has_value());

    const double moved_geom_pos[3] = {1.0, 0.0, 0.0};
    auto moved = state.update_geometry_local_pose("g1", moved_geom_pos, orient);
    assert(moved.entry.has_value());
    assert(moved.updated_datums.size() == 1);
    assert(std::abs(moved.updated_datums[0].local_pose().position().x() - 1.25) < 1e-10);

    auto reparented = state.reparent_geometry("g1", body_b);
    assert(reparented.entry.has_value());
    assert(reparented.updated_datums.size() == 1);

    const auto* datum_after = state.get_datum(linked->id().id());
    assert(datum_after != nullptr);
    assert(datum_after->parent_body_id().id() == body_b);
    assert(datum_after->source_geometry_id().id() == "g1");
    assert(std::abs(datum_after->local_pose().position().x() - (-3.75)) < 1e-10);

    std::cout << "  PASS: face-linked datum tracks geometry pose and reparent" << std::endl;
}

void test_detach_geometry_rejects_face_linked_datums() {
    eng::MechanismState state;
    const double origin[3] = {0, 0, 0};
    const double orient[4] = {1, 0, 0, 0};

    std::string body = state.create_body("BodyA", origin, orient);
    add_geometry(state, "g1", "Geom1", body, 0.0);
    auto linked = add_face_linked_datum(state, body, "g1", "AxisDatum", 0.25, 0.25);
    assert(linked.has_value());

    auto result = state.detach_geometry("g1");
    assert(!result.entry.has_value());
    assert(result.error.find("Cannot detach geometry with face-linked datums") != std::string::npos);

    std::cout << "  PASS: detach rejects face-linked datums" << std::endl;
}

void test_split_body_updates_only_linked_datums() {
    eng::MechanismState state;
    const double origin[3] = {0, 0, 0};
    const double orient[4] = {1, 0, 0, 0};

    std::string body = state.create_body("Source", origin, orient);
    add_geometry(state, "g1", "Geom1", body, 0.0);
    add_geometry(state, "g2", "Geom2", body, 2.0);

    auto linked_g1 = add_face_linked_datum(state, body, "g1", "DatumG1", 0.25, 0.25);
    auto linked_g2 = add_face_linked_datum(state, body, "g2", "DatumG2", 2.25, 0.25, 1);
    auto manual = add_datum(state, body, "Manual", 9.0);
    assert(linked_g1.has_value());
    assert(linked_g2.has_value());
    assert(manual.has_value());

    auto split = state.split_body(body, {"g1"}, "Split", false);
    assert(split.error.empty());
    assert(split.updated_datums.size() == 1);
    assert(split.updated_datums[0].id().id() == linked_g1->id().id());

    const auto* d1_after = state.get_datum(linked_g1->id().id());
    const auto* d2_after = state.get_datum(linked_g2->id().id());
    const auto* manual_after = state.get_datum(manual->id().id());
    assert(d1_after != nullptr && d2_after != nullptr && manual_after != nullptr);
    assert(d1_after->parent_body_id().id() == split.created_body_id);
    assert(d2_after->parent_body_id().id() == body);
    assert(manual_after->parent_body_id().id() == body);

    std::cout << "  PASS: split body updates only linked datums" << std::endl;
}

void test_update_geometry_primitive_clears_datum_provenance() {
    eng::MechanismState state;
    const double origin[3] = {0, 0, 0};
    const double orient[4] = {1, 0, 0, 0};

    std::string body = state.create_body("BodyA", origin, orient);
    add_geometry(state, "g1", "Geom1", body, 0.0);
    auto linked = add_face_linked_datum(state, body, "g1", "AxisDatum", 0.25, 0.25);
    assert(linked.has_value());

    mech::MassProperties mp;
    mp.set_mass(2.0);
    mp.set_ixx(0.02);
    mp.set_iyy(0.02);
    mp.set_izz(0.02);
    mech::PrimitiveSource primitive;
    primitive.set_shape(mech::PrimitiveShape::PRIMITIVE_SHAPE_BOX);
    primitive.mutable_params()->mutable_box()->set_width(1.0);
    primitive.mutable_params()->mutable_box()->set_height(1.0);
    primitive.mutable_params()->mutable_box()->set_depth(1.0);

    auto result = state.update_geometry_primitive("g1", mp, 6, primitive);
    assert(result.entry.has_value());
    assert(result.updated_datums.size() == 1);

    const auto* datum_after = state.get_datum(linked->id().id());
    assert(datum_after != nullptr);
    assert(!datum_after->has_source_geometry_id());
    assert(!datum_after->has_source_face_index());
    assert(!datum_after->has_face_geometry());
    assert(datum_after->surface_class() == mech::DATUM_SURFACE_CLASS_UNSPECIFIED);

    std::cout << "  PASS: update geometry primitive clears datum provenance" << std::endl;
}

void test_datum_provenance_proto_roundtrip() {
    eng::MechanismState state;
    const double origin[3] = {0, 0, 0};
    const double orient[4] = {1, 0, 0, 0};

    std::string body = state.create_body("BodyA", origin, orient);
    add_geometry(state, "g1", "Geom1", body, 0.0);
    auto linked = add_face_linked_datum(state, body, "g1", "AxisDatum", 0.25, 0.25, 3);
    assert(linked.has_value());

    auto mechanism = state.build_mechanism_proto();
    eng::MechanismState reloaded;
    reloaded.load_from_proto(mechanism);

    const auto* datum = reloaded.get_datum(linked->id().id());
    assert(datum != nullptr);
    assert(datum->has_source_geometry_id());
    assert(datum->source_geometry_id().id() == "g1");
    assert(datum->has_source_face_index());
    assert(datum->source_face_index() == 3);
    assert(datum->surface_class() == mech::DATUM_SURFACE_CLASS_CYLINDRICAL);
    assert(datum->has_face_geometry());
    assert(datum->face_geometry().axis_direction().z() == 1.0);

    std::cout << "  PASS: datum provenance proto roundtrip" << std::endl;
}

void test_geometry_proto_roundtrip() {
    eng::MechanismState state;
    const double pos[3] = {0, 0, 0};
    const double orient[4] = {1, 0, 0, 0};

    add_body(state, "body-a", "Ground");
    mech::MassProperties mp;
    mp.set_mass(2.5);
    mp.set_ixx(0.01);
    state.add_geometry("geom-1", "Wheel", "body-a", pos, orient, mp);

    auto mechanism = state.build_mechanism_proto();
    assert(mechanism.geometries_size() == 1);
    assert(mechanism.geometries(0).name() == "Wheel");
    assert(mechanism.geometries(0).computed_mass_properties().mass() == 2.5);

    eng::MechanismState reloaded;
    reloaded.load_from_proto(mechanism);
    assert(reloaded.geometry_count() == 1);
    assert(reloaded.get_geometry("geom-1") != nullptr);
    assert(reloaded.get_geometry("geom-1")->name() == "Wheel");

    std::cout << "  PASS: geometry proto roundtrip" << std::endl;
}

void test_co_translate_datums_translation() {
    eng::MechanismState state;

    // Create a body at (1, 0, 0) with identity rotation
    const double pos[3] = {1.0, 0.0, 0.0};
    const double orient[4] = {1.0, 0.0, 0.0, 0.0};
    std::string body_id = state.create_body("Body1", pos, orient);

    // Add two datums with local offsets
    const double d1_pos[3] = {0.5, 0.0, 0.0};
    const double d2_pos[3] = {0.0, 1.0, 0.0};
    const double id_orient[4] = {1.0, 0.0, 0.0, 0.0};
    auto d1 = state.create_datum(body_id, "D1", d1_pos, id_orient);
    auto d2 = state.create_datum(body_id, "D2", d2_pos, id_orient);
    assert(d1.has_value() && d2.has_value());

    // d1 world = body_pos + local = (1.5, 0, 0)
    // d2 world = body_pos + local = (1.0, 1, 0)

    // Build old and new poses
    mech::Pose old_pose;
    old_pose.mutable_position()->set_x(1.0);
    old_pose.mutable_position()->set_y(0.0);
    old_pose.mutable_position()->set_z(0.0);
    old_pose.mutable_orientation()->set_w(1.0);

    mech::Pose new_pose;
    new_pose.mutable_position()->set_x(2.0);
    new_pose.mutable_position()->set_y(0.0);
    new_pose.mutable_position()->set_z(0.0);
    new_pose.mutable_orientation()->set_w(1.0);

    // Translate body to (2, 0, 0)
    auto updated = state.co_translate_datums(body_id, old_pose, new_pose);
    assert(updated.size() == 2);

    // After co-translation, datums' new local positions should compensate:
    // d1 world was (1.5, 0, 0) => new local = world - new_body_pos = (-0.5, 0, 0)
    // d2 world was (1.0, 1, 0) => new local = world - new_body_pos = (-1.0, 1, 0)
    const auto* d1_after = state.get_datum(d1->id().id());
    const auto* d2_after = state.get_datum(d2->id().id());
    assert(d1_after != nullptr && d2_after != nullptr);

    assert(std::abs(d1_after->local_pose().position().x() - (-0.5)) < 1e-10);
    assert(std::abs(d1_after->local_pose().position().y()) < 1e-10);
    assert(std::abs(d1_after->local_pose().position().z()) < 1e-10);

    assert(std::abs(d2_after->local_pose().position().x() - (-1.0)) < 1e-10);
    assert(std::abs(d2_after->local_pose().position().y() - 1.0) < 1e-10);
    assert(std::abs(d2_after->local_pose().position().z()) < 1e-10);

    std::cout << "  PASS: co-translate datums (translation)" << std::endl;
}

void test_co_translate_datums_rotation() {
    eng::MechanismState state;

    // Create a body at origin with identity rotation
    const double pos[3] = {0.0, 0.0, 0.0};
    const double orient[4] = {1.0, 0.0, 0.0, 0.0};
    std::string body_id = state.create_body("Body1", pos, orient);

    // Add a datum at local (1, 0, 0)
    const double d_pos[3] = {1.0, 0.0, 0.0};
    auto d1 = state.create_datum(body_id, "D1", d_pos, orient);
    assert(d1.has_value());

    // World position of datum = (1, 0, 0)

    // Old pose: identity at origin
    mech::Pose old_pose;
    old_pose.mutable_position()->set_x(0.0);
    old_pose.mutable_position()->set_y(0.0);
    old_pose.mutable_position()->set_z(0.0);
    old_pose.mutable_orientation()->set_w(1.0);

    // New pose: 90 degrees around Y axis at origin
    // q = cos(45°) + sin(45°) * j = (√2/2, 0, √2/2, 0) in (w, x, y, z)
    const double s = std::sqrt(2.0) / 2.0;
    mech::Pose new_pose;
    new_pose.mutable_position()->set_x(0.0);
    new_pose.mutable_position()->set_y(0.0);
    new_pose.mutable_position()->set_z(0.0);
    new_pose.mutable_orientation()->set_w(s);
    new_pose.mutable_orientation()->set_x(0.0);
    new_pose.mutable_orientation()->set_y(s);
    new_pose.mutable_orientation()->set_z(0.0);

    auto updated = state.co_translate_datums(body_id, old_pose, new_pose);
    assert(updated.size() == 1);

    // Datum world position was (1, 0, 0).
    // new_local_pos = inv(new_rot).Rotate(world_pos - new_pos)
    //               = inv(new_rot).Rotate((1,0,0))
    // inv of 90° around Y is -90° around Y, which maps (1,0,0) -> (0,0,1)
    // (rotation of -90° around Y: x -> z*sin + x*cos = 0, z -> z*cos - x*sin(-90) = 1)
    const auto* d1_after = state.get_datum(d1->id().id());
    assert(d1_after != nullptr);
    assert(std::abs(d1_after->local_pose().position().x()) < 1e-10);
    assert(std::abs(d1_after->local_pose().position().y()) < 1e-10);
    assert(std::abs(d1_after->local_pose().position().z() - 1.0) < 1e-10);

    std::cout << "  PASS: co-translate datums (rotation)" << std::endl;
}

void test_co_translate_datums_empty() {
    eng::MechanismState state;

    const double pos[3] = {0.0, 0.0, 0.0};
    const double orient[4] = {1.0, 0.0, 0.0, 0.0};
    std::string body_id = state.create_body("Body1", pos, orient);

    // No datums on this body
    mech::Pose old_pose;
    old_pose.mutable_orientation()->set_w(1.0);
    mech::Pose new_pose;
    new_pose.mutable_position()->set_x(5.0);
    new_pose.mutable_orientation()->set_w(1.0);

    auto updated = state.co_translate_datums(body_id, old_pose, new_pose);
    assert(updated.empty());

    std::cout << "  PASS: co-translate datums (empty)" << std::endl;
}

void test_make_compound_body_basic() {
    eng::MechanismState state;

    // Create two bodies at different positions
    const double pos_a[3] = {1.0, 0.0, 0.0};
    const double pos_b[3] = {3.0, 0.0, 0.0};
    const double id_orient[4] = {1.0, 0.0, 0.0, 0.0};
    std::string body_a = state.create_body("BodyA", pos_a, id_orient);
    std::string body_b = state.create_body("BodyB", pos_b, id_orient);

    // Add one geometry to each body at identity local_pose
    const double origin[3] = {0, 0, 0};
    mech::MassProperties mp;
    mp.set_mass(1.0);
    mp.set_ixx(0.01); mp.set_iyy(0.01); mp.set_izz(0.01);
    state.add_geometry("g1", "Geom1", body_a, origin, id_orient, mp);
    state.add_geometry("g2", "Geom2", body_b, origin, id_orient, mp);

    // Make compound body
    auto result = state.make_compound_body({"g1", "g2"}, "Merged", false, true);
    assert(result.error.empty());

    // New body should be at centroid (2, 0, 0)
    auto new_body = state.build_body_proto(result.created_body_id);
    assert(new_body.has_value());
    assert(std::abs(new_body->pose().position().x() - 2.0) < 1e-10);
    assert(std::abs(new_body->pose().position().y()) < 1e-10);
    assert(std::abs(new_body->pose().position().z()) < 1e-10);

    // g1 should have local_pose offset (-1, 0, 0) from centroid
    const auto* g1 = state.get_geometry("g1");
    assert(g1 != nullptr);
    assert(g1->parent_body_id().id() == result.created_body_id);
    assert(std::abs(g1->local_pose().position().x() - (-1.0)) < 1e-10);
    assert(std::abs(g1->local_pose().position().y()) < 1e-10);

    // g2 should have local_pose offset (+1, 0, 0) from centroid
    const auto* g2 = state.get_geometry("g2");
    assert(g2 != nullptr);
    assert(g2->parent_body_id().id() == result.created_body_id);
    assert(std::abs(g2->local_pose().position().x() - 1.0) < 1e-10);
    assert(std::abs(g2->local_pose().position().y()) < 1e-10);

    // Old bodies should be dissolved
    assert(result.dissolved_body_ids.size() == 2);
    assert(!state.has_body(body_a));
    assert(!state.has_body(body_b));

    std::cout << "  PASS: make compound body (basic)" << std::endl;
}

void test_make_compound_body_datum_position() {
    eng::MechanismState state;

    // Two bodies at different positions
    const double pos_a[3] = {1.0, 0.0, 0.0};
    const double pos_b[3] = {3.0, 0.0, 0.0};
    const double id_orient[4] = {1.0, 0.0, 0.0, 0.0};
    std::string body_a = state.create_body("BodyA", pos_a, id_orient);
    std::string body_b = state.create_body("BodyB", pos_b, id_orient);

    const double origin[3] = {0, 0, 0};
    mech::MassProperties mp;
    mp.set_mass(1.0);
    mp.set_ixx(0.01); mp.set_iyy(0.01); mp.set_izz(0.01);
    state.add_geometry("g1", "Geom1", body_a, origin, id_orient, mp);
    state.add_geometry("g2", "Geom2", body_b, origin, id_orient, mp);

    // Merge
    auto result = state.make_compound_body({"g1", "g2"}, "Merged", false, true);
    assert(result.error.empty());
    const std::string& new_body_id = result.created_body_id;

    // Simulate what handle_create_datum_from_face does:
    // classify_face_for_datum returns face_pos in geometry-local space.
    // For g1, suppose the face center is at (0.05, 0.02, 0) in geometry-local (meters).
    const double face_pos[3] = {0.05, 0.02, 0.0};
    const double face_orient[4] = {1.0, 0.0, 0.0, 0.0};

    // The FIX: compose geometry.local_pose * face_pose to get body-local
    const auto* g1 = state.get_geometry("g1");
    double geom_pos[3], geom_orient[4];
    eng::extract_pose_arrays(g1->local_pose(), geom_pos, geom_orient);

    double body_local_pos[3], body_local_orient[4];
    eng::compose_pose(geom_pos, geom_orient, face_pos, face_orient,
                      body_local_pos, body_local_orient);

    // g1 local_pose = (-1, 0, 0), so body_local = (-1 + 0.05, 0 + 0.02, 0) = (-0.95, 0.02, 0)
    assert(std::abs(body_local_pos[0] - (-0.95)) < 1e-10);
    assert(std::abs(body_local_pos[1] - 0.02) < 1e-10);
    assert(std::abs(body_local_pos[2]) < 1e-10);

    // Create datum with the composed position
    auto datum = state.create_datum(new_body_id, "TestDatum", body_local_pos, body_local_orient);
    assert(datum.has_value());

    // Verify the datum's body-local position
    assert(std::abs(datum->local_pose().position().x() - (-0.95)) < 1e-10);
    assert(std::abs(datum->local_pose().position().y() - 0.02) < 1e-10);

    // Verify world position: body(2,0,0) + datum_local(-0.95, 0.02, 0) = (1.05, 0.02, 0)
    // This matches body_a(1,0,0) + face_pos(0.05, 0.02, 0) = (1.05, 0.02, 0) — correct!
    double datum_world[3], datum_world_orient[4];
    double body_pos[3], body_orient[4];
    eng::extract_pose_arrays(state.build_body_proto(new_body_id)->pose(), body_pos, body_orient);
    eng::compose_pose(body_pos, body_orient, body_local_pos, body_local_orient,
                      datum_world, datum_world_orient);
    assert(std::abs(datum_world[0] - 1.05) < 1e-10);
    assert(std::abs(datum_world[1] - 0.02) < 1e-10);
    assert(std::abs(datum_world[2]) < 1e-10);

    // Now verify the BUG: WITHOUT the geometry-to-body transform,
    // the datum would be at face_pos directly = (0.05, 0.02, 0) in body-local,
    // which in world = (2.05, 0.02, 0) — wrong! It should be (1.05, 0.02, 0).
    double buggy_world[3], buggy_orient[4];
    eng::compose_pose(body_pos, body_orient, face_pos, face_orient,
                      buggy_world, buggy_orient);
    // The buggy position would be at x=2.05 instead of 1.05 — a full 1.0m off
    assert(std::abs(buggy_world[0] - 2.05) < 1e-10);
    // This confirms the fix is necessary

    std::cout << "  PASS: make compound body datum position (geometry-to-body transform)" << std::endl;
}

void test_make_compound_body_rotated_bodies() {
    eng::MechanismState state;

    // Body A at origin with 90-degree rotation around Z
    const double pos_a[3] = {0.0, 0.0, 0.0};
    const double s = std::sqrt(2.0) / 2.0;
    const double rot90z[4] = {s, 0.0, 0.0, s};  // 90° around Z, [w,x,y,z]
    std::string body_a = state.create_body("BodyA", pos_a, rot90z);

    // Body B at (2, 0, 0) with identity rotation
    const double pos_b[3] = {2.0, 0.0, 0.0};
    const double id_orient[4] = {1.0, 0.0, 0.0, 0.0};
    std::string body_b = state.create_body("BodyB", pos_b, id_orient);

    const double origin[3] = {0, 0, 0};
    mech::MassProperties mp;
    mp.set_mass(1.0);
    mp.set_ixx(0.01); mp.set_iyy(0.01); mp.set_izz(0.01);
    state.add_geometry("g1", "Geom1", body_a, origin, id_orient, mp);
    state.add_geometry("g2", "Geom2", body_b, origin, id_orient, mp);

    auto result = state.make_compound_body({"g1", "g2"}, "Merged", false, true);
    assert(result.error.empty());
    const std::string& new_body_id = result.created_body_id;

    // g1 world_pose was (0, 0, 0) with rot90z
    // g2 world_pose was (2, 0, 0) with identity
    // centroid = (1, 0, 0), new body orient = identity
    // g1 local_pose = (-1, 0, 0) with rot90z
    const auto* g1 = state.get_geometry("g1");
    assert(std::abs(g1->local_pose().position().x() - (-1.0)) < 1e-10);
    assert(std::abs(g1->local_pose().orientation().w() - s) < 1e-10);
    assert(std::abs(g1->local_pose().orientation().z() - s) < 1e-10);

    // Face at (1, 0, 0) in g1's geometry-local space
    // After compose with g1.local_pose: body_local = (-1,0,0) + rot90z*(1,0,0) = (-1, 1, 0)
    const double face_pos[3] = {1.0, 0.0, 0.0};
    const double face_orient[4] = {1.0, 0.0, 0.0, 0.0};

    double geom_pos[3], geom_orient[4];
    eng::extract_pose_arrays(g1->local_pose(), geom_pos, geom_orient);
    double body_local_pos[3], body_local_orient[4];
    eng::compose_pose(geom_pos, geom_orient, face_pos, face_orient,
                      body_local_pos, body_local_orient);

    assert(std::abs(body_local_pos[0] - (-1.0)) < 1e-10);
    assert(std::abs(body_local_pos[1] - 1.0) < 1e-10);
    assert(std::abs(body_local_pos[2]) < 1e-10);

    // World position: (1,0,0) + identity*(-1,1,0) = (0, 1, 0)
    // Which matches: original body_a(0,0,0) + rot90z*(1,0,0) = (0,1,0) — correct!
    double body_pos[3], body_orient[4];
    eng::extract_pose_arrays(state.build_body_proto(new_body_id)->pose(), body_pos, body_orient);
    double world_pos[3], world_orient[4];
    eng::compose_pose(body_pos, body_orient, body_local_pos, body_local_orient,
                      world_pos, world_orient);
    assert(std::abs(world_pos[0]) < 1e-10);
    assert(std::abs(world_pos[1] - 1.0) < 1e-10);
    assert(std::abs(world_pos[2]) < 1e-10);

    std::cout << "  PASS: make compound body datum position (rotated bodies)" << std::endl;
}

void test_make_compound_body_uses_world_center_of_mass() {
    eng::MechanismState state;

    const double pos_a[3] = {1.0, 0.0, 0.0};
    const double pos_b[3] = {5.0, 0.0, 0.0};
    const double id_orient[4] = {1.0, 0.0, 0.0, 0.0};
    std::string body_a = state.create_body("BodyA", pos_a, id_orient);
    std::string body_b = state.create_body("BodyB", pos_b, id_orient);

    const double origin[3] = {0, 0, 0};
    mech::MassProperties mp_a;
    mp_a.set_mass(1.0);
    mp_a.set_ixx(0.01); mp_a.set_iyy(0.01); mp_a.set_izz(0.01);
    state.add_geometry("g1", "Geom1", body_a, origin, id_orient, mp_a);

    mech::MassProperties mp_b;
    mp_b.set_mass(3.0);
    mp_b.set_ixx(0.02); mp_b.set_iyy(0.02); mp_b.set_izz(0.02);
    state.add_geometry("g2", "Geom2", body_b, origin, id_orient, mp_b);

    auto result = state.make_compound_body({"g1", "g2"}, "Merged", false, true);
    assert(result.error.empty());

    auto new_body = state.build_body_proto(result.created_body_id);
    assert(new_body.has_value());
    assert(std::abs(new_body->pose().position().x() - 4.0) < 1e-10);
    assert(std::abs(new_body->pose().position().y()) < 1e-10);
    assert(std::abs(new_body->pose().position().z()) < 1e-10);

    const auto* g1 = state.get_geometry("g1");
    const auto* g2 = state.get_geometry("g2");
    assert(g1 != nullptr);
    assert(g2 != nullptr);
    assert(std::abs(g1->local_pose().position().x() - (-3.0)) < 1e-10);
    assert(std::abs(g2->local_pose().position().x() - 1.0) < 1e-10);

    assert(std::abs(new_body->mass_properties().center_of_mass().x()) < 1e-10);
    assert(std::abs(new_body->mass_properties().center_of_mass().y()) < 1e-10);
    assert(std::abs(new_body->mass_properties().center_of_mass().z()) < 1e-10);

    std::cout << "  PASS: make compound body uses world center of mass" << std::endl;
}

void test_make_compound_body_reparents_datums() {
    eng::MechanismState state;

    // Two bodies at different positions
    const double pos_a[3] = {1.0, 0.0, 0.0};
    const double pos_b[3] = {3.0, 0.0, 0.0};
    const double id_orient[4] = {1.0, 0.0, 0.0, 0.0};
    std::string body_a = state.create_body("BodyA", pos_a, id_orient);
    std::string body_b = state.create_body("BodyB", pos_b, id_orient);

    // Add one geometry to each body
    const double origin[3] = {0, 0, 0};
    mech::MassProperties mp;
    mp.set_mass(1.0);
    mp.set_ixx(0.01); mp.set_iyy(0.01); mp.set_izz(0.01);
    state.add_geometry("g1", "Geom1", body_a, origin, id_orient, mp);
    state.add_geometry("g2", "Geom2", body_b, origin, id_orient, mp);

    // Add datums to each body
    // D1 on body_a at local (0.5, 0, 0) → world (1.5, 0, 0)
    const double d1_pos[3] = {0.5, 0.0, 0.0};
    auto d1 = state.create_datum(body_a, "D1", d1_pos, id_orient);
    assert(d1.has_value());
    std::string d1_id = d1->id().id();

    // D2 on body_b at local (0, 1, 0) → world (3, 1, 0)
    const double d2_pos[3] = {0.0, 1.0, 0.0};
    auto d2 = state.create_datum(body_b, "D2", d2_pos, id_orient);
    assert(d2.has_value());
    std::string d2_id = d2->id().id();

    // Make compound body with reference body = body_a
    auto result = state.make_compound_body({"g1", "g2"}, "Merged", false, true, body_a);
    assert(result.error.empty());

    // New body should be at body_a's pose (1, 0, 0)
    auto new_body = state.build_body_proto(result.created_body_id);
    assert(new_body.has_value());
    assert(std::abs(new_body->pose().position().x() - 1.0) < 1e-10);

    // D1 should be re-parented to new body with local (0.5, 0, 0) (same as before since origin=body_a)
    const auto* d1_after = state.get_datum(d1_id);
    assert(d1_after != nullptr);
    assert(d1_after->parent_body_id().id() == result.created_body_id);
    assert(std::abs(d1_after->local_pose().position().x() - 0.5) < 1e-10);
    assert(std::abs(d1_after->local_pose().position().y()) < 1e-10);

    // D2 should be re-parented to new body with local (2, 1, 0)
    // (world was (3, 1, 0), new body origin at (1, 0, 0) → local = (2, 1, 0))
    const auto* d2_after = state.get_datum(d2_id);
    assert(d2_after != nullptr);
    assert(d2_after->parent_body_id().id() == result.created_body_id);
    assert(std::abs(d2_after->local_pose().position().x() - 2.0) < 1e-10);
    assert(std::abs(d2_after->local_pose().position().y() - 1.0) < 1e-10);

    // Both old bodies should be dissolved (datums were re-parented, no blockers)
    assert(result.dissolved_body_ids.size() == 2);
    assert(!state.has_body(body_a));
    assert(!state.has_body(body_b));

    // reparented_datums should contain both datums
    assert(result.reparented_datums.size() == 2);

    std::cout << "  PASS: make compound body reparents datums" << std::endl;
}

void test_make_compound_body_datums_with_joints() {
    eng::MechanismState state;

    // Three bodies: A, B (to merge), C (external)
    const double pos_a[3] = {1.0, 0.0, 0.0};
    const double pos_b[3] = {3.0, 0.0, 0.0};
    const double pos_c[3] = {5.0, 0.0, 0.0};
    const double id_orient[4] = {1.0, 0.0, 0.0, 0.0};
    std::string body_a = state.create_body("BodyA", pos_a, id_orient);
    std::string body_b = state.create_body("BodyB", pos_b, id_orient);
    std::string body_c = state.create_body("BodyC", pos_c, id_orient);

    const double origin[3] = {0, 0, 0};
    mech::MassProperties mp;
    mp.set_mass(1.0);
    mp.set_ixx(0.01); mp.set_iyy(0.01); mp.set_izz(0.01);
    state.add_geometry("g_a", "GeomA", body_a, origin, id_orient, mp);
    state.add_geometry("g_b", "GeomB", body_b, origin, id_orient, mp);
    state.add_geometry("g_c", "GeomC", body_c, origin, id_orient, mp);

    // Datum on A and datum on C, joint between them
    auto d_a = state.create_datum(body_a, "DA", origin, id_orient);
    assert(d_a.has_value());
    auto d_c = state.create_datum(body_c, "DC", origin, id_orient);
    assert(d_c.has_value());

    auto joint_draft = make_revolute_joint_draft(d_a->id().id(), d_c->id().id(), "J1");
    auto joint_result = state.create_joint(joint_draft);
    assert(joint_result.error.empty());

    // Merge A + B (keep C separate)
    auto result = state.make_compound_body({"g_a", "g_b"}, "Merged", false, true, body_a);
    assert(result.error.empty());

    // D_A should be on the new compound body
    const auto* d_a_after = state.get_datum(d_a->id().id());
    assert(d_a_after != nullptr);
    assert(d_a_after->parent_body_id().id() == result.created_body_id);

    // D_C should still be on body_c
    const auto* d_c_after = state.get_datum(d_c->id().id());
    assert(d_c_after != nullptr);
    assert(d_c_after->parent_body_id().id() == body_c);

    // Joint should still be valid (datums on different bodies)
    assert(d_a_after->parent_body_id().id() != d_c_after->parent_body_id().id());

    std::cout << "  PASS: make compound body datums with joints" << std::endl;
}

void test_make_compound_body_rejects_self_joint() {
    eng::MechanismState state;

    // Two bodies to merge, with a joint between them
    const double pos_a[3] = {1.0, 0.0, 0.0};
    const double pos_b[3] = {3.0, 0.0, 0.0};
    const double id_orient[4] = {1.0, 0.0, 0.0, 0.0};
    std::string body_a = state.create_body("BodyA", pos_a, id_orient);
    std::string body_b = state.create_body("BodyB", pos_b, id_orient);

    const double origin[3] = {0, 0, 0};
    mech::MassProperties mp;
    mp.set_mass(1.0);
    mp.set_ixx(0.01); mp.set_iyy(0.01); mp.set_izz(0.01);
    state.add_geometry("g1", "Geom1", body_a, origin, id_orient, mp);
    state.add_geometry("g2", "Geom2", body_b, origin, id_orient, mp);

    auto d_a = state.create_datum(body_a, "DA", origin, id_orient);
    auto d_b = state.create_datum(body_b, "DB", origin, id_orient);
    assert(d_a.has_value() && d_b.has_value());

    auto joint_draft = make_revolute_joint_draft(d_a->id().id(), d_b->id().id(), "J1");
    auto joint_result = state.create_joint(joint_draft);
    assert(joint_result.error.empty());

    // Attempt to merge A + B — should fail because joint would connect body to itself
    auto result = state.make_compound_body({"g1", "g2"}, "Merged", false, true);
    assert(!result.error.empty());
    assert(result.error.find("would connect") != std::string::npos);

    // State should be unchanged
    assert(state.has_body(body_a));
    assert(state.has_body(body_b));
    const auto* g1 = state.get_geometry("g1");
    assert(g1 != nullptr);
    assert(g1->parent_body_id().id() == body_a);

    std::cout << "  PASS: make compound body rejects self-joint" << std::endl;
}

void test_make_compound_body_reference_body_origin() {
    eng::MechanismState state;

    const double pos_a[3] = {1.0, 0.0, 0.0};
    const double pos_b[3] = {5.0, 0.0, 0.0};
    const double id_orient[4] = {1.0, 0.0, 0.0, 0.0};
    std::string body_a = state.create_body("BodyA", pos_a, id_orient);
    std::string body_b = state.create_body("BodyB", pos_b, id_orient);

    const double origin[3] = {0, 0, 0};
    mech::MassProperties mp;
    mp.set_mass(1.0);
    mp.set_ixx(0.01); mp.set_iyy(0.01); mp.set_izz(0.01);
    state.add_geometry("g1", "Geom1", body_a, origin, id_orient, mp);
    state.add_geometry("g2", "Geom2", body_b, origin, id_orient, mp);

    // Merge with reference body = body_a
    auto result = state.make_compound_body({"g1", "g2"}, "Merged", false, true, body_a);
    assert(result.error.empty());

    // New body should be at body_a's pose (1, 0, 0), NOT centroid (3, 0, 0)
    auto new_body = state.build_body_proto(result.created_body_id);
    assert(new_body.has_value());
    assert(std::abs(new_body->pose().position().x() - 1.0) < 1e-10);
    assert(std::abs(new_body->pose().position().y()) < 1e-10);

    // g1 was at world (1,0,0) with identity local, new body at (1,0,0) → local (0,0,0)
    const auto* g1 = state.get_geometry("g1");
    assert(g1 != nullptr);
    assert(std::abs(g1->local_pose().position().x()) < 1e-10);

    // g2 was at world (5,0,0), new body at (1,0,0) → local (4,0,0)
    const auto* g2 = state.get_geometry("g2");
    assert(g2 != nullptr);
    assert(std::abs(g2->local_pose().position().x() - 4.0) < 1e-10);

    std::cout << "  PASS: make compound body reference body origin" << std::endl;
}

void test_make_compound_body_preserves_full_body_override_mass() {
    eng::MechanismState state;

    const double pos_a[3] = {0.0, 0.0, 0.0};
    const double pos_b[3] = {10.0, 0.0, 0.0};
    const double id_orient[4] = {1.0, 0.0, 0.0, 0.0};

    mech::MassProperties override_mass;
    override_mass.set_mass(5.0);
    override_mass.mutable_center_of_mass()->set_x(1.0);
    override_mass.set_ixx(0.5);
    override_mass.set_iyy(0.6);
    override_mass.set_izz(0.7);

    std::string body_a = state.create_body("BodyA", pos_a, id_orient, &override_mass);
    std::string body_b = state.create_body("BodyB", pos_b, id_orient);

    const double origin[3] = {0.0, 0.0, 0.0};
    mech::MassProperties geom_a_mass;
    geom_a_mass.set_mass(1.0);
    geom_a_mass.set_ixx(0.01);
    geom_a_mass.set_iyy(0.01);
    geom_a_mass.set_izz(0.01);
    state.add_geometry("g_a", "GeomA", body_a, origin, id_orient, geom_a_mass);

    mech::MassProperties geom_b_mass;
    geom_b_mass.set_mass(2.0);
    geom_b_mass.set_ixx(0.1);
    geom_b_mass.set_iyy(0.2);
    geom_b_mass.set_izz(0.3);
    state.add_geometry("g_b", "GeomB", body_b, origin, id_orient, geom_b_mass);

    auto result = state.make_compound_body({"g_a", "g_b"}, "Merged", false, true, body_a);
    assert(result.error.empty());

    auto new_body = state.build_body_proto(result.created_body_id);
    assert(new_body.has_value());
    assert(new_body->mass_override());
    assert(std::abs(new_body->mass_properties().mass() - 7.0) < 1e-10);
    assert(std::abs(new_body->mass_properties().center_of_mass().x() - (25.0 / 7.0)) < 1e-10);
    assert(std::abs(new_body->mass_properties().center_of_mass().y()) < 1e-10);

    const double dx_a = 1.0 - (25.0 / 7.0);
    const double dx_b = 10.0 - (25.0 / 7.0);
    const double expected_iyy = 0.6 + 5.0 * dx_a * dx_a + 0.2 + 2.0 * dx_b * dx_b;
    const double expected_izz = 0.7 + 5.0 * dx_a * dx_a + 0.3 + 2.0 * dx_b * dx_b;
    assert(std::abs(new_body->mass_properties().ixx() - 0.6) < 1e-10);
    assert(std::abs(new_body->mass_properties().iyy() - expected_iyy) < 1e-10);
    assert(std::abs(new_body->mass_properties().izz() - expected_izz) < 1e-10);

    std::cout << "  PASS: make compound body preserves full body override mass" << std::endl;
}

void test_co_translate_datums_only_when_pinned() {
    eng::MechanismState state;

    const double origin[3] = {0.0, 0.0, 0.0};
    const double id_orient[4] = {1.0, 0.0, 0.0, 0.0};
    std::string body_id = state.create_body("Body", origin, id_orient);

    // Add datum at local (1, 0, 0) → world (1, 0, 0) since body is at origin
    const double datum_pos[3] = {1.0, 0.0, 0.0};
    auto datum = state.create_datum(body_id, "D1", datum_pos, id_orient);
    assert(datum.has_value());
    std::string datum_id = datum->id().id();

    // Move body to (5, 0, 0) WITHOUT co-translating datums
    const double new_pos[3] = {5.0, 0.0, 0.0};
    state.set_body_pose(body_id, new_pos, id_orient);

    // Datum local pose should be unchanged (it moves with the body)
    const auto* d_after = state.get_datum(datum_id);
    assert(d_after != nullptr);
    assert(std::abs(d_after->local_pose().position().x() - 1.0) < 1e-10);

    // Now co-translate: datum should get new local pose to preserve world (1, 0, 0)
    mech::Pose old_pose;
    old_pose.mutable_position()->set_x(0.0); old_pose.mutable_position()->set_y(0.0); old_pose.mutable_position()->set_z(0.0);
    old_pose.mutable_orientation()->set_w(1.0); old_pose.mutable_orientation()->set_x(0.0);
    old_pose.mutable_orientation()->set_y(0.0); old_pose.mutable_orientation()->set_z(0.0);

    mech::Pose new_pose;
    new_pose.mutable_position()->set_x(5.0); new_pose.mutable_position()->set_y(0.0); new_pose.mutable_position()->set_z(0.0);
    new_pose.mutable_orientation()->set_w(1.0); new_pose.mutable_orientation()->set_x(0.0);
    new_pose.mutable_orientation()->set_y(0.0); new_pose.mutable_orientation()->set_z(0.0);

    auto updated = state.co_translate_datums(body_id, old_pose, new_pose);
    assert(updated.size() == 1);

    // After co-translation: world pos was (1,0,0), new body at (5,0,0) → new local = (-4, 0, 0)
    const auto* d_pinned = state.get_datum(datum_id);
    assert(d_pinned != nullptr);
    assert(std::abs(d_pinned->local_pose().position().x() - (-4.0)) < 1e-10);

    std::cout << "  PASS: co-translate datums only when pinned" << std::endl;
}

} // namespace

int main() {
    motionlab::init_logging(spdlog::level::info);
    std::cout << "MechanismState tests" << std::endl;

    test_datum_crud();
    test_joint_load_actuator_lifecycle();
    test_validation_rules();
    test_joint_type_configs();
    test_spring_damper_load_and_prismatic_motor();
    test_proto_roundtrip_and_legacy_migration();
    test_geometry_crud();
    test_mass_aggregation();
    test_mass_override();
    test_body_lifecycle();
    test_co_translate_datums_translation();
    test_co_translate_datums_rotation();
    test_co_translate_datums_empty();
    test_make_compound_body_basic();
    test_make_compound_body_datum_position();
    test_make_compound_body_rotated_bodies();
    test_make_compound_body_uses_world_center_of_mass();
    test_face_linked_datum_tracks_geometry_pose_and_reparent();
    test_detach_geometry_rejects_face_linked_datums();
    test_split_body_updates_only_linked_datums();
    test_update_geometry_primitive_clears_datum_provenance();
    test_datum_provenance_proto_roundtrip();
    test_attach_detach_geometry();
    test_geometry_proto_roundtrip();
    test_make_compound_body_reparents_datums();
    test_make_compound_body_datums_with_joints();
    test_make_compound_body_rejects_self_joint();
    test_make_compound_body_reference_body_origin();
    test_make_compound_body_preserves_full_body_override_mass();
    test_co_translate_datums_only_when_pinned();

    std::cout << "All MechanismState tests passed." << std::endl;
    return 0;
}
