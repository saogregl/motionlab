#include "../src/mechanism_state.h"
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

    // Body A now 0, Body B now 2.0
    assert(state.build_body_proto(body_a)->mass_properties().mass() == 0.0);
    assert(state.build_body_proto(body_b)->mass_properties().mass() == 2.0);

    // Detach geometry
    auto detach_result = state.detach_geometry("g1");
    assert(detach_result.entry.has_value());
    assert(state.build_body_proto(body_b)->mass_properties().mass() == 0.0);

    std::cout << "  PASS: attach/detach geometry" << std::endl;
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
    test_attach_detach_geometry();
    test_geometry_proto_roundtrip();

    std::cout << "All MechanismState tests passed." << std::endl;
    return 0;
}
