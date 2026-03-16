# Epic 1 — Parallel Agent Prompts

> **Status:** All three prompts complete.
>
> **Library decision:** Prompt 1 chose `ixwebsocket` (server + client, BSD-3-Clause, via vcpkg) over `websocketpp` (removed from vcpkg) and `uWebSockets` (no client API for tests). `nlohmann-json` for JSON.

Three prompts designed to run as parallel Plan agents. Each covers an independent workstream with fully specified contract interfaces between them.

## Shared Contract

| Interface | Owner | Consumer |
|-----------|-------|----------|
| CLI args `--port` `--session-token` | Prompt 2 (Electron picks port/token) | Prompt 1 (Engine parses them) |
| stdout `[ENGINE] status=ready` | Prompt 1 (Engine writes) | Prompt 2 (Electron reads) |
| `window.motionlab.getEngineEndpoint()` | Prompt 2 (preload exposes) | Prompt 3 (frontend calls) |
| JSON WebSocket handshake protocol | Prompt 1 (Engine implements server) | Prompt 3 (Frontend implements client) |

After all three are built, the integration test is: `pnpm dev:desktop` shows "Engine ready" in the header.

---

## Prompt 1: Native Engine — WebSocket Server + Handshake

```
# Epic 1 — Native Engine WebSocket Server and Protocol Handshake

You are implementing the C++ native engine side of Epic 1 for MotionLab. This is a spike — prove it works, don't over-polish.

## Read These First (in order)
- `docs/architecture/principles.md` — non-negotiable rules
- `docs/architecture/runtime-topology.md` — engine is authority, Electron is shell
- `native/engine/AGENTS.md` — native boundary rules
- `plan.md` section "6. Epic 1" — spike-first approach and the 5 questions to answer

## What Exists Now

### `native/engine/src/main.cpp`
Placeholder that prints version and exits. The comments already describe the target: parse CLI args (port, session token), listen on loopback WebSocket, serve protocol.

### `native/engine/CMakeLists.txt`
Minimal executable. Protobuf/OCCT/Chrono are commented out. You need to add a WebSocket library dependency.

### `native/engine/vcpkg.json`
Empty dependencies array. You'll add the WebSocket lib here.

### `native/engine/CMakePresets.json`
Dev and release presets exist. Both inherit vcpkg-base which sets CMAKE_TOOLCHAIN_FILE from $env{VCPKG_ROOT}. Note: `VCPKG_MANIFEST_MODE` is currently OFF — you'll need to flip this to ON for vcpkg to install dependencies from vcpkg.json.

### `native/engine/include/engine/version.h`
Version constants: 0.0.1.

### `native/engine/tests/test_main.cpp`
Placeholder tests asserting version constants. Replace or extend with real tests.

### Protocol contract (TypeScript side — your C++ must match):
`packages/protocol/src/version.ts` defines:
- `PROTOCOL_VERSION = 1`, `PROTOCOL_NAME = 'motionlab'`
- `ProtocolHandshake { name: string, version: number }`
- `createHandshake()` and `isCompatible()` functions

### `schemas/protocol/transport.proto`
Defines the target message schema: Command/Event envelopes, Handshake/HandshakeAck, Ping/Pong, EngineStatus (INITIALIZING/READY/BUSY/ERROR/SHUTTING_DOWN). **For this spike, do NOT use protobuf codegen** — that's Epic 2. Use plain JSON over WebSocket for the handshake. The proto file documents the intended message shapes to implement manually.

## What to Build

### 1. WebSocket library choice and integration
Add a WebSocket server library via vcpkg. Recommended options (pick one):
- **uWebSockets** — high performance, minimal, but header-only with uSockets dep
- **websocketpp** — mature, Boost.Asio or standalone Asio, easy to set up
- **Boost.Beast** — industrial strength but heavy dependency

For a spike, prioritize ease of setup. websocketpp with standalone Asio or a lightweight alternative is fine. Document your choice in a comment.

Update: `vcpkg.json` (add dependency), `CMakeLists.txt` (find_package + link), `CMakePresets.json` (flip VCPKG_MANIFEST_MODE to ON).

### 2. CLI argument parsing
The engine receives from Electron:
- `--port <number>` — which port to listen on (Electron picks a free port)
- `--session-token <string>` — shared secret for connection gating

Keep it simple — manual argc/argv parsing or a tiny lib. No need for a full CLI framework.

### 3. WebSocket server on loopback
- Bind to `127.0.0.1:<port>` (loopback only — never expose to network)
- Accept exactly one connection at a time (single-client for MVP)
- Validate the session token on the first message

### 4. JSON handshake protocol (pre-protobuf)
Since protobuf codegen is Epic 2, use JSON for now. The message shapes must match the proto schema conceptually:

**Client → Engine (first message after WS connect):**
```json
{
  "type": "handshake",
  "sequenceId": 1,
  "protocol": { "name": "motionlab", "version": 1 },
  "sessionToken": "<token from CLI arg>"
}
```

**Engine → Client (response):**
```json
{
  "type": "handshakeAck",
  "sequenceId": 1,
  "compatible": true,
  "engineProtocol": { "name": "motionlab", "version": 1 },
  "engineVersion": "0.0.1"
}
```

**Engine → Client (status updates, after handshake):**
```json
{
  "type": "engineStatus",
  "state": "ready",
  "message": "Engine initialized"
}
```

**Client → Engine / Engine → Client (keepalive):**
```json
{ "type": "ping", "timestamp": 1710500000000 }
{ "type": "pong", "timestamp": 1710500000000 }
```

Reject connections with wrong session token. Reject incompatible protocol versions (name mismatch or version mismatch).

### 5. Engine lifecycle and event loop
- On startup: parse args → bind WebSocket → emit INITIALIZING status to stdout → wait for connection
- On handshake success: emit READY status
- On error: emit ERROR status with message
- On SIGTERM/SIGINT: emit SHUTTING_DOWN, close connections, exit cleanly
- The event loop must stay alive (don't just exit after printing)

### 6. Structured logging to stdout
The Electron main process reads the engine's stdout for diagnostics. Use a simple structured format:
```
[ENGINE] status=initializing port=9001
[ENGINE] status=ready
[ENGINE] status=error message="..."
[ENGINE] status=shutting_down
```
This is NOT the WebSocket protocol — it's a separate stdout channel for Electron supervision.

### 7. Tests
Add a test that:
- Starts the engine on a random free port
- Connects via WebSocket
- Sends a handshake
- Receives a valid handshakeAck
- Verifies the engine reports ready

You can use a simple test framework or keep the current manual assert style. The test must be runnable via `ctest --preset dev`.

## Architecture Constraints
- Bind to loopback only (127.0.0.1), never 0.0.0.0
- Single-client mode (one WebSocket connection at a time)
- Engine is authoritative — don't let client commands mutate engine state without validation
- No Chrono, OCCT, or protobuf dependencies in this epic
- Keep the code in `native/engine/src/` — one or two new files max (e.g., `transport.cpp`, `transport.h`)

## Done Looks Like
- `cmake --preset dev && cmake --build build/dev` succeeds
- `ctest --preset dev` passes with the handshake test
- Running `./motionlab-engine --port 9001 --session-token abc123` starts a WebSocket server that stays alive
- A WebSocket client can connect, handshake, and receive engineStatus "ready"
- Wrong session token or incompatible protocol version is rejected
- Ctrl+C shuts down cleanly

## What NOT to Build
- Protobuf codegen (Epic 2)
- Any simulation/CAD commands
- Multi-client support
- TLS/encryption (loopback only)
- Reconnection logic (that's the client's job)
```

