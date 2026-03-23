# Epic 15 — Joint Creation Workflow & Constraint Visualization

> **Status:** Not started
> **Dependencies:** Epic 5 (Datum CRUD) — complete. Epic 10 (Face-level topology + geometry-aware datums) — complete. Epic 7 (Joint CRUD) — complete.
>
> **Governance note:** Epics 5+ are under full governance — every boundary or contract change requires an ADR, every protocol/schema change requires seam tests, every architecture change requires doc updates.

Three prompts. Prompt 1 builds the viewport-driven joint creation mode. Prompt 2 adds DOF visualization and constraint preview. Prompt 3 enhances the joint inspector and adds coordinate clarity. All three prompts can proceed sequentially (each builds on the previous).

## Motivation

Joint creation today works through `JointConfigDialog` — a modal dialog where the user selects a parent datum, a child datum (from the same dropdown-driven pick flow), and a joint type from a list. While functional, this approach has several problems:

1. **Not spatial.** Users cannot see what they are connecting. They pick datums by name from a status bar prompt, but there is no preview of the geometric relationship between the two datums until after the joint is created.

2. **No DOF preview.** The user selects "Revolute" or "Prismatic" from a list without seeing how that choice constrains the child body's motion. The consequences of the joint type selection are invisible until simulation.

3. **No type guidance.** When two datums share a common axis (coaxial), a revolute joint is the natural choice. When they share a common plane (coplanar), planar is appropriate. The current UI offers no recommendations — the user must already know which type fits.

4. **Coordinate confusion.** Joints connect datums on different bodies. Each datum's local pose is expressed in its parent body's frame. The joint axis depends on which datum is parent vs. child. Users frequently get confused about which body a datum belongs to and how local vs. global coordinates relate. The current inspector shows only datum names with no visual indication of the coordinate chain.

5. **No edit workflow.** Once a joint is created, the user can change its type or limits in the inspector, but cannot re-pick datums. If the wrong datum was selected, the joint must be deleted and recreated.

### What engineers expect

In Adams View, joint creation is a spatial operation: pick a marker on body A, pick a marker on body B, select joint type, done — with a preview of the constraint axis and DOF indicators at each step. SolidWorks mates and Onshape assembly mates work similarly: select geometry on one part, select geometry on another part, the system suggests the mate type based on geometric compatibility, and shows a preview of the constrained motion before committing.

MotionLab should match this spatial, feedback-rich workflow.

## UX Philosophy — Selection-Driven, Not Menu-Driven

This epic is the most important UX inflection point in the product. The interaction patterns established here define whether MotionLab feels like a modern spatial engineering tool (Onshape, Blender) or a 1990s form-driven CAD application (Adams dialog panels).

**Core principles governing all three prompts:**

1. **Selection carries geometric meaning.** When a user clicks a cylindrical face, the system already knows that face has an axis and a center point. If the user is in joint creation mode, clicking a face should auto-create a datum from that face geometry and use it — the datum entity exists in the data model, but the user never explicitly creates it. Datums emerge from selections.

2. **The viewport is the interface, not a viewer.** Every spatial operation starts and ends in the viewport. The inspector panel provides secondary editing and coordinate display. There are no modal dialogs in the creation flow — only inline floating panels and non-blocking inspectors.

3. **Progressive disclosure.** A revolute joint fundamentally needs two bodies and an axis — that's three picks. Everything else (limits, friction, initial conditions) is secondary configuration accessed through the inspector after creation. The creation flow requires only the essential inputs.

4. **Live preview at every step.** Before committing, the user sees a ghost preview of the joint, constraint axis, and DOF indicators. The preview updates as the user changes selections. If they get it wrong, ESC undoes the last pick (single-level undo), not the whole operation.

5. **Soft modes, not hard locks.** Tool modes (select, create-datum, create-joint) bias the interaction behavior and available context actions, but don't hard-lock what you can do. In create-joint mode, the user can still pick faces to auto-create datums. The system adapts to intent rather than enforcing a rigid pipeline.

6. **Contextual constraint feedback.** As the user builds the model, the system gives real-time feedback about constraint state: current DOF count, redundancy warnings, grounding status. This is a persistent status indicator, not a post-hoc analysis step.

## Prior Art

### Adams View — Markers & Joints
Adams uses "markers" (coordinate frames attached to bodies) as joint anchor points. Joint creation is: (1) select marker on body A, (2) select marker on body B, (3) choose joint type from a panel with icons showing DOF diagrams, (4) joint appears with a glyph showing the constraint axis and allowed motion directions. The glyph animates slightly to show the DOF. Adams also shows a "redundant constraint" warning if the mechanism is over-constrained.

### SolidWorks Mates
Mates are created by selecting faces/edges on two parts. SolidWorks infers the mate type from geometry: two cylindrical faces suggest Concentric, two planar faces suggest Coincident, a cylindrical and a planar face suggest Tangent. Users can override the suggestion. A preview shows the constrained position before confirming. The property panel shows the constraint definition with parent/child geometry references.

### Onshape Assembly Mates
Similar to SolidWorks but with a "mate connector" concept that maps directly to datums. Users click on geometry to create mate connectors, then create mates between them. Onshape shows DOF icons (rotation arrows, translation arrows) on the constrained parts. The mate panel shows parent and child connectors with their coordinate frames.

## Shared Contract

| Interface | Owner | Consumer |
|-----------|-------|----------|
| `JointCreationState` (extended with `recommendedTypes`, `previewJointType`) | Prompt 1 (extends store) | Prompt 2 (DOF preview reads preview type) |
| `DatumAlignmentAnalysis` (coaxial/coplanar/coincident detection) | Prompt 1 (implements) | Prompt 1 (type recommendation), Prompt 2 (DOF axis orientation) |
| Joint creation preview meshes in scene graph | Prompt 1 (creates preview) | Prompt 2 (attaches DOF indicators to preview) |
| `createDofIndicator()` — existing factory in `dof-indicators.ts` | Prompt 2 (extends) | Prompt 2 (preview), Prompt 3 (inspector hover) |
| `DOF_TABLE` — static DOF counts per joint type | Prompt 2 (defines) | Prompt 2 (rendering), Prompt 3 (inspector display) |
| Enhanced `JointInspector` with coordinate display | Prompt 3 (builds) | Prompt 3 (self-contained) |
| `swapParentChild()` on joint-creation store | Prompt 1 (adds) | Prompt 3 (swap button uses) |

Integration test: Enter create-joint mode, click datum A on body X (green highlight + label), click datum B on body Y (orange highlight + connector line), hover over "Revolute" in type selector (DOF arc appears on child body), click "Create" (joint appears in scene graph and project tree).

---

## Prompt 1: Viewport-Driven Joint Creation Mode

