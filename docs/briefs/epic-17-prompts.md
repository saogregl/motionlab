# Epic 17 — Solver Configuration & Pre-Simulation Validation

> **Status:** Not started
> **Dependencies:** Epic 7 (Simulation lifecycle) — complete. Epic 8 (Output channels) — complete.
>
> **Governance note:** Epics 5+ are under full governance — every boundary or contract change requires an ADR, every protocol/schema change requires seam tests, every architecture change requires doc updates.

Three prompts. Prompt 1 is a BLOCKER — schema and engine changes must land before UI or diagnostics work. Prompts 2 and 3 can run in parallel after Prompt 1 succeeds.

## Motivation

The engine currently compiles mechanisms with hardcoded solver settings: Chrono's default `ChSystemNSC` system, an implicit `ChSolverPSOR` solver, and no configurable contact parameters. The only user-facing controls are timestep and gravity vector. This is insufficient for real engineering work:

- **Solver tuning matters.** A linkage with tight clearances needs more solver iterations than a simple pendulum. A mechanism with many contacts needs different contact compliance than a gear train. The Chrono default of ~50 PSOR iterations with loose tolerance works for demos but diverges on stiff systems.
- **Users waste time on failed simulations.** With no pre-compilation validation, common mistakes — floating bodies, missing ground, over-constrained joints, zero-mass bodies — produce cryptic Chrono runtime errors or silently divergent results. The user discovers the problem minutes into a simulation run.
- **Sensible defaults with expert escape hatches.** Most users should never touch solver settings. But when a simulation behaves unexpectedly, power users need to increase iterations, switch solvers, tighten tolerance, or tune contact parameters — the same workflow available in Adams, ANSYS Mechanical, and Simscape.

## Prior Art

### Adams (MSC Software)
Adams exposes solver settings through a dedicated dialog: integrator type (GSTIFF, SI2, HHT), max iterations, error tolerance, max step size, contact stiffness/damping/exponent. Defaults work for 90% of models. Pre-simulation checks warn about redundant constraints, singular mass matrices, and disconnected bodies.

### ANSYS Mechanical
Solver configuration includes: solver type (direct, iterative), convergence criteria, substep controls, contact formulation (augmented Lagrangian, penalty), friction model, and stabilization. Pre-solve validation checks for unconstrained DOFs, missing boundary conditions, and element quality.

### Chrono Documentation
Chrono 9.0.1 provides several solver classes for NSC systems:
- `ChSolverPSOR` — Projected Successive Over-Relaxation (fast, default)
- `ChSolverBB` — Barzilai-Borwein (good convergence for ill-conditioned problems)
- `ChSolverAPGD` — Accelerated Projected Gradient Descent (robust for large systems)
- `ChSolverMINRES` — Minimum Residual (most accurate, slowest)

Timestepper classes:
- `ChTimestepperEulerImplicitLinearized` — fast, stable, first-order accurate (default)
- `ChTimestepperHHT` — Hilber-Hughes-Taylor, second-order accurate, numerical dissipation control
- `ChTimestepperNewmark` — Newmark-beta, classical structural dynamics integrator

Contact material properties on `ChContactMaterialNSC`: `SetFriction()`, `SetRestitution()`, `SetCompliance()`, `SetDampingF()`.

## Shared Contract

| Interface | Owner | Consumer |
|-----------|-------|----------|
| `SimulationSettings` in transport.proto (extended) | Prompt 1 (schema + engine) | Prompt 2 (UI sends with compile) |
| `SolverSettings` message | Prompt 1 (schema + engine mapping) | Prompt 2 (advanced tab populates) |
| `ContactSettings` message | Prompt 1 (schema + engine mapping) | Prompt 2 (contact section populates) |
| `SimulationConfig` struct in simulation.h (extended) | Prompt 1 (engine applies) | Prompt 1 (transport maps proto to config) |
| `CompileMechanismCommand.settings` (enriched) | Prompt 1 (wire format) | Prompt 2 (frontend sends), Prompt 3 (defaults if absent) |
| `CompilationDiagnostic` message (structured) | Prompt 1 (schema), Prompt 3 (engine populates) | Prompt 2 (renders in status), Prompt 3 (diagnostics panel) |
| `useSimulationSettingsStore` (extended) | Prompt 2 (adds solver/contact/duration state) | Prompt 2 (dialog reads/writes) |
| `CompilationResultEvent.diagnostics` (structured) | Prompt 3 (engine emits) | Prompt 3 (frontend renders) |

Integration test: Open settings dialog -> select "High Accuracy" preset -> compile mechanism -> engine uses HHT integrator with 500 iterations -> compilation reports 1 warning (floating body) -> diagnostics panel shows warning with entity link -> click entity link -> body selected in tree and viewport.

---

## Prompt 1: Solver Settings Schema & Engine Integration

**BLOCKER for Prompts 2 and 3. Must complete first.**