---

## Prompt 2: Electron Supervision — Engine Spawn + Lifecycle

```
# Epic 1 — Electron Engine Supervision and Process Lifecycle

You are implementing the Electron main process side of Epic 1 for MotionLab. This is a spike — prove it works, don't over-polish.

## Read These First (in order)
- `docs/architecture/principles.md` — non-negotiable rules (especially: Electron is shell, not data bus)
- `docs/architecture/runtime-topology.md` — supervision model
- `apps/AGENTS.md` — app entrypoint rules, known quirks (hoisted node_modules, CommonJS main process, Forge config)
- `plan.md` section "6. Epic 1" — spike-first approach and the 5 questions to answer

## What Exists Now

### `apps/desktop/src/main.ts`
Creates a BrowserWindow with context isolation + sandbox. Loads Forge Vite dev server or packaged HTML. Comments mark "Native engine process supervision (future Epic 1)" as TODO.

### `apps/desktop/src/preload.ts`
Exposes `window.motionlab.platform` and `window.motionlab.getEngineEndpoint()` (stub returning null). The preload surface must stay minimal — only engine connection metadata.

### `apps/desktop/src/renderer.tsx`
Mounts `<App />` from `@motionlab/frontend` in StrictMode. No changes needed here.

### `apps/desktop/src/index.html`
CSP already allows `ws://localhost:*` — the renderer CAN connect to a local WebSocket. This answers one of the spike questions.

