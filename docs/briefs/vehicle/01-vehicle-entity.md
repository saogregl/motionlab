# Epic V1 — Vehicle Entity, Chassis, First Suspension Template

**Mission:** introduce `Vehicle` as a new typed compound entity. Ship the
smallest end-to-end slice: a chassis with mass properties, a single front axle
with a DoubleWishbone suspension template, a hardcoded mirror rear axle, a
hardcoded rigid tire model, and a hardcoded constant-throttle driver, sitting
on rigid terrain (terrain/T1). The vehicle runs, the inspector edits its
parameters, the viewport renders it, the protocol round-trips it.

**Depends on:** terrain/T1 (rigid terrain), collision/C1 (physics materials).
**Strongly leverages:** collision/C4 (capability sections).

---

## Why

The series principles forbid JSON import as a user-facing workflow, so V1 has
to deliver both the engine binding and a real authoring surface. That's a
large epic. The way to keep it scoped is to ship exactly **one** of every kind
of subsystem (one suspension template, one steering, one driveline, one
powertrain, one tire model) end-to-end, hardcode the rest, and treat V2/V3 as
filling in the matrix.

DoubleWishbone is the right first suspension template: it's the most common
example in Chrono::Vehicle docs, it has a clear set of physical hardpoints
(LCA inner/outer, UCA inner/outer, tie rod inner/outer, spring/damper
anchors), and it's the substrate the hardpoint editor (V4) will need to
drive.

## Current state

- No Vehicle entity, no subsystem entities, no
  tire/driveline/powertrain/suspension/steering concepts in proto, store, or
  engine.
- The structure tree has no Vehicle group.
- The viewport renderer has no concept of compound assemblies that aren't
  loaded as static meshes.

## Proposed model

### Vehicle as a typed compound entity

A `Vehicle` is a new typed entity (eighth, after Terrain in T1). It is a
**compound** entity: it owns subsystems as child elements. Its identity is
the sum of its subsystems plus a chassis pose.

A vehicle is *not* a Body and a vehicle's subsystems are *not* Bodies, even
though under the hood Chrono creates many bodies and joints to realize them.
Reasons (parallel to Terrain in T1):

- A Vehicle has properties (axle list, driver assignment, drive type) with
  no Body counterpart.
- The user authors a Vehicle by editing physical parameters (track,
  wheelbase, caster), not by placing individual bodies and joints.
- The escape hatch (drill into the suspension as a raw mechanism for
  debugging) is *read-mostly*: the underlying joints exist but should not be
  edited directly except by advanced users, and edits via the raw view are
  flagged as breaking the template binding.

### Subsystem entity types

V1 introduces five new typed entities that exist as children of a Vehicle:

| Type | Cardinality per vehicle | Notes |
|---|---|---|
| `Chassis` | exactly one | Mass props, hardpoint datums, optional collision proxy. |
| `Axle` | one or more | Container for suspension + brakes + wheels. |
| `Suspension` | one per axle | Template-typed (DoubleWishbone in V1). Owns hardpoints. |
| `Steering` | zero or one per axle | Template-typed. Steered axles only. (V2.) |
| `Wheel` | exactly two per axle | Anchors a Tire. Owns spindle datum. |

Driveline, Powertrain, and Tire types are introduced in V2/V3. In V1 they
are hardcoded inside the engine binding so the slice runs end-to-end without
expanding the entity surface.

### Proto

