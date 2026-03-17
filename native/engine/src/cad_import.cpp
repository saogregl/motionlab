#include "cad_import.h"

#include <cmath>
#include <fstream>
#include <iostream>
#include <iterator>
#include <sstream>

// Suppress MSVC warnings from OCCT headers
#ifdef _MSC_VER
#pragma warning(push)
#pragma warning(disable : 4267 4244 4996 4458 4100)
#endif

// OCCT — XDE framework
#include <XCAFApp_Application.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>
#include <TDataStd_Name.hxx>
#include <TDocStd_Document.hxx>
#include <TDF_Label.hxx>
#include <TDF_LabelSequence.hxx>

// OCCT — STEP/IGES readers (XDE-aware)
#include <STEPCAFControl_Reader.hxx>
#include <IGESCAFControl_Reader.hxx>

// OCCT — Geometry & topology
#include <BRep_Tool.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <TopAbs_ShapeEnum.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Shape.hxx>
#include <TopLoc_Location.hxx>

// OCCT — Triangulation access
#include <Poly_Triangulation.hxx>

// OCCT — Primitives (used by tests via header, but also for transforms)
#include <gp_Pnt.hxx>
#include <gp_Quaternion.hxx>
#include <gp_Trsf.hxx>
#include <gp_Vec.hxx>

// picosha2
#include <picosha2.h>

#ifdef _MSC_VER
#pragma warning(pop)
#endif

