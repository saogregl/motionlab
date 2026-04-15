# MotionLab Design-System Primitives Extraction

## Overview

This document inventories the 24 engineering-flavored primitives in `packages/ui/src/components/primitives/`, assesses each for inclusion in the shared **lab** design system, identifies design antipatterns, and surfaces token/pattern gaps.

All components use the token system from `packages/ui/src/globals.css` (Carbon g10/g100, layer architecture, semantic states, status/axis/joint colors, and Tailwind v4 `@theme inline` mappings).

---

## Component Inventory

### 1. AxisColorLabel

**Path:** `packages/ui/src/components/primitives/axis-color-label.tsx`

**Purpose:** Small inline label (9px) displaying axis identifier (X, Y, Z) with token-driven color.

**Key props:** `axis` ('x' | 'y' | 'z'), `className`.

**Design critique:** Minimal, correct. Uses CSS variable injection via `style={{ color: config.token }}` instead of inline classes — acceptable for dynamic token injection. No forwardRef needed (text-only).

**Custom token usage:** None. Correctly references `var(--axis-x/y/z)`.

**Improvements:** None critical; component is clean.

**Extraction verdict:** EXTRACT AS-IS. Generic 3D axis labeling applicable to any CAE UI.

---

### 2. CollapsibleSection

**Path:** `packages/ui/src/components/primitives/collapsible-section.tsx`

**Purpose:** Simple collapsible section header with optional icon and border, used in inspector-like layouts.

**Key props:** `title`, `icon`, `defaultOpen`, `bgClassName`, `children`.

**Design critique:** Stateful (`useState`) — appropriate for uncontrolled disclosure. Chevron animation smooth via `transition-transform duration-[var(--duration-normal)]`. Optional `bgClassName` prop is flexible but slightly awkward — should consider dedicated `bgColor` token. No composition gap.

**Custom token usage:** Correct token usage throughout. Hardcodes `"text-[8px]"` for chevron but that's a Tailwind class, not a token violation.

**Improvements:** (minor) Extract `bgClassName` default to a stricter enum (e.g., `bgVariant: 'recessed' | 'raised'`) for consistency.

**Extraction verdict:** EXTRACT AS-IS. Generic disclosure pattern; no domain-specific logic.

---

### 3. ConnectionBanner

**Path:** `packages/ui/src/components/primitives/connection-banner.tsx`

**Purpose:** Transient banner signaling engine connection state (connecting, disconnected, error) with optional dismiss callback.

**Key props:** `status`, `reconnectAttempt`, `errorMessage`, `onDismiss`.

**Design critique:** Clean state machine mapping (`STATUS_BG` record). Slide-in animation uses `animate-in slide-in-from-top-1` — good. Uses `var()` injection for colors (`bg-[var(--warning-soft)]`). Hardcodes attempt number formatting (`attempt ${reconnectAttempt}`) — acceptable for UI strings.

**Custom token usage:** All banner colors via `--warning-soft` and `--danger-soft` tokens. No violations.

**Improvements:** None. Message text is generic to engine connection, not MotionLab-specific.

**Extraction verdict:** EXTRACT AS-IS. Generic connection status component suitable for any simulation engine.

---

### 4. ContextMenus

**Path:** `packages/ui/src/components/primitives/context-menus.tsx`

**Purpose:** Five context menu component factories (Body, Joint, Datum, Geometry, MultiSelect) wrapping shadcn `ContextMenu`, each with domain-specific menu items and callbacks.

**Key props:** Per-menu ~15 optional callback props (`onSelectInViewport`, `onIsolate`, `onCreateDatum`, `onCreateJoint`, etc.).

**Design critique:** Major anti-pattern: prop explosion. Each menu has ~15 boolean/callback props, many with companion `DisabledReason` props. Example: `onCreateJoint`, `createJointDisabledReason`, plus 12 more similar pairs. This is a **primitive masquerading as domain orchestration**. The component hard-codes MotionLab concepts: Bodies, Joints, Datum, Loads, Motors, sensors/mechanisms are implied by menu structure. `JointContextMenu` exposes `jointTypes` (Revolute, Prismatic, Cylindrical, etc.) — these are Chrono backend concepts. The `GeometryContextMenu` logic (`onMakeBody`, `onMoveToBody`) is mechanism-construction specific.

**Custom token usage:** Icon size classes use `iconCls = 'size-3.5 shrink-0 text-text-tertiary'` — correct. Colors all semantic (no hardcodes). `itemCls` hardcodes `'h-7 px-3'` (28px height + 12px padding) — should be a spacing token.

