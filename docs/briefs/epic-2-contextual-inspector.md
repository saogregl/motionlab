# Epic 2 — Contextual Right Panel + Tool Relocation

**Execution order: Depends on Epic 1 (floating shell primitives and token updates).**
**Can begin partially in parallel with late-stage Epic 1 work (Phase 2-B and 2-C are independent of P3/P4).**

---

## Mission

Make the right inspector panel **hidden by default** — it appears only when the user selects an entity that has inspectable properties. Simultaneously, relocate build tools out of the `SecondaryToolbar` row and into their natural homes: simulation controls in the titlebar, entity creation in the structure panel, and scene manipulation in viewport pill toolbars.

The user should no longer feel like the top bar is the command center. The command center is the **viewport**, the **structure panel**, and the **contextual inspector**.

---

## Figma reference

**File:** `EmRYNVBkG6E5eu4RGzrQqs`
**Node:** `6:26` ("Frame 5") — contains both left panel (`8:315`) and right panel (`8:436`)

The right panel in Figma shows a **Camera** entity selected, with sections:
- **Transform** (Pos / Rot / Scl — Vec3 inputs with colored X/Y/Z axis labels)
- **Camera** (Hide Skybox toggle, Projection dropdown, FOV slider with value display, Align View / To Camera buttons)
- **Animation** (Autoplay dropdown, animation track card with Easing/Play fields, dashed "+" add button)
- **Sticky footer:** "Add Component" button

These are **example sections** demonstrating the visual language. MotionLab's actual inspector sections (Mass, Inertia, Joint Limits, Load Vector, etc.) must adopt this same visual system.

---

## Current codebase state

### Right panel & inspector

| Component | File | Current behavior |
|---|---|---|
| `RightPanel` | `packages/ui/src/components/shell/right-panel.tsx` | Simple flex container, **always rendered**, visibility only via `react-resizable-panels` collapse |
| `EntityInspector` | `packages/frontend/src/components/EntityInspector.tsx` | Routes to correct inspector variant based on first selected entity type |
| `InspectorPanel` | `packages/ui/src/components/primitives/inspector-panel.tsx` | Header (entity name, type badge, icon) + `ScrollArea` body |
| `InspectorSection` | `packages/ui/src/components/primitives/inspector-section.tsx` | Collapsible section using `@base-ui/react/collapsible` |
| `PropertyRow` | `packages/ui/src/components/primitives/property-row.tsx` | Grid `[2fr_3fr_auto]`: label | value | unit+reset+warning |
| `Vec3Display` | `packages/ui/src/components/engineering/vec3-display.tsx` | 3-axis colored input (X=red, Y=green, Z=blue), editable mode |
| `QuatDisplay` | `packages/ui/src/components/engineering/quat-display.tsx` | Euler/Quaternion toggle display |
| `NumericInput` | `packages/ui/src/components/primitives/numeric-input.tsx` | Inline (inspector) and field (dialog) variants, spinner arrows on hover |

### Inspector variants

| Entity type | Inspector component | File | Sections |
|---|---|---|---|
| Body | `BodyInspector` | `packages/frontend/src/components/BodyInspector.tsx` | Identity, Mass Properties, Inertia Tensor, Current Pose |
| Geometry | `GeometryInspector` | `packages/frontend/src/components/GeometryInspector.tsx` | Identity, Local Pose, Computed Mass |
| Datum | `DatumInspector` | `packages/frontend/src/components/DatumInspector.tsx` | Identity, Local Pose |
| Joint | `JointInspector` | `packages/frontend/src/components/JointInspector.tsx` | Identity, Joint Type, Coordinate Frames, Limits, Actuator |
| Load | `LoadInspector` | `packages/frontend/src/components/LoadInspector.tsx` | Identity, Application Point, Force/Torque Vector or Spring-Damper params |
| Actuator | `ActuatorInspector` | `packages/frontend/src/components/ActuatorInspector.tsx` | Identity, Control Mode, Command, Effort Limit |
| (none) | `MechanismInspector` | `packages/frontend/src/components/MechanismInspector.tsx` | Ground body info, compilation diagnostics |

All inspectors append `SimulationMetadataSection` when `simState !== 'idle'`.

### Selection model

| Store | File | Key fields |
|---|---|---|
| `useSelectionStore` | `packages/frontend/src/stores/selection.ts` | `selectedIds: Set<string>`, `lastSelectedId`, `hoveredId`, `selectionFilter` |

