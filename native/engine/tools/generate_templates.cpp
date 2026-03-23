/**
 * Generates the built-in project template files:
 *   - empty.motionlab
 *   - simple-pendulum.motionlab
 *   - four-bar-linkage.motionlab
 *   - slider-crank.motionlab
 *   - double-pendulum.motionlab
 *
 * Each template is a self-contained ProjectFile protobuf with OCCT-tessellated
 * meshes and computed mass properties.
 *
 * Build:  cmake --build build --target generate-templates
 * Run:    ./build/generate-templates [output_dir]
 *         (defaults to ../../apps/desktop/resources/templates/ relative to executable)
 */

#include "../src/cad_import.h"
#include "engine/log.h"
#include "mechanism/mechanism.pb.h"

#include <filesystem>
#include <fstream>
#include <iostream>

#ifdef _MSC_VER
#pragma warning(push)
#pragma warning(disable : 4267 4244 4996 4458 4100)
#endif

#include <BRepPrimAPI_MakeBox.hxx>

#ifdef _MSC_VER
#pragma warning(pop)
#endif

namespace fs = std::filesystem;
namespace mech = motionlab::mechanism;
using namespace motionlab::engine;

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

static constexpr double DENSITY = 1000.0;       // kg/m³
static constexpr double TESS_QUALITY = 0.001;   // linear deflection (meters)

// ──────────────────────────────────────────────
// Helpers (shared across all templates)
// ──────────────────────────────────────────────

static TopoDS_Shape make_centered_box(double w, double h, double d) {
    gp_Pnt corner(-w / 2, -h / 2, -d / 2);
    return BRepPrimAPI_MakeBox(corner, w, h, d).Shape();
}

struct BodyDef {
    std::string id;
    std::string name;
    bool is_fixed;
    double pos[3];
    TopoDS_Shape shape;
};

static void build_body_proto(mech::Body* pb,
                              const BodyDef& def,
                              const MassPropertiesResult& mass) {
    pb->mutable_id()->set_id(def.id);
    pb->set_name(def.name);
    pb->set_is_fixed(def.is_fixed);

    auto* pose = pb->mutable_pose();
    auto* p = pose->mutable_position();
    p->set_x(def.pos[0]); p->set_y(def.pos[1]); p->set_z(def.pos[2]);
    auto* q = pose->mutable_orientation();
    q->set_w(1); q->set_x(0); q->set_y(0); q->set_z(0);

    auto* mp = pb->mutable_mass_properties();
    mp->set_mass(mass.mass);
    auto* com = mp->mutable_center_of_mass();
    com->set_x(mass.center_of_mass[0]);
    com->set_y(mass.center_of_mass[1]);
    com->set_z(mass.center_of_mass[2]);
    mp->set_ixx(mass.inertia[0]);
    mp->set_iyy(mass.inertia[1]);
    mp->set_izz(mass.inertia[2]);
    mp->set_ixy(mass.inertia[3]);
    mp->set_ixz(mass.inertia[4]);
    mp->set_iyz(mass.inertia[5]);
}

static void build_display_data(mech::BodyDisplayData* bdd,
                                const std::string& body_id,
                                const MeshData& mesh) {
    bdd->set_body_id(body_id);
    bdd->set_density(DENSITY);
    bdd->set_tessellation_quality(TESS_QUALITY);
    bdd->set_unit_system("meter");

    auto* dm = bdd->mutable_display_mesh();
    for (float v : mesh.vertices)  dm->add_vertices(v);
    for (uint32_t i : mesh.indices) dm->add_indices(i);
    for (float n : mesh.normals)   dm->add_normals(n);

    for (uint32_t pi : mesh.part_index) bdd->add_part_index(pi);
}

static void add_datum(mech::Mechanism* mechanism,
                      const std::string& id,
                      const std::string& name,
                      const std::string& parent_body_id,
                      double x, double y, double z) {
    auto* d = mechanism->add_datums();
    d->mutable_id()->set_id(id);
    d->set_name(name);
    d->mutable_parent_body_id()->set_id(parent_body_id);
    auto* pose = d->mutable_local_pose();
    pose->mutable_position()->set_x(x);
    pose->mutable_position()->set_y(y);
    pose->mutable_position()->set_z(z);
    pose->mutable_orientation()->set_w(1);
}