```
# Epic 17 — Solver Settings Schema & Engine Integration

You are extending the simulation settings schema and wiring new solver/contact/integrator configuration through the protocol into the Chrono engine. The existing SimulationSettings message in transport.proto only has timestep and gravity. You will add solver type, max iterations, tolerance, integrator type, contact parameters, and simulation duration — then map each to the corresponding Chrono API calls.

## Read These First (in order)
- `docs/architecture/principles.md` — engine is computational authority
- `native/engine/AGENTS.md` — native boundary rules, no Chrono leakage through protocol
- `packages/protocol/AGENTS.md` — protocol must be backend-agnostic
- `docs/architecture/protocol-overview.md` — transport contract overview
- `docs/decisions/` — all existing ADRs

## Governance Reminder
Epic 17 is under full governance:
- Any boundary or contract change requires an ADR
- Any protocol/schema change requires seam tests at the affected seam
- Any architecture change requires doc updates

## What Exists Now

### `schemas/protocol/transport.proto`
SimulationSettings message with only two fields:
```protobuf
message SimulationSettings {
  double timestep = 1;
  motionlab.mechanism.Vec3 gravity = 2;
}
```
CompileMechanismCommand has `SimulationSettings settings = 1` (optional, defaults apply if absent).

### `native/engine/src/simulation.h`
SimulationConfig struct with only timestep and gravity:
```cpp
struct SimulationConfig {
    double timestep = 0.001;
    double gravity[3] = {0, -9.81, 0};
};
```

### `native/engine/src/simulation.cpp`
`SimulationRuntime::compile()` creates a `ChSystemNSC` and calls:
- `system->SetGravitationalAcceleration()` from config
- Stores `config.timestep` as `impl_->timestep`
- No solver configuration — uses Chrono defaults
- No contact parameter configuration
- No integrator configuration

The system is created at line 221:
```cpp
impl_->system = std::make_unique<ChSystemNSC>();
```
No calls to `SetSolver()`, `SetTimestepperType()`, or contact material configuration.

### `native/engine/src/transport_runtime_session.cpp`
`handle_compile_mechanism()` maps proto SimulationSettings to SimulationConfig:
```cpp
engine::SimulationConfig config;
if (compile_cmd.has_settings()) {
    const auto& settings = compile_cmd.settings();
    if (settings.timestep() > 0) config.timestep = settings.timestep();
    if (settings.has_gravity()) {
        config.gravity[0] = settings.gravity().x();
        // ...
    }
}
```

### `packages/protocol/src/transport.ts`
`createCompileMechanismCommand()` accepts `{ timestep?, gravity? }` and serializes to proto.

### `packages/frontend/src/stores/simulation-settings.ts`
Zustand store with only timestep and gravity state.

### `packages/frontend/src/engine/connection.ts`
`sendCompileMechanism()` passes settings to `createCompileMechanismCommand()`.

## What to Build

### 1. Extend SimulationSettings in transport.proto

Replace the existing SimulationSettings with a richer message. Preserve backward compatibility — all new fields have sensible defaults when absent (proto3 zero values or explicit defaults via convention).

```protobuf
// Simulation configuration passed at compile time
message SimulationSettings {
  double timestep = 1;                    // seconds, default 0.001
  motionlab.mechanism.Vec3 gravity = 2;   // m/s^2, default (0, -9.81, 0)
  SolverSettings solver = 3;             // optional, defaults apply
  ContactSettings contact = 4;           // optional, defaults apply
  double duration = 5;                    // seconds, default 10.0 (informational — frontend uses for playback)
}

message SolverSettings {
  SolverType type = 1;                   // default: SOLVER_PSOR
  int32 max_iterations = 2;              // default: 100
  double tolerance = 3;                  // default: 1e-8
  IntegratorType integrator = 4;         // default: INTEGRATOR_EULER_IMPLICIT_LINEARIZED
}

enum SolverType {
  SOLVER_PSOR = 0;                       // Projected SOR (fast, good for most cases)
  SOLVER_BARZILAI_BORWEIN = 1;           // BB (good convergence for ill-conditioned)
  SOLVER_APGD = 2;                       // Accelerated PGD (robust for large systems)
  SOLVER_MINRES = 3;                     // Minimal residual (most precise, slowest)
}

enum IntegratorType {
  INTEGRATOR_EULER_IMPLICIT_LINEARIZED = 0;  // Fast, stable, first-order (default)
  INTEGRATOR_HHT = 1;                         // Hilber-Hughes-Taylor (second-order accurate)
  INTEGRATOR_NEWMARK = 2;                      // Newmark-beta (classical structural dynamics)
}

message ContactSettings {
  double friction = 1;                   // Coulomb friction coefficient, default 0.3
  double restitution = 2;               // Coefficient of restitution, default 0.0 (perfectly inelastic)
  double compliance = 3;                // Contact compliance, default 0.0 (rigid contact)
  double damping = 4;                   // Contact damping, default 0.0
  bool enable_contact = 5;              // Whether to enable contact detection, default true
}
```

Also extend CompilationResultEvent.diagnostics from `repeated string` to `repeated CompilationDiagnostic` for structured diagnostics (Prompt 3 will populate these, but the schema must land now):

```protobuf
enum DiagnosticSeverity {
  DIAGNOSTIC_INFO = 0;
  DIAGNOSTIC_WARNING = 1;
  DIAGNOSTIC_ERROR = 2;
}

message CompilationDiagnostic {
  DiagnosticSeverity severity = 1;
  string message = 2;
  repeated string affected_entity_ids = 3;  // body/joint/datum IDs involved
  string suggestion = 4;                     // e.g. "Add a Fixed joint to anchor this body"
  string code = 5;                           // machine-readable diagnostic code, e.g. "FLOATING_BODY"
}
```

Update CompilationResultEvent:
```protobuf
message CompilationResultEvent {
  bool success = 1;
  string error_message = 2;
  repeated string diagnostics = 3 [deprecated = true];  // keep for backward compat
  repeated OutputChannelDescriptor channels = 4;
  repeated CompilationDiagnostic structured_diagnostics = 5;
}
```

### 2. Extend SimulationConfig in simulation.h

```cpp
enum class SolverType { PSOR, BARZILAI_BORWEIN, APGD, MINRES };
enum class IntegratorType { EULER_IMPLICIT_LINEARIZED, HHT, NEWMARK };

struct ContactConfig {
    double friction = 0.3;
    double restitution = 0.0;
    double compliance = 0.0;
    double damping = 0.0;
    bool enable_contact = true;
};

struct SolverConfig {
    SolverType type = SolverType::PSOR;
    int max_iterations = 100;
    double tolerance = 1e-8;
    IntegratorType integrator = IntegratorType::EULER_IMPLICIT_LINEARIZED;
};

struct SimulationConfig {
    double timestep = 0.001;
    double gravity[3] = {0, -9.81, 0};
    double duration = 10.0;
    SolverConfig solver;
    ContactConfig contact;
};
```

These are product-level IR types — NOT Chrono types. The mapping to Chrono happens inside simulation.cpp only.

### 3. Map settings to Chrono API calls in simulation.cpp

After creating `ChSystemNSC` in `compile()`, apply solver and integrator settings:

```cpp
// --- Solver ---
switch (config.solver.type) {
    case SolverType::PSOR: {
        auto solver = chrono_types::make_shared<ChSolverPSOR>();
        solver->SetMaxIterations(config.solver.max_iterations);
        solver->SetTolerance(config.solver.tolerance);
        impl_->system->SetSolver(solver);
        break;
    }
    case SolverType::BARZILAI_BORWEIN: {
        auto solver = chrono_types::make_shared<ChSolverBB>();
        solver->SetMaxIterations(config.solver.max_iterations);
        solver->SetTolerance(config.solver.tolerance);
        impl_->system->SetSolver(solver);
        break;
    }
    case SolverType::APGD: {
        auto solver = chrono_types::make_shared<ChSolverAPGD>();
        solver->SetMaxIterations(config.solver.max_iterations);
        solver->SetTolerance(config.solver.tolerance);
        impl_->system->SetSolver(solver);
        break;
    }
    case SolverType::MINRES: {
        auto solver = chrono_types::make_shared<ChSolverMINRES>();
        solver->SetMaxIterations(config.solver.max_iterations);
        solver->SetTolerance(config.solver.tolerance);
        impl_->system->SetSolver(solver);
        break;
    }
}

