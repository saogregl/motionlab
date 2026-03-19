# Epic 5 — Parallel Agent Prompts

> **Status:** Complete
> **Completed:** Commit `782d9dc` ("Epic 4+: datum/joint CRUD, mechanism state, viewport visuals, protocol expansion")
> **Deviations:** Work was delivered alongside Epic 4 rather than as a separate phase.
>
> **What's done:**
> - Prompt 1 (Protocol + Engine + Store): Complete. `CreateDatumCommand`, `DeleteDatumCommand`, `RenameDatumCommand` in transport.proto. Engine `MechanismState` with full datum CRUD. Mechanism store with `datums: Map`. ADR-0004 written.
> - Prompt 2 (Creation Tool Mode): Complete. `useToolModeStore` with select/create-datum/create-joint modes. Face-aware picking via `pickSpatialData()` returns worldPoint, worldNormal, bodyWorldMatrix, faceIndex. `sendCreateDatumFromFace()` wired in connection.ts.
> - Prompt 3 (Visualization + Inspection + Tree): Complete. Datum triads in viewport (`datum-triad.ts`), datum picking/selection, datums as tree children, `EntityInspector` with inline rename, delete via context menu.

Three prompts. Mostly sequential but Prompt 3 can overlap with Prompt 2.

**Governance note:** Epics 5+ are under full governance — every boundary or contract change requires an ADR, every protocol/schema change requires seam tests, every architecture change requires doc updates.

## Shared Contract

| Interface | Owner | Consumer |
|-----------|-------|----------|
| `CreateDatumCommand`/`CreateDatumResult` proto messages | Prompt 1 (defines + engine implements) | Prompt 2 (frontend sends), Prompt 3 (frontend receives) |
| Datum entries in mechanism Zustand store | Prompt 1 (store updated on result) | Prompt 2 (tool mode reads bodies), Prompt 3 (tree + inspector consumes) |
| Tool mode store (activeMode) | Prompt 2 (creates) | Prompt 3 (toolbar button wires) |
| Datum rendering in SceneGraphManager (addDatum) | Prompt 3 (implements) | Prompt 2 (datum appears after creation) |

Integration test: User clicks body surface → datum frame appears → datum visible in tree + inspector → datum survives engine state.

---

## Prompt 1: Datum Protocol + Engine-Side Creation + Store

```
# Epic 5 — Datum Protocol, Engine-Side Creation, and Mechanism Store

You are implementing the datum CRUD protocol, engine-side datum management, and frontend store updates for MotionLab. Datums are first-class authored entities mounted to bodies — they define reference frames for joint attachment, sensor mounting, and measurement.

## Read These First (in order)
- `docs/architecture/principles.md` — non-negotiable rules (especially: engine is authority, sensors/datums are first-class authored entities)
- `docs/architecture/protocol-overview.md` — protocol contract rules
- `docs/domain/` — any datum or mechanism domain docs
- `schemas/AGENTS.md` — schema ownership
- `packages/protocol/AGENTS.md` — generated bindings are read-only artifacts
- `native/engine/AGENTS.md` — native boundary rules, required checks
- Relevant ADRs under `docs/decisions/`

## Governance Reminder
This is Epic 5 — full governance applies:
- Any boundary or contract change requires an ADR
- Any protocol/schema change requires seam tests at the affected seam
- Any architecture change requires doc updates

## What Exists Now

### `schemas/protocol/transport.proto`
Command/Event oneofs with: kHandshake, kPing, kImportAsset messages. You will add datum CRUD messages to these oneofs.

### `schemas/mechanism/mechanism.proto`
Full mechanism IR: ElementId, Vec3, Quat, Pose, MassProperties, Body, Datum (`{ id, name, parent_body_id, local_pose }`), Joint, JointType, Mechanism. The Datum message already exists in the schema — you need to add Command/Event wrappers for CRUD operations.

### `native/engine/src/transport.cpp`
Command switch handles: kHandshake, kPing, kImportAsset. You will add kCreateDatum, kDeleteDatum, kRenameDatum cases.

### `native/engine/include/engine/transport.h`
TransportServer class, EngineConfig, EngineState. The engine currently tracks bodies from import but may not have a structured mechanism state holder.

### `packages/frontend/src/stores/mechanism.ts`
Zustand store with `bodies: Map<string, BodyState>`. You will add datum state here.

### `packages/frontend/src/engine/connection.ts`
WebSocket client. Handles events by `payload.case` switch. You will add cases for datum results.

### `packages/protocol/src/transport.ts`
Exports `createHandshakeCommand`, `createImportAssetCommand`, `parseEvent`. You will add datum command creators.

### `packages/protocol/src/index.ts`
Re-exports all protocol types and helpers.

## What to Build

### 1. Add datum CRUD messages to transport.proto

Add to the `Command` oneof:
```protobuf
// Datum authoring commands
CreateDatumCommand create_datum = 10;
DeleteDatumCommand delete_datum = 11;
RenameDatumCommand rename_datum = 12;
```

Define the message types:
```protobuf
message CreateDatumCommand {
  ElementId parent_body_id = 1;
  Pose local_pose = 2;
  string name = 3;
}