static void add_joint(mech::Mechanism* mechanism,
                      const std::string& id,
                      const std::string& name,
                      mech::JointType type,
                      const std::string& parent_datum_id,
                      const std::string& child_datum_id) {
    auto* j = mechanism->add_joints();
    j->mutable_id()->set_id(id);
    j->set_name(name);
    j->set_type(type);
    j->mutable_parent_datum_id()->set_id(parent_datum_id);
    j->mutable_child_datum_id()->set_id(child_datum_id);
}

static void add_body_with_mesh(mech::Mechanism* mechanism,
                                mech::ProjectFile& project,
                                CadImporter& importer,
                                const BodyDef& def) {
    MeshData mesh = importer.tessellate(def.shape, TESS_QUALITY);
    MassPropertiesResult mass = importer.compute_mass_properties(def.shape, DENSITY);

    build_body_proto(mechanism->add_bodies(), def, mass);
    build_display_data(project.add_body_display_data(), def.id, mesh);

    spdlog::info("  {}: {} verts, {} tris, mass={:.4f}kg",
                 def.name,
                 mesh.vertices.size() / 3,
                 mesh.indices.size() / 3,
                 mass.mass);
}

static bool write_project(const fs::path& out_path, const mech::ProjectFile& project) {
    std::string serialized;
    project.SerializeToString(&serialized);

    std::ofstream out(out_path, std::ios::binary);
    out.write(serialized.data(), static_cast<std::streamsize>(serialized.size()));
    out.close();

    std::cout << "Written: " << out_path << " (" << serialized.size() << " bytes)\n";
    return out.good();
}

static void init_project(mech::ProjectFile& project,
                          const std::string& name,
                          const std::string& mech_id) {
    project.set_version(1);
    auto* meta = project.mutable_metadata();
    meta->set_name(name);
    meta->set_created_at("2026-03-22T00:00:00Z");
    meta->set_modified_at("2026-03-22T00:00:00Z");

    auto* mechanism = project.mutable_mechanism();
    mechanism->mutable_id()->set_id(mech_id);
    mechanism->set_name(name);
}

// ──────────────────────────────────────────────
// Template generators
// ──────────────────────────────────────────────

static bool generate_empty(const fs::path& out_dir) {
    spdlog::info("Generating: Empty Project");
    mech::ProjectFile project;
    init_project(project, "Empty Project", "mech-empty");
    return write_project(out_dir / "empty.motionlab", project);
}

static bool generate_simple_pendulum(const fs::path& out_dir, CadImporter& importer) {
    spdlog::info("Generating: Simple Pendulum");
    mech::ProjectFile project;
    init_project(project, "Simple Pendulum", "mech-simple-pendulum");
    auto* mechanism = project.mutable_mechanism();

    // Bodies
    BodyDef ground{"body-ground", "Ground", true, {0, 0, 0},
                   make_centered_box(0.4, 0.2, 0.2)};
    BodyDef arm{"body-arm", "Pendulum Arm", false, {0.7, 0, 0},
                make_centered_box(1.0, 0.1, 0.1)};

    add_body_with_mesh(mechanism, project, importer, ground);
    add_body_with_mesh(mechanism, project, importer, arm);

    // Datums at pivot point: ground edge (x=0.2) and arm start (x=-0.5)
    add_datum(mechanism, "datum-pivot-ground", "Pivot on Ground",
              "body-ground", 0.2, 0, 0);
    add_datum(mechanism, "datum-pivot-arm", "Pivot on Arm",
              "body-arm", -0.5, 0, 0);

    // Revolute joint
    add_joint(mechanism, "joint-pivot", "Pivot",
              mech::JOINT_TYPE_REVOLUTE,
              "datum-pivot-ground", "datum-pivot-arm");

    return write_project(out_dir / "simple-pendulum.motionlab", project);
}