// --- Integrator ---
switch (config.solver.integrator) {
    case IntegratorType::EULER_IMPLICIT_LINEARIZED:
        impl_->system->SetTimestepperType(ChTimestepper::Type::EULER_IMPLICIT_LINEARIZED);
        break;
    case IntegratorType::HHT:
        impl_->system->SetTimestepperType(ChTimestepper::Type::HHT);
        break;
    case IntegratorType::NEWMARK:
        impl_->system->SetTimestepperType(ChTimestepper::Type::NEWMARK);
        break;
}
```

Add the required Chrono headers:
```cpp
#include "chrono/solver/ChSolverPSOR.h"
#include "chrono/solver/ChSolverBB.h"
#include "chrono/solver/ChSolverAPGD.h"
#include "chrono/solver/ChSolverMINRES.h"
```

For contact settings, apply to the default contact material:
```cpp
if (!config.contact.enable_contact) {
    impl_->system->SetContactForceModel(ChSystemSMC::ContactForceModel::Hooke);
    // Disable collision detection
    impl_->system->GetCollisionSystem()->SetActive(false);
}

// Apply default contact material properties to all bodies
// (bodies can override per-body later if needed)
```

Note: In Chrono NSC, contact material properties (friction, restitution, compliance, damping) are set per-body via `ChContactMaterialNSC`. Apply the global defaults to each body during the body creation loop:
```cpp
auto mat = chrono_types::make_shared<ChContactMaterialNSC>();
mat->SetFriction(static_cast<float>(config.contact.friction));
mat->SetRestitution(static_cast<float>(config.contact.restitution));
mat->SetCompliance(config.contact.compliance);
mat->SetDampingF(config.contact.damping);
// No collision shapes yet (future epic), but material is ready
```

Log the applied settings:
```cpp
spdlog::info("Solver: type={}, max_iter={}, tol={:.2e}, integrator={}",
             solver_type_name(config.solver.type),
             config.solver.max_iterations,
             config.solver.tolerance,
             integrator_type_name(config.solver.integrator));
```

### 4. Update transport_runtime_session.cpp

Extend the proto-to-config mapping in `handle_compile_mechanism()`:

```cpp
engine::SimulationConfig config;
if (compile_cmd.has_settings()) {
    const auto& settings = compile_cmd.settings();
    if (settings.timestep() > 0) config.timestep = settings.timestep();
    if (settings.has_gravity()) {
        config.gravity[0] = settings.gravity().x();
        config.gravity[1] = settings.gravity().y();
        config.gravity[2] = settings.gravity().z();
    }
    if (settings.duration() > 0) config.duration = settings.duration();

    if (settings.has_solver()) {
        const auto& solver = settings.solver();
        switch (solver.type()) {
            case protocol::SOLVER_PSOR:
                config.solver.type = engine::SolverType::PSOR; break;
            case protocol::SOLVER_BARZILAI_BORWEIN:
                config.solver.type = engine::SolverType::BARZILAI_BORWEIN; break;
            case protocol::SOLVER_APGD:
                config.solver.type = engine::SolverType::APGD; break;
            case protocol::SOLVER_MINRES:
                config.solver.type = engine::SolverType::MINRES; break;
            default: break;
        }
        if (solver.max_iterations() > 0) config.solver.max_iterations = solver.max_iterations();
        if (solver.tolerance() > 0) config.solver.tolerance = solver.tolerance();
        switch (solver.integrator()) {
            case protocol::INTEGRATOR_EULER_IMPLICIT_LINEARIZED:
                config.solver.integrator = engine::IntegratorType::EULER_IMPLICIT_LINEARIZED; break;
            case protocol::INTEGRATOR_HHT:
                config.solver.integrator = engine::IntegratorType::HHT; break;
            case protocol::INTEGRATOR_NEWMARK:
                config.solver.integrator = engine::IntegratorType::NEWMARK; break;
            default: break;
        }
    }

    if (settings.has_contact()) {
        const auto& contact = settings.contact();
        config.contact.friction = contact.friction() > 0 ? contact.friction() : 0.3;
        config.contact.restitution = contact.restitution();
        config.contact.compliance = contact.compliance();
        config.contact.damping = contact.damping();
        config.contact.enable_contact = contact.enable_contact();
    }
}
```

### 5. Update TypeScript protocol layer

In `packages/protocol/src/transport.ts`, extend `createCompileMechanismCommand()`:

```ts
export interface SolverSettingsInput {
  type?: 'psor' | 'barzilai-borwein' | 'apgd' | 'minres';
  maxIterations?: number;
  tolerance?: number;
  integrator?: 'euler-implicit-linearized' | 'hht' | 'newmark';
}

export interface ContactSettingsInput {
  friction?: number;
  restitution?: number;
  compliance?: number;
  damping?: number;
  enableContact?: boolean;
}