```
# Epic 15 — Viewport-Driven Joint Creation Mode

You are upgrading the joint creation workflow from a dialog-driven flow to a viewport-centric, multi-step spatial interaction. The user enters "create joint" mode, picks datums directly in the viewport with visual feedback at each step, gets joint type recommendations based on datum geometry alignment, and sees a preview connector before committing.

## Read These First (in order)
- `docs/architecture/principles.md` — engine is computational authority; React is not the hot path
- `packages/viewport/AGENTS.md` — viewport owns visualization and picking
- `packages/frontend/AGENTS.md` — frontend owns tool modes and authoring UX
- `packages/frontend/src/stores/joint-creation.ts` — current joint creation state machine
- `packages/frontend/src/components/JointConfigDialog.tsx` — current modal dialog
- `packages/frontend/src/hooks/useViewportBridge.ts` — pick handler with create-joint branch
- `packages/frontend/src/components/ViewportOverlay.tsx` — viewport HUD and joint creation status
- `packages/viewport/src/scene-graph.ts` — SceneGraphManager.addJoint() and joint visual creation
- `packages/viewport/src/rendering/joint-visuals.ts` — joint type visual factories
- `packages/viewport/src/picking.ts` — PickingManager and datum picking
- Relevant ADRs under `docs/decisions/`

## Governance Reminder
Full governance applies:
- Any boundary or contract change requires an ADR
- Any protocol/schema change requires seam tests
- Any architecture change requires doc updates

## What Exists Now

### `packages/frontend/src/stores/joint-creation.ts`
Zustand store with steps: `'idle' | 'pick-parent' | 'pick-child' | 'configure'`. Holds `parentDatumId` and `childDatumId`. `startCreation()` enters `pick-parent`. `setParentDatum(id)` advances to `pick-child`. `setChildDatum(id)` advances to `configure` which opens `JointConfigDialog`. `cancel()` and `reset()` both go back to `pick-parent`.

### `packages/frontend/src/hooks/useViewportBridge.ts` (handlePick)
In `create-joint` mode: only accepts picks on datums (checks `datums.has(entityId)`). For `pick-parent` step, calls `setParentDatum(entityId)`. For `pick-child` step, validates different body (compares `parentDatum.parentBodyId !== childDatum.parentBodyId`), then calls `setChildDatum(entityId)`.

### `packages/frontend/src/components/JointConfigDialog.tsx`
Modal dialog shown when `step === 'configure'`. Contains: name input (auto-generated), type dropdown (revolute/prismatic/fixed/spherical/cylindrical/planar), lower/upper limit inputs for revolute/prismatic/cylindrical. Calls `sendCreateJoint()` on confirm, then `reset()` to go back to `pick-parent`.

### `packages/frontend/src/components/ViewportOverlay.tsx`
Contains `JointCreationStatus` component that shows status messages during `pick-parent` ("Click a datum to set as parent") and `pick-child` ("Parent: DatumName. Click a datum on another body"). Uses `useJointCreationStore` to track step.

Also has an `useEffect` that highlights the parent datum during `pick-child` step by adding its ID to the selection set via `sg.applySelection(combined)`.

### `packages/viewport/src/scene-graph.ts`
`addJoint()` takes id, parentDatumId, childDatumId, jointType. Computes datum world positions, midpoint, and axis. Calls the appropriate `create*JointVisual()` factory. Stores as `SceneEntity` with `type: 'joint'`.

### `packages/viewport/src/rendering/joint-visuals.ts`
Factory functions per joint type: `createRevoluteJointVisual` (torus), `createPrismaticJointVisual` (arrow), `createFixedJointVisual` (bar), `createSphericalJointVisual` (wireframe sphere), `createCylindricalJointVisual` (torus + arrow), `createPlanarJointVisual` (disc + arrows). Each returns `JointVisualResult { rootNode, meshes }`.

### `packages/frontend/src/stores/mechanism.ts`
`JointTypeId = 'revolute' | 'prismatic' | 'fixed' | 'spherical' | 'cylindrical' | 'planar'`. `DatumState` has `parentBodyId` and `localPose` (position + quaternion in parent body local frame).

### `packages/frontend/src/stores/tool-mode.ts`
`ToolMode = 'select' | 'create-datum' | 'create-joint'`. Keyboard shortcut `J` enters create-joint mode.

## What to Build

### 1. Extend joint-creation store with preview state and type recommendation

Extend `JointCreationState` in `joint-creation.ts`:

```ts
export type JointCreationStep = 'idle' | 'pick-parent' | 'pick-child' | 'select-type' | 'configure';

export interface JointCreationState {
  step: JointCreationStep;
  parentDatumId: string | null;
  childDatumId: string | null;
  previewJointType: JointTypeId | null;     // currently hovered type in selector
  selectedJointType: JointTypeId | null;     // confirmed type before commit
  recommendedTypes: JointTypeId[];           // types ranked by datum alignment
  alignmentKind: AlignmentKind | null;       // detected alignment between datums

  startCreation: () => void;
  setParentDatum: (id: string) => void;
  setChildDatum: (id: string) => void;
  setPreviewJointType: (type: JointTypeId | null) => void;
  selectJointType: (type: JointTypeId) => void;
  cancel: () => void;
  reset: () => void;
  exitMode: () => void;
}
```

When `setChildDatum(id)` is called, advance to `'select-type'` instead of `'configure'`. At this point, compute datum alignment and populate `recommendedTypes`. **Auto-select the first recommended type:** seed `selectedJointType` from `recommendedTypes[0]` so the DOF preview (Prompt 2) appears immediately without requiring an extra click. The user can change the type freely. If `recommendedTypes` is empty (general alignment), leave `selectedJointType` as `null`. The `'configure'` step is entered when the user selects a type and is ready to set name/limits before committing (or this can be folded into `'select-type'` as an inline panel).

### 2. Datum alignment analysis

Create `packages/frontend/src/utils/datum-alignment.ts`:

```ts
export type AlignmentKind = 'coaxial' | 'coplanar' | 'coincident' | 'general';

export interface DatumAlignment {
  kind: AlignmentKind;
  recommendedTypes: JointTypeId[];
  /** Shared axis direction (world frame) for coaxial, or plane normal for coplanar */
  axis?: { x: number; y: number; z: number };
  /** Distance between datum origins in world frame */
  distance: number;
}

/**
 * Analyze the geometric relationship between two datums to recommend joint types.
 *
 * Uses world-frame datum poses. Compute world pose from:
 *   body.pose * datum.localPose (compose body transform with datum local transform)
 *
 * Classification:
 * - Coaxial: Z-axes are parallel (dot product > 0.999) → Revolute, Cylindrical
 * - Coplanar: Z-axes are parallel and origins share a plane → Planar
 * - Coincident: origins within tolerance (< 1mm) → Spherical, Universal
 * - General: none of the above → Fixed, Distance (show all types)
 */