static bool generate_four_bar(const fs::path& out_dir, CadImporter& importer) {
    spdlog::info("Generating: Four-Bar Linkage");
    mech::ProjectFile project;
    init_project(project, "Four-Bar Linkage", "mech-four-bar");
    auto* mechanism = project.mutable_mechanism();

    // Classic four-bar: ground (0.3m between pivots), crank (0.1m),
    // coupler (0.3m), follower (0.2m)
    constexpr double bar_cs = 0.04;  // cross-section

    BodyDef ground{"body-ground", "Ground", true, {0, 0, 0},
                   make_centered_box(0.4, 0.08, 0.08)};
    BodyDef crank{"body-crank", "Crank", false, {-0.1, 0.15, 0},
                  make_centered_box(0.1, bar_cs, bar_cs)};
    BodyDef coupler{"body-coupler", "Coupler", false, {0.05, 0.3, 0},
                    make_centered_box(0.3, bar_cs, bar_cs)};
    BodyDef follower{"body-follower", "Follower", false, {0.2, 0.15, 0},
                     make_centered_box(0.2, bar_cs, bar_cs)};

    add_body_with_mesh(mechanism, project, importer, ground);
    add_body_with_mesh(mechanism, project, importer, crank);
    add_body_with_mesh(mechanism, project, importer, coupler);
    add_body_with_mesh(mechanism, project, importer, follower);

    // Datums — four pivot points
    // Joint A: ground left end to crank bottom
    add_datum(mechanism, "datum-A-ground", "A on Ground",
              "body-ground", -0.15, 0, 0);
    add_datum(mechanism, "datum-A-crank", "A on Crank",
              "body-crank", -0.05, 0, 0);

    // Joint B: crank top to coupler left end
    add_datum(mechanism, "datum-B-crank", "B on Crank",
              "body-crank", 0.05, 0, 0);
    add_datum(mechanism, "datum-B-coupler", "B on Coupler",
              "body-coupler", -0.15, 0, 0);

    // Joint C: coupler right end to follower top
    add_datum(mechanism, "datum-C-coupler", "C on Coupler",
              "body-coupler", 0.15, 0, 0);
    add_datum(mechanism, "datum-C-follower", "C on Follower",
              "body-follower", 0.1, 0, 0);

    // Joint D: follower bottom to ground right end
    add_datum(mechanism, "datum-D-follower", "D on Follower",
              "body-follower", -0.1, 0, 0);
    add_datum(mechanism, "datum-D-ground", "D on Ground",
              "body-ground", 0.15, 0, 0);

    // Four revolute joints
    add_joint(mechanism, "joint-A", "Joint A", mech::JOINT_TYPE_REVOLUTE,
              "datum-A-ground", "datum-A-crank");
    add_joint(mechanism, "joint-B", "Joint B", mech::JOINT_TYPE_REVOLUTE,
              "datum-B-crank", "datum-B-coupler");
    add_joint(mechanism, "joint-C", "Joint C", mech::JOINT_TYPE_REVOLUTE,
              "datum-C-coupler", "datum-C-follower");
    add_joint(mechanism, "joint-D", "Joint D", mech::JOINT_TYPE_REVOLUTE,
              "datum-D-follower", "datum-D-ground");

    return write_project(out_dir / "four-bar-linkage.motionlab", project);
}

static bool generate_slider_crank(const fs::path& out_dir, CadImporter& importer) {
    spdlog::info("Generating: Slider-Crank");
    mech::ProjectFile project;
    init_project(project, "Slider-Crank", "mech-slider-crank");
    auto* mechanism = project.mutable_mechanism();

    constexpr double bar_cs = 0.04;

    BodyDef ground{"body-ground", "Ground", true, {0, 0, 0},
                   make_centered_box(0.3, 0.08, 0.08)};
    BodyDef crank{"body-crank", "Crank", false, {0.075, 0.1, 0},
                  make_centered_box(0.15, bar_cs, bar_cs)};
    BodyDef conrod{"body-conrod", "Connecting Rod", false, {0.275, 0.05, 0},
                   make_centered_box(0.25, bar_cs, bar_cs)};
    BodyDef slider{"body-slider", "Slider", false, {0.4, 0, 0},
                   make_centered_box(0.08, 0.06, 0.08)};

    add_body_with_mesh(mechanism, project, importer, ground);
    add_body_with_mesh(mechanism, project, importer, crank);
    add_body_with_mesh(mechanism, project, importer, conrod);
    add_body_with_mesh(mechanism, project, importer, slider);

    // Datums
    // Crank pivot at ground center
    add_datum(mechanism, "datum-crank-ground", "Crank Pivot on Ground",
              "body-ground", 0, 0, 0);
    add_datum(mechanism, "datum-crank-base", "Crank Pivot on Crank",
              "body-crank", -0.075, 0, 0);

    // Crank-conrod pin
    add_datum(mechanism, "datum-pin-crank", "Pin on Crank",
              "body-crank", 0.075, 0, 0);
    add_datum(mechanism, "datum-pin-conrod", "Pin on Connecting Rod",
              "body-conrod", -0.125, 0, 0);

    // Conrod-slider pin
    add_datum(mechanism, "datum-slider-conrod", "Pin on Connecting Rod",
              "body-conrod", 0.125, 0, 0);
    add_datum(mechanism, "datum-slider-pin", "Pin on Slider",
              "body-slider", 0, 0, 0);

    // Slider guide on ground
    add_datum(mechanism, "datum-slide-ground", "Slide on Ground",
              "body-ground", 0.15, 0, 0);
    add_datum(mechanism, "datum-slide-slider", "Slide on Slider",
              "body-slider", 0, 0, 0);

    // Joints
    add_joint(mechanism, "joint-crank-pivot", "Crank Pivot",
              mech::JOINT_TYPE_REVOLUTE,
              "datum-crank-ground", "datum-crank-base");
    add_joint(mechanism, "joint-crank-conrod", "Crank-Rod Pin",
              mech::JOINT_TYPE_REVOLUTE,
              "datum-pin-crank", "datum-pin-conrod");
    add_joint(mechanism, "joint-conrod-slider", "Rod-Slider Pin",
              mech::JOINT_TYPE_REVOLUTE,
              "datum-slider-conrod", "datum-slider-pin");
    add_joint(mechanism, "joint-slide", "Slider Guide",
              mech::JOINT_TYPE_PRISMATIC,
              "datum-slide-ground", "datum-slide-slider");

    return write_project(out_dir / "slider-crank.motionlab", project);
}

