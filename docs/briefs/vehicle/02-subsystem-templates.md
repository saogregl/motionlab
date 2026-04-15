# Epic V2 — Subsystem Templates: Suspensions, Steering, Driveline, Powertrain

**Mission:** fill in the template library so a user can author a real-world
vehicle from real templates instead of being constrained to V1's
single-of-each. Add additional suspension templates (MultiLink, MacPherson,
SolidAxle, LeafspringAxle, Generic), steering templates (RackPinion,
PitmanArm), driveline templates (FWD/RWD/AWD/SimpleXWD), and the powertrain
split into engine + transmission templates.

**Depends on:** V1.

---

## Why

V1 deliberately ships one of each subsystem to get the entity model
end-to-end. V2 fills in the parameter library so the vehicle workbench is
*useful*, not just demonstrable. Without this, no real-world vehicle (sedan,
pickup, formula car, solid-axle truck) can be modeled.

Most of V2 is parameter-form work and template registration. The new UX
surface is **template swapping** — when a user changes a suspension's template
kind, the inspector has to negotiate the discontinuity in hardpoint sets and
parameter fields cleanly without making the user feel punished for
experimenting.

## Current state (after V1)

- Vehicle entity exists. One suspension template (DoubleWishbone), no
  steering, hardcoded simple driveline, hardcoded constant-throttle driver.
- C4 capability sections handle inspector composition.
- `ChGenericWheeledSuspension` is the engine path for V1's DoubleWishbone (or
  a per-template fallback if Phase 0 demanded it), so adding new templates is
  mostly hardpoint-set expansion plus per-template parameter messages.

## Proposed model

### Suspension templates added

| Kind | Hardpoint set | Parameter group |
|---|---|---|
| `MULTI_LINK` | five-link with upper, lower, trailing, lateral, and toe links | spring, damper, link bushings |
| `MACPHERSON` | strut top, lower control arm inboard/outboard, tie rod | spring, damper, strut friction |
| `SOLID_AXLE` | axle ends, panhard rod, control arms (3- or 4-link variants) | spring, damper, axle inertia |
| `LEAFSPRING_AXLE` | leaf eye front/rear, shackle, axle bracket | leaf stiffness, anti-windup, damper |
| `GENERIC` | user-authored hardpoint graph + link list | per-link bushings + springs |

Each template adds one proto message under the `Suspension.params` oneof.
Each adds one default-hardpoint preset that seeds reasonable values when a
user picks that template.

### Template swap UX

When the user changes a suspension template kind in the inspector dropdown:

1. **Diff the hardpoint sets**. Hardpoints with the same key (e.g.,
   `lca_outer_left`) are preserved with their current values. Hardpoints
   present only in the source template are dropped. Hardpoints present only
   in the target template are seeded from the target's default preset.
2. **Confirm with the user** if any hardpoints are about to be dropped:
   *"This will discard 4 hardpoints from the previous suspension. Continue?"*
   Hidden if no hardpoints are dropped.
3. **Single command**: emit one `UpdateSuspensionCommand` that carries the
   new kind, new params, and new hardpoint list. Atomic so undo restores
   the previous template cleanly.