```proto
enum SuspensionTemplateKind {
  SUSPENSION_TEMPLATE_KIND_UNSPECIFIED = 0;
  SUSPENSION_TEMPLATE_KIND_DOUBLE_WISHBONE = 1;
  // V2: MULTI_LINK, MACPHERSON, SOLID_AXLE, LEAFSPRING_AXLE, GENERIC
}

message Hardpoint {
  string key = 1;          // e.g., "lca_outer_left"
  Vec3 position = 2;       // chassis-frame meters
}

message DoubleWishboneParams {
  double spring_rest_length = 1;   // m
  double spring_coefficient = 2;   // N/m
  double damping_coefficient = 3;  // N·s/m
  double arb_stiffness = 10;       // N·m/rad, 0 disables
  double spindle_mass = 20;        // kg
  Vec3 spindle_inertia = 21;       // diag, kg·m^2
}

message Suspension {
  ElementId id = 1;
  SuspensionTemplateKind kind = 2;
  repeated Hardpoint hardpoints = 3;
  oneof params {
    DoubleWishboneParams double_wishbone = 10;
    // V2: other template params
  }
}

message Wheel {
  ElementId id = 1;
  string side = 2;                 // "left" | "right"
  double mass = 3;                 // kg
  Vec3 inertia = 4;                // diag, kg·m^2
  double radius = 5;               // m (visual + V1 rigid tire)
  double width = 6;                // m
}

message Axle {
  ElementId id = 1;
  string name = 2;
  Vec3 chassis_offset = 3;         // chassis-frame midpoint
  Suspension suspension = 4;
  // Steering and brakes added in V2.
  repeated Wheel wheels = 5;       // exactly two
}

message Chassis {
  ElementId id = 1;
  double mass = 2;                 // kg
  Vec3 com_offset = 3;             // chassis-frame
  Vec3 inertia_diag = 4;           // kg·m^2 (full tensor in V2)
  ElementId collision_material_id = 5;  // collision/C1
}

message Vehicle {
  ElementId id = 1;
  string name = 2;
  Pose initial_pose = 3;           // world placement at sim start
  Chassis chassis = 4;
  repeated Axle axles = 5;
}

message Mechanism {
  // ... existing fields ...
  repeated Vehicle vehicles = 13;
}
```

### Engine

- New module `native/engine/src/vehicle.{h,cpp}`. Owns the
  `chrono::vehicle::ChWheeledVehicle` instance and the per-vehicle subsystem
  factories.
- `simulation.cpp::compile` walks `Mechanism.vehicles` after terrains and
  constructs each one. Order matters: terrains must exist so the vehicle has
  somewhere to sit (initial pose is positioned above terrain by a small drop
  margin and allowed to settle in the first few sim steps).
- Suspension construction in V1 uses `chrono::vehicle::
  ChGenericWheeledSuspension` configured from the proto hardpoints, not a
  hand-coded subclass per template. This gives a single code path that also
  serves V4's editor, and lets V2 template additions be parameter mappings
  rather than new C++ classes. (DoubleWishbone is realized as a specific
  topology over the generic builder.)
- V1 hardcodes: rear axle (mirrors front), rigid tire (`ChRigidTire`), simple
  driveline (front-drive), constant-throttle driver. All five are exposed in
  V2/V3; V1 only proves the binding.

### Phase 0 — Throwaway scaffolding (developer only)

Before any of the proto, store, inspector, or viewport work lands, a
one-week spike validates the engine binding by loading a Chrono::Vehicle
JSON sample directly. **This is not user-visible.** It exists to confirm:

- `ChronoEngine_vehicle` links cleanly in our build (shared with
  terrain/T1).
- A `ChWheeledVehicle` constructed from a known-good HMMWV / Sedan JSON runs
  alongside a `RigidTerrain` from terrain/T1 without exploding.
- Per-step state extraction works as documented (chassis pose, spindle
  poses, per-tire forces).
- The generic suspension builder can express DoubleWishbone topology
  cleanly enough to be the V1 path. If not, fall back to per-template C++
  subclass for DoubleWishbone in V1 and revisit unification in V4.

The JSON loader is gated behind a build flag and compiled only in dev
builds. **By the end of V1 Phase 5 it is deleted from the codebase.** It is
not the foundation of any user feature, and its presence in `main` past V1
would be a temptation to pivot the product story toward "import a JSON
file."

This is the only place in the entire vehicle series that touches Chrono
JSON files. Series principle 1 stands.

### Frontend

- New typed entity collection `useMechanismStore.vehicles` (Map by id).
- New `VehicleInspector.tsx` with **core sections**:
  - **Identity** — name only.
  - **Initial Pose** — world position and orientation at sim start.
  - **Chassis** — mass, COM offset, inertia, collision material picker.
  - **Axles** — list view, expandable. Each axle shows its name, offset, and
    a nested suspension subsection.
