# Epic 2 — Parallel Agent Prompts

> **Status:** Complete
> **Completed:** Pre-Epic-4 commit batch
> **Deviations:** None. Binary protobuf transport operational. CI validates codegen freshness and breaking changes.

Three prompts designed to run as parallel Plan agents. Each covers an independent workstream with fully specified contract interfaces between them.

## Locked-In Decisions (ADR-0004 pending)

These decisions were made before implementation and are non-negotiable within the prompts:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| TS protobuf library | **protobuf-es** | Official Buf runtime, conformance-tested, Connect-ES path later |
| Wire format | **Binary protobuf** | JSON only for debug/logs/fixtures, never main transport |
| Codegen tool | **Buf CLI** (`buf generate`) wrapped in `pnpm generate:proto` | buf.yaml + buf.gen.yaml in repo; lint + breaking-change detection |
| ID strategy | **Hybrid** | UUIDv7 authored entities, UUIDv5 derived/runtime, ints ephemeral |

## Shared Contract

| Interface | Owner | Consumer |
|-----------|-------|----------|
| `schemas/**/*.proto` | Prompt 1 (pipeline owns codegen) | Prompt 2 (C++ consumes), Prompt 3 (TS consumes) |
| `buf.yaml`, `buf.gen.yaml` | Prompt 1 | All |
| `packages/protocol/src/generated/` | Prompt 1 (generates) | Prompt 3 (imports) |
| `native/engine/src/generated/` | Prompt 1 (generates) | Prompt 2 (includes) |
| `pnpm generate:proto` | Prompt 1 | All (CI, dev workflow) |
| CMake `protobuf_generate()` or custom target | Prompt 2 (owns CMake) | Native build |
| Binary WebSocket frames | Prompt 2 (engine sends/receives) | Prompt 3 (frontend sends/receives) |

After all three are built, the integration test is: `pnpm dev:desktop` still shows "Engine ready" in the header, but the handshake now uses binary protobuf over the wire instead of JSON.

---

## Prompt 1: Buf Codegen Pipeline — Schema Tooling and Generation

```
# Epic 2 — Buf Codegen Pipeline, Schema Tooling, and Generation

You are setting up the protobuf codegen pipeline for MotionLab. This is the highest-risk task in Epic 2 — it must be proven end-to-end before any schema expansion happens.

## Read These First (in order)
- `docs/architecture/principles.md` — non-negotiable rules
- `docs/architecture/protocol-overview.md` — protocol contract rules
- `schemas/AGENTS.md` — schema ownership
- `packages/protocol/AGENTS.md` — generated bindings are read-only artifacts
- `plan.md` section "7. Epic 2" — codegen-first, then schema expansion

## Locked-In Decisions
- **protobuf-es** for TypeScript codegen (official Buf runtime)
- **Binary protobuf** on the wire (JSON only for debug)
- **Buf CLI** for lint, breaking-change detection, and codegen
- **UUIDv7** for authored entity IDs, **UUIDv5** for derived IDs

## What Exists Now

### `schemas/protocol/transport.proto`
Complete transport envelope schema: Command/Event wrappers, Handshake, HandshakeAck, Ping, Pong, EngineStatus. Currently used as documentation only — Epic 1 implemented these shapes as manual JSON.

### `schemas/mechanism/mechanism.proto`
Mechanism IR stubs: ElementId, Vec3, Quat, Pose, MassProperties, Body, Datum, Joint, JointType, Mechanism. These are the domain types that need codegen.

### `packages/protocol/package.json`
ESM package (`"type": "module"`). Currently exports hand-written `version.ts` with `createHandshake()` and `isCompatible()`. These must be preserved as convenience wrappers but should delegate to generated types internally.

### `packages/protocol/src/index.ts`
Exports from `version.ts`. Will need to also re-export generated types.

## What to Build

### 1. Install and configure Buf CLI

Add `buf.yaml` at the repo root (or `schemas/` — pick whichever Buf recommends for monorepos):
```yaml
version: v2
modules:
  - path: schemas
lint:
  use:
    - STANDARD
breaking:
  use:
    - FILE