export function analyzeDatumAlignment(
  parentDatumWorldPose: { position: Vec3; zAxis: Vec3 },
  childDatumWorldPose: { position: Vec3; zAxis: Vec3 },
): DatumAlignment { ... }
```

The Z-axis of each datum in world frame is computed by rotating [0, 0, 1] by the composed quaternion (body rotation * datum local rotation).

Recommendation table:
- **Coaxial** (Z-axes parallel, origins not coincident): `['revolute', 'cylindrical', 'prismatic']`
- **Coplanar** (Z-axes parallel, origins in same plane perpendicular to Z): `['planar', 'fixed']`
- **Coincident** (origins within 1mm): `['spherical', 'revolute', 'fixed']`
- **General**: `['fixed', 'revolute', 'prismatic', 'spherical', 'cylindrical', 'planar']`

### 3. Visual feedback during datum picking

Upgrade `ViewportOverlay.tsx` and the parent-datum highlight effect:

**Cursor:** When entering create-joint mode, change the viewport cursor to a crosshair (`cursor: crosshair`). This prevents the "I forgot I was in create mode and tried to select something" error. Revert to default cursor when exiting the mode.

**Step: pick-parent**
- All datums on all bodies are pickable (existing behavior).
- Hovered datum shows standard hover highlight.
- Status message: "Click a datum to set as joint parent"

**Step: pick-child (after parent is selected)**
- Parent datum highlighted in green (emissive glow, distinct from selection blue).
  - Add a floating label overlay: "Parent: {datumName} (on {bodyName})" positioned near the parent datum in screen space.
- Datums on the SAME body as the parent datum become visually dimmed and non-interactive. **Concrete visual treatment:** desaturate the datum triad colors (shift RGB arrow colors toward gray `[0.5, 0.5, 0.5]` while keeping the triad geometry visible and distinct) and set `isPickable = false` on the dimmed triad meshes so they don't respond to hover. Do NOT use alpha-fade (triads are already small and would become invisible) or a flat gray tint (looks broken rather than intentionally disabled). This prevents the common mistake of connecting two datums on the same body. The `useViewportBridge` pick handler already rejects same-body picks — the visual dimming reinforces this constraint.
- Status message: "Click a datum on another body"

Implement the floating label using a shared `WorldSpaceOverlay` component (see note below) positioned via Babylon's `Vector3.Project()` to convert world position to screen coordinates. Update position on each render frame via `requestAnimationFrame` or the Babylon render loop.

> **Shared abstraction note:** Epic 14 Prompt 1 (FaceTooltip), Epic 14 Prompt 3 (FloatingCoordinateCard), and this prompt (datum floating labels) all implement the same pattern: "position a React div at screen coordinates projected from a 3D world position or pointer." Create a single reusable `WorldSpaceOverlay` primitive in `packages/frontend/src/components/` that accepts either a world position (for 3D-anchored labels) or a pointer-follow flag (for cursor-tracking cards), and renders children at the projected screen position with RAF-gated updates. All three use cases should consume this primitive rather than each implementing their own projection + animation frame lifecycle.

**Step: select-type (both datums selected)**
- Both datums highlighted: parent in green, child in orange.
- A dashed/semi-transparent preview connector line drawn between the two datum origins in the viewport.
- Type selector panel appears (see next section).

### 4. Connector preview line

Add to `SceneGraphManager` (or a new `JointPreview` class):

```ts
showJointPreview(parentDatumId: string, childDatumId: string): void
clearJointPreview(): void
```

The preview is a dashed line (or semi-transparent cylinder) between the two datum world positions. Use a thin `Mesh.CreateCylinder()` with an emissive dashed material, or `MeshBuilder.CreateDashedLines()`. Color: white at 50% opacity. This is a transient visual — disposed when the creation flow ends.

**Semantic connector orientation:** When datum alignment analysis is available, orient the connector line along the computed alignment axis rather than just point-to-point. For coaxial datums, draw the line along the shared Z-axis. For coplanar datums, draw a short plane-indicator segment in the shared normal plane. This makes the preview line feel purposeful — it communicates the geometric relationship between the datums, priming the user to understand the recommended joint type before they even see the selector.

### 5. Joint type selector panel

Replace the modal `JointConfigDialog` with an inline floating panel that appears during the `'select-type'` step. This panel can be:
- A floating card anchored to the viewport bottom-center (next to the selection chip area), or
- A sidebar panel in the inspector area.

The panel contains:
- A header: "Create Joint: {parentDatumName} → {childDatumName}"
- A list of joint type options, **sorted with recommended types first**, each showing:
  - Joint type icon (matching the joint visual color scheme)
  - Joint type name
  - DOF summary: e.g., "1R" for revolute, "1T" for prismatic, "3R" for spherical
  - A "Recommended" badge with subtle highlight border on types that match the datum alignment
  - The first recommended type is **pre-selected** (from the auto-select in step 1), so its DOF preview appears immediately in the viewport without requiring a hover
- Name input field (auto-generated, editable)
- Limit fields (shown only for types that support limits: revolute, prismatic, cylindrical)
- "Create" and "Cancel" buttons

When the user **hovers** a joint type in the selector, update `previewJointType` in the store. The viewport responds by showing a preview of that joint visual at the midpoint (see Prompt 2 for DOF indicators on hover).

When the user **clicks** a type, it becomes the selected type. Clicking "Create" commits.

### 6. Update pick handler for same-body rejection feedback

In `useViewportBridge.ts`, when `create-joint` mode rejects a same-body datum pick, set a brief warning message via `useAuthoringStatusStore`:

```ts
if (parentDatum.parentBodyId === childDatum.parentBodyId) {
  useAuthoringStatusStore.getState().setMessage(
    'Cannot create joint: parent and child datums must be on different bodies'
  );
  return;
}
```

### 7. ESC behavior (single-level undo)

Each ESC press reverses exactly one step, giving a clean back-step at each stage:

- In `select-type` step: ESC goes back to `pick-child` (keeps parent selected, clears child highlight and preview). This lets the user re-pick the child without losing the parent selection.
- In `pick-child` step: ESC goes back to `pick-parent`, clears parent highlight.
- In `pick-parent` step: ESC exits create-joint mode entirely (returns to select mode).

This matches SolidWorks mate backtracking behavior — each ESC undoes exactly the last pick, rather than jumping multiple steps.

The existing keyboard handler in `ViewportOverlay.tsx` already handles some of this — extend it for the new `'select-type'` step.

### 8. Face-to-datum shortcut — selection-driven datum creation

**This is the most important UX feature in the joint creation flow.** When in `pick-parent` or `pick-child` step, the user should be able to click a **face** (not just an existing datum) to create a joint. The system auto-creates a datum from the face geometry and uses it as the parent/child datum, making datum creation invisible for the common case.

In `useViewportBridge.ts`, extend the `create-joint` pick handler:

```ts
// Current: only accepts datum picks
// New: also accepts face picks → auto-create datum, then use it