- The Suspension section per axle is rendered through **collision/C4's
  capability registry** under a new capability `suspension`. The section
  renders the template-specific parameter form. In V1 only the
  DoubleWishboneParams form exists.
- **Wheel** subsection renders the wheel parameters. Two wheels per axle.
- New tree group "Vehicles" in `ProjectTree.tsx`, peer to "Bodies",
  "Joints", "Terrain". Vehicles expand to show their child axles, axles
  expand to show their suspension and wheels.
- New creation entry: **Add Vehicle → From Template → Generic Sedan**. The
  template is a parameter blob shipped as a frontend resource — *not* a
  Chrono JSON. It populates the proto fields that the inspector edits. The
  user is editing a fully-typed object from the moment it's created; no
  import flow is exposed.

### Viewport

- New vehicle renderer in `packages/viewport`:
  - Chassis: a box stand-in sized from chassis bounds (visual mesh comes
    in V2).
  - Wheels: cylinders sized from wheel radius/width.
  - Suspension links: line segments between hardpoints, color-coded by link
    type (LCA, UCA, tie rod, spring/damper). The line-segment rendering is
    what V4 will replace with a manipulation-aware rendering.
- Vehicle gets a distinct selection outline color matching the tree group.
- New view mode "Suspension hardpoints" toggles hardpoint sphere markers —
  used in V1 for visualization, becomes editable in V4.

### Protocol commands

- `CreateVehicleCommand { template_key, name, initial_pose }`
- `UpdateChassisCommand { vehicle_id, chassis_fields }`
- `UpdateAxleCommand { vehicle_id, axle_id, axle_fields }`
- `UpdateSuspensionCommand { vehicle_id, axle_id, params, hardpoints? }`
- `UpdateWheelCommand { vehicle_id, axle_id, wheel_id, fields }`
- `DeleteVehicleCommand { vehicle_id }`

All follow the existing command/result/event pattern.

---

## Phases

### Phase 0 — Engine spike (developer only, deleted before V1 lands)

Wire `ChronoEngine_vehicle::WheeledVehicle` from a sample JSON, run alongside
terrain/T1's RigidTerrain, log per-step chassis pose. Confirms the link-time
and runtime path and the generic-builder topology question. Throwaway.

### Phase 1 — Vehicle entity end-to-end with hardcoded parameters

Proto, store, engine binding, inspector skeleton, viewport stand-in
renderer, protocol round-trip. Vehicle parameters are still hardcoded in the
engine — the proto defines them but the engine ignores most fields and uses
defaults. Validates the entity plumbing without coupling it to parameter
correctness.

**Deliverable:** a user can `Add Vehicle → Generic Sedan`, see it appear in
the tree and viewport over a flat terrain, and start a sim where it sits
stably under gravity.

### Phase 2 — Chassis parameters honored

Engine reads chassis mass, COM offset, inertia from the proto. Inspector
edits flow through. Validate by changing chassis mass and observing
different suspension travel under gravity.

### Phase 3 — DoubleWishbone hardpoints honored

Engine constructs the suspension via `ChGenericWheeledSuspension` from the
proto's hardpoint list. Inspector exposes hardpoints as a list of
`(key, vec3)` entries — text editing only, no viewport manipulation yet
(V4). Spring and damper parameters honored.

### Phase 4 — Wheel parameters and rigid-tire hookup

Wheel mass, inertia, and radius honored. Rigid tire constructed from wheel
parameters and a hardcoded friction coefficient. Vehicle can be pushed on
the terrain (still no driver inputs) and its motion is qualitatively right.

### Phase 5 — Save/load round-trip and Phase 0 cleanup

Full serialization round-trip through the existing project save/load path.
Delete the Phase 0 JSON loader and its build flag. Grep confirms no
references remain.

---

## Acceptance criteria

- [ ] A user can add a Vehicle from the `+` menu and see it in the tree and
      viewport with **no JSON import step exposed** anywhere in the UI.
- [ ] The Vehicle entity persists through save/load with all chassis, axle,
      suspension, and wheel parameters intact.
- [ ] Chassis mass and inertia edits in the inspector visibly affect
      simulation.
- [ ] Suspension hardpoint edits rebuild the suspension and visibly change
      wheel placement.
