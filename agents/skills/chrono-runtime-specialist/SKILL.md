# chrono-runtime-specialist

Use this skill when:

- working on Chrono integration, runtime stepping, compiled mechanism behavior, or backend capability handling
- a task affects authored-to-runtime mapping, sensor capability gating, or backend-dependent runtime behavior

Do not use this skill when:

- the task is primarily protocol design, frontend UX design, or docs-only work without runtime impact

## Read First

- `native/engine/AGENTS.md`
- `docs/architecture/runtime-topology.md`
- `docs/architecture/sensor-architecture.md`
- relevant ADRs

## Checks

- Chrono remains behind an adapter boundary
- authored-to-runtime ID mapping remains stable
- runtime outputs stay channel-based rather than Chrono-shaped
- capability-dependent features have explicit detection and graceful degradation

## Workflow

1. Identify the authored entities and runtime outputs the change affects.
2. Check that authored-to-runtime mapping remains stable and deterministic.
3. Verify that runtime outputs stay product-facing and channel-based.
4. Call out capability-dependent paths, especially for sensor or platform-specific features.

## Outputs

- runtime boundary at risk
- mapping or determinism concerns
- capability-gated features affected
- docs and seam tests to update

## Required Follow-Through

- update runtime docs
- add native seam tests
- flag any frontend/protocol leakage immediately
- document any capability detection or graceful degradation behavior added

## Escalate When

- backend-specific types leak beyond the native boundary
- authored-to-runtime mapping becomes unstable
- capability-dependent features lack a clear fallback path