message DeleteDatumCommand {
  ElementId datum_id = 1;
}

message RenameDatumCommand {
  ElementId datum_id = 1;
  string name = 2;
}
```

Add to the `Event` oneof:
```protobuf
CreateDatumResult create_datum_result = 10;
DeleteDatumResult delete_datum_result = 11;
RenameDatumResult rename_datum_result = 12;
```

Define the result types:
```protobuf
message CreateDatumResult {
  oneof result {
    Datum datum = 1;
    string error_message = 2;
  }
}

message DeleteDatumResult {
  oneof result {
    ElementId deleted_id = 1;
    string error_message = 2;
  }
}

message RenameDatumResult {
  oneof result {
    Datum datum = 1;
    string error_message = 2;
  }
}
```

### 2. Run codegen

Run `pnpm generate:proto` and verify generated TS and C++ files include the new messages.

### 3. Engine-side mechanism state

The engine needs an authoritative in-memory mechanism model. Create `native/engine/src/mechanism_state.h` and `native/engine/src/mechanism_state.cpp`:

```cpp
class MechanismState {
public:
    // Body management (from import)
    void addBody(const motionlab::mechanism::Body& body);
    const motionlab::mechanism::Body* getBody(const std::string& id) const;
    bool hasBody(const std::string& id) const;

    // Datum management
    std::optional<motionlab::mechanism::Datum> createDatum(
        const std::string& parent_body_id,
        const motionlab::mechanism::Pose& local_pose,
        const std::string& name
    );
    bool deleteDatum(const std::string& datum_id);
    std::optional<motionlab::mechanism::Datum> renameDatum(
        const std::string& datum_id,
        const std::string& new_name
    );
    const motionlab::mechanism::Datum* getDatum(const std::string& id) const;

private:
    std::unordered_map<std::string, motionlab::mechanism::Body> bodies_;
    std::unordered_map<std::string, motionlab::mechanism::Datum> datums_;
    // UUIDv7 generation for new entity IDs
    std::string generateId();
};
```

Wire this into the existing TransportServer so that import and datum operations go through MechanismState.

### 4. Engine-side command handlers

In `transport.cpp`, add cases to the command switch:

```cpp
case Command::kCreateDatum: {
    const auto& cmd = command.create_datum();
    auto result = mechanism_state_.createDatum(
        cmd.parent_body_id().id(),
        cmd.local_pose(),
        cmd.name()
    );
    Event event;
    event.set_sequence_id(command.sequence_id());
    auto* r = event.mutable_create_datum_result();
    if (result) {
        *r->mutable_datum() = *result;
    } else {
        r->set_error_message("Parent body not found");
    }
    sendEvent(event);
    break;
}

case Command::kDeleteDatum: {
    const auto& cmd = command.delete_datum();
    Event event;
    event.set_sequence_id(command.sequence_id());
    auto* r = event.mutable_delete_datum_result();
    if (mechanism_state_.deleteDatum(cmd.datum_id().id())) {
        r->mutable_deleted_id()->set_id(cmd.datum_id().id());
    } else {
        r->set_error_message("Datum not found");
    }
    sendEvent(event);
    break;
}

