# Epics: Transform UX & Engine Simplification

**Date:** 2026-03-28
**Source:** `datum-body-transforms.md`, `transform-consistency-audit.md`, `ux-enhancement-proposals.md`

---

## Dependency & Parallelism Map

```
             ┌─────────────────────────────────────────────────────┐
 PARALLEL    │  E1          E2          E3          E4         E5  │
 PHASE 1     │  Inspector   Body Ops    Chrono      Viewport   Gizmo│
             │  UX          Engine      Overhaul    Viz        Snap │
             │  (frontend)  (eng+fe)    (engine)    (viewport) (vp) │
             └──────┬────────┬──────────┬───────────┬──────────┬───┘
                    │        │          │           │          │
                    ▼        ▼          ▼           ▼          ▼
             ┌──────────────────────────────────────────────────────┐
 PHASE 2     │                      E6                             │
             │              Joint Dynamics & Config                │
             │              (proto + engine + frontend)            │
             │              depends on E3 (Lock migration)         │
             └─────────────────────────────────────────────────────┘
```

**Phase 1 — all 5 epics run in parallel.** They touch different packages/files:

| Epic | Primary packages | Key files |
|------|-----------------|-----------|
| E1 | `packages/frontend`, `packages/ui` | inspectors, vec3-display, quat-display, PoseSection |
| E2 | `native/engine`, `packages/frontend`, `schemas/protocol` | mechanism_state.cpp, transport.cpp, connection.ts |
| E3 | `native/engine`, `schemas/mechanism` | simulation.cpp, mechanism.proto |
| E4 | `packages/viewport` | scene-graph-three.ts, R3FViewport.tsx |
| E5 | `packages/viewport`, `packages/frontend` | R3FViewport.tsx, tool-mode store |

**Phase 2 — E6 starts after E3 completes** (needs ChLinkLock in place to wire dynamics).

---

## E1: Editable Transforms & Inspector UX

**Goal:** The user can see and type exact position (m) + rotation (degrees) for every entity, with clear frame labels. Inspectors use progressive disclosure.

**References:** W1, W4 (labels), W6 from `ux-enhancement-proposals.md`; G1, G2, G11 from `transform-consistency-audit.md`

### Deliverables

1. **Make `QuatDisplay` editable** — add `onChange` callback + `editable` prop. When in Euler mode (default), user types degrees; component converts to quaternion via new `eulerDegToQuat()` utility. Keep the Euler/Quat toggle but default to Euler.
   - `packages/ui/src/components/engineering/quat-display.tsx`

2. **Enable `Vec3Display` editable mode in all inspectors** — the prop exists (`vec3-display.tsx:19`), just wire it up with `onChange` handlers.
   - `packages/ui/src/components/engineering/vec3-display.tsx`

3. **Rewrite `PoseSection` as `TransformSection`** — editable position + rotation, with frame label in header ("(world)" or "(relative to body)"), debounced at 300ms.
   - `packages/frontend/src/components/inspector/sections/PoseSection.tsx`

4. **Wire up Body inspector** — show Transform section at all times (not just during sim). `onChange` calls `sendUpdateBody({ pose: ... })`.
   - `packages/frontend/src/components/BodyInspector.tsx`

5. **Wire up Geometry inspector** — show Transform section with "(relative to body)" label. Requires new `UpdateGeometryPoseCommand`.
   - `packages/frontend/src/components/GeometryInspector.tsx`
   - `schemas/protocol/transport.proto` — add `UpdateGeometryPoseCommand`
   - `native/engine/src/transport.cpp` — handler
   - `native/engine/src/mechanism_state.cpp` — `update_geometry_pose()`
   - `packages/frontend/src/engine/connection.ts` — sender + receiver

6. **Wire up Datum inspector** — Transform section calls existing `sendUpdateDatumPose()`. Keep AxisPresetBar as a shortcut alongside the new rotation fields.
   - `packages/frontend/src/components/DatumInspector.tsx`

7. **Frame labels** — rename "Local Pose" → "Transform (relative to body)" for parented entities. Detached geometry → "Transform (world)". Body → "Transform (world)".
   - All inspector components above

8. **Progressive disclosure** — reorder inspector sections: Transform at top (always open), then identity/type section, then collapsible sections (mass, collision, inertia tensor starts closed, dynamics starts closed). Sim-only sections appear only during simulation.
   - All inspector components

### Acceptance Criteria
- User can type exact X/Y/Z position and X/Y/Z Euler rotation (degrees) for bodies, geometries, and datums
- Every pose section header states the coordinate frame
- Inspector defaults to showing essential info; advanced sections start collapsed
- Gizmo drag updates inspector values live; inspector edits move the viewport object

### Packages touched
`packages/ui`, `packages/frontend`, `schemas/protocol` (one new command), `native/engine` (one new handler)

