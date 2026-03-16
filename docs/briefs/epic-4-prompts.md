# Epic 4 — Parallel Agent Prompts

> **Status:** Not Started
>
> **Dependency:** Prompt 4.1 must complete before Prompt 4.2. Prompt 4.3 can overlap with Prompt 4.2 once selection store shape is agreed.
>
> **Prerequisite:** Epic 3 must be complete (CAD import pipeline, body store, and basic layout).

Three prompts. Prompt 4.1 must complete first. Prompt 4.2 depends on the SceneGraphManager from 4.1. Prompt 4.3 can overlap with 4.2 once the selection store interface is agreed.

## Shared Contract

| Interface | Owner | Consumer |
|-----------|-------|----------|
| `SceneGraphManager` class with addBody/removeBody/updateTransform | Prompt 1 (viewport creates) | Prompt 2 (picking queries), Prompt 3 (integration wires) |
| Selection store (selectedIds, hoveredId) | Prompt 2 (creates) | Prompt 1 (applies highlight materials), Prompt 3 (wires to tree+inspector) |
| Camera presets API | Prompt 1 (implements) | Prompt 3 (wires to viewport toolbar) |
| Mechanism store → scene graph subscription | Prompt 3 (wires) | Prompt 1 (scene graph receives body data) |

After all three are built, the integration test is: `pnpm dev:desktop` — import STEP → see bodies rendered → click to select → selection shown in tree and inspector. **This completes Validation Scenario A** (single-body import and inspection).

---

## Prompt 1: Scene Graph Manager + Body Rendering

```
# Epic 4 — Scene Graph Manager and Body Rendering

You are building the Babylon.js scene graph manager that creates renderable meshes from imported body data. This is the foundation for all viewport interactions — picking, selection, and highlighting depend on this.

## Read These First (in order)
- `docs/architecture/principles.md` — React is NOT the hot path for viewport; engine authoritative for geometry
- `docs/architecture/runtime-topology.md` — display mesh is a transport artifact, not the B-Rep
- `packages/viewport/AGENTS.md` — viewport owns 3D rendering, scene graph, and imperative Babylon.js code
- `packages/frontend/AGENTS.md` — frontend owns workbench UX; viewport updates bypass React

## What Exists Now

### `packages/viewport/src/Viewport.tsx`
Babylon.js canvas setup with:
- `ArcRotateCamera` targeting origin, positioned for isometric-ish view
- `HemisphericLight` for basic illumination
- Render loop running via `engine.runRenderLoop`
- Canvas resize handling
- No scene graph, no mesh creation from data, no entity tracking, no grid

### `packages/viewport/src/index.ts`
Exports only the `Viewport` React component. No scene graph exports.

### `packages/frontend/src/stores/mechanism.ts` (from Epic 3)
Zustand store with `bodies: Map<string, BodyState>` where BodyState contains:
- `id: string` — UUIDv7
- `name: string`
- `meshData: { vertices: Float32Array, indices: Uint32Array, normals: Float32Array }`
- `massProperties: { mass, centerOfMass, inertia }`
- `pose: { position: [x,y,z], rotation: [x,y,z,w] }`

### DisplayMesh proto (from Epic 3)
Flat arrays for efficient GPU upload: `repeated float vertices`, `repeated uint32 indices`, `repeated float normals`. Frontend already converts these to typed arrays in the mechanism store.

### `packages/ui/src/`
UI primitives exist (TreeView, PropertyRow, InspectorPanel). No viewport-specific UI components.

## What to Build

### 1. Create `packages/viewport/src/scene-graph.ts` — SceneGraphManager class
This is an imperative TypeScript class (NOT React hooks). It manages the mapping between mechanism entities and Babylon.js scene objects.

```typescript
import {
  Scene, TransformNode, AbstractMesh, Mesh,
  VertexData, StandardMaterial, PBRMaterial, Color3,
  ArcRotateCamera, Vector3, Quaternion,
} from '@babylonjs/core';

export interface SceneEntity {
  id: string;
  type: 'body' | 'datum' | 'joint';
  rootNode: TransformNode;
  meshes: AbstractMesh[];
}

export interface MeshDataInput {
  vertices: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
}

export interface PoseInput {
  position: [number, number, number];
  rotation: [number, number, number, number]; // quaternion [x, y, z, w]
}

