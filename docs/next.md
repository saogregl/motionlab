# Next Steps — MotionLab Development Roadmap

> **As of:** 2026-03-18
> **Last audit commit:** `782d9dc` ("Epic 4+: datum/joint CRUD, mechanism state, viewport visuals, protocol expansion")

## Progress Summary

| Epic | Title | Status | Remaining |
|------|-------|--------|-----------|
| 1 | Engine + Electron + Frontend Client | Complete | — |
| 2 | Buf Codegen + Binary Protobuf | Complete | — |
| 3 | OCCT CAD Import + Protocol + Import Flow | Complete | — |
| 4 | Scene Graph + Picking + Integration | Complete | — |
| 5 | Datum CRUD + Creation Tool + Visualization | ~90% | Surface picking verification |
| 6 | Joint Protocol + Visualization + Tree + Save/Load | ~60% | Save/Load (Prompt 4) |
| 7 | Chrono Simulation Runtime | ~25% | Build validation, protocol, playback |
| 8 | Output Channels + Charts + Playback UX | Not Started | All prompts |
| 9 | MVP Hardening + Packaging | Not Started | All prompts |

## Immediate Priority: Finish the Vertical Slice

### 1. Verify Epic 5 surface picking (low effort, high confidence)

The datum creation tool mode exists (`useToolModeStore` with `create-datum` mode, `datum-pose.ts` utilities), but the end-to-end flow needs verification:
- Does clicking a body surface in `create-datum` mode compute a correct datum pose from the surface normal?
- Does `computeDatumPose()` produce the expected Z-axis alignment?
- Are cursor feedback (crosshair) and Escape-to-exit wired up?

**Action:** Manual test in `pnpm dev:desktop` with a STEP file. If surface picking doesn't work, implement the missing geometry-aware ray-to-surface-normal logic.

### 2. Complete Epic 6 Prompt 4 — Save/Load (critical gap)

This is the highest-priority missing feature. Without persistence, no real workflow is possible.

**Deliverables:**
- `ProjectFile` proto message containing `Mechanism` + `ProjectMetadata` (name, created/modified timestamps, format_version)
- `SaveProjectCommand` / `LoadProjectCommand` added to protocol Command/Event oneofs
- Engine-side serialization: serialize current `MechanismState` to `ProjectFile` protobuf bytes, write to disk
- Engine-side deserialization: read file, reconstruct `MechanismState`, emit `MechanismSnapshot` event
- Electron IPC: save dialog (`dialog.showSaveDialog` with `.motionlab` extension filter), open dialog (`dialog.showOpenDialog`)
- Frontend: File > Save / File > Open menu items or toolbar buttons, project title in TopBar, dirty-state tracking (optional, can defer to Epic 9)
- Seam test: save → load → verify all body/datum/joint IDs and properties survive round-trip

## Short-Term: Simulation (Epic 7)

### 3. Complete Epic 7.1 — Chrono spike validation

Current state: `SimulationRuntime` class and `test_simulation.cpp` exist but are WIP.

**Deliverables:**
- Get native build passing with Chrono 9.0.1 (verify FetchContent integration on current toolchain)
- `compile(MechanismState)`: map bodies → `ChBodyEasyBox` (or similar), joints → `ChLinkLockRevolute`/`ChLinkLockPrismatic`/`ChLinkLockLock`
- `step(dt)`, `reset()`, `getBodyPoses()`, `getJointStates()` lifecycle
- Two-body revolute pendulum test: compile, step 100 frames, verify gravity pulls child body downward
- Validation error tests: missing datum, overlapping bodies, unsupported joint type

**Note:** Brief specified Chrono 8.0 but codebase uses 9.0.1. API differences may require adjusting the compilation logic.

### 4. Epic 7.2 — Simulation protocol + streaming

**Deliverables:**
- `CompileMechanismCommand` → `CompilationResult` (success/errors, output channel manifest)
- `SimulationControlCommand` (PLAY/PAUSE/STEP/RESET) → `SimulationState` event
- `SimulationFrame` event: timestep index, body poses map, joint states
- Simulation thread: separate from WebSocket thread, mutex-protected state, backpressure (drop frames if client is slow)
- TS transport helpers: `createCompileCommand()`, `createSimControlCommand()`, frame parsing
- ADR for streaming contract (frame semantics, backpressure policy)

### 5. Epic 7.3 — Frontend playback controls

**Deliverables:**
- `useSimulationStore` Zustand store (state: idle/compiling/ready/running/paused, currentTime, fps)
- `SimulationToolbar` component: Compile, Play, Pause, Step, Reset buttons with state-driven enable/disable
- Hot-path viewport updates: `SimulationFrame` events bypass React, go directly to `SceneGraphManager.updateBodyTransform()` via imperative callback
- Keyboard shortcuts: Space = Play/Pause, R = Reset, Right Arrow = Step
- Disable mechanism editing (tree, inspector, creation tools) while simulation is running

## Medium-Term

### 6. Epic 8 — Output channels + charts

Depends on Epic 7 completion. Three prompts covering:
- Output channel descriptors and engine-side ring buffer streaming
- uplot-based chart panel with imperative canvas updates
- Timeline bar with scrub, playback speed, loop mode

### 7. Epic 9 — Hardening + packaging

Final MVP phase:
- Persistence hardening (missing asset recovery, cache invalidation, format versioning)
- Electron Forge packaging (`pnpm package:desktop`), engine binary bundling, CSP, startup diagnostics
- Sample projects, validation scenario runs, UX papercuts, documentation pass

## Cross-Cutting Concerns

### CI improvements

- **Windows CI:** Currently only Ubuntu smoke build. The primary dev environment is Windows/MSYS2. Consider adding a Windows runner with MSVC or MinGW.
- **Integration test coverage:** No E2E test covers the full import → render → select flow. Consider a headless Electron test or a protocol-level integration test that exercises the full command/event cycle.

### Build system

- `native/engine/CMakePresets.json` has `dev-mingw`, `dev-linux`, `msvc-dev` presets. The MSVC preset should be verified on current toolchain.
- Chrono 9.0.1 FetchContent adds significant build time. Consider caching the Chrono build artifacts in CI.

### Documentation debt

- Architecture docs should be refreshed after Epic 6.4 (save/load) and Epic 7 completion, per CLAUDE.md hygiene rules.
- `docs/architecture/generated/` files may be stale — run `pnpm prepare:agents` before any architecture review.
