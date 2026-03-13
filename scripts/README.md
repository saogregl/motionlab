# Scripts

## Bootstrap

Run the initial environment setup:

```bash
bash scripts/bootstrap.sh
```

This will:

1. Check prerequisites
2. Install workspace dependencies
3. Validate `VCPKG_ROOT`
4. Configure the native engine
5. Build the native engine
6. Build the JS and TS workspaces

## Docs and Repo Inventory

- `pnpm docs:generate`
  - refreshes generated docs under `docs/architecture/generated/`
- `pnpm docs:check`
  - verifies required docs and agent-readiness files are present

The generator scripts live under:

- `scripts/repo-map/`
- `scripts/dependency-graph/`
- `scripts/api-surface/`
- `scripts/docs-check/`

## Prerequisites

- Node.js >= 20
- pnpm >= 10
- CMake >= 3.25
- C++ compiler
- Git
- ninja is optional but recommended
