#pragma once

#include <array>
#include <cmath>

#include <BRepAdaptor_Surface.hxx>
#include <Precision.hxx>
#include <TopAbs_Orientation.hxx>
#include <TopoDS_Face.hxx>
#include <gp_Dir.hxx>
#include <gp_Pnt.hxx>
#include <gp_Vec.hxx>

namespace motionlab::engine {

inline gp_Dir reverse_dir(const gp_Dir& dir) {
    return gp_Dir(-dir.X(), -dir.Y(), -dir.Z());
}

inline gp_Dir choose_reference_up(const gp_Dir& z_axis) {
    const double dot_up = std::abs(z_axis.Dot(gp_Dir(0.0, 1.0, 0.0)));
    if (dot_up > 0.99) {
        return gp_Dir(1.0, 0.0, 0.0);
    }
    return gp_Dir(0.0, 1.0, 0.0);
}

inline std::array<double, 4> quaternion_from_axes(const gp_Dir& x_axis,
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

inline std::array<double, 4> quaternion_from_z(const gp_Dir& z_axis) {
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

inline gp_Dir oriented_normal(const TopoDS_Face& face, const gp_Dir& normal) {
    return face.Orientation() == TopAbs_REVERSED ? reverse_dir(normal) : normal;
}

inline gp_Dir midpoint_normal(const TopoDS_Face& face,
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

inline void set_position(double (&out)[3], const gp_Pnt& point) {
    out[0] = point.X();
    out[1] = point.Y();
    out[2] = point.Z();
}

} // namespace motionlab::engine
