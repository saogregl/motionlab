# Shell & Engineering Display Components — Extraction Inventory

## Token Usage Notes

The design token system (`packages/ui/src/globals.css`) provides:
- **Layout CSS variables**: `--topbar-h`, `--panel-left-w`, `--bottom-panel-h`, `--panel-float-inset` (lines 81–98)
- **Z-index layers**: `--z-base`, `--z-panel`, `--z-toolbar`, `--z-floating`, `--z-overlay`, `--z-popover`, `--z-modal`, `--z-toast` (lines 70–78)
- **Typography/spacing**: `--text-xs` through `--text-2xl`, `--space-1` through `--space-12`, `--duration-fast/normal/slow`, `--easing-default/out` (lines 24–62)
- **Colors**: `--layer-base`, `--layer-raised`, `--layer-elevated`, `--layer-base-glass`, `--field-elevated`, `--border-default`, `--accent-primary`, semantic tokens, and axis/joint/status colors (lines 128–240)

All components referenced below should use these tokens via CSS custom properties (e.g., `z-[var(--z-panel)]`, `bg-[var(--layer-base)]`) or Tailwind mappings (e.g., `bg-layer-base`, `text-text-primary`).

---

## Shell Components

### 1. AppShell
**Path**: `packages/ui/src/components/shell/app-shell.tsx`

**Purpose**: Root layout container orchestrating top bar, floating panels (left/right), viewport, bottom panel, tab bar, and status bar into a standard desktop application grid.

**Key Props / Variants**:
- `topBar`, `leftPanel`, `rightPanel`, `viewport`, `bottomPanel`, `viewportOverlays`, `tabBar`, `statusBar` as ReactNode slots
- `leftPanelOpen`, `leftPanelWidth`, `onLeftPanelWidthChange` (same for right)
- `bottomPanelExpanded` (controlled)
- Default panel width hardcoded to 288px (line 41)

**Design Critique**:
- **Embedded resize logic via ResizeObserver** (lines 66–81): Couples layout management tightly to AppShell. Should be pushed to layout system hooks.
- **Hardcoded slot IDs** (`'panel-bottom'`, `'main-area'`, lines 69, 95): Inflexible for reuse in sibling projects with different slot names. Consider parameterizing.
- **Tight coupling to LayoutManager**: Requires `useLayoutManager()` + `useLayoutRoot()` from `packages/ui/src/layout/`. AppShell cannot be extracted without bundling the layout system.
- **Fixed slot count**: Assumes top → main (with left/right/bottom) → tab bar → status bar structure. Hard to adapt if `lab` needs a different layout (e.g., no workspace tabs, different docking strategy).
- **No forwardRef or data attributes for child queries**: Children rendered as opaque ReactNode slots; difficult to imperatively test or inspect shell structure from parent apps.
- **Inline style for bottom panel positioning** (line 129–133): Uses inline `style={{}}` instead of CSS token class; should be refactored to use layout context-driven positioning.

**Custom Token Usage**:
- Line 87: `bg-bg-app`, `text-text-primary`, `font-[family-name:var(--font-ui)]` — correct token usage
- Line 97: `z-[var(--z-base)]` — token-driven z-index, good
- Lines 128–133: Inline styles with CSS var refs — acceptable but not composable
- Missing: no explicit dark mode testing observed; relies on global `.dark` class cascade

**Improvement Actions**:
1. **Priority 1**: Extract ResizeObserver logic into a `useBottomPanelResize()` hook; AppShell should only compose layout, not manage panel state imperatively. See `layout-manager.ts`.
2. **Priority 2**: Parameterize slot IDs and layout assumptions (e.g., `slotConfig: { topBar: string; mainArea: string; ... }`).
3. **Priority 3**: Add `ref` forwarding (`forwardRef<HTMLDivElement>`) and document data-slot attributes for integration testing.
4. **Priority 4**: Decouple LayoutProvider requirement; `lab` may want its own layout engine. Consider a composition-over-inheritance approach (e.g., `<AppShell.Provider><AppShell>...</AppShell></AppShell.Provider>`).

**Extraction Verdict**: **EXTRACT WITH FIXES** — High value for `lab`, but ResizeObserver coupling and LayoutManager dependency must be abstracted before reuse.

---

### 2. TopBar
**Path**: `packages/ui/src/components/shell/top-bar.tsx`

**Purpose**: Fixed-height (38px) title bar with project name, command search, transport controls, and Electron window controls.

**Key Props / Variants**:
- `projectName`, `isDirty`, `status`, `actions`, `transportControls` (all optional ReactNode)
- `onLogoClick` callback; internally renders static span or button link
- WindowControls sub-component for Electron-only features

