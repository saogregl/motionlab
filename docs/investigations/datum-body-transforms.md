# Investigation: Datum/Body Transform Pipeline & Make-Body Position Shifts

**Date:** 2026-03-28
**Status:** Investigation complete, action items identified
**Triggered by:** User-reported issues — datums moving to wrong positions when translating bodies/geometries; unexpected position shifts when using "Make Body"

---

## Context

Two related symptoms were observed:
1. Moving a body/geometry causes its datums to appear at incorrect positions.
2. Using "Make Body" on multiple components shifts them to a different position.

Both issues touch the same transform composition pipeline spanning frontend store, protocol, native engine, and viewport rendering.

---

## How Datums Work Today

### Ownership Model

Datums are **parented to bodies, not geometries**. Each datum stores:
- `parent_body_id` — the body it belongs to (schemas/mechanism/mechanism.proto:170)
- `local_pose` — position + orientation **relative to the parent body** (mechanism.proto:171)

Datums have **no direct reference to any geometry**. When a datum is created from a face pick, the face's geometry-local position is composed with the geometry's local-to-body transform to produce a body-local pose:

```
datum.local_pose = compose(geometry.local_pose, face_pose_in_geometry_space)
```

This happens in `transport.cpp:688-693`.

### Rendering (Three.js Hierarchy)

In the viewport, datums are added as **children of the body's Group node** with their `local_pose` applied. Three.js automatically computes:

```
datum_world_matrix = body_world_matrix * datum_local_matrix
```

So moving the body naturally moves datums in the viewport — no extra work needed.

### Co-Translation on Body Move

When a body's pose changes via `UpdateBodyCommand`, the engine runs `co_translate_datums()` (mechanism_state.cpp:825-900). This **preserves datum world positions** by recalculating local poses under the new body pose:

```
for each datum on body:
    world_pos = old_body_rot * datum.local_pos + old_body_pos
    new_local_pos = inv(new_body_rot) * (world_pos - new_body_pos)
    datum.local_pose = new_local_pos, new_local_orient
```

Updated datums are sent back in `UpdateBodyResult.updated_datums` and applied by the frontend (connection.ts:1375-1390).

### Joint References

Joints reference datums by **live ID** (`parent_datum_id`, `child_datum_id`), not position snapshots (mechanism.proto:237-238). When datums move, joints automatically see updated positions on next resolution. No cache invalidation needed.

---

## Issue 1: Datum Position Drift on Body Translation

### Expected Behavior

When a user translates a body, datums should **stay fixed in world space** (co-translation). The user's intent is "move the body, leave the datums where they are." Alternatively, if the intent is "move everything together," datums should move with the body.

### Current Design Intent

The current design **preserves datum world positions** on body moves. This means translating a body by +1 on X causes each datum's local_pose to shift by -1 on X (in body space), so the datum stays put in world space.

### Potential Failure Modes

| # | Failure Mode | Likelihood | Evidence |
|---|-------------|-----------|----------|
| 1 | **Co-translation not called** — body pose updated without running `co_translate_datums` | Low | Code at transport.cpp:999 calls it on every pose update |
| 2 | **Frontend ignores updated_datums** — engine sends corrected poses but frontend discards them | Low | connection.ts:1375-1390 applies them |
| 3 | **Double-application in Three.js** — datum local_pose updated in store AND Three.js auto-composes with new body matrix, causing double offset | **Medium** | The scene graph calls `updateDatumPose()` which sets the local matrix. If the body also moved in the same frame, the composition is `new_body * new_local`, which should be correct. But timing matters — if the body update and datum update happen in different render frames, there's a transient glitch. |
| 4 | **Quaternion composition error in co_translate_datums** — orientation component of local_pose incorrectly recomputed for rotated bodies | **Medium** | Tests exist for translation and 90-degree rotation cases (test_mechanism_state.cpp:704-826), but edge cases with combined translation+rotation may not be covered. |
| 5 | **User actually wants datums to move WITH the body** — co-translation "corrects" positions the user didn't want corrected | **High (UX)** | This is a design question, not a bug. Most CAD tools would move datums with the body. The current behavior (world-space pinning) may be surprising. |

