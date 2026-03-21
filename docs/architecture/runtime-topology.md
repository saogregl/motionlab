# Runtime Topology

## Current Runtime Topology

- The native engine (`native/engine`) listens on a loopback WebSocket (`127.0.0.1:<port>`) and performs a binary protobuf handshake with session token and protocol version validation. It uses `ixwebsocket` for transport. Single-client only.
- The WebSocket callback thread is no longer responsible for executing heavy engine commands. Authenticated commands are routed onto a dedicated native worker queue so import, compile, save/load, and scrub work do not block socket parsing or ping handling.
- `apps/desktop` will launch the engine process and expose the desktop shell (not yet implemented — Epic 1, Prompt 2).
- The renderer/frontend will connect through versioned protocol contracts (not yet implemented — Epic 1, Prompt 3).
- `apps/web` reuses the shared frontend without local native-process supervision.

## Target Runtime Topology (Planned)

> The following describes the intended topology. These capabilities are not yet implemented.

- The native engine owns runtime lifecycle, geometry processing, simulation compilation, and results production.
- Imported B-Rep shapes may be retained natively after import so the engine can answer topology-sensitive authoring commands such as face-aware datum creation.
- Imported CAD units are normalized inside the native boundary before authored mechanism bodies are published to the application contract.
- The desktop app supervises and packages the local runtime but does not proxy high-frequency simulation data.
- The viewport consumes runtime updates through stable contracts and keeps playback imperative.
- Capability-sensitive features, such as future Chrono sensor rendering paths, must be detected and surfaced gracefully.

## Rendering Backend

The viewport uses Babylon.js 7.x, which supports both WebGL2 and WebGPU backends. **Prefer WebGPU** — it is more future-proof for large assemblies, dense sensor visualization, and GPU-driven overlays. Babylon abstracts the backend, so the switch is a one-line engine init change.

Validate WebGPU in the Epic 1 spike (Electron 35 + current GPU drivers). Fall back to WebGL2 only if platform-specific issues surface. Either way, avoid WebGL-only API calls in viewport code — use Babylon's backend-agnostic abstractions.

## Frame Streaming Path (Epic 8)

The engine sends `SimulationFrame` events containing body poses at the simulation tick rate. The frontend `connection.ts` handler:

1. Measures FPS (module-level counter, exposed via `getMeasuredFps()`).
2. Applies frame skipping for sub-1x playback speeds (e.g., 0.5x skips every other frame).
3. Updates `SceneGraphManager` body transforms (viewport hot path).
4. Caches body poses in the module-level `body-poses.ts` map for inspector readout.

The body-poses module is intentionally not a Zustand store to avoid React re-renders on every simulation frame. Inspectors read from it imperatively, using `simTime` subscription as a low-frequency refresh trigger.

## Native Runtime Notes

- Successful compile transitions the runtime into a paused-ready state before play begins.
- Scrub is served from the engine ring buffer and publishes both a historical `SimulationFrame` and channel traces for the requested window.
- Trace extraction uses per-frame joint lookup tables inside the ring buffer path so scrub/trace cost does not require repeated linear scans across every joint state sample.

## Guardrails

- Do not turn Electron into a simulation data relay.
- Do not make the viewport authoritative for authored state.
- Do not let backend runtime objects escape the native boundary.