export class SceneGraphManager {
  private scene: Scene;
  private camera: ArcRotateCamera;
  private entities: Map<string, SceneEntity> = new Map();
  private defaultMaterial: PBRMaterial;

  constructor(scene: Scene, camera: ArcRotateCamera) {
    this.scene = scene;
    this.camera = camera;
    this.defaultMaterial = this.createDefaultMaterial();
  }

  // ... methods below
}
```

### 2. Implement `addBody(id, name, meshData, pose)`
Create a TransformNode as the body root. Create a Mesh from VertexData:
```typescript
addBody(id: string, name: string, meshData: MeshDataInput, pose: PoseInput): SceneEntity {
  const root = new TransformNode(`body_${id}`, this.scene);

  const mesh = new Mesh(`body_mesh_${id}`, this.scene);
  const vertexData = new VertexData();
  vertexData.positions = meshData.vertices;
  vertexData.indices = meshData.indices;
  vertexData.normals = meshData.normals;
  vertexData.applyToMesh(mesh);

  mesh.material = this.defaultMaterial;
  mesh.parent = root;

  // Apply pose
  root.position = new Vector3(...pose.position);
  root.rotationQuaternion = new Quaternion(...pose.rotation);

  const entity: SceneEntity = { id, type: 'body', rootNode: root, meshes: [mesh] };
  this.entities.set(id, entity);
  return entity;
}
```

### 3. Implement `removeBody(id)`
Dispose all meshes, dispose the root TransformNode, remove from the entities map.

### 4. Implement `updateBodyTransform(id, pose)`
Update the TransformNode position and rotationQuaternion from the pose data. No-op if entity not found (log warning).

### 5. Implement `getEntity(id)` and `getAllEntities()`
Simple map lookups. Return `SceneEntity | undefined` and `SceneEntity[]` respectively.

### 6. Create default PBR material
Engineering-appropriate appearance:
```typescript
private createDefaultMaterial(): PBRMaterial {
  const mat = new PBRMaterial('default_body', this.scene);
  mat.albedoColor = new Color3(0.7, 0.72, 0.75);  // neutral gray
  mat.metallic = 0.3;
  mat.roughness = 0.6;
  mat.backFaceCulling = true;
  return mat;
}
```
This gives a clean engineering visualization look — not game-like, not too shiny.

### 7. Camera presets
Implement camera preset positioning:
```typescript
setCameraPreset(preset: 'isometric' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'fit-all'): void {
  switch (preset) {
    case 'isometric':
      this.camera.alpha = Math.PI / 4;
      this.camera.beta = Math.PI / 3;
      break;
    case 'front':
      this.camera.alpha = -Math.PI / 2;
      this.camera.beta = Math.PI / 2;
      break;
    case 'back':
      this.camera.alpha = Math.PI / 2;
      this.camera.beta = Math.PI / 2;
      break;
    case 'left':
      this.camera.alpha = Math.PI;
      this.camera.beta = Math.PI / 2;
      break;
    case 'right':
      this.camera.alpha = 0;
      this.camera.beta = Math.PI / 2;
      break;
    case 'top':
      this.camera.alpha = -Math.PI / 2;
      this.camera.beta = 0.01; // avoid gimbal lock at exactly 0
      break;
    case 'bottom':
      this.camera.alpha = -Math.PI / 2;
      this.camera.beta = Math.PI - 0.01;
      break;
    case 'fit-all':
      this.fitAll();
      break;
  }
}
```

### 8. Implement `fitAll()`
Compute the bounding box of all meshes in the scene, then frame the camera to fit:
```typescript
fitAll(): void {
  if (this.entities.size === 0) return;
  const allMeshes = Array.from(this.entities.values()).flatMap(e => e.meshes);
  // Compute combined bounding box
  // Use scene.createDefaultCameraOrLight() approach or manual:
  let min = new Vector3(Infinity, Infinity, Infinity);
  let max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const mesh of allMeshes) {
    mesh.computeWorldMatrix(true);
    const bounds = mesh.getBoundingInfo().boundingBox;
    min = Vector3.Minimize(min, bounds.minimumWorld);
    max = Vector3.Maximize(max, bounds.maximumWorld);
  }
  const center = Vector3.Center(min, max);
  const radius = Vector3.Distance(min, max) / 2;
  this.camera.target = center;
  this.camera.radius = radius * 2.5;
}
```

### 9. Expose SceneGraphManager from Viewport
The Viewport React component needs to make the SceneGraphManager available to the rest of the app. Use a ref callback pattern:
```typescript
interface ViewportProps {
  onSceneReady?: (sceneGraph: SceneGraphManager) => void;
}
```
When the Babylon scene is initialized, create the SceneGraphManager and call `onSceneReady`. The parent component (App.tsx) stores the reference and passes it down or makes it available via context.

### 10. Grid rendering
Add an XZ ground plane with subtle grid lines:
```typescript
private createGrid(): void {
  const grid = MeshBuilder.CreateGround('grid', { width: 100, height: 100 }, this.scene);
  // Apply GridMaterial or a custom shader with grid lines
  // Color axis indicators: X = red line, Z = blue line
  // Keep subtle — low opacity, doesn't distract from models

  // X axis line (red)
  const xAxis = MeshBuilder.CreateLines('xAxis', {
    points: [new Vector3(-50, 0, 0), new Vector3(50, 0, 0)],
  }, this.scene);
  xAxis.color = new Color3(0.8, 0.2, 0.2);

  // Z axis line (blue)
  const zAxis = MeshBuilder.CreateLines('zAxis', {
    points: [new Vector3(0, 0, -50), new Vector3(0, 0, 50)],
  }, this.scene);
  zAxis.color = new Color3(0.2, 0.2, 0.8);
}
```

### 11. Update `packages/viewport/src/index.ts`
Export the SceneGraphManager and its types:
```typescript
export { Viewport } from './Viewport';
export { SceneGraphManager } from './scene-graph';
export type { SceneEntity, MeshDataInput, PoseInput } from './scene-graph';
```

## Architecture Constraints
- SceneGraphManager is imperative TypeScript, NOT React hooks — Babylon.js updates bypass React
- Entity IDs map 1:1 to mechanism ElementIds (UUIDv7 strings)
- Materials are engineering-appropriate: metallic-roughness PBR, neutral colors, professional look
- No protocol awareness in the viewport package — it receives plain TypeScript objects (MeshDataInput, PoseInput), not protobuf types
- The viewport package must NOT depend on `@motionlab/protocol` or `@motionlab/frontend`
- Scene graph is the single source of truth for what is rendered — no direct mesh manipulation from outside

## Done Looks Like
- SceneGraphManager can be constructed with a Babylon.js Scene and Camera
- `addBody()` creates visible meshes from vertex/index/normal data with correct positioning
- `removeBody()` cleanly disposes all Babylon.js resources
- `updateBodyTransform()` moves bodies in the scene
- Camera presets reposition the camera correctly (isometric, front, back, left, right, top, bottom)
- `fitAll()` frames all bodies in the viewport
- Grid is visible on the XZ plane with colored axis indicators
- Default PBR material looks clean and professional
- `pnpm --filter @motionlab/viewport typecheck` passes
- No regressions: existing Viewport still renders, camera controls still work

## What NOT to Build
- Picking or selection system (that's Prompt 2)
- Integration with mechanism store (that's Prompt 3)
- React wiring or Zustand stores (that's Prompt 3)
- Viewport toolbar or context menus (that's Prompt 3)
- Axis gizmo / orientation indicator (that's Prompt 3)
- Multiple material types or color-per-body
- LOD (level of detail) system
- Shadow rendering
```

