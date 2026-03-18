# ADR-0004: Datum CRUD Contract

- Status: Accepted
- Date: 2026-03-17
- Decision makers: MotionLab team

## Context

Datums are coordinate frames mounted on bodies that serve as attachment points for joints, sensors, and measurements. They are the first authored entities created through explicit user commands (as opposed to import, which is read-only ingest).

We need a contract pattern for authoring commands that:
- Keeps the engine as the authoritative source for entity state
- Returns full entity state on success so the frontend store stays in sync
- Reports errors without ambiguity
- Generalizes to future authored entities (joints, sensors)

## Decision

1. **Datums are engine-authoritative authored entities.** The engine generates UUIDv7 IDs, validates parent body existence, and stores authoritative state in `MechanismState`.

2. **CRUD uses the Command→Result oneof pattern.** Each command (Create/Delete/Rename) has a corresponding result message using a `oneof result` containing either the success payload or an `error_message` string.

3. **UUIDv7 IDs are generated engine-side.** The frontend never mints entity IDs — it sends creation commands and receives the engine-assigned ID in the result.

4. **MechanismState is the in-process authoritative model.** It stores plain C++ types (not proto) and converts at the transport boundary.

5. **The frontend store is a projection of engine state via events.** The Zustand store applies mutations only in response to successful result events from the engine.

6. **This pattern will be reused for joints (Epic 6) and sensors.** The Command→Result oneof pattern is the standard for all authored entity CRUD.

## Consequences

- Positive: Single source of truth in the engine prevents state divergence.
- Positive: The oneof result pattern provides type-safe success/error discrimination in both TS and C++.
- Positive: Generalizable — joints and sensors will follow the same contract shape.
- Tradeoff: Every mutation requires a round-trip to the engine. Optimistic UI updates are not used; the store waits for engine confirmation.
- Follow-up: Joint CRUD (Epic 6) and sensor CRUD will add analogous messages to the protocol.