---

## E2: Predictable Body Operations

**Goal:** Moving a body moves everything on it. Make Body preserves datums and joints. No silent data loss.

**References:** W2, W3 from `ux-enhancement-proposals.md`; Issues 1-3 from `datum-body-transforms.md`

### Deliverables

1. **Remove co-translation as default** — gate the `co_translate_datums()` call in `transport.cpp:999` behind an explicit `pin_datums_in_world` flag on `UpdateBodyCommand` (default: false). When false, datum `localPose` values don't change — they naturally move with the body via parent-child relationship.
   - `schemas/protocol/transport.proto` — add optional bool `pin_datums` to `UpdateBodyCommand`
   - `native/engine/src/transport.cpp:955-1008` — conditional call
   - `packages/frontend/src/engine/connection.ts` — update response handler (simplified: no updated_datums to apply by default)

2. **Make Body: keep first body's origin** — replace centroid calculation with using the first selected body's pose as the compound body pose. Geometry `localPose` values recomputed relative to this origin.
   - `native/engine/src/mechanism_state.cpp:452-574` — modify `make_compound_body()`

3. **Make Body: re-parent datums** — for each source body being dissolved or modified, move its datums to the compound body with recomputed `localPose` (preserve world position). Add `repeated Datum updated_datums` to `MakeCompoundBodySuccess`.
   - `native/engine/src/mechanism_state.cpp:452-574` — datum re-parenting logic
   - `schemas/protocol/transport.proto:546-558` — extend response message
   - `native/engine/src/transport.cpp:1185-1253` — include datums in response
   - `packages/frontend/src/engine/connection.ts:2248-2343` — apply datum updates

4. **Pre-operation validation** — before dissolving a body, check for datums/joints. If any can't be preserved (edge case), return an error with explanation rather than silently deleting.
   - `native/engine/src/mechanism_state.cpp`

5. **Tests** — add integration tests for:
   - Move body → datums stay at same world position (relative to body)
   - Make body with datums → datums re-parented, world positions preserved
   - Make body with joints → joints still valid after datum re-parenting
   - `native/engine/tests/test_mechanism_state.cpp`

### Acceptance Criteria
- Dragging a body moves all its datums and joints visually (no "pinning")
- Make Body on components with datums preserves those datums on the new body
- Joints referencing re-parented datums continue to work
- No silent datum/joint deletion during any body operation

### Packages touched
`native/engine`, `schemas/protocol`, `packages/frontend`

---

## E3: Chrono Backend Overhaul

**Goal:** Unify all joint creation on ChLinkLock, switch to ChBodyAuxRef, simplify motor and spring-damper code. Purely engine-side — no UI changes.

**References:** P5a-5e from `transform-consistency-audit.md`

### Deliverables

1. **Migrate all joints to ChLinkLock** — replace ChLinkMate/ChLinkMateGeneric with Lock equivalents. Uniform `Initialize(body1, body2, ChFramed(pos, rot))` pattern.
   - `native/engine/src/simulation.cpp:876-1018` — rewrite joint switch block
   - Mapping:
     - `ChLinkMateFix` → `ChLinkLockLock`
     - `ChLinkMateRevolute` / `ChLinkLockRevolute` → `ChLinkLockRevolute` (remove Mate path)
     - `ChLinkMatePrismatic` / `ChLinkLockPrismatic` → `ChLinkLockPrismatic` (remove Mate path)
     - `ChLinkMateCylindrical` / `ChLinkLockCylindrical` → `ChLinkLockCylindrical` (remove Mate path)
     - `ChLinkMateSpherical` → `ChLinkLockSpherical`
     - `ChLinkMatePlanar` → `ChLinkLockPlanar`
     - `ChLinkMateGeneric(true,true,false,...)` → `ChLinkLockPointLine`
     - `ChLinkMateGeneric(false,false,true,...)` → `ChLinkLockPointPlane`
     - `ChLinkUniversal` — keep as-is (no Lock variant)
     - `ChLinkDistance` — keep as-is (no Lock variant)

