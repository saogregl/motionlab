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
