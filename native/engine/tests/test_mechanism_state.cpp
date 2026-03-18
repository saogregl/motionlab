#include "../src/mechanism_state.h"

#include <cassert>
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

int main() {
    std::cout << "MechanismState unit tests" << std::endl;

    test_create_datum_on_body();
    test_create_datum_invalid_parent();
    test_delete_datum();
    test_rename_datum();
    test_rename_nonexistent();
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

    std::cout << "All mechanism state tests passed." << std::endl;
    return 0;
}
