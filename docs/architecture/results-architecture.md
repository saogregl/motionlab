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

## Storage Direction

- bounded live buffers for current sessions
- immutable replay artifacts for persisted runs
- chunking and summaries for efficient charting and scrubbing
- explicit frame indexing for large sensor outputs
