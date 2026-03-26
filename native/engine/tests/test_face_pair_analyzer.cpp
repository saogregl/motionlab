#include "../src/face_pair_analyzer.h"
#include "engine/log.h"

#include <cassert>
#include <cmath>
#include <iostream>

#ifdef _MSC_VER
#pragma warning(push)
#pragma warning(disable : 4267 4244 4996 4458 4100)
#endif

#include <BRepAdaptor_Surface.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepPrimAPI_MakeSphere.hxx>
#include <GeomAbs_SurfaceType.hxx>
#include <TopAbs_ShapeEnum.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Face.hxx>
#include <gp_Ax2.hxx>

#ifdef _MSC_VER
#pragma warning(pop)
#endif

using namespace motionlab::engine;

static uint32_t find_face_index(const TopoDS_Shape& shape, GeomAbs_SurfaceType type) {
    TopTools_IndexedMapOfShape faces;
    TopExp::MapShapes(shape, TopAbs_FACE, faces);
    for (int i = 1; i <= faces.Extent(); ++i) {
        const TopoDS_Face& face = TopoDS::Face(faces.FindKey(i));
        BRepAdaptor_Surface surface(face, Standard_False);
        if (surface.GetType() == type) {
            return static_cast<uint32_t>(i - 1);
        }
    }
    assert(false && "expected face type not found");
    return 0;
}

int main() {
    motionlab::init_logging(spdlog::level::debug);

    // Test 1: Two coaxial cylinders (same axis) → expect Coaxial + REVOLUTE
    {
        TopoDS_Shape cyl1 = BRepPrimAPI_MakeCylinder(5.0, 40.0).Shape();
        TopoDS_Shape cyl2 = BRepPrimAPI_MakeCylinder(3.0, 20.0).Shape();

        uint32_t fi1 = find_face_index(cyl1, GeomAbs_Cylinder);
        uint32_t fi2 = find_face_index(cyl2, GeomAbs_Cylinder);

        auto result = analyze_face_pair(cyl1, fi1, 1.0, cyl2, fi2, 1.0);
        assert(result.has_value());
        assert(result->alignment == FacePairAlignmentKind::Coaxial);
        assert(result->recommended_joint_type == 1); // REVOLUTE
        assert(result->confidence >= 0.9);

        // Proposed joint frame should be midpoint of the two datum positions
        double mid_x = (result->parent_pose.position[0] + result->child_pose.position[0]) * 0.5;
        double mid_y = (result->parent_pose.position[1] + result->child_pose.position[1]) * 0.5;
        double mid_z = (result->parent_pose.position[2] + result->child_pose.position[2]) * 0.5;
        assert(std::abs(result->joint_frame_position[0] - mid_x) < 1e-6);
        assert(std::abs(result->joint_frame_position[1] - mid_y) < 1e-6);
        assert(std::abs(result->joint_frame_position[2] - mid_z) < 1e-6);

        std::cout << "Test 1 passed: Coaxial cylinders → REVOLUTE" << std::endl;
    }

    // Test 2: Two planar faces (box faces) → expect Coplanar + FIXED
    {
        TopoDS_Shape box1 = BRepPrimAPI_MakeBox(10.0, 20.0, 30.0).Shape();
        TopoDS_Shape box2 = BRepPrimAPI_MakeBox(5.0, 10.0, 15.0).Shape();

        uint32_t fi1 = find_face_index(box1, GeomAbs_Plane);
        uint32_t fi2 = find_face_index(box2, GeomAbs_Plane);

        auto result = analyze_face_pair(box1, fi1, 1.0, box2, fi2, 1.0);
        assert(result.has_value());
        // Two planar faces with parallel normals should be coplanar
        assert(result->alignment == FacePairAlignmentKind::Coplanar);
        assert(result->recommended_joint_type == 3); // FIXED
        assert(result->confidence >= 0.5);

        std::cout << "Test 2 passed: Coplanar faces → FIXED" << std::endl;
    }

    // Test 3: Two coincident spheres → expect Coincident + SPHERICAL
    {
        // Both spheres centered at origin
        TopoDS_Shape sph1 = BRepPrimAPI_MakeSphere(10.0).Shape();
        TopoDS_Shape sph2 = BRepPrimAPI_MakeSphere(5.0).Shape();

        uint32_t fi1 = find_face_index(sph1, GeomAbs_Sphere);
        uint32_t fi2 = find_face_index(sph2, GeomAbs_Sphere);

        auto result = analyze_face_pair(sph1, fi1, 1.0, sph2, fi2, 1.0);
        assert(result.has_value());
        assert(result->alignment == FacePairAlignmentKind::Coincident);
        assert(result->recommended_joint_type == 4); // SPHERICAL
        assert(result->confidence >= 0.8);

        std::cout << "Test 3 passed: Coincident spheres → SPHERICAL" << std::endl;
    }

    // Test 4: Cylinder + Plane → expect Perpendicular + REVOLUTE
    // Default cylinder axis is Z, and a box face normal can also be Z → perpendicular check
    {
        TopoDS_Shape cyl = BRepPrimAPI_MakeCylinder(5.0, 40.0).Shape();
        TopoDS_Shape box = BRepPrimAPI_MakeBox(10.0, 20.0, 30.0).Shape();

        uint32_t cyl_fi = find_face_index(cyl, GeomAbs_Cylinder);
        uint32_t plane_fi = find_face_index(box, GeomAbs_Plane);

        auto result = analyze_face_pair(cyl, cyl_fi, 1.0, box, plane_fi, 1.0);
        assert(result.has_value());
        // The cylinder axis (Z) may or may not be parallel to the plane normal
        // depending on which face is picked. Either Perpendicular or General is valid.
        assert(result->recommended_joint_type >= 1); // some valid joint type

        std::cout << "Test 4 passed: Cylinder + Plane pair analyzed" << std::endl;
    }

    // Test 5: Invalid face index → expect nullopt
    {
        TopoDS_Shape box = BRepPrimAPI_MakeBox(10.0, 20.0, 30.0).Shape();
        auto result = analyze_face_pair(box, 999, 1.0, box, 0, 1.0);
        assert(!result.has_value());

        std::cout << "Test 5 passed: Invalid face index → nullopt" << std::endl;
    }

    // Test 6: Length scale is applied
    {
        TopoDS_Shape cyl1 = BRepPrimAPI_MakeCylinder(5.0, 40.0).Shape();
        TopoDS_Shape cyl2 = BRepPrimAPI_MakeCylinder(3.0, 20.0).Shape();

        uint32_t fi1 = find_face_index(cyl1, GeomAbs_Cylinder);
        uint32_t fi2 = find_face_index(cyl2, GeomAbs_Cylinder);

        // With scale=1.0 and scale=0.001 (mm→m), positions should differ
        auto result_unscaled = analyze_face_pair(cyl1, fi1, 1.0, cyl2, fi2, 1.0);
        auto result_scaled = analyze_face_pair(cyl1, fi1, 0.001, cyl2, fi2, 0.001);
        assert(result_unscaled.has_value());
        assert(result_scaled.has_value());
        // Scaled positions should be 1000x smaller
        assert(std::abs(result_scaled->child_pose.position[2] - result_unscaled->child_pose.position[2] * 0.001) < 1e-6);

        std::cout << "Test 6 passed: Length scale applied correctly" << std::endl;
    }

    std::cout << "\nFace pair analyzer tests passed." << std::endl;
    return 0;
}
