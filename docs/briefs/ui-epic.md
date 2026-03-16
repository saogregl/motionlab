# MotionLab Engineering UI Design Spec

## Agent Implementation Guide: shadcn → Engineering-Grade UI Library

**Version:** 1.0  
**Target stack:** React 18+ · TypeScript · Tailwind CSS v4 · shadcn/ui · Radix primitives  
**This document is the single source of truth for all UI implementation decisions.**

---

## Part 1 — Design Review Against Reference Images

### What the references prove

The 10 reference images (Onshape simulation, assembly, CAM studio, xDesign) establish a consistent pattern language that the original design doc correctly identifies but sometimes under-specifies. Here is a cross-reference audit.

### Reference image observations (measured from screenshots)

| Element                  | Onshape (measured)                                           | xDesign (measured)                | Spec recommendation          | Verdict                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------ | --------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top bar height           | 40–44px                                                      | 64–68px (includes breadcrumb row) | 44–48px                      | **Use 44px.** Onshape's is tighter and feels right. xDesign's taller bar is partly branding chrome.                                                                                               |
| Secondary toolbar height | 36px (icon row)                                              | 32–36px (icon row)                | 36–40px                      | **Use 36px.** Matches both references.                                                                                                                                                            |
| Left panel width         | 210–240px                                                    | 200–210px                         | 280–340px                    | **Start at 260px, allow 200–380px resize.** The spec over-estimates. References are narrower because tree text truncates aggressively. 260px is a good default that shows ~20 chars of node name. |
| Right panel width        | 300–380px (simulation panel)                                 | Not always present                | 320–380px                    | **Use 320px default.** Correct. Onshape's simulation panel is ~360px in the brake caliper screenshot.                                                                                             |
| Bottom dock height       | Not visible in most refs (collapsed)                         | N/A                               | 220–320px expanded           | **Use 240px default when expanded.** Keep collapsed by default.                                                                                                                                   |
| Tree row height          | ~24px                                                        | ~28px                             | Not specified                | **Use 28px comfortable, 24px compact.** Critical gap in original spec.                                                                                                                            |
| Tree icon size           | 16px                                                         | 16–18px                           | Not specified                | **Use 16px.**                                                                                                                                                                                     |
| Tree indent per level    | ~16px                                                        | ~20px                             | Not specified                | **Use 16px.**                                                                                                                                                                                     |
| Filter/search in tree    | Present (top of left panel)                                  | Present                           | Mentioned                    | Confirmed. Always present at top of tree panel.                                                                                                                                                   |
| Floating tool dialogs    | ~280px wide, compact sections                                | ~260px wide                       | Mentioned as "contextual"    | **Max width 300px for floating tool cards.** Important: these float over the viewport, not in a panel.                                                                                            |
| View cube                | ~80×80px, top-right of viewport                              | ~100×100px                        | Mentioned                    | **80×80px, fixed to viewport top-right corner inset 16px.**                                                                                                                                       |
| Workspace tab bar        | Bottom of screen, ~32px                                      | Bottom of screen, ~32px           | Not specified as bottom tabs | **Use bottom tab bar for workspace/document switching, 32px height.** This is a critical pattern both Onshape and xDesign use.                                                                    |
| Joint type color coding  | Visible in connectivity view: colored squares per joint type | Same                              | Mentioned                    | **Confirmed. Use color-coded square swatches (12×12px) next to joint type labels in legends.**                                                                                                    |
| Stress colormap          | Viridis (yellow-green-blue)                                  | N/A                               | Viridis/turbo recommended    | **Default to Viridis.** Matches Onshape reference.                                                                                                                                                |

### Gaps in the original design doc

1. **No tree row specification.** The doc mentions tree rows as a molecule but never defines height, padding, icon size, indent, or truncation rules. This is the highest-frequency component in the app.
2. **No floating tool card spec.** The doc says "contextual floating tools" but doesn't define positioning, sizing, dismiss behavior, or stacking.
3. **No bottom workspace tab bar.** Both Onshape and xDesign use a bottom bar for document/workspace tabs. The doc's "workbench switcher" is in the top bar, but the bottom bar is a separate concept (open documents/tabs).
4. **No viewport HUD layout spec.** The doc mentions overlays but doesn't define the fixed HUD regions (top-center for result controls, top-right for view cube, bottom-left for axis indicator, etc.).
5. **No keyboard shortcut spec.** Critical for engineering tools.
6. **No context menu spec.** Every tree row and viewport entity needs one.
7. **No drag-and-drop spec.** The doc defers this but tree reordering and panel resizing need it.
8. **Numeric input behavior is under-specified.** Scrub-on-drag, arrow key stepping, unit parsing, expression evaluation — all missing.

---

## Part 2 — CSS Token System

### Implementation: CSS custom properties on `:root` with `.dark` and `.compact` class overrides.

All tokens below are **the actual values to use**. Do not substitute.

```css
/* ============================================================
   FILE: globals.css (or tokens.css imported first)
   ============================================================ */

@layer base {
  :root {
    /* ── Radius ── */
    --radius-sm: 3px;
    --radius-md: 5px;
    --radius-lg: 8px;
    --radius-xl: 12px;

    /* ── Spacing (px) ── */
    --space-0: 0px;
    --space-1: 4px;
    --space-2: 8px;
    --space-3: 12px;
    --space-4: 16px;
    --space-5: 20px;
    --space-6: 24px;
    --space-8: 32px;
    --space-10: 40px;
    --space-12: 48px;

    /* ── Typography scale (rem, base 16px) ── */
    --text-2xs: 0.6875rem; /* 11px — dense metadata only */
    --text-xs: 0.75rem; /* 12px — tree secondary, units */
    --text-sm: 0.8125rem; /* 13px — default dense UI */
    --text-base: 0.875rem; /* 14px — primary body */
    --text-lg: 1rem; /* 16px — section titles */
    --text-xl: 1.125rem; /* 18px — panel titles */
    --text-2xl: 1.5rem; /* 24px — page titles */

    /* ── Line heights ── */
    --leading-tight: 1.2;
    --leading-normal: 1.4;
    --leading-relaxed: 1.6;

    /* ── Font weights ── */
    --weight-normal: 400;
    --weight-medium: 500;
    --weight-semibold: 600;
    --weight-bold: 700;

    /* ── Motion ── */
    --duration-fast: 100ms;
    --duration-normal: 160ms;
    --duration-slow: 240ms;
    --easing-default: cubic-bezier(0.2, 0, 0, 1);
    --easing-out: cubic-bezier(0, 0, 0.2, 1);

    /* ── Elevation / shadows ── */
    --shadow-none: none;
    --shadow-low: 0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
    --shadow-medium:
      0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04);
    --shadow-overlay:
      0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);

    /* ── Z-index layers ── */
    --z-base: 0;
    --z-panel: 10;
    --z-toolbar: 20;
    --z-floating: 30;
    --z-overlay: 40;
    --z-popover: 50;
    --z-modal: 60;
    --z-toast: 70;

    /* ── Layout ── */
    --topbar-h: 44px;
    --toolbar-h: 36px;
    --panel-left-w: 260px;
    --panel-left-min: 200px;
    --panel-left-max: 380px;
    --panel-right-w: 320px;
    --panel-right-min: 280px;
    --panel-right-max: 440px;
    --bottom-dock-h: 240px;
    --bottom-dock-min: 160px;
    --bottom-dock-max: 400px;
    --bottom-tabs-h: 32px;

    /* ── Tree ── */
    --tree-row-h: 28px;
    --tree-icon-size: 16px;
    --tree-indent: 16px;
    --tree-row-gap: 0px;

    /* ── Inspector ── */
    --inspector-section-gap: 2px;
    --inspector-row-h: 32px;
    --inspector-label-w: 100px;
  }

  /* ── Compact density override ── */
  .compact {
    --tree-row-h: 24px;
    --tree-icon-size: 14px;
    --tree-indent: 14px;
    --inspector-row-h: 28px;
    --topbar-h: 40px;
    --toolbar-h: 32px;
    --text-base: 0.8125rem;
    --text-sm: 0.75rem;
  }
}
```

