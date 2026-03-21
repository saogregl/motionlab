#include "../src/mechanism_state.h"
#include "engine/log.h"
#include "mechanism/mechanism.pb.h"

#include <cassert>
#include <cmath>
#include <cstring>
#include <iostream>
#include <regex>
#include <string>

using namespace motionlab::engine;

static void test_create_datum_on_body() {
    MechanismState state;
    state.add_body("body-001", "Ground");

    double pos[3] = {1.0, 2.0, 3.0};
    double orient[4] = {1.0, 0.0, 0.0, 0.0}; // w,x,y,z

    auto result = state.create_datum("body-001", "MyDatum", pos, orient);
    assert(result.has_value());
    assert(result->name == "MyDatum");
    assert(result->parent_body_id == "body-001");
    assert(result->position[0] == 1.0);
    assert(result->position[1] == 2.0);
    assert(result->position[2] == 3.0);
    assert(result->orientation[0] == 1.0); // w

    // Verify UUIDv7 format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
    std::regex uuid_re("^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$");
    assert(std::regex_match(result->id, uuid_re));

    assert(state.datum_count() == 1);
    assert(state.body_count() == 1);

    std::cout << "  PASS: create datum on body" << std::endl;
}

static void test_create_datum_invalid_parent() {
    MechanismState state;
    state.add_body("body-001", "Ground");

    double pos[3] = {0, 0, 0};
    double orient[4] = {1, 0, 0, 0};

    auto result = state.create_datum("nonexistent-body", "Bad", pos, orient);
    assert(!result.has_value());
    assert(state.datum_count() == 0);

    std::cout << "  PASS: create datum on nonexistent body returns nullopt" << std::endl;
}

static void test_delete_datum() {
    MechanismState state;
    state.add_body("body-001", "Ground");

    double pos[3] = {0, 0, 0};
    double orient[4] = {1, 0, 0, 0};

    auto created = state.create_datum("body-001", "ToDelete", pos, orient);
    assert(created.has_value());
    assert(state.datum_count() == 1);

    bool ok = state.delete_datum(created->id);
    assert(ok);
    assert(state.datum_count() == 0);
    assert(state.get_datum(created->id) == nullptr);

    // Delete again — should fail
    bool ok2 = state.delete_datum(created->id);
    assert(!ok2);

    std::cout << "  PASS: delete datum" << std::endl;
}

static void test_rename_datum() {
    MechanismState state;
    state.add_body("body-001", "Ground");

    double pos[3] = {0, 0, 0};
    double orient[4] = {1, 0, 0, 0};

    auto created = state.create_datum("body-001", "Original", pos, orient);
    assert(created.has_value());

    auto renamed = state.rename_datum(created->id, "NewName");
    assert(renamed.has_value());
    assert(renamed->name == "NewName");
    assert(renamed->id == created->id);

    // Verify stored value is also updated
    const auto* stored = state.get_datum(created->id);
    assert(stored != nullptr);
    assert(stored->name == "NewName");

    std::cout << "  PASS: rename datum" << std::endl;
}

static void test_rename_nonexistent() {
    MechanismState state;

    auto result = state.rename_datum("nonexistent", "Name");
    assert(!result.has_value());

    std::cout << "  PASS: rename nonexistent datum returns nullopt" << std::endl;
}

static void test_update_datum_pose() {
    MechanismState state;
    state.add_body("body-001", "Ground");

    double pos[3] = {0, 0, 0};
    double orient[4] = {1, 0, 0, 0};
    auto created = state.create_datum("body-001", "PoseDatum", pos, orient);
    assert(created.has_value());

    double new_pos[3] = {4.0, 5.0, 6.0};
    double new_orient[4] = {0.5, 0.5, 0.5, 0.5};
    auto updated = state.update_datum_pose(created->id, new_pos, new_orient);
    assert(updated.has_value());
    assert(updated->position[0] == 4.0);
    assert(updated->position[1] == 5.0);
    assert(updated->position[2] == 6.0);
    assert(updated->orientation[0] == 0.5);
    assert(updated->orientation[1] == 0.5);
    assert(updated->orientation[2] == 0.5);
    assert(updated->orientation[3] == 0.5);

    const auto* stored = state.get_datum(created->id);
    assert(stored != nullptr);
    assert(stored->position[0] == 4.0);
    assert(stored->orientation[3] == 0.5);

    auto missing = state.update_datum_pose("nonexistent", new_pos, new_orient);
    assert(!missing.has_value());

    std::cout << "  PASS: update datum pose" << std::endl;
}