**Design Critique**:
- **Electron API baked into component** (lines 28–79): `globalThis.motionlab.windowMinimize/Maximize/Close` and async `windowIsMaximized()` tightly couple TopBar to Electron. For `lab` (browser-only), this code path is dead. Consider extracting into a separate `<ElectronWindowControls>` component or a feature flag.
- **Hardcoded "MotionLab" branding** (lines 109, 120): Non-reusable. Should accept `appName` prop.
- **Fixed height via token** (line 97, `h-[var(--topbar-h)]`): Good, token-driven; but 38px may not suit all apps.
- **Magic px in padding and gaps** (line 97, `ps-2 pe-2`; line 102, `gap-2`): Uses Tailwind spacing shortcuts; check if these should be token-mapped (e.g., `ps-[var(--space-2)]`).
- **Search command UI is decorative** (lines 134–146): Placeholder only; no actual keyboard handler. Should be documented as requiring external integration.
- **Flex layout via gap** (lines 152, `gap-3`): OK, but consider whether inter-cluster spacing should also be a token.
- **[-webkit-app-region:drag] for Electron drag** (lines 97, 107, 152): Specific to Electron; should be conditional or documented.
- **No dark mode test visible in code**; relies on CSS var overrides in globals.css (lines 295–416).

**Custom Token Usage**:
- Line 87: `h-[var(--topbar-h)]`, `bg-layer-base`, `text-text-primary` — token-driven, correct
- Line 97, 102, 152: `ps-2 pe-2`, `gap-2`, `gap-3` — Tailwind spacing, not token-mapped (should these be `ps-[var(--space-2)]`?)
- Line 72: `hover:bg-[#e81123]` — hardcoded Windows red for close button (non-token semantic); acceptable for OS-standard UI
- Line 107: `text-accent-text`, `hover:text-accent-text` — correct token usage

**Improvement Actions**:
1. **Priority 1**: Extract Electron window controls into a separate optional `<ElectronWindowControls>` component or conditional render behind a feature flag (`enableElectronControls?: boolean`).
2. **Priority 2**: Add `appName` prop and remove hardcoded "MotionLab".
3. **Priority 3**: Document the search input as a visual placeholder; provide guidance for integrating an actual command palette.
4. **Priority 4**: Review and standardize spacing (ps/pe/gap) against token scale. Consider `ps-[var(--space-2)]` vs `ps-2`.

**Extraction Verdict**: **EXTRACT WITH FIXES** — Shell component is generic and reusable, but Electron coupling must be isolated and "MotionLab" branding removed.

---

### 3. LeftPanel
**Path**: `packages/ui/src/components/shell/left-panel.tsx`

**Purpose**: Vertical layout for left sidebar with tabs (Structure, Studies, Issues), search filter, tree/list view toggle, and content slot.

**Key Props / Variants**:
- `children` (ReactNode) — main content
- `createAction` (ReactNode) — optional action button slot
- Local `viewMode` state ('tree' | 'list') with no external control

**Design Critique**:
- **Hard-coded tab structure** (lines 19–39): Only Structure, Studies, Issues tabs. What if `lab` needs different tabs (e.g., Objects, Properties, History)? Should be parameterized or moved to the consuming app.
- **Uncontrolled viewMode state** (line 14): State lives in LeftPanel, but `lab` may want to sync this to global app state. Should support both controlled (`viewMode`, `onViewModeChange`) and uncontrolled modes.
- **Search input is non-functional** (lines 42–48): Placeholder only; no onFilter callback. Either remove or document that consumer must inject functionality.
- **Hardcoded empty state messages** (lines 65, 71): "No studies defined", "No issues" — brittle. Should accept a slot component for each tab's empty state.
- **Component tree hardcoding**: No way to customize tab list or their behavior (e.g., add/remove tabs dynamically).
- **Data attributes present** (`data-slot="left-panel"`): Good for testing.

**Custom Token Usage**:
- Line 17: `flex h-full flex-col` — layout tokens, correct
- Line 20: `h-7 w-full`, `px-0` — Tailwind units, not tokens; acceptable for very small components
- Line 23, 28, 33: `text-[length:var(--text-xs)]` — token-driven typography, correct
- Line 43: `bg-[var(--layer-base)]`, `border-[var(--border-field-focus)]` — token-driven, correct
- Line 45: `text-[var(--text-disabled)]` — token-driven, correct

**Improvement Actions**:
1. **Priority 1**: Parameterize tab configuration. Accept `tabs: { id: string; label: string; icon?: ReactNode; children: ReactNode }[]` and remove hardcoded tabs.
2. **Priority 2**: Add controlled mode for `viewMode` (prop + callback).
3. **Priority 3**: Add `onSearch` callback or remove non-functional search input.
4. **Priority 4**: Remove hardcoded empty state messages; accept a slot or render function for each tab's content when empty.

**Extraction Verdict**: **EXTRACT WITH FIXES** — Structure is reusable, but hard-coded tabs and uncontrolled state must be abstracted.

---

### 4. RightPanel
**Path**: `packages/ui/src/components/shell/right-panel.tsx`

**Purpose**: Minimal vertical flex container for right sidebar content.

**Key Props / Variants**: `children`, `className` only.

**Design Critique**:
- **Trivially simple**: Just a flex container. No logic, no state. Almost no extraction risk.
- **Correct token usage**: `flex h-full flex-col` — layout utilities.

