# Epic 13 — Body-Geometry Decoupling & Mass Property Overrides

> **Status:** Not started
> **Dependencies:** Epic 3 (OCCT import pipeline) — complete. Epic 5 (Datum CRUD) — complete. Epic 10 (Face-level topology) — complete. Epic 6 (Save/Load) — complete.
>
> **Governance note:** This is a breaking schema and protocol change (v3 -> v4). Full governance applies:
> - ADR required (ADR-0013) for the body-geometry separation contract
> - Protocol version bump required (PROTOCOL_VERSION 3 -> 4)
> - Project file version bump required (CURRENT_PROJECT_VERSION 2 -> 3) with v2 migration
> - Protocol/schema seam tests required at every affected boundary
> - Architecture docs updated

Three prompts. Prompt 1 is a BLOCKER. Prompts 2 and 3 can run in parallel after Prompt 1 succeeds.

## Motivation

Every serious multibody simulation tool separates the concept of "body" (a physical entity with mass, inertia, and a role in the kinematic chain) from "geometry" (a visual mesh derived from CAD that may optionally contribute mass properties). MotionLab currently conflates these: importing a STEP file creates Body entities with geometry baked in. The Body message carries both `mass_properties` and `source_asset_ref`/display mesh data as a single indivisible unit.

This creates real workflow limitations:

1. **No empty bodies.** Users cannot create a body with manually specified mass/inertia and no geometry. Point masses, virtual bodies for constraint routing, and simplified representations are impossible.
2. **No mass override.** Mass properties always come from CAD geometry via OCCT's `BRepGProp`. In practice, CAD models often have incorrect density, missing features, or are simplified representations. Engineers need to say "I know the real mass is 2.5 kg, not what the CAD says."
3. **No multi-geometry bodies.** A body like a wheel assembly (rim + tire + hub) requires one body with multiple geometries attached. Currently each STEP part becomes its own body.
4. **No geometry-free bodies.** Point masses and virtual constraint-routing bodies have no visual representation but need mass properties for the solver.
5. **Geometry tightly bound to body lifecycle.** You cannot detach geometry from one body and reattach it to another without re-importing.

## Prior Art

| Tool | Body concept | Geometry concept | Mass source |
|------|-------------|-----------------|-------------|
| MSC Adams | Part (mass, inertia, markers) | Geometry is optional attachment to Part | User-specified or computed from geometry |
| ANSYS Motion | Body with mass properties | Geometry attached separately | User-defined or from geometry |
| Simscape Multibody | Rigid Body block (mass, CoM, inertia) | Visual geometry is a separate File Solid or primitive | Independent of geometry |
| FreeCAD Assembly | Part with mass from shape | Shape = geometry + mass source | Always from shape, no override |

MotionLab currently behaves like FreeCAD — mass is inseparable from geometry. This epic moves MotionLab to the Adams/ANSYS/Simscape model where body and geometry are independent entities.

## Current State (What Exists)

### Schema (`schemas/mechanism/mechanism.proto`)
- `Body` message: `id`, `name`, `pose`, `mass_properties`, `source_asset_ref`, `is_fixed`
- `MassProperties` message: `mass`, `center_of_mass`, inertia tensor (6 values)
- `DisplayMesh` message: flat vertex/index/normal arrays
- `BodyDisplayData` in `ProjectFile`: ties `body_id` to `display_mesh` + `part_index` + import params
- `Mechanism` message: `repeated Body bodies`, `repeated Datum datums`, `repeated Joint joints`

### Protocol (`schemas/protocol/transport.proto`)
- `ImportAssetResult` returns `repeated BodyImportResult bodies` — each BodyImportResult contains body_id, name, display_mesh, mass_properties, pose, source_asset_ref, part_index
- `UpdateBodyCommand` only supports toggling `is_fixed`
- No CreateBody command — bodies are only created through import

### Engine (`native/engine/src/mechanism_state.h`)
- `MechanismState` stores `unordered_map<string, BodyEntry> bodies_` — Body protos keyed by ID
- `add_body()` takes mass, com, inertia, optional asset_ref
- No concept of geometry as a separate entity
- `build_mechanism_proto()` serializes bodies directly

### Engine — Import (`native/engine/src/transport_import_project_context.cpp`)
- Import creates one Body per STEP part
- Each body gets mass_properties from OCCT `BRepGProp`
- DisplayMesh and B-Rep shape stored alongside the body
- `body_import_results_` maps body_id -> BodyImportResult (holds display mesh)

### Engine — Simulation (`native/engine/src/simulation.cpp`)
- `compile()` reads `body.mass_properties()` directly and passes to Chrono
- `ch_body->SetMass(mp.mass())`, `SetInertiaXX`, `SetInertiaXY`
- No distinction between computed vs user-specified mass

### Frontend (`packages/frontend/src/stores/mechanism.ts`)
- `BodyState` interface: `id`, `name`, `meshData`, `partIndex`, `massProperties`, `pose`, `sourceAssetRef`, `isFixed`
- No geometry entity concept
- `addBodies()` adds bodies with mesh data included

### Frontend — Inspector (`packages/frontend/src/components/BodyInspector.tsx`)
- Shows mass, center of mass, inertia tensor as read-only values
- No override UI — values are display-only

### Frontend — Tree (`packages/frontend/src/components/ProjectTree.tsx`)
- Flat structure: Bodies group > individual bodies > datums under each body
- No geometry sub-nodes

## Shared Contract

| Interface | Owner | Consumer |
|-----------|-------|----------|
| `Geometry` proto message in mechanism.proto | Prompt 1 (defines) | Prompt 2 (frontend reads), Prompt 3 (inspector renders) |
| `Body.mass_override` flag in mechanism.proto | Prompt 1 (defines) | Prompt 3 (inspector toggles) |
| `CreateBodyCommand` / `CreateBodyResult` in transport.proto | Prompt 1 (proto + engine handler) | Prompt 2 (frontend sends) |
| `AttachGeometryCommand` / `DetachGeometryCommand` | Prompt 1 (proto + engine handler) | Prompt 2 (frontend sends on tree action) |
| `UpdateMassPropertiesCommand` / `UpdateMassPropertiesResult` | Prompt 1 (proto + engine handler) | Prompt 3 (inspector sends on edit) |
| Geometry entity in mechanism store | Prompt 2 (implements) | Prompt 3 (inspector reads) |
| `GeometryImportResult` in ImportAssetResult | Prompt 1 (engine emits) | Prompt 2 (frontend receives, creates scene meshes) |
| Mass aggregation logic (geometries -> body effective mass) | Prompt 1 (engine computes) | Prompt 3 (displays computed vs effective) |
| `BodyDisplayData` -> `GeometryDisplayData` in ProjectFile | Prompt 1 (migration) | Prompt 2 (load flow) |

Integration test: Create empty body -> import STEP -> attach geometry to body -> verify mass properties computed -> toggle mass override -> edit mass -> compile simulation -> verify solver uses overridden mass.

---

## Prompt 1: Schema & Engine — Body-Geometry Split