static void test_clear() {
    MechanismState state;
    state.add_body("body-001", "Ground");

    double pos[3] = {0, 0, 0};
    double orient[4] = {1, 0, 0, 0};
    state.create_datum("body-001", "D1", pos, orient);

    assert(state.body_count() == 1);
    assert(state.datum_count() == 1);

    state.clear();
    assert(state.body_count() == 0);
    assert(state.datum_count() == 0);

    std::cout << "  PASS: clear" << std::endl;
}

static void test_body_asset_reference_roundtrip() {
    MechanismState state;

    motionlab::mechanism::AssetReference asset_ref;
    asset_ref.set_content_hash("hash-123");
    asset_ref.set_relative_path("assets/bracket.step");
    asset_ref.set_original_filename("bracket.step");

    double pos[3] = {1.0, 2.0, 3.0};
    double orient[4] = {1.0, 0.0, 0.0, 0.0};
    double com[3] = {0.1, 0.2, 0.3};
    double inertia[6] = {1.0, 2.0, 3.0, 0.1, 0.2, 0.3};
    state.add_body("body-001", "Bracket", pos, orient, 10.0, com, inertia, &asset_ref);

    auto mech = state.build_mechanism_proto();
    assert(mech.bodies_size() == 1);
    assert(mech.bodies(0).has_source_asset_ref());
    assert(mech.bodies(0).source_asset_ref().content_hash() == "hash-123");
    assert(mech.bodies(0).source_asset_ref().relative_path() == "assets/bracket.step");
    assert(mech.bodies(0).source_asset_ref().original_filename() == "bracket.step");

    MechanismState reloaded;
    reloaded.load_from_proto(mech);
    auto reloaded_mech = reloaded.build_mechanism_proto();
    assert(reloaded_mech.bodies_size() == 1);
    assert(reloaded_mech.bodies(0).has_source_asset_ref());
    assert(reloaded_mech.bodies(0).source_asset_ref().content_hash() == "hash-123");
    assert(reloaded_mech.bodies(0).source_asset_ref().relative_path() == "assets/bracket.step");
    assert(reloaded_mech.bodies(0).source_asset_ref().original_filename() == "bracket.step");

    std::cout << "  PASS: body asset reference roundtrip" << std::endl;
}

// ──────────────────────────────────────────────
// Joint CRUD tests
// ──────────────────────────────────────────────

static void test_create_joint_success() {
    MechanismState state;
    state.add_body("body-001", "Ground");
    state.add_body("body-002", "Link1");

    double pos[3] = {0, 0, 0};
    double orient[4] = {1, 0, 0, 0};
    auto d1 = state.create_datum("body-001", "D1", pos, orient);
    auto d2 = state.create_datum("body-002", "D2", pos, orient);
    assert(d1.has_value());
    assert(d2.has_value());

    auto result = state.create_joint(d1->id, d2->id, 1, "Rev1", -3.14, 3.14);
    assert(result.entry.has_value());
    assert(result.error.empty());
    assert(result.entry->name == "Rev1");
    assert(result.entry->type == 1);
    assert(result.entry->parent_datum_id == d1->id);
    assert(result.entry->child_datum_id == d2->id);
    assert(result.entry->lower_limit == -3.14);
    assert(result.entry->upper_limit == 3.14);

    // Verify UUIDv7 format
    std::regex uuid_re("^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$");
    assert(std::regex_match(result.entry->id, uuid_re));
    assert(state.joint_count() == 1);

    std::cout << "  PASS: create joint success" << std::endl;
}

