# Epic C2 — Convex Hull, Decomposition, and Mesh Collision

**Mission:** expand collision shape options beyond box / sphere / cylinder primitives.
Add single convex hull (auto-fit from a mesh), automatic convex decomposition via
Chrono's HACDv2, and triangle-mesh collision (static bodies only). Add a viewport
"Collision Overlay" view mode so users can actually see what they authored.

**Depends on:** Epic C1 (every new shape type resolves its material through the same
lookup C1 introduces).

---

## Why

Box / sphere / cylinder cover gears, shafts, and pucks. They fail the moment a user
imports a real CAD part with any non-trivial silhouette. The current `CONVEX_HULL`
enum value is a placeholder. Convex decomposition is the standard solution: take the
visual mesh, split it into N convex chunks, attach each as a hull. Chrono ships
HACDv2 (`ChConvexDecompositionHACDv2`) for exactly this and provides utility wrappers
(`LoadConvexMesh`, `AddConvexCollisionModel`).

Triangle mesh collision is the escape hatch for static, complex environments —
walls, fixtures, terrain meshes — where decomposition would be wasteful and the
mesh-vs-mesh contact instability doesn't apply because one side is fixed.

## Current state

- `CollisionShapeType` enum: NONE, BOX, SPHERE, CYLINDER, CONVEX_HULL (reserved).
- `simulation.cpp:766–826` switches on shape type and only handles primitives.
- Display meshes are stored on Geometry as `DisplayMesh` (flat float arrays). The
  collision pipeline currently never reads them.
- No async / long-running per-entity computation pattern exists outside of import.

## Proposed extensions

### Proto

```proto
enum CollisionShapeType {
  COLLISION_SHAPE_TYPE_NONE = 0;
  COLLISION_SHAPE_TYPE_BOX = 1;
  COLLISION_SHAPE_TYPE_SPHERE = 2;
  COLLISION_SHAPE_TYPE_CYLINDER = 3;
  COLLISION_SHAPE_TYPE_CONVEX_HULL = 4;             // single hull, auto-fit
  COLLISION_SHAPE_TYPE_CONVEX_DECOMPOSITION = 5;    // many hulls via HACD
  COLLISION_SHAPE_TYPE_TRIANGLE_MESH = 6;           // fixed bodies only
}

message ConvexDecompositionParams {
  uint32 max_hulls = 1;                // default 16
  uint32 max_vertices_per_hull = 2;    // default 64
  double concavity = 3;                // HACD concavity, default 0.001
  double small_cluster_threshold = 4;  // default 0.0
}

message CollisionConfig {
  // ... existing fields (shape_type, half_extents, radius, height, offset) ...
  ElementId material_id = 6;                       // from C1
  ConvexDecompositionParams decomposition = 7;     // used when shape_type == DECOMPOSITION
  string decomposition_cache_key = 8;              // engine-populated, opaque
}
```

Hull point clouds and decomposition results are large. They are **not** stored in the
mechanism document. Instead the engine populates `decomposition_cache_key` with a hash
of `(geometry content hash, params hash)` and stores the actual hull data under
`~/.motionlab/cache/collision/<cache_key>.bin`. On compile the engine hits the cache
or recomputes.

### Engine

New module `native/engine/src/collision_decomposition.{h,cpp}`:

- Wraps `ChConvexDecompositionHACDv2`.
- Input: `ChTriangleMeshConnected` + `ConvexDecompositionParams`.
- Output: `vector<vector<ChVector3d>>` (one point cloud per hull).
- Cache layer keyed by `(asset content hash, params hash)`.

`simulation.cpp` extended branches:

- `CONVEX_HULL`: fit a single convex hull to the geometry's mesh by collecting all
  unique vertices and constructing one `ChCollisionShapeConvexHull`.
- `CONVEX_DECOMPOSITION`: load (or compute) cached hulls, attach each as a
  `ChCollisionShapeConvexHull` with the resolved material.
- `TRIANGLE_MESH`: build `ChCollisionShapeTriangleMesh` from the display mesh and
  attach. **Reject** at compile time if the parent body's `motion_type` is not
  `MOTION_TYPE_FIXED` — Chrono triangle-mesh-vs-triangle-mesh contact is unstable
  and we should not let users walk into it.

### Async decomposition over the protocol

Decomposition is the first long-running per-entity computation in MotionLab outside
of import. It must not block the transport loop. Implement as a streaming command:

- `ComputeCollisionDecompositionCommand { geometry_id, params }`
- `CollisionDecompositionProgressEvent { geometry_id, progress: 0..1, hull_count_so_far }`
- `CollisionDecompositionCompleteEvent { geometry_id, hull_count, cache_key }`
- `CollisionDecompositionFailedEvent { geometry_id, reason }`

Run on a worker thread inside the engine. HACDv2 is single-threaded; for very dense
parts (>100k triangles) the worker keeps the main loop responsive.