```
# Epic 13 — Schema & Engine: Body-Geometry Decoupling

You are implementing the engine-side infrastructure to separate Body (physical entity with mass and role in kinematic chain) from Geometry (visual mesh from CAD that may contribute mass properties). This is a breaking protocol change requiring a version bump and project file migration.

## Read These First (in order)
- `docs/architecture/principles.md` — engine is computational authority
- `docs/architecture/runtime-topology.md` — engine owns data model
- `native/engine/AGENTS.md` — native boundary rules, required checks
- `docs/domain/mechanism-model.md` — current Body, Datum definitions
- `docs/decisions/` — all existing ADRs, especially ADR-0009 (save/load), ADR-0010 (protocol v2), ADR-0012 (protocol v3)
- `schemas/mechanism/mechanism.proto` — current Body, MassProperties, DisplayMesh, Mechanism, ProjectFile
- `schemas/protocol/transport.proto` — current ImportAssetResult, BodyImportResult, UpdateBodyCommand
- `native/engine/src/mechanism_state.h` and `.cpp` — how bodies are stored and serialized
- `native/engine/src/transport_import_project_context.h` and `.cpp` — import and save/load flow
- `native/engine/src/simulation.cpp` — how mass properties are consumed during compile()

## Governance Reminder
This is Epic 13 — full governance applies:
- ADR-0013 required for body-geometry separation contract
- Protocol seam tests required for all new commands
- Architecture docs updated

## What Exists Now

### `schemas/mechanism/mechanism.proto`
Body carries everything: id, name, pose, mass_properties, source_asset_ref, is_fixed. There is no Geometry entity. The Mechanism message has `repeated Body bodies`. ProjectFile has `repeated BodyDisplayData` which maps body_id to display_mesh and import params.

### `schemas/protocol/transport.proto`
ImportAssetResult returns `repeated BodyImportResult bodies`. Each BodyImportResult bundles body_id, name, display_mesh, mass_properties, pose, source_asset_ref, part_index. There is no way to create an empty body — bodies only come from import. UpdateBodyCommand only toggles is_fixed.

### `native/engine/src/mechanism_state.h`
MechanismState has `unordered_map<string, BodyEntry> bodies_`. add_body() takes mass, com, inertia, optional asset_ref. No geometry storage. build_mechanism_proto() serializes bodies with all their fields.

### `native/engine/src/transport_import_project_context.cpp`
handle_import_asset(): for each STEP part, generates a UUIDv7 body_id, creates a BodyImportResult with mesh + mass, calls mechanism_state_.add_body(). Stores BodyImportResult in body_import_results_ map (used for save/load display data). handle_save_project(): iterates bodies, writes BodyDisplayData from body_import_results_. handle_load_project(): reads BodyDisplayData, reconstructs BodyImportResults.

### `native/engine/src/simulation.cpp`
compile() reads body.mass_properties() and passes mass, inertia to Chrono. No distinction between computed and user-specified mass.

## What to Build

### 1. Schema changes — mechanism.proto

Add Geometry message:

```protobuf
// Visual geometry attached to a body — imported from CAD.
// A body may have zero, one, or many geometries.
// Geometry optionally contributes computed mass properties.
message Geometry {
  ElementId id = 1;
  string name = 2;
  ElementId parent_body_id = 3;     // body this geometry is attached to
  Pose local_pose = 4;              // offset relative to body origin
  AssetReference source_asset_ref = 5;
  DisplayMesh display_mesh = 6;     // tessellated mesh for viewport
  MassProperties computed_mass_properties = 7;  // from CAD via BRepGProp
  uint32 face_count = 8;            // number of B-Rep faces (for face-aware picking)
}
```

Modify Body — remove source_asset_ref (geometry owns it now), add mass_override flag:

```protobuf
message Body {
  ElementId id = 1;
  string name = 2;
  Pose pose = 3;
  MassProperties mass_properties = 4;  // effective mass used by solver
  // source_asset_ref removed — now lives on Geometry
  bool is_fixed = 6;
  bool mass_override = 7;  // if true, mass_properties are user-set, not aggregated from geometries
}
```

Note: field number 5 (source_asset_ref) is deliberately skipped to maintain wire compatibility with v3 projects during migration. Old v3 Body messages with source_asset_ref at field 5 will simply have that field ignored when parsed as v4 Body.

Add Geometry to Mechanism:

```protobuf
message Mechanism {
  ElementId id = 1;
  string name = 2;
  repeated Body bodies = 3;
  repeated Datum datums = 4;
  repeated Joint joints = 5;
  repeated Load loads = 6;
  repeated Actuator actuators = 7;
  repeated Geometry geometries = 8;
}
```

Add GeometryDisplayData to ProjectFile (replaces BodyDisplayData for new projects):

```protobuf
message GeometryDisplayData {
  string geometry_id = 1;
  DisplayMesh display_mesh = 2;
  repeated uint32 part_index = 3;
  double density = 4;
  double tessellation_quality = 5;
  string unit_system = 6;
}

message ProjectFile {
  uint32 version = 1;
  ProjectMetadata metadata = 2;
  Mechanism mechanism = 3;
  repeated BodyDisplayData body_display_data = 4;  // kept for v2 backward compat
  repeated GeometryDisplayData geometry_display_data = 5;
}
```

### 2. Schema changes — transport.proto

Add new commands:

```protobuf
// Create an empty body with optional initial mass properties
message CreateBodyCommand {
  string name = 1;
  motionlab.mechanism.MassProperties mass_properties = 2;  // optional
  motionlab.mechanism.Pose pose = 3;                        // optional
  bool is_fixed = 4;
}

message CreateBodyResult {
  oneof result {
    motionlab.mechanism.Body body = 1;
    string error_message = 2;
  }
}

// Delete a body and all attached geometries, datums, and dependent joints
message DeleteBodyCommand {
  motionlab.mechanism.ElementId body_id = 1;
}

message DeleteBodyResult {
  oneof result {
    motionlab.mechanism.ElementId deleted_id = 1;
    string error_message = 2;
  }
}

// Attach a geometry to a body (or reassign from another body)
message AttachGeometryCommand {
  motionlab.mechanism.ElementId geometry_id = 1;
  motionlab.mechanism.ElementId target_body_id = 2;
  motionlab.mechanism.Pose local_pose = 3;  // optional offset
}

message AttachGeometryResult {
  oneof result {
    motionlab.mechanism.Geometry geometry = 1;
    string error_message = 2;
  }
}

// Detach geometry from its parent body (geometry becomes unparented)
message DetachGeometryCommand {
  motionlab.mechanism.ElementId geometry_id = 1;
}

message DetachGeometryResult {
  oneof result {
    motionlab.mechanism.ElementId detached_id = 1;
    string error_message = 2;
  }
}

// Update body mass properties (set override or revert to computed)
message UpdateMassPropertiesCommand {
  motionlab.mechanism.ElementId body_id = 1;
  bool mass_override = 2;                         // true = use provided values, false = recompute from geometries
  motionlab.mechanism.MassProperties mass_properties = 3;  // only used if mass_override = true
}