case Command::kRenameDatum: {
    const auto& cmd = command.rename_datum();
    auto result = mechanism_state_.renameDatum(
        cmd.datum_id().id(), cmd.name()
    );
    Event event;
    event.set_sequence_id(command.sequence_id());
    auto* r = event.mutable_rename_datum_result();
    if (result) {
        *r->mutable_datum() = *result;
    } else {
        r->set_error_message("Datum not found");
    }
    sendEvent(event);
    break;
}
```

### 5. UUIDv7 generation engine-side

Implement or integrate UUIDv7 generation for datum IDs. Use a simple header-only library or manual implementation. The ID must be a valid UUIDv7 string (RFC 9562). Store the implementation in a reusable utility (e.g., `native/engine/src/uuid.h`).

### 6. Update mechanism Zustand store

In `packages/frontend/src/stores/mechanism.ts`, add datum state:

```ts
interface DatumState {
  id: string;
  name: string;
  parentBodyId: string;
  localPose: { position: { x: number; y: number; z: number }; orientation: { x: number; y: number; z: number; w: number } };
}

interface MechanismStore {
  // existing
  bodies: Map<string, BodyState>;
  // new
  datums: Map<string, DatumState>;
  addDatum(datum: DatumState): void;
  removeDatum(id: string): void;
  renameDatum(id: string, name: string): void;
}
```

### 7. Handle datum events in connection.ts

Add cases to the event payload switch:

```ts
case 'createDatumResult': {
  const result = payload.value;
  if (result.result.case === 'datum') {
    const datum = result.result.value;
    useMechanismStore.getState().addDatum({
      id: datum.id!.id,
      name: datum.name,
      parentBodyId: datum.parentBodyId!.id,
      localPose: convertPose(datum.localPose!),
    });
  } else {
    console.error('[connection] CreateDatum failed:', result.result.value);
  }
  break;
}

case 'deleteDatumResult': {
  const result = payload.value;
  if (result.result.case === 'deletedId') {
    useMechanismStore.getState().removeDatum(result.result.value.id);
  }
  break;
}

case 'renameDatumResult': {
  const result = payload.value;
  if (result.result.case === 'datum') {
    const datum = result.result.value;
    useMechanismStore.getState().renameDatum(datum.id!.id, datum.name);
  }
  break;
}
```

### 8. Add protocol helper functions

In `packages/protocol/src/transport.ts`, add:

```ts
export function createCreateDatumCommand(
  parentBodyId: string,
  localPose: { position: Vec3; orientation: Quat },
  name: string,
  sequenceId: bigint
): Uint8Array { ... }

export function createDeleteDatumCommand(
  datumId: string,
  sequenceId: bigint
): Uint8Array { ... }

export function createRenameDatumCommand(
  datumId: string,
  name: string,
  sequenceId: bigint
): Uint8Array { ... }
```

Add `sendCreateDatum`, `sendDeleteDatum`, `sendRenameDatum` convenience methods in `connection.ts`.

### 9. Write protocol seam test

Add a test that:
1. Starts the engine
2. Imports a body (via ImportAssetCommand)
3. Sends CreateDatumCommand on that body with a pose
4. Receives CreateDatumResult with a valid UUIDv7 datum ID
5. Verifies datum's parent_body_id matches the body
6. Sends DeleteDatumCommand with the datum ID
7. Receives DeleteDatumResult confirming deletion
8. Sends CreateDatumCommand on a nonexistent body
9. Receives CreateDatumResult with error_message

### 10. Write ADR for datum creation contract

If the datum CRUD pattern changes any boundary semantics from what's documented, write an ADR. At minimum, document:
- Datums are engine-authoritative authored entities
- UUIDv7 IDs generated engine-side
- Create/Delete/Rename follow the Command→Result pattern

## Architecture Constraints
- Engine is authoritative — datum creation happens in the engine, frontend receives confirmation
- UUIDv7 for datum IDs generated engine-side
- Datums are first-class authored entities, NOT backend runtime objects
- The mechanism state in the engine is the single source of truth
- Frontend store is a projection of engine state, updated via events

## Done Looks Like
- `pnpm generate:proto` generates updated TS and C++ with datum messages
- Engine can create datums on bodies, delete datums, rename datums
- Engine rejects datum creation on nonexistent bodies
- Frontend mechanism store reflects datum state from engine events
- Protocol seam test passes for all datum CRUD operations
- `cmake --preset dev && cmake --build build/dev` succeeds
- `ctest --preset dev` passes with datum tests
- `pnpm --filter @motionlab/protocol typecheck` passes
- `pnpm --filter @motionlab/frontend typecheck` passes

## What NOT to Build
- Viewport rendering of datums (that's Prompt 3)
- Creation tool mode UX or geometry-aware picking (that's Prompt 2)
- Tree integration or inspector UI (that's Prompt 3)
- Joint authoring (Epic 6)
- Save/load (Epic 6)
- Simulation (future epics)
```