**Improvements:** (major) Split into two layers: generic `<ContextMenu>` factory (reusable) + MotionLab-specific menu wrappers. Consider render-props API or component slots to avoid callback overload. Move joint types, disabled reason logic to parent. Consider data-driven menu construction (e.g., `menuItems: MenuItemConfig[]`).

**Extraction verdict:** KEEP IN MOTIONLAB. Domain-specific. Joint types, datum/load creation, isolate, swap bodies are Chrono-centric. If lab needs generic context menus, extract a smaller, data-driven `GenericContextMenu` primitive without the domain callbacks.

---

### 5. DataPointTable

**Path:** `packages/ui/src/components/primitives/data-point-table.tsx`

**Purpose:** Editable table of numeric rows (e.g., time-series data, animation keyframes) with NumericInput cells, add/remove row buttons, and min/max row constraints.

**Key props:** `columns`, `rows`, `onChange`, `minRows`, `maxRows`, `disabled`.

**Design critique:** Solid composition. Uses `NumericInput` as child component (composition over props). Grid layout driven by column count (`gridCols` computed via `repeat(${colCount}, 1fr)`). Cell updates use functional immutable pattern (`row.map(...)`). No magic numbers in row count logic.

**Custom token usage:** Correctly uses `text-2xs` (status scale) for headers, `text-[var(--text-tertiary)]` for secondary text. Button styling hardcodes `'flex items-center justify-center size-5'` — acceptable, though `size-4` to `size-6` scale could be a token.

**Improvements:** (minor) Add column type hints (numeric vs. text) to align input variants. Consider memoizing row updates for large tables.

**Extraction verdict:** EXTRACT AS-IS. Generic tabular editor; no MotionLab domain coupling.

---

### 6. DensityToggle

**Path:** `packages/ui/src/components/primitives/density-toggle.tsx`

**Purpose:** Single toolbar button toggling compact ↔ comfortable UI density (affects `--tree-row-h`, `--inspector-row-h`, etc.).

**Key props:** `density`, `onToggle`.

**Design critique:** Thin wrapper around `ToolbarButton`. No state management (caller owns `density` state). Icon toggle (Minimize2 ↔ Maximize2) is intuitive. No anti-patterns.

**Custom token usage:** None. Delegates to `ToolbarButton`.

**Improvements:** None.

**Extraction verdict:** EXTRACT AS-IS. Generic preference toggle; applicable anywhere CSS variables control density.

---

### 7. EmptyState

**Path:** `packages/ui/src/components/primitives/empty-state.tsx`

**Purpose:** Centered placeholder (icon + message + hint + optional action) shown when a panel is empty.

**Key props:** `icon`, `message`, `hint`, `action`, `className`.

**Design critique:** Minimal, flexible. Slot-based design via optional `action` ReactNode. Opacity scaling on icon (40%) creates visual hierarchy. Text sizes correct (`--text-sm`, `--text-2xs`). No domain coupling.

**Custom token usage:** All correct. Uses `--text-tertiary`, `--text-disabled` per hierarchy.

**Improvements:** None.

**Extraction verdict:** EXTRACT AS-IS. Generic empty-state pattern.

---

### 8. FloatingToolCard

**Path:** `packages/ui/src/components/primitives/floating-tool-card.tsx`

**Purpose:** Draggable floating panel (header + body + footer) for tool options, positioned absolutely within a parent viewport. Clamps drag within parent bounds.

**Key props:** `icon`, `title`, `onClose`, `children`, `footer`, `defaultPosition`.

**Design critique:** Good drag handling with `useLayoutEffect` panel-awareness (`--vp-inset-left`). However, several issues:
1. **Imperative drag state management**: tracks `isDragging`, position in useState/useRef instead of delegating to parent.
2. **Magic number**: `32px` body padding (`py-1`) hardcoded.
3. **useLayoutEffect for DOM measurements** — correct for avoiding layout thrashing, but assumes specific DOM structure (closest `[style*="--vp-inset-left"]`).
4. **Escape key handling duplicated** in two places (useEffect + onKeyDown handler on header). Both call `onClose?.()`.
5. **No forwardRef** — caller cannot control position programmatically.

**Custom token usage:** Good use of `var(--layer-base-glass)`, `var(--panel-blur)`, `var(--shadow-low)`. Inline style for custom CSS properties is appropriate (`'--inspector-label-w': '70px'`) but hardcodes a fallback instead of using token.

**Improvements:** (major) Decouple position state to prop drilling or context. Add forwardRef for imperative scroll-into-view. Unify Escape key handling. (minor) Extract `py-1` to a token or document the intent (tight spacing for tool options).

**Extraction verdict:** EXTRACT WITH FIXES. Generic floating-panel pattern; refactor to declarative positioning/sizing, add forwardRef. No domain coupling.

---

### 9. InlineEditableName