Selection is local Zustand state — not sent to engine. The `EntityInspector` reads `selectedIds` and looks up the first ID in `useMechanismStore` maps to decide which variant to render.

### Toolbar & command system

| Component | File | Current role |
|---|---|---|
| `MainToolbar` | `packages/frontend/src/components/MainToolbar.tsx` | Everything: mode select, entity creation split buttons, sim controls, view dropdown, undo/redo |
| `SecondaryToolbar` | `packages/ui/src/components/shell/secondary-toolbar.tsx` | 32 px shell row hosting `MainToolbar` |
| `TopBar` | `packages/ui/src/components/shell/top-bar.tsx` | Project name, command search, file actions, engine status — **no sim controls currently** |
| `ViewportToolModeToolbar` | `packages/frontend/src/components/ViewportToolModeToolbar.tsx` | Already exists: floating pill with Select (V), Datum (D), Joint (J) mode buttons |

### Command definitions

| File | Commands |
|---|---|
| `packages/frontend/src/commands/definitions/simulate-commands.ts` | `sim.compile`, `sim.play`, `sim.pause`, `sim.step`, `sim.reset`, `sim.settings` |
| `packages/frontend/src/commands/definitions/create-commands.ts` | `create.body` (stub), `create.import`, `create.datum`, `create.joint.*`, `create.force.*`, `create.actuator.*` (stubs) |
| `packages/frontend/src/commands/definitions/view-commands.ts` | `view.select-mode`, `view.fit-all`, `view.gizmo-*`, `view.toggle-grid`, camera presets |

---

## Implementation scope

### A. Right panel contextual show/hide

**Goal:** Right panel is hidden by default; opens when an entity is selected; closes on deselection.

**P2-A-1: Wire visibility to selection**
- File: `packages/frontend/src/App.tsx`
- Derive `rightPanelOpen` from `useSelectionStore.selectedIds.size > 0`
- Pass to `FloatingPanel` (from Epic 1) as `open` prop
- When selection clears → panel slides out
- When entity selected → panel slides in showing the correct inspector

**P2-A-2: Deselection behavior**
- Clicking empty viewport → clears selection → panel hides
- Pressing `Escape` while in select mode → clears selection → panel hides
- The `MechanismInspector` (ground body overview) is **no longer shown by default** — only when explicitly selected in the tree

**P2-A-3: Panel memory**
- If user manually closes panel with `]`, it stays closed even on next selection
- Subsequent `]` press re-enables auto-show behavior
- Store state: `rightPanelAutoShow: boolean` in `useUILayoutStore`

### B. Inspector restyling

**Goal:** Match the Figma visual language for inspector sections. Use the same primitives from Epic 1.

**P2-B-1: Inspector panel header**
- File: `packages/ui/src/components/primitives/inspector-panel.tsx`
- Match Figma `8:437` ("Panel Header"):
  - Entity name in `font-weight: 700; font-size: 13px; color: var(--text-primary)` (e.g., "Camera")
  - Three-dot menu icon (`MoreVertical`) on the right
  - `height: 44px; padding: 0 8px` (left) `0 16px` (right)
  - `border-bottom: 1px solid var(--border-default)`

**P2-B-2: Section cards**
- Already restyled in Epic 1 P1-C — the `InspectorSection` uses `--layer-recessed` bg, small caret, bold 11 px title
- Each section renders inside these cards with `gap: 5px` between sections (from Figma `8:449`)
- Sections: `padding: 7px`; inner content: `padding: 0 2px`

**P2-B-3: Property rows**
- File: `packages/ui/src/components/primitives/property-row.tsx`
- Update to match Figma row layout:
  - Label: `font-weight: 500; font-size: 10px; text-transform: uppercase; color: var(--text-secondary)` (from Figma `8:459` "Pos" label)
  - Value column: `flex: 1`; inputs at `height: 24px` with `background: var(--layer-raised); border-radius: 4px`
  - No explicit unit column in the Figma design — units are contextual

**P2-B-4: Vec3 inputs**
- File: `packages/ui/src/components/engineering/vec3-display.tsx`
- Match Figma `8:460` — three equal-width input boxes with:
  - Axis letter label (X/Y/Z) on the left of each box, `font-weight: 700; font-size: 9px`
  - X: `color: var(--axis-x)` (`#ff716c`); Y: `var(--axis-y)` (`#4ade80`); Z: `var(--axis-z)` (`#007aff`)
  - Value right-aligned inside each box, `font-size: 11px; color: var(--text-primary)`
  - Background: `var(--layer-raised)` (`#252626`); `border-radius: 4px`
  - `gap: 4px` between the three boxes