**Custom Token Usage**: None; pure layout.

**Improvement Actions**: None; this component is extraction-ready.

**Extraction Verdict**: **EXTRACT AS-IS** — Zero risk, immediate reuse.

---

### 5. BottomPanel
**Path**: `packages/ui/src/components/shell/bottom-panel.tsx`

**Purpose**: Collapsible horizontal dock panel with tab bar, resize handle (top edge), and conditional content rendering.

**Key Props / Variants**:
- `tabs: DockTab[]` — list of `{ id, label }`
- `activeTab`, `onTabChange`, `expanded`, `onExpandedChange` — controlled state
- `children` — content slot (only rendered when expanded)
- Inline `style?: React.CSSProperties` override

**Design Critique**:
- **Embedded resize logic** (lines 49–79): Pointer event handling for drag-to-resize is tightly coupled inside BottomPanel. Should be extracted to a `usePanelResize()` hook (similar to FloatingPanel).
- **Magic min/max values via getComputedStyle** (lines 69–70): Reads `--bottom-panel-min` and `--bottom-panel-max` from DOM at runtime. Brittle; should accept `minHeight` / `maxHeight` props.
- **Direct DOM mutation** (line 73, `panel.style.height = ...`): Bypasses React; ResizeObserver in AppShell (lines 72–78 of app-shell.tsx) then observes this and updates layout manager. Two-way coupling is fragile.
- **Tab toggle semantics** (lines 81–89): Clicking the active tab toggles expand; clicking an inactive tab switches tab AND expands. Works, but non-obvious; should be documented or configurable.
- **Inline style for unit override** (line 101): `style={style}` allows overriding height, but this breaks the controlled component pattern.
- **Glass panel styling** (lines 97–98): Hardcoded `backdrop-blur-[var(--panel-blur)]` and `shadow-[var(--shadow-low)]` — correct token usage, but consider whether these should be customizable.
- **No disable state for expansion when tabs are empty**: If `tabs` is empty, expand/collapse still works; may be unexpected.

**Custom Token Usage**:
- Line 97: `rounded-[var(--panel-radius)]`, `border-[var(--border-default)]`, `bg-[var(--layer-base-glass)]`, `backdrop-blur-[var(--panel-blur)]`, `shadow-[var(--shadow-low)]` — all token-driven, excellent
- Line 109: `bg-accent-primary/20` — token via opacity modifier, good
- Line 119: `bg-[var(--tab-contained-bg)]` — token, correct
- Line 128: `bg-[var(--tab-contained-active)]`, `text-text-primary` — token, correct

**Improvement Actions**:
1. **Priority 1**: Extract resize logic into a reusable hook (e.g., `usePanelResize(ref, minHeight, maxHeight)`). Do not mutate DOM directly; use controlled state.
2. **Priority 2**: Accept `minHeight`, `maxHeight` props instead of reading from CSS.
3. **Priority 3**: Document or parameterize tab click toggle semantics (e.g., `toggleExpandOnActiveTabClick?: boolean`).
4. **Priority 4**: Remove inline `style` override or formalize it as a `heightOverride` prop with validation.

**Extraction Verdict**: **EXTRACT WITH FIXES** — High value for `lab`, but DOM mutation and uncontrolled resize must be refactored to use React state / controlled patterns.

---

### 6. FloatingPanel
**Path**: `packages/ui/src/components/shell/floating-panel.tsx`

**Purpose**: Positioned floating side panel (left or right) with resize handle on the inner edge, smooth open/close animation, and panel-aware layout integration.

**Key Props / Variants**:
- `side: 'left' | 'right'`, `open`, `width`, `minWidth`, `maxWidth`
- `onWidthChange` callback
- `onOpenChange` callback (not in current implementation; should be added)
- Default width 288px; min 240px, max 420px

**Design Critique**:
- **Direct DOM mutation during drag** (lines 54–56): Sets `panel.style.width` imperatively; bypasses React state. Optimizes drag performance, but couples layout engine updates to BottomPanel/AppShell ResizeObserver pattern.
- **LayoutManager coupling** (lines 31, 56): Calls `useLayoutSlot()` and `manager.updateSlot()` imperatively. Should be extracted from this component; `lab` may use a different layout system.
- **Hardcoded defaults** (lines 22–23, minWidth 240, maxWidth 420): These should be configurable via token or prop.
- **Missing onOpenChange** (line 9 prop defined but never used): Intent is there but incomplete.
- **Inline style for initial width** (line 94, `style={{ width: width ?? undefined }}`): OK, but could be a CSS variable assignment instead.
- **CSS custom property for bottom constraint** (line 82, `bottom-[var(--side-panel-bottom,var(--panel-float-inset))]`): Good for layout-aware positioning, but assumes LayoutManager sets this. Not documented.
- **Slide animation hardcoded** (lines 85–91): Uses `transform` and `opacity` transitions with tokens. Good, but consider whether these should be customizable.
- **No aria-label or role for panel**: Accessibility could be improved.

