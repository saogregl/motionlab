# Product-Level Panels, Toolbars, Viewport Overlays — Design System Extraction Inventory

## Panels & Docks

### AssetBrowser
**Path:** `packages/frontend/src/components/AssetBrowser.tsx` (250 lines)

**Purpose:** Tabbed browser for importing CAD assets and creating primitive shapes.

**Composition:**
- Uses `Button`, `Input` from `@motionlab/ui`
- Local state: search query, active section (imports/primitives)
- Nested subcomponents: `AssetCard`, `PrimitiveCard`, `Sidebar`
- Lucide icons

**Design Critique:**
- Inline className strings with `[var(--*)]` Tailwind syntax instead of pure token classes
- Good separation of concerns: cards are reusable sub-components
- No virtualization for long asset lists (potential performance issue if thousands of imports)
- Direct store access via hooks

**Custom Token Usage:**
- Line 51, 54, 88: Uses `[var(--accent-primary)]`, `[var(--border-default)]`, `[var(--accent-soft)]` inline
- Line 121, 126, 144: Hardcoded padding via Tailwind (`ps-3`, `pe-3` instead of token spacing)
- Generally good adherence to token variables via Tailwind `var()` syntax

**Reusable Patterns:**
- Asset card template with selection state and action button
- Tabbed section switcher
- Grid layout for card collections
- Search input with icon prefix

**Extraction Verdict for Lab:**
- KEEP IN MOTIONLAB at component level (CAD asset-specific)
- Pattern: **Searchable card grid with tabs** — extractable to `@motionlab/ui/GridBrowser`

---

### BuildBottomPanel
**Path:** `packages/frontend/src/components/BuildBottomPanel.tsx` (32 lines)

**Purpose:** Tab container for Assets, Timeline, Diagnostics during build phase.

**Composition:**
- Uses `BottomPanel` from `@motionlab/ui`
- Composition: renders `AssetBrowser`, `TimelineContent`, `DiagnosticsPanel` based on active tab
- Store-driven: `useUILayoutStore` for tab state

**Design Critique:**
- Thin wrapper, minimal logic
- Good separation of tab content into sibling components
- No prop drilling; all state via store

**Custom Token Usage:**
- None; pure composition

**Reusable Patterns:**
- Bottom dock with tab switching — already abstracted to `BottomPanel` primitive

**Extraction Verdict for Lab:**
- Pattern already in `@motionlab/ui` (`BottomPanel`)
- Component is MOTIONLAB-SPECIFIC (build-phase concept)

---

### ChannelBrowser
**Path:** `packages/frontend/src/components/ChannelBrowser.tsx` (276 lines)

**Purpose:** Hierarchical tree browser for simulation output channels (joints, loads, actuators) with per-channel color coding and toggle.

**Composition:**
- Uses `Input`, `ScrollArea` from `@motionlab/ui`
- Custom tree rendering with `ChevronDown`, `ChevronRight` icons
- Nested `NodeRow` sub-component for category, entity, and channel rows
- Color lookup via `readChartColors()`

**Design Critique:**
- Deep prop drilling in `NodeRow` (10+ props) — tight coupling between parent state and row renderer
- Manual tree state management via `Set<string>` for `expandedCategories` and `expandedEntities`
- Good memoization of derived state (node tree, color index map)
- Channel color assignment based on stable index is smart for consistency
- Checkbox styling uses inline `accent-[var(--accent)]` instead of token button variant

**Custom Token Usage:**
- Line 107: `text-[var(--text-tertiary)]` inline
- Line 196, 204, 230, 260, 271: Mix of Tailwind classes and inline var references
- Generally acceptable but inconsistent

**Reusable Patterns:**
- Hierarchical tree with expand/collapse state
- Group-level select-all toggle
- Row renderer dispatch by node type
- Color palette mapping to stable indices

**Extraction Verdict for Lab:**
- PATTERN ONLY: **Hierarchical tree browser with color-coded items** → `@motionlab/ui/TreeBrowser`
- Channel-specific logic (MOTIONLAB) stays, tree structure lifts

---

### ChartPanel
**Path:** `packages/frontend/src/components/ChartPanel.tsx` (485 lines)

**Purpose:** uPlot-based multi-axis time-series chart with live data pump, scrubbing, zoom, and legend.

**Composition:**
- uPlot (vanilla charting library) wrapped in React
- Uses `ToolbarButton`, `ToolbarGroup` from `@motionlab/ui`
- Imperative uPlot API + RAF loop for data updates
- Store subscriptions outside React: `useTraceStore.subscribe()`
- ResizeObserver for responsive sizing