---

## Prompt 2: Picking + Selection System

```
# Epic 4 — Picking and Selection System

You are building the viewport picking system and the selection state store. Clicking a body in the viewport should select it, with visual feedback. This depends on the SceneGraphManager from Prompt 4.1.

## Read These First (in order)
- `docs/architecture/principles.md` — React is NOT the hot path
- `packages/viewport/AGENTS.md` — viewport owns 3D rendering; picking is imperative
- `packages/frontend/AGENTS.md` — Zustand for state; selection store bridges imperative and React

## What Exists Now

### `packages/viewport/src/scene-graph.ts` (from Prompt 4.1)
SceneGraphManager class with:
- `addBody(id, name, meshData, pose)` — creates TransformNode + Mesh, stores as SceneEntity
- `getEntity(id)` — returns SceneEntity with `{ id, type, rootNode, meshes }`
- `getAllEntities()` — returns all SceneEntity[]
- Entity meshes are standard Babylon.js Mesh objects with `material` property
- Default PBR material applied to all bodies

### `packages/frontend/src/stores/mechanism.ts` (from Epic 3)
Zustand store with `bodies: Map<string, BodyState>`. Established pattern for stores.

### `packages/frontend/src/stores/engine-connection.ts`
Zustand store pattern established: `create<StateType>((set, get) => ({ ... }))`.

### No selection state anywhere in the codebase
There is no selection store, no selected IDs, no hover state. The BodyTree from Epic 3 has a simple local `selectedBodyId` state that will be replaced by this shared store.

## What to Build

### 1. Create `packages/viewport/src/picking.ts` — PickingManager class
An imperative class that handles pointer events on the Babylon.js scene:

```typescript
import { Scene, AbstractMesh, PointerEventTypes } from '@babylonjs/core';
import { SceneGraphManager } from './scene-graph';

