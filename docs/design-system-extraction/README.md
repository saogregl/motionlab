# MotionLab → Lab Design System Extraction

> Inventory, critique, and extraction plan for sharing MotionLab's UI surface with the sibling [`lab`](../../../lab) project — a cloud-native, browser-based CAE platform built on React + Three.js + Tailwind + MobX.

This directory holds a comprehensive component-by-component audit of every UI surface in MotionLab, evaluating each for design quality, antipatterns, token compliance, and reuse potential in `lab`. The goal is to land at a clean shared design system that both products can consume without forcing MotionLab-specific concepts (Chrono, mechanisms, joints, sensors) into the cloud product.

## Documents in this directory

| # | Doc | Scope | Components |
|---|---|---|---|
| 01 | [01-ui-primitives.md](./01-ui-primitives.md) | shadcn/Radix layer in `packages/ui/src/components/ui/` | 18 |
| 02 | [02-primitives.md](./02-primitives.md) | Engineering-flavored primitives in `packages/ui/src/components/primitives/` | 24 |
| 03 | [03-shell-and-engineering.md](./03-shell-and-engineering.md) | App shell + math display components | 14 |
| 04 | [04-product-dialogs-inspectors.md](./04-product-dialogs-inspectors.md) | Product dialogs and inspectors in `packages/frontend` | 30 |
| 05 | [05-product-panels-viewport.md](./05-product-panels-viewport.md) | Product panels, toolbars, viewport overlays | 23 |
| — | **README.md** (this file) | Master index, cross-cutting findings, action plan | — |

**~109 components inventoried.**

---

## TL;DR

- **MotionLab's design system is in good shape.** The token layer (Carbon g10/g100, layered surfaces, semantic states, joint/axis/status colors, chart palette, motion, elevation, z-index) is mature, well-mapped to Tailwind v4 utilities via `@theme inline`, and **fully portable to `lab`** with no changes.
- **The `@motionlab/ui` package is mostly extractable.** Of the 56 components in `packages/ui`, **44 can be extracted as-is or with trivial fixes**, **8 need targeted refactoring**, and only **4 should stay in MotionLab** because they encode domain concepts (joints, mechanisms, sensors).
- **Product components in `packages/frontend` are mostly KEEP-IN-MOTIONLAB**, but they hide ~15 reusable patterns (debounced inputs, entity links, form dialogs, async actions, tree browsers, world-space overlays, command palette) that should be lifted into `@motionlab/ui` so `lab` can build its own product surface on the same primitives.
- **Hot path is clean.** Per-frame components (chart, label overlay, world-space overlay) correctly use RAF + imperative DOM and stay out of the React render loop.
- **Token gaps are small but real.** ~15 tokens are missing or implicit (mono text scale, popover blur/saturate, switch dimensions, inspector header height, context-menu item height). All should be added before extraction.

---

## Extraction verdict matrix

### `packages/ui` — ready to ship

| Layer | Total | Extract as-is | Extract with fixes | Keep | Replace |
|---|---:|---:|---:|---:|---:|
| `ui/` (shadcn) | 18 | 10 | 8 | 0 | 0 |
| `primitives/` | 24 | 19 | 2 | 2 | 0 |
| `shell/` | 8 | 3 | 5 | 0 | 0 |
| `engineering/` | 6 | 2 | 4 | 0 | 0 |
| **Total** | **56** | **34** | **19** | **2** | **0** |

### `packages/frontend` — mine for patterns, do not copy