message UpdateMassPropertiesResult {
  oneof result {
    motionlab.mechanism.Body body = 1;    // returns body with effective mass properties
    string error_message = 2;
  }
}
```

Modify ImportAssetResult to return geometries instead of bodies:

```protobuf
message GeometryImportResult {
  string geometry_id = 1;                                   // UUIDv7
  string body_id = 2;                                       // auto-created parent body
  string name = 3;
  motionlab.mechanism.DisplayMesh display_mesh = 4;
  motionlab.mechanism.MassProperties computed_mass_properties = 5;
  motionlab.mechanism.Pose pose = 6;
  motionlab.mechanism.AssetReference source_asset_ref = 7;
  repeated uint32 part_index = 8;
}

message ImportAssetResult {
  bool success = 1;
  string error_message = 2;
  repeated BodyImportResult bodies = 3;            // DEPRECATED — kept for backward compat
  repeated string diagnostics = 4;
  repeated GeometryImportResult geometries = 5;    // NEW — v4 clients use this
}
```

Add all new commands/results to Command and Event oneofs:

```protobuf
// In Command oneof:
CreateBodyCommand create_body = 50;
DeleteBodyCommand delete_body = 51;
AttachGeometryCommand attach_geometry = 52;
DetachGeometryCommand detach_geometry = 53;
UpdateMassPropertiesCommand update_mass_properties = 54;

// In Event oneof:
CreateBodyResult create_body_result = 50;
DeleteBodyResult delete_body_result = 51;
AttachGeometryResult attach_geometry_result = 52;
DetachGeometryResult detach_geometry_result = 53;
UpdateMassPropertiesResult update_mass_properties_result = 54;
```

Also extend UpdateBodyCommand to accept name changes (needed for rename in tree):

```protobuf
message UpdateBodyCommand {
  motionlab.mechanism.ElementId body_id = 1;
  optional bool is_fixed = 2;
  optional string name = 3;  // NEW
}
```

### 3. MechanismState changes

Extend `mechanism_state.h` to store geometries:

```cpp
using GeometryEntry = motionlab::mechanism::Geometry;

struct GeometryResult {
    std::optional<GeometryEntry> entry;
    std::string error;
};

// New public methods:
GeometryResult add_geometry(const std::string& id, const std::string& name,
                            const std::string& parent_body_id,
                            const double pos[3], const double orient[4],
                            const motionlab::mechanism::MassProperties& computed_mass,
                            const motionlab::mechanism::AssetReference* source_asset_ref = nullptr,
                            uint32_t face_count = 0);

bool remove_geometry(const std::string& geometry_id);
const GeometryEntry* get_geometry(const std::string& id) const;
size_t geometry_count() const;

GeometryResult attach_geometry(const std::string& geometry_id, const std::string& body_id,
                               const double pos[3], const double orient[4]);
GeometryResult detach_geometry(const std::string& geometry_id);

// Get all geometries attached to a body
std::vector<const GeometryEntry*> get_body_geometries(const std::string& body_id) const;

// Aggregate mass properties from all attached geometries
// Returns the combined mass, center of mass, and inertia tensor
motionlab::mechanism::MassProperties compute_aggregate_mass(const std::string& body_id) const;

// Body mass management
bool set_mass_override(const std::string& body_id, bool override,
                       const motionlab::mechanism::MassProperties* user_mass = nullptr);

// New body creation (empty, no geometry required)
std::string create_body(const std::string& name, const double pos[3], const double orient[4],
                        const motionlab::mechanism::MassProperties* mass = nullptr,
                        bool is_fixed = false);