```

Add `buf.gen.yaml` at the repo root:
```yaml
version: v2
plugins:
  # TypeScript — protobuf-es
  - remote: buf.build/bufbuild/es
    out: packages/protocol/src/generated
    opt:
      - target=ts

  # C++ — standard protoc plugin
  - remote: buf.build/protocolbuffers/cpp
    out: native/engine/src/generated
```

Note: If remote plugins cause issues (network/auth), fall back to local `protoc-gen-es` installed as a devDependency. Document whichever path works.

### 2. Install protobuf-es runtime

Add to `packages/protocol/package.json`:
```
"dependencies": {
  "@bufbuild/protobuf": "^2.0.0"
}
```

Install as a workspace devDependency:
```
"devDependencies": {
  "@bufbuild/protoc-gen-es": "^2.0.0"
}
```

Run `pnpm install` from the repo root.

### 3. Create `pnpm generate:proto` script

Add to the root `package.json`:
```json
"scripts": {
  "generate:proto": "buf generate",
  "lint:proto": "buf lint",
  "breaking:proto": "buf breaking --against '.git#branch=main'"
}
```

The generated output directories must be gitignored OR committed. Recommendation: **commit generated files** so that consumers don't need Buf installed to build. Add a CI check that verifies generated files are up-to-date (`buf generate && git diff --exit-code`).

### 4. Run first codegen

Execute `pnpm generate:proto` and verify:
- `packages/protocol/src/generated/` contains TS files for both `transport.proto` and `mechanism.proto`
- `native/engine/src/generated/` contains `.pb.h` and `.pb.cc` files
- Generated TS files export protobuf-es message classes (e.g., `Handshake`, `HandshakeAck`, `Command`, `Event`)
- Generated C++ files compile (check in Prompt 2)

### 5. Update `packages/protocol` exports

Update `packages/protocol/src/index.ts` to re-export generated types:
```ts
// Generated protocol types
export * from './generated/motionlab/protocol/transport_pb.js';
export * from './generated/motionlab/mechanism/mechanism_pb.js';

// Convenience wrappers (kept for backwards compat during migration)
export {
  createHandshake,
  isCompatible,
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  type ProtocolHandshake,
} from './version.js';
```

The exact import paths depend on Buf's output structure — adjust based on actual generated file layout.

### 6. Verify TypeScript types compile

Run `pnpm --filter @motionlab/protocol typecheck` and ensure it passes with the generated types.

### 7. Add buf lint to CI

Add a CI step that runs:
```
buf lint
buf breaking --against '.git#branch=main'
pnpm generate:proto
git diff --exit-code -- packages/protocol/src/generated/ native/engine/src/generated/
```

This ensures schemas stay lint-clean, don't break backwards compatibility, and generated code is always up-to-date.

### 8. Schema expansion — Mechanism IR

Only after codegen is proven, expand the schemas:

**`schemas/mechanism/mechanism.proto` additions:**
- `ProjectMetadata` message (project name, created_at, modified_at)
- `AssetReference` message (content hash, relative path, original filename) — for import provenance
- Ensure `ElementId.id` field has a comment specifying UUIDv7 format for authored entities

**`schemas/protocol/transport.proto` additions (stubs for future epics):**
- `ImportAssetCommand` in Command oneof (Epic 3 stub)
- `ImportAssetResult` in Event oneof (Epic 3 stub)
- `MechanismSnapshot` in Event oneof (for serialization smoke test)

Keep additions minimal — only what's needed to prove the pipeline handles schema evolution.

### 9. Serialization smoke test

Create `packages/protocol/src/__tests__/roundtrip.test.ts`:
- Construct a `Mechanism` message with a Body, Datum, and Joint using generated types
- Serialize to binary (`toBinary()`)
- Deserialize from binary (`fromBinary()`)
- Verify all fields survive the round-trip
- This validates the persistence foundation from plan.md

## Architecture Constraints
- `schemas/` is the source of truth — generated code is derived
- Generated files go in clearly marked `generated/` directories
- Never hand-edit generated files
- `packages/protocol` re-exports generated types but can add convenience wrappers
- Keep proto package names aligned: `motionlab.protocol`, `motionlab.mechanism`

## Done Looks Like
- `buf lint` passes on all `.proto` files
- `pnpm generate:proto` generates both TS and C++ from all schemas
- `packages/protocol` exports generated message types and they typecheck
- Round-trip serialization test passes for a Mechanism with bodies/datums/joints
- CI validates generated code is up-to-date and schemas are lint-clean
- Generated C++ files exist (compilation tested by Prompt 2)

## What NOT to Build
- C++ protobuf CMake integration (that's Prompt 2)
- WebSocket binary frame handling (that's Prompt 2 and 3)
- Frontend migration from JSON (that's Prompt 3)
- Connect-ES or any RPC framework
- Schema for simulation commands, CAD processing, or runtime channels (those are future epics)
```

