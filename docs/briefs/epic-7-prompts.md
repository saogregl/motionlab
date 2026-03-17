# Epic 7 — Parallel Agent Prompts

> **Status:** Prompt 7.1 In Progress (code written, build pending)

Three prompts for simulation compilation and native dynamics runtime. Prompt 7.1 (Chrono spike) is a blocker and CAN start during Epic 6 since it is entirely native-side. Prompts 7.2 and 7.3 are sequential after 7.1.

### Implementation Notes — Prompt 7.1 (2026-03-17)

**Decision:** Started 7.1 before Epics 5-6 so that Chrono's actual joint types inform the authored data model in Epic 6, reducing rework risk.

**Files created/modified:**
- `native/engine/src/simulation.h` — `SimulationRuntime` class with pimpl (no Chrono in public API). Types: `SimState`, `BodyPose`, `JointState`, `CompilationResult`.
- `native/engine/src/simulation.cpp` — Full Chrono 8.0 implementation: `compile()` walks Mechanism proto (bodies→ChBody, datums→joint frames, joints→ChLinkLock*), `step(dt)`, `reset()`, `getBodyPoses()`, `getJointStates()`. NSC contact system, gravity (0,-9.81,0).
- `native/engine/tests/test_simulation.cpp` — 6 tests: two-body revolute pendulum (physics plausibility), empty mechanism, missing datum ref, zero mass, negative mass, reset restores initial state.
- `native/engine/CMakeLists.txt` — Added `simulation.cpp` to engine lib, `test_simulation.cpp` as separate test exe. Chrono via FetchContent (see below).
- `native/engine/CMakePresets.json` — Added `mingw-base` preset (Ninja generator, MinGW gcc/g++, `x64-mingw-dynamic` vcpkg triplet).

**Build system — Chrono integration path:**
- **vcpkg `chronoengine` port rejected** — depends on TBB which fails to build under `x64-mingw-dynamic` community triplet (no Visual Studio on this machine).
- **FetchContent chosen** — pulls Chrono 8.0.0 from GitHub with all optional modules disabled (`ENABLE_MODULE_IRRLICHT OFF`, `ENABLE_TBB OFF`, etc.). Links `ChronoEngine` target directly.
- vcpkg.json unchanged (Chrono NOT added to vcpkg deps).

**Build status:** CMake configure was started but not yet completed. To resume:
```bash
export VCPKG_ROOT=C:/Dev/vcpkg
export PATH="C:/msys64/mingw64/bin:C:/msys64/usr/bin:$PATH"
cd native/engine
cmake --preset dev
cmake --build build/dev
ctest --preset dev
```

**Potential issues to watch for:**
- Chrono 8.0 API uses `ChVector<>` not `ChVector3d` (9.0+ alias). Code written with `ChVector<>` for compatibility.
- FetchContent clone of Chrono is ~200MB, first configure will be slow.
- Eigen3 is bundled with Chrono when fetched via FetchContent (no separate vcpkg dep needed).
- May need to adjust Chrono CMake variables if the build surface differs from expected defaults.

**Governance:** Epics 5+ are under full governance — every boundary change needs an ADR, every protocol change needs seam tests, every architecture change needs doc updates.

## Shared Contract

| Interface | Owner | Consumer |
|-----------|-------|----------|
| `SimulationRuntime` C++ class with compile/step/readback | Prompt 1 (creates) | Prompt 2 (transport wires) |
| `CompileMechanismCommand`/`CompilationResult` proto | Prompt 2 (defines) | Prompt 1 (engine implements), Prompt 3 (frontend sends) |
| `SimulationControlCommand` (play/pause/step/reset) | Prompt 2 (defines) | Prompt 3 (toolbar buttons send) |
| `SimulationFrame` event (body poses per timestep) | Prompt 2 (engine sends) | Prompt 3 (viewport consumes on hot path) |
| `SimulationState` event (running/paused/error) | Prompt 2 (engine sends) | Prompt 3 (store + UI consumes) |

After all three are built, the integration test is: `pnpm dev:desktop` — import 2 bodies, create datums, create revolute joint, click Compile, click Play, bodies move under gravity. **Validates Scenario B.**