**Custom Token Usage**:
- Line 82: `top-[var(--panel-float-inset)]`, `bottom-[var(--side-panel-bottom,var(--panel-float-inset))]`, `z-[var(--z-panel)]` — token-driven, correct
- Line 84: `rounded-[var(--panel-radius)]`, `border-[var(--border-default)]`, `bg-[var(--layer-base-glass)]`, `shadow-[var(--shadow-low)]` — token-driven, excellent
- Line 85: `duration-[var(--duration-normal)]`, `ease-[var(--easing-default)]` — token-driven motion, correct
- Line 104: `bg-accent-primary/10` — token with opacity, good

**Improvement Actions**:
1. **Priority 1**: Decouple from LayoutManager. Extract layout slot registration into a separate hook or provider (e.g., `useLayoutSlotOptional(id, side, width, open, instant)` that gracefully no-ops if no LayoutProvider).
2. **Priority 2**: Complete `onOpenChange` prop implementation.
3. **Priority 3**: Parameterize minWidth/maxWidth or derive from tokens.
4. **Priority 4**: Add `role="complementary"`, `aria-label` for accessibility.

**Extraction Verdict**: **EXTRACT WITH FIXES** — High reusable value, but LayoutManager dependency must be optional/swappable.

---

### 7. ViewportHUD
**Path**: `packages/ui/src/components/shell/viewport-hud.tsx`

**Purpose**: Absolute-positioned overlay grid placing 6 optional child components around viewport edges (top-left, top-center, top-right, bottom-left, bottom-center, bottom-right).

**Key Props / Variants**:
- `topLeft`, `topCenter`, `topRight`, `bottomLeft`, `bottomCenter`, `bottomRight` — all optional ReactNode
- Reads CSS variables `--vp-inset-left`, `--vp-inset-right`, `--vp-inset-bottom` (set by AppShell layout manager)

**Design Critique**:
- **CSS variable coupling** (lines 43, 55, 80, 93): ViewportHUD expects LayoutManager to set `--vp-inset-*` CSS vars on the main-area div. Without AppShell + LayoutManager, this breaks. Good for MotionLab, but tight coupling for extraction.
- **Hardcoded 12px corner inset** (lines 43, 67, 80, 94): Magic number; should be a token (e.g., `--hud-corner-inset`).
- **Math for centered position** (line 55): Complex calc to center horizontally while accounting for side panel insets. Correct but dense; could be a token-driven utility class.
- **No pointer-events on root** (line 37, `pointer-events-none`), then re-enabled on children (line 42, 52, 67, 74, 87, 102, `pointer-events-auto`). Good pattern, but verbose.
- **Slot names hardcoded** (lines 38, 50, 62, 74, 87, 102, `data-slot="viewport-hud-*"`): Good for debugging, but no export of slot identifiers for consumers.

**Custom Token Usage**:
- Line 37: `absolute inset-0 pointer-events-none` — layout utilities, no tokens
- Lines 43, 55, 67, 80, 93: CSS custom properties `--vp-inset-left`, `--vp-inset-right`, `--vp-inset-bottom` — good, but hardcoded 12px corner inset should be `var(--hud-corner-inset)` or similar

**Improvement Actions**:
1. **Priority 1**: Make ViewportHUD layout-agnostic. Add optional props for corner insets and viewport inset CSS var names, with sensible defaults. E.g., `cornerInset='12px'`, `insetVarPrefix='--vp-inset-'`.
2. **Priority 2**: Extract `--hud-corner-inset` token into globals.css.
3. **Priority 3**: Document the CSS variable contract (which vars this component expects).

**Extraction Verdict**: **EXTRACT AS-IS** — The component itself is layout-agnostic and accepts CSS variables as input. Good design. LayoutManager coupling is in the **consumer** (AppShell), not ViewportHUD itself.

---

### 8. WorkspaceTabBar
**Path**: `packages/ui/src/components/shell/workspace-tab-bar.tsx`

**Purpose**: Fixed-height (28px) bottom tab bar with + button, closeable/active tabs, and keyboard-aware focus handling.

**Key Props / Variants**:
- `tabs: WorkspaceTab[]` — `{ id, label, active?, dirty? }`
- `onTabSelect`, `onTabClose`, `onNewTab` — all optional callbacks
- All state is uncontrolled; component owns nothing

**Design Critique**:
- **Minimal, stateless design**: Pure composition. Excellent.
- **Tab close reveals on hover** (lines 70, `opacity-0 group-hover/tab:opacity-100`): Nice UX, but means close button is not keyboard-accessible. Should add `focus-visible` variant.
- **Hardcoded max width** (line 55, `max-w-[180px]`): Should be a token or prop.
- **No keyboard navigation**: Tabs not in a proper `role="tablist"` or with `role="tab"` semantics. Accessibility could be improved.
- **Dirty indicator is a dot** (line 62, `size-1.5 rounded-full`): Nice visual, but no ARIA label; screen readers won't know it's "dirty".

