# Epic T1 — Rigid Terrain Entity

**Mission:** add `Terrain` as a new typed entity. Initial soil model is "rigid":
flat patch, box patch, heightfield (from grayscale image), or mesh asset. Bodies
with collision proxies interact with terrain through Chrono's normal contact
pipeline.

**Depends on:** collision/C1 (physics materials) — terrain needs an authored
material for friction / restitution.

---

## Why

There is no terrain in MotionLab today. The implicit ground is whatever fixed body
the user authored, which gets old fast for any scene larger than a desktop demo.

The simplest form of terrain — a flat patch — is a five-line Chrono call. The full
`RigidTerrain` API is a few lines more and unlocks heightfield and mesh terrains,
which is everything most non-soil scenarios need (ramps, fixtures, cluttered
environments, simple outdoor scenes).

## Current state

- No terrain entity in the proto, store, or engine.
- The compile path in `simulation.cpp` only walks `Mechanism.bodies`. There is no
  notion of a non-body collidable in the world.
- The structure panel and creation menu have no terrain entry.
- The viewport renderer has no terrain layer.

## Proposed model

### Terrain as a typed entity (NOT a Body)

Terrain is its own typed entity. It is **not** a Body, even though under the hood
`RigidTerrain` may create internal Chrono bodies. Reasons:

- Terrain has no joints, no actuators, no datums, and (in T1) no mass-properties
  inspector. Modeling it as a Body would require defending a long list of "doesn't
  apply to terrain" UI affordances.
- Terrain has its own properties (extent, soil model, heightfield source) that
  have no counterpart on Body.
- Future soft terrain (T2) is even less Body-like — it has a Bekker parameter
  block instead of a mass tensor.

This adds a seventh entity type to the model. The existing typed-entity rule in
`scene-building-ux/02-ENTITY-MODEL.md` lists six types but is not prescriptive
about a maximum — growth is allowed when the new type genuinely doesn't fit any
existing one. Update the doc as part of this epic.

### Proto

```proto
enum TerrainPatchKind {
  TERRAIN_PATCH_KIND_UNSPECIFIED = 0;
  TERRAIN_PATCH_KIND_FLAT = 1;          // bounded rectangle, thin slab
  TERRAIN_PATCH_KIND_BOX = 2;           // bounded rectangular box
  TERRAIN_PATCH_KIND_HEIGHTFIELD = 3;
  TERRAIN_PATCH_KIND_MESH = 4;
}

message FlatPatch {
  double size_x = 1;       // meters
  double size_y = 2;
  double thickness = 3;    // meters, default 0.1
}

message BoxPatch {
  double size_x = 1;
  double size_y = 2;
  double size_z = 3;
}

message HeightfieldPatch {
  AssetReference image_ref = 1;   // grayscale, 16-bit preferred
  double size_x = 2;
  double size_y = 3;
  double height_min = 4;
  double height_max = 5;
}

message MeshPatch {
  AssetReference mesh_ref = 1;
}

message RigidSoilModel {
  ElementId material_id = 1;   // physics material reference (collision/C1)
}

message Terrain {
  ElementId id = 1;
  string name = 2;
  Pose pose = 3;
  TerrainPatchKind patch_kind = 4;
  oneof patch {
    FlatPatch flat = 5;
    BoxPatch box = 6;
    HeightfieldPatch heightfield = 7;
    MeshPatch mesh = 8;
  }
  oneof soil_model {
    RigidSoilModel rigid = 20;
    // SoftSoilSCM scm = 21;   // reserved for T2
  }
}

message Mechanism {
  // ... existing fields ...
  repeated Terrain terrains = 12;
}
```

A scene can have more than one terrain entity. The first authored one is treated
as the default ground; subsequent ones are positioned arbitrarily (e.g., a ramp on
top of a floor).

### Engine

- New module `native/engine/src/terrain.{h,cpp}` wrapping
  `chrono::vehicle::RigidTerrain` instantiation.
- `simulation.cpp::compile` walks `Mechanism.terrains` and constructs each one,
  appending the result to a per-engine list of terrain handles.
- Heightfield image data is loaded from the asset store via the existing asset
  cache pipeline (same path used by mesh imports).
- The terrain's collidables register their material through the same lookup path
  as bodies (collision/C1). Materials are looked up by `material_id`; empty falls
  back to `default`.
- `MechanismState` gains a `terrains_` map mirroring how it owns geometries.

### Frontend

- New typed entity collection `useMechanismStore.terrains` (Map by id), following
  the existing slice convention.
- New `TerrainInspector.tsx` with three core sections:
  - **Identity** — name only.
  - **Patch** — kind dropdown plus kind-specific fields (size, thickness,
    heightfield asset picker, mesh asset picker). Only the active oneof's fields
    are shown.
  - **Pose** — world position and orientation.
- **Collision** capability section (rendered through collision/C4's registry once
  that lands; until then, hardcode the section into `TerrainInspector` and
  migrate later). The section here exposes the material picker only — terrain
  doesn't choose its collision shape type, that's implicit in the patch kind.
- New tree group "Terrain" in `ProjectTree.tsx`, peer to "Bodies", "Joints", etc.
- New creation entry in the structure panel `+` menu: **Add Terrain → Flat / Box /
  Heightfield / Mesh**.