static void test_create_joint_nonexistent_parent_datum() {
    MechanismState state;
    state.add_body("body-001", "Ground");
    state.add_body("body-002", "Link1");

    double pos[3] = {0, 0, 0};
    double orient[4] = {1, 0, 0, 0};
    auto d2 = state.create_datum("body-002", "D2", pos, orient);
    assert(d2.has_value());

    auto result = state.create_joint("nonexistent", d2->id, 1, "Bad", -1, 1);
    assert(!result.entry.has_value());
    assert(result.error.find("Parent datum not found") != std::string::npos);

    std::cout << "  PASS: create joint nonexistent parent datum" << std::endl;
}

static void test_create_joint_nonexistent_child_datum() {
    MechanismState state;
    state.add_body("body-001", "Ground");

    double pos[3] = {0, 0, 0};
    double orient[4] = {1, 0, 0, 0};
    auto d1 = state.create_datum("body-001", "D1", pos, orient);
    assert(d1.has_value());

    auto result = state.create_joint(d1->id, "nonexistent", 1, "Bad", -1, 1);
    assert(!result.entry.has_value());
    assert(result.error.find("Child datum not found") != std::string::npos);

    std::cout << "  PASS: create joint nonexistent child datum" << std::endl;
}

static void test_create_joint_same_body() {
    MechanismState state;
    state.add_body("body-001", "Ground");

    double pos[3] = {0, 0, 0};
    double orient[4] = {1, 0, 0, 0};
    auto d1 = state.create_datum("body-001", "D1", pos, orient);
    auto d2 = state.create_datum("body-001", "D2", pos, orient);
    assert(d1.has_value());
    assert(d2.has_value());

    auto result = state.create_joint(d1->id, d2->id, 1, "Bad", -1, 1);
    assert(!result.entry.has_value());
    assert(result.error.find("different bodies") != std::string::npos);

    std::cout << "  PASS: create joint same body" << std::endl;
}

static void test_create_joint_invalid_type() {
    MechanismState state;
    state.add_body("body-001", "Ground");
    state.add_body("body-002", "Link1");

    double pos[3] = {0, 0, 0};
    double orient[4] = {1, 0, 0, 0};
    auto d1 = state.create_datum("body-001", "D1", pos, orient);
    auto d2 = state.create_datum("body-002", "D2", pos, orient);

    auto result = state.create_joint(d1->id, d2->id, 0, "Bad", -1, 1);
    assert(!result.entry.has_value());
    assert(result.error.find("Invalid joint type") != std::string::npos);

    std::cout << "  PASS: create joint invalid type" << std::endl;
}

static void test_create_joint_bad_limits() {
    MechanismState state;
    state.add_body("body-001", "Ground");
    state.add_body("body-002", "Link1");

    double pos[3] = {0, 0, 0};
    double orient[4] = {1, 0, 0, 0};
    auto d1 = state.create_datum("body-001", "D1", pos, orient);
    auto d2 = state.create_datum("body-002", "D2", pos, orient);

    auto result = state.create_joint(d1->id, d2->id, 1, "Bad", 5.0, 1.0);
    assert(!result.entry.has_value());
    assert(result.error.find("Lower limit must be <= upper limit") != std::string::npos);

    std::cout << "  PASS: create joint bad limits" << std::endl;
}

static void test_update_joint() {
    MechanismState state;
    state.add_body("body-001", "Ground");
    state.add_body("body-002", "Link1");

    double pos[3] = {0, 0, 0};
    double orient[4] = {1, 0, 0, 0};
    auto d1 = state.create_datum("body-001", "D1", pos, orient);
    auto d2 = state.create_datum("body-002", "D2", pos, orient);
    auto created = state.create_joint(d1->id, d2->id, 1, "Rev1", -3.14, 3.14);
    assert(created.entry.has_value());

    auto updated = state.update_joint(created.entry->id,
        std::optional<std::string>("UpdatedName"),
        std::optional<int>(2),
        std::optional<double>(0.0),
        std::optional<double>(100.0));
    assert(updated.entry.has_value());
    assert(updated.entry->name == "UpdatedName");
    assert(updated.entry->type == 2);
    assert(updated.entry->lower_limit == 0.0);
    assert(updated.entry->upper_limit == 100.0);

    std::cout << "  PASS: update joint" << std::endl;
}

