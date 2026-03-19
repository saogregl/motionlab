#pragma once

#include <cstdint>
#include <optional>

class TopoDS_Shape;

namespace motionlab::engine {

enum class FaceDatumSurfaceClass {
    Planar,
    Cylindrical,
    Conical,
    Spherical,
    Other
};

struct FaceDatumPose {
    FaceDatumSurfaceClass surface_class = FaceDatumSurfaceClass::Other;
    double position[3] = {0.0, 0.0, 0.0};
    double orientation[4] = {1.0, 0.0, 0.0, 0.0}; // w, x, y, z
};

std::optional<FaceDatumPose> classify_face_for_datum(const TopoDS_Shape& body_shape,
                                                     uint32_t face_index);

} // namespace motionlab::engine