export interface SimulationSettingsInput {
  timestep?: number;
  gravity?: { x: number; y: number; z: number };
  duration?: number;
  solver?: SolverSettingsInput;
  contact?: ContactSettingsInput;
}
```

Update `createCompileMechanismCommand()` to accept the full `SimulationSettingsInput` and map string enum values to the generated proto enum values.

Export `CompilationDiagnostic` and `DiagnosticSeverity` types from the protocol package for Prompt 3.

### 6. Run codegen

`pnpm generate:proto` — verify generated TS and C++ include new messages and enums.

### 7. Write unit tests

In `native/engine/tests/test_simulation.cpp` (or a new `test_solver_config.cpp`):

1. **Default config:** Compile with empty SimulationConfig -> system creates successfully, uses PSOR solver
2. **PSOR config:** Compile with SolverType::PSOR, max_iterations=200, tolerance=1e-10 -> verify solver settings applied (check system->GetSolver()->GetMaxIterations())
3. **BB solver:** Compile with SolverType::BARZILAI_BORWEIN -> verify ChSolverBB is active
4. **APGD solver:** Compile with SolverType::APGD -> verify ChSolverAPGD is active
5. **MINRES solver:** Compile with SolverType::MINRES -> verify ChSolverMINRES is active
6. **HHT integrator:** Compile with IntegratorType::HHT -> verify timestepper type
7. **Newmark integrator:** Compile with IntegratorType::NEWMARK -> verify timestepper type
8. **Contact settings:** Compile with custom friction/restitution -> verify material properties
9. **Backward compatibility:** Compile with SimulationConfig{} (all defaults) -> should produce same behavior as current code

### 8. Write protocol seam test

In the existing protocol roundtrip test or a new seam test:

1. Create a CompileMechanismCommand with full SimulationSettings (all fields populated)
2. Serialize to binary, deserialize, verify all fields round-trip
3. Create a CompileMechanismCommand with empty settings -> verify defaults
4. Create a CompilationResultEvent with structured_diagnostics -> verify round-trip

### 9. Write ADR

Document:
- SimulationSettings is the transport-level configuration contract — product-facing, not Chrono-facing
- SimulationConfig is the engine-level IR — mapped from proto in transport layer, mapped to Chrono in simulation.cpp
- Enum values use product-facing names (PSOR, HHT) not Chrono class names
- Default values are chosen for broad compatibility, not maximum accuracy
- Backward compatibility: absent fields use sensible defaults, old clients work unchanged
- CompilationDiagnostic is structured (severity + entity IDs + suggestion) to enable frontend linking

## Architecture Constraints
- SimulationConfig in simulation.h must NOT include Chrono headers — it is the product-level IR
- The proto enum names are product-facing (SOLVER_PSOR, INTEGRATOR_HHT), NOT Chrono class names (ChSolverPSOR)
- Mapping from proto enums to Chrono classes happens ONLY in simulation.cpp (behind the pimpl)
- All new fields must have backward-compatible defaults — if CompileMechanismCommand has no solver settings, the engine uses PSOR/100 iterations/1e-8 tolerance (matching current implicit behavior)
- ContactSettings compliance/damping are NSC-specific — if we later support SMC contact, this may need revisiting (document in ADR)

## Done Looks Like
- `pnpm generate:proto` succeeds
- `cmake --preset dev && cmake --build build/dev` succeeds
- New solver/integrator/contact settings flow through proto -> transport -> SimulationConfig -> Chrono
- Unit tests verify each solver type and integrator type maps correctly
- Protocol seam test verifies round-trip of full SimulationSettings
- Default config produces identical behavior to current code
- `ctest --preset dev` passes
- `pnpm --filter @motionlab/protocol typecheck` passes
- ADR written

## What NOT to Build
- Simulation settings dialog UI (that's Prompt 2)
- Pre-simulation validation checks (that's Prompt 3)
- SMC (Smooth Contact) solver support (future epic)
- Per-body contact material overrides (future epic)
- Adaptive timestepping (future epic)
```

---

## Prompt 2: Simulation Settings Dialog UI

```
# Epic 17 — Simulation Settings Dialog UI

You are redesigning the SimulationSettingsDialog to expose the full solver configuration from Prompt 1. The dialog has a Basic tab (duration, timestep, gravity) shown by default, and an Advanced tab (solver, integrator, contact settings) collapsed by default. Preset configurations provide one-click profiles for common scenarios. All settings persist in the simulation-settings Zustand store and are sent with CompileMechanismCommand on compile.

## Read These First (in order)
- `docs/architecture/principles.md` — React is NOT the hot path
- `packages/frontend/AGENTS.md` — frontend owns workbench UX, stores pattern
- `packages/ui/AGENTS.md` — reusable UI primitives, no domain logic
- The ADR from Prompt 1 on SimulationSettings contract
- `packages/frontend/src/stores/simulation-settings.ts` — current store (timestep + gravity only)
- `packages/frontend/src/components/SimulationSettingsDialog.tsx` — current dialog

## Governance Reminder
Full governance applies.

## What Exists Now

### `packages/frontend/src/stores/simulation-settings.ts`
Minimal Zustand store:
```ts
interface SimulationSettingsState {
  timestep: number;
  gravity: { x: number; y: number; z: number };
  setTimestep: (v: number) => void;
  setGravity: (g: { x: number; y: number; z: number }) => void;
  applyPreset: (preset: 'earth' | 'moon' | 'mars' | 'zero-g') => void;
}
```

### `packages/frontend/src/components/SimulationSettingsDialog.tsx`
Simple dialog with:
- Timestep dropdown (3 fixed options: 0.01, 0.001, 0.0001)
- Gravity preset buttons (Earth, Moon, Mars, Zero-G)
- Gravity vector manual inputs (X, Y, Z)
- Single "Done" button

### `packages/frontend/src/engine/connection.ts`
`sendCompileMechanism()` reads from the settings store and passes `{ timestep, gravity }` to `createCompileMechanismCommand()`.

### `@motionlab/ui` components available
NumericInput, Select/SelectContent/SelectItem, Dialog/DialogContent/DialogHeader/DialogTitle/DialogDescription/DialogFooter, Button, InspectorSection (collapsible), PropertyRow, Tabs/TabsList/TabsTrigger/TabsContent (from shadcn/ui).

### `packages/protocol/src/transport.ts` (after Prompt 1)
`createCompileMechanismCommand()` accepts full `SimulationSettingsInput` including solver, contact, and duration.

## What to Build

### 1. Extend the simulation-settings store

In `packages/frontend/src/stores/simulation-settings.ts`:

```ts
export type SolverType = 'psor' | 'barzilai-borwein' | 'apgd' | 'minres';
export type IntegratorType = 'euler-implicit-linearized' | 'hht' | 'newmark';
export type SettingsPreset = 'quick-preview' | 'balanced' | 'high-accuracy' | 'contact-heavy';

export interface SimulationSettingsState {
  // Basic
  duration: number;          // seconds (default: 10.0)
  timestep: number;          // seconds (default: 0.001)
  gravity: { x: number; y: number; z: number };

  // Solver (advanced)
  solverType: SolverType;
  maxIterations: number;
  tolerance: number;
  integratorType: IntegratorType;

  // Contact (advanced)
  friction: number;
  restitution: number;
  compliance: number;
  contactDamping: number;
  enableContact: boolean;