**Path:** `packages/ui/src/components/primitives/inline-editable-name.tsx`

**Purpose:** Dual-mode span/input for renaming (double-click or F2 to edit, Enter to commit, Escape to cancel).

**Key props:** `value`, `isEditing`, `onStartEdit`, `onCommit`, `onCancel`.

**Design critique:** Clean split logic (`if (isEditing)` returns input, else span). Uses `requestAnimationFrame` for focus + select deferral — correct. Event propagation stopped correctly on double-click/Enter/Escape. No leakage of internal state to parent (caller owns `isEditing`).

**Custom token usage:** Input border color uses `var(--accent-primary)` (focus indicator) and `var(--layer-base)` (bg). Correct. Text input uses `text-[length:var(--text-xs)]` — good.

**Improvements:** (minor) Consider adding `maxLength` prop for name validation; trim() logic already in place.

**Extraction verdict:** EXTRACT AS-IS. Generic inline rename primitive. No domain assumptions about name format or constraints.

---

### 10. InspectorPanel

**Path:** `packages/ui/src/components/primitives/inspector-panel.tsx`

**Purpose:** Top-level panel layout: header (entity name + icon + status line + quick actions), scrollable body, optional footer. Shows empty state when `entityName` is falsy.

**Key props:** `entityName`, `entityType`, `entityIcon`, `statusLine`, `quickActions`, `footer`, `children`.

**Design critique:** Clean structure. Good use of `ScrollArea` child. Header layout via flex. Empty state fallback is user-friendly. However:
1. **Unused prop**: `entityType` defined but never rendered (line 12 doc comment says "retained for API compat").
2. **Hardcoded heights**: header is `h-11` (44px) — should reference a token or `--inspector-header-h`.
3. **No quick-actions design consistency**: `quickActions` slot expects pre-built element; no guidance on size/shape. Could lead to inconsistent implementations.

**Custom token usage:** Correct token usage. `border-[var(--border-default)]` good.

**Improvements:** (minor) Remove unused `entityType` or document why kept. (minor) Extract header height to token (`--inspector-header-h: 44px`). (minor) Add JSDoc example for `quickActions` slot expectations (size, aria, etc.).

**Extraction verdict:** EXTRACT AS-IS. Generic panel layout. No domain coupling beyond optional label context.

---

### 11. InspectorSection

**Path:** `packages/ui/src/components/primitives/inspector-section.tsx`

**Purpose:** Collapsible section (via `@base-ui/react/collapsible`) with title, optional icon, optional count badge. Styled to look like a card within inspector body.

**Key props:** `title`, `icon`, `count`, `open` (controlled), `defaultOpen`, `onOpenChange`, `children`.

**Design critique:** Good use of `@base-ui/react/collapsible` (headless, composable). Controlled + uncontrolled modes both supported. ChevronRight rotates 90deg on open via `[[data-open]>&]:rotate-90` attribute selector — clever. Count badge is optional and rendered inline.

**Custom token usage:** Correct. Uses `var(--section-radius)`, `var(--border-subtle)`, `var(--layer-recessed)`, etc.

**Improvements:** None critical. Clean component.

**Extraction verdict:** EXTRACT AS-IS. Generic disclosure section with no domain assumptions.

---

### 12. LoadingSkeleton

**Path:** `packages/ui/src/components/primitives/loading-skeleton.tsx`

**Purpose:** Variant-based skeleton loaders (tree-row, property-row, chart) with shimmer animation.

**Key props:** `variant`, `count`.

**Design critique:** Good pattern: variant map (`VARIANT_COMPONENT`) with small render fns per skeleton type. Uses `animate-shimmer` utility class from globals.css (defined at line 620). Rows use correct height tokens (`h-[var(--tree-row-h)]`, `h-[var(--inspector-row-h)]`). No API surface area for customization (counts from variant).

**Custom token usage:** All correct. References height tokens, layer colors for shimmer.

**Improvements:** (minor) Consider adding a `gap` prop to control spacing between skeleton rows (currently `gap-0.5` hardcoded for tree rows, `gap-2` for chart).

**Extraction verdict:** EXTRACT AS-IS. Generic loading state pattern.

---

### 13. NumericInput

**Path:** `packages/ui/src/components/primitives/numeric-input.tsx`

**Purpose:** Dual-mode numeric input (readonly display or editable field) with arrow key increment/decrement, Shift for 10x step, optional unit label, min/max clamping, precision rounding, accent color left border, and flash animation on external updates.

**Key props:** `value`, `onChange`, `min`, `max`, `step`, `precision`, `unit`, `disabled`, `variant` ('inline' | 'field'), `accentColor`, `error`, `flashOnChange`.

