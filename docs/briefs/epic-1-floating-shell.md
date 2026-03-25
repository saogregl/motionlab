# Epic 1 — Floating Workspace Shell

**Execution order: Must be completed before Epics 2 and 3.**
**Depends on: nothing. Start immediately.**

---

## Mission

Replace the current docked, split-pane shell with a **viewport-first floating-panel layout**.
The viewport must own the screen. Panels float above it as anchored cards — not docked
edges consuming layout space. Panels remain **resizable** via invisible edge handles.
This epic delivers the **primitive system and shell refactor** that Epics 2 and 3 build on.

---

## Design principles (non-negotiable)

- Viewport takes the full screen behind everything
- Panels are floating anchored cards, not split-pane siblings of the viewport
- Panels are still **resizable** — drag handles are invisible (thin hover-to-reveal zones on inner edges)
- At most **3 depth layers**: viewport → panel cards → transient popovers/menus
- **Rounded corners** throughout: 4 px on panels, inputs, buttons (from Figma)
- **Subtle borders**, no shadow stacking
- Empty space inside panels is acceptable — do not fill every gap

---

## Design system: dark mode token targets

The following values come directly from the Figma design
(file `EmRYNVBkG6E5eu4RGzrQqs`, node `6:26` "Frame 5", containing left panel `8:315` and right panel `8:436`).
Update `packages/ui/src/globals.css` dark-mode overrides to match.

### Colors

| Token | Current dark value | Figma target | Usage |
|---|---|---|---|
| `--layer-base` | `#1e1e1e` | **`#1c1c1c`** | Panel backgrounds |
| `--layer-recessed` | `#181818` | **`#191a1a`** | Section cards inside panels |
| `--layer-raised` | `#2a2a2a` | **`#252626`** | Inputs, secondary buttons, add-buttons |
| `--layer-elevated` | `#333333` | `#333333` (keep) | Popovers, tooltips |
| `--bg-app` | `#121212` | **`#050505`** | App/viewport background |
| `--accent-primary` | `#4589ff` | **`#007aff`** | Active rows, focus rings, primary buttons |
| `--accent-hover` | `#78a9ff` | `#339dff` | Hover on accent elements |
| `--text-primary` | `#f4f4f4` | **`#e7e5e5`** | Main text in panels |
| `--text-secondary` | `#c6c6c6` | **`#acabab`** | Inactive row labels, metadata |
| `--text-disabled` | `#525252` | **`#5c5b5b`** | Search placeholder |
| `--border-default` | `#3d3d3d` | **`rgba(37,38,38,0.2)`** | Panel borders, section borders |
| `--border-strong` | `#6f6f6f` | **`rgba(172,171,171,0.1)`** | Button borders (secondary) |
| `--axis-x` | `#d94b4b` | **`#ff716c`** | X-axis labels in Vec3 inputs |
| `--axis-y` | `#2e9b53` | **`#4ade80`** | Y-axis labels |
| `--axis-z` | `#3b74f2` | **`#007aff`** | Z-axis labels |

### Spacing & sizing

| Token | Value | Usage |
|---|---|---|
| `--panel-float-inset` | `12px` | Gap from main-area edges to floating panels (all four sides) |
| `--panel-left-w` | `288px` | Left panel default width (matches Figma) |
| `--panel-right-w` | `288px` | Right panel default width (matches Figma) |
| `--panel-min-w` | `240px` | Minimum panel width when resizing |
| `--panel-max-w` | `420px` | Maximum panel width when resizing |
| `--panel-radius` | `4px` | Panel border radius |
| `--section-radius` | `4px` | Section card border radius |

Note: `--panel-float-top` and `--panel-float-bottom` are **not needed**. Because the titlebar
and status bar are in normal flex flow, the main area's edges already account for them.
Panels use `--panel-float-inset` for all four sides relative to the main area.

### Typography

The Figma design uses **IBM Plex Sans** throughout. The current codebase uses **Geist Variable**.
Replace the primary UI font with IBM Plex Sans:

```
pnpm --filter @motionlab/ui add @fontsource-variable/ibm-plex-sans
```

Then update `packages/ui/src/globals.css`:

```css
@import "@fontsource-variable/ibm-plex-sans/index.css";

:root {
  --font-ui: "IBM Plex Sans Variable", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
}
```