---

## Prompt 2: Datum Creation Tool Mode + Geometry-Aware Picking

```
# Epic 5 — Datum Creation Tool Mode and Geometry-Aware Picking

You are implementing the interactive datum creation flow: tool mode switching, geometry-aware surface picking, and local frame computation. Users switch to "Create Datum" mode, click a body surface, and a datum is created at the pick point with correct orientation.

## Read These First (in order)
- `docs/architecture/principles.md` — React is NOT the hot path; viewport operations are imperative
- `packages/frontend/AGENTS.md` — frontend owns workbench UX
- `packages/viewport/AGENTS.md` — viewport owns visualization and picking
- `docs/architecture/runtime-topology.md` — engine is authority
- Relevant ADRs under `docs/decisions/`

## Governance Reminder
This is Epic 5 — full governance applies:
- Any boundary or contract change requires an ADR
- Any protocol/schema change requires seam tests at the affected seam
- Any architecture change requires doc updates

## What Exists Now

### `packages/viewport/src/picking.ts`
PickingManager using `scene.pick()` from Babylon.js. Currently handles body selection: clicking a mesh selects the corresponding body via a callback. Returns pick info including hit point, normal, and faceId.

### `packages/viewport/src/scene-graph.ts`
SceneGraphManager with `addBody(id, meshData)`, `removeBody(id)`, `updateTransform(id, transform)`, `getEntity(id)`. Manages the mapping between mechanism entities and Babylon meshes.

### `packages/frontend/src/stores/mechanism.ts`
Zustand store with `bodies` and (after Prompt 1) `datums` Maps. Provides body data for tool mode logic.

### `packages/frontend/src/stores/selection.ts`
Selection store: `selectedIds`, `hoveredId`, `select`, `deselect`, `toggle`. Currently handles body selection only.

### `packages/frontend/src/engine/connection.ts`
WebSocket client. After Prompt 1 has `sendCreateDatum`, `sendDeleteDatum`, `sendRenameDatum`.

### `packages/protocol/src/transport.ts`
After Prompt 1 exports `createCreateDatumCommand` and related helpers.

### `packages/ui/src/`
UI components: Button, Toggle, DropdownMenu, ContextMenu, Tabs, etc. Use these for toolbar buttons.

## What to Build

### 1. Tool mode Zustand store

Create `packages/frontend/src/stores/tool-mode.ts`:

```ts
type ToolMode = 'select' | 'create-datum';

interface ToolModeStore {
  activeMode: ToolMode;
  setMode(mode: ToolMode): void;
}

export const useToolModeStore = create<ToolModeStore>((set) => ({
  activeMode: 'select',
  setMode: (mode) => set({ activeMode: mode }),
}));
```

### 2. Modify picking behavior based on tool mode

When `activeMode === 'create-datum'`:
- Clicking a body surface does NOT select the body
- Instead, it computes a datum pose from the pick result and sends a CreateDatumCommand
- If the click misses all bodies, nothing happens (no deselection either)

When `activeMode === 'select'`:
- Existing selection behavior is preserved unchanged

Wire this into PickingManager. The PickingManager needs to accept a mode or callback strategy that determines what happens on pick. Prefer a callback pattern over importing frontend stores into the viewport package:

```ts
// In PickingManager or its configuration
type PickHandler = (pickInfo: {
  bodyId: string;
  worldPoint: Vector3;
  worldNormal: Vector3;
  faceId: number;
}) => void;

setPickHandler(handler: PickHandler): void;
```

The frontend wires the appropriate handler based on tool mode.

### 3. Compute datum pose from pick result

Create a utility in the viewport package — `packages/viewport/src/datum-pose.ts`:

```ts
import { Vector3, Quaternion, Matrix } from '@babylonjs/core';

