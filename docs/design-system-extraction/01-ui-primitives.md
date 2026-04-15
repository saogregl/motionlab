# UI Primitives Inventory — MotionLab Design System

**Date:** 2026-04-14  
**Scope:** `packages/ui/src/components/ui/` (18 shadcn/Radix primitive components)  
**Token System:** Carbon g10/g100, layer architecture, CSS variables mapped to Tailwind v4 utilities.

---

## Component Analysis

### badge.tsx
**Purpose:** Inline status/label badges with variants and icon support.  
**Variants:** default, secondary, destructive, outline, ghost, link.  
**Props:** CVA `variant` control; supports `className` override; uses `useRender` from @base-ui/react.

**Design Critique:**
- Uses @base-ui `useRender` hook for headless flexibility — modern pattern, no `"use client"` needed.
- Focus ring applied via Tailwind utility classes, consistent with token system.
- SVG sizing applied via `[&>svg]:size-3!` — good practice, but uses `!important` bypass; consider consolidating in token layer.
- Hardcoded `rounded-4xl` (pill shape) is generic, no issue.
- Accessibility: `focus-visible:ring-ring/50` covers focus outline; `aria-invalid` states handled.

**Custom Token Usage:**
- No raw hex or out-of-band colors. All variants reference design system tokens: `bg-primary`, `bg-secondary`, `bg-destructive/10`, etc.
- Ring utilities use token color (`ring-ring`, `ring-destructive/20`) — correct.

**Improvement Actions:**
1. Minor: Remove `!important` on SVG sizing (`[&>svg]:size-3!`) — use explicit sizing instead.
2. Verify the "link" variant underline offset (`underline-offset-4`) exists in Tailwind; if not, tie to a token.

**Extraction Verdict:** **EXTRACT AS-IS** — Fully generic, token-compliant, no MotionLab coupling.

---

### button.tsx
**Purpose:** Primary interactive button with 8 variants and 4 size tiers.  
**Variants:** default, outline, secondary, ghost, destructive, link, toolbar, toolbar-active, subtle.  
**Props:** CVA `variant` + `size`; forward-ref via @base-ui Button primitive.

**Design Critique:**
- Excellent variant coverage; MotionLab-specific variants (`toolbar`, `toolbar-active`) are present but generic enough to reuse.
- All color tokens reference design system: `bg-accent-primary`, `bg-layer-base`, `text-text-inverse`, etc.
- Accessibility: `focus-visible:ring-3 ring-ring/50`, `disabled:opacity-40`, `aria-invalid` states.
- Focus ring: `focus-visible:border-ring focus-visible:ring-3` — correct layering.
- Icon sizing: `[&_svg:not([class*='size-'])]:size-4` — excellent conditional application.
- Motion: `transition-all duration-[var(--duration-fast)]` — uses token, good.
- State machine: `active:translate-y-px` — adds tactile feedback without excess.

**Custom Token Usage:**
- All colors pulled from token system. No hex codes or Tailwind palette overrides.
- No hardcoded spacing or radii outside tokens.

**Improvement Actions:**
1. None — production-ready.

**Extraction Verdict:** **EXTRACT AS-IS** — Exceptionally clean, well-architected, fully token-driven.

---

### command.tsx
**Purpose:** Command palette / search interface (cmdk wrapper with dialog integration).  
**Props:** Wraps `cmdk` library; `CommandDialog` includes custom title/description overrides.

**Design Critique:**
- Uses `'use client'` directive correctly for interactive features.
- `CommandDialog` composes `Dialog` + `Command` — good composition.
- `CommandInput` wraps cmdk input with custom `InputGroup` styling — shows tight coupling to InputGroup pattern.
- CSS selectors use ARIA attribute targeting (`**:[[cmdk-group-heading]]`) — advanced but fragile; better to use data attributes on wrapped components.
- Focus management: cmdk library handles this; no manual traps needed.
- Accessibility: `sr-only` header correctly hides redundant title on command palette.
- Colors: All use token system (`bg-popover`, `text-popover-foreground`).

