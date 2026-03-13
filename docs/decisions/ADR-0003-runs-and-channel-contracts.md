# ADR-0003: Runs Are Immutable and Channels Unify Live and Replay

- Status: Accepted
- Date: 2026-03-13
- Decision makers: MotionLab maintainers

## Context

Simulation outputs need to remain queryable, recordable, and replayable without forcing the frontend to understand multiple incompatible data models.

## Decision

Treat simulation runs as immutable artifacts. Expose runtime outputs through product-level channel descriptors and preserve one logical channel model across live mode and replay mode.

## Consequences

- results storage can vary by data family without changing the consumer contract
- frontend tooling can work against one logical output model
- storage and query layers must stay aligned with documented channel semantics