  // Actions
  setDuration: (v: number) => void;
  setTimestep: (v: number) => void;
  setGravity: (g: { x: number; y: number; z: number }) => void;
  setSolverType: (v: SolverType) => void;
  setMaxIterations: (v: number) => void;
  setTolerance: (v: number) => void;
  setIntegratorType: (v: IntegratorType) => void;
  setFriction: (v: number) => void;
  setRestitution: (v: number) => void;
  setCompliance: (v: number) => void;
  setContactDamping: (v: number) => void;
  setEnableContact: (v: boolean) => void;
  applyPreset: (preset: 'earth' | 'moon' | 'mars' | 'zero-g') => void;
  applySettingsPreset: (preset: SettingsPreset) => void;
  resetToDefaults: () => void;
}
```

Preset configurations:
```ts
const SETTINGS_PRESETS: Record<SettingsPreset, Partial<SimulationSettingsState>> = {
  'quick-preview': {
    timestep: 0.01,
    solverType: 'psor',
    maxIterations: 30,
    tolerance: 1e-6,
    integratorType: 'euler-implicit-linearized',
  },
  'balanced': {
    timestep: 0.001,
    solverType: 'psor',
    maxIterations: 100,
    tolerance: 1e-8,
    integratorType: 'euler-implicit-linearized',
  },
  'high-accuracy': {
    timestep: 0.0005,
    solverType: 'apgd',
    maxIterations: 500,
    tolerance: 1e-10,
    integratorType: 'hht',
  },
  'contact-heavy': {
    timestep: 0.001,
    solverType: 'barzilai-borwein',
    maxIterations: 200,
    tolerance: 1e-8,
    integratorType: 'euler-implicit-linearized',
    friction: 0.5,
    restitution: 0.1,
    compliance: 1e-5,
    contactDamping: 1e-4,
    enableContact: true,
  },
};
```

### 2. Redesign the SimulationSettingsDialog

Replace the current minimal dialog with a tabbed design:

```tsx
// Structure:
// - Preset selector row (Quick Preview | Balanced | High Accuracy | Contact-Heavy)
// - Tabs: Basic | Advanced
//
// Basic tab (shown by default):
//   - Duration (s): NumericInput, range [0.1, 3600]
//   - Timestep (s): Select with options 10ms, 1ms, 0.5ms, 0.1ms, plus Custom option
//   - Gravity: preset buttons (Earth, Moon, Mars, Zero-G) + Vec3 manual inputs
//
// Advanced tab:
//   - Solver section (collapsible InspectorSection):
//     - Solver type: Select dropdown
//       - PSOR: "Projected SOR — fast, good for most cases"
//       - Barzilai-Borwein: "Good convergence for ill-conditioned problems"
//       - APGD: "Robust for large systems with many contacts"
//       - MINRES: "Most precise, slowest — for validation runs"
//     - Max iterations: NumericInput, range [10, 5000], step 10
//     - Tolerance: NumericInput in scientific notation, range [1e-12, 1e-3]
//     - Integrator type: Select dropdown
//       - Euler Implicit Linearized: "Fast, stable, first-order accurate (default)"
//       - HHT: "Second-order accurate, good for stiff systems"
//       - Newmark: "Classical structural dynamics integrator"
//
//   - Contact section (collapsible InspectorSection):
//     - Enable contact detection: toggle/checkbox
//     - Friction coefficient: NumericInput, range [0, 2], step 0.05
//     - Restitution: NumericInput, range [0, 1], step 0.1
//     - Compliance: NumericInput in scientific notation
//     - Damping: NumericInput in scientific notation
//
// Footer:
//   - "Reset to Defaults" button (left-aligned, ghost variant)
//   - "Done" button (right-aligned)
```

Dialog width should increase to ~480px to accommodate the content.

Each Select dropdown item should include a brief description below the label (use smaller muted text).

### 3. Wire settings to compile command

Update `sendCompileMechanism()` in connection.ts to read the full settings from the store:

```ts
export function sendCompileMechanism(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const settings = useSimulationSettingsStore.getState();
  ws.send(createCompileMechanismCommand({
    timestep: settings.timestep,
    gravity: settings.gravity,
    duration: settings.duration,
    solver: {
      type: settings.solverType,
      maxIterations: settings.maxIterations,
      tolerance: settings.tolerance,
      integrator: settings.integratorType,
    },
    contact: {
      friction: settings.friction,
      restitution: settings.restitution,
      compliance: settings.compliance,
      damping: settings.contactDamping,
      enableContact: settings.enableContact,
    },
  }));
}
```

### 4. Show active settings in SimulationMetadataSection

The existing SimulationMetadataSection (shown in EntityInspector during simulation) should display the active solver settings as read-only metadata:
- Solver: "PSOR (100 iter, tol 1e-8)"
- Integrator: "Euler Implicit Linearized"
- Timestep: "1.0 ms"
- Contact: "Enabled (mu=0.3)"

Read these from the simulation-settings store (these reflect what was sent at compile time).

## Architecture Constraints
- All settings state lives in `useSimulationSettingsStore` — dialog is stateless (reads/writes store directly)
- Settings are sent once at compile time, not continuously — changing settings mid-simulation requires recompile
- The dialog does NOT trigger compilation — user clicks "Compile" separately (existing flow)
- Preset application is immediate (updates store), not deferred
- Tolerance and compliance values use scientific notation display (e.g., "1e-8" not "0.00000001")
- Use existing @motionlab/ui components — do not create new primitives unless strictly necessary
- Use longhand Tailwind padding (ps-/pe-) not shorthand (px-) per project convention

## Expected Behavior (testable)

### Basic tab
1. Duration input: type "5" -> store.duration = 5
2. Timestep select: choose "0.5ms" -> store.timestep = 0.0005
3. Gravity preset: click "Moon" -> store.gravity = {x:0, y:-1.62, z:0}
4. Gravity manual: change Y to -3.0 -> store.gravity.y = -3.0

### Advanced tab
1. Solver type: select "APGD" -> store.solverType = 'apgd'
2. Max iterations: set to 250 -> store.maxIterations = 250
3. Tolerance: set to 1e-10 -> store.tolerance = 1e-10
4. Integrator: select "HHT" -> store.integratorType = 'hht'
5. Contact friction: set to 0.5 -> store.friction = 0.5
6. Disable contact: toggle off -> store.enableContact = false

### Presets
1. Click "High Accuracy" preset -> timestep, solver, iterations, tolerance, integrator all update
2. Click "Reset to Defaults" -> all values return to balanced defaults

### Compile integration
1. Configure settings -> click Compile (elsewhere in UI) -> verify proto message includes all settings
2. Leave all defaults -> compile -> verify engine uses PSOR/100/1e-8/EulerImplicit (same as before Prompt 1)

## Done Looks Like
- Dialog opens with Basic tab showing duration, timestep, gravity
- Advanced tab shows solver and contact settings with descriptions
- Preset buttons configure all settings at once
- "Reset to Defaults" restores balanced preset
- Settings flow through to CompileMechanismCommand on compile
- SimulationMetadataSection shows active settings during simulation
- `pnpm --filter @motionlab/frontend typecheck` passes
- `pnpm --filter @motionlab/ui typecheck` passes

## What NOT to Build
- Pre-simulation validation / diagnostics panel (that's Prompt 3)
- Custom timestep input (use Select with fixed options for now)
- Settings persistence to project file (future — currently session-only via Zustand)
- Real-time settings changes during simulation (requires recompile)
- Per-body contact material overrides (future epic)
```

