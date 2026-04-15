# Epic C1 — Physics Material Assets

**Mission:** introduce `PhysicsMaterial` as a first-class authored asset. Collision
shapes reference a material by id. The hardcoded default material in
`simulation.cpp` is replaced with a real lookup. A small preset library ships with
every new project.

**Execution order:** independent. Foundational for C2, C3, and both terrain epics.

---

## Why

Today every collision shape gets a single shared `ChContactMaterialNSC` with default
friction (`native/engine/src/simulation.cpp:702`). That is enough for "does it stack"
smoke tests and nothing else. The moment users author scenes with steel-on-steel vs
rubber-on-asphalt vs ice-on-ice, they need a way to say so without diving into engine
code.

A physics material is an **asset**, not a component, because it is reusable across
bodies, shipped as a library of presets, and conceptually owned by the project — not
by any one body. This matches how textures and physics materials work in Unreal/Unity
and in URDF/SDF. It also fits MotionLab's existing pattern: assets live in the bottom
panel asset browser, entities reference them by id.

## Current state

- `BodyEntry::contact_material` is a single `shared_ptr<ChContactMaterialNSC>` per body
  (`native/engine/src/simulation.cpp:573`).
- The material is constructed inline at compile time with default values
  (`simulation.cpp:702`), shared by every collision shape on that body.
- `mechanism.proto` has no material message and no material reference field.
- Frontend `CollisionSection.tsx` exposes only shape geometry — no material picker,
  no awareness that materials exist.
- The asset browser tab list (planned in `feedback_unity_style_bottom_panel`) does not
  include physics materials.

## Proposed model

### Proto (additive)

```proto
message PhysicsMaterial {
  ElementId id = 1;
  string name = 2;

  // NSC parameters — active when the project uses the NSC contact method
  // (the current default and only implemented option).
  double static_friction = 10;
  double sliding_friction = 11;
  double rolling_friction = 12;
  double spinning_friction = 13;
  double restitution = 14;
  double cohesion = 15;
  double compliance = 16;
  double compliance_tangential = 17;

  // SMC parameters — reserved. Populated when the project's contact method is set
  // to SMC (out of scope for this epic, but the field is forward-compatible).
  double young_modulus = 30;
  double poisson_ratio = 31;
  double kn = 32;
  double gn = 33;
  double kt = 34;
  double gt = 35;
}

message Mechanism {
  // ... existing fields ...
  repeated PhysicsMaterial physics_materials = 11;
}

message CollisionConfig {
  // ... existing fields ...
  ElementId material_id = 6;   // empty → resolves to the project's `default` material
}
```

Backwards compatible: existing scenes have no `material_id`. The engine resolves
empty/missing references to the auto-created `default` material (see below).

### Engine

- `MechanismState` gains a `materials_` map mirroring how it owns geometries
  (`mechanism_state.{h,cpp}`).
- During compile, `simulation.cpp` builds a `unordered_map<string,
  shared_ptr<ChContactMaterialNSC>>` from the authored materials. Each
  `AddCollisionShape` call passes the resolved material rather than the
  per-body `BodyEntry::contact_material`.
- A built-in fallback material with id `default` is registered if the project
  doesn't define one — this avoids "scene compiles to nothing collidable" failures
  during the migration.
- The per-body material field on `BodyEntry` is deleted in the same patch.

### Frontend

- New store slice `usePhysicsMaterialsStore` — or a `materials` map on
  `useMechanismStore`, matching the existing pattern of typed-entity collections. Use
  whichever fits the existing slice convention; do not invent a new pattern.
- **Asset browser tab "Physics Materials"** — lists materials with name, friction
  summary, and a swatch (color derived from a hash of the id so users can tell
  identically-named materials apart at a glance).
- `CollisionSection` gains a "Material" property row — a dropdown that lists all
  materials in the project plus a "+ New material" entry.
- New `PhysicsMaterialInspector.tsx` — opens when a material is selected in the
  asset browser. Sections: Identity, NSC Parameters, SMC Parameters (collapsed,
  greyed if the project is NSC).
- **Built-in presets** ship with a fresh project: `default`, `steel`, `aluminum`,
  `rubber`, `ice`, `wood`. Authored as `CreatePhysicsMaterialCommand` calls at
  project init from a JSON resource — *not* hardcoded in C++ — so users can edit
  them post-creation without engine changes.

### Protocol commands

- `CreatePhysicsMaterialCommand { name, params }` → returns `material_id`.
- `UpdatePhysicsMaterialCommand { id, params }`.
- `DeletePhysicsMaterialCommand { id }` → fails with a structured error listing
  referencing geometries. The frontend's UX flow is "show references → offer
  reassign-to-default → retry delete."