### `apps/desktop/forge.config.ts`
- `packagerConfig.asar: true` with empty `extraResource: []`
- Forge VitePlugin handles main, preload, and renderer builds
- The native engine binary will need to go in `extraResource` for packaged builds

### `apps/desktop/vite.main.config.ts`
Externals: `electron`, `@motionlab/frontend`, `@motionlab/protocol`. You may need to add `child_process` if not already handled.

### `apps/desktop/package.json`
Depends on `@motionlab/frontend`, `@motionlab/protocol`, Electron 35, Forge 7.5. Note: no `"type": "module"` — CommonJS main process.

## What to Build

### 1. Engine binary location resolution
The main process needs to find the native engine executable. Two modes:
- **Dev mode:** The binary is at a known relative path from the repo root, e.g., `native/engine/build/dev/motionlab-engine` (or `.exe` on Windows). Use `app.isPackaged` to detect mode.
- **Packaged mode:** The binary is in `extraResource`. Use `process.resourcesPath` to locate it.

Create a helper function `resolveEnginePath(): string` that returns the correct path for the current mode. Throw a clear error if the binary doesn't exist.

### 2. Free port allocation
Before spawning the engine, find a free TCP port. Use Node's `net.createServer` trick:
```ts
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = require('net').createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}
```

### 3. Session token generation
Generate a random session token per launch. This gates the WebSocket connection so only the renderer that knows the token can connect. Use `crypto.randomBytes(16).toString('hex')` or similar.

### 4. Engine process spawn
Use `child_process.spawn` to launch the engine:
```
motionlab-engine --port <port> --session-token <token>
```

Requirements:
- Spawn with `stdio: ['ignore', 'pipe', 'pipe']` — capture stdout and stderr
- Parse stdout for structured status lines: `[ENGINE] status=ready`, `[ENGINE] status=error message="..."`
- Detect engine readiness by watching for `status=ready` on stdout
- Set a startup timeout (e.g., 10 seconds) — if engine doesn't report ready, surface an error
- Store the child process reference for lifecycle management

### 5. Startup race handling
The renderer may be ready before the engine. The sequence must be:
1. Main process spawns engine
2. Main process waits for engine `status=ready` on stdout
3. Main process THEN tells renderer the endpoint via IPC
4. Renderer connects to engine WebSocket

This means the renderer asks for the endpoint and the main process responds only when ready. Use Electron IPC:
- Renderer (via preload): `ipcRenderer.invoke('get-engine-endpoint')`
- Main process: `ipcMain.handle('get-engine-endpoint', ...)` — resolves when engine is ready, rejects on timeout/failure

### 6. Preload surface update
Update `preload.ts` to use IPC instead of returning null:
```ts
contextBridge.exposeInMainWorld('motionlab', {
  platform: process.platform,
  getEngineEndpoint: () => ipcRenderer.invoke('get-engine-endpoint'),
});
```