namespace motionlab::engine {

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

ImportResult CadImporter::import_step(const std::string& file_path,
                                       const ImportOptions& options) {
    return import_xde(file_path, FileFormat::STEP, options);
}

ImportResult CadImporter::import_iges(const std::string& file_path,
                                       const ImportOptions& options) {
    return import_xde(file_path, FileFormat::IGES, options);
}

// ──────────────────────────────────────────────
// XDE import — shared STEP/IGES pipeline
// ──────────────────────────────────────────────

// Recursive helper: walk XDE assembly tree and collect leaf solids
static void collect_bodies(const Handle(XCAFDoc_ShapeTool)& shape_tool,
                           const TDF_Label& label,
                           const TopLoc_Location& parent_loc,
                           CadImporter& importer,
                           const ImportOptions& options,
                           ImportResult& result,
                           int& body_counter);

ImportResult CadImporter::import_xde(const std::string& file_path,
                                      FileFormat format,
                                      const ImportOptions& options) {
    ImportResult result;

    // Compute content hash first (works even if import fails)
    result.content_hash = compute_file_hash(file_path);
    if (result.content_hash.empty()) {
        result.success = false;
        result.error_message = "Failed to read file: " + file_path;
        return result;
    }

    // Create XDE application and document
    Handle(XCAFApp_Application) app = XCAFApp_Application::GetApplication();
    Handle(TDocStd_Document) doc;
    app->NewDocument("MDTV-XCAF", doc);

    bool read_ok = false;

    if (format == FileFormat::STEP) {
        STEPCAFControl_Reader reader;
        reader.SetNameMode(true);
        reader.SetColorMode(false);
        reader.SetLayerMode(false);
        reader.SetMatMode(false);

        IFSelect_ReturnStatus status = reader.ReadFile(file_path.c_str());
        if (status != IFSelect_RetDone) {
            result.success = false;
            result.error_message = "STEP reader failed to parse: " + file_path;
            app->Close(doc);
            return result;
        }

        read_ok = reader.Transfer(doc);
    } else {
        IGESCAFControl_Reader reader;
        reader.SetNameMode(true);
        reader.SetColorMode(false);
        reader.SetLayerMode(false);

        IFSelect_ReturnStatus status = reader.ReadFile(file_path.c_str());
        if (status != IFSelect_RetDone) {
            result.success = false;
            result.error_message = "IGES reader failed to parse: " + file_path;
            app->Close(doc);
            return result;
        }

        read_ok = reader.Transfer(doc);
    }

    if (!read_ok) {
        result.success = false;
        result.error_message = "XDE transfer failed for: " + file_path;
        app->Close(doc);
        return result;
    }

    // Get shape tool and walk free shapes (assembly roots)
    Handle(XCAFDoc_ShapeTool) shape_tool =
        XCAFDoc_DocumentTool::ShapeTool(doc->Main());

    TDF_LabelSequence free_shapes;
    shape_tool->GetFreeShapes(free_shapes);

    int body_counter = 0;
    TopLoc_Location identity;

    for (int i = 1; i <= free_shapes.Length(); ++i) {
        collect_bodies(shape_tool, free_shapes.Value(i), identity,
                       *this, options, result, body_counter);
    }

    if (result.bodies.empty()) {
        result.diagnostics.push_back("Warning: no solid bodies found in file");
    }

    result.success = true;
    app->Close(doc);
    return result;
}

// ──────────────────────────────────────────────
// Assembly tree walker
// ──────────────────────────────────────────────

static std::string get_label_name(const TDF_Label& label, int fallback_index) {
    Handle(TDataStd_Name) name_attr;
    if (label.FindAttribute(TDataStd_Name::GetID(), name_attr)) {
        TCollection_ExtendedString ext = name_attr->Get();
        // Convert to ASCII (safe for typical STEP names)
        std::string result;
        for (int i = 1; i <= ext.Length(); ++i) {
            Standard_ExtCharacter c = ext.Value(i);
            if (c < 128) {
                result += static_cast<char>(c);
            } else {
                result += '?';
            }
        }
        if (!result.empty()) return result;
    }
    return "Body_" + std::to_string(fallback_index);
}

static void extract_location(const TopLoc_Location& loc,
                              std::array<double, 3>& translation,
                              std::array<double, 4>& rotation) {
    if (loc.IsIdentity()) {
        translation = {0, 0, 0};
        rotation = {0, 0, 0, 1};
        return;
    }

    gp_Trsf trsf = loc.Transformation();
    gp_XYZ t = trsf.TranslationPart();
    translation = {t.X(), t.Y(), t.Z()};

    gp_Quaternion q = trsf.GetRotation();
    rotation = {q.X(), q.Y(), q.Z(), q.W()};
}

static void collect_bodies(const Handle(XCAFDoc_ShapeTool)& shape_tool,
                           const TDF_Label& label,
                           const TopLoc_Location& parent_loc,
                           CadImporter& importer,
                           const ImportOptions& options,
                           ImportResult& result,
                           int& body_counter) {
    // If this is a reference, resolve it and combine locations
    TDF_Label referred;
    if (shape_tool->IsReference(label)) {
        if (shape_tool->GetReferredShape(label, referred)) {
            // Component label carries placement; combine with parent
            TopoDS_Shape comp_shape = shape_tool->GetShape(label);
            TopLoc_Location combined = parent_loc * comp_shape.Location();
            collect_bodies(shape_tool, referred, combined, importer, options, result, body_counter);
        }
        return;
    }

    // If this is an assembly, recurse into components
    if (shape_tool->IsAssembly(label)) {
        TDF_LabelSequence components;
        shape_tool->GetComponents(label, components);
        for (int i = 1; i <= components.Length(); ++i) {
            collect_bodies(shape_tool, components.Value(i), parent_loc,
                           importer, options, result, body_counter);
        }
        return;
    }

    // Leaf shape — get the actual TopoDS_Shape
    TopoDS_Shape shape = shape_tool->GetShape(label);
    if (shape.IsNull()) return;

    // If it's a compound, iterate sub-solids
    if (shape.ShapeType() == TopAbs_COMPOUND) {
        int solids_before = static_cast<int>(result.bodies.size());
        for (TopExp_Explorer exp(shape, TopAbs_SOLID); exp.More(); exp.Next()) {
            body_counter++;
            BodyResult body;
            body.name = get_label_name(label, body_counter);
            extract_location(parent_loc, body.translation, body.rotation);
            body.mesh = importer.tessellate(exp.Current(), options.tessellation_quality);
            body.mass_properties = importer.compute_mass_properties(exp.Current(), options.density);
            result.bodies.push_back(std::move(body));
        }
        // If compound had no solids, tessellate the whole compound
        if (static_cast<int>(result.bodies.size()) == solids_before) {
            body_counter++;
            BodyResult body;
            body.name = get_label_name(label, body_counter);
            extract_location(parent_loc, body.translation, body.rotation);
            body.mesh = importer.tessellate(shape, options.tessellation_quality);
            body.mass_properties = importer.compute_mass_properties(shape, options.density);
            result.bodies.push_back(std::move(body));
        }
        return;
    }

    // Simple shape (solid, shell, etc.)
    body_counter++;
    BodyResult body;
    body.name = get_label_name(label, body_counter);
    extract_location(parent_loc, body.translation, body.rotation);
    body.mesh = importer.tessellate(shape, options.tessellation_quality);
    body.mass_properties = importer.compute_mass_properties(shape, options.density);
    result.bodies.push_back(std::move(body));
}

// ──────────────────────────────────────────────
// Tessellation
// ──────────────────────────────────────────────

MeshData CadImporter::tessellate(const TopoDS_Shape& shape, double quality) {
    MeshData mesh;

    BRepMesh_IncrementalMesh mesher(shape, quality);
    mesher.Perform();

    uint32_t vertex_offset = 0;

    for (TopExp_Explorer exp(shape, TopAbs_FACE); exp.More(); exp.Next()) {
        const TopoDS_Face& face = TopoDS::Face(exp.Current());
        TopLoc_Location loc;
        Handle(Poly_Triangulation) tri = BRep_Tool::Triangulation(face, loc);
        if (tri.IsNull()) continue;

        const gp_Trsf& trsf = loc.IsIdentity() ? gp_Trsf() : loc.Transformation();
        bool reversed = (face.Orientation() == TopAbs_REVERSED);

        int nb_nodes = tri->NbNodes();
        int nb_tris = tri->NbTriangles();

        // Extract vertices and normals
        for (int i = 1; i <= nb_nodes; ++i) {
            gp_Pnt p = tri->Node(i);
            if (!loc.IsIdentity()) {
                p.Transform(trsf);
            }
            mesh.vertices.push_back(static_cast<float>(p.X()));
            mesh.vertices.push_back(static_cast<float>(p.Y()));
            mesh.vertices.push_back(static_cast<float>(p.Z()));

            // Use face normal if available, otherwise zero
            if (tri->HasNormals()) {
                gp_Dir n = tri->Normal(i);
                if (!loc.IsIdentity()) {
                    n.Transform(trsf);
                }
                if (reversed) {
                    mesh.normals.push_back(static_cast<float>(-n.X()));
                    mesh.normals.push_back(static_cast<float>(-n.Y()));
                    mesh.normals.push_back(static_cast<float>(-n.Z()));
                } else {
                    mesh.normals.push_back(static_cast<float>(n.X()));
                    mesh.normals.push_back(static_cast<float>(n.Y()));
                    mesh.normals.push_back(static_cast<float>(n.Z()));
                }
            } else {
                mesh.normals.push_back(0.0f);
                mesh.normals.push_back(0.0f);
                mesh.normals.push_back(0.0f);
            }
        }

        // Extract triangles (OCCT uses 1-based per-face indexing)
        for (int i = 1; i <= nb_tris; ++i) {
            int n1, n2, n3;
            tri->Triangle(i).Get(n1, n2, n3);

            // Convert to 0-based global indices
            uint32_t i1 = vertex_offset + static_cast<uint32_t>(n1 - 1);
            uint32_t i2 = vertex_offset + static_cast<uint32_t>(n2 - 1);
            uint32_t i3 = vertex_offset + static_cast<uint32_t>(n3 - 1);

            if (reversed) {
                mesh.indices.push_back(i1);
                mesh.indices.push_back(i3);
                mesh.indices.push_back(i2);
            } else {
                mesh.indices.push_back(i1);
                mesh.indices.push_back(i2);
                mesh.indices.push_back(i3);
            }
        }

        vertex_offset += static_cast<uint32_t>(nb_nodes);
    }

    return mesh;
}

// ──────────────────────────────────────────────
// Mass properties
// ──────────────────────────────────────────────

MassPropertiesResult CadImporter::compute_mass_properties(const TopoDS_Shape& shape,
                                                           double density) {
    MassPropertiesResult props;

    GProp_GProps gprops;
    BRepGProp::VolumeProperties(shape, gprops);

    // GProp_GProps::Mass() returns VOLUME, not mass — common OCCT gotcha
    double volume_mm3 = gprops.Mass();

    if (volume_mm3 <= 0.0) {
        // Shape has no volume (e.g., shell or wire)
        return props;
    }

    // STEP files typically use mm; convert mm^3 → m^3, then multiply by density (kg/m^3)
    double volume_m3 = volume_mm3 * 1e-9;
    props.mass = volume_m3 * density;

    // Center of mass
    gp_Pnt com = gprops.CentreOfMass();
    props.center_of_mass = {com.X(), com.Y(), com.Z()};

    // Inertia matrix — scale by density (raw values are for unit density in mm)
    gp_Mat mat = gprops.MatrixOfInertia();
    double density_scale = density * 1e-9; // density applied to mm^3 volume
    props.inertia = {
        mat(1, 1) * density_scale,  // Ixx
        mat(2, 2) * density_scale,  // Iyy
        mat(3, 3) * density_scale,  // Izz
        -mat(1, 2) * density_scale, // Ixy (negated: OCCT gives products of inertia)
        -mat(1, 3) * density_scale, // Ixz
        -mat(2, 3) * density_scale  // Iyz
    };

    return props;
}

// ──────────────────────────────────────────────
// Content hash
// ──────────────────────────────────────────────

std::string CadImporter::compute_file_hash(const std::string& file_path) {
    std::ifstream f(file_path, std::ios::binary);
    if (!f.is_open()) return "";

    std::vector<unsigned char> bytes(
        (std::istreambuf_iterator<char>(f)),
        std::istreambuf_iterator<char>());

    return picosha2::hash256_hex_string(bytes);
}

} // namespace motionlab::engine