This is the same destructive-edit pattern used elsewhere in MotionLab (e.g.,
changing a Geometry's shape kind). Document the pattern in the inspector
section convention if it isn't already.

### Steering templates

| Kind | Parameters |
|---|---|
| `RACK_PINION` | steering ratio, rack travel, rack inertia, pinion radius |
| `PITMAN_ARM` | pitman arm length, idler arm, drag link, steering box ratio |

Steering attaches to a steered axle (a flag on `Axle`) and exposes a
`steering` capability section through C4. **A steering ratio is shown as a
read-only derived field**, computed from rack travel + pinion radius —
editing the geometric inputs is the only authoring path so the two values
can never disagree.

### Brakes (small addition)

Chrono treats brakes as a per-axle subsystem. V2 adds a `brakes` capability
section per axle with one parameter: max brake torque. Brake-by-wire bias
splits front/rear via a single 0..1 slider on the Vehicle. ABS and brake
fade are out of scope for the entire series.

### Driveline templates

| Kind | Description |
|---|---|
| `FWD_2WD` | front-axle drive, simple |
| `RWD_2WD` | rear-axle drive, simple |
| `AWD_4WD` | center differential, configurable bias |
| `SHAFTS_2WD` | shafts-based, exposes drive shaft inertia |
| `SHAFTS_4WD` | shafts-based 4WD with explicit center diff |

Driveline is a single per-vehicle subsystem (one driveline drives all
axles). Simple variants take a torque-split parameter; shafts variants take
inertias and gear ratios.

### Powertrain (engine + transmission split)

Chrono recently split engine and transmission into separate templates. V2
honors that split:

**Engine templates:**

| Kind | Description |
|---|---|
| `ENGINE_SIMPLE` | constant-power model |
| `ENGINE_SIMPLE_MAP` | torque map vs RPM |
| `ENGINE_SHAFTS` | full shafts-based with inertia |

**Transmission templates:**

| Kind | Description |
|---|---|
| `AUTO_SIMPLE_MAP` | gear ratio array + simple shift logic |
| `AUTO_SHAFTS` | full shafts-based |
| `MANUAL_SHAFTS` | manual gearbox |

Engine and transmission swap independently. The inspector renders them as
two distinct capability sections under the Vehicle inspector. Pairing rules
(e.g., `ENGINE_SIMPLE` cannot pair with `AUTO_SHAFTS`) are validated at
authoring time with a soft warning, not a hard block — Chrono permits the
combination, the user is advised against it.

For `ENGINE_SIMPLE_MAP`, the torque-vs-RPM map is shown as a small inline
**read-only graph** rendered through V5's curve canvas primitive. This is a
read-only consumer of V5 Phase 1 — no editing, just visualization. Editing
the map happens through a parameter table because there is no direct-
manipulation use case strong enough to justify a dedicated map editor.

### Capability sections registered in V2

Through collision/C4's registry:

| Capability | Renders on |
|---|---|
| `suspension` | Axle (already exists from V1, expanded) |
| `steering` | Axle (when steered) |
| `brakes` | Axle |
| `driveline` | Vehicle |
| `engine` | Vehicle |
| `transmission` | Vehicle |

### Engine

- `vehicle.cpp` extended with template factories per subsystem kind. Each
  factory takes a proto subsystem message and returns a `std::unique_ptr` to
  the corresponding `ChPart` derivative.
- Generic suspension builder used where it can express the topology;
  per-class Chrono templates used otherwise (LeafspringAxle in particular
  has no clean generic representation).

---

## Phases

### Phase 1 — Suspension template expansion

MultiLink, MacPherson, SolidAxle, Generic. Template-swap UX. LeafspringAxle
deferred to Phase 5 if the model takes longer than a week.

### Phase 2 — Steering templates

RackPinion + PitmanArm. Steered-axle flag. Steering ratio displayed as
derived read-only field.

### Phase 3 — Driveline templates

All five kinds. Center-diff bias UX for AWD variants.

### Phase 4 — Powertrain (engine + transmission)

Both subsystems independently swappable. Read-only torque-map graph for
`ENGINE_SIMPLE_MAP` consuming V5 Phase 1's curve canvas.

### Phase 5 — LeafspringAxle (deferred from Phase 1) and Brakes

LeafspringAxle parameter form. Per-axle brakes section. Front/rear bias
slider on Vehicle.

---

## Acceptance criteria

- [ ] User can pick any of five suspension templates and the vehicle
      simulates correctly with each.
- [ ] Template swap preserves matching hardpoints and confirms before
      destructive drops.
- [ ] User can pick either steering template on a steered axle and the
      vehicle responds to a steering input.
- [ ] User can pick any driveline template and torque reaches the correct
      wheels.
- [ ] User can pair any engine with any transmission template; gear changes
      happen at the configured shift points; incompatible pairs warn but do
      not block.
- [ ] Brake torque is honored per axle and front/rear bias affects
      deceleration distribution.
- [ ] All swaps are atomic and undoable.
- [ ] Save/load round-trips every template kind with full parameter
      fidelity.
- [ ] Steering ratio is shown as derived (non-editable) and stays
      consistent with rack travel + pinion radius.

## Out of scope

- Active suspensions (electronically variable damping).
- Independent suspensions with toe-by-wire / steer-by-wire.
- Hybrid / electric powertrains. The proto leaves room (`oneof
  powertrain_kind`) but no implementations land in V2.
- Dual-clutch transmission template.
- Limited-slip differentials beyond the bias parameter on AWD.
- ABS, ESC, traction control.
- Brake fade, thermal models.

## Open questions

- **Brake bias interaction with ABS**: V2 does not ship ABS; brake bias is
  a static authoring parameter. When ABS is added (separate brief), revisit
  whether bias becomes ABS-managed.
- **Engine map editor**: V2 ships read-only map visualization. If users
  start asking for in-app map editing, the right surface is V5's curve
  editor extended with a 1D-plus-table mode — defer that decision.
- **Engine/transmission validity matrix**: warning vs hard block when a
  user pairs `ENGINE_SIMPLE` with `AUTO_SHAFTS`. Recommendation: warn only,
  match Chrono's permissiveness.

## File checklist

| Action | File |
|---|---|
| Modify | `schemas/mechanism/mechanism.proto` (template messages, oneofs, brakes/steering/driveline/powertrain fields) |
| Modify | `native/engine/src/vehicle.{h,cpp}` (factories per template) |
| Create | `packages/frontend/src/components/inspector/sections/SteeringSection.tsx` |
| Create | `packages/frontend/src/components/inspector/sections/BrakesSection.tsx` |
| Create | `packages/frontend/src/components/inspector/sections/DrivelineSection.tsx` |
| Create | `packages/frontend/src/components/inspector/sections/EngineSection.tsx` |
| Create | `packages/frontend/src/components/inspector/sections/TransmissionSection.tsx` |
| Modify | `packages/frontend/src/components/VehicleInspector.tsx` (register new capabilities) |
| Modify | `assets/presets/vehicles/generic-sedan.json` (use real templates) |
| Create | `assets/presets/vehicles/{pickup,formula,solid-axle-truck}.json` |

## Chrono-side risks

- **Generic builder topology coverage**: confirmed for symmetric independent
  suspensions; uncertain for solid-axle and leafspring topologies. Per-template
  subclass fallback exists for both.
- **Template parameter completeness**: Chrono templates expose many
  parameters not all of which are physically meaningful to an end user. Ship
  the inspector with a curated subset and an "Advanced" disclosure for the
  rest.
- **Engine/transmission split version**: confirm the pinned Chrono version
  has the new split. If not, V2 Phase 4 is blocked on a Chrono upgrade.