**Custom Token Usage:**
- `border-border/50` uses opacity modifier on token — correct.
- `bg-input/30` and `shadow-none!` are appropriate utility overrides for this composed use case.

**Improvement Actions:**
1. Replace CSS combinator selectors (`**:[[cmdk-group-heading]]`) with wrapper component that uses `data-*` attributes for better maintainability.
2. Consider extracting `CommandInput` theming to a separate utility or token (e.g., `--command-input-bg`).

**Extraction Verdict:** **EXTRACT WITH FIXES** — Generic command palette UI, but the tight coupling to cmdk CSS classes and InputGroup needs decoupling. Extract after refactoring selector strategy.

---

### context-menu.tsx
**Purpose:** Right-click context menu with submenus, checkboxes, radio items.  
**Props:** Built on @base-ui ContextMenu primitives; includes variant control for destructive items.

**Design Critique:**
- Comprehensive set of sub-components: Trigger, Content, Item, CheckboxItem, RadioItem, Group, Label, Separator, Shortcut, SubMenu.
- Heavy use of descendant selectors (`**:data-[slot$=-item]:focus:bg-foreground/10`) — valid but dense. All are token-driven.
- Glass panel effect: `before:backdrop-blur-2xl before:backdrop-saturate-150` — custom backdrop, but uses `before:` pseudo-element for styling. Not tied to tokens; hardcoded magic values.
- `inset` prop for indentation adds label offset (e.g., `pl-7`) — magic number, not a token.
- Accessibility: Proper ARIA attributes via @base-ui; focus states clear.
- Colors: All from token system (`bg-popover`, `text-muted-foreground`, `ring-foreground/10`).

**Custom Token Usage:**
- `backdrop-blur-2xl` (hard-coded blur radius) — should be `var(--panel-blur)` or similar.
- `backdrop-saturate-150` — not a token; consider adding to token system.
- `pl-7` (28px) — math-based from `--space-4` (16px) + padding logic; not directly tokenized.

**Improvement Actions:**
1. Extract backdrop styling to tokens: `--popover-blur: 12px`, `--popover-saturate: 1.5`.
2. Create a `--menu-item-indent` token instead of magic `pl-7`.
3. Simplify dense selector chains via component-level wrapper.

**Extraction Verdict:** **EXTRACT WITH FIXES** — Generic context menu UI, but backdrop and indent magic numbers need tokenization before sharing.

---

### dialog.tsx
**Purpose:** Modal dialog with overlay, content, header, footer, title, description.  
**Props:** @base-ui Dialog primitives; `showCloseButton` toggle on Content and Footer.

**Design Critique:**
- Correct `'use client'` usage for dialog state management.
- Overlay: `z-[var(--z-modal)]` (uses token correctly), `bg-black/25`, `backdrop-blur-xs`.
- Content: `shadow-[var(--shadow-overlay)]` (token-correct), `ring-1 ring-foreground/15` (opacity modifier on token).
- Close button composition: Renders `Button` with `variant="ghost"` — good reuse.
- Layout: Grid gap, centered positioning via transform — correct.
- Accessibility: Proper ARIA roles; sr-only text for close button.
- Animation: Data attributes for open/closed states trigger Tailwind animations — correct pattern.

**Custom Token Usage:**
- `bg-black/25` (opacity-based) — hardcoded black instead of using `--overlay-bg` or similar. Consider `background-color: var(--overlay-bg, rgba(0,0,0,0.25))`.
- `ring-foreground/15` — derived from foreground token with opacity, acceptable.
- `max-w-[calc(100%-2rem)]` — responsive padding, not a token. Could be `var(--dialog-max-width)`.

**Improvement Actions:**
1. Replace hardcoded `bg-black/25` with a token: `--overlay-bg: rgba(0, 0, 0, 0.25)`.
2. Extract dialog width constraints to token: `--dialog-max-width: calc(100% - 2rem)`.

**Extraction Verdict:** **EXTRACT AS-IS** — Dialog is nearly generic; minor hardcoded overlay opacity is acceptable for a shared component.

---

### dropdown-menu.tsx
**Purpose:** Dropdown menu with items, groups, checkboxes, radio buttons, separators.  
**Props:** @base-ui Menu primitives; positions via `side`, `align`, `sideOffset`, `alignOffset`.