export interface PickResult {
  entityId: string | null;
  mesh: AbstractMesh | null;
}

export type PickCallback = (entityId: string | null, modifiers: { ctrl: boolean; shift: boolean }) => void;
export type HoverCallback = (entityId: string | null) => void;

export class PickingManager {
  private scene: Scene;
  private sceneGraph: SceneGraphManager;
  private onPick: PickCallback;
  private onHover: HoverCallback;

  constructor(
    scene: Scene,
    sceneGraph: SceneGraphManager,
    onPick: PickCallback,
    onHover: HoverCallback,
  ) {
    this.scene = scene;
    this.sceneGraph = sceneGraph;
    this.onPick = onPick;
    this.onHover = onHover;
    this.setupPointerEvents();
  }

  // ...
}
```

### 2. Implement pick on pointer down
On pointer down (left button), perform a scene pick:
```typescript
private setupPointerEvents(): void {
  this.scene.onPointerObservable.add((pointerInfo) => {
    switch (pointerInfo.type) {
      case PointerEventTypes.POINTERPICK: {
        const pick = this.scene.pick(
          this.scene.pointerX,
          this.scene.pointerY,
        );
        const entityId = this.resolveEntityId(pick?.pickedMesh ?? null);
        const evt = pointerInfo.event as PointerEvent;
        this.onPick(entityId, { ctrl: evt.ctrlKey, shift: evt.shiftKey });
        break;
      }
      case PointerEventTypes.POINTERMOVE: {
        const pick = this.scene.pick(
          this.scene.pointerX,
          this.scene.pointerY,
        );
        const entityId = this.resolveEntityId(pick?.pickedMesh ?? null);
        this.onHover(entityId);
        break;
      }
    }
  });
}
```

### 3. Implement entity ID resolution from picked mesh
Walk up the mesh parent hierarchy to find the owning SceneEntity:
```typescript
private resolveEntityId(mesh: AbstractMesh | null): string | null {
  if (!mesh) return null;
  // Walk up parent chain to find a node that matches a SceneEntity rootNode
  let node: any = mesh;
  while (node) {
    for (const entity of this.sceneGraph.getAllEntities()) {
      if (entity.rootNode === node || entity.meshes.includes(node as AbstractMesh)) {
        return entity.id;
      }
    }
    node = node.parent;
  }
  return null;
}
```

### 4. Create `packages/frontend/src/stores/selection.ts` — Zustand store
```typescript
import { create } from 'zustand';

interface SelectionState {
  selectedIds: Set<string>;
  hoveredId: string | null;

  select: (id: string) => void;
  deselect: (id: string) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  setSelection: (ids: string[]) => void;
  setHovered: (id: string | null) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedIds: new Set(),
  hoveredId: null,

  select: (id) =>
    set({ selectedIds: new Set([id]) }),

