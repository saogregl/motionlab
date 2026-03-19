# AI Agent Task Prompts — 2026-03-19

Six independent, well-scoped tasks suitable for state-of-the-art coding agents.
Each task references the architecture docs and briefs it depends on.

---

## Task 1: Save/Load Project Persistence (Epic 6, Prompt 4)

**Priority:** Critical — blocks all real user workflows.

**Context files to read first:**
- `docs/architecture/index.md`, `docs/architecture/principles.md`
- `docs/briefs/epic-6-prompts.md` (Prompt 4)
- `schemas/protocol/transport.proto` (SaveProject / LoadProject commands already defined)
- `schemas/mechanism/mechanism.proto` (Mechanism IR — the serialization payload)
- `native/engine/src/mechanism_state.cpp` (in-memory mechanism model)
- `native/engine/src/transport.cpp` (command dispatch switch)
- `packages/frontend/src/engine/connection.ts` (frontend command senders)
- `packages/frontend/src/stores/mechanism.ts` (frontend mechanism store)
- `apps/desktop/src/preload.ts` (existing `openFileDialog` IPC)
- `docs/decisions/` (ADR-0004, ADR-0005 for CRUD contract patterns)

**Task:**

Implement end-to-end project save and load:

1. **Schema** — Add a `ProjectFile` message wrapping `Mechanism` + `ProjectMetadata` (name, created/modified timestamps, protocol version) in `schemas/mechanism/mechanism.proto`. Run `pnpm generate:proto` to regenerate bindings.

2. **Engine** — In `native/engine/src/transport.cpp`, handle `SaveProject` and `LoadProject` commands:
   - `SaveProject`: Serialize the current `MechanismState` to a `ProjectFile` protobuf, write to the file path provided in the command, and reply with a success/failure event.
   - `LoadProject`: Read and deserialize a `ProjectFile` from disk, replace the current `MechanismState`, and emit events that reconstruct the frontend state (body list, datums, joints).

3. **Electron IPC** — Extend the preload bridge in `apps/desktop/src/preload.ts` to expose `showSaveDialog(defaultPath)` alongside the existing `openFileDialog`. Wire both into menu items (File > Save, File > Open) in the Electron main process.

4. **Frontend** — Add `sendSaveProject(path)` and `sendLoadProject(path)` to `packages/frontend/src/engine/connection.ts`. Add corresponding UI triggers (menu bar or command palette entries). On `LoadProject` result, clear and repopulate the mechanism store.

5. **Seam test** — Add a protocol round-trip test in `packages/protocol/src/__tests__/` that serializes a `ProjectFile`, deserializes it, and asserts field-level equality. Add a native test that exercises save→load→verify on a mechanism with bodies, datums, and joints.

**Acceptance criteria:**
- A `.motionlab` file can be saved and reopened, restoring all bodies, datums, and joints.
- The protocol version in the file header is validated on load; mismatches produce a user-visible diagnostic.
- File dialogs use platform-native UI (Electron `dialog` module).

---

## Task 2: Wire Timeline Scrubber to Engine Ring Buffer (Epic 7.3)

**Priority:** High — playback controls exist visually but scrubbing is a no-op.

**Context files to read first:**
- `docs/architecture/chrono-runtime-architecture.md`
- `docs/architecture/results-architecture.md`
- `docs/decisions/adr-0006-simulation-streaming.md`
- `docs/decisions/adr-0008-output-channel-naming.md`
- `native/engine/src/ring_buffer.cpp` (60-second trace retention, O(log n) time lookup)
- `native/engine/src/transport.cpp` (simulation thread, frame batching)
- `schemas/protocol/transport.proto` (SimulationFrame, SimulationControl)
- `packages/frontend/src/components/TimelinePanel.tsx` (scrubber UI — `handleSeek` is currently a no-op)
- `packages/frontend/src/stores/simulation.ts` (simulation state machine)
- `packages/frontend/src/engine/connection.ts` (command senders)

**Task:**

Wire the timeline scrubber so the user can drag to a time and see the mechanism snap to that pose:

1. **Protocol** — Add a `ScrubCommand` (or reuse `SimulationControl` with a `SCRUB` action + `target_time` field) in `transport.proto`. Add a `ScrubResult` event carrying the interpolated `SimulationFrame` at the requested time. Regenerate bindings.

2. **Engine** — Handle the scrub command in `transport.cpp`. Query `RingBuffer::queryAt(time)` to retrieve the nearest frame. Respond with the frame as a `ScrubResult` event. Scrubbing should work in both `PAUSED` and `COMPLETED` simulation states.

3. **Frontend** — In `TimelinePanel.tsx`, replace the no-op `handleSeek` with a call to a new `sendScrubCommand(time)` in `connection.ts`. On receiving the `ScrubResult`, update body transforms via the existing `SceneGraphManager.updateBodyTransform()` path (bypassing React, per architecture rules).