**Design Critique:**
- Comprehensive sub-components mirror context-menu structure.
- Identical glass backdrop pattern to context-menu: `before:backdrop-blur-2xl before:backdrop-saturate-150` — same hardcoding issues.
- Descendant selector density high but consistent.
- `min-w-32` (128px) — hardcoded, should be token.
- Animation states (`data-open:animate-in`, `data-closed:animate-out`) — correct Tailwind pattern.
- Accessibility: Focus management via @base-ui; disabled states respected.
- Color scheme: All token-based.

**Custom Token Usage:**
- Backdrop blur/saturate hardcoded (same as context-menu).
- `min-w-32` (128px) — magic number, no token.
- `sideOffset={4}` default — hardcoded in function signature; could reference token.

**Improvement Actions:**
1. Consolidate backdrop styling: extract to shared utility or token.
2. Create `--menu-min-width: 128px` token.
3. Link `sideOffset` default to `--panel-float-inset` or similar.

**Extraction Verdict:** **EXTRACT WITH FIXES** — Generic dropdown menu, but backdrop and min-width magic numbers need tokenization.

---

### input-group.tsx
**Purpose:** Compound input wrapper supporting addons, buttons, text labels (inline-start/end, block-start/end).  
**Props:** CVA variants for `InputGroupAddon` align; supports `InputGroupInput`, `InputGroupTextarea`, `InputGroupButton`.

**Design Critique:**
- Excellent composition pattern: `InputGroup` parent manages focus states, border, ring.
- `has-*` pseudo-class selectors allow smart styling based on children (`:has(>[data-align=block-end])`) — modern, but complex to parse.
- Focus logic: `has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-3` — correct focus ring at parent level.
- Addon alignment: `align: 'inline-start' | 'inline-end' | 'block-start' | 'block-end'` — well-thought-out API.
- Click-to-focus logic in `InputGroupAddon.onClick` — good UX, generic pattern.
- Icon sizing: `[&>svg:not([class*='size-'])]:size-4` — consistent with button pattern.

**Custom Token Usage:**
- `h-8` default height — should be token like `--field-height: 32px` (8 * 4px).
- `rounded-lg` (8px radius) — uses Tailwind default; should reference `--radius-md` token if possible.
- `pl-1.5`, `pr-1.5`, `px-2`, `py-1.5` spacing — uses Tailwind spacing scale, not custom tokens. Acceptable but should align with `--space-*`.
- No hardcoded colors — all via tokens.

**Improvement Actions:**
1. Replace `h-8` with `h-[var(--field-height, 32px)]` or similar token.
2. Ensure spacing scale aligns with `--space-*` tokens (1.5 = 6px, 2 = 8px) — already correct.
3. Document the `has-*` selector complexity in comments.

**Extraction Verdict:** **EXTRACT AS-IS** — Sophisticated compound component, excellent pattern. Field height magic number is minor; spacing is token-aligned.

---

### input.tsx
**Purpose:** Text input field with focus, disabled, invalid states.  
**Props:** Simple wrapper around @base-ui Input primitive.

**Design Critique:**
- Minimal wrapper — good design.
- `h-7` (28px) height — should be tokenized.
- `rounded-[var(--radius-sm)]` — correctly references token.
- Focus ring: `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50` — token-correct.
- Dark mode: `dark:bg-[var(--field-base)]` and `dark:disabled:bg-input/80` — correct token usage.
- File upload styling: `file:*` pseudo-elements styled appropriately.
- Accessibility: All states handled via ARIA.

**Custom Token Usage:**
- `h-7` (28px) — magic number, should be `h-[var(--field-height, 28px)]`.
- `px-2`, `py-1` spacing — uses Tailwind; should verify alignment with `--space-*`.
- No hardcoded colors.

**Improvement Actions:**
1. Replace `h-7` with token reference.

**Extraction Verdict:** **EXTRACT AS-IS** — Clean input component. Height magic number is cosmetic; no core issues.

---

