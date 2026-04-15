# Vehicle Authoring — Epic Series Index

> Series goal: take MotionLab from no vehicle support to a first-class vehicle
> authoring workbench. Vehicles are typed compound entities that live in the same
> scene as mechanisms, share the same viewport and runtime, and route their
> outputs through the same channel-based results system.
>
> The differentiator versus existing tools (Adams Car, IPG CarMaker authoring,
> Chrono::Vehicle's JSON-and-C++ workflow) is the **authoring UX**: hardpoint
> editing in the viewport with live kinematic feedback, an F-curve editor for
> driver inputs modeled on Blender's Graph View, and parameterized maneuver
> presets that expand into editable timelines.

## Current state (snapshot 2026-04-14)

- No Vehicle entity in proto, store, or engine. No tire, driveline, powertrain,
  suspension, or steering concepts anywhere.
- Terrain epic T1 is the prerequisite substrate for any drivable scene.
- Collision epic C1 (physics materials) is the prerequisite for any tire-road
  contact that means something.
- The driver curve editor is greenfield — no curve / keyframe / F-curve UI
  exists in the frontend today.
- The closest existing constraint is `feedback_no_full_ecs.md`: vehicle
  subsystems must be modeled as **typed compound entities**, not as ECS
  components on a bag.

## Series principles

These constrain every epic in the series and override convenience:

1. **No JSON import as a user-facing workflow.** The value of MotionLab is the
   authoring UX. Reducing vehicle authoring to "import a Chrono JSON file"
   cedes that value to a text editor. JSON import exists only as throwaway
   engine scaffolding in V1 Phase 0 to validate the Chrono binding before the
   inspector ships, and is **deleted from the codebase before V1 lands**. The
   one intentional exception is `.tir` paste-in for measured Pacejka tire
   coefficients in V3 — see V3 for why that case is different.
2. **No Chrono class names in the user surface.** Inspector labels show
   *physical* parameters (track width, caster, kingpin angle), not Chrono
   template names. Already a non-negotiable in `CLAUDE.md`.
3. **Subsystems are typed compound entities, not primitives.** A
   DoubleWishbone is a chassis-mounted assembly of joints, links, and
   hardpoint datums, presented as one inspectable thing with a parameter
   surface. The user can drill into it as a raw mechanism for debugging
   (escape hatch). The escape hatch is read-mostly.
4. **Channels and sensors stay first-class.** Tire forces, slip angles,
   driver inputs, suspension travel are channel-typed runtime outputs,
   plumbed through the existing live/replay contract. Sensors mount to
   vehicle datums (chassis IMU, wheel-speed on spindle datum) the same as
   any other datum anchor.
5. **Wheeled vehicles only.** Tracked vehicles are a separate Chrono module
   and a different user; not in this series.

## Epics

| # | File | Title | Depends on |
|---|------|-------|------------|
| V1 | [01-vehicle-entity.md](01-vehicle-entity.md) | Vehicle entity, Chassis, first suspension template end-to-end | terrain/T1, collision/C1 |
| V2 | [02-subsystem-templates.md](02-subsystem-templates.md) | Suspensions, steering, driveline, powertrain templates | V1 |
| V3 | [03-tires.md](03-tires.md) | Tire fidelity ladder (Rigid → TMeasy → Pacejka) | V1, collision/C1 |
| V4 | [04-hardpoint-editor.md](04-hardpoint-editor.md) | Viewport hardpoint editor with live kinematic sweeps | V1 |
| V5 | [05-driver-graph-editor.md](05-driver-graph-editor.md) | F-curve editor for scripted driver inputs | — (greenfield UI) |
| V6 | [06-maneuvers-and-events.md](06-maneuvers-and-events.md) | NLA-style strip composition, parameterized presets, events, live gamepad drive | V5, V1, terrain/T1 |

V1 establishes the entity model end-to-end with the smallest viable payload:
one suspension template, hardcoded tire model, no steering, hardcoded driver,
flat rigid terrain. V2 fills in the parameter-heavy template library. V3 adds
the tire fidelity ladder. V4 and V5 are the two big UX investments that
distinguish this from a parameter-form-over-template authoring tool. V6 ties
the driver editor to actual runs.

V3, V4, and V5 can ship in parallel after V1 because they touch unrelated
surfaces (tire models, viewport hardpoint manipulation, timeline curve
editor). V5 has no V1 dependency at all and can start at any time.

## Out of scope for this series

- **Tracked vehicles** (Chrono::Vehicle's tracked-vehicle module — separate
  series).
- **Trailers, articulated vehicles, tractor-trailer combinations** (deferred).
- **Dynamic substitution of subsystems mid-run** (e.g., swap a tire model
  between steps). Authoring-time only.
- **Driver-in-the-loop with VR or steering wheel hardware**. Gamepad in V6
  is the limit.
- **Vehicle co-simulation** (Chrono::Vehicle's distributed-cosimulation
  framework).
- **Aero loads** beyond a constant downforce coefficient.
- **Brake fade, thermal models, electrical systems, ABS / ESC controllers.**
  Real ABS/ESC needs its own brief.
- **JSON import as a user workflow.** See series principle 1.
- **Vehicle workspace as a separate top-level mode.** Vehicles are entities in
  the same scene; if a layout preset is wanted later it's a window-state
  feature, not a series item.
- **Multi-vehicle scenarios** (car-following, traffic). One vehicle per
  Scenario in V6.

## Chrono reference (verified via deepwiki)

- **Module**: `chrono::vehicle` provides a hierarchical, template-driven
  framework. Already pulled in by terrain/T1 for `RigidTerrain`, so no new
  link-time dependency for V1.
- **Wheeled vehicle**: `ChWheeledVehicle` owns chassis, axles, steering,
  driveline, powertrain. Each subsystem is a `ChPart` derivative.
- **Suspension templates**: `DoubleWishbone`, `MultiLink`, `MacPhersonStrut`,
  `SolidAxle`, `LeafspringAxle`, plus `ChGenericWheeledSuspension` for
  arbitrary topologies authored by hardpoint graph. The generic template is
  what makes V4's hardpoint editor backable by a single unified path.
- **Steering templates**: `RackPinion`, `PitmanArm`, `PitmanArmShafts`.
- **Driveline templates**: `ShaftsDriveline2WD`, `ShaftsDriveline4WD`,
  `SimpleDriveline`, `SimpleDrivelineXWD`.
- **Powertrain**: split into `ChEngine` and `ChTransmission` as of recent
  Chrono. Templates include `EngineShafts`, `EngineSimple`, `EngineSimpleMap`,
  `AutomaticTransmissionShafts`, `AutomaticTransmissionSimpleMap`,
  `ManualTransmissionShafts`. Combined into `ChPowertrainAssembly`.
- **Tire models**: `ChRigidTire`, `ChTMsimpleTire`, `ChTMeasyTire`,
  `ChFialaTire`, `ChPac89Tire`, `ChPac02Tire`, plus FEA tires deferred to a
  later series.
- **Driver models**: `ChDriver` interface with throttle/brake/steer/gear
  outputs. Implementations include data-driven (file-backed),
  `ChPathFollowerDriver` (Bezier-curve speed/path tracking with internal
  PID), and interactive drivers.
- **Outputs**: chassis state, per-spindle state, per-tire forces, driver
  inputs, per-axle suspension state. All readable each step from the
  assembled vehicle.

## Cross-series links

- **terrain/T1** (Rigid Terrain) — hard prerequisite. There is nothing to
  drive on without it.
- **terrain/T2** (SCM Soft Terrain) — unlocks rover and off-road scenarios.
  Not a hard prereq for V1–V6, but the natural next destination once V3's
  tire fidelity is in place.
- **collision/C1** (Physics Materials) — tires reference an authored material
  for friction; chassis collision proxy references one for impact contacts.
- **collision/C2** (Convex / Mesh Collision) — chassis collision proxy
  benefits from convex hull; falls back to a box for V1.
- **collision/C3** (Contact Reporting) — useful for tire-patch / contact
  debug overlays. Not a prereq.
- **collision/C4** (Capability Sections) — strongly leveraged by V1+V2.
  Vehicle subsystems are exactly the kind of swappable shared inspector
  section the registry was designed for. Suspension, Steering, Driveline,
  Engine, Transmission, and Tire sections all register through C4.

## Series-wide risks

- **Hardpoint editor scope**: V4 is the riskiest UX investment in this
  series. Viewport hardpoint manipulation with live camber/toe sweeps is
  genuinely novel; there is no off-the-shelf reference implementation. Budget
  generously and prototype Phase 0 before committing to scope.
- **F-curve editor scope**: V5 is greenfield UI for MotionLab. Blender's
  Graph View is the reference; budget for keyframe selection, bezier
  handles, channel filtering, snap-to-frame, and undo. Half-implementing it
  produces something worse than no curve editor — users will keep editing
  keyframes in the inspector and ignore the editor entirely.
- **Pacejka tire credibility**: most users measuring vehicle dynamics expect
  Pacejka 2002 and a `.tir` parameter file. The fidelity ladder must reach
  Pac02 in V3 or V3 doesn't ship the credibility it needs to.
- **Chrono::Vehicle module weight**: pulling in the vehicle module brings
  transitive deps. terrain/T1 already incurs this cost. Verify before V1
  Phase 1 that `ChronoEngine_vehicle` is enabled in the pinned build (this
  check is shared with terrain/T1's Phase 1 check).
- **Save/load explosion**: a fully-authored vehicle is a large object with
  many references (materials, hardpoints, datums, tire model, driver, …).
  Round-trip testing must cover every subsystem swap.
- **Curve primitive shared by V4 and V5**: both epics need curve rendering.
  Designing two divergent primitives is the failure mode. V5 Phase 1
  explicitly delivers the shared primitive, with V4 as the first read-only
  consumer.
