# Product-Level Dialogs & Inspectors Inventory

## Dialogs

### AboutDialog
`packages/frontend/src/components/AboutDialog.tsx`

Single-screen info display for product version and protocol. Uses `Dialog` + `DialogHeader` + `DialogFooter` from `@motionlab/ui` with light `useEngineConnection` store access. Clean. **Verdict:** Extractable: basic info-only dialog pattern with text + button footer.

---

### AttachGeometryDialog
`packages/frontend/src/components/AttachGeometryDialog.tsx`

Selects target body for geometry reparenting. Owned state (`selectedBodyId`), `Select` + footer buttons. Direct store access (`useMechanismStore` for body list). **Verdict:** Entity-binding pattern (select entity from list, confirm) is reusable; dialog scaffolding is generic.

---

### CrashRecoveryDialog
`packages/frontend/src/components/CrashRecoveryDialog.tsx` (lines 1–120)

Modal list of recoverable projects with per-item async actions (recover/discard). Owns async state (`recovering` string for loading), renders scrollable list of cards with structured metadata (name, path, time). Uses timeout/settle delays for store sync (lines 18, 38–41). **Antipatterns:** Calling `useMechanismStore.getState()` inside event handler (line 36). Debounce via magic constant. **Verdict:** List-with-async-actions pattern + recovery flow are moderately reusable; store access should be prop-driven.

---

### CreateActuatorDialog
`packages/frontend/src/components/CreateActuatorDialog.tsx` (lines 1–186)

Form dialog (create/edit mode). Manages form state (name, controlMode, commandValue, effortLimit). Form reset on open via `useEffect` (lines 59–74). Derives `actuatorLabel` from `jointType` prop. Conditional effort-limit toggle section. **Antipattern:** Form reset logic in `useEffect` instead of controlled dialog API. **Verdict:** Edit/create mode toggle + conditional fields pattern; form scaffolding is generic.

---

### CreateBodyDialog
`packages/frontend/src/components/CreateBodyDialog.tsx` (lines 1–120)

Simple form: name, mass, motionType, manualMassOverride toggle. Resets form state on close. Uses `Switch` and `Select` from primitives. **Antipattern:** Manual reset in `handleCreate` instead of native form reset. **Verdict:** Toggle-reveals-section pattern; mostly primitive composition.

---

### ImportSettingsDialog
`packages/frontend/src/components/ImportSettingsDialog.tsx` (lines 1–152)

Multi-control dialog: 4 selects/inputs + helper text. Reads/writes `useUILayoutStore` (line 44, 137). Form stays open until user confirms. **Antipattern:** Mixing UI state (store read) with local form state. **Verdict:** Settings form with description text; reusable if store access is externalized.

---

### KeyboardShortcutsDialog
`packages/frontend/src/components/KeyboardShortcutsDialog.tsx` (lines 1–81)

Read-only list of commands grouped by category + shortcuts. Lazy groups computation (line 43, only if `open`). Uses constants for category order/labels. **Verdict:** Tabular data with category grouping is a pattern; presentation is clean.

---

### MissingAssetsDialog
`packages/frontend/src/components/MissingAssetsDialog.tsx` (lines 1–131)

List of unresolved assets with async "locate file" action. Owns `remaining` state, listens to engine results via callback (lines 29–50). Handles async file dialog + relocation. Auto-closes when all resolved. **Antipattern:** Callback-based event sync is implicit; Effect setup/teardown (line 47–49) couples to lifecycle. **Verdict:** Async list-with-file-picker pattern; consider Suspense or task-based state.

---

### SimulationSettingsDialog
`packages/frontend/src/components/SimulationSettingsDialog.tsx` (lines 1–379)

Tabbed settings form (Basic + Advanced). Preset buttons trigger `applySettingsPreset()`. Sections for solver, contact. Direct store subscriptions throughout `BasicTab`, `SolverSection`, `ContactSection` (e.g., lines 103–110). Heavy component nesting (inner components not extracted). **Antipattern:** Store subscriptions scattered across inner functions; tight coupling to settings store. **Verdict:** Tabbed settings + preset buttons are patterns, but architecture should be flattened. Sections should be independent.

---

## Inspectors

### BodyInspector
`packages/frontend/src/components/BodyInspector.tsx` (lines 1–195)

Composite: `TransformSection` (2x, world + sim), `IdentitySection`, `PropertyRow` for motion type, `PrimitiveParamsSection` (conditional), `CollisionSection`, `MassSection`, "Recalculate" button. Debounces mass updates (lines 47–56). Derives child geometries via `useMemo` (lines 59–66). Subscribes to `simTime` as refresh trigger (line 40). **Antipattern:** Direct `useRef`-based debounce; subscribe to `simTime` just to force re-render. **Verdict:** Multi-section inspector with debounced updates; section composition is clean.

