# Epic V3 — Tire Fidelity Ladder

**Mission:** introduce Tire as a typed subsystem with a fidelity-graded model
selection: Rigid → TMsimple → TMeasy → Fiala → Pacejka 1989 → Pacejka 2002.
FEA tires deferred. Each rung has its own parameter form, its own preset
library, and its own per-step output channel set. The frontend exposes the
choice as a fidelity slider with explicit cost/output trade-offs visible.

**Depends on:** V1 (Vehicle entity), collision/C1 (physics materials).

---

## Why

Tire fidelity is the credibility axis for vehicle dynamics. A workbench that
ships only a rigid tire is a tech demo; one that ships Pacejka 2002 with
real measured coefficients is a tool. Pac02 is what every serious user
expects.

The fidelity ladder also forces an honest conversation between the user and
their compute budget — the inspector tells the user upfront what each model
costs and what outputs it produces, so the user picks deliberately.

## Current state (after V1)

- Vehicle has wheels with mass/inertia/radius, but tire is hardcoded inside
  the engine binding to `ChRigidTire` with a fixed friction coefficient.
- Collision/C1 has authored materials but they're not yet referenced from
  tires.

## Proposed model

### Tire as a typed subsystem

A `Tire` is a subsystem entity attached to each `Wheel`. One tire per
wheel, no exceptions. Tires reference (a) a fidelity model selector and
(b) a collision material from collision/C1 for the contact patch.

### Proto

```proto
enum TireModelKind {
  TIRE_MODEL_KIND_UNSPECIFIED = 0;
  TIRE_MODEL_KIND_RIGID = 1;
  TIRE_MODEL_KIND_TMSIMPLE = 2;
  TIRE_MODEL_KIND_TMEASY = 3;
  TIRE_MODEL_KIND_FIALA = 4;
  TIRE_MODEL_KIND_PAC89 = 5;
  TIRE_MODEL_KIND_PAC02 = 6;
  // FEA tires deferred.
}

message TireBaseParams {
  double radius = 1;          // m, redundant with Wheel.radius — sanity check
  double width = 2;
  double mass = 3;            // kg (tire belt mass, distinct from wheel hub)
}

message RigidTireParams {
  TireBaseParams base = 1;
  ElementId material_id = 2;
}

message TMeasyTireParams {
  TireBaseParams base = 1;
  // Vertical
  double vertical_stiffness = 10;
  double vertical_damping = 11;
  // Longitudinal
  double dfx0 = 20;            // initial slope of Fx-slip curve at nominal load
  double fxm = 21;             // Fx peak
  double fxs = 22;             // Fx slide
  // Lateral
  double dfy0 = 30;
  double fym = 31;
  double fys = 32;
  // Self-aligning torque
  double mz_peak = 40;
  ElementId material_id = 100;
}

message PacejkaParams {
  TireBaseParams base = 1;
  // Coefficients are stored as a flat map<string, double> because real .tir
  // files have ~80 coefficients and a structured proto would be unmaintainable.
  // The inspector renders them grouped semantically; the storage is flat.
  map<string, double> coefficients = 10;
  ElementId material_id = 100;
}

message Tire {
  ElementId id = 1;
  TireModelKind kind = 2;
  oneof params {
    RigidTireParams rigid = 10;
    TMeasyTireParams tmeasy = 11;
    PacejkaParams pac89 = 12;
    PacejkaParams pac02 = 13;
    // ... TMsimple, Fiala
  }
}

message Wheel {
  // ... V1 fields ...
  Tire tire = 10;
}
```

### Fidelity slider UX

The Tire inspector section (registered through C4's capability registry as
`tire`) opens with a **fidelity selector** rendered as a stepped slider, not
a dropdown:

```
Fidelity:  [Rigid]──[TMsimple]──[TMeasy]──[Fiala]──[Pac89]──[Pac02]
                                    ●
Compute cost: ●●○○○                       Realism: handling-quality
Outputs: contact force, vertical load, slip ratio, slip angle
```

Below the slider:

