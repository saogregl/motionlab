#include "face_classifier.h"
#include "geometry_helpers.h"

#include <algorithm>
#include <array>
#include <cmath>

#include <BRepAdaptor_Surface.hxx>
#include <BRepGProp.hxx>
#include <BRepTools.hxx>
#include <GProp_GProps.hxx>
#include <GeomAbs_SurfaceType.hxx>
#include <Precision.hxx>
#include <TopAbs_Orientation.hxx>
#include <TopAbs_ShapeEnum.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Shape.hxx>
#include <gp_Cone.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Dir.hxx>
#include <gp_Pnt.hxx>
#include <gp_Sphere.hxx>
#include <gp_Torus.hxx>
#include <gp_Vec.hxx>

namespace motionlab::engine {

std::optional<FaceDatumPose> classify_face_for_datum(const TopoDS_Shape& body_shape,
                                                     uint32_t face_index) {
    TopTools_IndexedMapOfShape faces;
    TopExp::MapShapes(body_shape, TopAbs_FACE, faces);
    if (face_index >= static_cast<uint32_t>(faces.Extent())) {
        return std::nullopt;
    }

    const TopoDS_Face& face = TopoDS::Face(faces.FindKey(static_cast<int>(face_index) + 1));
    BRepAdaptor_Surface surface(face, Standard_False);

    double u_min = 0.0;
    double u_max = 0.0;
    double v_min = 0.0;
    double v_max = 0.0;
    BRepTools::UVBounds(face, u_min, u_max, v_min, v_max);
    const double mid_u = (u_min + u_max) * 0.5;
    const double mid_v = (v_min + v_max) * 0.5;

    FaceDatumPose result{};

    switch (surface.GetType()) {
        case GeomAbs_Plane: {
            GProp_GProps props;
            BRepGProp::SurfaceProperties(face, props);
            gp_Pnt centroid = props.CentreOfMass();
            set_position(result.position, centroid);
            const gp_Dir normal = oriented_normal(face, surface.Plane().Axis().Direction());
            const auto orientation = quaternion_from_z(normal);
            std::copy(orientation.begin(), orientation.end(), result.orientation);
            result.surface_class = FaceDatumSurfaceClass::Planar;
            result.normal = {normal.X(), normal.Y(), normal.Z()};
            return result;
        }

        case GeomAbs_Cylinder: {
            const gp_Cylinder cylinder = surface.Cylinder();
            const gp_Pnt midpoint = surface.Value(mid_u, mid_v);
            const gp_Pnt axis_origin = cylinder.Axis().Location();
            const gp_Dir axis_dir = cylinder.Axis().Direction();
            const gp_Vec to_mid(axis_origin, midpoint);
            const double axis_t = to_mid.Dot(gp_Vec(axis_dir));
            const gp_Pnt axis_center = axis_origin.Translated(gp_Vec(axis_dir) * axis_t);
            set_position(result.position, axis_center);
            const auto orientation = quaternion_from_z(axis_dir);
            std::copy(orientation.begin(), orientation.end(), result.orientation);
            result.surface_class = FaceDatumSurfaceClass::Cylindrical;
            result.axis_direction = {axis_dir.X(), axis_dir.Y(), axis_dir.Z()};
            result.radius = cylinder.Radius();
            return result;
        }

        case GeomAbs_Cone: {
            const gp_Cone cone = surface.Cone();
            set_position(result.position, cone.Apex());
            const gp_Dir cone_dir = cone.Axis().Direction();
            const auto orientation = quaternion_from_z(cone_dir);
            std::copy(orientation.begin(), orientation.end(), result.orientation);
            result.surface_class = FaceDatumSurfaceClass::Conical;
            result.axis_direction = {cone_dir.X(), cone_dir.Y(), cone_dir.Z()};
            result.radius = cone.RefRadius();
            result.semi_angle = cone.SemiAngle();
            return result;
        }

        case GeomAbs_Sphere: {
            const gp_Sphere sphere = surface.Sphere();
            set_position(result.position, sphere.Location());
            result.surface_class = FaceDatumSurfaceClass::Spherical;
            result.radius = sphere.Radius();
            return result;
        }

        case GeomAbs_Torus: {
            const gp_Torus torus = surface.Torus();
            set_position(result.position, torus.Location());
            const gp_Dir torus_dir = torus.Axis().Direction();
            const auto orientation = quaternion_from_z(torus_dir);
            std::copy(orientation.begin(), orientation.end(), result.orientation);
            result.surface_class = FaceDatumSurfaceClass::Toroidal;
            result.axis_direction = {torus_dir.X(), torus_dir.Y(), torus_dir.Z()};
            result.radius = torus.MajorRadius();
            result.secondary_radius = torus.MinorRadius();
            return result;
        }

        default: {
            const gp_Pnt midpoint = surface.Value(mid_u, mid_v);
            set_position(result.position, midpoint);
            const gp_Dir normal = midpoint_normal(face, surface, mid_u, mid_v);
            const auto orientation = quaternion_from_z(normal);
            std::copy(orientation.begin(), orientation.end(), result.orientation);
            result.surface_class = FaceDatumSurfaceClass::Other;
            return result;
        }
    }
}

} // namespace motionlab::engine