53 product components (dialogs, inspectors, panels, toolbars, viewport overlays). Almost all are **KEEP IN MOTIONLAB** at the component level — they couple to mechanism/joint/sensor/run domain. Their value to `lab` is in the **patterns hidden inside them**, captured in the [Pattern Catalog](#pattern-catalog) below.

---

## Cross-cutting design issues

These show up across multiple component groups and should be addressed in a single pass before extraction.

### 1. Hardcoded backdrop blur/saturate
**Where:** `ui/context-menu`, `ui/dropdown-menu`, `ui/select`, several panels.
**Problem:** `backdrop-blur-2xl backdrop-saturate-150` repeated literally; not in token system.
**Fix:** Add `--popover-blur` and `--popover-saturate` to `globals.css`, mapped via `@theme inline` and consumed via utilities.

### 2. Mono text scale missing
**Where:** `NumericInput`, `TimelineTransport`, `StatusBar`, `Vec3Display`, `QuatDisplay`, diagnostics, ~6 components total.
**Problem:** `text-[11px]` and `text-[10px]` for numeric/code display, hardcoded.
**Fix:** Add `--text-mono-xs: 11px` and `--text-mono-2xs: 10px` to the typography scale. (Note: existing `--text-3xs` is 10px; some uses can collapse onto it.)

### 3. Resize/pointer logic embedded in shell components
**Where:** `AppShell`, `BottomPanel`, `FloatingPanel`.
**Problem:** Each component owns its own ResizeObserver and pointer-drag handlers inline. Blocks reuse without dragging the whole shell.
**Fix:** Extract `usePanelResize()` and `useResizeObserver()` into `packages/ui/src/hooks/`. Shell components consume the hooks; `lab` can build its own shell on the same hooks.

### 4. Selected-state hardcodes `text-white`
**Where:** `TreeRow`, possibly `WorkspaceTabBar`.
**Problem:** Tokens already exist (`--tree-selection-text`) but components bypass them. Breaks any future high-contrast or alternate accent.
**Fix:** Replace literal `text-white` with `text-[var(--tree-selection-text)]`.

### 5. Callback explosion in domain primitives
**Where:** `ContextMenus` (15+ callbacks), `StatusBar` (15+).
**Problem:** Imperative orchestration instead of compound components. Forces every consumer to wire every action whether they need it or not.
**Fix:** Replace with compound components — `<ContextMenu><MenuItem onClick={…}>…</MenuItem></ContextMenu>` — so consumers compose only what they need. This also unblocks extracting `ContextMenus` to the shared package, since the component would no longer know about joints/datums/mechanisms.

### 6. Debounce reimplemented per inspector
**Where:** Every inspector in `packages/frontend/src/components/`.
**Problem:** ~10 components own their own `useRef`-based 300ms debounce. No shared hook.
**Fix:** Add `useDebouncedCallback` to `@motionlab/ui/hooks`. Migrate inspectors.

### 7. Hardcoded hex outside the token layer
- `TopBar`: `#e81123` (Windows close button red) — Electron-specific, should be conditional or tokenized.
- `QuatDisplay`: `text-amber-500` — should be `text-warning`.
- `DiagnosticsPanel`: `red-400`, `yellow-400` — should map to `--danger`, `--warning`, `--info`.
- `ChartPanel`: defensive hex fallbacks for series colors — should rely on `--chart-series-*` tokens that already exist.

### 8. Z-index scale violations
**Where:** `EntityLabelOverlay` line 383: `zIndex: 15` literal.
**Otherwise the `--z-*` scale (`--z-base/panel/toolbar/floating/overlay/popover/modal/toast`) is well-respected.** Audit found only this one offender.

---

## Token gap analysis

The token system in `packages/ui/src/globals.css` is the single source of truth for color, type, spacing, motion, elevation, and z-index. Audit found **15 missing tokens** that components currently work around with magic numbers. Adding these to `globals.css` is the prerequisite for clean extraction.

```css
/* Add to :root in globals.css */

/* Mono text scale — for numeric/code display */
--text-mono-xs:  11px;   /* NumericInput, TimelineTransport time, vec3 components */
--text-mono-2xs: 10px;   /* unit labels, tick marks (or collapse onto --text-3xs) */

/* Field & control sizing */
--field-height:        28px;
--switch-width:        32px;
--switch-height:       18px;
--switch-thumb-size:   14px;
--switch-thumb-gap:     2px;

/* Menu / popover dimensions */
--menu-min-width:           200px;
--menu-item-h:               28px;  /* replaces ContextMenus local `h-7` */
--menu-item-indent:          16px;
--menu-item-check-spacing:    8px;

/* Popover surface effects */
--popover-blur:       12px;   /* alias for --panel-blur */
--popover-saturate:  150%;
--overlay-bg:        rgba(0, 0, 0, 0.4);

/* Tooltip */
--tooltip-delay:       300ms;
--tooltip-max-width:   240px;
--tooltip-arrow-size:    6px;

/* Inspector / floating card */
--inspector-header-h:  44px;
--float-card-min-w:   240px;
--float-card-w:       260px;
--float-card-max-w:   300px;
```

Then mirror them in `@theme inline` so they become Tailwind utilities (`h-field`, `text-mono-xs`, `bg-overlay`, etc.).

---

## Pattern catalog

These are the patterns hidden inside `packages/frontend` components that should be lifted into `@motionlab/ui` (or a new `@motionlab/ui-engineering` subpackage) so both MotionLab and `lab` can build their product UI on top.

### Hooks

| Pattern | Seen in | Proposed | Why |
|---|---|---|---|
| Debounced setter | every inspector | `useDebouncedCallback(fn, ms)` | Stops 10× reimplementation |
| Form state with create/edit toggle | `Create*Dialog`, `Edit*Dialog` | `useDialogForm({ initial, onSubmit })` | Resets cleanly on open |
| Async file-picker action | `AttachGeometryDialog`, `MissingAssetsDialog` | `useAsyncAction({ pick, run })` | Uniform error/loading |
| Panel resize | `AppShell`, `BottomPanel`, `FloatingPanel` | `usePanelResize`, `useResizeObserver` | Decouples shell |
| RAF-driven projection | `WorldSpaceOverlay`, `EntityLabelOverlay` | `useWorldToScreen(cameraRef, points)` | Off the React hot path |

### Components

| Pattern | Seen in | Proposed | Why |
|---|---|---|---|
| Compound inspector layout | every `*Inspector` | `<Inspector><Section><PropertyRow/></Section></Inspector>` | Replaces ad-hoc structure |
| Conditional row (toggle reveals input) | `JointInspector`, `LoadInspector` | `<PropertyRowWithToggle/>` | Recurring affordance |
| Variant section | multi-type loads, sensors | `<TypedSection type=… />` | Replaces nested ternaries |
| Entity cross-link | `JointInspector`, `LoadInspector` | `<EntityLink id=…/>` | Selectable, hover-highlightable id |
| Simulation values block | 4+ inspectors | `<SimulationValuesSection channels=… />` | Already exists in `frontend/components/inspector/sections`, move up |
| Hierarchical color-coded tree | `ChannelBrowser`, `ProjectTree`, `BodyTree` | `<HierarchicalTree items renderRow/>` | Used 3× already |
| Command palette | `CommandPalette` | `<CommandPalette registry=… />` | Generic, high reuse |
| Multi-axis chart with scrub | `ChartPanel` | `<TimeSeriesChart axes scrubMs/>` | uPlot-agnostic shape |
| World-space overlay framework | `WorldSpaceOverlay`, `EntityLabelOverlay` | `<WorldOverlay items renderItem/>` | Critical for any 3D CAE UI |
| Cursor-following tooltip | `FaceTooltip` | `<CursorTooltip/>` | Generic |
| Auto-dismissing toast | `ModeIndicator` | extend existing `sonner` wrapper | Simple |
| Settings dialog with presets | `SimulationSettingsDialog` | `<SettingsDialog presets=… />` | Recurring shape |

---

## Suggested action plan

The audit suggests four phases. Each phase produces a self-contained shippable artifact.

### Phase 1 — Token consolidation (1 day)

1. Add the 15 missing tokens listed in [Token gap analysis](#token-gap-analysis) to `packages/ui/src/globals.css`.
2. Add `@theme inline` mappings so they become Tailwind utilities.
3. Replace the cross-cutting violations: hardcoded `text-white`, `text-amber-500`, `red-400`/`yellow-400`, `text-[10px]`, `text-[11px]`, `backdrop-blur-2xl backdrop-saturate-150`, `zIndex: 15`.
4. Run Storybook visual diff to confirm zero regressions.

**Output:** A clean `globals.css` that is the canonical token source for both MotionLab and `lab`.

### Phase 2 — Lift shared hooks (1 day)

1. Create `packages/ui/src/hooks/` (or expand it).
2. Extract `useDebouncedCallback`, `usePanelResize`, `useResizeObserver`, `useWorldToScreen`, `useAsyncAction`, `useDialogForm`.
3. Migrate the existing usages inside `packages/frontend` to the new hooks.
4. Test coverage on each hook.

**Output:** A small, well-tested hook surface that both products can consume.

### Phase 3 — Refactor blockers in `@motionlab/ui` (2-3 days)

For the 8 components flagged **EXTRACT WITH FIXES**:
- `command`, `context-menu`, `dropdown-menu`, `select`, `switch`, `tooltip`, `sonner` — apply token fixes from Phase 1.
- `FloatingToolCard` — decouple position state, add `forwardRef`.
- `StatusBar` — parameterize entity types so it isn't tied to MotionLab labels.
- Convert `ContextMenus` to a compound API so it loses MotionLab domain knowledge.
- `AppShell` / `BottomPanel` / `FloatingPanel` — consume the new hooks instead of inline resize logic.
- Engineering displays (`Vec3Display`, `QuatDisplay`, `EditableInertiaMatrix`) — accept a `renderInput` prop so they don't hard-link `NumericInput`.

**Output:** `packages/ui` is 100% extractable with zero MotionLab leakage.

### Phase 4 — Bootstrap the shared package for `lab` (1-2 days)

1. Decide on the shared package shape: keep it in this monorepo as `@motionlab/ui` and consume from `lab`, or publish to a private registry, or vendor.
2. Lift the 12 high-value patterns from the [Pattern catalog](#pattern-catalog) into a new `@motionlab/ui-engineering` (or similar) layer that depends on `@motionlab/ui`.
3. Document the composition rules — compound components, slot APIs, render props — so future additions don't regress into prop explosion.
4. Stand up a Storybook surface in `lab` that imports the shared package and renders the inventory.

**Output:** `lab` can author its first viewport-attached panel without rewriting any chrome.

---

## Notes for `lab`

The good news: `lab`'s tech stack (React + Tailwind + Three.js + MobX) is identical to MotionLab's frontend. The token system, hooks, and primitives drop in with zero adaptation. The one architectural decision `lab` needs to make up front is whether to adopt the **layout system** in `packages/ui/src/layout/` (LayoutProvider + LayoutManager) or build its own. The shell components depend on it. If `lab` adopts it, the entire shell is reusable as a unit; if not, individual shell components (`TopBar`, `WorkspaceTabBar`, `ViewportHUD`, `FloatingPanel`) are still independently extractable.

Domain-specific things that should **not** travel to `lab`:
- joint colors (`--joint-*` tokens) and joint inspector / context menu logic
- mechanism/body/sensor/actuator entity types
- Chrono-flavored simulation channel definitions
- the `inspectors/` directory in `packages/frontend`

Things that **should** travel:
- everything in `packages/ui`
- the entire token layer in `globals.css` (minus the joint colors if you want, though they're cheap to leave in)
- the patterns in the catalog above
- the math display components (`Vec3Display`, `QuatDisplay`, `InertiaMatrixDisplay`) — these are CAE-generic, not MotionLab-specific

---

## How this audit was produced

Five parallel inventory passes across the codebase, each producing one of the numbered docs in this directory. Each component was scored on:

1. **Purpose** and **API surface** (props, variants, slots)
2. **Design critique** against React composition best practices and the Vercel React patterns guide (composition over boolean props, keep components dumb, avoid `useEffect` for derived state, no React on the per-frame hot path)
3. **Token compliance** — every hardcoded color, dimension, shadow, and z-index was cross-checked against `globals.css`
4. **Extraction verdict** — explicit one of `EXTRACT AS-IS` / `EXTRACT WITH FIXES` / `KEEP IN MOTIONLAB` / `REPLACE`, with a one-line justification

For full per-component findings, read the numbered docs.