---

## Prompt 2: C++ Protobuf Integration — CMake, Codegen, Binary Transport

```
# Epic 2 — C++ Protobuf Integration and Binary WebSocket Transport

You are migrating the C++ native engine from JSON-over-WebSocket to binary protobuf-over-WebSocket. This depends on Prompt 1 having generated C++ protobuf files.

## Read These First (in order)
- `docs/architecture/principles.md` — non-negotiable rules
- `native/engine/AGENTS.md` — native boundary rules, required checks
- `docs/architecture/runtime-topology.md` — engine is authority
- `plan.md` section "7. Epic 2" — codegen pipeline first

## Locked-In Decisions
- **Binary protobuf** on the wire
- **protobuf** via vcpkg for C++ runtime
- Generated files are in `native/engine/src/generated/` (from Buf in Prompt 1)
- **UUIDv7** for authored entity IDs (use a simple header-only UUID library or manual implementation)

## What Exists Now

### `native/engine/src/transport.cpp`
WebSocket server using ixwebsocket + nlohmann_json. Handles JSON handshake, ping/pong, session token validation, single-client enforcement. All message parsing is manual JSON.

### `native/engine/include/engine/transport.h`
TransportServer class with pimpl. Defines EngineState enum, EngineConfig, protocol constants (PROTOCOL_NAME, PROTOCOL_VERSION). These constants duplicate `version.ts` — after migration, they should come from the generated protobuf headers.

### `native/engine/CMakeLists.txt`
Uses ixwebsocket and nlohmann_json. Protobuf is commented out (`find_package(Protobuf CONFIG REQUIRED)`). Builds static lib `motionlab-engine-lib` + executable + tests.

### `native/engine/vcpkg.json`
Dependencies: ixwebsocket, nlohmann-json. Protobuf not yet added.

### `schemas/protocol/transport.proto`
Defines Command/Event envelopes, Handshake, HandshakeAck, Ping, Pong, EngineStatus. The generated C++ code from Prompt 1 will be in `native/engine/src/generated/`.

### `native/engine/tests/test_main.cpp`
Tests that start the engine, connect via WebSocket, send JSON handshake, verify response. Must be migrated to binary.

## What to Build

### 1. Add protobuf to vcpkg

Update `native/engine/vcpkg.json`:
```json
"dependencies": ["ixwebsocket", "nlohmann-json", "protobuf"]
```

### 2. Update CMakeLists.txt for protobuf

Uncomment and configure protobuf:
```cmake
find_package(Protobuf CONFIG REQUIRED)
```

Add the generated source files to the library:
```cmake
# Generated protobuf sources (from buf generate)
file(GLOB PROTO_GENERATED_SRCS "src/generated/*.pb.cc")
file(GLOB PROTO_GENERATED_HDRS "src/generated/*.pb.h")

add_library(motionlab-engine-lib STATIC
  src/transport.cpp
  ${PROTO_GENERATED_SRCS}
)

target_include_directories(motionlab-engine-lib PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
  ${CMAKE_CURRENT_SOURCE_DIR}/src  # for generated/ headers
)

