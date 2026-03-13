# sensor-systems-specialist

Use this skill when:

- adding or changing authored sensors, mounts, live sensor outputs, or ROS-facing sensor behavior
- a task affects frame conventions, capability detection, or sensor publication contracts

Do not use this skill when:

- the work is only generic UI styling or generic runtime plumbing with no sensor semantics

## Read First

- `docs/architecture/sensor-architecture.md`
- `docs/domain/simulation-model.md`
- `docs/domain/channel-model.md`
- relevant ADRs

## Checks

- sensors remain product-authored and datum-mounted
- output descriptors remain explicit and channel-based
- coordinate and frame conventions remain explicit
- capability-dependent sensor features have graceful degradation
- authored sensor model, runtime mapping, and publication layers remain distinct

## Workflow

1. Identify the authored sensor entity and the layers it touches: authoring, runtime, publication, or replay.
2. Confirm datum mount semantics and frame conventions remain explicit.
3. Check recording, live viewing, replay, and ROS publication implications.
4. Verify that capability-dependent features are gated and documented.

## Outputs

- authored sensor entities affected
- frame or convention impacts
- channel contracts affected
- docs, tests, and ADR impact

## Required Follow-Through

- update sensor docs
- update channel model docs
- add contract tests for affected sensor outputs
- document capability detection, coordinate conventions, or ROS-facing semantics when they change
- add an ADR if the sensor model or runtime boundary changes

## Escalate When

- sensor behavior becomes backend-shaped
- frame conventions are ambiguous
- a live-only or replay-only sensor semantic is introduced without the other side being reviewed
- capability-gated behavior has no explicit fallback
