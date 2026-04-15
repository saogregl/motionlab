# Epic T2 — Soft Terrain (SCM)

**Mission:** add deformable soil to the Terrain entity via Chrono's `SCMTerrain`.
Bodies with collision proxies sink, displace, and leave ruts in the soil according
to the Soil Contact Model (Bekker / Mohr-Coulomb / Janosi-Hanamoto).

**Depends on:** T1 (Terrain entity exists), collision/C1 (materials are still used
for non-soil contact pairs, e.g., rigid wheel against rigid object), and
collision/C4 (capability sections — Soil is the swappable section under the Terrain
entity).

---

## Why

Rigid terrain is enough for indoor robot demos. The moment users want a rover, an
excavator, a mobile manipulator on dirt, or any wheel-soil interaction study, they
need deformable soil.

SCM is the cheapest soil model in Chrono — fast enough to author with and physically
meaningful enough to be useful. Skipping straight to SPH or FEA would double the
runtime cost and triple the parameter complexity. SCM is the right MVP.

It is also the largest single epic across the collision and terrain series. The
proto is large, the inspector has the highest parameter density of anything in
MotionLab, the viewport has to stream live deformation, and performance depends on
correctly wiring active domains.

## Current state

- T1 introduces Terrain with `RigidSoilModel` only. The proto already has a
  `oneof soil_model` slot reserved for `SoftSoilSCM`.
- The viewport has no concept of streaming geometry updates from the engine —
  RuntimeFrame carries body poses but not vertex deltas.

## Proposed model

### Proto

```proto
message SoftSoilSCM {
  // SCM operates on a regular grid laid over the terrain patch. The grid resolution
  // controls fidelity vs cost — 200×200 is a reasonable starting point.
  uint32 mesh_resolution_x = 1;
  uint32 mesh_resolution_y = 2;

  // Bekker pressure-sinkage model
  double bekker_kphi = 10;        // Pa/m^n
  double bekker_kc   = 11;        // Pa/m^(n-1)
  double bekker_n    = 12;        // exponent, typically 0.6..1.8

  // Mohr-Coulomb shear failure
  double mohr_cohesion = 20;      // Pa
  double mohr_friction = 21;      // degrees

  // Janosi-Hanamoto shear-displacement
  double janosi_shear = 30;       // m

  // Elastic recovery and viscous damping
  double elastic_k = 40;          // Pa/m, must exceed bekker_kphi
  double damping_r = 41;          // Pa·s/m

  // Bulldozing (optional, expensive)
  bool bulldozing_enabled = 50;
  double erosion_angle = 51;       // degrees
  double flow_factor = 52;
  uint32 erosion_iterations = 53;
  uint32 erosion_propagations = 54;

  // Optional preset key for telemetry / UX. The engine ignores this if the numeric
  // params are also set (params win).
  string preset_key = 60;
}

message Terrain {
  // ... existing T1 fields ...
  oneof soil_model {
    RigidSoilModel rigid = 20;
    SoftSoilSCM scm = 21;
  }
}
```

### Soil presets

The raw Bekker constants will scare any user not already a tribologist. Ship a small
preset library with sensible parameters and a one-line description:

| Preset key   | What it feels like        | Source                          |
|--------------|---------------------------|---------------------------------|
| `sand_dry`   | Loose desert sand         | Wong, *Theory of Ground Vehicles*, ch. 2 |
| `clay_soft`  | Wet clay, deep sinkage    | Bekker 1969                     |
| `snow_packed`| Hard snow, low sinkage    | Chrono SCM demos                |
| `loose_dirt` | Garden topsoil            | Chrono SCM demos                |