**P2-B-5: Dropdown selects**
- Match Figma `8:537` (Projection dropdown): `height: 28px; background: var(--layer-raised); border-radius: 4px; padding: 4px 8px`
- Small caret on the right, `color: var(--text-primary)` for selected value

**P2-B-6: Toggle switch**
- Match Figma `8:533` (Hide Skybox toggle): `width: 28px; height: 14px; border-radius: 9999px; background: var(--layer-raised)`
- Thumb: `10px` circle, `background: var(--text-secondary)` when off, `var(--accent-primary)` when on

**P2-B-7: Slider** (new primitive)
- Match Figma `8:548` (FOV slider): `height: 4px; background: var(--layer-raised); border-radius: 9999px`
- Fill: `background: var(--accent-primary)` (`#007aff`)
- Thumb: `10px` circle, `background: white`, subtle shadow
- Label: left-aligned, value: right-aligned above the track
- File: create `packages/ui/src/components/primitives/slider.tsx`

**P2-B-8: Sticky footer action**
- Match Figma `8:595`: full-width button at panel bottom
- `background: var(--layer-raised); border: 1px solid var(--border-strong); border-radius: 4px; height: 32px`
- Centered text + icon: `font-weight: 700; font-size: 12px; color: var(--text-primary)`
- Sticky: `position: sticky; bottom: 0` or placed outside the `ScrollArea`

**P2-B-9: Dashed "add" button**
- Match Figma `8:592`: `border: 1px dashed rgba(172,171,171,0.2); background: rgba(37,38,38,0.3); border-radius: 4px`
- Centered `+` icon, `size: 8px`

### C. Tool relocation

**P2-C-1: Simulation controls → titlebar right side**
- File: `packages/ui/src/components/shell/top-bar.tsx`
- Add a `transportControls` slot to `TopBar` props
- Render: Compile | Play/Pause | Step | Reset — compact icon buttons with tooltips
- File: `packages/frontend/src/App.tsx` — wire sim commands to new slot
- Use existing `ToolbarButton` primitive

**P2-C-2: Entity creation → structure panel**
- File: `packages/ui/src/components/shell/left-panel.tsx`
- The existing `+` button (add button next to search) becomes the primary creation entry point
- On click: show a floating searchable menu (similar to command palette pattern) with:
  - Create Body
  - Import Geometry
  - Create Datum (from face)
  - Create Joint (Revolute, Prismatic, Fixed, …)
  - Create Force (Point Force, Point Torque, Spring-Damper)
- Use `DropdownMenu` or `Popover` from `packages/ui/src/components/ui/`
- Wire to existing command definitions in `create-commands.ts`

**P2-C-3: Viewport toolbar enrichment**
- File: `packages/frontend/src/components/ViewportToolModeToolbar.tsx`
- Add gizmo mode buttons: Translate (W), Rotate (E), Off (Q)
- Currently these are only keyboard shortcuts — give them visible buttons in the pill toolbar
- Keep existing Select/Datum/Joint buttons

**P2-C-4: Remove `SecondaryToolbar` row**
- File: `packages/ui/src/components/shell/app-shell.tsx`
- Remove the `SecondaryToolbar` row from `AppShell` entirely (Epic 1 already removed the docked layout)
- All its contents have been relocated to titlebar (sim), structure panel (create), viewport toolbar (modes)
- The `SecondaryToolbar` component file can be deleted

---

## Task dependency graph

```
Epic 1 (complete)
  │
  ├─── P2-A-1: Wire right panel visibility to selection ─── P2-A-2: Deselection behavior ─── P2-A-3: Panel memory
  │
  ├─── P2-B-1 through P2-B-9 (all parallel — independent visual updates)
  │    ├── P2-B-1: Inspector panel header
  │    ├── P2-B-2: Section cards (mostly done in Epic 1)
  │    ├── P2-B-3: Property rows
  │    ├── P2-B-4: Vec3 inputs
  │    ├── P2-B-5: Dropdown selects
  │    ├── P2-B-6: Toggle switch
  │    ├── P2-B-7: Slider (NEW primitive)
  │    ├── P2-B-8: Sticky footer action
  │    └── P2-B-9: Dashed add button
  │
  └─── P2-C-1 through P2-C-4 (parallel with B, sequential within C)
       ├── P2-C-1: Sim controls → titlebar
       ├── P2-C-2: Entity creation → structure panel (parallel with C-1)
       ├── P2-C-3: Viewport toolbar enrichment (parallel with C-1, C-2)
       └── P2-C-4: Remove SecondaryToolbar row (after C-1, C-2, C-3)
```