---

## Prompt 1: Chrono Integration Spike + Mechanism Compiler (CAN START DURING EPIC 6)

```
# Epic 7 — Chrono Integration Spike and Mechanism Compiler

You are implementing the Chrono physics engine integration for MotionLab's native engine. This is entirely native-side work with zero frontend dependency. It CAN start during Epic 6.

**Governance reminder:** Epics 5+ are under full governance. Any boundary or contract change requires an ADR. Any protocol, schema, or runtime contract change must add or update tests at the seam it affects. Update relevant subsystem docs when the epic completes.

## Read These First (in order)
- `docs/architecture/principles.md` — non-negotiable rules
- `docs/architecture/runtime-topology.md` — engine is authority
- `native/engine/AGENTS.md` — native boundary rules
- `docs/domain/simulation-model.md` — simulation concepts and constraints
- `docs/decisions/` — relevant ADRs

## What Exists Now

### `native/engine/vcpkg.json`
Dependencies: ixwebsocket, protobuf, opencascade. Chrono is not yet added.

### `native/engine/CMakeLists.txt`
Line 25-26: `# Chrono — deferred to Epic 7 (Simulation)` / `# find_package(Chrono CONFIG)`. OCCT is linked. Builds static lib `motionlab-engine-lib` + executable + tests.

### `native/engine/src/mechanism_state.cpp`
In-memory Mechanism model with bodies, datums, joints. Full CRUD command handlers for datums/joints. This is the authoritative mechanism state that the compiler will read from.

### `schemas/mechanism/mechanism.proto`
Mechanism with Bodies (with MassProperties, Pose), Datums, Joints (with JointType: REVOLUTE, PRISMATIC, FIXED, and limits). These are the input types the compiler consumes.

### `native/engine/src/transport.cpp`
Command switch handles all current commands (Handshake, Ping, ImportAsset, CreateDatum/DeleteDatum/RenameDatum, CreateJoint/UpdateJoint/DeleteJoint, SaveProject, LoadProject, MechanismSnapshot). The simulation commands will be added in Prompt 7.2, not here.

## What to Build

### 1. Add Chrono to the build system

Add `chrono` (or `projectchrono`) to `native/engine/vcpkg.json`. **Important:** Chrono may not be in vcpkg — if not, document the alternative integration path. Research these options in order of preference:
- vcpkg port (check `vcpkg search chrono` and the vcpkg registry)
- CMake FetchContent from the Chrono GitHub repository
- System install with `find_package(Chrono CONFIG)`
- Custom vcpkg overlay port

Whichever path works, document it in a comment in CMakeLists.txt so future agents understand the dependency strategy.

### 2. Configure CMake for Chrono

Uncomment and configure `find_package(Chrono)` in CMakeLists.txt. Link the required Chrono modules:
- `ChronoEngine` (core dynamics)
- Collision detection module if needed for contact

Do NOT link visualization or vehicle modules — MotionLab has its own viewport.

### 3. Create `native/engine/src/simulation.h`

SimulationRuntime class declaration with a clean public interface:

```cpp
#pragma once
#include <string>
#include <vector>
#include <memory>

// Forward declarations — NO Chrono headers in the public interface
namespace motionlab::mechanism { class Mechanism; }

namespace motionlab::engine {

enum class SimState { IDLE, COMPILING, RUNNING, PAUSED, ERROR };

struct BodyPose {
    std::string body_id;
    double position[3];
    double orientation[4]; // quaternion (w, x, y, z)
};

struct JointState {
    std::string joint_id;
    double position;       // generalized coordinate (rad or m)
    double velocity;       // generalized velocity (rad/s or m/s)
    double reaction_force[3];
    double reaction_torque[3];
};

struct CompilationResult {
    bool success;
    std::string error_message;
    std::vector<std::string> diagnostics;
};

class SimulationRuntime {
public:
    SimulationRuntime();
    ~SimulationRuntime();

    CompilationResult compile(const motionlab::mechanism::Mechanism& mechanism);
    void step(double dt);
    void reset();

    SimState getState() const;
    std::vector<BodyPose> getBodyPoses() const;
    std::vector<JointState> getJointStates() const;
    double getCurrentTime() const;
    uint64_t getStepCount() const;

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace motionlab::engine
```

