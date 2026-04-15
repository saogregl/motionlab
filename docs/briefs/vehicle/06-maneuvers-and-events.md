# Epic V6 — Maneuver Composition, Events, and Live Drive

**Mission:** add an NLA-style strip composition layer above V5's curve editor,
parameterized maneuver presets (ISO 3888 double lane change, constant radius,
step steer, etc.) that expand into editable timelines, event markers (capture
windows, stop conditions, trigger zones), and gamepad live-drive that streams
input through the same channel transport — and auto-records back into a
scripted Driver.

**Depends on:** V5 (driver curve editor), V1 (vehicle entity), terrain/T1
(ground to drive on).

---

## Why

V5 lets a user author a single scripted driver. V6 lets them compose multiple
input sources (scripted curves, closed-loop controllers, gamepad live input)
on a timeline and bind that timeline to a vehicle and a terrain in a runnable
**Scenario**. It also delivers the parameterized presets that real users
actually care about: ISO standard maneuvers, skidpad runs, step inputs,
road-profile ride events.

The brainstorm called Blender's NLA editor as the right reference (not the
basic dopesheet) because controllers and scripted curves both need to coexist
on the same timeline as time-bounded strips with their own parameters. V6
adopts that model.

## Current state (after V5)

- V5 ships the scripted-curve driver and the f-curve editor.
- No way to compose driver fragments. No controllers. No gamepad. No
  parameterized presets. No event markers.
- Vehicles are bound to the "first scripted driver" implicitly.

## Proposed model

### Scenario as a typed entity

A `Scenario` is a new typed entity that bundles **everything needed to run
a vehicle test**:

- A vehicle reference.
- A terrain reference.
- A timeline of driver strips (the maneuver).
- Stop conditions.
- Captured channels.
- Initial conditions (start position, initial speed, gear, etc.).

A scene can hold many Scenarios — one Vehicle can be tested in a dozen
maneuvers without authoring a dozen vehicles. This is also the natural unit
for parameter sweeps in a future epic (the "vary something across N runs"
story).

### Strip composition (NLA model)

A maneuver timeline is a list of **strips**. Each strip occupies a time
range and produces driver inputs over that range. Two strip kinds in V6:

- **Scripted strip** — references a Driver entity (V5). Within its range,
  the strip plays the driver's f-curves. Multiple scripted strips can be
  laid in sequence or layered with a blend mode (replace / add / max).
- **Controller strip** — references a controller kind and parameters.
  Controllers in V6:
  - **Speed hold** — PID on target speed. Parameters: target speed,
    Kp/Ki/Kd, gear policy.
  - **Path follower** — Bezier path drawn directly in the viewport
    (see below). Parameters: target speed, lookahead distance, lateral
    PID.
  - **Constant input** — flat throttle/brake/steer values for the strip
    duration. The simplest possible "controller."

Strip layering rules:

- Strips in different layers combine top-to-bottom. The top non-blank
  channel value wins (or is added/maxed depending on blend mode).
- Strips on the same layer cannot overlap in time. Validation is enforced.
- A blank gap between strips falls back to the channel's `default_value`.

The composition model is small enough to be explained in a single diagram
and still expressive enough to compose all six built-in presets. Document
the rules with examples in the editor's help overlay.

### Path drawing in the viewport

Path-follower controllers reference a Bezier path. The path is authored
**in the viewport** as a typed entity (`Path`):

- `Path` is a new top-level scene entity (not a sub-entity of Scenario)
  so a single skidpad path can be shared between an "acceleration on
  skidpad" scenario and a "constant radius on skidpad" scenario.
- Authoring tool: click in the viewport to drop control points. Each
  point has bezier handles like a 2D pen tool. The path lives on the
  terrain surface (snapped to the highest terrain at each XY).
- Speed annotations: per-control-point optional speed override.
  Otherwise the path-follower uses the strip's target speed.

Stealing Blender's bezier curve UX is fair game here — it is the most
refined viewport bezier authoring in any open tool.

### Events

Events are **timeline markers** with an attached behavior:

| Event kind | Fires when | Effect |
|---|---|---|
| Stop condition | A condition expression evaluates true | Ends the run |
| Capture window start | Time reached | Begins recording the listed channels at high rate |
| Capture window end | Time reached | Ends the high-rate recording |
| Trigger zone | Vehicle enters a zone in 3D | Logs an event timestamp, optionally fires another action |
| Terrain swap | Time reached | Switches terrain (for ride events that need a road profile change) |

Events render as colored markers on the timeline ruler. Click to inspect.

**Stop conditions** are expressions over channel names: `time > 30` or
`vehicle_speed < 1` or `lateral_distance > 5`. Keep the expression language
small — V6 only needs comparisons and `&&` / `||` over a handful of vehicle
channels. If users ask for more, revisit; do not pull in a real expression
library preemptively.

