# Epic 12 — Main Toolbar & Command Architecture

> **Status:** Not started
> **Dependencies:** Epic 5 (Datum CRUD) — complete. Epic 8 (Joint CRUD) — complete. Epic 10 (Face-aware datums) — complete.
>
> **Governance note:** Epics 5+ are under full governance — every boundary or contract change requires an ADR, every protocol/schema change requires seam tests, every architecture change requires doc updates. However, this epic is purely frontend/UI — no protocol or native engine changes. ADRs are required only if the command registry introduces a new cross-package contract.

Three prompts. Prompt 1 is a BLOCKER — the command registry must exist before the toolbar or shortcut manager can consume it. Prompts 2 and 3 can run in parallel after Prompt 1 succeeds.

## Motivation

MotionLab currently has no main toolbar. Entity creation (bodies, datums, joints) is accessed through context menus and the ProjectTree, or via keyboard shortcuts that the user has to already know about. The only discoverability mechanism is the Command Palette (Ctrl+K), which is itself undiscoverable to new users.

MSC Adams View has a category ribbon (Bodies, Connectors, Motions, Forces, Simulation, Results, etc.) that makes every workflow instantly visible. The problem with Adams is that its UI is deeply 1990s — modal wizards, dense icon grids, and a Windows 95 aesthetic. We need the same concept — a persistent, categorized toolbar that surfaces all creation and simulation workflows — but with modern UX.

**Design references (study these for layout and interaction patterns):**
- **Onshape toolbar:** Horizontal toolbar above the viewport. Icon buttons grouped by category. Each category has a dropdown for sub-options. Active tool highlighted. Compact but discoverable.
- **Blender header bar:** Mode-aware toolbar that changes content based on context. Dropdown menus for each category. Keyboard shortcuts shown inline.
- **Fusion 360 toolbar:** Tab-based ribbon with icon groups. Dropdowns expand to show less-common options.

**What we need:** A persistent horizontal toolbar between the existing secondary toolbar (simulation controls) and the viewport. Grouped icon buttons with dropdown menus for sub-options. All creation workflows accessible. Tool mode state visible.

**Why a centralized command registry:** Currently, keyboard shortcuts are hardcoded in `ViewportOverlay.tsx` (lines 132-244), command palette entries are in separate `use-*-commands.ts` hooks, context menu items are hardcoded in `ViewportContextMenu.tsx`, and toolbar buttons each wire their own click handlers. There is no single source of truth. Adding a new action requires updating 4+ files. A centralized registry lets all surfaces (toolbar, command palette, shortcuts, context menus) dispatch the same actions from the same definitions.

## Shared Contract

| Interface | Owner | Consumer |
|-----------|-------|----------|
| `CommandRegistry` (plain TS, not React) | Prompt 1 (creates) | Prompt 2 (toolbar reads), Prompt 3 (shortcuts read), CommandPalette (reads) |
| `CommandDef` type (extended with `category`, `enabled`) | Prompt 1 (defines) | All prompts |
| `useCommandRegistry()` React hook | Prompt 1 (creates) | Prompt 2 (toolbar subscribes), Prompt 3 (shortcut dialog reads) |
| `MainToolbar` component | Prompt 2 (creates) | `App.tsx` (mounts in AppShell toolbar slot) |
| `ShortcutManager` (registers/dispatches keyboard events) | Prompt 3 (creates) | `App.tsx` (mounts provider) |
| Existing `useToolModeStore` | Unchanged | Prompt 1 (commands dispatch to it), Prompt 2 (toolbar reads active mode) |
| Existing `CommandPalette` | Prompt 1 (rewires to registry) | Unchanged surface |

Integration test: Open app -> toolbar visible with all categories -> click "Create > Joint > Revolute" -> enters create-joint mode with revolute preselected -> press Escape -> returns to select mode -> press Ctrl+K -> command palette shows same commands from registry -> press J -> enters create-joint mode (shortcut from registry).

---

## Prompt 1: Command Registry & Action System