### Color tokens — Light theme (default)

```css
@layer base {
  :root {
    /* ── Surface ── */
    --bg-app: #f3f5f8;
    --bg-panel: #ffffff;
    --bg-subtle: #eef2f6;
    --bg-elevated: #fafbfc;
    --bg-inset: #e8ecf1;
    --bg-viewport: #e2e6ec;

    /* ── Border ── */
    --border-default: #d9e0e7;
    --border-strong: #bdc7d2;
    --border-subtle: #e8ecf1;

    /* ── Text ── */
    --text-primary: #18212b;
    --text-secondary: #4c5a6a;
    --text-tertiary: #728094;
    --text-disabled: #a0aabb;
    --text-inverse: #ffffff;

    /* ── Accent (engineering blue) ── */
    --accent-primary: #2f6fed;
    --accent-hover: #245ed1;
    --accent-pressed: #1c4faf;
    --accent-soft: #dde8ff;
    --accent-soft-hover: #ccddff;
    --accent-text: #1d5ad4;

    /* ── Selection ── */
    --selection-fill: rgba(47, 111, 237, 0.08);
    --selection-fill-strong: rgba(47, 111, 237, 0.15);
    --selection-outline: #2f6fed;
    --selection-row: #e8f0fe;
    --selection-row-inactive: #eef2f6;

    /* ── Semantic states ── */
    --success: #1f8a4c;
    --success-soft: #e3f5ec;
    --warning: #b8791b;
    --warning-soft: #fff3dd;
    --danger: #c74646;
    --danger-soft: #fde8e8;
    --info: #2f6fed;
    --info-soft: #dde8ff;

    /* ── Engineering semantic — Axes ── */
    --axis-x: #d94b4b;
    --axis-y: #2e9b53;
    --axis-z: #3b74f2;

    /* ── Engineering semantic — Joint types ── */
    --joint-revolute: #d4880f;
    --joint-slider: #7c5cc4;
    --joint-cylindrical: #1a8a8a;
    --joint-ball: #b83daa;
    --joint-fixed: #6b7a8d;
    --joint-contact: #d05a2a;
    --joint-fastened: #4a5568;
    --joint-planar: #3182ce;

    /* ── Engineering semantic — Status ── */
    --status-compiled: #1f8a4c;
    --status-stale: #b8791b;
    --status-running: #2f6fed;
    --status-failed: #c74646;
    --status-warning: #d4880f;

    /* ── Interactive ── */
    --hover-overlay: rgba(0, 0, 0, 0.04);
    --pressed-overlay: rgba(0, 0, 0, 0.06);
    --focus-ring: 0 0 0 2px var(--bg-panel), 0 0 0 4px var(--accent-primary);
  }
}
```

### Color tokens — Dark theme

```css
@layer base {
  .dark {
    --bg-app: #0f1318;
    --bg-panel: #181d24;
    --bg-subtle: #1e252e;
    --bg-elevated: #222933;
    --bg-inset: #0c0f13;
    --bg-viewport: #14181e;

    --border-default: #2a3240;
    --border-strong: #3a4555;
    --border-subtle: #222933;

    --text-primary: #e8ecf1;
    --text-secondary: #94a3b8;
    --text-tertiary: #64748b;
    --text-disabled: #475569;
    --text-inverse: #18212b;

    --accent-primary: #5b8def;
    --accent-hover: #7ba4f5;
    --accent-pressed: #4a7ce0;
    --accent-soft: rgba(91, 141, 239, 0.15);
    --accent-soft-hover: rgba(91, 141, 239, 0.22);
    --accent-text: #7ba4f5;

    --selection-fill: rgba(91, 141, 239, 0.1);
    --selection-fill-strong: rgba(91, 141, 239, 0.2);
    --selection-outline: #5b8def;
    --selection-row: rgba(91, 141, 239, 0.12);
    --selection-row-inactive: #1e252e;

    --hover-overlay: rgba(255, 255, 255, 0.04);
    --pressed-overlay: rgba(255, 255, 255, 0.06);
    --focus-ring: 0 0 0 2px var(--bg-panel), 0 0 0 4px var(--accent-primary);

    --shadow-low: 0 1px 3px rgba(0, 0, 0, 0.2), 0 1px 2px rgba(0, 0, 0, 0.15);
    --shadow-medium:
      0 4px 12px rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.15);
    --shadow-overlay:
      0 8px 24px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2);
  }
}
```

---

## Part 3 — Typography

### Font stack

```css
:root {
  --font-ui:
    "Inter", "SF Pro Text", -apple-system, BlinkMacSystemFont, system-ui,
    sans-serif;
  --font-mono:
    "JetBrains Mono", "SF Mono", "Fira Code", "Cascadia Code", ui-monospace,
    monospace;
}
```

