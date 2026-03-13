# Protocol Guide

`@motionlab/protocol` is the TypeScript-side contract surface for transport and versioning.

## Rules

- Treat `schemas/` as the schema source of truth.
- Treat generated bindings as read-only artifacts.
- Keep protocol types backend-agnostic and versioned deliberately.
- Never let product-facing protocol mirror Chrono classes or native implementation details.
- Any breaking wire change must be explicit in docs and ADRs when the contract is long-lived.
- Update golden samples, wire examples, or seam tests when public contracts change.
- Add migration notes when long-lived compatibility expectations change.

## Required Checks

- `pnpm --filter @motionlab/protocol typecheck`
- `pnpm --filter @motionlab/protocol test`

Always update `docs/architecture/protocol-overview.md` and relevant ADRs when public contracts change.
