# Epic V5 — Driver Graph Editor (F-Curve Editor for Driver Inputs)

**Mission:** introduce a Blender-Graph-View-style F-curve editor for authoring
scripted driver inputs (throttle, brake, steer, gear, clutch). Keyframes with
bezier handles, multi-channel display, time scrubbing, snap, undo. This is
the foundation that V6 (maneuvers) composes on top of, and the primitive that
V4 (suspension sweep panel) consumes as a read-only renderer.

**Depends on:** nothing in the vehicle series — this is greenfield UI that V4
and V6 consume. Can ship in parallel with V1–V3.

---

## Why

Vehicle dynamics testing is fundamentally about **how the driver inputs change
over time**. "Hold throttle 80% for 1 s, then release" is the simplest
possible test, and there is no reasonable way to author it through static
parameter forms.

Blender's Graph View / F-Curve editor is the right reference for a strong
reason: it solves the *same* problem (a small number of named channels, each
with keyframes interpolated by bezier handles, with selection and direct
manipulation of control points). Driver inputs map onto f-curves one-to-one.

This is also the **first curve-editor surface** in MotionLab. The primitive
will be reused: tire force-vs-slip plots in V3, suspension sweep curves in
V4, torque/RPM maps in V2, results overlays in the existing channel system.
The graph editor is greenfield UI but the underlying curve primitive earns
its keep across multiple epics.

## Current state

- No curve editor in the frontend. No keyframe data type. No bezier handle
  manipulation. No driver entity in the proto.

## Proposed model

### Driver as a typed entity

A `Driver` is a new typed entity (separate from `Vehicle`, since one driver
can drive multiple vehicles in different runs and one vehicle can have
multiple driver definitions for different test scenarios).

In V5 a Driver has only the **scripted** kind. V6 adds controller (PID,
path follower) and live (gamepad) kinds.

### Proto

```proto
enum DriverChannelKind {
  DRIVER_CHANNEL_KIND_UNSPECIFIED = 0;
  DRIVER_CHANNEL_KIND_THROTTLE = 1;       // 0..1
  DRIVER_CHANNEL_KIND_BRAKE = 2;          // 0..1
  DRIVER_CHANNEL_KIND_STEER = 3;          // -1..1
  DRIVER_CHANNEL_KIND_CLUTCH = 4;         // 0..1
  DRIVER_CHANNEL_KIND_GEAR = 5;           // integer
}

enum InterpolationMode {
  INTERP_MODE_UNSPECIFIED = 0;
  INTERP_MODE_CONSTANT = 1;     // step / hold
  INTERP_MODE_LINEAR = 2;
  INTERP_MODE_BEZIER = 3;
}

message Keyframe {
  double time = 1;              // seconds
  double value = 2;
  InterpolationMode interp = 3;
  // Bezier handles relative to the keyframe (time, value)
  Vec2 left_handle = 4;
  Vec2 right_handle = 5;
}

message DriverChannel {
  DriverChannelKind kind = 1;
  repeated Keyframe keyframes = 2;          // sorted by time
  double default_value = 3;                  // value when no keyframes
}

message ScriptedDriver {
  repeated DriverChannel channels = 1;
}

message Driver {
  ElementId id = 1;
  string name = 2;
  oneof kind {
    ScriptedDriver scripted = 10;
    // V6: ControllerDriver, LiveDriver
  }
}

message Mechanism {
  // ... existing ...
  repeated Driver drivers = 14;
}
```

### Graph editor UX (Blender Graph View analog)

The editor opens in the bottom panel as a new tab peer to "Asset Browser",
"Timeline", and (later) "Maneuver Composer". Layout:

```
┌──────────────────────────────────────────────────────────────────┐
│ Driver: Test Step Steer  [v]  ▶ Preview  ⊟ Channels  ⚙          │
├────────────┬─────────────────────────────────────────────────────┤
│ ☑ Throttle │                                                     │
│ ☑ Brake    │       ╱──╲                                          │
│ ☑ Steer    │      ╱    ╲___                                      │
│ ☐ Clutch   │     ╱        ╲                                      │
│ ☐ Gear     │    ╱           ╲___                                 │
│            │                                                     │
│            │  0       1       2       3       4       5    s    │
└────────────┴─────────────────────────────────────────────────────┘
```

