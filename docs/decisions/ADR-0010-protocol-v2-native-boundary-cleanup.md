# ADR-0010: Protocol v2 Native Boundary Cleanup

## Status

Accepted

## Context

The native engine and protocol contract had drifted in several boundary-sensitive areas:

- `motionlab.mechanism.Body.source_asset_ref` was still a `string` even though import results already exposed a structured `AssetReference`.
- `ImportOptions.unit_system` existed in the transport contract but the native engine ignored it.
- `UpdateDatumPoseCommand` existed in the transport schema but was not implemented natively.
- The runtime contract exposed `PAUSED`, but the native engine did not publish a real paused state consistently.

That drift made the product contract lossy, versioning inaccurate, and save/load behavior weaker than the documented architecture.

## Decision

We introduce protocol version 2 and align the native boundary with the product contract:

- `PROTOCOL_VERSION` is bumped from `1` to `2`.
- `motionlab.mechanism.Body.source_asset_ref` becomes `AssetReference`.
- Native import validates source CAD units (`millimeter`, `meter`, `inch`) and normalizes imported length data into meters before publishing mechanism or import results.
- Native transport implements `UpdateDatumPoseCommand`.
- Native runtime publishes a real `PAUSED` state after compile, pause, step-once, and scrub.

## Consequences

Positive:

- The product contract preserves asset provenance through import, save, and load.
- Import unit handling is explicit and deterministic.
- Live runtime state matches documented transport semantics.
- Frontend and engine compatibility is forced through an explicit protocol-version boundary.

Tradeoffs:

- Frontend and engine must upgrade together to protocol v2.
- Existing test fixtures and generated bindings must be regenerated and updated in lockstep.
- Import callers now receive a validation failure for unsupported unit strings instead of silent fallback behavior.