### popover.tsx
**Purpose:** Floating popover anchored to a trigger element.  
**Props:** @base-ui Popover primitives with position and layout sub-components.

**Design Critique:**
- Minimal styling — mostly layout via `@base-ui`.
- `w-72` (288px) — hardcoded width, matches `--panel-right-w: 288px` in tokens! Should reference it.
- `gap-2.5` padding — uses Tailwind spacing.
- `bg-popover` (token), `shadow-md`, `ring-foreground/10` — all token-correct.
- Animation: `data-[side=*]:slide-in-from-*` — standard Tailwind pattern.
- Accessibility: Proper ARIA via @base-ui.

**Custom Token Usage:**
- `w-72` (288px) — hardcoded but matches a token. Should be `w-[var(--panel-right-w)]` for consistency.
- No other magic numbers or color violations.

**Improvement Actions:**
1. Link `w-72` to token: `w-[length:var(--panel-right-w)]` or create Tailwind mapping for popover width.

**Extraction Verdict:** **EXTRACT AS-IS** — Generic popover. Width hardcoding is coincidental match to token; no blocker.

---

### scroll-area.tsx
**Purpose:** Scrollable viewport with custom scrollbar styling.  
**Props:** @base-ui ScrollArea primitives; `ScrollBar` sub-component.

**Design Critique:**
- Simple wrapper over @base-ui — minimal styling.
- Scrollbar: `bg-border opacity-60` (uses token, adds opacity modifier).
- Scrollbar dimensions: `h-1.5` (vertical), `w-1.5` (horizontal) — hardcoded Tailwind utilities.
- Rounded thumb: `rounded-full` — appropriate.
- Accessibility: Focus ring via `focus-visible:ring-[3px] ring-ring/50` — correct.
- No color violations.

**Custom Token Usage:**
- Scrollbar size `h-1.5`, `w-1.5` (6px) — hardcoded; could be tokens if scrollbar dimensions are part of design system.

**Improvement Actions:**
1. Optional: Create `--scrollbar-width` token if scrollbar sizing is design-critical.

**Extraction Verdict:** **EXTRACT AS-IS** — Minimal, generic scroll area wrapper. Hardcoded scrollbar size is acceptable default.

---

### separator.tsx
**Purpose:** Visual divider (horizontal or vertical).  
**Props:** @base-ui Separator; `orientation` prop.

**Design Critique:**
- Extremely simple wrapper.
- `bg-border` — uses token correctly.
- `h-px`, `w-px` dimensions — correct for 1px line.
- Accessibility: Proper ARIA via @base-ui.
- No styling issues.

**Custom Token Usage:**
- None; fully token-compliant.

**Improvement Actions:**
- None.

**Extraction Verdict:** **EXTRACT AS-IS** — Perfect primitive, zero issues.

---

### sonner.tsx
**Purpose:** Toast notification wrapper using Sonner library.  
**Props:** Passes through `ToasterProps`; pre-configures position, offset, styling.

**Design Critique:**
- Hardcoded position: `position="bottom-right"`, `offset={32}` — MotionLab-specific layout choice, not design system.
- Toast styling: Uses CSS variables correctly: `bg-[var(--layer-elevated)]`, `text-[var(--text-primary)]`, `border-[var(--border-default)]`, `shadow-[var(--shadow-overlay)]`.
- Typography: `fontSize: 'var(--text-xs)'`, `fontFamily: 'var(--font-ui)'` — tokens via inline style.
- Z-index: `z-index: 'var(--z-toast)'` — token reference, correct.
- No accessibility issues (Sonner handles this).

**Custom Token Usage:**
- No hardcoded colors; all variables.
- Position and offset are MotionLab defaults, not generic.

**Improvement Actions:**
1. Extract position/offset to props or environment config for reusability in `lab` (which may want top-left or center).

**Extraction Verdict:** **EXTRACT WITH FIXES** — Generic toast wrapper, but hardcoded position makes it MotionLab-specific. Make position/offset configurable or document as MotionLab default.

---

### select.tsx
**Purpose:** Dropdown select with groups, labels, checkmarks, scroll buttons.  
**Props:** @base-ui Select primitives; `SelectTrigger` has `size` variant (sm, default).