```
# Epic 12 — Command Registry & Action System

You are building a centralized command/action registry that serves as the single source of truth for all user-invocable actions in MotionLab. The registry is consumed by the toolbar, command palette, keyboard shortcuts, and context menus.

## Read These First (in order)
- `docs/architecture/principles.md` — frontend owns authoring UX
- `packages/frontend/AGENTS.md` — frontend rules, store patterns
- `packages/ui/AGENTS.md` — UI package owns reusable primitives, no product logic
- `packages/frontend/src/commands/types.ts` — existing CommandDef type
- `packages/frontend/src/commands/index.ts` — existing command group aggregation
- `packages/frontend/src/commands/use-authoring-commands.ts` — existing authoring commands
- `packages/frontend/src/commands/use-simulation-commands.ts` — existing simulation commands
- `packages/frontend/src/commands/use-view-commands.ts` — existing view commands
- `packages/frontend/src/commands/use-help-commands.ts` — existing help commands
- `packages/frontend/src/commands/use-settings-commands.ts` — existing settings commands
- `packages/frontend/src/components/ViewportOverlay.tsx` — hardcoded keyboard shortcuts (lines 132-244)
- `packages/frontend/src/components/CommandPalette.tsx` — current palette wiring
- `packages/frontend/src/components/ViewportContextMenu.tsx` — hardcoded context menu items
- `packages/frontend/src/stores/tool-mode.ts` — tool mode store (select, create-datum, create-joint)
- `packages/frontend/src/stores/dialogs.ts` — dialog store

## What Exists Now

### `packages/frontend/src/commands/types.ts`
CommandDef type: { id, label, icon, shortcut, disabled, action }. Note: `shortcut` is display-only, no `category` field, no `enabled` function. Each command group is a React hook (`useAuthoringCommands`, etc.) that returns a `CommandGroup`.

### `packages/frontend/src/commands/use-authoring-commands.ts`
Three commands: create-datum, create-joint, import-cad. Each manually wires to stores. Uses React hooks for engine status and sim state to compute `disabled`.

### `packages/frontend/src/commands/use-simulation-commands.ts`
Three commands: compile, play, reset. Uses hooks for enable/disable logic.

### `packages/frontend/src/commands/use-view-commands.ts`
One command: select-mode.

### `packages/frontend/src/commands/use-settings-commands.ts`
One command: sim-settings dialog.

### `packages/frontend/src/commands/use-help-commands.ts`
Three commands: shortcuts dialog, show logs, about.

### `packages/frontend/src/components/ViewportOverlay.tsx` (lines 132-244)
Keyboard shortcuts are hardcoded in a monolithic useEffect:
- Escape: cancel/select mode
- V: select mode
- D: create-datum mode
- J: create-joint mode
- W/E/Q: gizmo translate/rotate/off
- H: toggle visibility of selected
- F: fit to selection
- Delete: delete selected datums/joints
- Space: play/pause simulation
- Period: step simulation
- R: reset simulation

These read directly from stores — not connected to the command system at all.

### `packages/frontend/src/components/ViewportContextMenu.tsx`
Hardcoded context menu with: Fit All, Camera presets (Iso/Front/Back/Left/Right/Top/Bottom), Toggle Grid. These are not connected to the command system.

### `packages/frontend/src/components/CommandPalette.tsx`
Reads from `useAllCommandGroups()` hook which aggregates the 5 command group hooks. Renders with shadcn Command components.

## What to Build

### 1. Redesign the CommandDef type

Replace `packages/frontend/src/commands/types.ts`:

```ts
import type { LucideIcon } from 'lucide-react';

export type CommandCategory =
  | 'file'
  | 'edit'
  | 'create'
  | 'simulate'
  | 'view'
  | 'help';

export interface CommandDef {
  /** Stable identifier, e.g. 'create.body', 'sim.play'. Used as React key and shortcut target. */
  id: string;
  /** Display label shown in toolbar, palette, and menus. */
  label: string;
  /** Lucide icon component. */
  icon?: LucideIcon;
  /** Category for grouping in toolbar and palette. */
  category: CommandCategory;
  /**
   * Keyboard shortcut definition.
   * Format: modifier keys joined with '+', e.g. 'Ctrl+S', 'Ctrl+Shift+Z', 'D', 'Space'.
   * Used for both display and actual binding.
   */
  shortcut?: string;
  /**
   * Function that returns whether the command is currently executable.
   * Called reactively (inside React hooks) or imperatively.
   * If omitted, command is always enabled.
   */
  enabled?: () => boolean;
  /** Execute the command. May be async. */
  execute: () => void | Promise<void>;
}

export interface CommandGroup {
  id: string;
  heading: string;
  commands: CommandDef[];
}
```

Key changes from current type:
- `action` renamed to `execute` (clearer intent)
- `disabled` replaced with `enabled()` function (invertible, callable both in hooks and imperatively)
- `category` field added
- `shortcut` is now the actual binding definition, not just display

### 2. Create the command registry module

Create `packages/frontend/src/commands/registry.ts` — a plain TypeScript module (no React dependency):

```ts
/**
 * Central command registry.
 *
 * This is a plain TS module so it can be used outside React
 * (tests, future CLI integration, etc.).
 *
 * Commands register themselves at module load time.
 * React hooks subscribe to the registry for dynamic enable/disable.
 */

const commands = new Map<string, CommandDef>();

export function registerCommand(cmd: CommandDef): void {
  if (commands.has(cmd.id)) {
    console.warn(`Command "${cmd.id}" already registered, overwriting.`);
  }
  commands.set(cmd.id, cmd);
}

export function registerCommands(cmds: CommandDef[]): void {
  for (const cmd of cmds) registerCommand(cmd);
}

export function getCommand(id: string): CommandDef | undefined {
  return commands.get(id);
}

export function getAllCommands(): CommandDef[] {
  return Array.from(commands.values());
}

export function getCommandsByCategory(category: CommandCategory): CommandDef[] {
  return getAllCommands().filter((c) => c.category === category);
}

export function executeCommand(id: string): void {
  const cmd = commands.get(id);
  if (!cmd) {
    console.warn(`Command "${id}" not found.`);
    return;
  }
  if (cmd.enabled && !cmd.enabled()) {
    console.warn(`Command "${id}" is disabled.`);
    return;
  }
  cmd.execute();
}