### 4. Create `native/engine/src/simulation.cpp`

Implement the SimulationRuntime using Chrono internally:

**`compile(Mechanism)`:**
- Walk the Mechanism proto (or its C++ equivalent from mechanism_state)
- For each Body: create a `ChBody`, set mass from MassProperties, set inertia tensor, set initial position/orientation from Pose
- For each Joint: create the appropriate Chrono link:
  - `REVOLUTE` -> `ChLinkLockRevolute` (or `ChLinkRevolute`)
  - `PRISMATIC` -> `ChLinkLockPrismatic`
  - `FIXED` -> `ChLinkLockLock`
- Set joint frames from the referenced datum poses (datums define the joint coordinate frames on each body)
- Create `ChSystemNSC` (non-smooth contact) with gravity = (0, -9.81, 0)
- Validate the mechanism before compiling:
  - All body references in joints must exist
  - All datum references must exist and be attached to the correct bodies
  - At least one body must be present
- Return diagnostics for any issues (disconnected bodies as warnings, missing references as errors)

**`step(double dt)`:**
- Call `system->DoStepDynamics(dt)`
- Increment step count, update current time

**`getBodyPoses()`:**
- Read current `ChBody` positions and orientations
- Convert Chrono's `ChVector` and `ChQuaternion` to the BodyPose struct
- Map back to authored body IDs (stored during compilation)

**`getJointStates()`:**
- Read joint reaction forces/torques from Chrono link objects
- Read generalized coordinates where applicable
- Map back to authored joint IDs

**`reset()`:**
- Restore all bodies to their initial positions/orientations (saved during compilation)
- Reset time to 0, step count to 0
- Set state to IDLE

**`getState()`:**
- Return current SimState

### 5. Store initial state for reset

During `compile()`, save the initial body poses so `reset()` can restore them. Use a `std::unordered_map<std::string, BodyPose>` keyed by body ID.

### 6. Body-to-Chrono ID mapping

Maintain a bidirectional map between authored body/joint IDs (UUIDs from the Mechanism proto) and Chrono's internal body/joint pointers. This mapping is internal to simulation.cpp and must NOT leak through the public interface.

### 7. Write standalone C++ test

Create `native/engine/tests/test_simulation.cpp`:

```cpp
// Test: Two-body revolute mechanism under gravity
// Setup:
//   - Body A (ground, fixed): 1kg box at origin
//   - Body B (pendulum): 1kg box at (1, 0, 0)
//   - Datum on A at (0.5, 0, 0)
//   - Datum on B at (-0.5, 0, 0) (same world position initially)
//   - Revolute joint connecting A-datum to B-datum, axis = Z
//   - Gravity = (0, -9.81, 0)
//
// Expected behavior:
//   - Body A stays fixed
//   - Body B swings downward (Y position decreases)
//   - After 100 steps at dt=0.01, Body B's Y < 0
//
// Verify:
//   - Compilation succeeds
//   - After stepping, Body B has moved
//   - Body A remains at origin
//   - Joint state has nonzero reaction forces
```

### 8. Include test fixtures

Create a helper function or fixture that builds the two-body revolute mechanism as a Mechanism proto message (or equivalent C++ struct). This fixture will be reused in Prompt 7.2 tests.

### 9. Validation error tests

Test that `compile()` returns meaningful errors for:
- Empty mechanism (no bodies)
- Joint referencing nonexistent body ID
- Joint referencing nonexistent datum ID
- Body with zero or negative mass

### 10. Chrono version and configuration documentation

Add a comment block at the top of simulation.cpp documenting:
- Which Chrono version was integrated
- Which modules are used (ChronoEngine core)
- The contact system choice (NSC vs SMC) and why
- Any Chrono-specific gotchas encountered during integration

