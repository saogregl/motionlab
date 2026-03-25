#include "transport_import_project_context.h"

namespace motionlab::transport_detail {

ImportProjectContext::ImportProjectContext(engine::MechanismState& mechanism_state,
                                           engine::ShapeRegistry& shape_registry,
                                           const std::filesystem::path& cache_dir)
    : asset_cache_(cache_dir)
    , mechanism_state_(mechanism_state)
    , shape_registry_(shape_registry) {}

void ImportProjectContext::clear() {
    body_import_results_.clear();
    body_topology_keys_.clear();
    asset_topology_contexts_.clear();
    body_length_scales_.clear();
    geometry_import_results_.clear();
    geometry_length_scales_.clear();
    geometry_topology_keys_.clear();
    body_geometry_map_.clear();
}

void ImportProjectContext::handle_import_asset(ix::WebSocket& ws,
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
                // Check if cached result has geometries (v4 cache) or only bodies (v3 cache)
                if (result.geometries_size() > 0) {
                    // V4 cache path
                    std::vector<std::string> body_ids;
                    for (const auto& geom : result.geometries()) {
                        // Register body (deduplicated)
                        if (!mechanism_state_.has_body(geom.body_id())) {
                            double cb_pos[3] = {geom.pose().position().x(), geom.pose().position().y(), geom.pose().position().z()};
                            double cb_orient[4] = {geom.pose().orientation().w(), geom.pose().orientation().x(),
                                                   geom.pose().orientation().y(), geom.pose().orientation().z()};
                            double cb_com[3] = {geom.computed_mass_properties().center_of_mass().x(),
                                                geom.computed_mass_properties().center_of_mass().y(),
                                                geom.computed_mass_properties().center_of_mass().z()};
                            double cb_inertia[6] = {geom.computed_mass_properties().ixx(),
                                                    geom.computed_mass_properties().iyy(),
                                                    geom.computed_mass_properties().izz(),
                                                    geom.computed_mass_properties().ixy(),
                                                    geom.computed_mass_properties().ixz(),
                                                    geom.computed_mass_properties().iyz()};
                            mechanism_state_.add_body(geom.body_id(), geom.name(), cb_pos, cb_orient,
                                                     geom.computed_mass_properties().mass(),
                                                     cb_com, cb_inertia);
                            body_ids.push_back(geom.body_id());
                        }
                        // Register geometry
                        double g_pos[3] = {0, 0, 0};
                        double g_orient[4] = {1, 0, 0, 0};
                        mechanism_state_.add_geometry(geom.geometry_id(), geom.name(),
                                                      geom.body_id(), g_pos, g_orient,
                                                      geom.computed_mass_properties(),
                                                      geom.has_source_asset_ref() ? &geom.source_asset_ref() : nullptr);
                        geometry_import_results_[geom.geometry_id()] = geom;
                        geometry_length_scales_[geom.geometry_id()] = length_scale;
                        body_geometry_map_[geom.body_id()].push_back(geom.geometry_id());
                        geometry_topology_keys_[geom.geometry_id()] = cache_key;
                        body_length_scales_[geom.body_id()] = length_scale;
                    }
                    // Also populate body_import_results_ for backward compat
                    for (const auto& body : result.bodies()) {
                        body_import_results_[body.body_id()] = body;
                    }
                    if (!body_ids.empty()) {
                        remember_topology_context(cache_key, file_path, unit_system,
                                                  density, tess_quality, body_ids);
                    }
                } else {
                    // Legacy v3 cache path — create synthetic geometries
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
                        double cb_pos[3] = {cached_body.pose().position().x(), cached_body.pose().position().y(), cached_body.pose().position().z()};
                        double cb_orient[4] = {cached_body.pose().orientation().w(), cached_body.pose().orientation().x(),
                                               cached_body.pose().orientation().y(), cached_body.pose().orientation().z()};
                        double cb_com[3] = {cached_body.mass_properties().center_of_mass().x(),
                                            cached_body.mass_properties().center_of_mass().y(),
                                            cached_body.mass_properties().center_of_mass().z()};
                        double cb_inertia[6] = {cached_body.mass_properties().ixx(), cached_body.mass_properties().iyy(),
                                                cached_body.mass_properties().izz(), cached_body.mass_properties().ixy(),
                                                cached_body.mass_properties().ixz(), cached_body.mass_properties().iyz()};
                        mechanism_state_.add_body(cached_body.body_id(), cached_body.name(),
                                                  cb_pos, cb_orient,
                                                  cached_body.mass_properties().mass(),
                                                  cb_com, cb_inertia);
                        // Create synthetic geometry for v3 cache
                        std::string geom_id = engine::generate_uuidv7();
                        double g_pos[3] = {0, 0, 0};
                        double g_orient[4] = {1, 0, 0, 0};
                        mechanism_state_.add_geometry(geom_id, cached_body.name(),
                                                      cached_body.body_id(), g_pos, g_orient,
                                                      cached_body.mass_properties(),
                                                      cached_body.has_source_asset_ref() ? &cached_body.source_asset_ref() : nullptr);
                        body_geometry_map_[cached_body.body_id()].push_back(geom_id);

                        body_import_results_[cached_body.body_id()] = cached_body;
                        body_length_scales_[cached_body.body_id()] = length_scale;
                    }
                }