/** Clear all commands (useful for testing). */
export function clearRegistry(): void {
  commands.clear();
}
```

### 3. Define all commands

Create `packages/frontend/src/commands/definitions/` with one file per category:

#### `packages/frontend/src/commands/definitions/file-commands.ts`
```ts
- file.open — Open Project (Ctrl+O)
- file.save — Save Project (Ctrl+S)
- file.save-as — Save As (Ctrl+Shift+S) [stub]
- file.import-cad — Import CAD File
```

#### `packages/frontend/src/commands/definitions/edit-commands.ts`
```ts
- edit.undo — Undo (Ctrl+Z) [stub, disabled]
- edit.redo — Redo (Ctrl+Shift+Z) [stub, disabled]
- edit.delete — Delete Selected (Delete)
```

#### `packages/frontend/src/commands/definitions/create-commands.ts`
This is the largest group — all entity creation workflows:
```ts
- create.body — Create Body (B) [stub — sends a CreateBody command when wired]
- create.import — Import Geometry (attach to selected body or create new)
- create.datum — Create Datum (D) — enters create-datum tool mode
- create.datum.point — Create Datum > Point [future, disabled]
- create.datum.axis — Create Datum > Axis [future, disabled]
- create.datum.plane — Create Datum > Plane [future, disabled]
- create.datum.from-face — Create Datum from Face (D) — enters create-datum mode
- create.joint — Create Joint (J) — enters create-joint tool mode
- create.joint.revolute — Create Revolute Joint
- create.joint.prismatic — Create Prismatic Joint
- create.joint.fixed — Create Fixed Joint
- create.joint.spherical — Create Spherical Joint [future, disabled]
- create.joint.cylindrical — Create Cylindrical Joint [future, disabled]
- create.force.point — Create Point Force [future, disabled]
- create.force.torque — Create Point Torque [future, disabled]
- create.force.spring-damper — Create Spring-Damper [future, disabled]
- create.actuator.revolute-motor — Create Revolute Motor [future, disabled]
- create.actuator.prismatic-motor — Create Prismatic Motor [future, disabled]
- create.sensor — Create Sensor [future, disabled]
```

For disabled future commands, set `enabled: () => false` and note them as stubs.

For joint sub-type commands (revolute, prismatic, fixed): these should enter create-joint mode AND preselect the joint type. Currently the joint type is chosen in `JointConfigDialog` after picking two datums. The sub-type commands should store the preselected type so that when the dialog opens, it defaults to that type.

#### `packages/frontend/src/commands/definitions/simulate-commands.ts`
```ts
- sim.compile — Compile Mechanism
- sim.play — Play Simulation (Space)
- sim.pause — Pause Simulation (Space)
- sim.step — Step Simulation (.)
- sim.reset — Reset Simulation (R)
```

Note: Space toggles between play and pause. The registry should have separate play/pause commands, but the shortcut binding for Space should dispatch whichever is appropriate based on sim state.

#### `packages/frontend/src/commands/definitions/view-commands.ts`
```ts
- view.select-mode — Select Mode (V, Escape)
- view.fit-all — Fit All (F with nothing selected)
- view.fit-selection — Fit to Selection (F with selection)
- view.iso — Isometric View (Numpad 0)
- view.front — Front View (1)
- view.back — Back View (2)
- view.left — Left View (3)
- view.right — Right View (4)
- view.top — Top View (5)
- view.bottom — Bottom View (6)
- view.toggle-grid — Toggle Grid (G)
- view.toggle-datums — Toggle Datums Visibility [future]
- view.toggle-joints — Toggle Joints Visibility [future]
- view.gizmo-translate — Translate Gizmo (W)
- view.gizmo-rotate — Rotate Gizmo (E)
- view.gizmo-off — Gizmo Off (Q)
- view.toggle-visibility — Toggle Selected Visibility (H)
```

#### `packages/frontend/src/commands/definitions/help-commands.ts`
```ts
- help.shortcuts — Keyboard Shortcuts
- help.logs — Show Logs Folder
- help.about — About MotionLab
- help.command-palette — Command Palette (Ctrl+K)
```

### 4. Create an initialization function

Create `packages/frontend/src/commands/init.ts` that imports all definition files and calls `registerCommands()`. This runs once at app startup.

Each definition file exports a function like `createFileCommands()` that takes dependencies (store references, connection helpers) and returns `CommandDef[]`. This avoids importing React hooks in plain TS modules.

Pattern:
```ts
// In definitions/file-commands.ts
export function createFileCommands(): CommandDef[] {
  return [
    {
      id: 'file.save',
      label: 'Save Project',
      icon: Save,
      category: 'file',
      shortcut: 'Ctrl+S',
      enabled: () => useEngineConnection.getState().status === 'ready',
      execute: () => {
        const name = useMechanismStore.getState().projectName;
        sendSaveProject(name);
      },
    },
    // ...
  ];
}
```

Note: `enabled()` reads store state imperatively (via `.getState()`), not via hooks. This is correct — the registry is not React.

### 5. Create React hook for reactive command state

Create `packages/frontend/src/commands/use-commands.ts`:

```ts
/**
 * React hook that provides reactive command state.
 * Re-renders when relevant store state changes (engine status, sim state, selection).
 * Maps registry commands to CommandDefs with live `disabled` state.
 */
