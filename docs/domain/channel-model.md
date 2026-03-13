# Channel Model

Channels are the durable way to describe runtime outputs across live mode and replay mode.

## Expectations

- Every meaningful runtime output has a stable channel descriptor.
- Channels are typed and named in product-facing terms.
- Frontend consumers should not need backend-specific knowledge to subscribe to or query outputs.

## Typical Channel Families

- body and joint state
- diagnostics and events
- sensor traces
- image or blob outputs
- replay query results