                spdlog::info("Import cache hit: {} bodies from {}", result.bodies_size(), file_path);
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

    auto import_start = std::chrono::steady_clock::now();

    engine::ImportResult import_result;
    if (lower_path.ends_with(".iges") || lower_path.ends_with(".igs")) {
        import_result = importer.import_iges(file_path, import_opts);
    } else {
        import_result = importer.import_step(file_path, import_opts);
    }

    auto import_end = std::chrono::steady_clock::now();
    auto elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(import_end - import_start).count();
    spdlog::info("[PERF] import_asset took {}ms ({} bodies)", elapsed_ms, import_result.bodies.size());

    protocol::ImportAssetResult proto_result;
    proto_result.set_success(import_result.success);
    proto_result.set_error_message(import_result.error_message);

    for (const auto& diag : import_result.diagnostics) {
        proto_result.add_diagnostics(diag);
    }

    if (import_result.success && import_result.bodies.empty()) {
        proto_result.add_diagnostics("No solid bodies found in this file. Only STEP files with solid geometry are supported.");
    }

    std::string original_filename;
    {
        auto pos = file_path.find_last_of("/\\");
        original_filename = (pos != std::string::npos)
            ? file_path.substr(pos + 1) : file_path;
    }

    std::vector<std::string> imported_body_ids;
    for (const auto& body : import_result.bodies) {
        std::string body_id = engine::generate_uuidv7();
        std::string geometry_id = engine::generate_uuidv7();
        imported_body_ids.push_back(body_id);

        // Build asset reference
        mechanism::AssetReference asset_ref;
        asset_ref.set_content_hash(import_result.content_hash);
        asset_ref.set_relative_path("");
        asset_ref.set_original_filename(original_filename);

        // Register body in mechanism state
        double body_orient[4] = {body.rotation[3], body.rotation[0], body.rotation[1], body.rotation[2]};
        mechanism_state_.add_body(body_id, body.name,
                                  body.translation.data(), body_orient,
                                  body.mass_properties.mass,
                                  body.mass_properties.center_of_mass.data(),
                                  body.mass_properties.inertia.data());

        // Build mass properties proto for geometry
        mechanism::MassProperties geom_mass;
        geom_mass.set_mass(body.mass_properties.mass);
        geom_mass.mutable_center_of_mass()->set_x(body.mass_properties.center_of_mass[0]);
        geom_mass.mutable_center_of_mass()->set_y(body.mass_properties.center_of_mass[1]);
        geom_mass.mutable_center_of_mass()->set_z(body.mass_properties.center_of_mass[2]);
        geom_mass.set_ixx(body.mass_properties.inertia[0]);
        geom_mass.set_iyy(body.mass_properties.inertia[1]);
        geom_mass.set_izz(body.mass_properties.inertia[2]);
        geom_mass.set_ixy(body.mass_properties.inertia[3]);
        geom_mass.set_ixz(body.mass_properties.inertia[4]);
        geom_mass.set_iyz(body.mass_properties.inertia[5]);

        // Register geometry in mechanism state
        double g_pos[3] = {0, 0, 0};
        double g_orient[4] = {1, 0, 0, 0};
        mechanism_state_.add_geometry(geometry_id, body.name, body_id,
                                      g_pos, g_orient, geom_mass, &asset_ref,
                                      static_cast<uint32_t>(body.mesh.part_index.empty() ? 0 : body.mesh.part_index.back() + 1));

        // Populate GeometryImportResult (v4 field)
        auto* gir = proto_result.add_geometries();
        gir->set_geometry_id(geometry_id);
        gir->set_body_id(body_id);
        gir->set_name(body.name);
        auto* gir_mesh = gir->mutable_display_mesh();
        gir_mesh->mutable_vertices()->Assign(body.mesh.vertices.begin(), body.mesh.vertices.end());
        gir_mesh->mutable_indices()->Assign(body.mesh.indices.begin(), body.mesh.indices.end());
        gir_mesh->mutable_normals()->Assign(body.mesh.normals.begin(), body.mesh.normals.end());
        gir->mutable_part_index()->Assign(body.mesh.part_index.begin(), body.mesh.part_index.end());
        *gir->mutable_computed_mass_properties() = geom_mass;
        auto* gir_pose = gir->mutable_pose();
        gir_pose->mutable_position()->set_x(body.translation[0]);
        gir_pose->mutable_position()->set_y(body.translation[1]);
        gir_pose->mutable_position()->set_z(body.translation[2]);
        gir_pose->mutable_orientation()->set_w(body.rotation[3]);
        gir_pose->mutable_orientation()->set_x(body.rotation[0]);
        gir_pose->mutable_orientation()->set_y(body.rotation[1]);
        gir_pose->mutable_orientation()->set_z(body.rotation[2]);
        *gir->mutable_source_asset_ref() = asset_ref;

        // Also populate deprecated BodyImportResult for backward compat
        auto* pb = proto_result.add_bodies();
        pb->set_body_id(body_id);
        pb->set_name(body.name);
        *pb->mutable_display_mesh() = gir->display_mesh();
        pb->mutable_part_index()->CopyFrom(gir->part_index());
        *pb->mutable_mass_properties() = geom_mass;
        *pb->mutable_pose() = gir->pose();
        *pb->mutable_source_asset_ref() = asset_ref;

        body_import_results_[body_id] = *pb;
        body_length_scales_[body_id] = length_scale;
        geometry_import_results_[geometry_id] = *gir;
        geometry_length_scales_[geometry_id] = length_scale;
        body_geometry_map_[body_id].push_back(geometry_id);
        geometry_topology_keys_[geometry_id] = cache_key;

        // Store B-Rep shape by geometry_id
        if (body.brep_shape) {
            shape_registry_.store(geometry_id, *body.brep_shape);
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

// Current project file format version.
static constexpr uint32_t CURRENT_PROJECT_VERSION = 3;

static void migrate_v2_to_v3(mechanism::ProjectFile& file) {
    auto* mech = file.mutable_mechanism();

    // Build body display data lookup
    std::unordered_map<std::string, const mechanism::BodyDisplayData*> bdd_lookup;
    for (const auto& bdd : file.body_display_data()) {
        bdd_lookup[bdd.body_id()] = &bdd;
    }

    for (int i = 0; i < mech->bodies_size(); ++i) {
        auto* body = mech->mutable_bodies(i);

        // Create synthetic Geometry for each body that has source_asset_ref
        if (body->has_source_asset_ref() && !body->source_asset_ref().content_hash().empty()) {
            auto* geom = mech->add_geometries();
            std::string geom_id = engine::generate_uuidv5(body->id().id(), "geometry");
            geom->mutable_id()->set_id(geom_id);
            geom->set_name(body->name());
            *geom->mutable_parent_body_id() = body->id();

            // Identity local pose
            auto* pose = geom->mutable_local_pose();
            pose->mutable_position();
            auto* q = pose->mutable_orientation();
            q->set_w(1.0);

            *geom->mutable_source_asset_ref() = body->source_asset_ref();
            *geom->mutable_computed_mass_properties() = body->mass_properties();

            // Migrate display data
            auto bdd_it = bdd_lookup.find(body->id().id());
            if (bdd_it != bdd_lookup.end()) {
                auto* gdd = file.add_geometry_display_data();
                gdd->set_geometry_id(geom_id);
                *gdd->mutable_display_mesh() = bdd_it->second->display_mesh();
                gdd->mutable_part_index()->CopyFrom(bdd_it->second->part_index());
                gdd->set_density(bdd_it->second->density());
                gdd->set_tessellation_quality(bdd_it->second->tessellation_quality());
                gdd->set_unit_system(bdd_it->second->unit_system());
            }

            // Clear deprecated source_asset_ref from body
            body->clear_source_asset_ref();
        }
        body->set_mass_override(false);
    }
    file.set_version(3);
}

static void migrate_project_file(mechanism::ProjectFile& file) {
    if (file.version() < 2) {
        engine::MechanismState migrated_state;
        migrated_state.load_from_proto(file.mechanism());
        *file.mutable_mechanism() = migrated_state.build_mechanism_proto();
        file.set_version(2);
    }
    if (file.version() < 3) {
        migrate_v2_to_v3(file);
    }
}

void ImportProjectContext::handle_save_project(ix::WebSocket& ws,
                                               uint64_t sequence_id,
                                               const protocol::SaveProjectCommand& cmd,
                                               const SendEventFn& send_event,
                                               const StopRuntimeFn& stop_runtime) {
    stop_runtime();
    auto save_start = std::chrono::steady_clock::now();

    mechanism::ProjectFile project_file;
    project_file.set_version(CURRENT_PROJECT_VERSION);

    auto* meta = project_file.mutable_metadata();
    meta->set_name(cmd.project_name());
    auto now = std::chrono::system_clock::now();
    auto time_t = std::chrono::system_clock::to_time_t(now);
    char buf[64];
    std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", std::gmtime(&time_t));
    meta->set_created_at(buf);
    meta->set_modified_at(buf);

    // Refresh aggregate masses before saving
    mechanism_state_.refresh_aggregate_masses();
    *project_file.mutable_mechanism() = mechanism_state_.build_mechanism_proto();

    const auto geometry_parent_id = [&](const std::string& geometry_id) -> std::string {
        const auto* geom = mechanism_state_.get_geometry(geometry_id);
        return geom ? geom->parent_body_id().id() : std::string{};
    };

    // Write GeometryDisplayData from geometry_import_results_
    for (const auto& geom : project_file.mechanism().geometries()) {
        auto it = geometry_import_results_.find(geom.id().id());
        if (it != geometry_import_results_.end()) {
            auto* gdd = project_file.add_geometry_display_data();
            gdd->set_geometry_id(geom.id().id());
            *gdd->mutable_display_mesh() = it->second.display_mesh();
            gdd->mutable_part_index()->CopyFrom(it->second.part_index());

            std::string topo_key;
            auto topo_key_it = geometry_topology_keys_.find(geom.id().id());
            if (topo_key_it != geometry_topology_keys_.end()) {
                topo_key = topo_key_it->second;
            } else {
                const std::string parent_id = geometry_parent_id(geom.id().id());
                auto body_topo_key_it = body_topology_keys_.find(parent_id);
                if (body_topo_key_it != body_topology_keys_.end()) {
                    topo_key = body_topo_key_it->second;
                }
            }

            if (!topo_key.empty()) {
                auto ctx_it = asset_topology_contexts_.find(topo_key);
                if (ctx_it != asset_topology_contexts_.end()) {
                    gdd->set_density(ctx_it->second.density);
                    gdd->set_tessellation_quality(ctx_it->second.tessellation_quality);
                    gdd->set_unit_system(ctx_it->second.unit_system);
                }
            }
        }
    }

    // Also write BodyDisplayData for backward compat with older readers
    for (const auto& body : project_file.mechanism().bodies()) {
        const auto* body_geom_result = [&]() -> const protocol::GeometryImportResult* {
            auto geom_ids_it = body_geometry_map_.find(body.id().id());
            if (geom_ids_it == body_geometry_map_.end() || geom_ids_it->second.empty()) {
                return nullptr;
            }
            return get_geometry_import_result(geom_ids_it->second.front());
        }();

        if (body_geom_result != nullptr || body_import_results_.contains(body.id().id())) {
            auto* bdd = project_file.add_body_display_data();
            bdd->set_body_id(body.id().id());
            if (body_geom_result != nullptr) {
                *bdd->mutable_display_mesh() = body_geom_result->display_mesh();
                bdd->mutable_part_index()->CopyFrom(body_geom_result->part_index());
            } else {
                const auto& body_result = body_import_results_.at(body.id().id());
                *bdd->mutable_display_mesh() = body_result.display_mesh();
                bdd->mutable_part_index()->CopyFrom(body_result.part_index());
            }

            auto topo_key_it = body_topology_keys_.find(body.id().id());
            if (topo_key_it != body_topology_keys_.end()) {
                auto ctx_it = asset_topology_contexts_.find(topo_key_it->second);
                if (ctx_it != asset_topology_contexts_.end()) {
                    bdd->set_density(ctx_it->second.density);
                    bdd->set_tessellation_quality(ctx_it->second.tessellation_quality);
                    bdd->set_unit_system(ctx_it->second.unit_system);
                }
            }
        }
    }

    std::string serialized;
    project_file.SerializeToString(&serialized);

    auto save_end = std::chrono::steady_clock::now();
    auto save_ms = std::chrono::duration_cast<std::chrono::milliseconds>(save_end - save_start).count();
    spdlog::info("[PERF] save_project {} bytes in {}ms", serialized.size(), save_ms);

    protocol::Event event;
    event.set_sequence_id(sequence_id);
    auto* result = event.mutable_save_project_result();
    result->set_project_data(serialized);
    send_event(ws, event);
}

void ImportProjectContext::handle_load_project(ix::WebSocket& ws,
                                               uint64_t sequence_id,
                                               const protocol::LoadProjectCommand& cmd,
                                               const SendEventFn& send_event,
                                               const StopRuntimeFn& stop_runtime) {
    stop_runtime();
    auto load_start = std::chrono::steady_clock::now();

    mechanism::ProjectFile project_file;
    if (!project_file.ParseFromString(cmd.project_data())) {
        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* result = event.mutable_load_project_result();
        result->set_error_message("Failed to parse project file");
        send_event(ws, event);
        return;
    }

    // Version check with migration support
    if (project_file.version() == 0) {
        project_file.set_version(1);
    }
    if (project_file.version() > CURRENT_PROJECT_VERSION) {
        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* result = event.mutable_load_project_result();
        result->set_error_message(
            "Project file created by a newer version of MotionLab (format version " +
            std::to_string(project_file.version()) + ", max supported: " +
            std::to_string(CURRENT_PROJECT_VERSION) + ")");
        send_event(ws, event);
        return;
    }
    migrate_project_file(project_file);

    mechanism_state_.clear();
    body_length_scales_.clear();
    geometry_import_results_.clear();
    geometry_length_scales_.clear();
    body_geometry_map_.clear();
    mechanism_state_.load_from_proto(project_file.mechanism());

    // Build geometry display data lookup
    std::unordered_map<std::string, const mechanism::GeometryDisplayData*> geo_display_lookup;
    for (const auto& gdd : project_file.geometry_display_data()) {
        geo_display_lookup[gdd.geometry_id()] = &gdd;
    }

    // Build body display data lookup (backward compat)
    std::unordered_map<std::string, const mechanism::BodyDisplayData*> display_lookup;
    for (const auto& bdd : project_file.body_display_data()) {
        display_lookup[bdd.body_id()] = &bdd;
    }

    body_import_results_.clear();
    body_topology_keys_.clear();
    geometry_topology_keys_.clear();
    asset_topology_contexts_.clear();
    protocol::LoadProjectSuccess success;
    *success.mutable_mechanism() = project_file.mechanism();
    *success.mutable_metadata() = project_file.metadata();

    // Populate geometry_import_results_ from loaded geometries
    for (const auto& geom : project_file.mechanism().geometries()) {
        protocol::GeometryImportResult gir;
        gir.set_geometry_id(geom.id().id());
        gir.set_body_id(geom.parent_body_id().id());
        gir.set_name(geom.name());
        *gir.mutable_computed_mass_properties() = geom.computed_mass_properties();
        if (geom.has_source_asset_ref()) {
            *gir.mutable_source_asset_ref() = geom.source_asset_ref();
        }

        // Fill display mesh from GeometryDisplayData
        auto geo_disp_it = geo_display_lookup.find(geom.id().id());
        if (geo_disp_it != geo_display_lookup.end()) {
            *gir.mutable_display_mesh() = geo_disp_it->second->display_mesh();
            gir.mutable_part_index()->CopyFrom(geo_disp_it->second->part_index());
        }

        geometry_import_results_[geom.id().id()] = gir;
        geometry_length_scales_[geom.id().id()] = 1.0;
        if (!geom.parent_body_id().id().empty()) {
            body_geometry_map_[geom.parent_body_id().id()].push_back(geom.id().id());
        }
        *success.add_geometries() = gir;
    }

    // Populate body_import_results_ for backward compat and build BodyImportResult for LoadProjectSuccess
    for (const auto& body : project_file.mechanism().bodies()) {
        auto* bir = success.add_bodies();
        bir->set_body_id(body.id().id());
        bir->set_name(body.name());
        *bir->mutable_mass_properties() = body.mass_properties();
        *bir->mutable_pose() = body.pose();

        // Get display data from geometry or legacy body display data
        auto geom_ids_it = body_geometry_map_.find(body.id().id());
        if (geom_ids_it != body_geometry_map_.end() && !geom_ids_it->second.empty()) {
            // Use first geometry's display data
            auto gir_it = geometry_import_results_.find(geom_ids_it->second[0]);
            if (gir_it != geometry_import_results_.end()) {
                *bir->mutable_display_mesh() = gir_it->second.display_mesh();
                bir->mutable_part_index()->CopyFrom(gir_it->second.part_index());
                if (gir_it->second.has_source_asset_ref()) {
                    *bir->mutable_source_asset_ref() = gir_it->second.source_asset_ref();
                }
            }
        } else {
            // Fallback: legacy body display data
            auto disp_it = display_lookup.find(body.id().id());
            if (disp_it != display_lookup.end()) {
                *bir->mutable_display_mesh() = disp_it->second->display_mesh();
                bir->mutable_part_index()->CopyFrom(disp_it->second->part_index());
            }
        }

        body_import_results_[body.id().id()] = *bir;
        body_length_scales_[body.id().id()] = 1.0;

        // Try to restore topology context for face-picking
        // Check geometry asset refs first, then fall back to legacy body asset ref
        const mechanism::AssetReference* asset_ref_ptr = nullptr;
        if (geom_ids_it != body_geometry_map_.end() && !geom_ids_it->second.empty()) {
            auto gir_it = geometry_import_results_.find(geom_ids_it->second[0]);
            if (gir_it != geometry_import_results_.end() && gir_it->second.has_source_asset_ref()) {
                asset_ref_ptr = &gir_it->second.source_asset_ref();
            }
        }

        if (asset_ref_ptr && !asset_ref_ptr->content_hash().empty()) {
            double dens = 1000.0;
            double tq = 0.1;
            std::string unit_sys = "millimeter";

            // Try to get import params from geometry display data
            if (geom_ids_it != body_geometry_map_.end() && !geom_ids_it->second.empty()) {
                auto geo_disp_it = geo_display_lookup.find(geom_ids_it->second[0]);
                if (geo_disp_it != geo_display_lookup.end()) {
                    if (geo_disp_it->second->density() > 0.0) dens = geo_disp_it->second->density();
                    if (geo_disp_it->second->tessellation_quality() > 0.0) tq = geo_disp_it->second->tessellation_quality();
                    if (!geo_disp_it->second->unit_system().empty()) unit_sys = geo_disp_it->second->unit_system();
                }
            }

            std::string source_path = asset_ref_ptr->original_filename();
            bool source_available = !source_path.empty() && std::filesystem::exists(source_path);

            if (source_available) {
                std::string ck = asset_cache_.compute_cache_key(source_path, dens, tq, unit_sys);
                if (!ck.empty()) {
                    std::string current_hash = asset_cache_.compute_file_hash(source_path);
                    if (current_hash == asset_ref_ptr->content_hash()) {
                        remember_topology_context(ck, source_path, unit_sys, dens, tq, {body.id().id()});
                        body_length_scales_[body.id().id()] = unit_scale_to_meters(unit_sys);
                        spdlog::info("Topology context restored for body '{}' from {}", body.name(), source_path);
                    } else {
                        spdlog::warn("Asset hash mismatch for body '{}': source file was modified", body.name());
                        auto* missing = success.add_missing_assets();
                        missing->set_body_id(body.id().id());
                        missing->set_body_name(body.name());
                        *missing->mutable_expected_asset() = *asset_ref_ptr;
                        missing->set_reason("hash_mismatch");
                    }
                }
            }
        }
    }

    auto load_end = std::chrono::steady_clock::now();
    auto load_ms = std::chrono::duration_cast<std::chrono::milliseconds>(load_end - load_start).count();
    spdlog::info("[PERF] load_project {}ms ({} bodies, {} geometries)", load_ms,
                 project_file.mechanism().bodies_size(), project_file.mechanism().geometries_size());

    protocol::Event event;
    event.set_sequence_id(sequence_id);
    auto* result = event.mutable_load_project_result();
    *result->mutable_success() = std::move(success);
    send_event(ws, event);
}

void ImportProjectContext::handle_relocate_asset(ix::WebSocket& ws,
                                                  uint64_t sequence_id,
                                                  const protocol::RelocateAssetCommand& cmd,
                                                  const SendEventFn& send_event) {
    const std::string& body_id = cmd.body_id();
    const std::string& new_file_path = cmd.new_file_path();

    auto body_proto = mechanism_state_.build_body_proto(body_id);
    if (!body_proto.has_value()) {
        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* result = event.mutable_relocate_asset_result();
        result->set_error_message("Body not found: " + body_id);
        send_event(ws, event);
        return;
    }

    double density = 1000.0;
    double tess_quality = 0.1;
    std::string unit_system = "millimeter";
    if (cmd.has_import_options()) {
        const auto& opts = cmd.import_options();
        if (opts.density_override() > 0.0) density = opts.density_override();
        if (opts.tessellation_quality() > 0.0) tess_quality = opts.tessellation_quality();
        unit_system = normalize_unit_system(opts.unit_system());
        if (unit_system.empty()) unit_system = "millimeter";
    }
    const double length_scale = unit_scale_to_meters(unit_system);

    std::string lower_path = new_file_path;
    std::transform(lower_path.begin(), lower_path.end(), lower_path.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });

    engine::CadImporter importer;
    engine::ImportOptions import_opts{density, tess_quality, unit_system};

    engine::ImportResult import_result;
    if (lower_path.ends_with(".iges") || lower_path.ends_with(".igs")) {
        import_result = importer.import_iges(new_file_path, import_opts);
    } else {
        import_result = importer.import_step(new_file_path, import_opts);
    }

    if (!import_result.success || import_result.bodies.empty()) {
        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* result = event.mutable_relocate_asset_result();
        result->set_error_message("Failed to import relocated asset: " + import_result.error_message);
        send_event(ws, event);
        return;
    }

    const auto& imported_body = import_result.bodies[0];

    protocol::BodyImportResult bir;
    bir.set_body_id(body_id);
    bir.set_name(body_proto->name());

    auto* mesh = bir.mutable_display_mesh();
    mesh->mutable_vertices()->Assign(imported_body.mesh.vertices.begin(), imported_body.mesh.vertices.end());
    mesh->mutable_indices()->Assign(imported_body.mesh.indices.begin(), imported_body.mesh.indices.end());
    mesh->mutable_normals()->Assign(imported_body.mesh.normals.begin(), imported_body.mesh.normals.end());
    bir.mutable_part_index()->Assign(imported_body.mesh.part_index.begin(), imported_body.mesh.part_index.end());

    auto* mp = bir.mutable_mass_properties();
    mp->set_mass(imported_body.mass_properties.mass);
    auto* com = mp->mutable_center_of_mass();
    com->set_x(imported_body.mass_properties.center_of_mass[0]);
    com->set_y(imported_body.mass_properties.center_of_mass[1]);
    com->set_z(imported_body.mass_properties.center_of_mass[2]);
    mp->set_ixx(imported_body.mass_properties.inertia[0]);
    mp->set_iyy(imported_body.mass_properties.inertia[1]);
    mp->set_izz(imported_body.mass_properties.inertia[2]);
    mp->set_ixy(imported_body.mass_properties.inertia[3]);
    mp->set_ixz(imported_body.mass_properties.inertia[4]);
    mp->set_iyz(imported_body.mass_properties.inertia[5]);

    *bir.mutable_pose() = body_proto->pose();

    std::string original_filename;
    {
        auto pos = new_file_path.find_last_of("/\\");
        original_filename = (pos != std::string::npos)
            ? new_file_path.substr(pos + 1) : new_file_path;
    }
    auto* asset_ref = bir.mutable_source_asset_ref();
    asset_ref->set_content_hash(import_result.content_hash);
    asset_ref->set_relative_path("");
    asset_ref->set_original_filename(original_filename);

    // Update geometry asset ref + shape instead of body asset ref
    auto geom_ids_it = body_geometry_map_.find(body_id);
    if (geom_ids_it != body_geometry_map_.end() && !geom_ids_it->second.empty()) {
        const std::string& geom_id = geom_ids_it->second[0];
        // Update geometry's asset ref in mechanism state
        auto* geom = const_cast<engine::MechanismState::GeometryEntry*>(mechanism_state_.get_geometry(geom_id));
        if (geom) {
            *geom->mutable_source_asset_ref() = *asset_ref;
            *geom->mutable_computed_mass_properties() = *mp;
        }
        // Update geometry import result
        if (geometry_import_results_.count(geom_id)) {
            *geometry_import_results_[geom_id].mutable_source_asset_ref() = *asset_ref;
            *geometry_import_results_[geom_id].mutable_display_mesh() = bir.display_mesh();
            geometry_import_results_[geom_id].mutable_part_index()->CopyFrom(bir.part_index());
        }
        // Store shape by geometry_id
        if (imported_body.brep_shape) {
            shape_registry_.store(geom_id, *imported_body.brep_shape);
        }
    }

    body_import_results_[body_id] = bir;
    body_length_scales_[body_id] = length_scale;

    // Register topology context
    std::string ck = asset_cache_.compute_cache_key(new_file_path, density, tess_quality, unit_system);
    if (!ck.empty()) {
        remember_topology_context(ck, new_file_path, unit_system,
                                  density, tess_quality, {body_id});
        if (geom_ids_it != body_geometry_map_.end()) {
            for (const auto& geom_id : geom_ids_it->second) {
                geometry_topology_keys_[geom_id] = ck;
                geometry_length_scales_[geom_id] = length_scale;
            }
        }
    }

    spdlog::info("Asset relocated for body '{}': {}", body_proto->name(), new_file_path);

    protocol::Event event;
    event.set_sequence_id(sequence_id);
    auto* result = event.mutable_relocate_asset_result();
    *result->mutable_body() = std::move(bir);
    send_event(ws, event);
}

bool ImportProjectContext::ensure_geometry_shape_loaded(const std::string& geometry_id) {
    if (shape_registry_.get(geometry_id)) {
        return true;
    }

    const auto geometry_it = geometry_topology_keys_.find(geometry_id);
    if (geometry_it == geometry_topology_keys_.end()) {
        return false;
    }

    const auto ctx_it = asset_topology_contexts_.find(geometry_it->second);
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

    // Store shapes by geometry_id where possible, fall back to body_id.
    for (size_t i = 0; i < ctx.body_ids.size(); ++i) {
        const auto& topo_body = topology_result.bodies[i];
        if (topo_body.brep_shape) {
            const std::string& bid = ctx.body_ids[i];
            auto gids_it = body_geometry_map_.find(bid);
            if (gids_it != body_geometry_map_.end() && !gids_it->second.empty()) {
                // Store by geometry_id
                shape_registry_.store(gids_it->second[0], *topo_body.brep_shape);
            } else {
                // Fallback: store by body_id for pre-v4 compatibility
                shape_registry_.store(bid, *topo_body.brep_shape);
            }
        }
    }

    return shape_registry_.get(geometry_id) != nullptr;
}

bool ImportProjectContext::ensure_body_shape_loaded(const std::string& body_id) {
    // First check if any geometry for this body already has a shape loaded
    auto geom_ids_it = body_geometry_map_.find(body_id);
    if (geom_ids_it != body_geometry_map_.end()) {
        for (const auto& gid : geom_ids_it->second) {
            if (ensure_geometry_shape_loaded(gid)) {
                return true;
            }
        }
    }

    // Legacy path: check if shape stored by body_id (pre-v4 import)
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

double ImportProjectContext::body_length_scale(const std::string& body_id) const {
    const auto it = body_length_scales_.find(body_id);
    return it != body_length_scales_.end() ? it->second : 1.0;
}

double ImportProjectContext::geometry_length_scale(const std::string& geometry_id) const {
    const auto it = geometry_length_scales_.find(geometry_id);
    return it != geometry_length_scales_.end() ? it->second : 1.0;
}

void ImportProjectContext::remove_body_data(const std::string& body_id) {
    body_import_results_.erase(body_id);
    body_length_scales_.erase(body_id);
    body_topology_keys_.erase(body_id);

    // Remove associated geometry data
    auto it = body_geometry_map_.find(body_id);
    if (it != body_geometry_map_.end()) {
        for (const auto& gid : it->second) {
            remove_geometry_data(gid);
        }
        body_geometry_map_.erase(it);
    }
}

void ImportProjectContext::remove_geometry_data(const std::string& geometry_id) {
    geometry_import_results_.erase(geometry_id);
    geometry_length_scales_.erase(geometry_id);
    geometry_topology_keys_.erase(geometry_id);
    shape_registry_.remove(geometry_id);
}

void ImportProjectContext::reparent_geometry_data(const std::string& geometry_id,
                                                  const std::string& old_body_id,
                                                  const std::string& new_body_id) {
    if (!old_body_id.empty()) {
        auto old_it = body_geometry_map_.find(old_body_id);
        if (old_it != body_geometry_map_.end()) {
            auto& ids = old_it->second;
            ids.erase(std::remove(ids.begin(), ids.end(), geometry_id), ids.end());
            if (ids.empty()) {
                body_geometry_map_.erase(old_it);
            }
        }
    }

    if (!new_body_id.empty()) {
        auto& ids = body_geometry_map_[new_body_id];
        if (std::find(ids.begin(), ids.end(), geometry_id) == ids.end()) {
            ids.push_back(geometry_id);
        }
        auto scale_it = geometry_length_scales_.find(geometry_id);
        if (scale_it != geometry_length_scales_.end()) {
            body_length_scales_[new_body_id] = scale_it->second;
        }
    }
}

const protocol::GeometryImportResult* ImportProjectContext::get_geometry_import_result(
    const std::string& geometry_id) const {
    const auto it = geometry_import_results_.find(geometry_id);
    return it == geometry_import_results_.end() ? nullptr : &it->second;
}

std::string ImportProjectContext::normalize_unit_system(std::string unit_system) {
    std::transform(unit_system.begin(), unit_system.end(), unit_system.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    if (unit_system.empty()) return "millimeter";
    if (unit_system == "millimeter" || unit_system == "meter" || unit_system == "inch") {
        return unit_system;
    }
    return {};
}

double ImportProjectContext::unit_scale_to_meters(const std::string& unit_system) {
    if (unit_system == "meter") return 1.0;
    if (unit_system == "inch") return 0.0254;
    return 1e-3;
}

void ImportProjectContext::remember_topology_context(const std::string& cache_key,
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
        auto geom_it = body_geometry_map_.find(body_id);
        if (geom_it != body_geometry_map_.end()) {
            for (const auto& geometry_id : geom_it->second) {
                geometry_topology_keys_[geometry_id] = cache_key;
            }
        }
    }
}

} // namespace motionlab::transport_detail
