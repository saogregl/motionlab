# Viewport Guide

`@motionlab/viewport` owns Three.js scene behavior, playback transforms, picking, overlays, and sensor visualization surfaces.

## Rules

- Keep playback imperative and renderer-focused.
- Do not make Three.js or R3F the source of truth for authored mechanism state.
- Coordinate with protocol/runtime docs when adding live data dependencies.
- Optimize for deterministic picking and stable engineering overlays.
- Keep scene graph identity stable for authored and runtime entities.
- Keep sensor visualization and latest-frame handling data-contract driven rather than business-rule driven.
- Do not turn viewport state into archival or replay-owned storage.
- Prefer demand-driven rendering with explicit invalidation over an always-on frame loop.

## Required Checks

- `pnpm --filter @motionlab/viewport typecheck`
- `pnpm --filter @motionlab/viewport test`

Update `docs/architecture/runtime-topology.md`, `docs/architecture/results-architecture.md`, or sensor docs when viewport data contracts change.