target_link_libraries(motionlab-engine-lib PUBLIC
  ixwebsocket::ixwebsocket
  nlohmann_json::nlohmann_json
  protobuf::libprotobuf
)
```

Note: If Buf-generated paths don't match this layout, adjust accordingly. The generated files should follow the proto package structure (e.g., `generated/motionlab/protocol/transport.pb.cc`). Adjust the glob and include paths to match.

### 3. Verify generated C++ compiles

Run:
```
cmake --preset dev
cmake --build build/dev
```

Fix any include path or linking issues. The generated `.pb.h` files need `<google/protobuf/...>` headers from the vcpkg protobuf package.

### 4. Migrate transport.cpp from JSON to protobuf

Replace JSON message parsing with protobuf deserialization:

**Receive path (client → engine):**
```cpp
// Before: json::parse(msg->str)
// After:
motionlab::protocol::Command cmd;
if (!cmd.ParseFromString(msg->str)) {
    // invalid message, ignore or close
    return;
}

switch (cmd.payload_case()) {
    case Command::kHandshake:
        handle_handshake(ws, cmd.sequence_id(), cmd.handshake());
        break;
    case Command::kPing:
        handle_ping(ws, cmd.sequence_id(), cmd.ping());
        break;
    default:
        // unknown command, log and ignore
        break;
}
```

**Send path (engine → client):**
```cpp
// Before: json ack = { ... }; ws.sendText(ack.dump());
// After:
motionlab::protocol::Event event;
event.set_sequence_id(sequence_id);
auto* ack = event.mutable_handshake_ack();
ack->set_compatible(true);
auto* proto = ack->mutable_engine_protocol();
proto->set_name("motionlab");
proto->set_version(1);
ack->set_engine_version(MOTIONLAB_ENGINE_VERSION_STRING);

std::string serialized;
event.SerializeToString(&serialized);
ws.sendBinary(serialized);  // Note: sendBinary, not sendText
```

**Key changes:**
- `ws.sendText()` → `ws.sendBinary()` for all protobuf messages
- Receive handler checks `msg->type` for binary messages
- Session token validation moves into the Handshake message field
- EngineStatus is sent as an Event with the engine_status payload

### 5. Remove nlohmann_json dependency (or keep for debug logging)

After migration, nlohmann_json is no longer needed for the wire protocol. Options:
- **Remove entirely** if no other use — clean up CMakeLists.txt and vcpkg.json
- **Keep for debug** — add a `--debug-json` CLI flag that logs JSON representations of messages to stderr. This is optional for the spike.

Recommendation: remove it for now. Add debug logging later if needed.

### 6. Update protocol constants

Remove the duplicated constants from `transport.h`:
```cpp
// Remove these — they now come from generated protobuf
// constexpr const char* PROTOCOL_NAME = "motionlab";
// constexpr uint32_t PROTOCOL_VERSION = 1;
```

Use the generated enum values instead:
```cpp
// Use motionlab::protocol::EngineStatus::STATE_READY etc.
```

Keep `EngineState` enum in `transport.h` only if it serves a purpose distinct from the proto-generated `EngineStatus::State`. Otherwise, migrate to the generated enum.

### 7. Update handshake validation

The handshake must still validate:
- Session token matches CLI arg
- Protocol name is "motionlab"
- Protocol version matches (exact match for now; future: range compatibility)

But now using typed protobuf fields instead of JSON string parsing.

### 8. Handle the binary/text WebSocket frame distinction

ixwebsocket distinguishes binary and text frames. After migration:
- **Send** all protobuf messages as binary frames (`sendBinary()`)
- **Receive** handler should expect binary frames for protobuf messages
- Optionally reject text frames (or keep them for a debug/diagnostic channel)

### 9. Update tests

Migrate `tests/test_main.cpp`:
- Instead of constructing JSON strings, construct `Command` protobuf messages
- Serialize with `SerializeToString()`
- Send as binary WebSocket frames
- Deserialize responses as `Event` messages
- Verify handshake ack fields via typed accessors

### 10. Protocol round-trip test

Add a test that:
1. Starts the engine on a random port
2. Connects via WebSocket
3. Sends a binary `Command` with `Handshake` payload
4. Receives a binary `Event` with `HandshakeAck` payload
5. Verifies `compatible == true`, correct engine version, correct protocol version
6. Sends a `Ping` command
7. Receives a `Pong` event
8. Verifies timestamp round-trips correctly

This is the C++ proof of the end-to-end binary pipeline.

## Architecture Constraints
- Engine is authoritative — protobuf deserialization errors are logged and connections are closed, never silently accepted
- Loopback only (127.0.0.1) — unchanged from Epic 1
- Single-client mode — unchanged
- ixwebsocket remains the WebSocket library — protobuf is only the serialization layer
- Keep the stdout logging (`[ENGINE] status=...`) — it's for Electron supervision, separate from the wire protocol

## Done Looks Like
- `cmake --preset dev && cmake --build build/dev` succeeds with protobuf linked
- `ctest --preset dev` passes with binary protobuf handshake test
- Running the engine and connecting with a binary protobuf client works
- JSON is no longer used on the wire
- Session token validation still works
- Wrong protocol version or token is still rejected
- Ctrl+C still shuts down cleanly
- Stdout logging for Electron supervision is unchanged

## What NOT to Build
- Buf CLI setup or codegen scripts (that's Prompt 1)
- TypeScript/frontend changes (that's Prompt 3)
- Mechanism IR deserialization (future epics)
- Any simulation or CAD commands
- Multi-client support
- Protobuf reflection or dynamic message handling
```

