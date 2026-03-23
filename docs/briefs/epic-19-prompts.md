# Epic 19 — UI/UX Polish Sprint: Design System & Density

> **Status:** Not started
> **Dependencies:** Epic 11 (UI design system foundation) — complete. Entity-type color scheme established.
> **Prerequisite reading:** `docs/briefs/ui-epic.md` (design spec), `docs/briefs/ui-feedback-1.md` (feedback audit)
>
> **Governance note:** Pre-MVP lighter process applies — this epic is CSS/component-level work with no protocol or engine changes. No ADRs required unless component APIs change in breaking ways. Doc updates batched at epic completion.

Four prompts. Each prompt is independent and can be executed in any order, though Prompt 1 establishes the density foundation that later prompts benefit from. Prompt 4 (theming) should ideally run last to audit everything the other prompts produce.

## Motivation

The current UI works but reads as a "prompt-generated enterprise UI" rather than a mature engineering workstation. The diagnosis from `docs/briefs/ui-feedback-1.md` identifies the core problem: **everything is treated with roughly the same visual importance, spacing rhythm, and component language**. The result is too even, too polite, and too generic.

### Benchmark Analysis

Five reference applications define the target quality:

| Application | Strengths to Adopt | Anti-patterns to Avoid |
|---|---|---|
| **Onshape** | Dense tree rows (24px), crisp inspector grids, strong tonal separation between viewport and chrome, real secondary toolbar, tight numeric inputs | Over-reliance on blue accent everywhere |
| **Blender** | Extreme density, keyboard-first culture, unified dark theme, efficient property panels, strong mode indicators | Overwhelming to newcomers, cramped in some panels |
| **Fusion 360** | Polished transitions, clear status indicators, professional floating tool cards, good loading states | Sometimes too much whitespace in dialogs |
| **Unreal Engine** | Deep dark theme with clear tonal hierarchy, details panel density, strong tree view with type icons, good context menus | Over-complex panel system |
| **Adams View** | Engineering-specific chrome, simulation-aware status bars, result legends, domain iconography | Dated visual language, poor contrast, no modern affordances |

### Key Principles Derived from References

1. **Dense where data matters** (inspectors, property panels), **spacious where immersion matters** (viewport)
2. **Aggressive hierarchy:** primary actions large and prominent, secondary info small and subdued
3. **Consistent iconography and color language** — entity-type icons should be instantly recognizable
4. **Transitions and micro-interactions** for professional feel — not decoration, but feedback
5. **Dark theme as primary** — engineering tools are used for hours; the dark theme must feel engineered, calm, deep, and precise
6. **Border logic over shadow logic** — CAD apps feel crisp because of borders, tone steps, insets, and separators; shadows only for floating elements
7. **Reduced border radius** — move away from "modern SaaS" softness toward precision-tool crispness

### Current State Summary

The token system in `packages/ui/src/globals.css` is well-structured with CSS custom properties, Carbon-inspired color palette, and Tailwind v4 `@theme` mappings. The component library (`packages/ui/src/components/`) has:

- **Primitives:** `inspector-panel`, `inspector-section`, `property-row`, `numeric-input`, `tree-row`, `tree-view`, `floating-tool-card`, `timeline-scrubber`, `toolbar-button`, `context-menus`, `view-cube`, `empty-state`, `status-badge`
- **Engineering:** `vec3-display`, `quat-display`, `inertia-matrix-display`, `selection-chip`, `copyable-id`
- **shadcn wrappers:** button, dialog, dropdown-menu, select, command, tooltip, context-menu, scroll-area

The gap is not missing components — it is that existing components need density tuning, hierarchy sharpening, and domain-specific refinement.

---

## Prompt 1: Visual Hierarchy & Density Overhaul

```
# Epic 19 — Visual Hierarchy & Density Overhaul

You are tightening the visual density and hierarchy of MotionLab's inspector panels, tree views, and property rows. The goal is to move the UI from "clean SaaS admin panel" toward "high-density professional CAD workstation" — matching the density and precision of Onshape and Blender while keeping the clarity of Fusion 360.

This is a CSS/component-level change with no protocol or engine modifications.

## Read These First (in order)
- `docs/briefs/ui-epic.md` — full design spec with measured reference values
- `docs/briefs/ui-feedback-1.md` — detailed feedback audit (the "8 biggest reasons it feels AI-like")
- `packages/ui/AGENTS.md` — UI package rules
- `packages/ui/src/globals.css` — current token system
- `packages/ui/src/components/primitives/property-row.tsx` — current property row
- `packages/ui/src/components/primitives/inspector-section.tsx` — current section headers
- `packages/ui/src/components/primitives/inspector-panel.tsx` — current inspector panel
- `packages/ui/src/components/primitives/tree-row.tsx` — current tree row
- `packages/ui/src/components/primitives/numeric-input.tsx` — current numeric input
- `packages/ui/src/components/primitives/floating-tool-card.tsx` — current floating card

## What Exists Now

### Token system (`globals.css`)
CSS custom properties on `:root` with `.dark` and `.compact` overrides. Key current values:
- `--tree-row-h: 26px` (was 28px in spec, already reduced)
- `--tree-indent: 14px`
- `--inspector-row-h: 28px`
- `--inspector-label-w: 84px`
- Compact mode: tree row 22px, inspector row 24px

### PropertyRow (`property-row.tsx`)
Grid layout: `grid-cols-[var(--inspector-label-w)_1fr_auto]` with `h-[var(--inspector-row-h)]`. Label is `text-xs` (12px) in `text-secondary`. Value slot is `text-xs`. Trailing cell has unit, reset button, warning icon. Hover state: `hover:bg-[var(--layer-raised-hover)]`.

### InspectorSection (`inspector-section.tsx`)
Uses `@base-ui/react` Collapsible. Header: `h-7` with `bg-[var(--layer-recessed)]`, `text-2xs` (11px), uppercase, semibold. Chevron disclosure. Panel: `bg-[var(--layer-base)]`.

### InspectorPanel (`inspector-panel.tsx`)
Header: `h-8` with entity icon (20px), entity type label (10px uppercase), entity name (text-sm bold), status line. Empty state with `MousePointerClick` icon. Body wrapped in ScrollArea with `gap-1.5` between sections.

### TreeRow (`tree-row.tsx`)
Height: `var(--tree-row-h)`. Indent guides (vertical lines at each depth). Disclosure chevron, type icon (3.5 = 14px), name (text-xs), secondary text, status dot, visibility toggle (eye icon, shown on hover), context menu button (shown on hover). Selected state: `bg-[var(--selection-row)]` with inset accent shadow.

### NumericInput (`numeric-input.tsx`)
Two variants: `inline` (transparent bg, shows bg on hover/focus) and `field` (always visible bg). Monospace font, tabular-nums. Stepper arrows on hover. Focus: accent border. Width fills parent.

### FloatingToolCard (`floating-tool-card.tsx`)
260px wide, max 300px. Draggable header. Header: h-7 with icon, title (text-sm semibold), close button. Body slot (overrides `--inspector-label-w` to 70px). Footer with action buttons. Shadow overlay, border, rounded.

## What to Build

### 1. Token updates in `globals.css`

Update the default (non-compact) tokens to be denser — the current "default" should feel like what "compact" used to be:

```css
:root {
  /* Tree — tighter defaults */
  --tree-row-h: 24px;        /* was 26px */
  --tree-icon-size: 14px;    /* was 16px */
  --tree-indent: 12px;       /* was 14px */

  /* Inspector — tighter defaults */
  --inspector-row-h: 26px;   /* was 28px */
  --inspector-label-w: 80px; /* was 84px */

  /* Topbar — tighter */
  --topbar-h: 38px;          /* was 40px */

  /* Typography — add status scale */
  --text-3xs: 0.625rem;      /* 10px — status labels, all-caps metadata */
}