- [ ] The vehicle rests stably on a flat rigid terrain (terrain/T1) at sim
      start, with all four wheels in contact after settling.
- [ ] The Phase 0 JSON loader is removed from `main` before V1 is marked
      done.
- [ ] The Suspension inspector section is registered through C4's capability
      registry, not hardcoded into the Vehicle inspector.
- [ ] Deleting a vehicle removes it from scene and engine cleanly.

## Out of scope

- More than one suspension template (V2).
- Steering (V2 — V1 uses straight-ahead wheels).
- Driveline / powertrain authoring (V2 — V1 hardcodes a simple driveline).
- Tire fidelity beyond rigid (V3).
- Hardpoint manipulation in the viewport (V4 — V1 edits hardpoints as text).
- Driver authoring (V5/V6 — V1 uses a constant-throttle hardcoded driver).
- Compound visual meshes (chassis is a box, wheels are cylinders).
- Multi-vehicle scenes — defer until V1 is solid; not a hard limit.

## Open questions

- **Generic builder vs per-template subclass**: Phase 0 spike confirms
  whether `ChGenericWheeledSuspension` can express DoubleWishbone topology
  cleanly. If not, V1 uses Chrono's hand-coded `ChDoubleWishbone` and V4
  has to choose between editor on generic only or two code paths.
- **Subsystem entity granularity**: should `Suspension`, `Wheel`, etc. be
  first-class entities with their own IDs in the store, or sub-fields of
  `Vehicle`? Recommendation: first-class with IDs (so they can be selected
  individually in the tree and inspected), but their lifecycle is bound to
  the parent vehicle. Document this as a new pattern in
  `scene-building-ux/02-ENTITY-MODEL.md`.
- **Default sedan template format**: where does the template live?
  Recommendation: `assets/presets/vehicles/generic-sedan.json` as a
  *parameter blob* (not a Chrono JSON), loaded by the frontend creation
  flow and emitted as a fully-formed `CreateVehicleCommand`. The blob is
  part of the *frontend asset bundle*, not exchanged with the engine.

## File checklist

| Action | File |
|---|---|
| Modify | `schemas/mechanism/mechanism.proto` (Vehicle/Chassis/Axle/Suspension/Wheel/Hardpoint messages, vehicles field) |
| Modify | `schemas/protocol/transport.proto` (CRUD commands + events) |
| Create | `native/engine/src/vehicle.{h,cpp}` |
| Modify | `native/engine/src/simulation.cpp` (compile vehicles after terrains) |
| Modify | `native/engine/src/mechanism_state.{h,cpp}` (vehicles_ map, accessors, CRUD) |
| Modify | `native/engine/src/transport.cpp` (handlers) |
| Modify | `native/engine/CMakeLists.txt` (vehicle module already linked from terrain/T1) |
| Modify | `packages/frontend/src/stores/mechanism.ts` (vehicles slice) |
| Create | `packages/frontend/src/components/VehicleInspector.tsx` |
| Create | `packages/frontend/src/components/inspector/sections/SuspensionSection.tsx` |
| Modify | `packages/frontend/src/components/ProjectTree.tsx` (Vehicles group, expand semantics) |
| Modify | `packages/frontend/src/commands/definitions/create-commands.ts` |
| Create | `packages/frontend/src/commands/definitions/vehicle-commands.ts` |
| Create | `assets/presets/vehicles/generic-sedan.json` |
| Modify | `packages/viewport/src/...` (vehicle renderer, hardpoint overlay view mode) |
| Modify | `docs/briefs/scene-building-ux/02-ENTITY-MODEL.md` (Vehicle as new compound entity type) |

## Chrono-side risks

- **Generic suspension builder maturity**: confirmed to exist as
  `ChGenericWheeledSuspension`. Phase 0 spike confirms it can express
  DoubleWishbone topology cleanly. If not, fall back to per-template C++
  subclass for DoubleWishbone in V1 and revisit unification in V4.
- **Vehicle module link**: shared with terrain/T1. No new exposure.
- **Initial pose / drop margin**: `ChWheeledVehicle::Initialize` requires a
  pose. Place vehicle ~10cm above the terrain and let it settle in the
  first few steps. Document.