---

## Prompt 3: Frontend Migration — Binary Protocol Client + Generated Types

```
# Epic 2 — Frontend Binary Protocol Client and Generated Type Migration

You are migrating the frontend WebSocket client from JSON to binary protobuf, using generated types from protobuf-es. This depends on Prompt 1 having generated TypeScript files.

## Read These First (in order)
- `docs/architecture/principles.md` — React is NOT the hot path
- `packages/frontend/AGENTS.md` — frontend owns workbench UX, uses Zustand, protocol contracts not backend assumptions
- `packages/protocol/AGENTS.md` — generated bindings are read-only, schema is source of truth
- `plan.md` section "7. Epic 2" — codegen pipeline first

## Locked-In Decisions
- **protobuf-es** for TypeScript runtime (`@bufbuild/protobuf`)
- **Binary protobuf** on the wire (JSON only for debug)
- Generated types are in `packages/protocol/src/generated/`
- **UUIDv7** for authored entity IDs

## What Exists Now

### `packages/protocol/src/index.ts`
Exports `createHandshake()`, `isCompatible()`, `PROTOCOL_NAME`, `PROTOCOL_VERSION`. After Prompt 1, it also re-exports generated protobuf types.

### `packages/protocol/src/version.ts`
Hand-written protocol version constants and handshake utilities. These should be migrated to use generated types internally.

### `packages/frontend/src/engine/connection.ts`
WebSocket client that:
1. Discovers engine via `window.motionlab.getEngineEndpoint()`
2. Opens WebSocket to `ws://host:port`
3. On open: sends JSON handshake with session token
4. Parses JSON responses: `handshakeAck`, `engineStatus`
5. Updates Zustand store with connection state

Currently uses `ws.send(JSON.stringify(...))` and `JSON.parse(event.data)`.

### `packages/frontend/src/stores/engine-connection.ts`
Zustand store with states: discovering, connecting, handshaking, ready, error, disconnected. No changes needed to the state model — only the transport layer changes.

### `packages/frontend/src/types/motionlab.d.ts`
Window type declaration for `window.motionlab`. No changes needed.

### `packages/frontend/src/App.tsx`
Uses the engine connection store, displays status in header. No changes needed.

### Generated types (from Prompt 1)
After Prompt 1 runs `buf generate`, `packages/protocol/src/generated/` will contain protobuf-es classes:
- `Command`, `Event` (transport envelopes)
- `Handshake`, `HandshakeAck`, `Ping`, `Pong`, `EngineStatus`
- `ProtocolVersion`
- Mechanism IR types: `Body`, `Datum`, `Joint`, `Mechanism`, etc.

protobuf-es message classes have `toBinary()` and static `fromBinary()` methods.

## What to Build

### 1. Update `packages/protocol/src/version.ts`