The return type becomes `Promise<{ host: string; port: number; sessionToken: string }>`. The renderer needs all three to connect.

### 7. Engine crash detection
- Listen for the `exit` event on the child process
- If the engine exits unexpectedly (non-zero code, or before shutdown was requested), log the error and notify the renderer via IPC or by rejecting pending `get-engine-endpoint` calls
- If the engine crashes during an active session, send an IPC event: `engine-status-changed` with state `error`

### 8. Clean shutdown
- On `app.on('before-quit')` or `window-all-closed`: send SIGTERM to the engine process
- Wait briefly for clean exit, then SIGKILL if needed
- On Windows, use `child.kill()` which sends appropriate signal
- Don't quit the app until the engine process has exited

### 9. Forge packaging — extraResource
Update `forge.config.ts` to include the engine binary in packaged builds:
```ts
extraResource: [
  // Dev builds locate the binary via resolveEnginePath()
  // Packaged builds need it bundled here
  // Platform-specific paths will be needed for cross-platform
],
```
For the spike, add a TODO comment with the path strategy. Don't block on packaging — focus on dev mode working first.

### 10. Structured logging
Log engine lifecycle events from the main process:
```
[SUPERVISOR] Spawning engine on port 9001
[SUPERVISOR] Engine PID: 12345
[SUPERVISOR] Engine ready
[SUPERVISOR] Engine exited (code: 0)
```
Use `console.log` — Electron Forge shows these in the terminal during `pnpm dev:desktop`.

## TypeScript Type for the Preload API
Add a type declaration that the renderer can use. In `preload.ts` or a shared types file:
```ts
interface MotionLabAPI {
  platform: string;
  getEngineEndpoint(): Promise<{ host: string; port: number; sessionToken: string }>;
}
declare global {
  interface Window { motionlab: MotionLabAPI; }
}
```

## Architecture Constraints
- Electron supervises but does NOT relay WebSocket data
- The main process never touches simulation frames — renderer connects directly
- Preload surface stays minimal (connection metadata + platform only)
- Context isolation and sandbox must remain enabled
- No Node.js APIs exposed to renderer — everything goes through contextBridge

## Done Looks Like
- `pnpm dev:desktop` launches Electron, which spawns the engine child process
- Terminal shows `[SUPERVISOR] Engine ready` within a few seconds
- The renderer can call `window.motionlab.getEngineEndpoint()` and get `{ host, port, sessionToken }`
- If the engine binary is missing, the app shows a clear error (not a silent hang)
- If the engine crashes, the main process logs it and the renderer is notified
- Closing the app window terminates the engine process cleanly
- CSP is preserved (no new `unsafe-*` directives needed — `ws://localhost:*` already allowed)

## What NOT to Build
- WebSocket client in the main process (that's the renderer's job)
- Any protocol message handling in Electron
- Cross-platform packaging (just Windows dev mode for now; leave TODOs for Mac/Linux)
- Engine restart/reconnection logic (future hardening)
- File dialogs, menus, or any desktop integration beyond engine supervision
```

---

## Prompt 3: Frontend WebSocket Client + Engine Status UX

```
# Epic 1 — Frontend WebSocket Client and Engine Status UX

You are implementing the renderer/frontend side of Epic 1 for MotionLab. This is a spike — prove it works, don't over-polish.

## Read These First (in order)
- `docs/architecture/principles.md` — React is NOT the hot path; frontend owns authoring UX
- `docs/architecture/runtime-topology.md` — renderer connects directly to engine, Electron is not a relay
- `packages/frontend/AGENTS.md` — frontend owns workbench UX, uses Zustand for state, protocol contracts not backend assumptions
- `plan.md` section "6. Epic 1" — spike-first approach

## What Exists Now

### `packages/frontend/src/App.tsx`
Renders header (with protocol version), a test Button, and the Viewport. Engine status display needs to go in the header area.

### `packages/frontend/src/index.ts`
Exports `App` and imports global CSS.