### Recommended Actions

- **A1:** Add a flag to `UpdateBodyCommand` to opt in/out of co-translation. Default should probably be **datums move with the body** (no co-translation), with an explicit "pin datums" mode for advanced users.
- **A2:** Add integration tests for combined translation+rotation co-translation.
- **A3:** Verify that the frontend applies body pose and datum pose updates atomically in the same render cycle to avoid transient glitches.

---

## Issue 2: Position Shifts on "Make Body"

### What Make-Body Does

1. Computes each geometry's **world pose**: `world = old_body_pose * geometry.local_pose` (mechanism_state.cpp:476-500)
2. Computes the **centroid** of all geometry world positions as the new body's origin (mechanism_state.cpp:503-509)
3. Creates the new body at the centroid with **identity rotation** (mechanism_state.cpp:510)
4. For each geometry, computes a new local pose: `new_local = inverse(centroid_pose) * world_pose` (mechanism_state.cpp:512-526)
5. Dissolves empty old bodies; marks non-empty ones as "modified" (mechanism_state.cpp:537-571)

### Why Positions Shift

The **centroid becomes the new body origin**. Before make-body, each geometry was positioned relative to its own body's origin. Afterward, all geometries share a single body whose origin is at their collective centroid.

If the viewport renders the body's origin marker or the body is referenced by other transforms, the visual anchor shifts to the centroid. **This is mathematically correct** — the geometry world positions are preserved — but the **apparent center of the object moves**.

### What About Datums?

**Datums are NOT re-parented during make-body.** This is the most critical finding.

When geometries move from old bodies to the new compound body:
- If the old body had datums **and** joints referencing those datums: the old body is **kept** (as "modified", now empty of geometries) and datums remain parented to it. The datums' `local_pose` values are still relative to the **old body's pose**, which hasn't changed. This is correct but confusing — the datums appear to "float" at their old positions attached to an invisible empty body.
- If the old body had datums but **no** joints: the old body is dissolved, and **datums are cascade-deleted** (mechanism_state.cpp:136-207). This means datum work is lost.
- If the old body had no datums: clean dissolution.

**The MakeCompoundBodySuccess response does NOT include datum updates** (transport.proto:546-558). The frontend has no code to re-parent or adjust datums after make-body.

### Verified: No Quaternion Ordering Bug

The quaternion ordering was verified across all boundaries:
- Proto: `{w, x, y, z}` field order
- Deserialization: JS object with named properties
- Frontend arrays: `[x, y, z, w]` (connection.ts:502, 1673)
- Three.js `quaternion.set(x, y, z, w)`: matches (scene-graph-three.ts:275-280)

### Recommended Actions

- **B1:** The centroid shift is by design, but users expect "merge without moving." Consider offering a mode where the first body's origin is kept as the compound body's origin instead of computing a centroid.
- **B2 (Critical):** Re-parent datums to the new compound body during make-body. Compute new `local_pose` values relative to the compound body's pose, analogous to how geometries are re-parented. Update the `MakeCompoundBodySuccess` message to include `repeated Datum updated_datums`.
- **B3:** If re-parenting is not desired, at minimum warn the user that datums on merged bodies will be deleted or orphaned.
- **B4:** Add test coverage for make-body with datums present.

---

## Issue 3: Moving a "Geometry" vs. Moving a "Body"

### Current Protocol

There is **no command to move a geometry independently within a body**. The available operations are:
- `UpdateBodyCommand` — moves the whole body (and all its children)
- `AttachGeometryCommand` — (re)attach with a new local_pose
- `ReparentGeometryCommand` — move geometry between bodies (preserves world position)
- `DetachGeometryCommand` — remove from body entirely

