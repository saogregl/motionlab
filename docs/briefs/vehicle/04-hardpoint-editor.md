# Epic V4 — Hardpoint Editor with Live Kinematic Sweeps

**Mission:** make suspension hardpoints editable in the viewport with direct
manipulation, snap, mirror, and a side panel that shows
camber/toe/caster/scrub-radius curves over wheel travel — recomputed live as
the user drags. This is the differentiator versus dropdown-and-text-form
authoring. There is no off-the-shelf reference implementation worth cribbing
from in the open-source world; the closest is Adams Car's hardpoint table,
which is keyboard-and-form only.

**Depends on:** V1 (Vehicle entity, hardpoints in proto, generic suspension
builder).

---

## Why

Suspension geometry is the single highest-leverage authoring task in vehicle
dynamics. Hardpoint placement determines roll center, instant centers,
anti-dive and anti-squat, bump steer, and camber/toe under travel. Authoring
it as a list of `(x, y, z)` text fields the way V1 does is correct as a
placeholder and miserable as a workflow.

A direct-manipulation editor with live geometric feedback is a first-class
moat. It is not feasible to evaluate a suspension change without seeing what
it does to camber curves through travel, and no other open-source tool
offers this.

## Current state (after V1)

- Hardpoints exist in the proto as `repeated Hardpoint` on `Suspension`.
- The inspector edits them as a list of three numeric fields.
- The viewport renders hardpoints as spheres in the "Suspension hardpoints"
  view mode but they are not interactive.
- Updates flow through `UpdateSuspensionCommand`, which rebuilds the
  suspension end-to-end on the engine side.

## Proposed model

### Direct-manipulation hardpoint editing

When the "Suspension hardpoints" view mode is active and a vehicle is
selected:

- Hardpoint spheres become **selectable**. Selection is multi-capable
  (shift-click to add).
- Selected hardpoints show a **manipulator gizmo** (translate-only, three
  axes plus three planes, like the existing transform gizmo on Bodies). The
  gizmo coordinate frame is the chassis frame, not world.
- Dragging the gizmo emits a stream of `UpdateSuspensionCommand` deltas. The
  engine rebuilds the suspension on each delta. **This is the hot path** —
  see performance constraints below.
- Hardpoints have **per-key constraints** declared by the suspension
  template:
  - Mirror-pair keys (`*_left` / `*_right`) edit symmetrically by default.
    Hold `Alt` to break symmetry. The mirror is across the vehicle's
    longitudinal centerline.
  - Some keys are constrained to a plane (e.g., a strut top is constrained
    to the chassis-frame Y plane). The gizmo locks to that plane when such
    a hardpoint is selected.
- Hardpoint markers are color-coded by **link membership** so the user can
  see which point belongs to which link (LCA, UCA, tie rod, strut top).

### Live kinematic sweep panel

A new docked panel ("Suspension Kinematics") shows the current axle's
geometric response to wheel travel. Four small graphs:

```
Camber (deg) vs travel (mm)       Toe (deg) vs travel (mm)
 ┌────────────────────┐            ┌────────────────────┐
 │  ╱                 │            │      ╱             │
 │ ╱                  │            │     ╱              │
 └────────────────────┘            └────────────────────┘

Caster (deg) vs travel             Scrub radius (mm) vs travel
 ┌────────────────────┐            ┌────────────────────┐
 │ ─────────          │            │  ╲                 │
 │                    │            │   ╲                │
 └────────────────────┘            └────────────────────┘
```

The sweep is computed by stepping the suspension through its travel range
(default −80 mm bump to +80 mm rebound, configurable per axle) and
recording geometric outputs at each step. **The sweep does not run the
simulation** — it runs a kinematics-only pass over the suspension linkage
at zero velocity, which is cheap.

When the user drags a hardpoint, the panel debounces (~50 ms) and
recomputes. The graphs update in place; the previous curve lingers as a
ghost for one recomputation cycle so the user can see what just changed.

### Viewport overlays

While editing hardpoints:

- **Instant center** is drawn as a marker (front view: the IC of the
  swing-arm equivalent linkage).
- **Roll center** is drawn as a marker on the chassis centerline.
- **Force lines** (anti-dive / anti-squat geometric lines) are drawn as
  dotted lines under the chassis.

Toggle each overlay in the kinematics panel. Default-off for cleanliness.

### Snap

Three snap modes available via modifier keys:

- **Grid snap** (`Ctrl`) — snap to a 1 mm chassis-frame grid.
- **Symmetry snap** (`S`) — snap to the chassis centerline (forces a
  hardpoint onto the longitudinal Y plane).
- **Component snap** (`C`) — snap to the centerline of an existing chassis
  hardpoint (e.g., put the strut top exactly above the wheel center).

Modifier-key collisions with the existing viewport tools must be audited
before Phase 3.

### Engine

- The kinematic sweep runs **inside the engine**, not in the frontend,
  because Chrono already knows how to evaluate suspension geometry. New
  runtime command `EvalSuspensionSweep { vehicle_id, axle_id, travel_min,
  travel_max, steps }` returns a `SuspensionSweepResult` with arrays of
  camber/toe/caster/scrub per step.
- Roll center / instant center calculations are done frontend-side from
  the current hardpoint positions (closed-form for double-wishbone and
  MacPherson; numerical fallback for multi-link and generic).