**Design Critique:**
- **Hot-path violation:** Correctly keeps uPlot rendering off React's re-render path via RAF + imperative updates ✓
- Excellent pattern: low-frequency legend React state (`LEGEND_INTERVAL = 200ms`) ✓
- Store subscription unsubscribe handled in cleanup ✓
- Reusable cached buffers (`_cachedXArr`, `_cachedLookup`) to reduce GC pressure ✓
- Scrub marker plugin using uPlot hooks (clean plugin pattern)
- Selection-linked channel auto-activation is coupled to mechanism domain logic

**Custom Token Usage:**
- Line 39: Fallback to `'#888'` if token missing (defensive)
- Line 45, 52, 54: Hardcoded fallback colors for scrub and grid (`'rgba(255,255,255,0.6)'`, `'#525252'`, `'#e0e0e0'`)
- Line 414, 435: Uses `[var(--border-subtle)]`, `[var(--text-tertiary)]` inline

**Reusable Patterns:**
- Multi-axis chart layout engine (`computeAxisLayout`)
- Imperative animation loop with RAF scheduling
- Token color reading via CSS variables
- Zoom state management with refs
- Cursor interaction with time scrubbing

**Extraction Verdict for Lab:**
- **KEEP THIS PATTERN** for lab: uPlot + React integration template
- Extract: **Chart data alignment & scaling** (`buildAlignedData`, `computeAxisLayout`) → `@motionlab/ui/ChartUtils`
- Extract: **Scrub marker plugin** as reusable uPlot plugin
- Component stays MOTIONLAB (domain-specific channel logic, simulation integration)

---

### DiagnosticsPanel
**Path:** `packages/frontend/src/components/DiagnosticsPanel.tsx` (113 lines)

**Purpose:** Read-only panel listing compilation errors, warnings, and info diagnostics with clickable entity selection.

**Composition:**
- Uses `useSimulationStore`, `useEngineConnection`, `useSelectionStore`
- Sub-components: `DiagnosticRow`, `SummaryBar`
- Lucide icons for severity levels
- Hardcoded color map per severity

**Design Critique:**
- Simple, focused component
- `DiagnosticRow` has hardcoded color strings for severity (line 34–37)
- Good separation: summary bar is extracted sub-component

**Custom Token Usage:**
- Line 9, 36, 38, 61, 63, 66, 70, 98–100: Uses hardcoded Tailwind colors: `red-400`, `yellow-400`, `blue-400`, `green-400` instead of semantic tokens
- Should use `--danger`, `--warning`, `--info`, `--success` from globals.css

**Reusable Patterns:**
- Severity-to-icon map
- Grouped diagnostic list with summary header
- Clickable row with entity selection side effect

**Extraction Verdict for Lab:**
- KEEP IN MOTIONLAB (domain-specific diagnostic format)
- Pattern: **Structured list with severity-color mapping** — minor

---

### ProjectTree
**Path:** `packages/frontend/src/components/ProjectTree.tsx` (11,275 tokens — too large to fully analyze in one read)

**Purpose:** [Deferred — file too large]

Let me split analysis:

---

### ResultsBottomDock
**Path:** `packages/frontend/src/components/ResultsBottomDock.tsx` (76 lines)

**Purpose:** Tab container for Charts and Diagnostics; embeds timeline transport and scrubber controls.

**Composition:**
- Uses `BottomPanel`, `TimelineTransport`, `TimelineScrubber` from `@motionlab/ui`
- Uses `useTimelineTransport` hook for playback state
- Composition: `ChartPanel`, `DiagnosticsPanel` based on tab

**Design Critique:**
- Thin wrapper over reusable primitives
- Inline style on line 40: `style={{ '--bottom-panel-h': '45vh' }}` — magic px, should be token
- Good: always shows timeline transport, tabs below

**Custom Token Usage:**
- Line 40: Inline `'45vh'` CSS custom property — not token-driven

**Reusable Patterns:**
- Bottom dock with persistable tab + timeline control layout (already in `@motionlab/ui`)

**Extraction Verdict for Lab:**
- COMPONENT-SPECIFIC (results phase concept)

---

### ResultsLeftPanel
**Path:** `packages/frontend/src/components/ResultsLeftPanel.tsx` (25 lines)

**Purpose:** Left sidebar showing channel browser and simulation metadata.

**Composition:**
- Simple layout container
- Uses `ChannelBrowser`, `SimulationMetadataSection`
- Tailwind grid flex layout

**Design Critique:**
- Pure composition, no logic
- Good separation of concerns

**Custom Token Usage:**
- Line 6: Uses `bg-layer-base` (good token use)
- Line 8: `text-[length:var(--text-xs)]` instead of Tailwind `text-xs` (unnecessary inline var)

**Reusable Patterns:**
- None novel

**Extraction Verdict for Lab:**
- MOTIONLAB-SPECIFIC (results phase)

