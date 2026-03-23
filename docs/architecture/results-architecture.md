# Results Architecture

Results are owned by a channel-based runtime layer that supports both live and replay access through one logical model.

## Durable Rules

- Runs are immutable artifacts.
- Live and replay share one logical channel schema.
- Not all data families are stored the same way.
- High-frequency pose/trace data must be bounded and queryable.
- Large raster and blob outputs are opt-in for recording.

## Data Families

- pose streams
- scalar and vector traces
- sparse events
- raster frame streams
- point-cloud or blob frame streams

## MVP Scope

The following capabilities are required for MVP (Epics 7-8):

- Pose streams (body transforms during simulation playback)
- Scalar and vector traces (joint coordinates, reactions, authored load outputs, actuator outputs)
- Bounded live buffers for the current simulation session
- Basic replay from buffered run data (scrub/seek within a completed run)
- Immutable run identity (each run gets a stable ID and cannot be mutated after completion)

The following are part of the long-term design but explicitly deferred past MVP:

- Sparse event streams
- Raster frame streams and point-cloud/blob frame streams
- Opt-in recording policies (MVP records all active channels)
- Chunked summaries for efficient large-run charting
- Explicit frame indexing for large sensor outputs
- Persistent run storage across sessions (MVP keeps runs in memory; persistence is Epic 9)

## Scrub Flow (Epic 8)

Scrubbing allows the user to navigate to arbitrary simulation times:

1. **TimelineScrubber** fires `onSeek` on mousemove during drag.
2. **TimelinePanel** throttles these to ≤30/s and auto-pauses a running simulation before sending `sendScrub(time)`.
3. The engine processes the scrub command from the bounded live ring buffer, emits a historical `SimulationFrame` for body poses, emits `SimulationTrace` windows for active scalar/vector channels, and publishes a paused `SimulationState` event.
4. The frontend updates `simTime` in the simulation store.
5. **ChartPanel** draws a dashed vertical scrub marker at `simTime` via a uPlot `draw` hook plugin. The marker redraws on `simTime` changes even when no new trace data arrives.

## Trace Store & Chart Pipeline (Epic 8)

- **TraceStore** (`stores/traces.ts`) — Zustand store holding channel metadata and per-channel `StoreSample[]` arrays. Bounded by `MAX_TRACE_SECONDS` (60s rolling window).
- **ChartPanel** — Creates a uPlot instance per active-channel set. An imperative data pump subscribes to trace store changes outside React, batched by `requestAnimationFrame`. Selection-linked channel activation maps body/joint selection to their output channels.
- **Body Pose Cache** (`stores/body-poses.ts`) — Module-level `Map<string, BodyPose>` updated imperatively from the `simulationFrame` handler. Not a Zustand store to avoid triggering React re-renders on the hot path. Used by `BodyInspector` for live pose readout.

## Storage Direction

- bounded live buffers for current sessions
- immutable replay artifacts for persisted runs
- chunking and summaries for efficient charting and scrubbing
- explicit frame indexing for large sensor outputs

## Current Native Buffering

- The native ring buffer stores body poses, per-frame channel values, and a per-frame channel lookup table keyed by channel ID.
- Trace streaming and scrub reuse that lookup table so channel extraction remains bounded even as joint, load, and actuator coverage expands.