export function useCommandGroups(): CommandGroup[] { ... }
export function useCommandsByCategory(category: CommandCategory): CommandDef[] { ... }
export function useCommand(id: string): CommandDef & { disabled: boolean } { ... }
```

The hooks subscribe to the stores that affect enabled/disabled state (engine connection, simulation state, selection) and return commands with a computed `disabled` boolean for React consumption.

### 6. Rewire CommandPalette

Update `CommandPalette.tsx` to use `useCommandGroups()` from the new hook instead of `useAllCommandGroups()`. The palette should group commands by category and show all enabled commands. The `action` field becomes `execute`.

### 7. Migrate keyboard shortcuts out of ViewportOverlay

Remove the monolithic `useEffect` for keyboard shortcuts from `ViewportOverlay.tsx` (lines 132-244). These shortcuts are now defined in the command registry and dispatched by the ShortcutManager (built in Prompt 3). For Prompt 1, simply remove the duplicate handlers from ViewportOverlay and leave the registry as the source of truth. The actual keyboard dispatch wiring happens in Prompt 3.

IMPORTANT: Do not remove the shortcuts without ensuring they still work. For Prompt 1, keep the ViewportOverlay shortcuts as-is but add a TODO comment noting they will be replaced by the ShortcutManager in Prompt 3. The actual migration happens in Prompt 3.

### 8. Delete obsolete files

Once the registry is working and the palette is rewired:
- Delete `packages/frontend/src/commands/use-authoring-commands.ts`
- Delete `packages/frontend/src/commands/use-simulation-commands.ts`
- Delete `packages/frontend/src/commands/use-view-commands.ts`
- Delete `packages/frontend/src/commands/use-help-commands.ts`
- Delete `packages/frontend/src/commands/use-settings-commands.ts`

Update `packages/frontend/src/commands/index.ts` to export the new registry and hooks.

## Architecture Constraints
- The command registry (`registry.ts`) is a plain TypeScript module with NO React dependency. It uses `import type` for LucideIcon but does not call hooks.
- Command `enabled()` functions read store state imperatively via `.getState()`, not via React hooks.
- Commands know nothing about UI components — they dispatch to stores or engine connection functions.
- The registry is the SINGLE source of truth. No other file should hardcode command definitions, shortcuts, or action handlers.
- Command IDs use dot-notation: `category.action` or `category.subcategory.action`.
- The UI package (`@motionlab/ui`) is NOT modified — the registry lives in `@motionlab/frontend`.
- Keep backward compatibility: CommandPalette must work identically after the rewire.

## Done Looks Like
- `packages/frontend/src/commands/registry.ts` exists and exports registry functions
- All current commands are registered: authoring (datum, joint, import), simulation (compile, play, reset), view (select mode), help (shortcuts, logs, about), settings (sim settings)
- New commands registered for: file ops, edit stubs, all create sub-types, all view commands, camera presets, gizmo modes
- `CommandPalette` reads from the registry and works as before
- Obsolete `use-*-commands.ts` files deleted
- `packages/frontend/src/commands/index.ts` re-exports registry and hooks
- `pnpm --filter @motionlab/frontend typecheck` passes
- `pnpm --filter @motionlab/frontend test` passes (update existing tests if any reference old command types)

## What NOT to Build
- MainToolbar component (that's Prompt 2)
- ShortcutManager / keyboard dispatch (that's Prompt 3)
- Keyboard shortcut migration from ViewportOverlay (that's Prompt 3)
- Context menu rewiring (future — after toolbar and shortcuts are validated)
- Undo/redo implementation (stubs only — architecture requires a separate epic)
```

---

## Prompt 2: Main Toolbar Component