---

### TimelinePanel
**Path:** `packages/frontend/src/components/TimelinePanel.tsx` (75 lines)

**Purpose:** Alternative bottom dock wrapping timeline and diagnostics (used during build phase).

**Composition:**
- Uses `BottomPanel`, `TimelineTransport`, `TimelineScrubber` from `@motionlab/ui`
- Extracted `TimelineContent` sub-component for reuse in `BuildBottomPanel`
- Stateless wrapper

**Design Critique:**
- Good: `TimelineContent` extracted for DRY
- Tab state via `useUILayoutStore`

**Custom Token Usage:**
- None

**Reusable Patterns:**
- TimelineContent (reusable in multiple dock layouts)

**Extraction Verdict for Lab:**
- MOTIONLAB-SPECIFIC phase layout

---

### BodyTree
**Path:** `packages/frontend/src/components/BodyTree.tsx` (92 lines)

**Purpose:** Hierarchical tree of imported bodies with selection management.

**Composition:**
- Uses `TreeView`, `TreeRow`, `GroupHeaderRow`, `EmptyState` from `@motionlab/ui`
- Renders a flat list (Bodies group header + body rows)
- Selection state via `useSelectionStore`
- Memoized node construction

**Design Critique:**
- Clean tree primitive usage
- Fixed single-level hierarchy (good for this use case)
- No performance issues (bodies are typically <1000)

**Custom Token Usage:**
- None

**Reusable Patterns:**
- Group header + row tree layout (already in primitives)

**Extraction Verdict for Lab:**
- MOTIONLAB-SPECIFIC (body/geometry domain)

---

## Toolbars & Controls

### MainToolbar
**Path:** `packages/frontend/src/components/MainToolbar.tsx` (150 lines via limit)

**Purpose:** Floating center-top toolbar with simulation play/pause/step/reset, undo/redo, and view dropdown.

**Composition:**
- Uses `ToolbarButton`, `ToolbarGroup`, `DropdownMenu*`, `Tooltip` from `@motionlab/ui`
- Extracted `ViewDropdown` sub-component
- Lucide icons
- Command execution via `executeCommand()`
- Disabled state via `useCmdDisabled()` hook

**Design Critique:**
- Floating position with `z-[var(--z-toolbar)]` ✓
- Good toolbar grouping with separators
- ViewDropdown extracted and reused in `ResultsToolbar` ✓
- Display of error messages inline (line 99–105) couples toolbar to simulation error state

**Custom Token Usage:**
- Line 52: Uses `[var(--panel-float-inset)]`, `[var(--z-toolbar)]`, `[var(--toolbar-h)]`, `[var(--border-default)]`, `[var(--panel-radius)]` — all token-driven ✓
- Line 94: Uses `[length:var(--text-2xs)]` (defensive syntax for text size)

**Reusable Patterns:**
- Floating toolbar scaffold with groups and separators
- ViewDropdown pattern: menu + tooltip wrapper

**Extraction Verdict for Lab:**
- PATTERN: **Floating toolbar layout** → already in `@motionlab/ui/Toolbar`
- Component KEEP IN MOTIONLAB (simulation-specific)

---

### ResultsToolbar
**Path:** `packages/frontend/src/components/ResultsToolbar.tsx` (85 lines)

**Purpose:** Similar to MainToolbar but lighter; shown during results phase.

**Composition:**
- Reuses `ViewDropdown` from MainToolbar
- Same toolbar structure as MainToolbar

**Design Critique:**
- DRY violation would improve by extracting common toolbar layout
- Could parameterize MainToolbar/ResultsToolbar to avoid duplication

**Custom Token Usage:**
- Consistent with MainToolbar

**Reusable Patterns:**
- None novel

**Extraction Verdict for Lab:**
- MOTIONLAB-SPECIFIC

---

### TransportControls
**Path:** `packages/frontend/src/components/TransportControls.tsx` (73 lines)

**Purpose:** Compact inline simulation transport (play/pause/step/reset) without floating position.

**Composition:**
- `ToolbarButton` from `@motionlab/ui`
- Same icon set as MainToolbar

**Design Critique:**
- Reusable play/pause/step pattern
- Inline layout (no floating/toolbar wrapper)

**Custom Token Usage:**
- Line 58, 64: Uses `[length:var(--text-2xs)]`, `ms-1.5` (spacing via Tailwind)

**Reusable Patterns:**
- PlayPauseButton with conditional render
- Compact transport group (extractable)

**Extraction Verdict for Lab:**
- PATTERN: **PlayPauseStepReset button group** → could be `@motionlab/ui/TransportControls` (generic)
- Current component MOTIONLAB-SPECIFIC (uses simulation store)