static bool generate_double_pendulum(const fs::path& out_dir, CadImporter& importer) {
    spdlog::info("Generating: Double Pendulum");
    mech::ProjectFile project;
    init_project(project, "Double Pendulum", "mech-double-pendulum");
    auto* mechanism = project.mutable_mechanism();

    BodyDef ground{"body-ground", "Ground", true, {0, 0, 0},
                   make_centered_box(0.3, 0.15, 0.15)};
    BodyDef upper{"body-upper", "Upper Arm", false, {0.45, 0, 0},
                  make_centered_box(0.6, 0.08, 0.08)};
    BodyDef lower{"body-lower", "Lower Arm", false, {1.05, 0, 0},
                  make_centered_box(0.6, 0.06, 0.06)};

    add_body_with_mesh(mechanism, project, importer, ground);
    add_body_with_mesh(mechanism, project, importer, upper);
    add_body_with_mesh(mechanism, project, importer, lower);

    // Datums
    // Upper arm pivot at ground edge
    add_datum(mechanism, "datum-pivot1-ground", "Pivot 1 on Ground",
              "body-ground", 0.15, 0, 0);
    add_datum(mechanism, "datum-pivot1-upper", "Pivot 1 on Upper Arm",
              "body-upper", -0.3, 0, 0);

    // Lower arm pivot at upper arm end
    add_datum(mechanism, "datum-pivot2-upper", "Pivot 2 on Upper Arm",
              "body-upper", 0.3, 0, 0);
    add_datum(mechanism, "datum-pivot2-lower", "Pivot 2 on Lower Arm",
              "body-lower", -0.3, 0, 0);

    // Joints
    add_joint(mechanism, "joint-pivot1", "Upper Pivot",
              mech::JOINT_TYPE_REVOLUTE,
              "datum-pivot1-ground", "datum-pivot1-upper");
    add_joint(mechanism, "joint-pivot2", "Lower Pivot",
              mech::JOINT_TYPE_REVOLUTE,
              "datum-pivot2-upper", "datum-pivot2-lower");

    return write_project(out_dir / "double-pendulum.motionlab", project);
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

int main(int argc, char* argv[]) {
    motionlab::init_logging();

    fs::path out_dir;
    if (argc > 1) {
        out_dir = argv[1];
    } else {
        out_dir = fs::path(argv[0]).parent_path() / ".." / ".." /
                  "apps" / "desktop" / "resources" / "templates";
    }
    out_dir = fs::weakly_canonical(out_dir);
    fs::create_directories(out_dir);

    spdlog::info("Output directory: {}", out_dir.string());

    CadImporter importer;
    bool ok = true;

    ok &= generate_empty(out_dir);
    ok &= generate_simple_pendulum(out_dir, importer);
    ok &= generate_four_bar(out_dir, importer);
    ok &= generate_slider_crank(out_dir, importer);
    ok &= generate_double_pendulum(out_dir, importer);

    if (!ok) {
        std::cerr << "ERROR: One or more templates failed to generate\n";
        return 1;
    }

    spdlog::info("All templates generated successfully");
    return 0;
}