- A **cost/realism row** showing relative compute cost (filled dots) and a
  one-line description of the realism ("rigid contact, no slip" → "transient
  Pacejka with combined slip").
- An **outputs row** listing the channels this tire model exposes per step,
  so the user knows what they're buying. The list is generated from the
  engine's channel registration so the UI can never be wrong about it.
- The parameter form for the selected model.

Switching fidelity reseeds parameters from a preset for the new model. Same
destructive-edit confirm pattern as V2's template swap.

### Tire presets

Ship a preset library covering common tire archetypes:

| Preset key | Models | Description |
|---|---|---|
| `street_hard` | TMeasy, Pac02 | hard street tire, 215/55R17 |
| `street_soft` | TMeasy, Pac02 | summer performance tire |
| `offroad` | TMeasy | knobby AT tire on dirt |
| `slick` | Pac02 | racing slick |
| `winter` | TMeasy | studded snow tire |

Selecting a preset fills the parameter form. User can tweak. Tweaking
clears the preset key (same pattern as terrain/T2 SCM presets).

### Pacejka coefficient loading from `.tir` (paste-in only)

`.tir` is the industry-standard format published by tire test rigs. There
is no realistic way to author 80 Pacejka coefficients from scratch in a UI.

The Tire inspector exposes a **paste-in** affordance for Pacejka models:
expand "Load coefficients from .tir text", paste the file contents into a
textarea, click Apply. A parser extracts the coefficient map and writes it
to the proto.

This is **not** the JSON import path the series principles forbid. The
distinction:

- A vehicle JSON is a *model definition*. Importing one cedes the authoring
  story to a text editor.
- A `.tir` file is a *measurement record*. The user is loading data they
  obtained from a tire test, not authoring the tire from scratch in a text
  editor. The authoring story (which tire model to use, which preset to
  start from, how it integrates with the vehicle) still happens in the
  inspector.

The paste-in flow is **not** a file-system import — it is a textarea, not a
file picker. Pasting text keeps the user inside the app and avoids the
"folder of `.tir` files synced with a coworker" workflow that the JSON
import principle is rejecting. If users start asking for a file picker as
ergonomics, revisit the principle explicitly rather than sliding into it.

### Engine

- `vehicle.cpp` extended with tire factory dispatching on `TireModelKind`.
- Each kind constructs the corresponding Chrono tire class with parameters
  pulled from the proto.
- Tire-side material lookup goes through the same path as body collision
  (collision/C1).

### Channels exposed per tire model

Each tire model registers its output channels with the runtime channel
system at construction time:

- **All models**: contact force (3-vector), spindle force, spindle torque.
- **TMsimple+**: longitudinal slip ratio, lateral slip angle.
- **TMeasy+**: vertical load, contact patch displacement.
- **Pacejka**: combined slip metric, self-aligning torque, camber thrust.

The fidelity selector's "Outputs" row reads from this registration so the
UI stays in sync with the engine.

---

## Phases

### Phase 1 — Tire entity + Rigid model with material reference

Tire becomes a real proto/store object instead of being hardcoded. Rigid
model only. Material reference wired through collision/C1.

### Phase 2 — TMeasy

The first handling-quality model. Preset library. Parameter form.

### Phase 3 — Fiala and TMsimple

Quick fill-in. Both have small parameter forms.

### Phase 4 — Pacejka 1989 + Pacejka 2002 + .tir paste-in

The credibility phase. Pac02 needs the most parameters. Paste-in flow
lands here.

### Phase 5 — Channel registration and viewport overlay

Per-tire channels routed through the runtime. Optional viewport overlay
showing per-tire force vectors as arrows on the wheel.

---

## Acceptance criteria

- [ ] Tire is a typed subsystem entity attached to each wheel.
- [ ] Fidelity slider visibly shows cost and outputs for each model.
- [ ] Switching fidelity reseeds parameters and confirms before destructive
      drops.
- [ ] All six models simulate without crashing on a sedan in a
      constant-radius turn.
- [ ] `.tir` paste-in successfully loads a real published tire file's
      coefficients into the Pac02 form.
- [ ] Per-tire material reference affects friction (visible in skidpad
      lateral acceleration limit).
- [ ] Tire force channels stream live during simulation through the
      existing channel transport.
- [ ] Save/load round-trips every tire kind including Pacejka coefficient
      maps.

## Out of scope

- FEA tires (`ChANCFTire`, `ChReissnerTire`, `ChFEATire`). Separate epic.
- Thermal tire models (compound temperature, grip vs temperature curves).
- Tire wear and degradation over time.
- Combined-slip Pacejka coefficient identification from raw test data.
- Per-wheel different tires on the same axle (allowed by the data model
  but unsupported by the preset flow in V3).
- File-picker import of `.tir` files. Paste-in only.

## Open questions

- **Pacejka coefficient grouping**: the inspector groups coefficients
  semantically (longitudinal, lateral, aligning torque, camber, scaling).
  Choose the grouping convention before Phase 4 — incompatible groupings
  between Pac89 and Pac02 are confusing.
- **Default tire fidelity for new vehicles**: TMeasy is the right default
  (handling-quality, cheap, intuitive parameters). The Generic Sedan
  preset uses TMeasy.
- **`.tir` parser scope**: real `.tir` files have multiple sections
  (general, vertical, longitudinal, lateral, aligning, scaling). Confirm
  the parser handles every section before Phase 4 closes.

## File checklist

| Action | File |
|---|---|
| Modify | `schemas/mechanism/mechanism.proto` (Tire message + tire field on Wheel) |
| Modify | `native/engine/src/vehicle.{h,cpp}` (tire factory) |
| Create | `packages/frontend/src/components/inspector/sections/TireSection.tsx` |
| Create | `packages/frontend/src/components/inspector/sections/tire-fidelity-slider.tsx` |
| Create | `packages/frontend/src/lib/tir-parser.ts` |
| Create | `assets/presets/tires/*.json` |
| Modify | `packages/viewport/src/...` (per-tire force overlay view mode) |

## Chrono-side risks

- **Pacejka coefficient naming**: Chrono's Pacejka classes use
  Chrono-specific parameter names that don't always match `.tir` field
  names verbatim. The parser needs an explicit mapping table. Document it.
- **Combined-slip parameters**: some `.tir` variants don't include
  combined slip data. Detect and warn in the parser.
- **Pac02 transient state**: Pacejka 2002 has slip state equations for
  transient conditions. Confirm Chrono's `ChPac02Tire` exposes the
  transient state in the per-step output set.