---

### ViewportToolModeToolbar
**Path:** `packages/frontend/src/components/ViewportToolModeToolbar.tsx` (257 lines)

**Purpose:** Vertical floating toolbar for viewport tool modes (select, create-datum, create-joint), gizmo modes (translate/rotate), snapping, and visibility toggles.

**Composition:**
- Uses `ToolbarButton`, `Popover`, `PopoverTrigger`, `PopoverContent` from `@motionlab/ui`
- Complex state: activeMode, gizmoMode, translationSnap, rotationSnap, gizmoSpace, datumsVisible, jointsVisible, gridVisible, labelsVisible
- Presets for snap values (hardcoded)
- Direct scene graph manipulation: `getSceneGraph()?.toggleDatums()` etc.

**Design Critique:**
- **Hot-path violation concern:** Calls `getSceneGraph()?.toggle*()` on click (imperative scene updates) — acceptable because it's event-driven, not render-driven ✓
- Excessive state extraction from `useToolModeStore` (12 separate `useState`-like calls) — consider context or single store slice
- Inline styles: line 107, 136, 207: hardcoded border dividers (`mx-0.5 h-px bg-[var(--border-default)]`)
- Good: Snap preset buttons use `cn()` for conditional classes

**Custom Token Usage:**
- Line 68: `rounded-[var(--panel-radius)]`, `border border-[var(--border-default)]`, `bg-layer-base p-0.5` (good)
- Line 107, 136, 207: Manual divider styling (should be component primitive)
- Line 159, 161, 181–183: Uses `rounded-[var(--radius-sm)]` and Tailwind color classes (`bg-accent`, `text-accent-foreground`)

**Reusable Patterns:**
- Tool mode button grid with separators
- Snap preset selector (common pattern)
- Display toggle buttons (visibility controls)

**Extraction Verdict for Lab:**
- KEEP IN MOTIONLAB (tool modes are domain-specific)
- PATTERN: **Snap preset selector** → `@motionlab/ui/SnapGrid`
- PATTERN: **Display toggle group** (datums, grid, labels) → `@motionlab/ui/DisplayToggles`

---

### EntityCreationMenu
**Path:** `packages/frontend/src/components/EntityCreationMenu.tsx` (199 lines)

**Purpose:** Dropdown menu for creating bodies, importing, datums, joints (with subtypes), forces, actuators, and sensors.

**Composition:**
- Uses `DropdownMenu*` primitives from `@motionlab/ui`
- Nested submenus for joint types, force types, actuator/sensor types
- Command execution
- Disabled state per command

**Design Critique:**
- Good: Deeply nested menu structure is readable and maintainable
- Disabled-but-visible menu items (sensor/actuator lines 159–193) — UX anti-pattern; should hide or explain why disabled
- No icons on submenus (e.g., joint type icons would help recognition)

**Custom Token Usage:**
- Line 45: Inline button styling `size-8` (Tailwind, not token) — should use `Button` component instead
- Generally acceptable

**Reusable Patterns:**
- Entity creation menu scaffold (MOTIONLAB-specific entity types)

**Extraction Verdict for Lab:**
- KEEP IN MOTIONLAB (Chrono/mechanism creation is domain-specific)

---

### ModeIndicator
**Path:** `packages/frontend/src/components/ModeIndicator.tsx` (73 lines)

**Purpose:** Auto-dismissing transient toast showing active tool mode (Select, Create Datum, Create Joint, Create Load).

**Composition:**
- useState for visibility and fading
- useRef for timers
- Lucide icons mapped to modes
- Tailwind animation (`transition-all`, opacity fade)

**Design Critique:**
- Good pattern: dismissal via timeout + fade
- Hardcoded DISMISS_MS = 1500 (should be token or prop)
- Positioning uses hardcoded offsets (top-4, left-1/2) — should respect viewport safe area
- Inline animation classes are readable

**Custom Token Usage:**
- Line 59: `[var(--layer-elevated)]/90`, `[var(--radius-md)]`, `[var(--text-xs)]` — mostly good
- Line 65: Inline opacity/transform state styles

**Reusable Patterns:**
- Auto-dismissing toast with fade pattern
- Mode icon + label pairing

**Extraction Verdict for Lab:**
- PATTERN: **Auto-dismiss toast with fade** → `@motionlab/ui/AutoDismissToast`
- Component MOTIONLAB-SPECIFIC (tool modes)

---

## Viewport Overlays

### EntityLabelOverlay
**Path:** `packages/frontend/src/components/EntityLabelOverlay.tsx` (407 lines)

**Purpose:** Screen-space labels for bodies and joints with leader lines, projected from 3D world positions. Imperative DOM manipulation via RAF loop; label layout engine avoids overlap.