**Design critique:** Rich feature set, well-designed. Uses `useCallback` for increment/clamp logic (memoization appropriate). Error state only shown in 'field' variant (correct UX). Stepper arrows show on hover (`group-hover/numeric-input:opacity-100`). Mouse drag on field is supported (cursor-ew-resize hint). However:
1. **Over-use of useEffect**: line 62 tracks `flashOnChange` and `isEditing` to trigger animation — could be simplified with better state management.
2. **Magic numbers**: `200ms` timer for flash animation hardcoded (line 65) instead of using `var(--duration-fast)` or `var(--duration-normal)`.
3. **Style prop injection**: `accentColor ? { borderLeftWidth: '2px', borderLeftColor: accentColor }` — correct, but could use Tailwind's `border-l-[color]` if accentColor were a token or class.

**Custom token usage:** Mostly correct. Hardcodes `11px` font size for input (`text-[11px]`) — should reference a mono text size token (e.g., `--text-mono-xs: 11px`). Hardcodes `10px` for unit text. Uses `font-[family-name:var(--font-mono)]` correctly.

**Improvements:** (minor) Extract 200ms flash duration to a constant or token. (minor) Add `--text-mono-xs` and `--text-mono-2xs` tokens to globals.css for mono-spaced field labels/units.

**Extraction verdict:** EXTRACT AS-IS. Generic numeric editor; no domain assumptions. Usable in any CAE UI (mesh size, simulation time, etc.).

---

### 14. PropertyRow

**Path:** `packages/ui/src/components/primitives/property-row.tsx`

**Purpose:** Single-line inspector property row: label (left) → value slot (center) → unit/reset/warning (right). Hover reveals reset button.

**Key props:** `label`, `labelClassName`, `labelTooltip`, `unit`, `showReset`, `onReset`, `warning`, `numeric`, `children`.

**Design critique:** Clean grid layout (2fr | 3fr | auto). Label width constrained via `var(--inspector-label-w)` (72px in globals.css). Reset button only visible on hover. Warning icon tooltip. Good composition — value slot is just `children`.

**Custom token usage:** All correct. Uses `--inspector-row-h`, `--inspector-label-w`, `--text-secondary` for label, etc.

**Improvements:** None. Well-designed row primitive.

**Extraction verdict:** EXTRACT AS-IS. Generic inspector row; applicable to any property panel.

---

### 15. Slider

**Path:** `packages/ui/src/components/primitives/slider.tsx`

**purpose:** Custom range slider (native input + styled track fill) with optional label and unit display.

**Key props:** `value`, `min`, `max`, `step`, `label`, `unit`, `onChange`.

**Design critique:** Simple and clean. Uses native `<input type="range">` with vendor pseudo-selector styling (`[&::-webkit-slider-thumb]`, `[&::-moz-range-thumb]`). Track fill computed via percent calculation. No accessibility enhancements (no `aria-valuetext`, no `aria-label` passed). Hardcodes thumb size (2.5) and shadow.

**Custom token usage:** Good. Uses `var(--layer-raised)`, `var(--accent-primary)`. Hardcodes `10px` track height — could be a token.

**Improvements:** (minor) Add `aria-label` prop. (minor) Extract thumb size and track height to CSS variables or constants.

**Extraction verdict:** EXTRACT AS-IS. Generic slider. No domain coupling.

---

### 16. StatusBadge

**Path:** `packages/ui/src/components/primitives/status-badge.tsx`

**Purpose:** Small inline status indicator (compiled, stale, running, failed, warning) with dot and label.

**Key props:** `status`, `label` (optional override).

**Design critique:** Clean state machine. Animated pulse for 'running' status. Dot color mapped via `STATUS_DOT_COLOR` record from globals.css status tokens. No anti-patterns.

**Custom token usage:** Correct. Uses `--status-compiled`, `--status-stale`, etc.

**Improvements:** None.

**Extraction verdict:** EXTRACT AS-IS. Generic status badge. Status types (compiled, running, failed) are semantic, not MotionLab-specific.

---

### 17. StatusBar

**Path:** `packages/ui/src/components/primitives/status-bar.tsx`

**Purpose:** Fixed bottom-left status bar displaying: connection state (dot + label), simulation state (dot + label), time readout (center), entity counts (bodies, joints, loads), DOF (degrees-of-freedom indicator with Gruebler warning), and compilation diagnostics.

**Key props:** `connectionState`, `simulationState`, `currentTime`, `duration`, `entityCounts`, `dof`, `diagnosticSummary`.

