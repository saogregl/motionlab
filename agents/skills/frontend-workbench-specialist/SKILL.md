# frontend-workbench-specialist

Use this skill when:

- working on inspectors, modeling flows, scenario editing, run playback controls, or sensor-facing UX
- changing workbench behavior that spans authored state, scenario config, or run and replay surfaces

Do not use this skill when:

- the task is primarily viewport frame-loop behavior, renderer performance work, or protocol design

## Read First

- `packages/frontend/AGENTS.md`
- relevant architecture docs
- relevant domain docs
- issue brief or flow context

## Checks

- authored model state stays separate from scenario, run and replay, and live results state
- workbench components depend on client abstractions rather than raw transport payloads
- dense runtime data stays out of general React state

## Workflow

1. Identify which user flow is changing and which state families it touches.
2. Keep React state limited to authoring and product UX concerns.
3. Route dense runtime data to the viewport or dedicated runtime stores, not general React state.
4. Update flow-facing docs when user behavior changes.

## Outputs

- user flow affected
- state families affected
- abstraction boundaries that must stay intact
- tests and docs to update

## Required Follow-Through

- update workbench-facing docs if user flow changes
- add or update TS-side tests
- note any protocol or runtime dependencies introduced

## Escalate When

- workbench code starts parsing transport payloads directly
- authored and live or replay state become conflated
- a UI flow change requires new domain or protocol semantics
