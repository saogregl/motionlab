# Epic 11 — Viewport Selection System & Visual Feedback

> **Status:** Not started
> **Dependencies:** Epic 5 (Datum CRUD) -- complete. Epic 10 (Face-Level Topology Selection) -- ~95%. Epic 3 (OCCT import pipeline) -- complete.
> **Packages affected:** `packages/viewport/`, `packages/frontend/`, `packages/ui/`
>
> **Governance note:** Epics 5+ are under full governance -- every boundary or contract change requires an ADR, every protocol/schema change requires seam tests, every architecture change requires doc updates.

Three prompts. Prompt 1 is a BLOCKER. Prompts 2 and 3 can run in parallel after Prompt 1 lands.

## Motivation

Selection is the most fundamental viewport interaction in any CAD or mechanism authoring tool. Without clear visual feedback, users cannot tell what is selected, what is hovered, or how different entity types relate to each other in the 3D scene. This is MotionLab's #1 user complaint: "We can't see the selected object in the viewport."

The current state: `SelectionVisuals` in `packages/viewport/src/rendering/selection.ts` applies a HighlightLayer glow and edge thickening to selected meshes, using a single accent color (#0f62fe) for everything. There is no entity-type color differentiation, no multi-select visual clarity, and no bidirectional sync between the ProjectTree and the viewport camera. Hover feedback exists but uses the same blue color regardless of entity type, providing no information about what kind of entity the user is about to select.

Engineers working in mechanism authoring tools expect:
- **Color-coded entity types** so they can instantly distinguish bodies, datums, joints, and loads in a complex assembly
- **Multi-select with modifier keys** (Ctrl+click toggle, Shift+click range) for batch operations like deleting multiple datums or hiding multiple bodies
- **Bidirectional selection sync** -- clicking in the tree focuses the viewport, clicking in the viewport highlights in the tree
- **Hover preview** so the user knows what they will select before clicking
- **Fit to selection** (F key) to quickly navigate a crowded scene

## Prior Art

### Blender
Blender uses a configurable active-object color (default orange outline) with a distinct color for other selected objects (darker orange). Hover shows a lighter outline. The outliner (tree) and viewport are fully synced -- selecting in either propagates to the other. Ctrl+click toggles, Shift+click extends. The numpad `.` key frames the selection.

### Onshape
Onshape uses blue highlight for selected entities with a subtle blue tint on the surface. Hover shows a lighter blue pre-highlight. The feature tree and viewport are bidirectionally synced. Entity types (faces, edges, vertices, mates) each get distinct highlight styling during mate creation workflows.

### Fusion 360
Fusion 360 uses blue outlines for selection with a gradient intensity. Different entity types (bodies, sketches, joints, contacts) show different icon badges and colors in the browser tree. Selection filtering buttons let users restrict picking to specific entity types. Double-click isolates a component.

### Key Patterns
All three tools share: (1) distinct visual treatment for hover vs. selection, (2) color or badge differentiation by entity type, (3) bidirectional tree/viewport sync, (4) fit-to-selection hotkey.

## Shared Contract

| Interface | Owner | Consumer |
|-----------|-------|----------|
| `EntityColorScheme` (type-to-color map) | Prompt 1 (viewport) | Prompt 1 (selection visuals), Prompt 3 (tree badges) |
| `SelectionVisuals` extended API (entity-type-aware) | Prompt 1 (implements) | Prompt 2 (selection logic calls), Prompt 3 (sync layer calls) |
| Selection store multi-select actions | Prompt 2 (implements) | Prompt 2 (key handlers), Prompt 3 (tree calls) |
| `useViewportBridge` selection sync | Existing (updated by Prompt 2) | Prompt 3 (bidirectional sync) |
| `SceneGraphManager.focusOnEntity()` | Existing (enhanced by Prompt 3) | Prompt 3 (fit-to-selection uses) |
| `SceneEntity.type` field | Existing | Prompt 1 (color lookup) |

Integration test: Import a STEP file with multiple bodies. Select a body in the tree -- viewport shows steel-blue outline and camera focuses. Ctrl+click a joint in viewport -- both body and joint show outlines (different colors). Press F -- camera frames both selected entities. Click empty space -- all outlines cleared, tree deselects.

---

## Prompt 1: Selection Rendering Pipeline

**BLOCKER for all of Epic 11. Must complete first.**

```
# Epic 11 -- Entity-Type-Aware Selection Rendering Pipeline

You are upgrading the viewport selection rendering system to support entity-type-aware color coding, improved highlight quality, and proper multi-selection rendering. The current system uses a single accent color for all entity types. After this prompt, each entity type (body, datum, joint, load, actuator) will have a distinct selection/hover color, and the rendering pipeline will handle multiple simultaneous selections cleanly.

## Read These First (in order)
- `docs/architecture/principles.md` -- React is NOT the hot path for viewport
- `packages/viewport/AGENTS.md` -- viewport owns visualization and picking
- `docs/decisions/` -- all existing ADRs

## Governance Reminder
This is Epic 11 -- full governance applies:
- Any boundary or contract change requires an ADR
- Any protocol/schema change requires seam tests at the affected seam
- Any architecture change requires doc updates

## What Exists Now

### `packages/viewport/src/rendering/selection.ts`
`createSelectionVisuals()` returns a `SelectionVisuals` object with `applySelection(meshes)`, `applyHover(mesh)`, `clearAll()`, and `dispose()`. Uses Babylon.js `HighlightLayer` for glow outlines plus edge width/color overrides plus material tinting via `MaterialFactory.applySelectionTint()`. All selection and hover use a single accent color: `#0f62fe` (blue). The `HighlightLayer` is configured with `blurHorizontalSize: 0.4`, `blurVerticalSize: 0.4`, `mainTextureRatio: 0.5`, and `innerGlow: false`.

Key constants:
```ts
const ACCENT_EDGE_COLOR = new Color4(0.06, 0.38, 0.996, 1.0);
const HOVER_EDGE_COLOR = new Color4(0.06, 0.38, 0.996, 0.6);
const SELECTION_EDGE_WIDTH = 8.0;
const HOVER_EDGE_WIDTH = 5.0;
const DEFAULT_EDGE_WIDTH = 2.0;
const DEFAULT_EDGE_COLOR = new Color4(0.15, 0.15, 0.2, 0.3);
```

### `packages/viewport/src/rendering/materials.ts`
`MaterialFactory` has `applySelectionTint(mesh)` / `removeSelectionTint(mesh)`. The tint lerps the mesh's albedo color toward `ACCENT_COLOR` (#0f62fe) by `SELECTION_TINT_FACTOR` (0.15). It clones the PBR material per mesh to avoid cross-contamination.

### `packages/viewport/src/scene-graph.ts`
`SceneGraphManager` has `applySelection(selectedIds: Set<string>)` and `applyHover(hoveredId: string | null)`. `applySelection` collects meshes from entity IDs and passes them to `SelectionVisuals.applySelection()`. `applyHover` passes a single mesh. The `SceneEntity` type has a `type` field: `'body' | 'datum' | 'joint'`.

Entity metadata is set on meshes:
```ts
mesh.metadata = { entityId: id, entityType: 'body' | 'datum' | 'joint' };
```

### `packages/viewport/src/rendering/joint-visuals.ts`
Joint visual meshes use `StandardMaterial` with `emissiveColor` and `disableLighting = true`. They have their own color scheme per joint type (revolute=orange, prismatic=cyan, fixed=gray, spherical=purple, planar=green). These meshes are in `renderingGroupId = 1` (overlay).

### `packages/viewport/src/rendering/datum-triad.ts`
Datum meshes are axis-colored triads (red=X, green=Y, blue=Z) using emissive StandardMaterial. They render on top via renderingGroupId 1.

## What to Build

### 1. Entity color scheme constants

Entity-type selection colors are already defined in the central palette at `packages/viewport/src/rendering/colors.ts` and re-exported from `packages/viewport/src/rendering/index.ts`. Import them directly:

```ts
import {
  ENTITY_BODY,      // #4A90D9 steel blue
  ENTITY_DATUM,     // #50C878 emerald green
  ENTITY_JOINT,     // #FF8C00 dark orange
  ENTITY_LOAD,      // #DC143C crimson
  ENTITY_ACTUATOR,  // #9370DB medium purple
  ENTITY_GROUND,    // #808080 gray
} from './colors.js';
```

Build an `ENTITY_COLORS` lookup map from these imports in `selection.ts`:

```ts
export const ENTITY_COLORS: Record<string, Color3> = {
  body:     ENTITY_BODY,
  datum:    ENTITY_DATUM,
  joint:    ENTITY_JOINT,
  load:     ENTITY_LOAD,
  actuator: ENTITY_ACTUATOR,
  ground:   ENTITY_GROUND,
};

export type EntityColorType = keyof typeof ENTITY_COLORS;
```

### 2. Update SelectionVisuals to accept entity type

Change the `SelectionVisuals` interface to accept entity type information so it can apply the correct color per mesh:

```ts
export interface SelectionMeshEntry {
  mesh: AbstractMesh;
  entityType: EntityColorType;
}

export interface SelectionVisuals {
  applySelection: (entries: SelectionMeshEntry[]) => void;
  applyHover: (entry: SelectionMeshEntry | null) => void;
  clearAll: () => void;
  dispose: () => void;
}
```

### 3. Update createSelectionVisuals implementation

Modify the `applySelection` function to use per-entity-type colors:

```ts
function applySelection(entries: SelectionMeshEntry[]): void {
  // Clear previous
  for (const mesh of selectedMeshes) {
    restoreDefaultEdges(mesh);
    materialFactory.removeSelectionTint(mesh);
    highlightLayer.removeMesh(mesh as Mesh);
  }
  selectedMeshes.clear();

  if (hoveredMesh) {
    highlightLayer.removeMesh(hoveredMesh as Mesh);
  }

  for (const { mesh, entityType } of entries) {
    const color = ENTITY_COLORS[entityType];
    const edgeColor = new Color4(color.color3.r, color.color3.g, color.color3.b, 1.0);
    setEdges(mesh, SELECTION_EDGE_WIDTH, edgeColor);
    materialFactory.applySelectionTint(mesh, color.color3);  // updated signature
    highlightLayer.addMesh(mesh as Mesh, color.color3);
    selectedMeshes.add(mesh);
  }
}
```

Similarly update `applyHover` to accept `SelectionMeshEntry | null` and use the entity type's color with reduced opacity for the hover state.

### 4. Update MaterialFactory.applySelectionTint

Change the tint function to accept an optional accent color parameter instead of using the hardcoded `ACCENT_COLOR`:

```ts
applySelectionTint: (mesh: AbstractMesh, accentColor?: Color3) => void;
```

When no accent color is provided, use the existing default. When provided, lerp toward that color. Update both `applySelectionTint` and the tint factor logic in `materials.ts`.

### 5. Update SceneGraphManager.applySelection

Update `applySelection()` and `applyHover()` to pass entity type information to `SelectionVisuals`:

```ts
applySelection(selectedIds: Set<string>): void {
  this.currentSelectedIds = new Set(selectedIds);

  const entries: SelectionMeshEntry[] = [];
  for (const id of selectedIds) {
    const entity = this.entities.get(id);
    if (!entity) continue;
    const entityType = entity.type as EntityColorType;
    for (const mesh of entity.meshes) {
      entries.push({ mesh, entityType });
    }
  }

  this.deps.selectionVisuals.applySelection(entries);
  // ... existing DOF indicator logic ...
}

applyHover(hoveredId: string | null): void {
  if (hoveredId == null || this.currentSelectedIds.has(hoveredId)) {
    this.deps.selectionVisuals.applyHover(null);
    return;
  }

  const entity = this.entities.get(hoveredId);
  if (!entity) return;

  const entityType = entity.type as EntityColorType;
  this.deps.selectionVisuals.applyHover({
    mesh: entity.meshes[0] ?? null,
    entityType,
  } as SelectionMeshEntry);  // null check already done above
}
```

### 6. Handle overlay-rendered entities (joints, datums)

Joint and datum meshes use `StandardMaterial` with `emissiveColor` and `disableLighting = true`. The PBR tint approach does not apply to these. For these entity types:
- Use the HighlightLayer glow (it works with any material type)
- Use edge rendering overlay (edge width + edge color)
- Do NOT attempt PBR material tinting (skip `applySelectionTint` for non-PBR materials)

Add a guard in `applySelectionTint`:
```ts
function applySelectionTint(mesh: AbstractMesh, accentColor?: Color3): void {
  const mat = mesh.material;
  if (!mat || !(mat instanceof PBRMaterial) || !mat.albedoColor) return;
  // ... existing tint logic with accentColor parameter ...
}
```

### 7. Hover color differentiation

Hover colors should be the same hue as the selection color for that entity type, but at reduced intensity. Use a lower alpha on the edge color and enable `innerGlow` on the highlight layer for hover (adds a subtle inner brightening distinct from the full selection glow):

```ts
function applyHover(entry: SelectionMeshEntry | null): void {
  // Clear previous hover
  if (hoveredMesh && !selectedMeshes.has(hoveredMesh)) {
    restoreDefaultEdges(hoveredMesh);
    highlightLayer.removeMesh(hoveredMesh as Mesh);
  }
  hoveredMesh = null;

  if (entry && !selectedMeshes.has(entry.mesh)) {
    const color = ENTITY_COLORS[entry.entityType];
    const hoverEdge = new Color4(color.color3.r, color.color3.g, color.color3.b, 0.6);
    setEdges(entry.mesh, HOVER_EDGE_WIDTH, hoverEdge);
    highlightLayer.addMesh(entry.mesh as Mesh, color.color3, true); // true = glowOnly
    hoveredMesh = entry.mesh;
  }
}
```

### 8. Performance considerations

- The HighlightLayer already renders to an off-screen texture and composites. Adding/removing meshes from it does not trigger full scene re-renders.
- Material cloning for tint is per-selection-event, not per-frame. Clone count is bounded by the number of selected body meshes (typically < 10).
- Edge rendering is a per-mesh flag toggle, not a scene-wide operation.
- Do not allocate new Color3/Color4 objects per frame. Pre-compute Color4 variants from ENTITY_COLORS at module load or cache them.

## Architecture Constraints
- Color constants must live in `packages/viewport/`, not in React land or the frontend package
- Selection rendering is on the imperative/hot path -- no React re-renders for viewport highlights
- Do not add Babylon.js dependencies to the frontend package
- Joint visuals use StandardMaterial (emissive), not PBR -- handle both material types
- The SelectionVisuals API change (from `AbstractMesh[]` to `SelectionMeshEntry[]`) must be backward-compatible during the transition -- update all call sites in the same prompt

## Acceptance Criteria

1. Selecting a body shows a steel-blue (#4A90D9) outline and surface tint
2. Selecting a datum shows an emerald-green (#50C878) outline/glow
3. Selecting a joint shows a dark-orange (#FF8C00) outline/glow
4. Hovering over any entity shows a lighter version of its type's color
5. Multi-selecting a body and a joint simultaneously shows both outlines in their respective colors
6. Clearing selection removes all outlines and tints
7. No visual flash or flicker during selection transitions
8. `pnpm --filter @motionlab/viewport typecheck` passes
9. `pnpm --filter @motionlab/frontend typecheck` passes (call sites updated)
10. `ENTITY_COLORS` is exported from `@motionlab/viewport`

## Done Looks Like
- Entity-type-aware selection colors render correctly for body, datum, and joint entity types
- Hover preview uses the same color family at reduced intensity
- Multi-selection shows all selected items with their respective type colors simultaneously
- No regressions in face highlighting (Epic 10) or gizmo attachment (Epic 5)
- All typecheck commands pass

## What NOT to Build
- Multi-select logic or modifier key handling (that is Prompt 2)
- Bidirectional tree/viewport sync or camera focus (that is Prompt 3)
- Selection filtering by entity type (that is Prompt 2)
- Load or actuator entity types (those entity types do not exist yet -- define colors now for future use)
- Isolate mode (ghost rendering for non-selected bodies) -- stretch goal for future epic
```

---

## Prompt 2: Selection Logic & Multi-Select

```
# Epic 11 -- Selection Logic & Multi-Select

You are enhancing the selection system with proper multi-select modifier key handling, keyboard shortcuts, and selection filtering. The current system supports single-click select and Ctrl+click toggle but lacks Shift+click range select in the tree, Escape to clear, Ctrl+A to select all, and selection-type filtering. After this prompt, the selection experience will match industry-standard CAD tool conventions.

## Read These First (in order)
- `docs/architecture/principles.md` -- React is NOT the hot path
- `packages/frontend/AGENTS.md` -- frontend owns workbench UX
- `packages/viewport/AGENTS.md` -- viewport owns picking
- `packages/ui/AGENTS.md` -- UI component rules

## Governance Reminder
Full governance applies.

## What Exists Now

### `packages/frontend/src/stores/selection.ts`
Zustand store with:
- `selectedIds: Set<string>` -- currently selected entity IDs
- `hoveredId: string | null` -- currently hovered entity
- `lastSelectedId: string | null` -- anchor for future range selection
- `select(id)` -- replace selection with single ID
- `deselect(id)` -- remove from selection
- `toggleSelect(id)` -- add/remove from selection (Ctrl+click)
- `addToSelection(id)` -- add to selection
- `clearSelection()` -- clear all
- `setSelection(ids)` -- replace with array
- `setHovered(id)` -- set hover target

### `packages/frontend/src/hooks/useViewportBridge.ts`
The `handlePick` callback processes viewport clicks:
```ts
if (entityId == null) {
  useSelectionStore.getState().clearSelection();
} else if (modifiers.ctrl) {
  useSelectionStore.getState().toggleSelect(entityId);
} else {
  useSelectionStore.getState().select(entityId);
}
```
No Shift+click handling. No interaction with selection type filtering.

### `packages/viewport/src/picking.ts`
`PickingManager` passes `{ ctrl: boolean; shift: boolean }` modifiers in the `PickCallback`. Shift is already captured but not consumed.

### `packages/frontend/src/components/ProjectTree.tsx`
`TreeView` component with `multiSelect` prop enabled. Selection changes call `handleSelectionChange` which filters out structural IDs (group headers) and calls `setSelection()`. The `TreeView` component (from `@motionlab/ui`) handles its own click/keyboard logic internally.

### `packages/viewport/src/rendering/selection.ts`
After Prompt 1: `SelectionVisuals` accepts `SelectionMeshEntry[]` with entity type information. Multi-selection rendering already works (multiple meshes can be highlighted simultaneously with different colors).

## What to Build

### 1. Extend selection store with range selection support

Add a `selectRange(id)` action to the selection store that selects all entities between `lastSelectedId` and `id` in tree order:

```ts
selectRange: (id: string, orderedIds: string[]) => void;
```

The `orderedIds` parameter is the flat list of entity IDs in tree traversal order (depth-first pre-order). The store does not own tree structure -- the caller provides the ordering.

Implementation:
```ts
selectRange: (id, orderedIds) =>
  set((state) => {
    const anchor = state.lastSelectedId;
    if (!anchor) return { selectedIds: new Set([id]), lastSelectedId: id };

    const anchorIdx = orderedIds.indexOf(anchor);
    const targetIdx = orderedIds.indexOf(id);
    if (anchorIdx === -1 || targetIdx === -1) {
      return { selectedIds: new Set([id]), lastSelectedId: id };
    }

    const start = Math.min(anchorIdx, targetIdx);
    const end = Math.max(anchorIdx, targetIdx);
    const rangeIds = orderedIds.slice(start, end + 1);
    return {
      selectedIds: new Set(rangeIds),
      lastSelectedId: id,
    };
  }),
```

### 2. Add selectAll action

```ts
selectAll: (allIds: string[]) =>
  set({
    selectedIds: new Set(allIds),
    lastSelectedId: allIds.length > 0 ? allIds[allIds.length - 1] : null,
  }),
```

### 3. Wire Shift+click in viewport

In `useViewportBridge.ts`, update `handlePick` to handle Shift modifier:

```ts
if (entityId == null) {
  useSelectionStore.getState().clearSelection();
} else if (modifiers.ctrl) {
  useSelectionStore.getState().toggleSelect(entityId);
} else if (modifiers.shift) {
  // Range select in viewport: use all entity IDs as the ordered list
  // (viewport doesn't have tree order, so we use insertion order from mechanism store)
  const { bodies, datums, joints } = useMechanismStore.getState();
  const allIds = [
    ...bodies.keys(),
    ...datums.keys(),
    ...joints.keys(),
  ];
  useSelectionStore.getState().selectRange(entityId, allIds);
} else {
  useSelectionStore.getState().select(entityId);
}
```

### 4. Add keyboard shortcuts

Create `packages/frontend/src/hooks/useSelectionKeyboard.ts`:

```ts
import { useEffect } from 'react';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { useToolModeStore } from '../stores/tool-mode.js';

/**
 * Global keyboard shortcuts for selection management.
 * Must be mounted once at the app root level.
 */
export function useSelectionKeyboard(): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture keys when an input/textarea is focused
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Escape: clear selection and reset tool mode
      if (e.key === 'Escape') {
        e.preventDefault();
        useSelectionStore.getState().clearSelection();
        useToolModeStore.getState().setMode('select');
        return;
      }

      // Ctrl+A / Cmd+A: select all entities
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        const { bodies, datums, joints } = useMechanismStore.getState();
        const allIds = [
          ...bodies.keys(),
          ...datums.keys(),
          ...joints.keys(),
        ];
        useSelectionStore.getState().selectAll(allIds);
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
```

Mount this hook in the main App component or layout root.

### 5. Selection type filtering

Add an optional selection filter to the selection store that restricts which entity types can be selected:

```ts
export type SelectionFilter = Set<'body' | 'datum' | 'joint'> | null;

export interface SelectionState {
  // ... existing fields ...
  selectionFilter: SelectionFilter;
  setSelectionFilter: (filter: SelectionFilter) => void;
}
```

The filter is checked at pick time in `useViewportBridge.handlePick`:

```ts
// Before selection logic:
if (entityId != null) {
  const filter = useSelectionStore.getState().selectionFilter;
  if (filter) {
    const { bodies, datums, joints } = useMechanismStore.getState();
    let entityType: string | null = null;
    if (bodies.has(entityId)) entityType = 'body';
    else if (datums.has(entityId)) entityType = 'datum';
    else if (joints.has(entityId)) entityType = 'joint';

    if (entityType && !filter.has(entityType as 'body' | 'datum' | 'joint')) {
      return; // Entity type filtered out, ignore pick
    }
  }
}
```

This enables future UI (e.g., a toolbar filter dropdown) to restrict selection to specific entity types -- useful for joint editing workflows where you only want to pick datums.

### 6. Update ProjectTree for Shift+click range select

In `ProjectTree.tsx`, the `TreeView` component from `@motionlab/ui` already supports multi-select. Verify that the `onSelectionChange` callback receives the correct IDs when the user Shift+clicks in the tree. If the `TreeView` component does not handle range select internally, update the `handleSelectionChange` callback:

```ts
const entityIds = useMemo(() => {
  return nodes
    .filter((n) => !isStructuralId(n.id))
    .map((n) => n.id);
}, [nodes]);

const handleSelectionChange = useCallback(
  (ids: Set<string>) => {
    const entity = [...ids].filter((id) => !isStructuralId(id));
    setSelection(entity);
  },
  [setSelection],
);
```

If `TreeView` already handles Shift+click range select (check its implementation), just ensure `lastSelectedId` in the selection store is updated correctly. If it does not, contribute range select to the `TreeView` component in `@motionlab/ui`.

### 7. Delete selected entities with Delete key

The existing `ProjectTree` has a `handleDelete` callback wired to `onDelete` on the `TreeView`. Extend the `useSelectionKeyboard` hook to also handle Delete/Backspace:

```ts
// Delete / Backspace: delete selected entities
if (e.key === 'Delete' || e.key === 'Backspace') {
  const simState = useSimulationStore.getState().state;
  if (simState === 'running' || simState === 'paused') return;

  e.preventDefault();
  const { selectedIds } = useSelectionStore.getState();
  const { datums, joints } = useMechanismStore.getState();
  for (const id of selectedIds) {
    if (datums.has(id)) sendDeleteDatum(id);
    else if (joints.has(id)) sendDeleteJoint(id);
    // Bodies cannot be deleted (import-only)
  }
  useSelectionStore.getState().clearSelection();
}
```

## Architecture Constraints
- Selection store is the single source of truth for what is selected -- viewport reads from it via the bridge
- Keyboard shortcuts must not fire when an input field is focused (text editing takes priority)
- Range select in the viewport uses mechanism store insertion order (not spatial proximity)
- Range select in the tree uses tree traversal order (depth-first pre-order)
- Selection filtering is additive -- null filter means "select anything", a Set filter means "only select these types"
- Do not add Babylon.js imports to any frontend package file

## Acceptance Criteria

1. Click in viewport = replace selection (existing behavior preserved)
2. Ctrl+click in viewport = toggle entity in/out of selection
3. Shift+click in viewport = range select from last selected to clicked entity
4. Escape key = clear selection and reset to select mode
5. Ctrl+A = select all entities (bodies, datums, joints)
6. Delete key = delete selected datums and joints (not bodies, not during simulation)
7. Selection filter can restrict picks to specific entity types
8. Shift+click in tree = range select within tree order
9. Keyboard shortcuts do not fire when an input/textarea is focused
10. `pnpm --filter @motionlab/frontend typecheck` passes
11. `pnpm --filter @motionlab/viewport typecheck` passes

## Done Looks Like
- Multi-select with Ctrl+click and Shift+click works in both viewport and tree
- Keyboard shortcuts (Escape, Ctrl+A, Delete) work globally
- Selection filter mechanism exists for future toolbar integration
- All existing selection behavior (single click, Ctrl+click) is preserved
- No regressions in create-datum or create-joint tool modes

## What NOT to Build
- Selection rendering or color changes (that was Prompt 1)
- Bidirectional tree/viewport sync or camera focus (that is Prompt 3)
- Box/marquee selection in viewport (stretch goal for future epic)
- Selection history/undo (stretch goal for future epic)
- Selection filter UI (toolbar buttons) -- just the store mechanism for now
```

---

## Prompt 3: Selection Sync & Integration

```
# Epic 11 -- Selection Sync & Integration

You are implementing bidirectional selection sync between the ProjectTree and viewport, fit-to-selection camera behavior, and selection-dependent UI features. After this prompt, clicking in the tree focuses the viewport on the selected entity, clicking in the viewport scrolls to and highlights in the tree, and the F key frames the camera around selected entities.

## Read These First (in order)
- `docs/architecture/principles.md` -- React is NOT the hot path; Electron is a shell, not the data bus
- `packages/frontend/AGENTS.md` -- frontend owns workbench UX
- `packages/viewport/AGENTS.md` -- viewport owns visualization and picking
- `packages/ui/AGENTS.md` -- UI component rules

## Governance Reminder
Full governance applies.

## What Exists Now

### `packages/viewport/src/scene-graph.ts`
`SceneGraphManager.focusOnEntity(id)` already exists. For bodies, it computes the bounding box and sets camera target + radius. For datums and joints, it flies to the entity's world position and zooms in. However, it snaps instantly (no animation) and only focuses on a single entity.

`SceneGraphManager.fitAll()` frames all entities in the scene.

`SceneGraphManager.animateCameraTo(alpha, beta, radius?, duration?)` provides smooth camera animation with ease-out cubic interpolation and shortest-path angle wrapping. Used by `setCameraPreset()`.

### `packages/frontend/src/hooks/useViewportBridge.ts`
Subscribes to `useSelectionStore` and calls `sg.applySelection(state.selectedIds)` when selection changes. Subscribes separately for hover. Does not trigger camera movement on selection change.

### `packages/frontend/src/components/ProjectTree.tsx`
Tree rows have context menu items including "Focus in Viewport" (`onFocusViewport`) which calls `getSceneGraph()?.focusOnEntity(node.id)` for datums and joints. Body context menu has "Select in Viewport" but no focus action.

Selection in the tree calls `setSelection(entity)` which updates the store. The viewport picks up the change via the bridge subscription and applies highlight.

There is NO reverse path: clicking in the viewport highlights the entity, but the tree does not scroll to reveal the selected node.

### `packages/frontend/src/stores/selection.ts`
After Prompt 2: has `selectRange`, `selectAll`, `selectionFilter`, and full multi-select support.

### `packages/viewport/src/rendering/selection.ts`
After Prompt 1: entity-type-aware selection colors. Multi-selection rendering works.

### `packages/frontend/src/hooks/useSelectionKeyboard.ts`
After Prompt 2: handles Escape, Ctrl+A, Delete keyboard shortcuts.

## What to Build

### 1. Fit-to-selection (multi-entity focus)

Add `focusOnEntities(ids: string[])` to `SceneGraphManager` that computes the combined bounding box of all specified entities and frames the camera around them:

```ts
/**
 * Animate the camera to frame one or more entities.
 * Computes the combined AABB of all entity meshes and sets the camera
 * target to the center with radius to fit the extent.
 */
focusOnEntities(ids: string[]): void {
  if (ids.length === 0) return;

  // Single entity: delegate to existing focusOnEntity for type-specific behavior
  if (ids.length === 1) {
    this.focusOnEntity(ids[0]);
    return;
  }

  let min = new Vector3(Infinity, Infinity, Infinity);
  let max = new Vector3(-Infinity, -Infinity, -Infinity);
  let hasBounds = false;

  for (const id of ids) {
    const entity = this.entities.get(id);
    if (!entity) continue;

    if (entity.type === 'body') {
      for (const mesh of entity.meshes) {
        mesh.computeWorldMatrix(true);
        const bounds = mesh.getBoundingInfo().boundingBox;
        min = Vector3.Minimize(min, bounds.minimumWorld);
        max = Vector3.Maximize(max, bounds.maximumWorld);
        hasBounds = true;
      }
    } else {
      // Datums and joints: use world position as a point
      const pos = entity.rootNode.getAbsolutePosition();
      min = Vector3.Minimize(min, pos);
      max = Vector3.Maximize(max, pos);
      hasBounds = true;
    }
  }

  if (!hasBounds) return;

  const center = Vector3.Center(min, max);
  const radius = Vector3.Distance(min, max) / 2;
  this._camera.target = center;
  this._camera.radius = radius > 0 ? radius * 2.5 : 10;
}
```

### 2. F key: fit to selection

In `useSelectionKeyboard.ts` (from Prompt 2), add F key handling:

```ts
// F key: fit camera to selection (or fit all if nothing selected)
if (e.key === 'f' || e.key === 'F') {
  // Don't trigger if Ctrl/Cmd is held (Ctrl+F = browser find)
  if (e.ctrlKey || e.metaKey) return;

  e.preventDefault();
  const sg = getSceneGraph();
  if (!sg) return;

  const { selectedIds } = useSelectionStore.getState();
  if (selectedIds.size > 0) {
    sg.focusOnEntities([...selectedIds]);
  } else {
    sg.fitAll();
  }
}
```

Import `getSceneGraph` from `../engine/connection.js`.

### 3. Tree auto-scroll on viewport selection

When the user selects an entity in the viewport, the tree should scroll to reveal and highlight the selected node. The `TreeView` component in `@motionlab/ui` needs a way to scroll a specific node into view.

Option A (preferred -- if TreeView supports it): Add a `scrollToId` prop to `TreeView`:

```tsx
<TreeView
  nodes={nodes}
  selectedIds={selectedIds}
  scrollToId={lastSelectedId}  // NEW: auto-scroll to this node
  onSelectionChange={handleSelectionChange}
  // ...
/>
```

The `TreeView` implementation uses a `useEffect` on `scrollToId` to find the DOM element for that row and call `element.scrollIntoView({ block: 'nearest', behavior: 'smooth' })`.

Option B (if TreeView doesn't support scrollToId): Use a ref-based approach in ProjectTree:

```tsx
const rowRefs = useRef<Map<string, HTMLElement>>(new Map());

// In renderRow, attach ref:
<div ref={(el) => { if (el) rowRefs.current.set(node.id, el); }}>
  {row}
</div>

// Effect to scroll on selection change:
useEffect(() => {
  const lastId = useSelectionStore.getState().lastSelectedId;
  if (lastId) {
    const el = rowRefs.current.get(lastId);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}, [selectedIds]);
```

Also ensure that parent nodes are auto-expanded when a child is selected. For example, if a datum is selected in the viewport but its parent body is collapsed in the tree, expand the body node:

```ts
useEffect(() => {
  // Auto-expand parent nodes of selected entities
  const newExpanded = new Set(expandedIds);
  let changed = false;
  for (const id of selectedIds) {
    const node = nodes.find((n) => n.id === id);
    if (node?.parentId && !newExpanded.has(node.parentId)) {
      newExpanded.add(node.parentId);
      changed = true;
      // Also expand grandparent if needed
      const parent = nodes.find((n) => n.id === node.parentId);
      if (parent?.parentId && !newExpanded.has(parent.parentId)) {
        newExpanded.add(parent.parentId);
      }
    }
  }
  if (changed) setExpandedIds(newExpanded);
}, [selectedIds]);
```

### 4. Tree click triggers viewport focus

When the user clicks (selects) an entity in the ProjectTree, the viewport camera should smoothly focus on that entity. This is the tree-to-viewport direction of the bidirectional sync.

Two behaviors:
- **Single click** in tree: select + subtle focus (keep current camera angle, adjust target and radius)
- **Double-click** in tree: select + full focus with fit-to-entity framing

For single-click focus, update the `handleSelectionChange` callback in `ProjectTree.tsx`:

```ts
const handleSelectionChange = useCallback(
  (ids: Set<string>) => {
    const entityIds = [...ids].filter((id) => !isStructuralId(id));
    setSelection(entityIds);

    // Focus viewport on the selected entity/entities
    if (entityIds.length > 0) {
      getSceneGraph()?.focusOnEntities(entityIds);
    }
  },
  [setSelection],
);
```

For double-click isolate (optional/stretch): add an `onDoubleClick` handler that hides all other entities:

```ts
const handleDoubleClick = useCallback((id: string) => {
  if (isStructuralId(id)) return;
  const { bodies } = useMechanismStore.getState();
  if (bodies.has(id)) {
    const allBodyIds = [...bodies.keys()];
    useVisibilityStore.getState().isolate(id, allBodyIds);
    getSceneGraph()?.focusOnEntity(id);
  }
}, []);
```

### 5. Selection-dependent context menu in viewport

Add a right-click context menu in the viewport that shows entity-appropriate actions based on what is under the cursor or what is selected. This connects the viewport's picking system with the UI context menus already defined in `ProjectTree.tsx`.

Create `packages/frontend/src/components/ViewportContextMenu.tsx`:

```tsx
import { useCallback, useState } from 'react';
import { BodyContextMenu, DatumContextMenu, JointContextMenu } from '@motionlab/ui';
import { useMechanismStore } from '../stores/mechanism.js';
// ... imports for actions ...

interface ViewportContextMenuProps {
  entityId: string | null;
  position: { x: number; y: number };
  onClose: () => void;
}
```

Wire the right-click from the viewport's pointer handler. In `PickingManager`, expose a right-click callback:

```ts
export type ContextMenuCallback = (
  entityId: string | null,
  position: { x: number; y: number },
) => void;
```

Handle `POINTERDOWN` with `event.button === 2` (right-click) to trigger the context menu callback with the picked entity ID and screen position.

### 6. Remove "Focus in Viewport" context menu redundancy

After implementing automatic focus-on-select, the explicit "Focus in Viewport" context menu item becomes less important for single entities. Keep it for now (it provides a deliberate full-focus action distinct from the subtle single-click focus), but consider consolidating in a future cleanup pass.

## Architecture Constraints
- Camera animation on tree selection must NOT block the main thread or cause jank
- Tree auto-scroll uses `scrollIntoView` (native DOM), not manual scroll position math
- Auto-expand of parent nodes must not cause infinite loops (check for cycles in parent chain)
- Double-click isolate is a stretch goal -- skip if TreeView double-click handling is complex
- Viewport context menu uses the same UI components as tree context menus (from @motionlab/ui)
- Do not add Babylon.js imports to any frontend package file

## Acceptance Criteria

1. **F key** with selection: camera frames the selected entity/entities
2. **F key** without selection: camera fits all entities (same as existing Fit All)
3. **Tree single-click**: selects entity AND viewport camera focuses on it
4. **Viewport click**: selects entity AND tree scrolls to reveal the selected node
5. **Viewport click on child datum**: tree auto-expands the parent body node if collapsed
6. **Multi-select focus**: selecting 3 entities and pressing F frames all 3
7. **Right-click in viewport**: shows context menu appropriate to the entity type
8. Camera focus uses smooth animation (not instant snap) for single-entity focus
9. `pnpm --filter @motionlab/frontend typecheck` passes
10. `pnpm --filter @motionlab/viewport typecheck` passes
11. `pnpm --filter @motionlab/ui typecheck` passes (if TreeView is modified)

## Done Looks Like
- Bidirectional selection sync between tree and viewport works reliably
- F key frames the selection with smooth camera animation
- Tree auto-scrolls and auto-expands when entities are selected in the viewport
- Viewport context menu shows entity-appropriate actions
- No jank or lag during selection/focus operations
- All typecheck commands pass

## What NOT to Build
- Selection rendering (that was Prompt 1)
- Multi-select keyboard logic (that was Prompt 2)
- Box/marquee selection (future)
- Inspector panel integration (the inspector already reacts to selection store changes)
- Isolate mode ghost rendering (future -- the visibility store isolate() already hides other entities)
```

---

## Integration Verification

After all three prompts complete, verify the full selection system end-to-end:

1. **Import a STEP file** with multiple bodies
2. **Click a body in the viewport** -- steel-blue outline appears, tree scrolls to body, tree row highlights
3. **Ctrl+click a datum in the viewport** -- emerald-green outline appears alongside body's blue outline, both highlighted in tree
4. **Ctrl+click a joint in the viewport** -- orange outline joins the existing selections
5. **Press F** -- camera frames all three selected entities
6. **Click a datum in the tree** -- viewport camera focuses on datum, green outline appears
7. **Shift+click another datum in the tree** -- range of entities selected, all show outlines
8. **Press Escape** -- all selections cleared, all outlines removed, tool mode resets to select
9. **Ctrl+A** -- all entities selected with their respective type colors
10. **Press Delete** -- selected datums and joints deleted (bodies preserved)
11. **Right-click a joint in viewport** -- context menu with joint-specific actions appears
12. **Hover over a body** -- subtle steel-blue pre-highlight before clicking
13. **All typecheck commands pass**: `pnpm --filter @motionlab/viewport typecheck`, `pnpm --filter @motionlab/frontend typecheck`, `pnpm --filter @motionlab/ui typecheck`

## Future Work (out of scope)

- **Box/marquee selection:** Click-drag rectangle in viewport to select all entities within the rectangle. Requires a 2D overlay and frustum intersection testing.
- **Selection history/undo:** Ctrl+Z to restore previous selection state. Requires a selection history stack.
- **Isolate mode ghost rendering:** When isolating a body, render other bodies as transparent ghosts instead of fully hiding them.
- **Selection sets:** Named groups of entities that can be recalled (e.g., "drive train joints").
- **Selection by property:** Select all joints of type "revolute" or all bodies with mass > 1 kg.
- **Edge/vertex selection:** Extend topology selection from faces (Epic 10) to edges and vertices.