interface DatumPoseResult {
  localPosition: { x: number; y: number; z: number };
  localOrientation: { x: number; y: number; z: number; w: number };
}

export function computeDatumPose(
  worldPoint: Vector3,
  worldNormal: Vector3,
  bodyWorldTransform: Matrix
): DatumPoseResult {
  // 1. Datum Z-axis = surface normal
  const zAxis = worldNormal.normalize();

  // 2. Choose a reference vector for X-axis (cross with world-up)
  let refUp = Vector3.Up();
  // Handle degenerate case: normal is parallel to up
  if (Math.abs(Vector3.Dot(zAxis, refUp)) > 0.99) {
    refUp = Vector3.Right();
  }

  // 3. X-axis = cross(up, Z), normalized
  const xAxis = Vector3.Cross(refUp, zAxis).normalize();

  // 4. Y-axis = cross(Z, X) to complete right-handed frame
  const yAxis = Vector3.Cross(zAxis, xAxis).normalize();

  // 5. Build world orientation quaternion from axes
  const rotMatrix = Matrix.FromValues(
    xAxis.x, xAxis.y, xAxis.z, 0,
    yAxis.x, yAxis.y, yAxis.z, 0,
    zAxis.x, zAxis.y, zAxis.z, 0,
    0, 0, 0, 1
  );
  const worldOrientation = Quaternion.FromRotationMatrix(rotMatrix);

  // 6. Transform world point and orientation into body-local space
  const bodyInverse = Matrix.Invert(bodyWorldTransform);
  const localPoint = Vector3.TransformCoordinates(worldPoint, bodyInverse);
  // ... transform orientation into local space similarly

  return {
    localPosition: { x: localPoint.x, y: localPoint.y, z: localPoint.z },
    localOrientation: { x: ..., y: ..., z: ..., w: ... },
  };
}
```

### 4. Wire datum creation flow

When in create-datum mode and user clicks a body surface:
1. Get pick result: bodyId, worldPoint, worldNormal
2. Get body world transform from SceneGraphManager
3. Call `computeDatumPose(worldPoint, worldNormal, bodyWorldTransform)`
4. Generate auto-name: "Datum 1", "Datum 2", etc. (count existing datums on that body + 1)
5. Call `sendCreateDatum(bodyId, localPose, autoName)`

### 5. Tool mode toolbar

Add tool mode buttons to the application toolbar (secondary toolbar area, above or beside the viewport):

```tsx
import { useToolModeStore } from '../stores/tool-mode';

function ToolModeToolbar() {
  const { activeMode, setMode } = useToolModeStore();

  return (
    <div className="flex gap-1 p-1">
      <Toggle
        pressed={activeMode === 'select'}
        onPressedChange={() => setMode('select')}
        aria-label="Select mode"
      >
        Select
      </Toggle>
      <Toggle
        pressed={activeMode === 'create-datum'}
        onPressedChange={() => setMode('create-datum')}
        aria-label="Create datum mode"
      >
        Create Datum
      </Toggle>
    </div>
  );
}
```

### 6. Visual feedback during create-datum mode

When create-datum mode is active:
- Cursor changes to crosshair over body surfaces (CSS `cursor: crosshair` on the viewport canvas)
- Optional: hover on body shows a small preview dot or crosshair at the pick point to indicate where the datum will be placed. This is a nice-to-have — a simple dot using Babylon's `MeshBuilder.CreateSphere` as a transient preview is sufficient.

### 7. Mode exit behavior

After creating a datum:
- Stay in create-datum mode for rapid authoring (users can click multiple surfaces in sequence)
- Pressing Escape exits create-datum mode and returns to select mode
- Add keyboard listener: `Escape` → `setMode('select')`

## Architecture Constraints
- Tool mode is frontend state only — it does not exist in the engine or protocol
- The actual datum creation goes through the engine via CreateDatumCommand — the frontend does not create datums locally
- Surface normal computation uses Babylon's picking info (faceId, getNormal)
- The viewport package must not import from `@motionlab/frontend` — use callbacks or events to communicate between them
- Keep picking logic in the viewport package; tool mode decision logic in the frontend package

## Done Looks Like
- User can switch to "Create Datum" mode via toolbar toggle
- Clicking on a body surface in create-datum mode creates a datum at that location
- Datum pose has correct orientation (Z-axis aligned to surface normal)
- Multiple datums can be created in sequence without switching modes
- Escape key returns to select mode
- Select mode works as before (body selection, no datum creation)
- Cursor provides visual feedback for active mode
- `pnpm --filter @motionlab/frontend typecheck` passes
- `pnpm --filter @motionlab/viewport typecheck` passes

## What NOT to Build
- Datum visualization/rendering in viewport (that's Prompt 3)
- Datum inspector or tree integration (that's Prompt 3)
- Datum editing (move, reorient) — future
- Joint authoring (Epic 6)
- Save/load (Epic 6)
```