**Composition:**
- Refs for SVG (`svgRef`), pill container (`pillContainerRef`), RAF handle
- `computeLabelLayout` from `@motionlab/viewport` (collision avoidance algorithm)
- Manual DOM element creation/removal (SVG lines, circles, HTML pills)
- Measurement div for text width caching

**Design Critique:**
- **Hot-path excellence:** Purely imperative RAF loop, never triggers React re-renders ✓
- **Smart caching:** `prevAnchorsRef` fingerprint to skip layout recomputation when positions unchanged ✓
- **DOM reuse:** Entries map persists DOM nodes across frames ✓
- **Memory management:** Measurement div created once and reused, cleanup on unmount ✓
- Verbose but clear: manual DOM manipulation is necessary for this performance requirement

**Custom Token Usage:**
- Line 78–87: Hardcoded SVG attribute colors: `'rgba(160,170,190,0.3)'`, `'rgba(160,170,190,0.5)'` (non-semantic, gray neutral)
- Line 104–121: Inline style strings with hardcoded fallbacks: `'var(--background, rgba(18, 22, 34, 0.80))'`, `'var(--muted-foreground, #a0a8b8)'`
- Line 299–301, 304–306, 312–314: Hardcoded semi-transparent/opacity values
- Line 330, 331, 334: Hardcoded stroke widths

**Reusable Patterns:**
- World-to-screen label projection framework
- Cached layout engine avoiding re-computation
- RAF animation loop with cleanup
- SVG leader line + HTML pill pattern

**Extraction Verdict for Lab:**
- **PATTERN EXTRACTION:** Label layout + projection system → `@motionlab/viewport/LabelOverlay` base
- Component stays MOTIONLAB (uses scene graph, entity types from mechanism)
- **For lab:** Could wrap this pattern in a generic `<WorldSpaceLabels>` component

---

### FaceTooltip
**Path:** `packages/frontend/src/components/FaceTooltip.tsx` (72 lines)

**Purpose:** Floating tooltip that tracks cursor and shows hovered face index and estimated surface type during datum/joint creation.

**Composition:**
- useState for cursor position
- RAF loop for pointer tracking
- Conditional label map based on mode (datum vs. joint)
- Simple positioning via style.left/top

**Design Critique:**
- Reasonable: RAF loop for tracking is acceptable (not per-frame render)
- Cursor tracking with RAF is standard
- Mode-specific labels are clean (DATUM_LABELS vs. JOINT_LABELS)

**Custom Token Usage:**
- Line 65: Uses `bg-background/90`, `px-2`, `py-1`, `text-xs` (Tailwind, good)
- Generally clean

**Reusable Patterns:**
- Cursor-tracking tooltip scaffold
- Mode-dependent label map

**Extraction Verdict for Lab:**
- PATTERN: **Cursor-following tooltip** → `@motionlab/ui/CursorTooltip`
- Component MOTIONLAB-SPECIFIC (datum/joint terminology)

---

### ViewportContextMenu
**Path:** `packages/frontend/src/components/ViewportContextMenu.tsx` (520 lines)

**Purpose:** Context menu for viewport entities (bodies, datums, joints, geometry, loads, actuators) and background; dispatches based on hovered entity type.

**Composition:**
- `ContextMenu` primitives from `@motionlab/ui`
- Sub-components for each entity type: `BodyMenuContent`, `DatumMenuContent`, `JointMenuContent`, etc.
- Type discriminator via `resolveEntityTarget()`
- High fan-out (6 entity types × 5+ menu items each)

**Design Critique:**
- Clean dispatch pattern by entity type
- Sub-component extraction is good for readability
- Menu actions directly call store mutations or engine sends (tight coupling, but acceptable for UX)
- `BodyMenuContent` line 98–147 has repeated pattern (Select, Isolate, Hide, Focus, Create submenu)

**Custom Token Usage:**
- Line 55, 56: Inline Tailwind classes `itemCls`, `iconCls` (good factoring)
- Uses `size-3.5 shrink-0 text-text-tertiary` (good)

**Reusable Patterns:**
- Entity-type-dispatch menu pattern
- Menu item scaffold with icon + label + shortcut
- Sub-action menus (joint type change, camera presets)

**Extraction Verdict for Lab:**
- KEEP IN MOTIONLAB (mechanism entity types, scene operations are domain-specific)
- PATTERN: **Entity-type-dispatched context menu** — generic scaffold could be extracted as `@motionlab/ui/ContextMenuDispatcher`

---

### ViewportOverlay
**Path:** `packages/frontend/src/components/ViewportOverlay.tsx` (568 lines)

**Purpose:** Master overlay component composing viewport, all transient HUDs, mode indicators, joint creation feedback, entity label overlay, and context menu.