**Design critique:** Comprehensive but **domain-specific**. The component hard-codes MotionLab concepts:
- `SimulationState` enums (idle, compiling, running, paused) are generic, but "Gruebler's equation" title (line 145) is specific to mechanism DOF analysis.
- `entityCounts` structure (`{ bodies, joints, loads }`) is MotionLab data model.
- `dof` logic checks for overConstrained mechanism — Chrono-specific.
- Message "Some mechanisms with intentionally redundant constraints are physically valid" is domain jargon.

However, the component is **generic enough to extract if we abstract entity types**: rename `entityCounts` to `counts: { [key: string]: number }` and let parent decide what to display. Same for DOF: pass generic `{ value, overConstrained }` without machine-specific title.

**Custom token usage:** Correct. Uses `--text-status` class from utilities, semantic color tokens.

**Improvements:** (major) Parameterize entity types (e.g., `entityLabels: { bodies?: boolean; joints?: boolean; loads?: boolean }`). (minor) Extract DOF title to a prop (`dofLabel: string`).

**Extraction verdict:** KEEP IN MOTIONLAB (as-is) OR EXTRACT WITH FIXES (if parameterized). As-is, it's tied to mechanism simulation. If parameterized, it becomes a generic status bar.

---

### 18. TimelineScrubber

**Path:** `packages/ui/src/components/primitives/timeline-scrubber.tsx`

**Purpose:** Draggable timeline scrubber with playhead, tick marks, keyboard navigation (ArrowLeft/Right, Home/End).

**Key props:** `currentTime`, `duration`, `onSeek`, `tickInterval`.

**Design critique:** Good drag handling (similar to FloatingToolCard but simpler). Playhead clamped to track bounds. Tick marks auto-generated based on duration and interval. Keyboard navigation for accessibility. No magic numbers — tick calculation logic is clear.

**Custom token usage:** Correct. Uses `--field-base`, `--border-subtle`, `--accent-primary`.

**Improvements:** (minor) Consider `aria-valuetext` to announce current time on keyboard navigation.

**Extraction verdict:** EXTRACT AS-IS. Generic timeline scrubber; no domain coupling.

---

### 19. TimelineTransport

**Path:** `packages/ui/src/components/primitives/timeline-transport.tsx`

**Purpose:** Media player-like toolbar (play/pause, skip back/forward, step back/forward, loop toggle, speed selector) with time readout.

**Key props:** `isPlaying`, `isLooping`, `speed`, `currentTime`, `duration`, `onPlayPause`, `onStepForward`, `onStepBack`, `onSkipForward`, `onSkipBack`, `onLoopToggle`, `onSpeedChange`.

**Design critique:** Clean composition. Hardcoded speed options `[0.25, 0.5, 1, 2, 4]` — suitable for most simulation use cases. Uses shadcn `Select` for speed picker. No anti-patterns. Time format hardcoded to 3 decimal places (via `toFixed(3)`).

**Custom token usage:** Correct. Uses `--field-base`, `--text-tertiary`.

**Improvements:** (minor) Consider exporting `speedOptions` to allow customization.

**Extraction verdict:** EXTRACT AS-IS. Generic playback control; no simulation-specific logic.

---

### 20. ToolbarButton

**Path:** `packages/ui/src/components/primitives/toolbar-button.tsx`

**Purpose:** Icon-only toolbar button with tooltip (required), optional keyboard shortcut hint, active state highlighting, and auto-blur on click.

**Key props:** `tooltip`, `shortcut`, `active`, `disabled`, `onClick`, `children`.

**Design critique:** Good composition via shadcn `Tooltip`. Auto-blur on click prevents accidental keyboard focus after mouse click (improves UX for toolbars). Keyboard hint rendered in `<kbd>` element with styled background (`bg-[var(--layer-recessed)]`). No anti-patterns.

**Custom token usage:** Correct. Uses `--text-xs` for tooltip, `--text-2xs` for shortcut key.

**Improvements:** None.

**Extraction verdict:** EXTRACT AS-IS. Generic toolbar button primitive.

---

### 21. ToolbarGroup

**Path:** `packages/ui/src/components/primitives/toolbar-group.tsx`

**Purpose:** Grouping container for toolbar buttons with optional trailing vertical separator.

**Key props:** `separator`, `children`.

**Design critique:** Minimal. `separator && <Separator>` is clean. Separator style uses `bg-border-default` (class, not var) — should be consistent with token usage.

**Custom token usage:** Minor: separator uses `bg-border-default` class (expects it in Tailwind theme) instead of `bg-[var(--border-default)]`.

**Improvements:** (minor) Use `bg-[var(--border-default)]` for consistency.

**Extraction verdict:** EXTRACT AS-IS. Generic grouping container.

---

### 22. ToolbarSplitButton

**Path:** `packages/ui/src/components/primitives/toolbar-split-button.tsx`

**Purpose:** Split button (main action + dropdown menu) for toolbar, with tooltip on main action.