---

## Prompt 3: Datum Visualization + Inspection + Tree Integration

```
# Epic 5 — Datum Visualization, Inspection, and Tree Integration

You are implementing datum rendering in the viewport (coordinate frame triads), datum display in the project tree, and the datum inspector panel. This completes the datum authoring loop: create → see → inspect → rename → delete.

## Read These First (in order)
- `docs/architecture/principles.md` — React is NOT the hot path for viewport; datums are first-class authored entities
- `packages/viewport/AGENTS.md` — viewport owns visualization, scene graph manages entity rendering
- `packages/frontend/AGENTS.md` — frontend owns workbench UX, Zustand for state
- `packages/ui/AGENTS.md` — UI primitives available
- Relevant ADRs under `docs/decisions/`

## Governance Reminder
This is Epic 5 — full governance applies:
- Any boundary or contract change requires an ADR
- Any protocol/schema change requires seam tests at the affected seam
- Any architecture change requires doc updates
- Update `docs/architecture/` with datum authoring subsystem description when this prompt completes

## What Exists Now

### `packages/viewport/src/scene-graph.ts`
SceneGraphManager with `addBody`, `removeBody`, `updateTransform`, `getEntity`. Manages Babylon meshes for bodies. You will add datum entity management.

### `packages/viewport/src/picking.ts`
PickingManager handles selection via `scene.pick()`. After Prompt 2, supports mode-based pick handling. You will extend it to handle datum picking.

### `packages/frontend/src/stores/mechanism.ts`
Zustand store with `bodies` and (after Prompt 1) `datums` Maps. Provides datum data for tree and inspector.

### `packages/frontend/src/stores/selection.ts`
Selection store: `selectedIds`, `hoveredId`, `select`, `deselect`, `toggle`. Currently handles body selection. You will extend to support datum selection.

### `packages/frontend/src/stores/tool-mode.ts`
After Prompt 2: tool mode store with 'select' and 'create-datum' modes.

### `packages/frontend/src/engine/connection.ts`
After Prompt 1: handles CreateDatumResult, DeleteDatumResult, RenameDatumResult.

### Existing UI components
- `packages/frontend/src/components/BodyTree.tsx` — tree of bodies using TreeView from @motionlab/ui
- `packages/frontend/src/components/BodyInspector.tsx` — inspector for selected body
- `packages/ui/src/` — TreeView, TreeRow, PropertyRow, InspectorPanel, InspectorSection, Button, Dialog, ContextMenu, Tabs, Toggle

### `schemas/mechanism/mechanism.proto`
Datum message: `{ id (ElementId), name (string), parent_body_id (ElementId), local_pose (Pose) }`.

## What to Build

### 1. Datum rendering in SceneGraphManager

Add datum entity management to `packages/viewport/src/scene-graph.ts`:

```ts
addDatum(id: string, parentBodyId: string, localPose: Pose): void {
  // Create a coordinate frame triad: 3 arrows
  // X-axis = red, Y-axis = green, Z-axis = blue
  // Each arrow is a thin cylinder + cone tip

  const triadSize = 0.05; // meters — base size, will be scaled
  const parent = this.getEntity(parentBodyId);

  // Create triad as child of parent body mesh
  // This ensures datums follow body transforms automatically
  const triadRoot = new TransformNode(`datum-${id}`, this.scene);
  triadRoot.parent = parent.mesh;

  // Apply local pose (position + orientation)
  triadRoot.position = new Vector3(localPose.position.x, ...);
  triadRoot.rotationQuaternion = new Quaternion(localPose.orientation.x, ...);

  // Create X arrow (red)
  const xArrow = createArrowMesh('x', triadSize, new Color3(1, 0, 0), this.scene);
  xArrow.parent = triadRoot;
  xArrow.rotation = new Vector3(0, 0, -Math.PI / 2); // point along X

  // Create Y arrow (green)
  const yArrow = createArrowMesh('y', triadSize, new Color3(0, 1, 0), this.scene);
  yArrow.parent = triadRoot;
  // Y is default up direction — no rotation needed

  // Create Z arrow (blue)
  const zArrow = createArrowMesh('z', triadSize, new Color3(0, 0, 1), this.scene);
  zArrow.parent = triadRoot;
  zArrow.rotation = new Vector3(Math.PI / 2, 0, 0); // point along Z

  // Store entity reference for picking and selection
  this.entities.set(id, { type: 'datum', mesh: triadRoot, arrows: [xArrow, yArrow, zArrow] });
}

