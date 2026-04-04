#include "face_metadata_cache.h"

#include <TopAbs_ShapeEnum.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS_Shape.hxx>

namespace motionlab::engine {

namespace {

void apply_length_scale(FaceDatumPose* pose, double length_scale) {
    for (double& component : pose->position) {
        component *= length_scale;
    }
    if (pose->radius.has_value()) {
        *pose->radius *= length_scale;
    }
    if (pose->secondary_radius.has_value()) {
        *pose->secondary_radius *= length_scale;
    }
}

} // namespace

bool FaceMetadataCache::has_geometry(const std::string& geometry_id) const {
    return entries_.find(geometry_id) != entries_.end();
}

bool FaceMetadataCache::prepare_geometry(const std::string& geometry_id,
                                         const TopoDS_Shape& shape,
                                         double length_scale,
                                         std::string* error_message) {
    if (has_geometry(geometry_id)) {
        return true;
    }

    TopTools_IndexedMapOfShape faces;
    TopExp::MapShapes(shape, TopAbs_FACE, faces);

    std::vector<FaceDatumPose> prepared_faces;
    prepared_faces.reserve(static_cast<size_t>(faces.Extent()));

    for (int face_index = 0; face_index < faces.Extent(); ++face_index) {
        auto pose = classify_face_for_datum(shape, static_cast<uint32_t>(face_index));
        if (!pose.has_value()) {
            if (error_message) {
                *error_message = "Failed to classify face metadata for geometry: " + geometry_id;
            }
            return false;
        }
        apply_length_scale(&pose.value(), length_scale);
        prepared_faces.push_back(*pose);
    }

    entries_[geometry_id] = std::move(prepared_faces);
    return true;
}

const FaceDatumPose* FaceMetadataCache::get_face_pose(const std::string& geometry_id,
                                                      uint32_t face_index) const {
    const auto entry_it = entries_.find(geometry_id);
    if (entry_it == entries_.end()) {
        return nullptr;
    }
    const auto& prepared_faces = entry_it->second;
    if (face_index >= prepared_faces.size()) {
        return nullptr;
    }
    return &prepared_faces[face_index];
}

void FaceMetadataCache::invalidate_geometry(const std::string& geometry_id) {
    entries_.erase(geometry_id);
}

void FaceMetadataCache::clear() {
    entries_.clear();
}

} // namespace motionlab::engine