**Custom Token Usage**:
- Line 31: `h-[var(--bottom-tabs-h)]`, `border-border-default`, `bg-layer-recessed` — token-driven, correct
- Line 55: `text-[length:var(--text-xs)]` — token, correct
- Line 57: `border-t-accent-primary`, `bg-layer-base` — token, correct
- Line 58: `text-text-secondary`, `hover:bg-[var(--layer-recessed-hover)]` — token, correct

**Improvement Actions**:
1. **Priority 1**: Add keyboard navigation (arrow keys) and proper `role="tablist"` / `role="tab"` ARIA semantics.
2. **Priority 2**: Add `focus-visible` variant to close button for keyboard accessibility.
3. **Priority 3**: Add ARIA label to dirty indicator (e.g., `aria-label="Unsaved changes"`).
4. **Priority 4**: Parameterize max-width or move to token.

**Extraction Verdict**: **EXTRACT AS-IS** — Component is already stateless and generic. ARIA improvements recommended but not blocking.

---

## Engineering Display Components

### 1. CopyableId
**Path**: `packages/ui/src/components/engineering/copyable-id.tsx`

**Purpose**: Truncated, copyable UUID display with tooltip and visual copy feedback.

**Key Props / Variants**:
- `value: string` — the full ID
- `truncateAt: number` (default 12) — chars before ellipsis
- Standard className

**Design Critique**:
- **Minimal, focused component**: Does one thing well.
- **Clipboard API without polyfill**: Assumes modern browser; no fallback for older browsers or clipboard permission issues.
- **Timeout reset on unmount** (lines 17, 23–24): Good cleanup, but could be simplified with `useEffect(() => { ... return () => clearTimeout(...) }, [])` style.
- **Tooltip integration** (lines 28–48): Uses shadcn `<Tooltip>`, adding a dependency. Good for `lab` if it also uses shadcn.
- **No icon configuration**: Hardcoded Check / Copy icons from lucide-react. Should be customizable.

**Custom Token Usage**:
- Line 34: `text-[length:var(--text-xs)]`, `font-[family-name:var(--font-mono)]`, `text-[var(--text-secondary)]`, `duration-[var(--duration-fast)]` — token-driven, correct
- Line 43: `text-[var(--success)]` — token, correct

**Improvement Actions**:
1. **Priority 1**: None; component is well-designed. Consider adding clipboard error handling.
2. **Priority 2**: Add `copyIcon` / `copiedIcon` props if downstream apps want custom icons.

**Extraction Verdict**: **EXTRACT AS-IS** — Small, focused, generic. Depends on shadcn Tooltip (acceptable if `lab` also uses shadcn).

---

### 2. Vec3Display
**Path**: `packages/ui/src/components/engineering/vec3-display.tsx`

**Purpose**: Display or edit a 3D vector (x, y, z) with axis-colored inputs, unit label, and significant figure formatting.

**Key Props / Variants**:
- `value: { x, y, z }` — vector
- `label`, `unit`, `sigFigs` (default 4), `step` (default 0.01)
- `editable`, `onChange` — edit mode via NumericInput
- Deprecated `precision` prop (for backwards compat)

**Design Critique**:
- **Domain-specific but reusable**: Vector display is generic math, not MotionLab-specific. Good extraction candidate.
- **AxisColorLabel import** (line 3–4): Depends on CAE-specific axis color convention. Should be parameterizable or this can stay with `lab` if it uses the same convention.
- **NumericInput coupling** (line 5, import; line 59–65 usage): Another component dependency. If `lab` doesn't use this primitive, must be abstracted.
- **Significant figures vs. precision** (lines 33–40): Two props, one deprecated. Good migration path, but adds surface area for bugs.
- **Hard-coded layout** (line 51, `grid grid-cols-3`): Always 3 columns. No variant for 2D vectors or arbitrary axis count. Inflexible.
- **formatEngValue helper** (line 1): External dependency; check if it's generic or MotionLab-specific.

**Custom Token Usage**:
- Line 45: `text-[length:var(--text-2xs)]`, `text-[var(--text-secondary)]` — token, correct
- Line 48: Hardcoded `text-[10px]` — should use token `--text-3xs`
- Line 55: `bg-[var(--layer-raised)]` — token, correct
- Line 67: `text-[length:var(--text-xs)]` — token, correct

**Improvement Actions**:
1. **Priority 1**: Generalize to accept `axisCount` prop (default 3, but support 2). Or split into Vec2Display / Vec3Display.
2. **Priority 2**: Extract NumericInput dependency; accept a custom `EditableField` render function or prop.
3. **Priority 3**: Verify `formatEngValue` is generic (not Chrono-specific); if CAE-specific, wrap it.
4. **Priority 4**: Fix hardcoded `text-[10px]` → `text-[length:var(--text-3xs)]`.

**Extraction Verdict**: **EXTRACT WITH FIXES** — Math display is generic and valuable, but AxisColorLabel coupling and NumericInput assumption must be abstracted.

---

### 3. QuatDisplay
**Path**: `packages/ui/src/components/engineering/quat-display.tsx`

