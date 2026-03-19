#include "face_classifier.h"

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
#include <gp_Vec.hxx>

namespace motionlab::engine {

namespace {

gp_Dir reverse_dir(const gp_Dir& dir) {
    return gp_Dir(-dir.X(), -dir.Y(), -dir.Z());
}

gp_Dir choose_reference_up(const gp_Dir& z_axis) {
    const double dot_up = std::abs(z_axis.Dot(gp_Dir(0.0, 1.0, 0.0)));
    if (dot_up > 0.99) {
        return gp_Dir(1.0, 0.0, 0.0);
    }
    return gp_Dir(0.0, 1.0, 0.0);
}

std::array<double, 4> quaternion_from_axes(const gp_Dir& x_axis,
                                           const gp_Dir& y_axis,
                                           const gp_Dir& z_axis) {
    const double m00 = x_axis.X();
    const double m01 = y_axis.X();
    const double m02 = z_axis.X();
    const double m10 = x_axis.Y();
    const double m11 = y_axis.Y();
    const double m12 = z_axis.Y();
    const double m20 = x_axis.Z();
    const double m21 = y_axis.Z();
    const double m22 = z_axis.Z();

    const double trace = m00 + m11 + m22;
    double qw = 1.0;
    double qx = 0.0;
    double qy = 0.0;
    double qz = 0.0;

    if (trace > 0.0) {
        const double s = std::sqrt(trace + 1.0) * 2.0;
        qw = 0.25 * s;
        qx = (m21 - m12) / s;
        qy = (m02 - m20) / s;
        qz = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
        const double s = std::sqrt(1.0 + m00 - m11 - m22) * 2.0;
        qw = (m21 - m12) / s;
        qx = 0.25 * s;
        qy = (m01 + m10) / s;
        qz = (m02 + m20) / s;
    } else if (m11 > m22) {
        const double s = std::sqrt(1.0 + m11 - m00 - m22) * 2.0;
        qw = (m02 - m20) / s;
        qx = (m01 + m10) / s;
        qy = 0.25 * s;
        qz = (m12 + m21) / s;
    } else {
        const double s = std::sqrt(1.0 + m22 - m00 - m11) * 2.0;
        qw = (m10 - m01) / s;
        qx = (m02 + m20) / s;
        qy = (m12 + m21) / s;
        qz = 0.25 * s;
    }

    const double length = std::sqrt(qw * qw + qx * qx + qy * qy + qz * qz);
    if (length <= Precision::Confusion()) {
        return {1.0, 0.0, 0.0, 0.0};
    }

    return {qw / length, qx / length, qy / length, qz / length};
}

std::array<double, 4> quaternion_from_z(const gp_Dir& z_axis) {
    gp_Dir ref = choose_reference_up(z_axis);
    gp_Vec x_vec = gp_Vec(ref).Crossed(gp_Vec(z_axis));
    if (x_vec.Magnitude() <= Precision::Confusion()) {
        ref = gp_Dir(1.0, 0.0, 0.0);
        x_vec = gp_Vec(ref).Crossed(gp_Vec(z_axis));
    }
    x_vec.Normalize();
    gp_Dir x_axis(x_vec);

    gp_Vec y_vec = gp_Vec(z_axis).Crossed(gp_Vec(x_axis));
    y_vec.Normalize();
    gp_Dir y_axis(y_vec);

    return quaternion_from_axes(x_axis, y_axis, z_axis);
}

gp_Dir oriented_normal(const TopoDS_Face& face, const gp_Dir& normal) {
    return face.Orientation() == TopAbs_REVERSED ? reverse_dir(normal) : normal;
}

gp_Dir midpoint_normal(const TopoDS_Face& face,
                       BRepAdaptor_Surface& surface,
                       double u,
                       double v) {
    gp_Pnt point;
    gp_Vec du;
    gp_Vec dv;
    surface.D1(u, v, point, du, dv);

    gp_Vec normal = du.Crossed(dv);
    if (normal.Magnitude() <= Precision::Confusion()) {
        return gp_Dir(0.0, 0.0, 1.0);
    }
    if (face.Orientation() == TopAbs_REVERSED) {
        normal.Reverse();
    }
    normal.Normalize();
    return gp_Dir(normal);
}

void set_position(double (&out)[3], const gp_Pnt& point) {
    out[0] = point.X();
    out[1] = point.Y();
    out[2] = point.Z();
}

} // namespace

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
            return result;
        }

        case GeomAbs_Cone: {
            const gp_Cone cone = surface.Cone();
            set_position(result.position, cone.Apex());
            const auto orientation = quaternion_from_z(cone.Axis().Direction());
            std::copy(orientation.begin(), orientation.end(), result.orientation);
            result.surface_class = FaceDatumSurfaceClass::Conical;
            return result;
        }

        case GeomAbs_Sphere: {
            const gp_Sphere sphere = surface.Sphere();
            set_position(result.position, sphere.Location());
            result.surface_class = FaceDatumSurfaceClass::Spherical;
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