**Design Critique:**
- Comprehensive: Includes ScrollUpButton, ScrollDownButton, Group, Label, Item, Separator.
- Trigger: `h-8` (default), `h-7` (sm) — hardcoded sizes, should be tokens.
- Trigger styling: `data-placeholder:text-muted-foreground` — smart placeholder handling via @base-ui attribute.
- Content: `min-w-36` (144px) — hardcoded minimum width.
- Item: `pr-8` (for checkmark) — hardcoded padding.
- Glass backdrop: `before:backdrop-blur-2xl before:backdrop-saturate-150` — same hardcoding as context-menu, dropdown-menu.
- Accessibility: All states proper.
- Colors: All from token system.

**Custom Token Usage:**
- Height sizes (`h-8`, `h-7`) — should be tokens.
- `min-w-36` — should be token.
- `pr-8` (32px for checkmark space) — hardcoded, could be `--menu-item-check-spacing`.
- Backdrop blur/saturate — hardcoded (cross-cutting issue).

**Improvement Actions:**
1. Create `--select-trigger-height-default` and `--select-trigger-height-sm` tokens.
2. Create `--select-content-min-width` token.
3. Extract checkmark padding space to token.
4. Consolidate backdrop styling.

**Extraction Verdict:** **EXTRACT WITH FIXES** — Generic select component, but size and spacing magic numbers need tokenization.

---

### switch.tsx
**Purpose:** Binary toggle switch (on/off).  
**Props:** @base-ui Switch primitives; `checked` state managed by parent.

**Design Critique:**
- Minimal, clean styling.
- Dimensions: `h-[14px] w-[28px]` — hardcoded pixel values, should be tokens.
- Thumb size: `size-2.5` (10px) — hardcoded.
- Thumb position: `translate-x-[calc(100%+4px)]` (checked) — hardcoded 4px gap.
- Focus ring: `focus-visible:border-ring focus-visible:ring-3 ring-ring/50` — token-correct.
- Colors: `data-checked:bg-[var(--accent-primary)]`, `data-unchecked:bg-[var(--layer-raised)]` — token variables, correct.
- Thumb color: `data-checked:bg-[var(--accent-primary)]`, `data-unchecked:bg-[var(--text-secondary)]` — token correct.
- Accessibility: ARIA `role` via @base-ui.

**Custom Token Usage:**
- `h-[14px] w-[28px]` — hardcoded dimensions, should be `--switch-height: 14px`, `--switch-width: 28px`.
- `size-2.5` (10px) thumb — should be `--switch-thumb-size: 10px`.
- `translate-x-[calc(100%+4px)]` gap — should be `--switch-thumb-gap: 4px`.

**Improvement Actions:**
1. Create switch dimension tokens: `--switch-height`, `--switch-width`, `--switch-thumb-size`, `--switch-thumb-gap`.

**Extraction Verdict:** **EXTRACT WITH FIXES** — Generic switch component, but dimensions are hardcoded and should be tokens for consistency.

---

### tabs.tsx
**Purpose:** Tab navigation with variants (default, line, contained) and horizontal/vertical orientation.  
**Props:** CVA `variant` on TabsList; supports line (underline) and contained (bg) styles.

**Design Critique:**
- Excellent variant coverage: default (pill background), line (underline), contained (full-height).
- Orientation handling: `group-data-horizontal/tabs:flex-col` and `group-data-vertical/tabs:flex-col` — good responsive support.
- TabsTrigger complexity: Uses multiple conditional classes for state management.
  - `data-active:bg-background` — uses token.
  - `after:bg-foreground` pseudo-element for underline/indicator — clever but complex.
  - `data-active:after:opacity-100` — shows/hides via opacity.
- Spacing: `gap-2`, `p-[3px]`, `px-1.5` — Tailwind utilities, not tokens.
- Colors: All from token system (`bg-muted`, `bg-background`, `text-foreground`).
- Accessibility: ARIA roles via @base-ui.