This replaces `Geist Variable` as the primary font. Weight usage from Figma:
- **Regular (400):** hierarchy row labels, nav items, input values (12 px)
- **Medium (500):** property row labels (10 px uppercase), button text (10 px)
- **Bold (700):** section headers (11 px, 0.55 px letter-spacing), panel titles (13 px), axis labels (9 px)

---

## Current codebase state

### Shell architecture

| Component | File | Role |
|---|---|---|
| `AppShell` | `packages/ui/src/components/shell/app-shell.tsx` | 5-row grid: topbar → toolbar → `PanelGroup` (left/center/right) → tabbar → statusbar |
| `LeftPanel` | `packages/ui/src/components/shell/left-panel.tsx` | Docked left, 260 px default, 200–380 px range, resizable |
| `RightPanel` | `packages/ui/src/components/shell/right-panel.tsx` | Docked right, 320 px default, 280–440 px range, always rendered |
| `BottomDock` | `packages/ui/src/components/shell/bottom-dock.tsx` | Collapsible bottom slab, 240 px default, tabs: Timeline/Charts/Diagnostics |
| `TopBar` | `packages/ui/src/components/shell/top-bar.tsx` | 38 px row: logo, project name, command search, status badge, file actions |
| `SecondaryToolbar` | `packages/ui/src/components/shell/secondary-toolbar.tsx` | 32 px row: all tool buttons, sim controls, create entity split buttons |
| `ViewportHUD` | `packages/ui/src/components/shell/viewport-hud.tsx` | Absolutely positioned overlay with 6 slots (topLeft…bottomRight) |
| `WorkspaceTabBar` | `packages/ui/src/components/shell/workspace-tab-bar.tsx` | **Exists but is wired to nothing in `App.tsx`** — 28 px, ready for Epic 3 |
| `StatusBar` | `packages/ui/src/components/primitives/status-bar.tsx` | 24 px bottom: connection, sim state, entity counts, DOF, time |

**Layout engine:** `react-resizable-panels` v4.7.3. Horizontal group: left | center | right. Vertical group in center: viewport | bottom dock.

**Panel state store:** `packages/frontend/src/stores/ui-layout.ts` (`useUILayoutStore`)
- Currently holds: `bottomDockExpanded`, `bottomDockActiveTab`
- Needs new fields: `leftPanelOpen`, `rightPanelOpen`, panel widths

**App root:** `packages/frontend/src/App.tsx`
- Composes `AppShell` with all slots
- Dialogs are siblings to `AppShell`, not nested (correct pattern — keep)
- No router — pure Zustand state machine

### Viewport container

| Component | File | Role |
|---|---|---|
| `ViewportOverlay` | `packages/frontend/src/components/ViewportOverlay.tsx` | Relative container wrapping R3F canvas + HUD + floating overlays |
| `Viewport` | `packages/viewport/src/R3FViewport.tsx` | React Three Fiber canvas, exported as `Viewport` |
| `ViewportToolModeToolbar` | `packages/frontend/src/components/ViewportToolModeToolbar.tsx` | **Already exists** as a floating pill on the viewport (select/datum/joint) |

### Existing floating primitive

`packages/ui/src/components/primitives/floating-tool-card.tsx` — `FloatingToolCard` already exists.
It is a starting reference for the `FloatingPanel` primitive.

---

## Floating panel architecture

### Overall layout: flex column + absolute main area

The `AppShell` remains a `flex flex-col h-screen` container. The **titlebar** and **status bar** stay in
normal flex flow — they are not absolutely positioned. Only the **main area** between them uses
absolute positioning for the viewport and floating panels.

This avoids fighting Electron's `-webkit-app-region: drag` requirement and keeps the titlebar/status bar
at their natural heights without `calc()` gymnastics.

```
AppShell (h-screen w-screen flex flex-col)
├── TopBar (shrink-0, h-[--topbar-h] = 38px, normal flow, -webkit-app-region: drag)
├── main area (flex-1, position: relative, overflow: hidden)
│   ├── Viewport (position: absolute, inset: 0, z-index: 0)
│   ├── FloatingPanel left (position: absolute, inset: 12px from edges)
│   ├── FloatingPanel right (position: absolute, inset: 12px from edges)
│   ├── FloatingBottomDock (position: absolute, bottom: 12px, centered)
│   └── ViewportHUD (position: absolute, inset: 0, pointer-events: none)
├── WorkspaceTabBar (shrink-0, h-[--bottom-tabs-h] = 28px, optional, normal flow)
└── StatusBar (shrink-0, h-[--statusbar-h] = 24px, normal flow)
```