## Architecture Constraints
- SimulationRuntime does NOT leak Chrono types through its public interface. Everything in/out is mechanism IR types (proto messages or equivalent C++ structs). Mechanism-to-Chrono mapping is an internal implementation detail.
- The Impl (pimpl) pattern keeps Chrono headers out of simulation.h entirely.
- Compilation errors must reference authored entity names (body/joint/datum names from the mechanism), not Chrono internal IDs.
- Do not add any transport or protocol code — that is Prompt 7.2.

## Done Looks Like
- `cmake --preset dev && cmake --build build/dev` succeeds with Chrono linked
- `ctest --preset dev` passes the two-body revolute simulation test
- Test compiles a mechanism and simulates 100 steps with plausible physics (pendulum swings down)
- Validation errors are actionable (name which entity is problematic)
- No Chrono types in any public header

## What NOT to Build
- Protocol changes (that's Prompt 7.2)
- Frontend UI or controls (that's Prompt 7.3)
- Streaming or transport wiring (that's Prompt 7.2)
- Advanced collision detection or contact models
- Chrono visualization modules
- Multi-threaded simulation (threading is Prompt 7.2's responsibility)
```

---

## Prompt 2: Simulation Lifecycle Protocol + Streaming Transport

```
# Epic 7 — Simulation Lifecycle Protocol and Streaming Transport

You are wiring the simulation runtime (from Prompt 7.1) into the transport layer, defining the protocol messages for simulation control and frame streaming. This depends on Prompt 7.1 being complete.

**Governance reminder:** Epics 5+ are under full governance. Protocol changes require seam tests. Boundary changes require an ADR. Write ADR for simulation streaming contract.

## Read These First (in order)
- `docs/architecture/principles.md` — non-negotiable rules
- `docs/architecture/protocol-overview.md` — protocol contract rules
- `docs/architecture/runtime-topology.md` — engine is authority, Electron is shell
- `native/engine/AGENTS.md` — native boundary rules
- `packages/protocol/AGENTS.md` — generated bindings are read-only
- `schemas/AGENTS.md` — schema ownership
- `docs/decisions/` — relevant ADRs

## What Exists Now

### `native/engine/src/simulation.h` / `simulation.cpp` (from Prompt 7.1)
SimulationRuntime class with: compile(Mechanism), step(dt), reset(), getBodyPoses(), getJointStates(), getState(), getCurrentTime(), getStepCount(). Clean public interface with no Chrono leakage.

### `schemas/protocol/transport.proto`
Current Command oneof includes: Handshake, Ping, ImportAsset, CreateDatum, DeleteDatum, RenameDatum, CreateJoint, UpdateJoint, DeleteJoint, SaveProject, LoadProject. Current Event oneof includes: HandshakeAck, Pong, EngineStatus, ImportAssetResult, DatumCreated, DatumDeleted, DatumRenamed, JointCreated, JointUpdated, JointDeleted, SaveProjectResult, LoadProjectResult, MechanismSnapshot.

### `native/engine/src/transport.cpp`
Command switch handles all current commands. Single-threaded — all command handling happens on the WebSocket server thread.

### `native/engine/src/mechanism_state.cpp`
In-memory mechanism model. The simulation compiler reads from this state.

### `packages/protocol/src/transport.ts`
Binary command/event helpers: createHandshakeCommand, createPingCommand, parseEvent, and helpers for all current commands/events.

### `packages/frontend/src/engine/connection.ts`
WebSocket client with event handling for all current event types. Updates Zustand stores based on incoming events.

## What to Build

### 1. Add simulation messages to transport.proto

Add to the Command oneof:

```protobuf
// Compile the current mechanism state into a simulation.
// Empty message — engine uses its current in-memory mechanism.
CompileMechanismCommand compile_mechanism = 20;

// Control a compiled simulation.
SimulationControlCommand simulation_control = 21;
```

Add the SimulationControlCommand message:

```protobuf
message SimulationControlCommand {
  SimulationAction action = 1;
}

enum SimulationAction {
  SIMULATION_ACTION_UNSPECIFIED = 0;
  SIMULATION_ACTION_PLAY = 1;
  SIMULATION_ACTION_PAUSE = 2;
  SIMULATION_ACTION_STEP = 3;
  SIMULATION_ACTION_RESET = 4;
}
```

Add to the Event oneof:

```protobuf
CompilationResult compilation_result = 20;
SimulationState simulation_state = 21;
SimulationFrame simulation_frame = 22;
```

Add the event messages:

```protobuf
message CompilationResult {
  bool success = 1;
  string error_message = 2;
  repeated string diagnostics = 3;
}

message SimulationState {
  SimStateEnum state = 1;
  double current_time = 2;
  uint64 step_count = 3;
}

enum SimStateEnum {
  SIM_STATE_UNSPECIFIED = 0;
  SIM_STATE_IDLE = 1;
  SIM_STATE_COMPILING = 2;
  SIM_STATE_RUNNING = 3;
  SIM_STATE_PAUSED = 4;
  SIM_STATE_ERROR = 5;
}

message SimulationFrame {
  uint64 step_index = 1;
  double time = 2;
  repeated BodyPose body_poses = 3;
}

message BodyPose {
  ElementId body_id = 1;
  Pose pose = 2;
}
```

### 2. Run `pnpm generate:proto`

Regenerate both TypeScript and C++ bindings. Verify both compile cleanly.

### 3. Engine-side command handlers in transport.cpp

Add handlers for the new commands in the command switch:

**CompileMechanism handler:**
- Read the current mechanism from mechanism_state
- Call simulationRuntime.compile(mechanism)
- Send CompilationResult event with success/error/diagnostics

**SimulationControl handler:**
- Switch on action:
  - PLAY: start the simulation loop on a background thread
  - PAUSE: signal the simulation thread to pause
  - STEP: run one step, send one SimulationFrame, stay paused
  - RESET: reset simulation, send SimulationState(IDLE)

### 4. Simulation thread architecture

The simulation loop MUST run on a separate thread from the WebSocket server:

```cpp
// Simulation thread loop (pseudocode):
while (running && !paused) {
    simulationRuntime.step(dt);

    // Build SimulationFrame event
    auto poses = simulationRuntime.getBodyPoses();
    // ... serialize to SimulationFrame proto ...

    // Send frame (non-blocking)
    if (canSendFrame()) {
        sendBinaryEvent(frameEvent);
    }
    // else: skip frame (backpressure)

    // Send SimulationState at lower frequency (every N steps)
    if (stepCount % stateUpdateInterval == 0) {
        sendSimulationState(RUNNING, currentTime, stepCount);
    }

    // Throttle to target frame rate (e.g., 60 fps)
    sleepUntilNextFrame(targetFrameInterval);
}
```

### 5. Thread safety

Use a mutex or lock-free mechanism between the simulation thread and the WebSocket transport thread:
- Simulation thread produces frames
- WebSocket thread sends them and receives commands
- Use `std::mutex` + `std::condition_variable` for pause/resume signaling
- Use an atomic flag for the running state
- Protect the WebSocket send path with a mutex if ixwebsocket doesn't handle concurrent sends

### 6. Frame streaming and backpressure

- After each step (or batch of steps), serialize body poses into a SimulationFrame event
- Send as a binary WebSocket frame
- If the WebSocket send buffer is full or slow, skip frames rather than blocking the simulation thread
- Log skipped frames at debug level
- Target frame delivery rate: 30-60 fps (independent of simulation timestep)

### 7. State transition events

Send SimulationState events at each state transition:
- Compile success -> SIM_STATE_IDLE (compiled, ready to run)
- PLAY -> SIM_STATE_RUNNING
- PAUSE -> SIM_STATE_PAUSED
- RESET -> SIM_STATE_IDLE
- Error -> SIM_STATE_ERROR (with error message in a separate event or log)

### 8. TypeScript transport helpers

Add to `packages/protocol/src/transport.ts`:

```typescript
export function createCompileMechanismCommand(sequenceId: bigint): Uint8Array {
  const cmd = new Command({
    sequenceId,
    payload: {
      case: 'compileMechanism',
      value: new CompileMechanismCommand({}),
    },
  });
  return cmd.toBinary();
}

export function createSimulationControlCommand(
  action: SimulationAction,
  sequenceId: bigint
): Uint8Array {
  const cmd = new Command({
    sequenceId,
    payload: {
      case: 'simulationControl',
      value: new SimulationControlCommand({ action }),
    },
  });
  return cmd.toBinary();
}
```

Update `parseEvent` to handle the new event types (compilationResult, simulationState, simulationFrame).

### 9. Protocol seam test

Write a test that exercises the full simulation lifecycle over the wire:
1. Start engine on a random port
2. Connect and handshake
3. Send CompileMechanism command (assumes engine has a mechanism loaded — set up fixture or load a test project first)
4. Receive CompilationResult event — verify success
5. Send SimulationControl(PLAY)
6. Receive SimulationState(RUNNING)
7. Receive multiple SimulationFrame events — verify body poses change between frames
8. Send SimulationControl(PAUSE)
9. Receive SimulationState(PAUSED)
10. Send SimulationControl(STEP) — receive exactly one SimulationFrame
11. Send SimulationControl(RESET)
12. Receive SimulationState(IDLE)

### 10. Write ADR for simulation streaming contract

Write `docs/decisions/adr-NNNN-simulation-streaming.md` covering:
- Simulation thread runs independently from transport thread
- Frame delivery is best-effort (skip frames under backpressure)
- SimulationState events are reliable (never skipped)
- Channel semantics: frames are ordered but may have gaps in step_index
- Target frame rate is configurable but defaults to 60 fps
- Simulation timestep is independent of frame delivery rate

## Architecture Constraints
- Simulation thread MUST NOT block WebSocket message handling
- Frame delivery is best-effort — skip frames if send buffer is full, never block the simulation thread
- Compilation errors must reference authored entity names (body/datum/joint names, not Chrono internal IDs)
- stdout logging unchanged (`[ENGINE] status=...` for Electron supervision)
- SimulationState transitions are reliable events (always delivered), SimulationFrames are best-effort

## Done Looks Like
- `pnpm generate:proto` produces updated TS and C++ bindings
- Engine compiles mechanism, runs simulation on a background thread, streams body pose frames to the frontend at the target rate
- Play/pause/step/reset all work via protocol commands
- Compilation errors are actionable and name specific entities
- Protocol seam test passes
- ADR for simulation streaming is written
- `cmake --preset dev && cmake --build build/dev` succeeds
- `ctest --preset dev` passes including the new seam test

## What NOT to Build
- Frontend UI or toolbar (that's Prompt 7.3)
- Viewport integration (that's Prompt 7.3)
- Trace data or output channels (that's Epic 8)
- Chart surface or timeline
- Playback speed control (that's Epic 8)
```

---

## Prompt 3: Frontend Simulation Controls + Viewport Playback

```
# Epic 7 — Frontend Simulation Controls and Viewport Playback

You are building the frontend simulation UX: toolbar controls, simulation state management, and hot-path viewport updates from streamed simulation frames. This depends on Prompts 7.1 and 7.2 being complete.

**Governance reminder:** Epics 5+ are under full governance. Update relevant subsystem docs when the epic completes. Any architecture changes need doc updates.

## Read These First (in order)
- `docs/architecture/principles.md` — React is NOT the hot path for viewport playback
- `packages/frontend/AGENTS.md` — frontend owns workbench UX, Zustand for state
- `packages/viewport/AGENTS.md` — viewport rendering rules
- `docs/architecture/runtime-topology.md` — renderer connects directly to engine
- `docs/decisions/` — relevant ADRs, especially the simulation streaming ADR from Prompt 7.2

## What Exists Now

### `packages/frontend/src/stores/mechanism.ts`
Zustand store with bodies, datums, joints. Full CRUD actions for datums and joints.

### `packages/frontend/src/stores/selection.ts`
Zustand store with selectedIds set.

### `packages/frontend/src/stores/tool-mode.ts`
Zustand store with activeMode (select, create-datum, create-joint, etc.).

### `packages/frontend/src/engine/connection.ts`
WebSocket client with event handling for all current event types: handshakeAck, engineStatus, importAssetResult, datumCreated/Deleted/Renamed, jointCreated/Updated/Deleted, saveProjectResult, loadProjectResult, mechanismSnapshot. Updates Zustand stores based on incoming events.

### `packages/viewport/src/scene-graph.ts`
SceneGraphManager with methods: addBody(id, meshData), removeBody(id), addDatum(id, parentBodyId, pose), removeDatum(id), addJointConnector(id, ...), removeJointConnector(id), setSelected(ids), updateCamera(preset). Manages Babylon.js scene objects.

### `packages/frontend/src/components/` (existing)
BodyTree (now ProjectTree), BodyInspector, DatumInspector, JointInspector. AppShell layout: project tree left, viewport center, inspector right.

### `packages/protocol/src/transport.ts` (updated by Prompt 7.2)
Now includes: createCompileMechanismCommand, createSimulationControlCommand(action), and parseEvent handles compilationResult, simulationState, simulationFrame event types.

## What to Build

### 1. Create simulation Zustand store

Create `packages/frontend/src/stores/simulation.ts`:

```typescript
import { create } from 'zustand';

type SimState = 'idle' | 'compiling' | 'running' | 'paused' | 'error';

interface SimulationStore {
  state: SimState;
  currentTime: number;
  stepCount: number;
  errorMessage: string | null;
  compilationDiagnostics: string[];

  // Actions (called by connection.ts event handlers)
  setCompilationResult: (success: boolean, error?: string, diagnostics?: string[]) => void;
  setSimulationState: (state: SimState, time: number, stepCount: number) => void;
  setError: (message: string) => void;
  reset: () => void;
}
```

This store updates at LOW frequency — only on state transitions and periodic time updates. It does NOT receive per-frame body poses.

### 2. Handle new event types in connection.ts

Wire the new protocol events into the appropriate stores:

**`compilationResult`:** Update simulation store with success/failure, diagnostics.

**`simulationState`:** Update simulation store state, currentTime, stepCount.

**`simulationFrame`:** **THIS IS THE HOT PATH.** Do NOT update React state. Instead, for each BodyPose in the frame, call `sceneGraphManager.updateBodyTransform(bodyId, pose)` directly. This bypasses React entirely and goes straight to Babylon.js transforms.

```typescript
case 'simulationFrame': {
  const frame = evt.payload.value;
  for (const bodyPose of frame.bodyPoses) {
    sceneGraphManager.updateBodyTransform(
      bodyPose.bodyId.id,
      bodyPose.pose
    );
  }
  break;
}
```

### 3. Wire SimulationFrame to SceneGraphManager

The connection module needs a reference to the SceneGraphManager. Options:
- **Registry/singleton pattern:** SceneGraphManager registers itself when created, connection.ts reads from the registry
- **Initialization parameter:** Pass the SceneGraphManager reference when the connection is established

Choose the approach that best fits the existing architecture. The critical requirement is that SimulationFrame event handling can call SceneGraphManager methods without going through React.

### 4. Add updateBodyTransform to SceneGraphManager

Add a method to SceneGraphManager in `packages/viewport/src/scene-graph.ts`:

```typescript
updateBodyTransform(bodyId: string, pose: { position: Vec3, orientation: Quat }): void {
  const node = this.bodyNodes.get(bodyId);
  if (!node) return;
  node.position.set(pose.position.x, pose.position.y, pose.position.z);
  node.rotationQuaternion = new BABYLON.Quaternion(
    pose.orientation.x,
    pose.orientation.y,
    pose.orientation.z,
    pose.orientation.w
  );
}
```

This must be fast — called 30-60 times per second for every body in the mechanism.

### 5. Create simulation toolbar

Create `packages/frontend/src/components/SimulationToolbar.tsx`:

- **Compile button:** Sends CompileMechanismCommand. Disabled while simulation is running.
- **Play/Pause toggle:** Sends SimulationControl(PLAY) or SimulationControl(PAUSE). Icon swaps between play and pause.
- **Step button:** Sends SimulationControl(STEP). Only enabled when paused.
- **Reset button:** Sends SimulationControl(RESET). Always available.
- **Simulation time display:** Shows `t = 1.234s` from the simulation store.

Position in the secondary toolbar area (below the main header, or as a floating toolbar above the viewport). Follow the existing AppShell layout patterns.

### 6. Button state logic

```typescript
const { state } = useSimulation();

const canCompile = state === 'idle' || state === 'error';
const canPlay = state === 'paused' || state === 'idle'; // idle after compile
const canPause = state === 'running';
const canStep = state === 'paused';
const canReset = state !== 'idle' || state !== 'compiling';
```

### 7. Compilation error display

If compilation fails, show diagnostics:
- Display in a bottom panel or notification area
- Each diagnostic should name the problematic entity (body/datum/joint name)
- Allow dismissing the error display
- Keep it simple — a list of strings, not a complex error tree

### 8. Keyboard shortcuts

- **Space** = Play/Pause toggle
- **R** = Reset (only when not in a text input)

Implement via a global keydown listener that checks `document.activeElement` to avoid capturing in text fields.

### 9. Viewport reset on simulation reset

When SimulationState transitions to IDLE via reset:
- Restore initial body poses in the viewport
- The engine sends a SimulationFrame with initial poses on reset, OR the frontend restores from the last MechanismSnapshot
- Whichever approach Prompt 7.2 implemented, wire it here

### 10. Disable mechanism editing during simulation

When simulation state is `running` or `paused`:
- Disable datum creation tool
- Disable joint creation tool
- Disable delete actions for datums/joints
- Disable rename actions
- Show a visual indicator that editing is locked (e.g., dimmed tree items, disabled buttons)
- Re-enable all editing on reset (state returns to `idle`)

Use the simulation store state in tool-mode and relevant UI components to gate these actions.

## Architecture Constraints
- **SimulationFrame handling is the hot path.** It MUST NOT trigger React re-renders. Body transforms go directly to SceneGraphManager via imperative calls.
- Only simulation state changes (play/pause, time display) update React via the Zustand store. The simulation store updates at low frequency (state changes), the viewport updates at high frequency (every frame).
- Do not add `@motionlab/protocol` as a dependency of `@motionlab/viewport` — protocol awareness stays in `@motionlab/frontend`. The viewport exposes `updateBodyTransform` which takes plain position/orientation data.
- Keyboard shortcuts must not interfere with text input fields.

## Done Looks Like
- Full simulation loop visible in the app: compile -> play -> bodies move -> pause -> step -> reset
- Viewport updates smoothly at 30-60fps during simulation playback
- No UI jank during simulation — React rendering is not on the hot path
- Simulation toolbar shows correct button states for each simulation state
- Compilation errors display diagnostics with entity names
- Keyboard shortcuts (Space, R) work
- Mechanism editing is disabled during simulation, re-enabled on reset
- Simulation time display updates during playback
- **Completes core of Validation Scenario B**

## What NOT to Build
- Trace data or charts (that's Epic 8)
- Timeline scrubber (that's Epic 8)
- Engineering outputs or inspection during playback (that's Epic 8)
- Playback speed control (that's Epic 8)
- Undo/redo for simulation actions
- Multiple simultaneous simulation runs
```

---

## Integration Verification

After all three prompts complete, verify the full simulation stack:

1. **Chrono build:** `cmake --preset dev && cmake --build build/dev` succeeds with Chrono linked
2. **Simulation test:** `ctest --preset dev` passes (two-body revolute simulation)
3. **Proto codegen:** `pnpm generate:proto` produces updated TS and C++ bindings
4. **Protocol seam test:** Compile -> play -> receive frames -> pause -> reset over the wire
5. **Desktop integration:** `pnpm dev:desktop` — import 2 bodies, create datums, create revolute joint, click Compile, click Play, bodies move under gravity
6. **Viewport smoothness:** Bodies animate at 30-60fps without jank
7. **Controls:** Play/Pause/Step/Reset all work, keyboard shortcuts work
8. **Error handling:** Invalid mechanism shows compilation diagnostics