  deselect: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      next.delete(id);
      return { selectedIds: next };
    }),

  toggleSelect: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    }),

  clearSelection: () =>
    set({ selectedIds: new Set() }),

  setSelection: (ids) =>
    set({ selectedIds: new Set(ids) }),

  setHovered: (id) =>
    set({ hoveredId: id }),
}));
```

### 5. Wire picking callbacks to selection store
The PickingManager callbacks should update the selection store:
```typescript
// In the component or module that initializes the PickingManager:
const pickCallback: PickCallback = (entityId, modifiers) => {
  const store = useSelectionStore.getState();
  if (entityId === null) {
    store.clearSelection();
  } else if (modifiers.ctrl) {
    store.toggleSelect(entityId);
  } else {
    store.select(entityId);
  }
};

const hoverCallback: HoverCallback = (entityId) => {
  useSelectionStore.getState().setHovered(entityId);
};
```

### 6. Selection visual feedback — HighlightLayer
Apply visual highlights to selected meshes using Babylon.js HighlightLayer:
```typescript
import { HighlightLayer, Color3 } from '@babylonjs/core';

// In SceneGraphManager or a new SelectionVisualizer class:
private highlightLayer: HighlightLayer;
private hoverHighlightLayer: HighlightLayer;

// Selection highlight: clear blue-green edge glow
this.highlightLayer = new HighlightLayer('selection', this.scene);
this.highlightLayer.outerGlow = true;
this.highlightLayer.innerGlow = false;

// Apply selection:
applySelection(selectedIds: Set<string>): void {
  this.highlightLayer.removeAllMeshes();
  for (const id of selectedIds) {
    const entity = this.getEntity(id);
    if (entity) {
      for (const mesh of entity.meshes) {
        this.highlightLayer.addMesh(mesh as Mesh, new Color3(0.2, 0.6, 1.0));
      }
    }
  }
}
```

### 7. Hover visual feedback
Subtle highlight on hover (different color from selection):
```typescript
applyHover(hoveredId: string | null): void {
  this.hoverHighlightLayer.removeAllMeshes();
  if (hoveredId && !this.isSelected(hoveredId)) {
    const entity = this.getEntity(hoveredId);
    if (entity) {
      for (const mesh of entity.meshes) {
        this.hoverHighlightLayer.addMesh(mesh as Mesh, new Color3(0.8, 0.8, 0.3));
      }
    }
  }
}
```
Hover highlight should not appear on already-selected meshes (or use a dimmer version).

### 8. Multi-select support
Ctrl+click toggles individual selection. Regular click replaces selection. Click on empty space clears selection. All handled via the pick callback and selection store.

### 9. Initialize PickingManager
The PickingManager must be created after the scene and SceneGraphManager are ready. Add initialization to the Viewport component's scene setup or expose it via the `onSceneReady` callback pattern from Prompt 4.1.

### 10. Export from viewport package
Update `packages/viewport/src/index.ts`:
```typescript
export { PickingManager } from './picking';
export type { PickResult, PickCallback, HoverCallback } from './picking';
```

## Architecture Constraints
- Picking must be ID-deterministic: same click position = same entity ID result
- Pick identity must be stable across material and highlight changes — picking resolves by scene graph node hierarchy, not by material
- Picking is imperative (Babylon.js pointer observables), NOT React hooks
- Selection store is the bridge to React — components subscribe to the store for rendering
- HighlightLayer is the recommended approach for engineering-look selection (clean glow, no z-fighting)
- The viewport package provides PickingManager but does NOT own the selection store — the store lives in `@motionlab/frontend`
- PickingManager takes callbacks, not direct store references — this keeps viewport package independent of frontend

## Done Looks Like
- Clicking a body in the viewport selects it (blue highlight visible via HighlightLayer)
- Ctrl+click adds/removes from selection (multi-select)
- Clicking empty space clears selection
- Hovering over a body shows subtle yellow highlight
- Hover highlight does not appear on already-selected bodies
- Selection store (`useSelectionStore`) correctly tracks selectedIds and hoveredId
- `pnpm --filter @motionlab/viewport typecheck` passes
- `pnpm --filter @motionlab/frontend typecheck` passes
- No regressions: scene graph still works, camera controls still work, bodies still render

## What NOT to Build
- Tree integration (that's Prompt 3)
- Inspector integration (that's Prompt 3)
- Viewport toolbar or context menus (that's Prompt 3)
- Axis gizmo (that's Prompt 3)
- Box selection or lasso selection
- Transform gizmos (move/rotate/scale)
- Right-click context menus
- Keyboard shortcuts for selection
```

