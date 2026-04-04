#pragma once

#include "face_classifier.h"

#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

class TopoDS_Shape;

namespace motionlab::engine {

class FaceMetadataCache {
public:
    bool has_geometry(const std::string& geometry_id) const;
    bool prepare_geometry(const std::string& geometry_id,
                          const TopoDS_Shape& shape,
                          double length_scale,
                          std::string* error_message = nullptr);
    const FaceDatumPose* get_face_pose(const std::string& geometry_id, uint32_t face_index) const;
    void invalidate_geometry(const std::string& geometry_id);
    void clear();

private:
    std::unordered_map<std::string, std::vector<FaceDatumPose>> entries_;
};

} // namespace motionlab::engine