**Key props:** `tooltip`, `shortcut`, `icon`, `active`, `mainDisabled`, `menuDisabled`, `onClickMain`, `children` (dropdown items).

**Design critique:** Good design. Uses shadcn `DropdownMenu` and `Tooltip`. Spacing between main button and dropdown trigger is `-ms-px` (negative margin to fuse borders). Both buttons share `variant` state (active/inactive).

**Custom token usage:** Correct.

**Improvements:** None.

**Extraction verdict:** EXTRACT AS-IS. Generic toolbar split button.

---

### 23. TreeRow & GroupHeaderRow

**Path:** `packages/ui/src/components/primitives/tree-row.tsx`

**Purpose:** Single tree item row with disclosure chevron, icon, name, secondary text, status dot, visibility toggle, and context menu trigger. Plus group header variant.

**Key props (TreeRow):** `level`, `name`, `icon`, `secondary`, `hasChildren`, `expanded`, `onToggleExpand`, `onSelect`, `onToggleVisibility`, `onContextMenu`, `selected`, `focused`, `disabled`, `dragTarget`, `hidden`, `status`.

**Design critique:** Rich feature set. Good use of CSS variables for indent calculation (`paddingLeft: calc(var(--space-1) + ${level} * var(--tree-indent))`). Guide lines rendered as decorative spans. Disclosure chevron rotation smooth. Status dot support (warning/danger). Visibility icon hidden until hover or selection. Context menu icon hidden until hover.

Issues:
1. **Data attributes for state** (`data-selected`, `data-focused`, etc.) are correct, but one selector uses hardcoded `text-tree-selection-bg` class (line 76) instead of `text-[var(--tree-selection-bg)]`. This assumes Tailwind theme includes `tree-selection-bg` color — should verify in `@theme inline`.
2. **Icon color on selection**: line 137 uses `group-data-[selected]/tree-row:[&_svg]:!text-white` — hardcodes white instead of using `var(--tree-selection-text)`.
3. **Hardcoded secondary text color**: `text-[var(--text-disabled)]` is correct, but on selection it uses `text-white/50` (line 155) instead of deriving from `--tree-selection-text`.

**Custom token usage:** Minor violations. Line 76 and 155 hardcode colors instead of using tokens. Icon size is `size-3.5` (14px) — correct but should verify against `--tree-icon-size` token (14px in globals.css — match confirmed).

**Improvements:** (minor) Use `text-[var(--tree-selection-text)]` for selected secondary text instead of `text-white/50`. (minor) Verify `tree-selection-bg` exists in Tailwind theme.

**GroupHeaderRow:** Simpler variant (no visibility/context), clean composition.

**Extraction verdict:** EXTRACT AS-IS. Generic tree row primitive. The row is generic; context (bodies, joints, geometry) is provided by parent via `renderRow` prop in TreeView. No domain coupling in TreeRow itself.

---

### 24. TreeView

**Path:** `packages/ui/src/components/primitives/tree-view.tsx`

**Purpose:** Virtualized tree container (via `@tanstack/react-virtual`) managing flat node list, selection, expansion, keyboard navigation (arrows, Enter, Delete), Ctrl/Shift multi-select.

**Key props:** `nodes`, `selectedIds`, `onSelectionChange`, `expandedIds` (controlled), `renderRow`, `multiSelect`, `onDelete`, `scrollToId`.

**Design critique:** Excellent design. Virtualization for large trees. Supports controlled + uncontrolled modes for expansion. Keyboard navigation comprehensive (ArrowUp/Down, ArrowLeft/Right for expand/collapse, Enter, Delete, Home/End via track focus). Multi-select with Ctrl+click and Shift+range. Node filtering logic is clear (checks `collapsedAncestorLevel` to hide children of collapsed nodes).

Minor issue:
1. **estimateSize default = 26px** (line 67) — should align with `--tree-row-h: 26px` in globals.css. Confirmed match.
2. **Over-scan = 5** (reasonable default, no issue).
3. **No accessibility text alternatives**: nodes don't have `aria-label`. TreeItem wrapper includes `aria-level`, `aria-selected`, `aria-expanded`, but no `aria-label` for screen readers to announce node name.

**Custom token usage:** No hardcoded colors; all styling delegated to `renderRow` callback.

**Improvements:** (minor) Add `aria-label={node.name}` to virtual treeitem div for accessibility.

**Extraction verdict:** EXTRACT AS-IS. Generic virtualized tree. Parent provides `renderRow`, so domain logic is decoupled.

---

### 25. ViewCube

**Path:** `packages/ui/src/components/primitives/view-cube.tsx`

