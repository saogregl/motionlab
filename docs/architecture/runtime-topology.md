# Runtime Topology

## Current Runtime Topology

- The native engine (`native/engine`) listens on a loopback WebSocket (`127.0.0.1:<port>`) and performs a JSON handshake with session token and protocol version validation. It uses `ixwebsocket` for transport and `nlohmann-json` for serialization. Single-client only.
- `apps/desktop` will launch the engine process and expose the desktop shell (not yet implemented — Epic 1, Prompt 2).
- The renderer/frontend will connect through versioned protocol contracts (not yet implemented — Epic 1, Prompt 3).
- `apps/web` reuses the shared frontend without local native-process supervision.

## Target Runtime Topology (Planned)

> The following describes the intended topology. These capabilities are not yet implemented.

- The native engine owns runtime lifecycle, geometry processing, simulation compilation, and results production.
- The desktop app supervises and packages the local runtime but does not proxy high-frequency simulation data.
- The viewport consumes runtime updates through stable contracts and keeps playback imperative.
- Capability-sensitive features, such as future Chrono sensor rendering paths, must be detected and surfaced gracefully.

## Rendering Backend

The viewport uses Babylon.js 7.x, which supports both WebGL2 and WebGPU backends. **Prefer WebGPU** — it is more future-proof for large assemblies, dense sensor visualization, and GPU-driven overlays. Babylon abstracts the backend, so the switch is a one-line engine init change.

Validate WebGPU in the Epic 1 spike (Electron 35 + current GPU drivers). Fall back to WebGL2 only if platform-specific issues surface. Either way, avoid WebGL-only API calls in viewport code — use Babylon's backend-agnostic abstractions.

## Guardrails

- Do not turn Electron into a simulation data relay.
- Do not make the viewport authoritative for authored state.
- Do not let backend runtime objects escape the native boundary.