bool delete_body(const std::string& body_id);
bool rename_body(const std::string& body_id, const std::string& new_name);
```

Add private storage:

```cpp
std::unordered_map<std::string, GeometryEntry> geometries_;
```

Update `build_mechanism_proto()` to include geometries:

```cpp
for (const auto& [_, geom] : geometries_) {
    *mech_proto.add_geometries() = geom;
}
```

Update `load_from_proto()` to load geometries:

```cpp
for (const auto& geom : mech_proto.geometries()) {
    geometries_[geom.id().id()] = geom;
}
```

Update `clear()` to clear geometries.

### 4. Mass aggregation logic

Implement `compute_aggregate_mass()`:

When a body has no mass_override:
1. Collect all geometries attached to this body
2. Sum masses: total_mass = sum(geom.computed_mass_properties.mass)
3. Compute combined center of mass: weighted average of geometry CoMs
4. Transform each geometry's inertia tensor to body frame using parallel axis theorem
5. Sum transformed inertia tensors

This follows the standard rigid body mass aggregation formula (same as Adams PART/AGGREGATE).

When a body has mass_override = true:
- Return the user-specified mass_properties directly (skip aggregation)

### 5. Import flow changes

In `transport_import_project_context.cpp` handle_import_asset():

Currently: for each STEP part, create a body with mass.
New behavior: for each STEP part, create a Geometry AND auto-create a Body.

```cpp
for (const auto& body : import_result.bodies) {
    // Create the body
    std::string body_id = engine::generate_uuidv7();
    std::string geometry_id = engine::generate_uuidv7();

    // Create geometry
    auto* geom_result = proto_result.add_geometries();
    geom_result->set_geometry_id(geometry_id);
    geom_result->set_body_id(body_id);
    geom_result->set_name(body.name);
    // ... fill mesh, mass, pose, asset_ref, part_index ...

    // Also populate deprecated bodies field for backward compat
    auto* pb = proto_result.add_bodies();
    pb->set_body_id(body_id);
    // ... same as before ...

    // Register in mechanism state
    mechanism_state_.create_body(body_id, body.name, ...);
    mechanism_state_.add_geometry(geometry_id, body.name, body_id, ...);
    // Body mass = aggregated from geometry (automatic, since no override)
}
```

Update body_import_results_ to also track geometry_import_results_:

```cpp
std::unordered_map<std::string, protocol::GeometryImportResult> geometry_import_results_;
```

### 6. Save/Load migration

**Save:** Write GeometryDisplayData instead of (or in addition to) BodyDisplayData. Bump CURRENT_PROJECT_VERSION to 3.

**Load — v2 migration:** When loading a v2 project file:
1. For each Body that has source_asset_ref, create a synthetic Geometry entity
2. Generate a geometry ID (UUIDv5 derived from body ID for determinism)
3. Move source_asset_ref from body to geometry
4. Move display mesh data from BodyDisplayData to GeometryDisplayData
5. Set body.mass_override = false (mass comes from geometry, same as before)
6. Strip source_asset_ref from body

```cpp
static void migrate_v2_to_v3(mechanism::ProjectFile& file) {
    auto* mech = file.mutable_mechanism();
    for (const auto& body : mech->bodies()) {
        if (body.has_source_asset_ref()) {
            auto* geom = mech->add_geometries();
            // Generate deterministic geometry ID from body ID
            std::string geom_id = generate_uuidv5(body.id().id(), "geometry");
            geom->mutable_id()->set_id(geom_id);
            geom->set_name(body.name());
            *geom->mutable_parent_body_id() = body.id();
            // Identity local pose (geometry at body origin)
            geom->mutable_local_pose()->mutable_position();
            auto* q = geom->mutable_local_pose()->mutable_orientation();
            q->set_w(1.0);
            *geom->mutable_source_asset_ref() = body.source_asset_ref();
            *geom->mutable_computed_mass_properties() = body.mass_properties();
        }
    }
    // Also migrate BodyDisplayData -> GeometryDisplayData
    // ... (map body_id to geometry_id using same UUIDv5 derivation)

    // Clear source_asset_ref from bodies
    for (int i = 0; i < mech->bodies_size(); ++i) {
        mech->mutable_bodies(i)->clear_source_asset_ref();
    }
    file.set_version(3);
}
```

### 7. Simulation compilation update

In simulation.cpp compile(), the mass property consumption is unchanged — it reads body.mass_properties() which is the effective value (either aggregated or overridden). The engine ensures body.mass_properties is always up-to-date before compile.

Add a pre-compile step in the transport layer: before calling compile(), iterate all bodies and recompute aggregated mass for any body where mass_override is false:

```cpp
// Before compile:
for (auto& [id, body] : mechanism_state_.bodies()) {
    if (!body.mass_override()) {
        auto aggregate = mechanism_state_.compute_aggregate_mass(id);
        *body.mutable_mass_properties() = aggregate;
    }
}
```

### 8. ShapeRegistry update

Currently keyed by body_id. Change to geometry_id — shapes belong to geometries, not bodies.

```cpp
// In transport_import_project_context.cpp:
if (body.brep_shape) {
    shape_registry_.store(geometry_id, *body.brep_shape);  // was body_id
}
```

Update `handle_create_datum_from_face` to accept geometry_id instead of body_id, or add a mapping from body_id to geometry_ids so face picking can resolve through the geometry layer.

### 9. Transport command handlers

Wire the new commands in transport.cpp / transport_runtime_session.cpp:

- `kCreateBody`: call mechanism_state_.create_body(), send CreateBodyResult
- `kDeleteBody`: cascade delete (remove all attached geometries, datums referencing body, joints referencing those datums), send DeleteBodyResult
- `kAttachGeometry`: validate both exist, call mechanism_state_.attach_geometry(), recompute mass if no override, send AttachGeometryResult
- `kDetachGeometry`: call detach_geometry(), recompute mass, send DetachGeometryResult
- `kUpdateMassProperties`: call set_mass_override(), send UpdateMassPropertiesResult with updated body

### 10. Protocol version bump

In `packages/protocol/src/version.ts`:
```ts
export const PROTOCOL_VERSION = 4;
```

In `native/engine/include/engine/transport.h`:
```cpp
constexpr uint32_t PROTOCOL_VERSION = 4;
```

### 11. Run codegen

`pnpm generate:proto` — verify generated TS and C++ include all new messages.

### 12. Write tests

`native/engine/tests/test_mechanism_state.cpp` — extend existing tests:

1. **Create empty body:** create_body() with no mass -> body exists with zero mass
2. **Create body with mass:** create_body() with specified mass -> body has those properties
3. **Add geometry to body:** add_geometry() with computed mass -> geometry stored
4. **Mass aggregation (single geometry):** body with one geometry, no override -> body mass = geometry mass
5. **Mass aggregation (multiple geometries):** body with two geometries -> mass = sum, CoM = weighted average, inertia = parallel axis theorem
6. **Mass override:** set_mass_override(true, user_mass) -> body uses user values
7. **Mass override revert:** set_mass_override(false) -> body reverts to aggregated
8. **Attach geometry:** move geometry from body A to body B -> A's mass decreases, B's increases
9. **Detach geometry:** detach -> geometry unparented, body mass recalculated
10. **Delete body cascade:** delete body with geometries + datums -> all cleaned up
11. **Build mechanism proto:** geometries appear in proto output
12. **Load from proto:** geometries restored from proto

Protocol seam tests:
1. CreateBody -> verify body in MechanismSnapshot
2. Import STEP -> verify GeometryImportResult in result
3. AttachGeometry -> verify geometry parent changed
4. UpdateMassProperties with override -> verify body mass changed
5. Save/Load round-trip with geometries
6. Load v2 project -> migration creates geometries from old body data

### 13. Write ADR-0013

Document:
- Body and Geometry are separate first-class entities in the mechanism model
- Body owns mass properties (effective, used by solver); Geometry owns computed mass from CAD
- mass_override flag: when true, body mass is user-set; when false, aggregated from geometries
- Import creates both Geometry + Body (auto-parented) for backward-compatible workflow
- ProjectFile migration: v2 -> v3 creates Geometry entities from Body.source_asset_ref
- ShapeRegistry keyed by geometry_id (not body_id) for face-picking
- Wire compatibility: Body field 5 (source_asset_ref) skipped in v4, safely ignored

## Architecture Constraints
- Engine remains authoritative for mass computation from geometry (BRepGProp)
- Frontend NEVER computes mass — always asks engine
- Mass aggregation (parallel axis theorem) is an engine-side computation
- Geometry entities own the B-Rep shape reference (for face picking)
- Body entities own the effective mass (for simulation)
- Protocol must remain backward-compatible at the wire level (old field numbers preserved)
- Project file migration is engine-side (load v2 file, auto-create geometries)

## Done Looks Like
- `cmake --preset dev-linux && cmake --build build/dev-linux` succeeds
- `ctest --preset dev-linux` passes with all new tests
- `pnpm generate:proto` succeeds
- `pnpm --filter @motionlab/protocol typecheck` passes
- CreateBody, AttachGeometry, DetachGeometry, UpdateMassProperties commands work end-to-end
- Import creates Geometry + Body pairs
- Mass aggregation correct for single and multi-geometry bodies
- Mass override works (set and revert)
- v2 project files load correctly with migration
- ADR-0013 written
- Protocol version = 4

## What NOT to Build
- Frontend stores and UI (that's Prompts 2 and 3)
- Geometry inspector or body creation dialog (that's Prompt 3)
- Tree hierarchy changes (that's Prompt 2)
- Viewport visualization of mass properties (stretch goal in Prompt 3)
- Geometry primitives (sphere, box, cylinder) — future epic, import-only for now
```

---

## Prompt 2: Frontend Stores & Protocol Wiring

```
# Epic 13 — Frontend Stores, Protocol Wiring & Tree Hierarchy

You are implementing the frontend infrastructure for body-geometry decoupling: adding geometry entities to the mechanism store, wiring new protocol commands, updating the project tree to show the body > geometry hierarchy, and handling the updated import flow.

## Read These First (in order)
- `docs/architecture/principles.md` — React is NOT the hot path for viewport
- `packages/frontend/AGENTS.md` — frontend owns workbench UX
- `packages/viewport/AGENTS.md` — viewport owns visualization and picking
- `packages/protocol/AGENTS.md` — protocol boundary rules
- ADR-0013 (written in Prompt 1) — body-geometry separation contract
- `packages/frontend/src/stores/mechanism.ts` — current BodyState, store shape
- `packages/frontend/src/engine/connection.ts` — current event handling, send functions
- `packages/protocol/src/transport.ts` — current command builders
- `packages/frontend/src/components/ProjectTree.tsx` — current tree structure

## Governance Reminder
Full governance applies.

## What Exists Now

### `packages/frontend/src/stores/mechanism.ts`
BodyState interface with id, name, meshData, partIndex, massProperties, pose, sourceAssetRef, isFixed. Store has `bodies: Map<string, BodyState>`, `datums`, `joints`. Actions: addBodies, removeBody, addDatum, etc.

### `packages/frontend/src/engine/connection.ts`
Handles ImportAssetResult by creating BodyState objects from BodyImportResult and calling addBodies(). Sends commands via exported functions (sendUpdateBody, sendCreateDatum, etc.). Registers SceneGraphManager for direct mesh updates.

### `packages/protocol/src/transport.ts`
Command builder functions: createImportAssetCommand, createUpdateBodyCommand, createCreateDatumCommand, etc. Each creates a protobuf Command envelope, serializes to binary.

### `packages/frontend/src/components/ProjectTree.tsx`
Three groups: Bodies, Joints. Bodies group shows body nodes, each with datum children. Uses TreeView component from @motionlab/ui. Selection handled via useSelectionStore.

### `packages/viewport/src/scene-graph.ts`
SceneGraphManager.addBody() creates Babylon mesh from vertex/index/normal data. Meshes keyed by body ID. Body geometry index built from partIndex.

## What to Build

### 1. Add GeometryState to mechanism store

In `packages/frontend/src/stores/mechanism.ts`:

```ts
export interface GeometryState {
  id: string;
  name: string;
  parentBodyId: string | null;  // null = unparented
  localPose: BodyPose;
  meshData: MeshData;
  partIndex?: Uint32Array;
  computedMassProperties: BodyMassProperties;
  sourceAssetRef: { contentHash: string; originalFilename: string };
}