if (mode === 'create-joint') {
  const { step } = useJointCreationStore.getState();

  // Check if the pick resolved to an existing datum
  if (datums.has(entityId)) {
    // Existing behavior — use the datum directly
    if (step === 'pick-parent') setParentDatum(entityId);
    else if (step === 'pick-child') setChildDatum(entityId);
  }
  // Check if the pick resolved to a face on a body
  else if (pickData?.bodyId && pickData?.faceIndex != null) {
    // AUTO-CREATE DATUM: send CreateDatumFromFace, then use the result
    useJointCreationStore.getState().setCreatingDatum(true);
    const name = ''; // let engine auto-name
    sendCreateDatumFromFace(pickData.bodyId, pickData.faceIndex, name);
    // The result handler in connection.ts will:
    // 1. Add the datum to the mechanism store (existing behavior)
    // 2. Check if joint-creation store has `creatingDatum === true`
    // 3. If so, call setParentDatum(newDatumId) or setChildDatum(newDatumId)
    //    based on the current step, then clear the creatingDatum flag
  }
}
```

Extend `JointCreationState` with:
```ts
creatingDatum: boolean;           // true while waiting for auto-created datum
setCreatingDatum: (v: boolean) => void;
```

In `connection.ts`, extend the `createDatumFromFaceResult` handler:
```ts
// After adding datum to mechanism store:
const jcs = useJointCreationStore.getState();
if (jcs.creatingDatum && jcs.step === 'pick-parent') {
  jcs.setParentDatum(newDatumId);
  jcs.setCreatingDatum(false);
} else if (jcs.creatingDatum && jcs.step === 'pick-child') {
  jcs.setChildDatum(newDatumId);
  jcs.setCreatingDatum(false);
}
```

**Visual behavior during face pick:**
- When hovering a face (not a datum) in create-joint mode, show the face highlight (existing behavior) plus the datum preview ghost from Epic 14 Prompt 1 (axis/plane/point overlay). This previews what the auto-created datum will look like.
- When the user clicks the face, show a brief "Creating datum..." status while the engine responds. The datum triad appears, highlights in the appropriate color (green for parent, orange for child), and the state machine advances.
- The auto-created datum is a normal datum in the data model — the user can rename, flip, or delete it later via the inspector.

**Why this matters:** This collapses the serial pipeline (import → create datum → create joint) into a single spatial operation (import → click faces to create joint). The user never needs to think about datums as a separate concept — they select geometry, the system proposes the joint. Datums emerge from selections. This is the pattern that makes Onshape mates and SolidWorks mates feel fluid.

### 9. Update sendCreateJoint to accept full JointTypeId range

The current `sendCreateJoint()` accepts only 6 types. If the proto supports more (universal, distance, point_line, point_plane), extend the type parameter and `toProtoJointType()` mapping.

## Architecture Constraints
- Joint creation flow state is frontend-only — no protocol messages until "Create" is clicked (exception: face-to-datum auto-creation sends a CreateDatumFromFace message on face pick)
- Preview rendering (connector line, datum highlights) is viewport-only
- Datum alignment analysis is pure math (quaternion/vector operations) — no engine calls needed
- The multi-step state machine lives in `joint-creation.ts` (Zustand) — not in React component state
- Body-datum ownership comes from `DatumState.parentBodyId` in the mechanism store
- Same-body rejection is enforced both visually (dimming) and logically (pick handler check)
- Face-to-datum auto-creation introduces an async step — the state machine must handle the brief waiting state gracefully (show loading indicator, disable further picks until datum is created)
- **Soft modes:** Tool modes bias interaction behavior but do not hard-lock capabilities. In `create-joint` mode, the user can still pick faces (to auto-create datums) — the mode determines how picks are interpreted, not what entities can be interacted with. This extends to the other creation modes: in `create-load` mode, clicking a face should also auto-create a datum rather than requiring the user to exit, switch to create-datum mode, create the datum, switch back to create-load mode, and pick the datum. Modes are interpretive contexts, not capability restrictions.
- **Incomplete entities are valid.** The system should support partially-defined entities during authoring. A joint creation that is cancelled after picking the parent (but before picking the child) should cleanly revert without leaving orphan state. An auto-created datum from a face pick should persist even if the joint creation is cancelled — the datum was explicitly placed by user action (the face click). If the user truly doesn't want it, they delete it.

## Expected Behavior (testable)

### Happy path (existing datum picks)
1. Press `J` → enter create-joint mode, cursor changes to crosshair
2. Click datum A on body X → datum A highlights green, floating label shows "Parent: A (on BodyX)"
3. Datums on body X become visually dimmed
4. Click datum B on body Y → datum B highlights orange, connector line appears between A and B
5. Type selector panel appears with recommended types badged
6. Click "Revolute" → name auto-fills, limit fields appear
7. Click "Create" → joint appears in scene and tree, mode resets to pick-parent for next joint

### Face-to-datum shortcut (geometry-driven joint creation)
1. Press `J` → enter create-joint mode
2. Click a cylindrical face on body X → datum preview (axis line) flashes briefly → axis datum auto-created → highlights green as parent
3. Click a cylindrical face on body Y → axis datum auto-created → highlights orange as child → connector line appears along shared axis
4. Type selector opens with "Revolute" auto-selected (coaxial alignment detected)
5. Click "Create" → joint created with auto-generated datums
6. **The user never explicitly created a datum** — the serial pipeline was collapsed into 3 clicks

### Same-body rejection
1. Select parent datum on body X
2. Click another datum on body X → pick rejected, warning message shown
3. Can still click datums on body Y (they work)

### ESC cancellation (single-level undo)
1. In select-type step, press ESC → child highlight clears, type selector closes, back to pick-child (parent stays selected)
2. In pick-child step, press ESC → parent highlight clears, back to pick-parent
3. In pick-parent step, press ESC → exit create-joint mode, return to select mode

### Alignment recommendation
1. Two coaxial datums (Z-axes parallel) → Revolute and Cylindrical badged as recommended
2. Two coincident datums (origins < 1mm apart) → Spherical badged as recommended
3. General alignment → all types shown, none specifically recommended

## Done Looks Like
- Viewport-centric joint creation with visual feedback at every step
- Floating labels showing datum names and body ownership during picking
- Same-body datums are visually dimmed and logically rejected
- Connector preview line between selected datums
- Inline type selector with alignment-based recommendations
- ESC cancellation works at every step
- `pnpm --filter @motionlab/frontend typecheck` passes
- `pnpm --filter @motionlab/viewport typecheck` passes

## What NOT to Build
- DOF visualization on joint type hover (that is Prompt 2)
- Constraint force arrows during simulation (that is Prompt 2)
- Enhanced joint inspector with coordinate frames (that is Prompt 3)
- Joint type preview visual at midpoint (just the connector line for now — full joint preview is Prompt 2)
- Protocol changes — the existing CreateJointCommand is sufficient
```

---

## Prompt 2: DOF Visualization & Constraint Preview

