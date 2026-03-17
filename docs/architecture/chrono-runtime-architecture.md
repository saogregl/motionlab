# Chrono Runtime Architecture

This document captures the target architecture for Chrono integration inside `native/engine`. Implementation may land incrementally, but the boundary between product/runtime concepts and Chrono-specific mechanics is durable.

See also:

- [`principles.md`](./principles.md)
- [`runtime-topology.md`](./runtime-topology.md)
- [`sensor-architecture.md`](./sensor-architecture.md)
- [`results-architecture.md`](./results-architecture.md)
- [`protocol-overview.md`](./protocol-overview.md)

## Role

Chrono is a backend runtime adapter, not the application domain model.

The Chrono-facing layer owns:

- compilation from product model and scenario artifacts into runtime-ready specs
- Chrono system creation and backend configuration
- instantiation of bodies, joints, actuators, and sensor backends
- simulation stepping and runtime lifecycle
- extraction of normalized runtime outputs
- backend capability detection and backend-specific diagnostics
- optional internal ROS integration where useful

It must not own:

- durable product authoring semantics
- project persistence format
- frontend interaction semantics
- replay storage semantics
- public protocol shape

## Layering

The native side should keep four explicit layers around Chrono.

### Product/Runtime Compile Layer

Inputs:

- `ModelDefinition`
- `ScenarioDefinition`

Outputs:

- `CompiledSimulationSpec`

This layer resolves body instances, datum transforms, joint endpoints, actuator bindings, sensor mounts, enabled outputs, solver policy, and recording/publication policy.

Rule: compile once, execute many. UI code does not mutate Chrono objects directly.

### Chrono Adapter Layer

This is the only layer that knows concrete Chrono classes such as `ChSystem*`, `ChBody*`, `ChLink*`, timestepper and solver types, and `chrono::sensor::*`.

Rule: Chrono classes never cross the adapter boundary.

### Runtime Execution Layer

This layer owns runtime session lifecycle, stepping, pause/resume/reset behavior, output extraction scheduling, live publication, and diagnostics.

Rule: one run equals one runtime instance. Sessions are disposable, while run artifacts remain immutable.

### Results Bridge Layer

This layer converts backend state into normalized channel outputs and product-shaped events.

Rule: outputs are product-shaped rather than Chrono-shaped.

## Runtime Lifecycle

The runtime lifecycle is:

1. `compile`
2. `instantiate`
3. `initialize`
4. `run`
5. `pause`
6. `reset`
7. `finalize`

Reset should reconstruct from the compiled specification rather than attempting mutation-heavy rollback of an existing backend instance.

## System Construction Policy

Chrono system selection and backend mechanics remain internal policy.

- The compile layer chooses contact and solver policy in product terms.
- The adapter maps that policy to concrete Chrono system, timestepper, solver, iteration, tolerance, and collision settings.
- Frontend or protocol layers must not toggle raw Chrono modes directly.

The engine truth is a fixed simulation step. Publish cadence, recording cadence, and sensor update cadence are separate policies layered on top of that fixed-step runtime.

## Output Normalization

Nothing leaves the native runtime as raw Chrono state.

Do not expose:

- `ChBody` or `ChLink` ids or pointers
- raw solver structures
- Chrono-native sensor buffers as product API
- backend class names as protocol semantics

Normalize outputs into product channel families such as:

- `pose/body/<id>`
- `joint/<id>/position`
- `joint/<id>/reaction_force`
- `sensor/<id>/imu/accel`
- `sensor/<id>/camera/rgb`
- `event/runtime/warning`

This preserves backend independence for frontend, protocol, recording, replay, and ROS-facing layers.

## Sensors

Sensors remain authored, backend-agnostic product entities mounted to authored datums.

A logical sensor definition includes:

- sensor id and type
- datum mount
- typed configuration
- output descriptors
- record and publish policy

Compilation may map one logical sensor into multiple Chrono backend objects. One logical IMU may compile into accelerometer, gyroscope, and magnetometer backend instances while remaining one authored product entity.

Camera-family outputs are distinct channel outputs rather than one opaque sensor blob.

Sensor backend mechanics should be isolated behind a `SensorRuntimeCoordinator` that owns:

- Chrono sensor manager integration
- sensor registry and backend object sets
- buffer polling and output extraction
- recording hooks
- publication hooks

## ROS Integration

ROS support sits above normalized channel outputs, even if Chrono ROS helpers are used internally.

The public ROS bridge should preserve product-level frame, topic, and sensor semantics rather than mirroring Chrono handler structure.

## Diagnostics and Capability Detection

Chrono failures should surface in product terms first, with raw backend detail attached only as debug payload.

Recommended diagnostic categories:

- compile error
- capability error
- configuration warning
- runtime instability warning
- solver convergence issue
- recording or publication issue

Capability-sensitive features must be detected explicitly, including optional sensor support, GPU-sensitive sensor paths, and ROS availability.

## Package Direction

The native engine should continue to separate:

- `compile/` for product-to-runtime compilation
- `backend/chrono/` for Chrono-specific instantiation and extraction
- `runtime/` for session lifecycle and control
- `results/` for channel catalogs, live publishing, and recorder hooks
- `transport/` for control, stream, and query surfaces

## Change Rules

- If Chrono integration changes public contracts, schemas, sensor semantics, or results semantics, update seam tests and the affected architecture docs in the same change.
- If backend-specific concepts need to cross the current boundary, add or update an ADR before treating that as canonical architecture.
- Runtime diagnostics and capability handling must stay user-meaningful rather than leaking raw backend failures as the primary interface.