```
# Epic 12 — Main Toolbar Component

You are building the MainToolbar — a persistent horizontal toolbar that sits between the secondary toolbar (simulation controls) and the viewport area. It is the primary entry point for all creation workflows, replacing the minimal ViewportToolModeToolbar floating overlay.

Design reference: Onshape's toolbar — icon buttons grouped by category, dropdown menus for sub-options, active tool highlighted, compact and discoverable.

## Read These First (in order)
- `docs/architecture/principles.md` — frontend owns authoring UX
- `packages/frontend/AGENTS.md` — frontend rules
- `packages/ui/AGENTS.md` — reusable primitives, no product logic
- `packages/frontend/src/commands/registry.ts` — command registry (from Prompt 1)
- `packages/frontend/src/commands/use-commands.ts` — React hooks for commands (from Prompt 1)
- `packages/frontend/src/commands/types.ts` — CommandDef type (from Prompt 1)
- `packages/frontend/src/components/ViewportOverlay.tsx` — current viewport layout
- `packages/frontend/src/components/ViewportToolModeToolbar.tsx` — current minimal toolbar
- `packages/frontend/src/components/ViewportCameraToolbar.tsx` — current camera toolbar
- `packages/frontend/src/components/SimulationToolbar.tsx` — current simulation toolbar (SecondaryToolbar)
- `packages/frontend/src/App.tsx` — AppShell layout, slot assignments
- `packages/ui/src/components/shell/app-shell.tsx` — AppShell slots: topBar, toolbar, leftPanel, viewport, rightPanel, bottomDock
- `packages/ui/src/components/shell/secondary-toolbar.tsx` — SecondaryToolbar component
- `packages/ui/src/components/primitives/toolbar-button.tsx` — ToolbarButton component
- `packages/frontend/src/stores/tool-mode.ts` — ToolMode type, active mode

## What Exists Now

### `packages/frontend/src/App.tsx` (line 267)
The AppShell `toolbar` slot currently holds `<SimulationToolbar />` which renders a SecondaryToolbar with compile/play/pause/step/reset buttons.

### `packages/frontend/src/components/SimulationToolbar.tsx`
Uses `SecondaryToolbar` from @motionlab/ui. Has compile, play, pause, step, reset buttons. Shows sim time on the right.

### `packages/frontend/src/components/ViewportToolModeToolbar.tsx`
A minimal floating overlay in the top-left of the viewport with 3 buttons: Select (V), Create Datum (D), Create Joint (J). Rendered inside the ViewportHUD's `topLeft` slot.

### `packages/frontend/src/components/ViewportCameraToolbar.tsx`
A floating overlay below the tool mode toolbar with camera preset buttons: Fit All, Iso, Front, Back, Left, Right, Top, Bottom, Toggle Grid.

### `packages/ui/src/components/shell/app-shell.tsx`
AppShell layout: topBar (44px) -> toolbar (36px) -> horizontal panel group (left | center | right). The `toolbar` slot sits above the panel group, spanning full width.

### `packages/ui/src/components/primitives/toolbar-button.tsx`
ToolbarButton with tooltip, active state, disabled state. Uses Button variant 'toolbar'/'toolbar-active'.

### `@motionlab/ui` available components
DropdownMenu (with all sub-components), Button, Tooltip, Separator, ToolbarButton, ToolbarGroup, SecondaryToolbar.

## What to Build

### 1. Create MainToolbar component

Create `packages/frontend/src/components/MainToolbar.tsx`.

Layout (left to right):
```
[Select] [Create Body] [Import] | [Datum v] [Joint v] [Force v] [Actuator v] | [Compile] [Play/Pause] [Step] [Reset] [t=0.000s] | [View v] | [Undo] [Redo]
```

Where `|` represents a visual separator and `v` indicates a dropdown menu.

Each section is a `ToolbarGroup`:

#### Section 1: Mode & Basic Creation
- **Select** — icon button, highlighted when activeMode === 'select'. Shortcut hint: V.
- **Create Body** — icon button. Executes `create.body` command. Shortcut hint: B.
- **Import** — icon button. Executes `create.import` command.

#### Section 2: Entity Creation Dropdowns
- **Datum** — dropdown trigger button. Highlighted when activeMode === 'create-datum'. The trigger click enters create-datum mode (generic face-click mode). The dropdown chevron shows sub-options:
  - Create Datum from Face (D) — default, enters create-datum mode
  - Create Datum Point [disabled]
  - Create Datum Axis [disabled]
  - Create Datum Plane [disabled]

- **Joint** — dropdown trigger button. Highlighted when activeMode === 'create-joint'. Trigger click enters create-joint mode. Dropdown shows:
  - Revolute Joint (J) — default
  - Prismatic Joint
  - Fixed Joint
  - Spherical Joint [disabled]
  - Cylindrical Joint [disabled]

- **Force** — dropdown trigger button. All items disabled for now:
  - Point Force [disabled]
  - Point Torque [disabled]
  - Spring-Damper [disabled]

- **Actuator** — dropdown trigger button. All items disabled:
  - Revolute Motor [disabled]
  - Prismatic Motor [disabled]

#### Section 3: Simulation Controls
Move the simulation controls from `SimulationToolbar` into the MainToolbar:
- Compile, Play/Pause (toggle), Step, Reset
- Sim time display on the right side of this group

#### Section 4: View Dropdown
- **View** — dropdown trigger:
  - Fit All (F)
  - Separator
  - Isometric (Numpad 0)
  - Front (1) / Back (2) / Left (3) / Right (4) / Top (5) / Bottom (6)
  - Separator
  - Toggle Grid (G)
  - Toggle Datums Visibility [future]
  - Toggle Joints Visibility [future]

#### Section 5: Edit (right-aligned)
- **Undo** — icon button, disabled (stub). Shortcut hint: Ctrl+Z.
- **Redo** — icon button, disabled (stub). Shortcut hint: Ctrl+Shift+Z.

### 2. Dropdown trigger pattern

For dropdowns like Datum, Joint, Force, Actuator: use a split-button pattern. The main button area triggers the default action (e.g., enter create-datum mode). A small dropdown chevron area opens the sub-options menu.

Implementation with shadcn/ui DropdownMenu:

```tsx
<div className="flex items-center">
  <ToolbarButton
    tooltip="Create Datum (D)"
    active={activeMode === 'create-datum'}
    onClick={() => executeCommand('create.datum')}
  >
    <Crosshair className="size-4" />
  </ToolbarButton>
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="toolbar" size="icon" className="w-4 px-0">
        <ChevronDown className="size-3" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      <DropdownMenuItem onSelect={() => executeCommand('create.datum.from-face')}>
        <Crosshair className="size-4 mr-2" />
        From Face
        <DropdownMenuShortcut>D</DropdownMenuShortcut>
      </DropdownMenuItem>
      {/* ... more items */}
    </DropdownMenuContent>
  </DropdownMenu>
</div>
```

### 3. Read commands from the registry

The MainToolbar should read command definitions from the registry (via `useCommandsByCategory()` or `useCommand()` hooks from Prompt 1). It should NOT hardcode command IDs or actions. Use the registry's `executeCommand()` for all dispatch.

Exception: layout structure (which commands appear in which section) is defined in the toolbar component itself, since the toolbar layout is a product design decision, not something the registry should dictate.

### 4. Mount in AppShell

Update `packages/frontend/src/App.tsx`:

Replace the current `toolbar={<SimulationToolbar />}` with the new MainToolbar. The SimulationToolbar is absorbed into the MainToolbar.

```tsx
<AppShell
  topBar={<TopBar ... />}
  toolbar={<MainToolbar />}
  leftPanel={...}
  viewport={<ViewportOverlay />}
  ...