**Maximum parallelism:** Run A-1, all B-* tasks, and C-1/C-2/C-3 concurrently. Only A-2→A-3 and C-4 are sequential.

---

## Acceptance criteria

- [ ] Right panel is **hidden** on app open / empty selection
- [ ] Selecting an entity in the tree or viewport opens the contextual inspector with slide animation
- [ ] Deselecting (click empty viewport, Escape) closes the inspector
- [ ] `]` key manually overrides auto-show behavior
- [ ] Inspector sections match Figma visual language: `#191a1a` card bg, small caret, bold 11 px titles
- [ ] Vec3 inputs show colored axis labels (X red, Y green, Z blue) at 9 px bold
- [ ] All numeric inputs are `24px` height with `#252626` background
- [ ] A `Slider` primitive exists and renders correctly (for FOV and future use)
- [ ] Sticky "Add Component" footer button renders at panel bottom
- [ ] Simulation controls (Compile, Play/Pause, Step, Reset) are in the titlebar right side
- [ ] Entity creation flows are accessible from the structure panel `+` button
- [ ] Viewport pill toolbar includes gizmo mode buttons (Translate, Rotate, Off)
- [ ] `SecondaryToolbar` row is removed in floating layout mode
- [ ] All keyboard shortcuts still work (`Space` for play/pause, `B/D/J/L` for creation, `W/E/Q` for gizmo)
- [ ] Command palette still lists all commands

---

## Out of scope

- Results route (Epic 3)
- Entity→component data model (Epic 4)
- Deep redesign of study settings
- Sensor inspector (no sensor entities yet)
- Inspector for multi-selection (show shared properties)

---

## File checklist

| Action | File |
|---|---|
| **Create** | `packages/ui/src/components/primitives/slider.tsx` |
| **Create** | `packages/ui/src/components/primitives/slider.stories.tsx` |
| **Modify** | `packages/frontend/src/App.tsx` (right panel visibility wiring, sim controls slot) |
| **Modify** | `packages/ui/src/components/shell/right-panel.tsx` (remove if using FloatingPanel directly) |
| **Modify** | `packages/ui/src/components/primitives/inspector-panel.tsx` (header restyle) |
| **Modify** | `packages/ui/src/components/primitives/property-row.tsx` (row layout restyle) |
| **Modify** | `packages/ui/src/components/engineering/vec3-display.tsx` (axis label restyle) |
| **Modify** | `packages/ui/src/components/primitives/numeric-input.tsx` (height, bg) |
| **Modify** | `packages/ui/src/components/ui/switch.tsx` (sizing, colors) |
| **Modify** | `packages/ui/src/components/ui/select.tsx` (dropdown restyle) |
| **Modify** | `packages/ui/src/components/shell/top-bar.tsx` (add transport controls slot) |
| **Modify** | `packages/ui/src/components/shell/left-panel.tsx` (add creation menu to + button) |
| **Modify** | `packages/frontend/src/components/ViewportToolModeToolbar.tsx` (add gizmo buttons) |
| **Modify** | `packages/ui/src/components/shell/app-shell.tsx` (remove SecondaryToolbar slot) |
| **Delete** | `packages/ui/src/components/shell/secondary-toolbar.tsx` (no longer needed) |
| **Modify** | `packages/frontend/src/stores/ui-layout.ts` (rightPanelAutoShow flag) |
| **Modify** | `packages/frontend/src/components/BodyInspector.tsx` (section restyle) |
| **Modify** | `packages/frontend/src/components/JointInspector.tsx` (section restyle) |
| **Modify** | `packages/frontend/src/components/DatumInspector.tsx` (section restyle) |
| **Modify** | `packages/frontend/src/components/LoadInspector.tsx` (section restyle) |
| **Modify** | `packages/frontend/src/components/ActuatorInspector.tsx` (section restyle) |
| **Modify** | `packages/frontend/src/components/GeometryInspector.tsx` (section restyle) |
| **Modify** | `packages/ui/src/index.ts` (export Slider) |
