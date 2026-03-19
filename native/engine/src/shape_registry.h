#pragma once

#include <string>
#include <unordered_map>

#include <TopoDS_Shape.hxx>

namespace motionlab::engine {

class ShapeRegistry {
public:
    void store(const std::string& body_id, const TopoDS_Shape& shape);
    const TopoDS_Shape* get(const std::string& body_id) const;
    void remove(const std::string& body_id);
    void clear();

private:
    std::unordered_map<std::string, TopoDS_Shape> shapes_;
};

} // namespace motionlab::engine