### Parameterized maneuver presets

Presets are **functions that take parameters and emit a fully-formed
Scenario timeline**. Examples:

| Preset | Parameters | Generates |
|---|---|---|
| ISO 3888-2 (double lane change) | entry speed, gate spacing | Path-follower strip + entry-speed condition + gate trigger zones + stop condition |
| Constant radius (skidpad) | radius, target speed | Circular path-follower + speed-hold layer + lap counter |
| Step steer | initial speed, step magnitude, hold duration | Speed-hold + scripted steer step strip + capture window |
| Acceleration test | start speed, target speed, gear policy | Speed-hold target + capture window + stop condition |
| Coast-down | start speed | Constant-input strip with throttle/brake = 0 + stop condition `vehicle_speed < 1` |
| Ride event | road profile asset, target speed | Speed-hold + terrain reference + capture window |

A preset expands into a real timeline. The user can then **edit the
result** — the preset is not a special opaque mode, it's a constructor
for normal timeline contents. This is critical: there is no "preset mode"
vs "free edit mode" duality. Users can fork any preset.

Presets ship as **code** (a small TypeScript factory function per preset)
that produces the proto messages, not as serialized data files. New
presets are added by writing a new function. This is the deliberate
opposite of "ship a JSON catalog" — each preset is a small program that
the user can read.

### Live gamepad drive

A **live driver kind** uses the system gamepad (via the existing
`navigator.getGamepads` web API in the renderer process) and emits inputs
into the same channel transport as a scripted driver. Live drive is a
*runtime mode*, not a strip kind: when a Scenario is launched in "live"
mode, the gamepad replaces whatever scripted driver is on the timeline
for the duration of the run.

Live runs are **recorded by default** — the gamepad input stream is
captured and written into a fresh Driver entity at run end, so the user
can convert "that one good lap" into a scripted driver and tweak it in
the V5 editor.

This is the mechanism that ties V5 and V6 together with the existing
channel-based results system: live input → channels → results artifact →
overlay in the f-curve editor → fork into a scripted driver. The full
loop, with no JSON files anywhere in it.

### Engine

- `scenario.{h,cpp}` owns Scenario evaluation: at each sim step, walk the
  timeline strips, ask each active strip for its current channel outputs,
  blend by layer rules, hand the result to the vehicle's driver binding.
- Controllers run inside the engine. Path-follower uses
  `chrono::vehicle::ChPathFollowerDriver` under the hood; speed-hold uses
  a PID; constant-input is trivial.
- Event evaluation runs each step. Stop conditions check expressions;
  trigger zones do AABB / sphere checks against vehicle position.
- Live drive: gamepad input arrives over the protocol from the frontend,
  gets dispatched to a `LiveDriver` instance. This is the only V6 path
  where input flows frontend-to-engine during a run instead of the other
  way around.

### Frontend

- New typed entity collection `useMechanismStore.scenarios`.
- New `ScenarioInspector.tsx` with sections for vehicle binding, terrain
  binding, initial conditions, captured channels, stop conditions.
- New "Maneuver Composer" tab in the bottom panel. NLA-style: a track
  list on the left, a time ruler at the top, strips as colored
  rectangles on tracks, event markers above the ruler. Strips are
  draggable, resizable, click-to-inspect.
- New "Add Scenario → From Preset → ISO 3888-2 / Skidpad / Step Steer /
  …" creation flow.
- New viewport tool `PathDrawTool` for path-follower paths. Click to add
  control points, drag to add bezier handles. Path renders on terrain.
- New "Live Drive" run mode toggle in the run controls. Greyed out if
  no gamepad detected.

### Channels exposed by Scenario

A Scenario, in addition to all vehicle channels, exposes:

- `scenario.elapsed_time`
- `scenario.active_strip_name` (string)
- `scenario.event_log` (array of fired event records)
- `scenario.gate_n_crossed` (per-trigger-zone)

These let users overlay scenario state on their results plots.

---

## Phases

### Phase 1 — Scenario entity + single-strip scripted driver

Scenario as a typed entity. Inspector for vehicle/terrain bindings.
Maneuver composer with one track and one scripted strip. Validates the
timeline → runtime path.

### Phase 2 — Multi-strip composition + layering rules

Multiple strips per track, multiple tracks, layer blending. Validation
that strips on a track don't overlap. Document the rules in the help
overlay.

### Phase 3 — Speed hold and constant-input controllers

The two simplest controller strip kinds. PID parameters in the strip
inspector.

### Phase 4 — Path drawing tool + path-follower controller strip

Viewport bezier path authoring. Path-follower controller strip references
a Path entity. Validates that engine `ChPathFollowerDriver` tracks an
authored path correctly.

### Phase 5 — Events: stop conditions and capture windows

Stop expressions over channel names. Capture windows. Markers on the
timeline ruler.

### Phase 6 — Trigger zones and terrain swap events

