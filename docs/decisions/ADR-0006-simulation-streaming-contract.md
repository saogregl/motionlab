# ADR-0006: Simulation Streaming Contract

## Status
Accepted

## Context
Epic 7.2 wires the SimulationRuntime (Chrono-backed, from 7.1) into the WebSocket transport. The frontend needs to compile mechanisms, control simulation playback, and receive streamed body pose frames. This requires decisions about threading, frame delivery semantics, and protocol boundaries.

## Decision

### Threading model
- A dedicated simulation thread runs independently from the WebSocket message-handling thread.
- `SimulationRuntime` is accessed exclusively from the sim thread after `compile()` completes on the WS thread.
- `sim_command` is protected by a mutex + condition variable; the sim thread waits on it.
- `ix::WebSocket::sendBinary()` is thread-safe (internal send queue), so the sim thread sends frames directly.
- `MechanismState` is accessed only from the WS thread; the sim thread never touches it post-compile.
- Re-compile while running: `stop_sim_thread()` before `compile()`.

### Frame delivery
- `SimulationFrame` events are best-effort: if the sim thread can't keep up with 60fps wall time, frames are skipped. No backpressure mechanism.
- `SimulationStateEvent` events are reliable (sent on every state transition).
- Frame delivery rate (~60fps) is independent of physics timestep (0.001s). Multiple physics steps are batched per frame.
- Frames are ordered but may have `step_count` gaps (frames are snapshots, not a complete log).

### Protocol boundaries
- No Chrono-specific concepts leak into the protocol. `SimulationFrame` uses `BodyPoseData` (body_id + position + orientation) and `JointStateData` (joint_id + position + velocity + reaction forces).
- `SimStateEnum` maps to the engine's `SimState` enum; the frontend never sees Chrono types.
- `CompileMechanismCommand` is empty — the engine compiles from its current `MechanismState`, avoiding the need to serialize the full mechanism over the wire.

### MechanismState extension
- `BodyEntry` now stores full pose and mass property data (populated during import).
- `build_mechanism_proto()` constructs a `Mechanism` proto from current state for simulation compilation.
- Both fresh-import and cache-hit paths call the extended `add_body()` overload.

## Consequences
- Frontend can compile, play, pause, step, and reset simulations via the existing WebSocket connection.
- Viewport integration (consuming `SimulationFrame` for live rendering) is deferred to Epic 7.3.
- Store integration (tracking sim state in Zustand) is deferred to Epic 7.3.
- The sim thread model is simple (single consumer) and can be extended with priority commands or backpressure in later epics.