2. **Switch to ChBodyAuxRef** — decouple body reference frame from center of mass.
   - `native/engine/src/simulation.cpp` — body creation section
   - Set ref frame from `body.pose()` (user's chosen origin)
   - Set COM offset from `mass_properties.center_of_mass()`
   - Visual/collision shapes attach to ref frame (no change needed)
   - Verify: datum world frame computation, joint frame computation still correct

3. **Simplify motor creation** — for actuated revolute/prismatic joints, use `ChLinkMotorRotation*` / `ChLinkMotorLinear*` as the sole link (motor includes joint constraint via `SetSpindleConstraint` / `SetGuideConstraint`). Eliminate the separate joint link for actuated joints.
   - `native/engine/src/simulation.cpp:789-873` — motor block
   - Caveat: if limits + motor are both needed, keep Lock+Motor dual-link for that case only

4. **Use ChLinkTSDA for spring-dampers** — map `LinearSpringDamperLoad` to Chrono's `ChLinkTSDA` instead of custom force application.
   - `native/engine/src/simulation.cpp` — load/spring section

5. **Regression tests** — verify all existing test cases still pass. Add tests for:
   - Each joint type initializes correctly with Lock
   - Limits work on Lock joints (revolute, prismatic, cylindrical)
   - Reaction forces extractable from Lock joints
   - ChBodyAuxRef: body ref frame vs COM frame are correct
   - Motor-as-joint produces same simulation results
   - `native/engine/tests/test_simulation.cpp`

### Acceptance Criteria
- All existing simulation tests pass
- Joint creation code has one init pattern per type (no branching)
- `ChLinkMateGeneric` usage eliminated
- Body reference frame decoupled from COM (ChBodyAuxRef)
- Motor actuated joints use one Chrono link, not two
- Spring-dampers use ChLinkTSDA

### Packages touched
`native/engine` only (no frontend, no proto changes)

---

## E4: Viewport Visualization

**Goal:** Users can see coordinate frames, joint axes, collision shapes, and center of mass in the viewport. All toggleable.

**References:** W4 (viewport), W7, W8 (viewport) from `ux-enhancement-proposals.md`; G3, G4, G10, G15, G16 from `transform-consistency-audit.md`

### Deliverables

1. **World origin triad** — small permanent XYZ axes at (0,0,0). Subtle styling so it doesn't dominate. Always visible (not toggleable — it's a landmark).
   - `packages/viewport/src/scene-graph-three.ts` or `R3FViewport.tsx`

2. **Body frame triad on selection** — when a body is selected, render XYZ axes at the body's world origin. Use the same triad style as datums but slightly larger/dimmer.
   - `packages/viewport/src/scene-graph-three.ts` — selection overlay system

3. **Geometry frame triad on selection** — when a geometry is selected, render its local frame axes (within the parent body). Helps verify geometry local_pose.
   - `packages/viewport/src/scene-graph-three.ts`

4. **Joint axis line** — when a joint is selected, render its rotation/translation axis as a dashed line passing through the joint position. Extend ~0.3m in both directions. Color: match joint color (steel-blue). For revolute: rotation axis. For prismatic: translation axis.
   - `packages/viewport/src/scene-graph-three.ts:1420-1545` — joint scene graph
   - Uses `z_axis_from_rot()` on the parent datum's world orientation

5. **Collision wireframe overlay** — toggleable (like datum visibility). When enabled, render each geometry's collision shape as a translucent wireframe:
   - Box: wireframe cube from `half_extents`
   - Sphere: wireframe sphere from `radius`
   - Cylinder: wireframe cylinder from `radius` + `height`
   - Positioned at `geometry.localPose + collision_config.offset`
   - Color: semi-transparent green or orange
   - `packages/viewport/src/scene-graph-three.ts` — new overlay layer
   - `packages/viewport/src/R3FViewport.tsx` — toggle button/shortcut

6. **COM indicator** — when a body is selected, show a small crosshair/sphere at the body's center of mass position (body pose + mass_properties.center_of_mass offset). Color: distinct from other overlays (e.g., yellow).
   - `packages/viewport/src/scene-graph-three.ts`

7. **Toggle controls** — add keyboard shortcuts and/or viewport context menu items for toggling collision wireframes and COM indicators. Datums and joint anchors already have toggles.
   - `packages/frontend/src/components/ViewportContextMenu.tsx`

### Acceptance Criteria
- World origin visible at (0,0,0)
- Selecting a body shows its coordinate frame
- Selecting a joint shows the axis of motion as a visible line
- Collision shapes visible as wireframes when toggled on
- COM visible as a marker when body is selected

### Packages touched
`packages/viewport`, `packages/frontend` (context menu, toggle state)

---

## E5: Gizmo Precision

**Goal:** The viewport gizmo supports snap-to-grid and angular snap. Users can work in local or world coordinate frames.

**References:** W1 (snap), P2 from `transform-consistency-audit.md`; G5 from gap analysis

### Deliverables

1. **Translation snap** — wire `translationSnap` prop on `TransformControls` (drei supports this). Activate when Shift is held during drag.
   - `packages/viewport/src/R3FViewport.tsx:58-102` — GizmoBridge

2. **Rotation snap** — wire `rotationSnap` prop. Same Shift modifier.
   - `packages/viewport/src/R3FViewport.tsx`