### Frontend

- `CollisionSection` shape-type dropdown gains `Convex hull`, `Convex decomposition`,
  and `Triangle mesh` entries.
- For `Convex decomposition`: section shows `max_hulls`, `max_vertices_per_hull`,
  `concavity`, and a **Recompute** button. While computing, show a progress bar
  driven by `CollisionDecompositionProgressEvent`. Cache hits are instant.
- For `Triangle mesh`: a warning row appears if the parent body's `motion_type` is
  not FIXED, with a one-click "Make body fixed" action.
- New ephemeral store `useCollisionDecompositionStore` tracks per-geometry status:
  `idle | computing | ready | failed`.

### Viewport — Collision Overlay view mode

The single most valuable debugging affordance for this entire epic. Toggle via the
viewport view-mode pill (existing pattern from `ViewportToolModeToolbar`).

When enabled:

- All collision proxies render as translucent wireframes on top of the visual mesh.
- Color-coded by shape type: primitives in steel blue (matching the joint convention
  from `feedback_joint_steel_blue`), hulls in a distinct accent, triangle meshes in a
  muted neutral.
- Disabled state: nothing rendered. Toggle is sticky per project.

Without this overlay users have no way to validate that decomposition produced a
reasonable proxy — they'd be guessing from simulation behavior. Consider pulling this
to phase 1 if QA is blocked on it.

---

## Phases

1. **Single convex hull** — simplest, no decomposition, no cache. Validates the
   "geometry mesh → collision shape" data flow end-to-end.
2. **Collision overlay view mode** — landing this early gives every subsequent phase
   a debugging surface.
3. **Convex decomposition** with cache and async progress events.
4. **Triangle mesh** for fixed bodies.

## Acceptance criteria

- [ ] A user can switch a geometry's collision to "Convex hull" and the overlay
      shows a hull that visibly tracks the silhouette.
- [ ] Convex decomposition produces N hulls within a few seconds for a part with
      ~10k triangles, with progress events streaming to the inspector.
- [ ] Decomposition results survive project reload (cache hit on second compile).
- [ ] Triangle mesh collision is rejected for non-fixed bodies with a clear
      inspector message and a fix-it button.
- [ ] Collision Overlay view mode renders proxies for every shape type.
- [ ] Existing primitive collision behavior is unchanged across all of phase 1–4.

## Out of scope

- User-edited convex hulls (drag points, paint, sculpt). Decomposition is
  automatic-only.
- Per-hull material assignment. All hulls inherit the geometry's material.
- LOD / multi-resolution collision proxies.
- Watertightness / mesh repair before decomposition. We trust CAD input.
- Mesh collision for dynamic bodies (Chrono limitation; revisit if a real use case
  appears).

## Open questions

- **HACDv2 build flags**: confirm Chrono is built with HACDv2 support in our pinned
  version. If not, this epic is blocked on a Chrono rebuild — flag during phase 0.
- **Decomposition caching across machines**: the cache is local. For shared
  projects, decomposition runs again on first open by another user. Acceptable for
  v1; revisit if it becomes painful.
- **Quality presets**: "fast / balanced / accurate" presets for `concavity` and
  `max_hulls` would simplify the inspector for users who don't know HACD. Add in a
  follow-up if the raw numeric controls confuse testers.

## File checklist

| Action | File |
|---|---|
| Modify | `schemas/mechanism/mechanism.proto` (new shape types, ConvexDecompositionParams, cache_key field) |
| Modify | `schemas/protocol/transport.proto` (decomposition compute command + progress/complete/failed events) |
| Create | `native/engine/src/collision_decomposition.{h,cpp}` |
| Modify | `native/engine/src/simulation.cpp` (new shape branches) |
| Modify | `native/engine/src/transport.cpp` (decomposition command handler, worker thread dispatch) |
| Modify | `native/engine/src/asset_cache.{h,cpp}` (collision cache namespace) |
| Modify | `native/engine/CMakeLists.txt` (verify HACDv2 link) |
| Modify | `packages/frontend/src/components/inspector/sections/CollisionSection.tsx` |
| Create | `packages/frontend/src/stores/collision-decomposition.ts` |
| Create | `packages/frontend/src/commands/definitions/collision-commands.ts` |
| Modify | `packages/viewport/src/...` (collision overlay renderer + view mode toggle) |

## Chrono-side risks

- HACDv2 must be linked into Chrono's build. Verify against
  `native/engine/CMakeLists.txt` and the Chrono cmake configuration before phase 3.
- HACDv2 is single-threaded. The worker-thread approach is mandatory for any part
  larger than a few thousand triangles — without it the transport loop stalls.
- Triangle mesh collision is fundamentally limited. Hard-enforce the "fixed bodies
  only" rule; do not let it leak into runtime as a confusing crash.
