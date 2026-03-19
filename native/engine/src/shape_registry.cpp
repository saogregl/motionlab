#include "shape_registry.h"

#include <TopoDS_Shape.hxx>

namespace motionlab::engine {

void ShapeRegistry::store(const std::string& body_id, const TopoDS_Shape& shape) {
    shapes_[body_id] = shape;
}

const TopoDS_Shape* ShapeRegistry::get(const std::string& body_id) const {
    auto it = shapes_.find(body_id);
    if (it == shapes_.end()) {
        return nullptr;
    }
    return &it->second;
}

void ShapeRegistry::remove(const std::string& body_id) {
    shapes_.erase(body_id);
}

void ShapeRegistry::clear() {
    shapes_.clear();
}

} // namespace motionlab::engine
