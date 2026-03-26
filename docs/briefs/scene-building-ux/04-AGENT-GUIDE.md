# MotionLab — Agent Implementation Guide

## Purpose

This document gives coding agents the strategic context they need to make good implementation decisions. It defines module boundaries, integration points, and anti-patterns. It does NOT prescribe data structures, keyboard shortcuts, or specific UI layouts — those decisions belong to agents with actual codebase access.

---

## Tech Stack

- **Frontend:** React, TypeScript, Tailwind CSS, Radix primitives, Zustand state management
- **3D Viewport:** React Three Fiber + Three.js, with three-mesh-bvh for BVH-accelerated raycasting
- **Desktop Shell:** Electron (window lifecycle, native file dialogs, engine supervision)
- **Communication:** WebSocket + binary Protobuf. Electron IPC is used only to bootstrap the engine endpoint (host, port, session token). All authoring and simulation data flows over the WebSocket.
- **CAD Backend:** C++ using Open CASCADE Technology (OCCT/XDE) for STEP/IGES import, integrated in the native engine binary
- **Physics Backend:** C++ using Project Chrono
- **Protocol:** Protobuf-es generated types from `schemas/` directory. Command → Event pattern with sequence IDs.

---

## Module Boundaries

### Asset Browser (bottom panel — planned)

**Responsibility:** Browse imported assets, create new instances, manage primitives.

This module will own the Assets tab in the full-width bottom panel. It reads from the mechanism store (geometry entries and their asset references) to show what's been imported. It enables drag-to-place for creating new Body+Geometry pairs from existing assets.

For now, assets are imported via the toolbar and managed through the scene tree.

### Scene Tree (left panel)

**Responsibility:** Hierarchical view of all authored entities.

This module owns the left panel. It shows Bodies (with child Geometries and Datums), Joints, Loads, and Actuators in organized groups. It provides entity creation menus, context menus, drag-and-drop for reparenting, and search/filter.

The scene tree reads from the mechanism store and dispatches mutations through protocol commands.

### Viewport

**Responsibility:** React Three Fiber rendering, entity selection, transform manipulation, and tool interactions.

The viewport syncs entity state to Three.js objects via `scene-graph-three.ts`. When entities change in the store, the viewport updates. When the user selects or manipulates objects, the viewport writes back through protocol commands.

Viewport tools (datum creation by face-click, joint creation by datum-pair selection) are interaction modes managed by `useToolModeStore`. Tool modes: `select`, `create-datum`, `create-joint`, `create-load`.

Face-level picking uses BVH-accelerated raycasting with `part_index` mapping to resolve raycast triangle hits to B-Rep face indices.

### Inspector (right panel)

**Responsibility:** Property editor for the selected entity.

Routes to entity-type-specific inspectors (BodyInspector, GeometryInspector, DatumInspector, JointInspector, LoadInspector, ActuatorInspector) based on the selected entity type. Each inspector uses shared UI components from `@motionlab/ui` (InspectorPanel, InspectorSection, PropertyRow, etc.).

All edits dispatch protocol commands to the engine. The inspector respects simulation state (read-only during playback).

### Engine Connection

**Responsibility:** WebSocket lifecycle, command dispatch, event handling.

`packages/frontend/src/engine/connection.ts` manages the WebSocket connection to the native engine. On startup, it gets the engine endpoint via Electron IPC (`window.motionlab.getEngineEndpoint()`), connects, performs the protobuf handshake, and begins handling events.

Event handlers update the relevant Zustand stores (mechanism, simulation, traces, body-poses). The connection module also handles simulation frame streaming (body poses go to a non-React cache for performance, not Zustand).

### Protocol Layer

**Responsibility:** Protobuf serialization, command builders, event parsers.

`packages/protocol/src/transport.ts` provides builder functions for every command type (`createCreateDatumCommand`, `createCreateJointCommand`, etc.) and a `parseEvent` function that deserializes engine events.

Generated types come from `schemas/protocol/transport.proto` and `schemas/mechanism/mechanism.proto`.

---

## Integration: Frontend ↔ Native Engine