---

## Prompt 3: Pre-Simulation Validation & Diagnostics

```
# Epic 17 — Pre-Simulation Validation & Diagnostics

You are implementing engine-side validation checks that run during mechanism compilation (before simulation starts) and a frontend diagnostics panel that renders the results. The engine already has a `CompilationResult` with a diagnostics vector — you will populate it with structured checks for common mistakes (floating bodies, missing ground, over-constrained joints, zero-mass bodies, etc.). The frontend renders these as an interactive list where clicking a diagnostic selects the affected entity.

## Read These First (in order)
- `docs/architecture/principles.md` — engine is computational authority
- `native/engine/AGENTS.md` — user-meaningful diagnostics over raw backend errors
- `packages/frontend/AGENTS.md` — frontend owns workbench UX
- The ADR from Prompt 1 on SimulationSettings and CompilationDiagnostic contract
- `native/engine/src/simulation.h` — CompilationResult struct
- `native/engine/src/simulation.cpp` — current compile() with existing basic checks
- `native/engine/src/transport_runtime_session.cpp` — how compilation results are sent
- `schemas/protocol/transport.proto` — CompilationResultEvent with structured_diagnostics (from Prompt 1)

## Governance Reminder
Full governance applies.

## What Exists Now

### `native/engine/src/simulation.cpp` — compile()
The current compile() already has some early-return checks:
- "Mechanism has no bodies" (error)
- "Actuator config is required" (error)
- "Actuator is missing a target joint" (error)
- "Only one actuator may target a joint" (error)
- "Body has zero or negative mass" (error)
- Auto-fixes first body as ground if no fixed body exists (logged as diagnostic)

These are ad-hoc error strings, not structured diagnostics. Some cause early return (hard errors), others are informational.

### `native/engine/src/simulation.h` — CompilationResult
```cpp
struct CompilationResult {
    bool success = false;
    std::string error_message;
    std::vector<std::string> diagnostics;
};
```

### `native/engine/src/transport_runtime_session.cpp`
Maps CompilationResult to CompilationResultEvent:
```cpp
cr->set_success(result.success);
cr->set_error_message(result.error_message);
for (const auto& diag : result.diagnostics) {
    cr->add_diagnostics(diag);
}
```

### `schemas/protocol/transport.proto` (after Prompt 1)
CompilationResultEvent now has:
- `repeated string diagnostics = 3 [deprecated = true]` — old unstructured strings
- `repeated CompilationDiagnostic structured_diagnostics = 5` — new structured format

### `packages/frontend/src/stores/simulation.ts`
`compilationDiagnostics: string[]` — stores the old unstructured diagnostics.
`setCompilationResult()` receives diagnostics from compilation events.

## What to Build

### 1. Implement validation checks in simulation.cpp

Add a validation phase at the beginning of `compile()`, before creating any Chrono objects. All checks run first, accumulating diagnostics. Only ERROR-level diagnostics block compilation.

Create a helper struct for structured diagnostics within simulation.h:

```cpp
enum class DiagnosticSeverity { INFO, WARNING, ERROR };

struct CompilationDiagnostic {
    DiagnosticSeverity severity;
    std::string message;
    std::vector<std::string> affected_entity_ids;
    std::string suggestion;
    std::string code;  // machine-readable, e.g. "FLOATING_BODY"
};

