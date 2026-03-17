#include "../src/cad_import.h"

#include <cassert>
#include <cmath>
#include <filesystem>
#include <iostream>
#include <string>

#ifdef _MSC_VER
#pragma warning(push)
#pragma warning(disable : 4267 4244 4996 4458 4100)
#endif

// OCCT — primitives for programmatic STEP fixture
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>

// OCCT — XDE writer (preserves assembly structure + names)
#include <XCAFApp_Application.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>
#include <STEPCAFControl_Writer.hxx>
#include <TDataStd_Name.hxx>
#include <TDocStd_Document.hxx>

#ifdef _MSC_VER
#pragma warning(pop)
#endif

namespace fs = std::filesystem;
using namespace motionlab::engine;

// ──────────────────────────────────────────────
// Fixture: write a multi-body STEP file via XDE
// ──────────────────────────────────────────────

static std::string write_test_step_file() {
    auto path = fs::temp_directory_path() / "motionlab_test_assembly.step";

    Handle(XCAFApp_Application) app = XCAFApp_Application::GetApplication();
    Handle(TDocStd_Document) doc;
    app->NewDocument("MDTV-XCAF", doc);

    Handle(XCAFDoc_ShapeTool) shape_tool =
        XCAFDoc_DocumentTool::ShapeTool(doc->Main());

    // Create a box: 10 x 20 x 30 mm
    TopoDS_Shape box = BRepPrimAPI_MakeBox(10.0, 20.0, 30.0).Shape();
    TDF_Label box_label = shape_tool->AddShape(box);
    TDataStd_Name::Set(box_label, "TestBox");

    // Create a cylinder: radius 5 mm, height 40 mm
    TopoDS_Shape cyl = BRepPrimAPI_MakeCylinder(5.0, 40.0).Shape();
    TDF_Label cyl_label = shape_tool->AddShape(cyl);
    TDataStd_Name::Set(cyl_label, "TestCylinder");

    // Write STEP via XDE writer (preserves names + structure)
    STEPCAFControl_Writer writer;
    writer.SetNameMode(true);
    writer.SetColorMode(false);
    writer.SetLayerMode(false);

    writer.Transfer(doc, STEPControl_AsIs);
    IFSelect_ReturnStatus status = writer.Write(path.string().c_str());
    assert(status == IFSelect_RetDone);

    app->Close(doc);
    return path.string();
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

static void test_step_import(const std::string& step_file) {
    CadImporter importer;
    ImportResult result = importer.import_step(step_file);

    assert(result.success);
    assert(result.error_message.empty());
    assert(result.bodies.size() >= 1);

    for (const auto& body : result.bodies) {
        // Mesh sanity
        assert(!body.mesh.vertices.empty());
        assert(body.mesh.vertices.size() % 3 == 0);
        assert(body.mesh.normals.size() == body.mesh.vertices.size());
        assert(!body.mesh.indices.empty());
        assert(body.mesh.indices.size() % 3 == 0);

        // Mass sanity
        assert(body.mass_properties.mass > 0.0);
        assert(std::isfinite(body.mass_properties.center_of_mass[0]));
        assert(std::isfinite(body.mass_properties.center_of_mass[1]));
        assert(std::isfinite(body.mass_properties.center_of_mass[2]));

        // Name extracted
        assert(!body.name.empty());
    }

    // Content hash is 64-char hex
    assert(result.content_hash.size() == 64);
    for (char c : result.content_hash) {
        assert((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'));
    }

    std::cout << "  PASS: STEP import (" << result.bodies.size() << " bodies)" << std::endl;
    for (const auto& body : result.bodies) {
        std::cout << "    body: \"" << body.name << "\""
                  << "  verts=" << body.mesh.vertices.size() / 3
                  << "  tris=" << body.mesh.indices.size() / 3
                  << "  mass=" << body.mass_properties.mass << " kg"
                  << std::endl;
    }
}

static void test_nonexistent_file() {
    CadImporter importer;
    ImportResult result = importer.import_step("nonexistent_file_12345.step");

    assert(!result.success);
    assert(!result.error_message.empty());

    std::cout << "  PASS: nonexistent file (" << result.error_message << ")" << std::endl;
}

static void test_tessellation_quality(const std::string& step_file) {
    CadImporter importer;

    ImportOptions coarse;
    coarse.tessellation_quality = 1.0;
    ImportResult coarse_result = importer.import_step(step_file, coarse);

    ImportOptions fine;
    fine.tessellation_quality = 0.01;
    ImportResult fine_result = importer.import_step(step_file, fine);

    assert(coarse_result.success && fine_result.success);
    assert(!coarse_result.bodies.empty() && !fine_result.bodies.empty());

    // Find a curved body (cylinder) — it should have more vertices at finer quality
    // Use the body with the most vertices in each result as proxy
    size_t max_coarse = 0, max_fine = 0;
    for (const auto& b : coarse_result.bodies)
        max_coarse = std::max(max_coarse, b.mesh.vertices.size());
    for (const auto& b : fine_result.bodies)
        max_fine = std::max(max_fine, b.mesh.vertices.size());

    // Finer quality (lower value) should produce more vertices on curved surfaces
    assert(max_fine > max_coarse);

    std::cout << "  PASS: tessellation quality (coarse=" << max_coarse / 3
              << " verts, fine=" << max_fine / 3 << " verts)" << std::endl;
}

static void test_mass_accuracy(const std::string& step_file) {
    CadImporter importer;

    ImportOptions opts;
    opts.density = 1000.0; // kg/m^3 (water)

    ImportResult result = importer.import_step(step_file, opts);
    assert(result.success);

    // Find the box body (10 x 20 x 30 mm)
    // Expected volume: 6000 mm^3 = 6e-6 m^3
    // Expected mass: 6e-6 * 1000 = 0.006 kg
    const double expected_mass = 0.006;

    bool found_box = false;
    for (const auto& body : result.bodies) {
        if (body.name.find("Box") != std::string::npos ||
            body.name.find("box") != std::string::npos) {
            double error = std::abs(body.mass_properties.mass - expected_mass) / expected_mass;
            assert(error < 0.01); // within 1%

            // CoM should be near (5, 10, 15) mm
            assert(std::abs(body.mass_properties.center_of_mass[0] - 5.0) < 0.1);
            assert(std::abs(body.mass_properties.center_of_mass[1] - 10.0) < 0.1);
            assert(std::abs(body.mass_properties.center_of_mass[2] - 15.0) < 0.1);

            found_box = true;
            std::cout << "  PASS: mass accuracy (box mass=" << body.mass_properties.mass
                      << " kg, expected=" << expected_mass
                      << ", error=" << (error * 100.0) << "%)" << std::endl;
            break;
        }
    }

    // If names didn't match, check by mass value
    if (!found_box) {
        for (const auto& body : result.bodies) {
            double error = std::abs(body.mass_properties.mass - expected_mass) / expected_mass;
            if (error < 0.01) {
                found_box = true;
                std::cout << "  PASS: mass accuracy (body mass=" << body.mass_properties.mass
                          << " kg, expected=" << expected_mass
                          << ", error=" << (error * 100.0) << "%)" << std::endl;
                break;
            }
        }
    }

    assert(found_box);
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

int main() {
    std::cout << "CAD import tests" << std::endl;

    // Generate programmatic STEP fixture (no binary files in git)
    std::string step_file = write_test_step_file();
    std::cout << "  Fixture: " << step_file << std::endl;

    test_step_import(step_file);
    test_nonexistent_file();
    test_tessellation_quality(step_file);
    test_mass_accuracy(step_file);

    // Clean up
    std::error_code ec;
    fs::remove(step_file, ec);

    std::cout << "All CAD import tests passed." << std::endl;
    return 0;
}