- The existing `UpdateCollisionConfigCommand` is extended; no new command needed for
  the body-side wiring.

---

## Phases

### Phase 1 — Proto + engine (no UI)

- Add `PhysicsMaterial` message and `material_id` field. Code-generate.
- Engine reads materials from the mechanism, builds the lookup map, resolves them
  per shape during compile.
- Default material auto-created if missing.
- Existing scenes (no materials) continue to compile — they all bind to `default`.

**Acceptance:** existing projects open and simulate identically. New
`CreatePhysicsMaterialCommand` round-trips correctly through transport tests.

### Phase 2 — Asset browser tab

- New "Physics Materials" tab in the bottom panel asset browser.
- Create / select / delete flows.
- `PhysicsMaterialInspector` with all NSC parameters editable.

**Acceptance:** users can create a material, edit its parameters, and see the values
persist across reload. No collision wiring yet.

### Phase 3 — Wire collision to materials

- `CollisionSection` gains the material dropdown.
- `UpdateCollisionConfigCommand` carries `material_id` end-to-end.
- Round-trip from collision shape → engine → contact behavior demonstrated.

**Acceptance:** two bodies with different materials produce different friction
behavior in simulation (qualitative — see `feedback_testing_philosophy`, we trust
Chrono's physics, we test that our mapping built the right model).

### Phase 4 — Presets + project init

- Ship preset materials in `assets/presets/physics-materials.json`.
- Project-init code path issues `CreatePhysicsMaterialCommand` for each preset.
- Document parameter ranges and physical intuition for each preset in the inspector
  tooltips.

**Acceptance:** new projects open with the preset library populated. Deleting a
preset is allowed (presets are not privileged after creation).

---

## Acceptance criteria (rolled up)

- [ ] Creating a project produces a `default` material plus a small preset library.
- [ ] A geometry's collision can be assigned a material from the dropdown.
- [ ] Two bodies with materials of differing friction produce visibly different
      sliding behavior in simulation.
- [ ] Deleting a material in use prompts a reassignment flow rather than failing
      silently or orphaning references.
- [ ] Materials persist through save/load including all parameters.
- [ ] The frontend reads material parameters back from the engine — no client-side
      defaults that drift from engine values.
- [ ] Existing scenes open and compile without modification.

## Out of scope

- Per-shape material assignment (Chrono's data model is per-shape; we expose
  per-geometry, which already aligns since each shape lives on a geometry).
- NSC vs SMC project-level switching. The schema is forward-compatible but only NSC
  is honored by the engine.
- User-defined custom parameter sets / unit conversion presets.
- Audio cues, visual decals, or wear modeling driven by materials.

## Open questions

- **Per-shape vs per-geometry**: Chrono is per-shape. We expose per-geometry, so each
  authored shape on a geometry naturally inherits that geometry's material. If we
  later add multi-shape geometries, we'll need to revisit. For now, document the
  assumption in the schema comments.
- **Material color in the viewport**: should the material's swatch color tint the
  geometry visually? Tempting, but it conflicts with body-color and selection
  highlight conventions. Defer.

## File checklist

| Action | File |
|---|---|
| Modify | `schemas/mechanism/mechanism.proto` (PhysicsMaterial, Mechanism field, CollisionConfig.material_id) |
| Modify | `schemas/protocol/transport.proto` (Create/Update/Delete material commands and events) |
| Modify | `native/engine/src/mechanism_state.{h,cpp}` (materials_ map, CRUD, accessors) |
| Modify | `native/engine/src/simulation.cpp` (build material map, resolve per shape, drop per-body material) |
| Modify | `native/engine/src/transport.cpp` (command handlers) |
| Create | `packages/frontend/src/stores/physics-materials.ts` *(or fold into mechanism.ts)* |
| Modify | `packages/frontend/src/components/inspector/sections/CollisionSection.tsx` (material dropdown) |
| Create | `packages/frontend/src/components/PhysicsMaterialInspector.tsx` |
| Create | `packages/frontend/src/components/asset-browser/PhysicsMaterialsTab.tsx` |
| Create | `packages/frontend/src/commands/definitions/material-commands.ts` |
| Create | `assets/presets/physics-materials.json` |
| Modify | `packages/protocol/src/transport.ts` (TS bindings) |

## Chrono-side risks

- None significant. NSC materials are first-class in Chrono and the API is stable.
- The migration deletes per-body materials — confirm no other engine code path
  depends on `BodyEntry::contact_material` before removing it
  (`grep -n contact_material native/engine/src`).