**Custom Token Usage:**
- `p-[3px]` padding — hardcoded, should align with spacing scale (3px is between `--space-2: 8px` and none; use `1.5` = 6px).
- `h-8` list height (default variant) — should be token like `--tabs-list-height`.
- Spacing scale uses Tailwind utilities; verify alignment with `--space-*`.

**Improvement Actions:**
1. Create `--tabs-list-height`, `--tabs-list-padding`, `--tabs-trigger-padding` tokens.
2. Document variant-specific positioning logic for maintainability.

**Extraction Verdict:** **EXTRACT AS-IS** — Solid tab component with good variants. Spacing is minor tuning; no blocker.

---

### textarea.tsx
**Purpose:** Multi-line text input.  
**Props:** Simple wrapper around native textarea.

**Design Critique:**
- `field-sizing-content` — CSS feature for auto-sizing; modern and correct.
- `min-h-16` (64px) — hardcoded minimum height.
- `rounded-lg` (8px) — should use `var(--radius-md)`.
- Styling mirrors Input component — consistency good.
- Focus ring: `focus-visible:border-ring focus-visible:ring-3 ring-ring/50` — token-correct.
- Dark mode: `dark:bg-input/30` — matches Input, token-correct.
- Accessibility: All states handled.

**Custom Token Usage:**
- `min-h-16` — should be `min-h-[var(--textarea-min-height, 64px)]`.
- `rounded-lg` — should use token reference.

**Improvement Actions:**
1. Replace `min-h-16` with token.
2. Replace `rounded-lg` with token reference.

**Extraction Verdict:** **EXTRACT AS-IS** — Minimal wrapper. Height and radius hardcoding is cosmetic; no core issues.

---

### toggle.tsx
**Purpose:** Stateful button that toggles on/off (like toolbar buttons).  
**Props:** CVA `variant` (default, outline) and `size` (default, sm, lg).

**Design Critique:**
- Variants: default (transparent), outline (with border).
- Size control: `h-8`, `h-7`, `h-9` — hardcoded heights.
- States: `aria-pressed:bg-muted`, `data-[state=on]:bg-muted` — clear state handling.
- Spacing: `px-2`, `px-1.5`, `px-2.5` — Tailwind utilities, acceptable.
- Colors: All from token system.
- Accessibility: ARIA `aria-pressed` correctly set by @base-ui.

**Custom Token Usage:**
- Heights: `h-8`, `h-7`, `h-9` — should be tokens.
- No color violations.

**Improvement Actions:**
1. Create `--toggle-height-default`, `--toggle-height-sm`, `--toggle-height-lg` tokens.

**Extraction Verdict:** **EXTRACT AS-IS** — Clean toggle component. Height hardcoding is minor; acceptable.

---

### tooltip.tsx
**Purpose:** Floating tooltip anchored to trigger.  
**Props:** @base-ui Tooltip primitives; `TooltipProvider` wraps app with `delay` prop.

**Design Critique:**
- TooltipProvider: `delay={300}` — hardcoded default delay, should be token `--tooltip-delay: 300ms`.
- TooltipContent: `bg-foreground text-background` — inverted colors (dark text on light bg by default, inverted on dark mode).
- Dimensions: `w-fit max-w-xs` — hardcoded max-width (336px), should be token.
- Arrow: `size-2.5` (10px), `translate-y-[calc(-50%-2px)]` — hardcoded sizes and offsets.
- Padding: `px-3 py-1.5` — Tailwind spacing, acceptable.
- Animation: `data-[state=delayed-open]:animate-in` — correct Tailwind pattern.
- Accessibility: ARIA via @base-ui; `gap-1.5` allows icon + text layout.

**Custom Token Usage:**
- `delay={300}` — hardcoded, should be token.
- `max-w-xs` — hardcoded 336px, should be `--tooltip-max-width`.
- Arrow size/offset hardcoded — should be `--tooltip-arrow-size`, `--tooltip-arrow-offset`.

**Improvement Actions:**
1. Create `--tooltip-delay`, `--tooltip-max-width`, `--tooltip-arrow-size`, `--tooltip-arrow-offset` tokens.

**Extraction Verdict:** **EXTRACT WITH FIXES** — Generic tooltip, but delay and sizing hardcoding should be tokenized for reuse in `lab`.

