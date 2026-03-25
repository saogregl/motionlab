# ADR-0016: Geometry-Local Face Picking

- Status: Accepted
- Date: 2026-03-24
- Decision makers: MotionLab team

## Context

ADR-0013 separated Body and Geometry in the authored model, but the viewport and face-aware datum flow still treated a body as one merged render mesh. That left several correctness gaps:

- merged `part_index` data no longer matched the `BodyGeometryIndex` contract for multi-geometry bodies
- geometry `local_pose` could be ignored in picking/highlight paths
- face-aware datum creation still crossed the protocol boundary as `body_id + face_index`, even though native topology ownership is geometry-local
- Storybook STEP fixtures defaulted to millimeter output, which made viewport-scale validation diverge from the native meter-normalized import path

These gaps showed up most clearly on overlapping or nested CAD parts, where hover and click identity became inconsistent.

## Decision

1. **Face-aware picking identity is `geometry_id + face_index`.**
   The frontend may still carry `bodyId` for selection and UI context, but topology-sensitive authoring commands resolve directly on geometry-local face identity.

2. **Viewport topology stays per geometry, not per merged body mesh.**
   Scene graph bodies own transforms and aggregate selection state. Child geometry meshes own render topology, `part_index`, BVH state, and face preview caches.

3. **Hover and highlight remain transient runtime state.**
   Face hover/highlight is tracked as `{ bodyId, geometryId, faceIndex }` inside the viewport runtime and does not become an authored entity or durable selection type.

4. **Storybook STEP imports are normalized to meters.**
   Browser-side STEP loading must request meter output so viewport stories exercise approximately the same scale assumptions as the native engine import path.

5. **Protocol version 5 codifies the clean break.**
   `CreateDatumFromFaceCommand` sends `geometry_id`, and `CreateDatumFromFaceSuccess` returns `geometry_id` alongside `face_index` and `FaceSurfaceClass`.

## Consequences

### Positive

- Multi-geometry bodies and attached geometry local poses pick correctly.
- The native engine receives the exact topology owner for face-aware datum creation.
- Viewport hover/highlight and click resolution use the same identity model.
- STEP stories become useful again for scale-sensitive picking validation.

### Tradeoffs

- This is a breaking protocol and viewport API change.
- Frontend bridge code must rebuild bodies as geometry children instead of merged meshes.
- Legacy helpers that merge body geometry are no longer authoritative for face-aware workflows.
