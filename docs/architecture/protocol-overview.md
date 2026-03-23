# Protocol Overview

`schemas/` is the schema source of truth. `packages/protocol` is the TypeScript-side contract layer.

## Contract Rules

- Public protocol messages must stay backend-agnostic.
- Versioning is deliberate. Breaking contract changes are explicit and documented.
- The protocol should support control, live data, and query/replay semantics as distinct concerns.
- Product-level channel descriptors are the durable way to describe runtime outputs.

## Current Transport (Epic 2)

The native engine uses binary protobuf over WebSocket. Messages are defined in `schemas/protocol/transport.proto` and serialized via protobuf-es generated types. JSON representation is available for debug logging via `eventToDebugJson()`.

Transport execution is split in two parts:

- the WebSocket callback thread performs frame validation, protobuf parsing, authentication checks, and command routing
- a dedicated native command worker executes authenticated engine commands in-order, including import, authored-state mutation, compile, save/load, and scrub work
- cached import results rebuild authored body data immediately, while native topology is loaded lazily when a face-aware authoring command needs it

Message types (proto envelopes):
- `Command` (frontend → engine): oneof payload — `Handshake`, `Ping`, `ImportAssetCommand`, `CreateDatumCommand`, `DeleteDatumCommand`, `RenameDatumCommand`, `CreateDatumFromFaceCommand`, `UpdateBodyCommand`, `UpdateDatumPoseCommand`, `CreateJointCommand`, `UpdateJointCommand`, `DeleteJointCommand`, `CreateLoadCommand`, `UpdateLoadCommand`, `DeleteLoadCommand`, `CreateActuatorCommand`, `UpdateActuatorCommand`, `DeleteActuatorCommand`, `CreateBodyCommand`, `DeleteBodyCommand`, `AttachGeometryCommand`, `DetachGeometryCommand`, `UpdateMassPropertiesCommand`, `CompileMechanismCommand`, `SimulationControlCommand`, `ScrubCommand`, `SaveProjectCommand`, `LoadProjectCommand`, `RelocateAssetCommand`
- `Event` (engine → frontend): oneof payload — `HandshakeAck`, `Pong`, `EngineStatus`, `ImportAssetResult`, `MechanismSnapshot`, `CreateDatumResult`, `DeleteDatumResult`, `RenameDatumResult`, `CreateDatumFromFaceResult`, `UpdateBodyResult`, `UpdateDatumPoseResult`, `CreateJointResult`, `UpdateJointResult`, `DeleteJointResult`, `CreateLoadResult`, `UpdateLoadResult`, `DeleteLoadResult`, `CreateActuatorResult`, `UpdateActuatorResult`, `DeleteActuatorResult`, `CreateBodyResult`, `DeleteBodyResult`, `AttachGeometryResult`, `DetachGeometryResult`, `UpdateMassPropertiesResult`, `CompilationResultEvent`, `SimulationStateEvent`, `SimulationFrame`, `SimulationTrace`, `SaveProjectResult`, `LoadProjectResult`, `RelocateAssetResult`

