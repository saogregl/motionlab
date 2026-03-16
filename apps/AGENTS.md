# Apps Guide

This subtree contains application entrypoints, not core domain authority.

## Responsibilities

- `apps/desktop`: Electron shell, preload surface, process supervision
- `apps/web`: **Dev-mode only** — browser entry for shared frontend development (hot reload without Electron). Not an MVP deployment target. Requires a mock/stub engine connection to be useful; without one it renders the frontend shell with no engine backing. Do not invest in web-specific features or test web parity until after MVP ships.

## Rules

- Keep app code thin. Product logic belongs in packages, not in the app entrypoints.
- `apps/desktop` may supervise the native engine but must not become a relay for hot-path simulation data.
- Shared user-facing behavior should be implemented in `@motionlab/frontend` unless it is truly app-specific.
- Treat app-specific code as shell and integration code, not product domain ownership.

## Required Checks

- `pnpm --filter @motionlab/desktop typecheck`
- `pnpm --filter @motionlab/web typecheck`

Update `docs/architecture/runtime-topology.md` if app/runtime responsibilities change.

## Known Quirks

- **`apps/desktop/.npmrc`** uses `node-linker=hoisted` because Electron Forge requires hoisted `node_modules` layout.
- **`apps/desktop`** intentionally omits `"type": "module"` — Electron's main process requires CommonJS-compatible module resolution.
- **Electron Forge build**: The desktop app uses `@electron-forge/plugin-vite` for renderer bundling. The Forge config lives in the Vite plugin setup, not a separate `forge.config.js`.