Core interactions (lifted from Blender Graph View where they map):

- **Channel list** on the left. Click to toggle visibility, double-click
  to rename the *driver* (channel kinds are fixed).
- **Curve area** shows visible channels on a shared time axis with
  per-channel value scaling so all channels fit. Each channel has its
  own color.
- **Keyframe selection**: click to select, shift-click to add, box-select
  (drag empty area), select-all (`A`), deselect-all (`Alt+A`).
- **Bezier handle manipulation**: selected keyframes show their two
  handles as draggable dots. Drag a handle to reshape the interpolation.
  Hold `Shift` to constrain handle to time axis. `V` cycles handle type
  (free / aligned / vector / auto), Blender-style.
- **Insert keyframe** with `I` at the current playhead time on visible
  channels using the current interpolated value.
- **Delete keyframe** with `X` or `Del`.
- **Snap**: hold `Ctrl` while dragging a keyframe to snap to grid time
  (configurable: 0.1 s, 0.05 s, 0.01 s).
- **Box zoom** (`B`), **scroll-wheel zoom**, **middle-mouse pan** — match
  the existing viewport conventions where possible; document divergences.
- **Playhead scrubbing**: click+drag the time axis. The viewport vehicle
  preview (see below) updates.

Keymap collisions with the existing viewport tools and global shortcuts
must be audited before Phase 4 ships. Where Blender's binding conflicts
with an existing MotionLab binding, MotionLab wins and the divergence is
documented in the editor's help overlay.

### Authored input vs simulated response — the loud distinction

The brainstorm called this out: the timeline shows the *authored input*,
but users will conflate it with the *simulated response*. The editor
draws a clear visual distinction:

- **Authored input curves** are drawn solid, full opacity, in their
  channel color. Editable.
- **Simulated response curves** (after a run) are drawn as a separate
  optional overlay: dashed, lower opacity, **read-only**, labeled with
  the run ID they came from. Toggle per channel in the channel list with
  a separate "show response" checkbox.

The visual language is loud enough that users cannot accidentally edit
the response. Also: the editor's title bar shows `Editing: input` vs
`Editing: input + comparing to run #42` — explicit mode display.

This is the most likely user-confusion failure mode in V5 and the one
worth investing UX polish in.

### Preview

A "Preview" toggle in the editor header runs the driver against the
currently selected vehicle in a non-physics preview mode that just
animates the driver inputs visually (steering wheel rotation, brake
light, no actual sim). This is for sanity-checking the driver script
without running a full sim.

For real responses, the user runs a sim and then enables "show response"
on the channels to overlay.

### Engine

- New `driver.{h,cpp}` module owning the driver factories. In V5 only
  the scripted kind exists; the engine evaluates each channel by
  interpolating keyframes at the current sim time.