All mutation flows through WebSocket commands. The pattern:

1. Frontend builds a `Command` protobuf message
2. Sends binary frame over WebSocket
3. Engine validates, executes, updates its authoritative `MechanismState`
4. Engine sends a `Result` event back over WebSocket
5. Frontend `parseEvent` → handler updates Zustand store

**Key backend operations:**

**CAD import:** `ImportAssetCommand` with file path and options (density, tessellation quality, unit system). Engine parses STEP via OCCT, computes tessellation and solid properties, caches results. Returns bodies, geometries, and display mesh data.

**Datum creation from face:** `CreateDatumFromFaceCommand` with geometry_id and face_index. Engine looks up the B-Rep face, computes a datum pose from the face geometry, classifies the surface type. Returns datum and surface class.

**Mass computation:** Happens automatically during import for valid closed solids. Manual refresh available via future protocol extension.

**Compilation:** `CompileMechanismCommand` translates the authored mechanism to Chrono objects. Returns success/failure, diagnostics, and output channel descriptors.

**Simulation:** `SimulationControlCommand` with PLAY/PAUSE/STEP/RESET. Engine streams `SimulationFrame` (body poses) and `SimulationTrace` (channel samples) back.

---

## Build Order for Remaining Features

The following are ordered by dependency and value. Many can be parallelized.

### Parallel Track A — Bottom Panel + Asset Browser

1. Rework the bottom dock to span full window width (currently positioned between left/right panels)
2. Move timeline into a tab within the new full-width bottom panel
3. Add Assets tab with imported asset cards and search
4. Add drag-to-place from asset browser to viewport

### Parallel Track B — Inspector Polish

1. Create shared inspector section renderers (Identity, Pose, Traces) reusable across entity types
2. Refactor existing inspectors to use shared sections
3. Add "add component" affordances (e.g., "Add Motor" button on joint inspector when no actuator exists)

### Parallel Track C — Primitive Entities

1. Engine-side: generate mesh data for parametric shapes (box, cylinder, sphere)
2. Protocol: primitive creation command
3. Frontend: primitive cards in asset browser, creation flow

### Parallel Track D — Collision Authoring

1. Add collision configuration to Body proto (shape type, parameters)
2. Engine: generate collision shapes at compile time from config
3. Frontend: collision section in body inspector, viewport wireframe overlay

### Sequential (depends on above)

5. Motion type enum (replace `is_fixed` boolean)
6. Import placement modes (auto-body vs visual-only)
7. Sensor entities (new entity type following established patterns)

---

## Anti-Patterns to Avoid

1. **Don't bypass protocol commands.** All authored state mutations go through the engine via WebSocket commands. Don't write to the mechanism store directly.

2. **Don't couple entity concerns.** Changing a geometry's visual mesh must never trigger mass recomputation unless the user explicitly asks (and `mass_override` is off). Body/Geometry separation is intentional.

3. **Don't skip datums.** Joints connect datum-to-datum, not body-to-body. Loads attach to datums. Don't create shortcuts that bypass the datum model.

4. **Don't use solver language in the UI.** Say "fixed" not "grounded body." Say "motor" not "ChLinkMotorRotation." Say "collision shape" not "contact geometry."

5. **Don't make CAD structure the primary navigation.** The scene tree shows authored entities (bodies, joints, loads). CAD assembly structure is available in the asset/geometry detail view for reference.

6. **Don't auto-enable collision on import.** Collision is expensive and usually not needed everywhere. Default to off, let users add it where needed.

7. **Don't treat primitives as second-class.** A primitive body and a CAD-derived body must have identical capabilities.

8. **Don't front-load configuration.** Users should be able to import, see geometry, and start authoring immediately. Detailed configuration comes later, progressively.

9. **Don't offer mass computation on mesh assets.** Only CAD assets and primitives can provide computed mass properties. Mesh files are visual-only sources.

10. **Don't use the React render loop for simulation hot-path data.** Body poses go to a module-level cache, not Zustand. Trace samples are batched. The viewport uses demand-driven invalidation, not continuous rendering.