```
# Epic 15 — DOF Visualization & Constraint Preview

You are adding degrees-of-freedom (DOF) visualization to the joint creation workflow and to existing joints. When hovering over a joint type during creation, DOF indicators show how the child body can move. When selecting existing joints, DOF indicators appear on hover. Over-constraint warnings are shown when the mechanism has redundant joints.

## Read These First (in order)
- `docs/architecture/principles.md` — engine is authority; React is not the hot path
- `packages/viewport/AGENTS.md` — viewport owns visualization
- `packages/viewport/src/rendering/dof-indicators.ts` — existing DOF indicator factories
- `packages/viewport/src/rendering/joint-visuals.ts` — joint visual factories and color scheme
- `packages/viewport/src/scene-graph.ts` — SceneGraphManager DOF indicator lifecycle (applySelection creates/disposes indicators)
- `packages/frontend/src/stores/joint-creation.ts` — after Prompt 1: includes `previewJointType`, `alignmentKind`
- `packages/frontend/src/utils/datum-alignment.ts` — after Prompt 1: includes datum alignment analysis
- `packages/viewport/src/rendering/force-arrows.ts` — existing force arrow rendering (reference for pooled arrow pattern)
- Relevant ADRs under `docs/decisions/`

## Governance Reminder
Full governance applies.

## What Exists Now

### `packages/viewport/src/rendering/dof-indicators.ts`
Factory function `createDofIndicator(scene, jointId, jointType)` returns a `DofIndicator` with `rootNode`, `meshes`, `update(time)`, and `dispose()`. Implementations exist for: revolute (oscillating arc arrow), prismatic (oscillating double-headed arrow), cylindrical (arc + arrow), spherical (3 orthogonal rings), planar (2 arrows + arc). Fixed returns `undefined` (0 DOF). All use `makeIndicatorMaterial()` with 0.6 alpha, are non-pickable, and render in group 1.

### `packages/viewport/src/scene-graph.ts` — DOF indicator management
In `applySelection()`, when a joint is selected, `createDofIndicator()` is called and the indicator is parented to the joint's root node. When deselected, the indicator is disposed. Per-frame `update(time)` called in the scene observer for all active indicators.

### DOF counts per joint type (from `mechanism.proto`)
| Type | Rotational | Translational | Total DOF |
|------|-----------|---------------|-----------|
| Revolute | 1R | 0T | 1 |
| Prismatic | 0R | 1T | 1 |
| Fixed | 0R | 0T | 0 |
| Spherical | 3R | 0T | 3 |
| Cylindrical | 1R | 1T | 2 |
| Planar | 1R | 2T | 3 |
| Universal | 2R | 0T | 2 |
| Distance | 0R* | 0T* | 5 (point constrained to sphere) |
| PointLine | — | — | 4 (point constrained to line) |
| PointPlane | — | — | 3 (point constrained to plane) |

### `packages/viewport/src/rendering/force-arrows.ts`
`ForceArrowManager` pools and updates force/torque arrows per joint during simulation. Uses `Mesh.CreateCylinder` for shafts and cones for heads. Good reference pattern for pooled transient rendering.

### After Prompt 1
- `JointCreationState` has `previewJointType` (set on hover in type selector)
- `alignmentKind` and alignment axis available from datum analysis
- Connector preview line drawn between selected datums
- Type selector panel visible in `select-type` step

## What to Build

### 1. DOF table and color constants

DOF semantic colors are already defined in the central palette at `packages/viewport/src/rendering/colors.ts`:
- `DOF_FREE` — green, for free DOFs
- `DOF_LOCKED` — red, for locked DOFs

Joint type colors (`JOINT_REVOLUTE`, `JOINT_PRISMATIC`, etc.) are also in `colors.ts` and already used by `dof-indicators.ts`.

Add the `DOF_TABLE` lookup to `packages/viewport/src/rendering/dof-indicators.ts` (co-located with the indicator factories that consume it):

```ts
import { DOF_FREE, DOF_LOCKED } from './colors.js';

export interface DofSpec {
  rotational: number;   // number of rotational DOF
  translational: number; // number of translational DOF
  total: number;
  label: string;        // e.g. "1R", "1T", "1R+1T", "3R"
}

export const DOF_TABLE: Record<string, DofSpec> = {
  revolute:     { rotational: 1, translational: 0, total: 1, label: '1R' },
  prismatic:    { rotational: 0, translational: 1, total: 1, label: '1T' },
  fixed:        { rotational: 0, translational: 0, total: 0, label: '0' },
  spherical:    { rotational: 3, translational: 0, total: 3, label: '3R' },
  cylindrical:  { rotational: 1, translational: 1, total: 2, label: '1R+1T' },
  planar:       { rotational: 1, translational: 2, total: 3, label: '1R+2T' },
  universal:    { rotational: 2, translational: 0, total: 2, label: '2R' },
  distance:     { rotational: 0, translational: 0, total: 5, label: '5' },
  point_line:   { rotational: 0, translational: 0, total: 4, label: '4' },
  point_plane:  { rotational: 0, translational: 0, total: 3, label: '3' },
};
```

### 2. Preview DOF indicators during joint creation

When `previewJointType` changes in the joint-creation store (user hovers a type in the selector):

1. Create a DOF indicator for that type at the joint preview location (midpoint between the two selected datums).
2. Orient the indicator using the alignment axis from datum analysis.
3. Show the indicator with a gentle animation (existing `update(time)` oscillations).
4. When `previewJointType` changes to a different type, dispose the old indicator and create a new one.
5. When `previewJointType` becomes null (mouse leaves selector), dispose the indicator.

This requires the viewport to subscribe to `previewJointType` changes. Add a subscription in the scene graph or in `ViewportOverlay.tsx` that calls a new `SceneGraphManager` method:

```ts
showJointTypePreview(
  parentDatumId: string,
  childDatumId: string,
  jointType: string,
): void

clearJointTypePreview(): void
```

This method creates the joint visual (using existing `create*JointVisual` factories) plus the DOF indicator at the midpoint. Both are rendered at reduced opacity (preview materials at alpha 0.5) to distinguish from committed joints.

### 3. Color-coded DOF summary on the type selector

In the joint type selector panel (built in Prompt 1), enhance each type entry with a color-coded DOF diagram:

- For each rotation DOF: a small green curved-arrow icon
- For each translation DOF: a small green straight-arrow icon
- For locked DOFs (6 - total): small red lock icons or crossed-out indicators
- Text label: "1R + 1T (2 of 6 DOF free)" or similar

This is a React component consuming `DOF_TABLE`.

### 4. DOF indicators on existing joints (selection)

The existing `applySelection()` in SceneGraphManager already creates DOF indicators for selected joints. Verify this works correctly and extend to support the new joint types (universal, distance, point_line, point_plane) by adding indicator implementations:

**Universal (2R):**
Two orthogonal arc arrows (rotation around two perpendicular axes). Similar to spherical but only 2 rings instead of 3. Use red-green color coding: two green arcs for free rotations, with the third (locked) axis shown as a thin red arc or nothing.

**Distance (5 DOF):**
Subtle — the child body can rotate freely (3R) and translate on a sphere surface (2T-equivalent, constrained to fixed distance). Show 3 rotation rings (like spherical) plus a sphere-surface outline at the constraint radius.

**PointLine (4 DOF):**
Point constrained to a line: free to translate along the line (1T) and rotate freely (3R). Arrow along line + 3 rings.

**PointPlane (3 DOF):**
Point constrained to a plane: free to translate in-plane (2T) and rotate around normal (1R). Disc + 2 arrows + arc (similar to planar).

If these additional types are not yet used in the UI, implement the indicator stubs that return `undefined` (like fixed) and add a TODO comment.

### 5. Over-constraint warning

Add a simple topological DOF counter to `packages/frontend/src/utils/dof-counter.ts`:

```ts
/**
 * Gruebler's equation for planar/spatial mechanisms:
 * DOF = 6 * (n - 1) - sum(constraints_per_joint)
 *
 * where n = number of bodies (including ground),
 * and constraints_per_joint = 6 - joint_dof.
 *
 * If DOF < 0, the mechanism is over-constrained (redundant joints).
 * If DOF = 0, it is fully determined.
 * If DOF > 0, it has DOF remaining degrees of freedom.
 */
