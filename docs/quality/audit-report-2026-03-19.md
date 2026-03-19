# Architecture & Code Quality Audit — 2026-03-19

> **Overall verdict: No critical issues.** The architecture is fundamentally sound. All findings are medium or low severity. The codebase is well-structured for pre-MVP stage.

---

## Principle Compliance

### P1: Native Engine Is Authoritative — PASS

- Frontend stores (`packages/frontend/src/stores/mechanism.ts`, `simulation.ts`) hold pure data projections; no physics computations occur in TypeScript.
- Viewport (`packages/viewport/src/scene-graph.ts`) is an imperative Babylon.js manager; no physics objects created.
- Entity IDs (UUIDv7) originate from the engine only; the frontend never mints them.
- Mass properties are shipped immutable from engine import results.

### P2: No Backend Leaks Through Protocol — PASS

- Zero references to `ChBody`, `ChLink`, `ChSystem`, `ChVector` in `packages/`, `schemas/`, or `apps/`.
- Protocol uses product-domain naming: Body, Datum, Joint, MassProperties.
- Chrono types are fully contained within `native/engine/src/`.

### P3: React Is Not the Hot Path — PASS

- `connection.ts:379-398` — the `simulationFrame` handler calls `sceneGraphManager.updateBodyTransform()` directly, bypassing React.
- `sceneGraphManager` is a module-level variable registered via `registerSceneGraph()`, not a React ref or hook.
- Trace store uses Zustand `set()` with a rolling 60s window — subscribed by chart components, not the frame loop.

### P4: Sensors Are First-Class Authored Entities — NOT YET IMPLEMENTED

**Severity: low**

- `OutputChannelDescriptor` exists in the protocol for output channels.
- ADR-0002 establishes the sensor contract; no CRUD operations in the protocol yet.
- Expected at current project stage — tracked for future epics.

### P5: Simulation Runs Are Immutable Artifacts — PARTIAL

**Severity: medium**

- ADR-0003 establishes the principle, but no formal "run" entity exists yet.
- Frames are streamed transiently; the trace store has a 60s rolling window.
- The ring buffer in the engine provides scrub lookback but is also bounded.
- No mechanism to capture start-to-stop as a named, queryable, immutable artifact.
- Planned for a future epic.

**Recommendation:** When implementing the run entity, ensure it captures: start time, end time, mechanism snapshot at start, all frame data, and channel metadata. Mark it read-only after completion.

### P6: Protocol Is a Durable Contract — PASS

- Versioned handshake with compatibility gate.
- Clean `oneof` Command/Event envelope pattern.
- All breaking changes tracked via `PROTOCOL_VERSION` in `packages/protocol/src/version.ts`.

---

## Code Quality Findings

### CQ-1: transport.cpp is monolithic (~1287 lines) — medium

**File:** `native/engine/src/transport.cpp`

The file contains all command handlers, the simulation loop, frame/trace sending, scrub logic, and project save/load in one `Impl` struct.

**Recommendation:** Extract into focused modules:
- `sim_loop.cpp` — simulation stepping and frame dispatch
- `command_handlers.cpp` — command routing and handler implementations
- `frame_sender.cpp` — frame serialization and WebSocket sending

### CQ-2: active_ws pointer thread safety — medium

**File:** `native/engine/src/transport.cpp` (~line 118)

The raw `active_ws` pointer is set/cleared under `conn_mutex` but read by the simulation thread without holding the lock. Currently safe because `stop_sim_thread()` joins before the pointer is cleared, but this invariant is implicit and fragile.

**Recommendation:** Either:
- Document the invariant with a prominent comment explaining the safety guarantee, or
- Switch to `std::shared_ptr<ix::WebSocket>` to make the lifetime explicit.

### CQ-3: Scrub pause uses sleep hack — low

**File:** `native/engine/src/transport.cpp` (~line 1145)

Uses `std::this_thread::sleep_for(10ms)` instead of a condition variable to wait for state changes during scrub.

**Recommendation:** Replace with `std::condition_variable` wait with predicate for proper synchronization.

### CQ-4: JointEntry uses magic int for type — low

**File:** `native/engine/src/mechanism_state.h` (~line 46)

```cpp
int type; // 1=REVOLUTE, 2=PRISMATIC, 3=FIXED
```

The proto already provides `mechanism::JointType` enum.

**Recommendation:** Use `mechanism::JointType` directly instead of a raw `int`.

### CQ-5: Dev-mode engine path resolution — low

**File:** `apps/desktop/src/engine-supervisor.ts` (lines 38-54)

Walks up 6 directories looking for `pnpm-workspace.yaml`, then tries 4 build directory names. Acceptable for dev mode.

**Recommendation:** Document expected binary placement for production builds.

### CQ-6: Engine stdout parsing for readiness — low

**File:** `apps/desktop/src/engine-supervisor.ts` (~line 143)

Matches `[ENGINE] status=ready` string from stdout; fragile if log format changes. Mitigated by structured format on the engine side.

**Recommendation:** No immediate action needed; consider a structured readiness signal (e.g., writing to a pipe or file) for production.

---

## Doc-Code Drift Findings

### D-1: testing-strategy.md claimed no tests exist — FIXED

**File:** `docs/quality/testing-strategy.md` (line 3)

Previously stated: "No test runner or test files exist yet."

**Reality:** 9 test files exist across 3 packages:
- `packages/protocol/src/__tests__/roundtrip.test.ts`
- `packages/frontend/src/__tests__/datum-naming.test.ts`
- `packages/frontend/src/__tests__/datum-face-pick.test.ts`
- `packages/frontend/src/__tests__/mechanism-store.test.ts`
- `packages/frontend/src/__tests__/simulation-store.test.ts`
- `packages/frontend/src/__tests__/selection-store.test.ts`
- `packages/viewport/src/__tests__/datum-pose.test.ts`
- `packages/viewport/src/__tests__/body-geometry-index.test.ts`
- `packages/viewport/src/__tests__/scene-graph-manager.test.ts`

**Action taken:** Updated the status banner to reflect current test coverage.

### D-2: TimelinePanel said scrub not supported by engine — FIXED

**File:** `packages/frontend/src/components/TimelinePanel.tsx` (line 44-46)

Previously stated: "Seek not yet supported by engine — no-op placeholder"

**Reality:** The engine implements scrub in `transport.cpp`, and `sendScrub()` is exported from `connection.ts:678`.

**Action taken:** Wired `handleSeek` to call `sendScrub(time)`.

---

## Summary Table

| ID | Category | Severity | Status |
|----|----------|----------|--------|
| P1 | Principle | — | PASS |
| P2 | Principle | — | PASS |
| P3 | Principle | — | PASS |
| P4 | Principle | low | Not yet implemented (expected) |
| P5 | Principle | medium | Partial — planned for future epic |
| P6 | Principle | — | PASS |
| CQ-1 | Code quality | medium | Recommendation logged |
| CQ-2 | Code quality | medium | Recommendation logged |
| CQ-3 | Code quality | low | Recommendation logged |
| CQ-4 | Code quality | low | Recommendation logged |
| CQ-5 | Code quality | low | Recommendation logged |
| CQ-6 | Code quality | low | Recommendation logged |
| D-1 | Doc drift | medium | **Fixed** |
| D-2 | Doc drift | low | **Fixed** |