---

### ActuatorInspector
`packages/frontend/src/components/ActuatorInspector.tsx` (lines 1–194)

Sections: `IdentitySection`, manual "Configuration" section with `PropertyRow` + `Select`/`Switch`, `CommandFunctionSection`, `SimulationValuesSection`. Builds channel definitions for traces (lines 51–90). Inlines joint link (lines 126–135). **Antipattern:** Simulating section (lines 123–178) should be extracted. **Verdict:** Section-based composition is solid; Configuration section should be a primitive.

---

### DatumInspector
`packages/frontend/src/components/DatumInspector.tsx` (lines 1–53)

Three sections: `TransformSection`, `AxisPresetBar`, `IdentitySection`. Minimal, clean. **Verdict:** Good composition; no issues.

---

### EntityInspector
`packages/frontend/src/components/EntityInspector.tsx` (lines 1–148)

Router component: dispatches to BodyInspector, GeometryInspector, etc. based on selection. Multi-select summary with type breakdown (lines 43–88). **Verdict:** Composition pattern; multi-select placeholder is reusable.

---

### GeometryInspector
`packages/frontend/src/components/GeometryInspector.tsx` (lines 1–128)

Sections: `TransformSection`, `IdentitySection`, conditional `PrimitiveParamsSection`, `CollisionSection`, `InertiaMatrixDisplay`. **Verdict:** Clean multi-section composition.

---

### JointInspector
`packages/frontend/src/components/JointInspector.tsx` (lines 1–471)

Large composite: `IdentitySection`, `JointConnectionDiagram`, limits section, dynamics section (conditional on type), actuation section (conditional, with nested `CreateActuatorDialog`). Frame mode toggle (lines 274–297) with custom button styling. Owns `createActuatorOpen` dialog state. **Antipattern:** Long file, many conditional sections, custom toggle styling (lines 279–297). **Verdict:** Sections are composable; frame mode toggle should be extracted; too much inline logic.

---

### LoadInspector
`packages/frontend/src/components/LoadInspector.tsx` (lines 1–319)

Sections: `IdentitySection`, application (conditional on type), simulation values. Inline `EntityRef` component (lines 33–47). Complex conditional rendering for spring-damper values (lines 241–316). **Antipattern:** Long conditional chains; `EntityRef` should be shared. **Verdict:** Multi-variant inspector; extraction of type-specific sections recommended.

---

### SensorInspector
`packages/frontend/src/components/SensorInspector.tsx` (lines 1–142)

Sections: `IdentitySection`, configuration (with icon), conditional `SimulationValuesSection`. Builds channel definitions via `useMemo` (lines 43–85). **Verdict:** Cleanly composed.

---

### MechanismInspector
`packages/frontend/src/components/MechanismInspector.tsx` (lines 1–42)

Overview panel: ground body + diagnostics. Maps severity to icon (lines 6–10). **Verdict:** Simple, no extraction needed.

---

## Inspector Sections (Reusable Fragments)

### IdentitySection
`packages/frontend/src/components/inspector/sections/IdentitySection.tsx` (lines 1–60)

Header + name (inline editable). Metadata rows. Well-factored. **Verdict:** Already extracted, good pattern.

---

### TransformSection
`packages/frontend/src/components/inspector/sections/TransformSection.tsx` (lines 1–80)

Displays/edits position (Vec3) + rotation (Quaternion). Debounces updates (300ms). Props: `frameLabel`, position, rotation, editable, disabled, callback. **Verdict:** Good; debounce could be externalized.

---

### CommandFunctionSection
`packages/frontend/src/components/inspector/sections/CommandFunctionSection.tsx` (lines 1–154)

Shape selector (5 shapes) + conditional parameter forms. Defaults for each shape. Uses FunctionPreviewChart. **Verdict:** Highly specialized; extraction is domain-specific.

---

### SimulationValuesSection
`packages/frontend/src/components/inspector/sections/SimulationValuesSection.tsx` (lines 1–89)

Generic: maps channel definitions to scalar/vec3 displays. Reads traces + channels. **Verdict:** Reusable pattern; signature could be shared in `@motionlab/ui`.

---

### MassSection
`packages/frontend/src/components/inspector/sections/MassSection.tsx` (lines 1–120)

Override toggle + editable mass properties (mass, COM, inertia). Debounced updates. **Verdict:** Specialized but well-structured.