**Purpose**: Display or edit quaternion (x, y, z, w) with optional Euler angle mode, gimbal lock detection, and mode toggle.

**Key Props / Variants**:
- `value: { x, y, z, w }` — quaternion
- `defaultMode: 'euler' | 'quaternion'` (default 'euler')
- `label` (default 'Orientation'), `sigFigs`, `editable`, `onChange`, `disabled`, `step`
- Deprecated `precision` prop

**Design Critique**:
- **Domain-specific math logic**: Quaternion ↔ Euler conversion, gimbal lock detection — highly specialized for CAE. Question: should `lab` inherit this, or is it Chrono-specific?
- **Local euler state management** (lines 57–87): Prevents gimbal-lock snap-back during editing by keeping local euler state and re-syncing after `EDIT_SETTLE_MS`. Clever but complex. Consider whether this is needed in `lab` or if simpler quaternion-only UI is preferred.
- **Mode toggle via button** (lines 109–115): Good UX, but internal state. Should support controlled mode (prop + callback).
- **Import dependencies** (lines 1–7): `formatEngValue`, `eulerDegToQuat`, `quatToEulerDeg`, `isNearGimbalLock`, `AxisColorLabel`, `NumericInput`. Heavy domain specificity.
- **Hard-coded grid layouts** (lines 120, 148): 3 columns for Euler, 4 for Quaternion. Inflexible.
- **Gimbal lock warning is hardcoded** (lines 101–108): Uses amber-500 (hardcoded color, not token). Should be warning token.
- **No accessibility for gimbal lock indicator**: `title` attribute only; no ARIA description.

**Custom Token Usage**:
- Line 98: `text-[length:var(--text-2xs)]`, `text-[var(--text-secondary)]` — token, correct
- Line 104: Hardcoded `text-amber-500` — NOT a token; should be `text-warning` or `text-[var(--warning)]`
- Line 111: `border-[var(--border-subtle)]`, `bg-[var(--field-elevated)]`, `text-[var(--text-secondary)]` — token, correct
- Line 124: `border-[var(--border-subtle)]`, `bg-[var(--field-elevated)]` — token, correct

**Improvement Actions**:
1. **Priority 1**: Fix hardcoded `text-amber-500` → use warning token.
2. **Priority 2**: Add controlled mode for `mode` (prop + callback); remove internal state toggle. Or document that mode toggle is user-driven and app doesn't control it.
3. **Priority 3**: Parameterize gimbal lock threshold or document the constant.
4. **Priority 4**: Assess whether `lab` needs gimbal-lock handling; if not, extract into a separate `<GimbalLockAwareQuatDisplay>` or provide a non-gimbal-aware mode.

**Extraction Verdict**: **EXTRACT WITH FIXES** — Quaternion display is valuable, but gimbal-lock complexity and hardcoded warning color must be addressed. Consider whether this should be in shared library or stay MotionLab-specific.

---

### 4. SelectionChip
**Path**: `packages/ui/src/components/engineering/selection-chip.tsx`

**Purpose**: Compact inline display of selected entity (icon + name + > chevron) with optional click handler.

**Key Props / Variants**:
- `icon: ReactNode` (optional) — 14px icon slot
- `name: string` — entity label
- `onClick` (optional) — if provided, renders as button; otherwise div
- Standard className

**Design Critique**:
- **Minimal, focused, reusable**: Excellent generic component.
- **Polymorphic tag** (line 17, `const Tag = onClick ? 'button' : 'div'`): Smart pattern for conditional semantics.
- **Hard-coded chevron** (line 46): Always shows >; should be customizable or optional.
- **Max-width truncation** (line 42, `max-w-[160px]`): Should be a prop or token.
- **No accessibility on chevron**: Just a visual indicator; no ARIA label or semantic meaning.

**Custom Token Usage**:
- Line 24: `bg-[var(--layer-base)]`, `border-[var(--border-subtle)]`, `shadow-[var(--shadow-low)]`, `rounded-[var(--radius-md)]` — token-driven, correct
- Line 26: `hover:bg-[var(--layer-base-hover)]` — token, correct
- Line 42: `text-[length:var(--text-xs)]`, `text-[var(--text-primary)]` — token, correct

**Improvement Actions**:
1. **Priority 1**: Parameterize max-width or move to token.
2. **Priority 2**: Add `chevronIcon?: ReactNode` prop to customize or disable chevron.
3. **Priority 3**: Add `aria-label` when clickable.

**Extraction Verdict**: **EXTRACT AS-IS** — Already generic and reusable. Minor prop parameterization recommended.

---

### 5. InertiaMatrixDisplay
**Path**: `packages/ui/src/components/engineering/inertia-matrix-display.tsx`

**Purpose**: Read-only 3×3 symmetric inertia matrix display with colored diagonal, mirrored off-diagonal, and formatted values.

**Key Props / Variants**:
- `ixx, iyy, izz, ixy, ixz, iyz` — 6 unique matrix components
- `sigFigs` (default 4), `unit` (default "kg m²")