struct CompilationResult {
    bool success = false;
    std::string error_message;
    std::vector<std::string> diagnostics;  // deprecated, keep for backward compat
    std::vector<CompilationDiagnostic> structured_diagnostics;
};
```

Implement these validation checks (in order of severity):

#### Errors (block simulation):

**E1: No bodies**
```
code: "NO_BODIES"
message: "Mechanism has no bodies"
suggestion: "Import at least one CAD file to create bodies"
```
Already exists as an early return — convert to structured diagnostic.

**E2: Missing ground**
```
code: "NO_GROUND"
message: "No fixed body in mechanism — at least one body must be fixed to define ground"
affected_entity_ids: [] (mechanism-level issue)
suggestion: "Select a body and toggle 'Fixed' in the Body Inspector, or add a Fixed joint to the ground"
```
Currently the engine auto-fixes the first body as ground and logs a diagnostic. Change this to an error: if no body has `is_fixed = true`, emit ERROR and fail compilation. The auto-fix behavior is misleading — the user should explicitly designate ground.

**E3: Zero-mass non-fixed bodies**
```
code: "ZERO_MASS"
message: "Body '<name>' has zero or negative mass but is not fixed"
affected_entity_ids: [body_id]
suggestion: "Set a positive mass in body properties, or mark the body as fixed"
```
Already exists as early return — convert to structured diagnostic.

**E4: Joint datum on same body**
```
code: "SELF_JOINT"
message: "Joint '<name>' connects two datums on the same body '<body_name>'"
affected_entity_ids: [joint_id, body_id]
suggestion: "A joint must connect datums on different bodies — reassign one of the datums"
```
Check that `parent_datum.parent_body_id != child_datum.parent_body_id` for each joint.

**E5: Duplicate actuators on joint**
```
code: "DUPLICATE_ACTUATOR"
message: "Multiple actuators target joint '<name>' — only one actuator per joint is supported"
affected_entity_ids: [actuator_id_1, actuator_id_2, joint_id]
suggestion: "Remove one of the conflicting actuators"
```
Already exists as early return — convert to structured diagnostic.

#### Warnings (simulation runs but may produce unexpected results):

**W1: Floating bodies**
```
code: "FLOATING_BODY"
message: "Body '<name>' has no joints or loads connecting it to the mechanism"
affected_entity_ids: [body_id]
suggestion: "Add a joint to connect this body, or remove it if it's not part of the mechanism"
```
Check: for each non-fixed body, verify at least one joint references a datum on that body, OR at least one load references a datum on that body.

**W2: Under-constrained mechanism**
```
code: "UNDER_CONSTRAINED"
message: "Mechanism has <N> unconstrained degrees of freedom (expected: <M>)"
affected_entity_ids: []  // mechanism-level
suggestion: "Add more joints or constraints to fully constrain the mechanism"
```
Compute approximate DOF: 6 * (num_non_fixed_bodies) - sum(DOF_removed_per_joint). If the result is larger than expected (e.g., > number of actuated DOFs), emit warning. DOF removed per joint type:
- Fixed: 6
- Revolute: 5
- Prismatic: 5
- Spherical: 3
- Cylindrical: 4
- Planar: 3
- Universal: 4
- Distance: 1
- PointLine: 4
- PointPlane: 1

**W3: Over-constrained mechanism**
```
code: "OVER_CONSTRAINED"
message: "Mechanism may be over-constrained — joints remove <N> DOF from <M> available"
affected_entity_ids: []  // mechanism-level
suggestion: "Check for redundant constraints. Consider using spherical or distance joints instead of fixed joints where possible"
```
If total DOF removed > 6 * num_non_fixed_bodies, the mechanism is likely over-constrained. This is a heuristic — some over-constrained mechanisms work fine if the constraints are geometrically compatible.

#### Informational:

**I1: Disconnected subgroups**
```
code: "DISCONNECTED_SUBGROUPS"
message: "Mechanism has <N> separate kinematic chains"
affected_entity_ids: [body_ids_of_smaller_groups]
suggestion: "This is usually intentional, but verify all bodies are connected as expected"
```
Build an adjacency graph from joints (body A <-> body B if a joint connects datums on A and B). Run connected components. If more than one component exists, emit info.

**I2: Auto-ground applied** (if you keep the auto-ground behavior as a fallback)
Keep the existing diagnostic but make it structured:
```
code: "AUTO_GROUND"
message: "Body '<name>' automatically treated as ground (first body in mechanism)"
affected_entity_ids: [body_id]
suggestion: "Explicitly mark a body as fixed for clarity"
```

### 2. Refactor compile() validation flow

```cpp
CompilationResult SimulationRuntime::compile(
    const mechanism::Mechanism& mechanism,
    const SimulationConfig& config)
{
    CompilationResult result;
    impl_->state = SimState::COMPILING;

    // Phase 1: Validation (all checks, accumulate diagnostics)
    validate_mechanism(mechanism, result);

    // If any ERROR-level diagnostics, fail early
    bool has_errors = std::any_of(
        result.structured_diagnostics.begin(),
        result.structured_diagnostics.end(),
        [](const auto& d) { return d.severity == DiagnosticSeverity::ERROR; });

    if (has_errors) {
        result.success = false;
        result.error_message = "Compilation failed — see diagnostics";
        impl_->state = SimState::ERROR;
        return result;
    }

    // Phase 2: Build Chrono system (existing code)
    // ... (existing body/joint/load/actuator creation) ...

    result.success = true;
    impl_->state = SimState::PAUSED;
    return result;
}
```

Extract validation into a private helper:
```cpp
void SimulationRuntime::validate_mechanism(
    const mechanism::Mechanism& mechanism,
    CompilationResult& result);
```
Or, since SimulationRuntime uses pimpl, implement as a free function in simulation.cpp that takes the mechanism and populates the result.

### 3. Update transport_runtime_session.cpp

Map `CompilationDiagnostic` to proto `CompilationDiagnostic`:

```cpp
for (const auto& diag : result.structured_diagnostics) {
    auto* pd = cr->add_structured_diagnostics();
    pd->set_severity(static_cast<protocol::DiagnosticSeverity>(
        static_cast<int>(diag.severity)));
    pd->set_message(diag.message);
    for (const auto& id : diag.affected_entity_ids) {
        pd->add_affected_entity_ids(id);
    }
    pd->set_suggestion(diag.suggestion);
    pd->set_code(diag.code);

    // Also populate deprecated string diagnostics for backward compat
    cr->add_diagnostics(diag.message);
}
```

### 4. Update frontend simulation store

Extend `packages/frontend/src/stores/simulation.ts`:

```ts
export interface StructuredDiagnostic {
  severity: 'info' | 'warning' | 'error';
  message: string;
  affectedEntityIds: string[];
  suggestion: string;
  code: string;
}

