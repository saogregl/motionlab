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
                         const std::filesystem::path& cache_dir)
        : asset_cache_(cache_dir)
        , mechanism_state_(mechanism_state)
        , shape_registry_(shape_registry) {}

    void handle_import_asset(ix::WebSocket& ws,
                             uint64_t sequence_id,
                             const protocol::ImportAssetCommand& cmd,
                             const SendEventFn& send_event) {
        spdlog::info("Importing asset: {}", cmd.file_path());
        std::string file_path = cmd.file_path();
        std::string lower_path = file_path;
        std::transform(lower_path.begin(), lower_path.end(), lower_path.begin(),
                       [](unsigned char c) { return static_cast<char>(std::tolower(c)); });

        double density = 1000.0;
        double tess_quality = 0.1;
        std::string unit_system = "millimeter";
        if (cmd.has_import_options()) {
            const auto& opts = cmd.import_options();
            if (opts.density_override() > 0.0) density = opts.density_override();
            if (opts.tessellation_quality() > 0.0) tess_quality = opts.tessellation_quality();
            unit_system = normalize_unit_system(opts.unit_system());
            if (unit_system.empty()) {
                protocol::Event event;
                event.set_sequence_id(sequence_id);
                auto* result = event.mutable_import_asset_result();
                result->set_success(false);
                result->set_error_message("Unsupported unit_system. Expected millimeter, meter, or inch.");
                send_event(ws, event);
                return;
            }
        }
        const double length_scale = unit_scale_to_meters(unit_system);

        std::string cache_key = asset_cache_.compute_cache_key(file_path, density, tess_quality, unit_system);
        if (!cache_key.empty()) {
            auto cached = asset_cache_.lookup(cache_key);
            if (cached.has_value()) {
                protocol::ImportAssetResult result;
                if (result.ParseFromString(cached.value())) {
                    std::vector<std::string> body_ids;
                    bool cache_has_face_index = true;
                    for (const auto& body : result.bodies()) {
                        body_ids.push_back(body.body_id());
                        if (body.part_index_size() == 0) {
                            cache_has_face_index = false;
                            break;
                        }
                    }

                    if (cache_has_face_index) {
                        remember_topology_context(cache_key, file_path, unit_system,
                                                 density, tess_quality, body_ids);
                    }

                    for (int i = 0; i < result.bodies_size(); ++i) {
                        const auto& cached_body = result.bodies(i);
                        double cb_pos[3] = {
                            cached_body.pose().position().x(),
                            cached_body.pose().position().y(),
                            cached_body.pose().position().z()
                        };
                        double cb_orient[4] = {
                            cached_body.pose().orientation().w(),
                            cached_body.pose().orientation().x(),
                            cached_body.pose().orientation().y(),
                            cached_body.pose().orientation().z()
                        };
                        double cb_com[3] = {
                            cached_body.mass_properties().center_of_mass().x(),
                            cached_body.mass_properties().center_of_mass().y(),
                            cached_body.mass_properties().center_of_mass().z()
                        };
                        double cb_inertia[6] = {
                            cached_body.mass_properties().ixx(),
                            cached_body.mass_properties().iyy(),
                            cached_body.mass_properties().izz(),
                            cached_body.mass_properties().ixy(),
                            cached_body.mass_properties().ixz(),
                            cached_body.mass_properties().iyz()
                        };
                        mechanism_state_.add_body(cached_body.body_id(), cached_body.name(),
                                                  cb_pos, cb_orient,
                                                  cached_body.mass_properties().mass(),
                                                  cb_com, cb_inertia,
                                                  cached_body.has_source_asset_ref()
                                                      ? &cached_body.source_asset_ref()
                                                      : nullptr);
                        body_import_results_[cached_body.body_id()] = cached_body;
                        body_length_scales_[cached_body.body_id()] = length_scale;
                    }

                    spdlog::info("Import cache hit: {} bodies from {}",
                                 result.bodies_size(), file_path);
                    protocol::Event event;
                    event.set_sequence_id(sequence_id);
                    *event.mutable_import_asset_result() = std::move(result);
                    send_event(ws, event);
                    return;
                }
            }
        }

        engine::CadImporter importer;
        engine::ImportOptions import_opts{density, tess_quality, unit_system};

        engine::ImportResult import_result;
        if (lower_path.ends_with(".iges") || lower_path.ends_with(".igs")) {
            import_result = importer.import_iges(file_path, import_opts);
        } else {
            import_result = importer.import_step(file_path, import_opts);
        }

        protocol::ImportAssetResult proto_result;
        proto_result.set_success(import_result.success);
        proto_result.set_error_message(import_result.error_message);

        for (const auto& diag : import_result.diagnostics) {
            proto_result.add_diagnostics(diag);
        }

        std::string original_filename;
        {
            auto pos = file_path.find_last_of("/\\");
            original_filename = (pos != std::string::npos)
                ? file_path.substr(pos + 1) : file_path;
        }

        std::vector<std::string> imported_body_ids;
        for (const auto& body : import_result.bodies) {
            auto* pb = proto_result.add_bodies();
            pb->set_body_id(engine::generate_uuidv7());
            imported_body_ids.push_back(pb->body_id());
            pb->set_name(body.name);

            auto* mesh = pb->mutable_display_mesh();
            mesh->mutable_vertices()->Assign(body.mesh.vertices.begin(), body.mesh.vertices.end());
            mesh->mutable_indices()->Assign(body.mesh.indices.begin(), body.mesh.indices.end());
            mesh->mutable_normals()->Assign(body.mesh.normals.begin(), body.mesh.normals.end());
            pb->mutable_part_index()->Assign(body.mesh.part_index.begin(), body.mesh.part_index.end());

            auto* mp = pb->mutable_mass_properties();
            mp->set_mass(body.mass_properties.mass);
            auto* com = mp->mutable_center_of_mass();
            com->set_x(body.mass_properties.center_of_mass[0]);
            com->set_y(body.mass_properties.center_of_mass[1]);
            com->set_z(body.mass_properties.center_of_mass[2]);
            mp->set_ixx(body.mass_properties.inertia[0]);
            mp->set_iyy(body.mass_properties.inertia[1]);
            mp->set_izz(body.mass_properties.inertia[2]);
            mp->set_ixy(body.mass_properties.inertia[3]);
            mp->set_ixz(body.mass_properties.inertia[4]);
            mp->set_iyz(body.mass_properties.inertia[5]);

            auto* pose = pb->mutable_pose();
            auto* pos = pose->mutable_position();
            pos->set_x(body.translation[0]);
            pos->set_y(body.translation[1]);
            pos->set_z(body.translation[2]);
            auto* rot = pose->mutable_orientation();
            rot->set_w(body.rotation[3]);
            rot->set_x(body.rotation[0]);
            rot->set_y(body.rotation[1]);
            rot->set_z(body.rotation[2]);

            auto* asset_ref = pb->mutable_source_asset_ref();
            asset_ref->set_content_hash(import_result.content_hash);
            asset_ref->set_relative_path("");
            asset_ref->set_original_filename(original_filename);

            double body_orient[4] = {body.rotation[3], body.rotation[0], body.rotation[1], body.rotation[2]};
            mechanism_state_.add_body(pb->body_id(), pb->name(),
                                      body.translation.data(), body_orient,
                                      body.mass_properties.mass,
                                      body.mass_properties.center_of_mass.data(),
                                      body.mass_properties.inertia.data(),
                                      asset_ref);

            body_import_results_[pb->body_id()] = *pb;
            body_length_scales_[pb->body_id()] = length_scale;

            if (body.brep_shape) {
                shape_registry_.store(pb->body_id(), *body.brep_shape);
            }
        }

        if (import_result.success && !cache_key.empty()) {
            remember_topology_context(cache_key, file_path, unit_system,
                                      density, tess_quality, imported_body_ids);
        }

        if (import_result.success && !cache_key.empty()) {
            std::string serialized;
            proto_result.SerializeToString(&serialized);
            asset_cache_.store(cache_key, serialized);
        }

        if (import_result.success) {
            spdlog::info("Imported {} bodies from {}", import_result.bodies.size(), file_path);
        } else {
            spdlog::error("Import failed: {}", file_path);
            for (const auto& d : import_result.diagnostics) {
                spdlog::error("  {}", d);
            }
        }

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        *event.mutable_import_asset_result() = std::move(proto_result);
        send_event(ws, event);
    }

    void handle_save_project(ix::WebSocket& ws,
                             uint64_t sequence_id,
                             const protocol::SaveProjectCommand& cmd,
                             const SendEventFn& send_event,
                             const StopRuntimeFn& stop_runtime) {
        stop_runtime();

        mechanism::ProjectFile project_file;
        project_file.set_version(1);

        auto* meta = project_file.mutable_metadata();
        meta->set_name(cmd.project_name());
        auto now = std::chrono::system_clock::now();
        auto time_t = std::chrono::system_clock::to_time_t(now);
        char buf[64];
        std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", std::gmtime(&time_t));
        meta->set_created_at(buf);
        meta->set_modified_at(buf);

        *project_file.mutable_mechanism() = mechanism_state_.build_mechanism_proto();

        for (const auto& body : project_file.mechanism().bodies()) {
            auto it = body_import_results_.find(body.id().id());
            if (it != body_import_results_.end()) {
                auto* bdd = project_file.add_body_display_data();
                bdd->set_body_id(body.id().id());
                *bdd->mutable_display_mesh() = it->second.display_mesh();
                bdd->mutable_part_index()->CopyFrom(it->second.part_index());
            }
        }

        std::string serialized;
        project_file.SerializeToString(&serialized);

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* result = event.mutable_save_project_result();
        result->set_project_data(serialized);
        send_event(ws, event);
    }

    void handle_load_project(ix::WebSocket& ws,
                             uint64_t sequence_id,
                             const protocol::LoadProjectCommand& cmd,
                             const SendEventFn& send_event,
                             const StopRuntimeFn& stop_runtime) {
        stop_runtime();

        mechanism::ProjectFile project_file;
        if (!project_file.ParseFromString(cmd.project_data())) {
            protocol::Event event;
            event.set_sequence_id(sequence_id);
            auto* result = event.mutable_load_project_result();
            result->set_error_message("Failed to parse project file");
            send_event(ws, event);
            return;
        }

        if (project_file.version() == 0 || project_file.version() > 1) {
            protocol::Event event;
            event.set_sequence_id(sequence_id);
            auto* result = event.mutable_load_project_result();
            result->set_error_message("Unsupported project file version: " +
                                      std::to_string(project_file.version()));
            send_event(ws, event);
            return;
        }

        mechanism_state_.clear();
        body_length_scales_.clear();
        mechanism_state_.load_from_proto(project_file.mechanism());

        std::unordered_map<std::string, const mechanism::BodyDisplayData*> display_lookup;
        for (const auto& bdd : project_file.body_display_data()) {
            display_lookup[bdd.body_id()] = &bdd;
        }

        body_import_results_.clear();
        body_topology_keys_.clear();
        asset_topology_contexts_.clear();
        protocol::LoadProjectSuccess success;
        *success.mutable_mechanism() = project_file.mechanism();
        *success.mutable_metadata() = project_file.metadata();

        for (const auto& body : project_file.mechanism().bodies()) {
            auto* bir = success.add_bodies();
            bir->set_body_id(body.id().id());
            bir->set_name(body.name());
            *bir->mutable_mass_properties() = body.mass_properties();
            *bir->mutable_pose() = body.pose();

            if (body.has_source_asset_ref()) {
                *bir->mutable_source_asset_ref() = body.source_asset_ref();
            }

            auto disp_it = display_lookup.find(body.id().id());
            if (disp_it != display_lookup.end()) {
                *bir->mutable_display_mesh() = disp_it->second->display_mesh();
                bir->mutable_part_index()->CopyFrom(disp_it->second->part_index());
            }

            body_import_results_[body.id().id()] = *bir;
            body_length_scales_[body.id().id()] = 1.0;
        }

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* result = event.mutable_load_project_result();
        *result->mutable_success() = std::move(success);
        send_event(ws, event);
    }

    bool ensure_body_shape_loaded(const std::string& body_id) {
        if (shape_registry_.get(body_id)) {
            return true;
        }

        const auto body_it = body_topology_keys_.find(body_id);
        if (body_it == body_topology_keys_.end()) {
            return false;
        }

        const auto ctx_it = asset_topology_contexts_.find(body_it->second);
        if (ctx_it == asset_topology_contexts_.end()) {
            return false;
        }

        const auto& ctx = ctx_it->second;
        engine::CadImporter topology_importer;
        engine::ImportOptions topology_opts{ctx.density, ctx.tessellation_quality, ctx.unit_system};
        std::string lower_path = ctx.file_path;
        std::transform(lower_path.begin(), lower_path.end(), lower_path.begin(),
                       [](unsigned char c) { return static_cast<char>(std::tolower(c)); });

        engine::ImportResult topology_result;
        if (lower_path.ends_with(".iges") || lower_path.ends_with(".igs")) {
            topology_result = topology_importer.import_iges_topology(ctx.file_path, topology_opts);
        } else {
            topology_result = topology_importer.import_step_topology(ctx.file_path, topology_opts);
        }

        if (!topology_result.success || topology_result.bodies.size() != ctx.body_ids.size()) {
            return false;
        }

        for (size_t i = 0; i < ctx.body_ids.size(); ++i) {
            const auto& topo_body = topology_result.bodies[i];
            if (topo_body.brep_shape) {
                shape_registry_.store(ctx.body_ids[i], *topo_body.brep_shape);
            }
        }

        return shape_registry_.get(body_id) != nullptr;
    }

    double body_length_scale(const std::string& body_id) const {
        const auto it = body_length_scales_.find(body_id);
        return it != body_length_scales_.end() ? it->second : 1.0;
    }