export function computeMechanismDof(
  bodyCount: number,  // not including ground
  joints: Array<{ type: string }>,
): { dof: number; isOverConstrained: boolean } { ... }
```

Show a non-blocking warning banner in the type selector panel or in the viewport HUD when Gruebler's equation yields DOF < 0. Use language that respects expert users: **"Redundant constraints detected (Gruebler DOF: {value})"** rather than "over-constrained", with a tooltip explaining: "Gruebler's equation is a necessary condition. Some mechanisms have intentionally redundant constraints that are physically valid." The user can still create the joint — this is informational, not a gate.

### 5b. Persistent DOF indicator in status bar

**The DOF count should not be limited to the joint creation flow.** It should be a persistent, always-visible indicator in the status bar (see Epic 19 `status-bar.tsx`). This is the "constraint health" metric that tells the engineer the global state of their model at a glance.

Add a `useMechanismDof()` hook that subscribes to the mechanism store and recomputes Gruebler's equation whenever bodies or joints change:

```ts
export function useMechanismDof(): { dof: number; status: 'underconstrained' | 'determined' | 'overconstrained' | 'empty' } {
  const bodyCount = useMechanismStore(s => s.bodies.size);
  const joints = useMechanismStore(s => Array.from(s.joints.values()));
  if (bodyCount === 0) return { dof: 0, status: 'empty' };
  return computeMechanismDof(bodyCount, joints);
}
```

Render in the status bar:
- **DOF > 0:** `"DOF: {n}"` in neutral text — the mechanism has remaining degrees of freedom (normal during authoring)
- **DOF = 0:** `"DOF: 0 (Fully Determined)"` in green — the mechanism is kinematically determined
- **DOF < 0:** `"DOF: {n} — Redundant constraints"` in amber with tooltip — over-constrained

The status bar DOF indicator updates in real-time as the user adds/removes bodies and joints. This provides the continuous constraint feedback that separates a professional tool from a form-filling exercise.

### 6. Constraint force/reaction arrows during simulation

When a joint is selected during simulation, show reaction force and torque arrows at the joint location. This uses the existing `ForceArrowManager` pattern. The data comes from the simulation runtime channels:

- `joint/{jointId}/reaction_force` (Vec3)
- `joint/{jointId}/reaction_torque` (Vec3)

If these channels are not yet exposed by the engine, add a TODO for future wiring and stub the visual code. The rendering code should be ready — just waiting for data.

## Architecture Constraints
- DOF computation is frontend-only (purely geometric/topological, not physics)
- DOF indicators are viewport objects (Babylon meshes), not React components
- Preview indicators are transient — created/disposed per hover, never persisted
- The DOF table is a static constant — not computed from the engine
- Over-constraint check uses Gruebler's equation — a simple arithmetic formula, not a solver
- Force arrows during simulation reuse the existing ForceArrowManager pool pattern

## Expected Behavior (testable)

### DOF preview during creation
1. In create-joint mode, select two datums (step: select-type)
2. Hover "Revolute" in type selector → orange arc arrow appears at midpoint, oscillating
3. Hover "Prismatic" → arc disappears, cyan double-headed arrow appears
4. Hover "Fixed" → no indicator (0 DOF)
5. Hover "Spherical" → 3 orthogonal rings appear
6. Move mouse away from selector → indicator disappears

### DOF on existing joints
1. Click an existing revolute joint in select mode → DOF arc appears (existing behavior, verify it works)
2. Click an existing cylindrical joint → arc + arrow appears
3. Deselect → indicators disappear

### Over-constraint warning
1. Create a mechanism with 2 bodies and 2 fixed joints between them
2. Warning appears: "Redundant constraints detected (Gruebler DOF: -6)" with explanatory tooltip
3. Delete one joint → warning disappears

### Persistent DOF in status bar
1. Import a STEP file with 2 bodies → status bar shows "DOF: 12" (2 free bodies × 6 DOF)
2. Add a revolute joint → status bar updates to "DOF: 7" (12 - 5 constraints)
3. Add a fixed joint → status bar shows "DOF: 1"
4. Add another fixed joint between same bodies → status bar shows "DOF: -5 — Redundant constraints" in amber

### Color coding
1. DOF indicators use green for free DOFs
2. Type selector shows green icons for free DOFs, red for locked

## Done Looks Like
- DOF indicators appear on joint type hover during creation flow
- DOF indicators orient correctly based on datum alignment axis
- Color-coded DOF summary in type selector panel
- Over-constraint warning via Gruebler's equation
- **Persistent DOF indicator in status bar updates in real-time as model changes**
- Existing DOF-on-selection behavior still works
- Force arrow code is stubbed and ready for engine data
- `pnpm --filter @motionlab/viewport typecheck` passes
- `pnpm --filter @motionlab/frontend typecheck` passes

## What NOT to Build
- Engine-side DOF computation or constraint analysis (frontend arithmetic is sufficient)
- Actual constraint force data from engine (stub only — engine channel exposure is a separate task)
- Joint limit visualization in the viewport (that is Prompt 3)
- Enhanced joint inspector (that is Prompt 3)
```

---

## Prompt 3: Joint Inspector Enhancement & Coordinate Clarity

```
# Epic 15 — Joint Inspector Enhancement & Coordinate Clarity

You are enhancing the JointInspector panel and viewport coordinate visualization to make joint coordinate relationships clear. The inspector shows a visual connection diagram, coordinate frames in multiple reference frames, and joint limit visualization. The viewport shows parent/child body frames and datum frames when a joint is selected. An "edit joint" capability lets users re-enter the creation flow with existing datums pre-selected.

## Read These First (in order)
- `docs/architecture/principles.md` — engine is computational authority
- `packages/frontend/AGENTS.md` — frontend owns workbench UX, inspector flows
- `packages/ui/AGENTS.md` — reusable components in @motionlab/ui
- `packages/frontend/src/components/JointInspector.tsx` — current joint inspector
- `packages/frontend/src/components/BodyInspector.tsx` — reference for inspector layout
- `packages/frontend/src/components/DatumInspector.tsx` — reference for coordinate display
- `packages/frontend/src/stores/mechanism.ts` — BodyState, DatumState, JointState
- `packages/viewport/src/scene-graph.ts` — joint entity management, datum world positions
- `packages/viewport/src/rendering/dof-indicators.ts` — after Prompt 2: DOF indicator rendering
- `packages/viewport/src/rendering/dof-indicators.ts` — after Prompt 2: DOF_TABLE (colors imported from `colors.ts`)
- `packages/frontend/src/stores/joint-creation.ts` — after Prompt 1: extended creation state
- `packages/ui/src/components/engineering/vec3-display.tsx` — existing Vec3 display component
- `packages/ui/src/components/engineering/quat-display.tsx` — existing quaternion display component
- Relevant ADRs under `docs/decisions/`

## Governance Reminder
Full governance applies.

## What Exists Now

### `packages/frontend/src/components/JointInspector.tsx`
Shows:
- **Identity section:** Editable name, type dropdown (revolute/prismatic/fixed/spherical/cylindrical/planar), copyable joint ID.
- **Connection section:** Parent datum name (text), child datum name (text). No body information shown, no coordinate values.
- **Limits section:** Lower/upper numeric inputs for revolute/prismatic/cylindrical.
- **Simulation Values section:** Position and velocity from trace store (during simulation).

Missing: body names, coordinate frames, visual connection diagram, limit visualization, swap button, world/local frame toggle, reaction forces/torques, edit capability.

### `packages/frontend/src/stores/mechanism.ts`
`DatumState` has `parentBodyId` and `localPose: { position: { x, y, z }, rotation: { x, y, z, w } }`. `BodyState` has `name` and `pose`. To get datum world pose: compose body.pose with datum.localPose.

### `packages/ui/src/components/engineering/vec3-display.tsx`
Existing `Vec3Display` component for showing 3D vectors/positions in inspector panels.

### `packages/ui/src/components/engineering/quat-display.tsx`
Existing `QuatDisplay` component for quaternion display.

### `packages/viewport/src/rendering/datum-triad.ts`
Renders datum coordinate frames as small RGB triads (X=red, Y=green, Z=blue arrows). These already appear at datum positions.

### `packages/viewport/src/scene-graph.ts`
`applySelection()` handles datum and joint selection highlighting. Datum triads are always visible. Joint visuals are always visible. DOF indicators appear on joint selection (after Prompt 2).

## What to Build

### 1. Connection diagram in JointInspector

Add a visual connection diagram at the top of the Connection section:

```
  BodyA                               BodyB
  ┌─────┐                            ┌─────┐
  │     │── DatumA ──[Revolute]── DatumB ──│     │
  └─────┘                            └─────┘