- **Drag-import shortcut**: dragging a grayscale PNG onto the viewport with the
  cursor on empty space prompts "Create heightfield terrain from
  &lt;filename&gt;?" with default extents.

### Viewport

- New terrain renderer in `packages/viewport`:
  - Flat patch → a textured quad with a subtle grid texture so users can sense
    scale.
  - Box patch → a textured cuboid.
  - Heightfield → upload as a heightmap, render with a simple lit grid shader.
  - Mesh → load and render the asset mesh through the existing mesh path.
- Terrain receives a distinct selection outline that matches its tree group color.
- New view mode "Terrain Wireframe" toggles a wireframe overlay for debugging
  resolution and orientation. Useful for verifying that the heightfield is
  oriented as intended.

### Protocol commands

- `CreateTerrainCommand { name, patch_kind, patch_params }`
- `UpdateTerrainCommand { id, ... }`
- `DeleteTerrainCommand { id }`
- All follow the existing command/result/event pattern in `transport.proto`.

---

## Phases

### Phase 1 — Flat patch only, end-to-end

The smallest possible payload: just a flat rectangle. Validates the entity, the
inspector, the engine binding, the protocol round-trip, and the viewport renderer
all at once.

**Deliverable:** a user can `Add Terrain → Flat`, see it in the viewport, drop a
body onto it in simulation, and have the body rest on it.

### Phase 2 — Box and mesh patches

Adds the trivially-different patch kinds. Mesh patches reuse the existing mesh
asset import flow.

### Phase 3 — Heightfield patch with image asset import

Adds image asset import (separate from mesh import — needs a different decoder
path). Adds the drag-import shortcut.

### Phase 4 — Multiple terrains in one scene

Resolves edge cases: positioning a second terrain, selecting between overlapping
terrains in the viewport, deletion semantics, save/load round-trip with N terrains.

---

## Acceptance criteria

- [ ] A user can add a flat terrain via the `+` menu and see it in the viewport.
- [ ] A body with collision enabled drops onto the terrain and rests in
      simulation.
- [ ] Terrain material affects friction (visible on a sloped block test against
      different presets).
- [ ] Heightfield terrains load from a grayscale image asset and render with the
      correct extents.
- [ ] Mesh terrains load from an OBJ/STL asset and render correctly.
- [ ] Terrains persist through save/load including pose, patch kind, and material
      reference.
- [ ] Deleting a terrain removes it from the scene and the engine without
      affecting other entities.
- [ ] Multiple terrains can coexist in one scene without interfering.

## Out of scope

- Soil model other than rigid (T2).
- Terrain self-shadowing or PBR materials.
- Editing the heightfield in-app.
- Skirts, infinite tiling, or LOD.
- Dynamic terrains (terrain that moves with a body).
- Terrain physics materials with directional friction (ice on a slope).

## Open questions

- **Implicit ground vs explicit terrain**: should creating the first terrain
  auto-disable the implicit ground that current scenes rely on? Recommendation:
  yes, and surface a one-time toast explaining the change.
- **Heightfield data path**: store the image as an asset (recommended — matches
  the mesh pattern) vs embed the pixel data in the proto (rejected — bloats the
  mechanism document and breaks asset reuse).
- **Default pose**: terrains default to the world origin pose. For a ramp use
  case the user has to manually position it. Consider a "Drop here" affordance
  later — not required for v1.

## File checklist

| Action | File |
|---|---|
| Modify | `schemas/mechanism/mechanism.proto` (Terrain message + Mechanism field) |
| Modify | `schemas/protocol/transport.proto` (CRUD commands + events) |
| Create | `native/engine/src/terrain.{h,cpp}` |
| Modify | `native/engine/src/simulation.cpp` (compile terrains, integrate with materials lookup) |
| Modify | `native/engine/src/mechanism_state.{h,cpp}` (terrains_ map, accessors, CRUD) |
| Modify | `native/engine/src/transport.cpp` (handlers) |
| Modify | `native/engine/CMakeLists.txt` (link `ChronoEngine_vehicle`) |
| Modify | `packages/frontend/src/stores/mechanism.ts` (terrains slice) |
| Create | `packages/frontend/src/components/TerrainInspector.tsx` |
| Modify | `packages/frontend/src/components/ProjectTree.tsx` (Terrain group) |
| Modify | `packages/frontend/src/commands/definitions/create-commands.ts` (Add Terrain entries) |
| Create | `packages/frontend/src/commands/definitions/terrain-commands.ts` |
| Modify | `packages/viewport/src/...` (terrain renderer + view mode toggle) |
| Modify | `docs/briefs/scene-building-ux/02-ENTITY-MODEL.md` (add Terrain as seventh type) |

## Chrono-side risks

- `chrono::vehicle::RigidTerrain` lives under the vehicle module. Linking it
  pulls in `ChronoEngine_vehicle` and its transitive dependencies. **Verify**
  this module is enabled in the current Chrono build before phase 1. If too
  heavy or not enabled, fallback is to construct an equivalent
  `ChBody`+`ChCollisionShapeBox`/`TriangleMesh` directly without the wrapper —
  that path is fully supported by core Chrono and doesn't require the vehicle
  module.
- Heightfield image format compatibility: Chrono's `RigidTerrain::AddPatch`
  heightfield variant accepts a specific image format. Verify supported formats
  and document them in the inspector tooltip.
