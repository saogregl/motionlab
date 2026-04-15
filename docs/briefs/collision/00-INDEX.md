# Collision Authoring — Epic Series Index

> Series goal: take MotionLab from minimal per-geometry primitive collision (current
> state) to a full collision authoring experience: authored physics materials, mesh
> and convex collision, runtime contact reporting, and a capability-section inspector
> model that scales as new shared sections appear.

## Current state (snapshot 2026-04-14)

- `CollisionConfig` exists on `Geometry` with shape types `NONE` / `BOX` / `SPHERE` /
  `CYLINDER`. `CONVEX_HULL` is reserved as an enum value but not implemented.
  (`schemas/mechanism/mechanism.proto:147–165`)
- The engine creates a single shared `ChContactMaterialNSC` per body
  (`native/engine/src/simulation.cpp:702`) with hardcoded friction. There is no
  authored material concept.
- A `CollisionSection.tsx` exists in the frontend inspector and writes back via
  `UpdateCollisionConfigCommand`. It is wired into both `BodyInspector` and
  `GeometryInspector` by hand.
- No contact reporting, no convex decomposition, no mesh collision, no per-body
  contact toggle, no contact filtering/groups, no SMC contact method.
- Effectively, the contact system runs but is cosmetic — friction is one-size-fits-all
  and most authored mechanisms have collision disabled.

## Epics

| # | File | Title | Depends on |
|---|------|-------|------------|
| C1 | [01-physics-materials.md](01-physics-materials.md) | Physics Material assets | — |
| C2 | [02-collision-shapes.md](02-collision-shapes.md) | Convex hull, decomposition, mesh collision | C1 |
| C3 | [03-contact-runtime.md](03-contact-runtime.md) | Contact reporting and viewport overlays | C1 |
| C4 | [04-capability-sections.md](04-capability-sections.md) | Capability-section inspector model | — (cross-cuts) |
| UX | [05-ux-deep-dive.md](05-ux-deep-dive.md) | UX principles, components, view modes — read alongside C1–C4 and T1–T2 | — |

C1 is the foundation — it changes the protocol contract so collision references an
authored material instead of a hidden default. C2 and C3 build on top in parallel.
C4 is structural inspector work that lands cleanest after C1 has produced its first
genuinely cross-entity inspector section, justifying the abstraction with a real
second user.

## Out of scope for this series

- Soft-body / FEA collision (separate workstream).
- Self-collision filtering inside an assembly (deferred until users actually hit it).
- Continuous collision detection (CCD) toggles.
- Custom collision callbacks / scripted contact responses.
- Body-vs-terrain interaction rules — see `../terrain/`.

## Chrono reference (verified via deepwiki)

- **Collision shapes**: `ChCollisionShape{Box,Sphere,Cylinder,Capsule,ConvexHull,
  TriangleMesh}` attached via `ChBody::AddCollisionShape(shape, frame)`. Body must call
  `EnableCollision(true)`.
- **Materials**: `ChContactMaterialNSC` (non-smooth, complementarity solver — current
  default) vs `ChContactMaterialSMC` (smooth, penalty — needed for `ChSystemSMC`).
  Materials are **per-shape**, not per-body, in Chrono's data model.
- **Convex decomposition**: `ChConvexDecompositionHACDv2` produces N convex hulls from
  a triangle mesh; each hull becomes a `ChCollisionShapeConvexHull` attached to the
  body. Helpers: `LoadConvexMesh`, `AddConvexCollisionModel`,
  `AddTriangleMeshConvexDecomposition`.
- **Contact reporting**: implement a `ChContactContainer::ReportContactCallback` to
  walk contacts each step and accumulate per-pair point/normal/force data.

## Cross-series link

The terrain epics (`../terrain/`) consume material assets defined in C1 and the
capability-section model defined in C4. T1 (Rigid Terrain) is roughly a sibling of
C2 in scope; T2 (Soft Terrain SCM) is the largest single epic across both series.