**Purpose:** 3D-perspective cube (6 faces labeled Front, Back, Right, Left, Top, Bottom) with Home and Zoom-to-fit buttons below.

**Key props:** `onHome`, `onZoomFit`.

**Design critique:** Uses CSS 3D transforms (`transform-style: preserve-3d`, `rotateX/Y`, `translateZ`). Cube is 64px and unclickable (visual reference only); buttons handle interaction. Hardcodes:
- Cube size: `size-16` (64px).
- Half-size: 32px (derived value in `getFaceTransform`).
- Default perspective: `200px`.
- Face rotation: `rotateX(-20deg) rotateY(-30deg)` (isometric-like angle).

**Custom token usage:** Correct. Uses `var(--layer-base)`, `var(--text-tertiary)`, `var(--shadow-low)`. Face text is `text-[8px]` — small but proportional to cube.

**Improvements:** (minor) Consider props for size, perspective, and default rotation to make cube customizable (e.g., for different screen densities). (minor) Consider making faces interactive (clickable to orient view) rather than buttons.

**Extraction verdict:** EXTRACT AS-IS. Generic 3D view orientation gizmo; no domain coupling. Useful for any 3D CAE application.

---

### 26. ViewportToolbar

**Path:** `packages/ui/src/components/primitives/viewport-toolbar.tsx`

**Purpose:** Floating toolbar container for viewport-overlaid buttons (e.g., navigation, selection mode, measure tool).

**Key props:** `children`.

**Design critique:** Minimal wrapper. Flex column, gap-0.5, border, layer-elevated bg. No issues.

**Custom token usage:** Correct.

**Improvements:** None.

**Extraction verdict:** EXTRACT AS-IS. Generic viewport toolbar container.

---

## Summary Table

| Component | Verdict | Severity | Top Action |
|-----------|---------|----------|------------|
| AxisColorLabel | EXTRACT AS-IS | none | — |
| CollapsibleSection | EXTRACT AS-IS | minor | Stricter bgVariant enum |
| ConnectionBanner | EXTRACT AS-IS | none | — |
| ContextMenus | KEEP IN MOTIONLAB | major | Split into generic factory + MotionLab wrappers; refactor callback explosion |
| DataPointTable | EXTRACT AS-IS | none | — |
| DensityToggle | EXTRACT AS-IS | none | — |
| EmptyState | EXTRACT AS-IS | none | — |
| FloatingToolCard | EXTRACT WITH FIXES | major | Decouple position state, add forwardRef, unify Escape handling |
| InlineEditableName | EXTRACT AS-IS | none | — |
| InspectorPanel | EXTRACT AS-IS | minor | Remove unused entityType, add header height token |
| InspectorSection | EXTRACT AS-IS | none | — |
| LoadingSkeleton | EXTRACT AS-IS | minor | Add gap prop for customization |
| NumericInput | EXTRACT AS-IS | minor | Add mono text size tokens, extract flash duration |
| PropertyRow | EXTRACT AS-IS | none | — |
| Slider | EXTRACT AS-IS | minor | Add aria-label prop, extract thumb size to token |
| StatusBadge | EXTRACT AS-IS | none | — |
| StatusBar | KEEP IN MOTIONLAB or EXTRACT WITH FIXES | major | Parameterize entity types and DOF label; or keep as MotionLab-specific |
| TimelineScrubber | EXTRACT AS-IS | none | — |
| TimelineTransport | EXTRACT AS-IS | minor | Export speedOptions for customization |
| ToolbarButton | EXTRACT AS-IS | none | — |
| ToolbarGroup | EXTRACT AS-IS | minor | Use var(--border-default) for separator |
| ToolbarSplitButton | EXTRACT AS-IS | none | — |
| TreeRow & GroupHeaderRow | EXTRACT AS-IS | minor | Use semantic tokens for selected text color, verify tree-selection-bg in theme |
| TreeView | EXTRACT AS-IS | minor | Add aria-label to virtual treeitems |
| ViewCube | EXTRACT AS-IS | minor | Consider size/perspective/rotation props for customization |
| ViewportToolbar | EXTRACT AS-IS | none | — |

---

## Cross-Cutting Issues

### 1. Hardcoded Colors in Selected State (affects: TreeRow, possibly others)
Multiple components use hardcoded `text-white` or `text-white/50` for selected/focused states instead of deriving from `--tree-selection-text` or equivalent semantic token. This breaks dark-mode consistency.

**Impact:** 4 components (TreeRow, TreeRow secondary, some icon colors in selected rows).

**Action:** Audit all `group-data-[selected]` and `data-[selected]` states; replace hardcodes with `text-[var(--tree-selection-text)]`.