interface SimulationState {
  // ... existing fields ...
  structuredDiagnostics: StructuredDiagnostic[];
  setCompilationResult(
    success: boolean,
    error?: string,
    diagnostics?: string[],
    channels?: ChannelDescriptor[],
    structuredDiagnostics?: StructuredDiagnostic[],
  ): void;
}
```

### 5. Update connection.ts event handler

Parse `CompilationResultEvent.structured_diagnostics` and pass to the simulation store:

```ts
case 'compilationResult': {
  const cr = event.payload.value;
  const structuredDiags = cr.structuredDiagnostics?.map(d => ({
    severity: mapDiagnosticSeverity(d.severity),
    message: d.message,
    affectedEntityIds: d.affectedEntityIds ?? [],
    suggestion: d.suggestion,
    code: d.code,
  })) ?? [];

  simulationStore.setCompilationResult(
    cr.success,
    cr.errorMessage,
    cr.diagnostics,  // deprecated string diagnostics
    channels,
    structuredDiags,
  );
  break;
}
```

### 6. Create CompilationDiagnosticsPanel component

Create `packages/frontend/src/components/CompilationDiagnosticsPanel.tsx`:

```tsx
// Renders structured diagnostics after compilation.
// Shown in the bottom dock panel (alongside charts) or as an inline
// section below the compile button.
//
// Layout:
// - Summary bar: "Compilation succeeded with 2 warnings" or "Compilation failed: 3 errors"
// - Scrollable list of diagnostics:
//   - Icon per severity (error = red circle-x, warning = yellow triangle, info = blue circle-i)
//   - Message text
//   - "Suggestion: ..." in muted smaller text
//   - Click → selects affected entities in selection store + scrolls tree to entity
// - "Dismiss" button to clear
```

Use existing @motionlab/ui primitives. The panel should be compact — each diagnostic is one or two lines.

Entity linking: when user clicks a diagnostic with `affectedEntityIds`, call `useSelectionStore.getState().select(affectedEntityIds[0])` to select the first affected entity. This should trigger the tree to scroll to it and the viewport to highlight it (using existing selection infrastructure).

### 7. Show diagnostics panel after compilation

Wire the diagnostics panel to appear after compilation:
- If compilation succeeds with no warnings: show brief success toast or status bar update
- If compilation succeeds with warnings: show diagnostics panel, status bar says "Ready (N warnings)"
- If compilation fails: show diagnostics panel with errors, status bar says "Failed (N errors)"

The diagnostics panel should be clearable/dismissable. Once dismissed, the status bar still shows the count.

### 8. Status bar indicator

Update the existing `ViewportOverlay` or status bar area to show post-compilation status:
- Idle: nothing or "Ready"
- After compile success: "Ready" (green) or "Ready - N warnings" (yellow)
- After compile failure: "N errors" (red)
- During simulation: existing sim time / step count display

## Architecture Constraints
- Validation runs engine-side — frontend renders diagnostics but does not compute them
- All validation checks run before Chrono system creation — validation must not depend on Chrono state
- Validation accumulates ALL diagnostics, does not early-return on first warning
- Only ERROR-level diagnostics block compilation — warnings and info are non-blocking
- The deprecated `repeated string diagnostics` field remains populated for backward compatibility
- Entity IDs in diagnostics use the same UUIDv7 format as the mechanism store — frontend can look them up directly
- DOF counting is a heuristic — it cannot detect geometrically compatible over-constraints
- Disconnected-subgroup detection uses a simple union-find or BFS on the body adjacency graph

## Expected Behavior (testable)

### Error: No fixed body
1. Import a single body, leave it unfixed
2. Compile -> fails with DIAGNOSTIC_ERROR
3. Diagnostic: "No fixed body in mechanism" with suggestion to toggle Fixed
4. Click diagnostic -> body selected in tree

### Error: Zero mass
1. Import body, somehow mass = 0 (or manipulate test data)
2. Compile -> fails with ZERO_MASS error
3. Diagnostic shows body name and suggestion

### Warning: Floating body
1. Import two bodies
2. Fix one body, add no joints
3. Compile -> succeeds with FLOATING_BODY warning
4. Second body is floating — diagnostic shows its name
5. Click diagnostic -> unfixed body selected

### Warning: Over-constrained
1. Create two bodies connected by two fixed joints
2. Compile -> succeeds with OVER_CONSTRAINED warning
3. Diagnostic explains DOF arithmetic

### Info: Disconnected subgroups
1. Import three bodies
2. Fix body A, join A-B with revolute, leave C unconnected
3. Compile -> FLOATING_BODY warning for C + DISCONNECTED_SUBGROUPS info
4. Both diagnostics show entity IDs

### Backward compatibility
1. Old frontend (no structured diagnostics support) -> deprecated `diagnostics` strings still populated
2. Compile with all defaults, valid mechanism -> no diagnostics, success = true

### Dismiss and re-compile
1. Compile with warnings -> diagnostics panel shows
2. Dismiss panel -> panel hides, status bar still shows warning count
3. Fix the issue, recompile -> diagnostics cleared, panel shows new results

## Done Looks Like
- Engine validates mechanism and emits structured diagnostics
- CompilationDiagnostic messages flow through proto -> transport -> frontend store
- Diagnostics panel renders after compilation with severity icons and messages
- Clicking a diagnostic selects the affected entity in tree and viewport
- Status bar shows post-compilation diagnostic summary
- ERROR diagnostics block compilation, WARNING/INFO do not
- Deprecated string diagnostics still populated for backward compat
- `cmake --preset dev && cmake --build build/dev` succeeds
- `ctest --preset dev` passes (including new validation tests)
- `pnpm --filter @motionlab/frontend typecheck` passes
- `pnpm --filter @motionlab/protocol typecheck` passes

## What NOT to Build
- Automatic fix actions (e.g., "click to fix ground") — just suggestions for now
- Real-time validation during authoring (only at compile time)
- Kinematic / singularity analysis (future epic)
- Constraint force analysis for over-constrained detection (heuristic DOF count is sufficient)
- Per-body or per-joint diagnostics panels (single unified diagnostics list is enough)
```

---

## Integration Verification

After all three prompts complete, verify the full solver configuration and validation flow:

1. **Open simulation settings dialog** -> Basic tab shows duration (10s), timestep (1ms), gravity (Earth)
2. **Switch to Advanced tab** -> Solver section shows PSOR, 100 iterations, 1e-8 tolerance, Euler Implicit
3. **Select "High Accuracy" preset** -> All values update: APGD, 500 iterations, 1e-10, HHT, 0.5ms timestep
4. **Compile a valid mechanism** -> Engine uses the configured solver settings, compilation succeeds
5. **Check engine log** -> "Solver: type=APGD, max_iter=500, tol=1.00e-10, integrator=HHT"
6. **Run simulation** -> Simulation uses HHT integrator with APGD solver, produces results
7. **Import a second body, leave it unconnected, recompile** -> Warning: "Body has no joints" with entity link
8. **Click the warning** -> Floating body selected in tree and highlighted in viewport
9. **Remove all ground (unfix all bodies), recompile** -> Error: "No fixed body" blocks compilation
10. **Fix a body, recompile** -> Compilation succeeds, warning for floating body remains
11. **Reset to Defaults** -> All settings return to Balanced preset
12. **Compile with defaults** -> Engine behavior identical to pre-Epic-17 code
13. **Typecheck:** all `pnpm --filter ... typecheck` pass
14. **Engine tests:** `ctest --preset dev` passes
15. **Protocol seam test:** SimulationSettings round-trip verified

## Future Work (out of scope)

- **SMC (Smooth Contact) solver support:** Chrono's `ChSystemSMC` uses penalty-based contact with different solver options — would require a system type selector
- **Adaptive timestepping:** Chrono supports step size control with HHT — could auto-adjust timestep based on convergence
- **Per-body contact material overrides:** Allow different friction/restitution per body pair (Chrono supports this via material composition)
- **Settings persistence in project file:** Store SimulationSettings in `ProjectFile` proto for project-level defaults
- **Real-time validation during authoring:** Run lightweight checks as user adds/removes joints, show warnings inline
- **Kinematic analysis:** Compute Jacobian rank to detect exact over/under-constraint (beyond DOF counting heuristic)
- **Solver convergence monitoring:** Stream solver residual and iteration count as output channels during simulation
