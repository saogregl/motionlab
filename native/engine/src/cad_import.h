#pragma once

#include <array>
#include <cstdint>
#include <string>
#include <vector>

// Forward-declare OCCT types to avoid header leak
class TopoDS_Shape;

namespace motionlab::engine {

// ──────────────────────────────────────────────
// Data structures
// ──────────────────────────────────────────────

struct MeshData {
    std::vector<float> vertices;   // flat xyz
    std::vector<uint32_t> indices;
    std::vector<float> normals;    // flat xyz, same count as vertices
};

struct MassPropertiesResult {
    double mass = 0.0;
    std::array<double, 3> center_of_mass = {0, 0, 0};
    // Ixx, Iyy, Izz, Ixy, Ixz, Iyz
    std::array<double, 6> inertia = {0, 0, 0, 0, 0, 0};
};

struct BodyResult {
    std::string name;
    MeshData mesh;
    MassPropertiesResult mass_properties;
    std::array<double, 3> translation = {0, 0, 0};
    std::array<double, 4> rotation = {0, 0, 0, 1}; // quaternion x,y,z,w
};

struct ImportOptions {
    double density = 1000.0;             // kg/m^3
    double tessellation_quality = 0.1;   // BRepMesh linear deflection
};

struct ImportResult {
    std::vector<BodyResult> bodies;
    std::string content_hash;            // SHA-256 hex (64 chars)
    std::vector<std::string> diagnostics;
    bool success = false;
    std::string error_message;
};

// ──────────────────────────────────────────────
// CadImporter — constructed per-import, no persistent state
// ──────────────────────────────────────────────

class CadImporter {
public:
    ImportResult import_step(const std::string& file_path,
                             const ImportOptions& options = {});

    ImportResult import_iges(const std::string& file_path,
                             const ImportOptions& options = {});

    // Public for use by assembly tree walker (internal code only)
    MeshData tessellate(const TopoDS_Shape& shape, double quality);
    MassPropertiesResult compute_mass_properties(const TopoDS_Shape& shape,
                                                  double density);

private:
    enum class FileFormat { STEP, IGES };

    ImportResult import_xde(const std::string& file_path,
                            FileFormat format,
                            const ImportOptions& options);

    std::string compute_file_hash(const std::string& file_path);
};

} // namespace motionlab::engine