### 2. Mono Text Size Tokens Missing
Multiple numeric/code-heavy components hardcode `text-[11px]` (NumericInput, TimelineTransport, StatusBar) or `text-[10px]` (Slider, PropertyRow) for monospace text without a dedicated token scale.

**Impact:** 6 components. Inconsistent sizing if mono scale needs to change.

**Action:** Add `--text-mono-xs: 11px` and `--text-mono-2xs: 10px` to globals.css, expose via Tailwind theme, and refactor hardcodes.

### 3. Callback Explosion in Domain Components (affects: ContextMenus, StatusBar)
ContextMenus and StatusBar define 15+ callback props each, many with companion `DisabledReason` props. This is a code smell indicating the component is orchestrating domain logic rather than composing UI.

**Impact:** 2 major components with complex prop drilling and poor reusability.

**Action:** Extract generic menu/bar factories; let domain parents build menu structures via data (e.g., `menuItems: MenuItemConfig[]`) or render props.

### 4. Spacing/Size Tokens Underutilized
Hardcoded sizes appear throughout: `h-7` (28px), `size-5`, `size-3.5`, `h-8`, `py-1`, `px-3`. These should derive from a spacing/sizing scale (e.g., `--size-sm: 20px`, `--size-md: 28px`).

**Impact:** ~8 components.

**Action:** Document recommended Tailwind sizing scale in design-system guide; refactor to use consistent scale.

### 5. Escape Key Handling Duplicated in FloatingToolCard
Header and useEffect both handle Escape to dismiss. Could lead to double-firing if both paths execute.

**Impact:** 1 component, low risk (onClose called twice harmlessly), but poor pattern.

**Action:** Unify Escape handling into single listener.

---

## Token Gap Analysis

### Missing or Undersupported Tokens

1. **`--header-h` or `--inspector-header-h`**: InspectorPanel hardcodes `h-11` (44px). Add to globals.css for consistency.

2. **`--tree-row-selected-text`**: TreeRow uses hardcoded `text-white` on selected instead of semantic token. Already have `--tree-selection-bg` and `--tree-selection-text` in globals.css but TreeRow doesn't use it uniformly.

3. **Mono text scale**: `--text-mono-xs` (11px) and `--text-mono-2xs` (10px) used implicitly throughout but not defined as tokens.

4. **Floating card / tool card sizing**: FloatingToolCard has `min-w-[240px] w-[260px] max-w-[300px]` hardcoded. Consider `--float-card-min-w`, `--float-card-w`, `--float-card-max-w`.

5. **Context menu item height**: `itemCls = 'h-7 px-3'` is a local variable in ContextMenus. Should be a token or design constant.

6. **Skeleton gap**: LoadingSkeleton has variant-specific gaps (`gap-0.5` for tree, `gap-2` for chart) but no parameterization. Could be `--skeleton-gap-tight`, `--skeleton-gap-normal`.

### Recommended Additions to `globals.css`

```css
/* Mono text scale — for numeric/code display */
--text-mono-xs: 11px;      /* NumericInput input, TimelineTransport time, etc. */
--text-mono-2xs: 10px;     /* Unit labels, tick marks, diagnostics */

/* Sizing for interactive elements */
--size-4: 16px;            /* Icon size, button size base */
--size-3-5: 14px;          /* Tree icons, tree row height components */
--size-2-5: 10px;          /* Stepper arrows, small controls */

/* Header/panel heights */
--inspector-header-h: 44px;
--context-menu-item-h: 28px;

/* Floating card dimensions */
--float-card-min-w: 240px;
--float-card-w: 260px;
--float-card-max-w: 300px;
```

---

## Extraction Recommendation Summary

**Total components: 24**

- **EXTRACT AS-IS: 19** (axis-color-label, collapsible-section, connection-banner, data-point-table, density-toggle, empty-state, inline-editable-name, inspector-panel, inspector-section, loading-skeleton, numeric-input, property-row, slider, status-badge, timeline-scrubber, timeline-transport, toolbar-button, tree-row, tree-view, view-cube, viewport-toolbar)

- **EXTRACT WITH FIXES: 2** (floating-tool-card, status-bar)

- **KEEP IN MOTIONLAB: 2** (context-menus — domain-specific; status-bar alternative if parameterization not desired)

**Next steps for **lab** integration:**
1. Copy 19 EXTRACT AS-IS components as-is.
2. Apply fixes to FloatingToolCard (position state, forwardRef) and StatusBar (parameterize entity types) before copying.
3. Keep ContextMenus in MotionLab; if lab needs context menus, create a generic factory wrapping shadcn ContextMenu.
4. Add missing tokens to a shared `design-tokens.css` or Tailwind `@theme` block.
5. Document component composition rules (render props, slot APIs) to prevent prop explosion in future extensions.