Key messages:
- `Handshake`: carries `ProtocolVersion` (name + version) and session token
- `HandshakeAck`: `compatible` boolean (engine decides), `engineProtocol`, `engineVersion`
- `EngineStatus`: proto enum `State` (INITIALIZING, READY, BUSY, ERROR, SHUTTING_DOWN)
- `Ping`/`Pong`: uint64 timestamp for latency measurement
- `ImportOptions.unit_system`: declares source CAD length units. The engine validates `millimeter`, `meter`, or `inch` and normalizes imported geometry, mass-property lengths, and topology-derived datum poses into meters before publishing the result.
- `motionlab.mechanism.Geometry.source_asset_ref`: structured `AssetReference` owned by geometry. `Body.source_asset_ref` remains deprecated only for migration/backward compatibility.
- `ImportAssetResult.GeometryImportResult.part_index`: per-face triangle counts used by the viewport to map Babylon triangle hits back to B-Rep face indices
- `CreateDatumFromFaceCommand`: requests geometry-aware datum creation from a picked body face
- `CreateDatumFromFaceResult`: returns the created datum plus `face_index` and backend-agnostic `FaceSurfaceClass` (`PLANAR`, `CYLINDRICAL`, `CONICAL`, `SPHERICAL`, `TOROIDAL`, `OTHER`)
- `CreateBodyCommand` / `DeleteBodyCommand`: create empty physical bodies and remove bodies with their dependent authored entities
- `AttachGeometryCommand` / `DetachGeometryCommand`: reparent imported geometry without re-importing CAD
- `UpdateMassPropertiesCommand`: toggles `mass_override` and updates user-authored body mass properties
- `UpdateBodyCommand`: body-level authored updates such as `is_fixed` and `name`
- `UpdateDatumPoseCommand`: updates an authored datum local pose and returns the updated datum
- `CreateJointCommand` / `UpdateJointCommand`: carry full typed `motionlab.mechanism.Joint` payloads. Joint type-specific authored settings live under `Joint.config`.
- `CreateLoadCommand` / `UpdateLoadCommand`: carry full `motionlab.mechanism.Load` payloads. Loads are first-class authored entities, not joint extensions.
- `CreateActuatorCommand` / `UpdateActuatorCommand`: carry full `motionlab.mechanism.Actuator` payloads. Actuators target authored joints and remain product-level concepts rather than Chrono-native classes on the wire.

Protocol constants: `PROTOCOL_NAME = "motionlab"`, `PROTOCOL_VERSION = 4` (defined in `packages/protocol/src/version.ts`).

Binary helpers in `packages/protocol/src/transport.ts`: `createHandshakeCommand`, `createPingCommand`, `createCompileMechanismCommand`, `createSimulationControlCommand`, `createScrubCommand`, `parseEvent`, `engineStateToString`.

### Simulation Lifecycle (Epic 7.2)

- `CompileMechanismCommand` (empty): compiles the current MechanismState into a Chrono simulation system
- `SimulationControlCommand`: `SimulationAction` enum — PLAY, PAUSE, STEP, RESET
- `CompilationResultEvent`: success/failure + diagnostics
- `SimulationStateEvent`: `SimStateEnum` (IDLE, COMPILING, RUNNING, PAUSED, ERROR) + sim_time + step_count. Native now emits a real `PAUSED` state after pause, step-once, successful compile, and scrub.
- `SimulationFrame`: high-frequency streamed data for body poses (`BodyPoseData`). `joint_states` remains in the schema as a deprecated compatibility field and is no longer the authoritative contract for non-pose runtime data.
- See [ADR-0006](../decisions/ADR-0006-simulation-streaming-contract.md) for streaming contract details

### Solver Configuration (Epic 17)

`SimulationSettings` carries optional solver, contact, and duration configuration alongside existing timestep and gravity:

- `SolverSettings solver`: solver type (PSOR, BB, APGD, MINRES), max iterations, tolerance, integrator type (Euler implicit, HHT, Newmark). Absent = product defaults.
- `ContactSettings contact`: friction, restitution, compliance, damping, enable_contact. NSC-specific; see ADR-0015.
- `double duration`: informational simulation duration for frontend playback UI.

`CompilationResultEvent` now includes `repeated CompilationDiagnostic structured_diagnostics` with severity, message, affected entity IDs, suggestion, and machine-readable code. The old `repeated string diagnostics` field is deprecated.

See [ADR-0015](../decisions/ADR-0015-simulation-settings-transport-contract.md).

### Output Channels + Trace Streaming (Protocol v3)