---

## Prompt 3: Viewport-Frontend Integration + Engineering Polish

```
# Epic 4 — Viewport-Frontend Integration and Engineering Polish

You are wiring everything together: mechanism store to scene graph, selection store to tree and inspector, camera presets to toolbar, and adding engineering viewport polish. This completes Validation Scenario A.

## Read These First (in order)
- `docs/architecture/principles.md` — React is NOT the hot path for viewport updates
- `packages/frontend/AGENTS.md` — frontend owns workbench UX; Zustand bridges imperative and React
- `packages/viewport/AGENTS.md` — viewport updates are imperative; React only for chrome
- `packages/ui/AGENTS.md` — UI component guidelines

## What Exists Now

### `packages/viewport/src/scene-graph.ts` (from Prompt 4.1)
SceneGraphManager with:
- `addBody(id, name, meshData, pose)` — creates TransformNode + Mesh
- `removeBody(id)` — disposes resources
- `updateBodyTransform(id, pose)` — updates position/rotation
- `getEntity(id)`, `getAllEntities()` — lookups
- `setCameraPreset(preset)` — repositions camera
- `fitAll()` — frames all bodies
- `applySelection(selectedIds)` — HighlightLayer selection visuals
- `applyHover(hoveredId)` — HighlightLayer hover visuals
- Grid with colored axis indicators

### `packages/viewport/src/picking.ts` (from Prompt 4.2)
PickingManager with pick and hover callbacks wired to the scene.

### `packages/frontend/src/stores/selection.ts` (from Prompt 4.2)
Zustand store:
- `selectedIds: Set<string>` — currently selected entity IDs
- `hoveredId: string | null` — currently hovered entity ID
- `select(id)`, `deselect(id)`, `toggleSelect(id)`, `clearSelection()`, `setSelection(ids)`, `setHovered(id)`

### `packages/frontend/src/App.tsx` (from Epic 3)
Three-panel layout: left sidebar (BodyTree), center (Viewport), right sidebar (BodyInspector). Import button in header. Engine status indicator.

### `packages/frontend/src/components/BodyTree.tsx` (from Epic 3)
Displays bodies from mechanism store using TreeView. Has a local `selectedBodyId` state (to be replaced by the shared selection store).

### `packages/frontend/src/components/BodyInspector.tsx` (from Epic 3)
Shows selected body's properties using InspectorPanel. Takes `selectedBodyId` prop (to be wired to the selection store).

### `packages/frontend/src/stores/mechanism.ts` (from Epic 3)
Zustand store with `bodies: Map<string, BodyState>` and `addBodies()`, `removeBody()`, `clear()`.

### `packages/viewport/src/Viewport.tsx`
Exposes SceneGraphManager via `onSceneReady` callback. Initializes PickingManager with pick/hover callbacks.

## What to Build

### 1. Wire mechanism store → scene graph
When bodies are added to the mechanism store (after import), they must appear in the viewport. Subscribe to the mechanism store imperatively:

```typescript
// In App.tsx or a dedicated wiring module:
import { useMechanismStore } from './stores/mechanism';
import { SceneGraphManager } from '@motionlab/viewport';

function wireStoreToSceneGraph(sceneGraph: SceneGraphManager): () => void {
  // Track which bodies are already in the scene graph
  const trackedIds = new Set<string>();

  const unsubscribe = useMechanismStore.subscribe((state) => {
    // Add new bodies
    for (const [id, body] of state.bodies) {
      if (!trackedIds.has(id)) {
        sceneGraph.addBody(id, body.name, body.meshData, body.pose);
        trackedIds.add(id);
      }
    }

    // Remove deleted bodies
    for (const id of trackedIds) {
      if (!state.bodies.has(id)) {
        sceneGraph.removeBody(id);
        trackedIds.delete(id);
      }
    }
  });

  return unsubscribe;
}
```

Call this after `onSceneReady` fires and the SceneGraphManager is available. Auto-fit camera after first import.

### 2. Wire selection store → body tree
Replace the local `selectedBodyId` state in BodyTree with the shared selection store:

```typescript
import { useSelectionStore } from '../stores/selection';