/>
```

### 5. Remove redundant toolbars

- Remove `ViewportToolModeToolbar` from `ViewportOverlay.tsx` — its function is replaced by the MainToolbar's mode buttons.
- Remove `ViewportCameraToolbar` from `ViewportOverlay.tsx` — its function is replaced by the MainToolbar's View dropdown.
- Keep the `ViewportHUD` for status messages (joint creation status, datum creation status, selection chip) — these are contextual overlays, not toolbar concerns.
- Delete or deprecate `SimulationToolbar.tsx` — its controls are now in the MainToolbar.

### 6. Active tool state visualization

The MainToolbar must clearly show which tool mode is active:
- When `activeMode === 'select'`: Select button uses `toolbar-active` variant.
- When `activeMode === 'create-datum'`: Datum button uses `toolbar-active` variant. Other creation buttons are neutral.
- When `activeMode === 'create-joint'`: Joint button uses `toolbar-active` variant.

This gives users a persistent visual indicator of the current mode — something the floating ViewportToolModeToolbar does today but in a less discoverable location.

### 7. Responsive collapse

For narrow windows, the toolbar should degrade gracefully:
- Below 900px: hide text labels (if any), keep icons.
- Below 600px: collapse less-used dropdowns into an overflow menu (ellipsis button).
- Use `@container` or media queries — keep it simple for now, can refine later.

For the initial implementation, just ensure the toolbar doesn't break on narrow windows (use `overflow-hidden` and `flex-shrink`). Full responsive collapse is a polish item.

## Architecture Constraints
- MainToolbar lives in `packages/frontend/src/components/` — it is product-specific, not reusable.
- It uses primitives from `@motionlab/ui` (ToolbarButton, DropdownMenu, Separator, Tooltip) but does NOT add product logic to the UI package.
- All command dispatch goes through `executeCommand()` from the registry — no direct store manipulation in the toolbar component.
- The toolbar should NOT import from `@motionlab/viewport` — it has no direct viewport dependency.
- Toolbar state (which dropdown is open, etc.) is local React state — not in Zustand.

## Done Looks Like
- MainToolbar renders horizontally above the viewport with all sections
- All creation workflows accessible: Body, Import, Datum (with dropdown), Joint (with dropdown), Force (disabled), Actuator (disabled)
- Simulation controls (compile, play/pause, step, reset) in the toolbar
- View dropdown with camera presets and grid toggle
- Active tool mode visually highlighted
- ViewportToolModeToolbar removed from viewport overlay
- ViewportCameraToolbar removed from viewport overlay
- SimulationToolbar replaced by MainToolbar
- Command dispatch goes through the registry
- `pnpm --filter @motionlab/frontend typecheck` passes
- Visual appearance is clean and professional (dark theme consistent)

## What NOT to Build
- Keyboard shortcut dispatch (that's Prompt 3 — toolbar shows shortcut hints but doesn't bind them)
- Context menu rewiring (future)
- Responsive collapse beyond basic overflow-hidden
- Custom toolbar drag/rearrange
- Toolbar customization / user preferences
```

---

## Prompt 3: Keyboard Shortcuts Registry & Help Dialog

```
# Epic 12 — Keyboard Shortcuts Registry & Help Dialog

You are building a centralized keyboard shortcut manager that reads shortcut bindings from the command registry (Prompt 1) and dispatches them. You are also migrating all hardcoded shortcuts out of ViewportOverlay.tsx and updating the KeyboardShortcutsDialog to read from the registry dynamically.

## Read These First (in order)
- `packages/frontend/AGENTS.md` — frontend rules
- `packages/frontend/src/commands/registry.ts` — command registry (from Prompt 1)
- `packages/frontend/src/commands/types.ts` — CommandDef type with shortcut field (from Prompt 1)
- `packages/frontend/src/components/ViewportOverlay.tsx` — hardcoded shortcuts to migrate (lines 132-244)
- `packages/frontend/src/components/KeyboardShortcutsDialog.tsx` — current hardcoded shortcuts list
- `packages/frontend/src/App.tsx` — where the shortcut provider should mount
- `packages/ui/src/hooks/use-keyboard-shortcuts.ts` — existing re-export of @tanstack/react-hotkeys (HotkeysProvider, useHotkey)
- `packages/frontend/src/stores/tool-mode.ts` — tool modes and gizmo modes
- `packages/frontend/src/stores/simulation.ts` — simulation state
- `packages/frontend/src/stores/selection.ts` — selection state

## What Exists Now

### `packages/frontend/src/components/ViewportOverlay.tsx` (lines 132-244)
A monolithic useEffect that listens for keydown events and dispatches actions directly to stores:
- Escape: cancel current tool / select mode (with special handling for joint creation steps)
- V: select mode
- D: create-datum mode
- J: create-joint mode + startCreation()
- W/E/Q: gizmo translate/rotate/off
- H: toggle visibility of selected entities
- F: fit to selection or fit all
- Delete: delete selected datums/joints (blocked during simulation)
- Space: play/pause simulation
- Period: step simulation
- R: reset simulation

It also filters out events when the target is an INPUT, TEXTAREA, or contentEditable element. This filtering MUST be preserved.

### `packages/frontend/src/App.tsx` (lines 237-254)
A second useEffect that handles:
- Ctrl+S: save project
- Ctrl+O: open project
- Ctrl+Shift+C: toggle chart panel

These are separate from the ViewportOverlay shortcuts.

### `packages/frontend/src/components/KeyboardShortcutsDialog.tsx`
A hardcoded list of 12 shortcuts displayed in a Dialog. Not connected to the command registry.

### `packages/ui/src/hooks/use-keyboard-shortcuts.ts`
Re-exports `HotkeysProvider` and `useHotkey` from `@tanstack/react-hotkeys`. Currently unused in the app (no component uses these hooks).

## What to Build

### 1. Create the ShortcutManager

Create `packages/frontend/src/commands/shortcut-manager.ts` — a plain TypeScript module:

```ts
/**
 * Keyboard shortcut manager.
 *
 * Reads shortcut bindings from the command registry and sets up
 * a single global keydown listener that dispatches to the appropriate
 * command's execute() function.
 *
 * Handles:
 * - Modifier keys (Ctrl, Shift, Alt, Meta)
 * - Single-key shortcuts (D, J, V, etc.)
 * - Input element filtering (skip when focused on INPUT/TEXTAREA/contentEditable)
 * - Conflict detection
 * - Custom shortcut handlers for context-dependent behavior (e.g., Space toggles play/pause)
 */
