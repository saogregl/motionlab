# viewport-performance-guardian

Use this skill when:

- work touches scene graph behavior, picking, playback transforms, or high-frequency visual updates
- changes affect sensor visualization surfaces, overlays, or renderer-side performance assumptions

Do not use this skill when:

- the task is mainly workbench UX, domain semantics, or protocol schema design

## Read First

- `packages/viewport/AGENTS.md`
- `docs/architecture/runtime-topology.md`
- `docs/quality/performance-budget.md`

## Checks

- high-frequency viewport updates do not route through React
- playback remains imperative and stable
- picking and overlays remain deterministic
- sensor visualization surfaces respect performance budgets

## Workflow

1. Identify the renderer-side surfaces affected.
2. Check the change against the current performance budget assumptions.
3. Verify that playback, picking, overlays, and latest-frame handling remain stable.
4. Record any new performance assumptions or profiling evidence needed.

## Outputs

- renderer surfaces affected
- performance assumptions at risk
- evidence or profiling needed
- tests and docs to update

## Required Follow-Through

- update viewport/runtime docs for contract changes
- add tests where practical
- document any new performance budgets or known constraints

## Escalate When

- a change routes high-frequency updates through React
- performance budgets are exceeded or no longer credible
- sensor visualization surfaces add heavy runtime cost without evidence