// Update BodyState — remove meshData and sourceAssetRef (geometry owns them now)
export interface BodyState {
  id: string;
  name: string;
  massProperties: BodyMassProperties;
  pose: BodyPose;
  isFixed?: boolean;
  massOverride?: boolean;
}
```

Add to store:

```ts
geometries: Map<string, GeometryState>;
addGeometries: (geometries: GeometryState[]) => void;
removeGeometry: (id: string) => void;
updateGeometryParent: (id: string, parentBodyId: string | null) => void;
updateBodyMass: (id: string, massProperties: BodyMassProperties, massOverride: boolean) => void;
```

Note: BodyState no longer carries meshData. The viewport gets mesh data from GeometryState. This is a significant refactor — all code that reads body.meshData must be updated to read from the body's geometries instead.

### 2. Add command builders to protocol/transport.ts

```ts
export function createCreateBodyCommand(
  name: string,
  options?: {
    massProperties?: { mass: number; centerOfMass: Vec3; ixx: number; iyy: number; izz: number; ixy: number; ixz: number; iyz: number };
    pose?: { position: Vec3; orientation: Quat };
    isFixed?: boolean;
  },
  sequenceId?: bigint,
): Uint8Array { ... }

export function createDeleteBodyCommand(
  bodyId: string,
  sequenceId?: bigint,
): Uint8Array { ... }

export function createAttachGeometryCommand(
  geometryId: string,
  targetBodyId: string,
  localPose?: { position: Vec3; orientation: Quat },
  sequenceId?: bigint,
): Uint8Array { ... }

export function createDetachGeometryCommand(
  geometryId: string,
  sequenceId?: bigint,
): Uint8Array { ... }

export function createUpdateMassPropertiesCommand(
  bodyId: string,
  massOverride: boolean,
  massProperties?: { mass: number; centerOfMass: Vec3; ixx: number; iyy: number; izz: number; ixy: number; ixz: number; iyz: number },
  sequenceId?: bigint,
): Uint8Array { ... }
```

### 3. Wire send functions in connection.ts

```ts
export function sendCreateBody(name: string, options?: CreateBodyOptions): void { ... }
export function sendDeleteBody(bodyId: string): void { ... }
export function sendAttachGeometry(geometryId: string, targetBodyId: string): void { ... }
export function sendDetachGeometry(geometryId: string): void { ... }
export function sendUpdateMassProperties(bodyId: string, massOverride: boolean, mass?: MassProps): void { ... }
```

### 4. Handle new events in connection.ts

Add cases to the event handler switch:

- `createBodyResult`: on success, call mechanism store addBodies with new body
- `deleteBodyResult`: on success, call removeBody + remove associated geometries from store
- `attachGeometryResult`: on success, call updateGeometryParent, trigger scene graph update
- `detachGeometryResult`: on success, update geometry parent to null
- `updateMassPropertiesResult`: on success, call updateBodyMass

### 5. Update import result handling

Handle GeometryImportResult from the updated ImportAssetResult:

```ts
case 'importAssetResult': {
  const result = payload.value;
  if (result.success) {
    // V4 path: use geometries field
    if (result.geometries.length > 0) {
      const bodies: BodyState[] = [];
      const geometries: GeometryState[] = [];
      const seenBodies = new Set<string>();

      for (const geom of result.geometries) {
        // Create body if not yet seen
        if (!seenBodies.has(geom.bodyId)) {
          seenBodies.add(geom.bodyId);
          bodies.push({
            id: geom.bodyId,
            name: geom.name,
            massProperties: extractMassProperties(geom.computedMassProperties),
            pose: extractPose(geom.pose),
            isFixed: false,
            massOverride: false,
          });
        }
        // Create geometry
        geometries.push({
          id: geom.geometryId,
          name: geom.name,
          parentBodyId: geom.bodyId,
          localPose: IDENTITY_POSE,
          meshData: extractMeshData(geom.displayMesh),
          partIndex: geom.partIndex.length > 0 ? new Uint32Array(geom.partIndex) : undefined,
          computedMassProperties: extractMassProperties(geom.computedMassProperties),
          sourceAssetRef: extractAssetRef(geom.sourceAssetRef),
        });
      }

      mechanismStore.addBodies(bodies);
      mechanismStore.addGeometries(geometries);

      // Add meshes to viewport via SceneGraphManager
      for (const geom of geometries) {
        sceneGraphManager?.addBody(geom.parentBodyId!, geom.name, geom.meshData, ...);
      }
    }
    // Fallback: V3 path (deprecated bodies field) for backward compat
    else if (result.bodies.length > 0) {
      // ... existing logic ...
    }
  }
}
```

### 6. Update SceneGraphManager integration

The SceneGraphManager.addBody() call now needs to use geometry mesh data instead of body mesh data. Since a body can have multiple geometries, either:

**Option A (simpler, recommended for now):** Merge all geometry meshes into one mesh per body when adding to scene graph. This maintains the current 1-mesh-per-body invariant that the viewport, picking, and face highlighting depend on.

**Option B (future):** One mesh per geometry, grouped under a TransformNode per body.

Go with Option A for now. When adding geometries to a body, concatenate vertex/index/normal/partIndex arrays. This matches how STEP multi-part assemblies already work (the import creates one mesh per STEP part, which is now one geometry).

For single-geometry bodies (the common case), this is identical to current behavior.

### 7. Update ProjectTree

Add geometry nodes under body nodes:

```
Bodies
  ├── Body "Link1"
  │   ├── 📐 Geometry "Link1" (from CAD)
  │   ├── ⊕ Datum "Face 1"
  │   └── ⊕ Datum "Axis 2"
  ├── Body "PointMass" (no geometry children)
  │   └── ⊕ Datum "Origin"
  └── ...
Joints
  └── ...
