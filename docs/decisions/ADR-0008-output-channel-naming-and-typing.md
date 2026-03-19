# ADR-0008: Output Channel Naming, Typing, and Trace Streaming

## Status

Accepted

## Context

Epic 7 delivered simulation compilation, stepping, and frame streaming (body poses + joint states at ~60fps). However, the engine has no way to:

1. **Describe** what engineering outputs a simulation produces (channel descriptors)
2. **Stream** time-series trace data (scalar/vector values) separately from body poses
3. **Scrub** back to a historical simulation time

Consumers (charts, data export, timeline) need a stable contract for discovering, subscribing to, and replaying simulation outputs.

## Decision

### Channel ID Convention

Channel IDs follow the pattern `<entity_type>/<entity_id>/<measurement>`:

- `joint/<uuid>/position` — generalized coordinate
- `joint/<uuid>/velocity` — generalized velocity
- `joint/<uuid>/reaction_force` — constraint force vector
- `joint/<uuid>/reaction_torque` — constraint torque vector

This convention is extensible to future entity types (e.g., `sensor/<uuid>/value`).

### Data Types

Two data types are supported:

| Type | Proto Enum | Description |
|------|-----------|-------------|
| SCALAR | `CHANNEL_DATA_TYPE_SCALAR` | Single `double` value |
| VEC3 | `CHANNEL_DATA_TYPE_VEC3` | Three-component vector (`Vec3` proto) |

### Units

Units are explicit and SI-based:

| Measurement | Revolute | Prismatic |
|-------------|----------|-----------|
| Position | `rad` | `m` |
| Velocity | `rad/s` | `m/s` |
| Reaction Force | `N` | `N` |
| Reaction Torque | `Nm` | `Nm` |

### Channel Manifest

Channel descriptors are sent once in `CompilationResultEvent.channels` after a successful mechanism compile. Each `OutputChannelDescriptor` contains: `channel_id`, human-readable `name`, `unit`, and `data_type`.

### Trace Batching

- Trace data (`SimulationTrace` events) is streamed at lower frequency than body poses.
- Channels are sent round-robin to spread bandwidth evenly.
- Batch interval: every 10 display frames (~6 batches/second).
- Each batch contains samples from the ring buffer for one channel.

### Ring Buffer

- 60-second retention (configurable), indexed by `sim_time`.
- `std::deque` storage for O(1) push/pop, `std::lower_bound` for O(log n) lookup.
- `std::shared_mutex` allows concurrent reads (scrub on WS thread) without blocking writes (sim thread).
- Stores one frame per display interval (~60fps), not per physics step.

### Scrub

- `ScrubCommand` pauses simulation and returns historical data.
- Engine looks up nearest buffered frame and sends `SimulationFrame`.
- Engine also sends `SimulationTrace` events for all channels in a ±1s window around the scrub time.
- Engine sends `SimulationStateEvent` with PAUSED state.

## Consequences

- Chart and timeline consumers can discover available channels from the compilation result.
- Trace data is decoupled from body pose streaming, allowing independent update rates.
- Scrub works within the ring buffer window (last 60s); older data requires replay or persistence (future work).
- Round-robin batching prevents any single channel from monopolizing bandwidth.
- The channel ID convention is stable enough for persistence and cross-session references.