```

Implement as a small React component (`JointConnectionDiagram`) that shows:
- Parent body name (left, green-tinted text)
- Parent datum name (with arrow)
- Joint type icon/name (center)
- Child datum name (with arrow)
- Child body name (right, orange-tinted text)

Use CSS flexbox with connecting lines (borders or SVG). Interactive behaviors:
- **Click** a body name → selects that body (opens BodyInspector).
- **Click** a datum name → selects that datum (opens DatumInspector).
- **Hover** a body or datum name → highlights the corresponding entity in the viewport (cross-probing). This "inspector ↔ viewport" cross-probing is essential for debugging coordinate chains in complex mechanisms. Implement by temporarily adding the hovered entity ID to the selection highlight set on mouseenter, and removing on mouseleave.

### 2. Coordinate frame display

Below the connection diagram, show the coordinate data:

**Parent datum coordinates:**
- Label: "Parent Datum Pose (in Parent Body frame)"
- Position: Vec3Display showing `parentDatum.localPose.position`
- Orientation: QuatDisplay showing `parentDatum.localPose.rotation`

**Child datum coordinates:**
- Label: "Child Datum Pose (in Child Body frame)"
- Position: Vec3Display showing `childDatum.localPose.position`
- Orientation: QuatDisplay showing `childDatum.localPose.rotation`

**Frame toggle (converged pattern — matches Epic 14 datum inspector):**
Add a segmented control toggle: "Local | World" above the coordinate display. This controls which frame **both** parent and child datum poses are shown in — a single set of values per datum, not both frames simultaneously. When "Local" is active, show poses in their respective parent body frames. When "World" is active, compose body pose with datum local pose and show the result. Label updates accordingly: "Parent Datum Pose (Body Frame)" vs "Parent Datum Pose (World Frame)".

> **Pattern convergence note:** This matches the toggle pattern used in Epic 14 Prompt 3's DatumInspector and floating coordinate card. Across the product, coordinate displays use a single "Local | World" toggle rather than showing both frames simultaneously, keeping inspector panels compact and reducing visual noise (per Onshape's simulation panel convention).

Use `packages/ui/src/lib/format.ts` for value formatting. Use existing `Vec3Display` and `QuatDisplay` components.

### 3. Swap parent/child button

Add a "Swap Parent / Child" button in the Connection section. When clicked:
- Send an `UpdateJoint` command swapping `parentDatumId` and `childDatumId`
- The joint's constraint semantics change (parent body becomes child and vice versa)
- **Z-axis inversion:** Swapping parent/child may invert the joint axis (since the joint Z-axis is typically defined by the parent datum). Animate the joint visual update with a brief interpolation so the user can see the axis flip rather than having it "pop" to the new orientation. Show a brief toast or status message: "Parent/Child swapped — joint axis may have changed direction."
- Disabled during simulation

This is a convenience operation — the current workaround is delete + recreate.

Requires adding swap support to `sendUpdateJoint()` if not already present, or sending a new update with both datum IDs swapped.

### 4. Joint limits visualization in viewport

When a joint with limits is selected (revolute, prismatic, cylindrical):

**Revolute limits:**
- Draw an arc sector from `lowerLimit` to `upperLimit` centered on the joint visual
- The arc is semi-transparent green, showing the allowed rotation range
- The current position (during simulation) is shown as a thin bright line within the arc

**Prismatic limits:**
- Draw a semi-transparent tube/band along the joint axis from lower to upper limit
- Current position shown as a marker dot

**Cylindrical limits:**
- Combine revolute arc + prismatic band

Add these as optional overlays to the DOF indicator system. Create in `dof-indicators.ts` or a new `limit-visuals.ts`:

```ts
export interface LimitVisual {
  rootNode: TransformNode;
  meshes: AbstractMesh[];
  update(currentValue: number): void;
  dispose(): void;
}

export function createRevoluteLimitVisual(
  scene: Scene,
  lowerLimit: number,
  upperLimit: number,
): LimitVisual { ... }
```

### 5. Viewport coordinate frame indicators on joint selection

When a joint is selected in the viewport, show additional coordinate frame overlays:

- **Parent body origin:** Small green coordinate triad at the parent body's origin
- **Child body origin:** Small orange coordinate triad at the child body's origin
- **Connecting lines:** Thin dashed lines from body origin → datum position → joint location, for both parent and child sides

Color scheme:
- Parent side: green (matching the creation flow parent highlight)
- Child side: orange (matching the creation flow child highlight)

This makes the coordinate chain visually explicit:
```
[Parent Body Origin] ──green dashed──> [Parent Datum] ──green──> [Joint] <──orange── [Child Datum] <──orange dashed── [Child Body Origin]
```

Implement in `SceneGraphManager.applySelection()` — when a joint is selected, create these overlays. Dispose when deselected. Use `MeshBuilder.CreateDashedLines()` for the connecting lines and small `createDatumTriad()`-style triads for the body origins.

### 6. Enhanced simulation values

Extend the Simulation Values section in JointInspector:

```ts
// Existing: position, velocity
// Add: acceleration, reaction force (3D), reaction torque (3D)

const accelId = `joint/${jointId}/acceleration`;
const forceId = `joint/${jointId}/reaction_force`;
const torqueId = `joint/${jointId}/reaction_torque`;
```

For force and torque, show as Vec3Display components if the channels exist. If channels are not yet exposed by the engine, show "Not available" in muted text. The inspector should gracefully handle missing channels.

### 7. "Edit Joint" button

Add an "Edit Joint" button in the inspector. When clicked:
- Enter create-joint mode
- Pre-populate the joint-creation store with the existing joint's parent and child datums
- Skip to `'select-type'` step with the current type pre-selected
- The type selector appears with the current type highlighted
- User can change type, change limits, or cancel
- On "Update" (instead of "Create"), send an `UpdateJoint` command with the new type/limits
- On cancel, return to select mode with no changes

Add a new method to `joint-creation.ts`:

```ts
editExisting: (jointId: string, parentDatumId: string, childDatumId: string, currentType: JointTypeId) => void
```

This sets step to `'select-type'` with all fields pre-populated and an `editingJointId` flag so the commit handler knows to update instead of create.

**Datum visibility in edit mode:** Since datum re-picking is not supported in edit mode, show the parent and child datums as **read-only chips** at the top of the type selector panel (e.g., "Parent: Axis_1 (on BodyA)" and "Child: Plane_2 (on BodyB)" in muted, non-interactive style). Below the chips, show a small note: "To change datums, delete this joint and create a new one." This prevents user confusion when they try to re-pick datums and nothing happens.

### 8. DOF summary in inspector

Add a "Degrees of Freedom" row in the Identity section:

```ts
<PropertyRow label="DOF">
  <span className="text-2xs">
    {DOF_TABLE[joint.type]?.label ?? '?'} ({DOF_TABLE[joint.type]?.total ?? '?'} of 6 free)
  </span>