Migrate the handshake utilities to use generated types internally:

```ts
import { Handshake, ProtocolVersion } from './generated/motionlab/protocol/transport_pb.js';

export const PROTOCOL_VERSION = 1;
export const PROTOCOL_NAME = 'motionlab';

// Keep the simple interface for backwards compat
export interface ProtocolHandshake {
  name: typeof PROTOCOL_NAME;
  version: number;
}

export function createHandshake(): ProtocolHandshake {
  return { name: PROTOCOL_NAME, version: PROTOCOL_VERSION };
}

export function isCompatible(remote: ProtocolHandshake): boolean {
  return remote.name === PROTOCOL_NAME && remote.version === PROTOCOL_VERSION;
}
```

Note: The exact import path depends on Buf's output structure. Adjust accordingly.

### 2. Create protocol helpers (`packages/protocol/src/transport.ts`)

Add typed helpers for constructing and parsing binary messages:

```ts
import { Command, Event, Handshake, Ping, ProtocolVersion } from './generated/...';
import { PROTOCOL_NAME, PROTOCOL_VERSION } from './version.js';

export function createHandshakeCommand(sessionToken: string, sequenceId: bigint = 1n): Uint8Array {
  const cmd = new Command({
    sequenceId,
    payload: {
      case: 'handshake',
      value: new Handshake({
        protocol: new ProtocolVersion({
          name: PROTOCOL_NAME,
          version: PROTOCOL_VERSION,
        }),
        sessionToken,
      }),
    },
  });
  return cmd.toBinary();
}

export function createPingCommand(sequenceId: bigint): Uint8Array {
  const cmd = new Command({
    sequenceId,
    payload: {
      case: 'ping',
      value: new Ping({
        timestamp: BigInt(Date.now()),
      }),
    },
  });
  return cmd.toBinary();
}

export function parseEvent(data: ArrayBuffer): Event {
  return Event.fromBinary(new Uint8Array(data));
}
```

Export these from `packages/protocol/src/index.ts`.

### 3. Migrate `connection.ts` to binary protobuf

Key changes:

**WebSocket setup — request binary frames:**
```ts
ws = new WebSocket(url);
ws.binaryType = 'arraybuffer';  // Critical: receive ArrayBuffer, not Blob
```

**Send handshake — binary instead of JSON:**
```ts
// Before:
// ws.send(JSON.stringify({ ...handshake, sessionToken }));
// After:
import { createHandshakeCommand, parseEvent } from '@motionlab/protocol';
ws.send(createHandshakeCommand(endpoint.sessionToken));
```

**Receive messages — deserialize protobuf:**
```ts
ws.onmessage = (event) => {
  let evt: Event;
  try {
    evt = parseEvent(event.data as ArrayBuffer);
  } catch {
    // Not a valid protobuf message, ignore
    return;
  }

  switch (evt.payload.case) {
    case 'handshakeAck': {
      const ack = evt.payload.value;
      if (handshakeTimer) {
        clearTimeout(handshakeTimer);
        handshakeTimer = null;
      }
      if (!ack.compatible) {
        const remoteVersion = ack.engineProtocol?.version ?? 'unknown';
        set({
          status: 'error',
          errorMessage: `Incompatible protocol: engine v${remoteVersion}`,
        });
        cleanup();
        return;
      }
      set({ status: 'ready', engineVersion: ack.engineVersion });
      break;
    }
    case 'engineStatus': {
      const status = evt.payload.value;
      // Map proto enum to string for the store
      set({ engineStatus: engineStateToString(status.state) });
      break;
    }
    case 'pong':
      // Keepalive response — no action needed for now
      break;
    default:
      console.warn('[connection] Unknown event payload:', evt.payload.case);
  }
};
```

**Add a helper to map the EngineStatus enum to strings:**
```ts
import { EngineStatus_State } from '@motionlab/protocol';

function engineStateToString(state: EngineStatus_State): string {
  switch (state) {
    case EngineStatus_State.STATE_READY: return 'ready';
    case EngineStatus_State.STATE_INITIALIZING: return 'initializing';
    case EngineStatus_State.STATE_BUSY: return 'busy';
    case EngineStatus_State.STATE_ERROR: return 'error';
    case EngineStatus_State.STATE_SHUTTING_DOWN: return 'shutting_down';
    default: return 'unknown';
  }
}
```

