# Protocol Overview

`schemas/` is the schema source of truth. `packages/protocol` is the TypeScript-side contract layer.

## Contract Rules

- Public protocol messages must stay backend-agnostic.
- Versioning is deliberate. Breaking contract changes are explicit and documented.
- The protocol should support control, live data, and query/replay semantics as distinct concerns.
- Product-level channel descriptors are the durable way to describe runtime outputs.

## Current Transport (Epic 2)

The native engine uses binary protobuf over WebSocket. Messages are defined in `schemas/protocol/transport.proto` and serialized via protobuf-es generated types. JSON representation is available for debug logging via `eventToDebugJson()`.

Message types (proto envelopes):
- `Command` (frontend → engine): oneof payload — `Handshake`, `Ping`, `ImportAssetCommand`, `CreateDatumCommand`, `DeleteDatumCommand`, `RenameDatumCommand`, `CreateDatumFromFaceCommand`, `CreateJointCommand`, `UpdateJointCommand`, `DeleteJointCommand`, `CompileMechanismCommand`, `SimulationControlCommand`, `ScrubCommand`
- `Event` (engine → frontend): oneof payload — `HandshakeAck`, `Pong`, `EngineStatus`, `ImportAssetResult`, `MechanismSnapshot`, `CreateDatumResult`, `DeleteDatumResult`, `RenameDatumResult`, `CreateDatumFromFaceResult`, `CreateJointResult`, `UpdateJointResult`, `DeleteJointResult`, `CompilationResultEvent`, `SimulationStateEvent`, `SimulationFrame`, `SimulationTrace`

Key messages:
- `Handshake`: carries `ProtocolVersion` (name + version) and session token
- `HandshakeAck`: `compatible` boolean (engine decides), `engineProtocol`, `engineVersion`
- `EngineStatus`: proto enum `State` (INITIALIZING, READY, BUSY, ERROR, SHUTTING_DOWN)
- `Ping`/`Pong`: uint64 timestamp for latency measurement
- `ImportAssetResult.BodyImportResult.part_index`: per-face triangle counts used by the viewport to map Babylon triangle hits back to B-Rep face indices
- `CreateDatumFromFaceCommand`: requests geometry-aware datum creation from a picked body face
- `CreateDatumFromFaceResult`: returns the created datum plus `face_index` and backend-agnostic `FaceSurfaceClass`

Protocol constants: `PROTOCOL_NAME = "motionlab"`, `PROTOCOL_VERSION = 1` (defined in `packages/protocol/src/version.ts`).

Binary helpers in `packages/protocol/src/transport.ts`: `createHandshakeCommand`, `createPingCommand`, `createCompileMechanismCommand`, `createSimulationControlCommand`, `createScrubCommand`, `parseEvent`, `engineStateToString`.

### Simulation Lifecycle (Epic 7.2)

- `CompileMechanismCommand` (empty): compiles the current MechanismState into a Chrono simulation system
- `SimulationControlCommand`: `SimulationAction` enum — PLAY, PAUSE, STEP, RESET
- `CompilationResultEvent`: success/failure + diagnostics
- `SimulationStateEvent`: `SimStateEnum` (IDLE, COMPILING, RUNNING, PAUSED, ERROR) + sim_time + step_count
- `SimulationFrame`: high-frequency streamed data — body poses (`BodyPoseData`) + joint states (`JointStateData`)
- See [ADR-0006](../decisions/ADR-0006-simulation-streaming-contract.md) for streaming contract details

### Output Channels + Trace Streaming (Epic 8.1)

- `CompilationResultEvent.channels`: repeated `OutputChannelDescriptor` — channel manifest sent once after successful compilation. Each descriptor has `channel_id`, `name`, `unit`, and `data_type` (SCALAR or VEC3).
- `SimulationTrace`: batched trace data streamed during simulation at lower frequency than body poses (~6 batches/second). Each event carries samples for one channel, sent round-robin.
- `ScrubCommand`: seeks to a historical simulation time. Engine pauses, looks up nearest buffered frame, sends historical `SimulationFrame` + `SimulationTrace` events for a ±1s window.
- Channel ID convention: `<entity_type>/<entity_id>/<measurement>` (e.g., `joint/<uuid>/position`)
- See [ADR-0008](../decisions/ADR-0008-output-channel-naming-and-typing.md) for full naming/typing/streaming contract

## Near-Term Expectations (Planned)

> These expectations describe the intended workflow once the protocol is fully implemented.

- schema changes update both docs and generated inventories
- protocol changes update tests at the contract seam
- long-lived contract direction changes require ADRs
