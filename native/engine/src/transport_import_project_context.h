#pragma once

#include "asset_cache.h"
#include "cad_import.h"
#include "engine/log.h"
#include "mechanism_state.h"
#include "shape_registry.h"
#include "uuid.h"

#include <ixwebsocket/IXWebSocket.h>
#include "mechanism/mechanism.pb.h"
#include "protocol/transport.pb.h"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <ctime>
#include <filesystem>
#include <functional>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace motionlab::transport_detail {

class ImportProjectContext {
public:
    using SendEventFn = std::function<void(ix::WebSocket&, const protocol::Event&)>;
    using StopRuntimeFn = std::function<void()>;

    ImportProjectContext(engine::MechanismState& mechanism_state,
                         engine::ShapeRegistry& shape_registry,
                         const std::filesystem::path& cache_dir);

    void handle_import_asset(ix::WebSocket& ws,
                             uint64_t sequence_id,
                             const protocol::ImportAssetCommand& cmd,
                             const SendEventFn& send_event);

    void handle_save_project(ix::WebSocket& ws,
                             uint64_t sequence_id,
                             const protocol::SaveProjectCommand& cmd,
                             const SendEventFn& send_event,
                             const StopRuntimeFn& stop_runtime);

    void handle_load_project(ix::WebSocket& ws,
                             uint64_t sequence_id,
                             const protocol::LoadProjectCommand& cmd,
                             const SendEventFn& send_event,
                             const StopRuntimeFn& stop_runtime);

    void handle_relocate_asset(ix::WebSocket& ws,
                               uint64_t sequence_id,
                               const protocol::RelocateAssetCommand& cmd,
                               const SendEventFn& send_event);

    void clear();

    // Shape loading resolves body_id -> geometry_ids for face-picking
    bool ensure_body_shape_loaded(const std::string& body_id);

    double body_length_scale(const std::string& body_id) const;

    // Cleanup helpers for delete operations
    void remove_body_data(const std::string& body_id);
    void remove_geometry_data(const std::string& geometry_id);
    void reparent_geometry_data(const std::string& geometry_id,
                                const std::string& old_body_id,
                                const std::string& new_body_id);

private:
    struct AssetTopologyContext {
        std::string file_path;
        std::string unit_system;
        double density = 1000.0;
        double tessellation_quality = 0.1;
        std::vector<std::string> body_ids;
    };

    static std::string normalize_unit_system(std::string unit_system);
    static double unit_scale_to_meters(const std::string& unit_system);
    const protocol::GeometryImportResult* get_geometry_import_result(const std::string& geometry_id) const;

    void remember_topology_context(const std::string& cache_key,
                                   const std::string& file_path,
                                   const std::string& unit_system,
                                   double density,
                                   double tessellation_quality,
                                   const std::vector<std::string>& body_ids);

    engine::AssetCache asset_cache_;
    engine::MechanismState& mechanism_state_;
    engine::ShapeRegistry& shape_registry_;

    // Body tracking (kept for backward compat and load project flow)
    std::unordered_map<std::string, protocol::BodyImportResult> body_import_results_;
    std::unordered_map<std::string, double> body_length_scales_;

    // Geometry tracking
    std::unordered_map<std::string, protocol::GeometryImportResult> geometry_import_results_;
    std::unordered_map<std::string, double> geometry_length_scales_;

    // body_id -> list of geometry_ids for shape resolution
    std::unordered_map<std::string, std::vector<std::string>> body_geometry_map_;

    // Topology context for lazy shape loading
    std::unordered_map<std::string, AssetTopologyContext> asset_topology_contexts_;
    std::unordered_map<std::string, std::string> body_topology_keys_;
    std::unordered_map<std::string, std::string> geometry_topology_keys_;
};

} // namespace motionlab::transport_detail
