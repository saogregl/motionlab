# Native Engine Guide

`native/engine` is the authoritative native runtime boundary.

## Responsibilities

- native runtime bootstrap
- future geometry/CAD processing
- simulation compilation and execution
- runtime output production
- native tests and protocol seam validation

## Rules

- Keep backend-specific implementation details behind the native boundary.
- Do not leak backend-specific types into frontend-facing or protocol-facing contracts.
- Prefer user-meaningful diagnostics over raw backend failure text.
- Protect deterministic IDs and authored/runtime mapping.
- Keep runtime outputs aligned with stable channel semantics and live/replay contracts.
- Handle capability-dependent features through explicit detection and graceful degradation.
- Update architecture docs when native ownership or runtime topology changes.

## Required Checks

- `cmake --preset dev`
- `cmake --build build/dev`
- `ctest --preset dev`

Update `docs/architecture/runtime-topology.md`, `docs/architecture/results-architecture.md`, and ADRs for architecture-sensitive native changes.