**Why Inter here (despite the frontend-design skill's guidance against it):** Engineering UI is a special case. The font must have excellent tabular numerals (`font-variant-numeric: tabular-nums`), tight metrics at small sizes (11–13px), and be instantly legible for dense numeric data. Inter satisfies all three. This is infrastructure, not a marketing page. If a different workhorse sans with good tabular figures is preferred (e.g., `IBM Plex Sans`, `Source Sans 3`), substitute — but ensure `tnum` support.

### Usage rules

| Role                      | Token         | Weight | Size          | Features       |
| ------------------------- | ------------- | ------ | ------------- | -------------- |
| App chrome labels         | `--font-ui`   | 500    | `--text-sm`   | —              |
| Tree node name            | `--font-ui`   | 400    | `--text-sm`   | —              |
| Tree node secondary       | `--font-ui`   | 400    | `--text-xs`   | —              |
| Inspector label           | `--font-ui`   | 500    | `--text-sm`   | —              |
| Inspector value           | `--font-ui`   | 400    | `--text-sm`   | `tabular-nums` |
| Numeric input             | `--font-ui`   | 400    | `--text-sm`   | `tabular-nums` |
| Unit suffix               | `--font-ui`   | 400    | `--text-xs`   | —              |
| Panel title               | `--font-ui`   | 600    | `--text-lg`   | —              |
| Section title             | `--font-ui`   | 600    | `--text-base` | —              |
| Console / logs            | `--font-mono` | 400    | `--text-xs`   | —              |
| Matrix / transform values | `--font-mono` | 400    | `--text-xs`   | `tabular-nums` |
| Viewport HUD labels       | `--font-ui`   | 500    | `--text-xs`   | —              |
| Tooltip                   | `--font-ui`   | 400    | `--text-xs`   | —              |
| Button label              | `--font-ui`   | 500    | `--text-sm`   | —              |
| Tab label                 | `--font-ui`   | 500    | `--text-sm`   | —              |

### Tailwind utility class for tabular numerals

```css
.tabular-nums {
  font-variant-numeric: tabular-nums;
}
```

Apply to all numeric displays, inputs, table columns with numbers, chart tick labels, and timeline readouts.

---

## Part 4 — App Shell Layout

### Grid structure

```
┌──────────────────────────────────────────────────────────────┐
│  Top Bar (44px)                                              │
├──────────────────────────────────────────────────────────────┤
│  Secondary Toolbar (36px) — contextual per workbench         │
├────────┬────────────────────────────────────┬────────────────┤
│        │                                    │                │
│  Left  │         Center Viewport            │   Right        │
│ Panel  │         (flex: 1)                  │  Inspector     │
│ (260px)│                                    │  (320px)       │
│        │                                    │                │
│        │                                    │                │
│        ├────────────────────────────────────┤                │
│        │  Bottom Dock (240px, collapsible)  │                │
├────────┴────────────────────────────────────┴────────────────┤
│  Workspace Tab Bar (32px)                                    │
└──────────────────────────────────────────────────────────────┘
```

### Implementation: CSS Grid

```tsx
// AppShell.tsx — outer layout
<div className="app-shell">
  <TopBar />
  <SecondaryToolbar />
  <div className="app-body">
    <LeftPanel />
    <div className="center-column">
      <Viewport />
      <BottomDock />
    </div>
    <RightPanel />
  </div>
  <WorkspaceTabBar />
</div>
```

```css
.app-shell {
  display: grid;
  grid-template-rows: var(--topbar-h) var(--toolbar-h) 1fr var(--bottom-tabs-h);
  height: 100vh;
  overflow: hidden;
  background: var(--bg-app);
  color: var(--text-primary);
  font-family: var(--font-ui);
  font-size: var(--text-base);
}

.app-body {
  display: grid;
  grid-template-columns: var(--panel-left-w) 1fr var(--panel-right-w);
  overflow: hidden;
  min-height: 0; /* critical for nested flex/grid overflow */
}

.center-column {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
```

### Panel resize behavior

Use `react-resizable-panels` (already in shadcn ecosystem) or a custom `ResizeHandle` component.

```
Left panel:   min 200px  |  default 260px  |  max 380px  |  double-click resets
Right panel:  min 280px  |  default 320px  |  max 440px  |  double-click resets
Bottom dock:  min 160px  |  default 240px  |  max 400px  |  double-click collapses
```

Resize handles should be 4px wide (visible as 1px border, but 4px hit area).

### Panel collapse behavior

- Left panel: collapse button in panel header OR drag to < min. Collapsed = 0px + 36px icon-only rail showing tree tab icons.
- Right panel: collapse button OR no selection = auto-collapse to 0px. Show "select an object" empty state.
- Bottom dock: collapse button OR tab click when already active = toggle collapse. Collapsed = 0px (only tab headers visible as a bar, 28px).

---

## Part 5 — Component Specifications

### 5.1 Top Bar

**Height:** 44px  
**Background:** `var(--bg-panel)`  
**Border:** bottom 1px `var(--border-default)`  
**Padding:** 0 12px  
**Layout:** flexbox, justify-between, align-center

```
┌─────────────────────────────────────────────────────────────────┐
│ [Logo] ProjectName ▾  │  [⟲ ↻]  │  ⌘K Search...  │  [context] │ ▶ Ready │ [⚙] [👤] │
└─────────────────────────────────────────────────────────────────┘
  ← left cluster         center                right cluster →
```

**Left cluster:**

- Logo mark: 20×20px SVG, no text
- Project name: `--text-base`, `--weight-semibold`, truncate at 200px, dropdown on click
- Separator: 1px `var(--border-default)` height 20px, margin 0 8px

**Center:**

- Command search trigger: 240px wide pill, `var(--bg-subtle)` background, `var(--text-tertiary)` placeholder, `var(--radius-md)`, height 28px, `⌘K` badge right-aligned inside

**Right cluster:**

- Context breadcrumb: shows "Body > Caliper Arm > Face 3" when selection exists, `--text-xs`, `--text-secondary`
- Compile/run status pill: height 24px, `var(--radius-sm)`, colored dot + label
- Settings icon button: 28×28px
- User avatar: 24×24px circle

### 5.2 Secondary Toolbar

**Height:** 36px  
**Background:** `var(--bg-panel)`  
**Border:** bottom 1px `var(--border-default)`  
**Padding:** 0 8px  
**Layout:** flexbox, gap 2px, align-center

Content changes per workbench:

**Author workbench:**

```
[Datum ▾] [Joint ▾] [Body ▾] │ [Snap] [Grid] [Inference] │ [Measure] [Section]
```

**Analyze workbench:**

```
[Channel ▾] [Compare ▾] │ [◀ ▶ ⏸ ⏮ ⏭] Speed: 1× │ [Isolate] [Section] [Probe]
```

**Toolbar icon buttons:**

- Size: 28×28px (comfortable) / 24×24px (compact)
- Icon: 16px / 14px
- Background: transparent default, `var(--hover-overlay)` on hover, `var(--accent-soft)` when active
- Border-radius: `var(--radius-sm)`
- Active state: `var(--accent-soft)` background, `var(--accent-text)` icon color
- Pressed state: outlined in `var(--accent-primary)` 1px

**Toolbar separators:** 1px wide, 20px tall, `var(--border-default)`, margin 0 4px

**Toolbar dropdown buttons:**

- Same as icon button but with 4px right padding and a 10px chevron-down icon
- Dropdown appears below, aligned left, max-height 320px, scrollable

### 5.3 Left Panel (Structure Panel)

**Width:** `var(--panel-left-w)` (260px default)  
**Background:** `var(--bg-panel)`  
**Border:** right 1px `var(--border-default)`

**Panel header:** 36px height, flexbox

```
┌─────────────────────────────┐
│  Structure  Studies  Issues  │  ← tab row
├─────────────────────────────┤
│  🔍 Filter by name...   ≡  │  ← filter bar
├─────────────────────────────┤
│  ▸ Bodies (16)              │
│  ▸ Datums (4)               │
│  ▸ Joints (12)              │
│  ▸ Drivers (2)              │
│  ...                        │
└─────────────────────────────┘
```

**Tab row:**

- Height: 32px
- Tabs: `--text-xs`, `--weight-medium`, uppercase tracking 0.02em
- Active tab: `var(--text-primary)`, 2px bottom border `var(--accent-primary)`
- Inactive tab: `var(--text-tertiary)`, no border
- Hover: `var(--text-secondary)`

**Filter bar:**

- Height: 32px
- Padding: 4px 8px
- Input: full width minus list-toggle button, height 24px, `var(--bg-subtle)` background, `var(--radius-sm)`, `--text-xs`, 12px search icon left-inset
- List/tree toggle: 24×24px icon button, right side

### 5.4 Tree Row (critical component)

**This is the most repeated component in the entire app. Every pixel matters.**

```
┌──────────────────────────────────────────────────────────┐
│ [▸] [🔷] Body Name             [⚠] [👁] [⋯]           │
│     ↑indent  ↑icon  ↑name            ↑status ↑vis ↑menu │
└──────────────────────────────────────────────────────────┘
```

**Anatomy:**

| Part                 | Size                                                                                                    | Position                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Row                  | height: `var(--tree-row-h)` (28px), full width                                                          | —                                                           |
| Disclosure chevron   | 12×12px icon, clickable 20×20px hit area                                                                | left: `indent * level`, vertically centered                 |
| Type icon            | `var(--tree-icon-size)` (16px)                                                                          | after chevron, 4px gap                                      |
| Name text            | `--text-sm`, `--weight-normal`, flex: 1, overflow: hidden, text-overflow: ellipsis, white-space: nowrap | after icon, 6px gap                                         |
| Secondary text       | `--text-2xs`, `--text-tertiary`, max-width 60px, truncate                                               | after name, 4px gap                                         |
| Status indicator     | 8px circle or 16px icon                                                                                 | right cluster, 4px gap                                      |
| Visibility toggle    | 16px eye icon, 20×20px hit area                                                                         | right cluster, visible on hover OR always visible if hidden |
| Context menu trigger | 16px ellipsis icon, 20×20px hit area                                                                    | right cluster, visible on hover only                        |

**States:**

| State                                   | Background                      | Text              | Border                                 | Other                      |
| --------------------------------------- | ------------------------------- | ----------------- | -------------------------------------- | -------------------------- |
| Default                                 | transparent                     | `--text-primary`  | none                                   | —                          |
| Hover                                   | `var(--hover-overlay)`          | `--text-primary`  | none                                   | show right-cluster actions |
| Selected                                | `var(--selection-row)`          | `--text-primary`  | none                                   | —                          |
| Selected + focused                      | `var(--selection-row)`          | `--text-primary`  | left 2px `var(--accent-primary)`       | —                          |
| Selected + inactive (panel not focused) | `var(--selection-row-inactive)` | `--text-primary`  | none                                   | —                          |
| Disabled / hidden                       | transparent                     | `--text-disabled` | none                                   | 0.5 opacity icon           |
| Warning                                 | transparent                     | `--text-primary`  | none                                   | `--warning` status dot     |
| Error                                   | transparent                     | `--text-primary`  | none                                   | `--danger` status dot      |
| Drag target                             | `var(--accent-soft)`            | `--text-primary`  | top/bottom 2px `var(--accent-primary)` | —                          |
| Filtered out                            | `display: none`                 | —                 | —                                      | —                          |

**Interaction:**

- Single click: select, update inspector + viewport highlight
- Double click: rename inline (input replaces name text, auto-select all, Enter confirms, Escape cancels)
- Right click: context menu
- Ctrl+click: toggle selection (multi-select)
- Shift+click: range select
- Hover: reveal visibility toggle + context menu trigger
- Drag chevron left edge: collapse/expand
- Middle click: isolate in viewport (solo this object)

**Group header row (e.g., "Bodies (16)"):**

- Same height as regular row
- `--text-xs`, `--weight-semibold`, `--text-secondary`, uppercase
- Disclosure chevron to collapse entire group
- Count badge: `--text-2xs`, `--text-tertiary`, parenthesized

### 5.5 Right Panel (Inspector)

**Width:** `var(--panel-right-w)` (320px default)  
**Background:** `var(--bg-panel)`  
**Border:** left 1px `var(--border-default)`

**Empty state:** centered icon (48px, `--text-tertiary`), text "Select an object to inspect", `--text-sm`, `--text-tertiary`.

**Populated structure:**

```
┌─────────────────────────────────────┐
│ [🔷] Body: Caliper Arm        [⋯]  │ ← header
│ Status: ✓ Valid                     │
├─────────────────────────────────────┤
│ ▾ Identity                          │ ← section
│   Name        Caliper Arm           │ ← property row
│   Source      imported_asm.step     │
│   Instance    <1>                   │
├─────────────────────────────────────┤
│ ▾ Transform                         │
│   Position    [12.5] [0.0] [−3.2]  │ ← vector input
│   Rotation    [0°] [0°] [45°]      │
├─────────────────────────────────────┤
│ ▸ Mass Properties                   │ ← collapsed
├─────────────────────────────────────┤
│ ▸ Representations                   │
├─────────────────────────────────────┤
│ ▾ Diagnostics                       │
│   ⚠ No mass properties assigned    │ ← diagnostic item
│   ⚠ Stale tessellation             │
└─────────────────────────────────────┘
```

**Inspector header:**

- Height: 48px
- Padding: 12px 12px 8px 12px
- Type icon: 20px, colored by entity type
- Entity type label: `--text-xs`, `--text-tertiary`, uppercase
- Entity name: `--text-base`, `--weight-semibold`, truncate
- Quick actions menu: 24×24px icon button, right-aligned
- Status line: `--text-xs`, colored status dot + label

**Inspector section:**

- Header: 32px height, `--text-sm`, `--weight-semibold`, `--text-secondary`
- Disclosure chevron: 12px, left side
- Background: `var(--bg-subtle)` header, `var(--bg-panel)` body
- Padding: 0 12px body content
- Border: bottom 1px `var(--border-subtle)` between sections
- Sections remember open/closed state per entity type

### 5.6 Property Row (most important molecule)

```
┌────────────────────────────────────────────┐
│  Label              [Value Editor] [unit]  │
└────────────────────────────────────────────┘
```

**Height:** `var(--inspector-row-h)` (32px)  
**Padding:** 0 12px  
**Layout:** flexbox, align-center

| Part         | Spec                                                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Label        | width: `var(--inspector-label-w)` (100px), `--text-sm`, `--text-secondary`, `--weight-normal`, flex-shrink: 0, text-overflow: ellipsis |
| Value editor | flex: 1, min-width: 0                                                                                                                  |
| Unit suffix  | `--text-xs`, `--text-tertiary`, flex-shrink: 0, margin-left: 4px, min-width: 24px                                                      |
| Reset button | 14px icon, visible on hover only if value differs from default, `--text-tertiary`                                                      |
| Warning icon | 14px, `--warning`, visible only if validation error                                                                                    |

**Value editors by type:**

- **Text:** standard input, height 24px, `var(--bg-subtle)`, `var(--radius-sm)`, padding 0 6px
- **Number:** same as text + tabular-nums + arrow step buttons (hidden, appear on hover) + scrub-on-drag on label
- **Vector (XYZ):** three numeric inputs in a row, 50px each, X/Y/Z colored label prefixes using `--axis-x/y/z`
- **Enum/select:** shadcn Select, height 24px, compact
- **Boolean:** shadcn Switch, 32×18px, compact
- **Color:** 16×16px swatch + hex input
- **Read-only:** same layout but `--text-primary`, no background, not focusable

**Property row hover:** `var(--hover-overlay)` background on entire row. Shows reset button if applicable.

### 5.7 Numeric Input (engineering-specific)

This component extends shadcn `Input` with engineering-specific behavior.

**Visual spec:**

- Height: 24px (in property rows), 28px (standalone)
- Background: `var(--bg-subtle)`, focus: `var(--bg-panel)` with `var(--focus-ring)`
- Border: 1px `var(--border-default)`, focus: `var(--accent-primary)`
- Font: `--text-sm`, `tabular-nums`
- Padding: 0 6px
- Border-radius: `var(--radius-sm)`

**Behavior spec:**

1. **Arrow keys:** Up/Down increment/decrement by step (default 1). Hold Shift = 10× step. Hold Alt = 0.1× step.
2. **Scrub-on-drag on label:** When user drags horizontally on the property label text, the value changes proportionally. Cursor changes to `ew-resize` on label hover.
3. **Expression evaluation:** User can type `10 + 5` or `sin(45)` and it evaluates on Enter.
4. **Unit parsing:** User can type `10 mm` or `10 in` and it converts to current display unit. The parsed unit overrides display temporarily.
5. **Select-all on focus:** Clicking the input selects all text.
6. **Commit on Enter or blur.** Revert on Escape.
7. **Validation:** red border `var(--danger)` if invalid, with inline error tooltip.
8. **Min/max clamping:** visual indicator (flash border orange) if value is clamped.

### 5.8 Vector Input (XYZ)

```
┌──────────────────────────────────────┐
│  X [12.500]  Y [0.000]  Z [−3.200]  │
└──────────────────────────────────────┘
```

- Three numeric inputs in a flex row, gap: 4px
- Each prefixed with axis letter: `--text-xs`, `--weight-semibold`, colored (`--axis-x`, `--axis-y`, `--axis-z`), width 14px
- Each input: flex 1, min-width 44px
- Tabbing moves between X → Y → Z → next property row
- Copy/paste supports `12.5, 0, -3.2` or `[12.5, 0, -3.2]` format

### 5.9 Buttons

**Size variants:**

| Variant   | Height  | Padding | Icon | Font        |
| --------- | ------- | ------- | ---- | ----------- |
| `sm`      | 24px    | 0 8px   | 14px | `--text-xs` |
| `default` | 28px    | 0 12px  | 16px | `--text-sm` |
| `lg`      | 32px    | 0 16px  | 16px | `--text-sm` |
| `icon-sm` | 24×24px | 0       | 14px | —           |
| `icon`    | 28×28px | 0       | 16px | —           |
| `icon-lg` | 32×32px | 0       | 18px | —           |

**Style variants:**

| Style            | Default bg         | Default text       | Hover bg              | Active bg            | Border                 |
| ---------------- | ------------------ | ------------------ | --------------------- | -------------------- | ---------------------- |
| `primary`        | `--accent-primary` | `--text-inverse`   | `--accent-hover`      | `--accent-pressed`   | none                   |
| `secondary`      | `--bg-subtle`      | `--text-primary`   | `--border-default` bg | `--border-strong` bg | 1px `--border-default` |
| `ghost`          | transparent        | `--text-secondary` | `--hover-overlay`     | `--pressed-overlay`  | none                   |
| `subtle`         | transparent        | `--text-secondary` | `--bg-subtle`         | `--bg-inset`         | none                   |
| `destructive`    | `--danger`         | `--text-inverse`   | darker danger         | darker danger        | none                   |
| `toolbar`        | transparent        | `--text-secondary` | `--hover-overlay`     | `--accent-soft`      | none                   |
| `toolbar-active` | `--accent-soft`    | `--accent-text`    | `--accent-soft-hover` | `--accent-soft`      | none                   |

**All buttons:** border-radius `var(--radius-sm)`, transition `var(--duration-fast)`, cursor: pointer, disabled: opacity 0.4 + cursor: not-allowed.

**Segmented toggle group:**

- Container: `var(--bg-subtle)` background, `var(--radius-md)` border-radius, 1px `var(--border-default)` border, padding: 2px, gap: 1px
- Items: `toolbar` style buttons, active item: `var(--bg-panel)` background, `var(--shadow-low)`, `var(--text-primary)`

### 5.10 Status Badge / Pill

```
[● Compiled]   [⚠ Stale]   [▶ Running]   [✕ Failed]
```

- Height: 20px
- Padding: 0 8px
- Border-radius: `var(--radius-sm)`
- Font: `--text-2xs`, `--weight-medium`
- Dot: 6px circle, colored by status
- Background: corresponding `*-soft` color
- Text: corresponding status color

### 5.11 Floating Tool Card

When a tool is active (e.g., "Create Datum"), a floating card appears near the viewport.

**Position:** top-left of viewport area, 12px inset from viewport edges  
**Width:** 260–300px  
**Background:** `var(--bg-panel)`  
**Border:** 1px `var(--border-default)`  
**Border-radius:** `var(--radius-lg)`  
**Shadow:** `var(--shadow-overlay)`  
**Z-index:** `var(--z-floating)`

```
┌──────────────────────────────┐
│ [🎯] Create Datum      [✕]  │ ← tool header
├──────────────────────────────┤
│  Mode   [On Face ▾]         │ ← property rows
│  Name   Datum_4              │
│  Parent [select body...]     │
├──────────────────────────────┤
│  [Cancel]          [Confirm] │ ← actions
└──────────────────────────────┘
```

**Tool header:** 36px, `--text-sm`, `--weight-semibold`, tool icon 16px, close button 20×20px.  
**Body:** standard property rows.  
**Actions:** right-aligned buttons, padding 8px 12px, gap 8px. Primary = Confirm, Ghost = Cancel.

**Draggable:** yes, via header. Remembers position per tool within session.  
**Dismissable:** Escape or close button or completing the action.  
**Multiple tool cards:** stack vertically with 8px gap. Max 2 visible; additional queue.

### 5.12 Context Menu

Extends shadcn `ContextMenu` with engineering-specific patterns.

**Width:** 200–260px  
**Item height:** 28px  
**Item padding:** 0 12px  
**Font:** `--text-sm`  
**Keyboard shortcut:** right-aligned, `--text-xs`, `--text-tertiary`, `--font-mono`

**Required context menu sets:**

**Tree row — Body:**

- Select in Viewport
- Isolate
- Hide / Show

---

- Create Datum on Body
- Create Joint from Body

---

- Rename
- Properties

---

- Delete

**Tree row — Joint:**

- Select in Viewport
- Focus Viewport on Joint

---

- Edit Joint
- Change Type ▸ (submenu: Revolute, Slider, Cylindrical, Ball, Fixed, Planar)

---

- Swap Bodies
- Reverse Direction

---

- Rename
- Properties
- Delete

**Viewport — Face/Edge:**

- Create Datum Here
- Measure

---

- Select Parent Body
- Isolate Parent Body

---

- Show Normal
- Copy Coordinates

### 5.13 Viewport HUD Layout

The viewport is a WebGL/Three.js canvas. Overlays are HTML elements positioned absolutely over it.

```
┌──────────────────────────────────────────────────┐
│ [Floating Tool Card]              [View Cube 80] │ ← top row
│                                   [Shading ▾]    │
│                                   [Visibility ▾] │
│                                                  │
│                                                  │
│              (3D viewport)                       │
│                                                  │
│                                                  │
│ [XYZ axis indicator]                             │
│ 32px                           [Result Legend]   │ ← bottom row
│                [Selection Chip: Caliper Arm ▸]   │
└──────────────────────────────────────────────────┘
```

**View cube:** 80×80px, top-right, 12px inset. Interactive: click faces for standard views, drag to orbit.

**Axis indicator:** 48×48px, bottom-left, 12px inset. RGB axes matching `--axis-x/y/z`.

**Selection chip:** bottom-center, floating pill. Shows selected entity name + type icon + quick action (e.g., "Inspect ▸"). Background: `var(--bg-panel)`, border: 1px `var(--border-default)`, shadow: `var(--shadow-medium)`, radius: `var(--radius-md)`, height: 28px.

**Result legend:** bottom-right, when results are active. Width: 48px (color ramp) + 60px (labels). Shows min/max, colormap name, lock icon.

**Shading mode dropdown:** right side, below view cube, icon button that opens a popover with shading options.

### 5.14 Bottom Dock

**Collapsed state:** only tab bar visible (28px height)

```
┌──────────────────────────────────────────────────┐
│ [Timeline] [Charts] [Diagnostics] [Console]  [▲]│
└──────────────────────────────────────────────────┘
```

**Expanded state:**

```
┌──────────────────────────────────────────────────┐
│ [Timeline] [Charts] [Diagnostics] [Console]  [▼]│
├──────────────────────────────────────────────────┤
│                                                  │
│  (tab content area — 240px default height)       │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Tab bar:** height 28px, `var(--bg-subtle)` background.  
**Tab items:** `--text-xs`, `--weight-medium`, padding 0 12px, height 28px.  
**Active tab:** `var(--text-primary)`, 2px top border `var(--accent-primary)`, `var(--bg-panel)` background.  
**Inactive tab:** `var(--text-tertiary)`.  
**Collapse/expand button:** right side, 20×20px.  
**Resize handle:** top edge, 4px hit area, cursor: `ns-resize`.

### 5.15 Timeline Panel (in bottom dock)

```
┌──────────────────────────────────────────────────────────────┐
│ [◀◀] [◀] [▶] [▶▶]  [Loop: ○]  Speed [1×▾]  │ 0.342s / 2.000s │
├──────────────────────────────────────────────────────────────┤
│ ░░░░░░░░░░████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│            ↑ playhead                                        │
│ 0.0    0.2    0.4    0.6    0.8    1.0    1.2    ...    2.0  │
└──────────────────────────────────────────────────────────────┘
```

**Transport controls:** 28px height buttons, `toolbar` style. Icons: skip-back, step-back, play/pause, step-forward, skip-forward.

**Scrubber track:** height 24px, `var(--bg-inset)` background, `var(--radius-sm)`.  
**Playhead:** 2px wide, `var(--accent-primary)`, with 8px top circle handle.  
**Time labels:** `--text-2xs`, `--text-tertiary`, `tabular-nums`, along bottom.  
**Time readout:** right side, `--text-sm`, `--font-mono`, `tabular-nums`.

**Interaction:** click on track to seek, drag playhead to scrub. Arrow keys: step frame. Space: play/pause. Scroll on track: zoom time scale.

### 5.16 Diagnostics Item

```
┌──────────────────────────────────────────────────┐
│ [⚠] No mass properties on "Body <3>"    [→ Fix] │
└──────────────────────────────────────────────────┘
```

- Height: auto, min 32px
- Icon: 16px, colored by severity (warning: `--warning`, error: `--danger`, info: `--info`)
- Message: `--text-sm`, `--text-primary`, may wrap to 2 lines
- Entity reference: `--text-sm`, `--weight-medium`, clickable (selects entity)
- Fix action: `--text-xs`, `--accent-text`, right-aligned, ghost button

### 5.17 Engineering-Specific Components

#### Datum Axis Pill

```
[📐 Datum_2  XYZ ●]
```

- Inline pill: height 22px, `var(--bg-subtle)`, `var(--radius-sm)`, padding 0 8px
- Icon: datum icon 14px
- Name: `--text-xs`, `--text-primary`
- Axis indicator: three small 6px circles colored X/Y/Z
- Visibility dot: 6px, green if visible, gray if hidden

#### Joint Type Badge

```
[🔄 Revolute]
```

- Height: 20px, padding 0 6px
- Background: joint type color at 10% opacity
- Border-left: 3px solid joint type color
- Icon: 14px joint type icon
- Label: `--text-2xs`, `--weight-medium`
- Border-radius: `var(--radius-sm)`

#### DOF Indicator

```
┌────────────────┐
│ Tx Ty Tz Rx Ry Rz │
│ ■  ○  ○  ●  ○  ○  │
└────────────────┘
```

- 6 cells in a row, each 20×24px
- Header: axis label, `--text-2xs`, `--text-tertiary`
- Indicator: ● free (colored by axis), ■ constrained (`--text-disabled`), ○ locked (empty outline)
- Used in joint inspector and tooltip

#### Simulation Status Pill

Same as Status Badge (5.10) but with specific states:

- `compiled`: green dot, "Compiled"
- `stale`: amber dot, "Stale — recompile"
- `running`: blue animated dot (pulse), "Running 47%"
- `failed`: red dot, "Failed"
- `warning`: amber dot, "2 warnings"

#### Unit-Aware Field

Extends Numeric Input (5.7):

- Unit selector dropdown: compact, right side of input, `--text-2xs`, width 36px, `var(--bg-subtle)` background
- Shows current unit: mm, m, in, deg, rad, N, kg, etc.
- Conversion: when unit changes, value recalculates
- Display: value always shown in current unit with appropriate decimal places

### 5.18 Workspace Tab Bar (bottom of screen)

```
┌──────────────────────────────────────────────────────────────────┐
│ [+] │ 📄 Assembly_1  │ 📄 Part Studio 2  │ 📄 Simulation_1  │  │
└──────────────────────────────────────────────────────────────────┘
```

- Height: 32px
- Background: `var(--bg-subtle)`
- Border: top 1px `var(--border-default)`
- New tab button: 24×24px, `+` icon, `ghost` style
- Tab items: max-width 180px, padding 0 12px, `--text-xs`, `--weight-medium`
- Active tab: `var(--bg-panel)` background, `var(--text-primary)`, top 2px border `var(--accent-primary)`
- Inactive tab: `var(--text-secondary)`, `var(--bg-subtle)`
- Close button on each tab: 14px `×`, visible on hover, right side
- Overflow: scroll horizontally, fade edges
- Right side: view controls (zoom-to-fit, front/top/right views as small buttons)

---

## Part 6 — Interaction Patterns

### 6.1 Selection synchronization

When anything is selected anywhere, ALL of these must update synchronously:

1. **Tree:** highlight the corresponding row, scroll into view if needed
2. **Viewport:** apply selection overlay (outline + subtle fill)
3. **Inspector:** show properties of selected entity
4. **Context breadcrumb:** update in top bar
5. **Selection chip:** show in viewport HUD

Selection state is a single global store. Use a Zustand store or similar:

```ts
interface SelectionState {
  selected: EntityRef[];
  hovered: EntityRef | null;
  focused: EntityRef | null; // for keyboard navigation
}
```

### 6.2 Hover pre-highlight

- Mouse over tree row: highlight row + show subtle viewport overlay on corresponding geometry
- Mouse over viewport geometry: highlight in viewport + highlight corresponding tree row (scroll into view only if close to visible area, don't jump)
- Delay: 0ms for tree → viewport, 50ms debounce for viewport → tree (avoid flicker)

### 6.3 Keyboard shortcuts

| Action                | Shortcut                                                      | Context               |
| --------------------- | ------------------------------------------------------------- | --------------------- |
| Command palette       | `⌘K` / `Ctrl+K`                                               | Global                |
| Delete selected       | `Delete` / `Backspace`                                        | Tree/viewport focused |
| Rename                | `F2`                                                          | Tree row selected     |
| Escape                | Clear tool / clear selection / close floating card (in order) | Global                |
| Space                 | Play/pause simulation                                         | Analyze workbench     |
| `H`                   | Hide selected                                                 | Viewport/tree         |
| `I`                   | Isolate selected                                              | Viewport/tree         |
| `F`                   | Fit selected in viewport                                      | Viewport              |
| `1`–`6`               | Standard views (front/back/left/right/top/bottom)             | Viewport              |
| `Tab`                 | Next input in inspector                                       | Inspector focused     |
| `Shift+Tab`           | Previous input                                                | Inspector focused     |
| `⌘Z` / `Ctrl+Z`       | Undo                                                          | Global                |
| `⌘Shift+Z` / `Ctrl+Y` | Redo                                                          | Global                |

### 6.4 Drag behaviors

| Source                     | Target                        | Result                            |
| -------------------------- | ----------------------------- | --------------------------------- |
| Resize handle (panel edge) | Horizontal/vertical           | Resize panel                      |
| Floating tool card header  | Anywhere in viewport          | Reposition card                   |
| Timeline playhead          | Horizontal on track           | Scrub time                        |
| Property label (numeric)   | Horizontal                    | Scrub value (cursor: `ew-resize`) |
| Tree row                   | Another tree group (if valid) | Reparent entity                   |

### 6.5 Focus management

- Tab cycles through: top bar → left panel tabs → tree rows → viewport (trap) → right panel inspector rows → bottom dock tabs
- Within tree: Up/Down arrow keys navigate rows, Left/Right collapse/expand
- Within inspector: Tab moves between inputs, Enter commits
- Viewport: captures keyboard for camera (WASD) and shortcuts when focused
- `Escape` always moves focus up one level: input → panel → viewport

---

## Part 7 — shadcn Customization Map

### Components to use from shadcn (with overrides)

| shadcn Component      | MotionLab Override                                                       | Notes                                |
| --------------------- | ------------------------------------------------------------------------ | ------------------------------------ |
| `Button`              | Override sizes (24/28/32px), add `toolbar` and `toolbar-active` variants | Core change                          |
| `Input`               | Extend with `NumericInput` wrapper for engineering behavior              | Keep base for text                   |
| `Select`              | Reduce height to 24–28px, compact dropdown                               | Override trigger style               |
| `Tabs`                | Two variants: panel tabs (left panel) and dock tabs (bottom)             | Different styling per context        |
| `Tooltip`             | Use `--text-xs`, max-width 240px, 400ms delay                            | Reduce default delay for engineering |
| `Popover`             | Use for floating tool cards, attach to viewport                          | Need custom positioning              |
| `Dialog`              | Use for confirmations and settings only (not for editing)                | Avoid modals for authoring           |
| `ContextMenu`         | Extend with shortcut display, submenu support                            | Critical for tree/viewport           |
| `Command`             | Use as command palette backbone, customize item rendering                | Add recent commands, entity search   |
| `ScrollArea`          | Use in all panels and trees                                              | Critical for performance             |
| `ResizablePanelGroup` | Use for app shell panels                                                 | Map to panel size tokens             |
| `Sheet`               | Use only for mobile or settings drawers                                  | Rarely needed                        |
| `DropdownMenu`        | Use for toolbar dropdown buttons                                         | Compact item height                  |
| `Toggle`              | Use for toolbar toggle buttons                                           | Map to `toolbar-active` style        |
| `Switch`              | Compact size (32×18px)                                                   | For boolean properties               |
| `Separator`           | Map to `--border-default`                                                | Used in menus and panels             |
| `Badge`               | Create `StatusBadge` wrapper with engineering states                     | Not the default badge                |

### Components to build from scratch (not in shadcn)

| Component              | Priority | Complexity                                     |
| ---------------------- | -------- | ---------------------------------------------- |
| `TreeView` + `TreeRow` | P0       | High — custom virtualized tree with all states |
| `PropertyRow`          | P0       | Medium — label + value + unit + actions        |
| `NumericInput`         | P0       | High — scrub, expressions, units, stepping     |
| `VectorInput`          | P0       | Medium — 3× NumericInput with axis colors      |
| `InspectorPanel`       | P0       | Medium — sectioned property editor             |
| `InspectorSection`     | P0       | Low — collapsible section                      |
| `ToolbarButton`        | P0       | Low — icon button with active state            |
| `ToolbarGroup`         | P0       | Low — flex container with separator            |
| `FloatingToolCard`     | P1       | Medium — draggable positioned card             |
| `StatusBadge`          | P1       | Low — pill with dot + label                    |
| `JointTypeBadge`       | P1       | Low — colored pill                             |
| `DOFIndicator`         | P1       | Low — 6-cell row                               |
| `DatumPill`            | P1       | Low — inline reference pill                    |
| `TimelineTransport`    | P1       | Medium — playback controls                     |
| `TimelineScrubber`     | P1       | Medium — seekable track                        |
| `DiagnosticsItem`      | P1       | Low — message + action                         |
| `ResultLegend`         | P2       | Medium — colormap + range                      |
| `ViewCube`             | P2       | High — 3D interactive cube (WebGL or CSS 3D)   |
| `AxisIndicator`        | P2       | Low — SVG mini axes                            |
| `SelectionChip`        | P2       | Low — floating pill in viewport                |
| `MatrixEditor`         | P2       | Medium — 3×3 or 4×4 grid of numeric inputs     |
| `UnitAwareField`       | P2       | Medium — NumericInput + unit selector          |

---

## Part 8 — Implementation Order

### Phase 1: Foundation (Week 1)

1. Set up CSS token system (`globals.css` with all tokens from Part 2)
2. Configure Tailwind to reference CSS variables
3. Override shadcn theme in `tailwind.config.ts`
4. Install shadcn components: Button, Input, Select, Tabs, Tooltip, Popover, Dialog, ContextMenu, Command, ScrollArea, DropdownMenu, Toggle, Switch, Separator
5. Create size/style variant overrides for Button
6. Create `AppShell` layout component with CSS Grid

### Phase 2: Core Components (Week 2)

7. Build `TreeRow` component with all states
8. Build `TreeView` with virtualization (use `@tanstack/react-virtual`)
9. Build `PropertyRow` molecule
10. Build `NumericInput` with stepping and scrub behavior
11. Build `VectorInput`
12. Build `InspectorSection` (collapsible)
13. Build `InspectorPanel` (header + sections + empty state)

### Phase 3: Shell Integration (Week 3)

14. Build `TopBar` with logo, project name, command trigger, status pill
15. Build `SecondaryToolbar` with contextual tool sets
16. Build `LeftPanel` with tabs, filter bar, tree
17. Build `RightPanel` with inspector
18. Build `BottomDock` with tabs, collapse, resize
19. Build `WorkspaceTabBar`
20. Wire up panel resize behavior

### Phase 4: Engineering Components (Week 4)

21. Build `FloatingToolCard`
22. Build `StatusBadge`
23. Build `JointTypeBadge`
24. Build `DOFIndicator`
25. Build `DatumPill`
26. Build `DiagnosticsItem`
27. Build `TimelineTransport` + `TimelineScrubber`
28. Build context menus for tree entities and viewport

### Phase 5: Polish (Week 5)

29. Implement keyboard shortcuts system
30. Wire selection synchronization store
31. Add compact density mode toggle
32. Add dark theme
33. Viewport HUD overlay positioning system
34. Animation polish (panel transitions, section collapse)
35. Empty states for all panels
36. Error states and validation patterns

---

## Part 9 — Tailwind Configuration

```ts
// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          app: "var(--bg-app)",
          panel: "var(--bg-panel)",
          subtle: "var(--bg-subtle)",
          elevated: "var(--bg-elevated)",
          inset: "var(--bg-inset)",
          viewport: "var(--bg-viewport)",
        },
        border: {
          DEFAULT: "var(--border-default)",
          strong: "var(--border-strong)",
          subtle: "var(--border-subtle)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary: "var(--text-tertiary)",
          disabled: "var(--text-disabled)",
          inverse: "var(--text-inverse)",
        },
        accent: {
          DEFAULT: "var(--accent-primary)",
          hover: "var(--accent-hover)",
          pressed: "var(--accent-pressed)",
          soft: "var(--accent-soft)",
          "soft-hover": "var(--accent-soft-hover)",
          text: "var(--accent-text)",
        },
        selection: {
          fill: "var(--selection-fill)",
          "fill-strong": "var(--selection-fill-strong)",
          outline: "var(--selection-outline)",
          row: "var(--selection-row)",
          "row-inactive": "var(--selection-row-inactive)",
        },
        success: { DEFAULT: "var(--success)", soft: "var(--success-soft)" },
        warning: { DEFAULT: "var(--warning)", soft: "var(--warning-soft)" },
        danger: { DEFAULT: "var(--danger)", soft: "var(--danger-soft)" },
        info: { DEFAULT: "var(--info)", soft: "var(--info-soft)" },
        axis: { x: "var(--axis-x)", y: "var(--axis-y)", z: "var(--axis-z)" },
        joint: {
          revolute: "var(--joint-revolute)",
          slider: "var(--joint-slider)",
          cylindrical: "var(--joint-cylindrical)",
          ball: "var(--joint-ball)",
          fixed: "var(--joint-fixed)",
          contact: "var(--joint-contact)",
          fastened: "var(--joint-fastened)",
          planar: "var(--joint-planar)",
        },
      },
      fontSize: {
        "2xs": "var(--text-2xs)",
        xs: "var(--text-xs)",
        sm: "var(--text-sm)",
        base: "var(--text-base)",
        lg: "var(--text-lg)",
        xl: "var(--text-xl)",
        "2xl": "var(--text-2xl)",
      },
      spacing: {
        "space-1": "var(--space-1)",
        "space-2": "var(--space-2)",
        "space-3": "var(--space-3)",
        "space-4": "var(--space-4)",
        "space-5": "var(--space-5)",
        "space-6": "var(--space-6)",
        "space-8": "var(--space-8)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        low: "var(--shadow-low)",
        medium: "var(--shadow-medium)",
        overlay: "var(--shadow-overlay)",
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        normal: "var(--duration-normal)",
        slow: "var(--duration-slow)",
      },
      fontFamily: {
        ui: "var(--font-ui)",
        mono: "var(--font-mono)",
      },
      zIndex: {
        base: "var(--z-base)",
        panel: "var(--z-panel)",
        toolbar: "var(--z-toolbar)",
        floating: "var(--z-floating)",
        overlay: "var(--z-overlay)",
        popover: "var(--z-popover)",
        modal: "var(--z-modal)",
        toast: "var(--z-toast)",
      },
    },
  },
};