4. **UX details** — While dragging the scrubber, throttle scrub commands to ~30 Hz to avoid flooding the WebSocket. Show the current time numerically next to the scrubber handle. Disable scrubbing when simulation state is `IDLE` or `COMPILING`.

**Acceptance criteria:**
- Dragging the timeline scrubber in paused state snaps the 3D viewport to the corresponding simulation pose.
- Scrubbing does not go through React state — transforms are applied imperatively via SceneGraphManager.
- No more than 30 scrub commands/sec are sent regardless of mouse movement rate.

---

## Task 3: Seam Test Infrastructure + Contract Coverage

**Priority:** High — currently all workspace `test` scripts are placeholders with zero seam coverage.

**Context files to read first:**
- `docs/quality/testing-strategy.md` (the testing philosophy and required seam coverage)
- `docs/architecture/principles.md` (contracts and boundaries)
- `packages/protocol/src/__tests__/roundtrip.test.ts` (existing protocol round-trip tests — use as pattern)
- `packages/frontend/src/__tests__/` (existing unit tests)
- `packages/viewport/src/__tests__/` (existing unit tests)
- `native/engine/tests/` (existing CTest tests)
- Root `package.json` and `turbo.json` (test orchestration)
- `docs/decisions/` (all ADRs — each contract decision implies a test)

**Task:**

Stand up proper test infrastructure and add contract tests at every integration seam:

1. **Fix test scripts** — Ensure `pnpm test` in every workspace actually runs Vitest (frontend, protocol, viewport, ui). Verify Turbo orchestration runs them all. Ensure `pnpm test:native` runs CTest and reports results.

2. **Protocol contract tests** — For each Command/Event pair in `transport.proto`, add a round-trip test that constructs the command, serializes to binary, deserializes, and asserts field-level equality. Cover: all Datum CRUD, all Joint CRUD, CompileMechanism, SimulationControl, ImportAsset, SaveProject, LoadProject.

3. **Store contract tests** — In `packages/frontend/src/__tests__/`, add tests for the mechanism store that verify:
   - Adding/removing/renaming bodies, datums, joints updates state correctly.
   - Joint creation validates that both datum endpoints exist.
   - Simulation state machine transitions are valid (idle→compiling→running→paused→idle).

4. **Viewport contract tests** — In `packages/viewport/src/__tests__/`, add tests that verify:
   - `SceneGraphManager` correctly maps body IDs to Babylon nodes.
   - `updateBodyTransform()` applies pose data without creating new nodes.
   - Picking results encode bodyId + faceIndex deterministically.

5. **CI integration** — Ensure the test commands work in the existing CI pipeline. Add a summary step that reports pass/fail counts.

**Acceptance criteria:**
- `pnpm test` runs all workspace tests and reports results.
- Every Command/Event pair in the protocol has a round-trip serialization test.
- Store state transitions are covered.
- No tests are skipped or marked `.only`.

---

## Task 4: Output Channel Frontend Wiring (Epic 8, Prompt 1)

**Priority:** Medium — the engine ring buffer and channel descriptors exist but the frontend doesn't consume them.

**Context files to read first:**
- `docs/briefs/epic-8-prompts.md`
- `docs/architecture/results-architecture.md`
- `docs/architecture/chrono-runtime-architecture.md`
- `docs/decisions/adr-0008-output-channel-naming.md`
- `docs/decisions/adr-0003-runs-and-channels.md`
- `native/engine/src/ring_buffer.cpp`
- `schemas/protocol/transport.proto` (CompilationResult with channel descriptors, SimulationFrame)
- `packages/frontend/src/stores/simulation.ts`
- `packages/frontend/src/engine/connection.ts`
- `packages/frontend/src/components/TimelinePanel.tsx` (chart tab is placeholder)

**Task:**

Build the frontend data pipeline from `SimulationFrame` events to a live-updating chart:

1. **Trace store** — Create a new Zustand store (`packages/frontend/src/stores/trace.ts`) that:
   - Receives channel descriptors from `CompilationResult` events and stores them.
   - Accumulates `SimulationFrame` data into typed arrays (Float64Array) per channel, keyed by channel ID (e.g., `body/<id>/position.x`).
   - Exposes a `getChannelData(channelId): { times: Float64Array, values: Float64Array }` selector.
   - Clears on simulation reset.

