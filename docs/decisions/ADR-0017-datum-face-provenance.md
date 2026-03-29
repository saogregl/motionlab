# ADR-0017: Datum Face Provenance and Geometry-Aware Updates

Status: Accepted

Date: 2026-03-29

## Context

ADR-0013 split authored `Body` and `Geometry`, and ADR-0016 moved face picking to `geometry_id + face_index`. That fixed topology ownership, but authored datums still behaved like plain body-local frames after creation:

- face-created datums lost the information about which geometry face created them
- geometry-local operations such as `UpdateGeometryPose`, `ReparentGeometry`, and `SplitBody` had no principled way to move only the datums that belong to the moved geometry
- `MakeCompoundBody` could preserve world poses during merge, but follow-up movement depended on frontend scene rebuild behavior rather than a durable datum contract
- planar and axis-like datums had no persistent semantic viewport glyph after creation

This left compound-body authoring and geometry restructuring with inconsistent datum behavior.

## Decision

1. **Face-created datums carry optional face provenance in `motionlab.mechanism.Datum`.**
   The datum schema gains optional `source_geometry_id`, `source_face_index`, `source_geometry_local_pose`, `surface_class`, and `face_geometry`. These fields are present only for datums created from authoritative geometry faces or native face-pair analysis.

2. **Geometry-level authored mutations become datum-aware.**
   `UpdateGeometryPose`, `AttachGeometry`, `ReparentGeometry`, `SplitBody`, `MakeCompoundBody`, and primitive regeneration return `updated_datums` when they change datum parentage or local pose. Only datums whose `source_geometry_id` matches the moved geometry are updated automatically.

3. **Body-local manual datums remain body-owned.**
   Datums created without face provenance keep the existing authored behavior: body moves carry them with the body, and geometry-only operations do not infer ownership for them.

4. **`DetachGeometry` is rejected when face-linked datums still depend on that geometry.**
   The engine does not silently strand face-authored datums on the old body.

5. **The viewport renders semantic datum visuals durably.**
   Planar datums render a plane glyph, cylindrical/conical/toroidal datums render an axis glyph, and bodies remain represented in the scene graph even when they own zero geometries so datums, joints, and loads on empty bodies stay visible.

## Consequences

- Compound-body creation now has a durable authored rule:
  merging preserves datum world poses while reparenting to the compound, and later movement of the compound carries those datums with it.
- Geometry restructuring operations can move the correct datums without reinterpreting body-local manual datums as geometry-owned.
- Save/load now preserves datum provenance and semantic rendering metadata.
- Frontend and engine consumers must treat datum updates as possible side effects of geometry operations, not only body moves.
- Topology-breaking edits can clear provenance when the original face identity is no longer trustworthy.

## Notes

- This ADR extends ADR-0007 and ADR-0016 rather than replacing them.
- The transport remains backend-agnostic: provenance is expressed in authored geometry IDs, face indices, poses, and semantic surface metadata, not OCCT-native handles.