3D zones in the viewport. Terrain swap event for road-profile changes.

### Phase 7 — Parameterized maneuver presets

Six presets: ISO 3888-2, skidpad, step steer, acceleration test,
coast-down, ride event. Each as a TypeScript factory.

### Phase 8 — Live gamepad drive + auto-record

Gamepad input path. Live-drive run mode. Auto-record into a fresh
Driver entity at run end.

---

## Acceptance criteria

- [ ] User can create a Scenario, bind a vehicle and a terrain, and run
      it.
- [ ] Timeline supports multiple scripted and controller strips with
      documented layering rules.
- [ ] User can draw a Bezier path in the viewport and run a path-follower
      strip against it.
- [ ] Stop conditions terminate runs at the expected time.
- [ ] Capture windows produce a result artifact with the listed channels
      at higher rate than the default.
- [ ] All six maneuver presets expand into editable timelines.
- [ ] Editing a preset's timeline after expansion works without breaking
      the preset (the preset key is cleared, like V2/V3 destructive
      edits).
- [ ] Live drive with a gamepad produces the same channel outputs as a
      scripted equivalent.
- [ ] Auto-recording a live drive creates a Driver entity that, when
      played back, reproduces the same vehicle response within tolerance.
- [ ] The Maneuver Composer tab visually communicates the difference
      between authored input strips and the simulated response.

## Out of scope

- Multi-vehicle scenarios (e.g., car-following). One vehicle per
  scenario.
- Co-simulation with external traffic.
- Parameter sweeps across scenarios (separate epic — "vehicle parameter
  studies").
- Steering wheel hardware, force feedback.
- Driver fatigue / human factors models.
- Scripting the maneuver in a scripting language (TypeScript factories
  are the only authoring path for new presets).
- Trigger zone Boolean composition (zone A AND zone B).
- Saving live-drive runs as anything other than a fresh Driver entity.

## Open questions

- **Live-drive recording fidelity**: gamepad polling rate is 60 Hz
  typical; sim runs faster. Recording at gamepad rate and interpolating
  means scripted playback won't perfectly match live response. Document
  the expected divergence and note it in acceptance criteria.
- **Preset versioning**: preset factories ship as code, so the
  `preset_key` stored on a Scenario is purely a label for display. A
  preset's expansion can change between MotionLab versions. Decide
  whether to record the preset version on the Scenario for
  reproducibility — recommendation: yes, write a `preset_version`
  field that is purely informational.
- **Stop condition expression language**: limit to comparisons (`channel
  op value`) and `&&` / `||`, or pull in a real expression library?
  Start with the limited form; revisit if users ask.
- **Path snapping to terrain**: paths snap to terrain height when drawn.
  What happens when the terrain is later edited? Recommendation: paths
  store XY only and re-snap to terrain at sim start. Document.

## File checklist

| Action | File |
|---|---|
| Modify | `schemas/mechanism/mechanism.proto` (Scenario, Strip, Controller, Path, Event messages) |
| Modify | `schemas/protocol/transport.proto` (scenario CRUD, gamepad input stream, event records) |
| Create | `native/engine/src/scenario.{h,cpp}` |
| Modify | `native/engine/src/driver.{h,cpp}` (controller drivers, live driver) |
| Create | `packages/frontend/src/components/ScenarioInspector.tsx` |
| Create | `packages/frontend/src/components/ManeuverComposer.tsx` |
| Create | `packages/frontend/src/lib/maneuver-presets/{iso-3888,skidpad,step-steer,accel,coast-down,ride}.ts` |
| Create | `packages/viewport/src/tools/PathDrawTool.ts` |
| Modify | `packages/frontend/src/components/run-controls.tsx` (live-drive mode toggle) |
| Modify | `packages/frontend/src/components/DriverGraphEditor.tsx` (auto-record import path) |

## Risks

- **NLA composition rules are subtle**. Layer blending, gap fallbacks,
  controller-vs-scripted precedence — get this wrong and users will
  fight the timeline. Document the rules with examples and ship with at
  least one preset that exercises layering (e.g., speed hold layer +
  steer scripted layer).
- **Path-follower tracking quality** depends on lookahead and vehicle
  speed. Ship reasonable defaults derived from `chrono::vehicle::
  ChPathFollowerDriver` recommendations, and surface lookahead as a
  parameter on the strip so users can tune.
- **Gamepad permission model** in Electron. Verify the renderer process
  has gamepad API access in our security profile before Phase 8 begins.
- **The composer is the second curve-editor-shaped surface in the
  product**. It must consistently feel like an extension of V5, not a
  parallel UI. Reuse V5 components (curve canvas, timeline ruler) where
  possible.
- **Auto-record fidelity gap**: if scripted playback of a recorded live
  drive diverges noticeably from the original, users will lose trust in
  the recording. Set the tolerance bar in acceptance and measure it.