```

Extend the node type discriminator:

```ts
type NodeType = 'root' | 'group' | 'body' | 'geometry' | 'datum' | 'joint';
```

Add geometry icon (use `Shapes` from lucide-react).

Build tree nodes:

```ts
// Under each body node, add geometry children before datum children
const geometryNodes: TreeNode[] = Array.from(geometries.values())
  .filter(g => g.parentBodyId === body.id)
  .map(g => ({
    id: g.id,
    label: g.name,
    icon: ICONS.geometry,
    children: [],
  }));

const datumNodes = /* ... existing ... */;
bodyNode.children = [...geometryNodes, ...datumNodes];
```

### 7b. Connection-aware context indicators in tree

**The model tree should show relationships, not just entities.** When a body is selected, users need to immediately see which joints connect to it, which forces act on it, and which datums are used by joints. Add lightweight cross-reference indicators:

**Connected entities badges on body nodes:**
When a body node is selected (or hovered), show small connection indicators:
- Number of joints connected to this body: e.g., a small badge "(2 joints)" after the body name in muted text
- If any datums on this body are used as joint parents/children, show which joints (as secondary text or tooltip)

**Joint node secondary text:**
Each joint node should show its connection: `"Link1 ↔ Link2"` as secondary text, making the joint's body relationship visible at a glance without selecting it.

**Implementation:** Build a lightweight `connectionIndex` derived from the mechanism store:
```ts
const connectionIndex = useMemo(() => {
  const bodyJoints = new Map<string, string[]>(); // bodyId → [jointId, ...]
  for (const [jid, joint] of joints) {
    const parentBody = datums.get(joint.parentDatumId)?.parentBodyId;
    const childBody = datums.get(joint.childDatumId)?.parentBodyId;
    if (parentBody) push(bodyJoints, parentBody, jid);
    if (childBody) push(bodyJoints, childBody, jid);
  }
  return { bodyJoints };
}, [joints, datums]);
```

This is a lightweight version of the "connection view" pattern. A full graph-based model browser (with drag-and-drop reassignment) is future work, but showing connection counts and joint labels is low-cost and high-value for spatial reasoning.

### 8. Update load project flow

Handle the updated LoadProjectSuccess which now includes geometry data. When loading v2 projects that were migrated by the engine, the response will include both deprecated bodies and new geometries fields.

### 9. Selection store updates

When selecting a geometry node in the tree, show the GeometryInspector (Prompt 3). Add 'geometry' to the entity type discriminator in the selection store if needed.

### 10. Update body-poses store

Body poses during simulation are unchanged — bodies still get pose updates. Geometries are rigidly attached to bodies, so their viewport positions are computed as body_pose * geometry_local_pose.

## Architecture Constraints
- Mechanism store is the single source of truth for geometry entities
- SceneGraphManager still uses body-level meshes (merged from geometries) — no per-geometry meshes yet
- PartIndex and face highlighting remain body-scoped (merged partIndex from all geometries)
- Body selection still selects the body — geometry selection is for inspection only
- Import still creates body+geometry pairs automatically (user doesn't manually create bodies then attach)

## Done Looks Like
- `pnpm --filter @motionlab/frontend typecheck` passes
- `pnpm --filter @motionlab/viewport typecheck` passes
- `pnpm --filter @motionlab/protocol typecheck` passes
- Import creates both Body and Geometry entities in the store
- ProjectTree shows geometry nodes under body nodes
- New send functions wired for CreateBody, DeleteBody, AttachGeometry, DetachGeometry, UpdateMassProperties
- Event handlers update store correctly for all new result types
- Load project works with both v2 (migrated) and v3 project files
- Face highlighting still works (partIndex flows through geometry)

## What NOT to Build
- Body or geometry inspector UI (that's Prompt 3)
- CreateBody dialog (that's Prompt 3)
- Mass override editing UI (that's Prompt 3)
- Drag-and-drop geometry reparenting in tree (stretch goal)
- Per-geometry meshes in viewport (future — use merged meshes for now)
```

---

## Prompt 3: Body & Geometry Inspector UI