---

## Summary Table

| Component | Extraction Verdict | Issue Severity | Top Action |
|-----------|-------------------|---|---|
| badge | EXTRACT AS-IS | none | No action needed. |
| button | EXTRACT AS-IS | none | No action needed; exemplar component. |
| command | EXTRACT WITH FIXES | minor | Decouple CSS combinator selectors; use data attributes. |
| context-menu | EXTRACT WITH FIXES | minor | Extract backdrop blur/saturate to tokens; tokenize indent spacing. |
| dialog | EXTRACT AS-IS | none | Optional: replace hardcoded overlay opacity with token. |
| dropdown-menu | EXTRACT WITH FIXES | minor | Consolidate backdrop styling; tokenize min-width. |
| input-group | EXTRACT AS-IS | none | Field height magic number is acceptable. |
| input | EXTRACT AS-IS | none | Optional: tokenize field height. |
| popover | EXTRACT AS-IS | none | Optional: link width to panel token. |
| scroll-area | EXTRACT AS-IS | none | No action needed. |
| separator | EXTRACT AS-IS | none | No action needed; perfect primitive. |
| sonner | EXTRACT WITH FIXES | minor | Make toast position/offset configurable. |
| select | EXTRACT WITH FIXES | minor | Tokenize trigger heights, content min-width, checkmark padding. |
| switch | EXTRACT WITH FIXES | minor | Create switch dimension tokens. |
| tabs | EXTRACT AS-IS | none | Optional: tokenize list height and padding. |
| textarea | EXTRACT AS-IS | none | Optional: tokenize min-height. |
| toggle | EXTRACT AS-IS | none | Optional: tokenize button heights. |
| tooltip | EXTRACT WITH FIXES | minor | Tokenize delay, max-width, arrow sizing. |

---

## Key Findings

**Components Ready to Extract:** 10/18 as-is (badge, button, dialog, input, input-group, popover, scroll-area, separator, tabs, textarea, toggle).

**Require Minor Fixes Before Extraction:** 8/18 (command, context-menu, dropdown-menu, sonner, select, switch, tooltip). All fixable in <1 hour per component.

**Biggest Cross-Cutting Issue:** Hardcoded **backdrop blur/saturate** (`backdrop-blur-2xl` + `backdrop-saturate-150`) appears in context-menu, dropdown-menu, select — should be tokenized to `--popover-blur` and `--popover-saturate` in globals.css.

**Repeated Token Violations:**
1. **Hardcoded pixel dimensions** (h-7, h-8, w-72, h-[14px], min-w-32, min-w-36) — should be `--field-height`, `--switch-width`, etc.
2. **Magic number spacing** (pl-7, pr-8, gap-1.5, p-[3px]) — verify alignment with `--space-*` scale.
3. **Backdrop effects** (blur, saturate, opacity) — not in token system, should be added.

**Recommendation:** Extract button, badge, separator, scroll-area, input, input-group immediately (zero-friction). Bundle context-menu/dropdown-menu/select token fixes, then extract together. Configure sonner position via environment or props override before extraction.

**Tokens Missing from globals.css** (should be added before extraction to `lab`):
- `--field-height`, `--switch-width`, `--switch-height`, `--switch-thumb-size`, `--switch-thumb-gap`
- `--menu-min-width`, `--menu-item-indent`, `--menu-item-check-spacing`
- `--popover-blur`, `--popover-saturate`, `--overlay-bg`
- `--tooltip-delay`, `--tooltip-max-width`, `--tooltip-arrow-size`
- `--select-trigger-height-*`, `--select-content-min-width`

---

## Notes for `lab` (Sibling Project)

- All 18 components are **generic UI primitives** suitable for cloud-based engineering UX (panels, trees, inspectors, charts).
- No Chrono/mechanism/sensor/joint specifics found — safe to reuse.
- Token system (Carbon g10/g100, layer architecture, semantic states) is **fully portable** to `lab` via globals.css copy + Tailwind config update.
- Focus rings, motion tokens, z-index layers all align with modern desktop and web patterns.
- Dark mode support is production-ready in both light and dark variants.

