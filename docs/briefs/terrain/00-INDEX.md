# Terrain — Epic Series Index

> Series goal: introduce Terrain as a first-class authored entity. Start with rigid
> terrain (heightfield, mesh, flat, box patches) and follow with deformable soft
> terrain via Chrono's Soil Contact Model (SCM).

## Why now

Collision authoring (see `../collision/`) only makes sense if there is something for
authored bodies to interact with. The current "ground" in MotionLab is implicit —
whatever fixed body the user authored. That is enough for stacked-block tests but
not enough for mobile robots, rovers, vehicles, or any scene larger than a desktop
demo.

Terrain is also the natural test bed for the capability-section inspector model
(collision/C4): Terrain has core "extent / source" properties plus a swappable Soil
section, exactly the shape the registry was designed for.

## Epics

| # | File | Title | Depends on |
|---|------|-------|------------|
| T1 | [01-rigid-terrain.md](01-rigid-terrain.md) | Rigid Terrain entity | collision/C1 |
| T2 | [02-soft-terrain-scm.md](02-soft-terrain-scm.md) | Soft Terrain via SCM | T1, collision/C1, collision/C4 |

UX guidance for both T1 and T2 lives in
[`../collision/05-ux-deep-dive.md`](../collision/05-ux-deep-dive.md) — it covers
view modes, soil inspector layout, heightfield import flow, and the visual
language for terrain and contact overlays.

T1 establishes the Terrain entity, its proto contract, the engine binding via
`chrono::vehicle::RigidTerrain`, and viewport visualization. T2 layers SCM on top —
same entity, swappable soil model.

## Out of scope for this series

- **CRMTerrain** (granular SPH). Requires the `CHRONO_FSI` module and a GPU build.
  Significant infrastructure work; revisit as its own series.
- **FEATerrain** (deformable FEA). Major workstream of its own.
- **Procedural terrain generation** (noise, erosion sims).
- **Terrain editing tools** (sculpt brushes, paint). Heightfields are imported, not
  authored in-app.
- **Terrain LOD or tiling** for very large worlds.
- **Dynamic terrains** that move with bodies.

## Chrono reference (verified via deepwiki)

- **`chrono::vehicle::RigidTerrain`** — supports patches from a heightfield image, a
  mesh file, or a procedural box. Lives under the vehicle module but its
  constructor takes a `ChSystem*`, so it is usable outside vehicle scenes. See
  `demo_VEH_RigidTerrain.cpp`.
- **`chrono::vehicle::SCMTerrain`** — Soil Contact Model. Parameterized by Bekker
  (`Bekker_Kphi`, `Bekker_Kc`, `Bekker_n`), Mohr-Coulomb (`Mohr_cohesion`,
  `Mohr_friction`), Janosi-Hanamoto (`Janosi_shear`), and elastic / damping
  (`elastic_K`, `damping_R`). Constructor takes a `ChSystem*` — usable outside
  vehicle scenes (see `demo_ROBOT_Curiosity_SCM.cpp`,
  `demo_ROBOT_Viper_SCM.cpp`).
- **Active domains**: SCM supports per-body active regions for performance — only
  raycast under the bodies that are actually on the soil. **Critical** for usable
  frame rates in T2.
- **Bulldozing**: optional SCM feature that simulates soil inflation at the side of
  ruts. Controlled by `erosion_angle`, `flow_factor`, `erosion_iterations`,
  `erosion_propagations`. Expensive — opt-in per terrain.

## Cross-series links

- collision/C1 (Physics Materials) — Terrain references a material the same way a
  Body's collision does.
- collision/C2 (Convex / Mesh Collision) — bodies need real collision proxies to
  meaningfully sit on terrain.
- collision/C3 (Contact Reporting) — contact diagnostics work without modification
  on terrain pairs (terrain participates in contacts like any other collidable).
- collision/C4 (Capability Sections) — the Soil inspector section is registered
  through C4's registry.

## Series-wide risks

- **Vehicle module dependency**: both `RigidTerrain` and `SCMTerrain` live in
  `chrono::vehicle`. Linking them pulls in `ChronoEngine_vehicle` and its
  dependencies. Verify this module is enabled in our pinned Chrono build before
  T1 phase 1. If too heavy, fall back to constructing equivalent rigid bodies +
  collision shapes directly without the `RigidTerrain` wrapper.
- **Chrono version**: SCM active domains are a relatively recent addition. Confirm
  our pinned Chrono version supports them before T2 phase 3, or budget a Chrono
  upgrade.
