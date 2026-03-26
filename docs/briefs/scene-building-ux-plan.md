# Scene Building UX — Implementation Plan

> Concrete tasks to implement the scene-building-ux spec enhancements.
> Organized as parallel workstreams where possible.

## Current State

- **UI layout:** Left floating panel (scene tree, 288px), right floating panel (inspector, 288px), bottom dock (floating between panels — timeline + diagnostics tabs), workspace tab bar, status bar.
- **Entity model:** 6 typed entities (Body, Geometry, Datum, Joint, Load, Actuator) with proto-first schemas, Zustand stores, and dedicated inspectors.
- **Viewport:** React Three Fiber + Three.js with BVH-accelerated picking.
- **Communication:** WebSocket + binary Protobuf to native C++ engine.
- **No asset library.** Assets are imported directly via toolbar and immediately become Body+Geometry pairs in the scene. There is no intermediate "asset registered but not placed" state.
- **No primitives.** Only CAD import produces entities.
- **No collision authoring.** Collision is engine-internal at compile time.

---

## Workstream 0 — Viewport Placement & Transform (Prerequisite)

**Goal:** Establish the viewport interaction foundation that all creation workflows depend on. Without placement and transform, users cannot position entities after creation.

**Why this is a prerequisite:** Workstreams A2, C3, and D all create entities that need to appear somewhere in the scene. Without a placement strategy and transform gizmo, created entities pile up at the origin with no way to reposition them.

### 0.1. Default placement strategy

When any entity is created (primitive, asset instantiation, "Make Body"), it spawns at the **viewport focus point** — the camera's look-at target projected onto the ground plane (Y=0). If no ground plane intersection exists, fall back to world origin.

After creation, the entity is automatically selected and the transform gizmo activates so the user can reposition immediately.

**Acceptance criteria:**
- New entities appear at the viewport focus point, not at world origin (unless focus point is origin)
- Entity is auto-selected on creation
- Transform gizmo activates immediately on the new entity

### 0.2. Transform gizmo

Implement a transform gizmo using drei `PivotControls` (or a component heavily inspired by it) for translate/rotate on selected bodies.

**Files to modify:**
- `packages/viewport/src/scene-graph-three.ts` — Integrate gizmo rendering and interaction on the selected body
- `packages/frontend/src/stores/tool-mode.ts` — Add `translate` and `rotate` tool modes (or a combined `transform` mode)

**Acceptance criteria:**
- Selecting a body in the tree or viewport shows translate/rotate handles
- Dragging handles sends `UpdateBodyCommand` with the new pose
- Gizmo respects the demand-driven invalidation model (mutations request renders through coalesced callback)
- Gizmo interaction suppresses hover picking (consistent with existing orbit/transform drag behavior)

### 0.3. Multi-selection

Multi-selection is required for D3 ("Make Body" from selection) and general scene-building workflows.

**Files to modify:**
- `packages/frontend/src/stores/selection.ts` — Support multi-select (Set of entity IDs)
- `packages/frontend/src/components/ProjectTree.tsx` — Shift+click (range) and Ctrl/Cmd+click (toggle) in the scene tree
- `packages/viewport/src/scene-graph-three.ts` — Ctrl/Cmd+click to toggle selection in viewport

**Acceptance criteria:**
- Shift+click selects a range in the tree
- Ctrl/Cmd+click toggles individual items in both tree and viewport
- Multi-selection state is reflected in both tree and viewport highlights
- Inspector shows "N items selected" when multiple items are selected (no property editing on multi-select for now)

---

## Workstream A — Full-Width Bottom Panel with Asset Browser

**Goal:** Replace the floating center-only bottom dock with a full-width bottom panel (like Unity), add an Assets tab alongside Timeline and Diagnostics.

**Why this matters:** The asset browser is the entry point for both CAD instantiation and primitive creation. Having it full-width gives horizontal space for the asset tree + grid layout. The timeline and diagnostics tabs share this space since they're rarely needed simultaneously with assets.

### A1. Rework AppShell bottom dock to full-width