- `CompilationResultEvent.channels`: repeated `OutputChannelDescriptor` — channel manifest sent once after successful compilation. Each descriptor has `channel_id`, `name`, `unit`, and `data_type` (SCALAR or VEC3).
- `SimulationTrace`: batched trace data streamed during simulation at lower frequency than body poses (~6 batches/second). Each event carries samples for one channel, sent round-robin.
- `ScrubCommand`: seeks to a historical simulation time. Engine pauses, looks up the nearest buffered frame, and sends historical `SimulationFrame` plus per-channel `SimulationTrace` events for a ±1s window.
- Channel ID convention: `<entity_type>/<entity_id>/<measurement>`
- Joint coordinates are explicit by DOF, for example `joint/<uuid>/coord/rot_z`, `joint/<uuid>/coord_rate/rot_z`, `joint/<uuid>/coord/trans_z`, `joint/<uuid>/coord_rate/trans_z`, `joint/<uuid>/reaction_force`, `joint/<uuid>/reaction_torque`
- Load channels follow authored load semantics, for example `load/<uuid>/applied_force`, `load/<uuid>/applied_torque`, `load/<uuid>/length`, `load/<uuid>/length_rate`, `load/<uuid>/force`
- Actuator channels are command/effect oriented, for example `actuator/<uuid>/command` and `actuator/<uuid>/effort`
- See [ADR-0008](../decisions/ADR-0008-output-channel-naming-and-typing.md) for full naming/typing/streaming contract
- See [ADR-0012](../decisions/ADR-0012-protocol-v3-multibody-contract.md) for the typed multibody entity and migration contract

### Persistence and Asset Recovery (Epic 9)

- `SaveProjectCommand` / `LoadProjectCommand`: engine-authoritative serialization to self-contained `.motionlab` files (see [ADR-0009](../decisions/ADR-0009-project-save-load-contract.md))
- Project file format version is now `3`. Engine migrates version `1` files by upgrading legacy joints into typed configs and version `2` files by splitting body-owned CAD data into first-class `Geometry` entities plus `GeometryDisplayData`.
- Migration mechanics: when the engine loads a version 1 project file, `upgrade_legacy_joint()` converts untyped `lower_limit`/`upper_limit` fields into the appropriate typed config oneof (e.g., `RevoluteJointConfig.angle_limit`). On serialization, `build_mechanism_proto()` dual-writes both the typed config and the deprecated legacy limit fields, so older readers can still consume the data. Migration is native-authoritative; the TypeScript layer does not perform or need migration logic.
- `LoadProjectSuccess.geometries`: geometry-first display payload used to rebuild per-geometry meshes and part indices on load; `LoadProjectSuccess.bodies` remains a compatibility fallback
- `LoadProjectSuccess.missing_assets`: repeated `MissingAssetInfo` reported when referenced CAD files are missing or have changed since import. Each entry carries `body_id`, `body_name`, `expected_asset` (AssetReference), and `reason` (`"file_not_found"`, `"hash_mismatch"`, `"cache_corrupted"`)
- `RelocateAssetCommand` (field 42): frontend sends `body_id`, `new_file_path`, and `ImportOptions` to re-import a body's CAD source from a user-selected path
- `RelocateAssetResult` (field 42): returns the updated `BodyImportResult` on success or an error message
- `BodyDisplayData` carries `density`, `tessellation_quality`, and `unit_system` alongside display mesh data, enabling the engine to reconstruct cache keys and re-validate content hashes on load
- Cache validation on load: for each body, the engine checks whether the source file exists and its content hash matches the stored `AssetReference.content_hash`. On match, topology context (B-Rep shapes) is restored; on mismatch, the body renders from embedded mesh but face-picking is unavailable until relocate
- See [ADR-0011](../decisions/ADR-0011-missing-asset-recovery-contract.md) for the full recovery contract

## Near-Term Expectations (Planned)

> These expectations describe the intended workflow once the protocol is fully implemented.

- schema changes update both docs and generated inventories
- protocol changes update tests at the contract seam
- long-lived contract direction changes require ADRs