### 4. Remove manual type definitions from connection.ts

Delete the hand-written interfaces that are now replaced by generated types:
```ts
// Remove these:
interface HandshakeMessage { ... }
interface EngineStatusMessage { ... }
type InboundMessage = ...
```

### 5. Verify typecheck passes

Run:
```
pnpm --filter @motionlab/protocol typecheck
pnpm --filter @motionlab/frontend typecheck
```

### 6. Update store if needed

The Zustand store interface should remain stable. The only change might be if `engineStatus` needs to store the proto enum value instead of a string. Prefer keeping it as a string for simplicity — the connection module translates.

### 7. Verify integration still works

After all three prompts are implemented:
1. `pnpm generate:proto` generates fresh types
2. `cmake --preset dev && cmake --build build/dev` compiles the engine with protobuf
3. `pnpm dev:desktop` launches and shows "Engine ready" in the header
4. The handshake now uses binary protobuf — verify by checking that `ws.binaryType = 'arraybuffer'` is set and messages are `Uint8Array`, not JSON strings

### 8. Optional: Debug logging

Add a dev-only helper that logs protobuf messages as JSON for debugging:
```ts
if (import.meta.env.DEV) {
  console.debug('[protocol] →', evt.toJsonString());
}
```

protobuf-es supports `toJsonString()` on all message classes. This provides the "JSON for debug" path from the decision.

## Architecture Constraints
- React is NOT the hot path — WebSocket client and message routing remain in plain TypeScript (`connection.ts`), not React hooks
- The Zustand store remains the bridge between imperative WebSocket and React
- `@motionlab/protocol` owns all generated type re-exports — `@motionlab/frontend` imports from protocol, never from generated paths directly
- The frontend must not assume Electron — `window.motionlab` check remains
- No simulation data handling — this epic only handles handshake, status, ping/pong

## Done Looks Like
- `pnpm dev:desktop` still shows "Discovering engine..." → "Engine ready" in the header
- The WebSocket now sends/receives binary frames (visible in DevTools Network tab as binary, not text)
- `pnpm --filter @motionlab/frontend typecheck` passes
- `pnpm --filter @motionlab/protocol typecheck` passes
- Connection error handling (timeout, wrong token, incompatible version) still works
- Killing the engine still shows "Engine disconnected" in the header
- `pnpm dev:web` still shows "Engine error: Not running in desktop app"

## What NOT to Build
- Buf CLI setup or codegen scripts (that's Prompt 1)
- C++ protobuf integration (that's Prompt 2)
- Mechanism IR rendering or domain logic
- Reconnection logic
- Complex error recovery UX
- Tests for frontend connection (seam test is covered by the C++ handshake test in Prompt 2)
```

---

## Integration Verification

After all three prompts complete, verify the full stack:

1. **Codegen:** `pnpm generate:proto` produces both TS and C++ files
2. **Lint:** `buf lint` passes
3. **C++ build:** `cmake --preset dev && cmake --build build/dev` succeeds with protobuf
4. **C++ test:** `ctest --preset dev` passes (binary handshake test)
5. **TS typecheck:** `pnpm --filter @motionlab/protocol typecheck` passes
6. **Round-trip test:** `pnpm --filter @motionlab/protocol test` passes (mechanism serialization)
7. **Desktop integration:** `pnpm dev:desktop` shows "Engine ready" using binary protobuf
8. **Web fallback:** `pnpm dev:web` shows "Not running in desktop app"

## ADR to Write After Implementation

ADR-0004: Protocol Codegen and Identity Strategy

Captures:
- protobuf-es as TS runtime, Buf as codegen tool
- Binary protobuf as wire format
- UUIDv7 for authored entities, UUIDv5 for derived, ints for ephemeral
- Generated code committed to repo, CI validates freshness
- Schema source of truth in `schemas/`, generated artifacts are read-only