**Why this works:**
- The titlebar's `38px` is consumed by the flex layout before the main area gets its space — panels don't need to know the titlebar height
- `--panel-float-inset` (12 px) is the only spacing token panels need — it's the gap from the **main area** edges, not the window edges
- The viewport fills the main area completely (`position: absolute; inset: 0`), starting right below the titlebar
- The status bar and workspace tab bar are also in normal flow below the main area — no overlap
- Adding the `WorkspaceTabBar` in Epic 3 just takes another slice of flex space, pushing the main area up automatically
- Electron's `-webkit-app-region: drag` continues to work because the titlebar is a normal block element

### Depth layers (within the main area)

1. **Viewport** (`z-index: 0`): R3F canvas, `position: absolute; inset: 0`
2. **Panel layer** (`z-index: var(--z-panel)` = 10): `FloatingPanel` cards, `position: absolute`
3. **Toolbar layer** (`z-index: var(--z-toolbar)` = 20): Floating pill toolbars
4. **Popover layer** (`z-index: var(--z-popover)` = 50): Menus, tooltips, dialogs — unchanged

### Resize behavior

Panels are **resizable** via invisible drag handles on their inner edges:

- A thin (1–2 px visible, ~8 px hit zone) transparent area on the panel's inner edge
- `cursor: col-resize` on hover
- Drag updates `panelLeftWidth` / `panelRightWidth` in `useUILayoutStore`
- Clamped to `[--panel-min-w, --panel-max-w]`
- Width persisted in store (survives panel close/reopen)
- **No visible separator chrome** — no background, no border on the handle itself

This replaces `react-resizable-panels` for the horizontal split. The vertical split (viewport/bottom-dock) can continue using `react-resizable-panels` within the center area if needed.

---

## New primitives to build

All new files go in `packages/ui/src/components/shell/`.
Export all from `packages/ui/src/index.ts`.

### `FloatingPanel`

**File:** `packages/ui/src/components/shell/floating-panel.tsx`

```tsx
interface FloatingPanelProps {
  side: 'left' | 'right';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  onWidthChange?: (width: number) => void;
  className?: string;
  children: React.ReactNode;
}
```

**Visual spec:**
- `position: absolute` (within the main area container, **not** `position: fixed`)
- `top: var(--panel-float-inset)` / `bottom: var(--panel-float-inset)` (12 px from main area edges)
- `left: var(--panel-float-inset)` (left panel) / `right: var(--panel-float-inset)` (right panel)
- `width`: controlled via prop, default `var(--panel-left-w)` or `var(--panel-right-w)`
- `background: var(--layer-base)` → `#1c1c1c`
- `border-radius: var(--panel-radius)` → `4px`
- `border: 1px solid var(--border-default)`
- `overflow: hidden`
- `z-index: var(--z-panel)` → `10`
- `display: flex; flex-direction: column`
- Animate open/close with `translate-x` slide + `opacity` fade (`--duration-normal`)
- When `open === false`: translate off-screen + `pointer-events: none`
- **Inner-edge resize handle:** pseudo-element or child div, `position: absolute`, on the right edge (left panel) or left edge (right panel), 8 px wide hit zone, transparent, `cursor: col-resize`

**Important:** Panels are `position: absolute` relative to the main area, not `position: fixed` on the window. This means they automatically sit below the titlebar and above the status bar without any titlebar-height calculations.

### `FloatingPanelHeader`

**File:** `packages/ui/src/components/shell/floating-panel.tsx` (same file, sub-export)

```tsx
interface FloatingPanelHeaderProps {
  children: React.ReactNode;
  className?: string;
}
```

**Visual spec (from Figma node `8:418`):**
- `height: 44px`
- `background: var(--layer-base)` → `#1c1c1c`
- `border-bottom: 1px solid var(--border-default)`
- `padding: 0 16px`
- `display: flex; align-items: center; justify-content: space-between`

### `FloatingSection` (restyle of `InspectorSection`)

The existing `InspectorSection` at `packages/ui/src/components/primitives/inspector-section.tsx`
already uses `@base-ui/react/collapsible`. Restyle it for the floating panel context:

**Visual spec (from Figma node `8:450` "Transform Section", `8:523` "Camera Section"):**
- Outer card: `background: var(--layer-recessed)` → `#191a1a`; `border: 1px solid var(--border-default)`; `border-radius: 4px`
- Section header row: `height: 28px`; `padding: 0 8px`
- Chevron: `7×4px` (matches Figma's small caret, not the current larger `ChevronRight`)
- Title: `font-family: var(--font-ui)`; `font-size: 11px`; `font-weight: 700`; `letter-spacing: 0.55px`; `color: var(--text-primary)`

### `FloatingToolbar`

The existing `ViewportToolbar` at `packages/ui/src/components/primitives/viewport-toolbar.tsx`
is the basis. Keep it, but ensure it matches:

- `background: var(--layer-elevated)`
- `border-radius: 8px` (pill, slightly rounder than panels)
- `box-shadow: var(--shadow-medium)`
- `padding: 4px`
- Vertical orientation with `gap: 2px` between buttons
- `z-index: var(--z-toolbar)` → `20`

---

## Implementation scope

### Phase 1 — Foundation (all tasks parallel)

> These have no dependencies on each other. Run simultaneously.

**P1-A: Token and font update**
- File: `packages/ui/src/globals.css`
- Update dark mode CSS variable overrides with Figma values listed above
- Add `@fontsource-variable/ibm-plex-sans` import, replace Geist as `--font-ui`
- Add `--panel-float-inset`, `--panel-radius`, `--panel-min-w`, `--panel-max-w` tokens
- **No component changes in this PR**

**P1-B: `FloatingPanel` primitive**
- Create `packages/ui/src/components/shell/floating-panel.tsx`
- Includes: `FloatingPanel` (with built-in resize handle), `FloatingPanelHeader`
- Resize logic: `onPointerDown` → `onPointerMove` (throttled) → `onPointerUp` on the inner-edge handle
- Add Storybook story: `floating-panel.stories.tsx`
- Export from `packages/ui/src/index.ts`
- **No wiring to app shell yet**

**P1-C: `InspectorSection` restyle**
- File: `packages/ui/src/components/primitives/inspector-section.tsx`
- Update visual tokens to match Figma (`--layer-recessed` bg, `var(--border-default)` border, small caret)
- Keep all existing props — this is a visual-only update
- Update Storybook story

### Phase 2 — Shell migration (sequential after Phase 1)

> P1-A and P1-B must complete before Phase 2. P2-A and P2-B can run in parallel.

**P2-A: Rewrite `AppShell` for floating layout**
- File: `packages/ui/src/components/shell/app-shell.tsx`
- **Clean break** — replace the current docked layout entirely, no backwards compat
- New structure (flex column):
  1. `TopBar` (shrink-0, normal flow, keeps `-webkit-app-region: drag`)
  2. Main area (`flex-1, position: relative, overflow: hidden`) — contains:
     - Viewport slot (`position: absolute; inset: 0; z-index: 0`)
     - Left `FloatingPanel` (`position: absolute`, `z-index: var(--z-panel)`)
     - Right `FloatingPanel` (`position: absolute`, `z-index: var(--z-panel)`)
     - Bottom dock (`position: absolute`, centered)
     - `ViewportHUD` overlay
  3. `WorkspaceTabBar` (shrink-0, optional, normal flow — wired in Epic 3)
  4. `StatusBar` (shrink-0, normal flow)
- Remove `react-resizable-panels` `PanelGroup` from the horizontal split
- Remove `SecondaryToolbar` row (tools move in Epic 2)
- Update all consumers (`App.tsx`, Storybook stories) to the new API in the same PR

**P2-B: Extend `useUILayoutStore`**
- File: `packages/frontend/src/stores/ui-layout.ts`
- Add: `leftPanelOpen: boolean` (default `true`)
- Add: `rightPanelOpen: boolean` (default `true`)
- Add: `leftPanelWidth: number` (default `288`)
- Add: `rightPanelWidth: number` (default `288`)
- Add actions: `toggleLeftPanel()`, `toggleRightPanel()`, `setLeftPanelWidth()`, `setRightPanelWidth()`

**P2-C: Wire `FloatingPanel` into `App.tsx`**
- File: `packages/frontend/src/App.tsx`
- Wire `leftPanelOpen`, `rightPanelOpen`, and panel widths from `useUILayoutStore` to the new `AppShell` API
- Left `FloatingPanel` wraps the existing `LeftPanel` children (no content change)
- Right `FloatingPanel` wraps the existing `RightPanel` children (no content change)

### Phase 3 — Bottom dock floating (sequential after Phase 2)

**P3-A: Float the bottom dock**
- File: `packages/ui/src/components/shell/bottom-dock.tsx`
- `position: absolute; bottom: var(--panel-float-inset); left: 50%; transform: translateX(-50%)` (within the main area)
- Width: `calc(100% - var(--panel-left-w) - var(--panel-right-w) - 4 * var(--panel-float-inset))`
- Height: collapsible, same as today
- Still uses `useUILayoutStore.bottomDockExpanded` / `bottomDockActiveTab`
- `background: var(--layer-base)`, `border-radius: 4px`, `border: 1px solid var(--border-default)`

### Phase 4 — Cleanup (sequential after Phase 3)

**P4-A: Keyboard shortcuts for panel toggle**
- `[` → toggle left panel (add to `packages/frontend/src/commands/definitions/view-commands.ts`)
- `]` → toggle right panel

**P4-B: Topbar chrome reduction**
- File: `packages/ui/src/components/shell/top-bar.tsx`
- Remove the `SecondaryToolbar` row from the default layout (tools move per Epic 2)
- The topbar itself stays: project name, command palette trigger, engine status, file actions
- Reduce visual weight — no horizontal rules, no heavy dividers

**P4-C: Update Storybook**
- Update `app-shell.stories.tsx` and `motionlab-shell.stories.tsx` to show floating mode
- Add `floating-panel.stories.tsx` story

---

## Acceptance criteria

- [ ] Build workspace renders with `FloatingPanel` cards above a full-bleed viewport
- [ ] The viewport fills the entire screen behind the panels (no split-pane gutters)
- [ ] Left and right panels are `position: absolute` anchored cards (within the main area) with `4px` border radius
- [ ] Panels are **resizable** by dragging their inner edges (invisible handles, `col-resize` cursor on hover)
- [ ] Panel widths persist in store across open/close cycles
- [ ] Panels open/close with smooth slide animation
- [ ] `[` / `]` toggles left / right panel
- [ ] Bottom dock is a floating card, not a permanently docked slab
- [ ] Token update: dark mode background, accent, border, and axis colors match Figma node `6:26`
- [ ] IBM Plex Sans loads and renders correctly as the primary UI font
- [ ] No more than 3 visual depth levels visible at once
- [ ] Result is not visually denser than the current layout
- [ ] All existing Storybook stories pass

---

## Out of scope

- Results workspace (Epic 3)
- Right panel show/hide on selection (Epic 2)
- Tool relocation (Epic 2)
- Entity/component system (Epic 4)
- Freeform draggable panels
- Multi-window results

---

## File checklist

| Action | File |
|---|---|
| **Create** | `packages/ui/src/components/shell/floating-panel.tsx` |
| **Create** | `packages/ui/src/components/shell/floating-panel.stories.tsx` |
| **Modify** | `packages/ui/src/globals.css` (tokens, font swap to IBM Plex Sans) |
| **Modify** | `packages/ui/src/components/shell/app-shell.tsx` (floating layout mode) |
| **Modify** | `packages/ui/src/components/shell/bottom-dock.tsx` (floating position) |
| **Modify** | `packages/ui/src/components/shell/top-bar.tsx` (chrome reduction) |
| **Modify** | `packages/ui/src/components/primitives/inspector-section.tsx` (restyle) |
| **Modify** | `packages/frontend/src/stores/ui-layout.ts` (new fields, widths) |
| **Modify** | `packages/frontend/src/App.tsx` (wire floating mode) |
| **Modify** | `packages/frontend/src/commands/definitions/view-commands.ts` (panel toggles) |
| **Modify** | `packages/ui/src/index.ts` (new exports) |
| **Modify** | `packages/ui/src/components/shell/app-shell.stories.tsx` |
| **Add dep** | `@fontsource-variable/ibm-plex-sans` (to `packages/ui`) |
| **Remove dep** | `@fontsource-variable/geist` (from `packages/ui`, after migration) |