**Design Critique**:
- **Domain-specific** (inertia matrix is CAE math): Valuable for `lab` if CAE-focused; less so for generic component library.
- **3×3 matrix layout hardcoded** (lines 79, `grid-cols-[auto_1fr_1fr_1fr]`): Only works for symmetric 3×3; inflexible for different matrix sizes.
- **Mirrored cell styling** (lines 37–52): Helper functions for diagonal, mirror, and regular cells. Good DRY.
- **Near-zero value detection** (line 45, `Math.abs(value) < 1e-10`): Smart, but threshold is magic number. Should be a prop.
- **Hardcoded unit label** (line 14, default "kg m²"): Fine as default, but verifying it's generic (not Chrono-specific).

**Custom Token Usage**:
- Line 20: `text-[length:10px]`, `text-[var(--text-tertiary)]` — should use `--text-3xs` token instead of hardcoded 10px
- Line 49: `text-[length:var(--text-xs)]` — token, correct
- Line 50: `font-[family-name:var(--font-mono)]` — token, correct
- Line 52: Multiple conditional text colors using tokens — correct
- Line 56: `text-[var(--text-disabled)]` — token, correct

**Improvement Actions**:
1. **Priority 1**: Fix hardcoded `text-[10px]` → `text-[length:var(--text-3xs)]`.
2. **Priority 2**: Parameterize near-zero threshold or document it.
3. **Priority 3**: Assess CAE specificity; if generic, keep. If not, clearly mark as engineering domain.

**Extraction Verdict**: **EXTRACT AS-IS** — Inertia display is a standard CAE widget. Assuming `lab` is also CAE-focused, this is valuable. Minor token fix recommended.

---

### 6. EditableInertiaMatrix
**Path**: `packages/ui/src/components/engineering/editable-inertia-matrix.tsx`

**Purpose**: Editable version of inertia matrix with NumericInput cells, color-coded diagonal, and onChange callback.

**Key Props / Variants**:
- `ixx, iyy, izz, ixy, ixz, iyz` — matrix components (all required)
- `onChange: (values: { ixx, iyy, ...)` — onChange callback
- `unit`, `disabled`, `className`

**Design Critique**:
- **Mirror cells are read-only** (lines 43–55, `MirrorCell`): Off-diagonal is mirrored and not editable. Good design (symmetric matrix constraint).
- **NumericInput coupling** (line 3, import; lines 96–164 usage): Heavy dependency. If `lab` doesn't use this, must be abstracted.
- **Hard-coded precision / step** (lines 100, 110, 134, `precision={4}`, `step={0.001}`): Should be props or derived from unit.
- **Grid layout hardcoded** (line 87, `grid-cols-[auto_1fr_1fr_1fr]`): Same as InertiaMatrixDisplay; only supports 3×3.
- **Diagonal cell background coloring** (lines 78, `diagonalCls`, `--inertia-diagonal`): Good token usage. Dark mode override at line 328 of globals.css.
- **No validation**: Accepts any numeric value. Should NumericInput prevent negative inertia values on diagonal? (Moment of inertia must be ≥ 0.)
- **Direct state update pattern** (lines 72–74): Creates new object and calls onChange. Fine, but could use a reducer for complex edits.

**Custom Token Usage**:
- Line 87: `rounded-[var(--radius-md)]`, `border-[var(--inspector-grid-border)]` — token, correct
- Line 29, 37: `bg-[var(--layer-recessed)]` — token, correct
- Line 49, 106, 140: `bg-[var(--field-elevated)]` — token, correct
- Line 78: `bg-[var(--inertia-diagonal)]`, `text-[var(--inertia-diagonal-text)]` — token-driven color pair, excellent
- Line 103: `cn(inputCls, diagonalCls)` — composing token-driven classes, good

**Improvement Actions**:
1. **Priority 1**: Parameterize NumericInput via render prop (e.g., `renderInput?: (props) => React.ReactNode`) or expose numeric step/precision as props.
2. **Priority 2**: Add optional validation (e.g., `validateFn?: (key, value) => boolean | Error`) or document that consumer should validate.
3. **Priority 3**: Parameterize step and precision, or derive from props.
4. **Priority 4**: Consider preventing negative diagonal values by default.

**Extraction Verdict**: **EXTRACT WITH FIXES** — Editable matrix is useful, but NumericInput coupling must be abstracted. Validation is a secondary concern.

---

## Summary Table

