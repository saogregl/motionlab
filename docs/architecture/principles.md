# Architecture Principles

These principles are binding unless a new ADR deliberately changes them.

## Product and Runtime

- The native engine is the computational authority.
- The frontend is the authoring, inspection, and visualization surface.
- Electron is a shell and supervisor, not the hot-path simulation bus.
- React is not the frame loop.
- Imported geometry and solver/runtime state are separate assets.

## Contracts and Boundaries

- The protocol and mechanism model are durable contracts, not dumps of backend classes.
- Backend-specific concepts, especially Chrono types, do not leak into product-facing contracts.
- Sensors are first-class product entities mounted to authored datums.
- Simulation runs are immutable artifacts.
- Live and replay outputs share one logical channel model.

## Process and Quality

- The repository is the source of durable technical truth.
- Architecture-sensitive changes are incomplete until docs and seam tests are updated.
- Long-lived boundary changes require ADRs.
- Generated inventories belong in `docs/architecture/generated/`; intent belongs in hand-maintained docs.