export default config;
```

---

## Part 10 — Anti-Patterns to Enforce

These are explicit rules the agent must follow. Violations should be flagged in code review.

1. **No `rounded-full` on non-avatar, non-dot elements.** Engineering tools use `rounded-sm` to `rounded-lg`. Pill shapes are for status badges only.

2. **No `p-6` or larger padding inside panels.** Max internal padding is `p-3` (12px). Panels are dense.

3. **No `text-lg` or larger inside panels or toolbars.** Only page titles and dialog titles use `text-lg`+.

4. **No `gap-4` or larger between property rows.** Property rows stack with `gap-0` or `gap-px`.

5. **No `shadow-lg` or `shadow-xl` on panels.** Panels separate with borders, not shadows. Only floating cards and overlays get shadows.

6. **No animated gradient backgrounds.** No pulse animations except on the "running" status dot.

7. **No `min-h-screen` on interior layouts.** The app is exactly `100vh`, no scroll on the outer shell.

8. **No `overflow-auto` on the app shell.** Only panel interiors and scroll areas scroll. The shell grid is fixed.

9. **No modal dialogs for entity editing.** Modals are for confirmations and destructive actions only. All editing happens in the inspector or floating tool cards.

10. **No tabs with more than 5 items in a horizontal row.** If more tabs are needed, use a dropdown or two-row approach.

11. **Always use `tabular-nums` on numeric displays.** Columns of numbers must align.

12. **Never rely on color alone for status.** Always pair with icon or text label.

13. **Never truncate numeric values.** Truncate names, not numbers. If a number doesn't fit, shrink the font or widen the column.

14. **Tree rows must be virtualized.** Trees can have 500+ nodes. Use `@tanstack/react-virtual`.

15. **Inspector sections must remember open/closed state.** Per entity type, persist to localStorage.

---

## Appendix A — Icon Requirements

Use a single icon library consistently. Recommended: **Lucide** (already in shadcn ecosystem) for UI chrome, with custom SVG icons for engineering-specific entities.

### Custom icons needed (16×16px SVG, 1.5px stroke, current color)

| Icon                | Description                             |
| ------------------- | --------------------------------------- |
| `body`              | Solid cube / 3D body outline            |
| `datum`             | Coordinate frame / cross-hair with axes |
| `joint-revolute`    | Circular arrow around dot               |
| `joint-slider`      | Linear arrow through dot                |
| `joint-cylindrical` | Combined circular + linear              |
| `joint-ball`        | Sphere with rotation arrows             |
| `joint-fixed`       | Locked padlock or rigid connection      |
| `joint-planar`      | Flat plane with arrows                  |
| `joint-contact`     | Two surfaces touching                   |
| `driver`            | Motor / gear icon                       |
| `load`              | Arrow pushing down                      |
| `constraint`        | Chain link                              |
| `study`             | Flask / experiment                      |
| `result-set`        | Chart / graph mini                      |
| `mechanism`         | Connected linkage                       |
| `measurement`       | Ruler / dimension                       |
| `section-plane`     | Plane cutting through cube              |
| `representation`    | Mesh / wireframe cube                   |

### Lucide icons to use for UI chrome

| Purpose           | Lucide icon      |
| ----------------- | ---------------- |
| Search            | `Search`         |
| Filter            | `Filter`         |
| Settings          | `Settings`       |
| Close             | `X`              |
| Expand            | `ChevronDown`    |
| Collapse          | `ChevronRight`   |
| More actions      | `MoreHorizontal` |
| Visibility on     | `Eye`            |
| Visibility off    | `EyeOff`         |
| Delete            | `Trash2`         |
| Rename            | `Pencil`         |
| Play              | `Play`           |
| Pause             | `Pause`          |
| Step forward      | `StepForward`    |
| Step back         | `StepBack`       |
| Skip to start     | `SkipBack`       |
| Skip to end       | `SkipForward`    |
| Zoom fit          | `Maximize2`      |
| Isolate           | `Focus`          |
| Warning           | `AlertTriangle`  |
| Error             | `AlertCircle`    |
| Success           | `CheckCircle`    |
| Info              | `Info`           |
| Copy              | `Copy`           |
| Undo              | `Undo2`          |
| Redo              | `Redo2`          |
| Download / Export | `Download`       |
| Add               | `Plus`           |

---

## Appendix B — File Structure

```
src/
├── styles/
│   ├── globals.css          ← tokens + base styles
│   └── tailwind.css         ← @tailwind directives
├── components/
│   ├── ui/                  ← shadcn overridden components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── tabs.tsx
│   │   ├── tooltip.tsx
│   │   ├── popover.tsx
│   │   ├── dialog.tsx
│   │   ├── context-menu.tsx
│   │   ├── command.tsx
│   │   ├── scroll-area.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── toggle.tsx
│   │   ├── switch.tsx
│   │   └── separator.tsx
│   ├── primitives/          ← MotionLab UI primitives
│   │   ├── toolbar-button.tsx
│   │   ├── toolbar-group.tsx
│   │   ├── property-row.tsx
│   │   ├── numeric-input.tsx
│   │   ├── vector-input.tsx
│   │   ├── unit-aware-field.tsx
│   │   ├── tree-view.tsx
│   │   ├── tree-row.tsx
│   │   ├── inspector-section.tsx
│   │   ├── inspector-panel.tsx
│   │   ├── status-badge.tsx
│   │   ├── floating-tool-card.tsx
│   │   ├── diagnostics-item.tsx
│   │   ├── timeline-transport.tsx
│   │   └── timeline-scrubber.tsx
│   ├── engineering/         ← Domain-specific components
│   │   ├── joint-type-badge.tsx
│   │   ├── dof-indicator.tsx
│   │   ├── datum-pill.tsx
│   │   ├── axis-indicator.tsx
│   │   ├── result-legend.tsx
│   │   ├── selection-chip.tsx
│   │   ├── simulation-status.tsx
│   │   └── matrix-editor.tsx
│   └── shell/               ← App shell components
│       ├── app-shell.tsx
│       ├── top-bar.tsx
│       ├── secondary-toolbar.tsx
│       ├── left-panel.tsx
│       ├── right-panel.tsx
│       ├── bottom-dock.tsx
│       ├── workspace-tab-bar.tsx
│       └── viewport-hud.tsx
├── stores/
│   ├── selection.ts         ← Zustand selection store
│   ├── workspace.ts         ← Active workbench, panels
│   └── preferences.ts       ← Density, theme, shortcuts
└── hooks/
    ├── use-keyboard-shortcuts.ts
    ├── use-panel-resize.ts
    └── use-selection-sync.ts
```

---

_End of specification. This document contains all information needed to implement the MotionLab design system from a base shadcn installation. Every token value, every component dimension, every interaction rule is specified. Build in the order described in Part 8._