</PropertyRow>
```

Import `DOF_TABLE` from `@motionlab/viewport` or move it to a shared location (`@motionlab/protocol` or a new shared utils package).

## Architecture Constraints
- Coordinate frame composition (body pose * datum local pose) is frontend math — no engine call
- The swap operation uses the existing UpdateJoint protocol command
- Limit visuals are viewport-only overlays — not stored in the mechanism model
- The "edit joint" flow reuses the creation state machine — no new protocol messages
- DOF_TABLE should be importable by both viewport (for rendering) and frontend (for inspector) — consider placing it in `@motionlab/protocol` or a shared location
- Coordinate frame overlays on joint selection are transient viewport objects — disposed on deselection

## Expected Behavior (testable)

### Connection diagram
1. Select a joint → inspector shows connection diagram with body names, datum names, joint type
2. Click parent body name in diagram → body selected, body inspector opens
3. Click child datum name in diagram → datum selected, datum inspector opens

### Coordinate display
1. Select a joint → parent datum pose shown in parent body local frame
2. Toggle "World Frame" → values change to world-frame coordinates
3. Toggle back → values return to local frame

### Swap parent/child
1. Select a joint → click "Swap Parent / Child"
2. Parent and child datums swap in the inspector
3. Joint visual updates in viewport (parent/child sides swap)
4. Swap button disabled during simulation

### Limit visualization
1. Select a revolute joint with limits [-1.0, 1.0] → green arc sector visible in viewport
2. During simulation, current position marker moves within the arc
3. Select a prismatic joint with limits [0, 0.5] → band visible along axis
4. Select a fixed joint → no limit visual

### Coordinate frame overlays
1. Select a joint → parent body origin shown with green triad, child body origin with orange triad
2. Dashed lines visible from body origins to datums to joint
3. Deselect joint → overlays disappear

### Edit joint
1. Select a joint → click "Edit Joint" in inspector
2. Type selector appears with current type highlighted
3. Change type from revolute to cylindrical
4. Click "Update" → joint type changes, visual updates in viewport
5. Click "Cancel" → no changes, return to select mode

## Done Looks Like
- JointInspector shows connection diagram with clickable body/datum names
- Coordinate frames displayed in local and world frame with toggle
- Swap parent/child works and updates both inspector and viewport
- Limit visuals appear for revolute/prismatic/cylindrical joints on selection
- Coordinate frame overlays (body origins + connecting lines) on joint selection
- DOF summary row in inspector
- Edit joint re-enters creation flow with pre-populated state
- Simulation values section handles missing channels gracefully
- `pnpm --filter @motionlab/frontend typecheck` passes
- `pnpm --filter @motionlab/viewport typecheck` passes
- `pnpm --filter @motionlab/ui typecheck` passes

## What NOT to Build
- Joint creation from scratch (that is Prompt 1)
- DOF indicator rendering changes (that was Prompt 2)
- Over-constraint detection (that was Prompt 2)
- Protocol changes for new joint types (out of scope — use existing UpdateJoint command)
- Datum re-picking in edit mode (edit mode changes type/limits only; re-picking datums requires delete + recreate for now)
```

---

## Integration Verification

After all three prompts complete, verify the full joint creation and visualization flow:

**Path A: Expert flow (explicit datums)**
1. **Enter create-joint mode** (press `J`) — cursor changes to crosshair, status bar shows "Click a datum or face to set as joint parent"
2. **Click datum A on body X** — datum A highlights green, floating label "Parent: A (on BodyX)", datums on body X desaturated and non-pickable
3. **Click datum B on body Y** — datum B highlights orange, semantic connector line appears (aligned to shared axis if coaxial), type selector panel opens
4. **Verify recommendations** — if datums are coaxial, Revolute and Cylindrical listed first with "Recommended" badge. Revolute is **auto-selected** and its DOF preview appears immediately

**Path B: Fast flow (face-to-datum shortcut)**
1. **Enter create-joint mode** (press `J`) — cursor changes to crosshair
2. **Click a cylindrical face on body X** — datum preview flashes, axis datum auto-created from face, highlights green as parent
3. **Click a cylindrical face on body Y** — axis datum auto-created, highlights orange, connector line appears along shared axis
4. **Type selector opens** with "Revolute" auto-selected (coaxial alignment) — the user created a joint from 3 clicks without ever thinking about datums

**Common flow (continues from either path):**
5. **Hover "Prismatic"** — Revolute DOF arc disappears, cyan arrow appears
6. **Click "Revolute"** (or confirm the auto-selection) — name auto-fills "Joint 1", limit fields appear
7. **Set limits** [-1.57, 1.57] → click "Create"
8. **Joint appears** — torus visual at midpoint, project tree updated. **Status bar DOF count updates immediately.**
9. **Select the joint** — DOF arc indicator appears, limit arc sector visible, coordinate frame overlays show body origins with dashed connecting lines
10. **Check inspector** — connection diagram shows BodyX → DatumA → [Revolute] → DatumB → BodyY, "Local | World" toggle defaults to Local
11. **Hover body name in diagram** — body highlights in viewport (cross-probing)
12. **Toggle to "World"** — coordinates update to world frame
13. **Click "Swap Parent / Child"** — parent and child swap with animated axis interpolation, toast confirms axis may have changed
14. **Click "Edit Joint"** — type selector reopens with Revolute selected, read-only datum chips at top show "Parent: A (on BodyX)" / "Child: B (on BodyY)" with note about re-picking
15. **Run simulation** — joint position and velocity shown in inspector, reaction forces shown if channels available
16. **Verify over-constraint** — add a second fixed joint between same bodies → "Redundant constraints detected (Gruebler DOF: -6)" warning with tooltip. Status bar shows amber DOF indicator.
17. **ESC single-level undo** — from select-type: back to pick-child (parent stays). From pick-child: back to pick-parent. From pick-parent: exit mode. All previews clean up at each step
18. **Typecheck:** `pnpm --filter @motionlab/frontend typecheck && pnpm --filter @motionlab/viewport typecheck && pnpm --filter @motionlab/ui typecheck` all pass

## Future Work (out of scope)

- ~~**Joint type auto-selection:**~~ Now part of Prompt 1 — first recommended type is auto-selected when entering the type selector.
- **Multi-joint creation:** Select 3+ datums and auto-create a chain of joints (e.g., for serial linkages).
- **Constraint solver preview:** Show the constrained equilibrium position before simulation (requires engine-side computation).
- **Joint DOF animation preview:** Instead of just showing DOF arrows, animate the child body moving through its allowed DOF range (mini kinematic preview).
- **Datum re-picking in edit mode:** Allow re-selecting parent/child datums for an existing joint without deleting it.
- **Joint template library:** Save and reuse common joint configurations (e.g., "hinge with +-90 deg limits").