2. **Chart component** — Create a `TraceChart.tsx` component using uPlot (already a dependency) that:
   - Accepts an array of channel IDs to plot.
   - Reads data from the trace store reactively.
   - Renders a time-series line chart with labeled axes.
   - Updates incrementally as new frames arrive (append, don't re-render all).

3. **Integration** — Wire `TraceChart` into the "Charts" tab of `TimelinePanel.tsx`. On compilation, auto-select the first 2-3 output channels for display. Allow the user to toggle channels on/off via checkboxes in the chart legend.

4. **Performance** — Use `requestAnimationFrame` coalescing so chart updates happen at display refresh rate, not at frame event rate. Keep typed arrays pre-allocated and grow by doubling.

**Acceptance criteria:**
- After compiling and running a simulation, at least body position channels appear as live-updating line charts.
- Chart rendering does not block the viewport frame loop.
- Channels are labeled with human-readable names per ADR-0008 naming convention.
- Resetting the simulation clears the chart data.

---

## Task 5: Electron Engine Supervision Hardening

**Priority:** Medium — the engine spawns but supervision is fragile and not production-ready.

**Context files to read first:**
- `docs/architecture/runtime-topology.md`
- `docs/briefs/epic-1-prompts.md` (Prompt 2 — Electron supervision)
- `apps/desktop/src/main.ts` (Electron main process)
- `apps/desktop/src/preload.ts` (IPC bridge)
- `apps/desktop/src/mock-engine.mjs` (dev fallback)
- `apps/desktop/forge.config.ts` (extraResource is empty — engine binary not packaged)
- `apps/AGENTS.md`
- `native/engine/src/transport.cpp` (engine startup: port binding, session token, signal handling)

**Task:**

Make engine lifecycle management robust for development and production:

1. **Port allocation** — In the Electron main process, find an available port dynamically (e.g., `net.createServer().listen(0)` then close) before spawning the engine. Pass the port via `--port` flag. Remove any hardcoded port assumptions.

2. **Health monitoring** — After spawning the engine, watch for the `ready` status line on stdout. Implement a startup timeout (10 seconds) — if the engine doesn't report ready, kill it, show an error dialog, and offer retry. Monitor the child process `exit` event and attempt automatic restart (up to 3 times) with exponential backoff.

3. **Graceful shutdown** — On Electron `will-quit`, send SIGTERM to the engine process and wait up to 5 seconds for exit before force-killing. Ensure the WebSocket connection is closed before the engine is terminated to avoid dangling connections.

4. **Engine binary resolution** — Implement a `resolveEngineBinary()` function that checks:
   - In development: `native/engine/build/dev/motionlab-engine` (or `.exe` on Windows)
   - In production (packaged): `process.resourcesPath + '/motionlab-engine'`
   - Fallback: the mock engine (`mock-engine.mjs`) with a console warning
   Update `forge.config.ts` `extraResource` to include the engine binary path for packaging.

5. **Session token** — Generate a cryptographically random session token in Electron main, pass it to the engine via `--session-token`, and pass it to the renderer via the preload bridge's `getEngineEndpoint()`. This ensures only the owning Electron window can connect.

**Acceptance criteria:**
- `pnpm dev:desktop` starts the engine on a random available port with a unique session token.
- If the engine crashes, it auto-restarts up to 3 times with user notification.
- Closing the Electron window gracefully shuts down the engine process.
- The mock engine fallback works when no native binary is available.

---

## Task 6: Architecture and Code Quality Audit

**Priority:** Medium — pre-MVP code is accumulating; a review pass prevents debt from compounding.

**Context files to read first:**
- `docs/architecture/principles.md` (the 7 non-negotiable rules)
- `docs/architecture/protocol-overview.md`
- All `AGENTS.md` files (root + subtree)
- `docs/decisions/` (all 8 ADRs)
- `docs/quality/testing-strategy.md`
- `docs/quality/lint-and-format.md`

**Task:**

Perform a comprehensive audit of the codebase against the documented architecture principles. For each finding, either fix it directly or file it as a clearly described issue. Organize your report by principle.

1. **"Native engine is authoritative"** — Verify that no frontend code computes geometry, mass properties, or simulation state. Check that the viewport never creates its own physics objects. Verify that body/datum/joint IDs originate from the engine.

2. **"No backend leaks through protocol"** — Search for any references to Chrono types (ChBody, ChLink, ChSystem, etc.) in `packages/`, `schemas/`, or `apps/`. Verify that protobuf messages use product-domain naming (e.g., "Joint" not "ChLink", "Body" not "ChBody").

3. **"React is not the hot path"** — Trace the simulation frame update path from WebSocket message → store → viewport. Confirm that body transform updates during playback bypass React state and go directly to SceneGraphManager. Flag any `useState`/`useEffect` that runs per simulation frame.

4. **"Sensors are first-class authored entities"** — Review the protocol and stores for any sensor-related code that treats sensors as backend runtime objects instead of authored entities. (Sensors may not be implemented yet; if so, verify the protocol schema is ready for them.)

5. **"Simulation runs are immutable artifacts"** — Check that simulation state transitions don't allow mutation of completed run data. Verify the store doesn't overwrite prior run results.

6. **Unused code and dead exports** — Identify any exported functions, types, or components that have zero consumers. Flag unused dependencies in `package.json` files.

7. **Doc-code drift** — Compare architecture docs against actual implementation. Flag any docs that describe features not yet implemented as if they were, or implemented features not reflected in docs.

**Deliverable:** A markdown report at `docs/quality/audit-report-YYYY-MM-DD.md` with findings organized by principle, severity (critical/medium/low), and recommended action. Fix any critical findings directly in the same PR.
