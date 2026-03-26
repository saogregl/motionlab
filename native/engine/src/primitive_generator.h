#pragma once

#include "cad_import.h"
#include "mechanism/mechanism.pb.h"

#include <memory>
#include <string>

class TopoDS_Shape;

namespace motionlab::engine {

struct PrimitiveResult {
    std::shared_ptr<TopoDS_Shape> brep_shape;
    MeshData mesh;
    MassPropertiesResult mass_properties;
    uint32_t face_count = 0;
    bool success = false;
    std::string error_message;
};

/// Generate a B-Rep solid + tessellation + mass properties for a primitive shape.
/// The shape is centered at the origin; the caller applies position as body pose.
/// Dimensions in meters. Zero/negative dimensions are replaced with defaults.
PrimitiveResult generate_primitive(
    motionlab::mechanism::PrimitiveShape shape,
    const motionlab::mechanism::PrimitiveParams& params,
    double density = 1000.0,
    double tessellation_quality = 0.1);

}  // namespace motionlab::engine