**Files to modify:**
- `packages/ui/src/components/shell/app-shell.tsx` — Change bottom dock positioning from `left: effectiveLeftW + 2*inset, right: effectiveRightW + 2*inset` to `left: 0, right: 0`. Remove dependency on panel widths. Move the bottom panel from inside the `main-area` div (which is relative-positioned between topBar and tabBar) to a separate row between main-area and tabBar. This makes it a true layout row, not a floating overlay.
- `packages/ui/src/components/shell/bottom-dock.tsx` — No changes needed to the dock component itself (it's already tab-based and collapsible). May need minor styling for full-width context.

**Layout change:**
```
Before:                          After:
┌──────────────────────┐        ┌──────────────────────┐
│ TopBar               │        │ TopBar               │
├──┬──────────────┬────┤        ├──┬──────────────┬────┤
│L │  Viewport    │ R  │        │L │  Viewport    │ R  │
│  │              │    │        │  │              │    │
│  │  [dock]      │    │        │  │              │    │
│  │  (floating)  │    │        │  │              │    │
├──┴──────────────┴────┤        ├──┴──────────────┴────┤
│ Tabs  │  StatusBar   │        │ Bottom Panel (full)  │
└──────────────────────┘        │ [Assets][Timeline].. │
                                ├──────────────────────┤
                                │ Tabs  │  StatusBar   │
                                └──────────────────────┘
```

**AppShell prop changes:**
- Rename `bottomDock` → `bottomPanel` throughout. Apply consistently: `bottomPanelExpanded`, `bottomPanelActiveTab` in stores and props.
- Remove `bottomDockExpanded` influence on `--vp-inset-bottom` (the bottom panel is now a layout row, not an overlay — viewport area naturally shrinks)
- The main-area height becomes `flex-1` minus bottom panel height

**Acceptance criteria:**
- Bottom panel spans full window width
- Panel collapses to tab bar (~32px), expands to ~240px
- Left and right floating panels render above the bottom panel (no overlap)
- `--vp-inset-bottom` still works for viewport camera/controls to avoid the panel area

### A2. Add Assets tab to the bottom panel

**Files to create:**
- `packages/frontend/src/components/AssetBrowser.tsx` — Main asset browser component

**Files to modify:**
- `packages/frontend/src/components/TimelinePanel.tsx` — Becomes one tab's content instead of owning the dock. Extract timeline content into a `TimelineContent` sub-component.
- `packages/frontend/src/components/BuildBottomPanel.tsx` (new) — Wraps BottomDock with two tabs: Assets and Timeline. Replaces the current `TimelinePanel` as the build workspace's bottom panel.
- `packages/frontend/src/App.tsx` — Wire `BuildBottomPanel` instead of `TimelinePanel` as the build workspace's bottom panel.
- `packages/frontend/src/stores/ui-layout.ts` — Add `bottomPanelActiveTab: 'assets' | 'timeline'` (default: `'assets'`). Rename all `bottomDock*` fields to `bottomPanel*`.

**Asset-first pattern:** Import registers a CAD file as an asset in the asset library — parsed, tessellated, solid properties computed, assembly tree preserved. The asset sits in the library with metadata. Nothing appears in the scene until the user explicitly places it. This enables the same asset to be instantiated multiple times (e.g., import a wheel once, place it four times). Each placement creates an independent entity hierarchy with its own transform and physics configuration. The asset is the template; the scene entities are the instances.

**Asset browser layout (inside the Assets tab):**
```
┌──────────────┬───────────────────────────────────────────────┐
│ Asset Tree   │  Asset Cards (grid)                           │
│              │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐            │
│ > Imports    │  │STEP │ │STEP │ │STEP │ │ ... │   [Search]  │
│   file1.step │  │file1│ │file2│ │file3│ │     │             │
│   file2.step │  └─────┘ └─────┘ └─────┘ └─────┘            │
│ > Primitives │  ┌─────┐ ┌─────┐ ┌─────┐                    │
│   Box        │  │ Box │ │Cyl  │ │Sph  │                     │
│   Cylinder   │  └─────┘ └─────┘ └─────┘                    │
│   Sphere     │                                               │
└──────────────┴───────────────────────────────────────────────┘
```

**Data source:** The asset browser maintains an asset library — a registry of imported CAD files and available primitives. For imported assets, it tracks the original filename, content hash, parsed assembly tree, tessellation data, and computed solid properties. Each card shows filename, thumbnail (future), part count, and a "Place in Scene" action.

**"Place in Scene" behavior:** Instantiation uses the already-parsed asset data in the library, not by re-importing the original file. The original file is only needed for initial import or re-import (updating to a newer version). All data needed for instantiation (tessellation, assembly tree, solid properties) is already cached in the asset library.

**Scaling note:** The current grid implementation is sufficient for projects with up to ~50 assets. For larger projects, virtualized scrolling (e.g., `react-window`) and lazy thumbnail generation will be needed. Note this as a known scaling concern.

**Acceptance criteria:**
- Assets tab shows imported CAD files as cards in the asset library
- Clicking a card selects it in the library (does not affect scene selection)
- "Place in Scene" instantiates from cached asset data at the viewport focus point (per Workstream 0)
- The same asset can be placed multiple times, each creating independent scene entities
- Search filters by filename
- Primitives section shows Box, Cylinder, Sphere cards (functional after Workstream C lands)
- Timeline tab works identically to current behavior

---

## Workstream B — Shared Inspector Sections

**Goal:** Extract common inspector patterns into reusable section renderers. This reduces duplication and makes it easy to add new entity types (sensors) or new sections (collision) without duplicating code.

**Why this matters:** Currently each inspector (Body, Joint, Load, etc.) has its own hardcoded sections. Some patterns repeat: identity (name + ID), pose display, simulation values with trace lookup. Extracting these reduces code and ensures consistency.

### B1. Create shared section renderers

**Files to create:**
- `packages/frontend/src/components/inspector/sections/IdentitySection.tsx` — Entity name (editable), type badge, ID (copyable). Used by all inspectors.
- `packages/frontend/src/components/inspector/sections/PoseSection.tsx` — Position + orientation display. Used by BodyInspector (world pose), DatumInspector (local pose), GeometryInspector (local pose), JointInspector (with local/world frame toggle).
- `packages/frontend/src/components/inspector/sections/SimulationValuesSection.tsx` — Inline formatted simulation values for the selected entity. Handles trace lookup by entity ID, nearest-sample binary search for the current playback time, channel availability checks, and "awaiting data" / "not available" fallback states. Used by BodyInspector, JointInspector, LoadInspector, ActuatorInspector. This is the highest-ROI extraction (~50+ LoC duplicated across 4 inspectors with complex conditional logic).
- `packages/frontend/src/components/inspector/sections/MassSection.tsx` — Mass, COM, inertia tensor with override toggle. Extracted from BodyInspector.

**Pattern:** Each section is a self-contained React component that receives typed props:
```typescript
// Example
interface IdentitySectionProps {
  entityId: string;
  entityType: 'body' | 'geometry' | 'datum' | 'joint' | 'load' | 'actuator';
  name: string;
  onRename: (newName: string) => void;
}

// SimulationValuesSection receives channel definitions and renders
// formatted values with trace lookup, binary search, and fallback states
interface SimulationValuesSectionProps {
  entityId: string;
  entityType: string;
  channelDefinitions: Array<{
    channelIdSuffix: string;  // e.g., 'coord/rot_z', 'applied_force'
    label: string;
    unit: string;
  }>;
}
```

**Acceptance criteria:**
- Each shared section renders identically to the current inline implementation
- No visual regression on any inspector
- SimulationValuesSection handles all four inspector variants (Body pose, Joint coords/reactions, Load applied values, Actuator effort/speed)

### B2. Refactor existing inspectors to use shared sections

**Files to modify:**
- `packages/frontend/src/components/BodyInspector.tsx` — Use IdentitySection, PoseSection, MassSection, SimulationValuesSection
- `packages/frontend/src/components/DatumInspector.tsx` — Use IdentitySection, PoseSection
- `packages/frontend/src/components/JointInspector.tsx` — Use IdentitySection, SimulationValuesSection
- `packages/frontend/src/components/LoadInspector.tsx` — Use IdentitySection, SimulationValuesSection
- `packages/frontend/src/components/ActuatorInspector.tsx` — Use IdentitySection, SimulationValuesSection
- `packages/frontend/src/components/GeometryInspector.tsx` — Use IdentitySection
- `packages/frontend/src/components/EntityInspector.tsx` — Update inspector router if shared sections change the composition pattern

**Acceptance criteria:**
- All inspectors use shared sections where applicable
- No visual regression
- New entity type inspectors (future: Sensor) only need to compose shared sections + type-specific sections

---

## Workstream C — Primitive Entity Creation

**Goal:** Let users create Box, Cylinder, and Sphere bodies directly, without CAD import. This enables the "sketching" workflow for prototyping mechanisms.

**Why this matters:** Currently the only way to get geometry into the scene is STEP import. Primitives enable rapid prototyping and are essential for the "primitive-first" workflow.

### C1. Engine-side: Primitive B-Rep and mesh generation

OCCT is a B-Rep kernel — generating B-Rep for a box, cylinder, or sphere is one of its most basic operations. Primitives are full B-Rep solids, not tessellation-only second-class citizens. This means primitives support face-aware datum creation (`CreateDatumFromFaceCommand` with `FaceSurfaceClass`) identically to imported CAD geometry.

**Files to modify:**
- `native/engine/src/cad_import.cpp` (or new `primitive_generator.cpp`) — Functions to generate B-Rep solids and tessellated display meshes for box, cylinder, sphere using OCCT's `BRepPrimAPI_MakeBox`, `BRepPrimAPI_MakeCylinder`, `BRepPrimAPI_MakeSphere`
- `native/engine/src/mechanism_state.cpp` — Handle new `CreatePrimitiveBodyCommand`
- `schemas/protocol/transport.proto` — Add `CreatePrimitiveBodyCommand` with shape type enum and dimension parameters
- `schemas/mechanism/mechanism.proto` — Add `PrimitiveSource` message (shape type + dimensions) as an alternative to `AssetReference` on Geometry

**Command definition:**
```protobuf
message CreatePrimitiveBodyCommand {
  PrimitiveShape shape = 1;
  string name = 2;
  Vec3 position = 3;     // initial position (viewport focus point)
  PrimitiveParams params = 4;
}

enum PrimitiveShape {
  PRIMITIVE_SHAPE_UNSPECIFIED = 0;
  BOX = 1;
  CYLINDER = 2;
  SPHERE = 3;
}

message PrimitiveParams {
  oneof shape_params {
    BoxParams box = 1;
    CylinderParams cylinder = 2;
    SphereParams sphere = 3;
  }
}

message BoxParams {
  double width = 1;   // X extent
  double height = 2;  // Y extent
  double depth = 3;   // Z extent
}

message CylinderParams {
  double radius = 1;
  double height = 2;
}

message SphereParams {
  double radius = 1;
}
```

**Acceptance criteria:**
- Engine can create a Body + Geometry from a primitive shape as a full B-Rep solid
- Geometry has computed mass properties (analytical, from OCCT)
- Display mesh is tessellated from the B-Rep and sent to frontend for rendering
- Face-aware datum creation works on primitives (e.g., snapping a datum to a cylinder face returns `CYLINDRICAL`)
- Round-trips through save/load

### C2. Protocol-side: Wire primitive command

**Files to modify:**
- `packages/protocol/src/transport.ts` — Add `createCreatePrimitiveBodyCommand()` builder and result handler
- `packages/frontend/src/engine/connection.ts` — Handle `CreatePrimitiveBodyResult` event

### C3. Frontend: Primitive creation UI

**Files to modify:**
- `packages/frontend/src/components/AssetBrowser.tsx` — Add primitive cards (Box, Cylinder, Sphere) in the "Primitives" section. Click to create.
- `packages/frontend/src/components/ProjectTree.tsx` — Add "Create Primitive" to the creation menu
- `packages/frontend/src/stores/mechanism.ts` — No new state needed (primitives create regular Body + Geometry entries)

**Placement:** Primitive spawns at the viewport focus point (per Workstream 0). Transform gizmo activates immediately.

**Acceptance criteria:**
- User can create a box, cylinder, or sphere from the asset browser or tree menu
- Primitive appears in viewport and scene tree as a regular body at the viewport focus point
- Primitive dimensions editable in inspector (future: C4)
- Primitive bodies work identically to CAD-derived bodies for datums, joints, etc. (including face-aware datum creation)

### C4. Frontend: Primitive parameter editing in inspector (follow-up)

**Files to modify:**
- `packages/frontend/src/components/GeometryInspector.tsx` — When geometry source is a primitive, show editable dimension fields (width/height/depth for box, radius/height for cylinder, radius for sphere)
- Protocol: `UpdatePrimitiveCommand` to change dimensions, regenerate B-Rep and display mesh

---

## Workstream D — Import Placement Modes

**Goal:** Give users a choice between "auto-body" (current default — each part gets a body) and "visual only" (import as loose geometry for later body authoring).

**Why this matters:** For complex assemblies, users often want to group parts into bodies differently than the CAD structure. "Visual only" mode enables this by importing geometry without forcing body assignments.

### D1. Frontend: Import mode selection

**Files to modify:**
- `packages/frontend/src/App.tsx` or wherever import is triggered — Inject mode selection between file-pick and import dispatch
- `packages/frontend/src/stores/ui-layout.ts` — Store last-used import mode preference

**Interaction design:** The import mode prompt appears **after** file selection but **before** the import command is dispatched. This is a lightweight inline popover near the import button / file picker — not a full modal. It shows:

- **Auto-body** (default): Each STEP part creates Body + Geometry
- **Visual only**: Import creates Geometry entities only (no bodies). They appear under "Loose Geometry" group in the tree.

The user's last selection is persisted as the default for next time.

**Alternative (possible improvement):** A persistent default mode toggle in the asset browser header. More efficient for repeat imports but less discoverable for first-time users.

**The choice:**
- **Auto-body** (default): Current behavior — each STEP part creates Body + Geometry
- **Visual only**: Import creates Geometry entities only (no bodies). They appear under "Loose Geometry" group in the tree.

### D2. Protocol/Engine: Support bodyless geometry import

**Files to modify:**
- `schemas/protocol/transport.proto` — Add `import_mode` field to `ImportOptions` (or `ImportAssetCommand`)
- `native/engine/src/cad_import.cpp` — When import_mode is VISUAL_ONLY, create Geometry entities with `parent_body_id = ""` (detached)
- `packages/frontend/src/components/ProjectTree.tsx` — Show "Loose Geometry" group for geometries without parent bodies

**Compilation behavior with loose geometries:** Compilation emits a **warning** (not an error). Loose visual-only geometries are excluded from the simulation model, with a diagnostic message: "N geometries are not attached to any body — they will be excluded from simulation." The diagnostics panel highlights them so the user can fix if desired. Compilation still succeeds.

**Acceptance criteria:**
- User can import in "visual only" mode
- Loose geometries appear in tree and viewport (visual only, no physics)
- Compilation with loose geometries present succeeds with a warning diagnostic
- Diagnostics panel highlights unattached geometries

### D3. Frontend: "Make Body" from selection

**Prerequisite:** Multi-selection (Workstream 0.3) must be implemented first.

**Files to modify:**
- `packages/frontend/src/components/ProjectTree.tsx` — Context menu on loose geometries: "Make Body" groups selected geometries under a new body
- `packages/frontend/src/stores/tool-mode.ts` — Implement as a direct command (no mode needed)

**Flow:** Select loose geometries (Shift+click or Ctrl/Cmd+click) → right-click → "Make Body" → `CreateBodyCommand` + `AttachGeometryCommand` for each selected geometry.

**Acceptance criteria:**
- "Make Body" groups selected loose geometries into a new body
- Mass aggregates from attached geometries
- New body appears in tree and viewport at the centroid of its geometries

### D4. Frontend: Geometry re-parenting

A natural complement to "Make Body" — allows moving a geometry from one body to another.

**Files to modify:**
- `packages/frontend/src/components/ProjectTree.tsx` — Context menu on any geometry: "Move to Body → [body list]" submenu

**Interaction:** Right-click geometry → "Move to Body" → select target body from submenu. Dispatches `AttachGeometryCommand` (already exists in the protocol).

Drag-and-drop re-parenting in the tree is a natural fast-follow but not required for the first pass.

**Acceptance criteria:**
- Geometry can be moved between bodies via context menu
- Mass properties recompute on both source and target bodies

### D5. Context menus for scene entities

Context menus are the primary right-click interaction pattern for scene building. Define a minimal first batch.

**Files to modify:**
- `packages/frontend/src/components/ProjectTree.tsx` — Add context menus for entity types

**Menu definitions:**
- **Body:** Rename, Delete, Add Datum, Add Joint (to this body)
- **Geometry:** Rename, Delete, Move to Body → [body list]
- **Loose Geometry:** Make Body, Attach to Body → [body list], Delete
- **Datum:** Rename, Delete
- **Joint:** Rename, Delete
- **Load:** Rename, Delete
- **Actuator:** Rename, Delete

**Acceptance criteria:**
- Right-click on any entity in the tree shows a contextual menu
- All actions dispatch the appropriate existing commands
- Delete shows a confirmation for entities with dependents (e.g., body with joints)

---

## Workstream E — Collision Authoring (Phase 1)

**Goal:** Let users configure collision shapes on geometries. Start with simple auto-fitted shapes.

**Design decision:** Collision is **per-geometry**, not per-body. This is consistent with the existing pattern:
- **Visual:** per-geometry (each child has its own mesh, body composites visually)
- **Mass:** per-geometry, aggregated at body (each child's solid properties computed individually, body sums mass + combined COM + parallel axis theorem for inertia)
- **Collision:** per-geometry, aggregated at body (each child can independently have a collision shape with its own offset; at solve time, the body collects all child collision shapes and registers them via `ChCollisionModel::AddShapes`)

### E1. Proto: Add collision config to Geometry

**Files to modify:**
- `schemas/mechanism/mechanism.proto` — Add `CollisionConfig` message to Geometry:
  ```protobuf
  message CollisionConfig {
    CollisionShapeType shape_type = 1;  // NONE, BOX, SPHERE, CYLINDER, CONVEX_HULL
    // Auto-fit parameters (computed from geometry bounding box)
    Vec3 half_extents = 2;  // for BOX
    double radius = 3;      // for SPHERE, CYLINDER
    double height = 4;      // for CYLINDER
    Vec3 offset = 5;        // local offset relative to geometry origin
  }
  ```
- `packages/protocol/src/transport.ts` — Add `UpdateCollisionConfigCommand` targeting a geometry ID
- `native/engine/src/mechanism_state.cpp` — Store collision config per geometry

### E2. Engine: Generate collision shapes at compile time

**Files to modify:**
- `native/engine/src/compiler.cpp` (or equivalent) — For each body, collect `CollisionConfig` from all child geometries and register them on the Chrono body's `ChCollisionModel` using `AddShapes` with the geometry's local pose as the shape frame. Auto-fit from geometry bounding box when shape type is set but dimensions are zero.

### E3. Frontend: Collision inspector section + viewport overlay

**Files to create:**
- `packages/frontend/src/components/inspector/sections/CollisionSection.tsx` — Shape type picker, dimension display, enable/disable toggle

**Files to modify:**
- `packages/frontend/src/components/GeometryInspector.tsx` — Add CollisionSection (collision is per-geometry)
- `packages/viewport/src/scene-graph-three.ts` — Render wireframe overlay for collision shapes when enabled. Must trigger demand-driven invalidation when collision properties change.

**Acceptance criteria:**
- User can add a collision shape (box/sphere/cylinder) to any geometry
- Shape auto-fits to geometry bounding box
- Wireframe overlay visible in viewport for each geometry's collision shape
- Body aggregates collision shapes from all child geometries at compile time
- Collision used by Chrono at compile time via `ChCollisionModel::AddShapes`

---

## Workstream F — Motion Type Enum

**Goal:** Replace `is_fixed: boolean` with `motion_type: MotionType` (DYNAMIC, FIXED). KINEMATIC is deferred until a trajectory/keyframe system exists to drive it.

**Why KINEMATIC is deferred:** KINEMATIC means "body follows a prescribed trajectory, not computed by the solver." This requires a trajectory or controller system that doesn't exist yet. Shipping a user-facing option that behaves identically to FIXED is confusing. The enum is designed to accept KINEMATIC later without breaking changes.

### F1. Proto evolution

**Files to modify:**
- `schemas/mechanism/mechanism.proto` — Add `MotionType` enum (`MOTION_TYPE_UNSPECIFIED = 0; DYNAMIC = 1; FIXED = 2;`) and `motion_type` field to Body. Keep `is_fixed` as deprecated for migration. Reserve `KINEMATIC = 3` in a comment for future use.
- `native/engine/src/mechanism_state.cpp` — Read `motion_type`, fall back to `is_fixed` for old files (`is_fixed: true` → `FIXED`, `is_fixed: false` → `DYNAMIC`)
- `packages/protocol/src/transport.ts` — Update `UpdateBodyCommand` to include motion type
- `packages/frontend/src/stores/mechanism.ts` — Add `motionType` to BodyState
- `packages/frontend/src/components/BodyInspector.tsx` — Replace `is_fixed` toggle with a motion type selector (Dynamic / Fixed)

**Acceptance criteria:**
- Motion type selector in inspector replaces the fixed toggle (two options: Dynamic, Fixed)
- Old projects with `is_fixed` migrate seamlessly
- Enum is extensible for future KINEMATIC without breaking changes

---

## Dependency Graph & Parallelism

```
Workstream 0 (Prerequisite)
├── 0.1: Default placement strategy
├── 0.2: Transform gizmo
└── 0.3: Multi-selection

Workstream A (Bottom Panel + Assets)     Workstream B (Shared Inspector)
├── A1: Full-width bottom panel          ├── B1: Shared section renderers
└── A2: Assets tab (depends on 0.1)      └── B2: Refactor inspectors

Workstream C (Primitives)                Workstream F (Motion Type)
├── C1: Engine B-Rep primitive gen       └── F1: Proto + frontend
├── C2: Protocol wiring
├── C3: Frontend UI (depends on 0.1)     Workstream E (Collision)
└── C4: Parameter editing                ├── E1: Proto changes (per-geometry)
                                         ├── E2: Engine compile
Workstream D (Import Modes)              └── E3: Frontend UI
├── D1: Frontend import choice
├── D2: Engine bodyless import
├── D3: Make Body (depends on 0.3)
├── D4: Geometry re-parenting
└── D5: Context menus
```

**Parallel execution:**
- **0 must start first** — placement and transform are prerequisites for all creation workflows
- **A1, B1, F1 can start in parallel with 0** — no dependency on placement
- **A2, C3, D3 depend on Workstream 0** — they need placement (0.1) or multi-selection (0.3)
- **C1 (engine) can start immediately** — engine work has no frontend dependency
- **E depends on nothing** but is lower priority. Can start after A and B land.

**Suggested execution order:**

| Phase       | Workstreams                     | Rationale                                                                                                            |
| ----------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Phase 1** | 0.1 + 0.2 + A1 + B1 in parallel | Placement foundation + layout foundation + inspector foundation. 0.1/0.2 are viewport work; A1/B1 are pure frontend. |
| **Phase 2** | 0.3 + A2 + B2 + F1 in parallel  | Multi-selection, assets tab, inspector refactor, motion type. A2 depends on 0.1 (done in Phase 1).                   |
| **Phase 3** | C1 + D1 in parallel             | Engine primitive B-Rep generation + frontend import mode UI. Independent tracks.                                     |
| **Phase 4** | C2 + C3 + D2 + D3 + D4 + D5     | Wire primitives end-to-end + wire bodyless import + geometry re-parenting + context menus.                           |
| **Phase 5** | C4 + E1-E3                      | Primitive editing, collision authoring (per-geometry).                                                               |

---

## Files Summary

### New files

| File | Workstream | Purpose |
|------|------------|---------|
| `packages/frontend/src/components/AssetBrowser.tsx` | A2 | Asset browser component with asset library |
| `packages/frontend/src/components/BuildBottomPanel.tsx` | A2 | Bottom panel with Assets/Timeline tabs |
| `packages/frontend/src/components/inspector/sections/IdentitySection.tsx` | B1 | Shared identity section |
| `packages/frontend/src/components/inspector/sections/PoseSection.tsx` | B1 | Shared pose section |
| `packages/frontend/src/components/inspector/sections/SimulationValuesSection.tsx` | B1 | Shared simulation values with trace lookup |
| `packages/frontend/src/components/inspector/sections/MassSection.tsx` | B1 | Shared mass section |
| `packages/frontend/src/components/inspector/sections/CollisionSection.tsx` | E3 | Collision config section (per-geometry) |

### Modified files

| File | Workstreams | Changes |
|------|-------------|---------|
| `packages/ui/src/components/shell/app-shell.tsx` | A1 | Bottom dock positioning → full-width layout row |
| `packages/frontend/src/components/TimelinePanel.tsx` | A2 | Extract content, no longer owns dock |
| `packages/frontend/src/App.tsx` | A2, D1 | Wire BuildBottomPanel, import mode |
| `packages/frontend/src/stores/ui-layout.ts` | A2, D1 | bottomPanel* state (renamed from bottomDock*), import mode pref |
| `packages/frontend/src/stores/selection.ts` | 0.3 | Multi-selection support |
| `packages/frontend/src/stores/tool-mode.ts` | 0.2 | Transform tool modes |
| `packages/frontend/src/components/BodyInspector.tsx` | B2, F1 | Shared sections, motion type |
| `packages/frontend/src/components/DatumInspector.tsx` | B2 | Shared sections |
| `packages/frontend/src/components/JointInspector.tsx` | B2 | Shared sections |
| `packages/frontend/src/components/LoadInspector.tsx` | B2 | Shared sections |
| `packages/frontend/src/components/ActuatorInspector.tsx` | B2 | Shared sections |
| `packages/frontend/src/components/GeometryInspector.tsx` | B2, C4, E3 | Shared sections, primitive params, collision config |
| `packages/frontend/src/components/EntityInspector.tsx` | B2 | Update inspector router for shared section composition |
| `packages/frontend/src/components/ProjectTree.tsx` | C3, D3, D4, D5 | Primitive creation, Make Body, re-parenting, context menus |
| `packages/frontend/src/stores/mechanism.ts` | F1 | motionType on BodyState |
| `packages/protocol/src/transport.ts` | C2, D2, E1, F1 | New commands |
| `packages/frontend/src/engine/connection.ts` | C2, D2 | New event handlers |
| `packages/viewport/src/scene-graph-three.ts` | 0.2, E3 | Transform gizmo, collision wireframe overlay |
| `schemas/mechanism/mechanism.proto` | C1, E1, F1 | Primitives (B-Rep), collision (per-geometry), motion type |
| `schemas/protocol/transport.proto` | C1, D2, E1 | New commands |
| `native/engine/src/mechanism_state.cpp` | C1, D2, E2, F1 | Primitives, bodyless import, collision, motion type |

---

## Out of Scope

- Sensor entities — deferred to a separate epic after this work lands
- Custom user-defined entity types or plugin system
- Undo/redo (currently stubbed, separate effort — note: becomes more critical with new creation paths)
- Visual material overrides
- Contact material configuration
- Component origin offsets (URDF-style) — useful but not blocking any current workflow
- Drag-and-drop from asset browser to viewport (fast-follow after A2)
- Drag-and-drop re-parenting in the scene tree (fast-follow after D4)
- KINEMATIC motion type — deferred until a trajectory/keyframe system exists
- Marquee/box selection in viewport — Ctrl/Cmd+click is sufficient for first pass
- Viewport click-to-place (click a point in viewport to spawn entity there) — spawn-at-focus-point + gizmo is sufficient for first pass


## Page Feedback: /
**Viewport:** 1920×1080

### 1. <App> <FloatingDelayGroup> <HomeScreen> flex
**Location:** .flex > .flex > .flex > .flex-1
**Source:** @fs/home/saogregl/Dev/motionlab/packages/frontend/src/components/home/HomeScreen.tsx:43:23
**React:** <App> <FloatingDelayGroup> <HomeScreen>
**Feedback:** Black background doesn't really does it for me...

### 2. <App> <FloatingDelayGroup> <HomeScreen> <HomeProjectGrid> flex items
**Location:** div > .bg-layer-base > .group > .flex
**Source:** @fs/home/saogregl/Dev/motionlab/packages/frontend/src/components/home/HomeScreen.tsx:43:23
**React:** <App> <FloatingDelayGroup> <HomeScreen> <HomeProjectGrid>
**Feedback:** Need some sort of subtle border/separator in the bottom of the row, the table feels too "flat"

### 3. <App> <FloatingDelayGroup> <HomeScreen> <HomeSidebar> <Button> <Button> button "Open"
**Location:** .flex > .flex > .flex > .group/button
**Source:** @fs/home/saogregl/Dev/motionlab/packages/frontend/src/components/home/HomeScreen.tsx:43:23
**React:** <App> <FloatingDelayGroup> <HomeScreen> <HomeSidebar> <Button> <Button>
**Feedback:** WHy is this center aligned ffs

### 4. <MenuRoot> <FloatingTree> <DropdownMenuTrigger> <MenuTrigger> <Button> <Button> button "Create"
**Location:** .flex > .flex > .flex > #base-ui-_r_4_
**Source:** @fs/home/saogregl/Dev/motionlab/packages/frontend/src/components/home/HomeScreen.tsx:43:23
**React:** <MenuRoot> <FloatingTree> <DropdownMenuTrigger> <MenuTrigger> <Button> <Button>
**Feedback:** Why is this text black

### 5. 1 elements: button "Create a mechanismStart f"
**Location:** multi-select
**Source:** @fs/home/saogregl/Dev/motionlab/packages/frontend/src/components/home/CollapsibleSection.tsx:9:26
**Feedback:** Why is this ai slop blueish everywhere

### 6. <App> <FloatingDelayGroup> <HomeScreen> <HomeProjectGrid> flex justify
**Location:** .flex > .flex-1 > div > .flex
**Source:** @fs/home/saogregl/Dev/motionlab/packages/frontend/src/components/home/HomeScreen.tsx:43:23
**React:** <App> <FloatingDelayGroup> <HomeScreen> <HomeProjectGrid>
**Feedback:** What is this button

### 7. <App> <FloatingDelayGroup> <HomeScreen> <HomeProjectGrid> <CollapsibleSection> flex flex
**Location:** .flex-1 > div > .border-b > .flex
**Source:** @fs/home/saogregl/Dev/motionlab/packages/frontend/src/components/home/CollapsibleSection.tsx:9:26
**React:** <App> <FloatingDelayGroup> <HomeScreen> <HomeProjectGrid> <CollapsibleSection>
**Feedback:** Why the blueish gradient

### 8. <App> <FloatingDelayGroup> <HomeScreen> <HomeSidebar> flex overflow
**Location:** .flex > .flex > .flex > .flex-1
**Source:** @fs/home/saogregl/Dev/motionlab/packages/frontend/src/components/home/HomeScreen.tsx:43:23
**React:** <App> <FloatingDelayGroup> <HomeScreen> <HomeSidebar>
**Feedback:** Should add a subtle border to the right of the sidepanel...

### 9. 12 elements: button "Charts", button "Diagnostics", button [Collapse panel], button [Skip to start], button [Step back] +7 more
**Location:** multi-select
**Source:** @fs/home/saogregl/Dev/motionlab/packages/frontend/src/hooks/useTimelineTransport.ts:7:19
**Feedback:** The bottom panel should be floating like the other panels in the ui. Position it absolutely and make it spaced from other panels with --panel-float-inset (5px I believe)