```
# Epic 13 — Body Inspector, Geometry Inspector & Mass Override UI

You are implementing the UI for body-geometry decoupling: a CreateBody dialog for empty bodies, an enhanced BodyInspector with mass override controls, a new GeometryInspector, and the attach/detach geometry actions.

## Read These First (in order)
- `docs/architecture/principles.md` — engine is authority for mass computation
- `packages/frontend/AGENTS.md` — frontend owns workbench UX
- `packages/ui/AGENTS.md` — design system rules (Tailwind v4, shadcn/ui, longhand padding)
- ADR-0013 (written in Prompt 1) — body-geometry separation contract
- `packages/frontend/src/components/BodyInspector.tsx` — current body inspector (read-only mass)
- `packages/frontend/src/components/MechanismInspector.tsx` — inspector routing
- `packages/frontend/src/components/ImportSettingsDialog.tsx` — dialog pattern reference
- `packages/ui/src/components/primitives/numeric-input.tsx` — NumericInput component
- `packages/ui/src/components/primitives/inspector-panel.tsx` — InspectorPanel component
- `packages/ui/src/components/primitives/inspector-section.tsx` — InspectorSection component
- `packages/ui/src/components/primitives/property-row.tsx` — PropertyRow component

## Governance Reminder
Full governance applies.

## What Exists Now

### `packages/frontend/src/components/BodyInspector.tsx`
Shows: Identity section (name, source file, body ID, fixed toggle), Mass Properties section (mass in kg, center of mass Vec3, inertia tensor). All mass values are read-only formatted with formatEngValue(). Uses InspectorPanel, InspectorSection, PropertyRow from @motionlab/ui. Shows live pose during simulation.

### `packages/frontend/src/components/MechanismInspector.tsx`
Routes to BodyInspector, DatumInspector, or JointInspector based on selection type.

### `packages/ui/src/components/primitives/numeric-input.tsx`
NumericInput component with value, onChange, min, max, step, unit props. Already supports engineering formatting.

### `packages/frontend/src/components/ImportSettingsDialog.tsx`
Dialog pattern: uses Dialog, DialogContent, DialogHeader, DialogTitle from @motionlab/ui. Form with labeled inputs, submit button.

### Command senders (from Prompt 2)
sendCreateBody(), sendDeleteBody(), sendAttachGeometry(), sendDetachGeometry(), sendUpdateMassProperties().

### Store (from Prompt 2)
GeometryState with computedMassProperties, sourceAssetRef. BodyState with massOverride flag. updateBodyMass() action.

## What to Build

### 1. CreateBody dialog

Create `packages/frontend/src/components/CreateBodyDialog.tsx`:

A dialog for creating an empty body (no geometry). Fields:

- **Name** (text input, required, default: "Body N" where N = body count + 1)
- **Mass** (NumericInput, optional, unit: kg, default: 1.0)
- **Fixed (Ground)** (Switch, default: false)
- **Create** button

On submit: call sendCreateBody(name, { massProperties: { mass, ... }, isFixed }).

The dialog should be triggerable from:
- A "+" button next to the Bodies group header in ProjectTree
- A menu action

```tsx
export function CreateBodyDialog({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [mass, setMass] = useState(1.0);
  const [isFixed, setIsFixed] = useState(false);
  const bodyCount = useMechanismStore(s => s.bodies.size);

  const effectiveName = name || `Body ${bodyCount + 1}`;

  const handleCreate = () => {
    sendCreateBody(effectiveName, {
      massProperties: {
        mass,
        centerOfMass: { x: 0, y: 0, z: 0 },
        ixx: mass * 0.01, iyy: mass * 0.01, izz: mass * 0.01,
        ixy: 0, ixz: 0, iyz: 0,
      },
      isFixed,
    });
    onOpenChange(false);
    setName('');
    setMass(1.0);
    setIsFixed(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Body</DialogTitle>
        </DialogHeader>
        {/* Name input */}
        {/* Mass input with NumericInput */}
        {/* Fixed toggle with Switch */}
        {/* Create button */}
      </DialogContent>
    </Dialog>
  );
}
```

### 2. Enhanced BodyInspector with mass override

Update `packages/frontend/src/components/BodyInspector.tsx`:

Add a mass override section:

```tsx
<InspectorSection title="Mass Properties" icon={<Scale className="size-3.5" />}>
  {/* Mass source indicator */}
  <PropertyRow label="Source">
    <span className="text-2xs text-[var(--text-secondary)]">
      {body.massOverride ? 'User override' : `Computed (${geometryCount} geometries)`}
    </span>
  </PropertyRow>

  {/* Override toggle */}
  <PropertyRow label="Override">
    <div className="flex items-center gap-1.5">
      <Switch
        size="sm"
        checked={body.massOverride ?? false}
        onCheckedChange={(checked) => {
          if (checked) {
            // Switch to override mode — keep current values as starting point
            sendUpdateMassProperties(body.id, true, body.massProperties);
          } else {
            // Revert to computed — engine will recalculate from geometries
            sendUpdateMassProperties(body.id, false);
          }
        }}
        disabled={isSimulating}
      />
    </div>
  </PropertyRow>

  {/* Mass value — editable when override is on */}
  <PropertyRow label="Mass" unit="kg" numeric>
    {body.massOverride ? (
      <NumericInput
        value={mp.mass}
        onChange={(v) => sendUpdateMassProperties(body.id, true, { ...mp, mass: v })}
        min={0.001}
        step={0.1}
        disabled={isSimulating}
      />
    ) : (
      <span className="font-[family-name:var(--font-mono)] tabular-nums">
        {formatEngValue(mp.mass)}
      </span>
    )}
  </PropertyRow>

  {/* Center of mass — editable when override is on */}
  {body.massOverride ? (
    <EditableVec3
      label="Center of Mass"
      value={mp.centerOfMass}
      unit="m"
      onChange={(v) => sendUpdateMassProperties(body.id, true, { ...mp, centerOfMass: v })}
      disabled={isSimulating}
    />
  ) : (
    <Vec3Display label="Center of Mass" value={mp.centerOfMass} unit="m" />
  )}
</InspectorSection>

{/* Inertia section — editable when override is on */}
<InspectorSection title="Inertia Tensor" icon={<Grid3X3 className="size-3.5" />}>
  {body.massOverride ? (
    <EditableInertiaMatrix
      ixx={mp.ixx} iyy={mp.iyy} izz={mp.izz}
      ixy={mp.ixy} ixz={mp.ixz} iyz={mp.iyz}
      unit="kg m²"
      onChange={(values) => sendUpdateMassProperties(body.id, true, { ...mp, ...values })}
      disabled={isSimulating}
    />
  ) : (
    <InertiaMatrixDisplay
      ixx={mp.ixx} iyy={mp.iyy} izz={mp.izz}
      ixy={mp.ixy} ixz={mp.ixz} iyz={mp.iyz}
      unit="kg m²"
    />
  )}
</InspectorSection>

{/* Recalculate button — visible when override is on */}
{body.massOverride && (
  <div className="ps-3 pe-3 pb-2">
    <button
      className="w-full text-2xs py-1 rounded border border-[var(--border-secondary)] hover:bg-[var(--bg-hover)]"
      onClick={() => sendUpdateMassProperties(body.id, false)}
      disabled={isSimulating}
    >
      Recalculate from Geometry
    </button>
  </div>
)}
```

### 3. GeometryInspector

Create `packages/frontend/src/components/GeometryInspector.tsx`:

Shows geometry details when a geometry node is selected in the tree.

```tsx
export function GeometryInspector() {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const geometries = useMechanismStore((s) => s.geometries);
  const bodies = useMechanismStore((s) => s.bodies);

  const firstId = selectedIds.values().next().value as string | undefined;
  const geometry = firstId ? geometries.get(firstId) : undefined;

  if (!geometry) return <InspectorPanel />;

  const parentBody = geometry.parentBodyId ? bodies.get(geometry.parentBodyId) : undefined;
  const mp = geometry.computedMassProperties;

  return (
    <InspectorPanel
      entityName={geometry.name}
      entityType="Geometry"
      entityIcon={<Shapes className="size-5" />}
    >
      <InspectorSection title="Identity" icon={<Fingerprint className="size-3.5" />}>
        <PropertyRow label="Name">
          <span className="text-2xs truncate">{geometry.name}</span>
        </PropertyRow>
        <PropertyRow label="Source File">
          <span className="text-2xs truncate">
            {geometry.sourceAssetRef.originalFilename || '\u2014'}
          </span>
        </PropertyRow>
        <PropertyRow label="Parent Body">
          <span className="text-2xs truncate">
            {parentBody?.name || 'Unparented'}
          </span>
        </PropertyRow>
        <PropertyRow label="Geometry ID">
          <CopyableId value={geometry.id} />
        </PropertyRow>
      </InspectorSection>

      <InspectorSection title="Computed Mass" icon={<Scale className="size-3.5" />}>
        <PropertyRow label="Mass" unit="kg" numeric>
          <span className="font-[family-name:var(--font-mono)] tabular-nums">
            {formatEngValue(mp.mass)}
          </span>
        </PropertyRow>
        <Vec3Display
          label="Center of Mass"
          value={mp.centerOfMass}
          unit="m"
        />
      </InspectorSection>

      <InspectorSection title="Computed Inertia" icon={<Grid3X3 className="size-3.5" />}>
        <InertiaMatrixDisplay
          ixx={mp.ixx} iyy={mp.iyy} izz={mp.izz}
          ixy={mp.ixy} ixz={mp.ixz} iyz={mp.iyz}
          unit="kg m²"
        />
      </InspectorSection>

      <InspectorSection title="Local Pose" icon={<Move3D className="size-3.5" />}>
        <Vec3Display
          label="Offset"
          value={geometry.localPose.position}
          unit="m"
        />
        <QuatDisplay
          value={geometry.localPose.rotation}
          label="Rotation"
        />
      </InspectorSection>
    </InspectorPanel>
  );
}
```

### 4. Inspector routing

Update `MechanismInspector.tsx` to route geometry selections to GeometryInspector:

```tsx
// Determine entity type from selection
const isGeometry = firstId ? mechanismStore.geometries.has(firstId) : false;

if (isGeometry) return <GeometryInspector />;
// ... existing body, datum, joint routing ...
```

### 5. Attach/Detach geometry actions

**In ProjectTree context menu for geometry nodes:**

```tsx
<GeometryContextMenu>
  <MenuItem onClick={() => sendDetachGeometry(geom.id)}>
    Detach from Body
  </MenuItem>
  <MenuItem onClick={() => openAttachDialog(geom.id)}>
    Attach to Body...
  </MenuItem>
</GeometryContextMenu>
```

**AttachGeometryDialog:** A simple dialog with a body selector (dropdown of all bodies). On confirm, calls sendAttachGeometry(geometryId, selectedBodyId).

**Drag-and-drop (stretch goal):** Dragging a geometry node onto a body node in the tree calls sendAttachGeometry. This is a stretch goal — context menu is the MVP.

### 6. Delete body action

Add delete option to body context menu:

```tsx
<BodyContextMenu>
  {/* existing items */}
  <MenuItem
    onClick={() => sendDeleteBody(body.id)}
    disabled={isSimulating}
    variant="destructive"
  >
    Delete Body
  </MenuItem>
</BodyContextMenu>
```

Show confirmation if the body has attached geometries or datums.

### 7. Editable mass property components

Create helper components for the editable mass override UI:

**EditableVec3:** A Vec3 display that switches to three NumericInputs when editable.

```tsx
function EditableVec3({ label, value, unit, onChange, disabled }: {
  label: string;
  value: { x: number; y: number; z: number };
  unit: string;
  onChange: (v: { x: number; y: number; z: number }) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <PropertyRow label={`${label} X`} unit={unit} numeric>
        <NumericInput value={value.x} onChange={(v) => onChange({ ...value, x: v })} disabled={disabled} />
      </PropertyRow>
      <PropertyRow label={`${label} Y`} unit={unit} numeric>
        <NumericInput value={value.y} onChange={(v) => onChange({ ...value, y: v })} disabled={disabled} />
      </PropertyRow>
      <PropertyRow label={`${label} Z`} unit={unit} numeric>
        <NumericInput value={value.z} onChange={(v) => onChange({ ...value, z: v })} disabled={disabled} />
      </PropertyRow>
    </div>
  );
}
```

**EditableInertiaMatrix:** Similar pattern for the 6-value inertia tensor.

### 8. Mass property visualization in viewport (stretch goal)

If time permits, add viewport overlays for mass properties:

- **Center of mass indicator:** Small sphere or crosshair at the body's CoM position
- **Inertia ellipsoid:** Semi-transparent ellipsoid scaled by principal inertia axes

These are stretch goals. The inspector UI is the priority.

## Architecture Constraints
- All mass editing goes through the engine via sendUpdateMassProperties — frontend never computes mass
- NumericInput changes should debounce before sending to engine (avoid flooding WebSocket)
- Mass override state is authoritative from the engine response, not optimistically set
- Geometry inspector is read-only (computed mass from CAD cannot be edited — only body mass can be overridden)
- Use longhand padding (ps-/pe-) not shorthand (px-) per Tailwind v4 rules in MEMORY.md
- Inspector components use existing @motionlab/ui primitives — do not create new design primitives without checking packages/ui/AGENTS.md

## Expected Behavior (testable)

### CreateBody dialog
1. Open dialog -> name defaults to "Body N"
2. Enter name, mass, toggle fixed -> click Create
3. New body appears in tree with no geometry children
4. Body inspector shows user-specified mass
5. Body has massOverride = true (since mass was manually set)

### Incomplete entity support
1. Create an empty body (no geometry, no joints) -> tree shows the body with a subtle "incomplete" indicator (e.g., a small amber dot or dashed icon outline)
2. The indicator conveys "this body has no geometry attached" — it is not an error, just a visual cue that the model is in progress
3. The body is fully functional — it can be assigned datums, connected via joints, and used in simulation (as a point mass)
4. Import geometry later and attach it → indicator disappears
5. Create a body before importing the second part of an assembly → joint creation can reference this body immediately (partially-defined mechanism is valid during authoring)

### Mass override toggle
1. Select imported body (has geometry, no override) -> mass shows as "Computed (1 geometry)"
2. Toggle override ON -> mass fields become editable, values stay the same
3. Edit mass to 5.0 kg -> sendUpdateMassProperties fired
4. Engine responds with updated body -> inspector shows 5.0 kg, source = "User override"
5. Click "Recalculate from Geometry" -> override OFF, mass reverts to computed value

### Geometry inspector
1. Select geometry node in tree -> GeometryInspector shows
2. Shows source file, parent body name, computed mass (read-only), local pose
3. Computed mass values are display-only (not editable)

### Attach/Detach
1. Right-click geometry -> "Detach from Body" -> geometry becomes unparented
2. Right-click unparented geometry -> "Attach to Body..." -> dialog with body list
3. Select body, confirm -> geometry appears under that body in tree
4. Body mass recalculated to include new geometry

## Done Looks Like
- CreateBody dialog creates empty bodies
- BodyInspector shows mass source (computed vs override) and toggle
- Mass override enables editing mass, CoM, inertia in inspector
- "Recalculate from Geometry" reverts to computed mass
- GeometryInspector shows computed mass and source file
- Geometry nodes in project tree under body nodes
- Attach/Detach geometry works via context menu
- Delete body works with cascade confirmation
- `pnpm --filter @motionlab/frontend typecheck` passes
- `pnpm --filter @motionlab/ui typecheck` passes

## What NOT to Build
- Drag-and-drop geometry reparenting (stretch goal, not MVP)
- Mass property viewport visualization (stretch goal)
- Geometry creation from primitives (future epic)
- Geometry editing (transform, scale) — future
- Multi-select geometry operations
```

---

## Integration Verification

After all three prompts complete, verify the full body-geometry decoupling flow:

1. **Create empty body:** Use CreateBody dialog -> body appears in tree with no geometry, mass = user-specified
2. **Import STEP:** Import a multi-part STEP file -> creates body + geometry pairs, geometry nodes visible in tree
3. **Inspect geometry:** Select geometry node -> GeometryInspector shows computed mass from CAD
4. **Inspect body:** Select body node -> BodyInspector shows mass source = "Computed (1 geometry)"
5. **Mass override:** Toggle override ON -> edit mass to different value -> verify inspector updates
6. **Recalculate:** Click "Recalculate from Geometry" -> mass reverts to CAD-computed value
7. **Attach geometry to different body:** Create empty body, detach geometry from original, attach to new body -> mass transfers
8. **Compile simulation:** With overridden mass, compile and run -> verify simulation uses overridden value
9. **Save/Load:** Save project, reload -> mass override state preserved, geometry-body relationships preserved
10. **Load v2 project:** Load a project saved before Epic 13 -> migration creates geometries from old body data, everything works
11. **Face picking:** Face highlighting and datum-from-face still work (partIndex flows through geometry)
12. **Typecheck:** All `pnpm --filter ... typecheck` pass
13. **Engine tests:** `ctest --preset dev-linux` passes

## Future Work (out of scope)

- **Geometry primitives:** Create box, cylinder, sphere geometries without CAD import
- **Per-geometry viewport meshes:** Separate Babylon meshes per geometry with independent transforms (needed for geometry local pose editing)
- **Drag-and-drop reparenting:** Drag geometry onto body in tree to reparent
- **Mass property visualization:** CoM indicator and inertia ellipsoid in viewport
- **Density override per geometry:** Override density on individual geometries before aggregation
- **Geometry transforms:** Edit local pose offset of geometry relative to body
- **Copy/mirror geometry:** Duplicate a geometry and attach to another body