/* Compact mode — even tighter */
.compact {
  --tree-row-h: 20px;        /* was 22px */
  --inspector-row-h: 22px;   /* was 24px */
  --topbar-h: 34px;          /* was 36px */
}
```

Also add a `--text-3xs` mapping in the `@theme inline` block.

### 2. PropertyRow density refinements

Target: label 40% width (flexible, not fixed px), muted color, truncated with tooltip. Value 60% width, full contrast.

Changes to `property-row.tsx`:
- Change grid from fixed `--inspector-label-w` to proportional: `grid-cols-[2fr_3fr_auto]` — label gets 40%, value gets 60%
- Keep `--inspector-label-w` as a `min-width` on the label for very narrow panels, but let it flex proportionally
- Reduce horizontal padding from `px-1.5` to `ps-2 pe-1` (use longhand per project memory)
- Add `title` attribute on the label span for truncation tooltip
- Make label text `text-tertiary` (was `text-secondary`) — labels should recede more
- Make value text explicitly `text-primary` for contrast
- Reduce the trailing cell gap from `gap-0.5` to `gap-px`

### 3. InspectorSection header tightening

Changes to `inspector-section.tsx`:
- Reduce header height from `h-7` (28px) to `h-6` (24px)
- Add a `border-b border-[var(--border-subtle)]` to the header for structural separation
- Remove uppercase tracking from title — use sentence case with `font-semibold` instead (uppercase feels generic)
- Increase font size from `text-2xs` (11px) to `text-xs` (12px) — section names should be readable
- Add a subtle count badge: accept an optional `count` prop, render as `(N)` after title in `text-tertiary`

### 4. InspectorPanel header refinements

Changes to `inspector-panel.tsx`:
- Reduce section body gap from `gap-1.5` to `gap-[var(--inspector-section-gap)]` (2px)
- Make entity type label use a thin colored left border (2px) matching entity type color instead of text-only — e.g., body = blue-ish, joint = amber-ish
- Add entity type as a distinct chip/badge: small rounded background with `bg-[var(--accent-soft)]` + `text-[var(--accent-text)]`, 10px uppercase
- Make entity name use `text-base` (14px) font-semibold instead of text-sm bold — the selected entity name should be the strongest text in the inspector

### 5. TreeRow density refinements

Changes to `tree-row.tsx`:
- Full-width selection highlight: remove all left/right padding from the selection background so it bleeds to panel edges. The selected row background should span the full width of the panel, not be inset.
- Strengthen selected state: use `bg-[var(--selection-row)]` at full opacity (already present) but add a left accent border: `shadow-[inset_2px_0_0_var(--accent-primary)]` (thicken from 1.5px to 2px)
- Make name text `text-[length:var(--text-xs)]` (already 12px, keep) but ensure `font-medium` for selected rows via `data-[selected]:font-medium`
- Add hover state for the entire row that reveals the visibility toggle and context menu — already present, but make the hover background slightly stronger: use `hover:bg-[var(--layer-base-hover)]` instead of `hover:bg-[var(--hover-overlay)]`
- Tighten icon spacing: reduce `mr-1.5` after icon to `mr-1`

### 6. NumericInput precision refinements

Changes to `numeric-input.tsx`:
- Make the input font size explicitly `text-[11px]` (slightly smaller than text-xs 12px) for numeric compactness
- Add a subtle left border color indicator when used with axis colors: accept an optional `accentColor` prop that renders a 2px left border
- Tighten internal padding from `px-1.5` to `ps-1 pe-0.5`
- Make the stepper arrows narrower: `w-2.5` instead of `w-3`
- Inline variant: reduce height from `h-6` (24px) to `h-5` (20px)

### 7. FloatingToolCard operational tightening

Changes to `floating-tool-card.tsx`:
- Reduce width from `w-[260px]` to `w-[240px]`
- Reduce header height from `h-7` to `h-6`
- Make header title `text-xs` instead of `text-sm`
- Reduce header padding from `px-2` to `ps-2 pe-1`
- Add a thin top accent border: `border-t-2 border-t-[var(--accent-primary)]` to give it a "tool mode" feel
- Reduce border radius from `rounded-[var(--radius-md)]` to `rounded-[var(--radius-sm)]`
- Tighten footer padding from `px-2 py-1.5` to `ps-2 pe-1.5 py-1`

### 8. Typography scale enforcement

Add a new utility class in `globals.css`:
```css
@layer utilities {
  .text-status {
    font-size: var(--text-3xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: var(--weight-medium);
  }
}
```

## Architecture Constraints
- All changes are CSS/component-level — no protocol, store, or engine changes
- Use longhand padding (ps-/pe-) not shorthand (px-) to avoid Tailwind v4 override bugs
- Preserve all existing component APIs — changes are visual only
- New props (like `count` on InspectorSection, `accentColor` on NumericInput) must be optional with backward-compatible defaults
- Test across both Electron (apps/desktop/) and web (apps/web/) targets
- Performance: all CSS transitions should use transform/opacity for GPU acceleration

## Acceptance Criteria
- Default density is visibly tighter than current — side-by-side comparison should show ~20% more information in the same viewport area
- Inspector panels show more rows per screen height
- Tree rows are tighter with full-width selection highlights
- Floating tool cards feel "operational" not "form-like"
- All existing Storybook stories render correctly (run `pnpm --filter @motionlab/ui storybook` to verify)
- `pnpm --filter @motionlab/ui typecheck` passes
- `pnpm --filter @motionlab/frontend typecheck` passes

## What NOT to Build
- Status bar (that's Prompt 2)
- Context menu standardization (that's Prompt 3)
- Dark theme color audit (that's Prompt 4)
- New components — only modify existing ones
- Undo/redo infrastructure (separate epic)
```

---

## Prompt 2: Status Bar, Connection Chrome & Error States

```
# Epic 19 — Status Bar, Connection Chrome & Error States

You are adding a status bar, connection state chrome, and error/loading/empty states to MotionLab. Professional engineering tools always show system status — connection state, simulation state, entity counts, and progress indicators. Currently MotionLab shows none of this, making the shell feel like a prototype.

This is a component-level change. It reads from existing Zustand stores but does not modify protocol or engine behavior.

## Read These First (in order)
- `docs/briefs/ui-epic.md` — design spec
- `docs/briefs/ui-feedback-1.md` — "the chrome is too minimal in the wrong places"
- `packages/ui/AGENTS.md` — UI package rules
- `packages/ui/src/globals.css` — token system
- `packages/ui/src/components/primitives/empty-state.tsx` — existing empty state component
- `packages/ui/src/components/primitives/status-badge.tsx` — existing status badge
- `packages/frontend/AGENTS.md` — frontend rules
- `packages/frontend/src/components/ViewportOverlay.tsx` — current viewport overlay
- `packages/frontend/src/stores/mechanism.ts` — mechanism state
- `packages/frontend/src/stores/simulation.ts` — simulation state
- `packages/frontend/src/engine/connection.ts` — engine connection

## What Exists Now

### Stores
- `useSimulationStore`: tracks `state` ('idle' | 'compiling' | 'running' | 'paused' | 'error'), `currentTime`, `duration`, `speed`
- `useMechanismStore`: tracks `bodies` (Map), `datums` (Map), `joints` (Map), `loads` (Map)
- Connection status is tracked in `connection.ts` but not exposed as a reactive store

### Components
- `StatusBadge`: exists in `packages/ui/` — small badge with colored dot and label
- `EmptyState`: exists in `packages/ui/` — icon + message + optional action button
- No status bar component exists
- No toast/notification system exists
- No connection banner exists

### Layout
- The main layout is in `packages/frontend/src/App.tsx` (or similar root)
- Bottom area currently has timeline/chart panels
- No bottom-of-window status bar region

## What to Build

### 1. Create StatusBar component in `packages/ui/`

Create `packages/ui/src/components/primitives/status-bar.tsx`:

A 24px tall bar fixed to the bottom of the application window. Layout:

```
┌─────────────────────────────────────────────────────────────────┐
│ ● Connected  │  ■ Idle  │           t=0.000 / 1.000s          │  3 bodies  2 joints  1 load │
│  left cluster │          │           center                     │              right cluster  │
└─────────────────────────────────────────────────────────────────┘
```

Props:
```ts
interface StatusBarProps {
  /** Engine connection state */
  connectionState: 'connected' | 'connecting' | 'disconnected' | 'error';
  /** Simulation state */
  simulationState: 'idle' | 'compiling' | 'running' | 'paused' | 'error';
  /** Current simulation time (seconds) */
  currentTime?: number;
  /** Total simulation duration (seconds) */
  duration?: number;
  /** Entity counts */
  entityCounts?: {
    bodies: number;
    joints: number;
    loads: number;
  };
  className?: string;
}
```

Styling:
- Height: 24px (`h-6`)
- Background: `bg-[var(--layer-recessed)]`
- Top border: `border-t border-[var(--border-default)]`
- Text: `text-[length:var(--text-3xs)]` (10px) with `tabular-nums` for time
- Font: monospace for time values, sans for labels
- Horizontal layout: flexbox with `justify-between`
- Left cluster: connection dot + label, separator, simulation state + label
- Center: simulation time readout (only visible when duration > 0)
- Right cluster: entity counts with subtle separators
- Connection dot colors: connected = `var(--success)`, connecting = `var(--warning)` (pulsing), disconnected = `var(--text-disabled)`, error = `var(--danger)`
- Simulation state colors: idle = `var(--text-tertiary)`, compiling = `var(--warning)`, running = `var(--status-running)`, paused = `var(--text-secondary)`, error = `var(--danger)`

### 2. Create ConnectionStore in `packages/frontend/`

Create `packages/frontend/src/stores/connection.ts`:

```ts
interface ConnectionState {
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  lastError: string | null;
  reconnectAttempt: number;
  setStatus: (status: ConnectionState['status']) => void;
  setError: (error: string) => void;
  clearError: () => void;
}
```

Wire this into `connection.ts` so WebSocket open/close/error events update the store.

### 3. Create ConnectionBanner component

Create `packages/ui/src/components/primitives/connection-banner.tsx`:

A dismissible banner shown at the top of the viewport when the engine disconnects:

```
┌─────────────────────────────────────────────────────┐
│  ⚠ Engine disconnected. Reconnecting (attempt 3)... │
└─────────────────────────────────────────────────────┘
```

Props:
```ts
interface ConnectionBannerProps {
  status: 'connecting' | 'disconnected' | 'error';
  reconnectAttempt?: number;
  errorMessage?: string;
  onDismiss?: () => void;
}
```

Styling:
- Fixed to top of viewport area (below topbar)
- Full width of viewport
- Background: `bg-[var(--warning-soft)]` for connecting, `bg-[var(--danger-soft)]` for disconnected/error
- Text: `text-xs` with appropriate color
- Dismiss X button on the right
- Animate in from top with `slide-in-from-top-1`

### 4. Create Toast notification system

Create `packages/ui/src/components/primitives/toast.tsx`:

Use Radix Toast (already available via shadcn) or build a lightweight toast stack. Toasts appear in the bottom-right corner above the status bar.

```ts
interface ToastProps {
  variant: 'info' | 'success' | 'warning' | 'error';
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  duration?: number; // auto-dismiss ms, default 5000
}
```

Create a toast store in `packages/frontend/src/stores/toast.ts`:
```ts
interface ToastState {
  toasts: Array<ToastProps & { id: string }>;
  addToast: (toast: ToastProps) => void;
  removeToast: (id: string) => void;
}
```

Wire error events from connection.ts and simulation store to produce toasts:
- Engine error: error toast with message
- Compilation failure: error toast with details
- Successful compilation: success toast (brief, 2s)
- Import complete: success toast with body count

### 5. Enhance EmptyState usage

Update `packages/frontend/src/components/ProjectTree.tsx` to show meaningful empty states:
- No bodies: "No bodies yet. Import a STEP file to get started." with an Import button
- No joints under a body: "No joints. Select two datums and press J to create one."
- No datums under a body: "No datums. Press D and click a face to create one."

### 6. Input validation error states

Create a shared error display pattern for invalid inputs:

Add an optional `error` prop to `NumericInput`:
```ts
interface NumericInputProps {
  // ... existing props
  error?: string; // error message, shown below input
}
```

When `error` is set:
- Input border: `border-[var(--danger)]`
- Error message: `text-[var(--danger)]` at `text-3xs` below the input
- Red tint on the input background: `bg-[var(--danger-soft)]`

### 7. Loading states

Create `packages/ui/src/components/primitives/loading-skeleton.tsx`:

A skeleton loading component for inspector panels and tree views:
```ts
interface SkeletonRowProps {
  variant: 'tree-row' | 'property-row' | 'chart';
  count?: number; // number of skeleton rows
}
```

Renders shimmer-animated placeholder rows matching the dimensions of real rows.

### 8. Wire StatusBar into the main layout

In the frontend's root layout component, add the StatusBar below the bottom dock:
- Read from `useConnectionStore`, `useSimulationStore`, `useMechanismStore`
- Entity counts: `bodies.size`, `joints.size`, `loads.size`
- Status bar is always visible, never collapsible

## Architecture Constraints
- StatusBar and ConnectionBanner are pure presentational components in `packages/ui/` — no store imports
- The frontend wires stores to these components in product-level code
- Toast store is frontend-level (not ui package)
- Connection status must be reactive — use Zustand subscription
- No protocol changes — connection status is inferred from WebSocket events
- Status bar must not interfere with bottom dock resize handle

## Acceptance Criteria
- Status bar visible at bottom of window showing connection state, sim state, time, entity counts
- Connection dot animates (pulse) during reconnection
- Disconnection banner appears when engine disconnects
- Error toasts appear for engine errors and compilation failures
- Empty states show helpful messages with action prompts
- Invalid numeric inputs show red border and error message
- Loading skeletons render in inspector when data is loading
- `pnpm --filter @motionlab/ui typecheck` passes
- `pnpm --filter @motionlab/frontend typecheck` passes

## What NOT to Build
- Memory/performance monitor in status bar (stretch goal, defer)
- Undo/redo buttons in status bar (separate epic)
- Progress bar for import (would require protocol changes — defer)
- Compilation progress detail (would require engine protocol addition)
```

---

## Prompt 3: Context Menus, Tooltips & Micro-interactions

```
# Epic 19 — Context Menus, Tooltips & Micro-interactions

You are standardizing context menus across tree and viewport, adding a tooltip system for toolbar buttons and inspector labels, and implementing micro-interactions (transitions, selection feedback, mode indicators) that give the UI a professional, responsive feel.

Professional CAD tools feel alive because every interaction has immediate, consistent feedback. MotionLab currently has context menus (Body, Joint, Datum) but they are only wired to the tree — viewport context menus are incomplete. Tooltips are missing. Transitions are absent or inconsistent.

## Read These First (in order)
- `docs/briefs/ui-feedback-1.md` — sections on context menus, hover affordances, selection states
- `packages/ui/AGENTS.md` — UI package rules
- `packages/ui/src/components/primitives/context-menus.tsx` — existing context menu components
- `packages/ui/src/components/primitives/toolbar-button.tsx` — existing toolbar button
- `packages/frontend/src/components/ViewportContextMenu.tsx` — existing viewport context menu
- `packages/frontend/src/components/ViewportOverlay.tsx` — viewport overlay with keyboard shortcuts
- `packages/frontend/src/components/ProjectTree.tsx` — tree with context menus
- `packages/ui/src/globals.css` — motion tokens (--duration-fast, --duration-normal, --easing-default)

## What Exists Now

### Context Menus (`context-menus.tsx`)
Three typed context menus: `BodyContextMenu`, `JointContextMenu`, `DatumContextMenu`. Each wraps children in a Radix ContextMenu. Items have consistent h-7/px-3 styling. Keyboard shortcuts shown via `ContextMenuShortcut`. BodyContextMenu has: Select in Viewport, Isolate (I), Hide/Show (H), Create Datum, Create Joint, Rename (F2), Properties, Delete (Del). JointContextMenu has: Select, Focus, Edit, Change Type submenu, Swap Bodies, Reverse Direction, Rename, Properties, Delete. DatumContextMenu has: Select, Focus, Create Joint, Rename, Properties, Delete.

### ViewportContextMenu (`ViewportContextMenu.tsx`)
A separate viewport-specific context menu — probably basic right now with camera presets and grid toggle.

### Toolbar Buttons
`ToolbarButton` component exists but likely has no tooltip integration. `ViewportToolModeToolbar` and `ViewportCameraToolbar` render toolbar buttons.

### Keyboard Shortcuts
Defined in `ViewportOverlay.tsx` useEffect handler: V=Select, D=Create Datum, J=Create Joint, W=Translate, E=Rotate, Q=Off, H=Hide, F=Focus/Fit, Delete=Delete, Space=Play/Pause, .=Step, R=Reset. Also `KeyboardShortcutsDialog` exists.

### Motion Tokens
`--duration-fast: 100ms`, `--duration-normal: 160ms`, `--duration-slow: 240ms`, `--easing-default: cubic-bezier(0.2, 0, 0, 1)`, `--easing-out: cubic-bezier(0, 0, 0.2, 1)`.

## What to Build

### 1. Standardize viewport context menu

Update `ViewportContextMenu.tsx` to be context-aware:

When right-clicking **on an entity** (body/datum/joint), show the entity-specific context menu (same as tree right-click). When right-clicking **on empty viewport**, show the viewport background menu:

```
┌─────────────────────────┐
│ Camera                  │
│   ├ Front           (1) │
│   ├ Back            (3) │
│   ├ Left            (4) │
│   ├ Right           (6) │
│   ├ Top             (7) │
│   ├ Bottom          (9) │
│   └ Fit All         (F) │
│─────────────────────────│
│ Grid                    │
│   ├ Toggle Grid     (G) │
│   └ Snap to Grid        │
│─────────────────────────│
│ Display                 │
│   ├ Shaded              │
│   ├ Wireframe           │
│   └ Shaded + Wireframe  │
│─────────────────────────│
│ Show All Hidden         │
│ Reset View              │
└─────────────────────────┘
```

Implementation: in the viewport's `onContextMenu` handler, check if the right-click hit an entity (use the existing picking system). If yes, render the entity-type context menu. If no, render the background menu.

### 2. Add icons to context menu items

Update all context menus to include Lucide icons before item text:
- Select in Viewport: `MousePointerClick`
- Isolate: `ScanSearch`
- Hide/Show: `Eye` / `EyeOff`
- Create Datum: `Crosshair`
- Create Joint: `Link2`
- Rename: `Pencil`
- Properties: `Settings2`
- Delete: `Trash2`
- Focus: `Focus`
- Swap Bodies: `ArrowLeftRight`
- Camera presets: `Camera`
- Grid: `Grid3x3`

Add disabled state with tooltip: items that cannot be used show `text-disabled` with a `title` attribute explaining why (e.g., "Cannot delete while simulation is running").

### 3. Tooltip system for toolbar buttons

Add tooltip props to `ToolbarButton`:

```ts
interface ToolbarButtonProps {
  // ... existing props
  tooltip?: string;
  shortcut?: string; // e.g. "V", "Ctrl+Z"
}
```

Render using shadcn `Tooltip` (already available):
```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <button ...>{icon}</button>
  </TooltipTrigger>
  <TooltipContent side="bottom" sideOffset={4}>
    <span>{tooltip}</span>
    {shortcut && <kbd className="...">{shortcut}</kbd>}
  </TooltipContent>
</Tooltip>
```

Tooltip styling:
- Background: `bg-[var(--layer-elevated)]`
- Border: `border border-[var(--border-default)]`
- Text: `text-xs text-[var(--text-primary)]`
- Shortcut kbd: monospace, `bg-[var(--layer-recessed)]` `px-1 rounded-[var(--radius-sm)]`
- Delay: 300ms open, 100ms close (set via TooltipProvider `delayDuration`)
- Max width: 200px

Wire tooltips to all existing toolbar buttons in `ViewportToolModeToolbar` and `ViewportCameraToolbar`:
- Select: "Select Mode (V)"
- Create Datum: "Create Datum (D)"
- Create Joint: "Create Joint (J)"
- Translate: "Move (W)"
- Rotate: "Rotate (E)"
- Fit All: "Fit All (F)"
- etc.

### 4. Inspector label tooltips

Add `title` attributes to all `PropertyRow` labels. For labels that truncate, this provides the full property name on hover. For engineering properties, include a brief description:

Update `PropertyRow` to accept a `labelTooltip` prop:
```ts
interface PropertyRowProps {
  // ... existing props
  labelTooltip?: string; // shown on hover over label
}
```

Render as `title={labelTooltip ?? (typeof label === 'string' ? label : undefined)}` on the label span.

### 5. Micro-interactions: panel expand/collapse

The InspectorSection already has height transitions. Verify and improve:
- Transition: `transition-[height] duration-[var(--duration-normal)] ease-[var(--easing-default)]` (already present on Collapsible.Panel)
- Add chevron rotation transition: `transition-transform duration-[var(--duration-fast)]` on the ChevronRight (already present)
- Verify the transition is smooth (no layout jump)

### 6. Micro-interactions: selection feedback

When an entity is selected (tree click or viewport pick), add a brief visual pulse:
- TreeRow: on selection, apply a brief `animate-[selection-pulse_300ms_ease-out]` keyframe that flashes the selection background at higher opacity then settles
- Add the keyframe to `globals.css`:
```css
@keyframes selection-pulse {
  0% { background-color: var(--selection-fill-strong); }
  100% { background-color: var(--selection-row); }
}
```

### 7. Micro-interactions: value change feedback

When a numeric input value changes (from engine update, not user edit), briefly flash the background:
- Add a `flashOnChange` prop to NumericInput (default false)
- When value changes and input is not focused, apply a 200ms background flash using `var(--accent-soft)`
- Use a ref to track previous value and a CSS transition

### 8. Micro-interactions: viewport mode indicator

When the tool mode changes (select, create-datum, create-joint), show a brief toast-like indicator in the viewport:

```
┌──────────────────┐
│  ✦ Select Mode   │
└──────────────────┘
```

- Appears center-top of viewport
- Auto-dismisses after 1.5s
- Animate: fade-in + slide-down on appear, fade-out on dismiss
- Styling: `bg-[var(--layer-elevated)]/90 backdrop-blur-sm text-xs rounded-[var(--radius-md)] px-3 py-1.5`
- Show mode name and icon

### 9. Cursor changes for drag interactions

Add cursor style tokens:
- Drag handle: `cursor-grab` (rest), `cursor-grabbing` (active)
- FloatingToolCard header already has this
- Add to panel resize handles if not present
- Tree rows: add `cursor-pointer` to clickable rows
- Numeric input: add `cursor-ew-resize` for future scrub-on-drag (visual indicator only for now)

## Architecture Constraints
- Context menu item configuration should stay in `packages/ui/` as reusable components
- Viewport-specific context menu wiring (which entity was right-clicked) belongs in `packages/frontend/`
- Tooltip content (strings) can live in the component that renders the toolbar — no separate i18n for now
- Micro-interaction animations must use transform/opacity for GPU acceleration where possible
- Pulse/flash animations should not block interaction — use CSS animations, not JS-driven

## Acceptance Criteria
- Right-clicking a body/datum/joint in the viewport shows the same context menu as right-clicking in the tree
- Right-clicking empty viewport shows camera/grid/display menu
- All context menu items have icons and keyboard shortcuts displayed
- All toolbar buttons have tooltips with name + shortcut
- Tooltip delay: 300ms on hover before showing
- Inspector section expand/collapse is smooth (no jumping)
- Selection creates a brief visual pulse on the selected row
- Tool mode change shows a brief indicator toast in the viewport
- Disabled context menu items are grayed with explanatory title
- `pnpm --filter @motionlab/ui typecheck` passes
- `pnpm --filter @motionlab/frontend typecheck` passes

## What NOT to Build
- Rich tooltips with preview content (e.g., inertia tensor preview) — defer
- Drag-and-drop reordering in tree (future epic)
- Numeric input scrub-on-drag behavior (just the cursor hint for now)
- Undo/redo keyboard shortcuts (separate epic)
- Full keyboard navigation of tree (a11y improvement, separate pass)
```

---

## Prompt 4: Dark Theme Refinement & Theming Infrastructure

```
# Epic 19 — Dark Theme Refinement & Theming Infrastructure

You are auditing and refining the dark theme across all components, improving tonal separation between major UI regions, fixing contrast issues, and establishing theming infrastructure that keeps light theme support possible. The dark theme should feel "engineered, calm, deep, and precise" — not merely dark.

The feedback audit (`ui-feedback-1.md`) identifies the dark theme as "beautifully subdued but too uniform" — the viewport and panels blend together, hierarchy depends too much on text and borders instead of surface planes, and it feels like a "dark-themed admin app rather than workstation software."

## Read These First (in order)
- `docs/briefs/ui-feedback-1.md` — dark theme section, light theme section, "visual language changes with disproportionate payoff"
- `packages/ui/src/globals.css` — full token system with :root (light) and .dark overrides
- `packages/ui/AGENTS.md` — UI package rules
- All component files in `packages/ui/src/components/primitives/` — audit each for dark theme issues
- All component files in `packages/ui/src/components/engineering/` — engineering displays
- `packages/ui/src/components/ui/dialog.tsx` — shadcn dialog
- `packages/ui/src/components/ui/select.tsx` — shadcn select
- `packages/ui/src/components/ui/command.tsx` — shadcn command palette
- `packages/frontend/src/components/ProjectTree.tsx` — tree in context
- `packages/frontend/src/components/BodyInspector.tsx` — inspector in context

## What Exists Now

### Dark Theme Tokens (`.dark` in globals.css)
Carbon g100-based palette:
- `--bg-app: #161616` (deepest)
- `--layer-base: #262626` (panels)
- `--layer-raised: #393939` (cards, elevated panels)
- `--layer-elevated: #525252` (popovers, tooltips)
- `--bg-viewport: #161616` (same as bg-app — this is a problem)

- Text: `--text-primary: #f4f4f4`, `--text-secondary: #c6c6c6`, `--text-tertiary: #a8a8a8`, `--text-disabled: #525252`
- Borders: `--border-default: #525252`, `--border-strong: #6f6f6f`, `--border-subtle: #393939`
- Accent: `--accent-primary: #4589ff` (Carbon blue-60)
- Shadows: increased opacity (0.2-0.4 range)

### Known Issues
1. `--bg-viewport` = `--bg-app` = `#161616` — viewport and app frame are the same color, zero tonal separation
2. `--layer-base` (#262626) is very close to `--bg-app` (#161616) — panels barely differentiate from background
3. `--layer-elevated` (#525252) is the same as `--border-default` (#525252) — elevated surfaces and borders conflict
4. Focus rings use `var(--layer-base)` as inner ring color — may not provide enough contrast
5. Tree guide lines use `rgba(255,255,255,0.06)` — potentially invisible
6. Inertia matrix diagonal uses translucent blue — verify contrast
7. Field elevated (#333333) and field base (#262626) are very close in luminance

## What to Build

### 1. Redefine dark theme tonal hierarchy

Update `.dark` in `globals.css` with stronger tonal separation. The principle: **4 clearly distinct luminance bands**.

```css
.dark {
  /* Band 1: App frame — deepest, recedes */
  --bg-app: #121212;           /* was #161616, slightly darker */

  /* Band 2: Viewport — slightly lighter than frame, but still dark */
  --bg-viewport: #1a1a1a;     /* was #161616 — NOW DISTINCT from bg-app */

  /* Band 3: Side panels — clearly lighter than viewport */
  --layer-base: #1e1e1e;      /* was #262626 — bring down slightly for subtlety */
  --layer-recessed: #181818;  /* was #161616 — darker than base but not as dark as app */

  /* Band 4: Raised/elevated — clearly lighter than panels */
  --layer-raised: #2a2a2a;    /* was #393939 — keep distinctly lighter */
  --layer-elevated: #333333;  /* was #525252 — lower it so it doesn't clash with borders */
}
```

The key changes:
- `--bg-viewport` is no longer identical to `--bg-app` — the viewport is a distinct darker plane
- `--layer-elevated` no longer equals `--border-default`
- Overall luminance progression is: app-frame (darkest) → viewport (dark) → panels (medium) → raised/elevated (lightest)

Test the exact hex values against the full component set. The important thing is **4 visually distinct steps**, not the specific hex values.

### 2. Border visibility audit

Walk through every component and verify borders are visible in dark theme:
- `--border-subtle` (#393939) on `--layer-base` (#1e1e1e): contrast ratio should be at least 1.5:1
- `--border-default` (#525252) should be clearly visible against all panel backgrounds
- `--border-strong` (#6f6f6f) should be the most prominent border

If `--border-subtle` is invisible, raise it:
```css
--border-subtle: #333333;  /* was #393939 — test this against new layer-base */
```

### 3. Fix focus ring visibility

Current focus ring: `0 0 0 2px var(--layer-base), 0 0 0 4px var(--accent-primary)`. The inner ring (layer-base) should contrast against the element's own background. Test:
- Focus ring on an input inside a panel (bg = layer-base) → inner ring is invisible
- Fix: use `--bg-app` as inner ring color in dark theme, or use a distinct `--focus-ring-inner` token

```css
.dark {
  --focus-ring: 0 0 0 2px var(--bg-app), 0 0 0 4px var(--accent-primary);
  --focus-ring-inset: 0 0 0 2px var(--bg-app), 0 0 0 4px var(--accent-primary);
}
```

### 4. Shadow direction and intensity audit

Dark theme shadows should be more subtle (dark on dark has diminishing returns) but still create depth for floating elements:

```css
.dark {
  --shadow-low: 0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2);
  --shadow-medium: 0 4px 12px rgba(0, 0, 0, 0.35), 0 2px 4px rgba(0, 0, 0, 0.2);
  --shadow-overlay: 0 8px 24px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.25);
}
```

Verify FloatingToolCard, context menus, popovers, and dialogs have visible shadows against the dark viewport.

### 5. Text contrast verification (WCAG AA)

Verify all text/background combinations meet WCAG AA (4.5:1 for normal text, 3:1 for large text):

| Text Token | Background | Ratio Target |
|---|---|---|
| `--text-primary` (#f4f4f4) | `--layer-base` (new #1e1e1e) | > 4.5:1 |
| `--text-secondary` (#c6c6c6) | `--layer-base` (new #1e1e1e) | > 4.5:1 |
| `--text-tertiary` (#a8a8a8) | `--layer-base` (new #1e1e1e) | > 3:1 (used for metadata only) |
| `--text-disabled` (#525252) | `--layer-base` (new #1e1e1e) | > 3:1 (minimum for disabled) |
| `--accent-text` (#78a9ff) | `--layer-base` (new #1e1e1e) | > 4.5:1 |

If any fail, adjust the text token value upward (lighter).

### 6. Component-specific dark theme fixes

Walk through each component and fix issues:

**InspectorSection header:**
- Currently `bg-[var(--layer-recessed)]` — in dark theme this should be visibly different from the section body (`--layer-base`). Verify the new token values create a clear distinction.

**NumericInput inline variant:**
- Transparent background → hover shows `field-elevated` → focus shows `layer-base` + accent border. Verify the transitions look smooth in dark theme and the field doesn't "disappear" against the panel.

**TreeRow selection:**
- `--selection-row: rgba(91, 141, 239, 0.12)` — verify this is visible on the new `--layer-base`. If too faint, increase to 0.15 or 0.18.
- Tree guide lines: `rgba(255, 255, 255, 0.06)` — increase to 0.08 if invisible.

**FloatingToolCard:**
- Should feel clearly elevated above the viewport. Verify `--layer-elevated` + `--shadow-overlay` creates visible separation.
- The accent top border (from Prompt 1) should be clearly visible.

**Dialog/Select/Command (shadcn):**
- Verify `--popover` (`--layer-elevated`) provides good contrast for dialog content.
- Check input fields inside dialogs aren't invisible.

**Engineering displays (vec3, quat, inertia):**
- Axis color text (red/green/blue) must remain readable on dark backgrounds. Test `--axis-x` (#d94b4b), `--axis-y` (#2e9b53), `--axis-z` (#3b74f2) against `--layer-base`.
- If any axis color fails contrast: use lighter variants in dark theme only.

### 7. Viewport chrome: semi-transparent overlays

Update viewport overlay components to use semi-transparent backgrounds with backdrop blur:

In `ViewportOverlay.tsx` and `ViewportHUD`:
- Tool mode toolbar: `bg-[var(--layer-base)]/85 backdrop-blur-sm`
- Camera toolbar: `bg-[var(--layer-base)]/85 backdrop-blur-sm`
- Selection chip: `bg-[var(--layer-base)]/90 backdrop-blur-sm`
- Mode indicator toast: `bg-[var(--layer-elevated)]/90 backdrop-blur-sm`

This makes floating viewport chrome feel integrated with the 3D scene rather than pasted on top.

### 8. Theming infrastructure: token organization

Ensure the token system supports future light theme refinement (without implementing light theme changes now):

- All color decisions go through CSS custom properties — no hardcoded hex in component files
- Search all `.tsx` files for hardcoded colors (`#`, `rgb(`, `rgba(`) and replace with token references
- Document the token hierarchy in a comment block at the top of `globals.css`:

```css
/* ============================================================
   Token Hierarchy — How surface colors relate

   App frame:    --bg-app           (deepest background)
   Viewport:     --bg-viewport      (3D scene background)
   Side panels:  --layer-base       (panel body)
   Panel insets: --layer-recessed   (section headers, recessed areas)
   Cards:        --layer-raised     (elevated cards, dropdowns)
   Popovers:     --layer-elevated   (tooltips, floating tool cards)

   Each layer step should be visually distinct at a glance.
   In dark theme, layers go lighter. In light theme, layers vary.
   ============================================================ */
```

### 9. ViewCube dark theme consistency

Update the ViewCube component (`view-cube.tsx`) to use token colors:
- Cube face: `bg-[var(--layer-raised)]` with `border-[var(--border-default)]`
- Cube face hover: `bg-[var(--layer-raised-hover)]`
- Cube face text: `text-[var(--text-secondary)]`
- Active face: `bg-[var(--accent-soft)]` with `text-[var(--accent-text)]`

## Architecture Constraints
- All changes are CSS token or component styling level — no protocol or engine changes
- Token value changes must be tested against ALL components that reference them — changing `--layer-base` affects dozens of components
- Use longhand padding (ps-/pe-) not shorthand (px-)
- WCAG AA compliance is required for all text on interactive backgrounds
- Light theme tokens (:root) should remain functional — do not break light theme even if it is not actively used
- Test in both Electron and web targets
- Backdrop-blur has GPU cost — use sparingly, only on viewport overlays

## Acceptance Criteria
- Dark theme has 4 clearly distinct luminance bands (frame, viewport, panels, elevated)
- Viewport background is visually distinct from panel backgrounds
- All borders visible in dark theme
- Focus rings visible on all interactive elements
- All text meets WCAG AA contrast ratios against their backgrounds
- FloatingToolCard, dialogs, context menus feel elevated (visible shadow + tonal distinction)
- Viewport chrome uses semi-transparent backgrounds with backdrop blur
- No hardcoded hex colors in component `.tsx` files (all through tokens)
- Tree selection rows clearly visible
- Engineering axis colors readable in dark theme
- ViewCube consistent with token system
- `pnpm --filter @motionlab/ui typecheck` passes
- `pnpm --filter @motionlab/frontend typecheck` passes

## What NOT to Build
- Light theme overhaul (infrastructure supports it, but defer actual refinement)
- Theme switching UI (toggle exists, this is about quality not switching)
- Custom user color themes
- High contrast accessibility theme (future, but WCAG AA compliance now)
- Component Storybook dark theme stories (nice-to-have, defer)
```

---

## Integration Verification

After all four prompts complete, verify the full polish pass:

1. **Density check:** Open a project with 5+ bodies, each with datums and joints. The tree and inspector should feel noticeably denser than before — more entities visible without scrolling, more properties visible per screen.
2. **Status bar:** Bottom of window shows connection state (green dot + "Connected"), simulation state ("Idle"), and entity counts. Disconnect the engine — banner appears, status bar dot turns red.
3. **Context menus:** Right-click a body in the tree — see context menu with icons and shortcuts. Right-click the same body in the viewport — see the same menu. Right-click empty viewport — see camera/grid/display menu.
4. **Tooltips:** Hover over any toolbar button for 300ms — tooltip appears with name and shortcut.
5. **Dark theme:** Switch to dark theme. Viewport is visually distinct from side panels. Panels are visually distinct from the app frame. Floating tool cards cast visible shadows. All text is readable. Focus rings are visible.
6. **Micro-interactions:** Click a tree row — brief selection pulse. Change tool mode — brief mode indicator in viewport. Collapse/expand an inspector section — smooth height transition.
7. **Error states:** Set a numeric input to an invalid value — red border + error message. Engine disconnects — connection banner + toast.
8. **Typecheck:** `pnpm --filter @motionlab/ui typecheck` and `pnpm --filter @motionlab/frontend typecheck` both pass.

## Out of Scope

- **Undo/redo infrastructure** — separate epic, requires protocol + store changes
- **Full keyboard navigation** — a11y pass, separate epic
- **Light theme refinement** — infrastructure supports it, but dark is primary
- **Secondary engineering toolbar** — important but requires new component architecture + tool mode integration (separate epic)
- **Advanced numeric input behavior** — scrub-on-drag, expression evaluation, unit parsing (separate epic)
- **Drag-and-drop tree reordering** — requires store + protocol support
- **Custom icon set** — currently using Lucide, custom engineering icons are a separate effort
