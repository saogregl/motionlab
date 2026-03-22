#include "../src/face_classifier.h"
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
#include <BRepPrimAPI_MakeCone.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepPrimAPI_MakeSphere.hxx>
#include <BRepPrimAPI_MakeTorus.hxx>
#include <GeomAbs_SurfaceType.hxx>
#include <TopAbs_ShapeEnum.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Face.hxx>

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

static void assert_unit_quaternion(const double (&orientation)[4]) {
    const double len = std::sqrt(
        orientation[0] * orientation[0] +
        orientation[1] * orientation[1] +
        orientation[2] * orientation[2] +
        orientation[3] * orientation[3]);
    assert(std::abs(len - 1.0) < 1e-6);
}

int main() {
    motionlab::init_logging(spdlog::level::debug);
    {
        TopoDS_Shape box = BRepPrimAPI_MakeBox(10.0, 20.0, 30.0).Shape();
        auto pose = classify_face_for_datum(box, find_face_index(box, GeomAbs_Plane));
        assert(pose.has_value());
        assert(pose->surface_class == FaceDatumSurfaceClass::Planar);
        assert_unit_quaternion(pose->orientation);
    }

    {
        TopoDS_Shape cylinder = BRepPrimAPI_MakeCylinder(5.0, 40.0).Shape();
        auto pose = classify_face_for_datum(cylinder, find_face_index(cylinder, GeomAbs_Cylinder));
        assert(pose.has_value());
        assert(pose->surface_class == FaceDatumSurfaceClass::Cylindrical);
        assert(std::abs(pose->position[0]) < 1e-6);
        assert(std::abs(pose->position[1]) < 1e-6);
        assert_unit_quaternion(pose->orientation);
    }

    {
        TopoDS_Shape cone = BRepPrimAPI_MakeCone(8.0, 2.0, 25.0).Shape();
        auto pose = classify_face_for_datum(cone, find_face_index(cone, GeomAbs_Cone));
        assert(pose.has_value());
        assert(pose->surface_class == FaceDatumSurfaceClass::Conical);
        assert_unit_quaternion(pose->orientation);
    }

    {
        TopoDS_Shape sphere = BRepPrimAPI_MakeSphere(12.0).Shape();
        auto pose = classify_face_for_datum(sphere, find_face_index(sphere, GeomAbs_Sphere));
        assert(pose.has_value());
        assert(pose->surface_class == FaceDatumSurfaceClass::Spherical);
        assert(std::abs(pose->position[0]) < 1e-6);
        assert(std::abs(pose->position[1]) < 1e-6);
        assert(std::abs(pose->position[2]) < 1e-6);
        assert(std::abs(pose->orientation[0] - 1.0) < 1e-6);
    }

    {
        TopoDS_Shape torus = BRepPrimAPI_MakeTorus(20.0, 4.0).Shape();
        auto pose = classify_face_for_datum(torus, find_face_index(torus, GeomAbs_Torus));
        assert(pose.has_value());
        assert(pose->surface_class == FaceDatumSurfaceClass::Other);
        assert_unit_quaternion(pose->orientation);
    }

    std::cout << "Face classifier tests passed." << std::endl;
    return 0;
}
