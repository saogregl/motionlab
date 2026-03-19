# Frontend Guide

`@motionlab/frontend` owns product-facing React state, workbench modules, and inspector flows.

## Rules

- Keep React on the low-frequency authoring and inspection path.
- Do not move viewport frame-loop or dense runtime updates into React state.
- Depend on stable protocol and domain contracts, not backend-specific transport assumptions.
- Put reusable primitives in `@motionlab/ui`, not here.
- Keep authored model state separate from scenario config, run and replay state, and live results state.
- Prefer client and runtime abstractions over parsing transport payloads directly in workbench components.

## Required Checks

- `pnpm --filter @motionlab/frontend typecheck`
- `pnpm --filter @motionlab/frontend test`

Update `docs/architecture/system-overview.md`, `docs/architecture/repo-map.md`, or relevant domain docs if frontend ownership changes.

## Stores

- **simulation.ts** — Sim lifecycle state, `simTime`, `stepCount`, `maxSimTime` (high-water mark for duration), `loopEnabled`, channel descriptors.
- **traces.ts** — Channel metadata and per-channel trace sample arrays. Bounded 60s rolling window. Zustand store for chart data pump subscription.
- **body-poses.ts** — Module-level `Map<string, BodyPose>` for hot-path frame updates. **Not Zustand** — avoids React re-renders on every simulation frame. Read imperatively by inspectors using `simTime` as refresh trigger.
- **ui-layout.ts** — Bottom dock expanded/activeTab state. Supports `toggleChartPanel()` for Ctrl+Shift+C shortcut.
- **mechanism.ts** — Authored model state (bodies, datums, joints).
- **selection.ts** — Selected entity IDs.

## Inspector Live Values Pattern

When `simState !== 'idle'`, inspectors show live simulation data:

- **JointInspector** — Reads trace store for `joint/{id}/position` and `joint/{id}/velocity`, binary-searches for nearest sample to `simTime`.
- **BodyInspector** — Reads `getBodyPose(bodyId)` from the module-level body-poses cache.
- **SimulationMetadataSection** — Shown in EntityInspector below entity-specific panels. Displays duration, step count, timestep, solver, and measured FPS.

## Dependency Notes

- **Zustand** (`zustand`) is used for state management across simulation, trace, mechanism, selection, and UI layout stores.