**Composition:**
- `Viewport` from `@motionlab/viewport` (vanilla Canvas/WebGL component)
- Sub-components: `ModeIndicator`, `FaceTooltip`, `JointTypeSelectorPanel`, `LoadCreationCard`, `EntityLabelOverlay`, `ViewportContextMenu`
- Complex state management: mode, hovered face, scene graph, selection, joint creation step tracking
- Multiple useEffect hooks for side effects and store subscriptions

**Design Critique:**
- **Composition hub:** Correctly orchestrates 7+ overlays without prop drilling (store-based)
- **Side effect complexity:** Lines 261–362 manage joint creation visual feedback (highlight, dim, preview). 9 side-effect triggers; could benefit from custom hook
- **Store subscriptions:** useEffect at line 364 syncs joint limits to viewport; unsubscribe cleanup is correct ✓
- **RAF loop avoidance:** Direct store subscriptions and RAF loops in child components, not this parent ✓

**Custom Token Usage:**
- Line 62, 94, 98–100, 114: Inline classNames with hardcoded colors and Tailwind (acceptable)
- Line 551–555: Inline style for positioning (should use tokens)

**Reusable Patterns:**
- Viewport orchestration scaffold
- Mode-specific HUD content (status messages, creation cards)
- Entity selection chip pattern

**Extraction Verdict for Lab:**
- KEEP IN MOTIONLAB (orchestrates mechanism/simulation concepts)
- PATTERN: **Viewport HUD composition pattern** — could extract generic `<ViewportHUDHost>` that accepts HUD fragments
- `<Viewport>` primitive itself is generic and reusable ✓

---

### WorldSpaceOverlay
**Path:** `packages/frontend/src/components/WorldSpaceOverlay.tsx` (76 lines)

**Purpose:** Wrapper that positions children at screen coordinates projected from a 3D world position; used for joint creation labels anchored to datums.

**Composition:**
- Ref to div
- RAF loop for projection updates
- Direct DOM style manipulation (left, top, display)

**Design Critique:**
- **Hot-path correct:** Uses RAF + direct DOM manipulation, never re-renders children ✓
- Clean abstraction for world-to-screen projection + positioning
- Z-index fixed at z-10 (should be parameterized or token)

**Custom Token Usage:**
- Line 66: Hard-coded `z-10` (should be `z-[var(--z-floating)]` or passed as prop)

**Reusable Patterns:**
- World-space projection + screen positioning scaffold (highly reusable)

**Extraction Verdict for Lab:**
- **EXTRACT:** Generic `<WorldSpaceOverlay>` is non-domain-specific and reusable → `@motionlab/ui/WorldSpaceOverlay`
- Pair with `<Viewport>` as a foundational primitive for any 3D-to-2D UI overlay

---

## Other Components

### CommandPalette
**Path:** `packages/frontend/src/components/CommandPalette.tsx` (65 lines)

**Purpose:** Searchable command palette (Cmd/Ctrl+K) listing all executable commands with keyboard shortcuts.

**Composition:**
- `CommandDialog`, `CommandInput`, `CommandList`, `CommandGroup`, `CommandItem` from `@motionlab/ui` (shadcn/cmdk pattern)
- `useCommandGroups()` hook to organize commands
- `useCommandPaletteStore` for open/close state
- Command execution via `command.execute()`

**Design Critique:**
- Clean abstraction of command registry
- Good: Closes palette after command execution (except help command)
- Icon support per command is minimal

**Custom Token Usage:**
- None hardcoded

**Reusable Patterns:**
- CommandPalette wrapper (generic, reusable)

**Extraction Verdict for Lab:**
- **EXTRACT as generic primitive:** This is a perfect extraction candidate → `@motionlab/ui/CommandPalette`
- Hook it to a command registry in lab; both products benefit

---

### LoadCreationCard
**Path:** `packages/frontend/src/components/LoadCreationCard.tsx` (150 lines via limit)

**Purpose:** Floating card for configuring point forces, torques, or spring-damper loads after clicking two datums.

**Composition:**
- `FloatingToolCard`, `NumericInput`, `PropertyRow`, `Select` from `@motionlab/ui`
- Positioned via `WorldSpaceOverlay` (world-space anchoring)
- Form state: loadType, name, vector components, stiffness/damping/restLength
- Real-time preview via `sceneGraph.showLoadPreview()`

**Design Critique:**
- Good: Uses `WorldSpaceOverlay` for 3D anchoring ✓
- Good: Preview state synced via useEffect ✓
- Form fields are standard inputs (name, vector/stiffness/damping)

**Custom Token Usage:**
- Likely within limit; not visible in excerpt