export function BodyTree() {
  const bodies = useMechanismStore((s) => s.bodies);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const select = useSelectionStore((s) => s.select);

  const handleSelect = (id: string) => {
    select(id);
  };

  return (
    <div className="body-tree-panel">
      <h3>Bodies</h3>
      <TreeView
        items={items}
        onSelect={handleSelect}
        selectedIds={selectedIds}
      />
    </div>
  );
}
```

### 3. Wire selection store → inspector
The inspector shows properties of the first selected body:
```typescript
export function BodyInspector() {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const bodies = useMechanismStore((s) => s.bodies);

  const firstSelectedId = selectedIds.size > 0
    ? Array.from(selectedIds)[0]
    : null;
  const body = firstSelectedId ? bodies.get(firstSelectedId) : undefined;

  if (!body) {
    return <InspectorPanel><p>No body selected</p></InspectorPanel>;
  }

  // ... render body properties
}
```

### 4. Wire selection store ↔ viewport (bidirectional)
Selection must be bidirectional:
- **Viewport → store:** Already wired via PickingManager callbacks (Prompt 4.2)
- **Store → viewport:** Subscribe to selection store changes and apply visual highlights:

```typescript
function wireSelectionToSceneGraph(sceneGraph: SceneGraphManager): () => void {
  return useSelectionStore.subscribe((state) => {
    sceneGraph.applySelection(state.selectedIds);
    sceneGraph.applyHover(state.hoveredId);
  });
}
```

- **Tree → viewport:** Clicking in tree calls `select(id)` → store updates → viewport highlight updates (via subscription above)
- **Viewport → tree:** Clicking in viewport calls `select(id)` → store updates → tree re-renders with new selectedIds

Guard against infinite update loops: the subscription only calls imperative scene graph methods (no store mutations), so no cycle is possible.

### 5. Viewport toolbar
Add camera preset buttons above or beside the viewport:
```tsx
export function ViewportToolbar({ sceneGraph }: { sceneGraph: SceneGraphManager | null }) {
  const presets = [
    { label: 'Iso', preset: 'isometric' as const },
    { label: 'Fit', preset: 'fit-all' as const },
    { label: 'Front', preset: 'front' as const },
    { label: 'Back', preset: 'back' as const },
    { label: 'Left', preset: 'left' as const },
    { label: 'Right', preset: 'right' as const },
    { label: 'Top', preset: 'top' as const },
    { label: 'Bottom', preset: 'bottom' as const },
  ];

  return (
    <div className="viewport-toolbar">
      {presets.map((p) => (
        <button
          key={p.preset}
          onClick={() => sceneGraph?.setCameraPreset(p.preset)}
          title={p.label}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
```

Position the toolbar as an overlay in the top-right of the viewport area or as a horizontal bar above it.

### 6. Viewport context menu (right-click)
Implement a simple right-click context menu in the viewport area:
```typescript
const contextMenuItems = [
  { label: 'Fit All', action: () => sceneGraph.fitAll() },
  { separator: true },
  { label: 'Isometric', action: () => sceneGraph.setCameraPreset('isometric') },
  { label: 'Front', action: () => sceneGraph.setCameraPreset('front') },
  { label: 'Top', action: () => sceneGraph.setCameraPreset('top') },
  { separator: true },
  { label: 'Toggle Grid', action: () => sceneGraph.toggleGrid() },
];
```

Prevent the default browser context menu. Position the menu at the pointer location. Dismiss on click outside or Escape.

### 7. Axis gizmo — orientation indicator
Add a small orientation indicator in a viewport corner:
- Use Babylon.js `AxesViewer` or create a custom mini-viewport
- Shows X (red), Y (green), Z (blue) axes
- Rotates to match the main camera orientation
- Positioned in the bottom-left or top-right corner
- Does not interfere with picking or camera controls

```typescript
import { AxesViewer } from '@babylonjs/core';

// In SceneGraphManager or Viewport setup:
const axes = new AxesViewer(scene, 1);
// Position in corner via a secondary viewport or overlay
```

### 8. Performance validation
Test with a model containing 50+ bodies:
- Import should complete without hanging
- Scene graph should add all bodies without frame drops
- Camera fit-all should frame all bodies correctly
- Selection and hover should remain responsive
- No memory leaks on import → clear → re-import cycle

### 9. Update App.tsx to wire everything together
The App component is the integration point:
```tsx
export function App() {
  const [sceneGraph, setSceneGraph] = useState<SceneGraphManager | null>(null);

  useEffect(() => {
    if (!sceneGraph) return;
    const unsub1 = wireStoreToSceneGraph(sceneGraph);
    const unsub2 = wireSelectionToSceneGraph(sceneGraph);
    // Auto fit-all on first body addition
    const unsub3 = useMechanismStore.subscribe((state, prevState) => {
      if (state.bodies.size > 0 && prevState.bodies.size === 0) {
        sceneGraph.fitAll();
      }
    });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [sceneGraph]);

  return (
    <div className="app-shell">
      <header>{/* engine status + import button */}</header>
      <div className="workspace">
        <aside className="left-sidebar"><BodyTree /></aside>
        <main className="viewport-container">
          <ViewportToolbar sceneGraph={sceneGraph} />
          <Viewport onSceneReady={setSceneGraph} />
        </main>
        <aside className="right-sidebar"><BodyInspector /></aside>
      </div>
    </div>
  );
}
```

## Architecture Constraints
- Viewport updates are imperative — React re-renders only for UI chrome (tree, inspector, toolbar), NEVER for viewport mesh/material/highlight changes
- Zustand subscriptions are the bridge: store changes trigger imperative scene graph calls, not React re-renders of viewport internals
- Selection bidirectionality must NOT cause infinite update loops — ensure store mutations only happen from user actions (pick, tree click), not from store subscriptions
- `@motionlab/viewport` must NOT depend on `@motionlab/frontend` stores — pass callbacks and call imperative methods, don't import stores into viewport
- All body data flows through the mechanism store — components and scene graph read from there, never directly from protocol messages

## Done Looks Like
- **Full flow works:** Import STEP → bodies appear in viewport + body tree → click to select (in viewport OR tree) → inspector shows mass properties → camera presets reposition view
- **Bidirectional selection:** clicking in viewport highlights in tree; clicking in tree highlights in viewport
- **Camera presets:** all 8 presets work (isometric, fit-all, front, back, left, right, top, bottom)
- **Context menu:** right-click in viewport shows camera presets and grid toggle
- **Axis gizmo:** orientation indicator visible in viewport corner, rotates with camera
- **Performance:** 50+ body model imports and interacts smoothly
- **Validation Scenario A complete:** single-body import and inspection end-to-end
- `pnpm --filter @motionlab/frontend typecheck` passes
- `pnpm --filter @motionlab/viewport typecheck` passes
- No regressions: engine status, import flow, body tree, inspector all still work

## What NOT to Build
- Datum creation or visualization (future epic)
- Joint authoring (future epic)
- Simulation playback or animation (future epic)
- Save/load mechanism files (future epic)
- Transform gizmos (move/rotate/scale handles)
- Undo/redo
- Drag-and-drop in the tree
- Multi-material or per-body color assignment
- Measurement tools
- Section views or exploded views
```

---

## Integration Verification

After all three prompts complete, verify the full stack:

1. **Scene graph build:** `pnpm --filter @motionlab/viewport typecheck` passes
2. **Frontend build:** `pnpm --filter @motionlab/frontend typecheck` passes
3. **Desktop integration:** `pnpm dev:desktop` launches successfully
4. **Import flow:** Click Import → select STEP file → bodies appear in viewport and body tree
5. **Rendering:** Bodies render with PBR material, grid visible, axis indicators correct
6. **Picking:** Click a body in viewport → blue highlight appears → body selected in tree → inspector shows properties
7. **Tree selection:** Click a body in tree → viewport highlights the body → inspector updates
8. **Multi-select:** Ctrl+click adds bodies to selection in viewport
9. **Camera presets:** Toolbar buttons reposition camera correctly; fit-all frames all bodies
10. **Hover:** Moving pointer over bodies shows subtle yellow highlight
11. **Context menu:** Right-click shows camera presets and grid toggle
12. **Performance:** Import a multi-body model (50+ bodies) — smooth interaction
13. **Validation Scenario A:** Complete end-to-end: import → render → select → inspect

This epic completes the first vertical slice of MotionLab. After Epics 1-4, the application can import CAD files, display them in a 3D viewport, and inspect body properties.