```

The ShortcutManager:

a) **Parses shortcut strings** from CommandDef.shortcut:
   - `'Ctrl+S'` -> { ctrl: true, shift: false, alt: false, key: 's' }
   - `'Ctrl+Shift+Z'` -> { ctrl: true, shift: true, alt: false, key: 'z' }
   - `'D'` -> { ctrl: false, shift: false, alt: false, key: 'd' }
   - `'Space'` -> { ctrl: false, shift: false, alt: false, key: ' ' }
   - `'Delete'` -> { ctrl: false, shift: false, alt: false, key: 'Delete' }
   - `'Escape'` -> { ctrl: false, shift: false, alt: false, key: 'Escape' }
   - `'.'` -> { ctrl: false, shift: false, alt: false, key: '.' }
   - `'Numpad 0'` -> special handling for numpad keys

b) **Registers a single global keydown handler** (`window.addEventListener('keydown', ...)`):
   - Filters input elements (INPUT, TEXTAREA, contentEditable) for non-modifier shortcuts
   - For modifier shortcuts (Ctrl+S, etc.), does NOT filter input elements (consistent with existing behavior)
   - Matches the event against all registered shortcuts
   - Calls `executeCommand(id)` for the matched command
   - Calls `e.preventDefault()` for matched shortcuts to prevent browser defaults

c) **Handles conflict detection:**
   - At initialization, checks all commands for duplicate shortcut bindings
   - Logs warnings for conflicts: `"Shortcut 'D' bound to both 'create.datum' and 'some.other.command'"`
   - First-registered command wins (but warns)

d) **Handles context-dependent shortcuts:**
   - Space needs to toggle between `sim.play` and `sim.pause` based on sim state
   - F needs to dispatch `view.fit-selection` if something is selected, or `view.fit-all` if not
   - Escape has special behavior for joint creation cancellation

   For these, the command's `execute()` function itself should handle the context logic (reading current state from stores). The ShortcutManager just dispatches.

e) **Lifecycle:**
```ts
export function initShortcutManager(): () => void {
  // Read all commands from registry, build shortcut map
  // Register global keydown listener
  // Return cleanup function
}
```

### 2. Wire the ShortcutManager into the app

In `packages/frontend/src/App.tsx`:

```ts
import { initShortcutManager } from './commands/shortcut-manager.js';

// In App component:
useEffect(() => {
  const cleanup = initShortcutManager();
  return cleanup;
}, []);
```

### 3. Migrate shortcuts from ViewportOverlay

Remove the keyboard shortcut useEffect from `ViewportOverlay.tsx` (lines 132-244). All shortcuts are now handled by the ShortcutManager.

**CRITICAL:** The existing shortcut behavior must be preserved exactly:
- Escape with joint creation in progress: cancel back to pick-parent (stay in create-joint mode)
- Escape otherwise: go to select mode, reset joint creation, clear authoring status
- Space: play/pause toggle (prevent default to avoid page scroll)
- Delete: blocked during simulation, only deletes datums and joints (not bodies)

To preserve the Escape behavior, the `view.select-mode` or a dedicated `edit.cancel` command's `execute()` function must contain the same joint-creation-aware logic currently in ViewportOverlay.

### 4. Migrate shortcuts from App.tsx

Remove the keyboard shortcut useEffect from `App.tsx` (lines 237-254). The Ctrl+S, Ctrl+O, and Ctrl+Shift+C shortcuts are now in the command registry and dispatched by the ShortcutManager.

### 5. Update KeyboardShortcutsDialog

Rewrite `packages/frontend/src/components/KeyboardShortcutsDialog.tsx` to read from the command registry dynamically:

```tsx
import { getAllCommands } from '../commands/registry.js';

