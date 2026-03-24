/**
 * Generates the pendulum example files using OCCT geometry:
 *   - pendulum.step   (STEP file for import pipeline testing)
 *   - pendulum.motionlab  (self-contained project with OCCT-tessellated meshes)
 *
 * Build:  cmake --build build --target generate-pendulum-example
 * Run:    ./build/generate-pendulum-example [output_dir]
 *         (defaults to ../../apps/desktop/examples/ relative to executable)
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
#include <STEPCAFControl_Writer.hxx>
#include <TDataStd_Name.hxx>
#include <TDocStd_Document.hxx>
#include <XCAFApp_Application.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>

#ifdef _MSC_VER
#pragma warning(pop)
#endif

namespace fs = std::filesystem;
namespace mech = motionlab::mechanism;
using namespace motionlab::engine;

// ──────────────────────────────────────────────
// Geometry dimensions (meters — OCCT works in whatever units we give it,
// and our import pipeline expects meters for the project file)
// ──────────────────────────────────────────────

static constexpr double GROUND_W = 0.4, GROUND_H = 0.2, GROUND_D = 0.2;
static constexpr double ARM_W = 1.0, ARM_H = 0.1, ARM_D = 0.1;
static constexpr double DENSITY = 1000.0;           // kg/m³ (water)
static constexpr double TESS_QUALITY = 0.001;        // linear deflection (meters)

// ──────────────────────────────────────────────
// Write STEP file with two named bodies
// ──────────────────────────────────────────────

static bool write_step_file(const fs::path& out_path,
                             const TopoDS_Shape& ground_shape,
                             const TopoDS_Shape& arm_shape) {
    Handle(XCAFApp_Application) app = XCAFApp_Application::GetApplication();
    Handle(TDocStd_Document) doc;
    app->NewDocument("MDTV-XCAF", doc);

    Handle(XCAFDoc_ShapeTool) shape_tool =
        XCAFDoc_DocumentTool::ShapeTool(doc->Main());

    TDF_Label ground_label = shape_tool->AddShape(ground_shape);
    TDataStd_Name::Set(ground_label, "Ground");

    TDF_Label arm_label = shape_tool->AddShape(arm_shape);
    TDataStd_Name::Set(arm_label, "PendulumArm");

    STEPCAFControl_Writer writer;
    writer.SetNameMode(true);
    writer.SetColorMode(false);
    writer.SetLayerMode(false);

    writer.Transfer(doc, STEPControl_AsIs);
    IFSelect_ReturnStatus status = writer.Write(out_path.string().c_str());
    app->Close(doc);

    return status == IFSelect_RetDone;
}

// ──────────────────────────────────────────────
// Helper: populate a Body proto
// ──────────────────────────────────────────────

static void build_body_proto(mech::Body* pb,
                              const std::string& id,
                              const std::string& name,
                              bool is_fixed,
                              const double pos[3],
                              const MassPropertiesResult& mass) {
    pb->mutable_id()->set_id(id);
    pb->set_name(name);
    pb->set_is_fixed(is_fixed);

    auto* pose = pb->mutable_pose();
    auto* p = pose->mutable_position();
    p->set_x(pos[0]); p->set_y(pos[1]); p->set_z(pos[2]);
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

    pb->set_mass_override(true);
}

// ──────────────────────────────────────────────
// Helper: populate a BodyDisplayData proto from MeshData
// ──────────────────────────────────────────────

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

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

int main(int argc, char* argv[]) {
    motionlab::init_logging();

    // Resolve output directory
    fs::path out_dir;
    if (argc > 1) {
        out_dir = argv[1];
    } else {
        // Default: ../../apps/desktop/examples/ relative to executable
        out_dir = fs::path(argv[0]).parent_path() / ".." / ".." / "apps" / "desktop" / "examples";
    }
    out_dir = fs::weakly_canonical(out_dir);
    fs::create_directories(out_dir);

    // ── Create OCCT shapes ──
    // BRepPrimAPI_MakeBox creates a box with one corner at the origin.
    // We want boxes centered at their local origin, so we offset by -half extents.
    gp_Pnt ground_corner(-GROUND_W / 2, -GROUND_H / 2, -GROUND_D / 2);
    TopoDS_Shape ground_shape = BRepPrimAPI_MakeBox(ground_corner, GROUND_W, GROUND_H, GROUND_D).Shape();

    gp_Pnt arm_corner(-ARM_W / 2, -ARM_H / 2, -ARM_D / 2);
    TopoDS_Shape arm_shape = BRepPrimAPI_MakeBox(arm_corner, ARM_W, ARM_H, ARM_D).Shape();

    // ── Write STEP file ──
    fs::path step_path = out_dir / "pendulum.step";
    if (!write_step_file(step_path, ground_shape, arm_shape)) {
        std::cerr << "ERROR: Failed to write STEP file\n";
        return 1;
    }
    std::cout << "Written: " << step_path << "\n";

    // ── Tessellate & compute mass properties ──
    CadImporter importer;
    MeshData ground_mesh = importer.tessellate(ground_shape, TESS_QUALITY);
    MeshData arm_mesh = importer.tessellate(arm_shape, TESS_QUALITY);

    MassPropertiesResult ground_mass = importer.compute_mass_properties(ground_shape, DENSITY);
    MassPropertiesResult arm_mass = importer.compute_mass_properties(arm_shape, DENSITY);

    spdlog::info("Ground: {} verts, {} tris, {} faces, mass={:.4f}kg",
                 ground_mesh.vertices.size() / 3,
                 ground_mesh.indices.size() / 3,
                 ground_mesh.part_index.size(),
                 ground_mass.mass);
    spdlog::info("Arm: {} verts, {} tris, {} faces, mass={:.4f}kg",
                 arm_mesh.vertices.size() / 3,
                 arm_mesh.indices.size() / 3,
                 arm_mesh.part_index.size(),
                 arm_mass.mass);

    // ── Build ProjectFile protobuf ──
    mech::ProjectFile project;
    project.set_version(1);

    auto* meta = project.mutable_metadata();
    meta->set_name("Pendulum Example");
    meta->set_created_at("2026-03-19T00:00:00Z");
    meta->set_modified_at("2026-03-19T00:00:00Z");

    auto* mechanism = project.mutable_mechanism();
    mechanism->mutable_id()->set_id("mech-pendulum");
    mechanism->set_name("Pendulum");

    // Ground body: at origin, fixed
    double ground_pos[3] = {0, 0, 0};
    build_body_proto(mechanism->add_bodies(), "body-ground", "Ground",
                     true, ground_pos, ground_mass);

    // Arm body: center at (0.7, 0, 0) — pivot at ground edge (0.2) + half arm (0.5)
    double arm_pos[3] = {0.7, 0, 0};
    build_body_proto(mechanism->add_bodies(), "body-arm", "Pendulum Arm",
                     false, arm_pos, arm_mass);

    // Datums
    auto* d1 = mechanism->add_datums();
    d1->mutable_id()->set_id("datum-pivot-ground");
    d1->set_name("Pivot on Ground");
    d1->mutable_parent_body_id()->set_id("body-ground");
    auto* d1_pose = d1->mutable_local_pose();
    d1_pose->mutable_position()->set_x(0.2);
    d1_pose->mutable_orientation()->set_w(1);

    auto* d2 = mechanism->add_datums();
    d2->mutable_id()->set_id("datum-pivot-arm");
    d2->set_name("Pivot on Pendulum");
    d2->mutable_parent_body_id()->set_id("body-arm");
    auto* d2_pose = d2->mutable_local_pose();
    d2_pose->mutable_position()->set_x(-0.5);
    d2_pose->mutable_orientation()->set_w(1);

    // Revolute joint
    auto* joint = mechanism->add_joints();
    joint->mutable_id()->set_id("joint-pivot");
    joint->set_name("Pivot");
    joint->set_type(mech::JOINT_TYPE_REVOLUTE);
    joint->mutable_parent_datum_id()->set_id("datum-pivot-ground");
    joint->mutable_child_datum_id()->set_id("datum-pivot-arm");

    // Body display data (OCCT-tessellated meshes)
    build_display_data(project.add_body_display_data(), "body-ground", ground_mesh);
    build_display_data(project.add_body_display_data(), "body-arm", arm_mesh);

    // ── Serialize and write .motionlab ──
    std::string serialized;
    project.SerializeToString(&serialized);

    fs::path ml_path = out_dir / "pendulum.motionlab";
    std::ofstream out(ml_path, std::ios::binary);
    out.write(serialized.data(), static_cast<std::streamsize>(serialized.size()));
    out.close();

    std::cout << "Written: " << ml_path << " (" << serialized.size() << " bytes)\n";
    return 0;
}
