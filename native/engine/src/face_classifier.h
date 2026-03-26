#pragma once

#include <array>
#include <cstdint>
#include <optional>

class TopoDS_Shape;

namespace motionlab::engine {

enum class FaceDatumSurfaceClass {
    Planar,
    Cylindrical,
    Conical,
    Spherical,
    Toroidal,
    Other
};

struct FaceDatumPose {
    FaceDatumSurfaceClass surface_class = FaceDatumSurfaceClass::Other;
    double position[3] = {0.0, 0.0, 0.0};
    double orientation[4] = {1.0, 0.0, 0.0, 0.0}; // w, x, y, z

    // Enriched geometry from B-Rep surface
    std::optional<std::array<double, 3>> axis_direction;   // Cylindrical, conical, toroidal
    std::optional<std::array<double, 3>> normal;            // Planar
    std::optional<double> radius;                           // Primary radius
    std::optional<double> secondary_radius;                 // Torus minor
    std::optional<double> semi_angle;                       // Cone half-angle
};

std::optional<FaceDatumPose> classify_face_for_datum(const TopoDS_Shape& body_shape,
                                                     uint32_t face_index);

} // namespace motionlab::engine