---

### CollisionSection
`packages/frontend/src/components/inspector/sections/CollisionSection.tsx` (6234 bytes)

Collision config editor. Not read in detail but referenced by multiple inspectors.

---

### PrimitiveParamsSection
`packages/frontend/src/components/inspector/sections/PrimitiveParamsSection.tsx` (3555 bytes)

Shape-specific geometry parameter editor.

---

### AxisPresetBar
`packages/frontend/src/components/inspector/sections/AxisPresetBar.tsx` (2548 bytes)

Preset buttons for datum orientation.

---

## Supporting Components

### JointConnectionDiagram
`packages/frontend/src/components/JointConnectionDiagram.tsx` (lines 1–124)

Renders parent → joint → child hierarchy with interactive links. Inlines `InteractiveLabel` (lines 100–123). **Verdict:** Diagram is reusable; consider exporting as separate component.

---

### SimulationMetadataSection
`packages/frontend/src/components/SimulationMetadataSection.tsx` (lines 1–67)

Read-only section: sim time, step count, solver, integrator, contact, FPS. Subscriptions to two stores. **Verdict:** Could be a pure presenter if stores are passed.

---

### FunctionPreviewChart
`packages/frontend/src/components/inspector/FunctionPreviewChart.tsx` (2703 bytes)

Renders command function preview. Used by CommandFunctionSection.

---

## Summary Table

| Component | Uses Primitives Well? | Hidden Reusable Patterns | Top Action |
|-----------|----------------------|--------------------------|------------|
| AboutDialog | Yes | None | Move into `@motionlab/ui` as InfoDialog |
| AttachGeometryDialog | Partial | Entity selector | Extract entity picker as `EntitySelectDialog` |
| CrashRecoveryDialog | Yes | Async list + recovery | Externalize store calls; make recoverable items prop-driven |
| CreateActuatorDialog | Partial | Form with edit/create mode | Replace useEffect reset with native form or dialog API |
| CreateBodyDialog | Yes | Toggle reveals section | Minor; keep as-is |
| ImportSettingsDialog | Partial | Settings form + description | Decouple from UILayoutStore; pass state as props |
| KeyboardShortcutsDialog | Yes | Category-grouped table | Good; export grouping logic |
| MissingAssetsDialog | Yes | Async list + file picker | Replace Effect-based callback with task/promise |
| SimulationSettingsDialog | No | Tabbed settings + presets | Flatten; extract tab contents as independent sections |
| BodyInspector | Yes | Debounced mass updates | Extract mass editor; use native form debounce |
| ActuatorInspector | Yes | Configuration section | Extract Configuration as `ActuatorConfigSection` |
| DatumInspector | Yes | None | Good composition |
| EntityInspector | Yes | Multi-select summary | Export dispatch logic |
| GeometryInspector | Yes | None | Good composition |
| JointInspector | Partial | Frame mode toggle | Extract toggle; refactor large file into sections |
| LoadInspector | Partial | Type-specific sections | Extract section variants; share EntityRef |
| SensorInspector | Yes | None | Good composition |
| MechanismInspector | Yes | None | Good composition |

---

## Pattern Catalog

### 1. Debounced Property Updates
**Where:** BodyInspector (mass, lines 47–56), TransformSection (transform, 300ms), MassSection (mass props, 300ms)  
**Pattern:** `useRef<timeout>` + `clearTimeout` + setter. Schedule on change, fire after delay.  
**Proposed Primitive:** `useDebounce(value, ms, callback)` or `useDebouncedCallback`  
**Why Extract:** All inspectors doing same thing; easy to get wrong (missing cleanup).

---

### 2. Form State with Edit/Create Modes
**Where:** CreateActuatorDialog (lines 45–74), CreateBodyDialog (reset on open)  
**Pattern:** Reset form fields via `useEffect` when `open` changes; distinguish `isEdit` from initial state.  
**Proposed Primitive:** `useFormState(initialValues, reset_trigger)` or `useDialogForm`  
**Why Extract:** Repeated across create/edit dialogs; `useEffect` anti-pattern.

---

### 3. Async List with File Picker
**Where:** MissingAssetsDialog (lines 52–67, 17–27)  
**Pattern:** List item → async file dialog → send command → listen for result → update list.  
**Proposed Primitive:** `useAsyncListAction(list, action, onSuccess)` or task-based state  
**Why Extract:** File dialogs appear in multiple dialogs; callback registration is implicit.

---