**Reusable Patterns:**
- Floating tool card with world-space anchor
- Form validation and preview feedback loop

**Extraction Verdict for Lab:**
- KEEP IN MOTIONLAB (load domain-specific)
- PATTERN: **Floating anchored form card** could be generic

---

## Home Screen Components

**Path:** `packages/frontend/src/components/home/`

Quick survey of home screen (landing page) components:
- `HomeScreen.tsx`: Main container
- `HomeSidebar.tsx`: Sidebar with recent projects / templates
- `HomeProjectGrid.tsx`: Grid of project cards
- `MechanismThumbnail.tsx`: Project thumbnail with preview
- `GettingStartedSection.tsx`, `HomeTemplateSection.tsx`: Static sections

**Verdict:** MOTIONLAB-SPECIFIC (landing page is not shared with lab)

---

## Summary Table

| Component | Uses Primitives Well? | Extractable Patterns | Top Action |
|-----------|----------------------|----------------------|------------|
| AssetBrowser | Good | Card grid, tabbed browser | Extract grid-with-tabs pattern |
| BuildBottomPanel | Excellent | None (composition only) | Keep in MotionLab |
| ChannelBrowser | Fair | Hierarchical tree + color map | Extract TreeBrowser primitive |
| ChartPanel | Excellent | Data alignment, scrub plugin, axis layout | Extract chart utils to @motionlab/ui |
| DiagnosticsPanel | Good | Severity-color map | Replace hardcoded colors with tokens |
| BodyTree | Excellent | None (uses TreeView) | Keep in MotionLab |
| ProjectTree | [Too large to fully analyze] | [Deferred] | [Deferred] |
| ResultsBottomDock | Excellent | None (composition) | Keep in MotionLab |
| ResultsLeftPanel | Excellent | None (composition) | Keep in MotionLab |
| TimelinePanel | Good | TimelineContent sub-component reuse | Keep in MotionLab |
| MainToolbar | Good | Floating toolbar scaffold, ViewDropdown | Keep in MotionLab, reuse ViewDropdown |
| ResultsToolbar | Fair | Duplicate of MainToolbar | Consolidate into single parameterized component |
| TransportControls | Good | PlayPause button group | Extract as generic pattern |
| ViewportToolModeToolbar | Fair | Snap selector, display toggles | Extract preset selector pattern |
| EntityCreationMenu | Good | Entity-type dispatch menu | Keep in MotionLab |
| ModeIndicator | Good | Auto-dismiss toast | Extract as @motionlab/ui/AutoDismissToast |
| EntityLabelOverlay | Excellent (hot-path) | Label layout engine, world-space projection | Keep rendering in MotionLab; extract collision-avoidance layout |
| FaceTooltip | Good | Cursor-tracking tooltip | Extract as generic CursorTooltip |
| ViewportContextMenu | Good | Entity dispatch pattern | Keep in MotionLab (domain-specific entities) |
| ViewportOverlay | Excellent (composition) | Viewport HUD orchestration scaffold | Extract HUD fragment pattern for lab |
| WorldSpaceOverlay | Excellent | Generic world-to-screen positioning | **Extract to @motionlab/ui** (highly reusable) |
| CommandPalette | Excellent | None (already generic) | **Extract to @motionlab/ui** (reusable across both products) |
| LoadCreationCard | Good | Floating anchored form card pattern | Keep in MotionLab (load-specific) |

---

## Pattern Catalog — Extractable to @motionlab/ui for Lab

### 1. **WorldSpaceOverlay** (High Priority)
**Seen in:** EntityLabelOverlay, JointCreationDatumLabels (inside ViewportOverlay), LoadCreationCard  
**Proposed Primitive:** `<WorldSpaceOverlay worldPosition sceneGraph offset interactive>`  
**Why:** Non-domain-specific; projects 3D→2D and positions DOM. Both MotionLab and lab need 3D-anchored UI overlays.  
**File:** Extract to `packages/ui/src/components/WorldSpaceOverlay.tsx`

### 2. **CommandPalette** (High Priority)
**Seen in:** CommandPalette component  
**Proposed Primitive:** `<CommandPalette groups formatter />`  
**Why:** Fully generic command registry + search. Both products have commands.  
**File:** Already in @motionlab/ui; wire lab's command registry to it.

### 3. **ChartDataAlignment & AxisLayout** (Medium Priority)
**Seen in:** ChartPanel  
**Proposed Primitive:** `buildAlignedData()`, `computeAxisLayout()`, `scrubMarkerPlugin(uPlot)`  
**Why:** Multi-axis scaling, time alignment, scrub marker are chart-generic. Lab will plot data too.  
**File:** `packages/ui/src/utils/chart.ts`

