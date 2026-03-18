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
- `Command` (frontend → engine): oneof payload — `Handshake`, `Ping`, `ImportAssetCommand`, `CreateDatumCommand`, `DeleteDatumCommand`, `RenameDatumCommand`, `CreateJointCommand`, `UpdateJointCommand`, `DeleteJointCommand`
- `Event` (engine → frontend): oneof payload — `HandshakeAck`, `Pong`, `EngineStatus`, `ImportAssetResult`, `MechanismSnapshot`, `CreateDatumResult`, `DeleteDatumResult`, `RenameDatumResult`, `CreateJointResult`, `UpdateJointResult`, `DeleteJointResult`

Key messages:
- `Handshake`: carries `ProtocolVersion` (name + version) and session token
- `HandshakeAck`: `compatible` boolean (engine decides), `engineProtocol`, `engineVersion`
- `EngineStatus`: proto enum `State` (INITIALIZING, READY, BUSY, ERROR, SHUTTING_DOWN)
- `Ping`/`Pong`: uint64 timestamp for latency measurement

Protocol constants: `PROTOCOL_NAME = "motionlab"`, `PROTOCOL_VERSION = 1` (defined in `packages/protocol/src/version.ts`).

Binary helpers in `packages/protocol/src/transport.ts`: `createHandshakeCommand`, `createPingCommand`, `parseEvent`, `engineStateToString`.

## Near-Term Expectations (Planned)

> These expectations describe the intended workflow once the protocol is fully implemented.

- schema changes update both docs and generated inventories
- protocol changes update tests at the contract seam
- long-lived contract direction changes require ADRs