private:
    struct AssetTopologyContext {
        std::string file_path;
        std::string unit_system;
        double density = 1000.0;
        double tessellation_quality = 0.1;
        std::vector<std::string> body_ids;
    };

    static std::string normalize_unit_system(std::string unit_system) {
        std::transform(unit_system.begin(), unit_system.end(), unit_system.begin(),
                       [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
        if (unit_system.empty()) return "millimeter";
        if (unit_system == "millimeter" || unit_system == "meter" || unit_system == "inch") {
            return unit_system;
        }
        return {};
    }

    static double unit_scale_to_meters(const std::string& unit_system) {
        if (unit_system == "meter") return 1.0;
        if (unit_system == "inch") return 0.0254;
        return 1e-3;
    }

    void remember_topology_context(const std::string& cache_key,
                                   const std::string& file_path,
                                   const std::string& unit_system,
                                   double density,
                                   double tessellation_quality,
                                   const std::vector<std::string>& body_ids) {
        asset_topology_contexts_[cache_key] = AssetTopologyContext{
            file_path, unit_system, density, tessellation_quality, body_ids
        };
        for (const auto& body_id : body_ids) {
            body_topology_keys_[body_id] = cache_key;
        }
    }

    engine::AssetCache asset_cache_;
    engine::MechanismState& mechanism_state_;
    engine::ShapeRegistry& shape_registry_;
    std::unordered_map<std::string, protocol::BodyImportResult> body_import_results_;
    std::unordered_map<std::string, double> body_length_scales_;
    std::unordered_map<std::string, AssetTopologyContext> asset_topology_contexts_;
    std::unordered_map<std::string, std::string> body_topology_keys_;
};

} // namespace motionlab::transport_detail