export function KeyboardShortcutsDialog({ open, onClose }) {
  // Get all commands that have shortcuts, grouped by category
  const commandsWithShortcuts = getAllCommands()
    .filter((cmd) => cmd.shortcut)
    .sort((a, b) => {
      // Sort by category, then by label
      const catOrder = ['file', 'edit', 'create', 'simulate', 'view', 'help'];
      return catOrder.indexOf(a.category) - catOrder.indexOf(b.category)
        || a.label.localeCompare(b.label);
    });

  // Group by category for display
  const groups = groupBy(commandsWithShortcuts, (cmd) => cmd.category);

  // Render each group with category heading and shortcut rows
  // ...
}
```

The dialog should:
- Group shortcuts by category (File, Edit, Create, Simulate, View, Help)
- Show category headings
- Show command label, icon (if available), and shortcut key
- Use the same kbd styling as the current dialog
- Be fully dynamic — adding a new command with a shortcut automatically adds it to the dialog

### 6. Default shortcut assignments

Ensure all these shortcuts are defined in the command registry (from Prompt 1):

**File:**
- Ctrl+O — Open Project
- Ctrl+S — Save Project
- Ctrl+Shift+S — Save As [stub]

**Edit:**
- Ctrl+Z — Undo [stub]
- Ctrl+Shift+Z — Redo [stub]
- Delete — Delete Selected
- Escape — Cancel / Select Mode

**Create:**
- B — Create Body
- D — Create Datum (enter create-datum mode)
- J — Create Joint (enter create-joint mode)

**Simulate:**
- Space — Play/Pause Simulation
- . — Step Simulation
- R — Reset Simulation

**View:**
- V — Select Mode
- W — Translate Gizmo
- E — Rotate Gizmo
- Q — Gizmo Off
- F — Fit to Selection / Fit All
- G — Toggle Grid
- H — Toggle Selected Visibility
- 1 — Front View
- 2 — Back View
- 3 — Left View
- 4 — Right View
- 5 — Top View
- 6 — Bottom View
- Numpad 0 — Isometric View
- Ctrl+K — Command Palette
- Ctrl+Shift+C — Toggle Charts

### 7. Platform-aware display

Shortcut display should show:
- On macOS: Cmd instead of Ctrl (detect via `navigator.platform`)
- On all platforms: Use standard symbols where appropriate

For now, just show `Ctrl` everywhere and add a TODO for platform-aware display. Don't over-engineer this.

## Architecture Constraints
- ShortcutManager is a plain TypeScript module, not a React component or hook.
- It uses a single global `keydown` listener (not per-component listeners).
- It calls `executeCommand()` from the registry — no direct store manipulation.
- Input element filtering is in the ShortcutManager, not in individual commands.
- The ShortcutManager does NOT depend on React or the DOM beyond `window.addEventListener`.
- Shortcut definitions live in the command registry (CommandDef.shortcut), NOT in the ShortcutManager.
- The `@motionlab/ui` package is NOT modified (we do not use the tanstack react-hotkeys re-export — the ShortcutManager is simpler and more appropriate for our use case).

## Done Looks Like
- All keyboard shortcuts work exactly as before (same keys, same behavior)
- Shortcuts are dispatched from the command registry via the ShortcutManager
- No hardcoded keyboard handlers remain in ViewportOverlay.tsx or App.tsx
- KeyboardShortcutsDialog reads from the registry and shows all shortcuts grouped by category
- Input element filtering works (typing in text fields doesn't trigger shortcuts)
- Modifier shortcuts (Ctrl+S, etc.) work even when focused on input elements
- Escape behavior preserved for joint creation cancellation
- Space play/pause toggle preserved
- Delete blocked during simulation
- `pnpm --filter @motionlab/frontend typecheck` passes
- `pnpm --filter @motionlab/frontend test` passes

## What NOT to Build
- Custom shortcut remapping by users (future)
- Per-context shortcut scoping (e.g., different shortcuts in different panels — future)
- Shortcut chords / sequences (e.g., G then X for "move along X" — future)
- macOS Cmd key display (add TODO, ship with Ctrl everywhere for now)
- Shortcut overlay / on-screen hints (future)
```

---

## Integration Verification

After all three prompts complete, verify the full toolbar and command architecture:

1. **Visual check:** App opens with TopBar, MainToolbar (with all category groups), then viewport. No floating tool mode toolbar or camera toolbar in the viewport overlay.
2. **Create Body:** Click "Create Body" button in toolbar or press B -> body created.
3. **Create Datum:** Click Datum button -> enters create-datum mode (button highlighted). Click dropdown chevron -> shows sub-options with shortcuts.
4. **Create Joint:** Click Joint button or press J -> enters create-joint mode. Click dropdown -> shows Revolute, Prismatic, Fixed options.
5. **Simulation controls:** Compile, Play, Pause, Step, Reset buttons work from toolbar. Space bar toggles play/pause.
6. **View dropdown:** Click View -> shows camera presets and grid toggle. Press number keys 1-6 for camera presets.
7. **Command Palette:** Ctrl+K opens palette with all commands from registry, grouped by category. Selecting a command executes it.
8. **Keyboard Shortcuts Dialog:** Help > Keyboard Shortcuts shows all shortcuts grouped by category, read dynamically from the registry.
9. **Input filtering:** Focus a text input (e.g., rename a body) -> typing D does NOT enter create-datum mode. Ctrl+S still saves.
10. **Escape behavior:** In create-joint mode, after picking parent datum, press Escape -> cancels back to pick-parent step (stays in create-joint mode). Press Escape again -> returns to select mode.
11. **Typecheck:** `pnpm --filter @motionlab/frontend typecheck` passes.
12. **Tests:** `pnpm --filter @motionlab/frontend test` passes.

## Future Work (out of scope)

- **Context menus from registry:** Rewire ViewportContextMenu and entity context menus to read from the command registry. Currently out of scope to limit blast radius.
- **Undo/Redo architecture:** The Undo/Redo buttons and shortcuts are stubs. Implementing actual undo requires a command history / state snapshot system that is a separate epic.
- **Toolbar customization:** Let users rearrange toolbar buttons, hide sections, or create custom toolbar layouts.
- **Shortcut remapping:** Let users change keyboard shortcuts. Requires a preferences system.
- **Sensor entity creation:** Once sensors are implemented (future epic), add Create > Sensor commands to the registry and toolbar.
- **Context-aware toolbar:** Change toolbar contents based on active context (e.g., show different tools during simulation vs. authoring). Currently the toolbar shows all tools with enable/disable.