### `packages/frontend/package.json`
Dependencies include `@motionlab/protocol`, `@motionlab/ui`, `@motionlab/viewport`, `zustand ^5.0.0`. Zustand is available but no stores exist yet.

### `packages/protocol/src/version.ts`
Exports `PROTOCOL_VERSION = 1`, `PROTOCOL_NAME = 'motionlab'`, `createHandshake()`, `isCompatible()`. The handshake utilities are already implemented — use them.

### `packages/viewport/src/Viewport.tsx`
Babylon.js scene bootstrap with ArcRotateCamera. Currently uses `new Engine(canvas, true, ...)` which creates a WebGL2 backend. Per `runtime-topology.md`, prefer WebGPU — try `new WebGPUEngine(canvas)` if available, fall back to WebGL2. This is a minor opportunistic change during the spike.

### `apps/desktop/src/index.html` (line 6)
CSP already includes `connect-src 'self' ws://localhost:*` — WebSocket to localhost is allowed. No CSP changes needed.

### `apps/desktop/src/preload.ts`
Will be updated by the Electron agent to expose:
```ts
window.motionlab.getEngineEndpoint(): Promise<{ host: string; port: number; sessionToken: string }>
```
The renderer calls this to discover where the engine is listening.

### `apps/desktop/src/renderer.tsx`
Mounts `<App />`. No changes needed here.

## What to Build

### 1. Engine connection Zustand store (`packages/frontend/src/stores/engine-connection.ts`)
This is the first Zustand store in the project. It manages the WebSocket lifecycle:

```ts
type EngineState =
  | { status: 'discovering' }              // waiting for preload to return endpoint
  | { status: 'connecting'; endpoint: Endpoint }  // WebSocket opening
  | { status: 'handshaking'; endpoint: Endpoint }  // WS open, handshake sent
  | { status: 'ready'; endpoint: Endpoint; engineVersion: string }
  | { status: 'error'; message: string }
  | { status: 'disconnected'; reason: string };
```

The store should expose:
- `state: EngineState` — current connection state
- `connect(): void` — initiate the connection flow
- `disconnect(): void` — clean close
- `sendPing(): void` — keepalive (optional for spike)

### 2. WebSocket client (`packages/frontend/src/engine/connection.ts`)
A plain TypeScript module (not React) that manages the WebSocket:

**Connection flow:**
1. Call `window.motionlab.getEngineEndpoint()` to get `{ host, port, sessionToken }`
2. Open `ws://${host}:${port}`
3. On open: send handshake JSON (use `createHandshake()` from `@motionlab/protocol`):
   ```json
   {
     "type": "handshake",
     "sequenceId": 1,
     "protocol": { "name": "motionlab", "version": 1 },
     "sessionToken": "<from endpoint>"
   }
   ```
4. Wait for `handshakeAck` response. Verify `compatible === true`. Extract `engineVersion`.
5. After handshake: listen for `engineStatus` messages and update the Zustand store
6. On close/error: update store to `disconnected` or `error`

**Message handling:**
- Parse incoming JSON messages
- Route by `type` field: `handshakeAck`, `engineStatus`, `pong`
- Unknown message types: log warning, don't crash

**Error handling:**
- WebSocket `onerror` → store status = `error`
- WebSocket `onclose` → store status = `disconnected`
- Handshake timeout (e.g., 5 seconds) → store status = `error` with message
- `getEngineEndpoint()` rejection (engine failed to start) → store status = `error`

### 3. Connection lifecycle in App.tsx
The App component should initiate connection on mount:

```tsx
import { useEngineConnection } from '../stores/engine-connection';

export function App() {
  const engineState = useEngineConnection((s) => s.state);
  const connect = useEngineConnection((s) => s.connect);

  useEffect(() => { connect(); }, [connect]);
  // ...
}
```

### 4. Engine status indicator in the header
Replace or augment the protocol version display in the header with engine status:

- `discovering` → "Discovering engine..." (muted)
- `connecting` → "Connecting..." (muted)
- `handshaking` → "Handshaking..." (muted)
- `ready` → "Engine ready" (green dot or similar subtle indicator) + engine version
- `error` → "Engine error: <message>" (red, visible)
- `disconnected` → "Engine disconnected" (amber)

Keep it minimal — a single status line in the existing header. No modals, no complex error UX. The point is to see that the connection works.

### 5. Window type declaration
Add the preload API type so TypeScript knows about `window.motionlab`. Create `packages/frontend/src/types/motionlab.d.ts`:

```ts
interface MotionLabEndpoint {
  host: string;
  port: number;
  sessionToken: string;
}

interface MotionLabAPI {
  platform: string;
  getEngineEndpoint(): Promise<MotionLabEndpoint>;
}

declare global {
  interface Window {
    motionlab?: MotionLabAPI;
  }
}
```

Note the `?` — `window.motionlab` won't exist when running in `apps/web` (browser mode without Electron). The connection module should handle this gracefully:
- If `window.motionlab` is undefined → set status to `error` with message "Not running in desktop app"
- This clarifies `apps/web`'s role: it can render the UI but can't connect to an engine (per `apps/AGENTS.md` — dev-mode only, needs mock/stub)

### 6. WebGPU viewport attempt (opportunistic)
In `packages/viewport/src/Viewport.tsx`, try WebGPU first per `runtime-topology.md`:

```ts
import { Engine, WebGPUEngine, ... } from '@babylonjs/core';

// In useEffect:
let engine: Engine;
try {
  const webgpu = new WebGPUEngine(canvas);
  await webgpu.initAsync();
  engine = webgpu;
} catch {
  engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
}
```

If WebGPU causes issues in Electron 35, just keep WebGL2 and leave a comment. Don't block the spike on this.

## File Organization

```
packages/frontend/src/
├── App.tsx                          # updated — engine status in header
├── index.ts                         # updated — export connection store
├── engine/
│   └── connection.ts                # NEW — WebSocket client, JSON protocol
├── stores/
│   └── engine-connection.ts         # NEW — Zustand store for engine state
└── types/
    └── motionlab.d.ts               # NEW — window.motionlab type declaration

packages/viewport/src/
└── Viewport.tsx                     # updated — WebGPU attempt
```

## Architecture Constraints
- React is NOT the hot path — the WebSocket client and message routing are plain TypeScript, not React hooks
- The Zustand store is the bridge between the imperative WebSocket client and React rendering
- No simulation data handling yet — this epic only handles handshake, status, and ping/pong
- The frontend must not assume Electron — check `window.motionlab` existence gracefully
- Don't add `@motionlab/protocol` as a dependency of `@motionlab/viewport` — protocol awareness stays in `@motionlab/frontend`

## Integration Contract (What the Other Two Agents Are Building)

**From Electron (Prompt 2):** `window.motionlab.getEngineEndpoint()` returns a Promise that resolves when the engine is ready. It returns `{ host: '127.0.0.1', port: <number>, sessionToken: '<hex string>' }`. It rejects if the engine fails to start.

**From Native Engine (Prompt 1):** The engine listens on the given port, expects a JSON handshake as the first WebSocket message, validates the session token, and responds with handshakeAck. After handshake, it sends an engineStatus message with state "ready".

## Done Looks Like
- `pnpm dev:desktop` shows the app with "Discovering engine..." → "Connecting..." → "Engine ready" in the header
- The transition happens within a few seconds of launch
- If you kill the engine process, the header shows "Engine disconnected"
- If the engine binary is missing, the header shows "Engine error: ..."
- Running `pnpm dev:web` shows the frontend with "Engine error: Not running in desktop app" (graceful degradation)
- `pnpm --filter @motionlab/frontend typecheck` passes

## What NOT to Build
- Any protocol messages beyond handshake/status/ping/pong
- Reconnection logic (future hardening)
- Simulation data handling or viewport updates from engine
- Complex error recovery UX (modals, retry buttons, etc.)
- Tests (seam test between this and the engine is covered by the native engine test in Prompt 1)
```
