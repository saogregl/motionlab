# ADR-0007: Face-Level Datum Creation Contract

- Status: Accepted
- Date: 2026-03-19
- Decision makers: MotionLab team

## Context

Epic 10 upgrades datum authoring from point-and-normal picking to topology-aware face picking. The engine must classify the picked face and compute the datum pose from authoritative B-Rep geometry, while the viewport must still provide interactive face hover and click feedback.

This introduces two durable contract questions:
- what topology data is allowed to cross the frontend/native boundary
- how create-datum mode behaves when a click cannot be resolved to a topological face

## Decision

1. **Face-aware datum creation is engine-authoritative.** The frontend sends `body_id + face_index + name`; the engine classifies the face and computes the local datum pose.

2. **The engine retains imported B-Rep shapes locally for topology queries.** Persisted shapes remain native-only implementation detail and do not become part of the authored mechanism model.

3. **`part_index` is the only topology metadata that crosses the wire for MVP face picking.** It provides per-face triangle counts so the viewport can resolve Babylon triangle hits back to B-Rep faces without exposing OCCT objects or backend-specific topology classes.

4. **Create-datum mode is face-only in Epic 10.** If a pick cannot be resolved to a B-Rep face, the frontend does not fall back to the Epic 5 point+normal path and instead surfaces a non-modal message.

5. **Faces are transient interaction targets, not first-class selected authored entities.** Face hover/highlight stays inside the viewport runtime and does not enter the durable selection model or mechanism state.

## Consequences

- Positive: The engine remains the authority for geometry semantics and datum placement.
- Positive: The protocol stays backend-agnostic because only integer topology metadata crosses the boundary.
- Positive: The viewport can provide deterministic per-face highlight without owning product truth.
- Tradeoff: Cached imports must rehydrate native shape state before face-aware datum creation can succeed.
- Tradeoff: Users lose the imprecise Epic 5 fallback in create-datum mode and must click resolvable faces.