- The scripted driver implements `chrono::vehicle::ChDriver` and is
  bound to a vehicle at sim start. In V5, binding is implicit ("first
  vehicle in the scene"); V6's Scenario makes the binding explicit.
- `EvalDriverPreview { driver_id, time_min, time_max, steps }` returns
  per-channel sample arrays for the editor's preview without running a
  sim.

### Curve canvas primitive (shared with V4)

Lives in `packages/ui/src/components/charts/curve-canvas.tsx`. Renders:

- **Read-only sweep curves** (V4 use case — kinematics panel).
- **Editable bezier curves** with selectable control points and handles
  (V5 use case — driver editor).
- **Result overlay curves** (read-only ghost on top of editable, V5 use
  case — response overlay; also future use for results browser
  overlays).

The primitive must support all three modes from day one or it'll
fragment into per-consumer copies. **V5 Phase 1 ships the primitive;
V4 Phase 4 is the first read-only consumer; V5 Phase 2+ is the first
editable consumer.**

---

## Phases

### Phase 1 — Curve canvas primitive (read-only)

Build the curve rendering primitive with bezier interpolation, no
editing. Used by V4's sweep panel as the first consumer. This phase is
*intentionally* a foundation phase — no Driver entity yet, no editor UI.

### Phase 2 — Driver entity + minimal editor (linear interp only)

Driver as a typed entity with channels and linear keyframes. Editor with
selection, drag, insert, delete. No bezier handles. Validates the
round-trip and the interaction model.

### Phase 3 — Bezier handles

Selected keyframes show handles. Drag to reshape. Handle type modes
(free, aligned, vector, auto). Shift-constrain to time axis.

### Phase 4 — Snap, multi-select, box-select, channel filtering

Polish phase. Match Blender's Graph View shortcuts as closely as the
audit allows.

### Phase 5 — Result overlay and run binding

After a run completes, the editor can overlay the simulated response
on top of the authored input. Loud visual distinction. Per-channel
toggle. Title-bar mode display.

### Phase 6 — Driver preview

Non-physics animation of driver inputs in the viewport for
sanity-checking without running a sim.

---

## Acceptance criteria

- [ ] A user can create a Driver entity from the structure tree.
- [ ] Opening the Driver in the editor shows an empty graph with all
      five channels listed.
- [ ] Inserting, dragging, and deleting keyframes works on linear and
      bezier interpolation.
- [ ] Bezier handle drag reshapes the curve in real time.
- [ ] Multi-channel selection and box-select work.
- [ ] Snap-to-grid works under modifier key.
- [ ] After a sim run with a scripted driver, the simulated response can
      be overlaid on top of the input curves and is **visually distinct
      enough that no user mistakes it for editable input**.
- [ ] Save/load round-trips a driver including bezier handle data.
- [ ] The curve canvas primitive is shared with V4's sweep panel —
      confirmed by a single source file used by both.

## Out of scope

- Curve modifiers (Blender's noise/cycles/limits stack). V5 is keyframes
  only.
- Importing driver inputs from a CSV file. V6 may add this for replaying
  recorded inputs.
- NLA-style strip composition (V6).
- Live gamepad recording into keyframes (V6).
- Markers and events on the timeline (V6).
- Driver logic blocks ("if speed > 60, brake"). V6 controllers cover
  closed-loop logic; V5 is purely scripted.
- Multi-driver editing in one editor view.

## Open questions

- **Channel value scaling**: throttle is 0..1, steer is −1..1. Either
  per-channel Y axis with auto-fit, or a shared normalized Y with
  channels scaled to fit. Recommendation: per-channel Y axis, similar to
  Blender's per-fcurve auto-scale.
- **Keymap conflicts**: Blender's `A`, `B`, `I`, `X`, `V` shortcuts may
  collide with MotionLab's existing keybindings. Audit before Phase 4
  and document any divergences in the editor help overlay.
- **Driver-vehicle binding**: V5 binds a driver to "the first vehicle in
  the scene" as a placeholder. V6's Scenario makes the binding explicit.
  Document the placeholder.
- **Curve canvas in viewport vs. DOM**: Canvas2D vs WebGL vs SVG. Canvas
  is probably right (cheap, infinite zoom, easy selection hit-testing).
  Decide before Phase 1.

## File checklist

| Action | File |
|---|---|
| Modify | `schemas/mechanism/mechanism.proto` (Driver / DriverChannel / Keyframe / ScriptedDriver) |
| Modify | `schemas/protocol/transport.proto` (driver CRUD + EvalDriverPreview) |
| Create | `native/engine/src/driver.{h,cpp}` |
| Modify | `native/engine/src/vehicle.{h,cpp}` (driver hookup) |
| Create | `packages/ui/src/components/charts/curve-canvas.tsx` |
| Create | `packages/frontend/src/components/DriverGraphEditor.tsx` |
| Create | `packages/frontend/src/components/inspector/DriverInspector.tsx` |
| Modify | `packages/frontend/src/components/ProjectTree.tsx` (Drivers group) |
| Modify | `packages/frontend/src/commands/definitions/create-commands.ts` |
| Create | `packages/ui/src/components/charts/curve-canvas.stories.tsx` |

## Risks

- **Building a real curve editor is a real project**. Half of one is
  worse than none — users will keep editing keyframes in the inspector
  and ignore the editor entirely. Budget for all of Phases 1–4 before
  declaring V5 shippable.
- **Keymap collisions** with viewport tools and global shortcuts. Audit
  and document.
- **Result-overlay confusion** is the most likely user complaint. The
  visual distinction must be obvious to users who do not read
  documentation.
- **Curve canvas as a shared primitive**: V4 needs it read-only, V5
  needs it editable. Building two primitives splits the cost; building
  one with mode flags is the right design but harder to land
  cleanly. V5 Phase 1 has to nail the API.