3. **Snap value configuration** — small popover on the gizmo toolbar showing:
   - Translation: 1mm, 5mm, 10mm, 50mm, 100mm
   - Rotation: 5°, 15°, 45°, 90°
   - Current selection shown as label on toolbar
   - `packages/frontend/src/components/ViewportToolModeToolbar.tsx`
   - `packages/frontend/src/stores/tool-mode.ts` — add snap state

4. **Local/World frame toggle** — button on gizmo toolbar (or hotkey) to switch `TransformControls` between `'local'` and `'world'` space mode. Default: `'world'` for bodies, `'local'` for datums.
   - `packages/viewport/src/R3FViewport.tsx` — `space` prop on TransformControls
   - `packages/frontend/src/stores/tool-mode.ts` — add frame mode state
   - `packages/frontend/src/components/ViewportToolModeToolbar.tsx` — toggle button

### Acceptance Criteria
- Holding Shift while dragging snaps to configurable increments
- User can choose snap values from a toolbar popover
- Local/world frame toggle changes gizmo axis orientation
- Snap values persist within session

### Packages touched
`packages/viewport`, `packages/frontend` (toolbar, store)

---

## E6: Joint Dynamics & Configuration

**Goal:** Users can set per-joint damping, friction, and velocity limits. Backed by ChLinkLock's native API.

**References:** W5 from `ux-enhancement-proposals.md`; P5a (dynamics part) from `transform-consistency-audit.md`; G8, G9 from gap analysis

**Dependency:** Requires **E3** (ChLinkLock migration) to be complete.

### Deliverables

1. **Proto extension** — add dynamics fields to joint configs:
   ```protobuf
   message RevoluteJointConfig {
     Range angle_limit = 1;         // existing
     double damping = 2;            // N·m·s/rad
     double friction = 3;           // N·m
     double velocity_limit = 4;     // rad/s
   }
   // Same for PrismaticJointConfig, CylindricalJointConfig
   ```
   - `schemas/mechanism/mechanism.proto`

2. **Engine: apply dynamics to Lock joints** — in the joint creation switch block (now Lock-only from E3), add optional blocks for damping, friction, velocity limits using Lock's `GetForce_Rz()`, `LimitDt_Rz()` API.
   - `native/engine/src/simulation.cpp`

3. **Engine: handle dynamics in joint update** — `UpdateJointCommand` should accept and store dynamics values.
   - `native/engine/src/transport.cpp`
   - `native/engine/src/mechanism_state.cpp`

4. **Frontend: dynamics UI in JointInspector** — collapsible "Dynamics" section (starts closed). Shows damping, friction, velocity limit fields. Only visible for revolute/prismatic/cylindrical joints. Uses the same `NumericInput` + `PropertyRow` pattern as limits.
   - `packages/frontend/src/components/JointInspector.tsx`
   - `packages/frontend/src/engine/connection.ts` — extend `sendUpdateJoint()`

5. **Frontend: extend JointTypeSelectorPanel** — optionally show dynamics fields during joint creation (collapsed by default).
   - `packages/frontend/src/components/JointTypeSelectorPanel.tsx`

6. **Frontend: store** — extend `JointState` with `damping`, `friction`, `velocityLimit` fields.
   - `packages/frontend/src/stores/mechanism.ts`

7. **Tests** — simulation test: revolute joint with damping produces different motion than without. Verify velocity limit is enforced.
   - `native/engine/tests/test_simulation.cpp`

### Acceptance Criteria
- User can set damping, friction, and velocity limit on revolute/prismatic/cylindrical joints
- Dynamics fields hidden for joint types that don't support them
- Simulation honors dynamics values
- Section starts collapsed (progressive disclosure)

### Packages touched
`schemas/mechanism`, `native/engine`, `packages/frontend`

---

## Summary

| Epic | Effort | Phase | Parallelizable With | Key Outcome |
|------|--------|-------|-------------------|-------------|
| **E1: Editable Transforms & Inspector UX** | Medium | 1 | E2, E3, E4, E5 | Type exact position + rotation in degrees |
| **E2: Predictable Body Operations** | Medium | 1 | E1, E3, E4, E5 | Move body moves everything; Make Body preserves datums |
| **E3: Chrono Backend Overhaul** | Large | 1 | E1, E2, E4, E5 | ChLinkLock, ChBodyAuxRef, motor/spring simplification |
| **E4: Viewport Visualization** | Medium | 1 | E1, E2, E3, E5 | Frames, joint axis, collision wireframes, COM marker |
| **E5: Gizmo Precision** | Small | 1 | E1, E2, E3, E4 | Snap-to-grid, angular snap, local/world toggle |
| **E6: Joint Dynamics** | Medium | 2 | — (after E3) | Per-joint damping, friction, velocity limits |

**Total: 6 epics. 5 parallel in phase 1. 1 sequential in phase 2.**
