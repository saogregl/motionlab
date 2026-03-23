# ADR-0012: Protocol v3 Multibody Contract

- Status: Accepted
- Date: 2026-03-22
- Decision makers: MotionLab team

## Context

The original multibody contract only exposed a narrow subset of rigid-body authoring and runtime data:

- joints were limited to a small set of types
- joint CRUD used partially-authored command payloads rather than full typed entities
- forces and motors were not first-class authored concepts
- runtime traces assumed joint-only outputs
- project files had no authored collections for loads or actuators

This blocked a broader multibody feature pass and leaked implementation limits into product-facing contracts.

## Decision

1. **Protocol v3 expands the authored multibody surface with first-class entities.**
   `motionlab.mechanism.Mechanism` now carries `joints`, `loads`, and `actuators` as durable authored collections.

2. **Joints are typed through `Joint.config`, not through ad-hoc scalar fields.**
   The wire supports typed configs for `REVOLUTE`, `PRISMATIC`, `FIXED`, `SPHERICAL`, `CYLINDRICAL`, `PLANAR`, `UNIVERSAL`, `DISTANCE`, `POINT_LINE`, and `POINT_PLANE`.

3. **Joint, load, and actuator CRUD use full-entity payloads.**
   Create/update commands carry full protobuf entities. Engine-side validation remains authoritative, and IDs remain engine-generated.

4. **Loads and actuators are product concepts, not backend class wrappers.**
   Protocol v3 includes:
   - datum-anchored `point_force` and `point_torque`
   - datum-pair `linear_spring_damper`
   - joint-targeted `revolute_motor` and `prismatic_motor`

5. **Body poses and non-pose channels are separated.**
   `SimulationFrame` remains the hot-path body-pose message. Joint/load/actuator runtime outputs are described and replayed through channel descriptors and `SimulationTrace`.

6. **Project files move to version 2.**
   Migration upgrades legacy joints into typed configs and preserves backward compatibility by rebuilding authored state through the engine-authoritative mechanism model.

## Consequences

- Positive: The product-facing contract can represent a broader rigid multibody system without exposing Chrono-native terminology.
- Positive: Runtime traces scale to multi-DOF joints and non-joint entities without special-case parsing.
- Positive: Save/load, compile, live traces, and scrub now share one entity model.
- Tradeoff: Protocol v3 is intentionally breaking for joint CRUD payloads and runtime channel naming.
- Tradeoff: Legacy `Joint.lower_limit`, `Joint.upper_limit`, and `SimulationFrame.joint_states` remain only as deprecated compatibility fields during the transition.

## Supersedes

This ADR supersedes the protocol details of:

- [ADR-0005](ADR-0005-joint-crud-contract.md) where joint updates were modeled as partial field updates
- [ADR-0006](ADR-0006-simulation-streaming-contract.md) where `SimulationFrame.joint_states` was treated as the primary non-pose runtime contract
- [ADR-0008](ADR-0008-output-channel-naming-and-typing.md) where joint coordinates were limited to coarse `position` and `velocity` channels
- [ADR-0009](ADR-0009-project-save-load-contract.md) for project file versioning of multibody authored entities