| Component | Verdict | Severity | Top Action |
|-----------|---------|----------|-----------|
| AppShell | EXTRACT WITH FIXES | HIGH | Decouple ResizeObserver; make LayoutManager optional. |
| TopBar | EXTRACT WITH FIXES | MEDIUM | Extract Electron window controls; remove "MotionLab" hardcoding. |
| LeftPanel | EXTRACT WITH FIXES | MEDIUM | Parameterize tab structure and viewMode state. |
| RightPanel | EXTRACT AS-IS | NONE | Ready to reuse. |
| BottomPanel | EXTRACT WITH FIXES | HIGH | Extract resize logic into hook; accept min/max height props. |
| FloatingPanel | EXTRACT WITH FIXES | MEDIUM | Make LayoutManager dependency optional; complete onOpenChange. |
| ViewportHUD | EXTRACT AS-IS | NONE | Already layout-agnostic; excellent design. |
| WorkspaceTabBar | EXTRACT AS-IS | LOW | Add ARIA tablist/tab semantics and keyboard nav (optional). |
| CopyableId | EXTRACT AS-IS | NONE | Ready to reuse. |
| Vec3Display | EXTRACT WITH FIXES | MEDIUM | Generalize to support 2D/4D vectors; abstract NumericInput. |
| QuatDisplay | EXTRACT WITH FIXES | MEDIUM | Fix amber-500 hardcode; add controlled mode toggle. |
| SelectionChip | EXTRACT AS-IS | LOW | Parameterize max-width and chevron (optional). |
| InertiaMatrixDisplay | EXTRACT AS-IS | NONE | Fix text-[10px] → text-[var(--text-3xs)]; ready otherwise. |
| EditableInertiaMatrix | EXTRACT WITH FIXES | MEDIUM | Abstract NumericInput via render prop; add validation. |

---

## Engineering Display Extraction Note

**Should `lab` inherit vec3/quat/inertia displays?**

Yes, with conditions:
- **Vec3Display & InertiaMatrixDisplay**: Generic math display, immediately reusable. Extract with minor token fixes.
- **QuatDisplay**: Gimbal-lock handling is advanced CAE-specific logic. Value depends on whether `lab` plans to expose quaternion editing. If only Euler angle UI, consider a simpler non-gimbal-aware variant.
- **EditableInertiaMatrix**: Valuable if `lab` includes property panels. Extract with NumericInput abstraction.

**Recommendation**: Extract all three. Math display is not MotionLab-specific; it's standard CAE UI. The coupling is not to Chrono or domain logic, but to shared primitives (NumericInput, AxisColorLabel). If `lab` uses these same primitives, extraction is clean. If not, they become render-function props.

---

## Shell Architecture Note

**Is the shell reusable as a unit?**

The AppShell + its supporting components (FloatingPanel, BottomPanel, ViewportHUD, WorkspaceTabBar, TopBar) form a cohesive desktop-application layout system. However, it is **not fully reusable as a black box without modification**:

1. **LayoutManager Coupling**: AppShell and FloatingPanel/BottomPanel depend on `packages/ui/src/layout/layout-manager.ts` to compute viewport insets and manage panel z-order/visibility. This system is generic (no MotionLab-specific logic), but it's a **required dependency** that `lab` must either adopt wholesale or replace. If `lab` has a different layout engine (e.g., CSS Grid or Tauri window management), significant refactoring is needed.

2. **Fixed Slot Count**: AppShell assumes a 5-row layout (top-bar → main-area with left/right/bottom panels → tab-bar → status-bar). If `lab` needs a different structure (e.g., no tab bar, or a top toolbar instead of top bar), components must be composed differently or parameterized.

3. **Hard-coded Assumptions**: TopBar assumes Electron window controls are optional. LeftPanel assumes 3 tabs. BottomPanel assumes a dock-style panel. These are reasonable defaults, but inflexible.

**Recommendation for `lab` extraction**:
- **Extract the layout system wholesale** (`LayoutProvider` + `LayoutManager` + hooks) if `lab` plans to use side panels and floating HUD.
- **Alternatively, refactor AppShell to be layout-agnostic**: Remove LayoutManager coupling; make viewport inset computation a prop. Then `lab` can provide its own layout engine.
- **Extract individual shell components** (TopBar, FloatingPanel, ViewportHUD, WorkspaceTabBar) independently if only selective reuse is needed.

---

## Top 3 Cross-Cutting Issues

1. **Resize Logic Decoupling (AppShell, BottomPanel, FloatingPanel)**: All three directly mutate DOM or embed ResizeObserver/pointer event handlers. Extract to reusable hooks (e.g., `usePanelResize()`, `useResizeObserver()`) so downstream apps can opt into or replace this logic. **Impact**: HIGH — blocks full extraction.

2. **Hardcoded Hex / Magic Numbers**: Scattered throughout:
   - TopBar: `#e81123` (Windows red for close button)
   - BottomPanel: `text-[10px]` (should be `--text-3xs`)
   - QuatDisplay: `text-amber-500` (should be `--warning`)
   - FloatingPanel: 240/420px minWidth/maxWidth hardcoded
   - LeftPanel: 3-tab structure hardcoded
   Collect these into props or tokens. **Impact**: MEDIUM — affects composability and consistency.

3. **NumericInput / Primitive Coupling (Vec3Display, QuatDisplay, EditableInertiaMatrix)**: Engineering displays tightly couple to `NumericInput` component, which may not exist in `lab`. Provide a render-function or abstraction layer (e.g., `renderInput?: (props: InputProps) => ReactNode`). **Impact**: MEDIUM — blocks extraction unless `lab` adopts `NumericInput` or builds an adapter.