### 4. Inspector Section (Header + Property Rows)
**Where:** All inspectors via `InspectorSection` + `PropertyRow` + optional metadata/controls  
**Pattern:** Title + icon, optional default collapsed, flexible content (rows, tables, charts).  
**Proposed Primitive:** Already exists as `InspectorSection`, `PropertyRow` in `@motionlab/ui`  
**Why Extract:** Reusable building block; used throughout.

---

### 5. Conditional Multi-Section Inspector
**Where:** BodyInspector, JointInspector, LoadInspector, GeometryInspector  
**Pattern:** Parent inspector dispatches to sections based on entity type/state. Sections are independent.  
**Proposed Primitive:** Inspector composition framework; consider context + slot pattern  
**Why Extract:** Reduces boilerplate; scales to new entity types.

---

### 6. Entity Cross-Link Button
**Where:** JointInspector (joint link, lines 126–135), LoadInspector (EntityRef, lines 33–47)  
**Pattern:** Interactive link to another entity (click to select, hover to highlight).  
**Proposed Primitive:** `EntityLink` or `SelectableEntityLabel`  
**Why Extract:** Used in 3+ inspectors; selection/hover logic is identical.

---

### 7. Simulation Values Section
**Where:** ActuatorInspector, JointInspector, LoadInspector, SensorInspector  
**Pattern:** Reads channel definitions (array of {id, label, unit, type}), displays scalar or vec3, handles "awaiting data" state.  
**Proposed Primitive:** `SimulationValuesSection` (already extracted to sections/, but could move to `@motionlab/ui`)  
**Why Extract:** 5+ inspectors reuse; standard signature.

---

### 8. Conditional Property Row (Toggle-Reveals-Input)
**Where:** CreateActuatorDialog (effort limit, lines 152–175), ActuatorInspector (effort limit, lines 153–177)  
**Pattern:** Switch + conditional numeric input below.  
**Proposed Primitive:** `PropertyRowWithToggle` or `ConditionalPropertyRow`  
**Why Extract:** 2+ inspectors; common pattern.

---

### 9. Multi-Variant Section
**Where:** LoadInspector (point-force vs. spring-damper, lines 102–209)  
**Pattern:** Same section title, different content based on load type.  
**Proposed Primitive:** Variant component or discriminated section  
**Why Extract:** Reduces nesting; scales to new types.

---

### 10. Settings Dialog with Presets
**Where:** SimulationSettingsDialog (lines 61–74, preset buttons)  
**Pattern:** Tabbed form with preset apply buttons + reset to defaults.  
**Proposed Primitive:** `SettingsDialog` or `PresetDialog` compound component  
**Why Extract:** Reusable structure; appears in other domains.

---

## Inspector Architecture Assessment

All inspectors follow a consistent pattern:
- Render `InspectorPanel` with header (name, icon, type)
- Dispatch to 3–8 `InspectorSection` blocks
- Each section contains `PropertyRow` instances or custom controls
- Subscribe to selection + mechanism stores; read simulation state
- Emit updates via `send*` functions

**Inconsistencies:**
1. **Section extraction:** Some (BodyInspector) extract sections to files; others inline (JointInspector, LoadInspector).
2. **Conditional rendering:** Heavy use of ternary/if-checks; no variant pattern.
3. **Store coupling:** Each inspector directly imports `useMechanismStore`, `useSimulationStore`, etc. Hard to test/reuse.

**Normalization Path:**
1. **Enforce file structure:** Extract large inspectors into `inspectors/{Entity}Inspector/` dirs with section files.
2. **Use compound components:** `<Inspector><Section title="X"><PropertyRow label="Y">…</PropertyRow></Section></Inspector>`
3. **Pass store data as props:** Inspectors should be presenters; containers inject data.
4. **Variant sections:** `<TypedSection type="load.type" />` for multi-variant content.

---

## Missing Primitives in @motionlab/ui

1. **useDebounce / useDebouncedCallback** — Every inspector implements its own.
2. **useFormState / useDialogForm** — Form reset + edit/create toggle repeated.
3. **EntityLink / SelectableLabel** — Interactive entity reference (select on click, highlight on hover).
4. **PropertyRowWithToggle** — Conditional property row (toggle reveals nested input).
5. **SimulationValuesSection** — Currently in `frontend/components/inspector/sections/`, should move to `@motionlab/ui`.
6. **InspectorVariantSection / TypedSection** — Dispatch section content by discriminant (e.g., load type).
7. **DialogForm / FormDialog** — Compound component for form dialogs with submit/cancel handlers.
8. **AsyncListAction / useAsyncAction** — For file picker + async operations in dialogs.

---
