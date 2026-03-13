# Runtime Topology

## Current Runtime Topology

- `apps/desktop` launches the native engine process and exposes the desktop shell.
- The renderer/frontend connects through versioned protocol contracts.
- `apps/web` reuses the shared frontend without local native-process supervision.

## Target Runtime Topology

- The native engine owns runtime lifecycle, geometry processing, simulation compilation, and results production.
- The desktop app supervises and packages the local runtime but does not proxy high-frequency simulation data.
- The viewport consumes runtime updates through stable contracts and keeps playback imperative.
- Capability-sensitive features, such as future Chrono sensor rendering paths, must be detected and surfaced gracefully.

## Guardrails

- Do not turn Electron into a simulation data relay.
- Do not make the viewport authoritative for authored state.
- Do not let backend runtime objects escape the native boundary.