removeDatum(id: string): void {
  const entity = this.entities.get(id);
  if (entity) {
    entity.mesh.dispose();
    this.entities.delete(id);
  }
}
```

### 2. Datum world transform follows parent body

Since datum triad meshes are parented to the body mesh in Babylon's scene graph, they automatically inherit the body's world transform. When simulation or manual repositioning moves a body in the future, datums follow.

Verify: `datum world transform = parent body world transform * datum local pose`.

### 3. View-distance scaling for datum triads

Datum triads should remain a consistent screen size regardless of zoom level. Implement billboard-like scaling:

```ts
// In the scene's beforeRender observer
scene.onBeforeRenderObservable.add(() => {
  for (const [id, entity] of this.entities) {
    if (entity.type === 'datum') {
      const distance = Vector3.Distance(
        entity.mesh.getAbsolutePosition(),
        scene.activeCamera.position
      );
      const scale = distance * 0.03; // adjust factor for desired visual size
      entity.mesh.scaling = new Vector3(scale, scale, scale);
    }
  }
});
```

### 4. Datum picking and selection

Extend PickingManager to handle datum triad clicks:
- When picking hits a datum arrow mesh, identify the parent datum entity
- Map arrow meshes back to datum IDs via metadata or the entity map
- In select mode: clicking a datum selects it (same as body selection)
- Update selection store: `selectedIds` can contain both body IDs and datum IDs

Extend the selection store if needed to track entity type:
```ts
interface SelectionState {
  selectedIds: Set<string>;
  selectedType: 'body' | 'datum' | 'joint' | null;
  hoveredId: string | null;
  // ...
}
```

### 5. Selection highlight for datums

When a datum is selected:
- Highlight the triad arrows (e.g., increase brightness, add glow, or thicken the arrows)
- The highlight approach should be consistent with body selection highlights

### 6. Integrate datums into the tree

Refactor `BodyTree` (or create an updated version) to show datums as children of their parent body:

```tsx
function BodyTree() {
  const bodies = useMechanismStore((s) => s.bodies);
  const datums = useMechanismStore((s) => s.datums);

  return (
    <TreeView>
      {Array.from(bodies.values()).map((body) => (
        <TreeRow key={body.id} id={body.id} label={body.name} icon={<BodyIcon />}>
          {/* Child datums nested under parent body */}
          {Array.from(datums.values())
            .filter((d) => d.parentBodyId === body.id)
            .map((datum) => (
              <TreeRow key={datum.id} id={datum.id} label={datum.name} icon={<DatumIcon />} />
            ))}
        </TreeRow>
      ))}
    </TreeView>
  );
}
```

Wire tree selection: clicking a datum row in the tree selects it in the selection store. Selection syncs bidirectionally — selecting in viewport highlights in tree, selecting in tree highlights in viewport.

### 7. DatumInspector component

Create `packages/frontend/src/components/DatumInspector.tsx`:

```tsx
function DatumInspector({ datumId }: { datumId: string }) {
  const datum = useMechanismStore((s) => s.datums.get(datumId));
  const parentBody = useMechanismStore((s) => s.bodies.get(datum?.parentBodyId ?? ''));

  if (!datum) return null;

  return (
    <InspectorPanel title="Datum">
      <InspectorSection title="Identity">
        <PropertyRow label="Name">
          <InlineEdit value={datum.name} onCommit={(name) => sendRenameDatum(datumId, name)} />
        </PropertyRow>
        <PropertyRow label="Parent Body">
          <span>{parentBody?.name ?? 'Unknown'}</span>
        </PropertyRow>
      </InspectorSection>
      <InspectorSection title="Local Transform">
        <PropertyRow label="Position X">{datum.localPose.position.x.toFixed(4)}</PropertyRow>
        <PropertyRow label="Position Y">{datum.localPose.position.y.toFixed(4)}</PropertyRow>
        <PropertyRow label="Position Z">{datum.localPose.position.z.toFixed(4)}</PropertyRow>
        <PropertyRow label="Orientation">
          {/* Display as Euler angles (degrees) or quaternion — user preference */}
          {formatQuaternion(datum.localPose.orientation)}
        </PropertyRow>
      </InspectorSection>
    </InspectorPanel>
  );
}
```

Wire the inspector to show DatumInspector when a datum is selected, BodyInspector when a body is selected.

### 8. Datum deletion

- Select a datum → press Delete key → sends DeleteDatumCommand
- Right-click datum in tree → context menu → "Delete" → sends DeleteDatumCommand
- Right-click datum triad in viewport → context menu → "Delete" → sends DeleteDatumCommand
- On deletion: SceneGraphManager.removeDatum() called, tree updates, inspector clears

### 9. Datum renaming

- Double-click datum name in tree → inline edit → on commit sends RenameDatumCommand
- Edit name in inspector → on commit sends RenameDatumCommand
- On rename result: mechanism store updates, tree re-renders with new name

### 10. Update architecture documentation

Update `docs/architecture/` with a datum authoring subsystem description covering:
- Datum entity lifecycle: create → render → inspect → rename → delete
- Datum as authored entity mounted to body datums
- Viewport rendering approach (triad, view-distance scaling, parenting)
- Selection model (unified across bodies and datums)

## Architecture Constraints
- Datum visuals are viewport artifacts derived from model data — the viewport renders what the mechanism store contains
- Datums render through SceneGraphManager, NOT React — React renders the tree and inspector, Babylon renders the triads
- Selection works identically for bodies and datums — the selection store is entity-type agnostic
- Tree state is derived from the mechanism store — no duplicated state
- All mutations go through the engine via commands — no local-only changes

## Done Looks Like
- Datums render as RGB coordinate frame triads in the viewport at correct positions/orientations
- Triads scale based on camera distance to remain visible at any zoom
- Datums appear in the tree as children of their parent body
- Clicking a datum triad selects it (with highlight)
- Clicking a datum in the tree selects it (with viewport highlight)
- Inspector shows DatumInspector for selected datum with name, parent body, local transform
- Can rename a datum from tree (double-click) or inspector
- Can delete a datum via Delete key or context menu
- Full create → inspect → rename → delete flow works end-to-end
- Architecture docs updated with datum authoring subsystem
- `pnpm --filter @motionlab/frontend typecheck` passes
- `pnpm --filter @motionlab/viewport typecheck` passes

## What NOT to Build
- Joint authoring (Epic 6)
- Save/load (Epic 6)
- Simulation or physics
- Datum editing (reposition, reorient by dragging) — future
- Datum constraints or snapping — future
- Multi-datum operations (bulk delete, etc.) — future
```

---

## Integration Verification

After all three prompts complete, verify the full datum authoring flow:

1. **Import a body:** Use existing ImportAsset flow to bring a CAD body into the scene
2. **Switch to Create Datum mode:** Click "Create Datum" toggle in the toolbar
3. **Click body surface:** A datum triad appears at the click point with Z-axis along the surface normal
4. **Verify tree:** Datum appears as child of the clicked body in the project tree
5. **Select datum:** Click the triad in viewport — it highlights, inspector shows DatumInspector
6. **Rename:** Double-click name in tree or edit in inspector — datum name updates everywhere
7. **Create more datums:** Click other surfaces — multiple datums can coexist on one body
8. **Delete datum:** Select datum, press Delete — triad disappears, tree updates, inspector clears
9. **Verify engine state:** Datums survive across the session (engine holds authoritative state)
10. **Typecheck:** `pnpm --filter @motionlab/protocol typecheck && pnpm --filter @motionlab/frontend typecheck && pnpm --filter @motionlab/viewport typecheck` all pass