Apply via a "Preset" dropdown at the top of the Soil section. Picking a preset fills
the numeric fields. Users can tweak them after, at which point the `preset_key` is
cleared (so the inspector doesn't lie about which preset is "active").

### Engine

- `terrain.cpp` (from T1) extended to construct `chrono::vehicle::SCMTerrain` when
  the soil model is SCM.
- Set parameters via `SetSoilParameters`.
- Initialize from heightfield image if the patch kind is `HEIGHTFIELD`, otherwise
  from a flat grid sized to the patch.
- **Active domains**: register one active domain per dynamic body that has
  collision enabled. Without this, SCM raycasts the entire mesh every step and
  frame rate dies. Use `chrono::vehicle::SCMTerrain::AddActiveDomain`.
- **Bulldozing**: opt-in. Most authoring scenarios don't need it, and it
  multiplies the per-step cost.
- **Dirty cell tracking**: SCM exposes the set of cells that changed during the
  last step. Capture these for streaming (see Viewport below).

### Frontend — Soil capability section

`TerrainInspector` gains a Soil section rendered through the collision/C4
registry. The section is a swap between "Rigid" and "SCM":

- **Soil model** dropdown (top, prominent): Rigid vs SCM.
- When SCM is selected:
  - **Preset** dropdown (top, prominent — most users only touch this).
  - **Bekker** subsection (kphi, kc, n).
  - **Mohr-Coulomb** subsection (cohesion, friction angle).
  - **Janosi-Hanamoto** subsection (shear).
  - **Elastic / damping** subsection.
  - **Bulldozing** subsection — collapsed by default, opt-in toggle.
  - **Mesh resolution** (x, y) with a warning row if the product exceeds
    ~250 000 cells.

Each numeric field has a tooltip explaining the parameter and its physical effect
(sinkage, rut depth, shear strength). This is the section where MotionLab
explicitly trades user education for usability — there is no shortcut around the
fact that SCM is parameter-heavy.

### Viewport — streaming deformation

The deformed soil mesh is rendered live during simulation. New RuntimeFrame field:

```proto
message TerrainDeformation {
  string terrain_id = 1;
  repeated uint32 dirty_cell_indices = 2;
  repeated float dirty_cell_heights = 3;   // same length as dirty_cell_indices
}

message RuntimeFrame {
  // ... existing fields ...
  repeated TerrainDeformation deformations = 30;
}
```

The viewport keeps a per-terrain heightmap GPU buffer; each frame, dirty cells are
patched in place. Default visualization is a height-shaded color ramp; an
alternative "rut depth" mode shades by delta from the initial heightmap so users
can see exactly where the wheels went.

For performance, only dirty cells are streamed. Reset/replay must reproduce the
same deformation history (see open questions on storage).

---

## Phases

### Phase 1 — Engine integration with hardcoded params

A flat patch with hardcoded `sand_dry` parameters. No streaming deformation yet —
frontend just sees bodies sink correctly. Validates the SCM construction path and
the active-domain wiring.

### Phase 2 — Inspector with full parameter exposure and presets

Engine reads parameters from the proto. Inspector exposes everything. Presets land
with their JSON resource. **No streaming deformation yet** — the soil is still
visualized as a flat surface.

### Phase 3 — Active domains

Register one active domain per dynamic body. Validate that frame rate stays
acceptable in a 4-wheel-on-soil test scene. Document measured numbers.

### Phase 4 — Streaming deformation to the viewport

Implement the dirty-cell stream and the height-shaded shader. This is the visual
payoff phase — the soil actually deforms in the viewport.

### Phase 5 — Bulldozing opt-in

The expensive optional feature. Inspector exposes the toggle and the four
bulldozing parameters.

---

## Acceptance criteria

- [ ] A wheel-shaped body on an SCM terrain with `sand_dry` preset sinks visibly
      within the first second of simulation.
- [ ] Selecting a preset fills all numeric fields.
- [ ] Tweaking any numeric field clears `preset_key` but does not reset the other
      fields.
- [ ] Active domains keep frame rate ≥ 30 Hz with up to four wheel-bodies on a
      200×200 grid (target hardware TBD; record measurement during phase 3).
- [ ] Live deformation streams to the viewport with no visible lag.
- [ ] SCM terrains persist through save/load including all parameters.
- [ ] Toggling the soil model from Rigid to SCM and back works without leaving
      orphaned engine state.
- [ ] Bulldozing toggle changes visible behavior when enabled.

## Out of scope

- SCM-to-SCM contact (not supported in Chrono).
- Force-feedback / haptic responses to soil interaction.
- Procedural soil heterogeneity (varying parameters spatially).
- Deformable tires interacting with SCM (deformable tire-soil is its own world,
  separate workstream).
- Initialization from non-image height sources (DEM/raster GIS files).
- Sediment transport, water content, freeze/thaw modeling.

## Open questions

- **Performance budget**: the 30 Hz target is a placeholder. We need a real
  measurement on representative hardware before committing to active-domain
  sizing defaults. Run during phase 3 and record in this doc.
- **Replay storage**: SCM deformation history is large. Recording every step is
  prohibitive; downsampling (e.g., one frame per 0.1 s) is more realistic. This
  is a meaningful data-volume decision and should be documented in an ADR
  *before* phase 4 ships.
- **Bulldozing UX**: erosion iterations are a finicky tuning knob with little
  intuitive meaning. Consider hiding behind a single "Bulldozing strength"
  0..1 slider that maps to a sensible parameter combination. Decide during
  phase 5.
- **Initialization order**: when a heightfield-backed terrain is switched from
  Rigid to SCM, does the SCM grid start from the heightfield or from a flat
  baseline? Recommendation: from the heightfield. Document explicitly.

## File checklist

| Action | File |
|---|---|
| Modify | `schemas/mechanism/mechanism.proto` (SoftSoilSCM message in the soil_model oneof) |
| Modify | `schemas/protocol/transport.proto` (RuntimeFrame.deformations) |
| Modify | `native/engine/src/terrain.{h,cpp}` (SCMTerrain branch + parameter wiring + active domains + dirty cell tracking) |
| Modify | `native/engine/src/transport_runtime_session.cpp` (deformation streaming) |
| Modify | `native/engine/CMakeLists.txt` (vehicle module already linked from T1) |
| Create | `packages/frontend/src/components/inspector/sections/SoilSection.tsx` |
| Modify | `packages/frontend/src/components/TerrainInspector.tsx` (Soil section via capability registry) |
| Create | `assets/presets/scm-soil.json` |
| Modify | `packages/viewport/src/...` (deformed terrain shader, height-mode toggle, dirty cell GPU patch path) |
| Create | `docs/decisions/ADR-XXXX-scm-replay-storage.md` (before phase 4) |

## Chrono-side risks

- **SCMTerrain construction** takes a `ChSystem*`. Confirmed usable outside
  vehicle scenes via `demo_ROBOT_Curiosity_SCM.cpp`. No new dependency beyond
  what T1 already pulls in.
- **Active domains require Chrono ≥ 9.x** — verify our pinned Chrono version
  supports them. If not, T2 phase 3 is blocked on a Chrono upgrade. Without
  active domains, this epic is not viable for any scene with more than one
  body.
- **Dirty cell API**: confirm SCMTerrain exposes the dirty cell set on the
  current Chrono version. If not, the streaming approach in phase 4 needs to
  fall back to a full heightmap re-upload per step (much more bandwidth, still
  workable for small grids).
- **Bulldozing parameters** can produce non-physical results if pushed. Cap the
  inspector ranges to documented sane values and document the limits inline.