### 4. **HierarchicalTreeBrowser** (Medium Priority)
**Seen in:** ChannelBrowser  
**Proposed Primitive:** `<TreeBrowser nodes onToggle renderRow />`  
**Why:** Channel tree + color-coding pattern is reusable for any hierarchical entity list.  
**File:** `packages/ui/src/components/TreeBrowser.tsx`

### 5. **SnapPresetSelector** (Low Priority)
**Seen in:** ViewportToolModeToolbar  
**Proposed Primitive:** `<SnapPresetGroup presets selected onChange />`  
**Why:** Translation/rotation snap presets are generic (useful for any CAD-like tool).  
**File:** `packages/ui/src/components/SnapPresetGroup.tsx`

### 6. **AutoDismissToast** (Low Priority)
**Seen in:** ModeIndicator  
**Proposed Primitive:** `<AutoDismissToast duration fadeOutDuration />`  
**Why:** Generic fade-out notification pattern.  
**File:** `packages/ui/src/components/AutoDismissToast.tsx`

### 7. **CursorFollowingTooltip** (Low Priority)
**Seen in:** FaceTooltip  
**Proposed Primitive:** `<CursorTooltip containerRef />`  
**Why:** Tracks cursor and displays tip. Generic pattern.  
**File:** `packages/ui/src/components/CursorTooltip.tsx`

### 8. **PlayPauseStepReset Controls** (Low Priority)
**Seen in:** MainToolbar, TransportControls, ResultsToolbar  
**Proposed Primitive:** `<TransportControls isPlaying onPlayPause onStep onReset />`  
**Why:** Simulation playback controls are generic (any product with timeline).  
**File:** Already exists as `TimelineTransport` in @motionlab/ui; ensure it's decoupled from MotionLab state.

---

## Hot-Path Violations Audit

### Correct Implementations (avoid React re-renders on hot path):
1. **ChartPanel** (line 288–387): ✓ RAF loop + imperative uPlot update, store subscriptions outside React
2. **EntityLabelOverlay** (line 158–375): ✓ RAF loop + imperative DOM updates, layout memoized via fingerprint
3. **FaceTooltip** (line 37–54): ✓ RAF loop for cursor tracking
4. **WorldSpaceOverlay** (line 33–61): ✓ RAF loop for projection updates
5. **ViewportOverlay** (sub-components coordinate via store, no prop drilling): ✓

### Potential Hot-Path Issues:
- None identified. Components that need fast updates correctly use imperative patterns.

---

## Z-Index Audit

### Violations (non-token z-index values):

| File | Line | Value | Should Be | Severity |
|------|------|-------|-----------|----------|
| EntityLabelOverlay.tsx | 383 | `zIndex: 15` | `z-[var(--z-overlay)]` (40) | Medium (hardcoded, should use token) |
| WorldSpaceOverlay.tsx | 66 | `z-10` (Tailwind) | `z-[var(--z-floating)]` | Low (semantic but not tied to token scale) |

### Compliant Usage:
- MainToolbar, ResultsToolbar: `z-[var(--z-toolbar)]` ✓
- ViewportToolModeToolbar: `z-[var(--z-toolbar)]` ✓
- ModeIndicator: Implied z-40 via context but not explicit ✓
- ViewportOverlay: `z-[var(--z-toolbar)]` ✓

**Total Z-index Violations:** 2 minor (hardcoded numeric values instead of CSS custom properties)

---

## Design Critique — Cross-Component Patterns

### Strengths:
1. **Store-based state management** prevents prop drilling across deep hierarchies
2. **RAF loops correctly keep hot paths out of React** (ChartPanel, EntityLabelOverlay)
3. **Sub-component extraction** for reusable UI chunks (AssetCard, DiagnosticRow, BodyMenuContent)
4. **Primitive reuse** from @motionlab/ui is consistent (Button, Input, ToolbarButton, DropdownMenu)

### Weaknesses:
1. **Hardcoded token fallbacks** in several places (ChartPanel line 39, 45, 52; DiagnosticsPanel color map)
2. **Inline Tailwind var() usage** instead of pure token classes (AssetBrowser, ChannelBrowser)
3. **Magic numbers** for spacing, timers (DISMISS_MS = 1500, LEGEND_INTERVAL = 200)
4. **Duplicate toolbar definitions** (MainToolbar vs. ResultsToolbar should be parameterized)
5. **Prop drilling in ChannelBrowser.NodeRow** (10+ props) — consider context or compound component

### Recommendations:
- Consolidate MainToolbar/ResultsToolbar into single parameterized component
- Extract all hardcoded durations/magic numbers to constants module
- Add token fallback utility to prevent inconsistent defaults
- Consider custom hooks for store subscriptions + cleanup pattern (used in ChartPanel, ViewportOverlay)

---

