# Apps Guide

This subtree contains application entrypoints, not core domain authority.

## Responsibilities

- `apps/desktop`: Electron shell, preload surface, process supervision
- `apps/web`: browser entry for shared frontend

## Rules

- Keep app code thin. Product logic belongs in packages, not in the app entrypoints.
- `apps/desktop` may supervise the native engine but must not become a relay for hot-path simulation data.
- Shared user-facing behavior should be implemented in `@motionlab/frontend` unless it is truly app-specific.
- Treat app-specific code as shell and integration code, not product domain ownership.

## Required Checks

- `pnpm --filter @motionlab/desktop typecheck`
- `pnpm --filter @motionlab/web typecheck`

Update `docs/architecture/runtime-topology.md` if app/runtime responsibilities change.