static void test_update_nonexistent_joint() {
    MechanismState state;

    auto result = state.update_joint("nonexistent",
        std::optional<std::string>("Name"),
        std::nullopt, std::nullopt, std::nullopt);
    assert(!result.entry.has_value());
    assert(result.error.find("Joint not found") != std::string::npos);

    std::cout << "  PASS: update nonexistent joint" << std::endl;
}

static void test_delete_joint() {
    MechanismState state;
    state.add_body("body-001", "Ground");
    state.add_body("body-002", "Link1");

    double pos[3] = {0, 0, 0};
    double orient[4] = {1, 0, 0, 0};
    auto d1 = state.create_datum("body-001", "D1", pos, orient);
    auto d2 = state.create_datum("body-002", "D2", pos, orient);
    auto created = state.create_joint(d1->id, d2->id, 1, "Rev1", -1, 1);
    assert(created.entry.has_value());
    assert(state.joint_count() == 1);

    bool ok = state.delete_joint(created.entry->id);
    assert(ok);
    assert(state.joint_count() == 0);

    std::cout << "  PASS: delete joint" << std::endl;
}

static void test_delete_nonexistent_joint() {
    MechanismState state;

    bool ok = state.delete_joint("nonexistent");
    assert(!ok);

    std::cout << "  PASS: delete nonexistent joint" << std::endl;
}

static void test_clear_includes_joints() {
    MechanismState state;
    state.add_body("body-001", "Ground");
    state.add_body("body-002", "Link1");

    double pos[3] = {0, 0, 0};
    double orient[4] = {1, 0, 0, 0};
    auto d1 = state.create_datum("body-001", "D1", pos, orient);
    auto d2 = state.create_datum("body-002", "D2", pos, orient);
    state.create_joint(d1->id, d2->id, 1, "Rev1", -1, 1);

    assert(state.joint_count() == 1);
    state.clear();
    assert(state.joint_count() == 0);

    std::cout << "  PASS: clear includes joints" << std::endl;
}

static void test_delete_datum_blocked_by_joint() {
    MechanismState state;
    state.add_body("body-001", "Ground");
    state.add_body("body-002", "Link1");

    double pos[3] = {0, 0, 0};
    double orient[4] = {1, 0, 0, 0};
    auto d1 = state.create_datum("body-001", "D1", pos, orient);
    auto d2 = state.create_datum("body-002", "D2", pos, orient);
    assert(d1.has_value());
    assert(d2.has_value());

    auto joint = state.create_joint(d1->id, d2->id, 1, "Rev1", -1, 1);
    assert(joint.entry.has_value());

    // Deleting parent datum should fail
    bool ok1 = state.delete_datum(d1->id);
    assert(!ok1);
    assert(state.datum_count() == 2);

    // Deleting child datum should also fail
    bool ok2 = state.delete_datum(d2->id);
    assert(!ok2);
    assert(state.datum_count() == 2);

    // Delete the joint first, then datum deletion should succeed
    state.delete_joint(joint.entry->id);
    bool ok3 = state.delete_datum(d1->id);
    assert(ok3);

    std::cout << "  PASS: delete datum blocked by joint" << std::endl;
}

// ──────────────────────────────────────────────
// Extended add_body + build_mechanism_proto tests
// ──────────────────────────────────────────────

static void test_add_body_with_full_data() {
    MechanismState state;
    double pos[3] = {1.0, 2.0, 3.0};
    double orient[4] = {1.0, 0.0, 0.0, 0.0};
    double com[3] = {0.5, 0.5, 0.5};
    double inertia[6] = {1.0, 2.0, 3.0, 0.1, 0.2, 0.3};

    state.add_body("body-001", "Ground", pos, orient, 10.0, com, inertia);
    assert(state.body_count() == 1);
    assert(state.has_body("body-001"));

    std::cout << "  PASS: add body with full data" << std::endl;
}