If the user is "moving a geometry," they are actually moving the **body** that contains it. All datums on that body get co-translated.

### Recommended Actions

- **C1:** If geometry-level translation is needed, implement `UpdateGeometryPoseCommand` that adjusts the geometry's `local_pose` within its body. This would also need to co-translate any datums that were placed on faces of that geometry (requires tracking datum-to-geometry association, which doesn't exist today).

---

## Architecture Summary

```
                      ┌──────────────────────┐
                      │    Body (world pose)  │
                      │   origin = centroid   │
                      └────────┬─────────────┘
                   ┌───────────┼───────────────┐
                   ▼           ▼               ▼
            ┌───────────┐ ┌───────────┐  ┌──────────┐
            │ Geometry A │ │ Geometry B │  │ Datum 1  │
            │ local_pose │ │ local_pose │  │local_pose│
            └───────────┘ └───────────┘  └──────────┘
                                               │
                                          referenced by
                                               ▼
                                         ┌───────────┐
                                         │   Joint    │
                                         │ (by ID)    │
                                         └───────────┘
```

- Datums are peers of geometries under a body, not children of geometries.
- Datums don't know which geometry's face they originated from (no `source_geometry_id` stored).
- Joints hold live references to datums, not position snapshots.

---

## Key Files

| Area | File | Key Lines |
|------|------|-----------|
| Datum proto | `schemas/mechanism/mechanism.proto` | 168-173 |
| Joint proto | `schemas/mechanism/mechanism.proto` | 234-255 |
| Transport commands | `schemas/protocol/transport.proto` | 208-212, 248-252, 332-335, 546-558 |
| Datum CRUD | `native/engine/src/mechanism_state.cpp` | 764-900 |
| Co-translation | `native/engine/src/mechanism_state.cpp` | 825-900 |
| Make compound body | `native/engine/src/mechanism_state.cpp` | 452-574 |
| Body deletion cascade | `native/engine/src/mechanism_state.cpp` | 121-211 |
| Pose math | `native/engine/src/pose_math.h` | 40-66 |
| Transport handler (body update) | `native/engine/src/transport.cpp` | 955-1008 |
| Transport handler (make body) | `native/engine/src/transport.cpp` | 1185-1253 |
| Transport handler (datum from face) | `native/engine/src/transport.cpp` | 639-750 |
| Frontend store | `packages/frontend/src/stores/mechanism.ts` | 69-76 (datum), 78-88 (joint) |
| Frontend connection | `packages/frontend/src/engine/connection.ts` | 492-520, 1375-1390, 2248-2343 |
| Scene graph (datums) | `packages/viewport/src/scene-graph-three.ts` | 1302-1420 |
| Scene graph (bodies) | `packages/viewport/src/scene-graph-three.ts` | 984-1170 |
| Datum face pick | `packages/frontend/src/utils/datum-face-pick.ts` | 1-29 |
| Body merge utility | `packages/frontend/src/utils/body-merge.ts` | 115-150 |

---

## Prioritized Action Items

| Priority | ID | Issue | Action |
|----------|----|-------|--------|
| P0 | B2 | Datums lost/orphaned on make-body | Re-parent datums to compound body with corrected local_pose |
| P1 | A1 | Co-translation may not match user intent | Add opt-in/out; default to "datums move with body" |
| P1 | B1 | Centroid shift surprises users | Offer "keep first body origin" mode |
| P2 | B3 | Silent datum loss | Warn user before make-body if datums exist |
| P2 | A3 | Possible render-frame timing glitch | Verify atomic body+datum update in viewport |
| P3 | C1 | No per-geometry move | Add UpdateGeometryPoseCommand if needed |
| P3 | A2 | Co-translation edge cases | Add combined translation+rotation test |
| P3 | B4 | Missing test coverage | Test make-body with datums |
