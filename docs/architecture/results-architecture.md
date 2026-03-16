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
- Scalar and vector traces (joint state, reaction forces/torques)
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

## Storage Direction

- bounded live buffers for current sessions
- immutable replay artifacts for persisted runs
- chunking and summaries for efficient charting and scrubbing
- explicit frame indexing for large sensor outputs