- The hot path during a drag emits ~30 update commands/sec. The engine
  must handle a suspension rebuild + sweep in <30 ms or the drag stutters.
  Pre-Phase-1 spike: measure rebuild time on a representative
  DoubleWishbone and confirm. If too slow, introduce a **lightweight
  rebuild** path that updates link transforms without re-running full
  Chrono `Initialize`.

### Frontend

- New viewport tool: `HardpointEditTool`. Activated when the suspension
  hardpoints view mode is on and a vehicle is selected.
- New panel `SuspensionKinematicsPanel.tsx` docked in the bottom panel
  area (peer to asset browser / timeline tabs).
- New mini-graph component for the sweep curves. **Reuses (or seeds) the
  curve canvas primitive from V5 Phase 1** — these two epics share a small
  math/render core.
- Mirror-pair detection lives in a `hardpoint-mirror.ts` utility, keyed by
  the `_left` / `_right` suffix convention from V1.

---

## Phases

### Phase 0 — Engine spike

Measure suspension rebuild + kinematic sweep cost on a DoubleWishbone. If
>30 ms, design and prototype the lightweight rebuild path before any
frontend work begins.

### Phase 1 — Hardpoint selection and gizmo

Hardpoints become selectable. Drag emits update commands. No mirror, no
snap, no sweep panel. Pure manipulation. Validates the engine hot path.

### Phase 2 — Mirror-pair editing

`_left`/`_right` pairing. Alt-break-symmetry. Plane constraints on
strut-top-style points.

### Phase 3 — Snap

Grid, symmetry, component snap with modifier keys. Audit existing key
bindings first.

### Phase 4 — Suspension Kinematics panel with sweep curves

`EvalSuspensionSweep` engine command. Live recompute on drag with debounce.
Ghost previous curve. **Consumes V5 Phase 1's curve canvas primitive** as
a read-only renderer.

### Phase 5 — Viewport overlays

Instant center, roll center, anti-dive/anti-squat lines. Per-overlay
toggles in the kinematics panel.

---

## Acceptance criteria

- [ ] User can select a hardpoint in the viewport and drag it to a new
      chassis-frame position.
- [ ] Mirror pairs move symmetrically by default; Alt breaks symmetry.
- [ ] Plane-constrained hardpoints only move in their constraint plane.
- [ ] Snap modes work via the documented modifier keys.
- [ ] Camber/toe/caster/scrub curves are visible in the kinematics panel
      and update within 100 ms of release.
- [ ] Roll center marker appears and moves correctly when hardpoints
      change.
- [ ] All edits flow through `UpdateSuspensionCommand` and are undoable.
- [ ] Drag stays responsive (>20 fps perceived) on a representative
      DoubleWishbone.
- [ ] The kinematics panel curves render through the same primitive V5
      uses for its f-curve editor.

## Out of scope

- Editing hardpoints during simulation (paused only).
- Constrained drag of dependent hardpoints (e.g., maintain LCA length
  while dragging the inboard pivot). Powerful but a significant scope
  expansion.
- Symbolic linkage analysis (closed-form roll-center for arbitrary
  topologies).
- Animated playback of the kinematic sweep (the sweep is static curves; a
  scrub control could come later).
- Editing the suspension link list itself (adding or removing links). V4
  edits *positions* of existing template hardpoints only. Generic
  template link editing is its own future epic.

## Open questions

- **Lightweight rebuild path**: Phase 0 will determine whether full Chrono
  re-initialization is fast enough or whether we need a custom rebuild
  that only updates link transforms. If the latter, it adds engine-side
  complexity and a separate code path for hardpoint drags vs save/load.
- **Roll center for multi-link**: closed-form RC only exists for symmetric
  independent suspensions. For multi-link / generic, fall back to a
  numerical solve from the geometry. Document the fallback.
- **Z-up vs Y-up gizmo orientation**: the gizmo runs in chassis frame.
  Confirm the chassis frame convention used by the rest of the vehicle
  inspector and match it.

## File checklist

| Action | File |
|---|---|
| Modify | `schemas/protocol/transport.proto` (EvalSuspensionSweep + SuspensionSweepResult) |
| Modify | `native/engine/src/vehicle.{h,cpp}` (sweep evaluator, lightweight rebuild if needed) |
| Modify | `native/engine/src/transport.cpp` (handler) |
| Create | `packages/viewport/src/tools/HardpointEditTool.ts` |
| Create | `packages/frontend/src/components/SuspensionKinematicsPanel.tsx` |
| Create | `packages/frontend/src/lib/hardpoint-mirror.ts` |
| Modify | `packages/ui/src/components/charts/curve-canvas.tsx` (V5-owned primitive used as read-only here) |
| Modify | `packages/viewport/src/...` (instant-center, roll-center, force-line overlays) |

## Risks

- **Engine rebuild latency dominates everything**. If suspension rebuild
  is slow, the entire hardpoint edit experience falls apart. Phase 0 spike
  is load-bearing.
- **Snap UX collisions**: three snap modifiers on top of the existing
  transform gizmo's modifier keys risks running out of keys. Audit
  existing modifier bindings before Phase 3.
- **Curve rendering primitive shared with V5**: two epics depending on
  one primitive risks divergence. Coordinate with V5 to ensure the
  primitive is designed with both consumers in mind from day one. V5
  Phase 1 explicitly delivers the shared primitive.
- **Closed-form roll center coverage**: easy for symmetric independent
  suspensions, hard for multi-link and generic. Numerical fallback works
  but may be slow enough to lag during drag — measure during Phase 5.