static void test_build_mechanism_proto() {
    MechanismState state;

    // Add two bodies with full data
    double pos1[3] = {0.0, 0.0, 0.0};
    double orient1[4] = {1.0, 0.0, 0.0, 0.0};
    double com1[3] = {0.0, 0.0, 0.0};
    double inertia1[6] = {1.0, 1.0, 1.0, 0.0, 0.0, 0.0};
    state.add_body("body-001", "Ground", pos1, orient1, 10.0, com1, inertia1);

    double pos2[3] = {1.0, 0.0, 0.0};
    double orient2[4] = {0.707, 0.0, 0.707, 0.0};
    double com2[3] = {0.5, 0.0, 0.0};
    double inertia2[6] = {2.0, 3.0, 4.0, 0.1, 0.2, 0.3};
    state.add_body("body-002", "Link1", pos2, orient2, 5.0, com2, inertia2);

    // Add datums
    double dpos[3] = {0.0, 0.0, 0.0};
    double dorient[4] = {1.0, 0.0, 0.0, 0.0};
    auto d1 = state.create_datum("body-001", "D1", dpos, dorient);
    auto d2 = state.create_datum("body-002", "D2", dpos, dorient);
    assert(d1.has_value());
    assert(d2.has_value());

    // Add a joint
    auto joint = state.create_joint(d1->id, d2->id, 1, "Rev1", -3.14, 3.14);
    assert(joint.entry.has_value());

    // Build the proto
    auto mech = state.build_mechanism_proto();

    // Verify bodies
    assert(mech.bodies_size() == 2);
    bool found_ground = false, found_link = false;
    for (int i = 0; i < mech.bodies_size(); ++i) {
        const auto& b = mech.bodies(i);
        if (b.id().id() == "body-001") {
            found_ground = true;
            assert(b.name() == "Ground");
            assert(b.mass_properties().mass() == 10.0);
            assert(b.pose().position().x() == 0.0);
        } else if (b.id().id() == "body-002") {
            found_link = true;
            assert(b.name() == "Link1");
            assert(b.mass_properties().mass() == 5.0);
            assert(b.pose().position().x() == 1.0);
            assert(std::abs(b.pose().orientation().w() - 0.707) < 0.001);
            assert(b.mass_properties().ixx() == 2.0);
            assert(b.mass_properties().ixy() == 0.1);
        }
    }
    assert(found_ground);
    assert(found_link);

    // Verify datums
    assert(mech.datums_size() == 2);

    // Verify joints
    assert(mech.joints_size() == 1);
    assert(mech.joints(0).name() == "Rev1");
    assert(mech.joints(0).type() == motionlab::mechanism::JOINT_TYPE_REVOLUTE);
    assert(mech.joints(0).lower_limit() == -3.14);
    assert(mech.joints(0).upper_limit() == 3.14);

    std::cout << "  PASS: build mechanism proto" << std::endl;
}

int main() {
    motionlab::init_logging(spdlog::level::debug);
    std::cout << "MechanismState unit tests" << std::endl;

    test_create_datum_on_body();
    test_create_datum_invalid_parent();
    test_delete_datum();
    test_rename_datum();
    test_rename_nonexistent();
    test_update_datum_pose();
    test_body_asset_reference_roundtrip();
    test_clear();

    // Joint tests
    test_create_joint_success();
    test_create_joint_nonexistent_parent_datum();
    test_create_joint_nonexistent_child_datum();
    test_create_joint_same_body();
    test_create_joint_invalid_type();
    test_create_joint_bad_limits();
    test_update_joint();
    test_update_nonexistent_joint();
    test_delete_joint();
    test_delete_nonexistent_joint();
    test_clear_includes_joints();
    test_delete_datum_blocked_by_joint();

    // Extended body + build_mechanism_proto tests
    test_add_body_with_full_data();
    test_build_mechanism_proto();

    std::cout << "All mechanism state tests passed." << std::endl;
    return 0;
}
