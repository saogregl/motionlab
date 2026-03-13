# Protocol Overview

`schemas/` is the schema source of truth. `packages/protocol` is the TypeScript-side contract layer.

## Contract Rules

- Public protocol messages must stay backend-agnostic.
- Versioning is deliberate. Breaking contract changes are explicit and documented.
- The protocol should support control, live data, and query/replay semantics as distinct concerns.
- Product-level channel descriptors are the durable way to describe runtime outputs.

## Near-Term Expectations

- schema changes update both docs and generated inventories
- protocol changes update tests at the contract seam
- long-lived contract direction changes require ADRs
