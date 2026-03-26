#include "primitive_generator.h"

#include <spdlog/spdlog.h>

// Suppress MSVC warnings from OCCT headers
#ifdef _MSC_VER
#pragma warning(push)
#pragma warning(disable : 4267 4244 4996 4458 4100)
#endif

#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepPrimAPI_MakeSphere.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Ax2.hxx>
#include <gp_Pnt.hxx>
#include <gp_Trsf.hxx>

#ifdef _MSC_VER
#pragma warning(pop)
#endif

namespace motionlab::engine {

namespace {

// Default dimensions (meters)
constexpr double DEFAULT_BOX_WIDTH  = 0.1;
constexpr double DEFAULT_BOX_HEIGHT = 0.1;
constexpr double DEFAULT_BOX_DEPTH  = 0.1;
constexpr double DEFAULT_CYLINDER_RADIUS = 0.05;
constexpr double DEFAULT_CYLINDER_HEIGHT = 0.1;
constexpr double DEFAULT_SPHERE_RADIUS   = 0.05;

double positive_or(double v, double fallback) {
    return (v > 0.0) ? v : fallback;
}

uint32_t count_faces(const TopoDS_Shape& shape) {
    uint32_t count = 0;
    for (TopExp_Explorer exp(shape, TopAbs_FACE); exp.More(); exp.Next()) {
        ++count;
    }
    return count;
}

TopoDS_Shape make_box(double w, double h, double d) {
    // BRepPrimAPI_MakeBox places one corner at origin.
    // Use gp_Pnt(-w/2, -h/2, -d/2) so the box is centered at origin.
    return BRepPrimAPI_MakeBox(gp_Pnt(-w / 2.0, -h / 2.0, -d / 2.0), w, h, d).Shape();
}

TopoDS_Shape make_cylinder(double radius, double height) {
    // BRepPrimAPI_MakeCylinder creates along Z axis with base at origin.
    // Shift down by -h/2 so cylinder is centered vertically at origin.
    gp_Ax2 axis(gp_Pnt(0, 0, -height / 2.0), gp_Dir(0, 0, 1));
    return BRepPrimAPI_MakeCylinder(axis, radius, height).Shape();
}

TopoDS_Shape make_sphere(double radius) {
    // BRepPrimAPI_MakeSphere is already centered at origin.
    return BRepPrimAPI_MakeSphere(radius).Shape();
}

}  // namespace

PrimitiveResult generate_primitive(
    motionlab::mechanism::PrimitiveShape shape,
    const motionlab::mechanism::PrimitiveParams& params,
    double density,
    double tessellation_quality)
{
    PrimitiveResult result;

    if (density <= 0.0) density = 1000.0;
    if (tessellation_quality <= 0.0) tessellation_quality = 0.1;

    TopoDS_Shape brep;

    try {
        switch (shape) {
            case motionlab::mechanism::PRIMITIVE_SHAPE_BOX: {
                double w = DEFAULT_BOX_WIDTH;
                double h = DEFAULT_BOX_HEIGHT;
                double d = DEFAULT_BOX_DEPTH;
                if (params.has_box()) {
                    w = positive_or(params.box().width(), DEFAULT_BOX_WIDTH);
                    h = positive_or(params.box().height(), DEFAULT_BOX_HEIGHT);
                    d = positive_or(params.box().depth(), DEFAULT_BOX_DEPTH);
                }
                brep = make_box(w, h, d);
                break;
            }
            case motionlab::mechanism::PRIMITIVE_SHAPE_CYLINDER: {
                double r = DEFAULT_CYLINDER_RADIUS;
                double h = DEFAULT_CYLINDER_HEIGHT;
                if (params.has_cylinder()) {
                    r = positive_or(params.cylinder().radius(), DEFAULT_CYLINDER_RADIUS);
                    h = positive_or(params.cylinder().height(), DEFAULT_CYLINDER_HEIGHT);
                }
                brep = make_cylinder(r, h);
                break;
            }
            case motionlab::mechanism::PRIMITIVE_SHAPE_SPHERE: {
                double r = DEFAULT_SPHERE_RADIUS;
                if (params.has_sphere()) {
                    r = positive_or(params.sphere().radius(), DEFAULT_SPHERE_RADIUS);
                }
                brep = make_sphere(r);
                break;
            }
            default:
                result.error_message = "Unknown primitive shape type";
                return result;
        }
    } catch (const Standard_Failure& e) {
        result.error_message = std::string("OCCT primitive creation failed: ") + e.what();
        return result;
    }

    if (brep.IsNull()) {
        result.error_message = "Primitive B-Rep creation returned null shape";
        return result;
    }

    // Tessellate and compute mass using existing CadImporter methods
    CadImporter importer;

    try {
        result.mesh = importer.tessellate(brep, tessellation_quality);
    } catch (const std::exception& e) {
        result.error_message = std::string("Primitive tessellation failed: ") + e.what();
        return result;
    }

    try {
        // Primitives are in meters — no unit scaling needed
        result.mass_properties = importer.compute_mass_properties(brep, density);
    } catch (const std::exception& e) {
        result.error_message = std::string("Primitive mass computation failed: ") + e.what();
        return result;
    }

    result.brep_shape = std::make_shared<TopoDS_Shape>(brep);
    result.face_count = count_faces(brep);
    result.success = true;

    spdlog::debug("Generated primitive: faces={}, vertices={}, mass={:.4f} kg",
                  result.face_count,
                  result.mesh.vertices.size() / 3,
                  result.mass_properties.mass);

    return result;
}

}  // namespace motionlab::engine
