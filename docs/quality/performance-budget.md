# Performance Budget

Performance decisions are product decisions for MotionLab.

## Guardrails

- React does not own frame-loop playback.
- Large geometry and dense runtime data should not bounce through avoidable copies.
- Runtime channels and results buffers must remain bounded and query-friendly.
- Viewport work should preserve deterministic picking and stable overlays.

## Review Triggers

Revisit performance assumptions when introducing:

- new high-frequency subscriptions
- large image or blob payloads
- new replay retention behavior
- heavy viewport overlays
