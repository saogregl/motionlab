# Epic 20 — Project Management & Workflow Polish

> **Status:** Complete (all 3 prompts implemented)
> **Dependencies:** Epic 9 (project save/load with SaveProjectCommand/LoadProjectCommand, missing asset relocation) — complete.
>
> **Governance note:** This epic adds protocol messages (NewProjectCommand) and Electron IPC channels. Pre-MVP lighter governance applies — tests required at integration seams (IPC round-trip, protocol handshake after reset), doc updates batched at epic completion.

Three prompts. Prompt 1 is the foundation (welcome screen, title bar, dirty tracking). Prompt 2 builds on Prompt 1 (auto-save uses dirty tracking and save infrastructure). Prompt 3 is independent of Prompt 2 and can run in parallel after Prompt 1 completes.

## Motivation

Project management is a hygiene feature that every desktop engineering tool must have. The current MotionLab experience starts with a blank canvas and a generic title bar — there is no way to find recent projects, no indication of unsaved changes, no protection against data loss from crashes, and no templates to help new users get started. These gaps erode trust and make the app feel unfinished.

First impressions matter. The startup experience — what the user sees before any CAD file is imported — sets the tone for the entire product. A welcome screen with recent projects, templates, and clear project creation flow signals professionalism and reduces friction. Auto-save and crash recovery are table stakes for any tool where users invest time building mechanism models. File associations make the app feel native on every platform.

## Prior Art

| Tool | Startup | Recent Files | Auto-Save | Templates | File Associations |
|------|---------|-------------|-----------|-----------|-------------------|
| **Onshape** | Dashboard with recent documents, shared, tutorials | Full document list with thumbnails, search | Continuous cloud save, version history | Template documents in public library | N/A (browser-based) |
| **Fusion 360** | Data panel with recent designs, projects, samples | Recent designs grid with thumbnails and timestamps | Cloud save every 5 min, local cache for offline | Sample designs, tutorials in learning panel | `.f3d` / `.f3z` file associations on install |
| **Blender** | Splash screen with recent files, version info, New File options | Recent files list (File > Open Recent) | Auto-save every 2 min to temp dir, crash recovery on restart | Startup templates (General, 2D Animation, Sculpting, VFX) | `.blend` file association on install |
| **SolidWorks** | Start page with recent docs, tutorials, resources | Recent documents with thumbnails, pinned items | Auto-recover every 10 min to temp dir | Part/Assembly/Drawing templates, custom templates | `.sldprt`, `.sldasm`, `.slddrw` on install |
| **FreeCAD** | Start page with recent files, examples, wiki links | Recent files list with paths | Auto-save to backup dir (configurable interval) | Part, Mesh, Sketcher start templates | `.FCStd` on install (Linux .desktop, Windows registry) |

Key patterns across all tools:
- Recent files are stored outside the project file (app-level persistence)
- Auto-save writes to a separate temp/backup file, never overwrites the user's save
- Crash recovery is opt-in (dialog on next launch), never silent
- Templates are read-only resources, opening one creates a copy
- Dirty indicator in title bar is universal (asterisk or dot convention)

## Shared Contract

| Interface | Owner | Consumer |
|-----------|-------|----------|
| Recent projects list (Electron userData JSON) | Prompt 1 (creates + manages) | Prompt 1 (welcome screen reads), Prompt 2 (auto-save updates timestamp) |
| `isDirty` state in mechanism store | Exists (mechanism.ts) | Prompt 1 (title bar reads, close guard uses), Prompt 2 (auto-save checks before saving) |
| `NewProjectCommand` / `NewProjectResult` proto messages | Prompt 1 (defines + engine handles) | Prompt 1 (frontend sends on New Project) |
| `saveProjectFile` / `openProjectFile` IPC handlers | Exist (main.ts) | Prompt 1 (Save/Save As), Prompt 2 (auto-save uses variant) |
| `save-project-silent` IPC handler (no dialog) | Prompt 2 (creates) | Prompt 2 (auto-save timer invokes) |
| Welcome screen component | Prompt 1 (creates) | Prompt 3 (template cards rendered within) |
| Template `.motionlab` files in app resources | Prompt 3 (creates + bundles) | Prompt 1 (welcome screen lists), Prompt 3 (opens as new untitled project) |
| `onCheckDirty` preload API | Exists (preload.ts) | Prompt 1 (close guard, open/new guard) |
| `setWindowTitle` IPC channel | Prompt 1 (creates) | Prompt 1 (title bar updates on project name/dirty change) |

Integration test: Launch app → welcome screen shows → create from "Simple Pendulum" template → title bar shows "Simple Pendulum — MotionLab" → add a body → title bar shows "Simple Pendulum* — MotionLab" → Ctrl+S → save dialog → save → title bar clears asterisk → close app → relaunch → recent projects shows "Simple Pendulum" with timestamp → click to reopen.

---

## Prompt 1: Welcome Screen, Title Bar & Dirty Tracking

```
# Epic 20 — Welcome Screen, Title Bar Integration & Dirty Tracking

You are implementing the project management foundation: a welcome/start screen shown on launch, title bar integration showing project name and unsaved changes indicator, dirty-state guards on close/open/new, and a NewProjectCommand to reset the engine.

## Read These First (in order)
- `docs/architecture/principles.md` — Electron is a shell and supervisor, not the data bus
- `apps/AGENTS.md` — Electron main process rules
- `packages/frontend/AGENTS.md` — frontend owns authoring UX
- `packages/ui/AGENTS.md` — UI component conventions
- `docs/decisions/` — existing ADRs

## What Exists Now

### `apps/desktop/src/main.ts`
Electron main process. Creates a BrowserWindow with `frame: false` (custom title bar) and title "MotionLab". Has IPC handlers for `save-project-file` (shows save dialog, writes bytes), `open-project-file` (shows open dialog, reads bytes), and `show-open-dialog` (CAD files). Has a `before-quit` handler that checks dirty state via `check-dirty` IPC channel and shows a save/discard/cancel dialog. The window control IPC (minimize/maximize/close) is already wired.

### `apps/desktop/src/preload.ts`
Exposes `window.motionlab` API with: `saveProjectFile()`, `openProjectFile()`, `onCheckDirty()`, window control methods. The `onCheckDirty` callback is already registered — it sends `check-dirty-response` back to main process with a boolean.

### `packages/frontend/src/stores/mechanism.ts`
MechanismState store with `projectName` (default "Untitled"), `projectFilePath` (null for new projects), `isDirty` (boolean). All CRUD operations (`addBodies`, `addDatum`, `addJoint`, etc.) set `isDirty: true`. `markClean()` and `markDirty()` exist. `setProjectMeta(name, filePath)` sets project name and file path. `clear()` resets bodies/datums/joints but does NOT reset projectName/isDirty.

### `packages/frontend/src/engine/connection.ts`
`sendSaveProject(projectName)` sends SaveProjectCommand to engine. `sendLoadProject(data)` sends LoadProjectCommand. The `saveProjectResult` handler calls `window.motionlab.saveProjectFile()` then `markClean()`. The `loadProjectResult` handler calls `clear()`, rebuilds bodies/datums/joints from the result, calls `setProjectMeta()` then `markClean()`.

### `schemas/protocol/transport.proto`
Command oneof has SaveProjectCommand (field 40), LoadProjectCommand (field 41), RelocateAssetCommand (field 42). Event oneof has corresponding results. No NewProjectCommand exists.

### Title bar
The app uses `frame: false` (frameless window). The custom title bar is a React component in the frontend. Currently shows a static "MotionLab" text and window controls (minimize/maximize/close buttons).

## What to Build

### 1. Recent projects persistence (Electron main process)

Create a recent projects store in the Electron main process. Store in `app.getPath('userData')/recent-projects.json`.

Data structure:
```json
{
  "recentProjects": [
    {
      "name": "My Mechanism",
      "filePath": "/home/user/projects/my-mechanism.motionlab",
      "lastOpened": "2026-03-20T14:30:00.000Z"
    }
  ]
}
```

Rules:
- Maximum 10 entries
- When a project is opened or saved, add/update its entry (move to top)
- When a project file no longer exists on disk, show it greyed out (don't remove — user may have moved it temporarily)
- On "Remove from recent" action, remove the entry

IPC handlers to add in main.ts:
- `get-recent-projects` → returns the list
- `add-recent-project` → adds/updates an entry (called after save or open)
- `remove-recent-project` → removes an entry by filePath

Add to preload.ts:
```ts
getRecentProjects(): Promise<RecentProject[]>;
addRecentProject(project: { name: string; filePath: string }): Promise<void>;
removeRecentProject(filePath: string): Promise<void>;
```

### 2. Welcome screen component

Create `packages/frontend/src/components/WelcomeScreen.tsx`.

Layout:
- Full-viewport overlay, shown when no project is loaded (bodies.size === 0 and not currently importing)
- Left panel: MotionLab logo, version (from engine handshake or package.json), tagline
- Center: action buttons
  - "New Project" — opens a simple dialog asking for project name, then creates empty project
  - "Open Project" — calls `window.motionlab.openProjectFile()` then `sendLoadProject(data)`
- Right panel: Recent Projects list
  - Each entry: project name, file path (truncated), relative time ("2 hours ago")
  - Click → open that project (check if file exists first, show error if not)
  - Right-click context menu: "Remove from Recent", "Show in File Explorer"
- Bottom section: Template cards (placeholder for Prompt 3 — render empty section with "Templates coming soon" or render template cards if the template API is available)

The welcome screen disappears automatically when bodies are loaded (after import or project open). It reappears when all mechanism state is cleared (new project before any imports).

Use shadcn/ui components. Follow the design patterns in existing components. Use the engineering aesthetic — clean, professional, no unnecessary decoration.

### 3. Title bar integration

Update the custom title bar component to show:
- Project name from mechanism store: `projectName`
- Dirty indicator: append `*` when `isDirty` is true
- Format: `"ProjectName — MotionLab"` or `"ProjectName* — MotionLab"`

The title bar component should subscribe to `useMechanismStore` for `projectName` and `isDirty`.

Also update the native window title (for taskbar/dock display):

Add IPC handler in main.ts:
```ts
ipcMain.on('set-window-title', (event, title: string) => {
  BrowserWindow.fromWebContents(event.sender)?.setTitle(title);
});
```

Add to preload.ts:
```ts
setWindowTitle(title: string): void;
```

The frontend calls `setWindowTitle()` whenever projectName or isDirty changes (via a useEffect in the title bar component or App component).

### 4. NewProjectCommand protocol addition

In `transport.proto`, add:
```protobuf
message NewProjectCommand {
  string project_name = 1;  // name for the new project
}

message NewProjectResult {
  bool success = 1;
  string error_message = 2;
}
```

Add to Command oneof (use field 43):
```protobuf
NewProjectCommand new_project = 43;
```

Add to Event oneof (use field 43):
```protobuf
NewProjectResult new_project_result = 43;
```

Engine handler in transport.cpp: clear MechanismState (all bodies, datums, joints), clear ShapeRegistry, reset simulation state. Send NewProjectResult{success: true}.

Protocol helper in transport.ts:
```ts
export function createNewProjectCommand(projectName: string, sequenceId?: bigint): Uint8Array;
```

Frontend handler in connection.ts: on NewProjectResult success, clear mechanism store, clear scene graph, set projectMeta with new name and null filePath, markClean.

### 5. Dirty tracking guards

The `before-quit` handler in main.ts already checks dirty state. Extend this pattern to:

**New Project guard:** Before creating a new project, check isDirty. If dirty, show "Save changes?" dialog (Save / Don't Save / Cancel). On Save, trigger save flow first, then proceed. On Don't Save, proceed. On Cancel, abort.

**Open Project guard:** Same pattern before opening a different project.

Implementation: Add a `guardDirtyState()` helper in the frontend that:
1. Checks `isDirty` from mechanism store
2. If clean, resolves immediately
3. If dirty, shows a confirmation dialog (use the existing shadcn Dialog or window.confirm for MVP)
4. Returns 'proceed' | 'cancel'

Wire this into the "New Project" and "Open Project" flows.

### 6. Keyboard shortcuts

Register keyboard shortcuts in the frontend (document-level keydown listener or a dedicated hook):
- `Ctrl+S` (Cmd+S on Mac): Save — if projectFilePath exists, save to that path silently; if null, show Save As dialog
- `Ctrl+Shift+S` (Cmd+Shift+S on Mac): Save As — always show file dialog
- `Ctrl+N` (Cmd+N on Mac): New Project (with dirty guard)
- `Ctrl+O` (Cmd+O on Mac): Open Project (with dirty guard)

For "save to existing path silently" (no dialog), add a new IPC handler:

In main.ts:
```ts
ipcMain.handle('save-project-to-path', async (_event, data: Uint8Array, filePath: string) => {
  await fs.writeFile(filePath, Buffer.from(data));
  return { saved: true, filePath };
});
```

In preload.ts:
```ts
saveProjectToPath(data: Uint8Array, filePath: string): Promise<{ saved: boolean; filePath: string }>;
```

This allows Ctrl+S to save without showing a dialog when the project already has a file path.

### 7. Update clear() to fully reset project state

The mechanism store's `clear()` currently does NOT reset projectName, projectFilePath, or isDirty. Update it:

```ts
clear: () =>
  set({
    bodies: new Map(),
    datums: new Map(),
    joints: new Map(),
    importError: null,
    projectName: 'Untitled',
    projectFilePath: null,
    isDirty: false,
  }),
```

Or add a separate `resetProject()` action if `clear()` is used in contexts where you want to preserve project metadata (like during load where setProjectMeta is called right after).

### 8. Run codegen

`pnpm generate:proto` — verify generated TS and C++ include NewProjectCommand/NewProjectResult.

## Architecture Constraints
- Recent projects list is stored in Electron userData, NOT in any project file
- Welcome screen is a React component in the frontend package — it does not require engine connection
- Title bar updates are a frontend concern — Electron main process just sets the native title for taskbar/dock
- NewProjectCommand resets engine state — the frontend must also clear its own stores independently
- Dirty tracking is purely frontend — the engine has no concept of "dirty"
- Keyboard shortcuts are registered in the frontend, not in Electron's menu accelerators (we use frameless window with no native menu)

## Expected Behavior (testable)

### Welcome screen
1. Launch app → welcome screen is visible (full viewport overlay)
2. Welcome screen shows "New Project" and "Open Project" buttons
3. Welcome screen shows recent projects list (empty on first launch)
4. Click "New Project" → name dialog → enter name → welcome screen disappears, blank canvas, title bar shows "MyProject — MotionLab"
5. Click "Open Project" → file dialog → select .motionlab → project loads, welcome screen disappears
6. Import a CAD file → welcome screen disappears
7. Close all → welcome screen reappears

### Title bar
1. New project → title shows "Untitled — MotionLab"
2. Import a body → title shows "Untitled* — MotionLab" (dirty)
3. Ctrl+S → save dialog → save → title shows "MyProject — MotionLab" (clean)
4. Add a datum → title shows "MyProject* — MotionLab" (dirty again)
5. Ctrl+S → saves silently to same path → title shows "MyProject — MotionLab"

### Dirty guards
1. With unsaved changes, click "New Project" → confirm dialog appears
2. Choose "Cancel" → nothing happens, stay on current project
3. Choose "Don't Save" → current project discarded, new project created
4. With unsaved changes, close window → confirm dialog from Electron (existing behavior)

### Recent projects
1. Save a project → appears in recent projects list
2. Open a project → appears in (or moves to top of) recent projects list
3. Relaunch app → recent projects list persists
4. Right-click recent project → "Remove from Recent" removes it
5. Click a recent project whose file was deleted → error message shown

### Keyboard shortcuts
1. Ctrl+S with no file path → save dialog
2. Ctrl+S with existing file path → silent save, no dialog
3. Ctrl+Shift+S → always shows save dialog
4. Ctrl+N → dirty guard → new project
5. Ctrl+O → dirty guard → open dialog

## Done Looks Like
- Welcome screen appears on launch with New/Open/Recent
- Title bar shows "ProjectName — MotionLab" with dirty asterisk
- Dirty guards on close/new/open
- NewProjectCommand resets engine state
- Keyboard shortcuts work (Ctrl+S, Ctrl+Shift+S, Ctrl+N, Ctrl+O)
- Recent projects persist across sessions
- `pnpm generate:proto` succeeds
- `pnpm --filter @motionlab/frontend typecheck` passes
- `pnpm --filter @motionlab/protocol typecheck` passes
- `ctest --preset dev` passes (engine handles NewProjectCommand)

## What NOT to Build
- Auto-save (that's Prompt 2)
- Crash recovery (that's Prompt 2)
- File associations (that's Prompt 2)
- Templates (that's Prompt 3)
- Project thumbnails in recent list (stretch goal, not MVP)
- Multi-window support (one window per project for now)
```

---

## Prompt 2: Auto-Save, Crash Recovery & File Handling

```
# Epic 20 — Auto-Save, Crash Recovery & File Associations

You are implementing auto-save with crash recovery, platform-specific file associations, and additional save infrastructure. This builds on Prompt 1's dirty tracking, save flow, and recent projects persistence.

## Read These First (in order)
- `docs/architecture/principles.md` — Electron is a shell and supervisor
- `apps/AGENTS.md` — Electron main process rules
- `packages/frontend/AGENTS.md` — frontend owns authoring UX
- The existing epic brief: `docs/briefs/epic-20-prompts.md` — read the Prompt 1 section for what exists after Prompt 1

## What Exists Now (after Prompt 1)

### `apps/desktop/src/main.ts`
Electron main process with IPC handlers for: `save-project-file` (save dialog), `save-project-to-path` (silent save to known path), `open-project-file`, `get-recent-projects`, `add-recent-project`, `remove-recent-project`, `set-window-title`. The `before-quit` handler checks dirty state.

### `apps/desktop/src/preload.ts`
Exposes: `saveProjectFile()`, `saveProjectToPath()`, `openProjectFile()`, `getRecentProjects()`, `addRecentProject()`, `removeRecentProject()`, `setWindowTitle()`, `onCheckDirty()`.

### `packages/frontend/src/stores/mechanism.ts`
`isDirty`, `projectFilePath`, `projectName` tracked. `markClean()` / `markDirty()` exist. All CRUD sets isDirty.

### `packages/frontend/src/engine/connection.ts`
`sendSaveProject()` sends SaveProjectCommand to engine. The result handler calls `saveProjectFile()` or `saveProjectToPath()` depending on whether a file path exists. Handles `loadProjectResult` with full state rebuild.

### Save flow
Ctrl+S → if projectFilePath exists, `sendSaveProject()` then `saveProjectToPath()`. If no path, `sendSaveProject()` then `saveProjectFile()` (dialog). Engine serializes mechanism to ProjectFile protobuf bytes, sends back via SaveProjectResult.

## What to Build

### 1. Auto-save timer (Electron main process)

Add an auto-save system in the Electron main process. The auto-save timer runs in main process because it must survive renderer crashes.

Architecture:
- Main process starts a 2-minute interval timer after the first project save or load
- On each tick: send `auto-save-tick` to renderer → renderer checks isDirty → if dirty, triggers save to engine → engine returns project bytes → renderer sends `auto-save-data` to main process → main writes to .autosave file
- Auto-save file location: same directory as the project file, named `<filename>.autosave`
  - Example: `/home/user/projects/MyMech.motionlab` → `/home/user/projects/MyMech.motionlab.autosave`
- For unsaved projects (no filePath yet): auto-save to `app.getPath('userData')/autosave/untitled-<timestamp>.motionlab.autosave`
- Auto-save is silent: no dialog, no title bar change, no status message
- On clean exit (before-quit completes normally): delete the autosave file

IPC channels:

In main.ts:
```ts
// Timer management
let autoSaveTimer: ReturnType<typeof setInterval> | null = null;
let currentProjectPath: string | null = null;

function startAutoSaveTimer() {
  stopAutoSaveTimer();
  autoSaveTimer = setInterval(() => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send('auto-save-tick');
  }, 2 * 60 * 1000); // 2 minutes
}

function stopAutoSaveTimer() {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
}

// Renderer sends auto-save data back
ipcMain.handle('auto-save-write', async (_event, data: Uint8Array, projectPath: string | null) => {
  const savePath = getAutoSavePath(projectPath);
  await fs.writeFile(savePath, Buffer.from(data));
  return { saved: true, path: savePath };
});

// Clean up autosave on successful manual save
ipcMain.handle('auto-save-cleanup', async (_event, projectPath: string | null) => {
  const savePath = getAutoSavePath(projectPath);
  try { await fs.unlink(savePath); } catch { /* ignore if doesn't exist */ }
});
```

In preload.ts:
```ts
onAutoSaveTick(callback: () => void): void;
autoSaveWrite(data: Uint8Array, projectPath: string | null): Promise<{ saved: boolean; path: string }>;
autoSaveCleanup(projectPath: string | null): Promise<void>;
```

In the frontend, register the auto-save tick handler in connection.ts or a dedicated hook:
```ts
window.motionlab.onAutoSaveTick(() => {
  const { isDirty, projectFilePath, projectName } = useMechanismStore.getState();
  if (!isDirty) return; // nothing to save
  // Trigger save through engine (same as manual save but route result to auto-save handler)
  sendAutoSave(projectName);
});
```

The auto-save flow needs a way to distinguish auto-save results from manual save results. Options:
- Use a separate flag/callback in the save result handler
- Use a dedicated `autoSavePending` state variable

Simplest approach: set a module-level `isAutoSaving` flag before sending SaveProjectCommand. In the saveProjectResult handler, check the flag to route to `autoSaveWrite` instead of `saveProjectFile`.

### 2. Crash recovery (Electron main process + frontend)

On app startup, before showing the welcome screen:

1. Scan for autosave files:
   - Check `app.getPath('userData')/autosave/` for any `.autosave` files
   - Check recent project paths for `.autosave` siblings
2. If autosave files found, show a recovery dialog before the welcome screen:
   - "MotionLab didn't shut down properly. Recover unsaved changes?"
   - List each recoverable project: name, file path, autosave timestamp
   - Per-project options: "Recover" | "Discard"
   - "Recover" opens the autosave data as if it were a regular project load, sets projectFilePath to the original (non-autosave) path
   - "Discard" deletes the autosave file

IPC:
```ts
ipcMain.handle('check-autosave-recovery', async () => {
  // Scan for .autosave files, return list of recoverable projects
  return recoverableProjects; // { name, originalPath, autoSavePath, modifiedAt }[]
});

ipcMain.handle('read-autosave', async (_event, autoSavePath: string) => {
  const buffer = await fs.readFile(autoSavePath);
  return new Uint8Array(buffer);
});

ipcMain.handle('discard-autosave', async (_event, autoSavePath: string) => {
  await fs.unlink(autoSavePath);
});
```

Frontend: Check for recovery on mount (before showing welcome screen). If recoverable projects exist, show a CrashRecoveryDialog component. On recover, call `sendLoadProject()` with the autosave data.

### 3. Auto-save cleanup on clean exit

In the `before-quit` handler in main.ts, after the dirty check dialog (if user saves or discards):
```ts
// Delete autosave file on clean exit
const savePath = getAutoSavePath(currentProjectPath);
try { await fs.unlink(savePath); } catch { /* ignore */ }
```

Also delete autosave after every successful manual save (Ctrl+S):
```ts
// In save result handler, after successful save:
window.motionlab.autoSaveCleanup(projectFilePath);
```

### 4. File associations (platform-specific)

Register `.motionlab` file type so double-clicking opens in MotionLab.

**All platforms — command line arg handling:**

In main.ts, handle file path passed as command line argument:
```ts
// Check if launched with a file path argument
const fileArg = process.argv.find(arg => arg.endsWith('.motionlab'));
if (fileArg) {
  // After window is ready, load this project
  // Send to renderer via IPC: 'open-file-on-launch'
}
```

On macOS, also handle the `open-file` event:
```ts
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  // If window exists, send to renderer
  // If not yet created, store path and send after window ready
});
```

**Windows — installer registration:**

If using electron-forge or electron-builder, add to the build config:
```json
{
  "fileAssociations": [{
    "ext": "motionlab",
    "name": "MotionLab Project",
    "description": "MotionLab Mechanism Project",
    "mimeType": "application/x-motionlab-project",
    "role": "Editor"
  }]
}
```

**Linux — .desktop file and MIME type:**

Create `assets/linux/motionlab.desktop`:
```ini
[Desktop Entry]
Name=MotionLab
Comment=Mechanism Authoring and Simulation Workbench
Exec=motionlab %f
Icon=motionlab
Type=Application
Categories=Science;Engineering;
MimeType=application/x-motionlab-project;
```

Create `assets/linux/motionlab-project.xml` (MIME type definition):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="application/x-motionlab-project">
    <comment>MotionLab Project</comment>
    <glob pattern="*.motionlab"/>
    <icon name="motionlab"/>
  </mime-type>
</mime-info>
```

**macOS — Info.plist:**

Add to electron-forge/builder config for macOS:
```json
{
  "CFBundleDocumentTypes": [{
    "CFBundleTypeName": "MotionLab Project",
    "CFBundleTypeExtensions": ["motionlab"],
    "CFBundleTypeRole": "Editor",
    "LSHandlerRank": "Owner"
  }]
}
```

**Frontend handling:**

Add to preload.ts:
```ts
onOpenFileRequest(callback: (filePath: string) => void): void;
```

In main.ts, send `open-file-request` to renderer with the file path. The frontend dirty-guards, then reads the file and calls `sendLoadProject()`.

### 5. Keyboard shortcuts for save variants

The shortcuts themselves are defined in Prompt 1. This prompt ensures the "save silently to existing path" flow works end-to-end with auto-save cleanup:

After a successful Ctrl+S save to existing path:
1. Engine returns project bytes
2. Frontend writes to file via `saveProjectToPath()`
3. Frontend calls `markClean()`
4. Frontend calls `autoSaveCleanup()` to delete the autosave file
5. Frontend calls `addRecentProject()` to update the recent list timestamp

## Architecture Constraints
- Auto-save timer runs in Electron main process (survives renderer crashes)
- Auto-save data flows: main (tick) → renderer (check dirty, trigger engine save) → engine (serialize) → renderer (receive bytes) → main (write file)
- Auto-save NEVER overwrites the user's saved project file
- Crash recovery is always opt-in — never silently load an autosave
- File associations are platform-specific — each platform has its own registration mechanism
- File association registration happens at install time, not runtime
- The auto-save interval (2 minutes) should be a constant, not user-configurable for MVP

## Expected Behavior (testable)

### Auto-save
1. Open a project, make changes → after 2 minutes, `.autosave` file appears alongside project file
2. Make no changes for 2 minutes → no autosave written (isDirty check)
3. Manual save → autosave file deleted
4. Clean exit (File > Quit or window close) → autosave file deleted

### Crash recovery
1. Open project, make changes, force-kill app (kill -9) → autosave file survives
2. Relaunch → recovery dialog shown: "Recover unsaved changes?"
3. Click "Recover" → project loads from autosave, title bar shows project name with dirty indicator
4. Click "Discard" → autosave deleted, welcome screen shown normally
5. No autosave files → no recovery dialog, straight to welcome screen

### File associations
1. Double-click .motionlab file → MotionLab launches and opens that project
2. MotionLab already running, double-click .motionlab → existing window loads that project (with dirty guard)
3. Launch from command line with file path argument → opens that project

## Done Looks Like
- Auto-save writes to `.autosave` file every 2 minutes when dirty
- Crash recovery dialog on launch when autosave files detected
- Clean exit deletes autosave files
- File associations registered for all target platforms
- Double-click .motionlab opens in MotionLab
- `pnpm --filter @motionlab/frontend typecheck` passes
- Electron build config includes file association metadata

## What NOT to Build
- Configurable auto-save interval (hardcode 2 minutes for MVP)
- Auto-save version history (only keep latest autosave)
- Cloud backup or sync
- Multi-instance file locking
- Project thumbnails for recovery dialog
```

---

## Prompt 3: Project Templates & Sample Mechanisms

```
# Epic 20 — Project Templates & Sample Mechanisms

You are implementing built-in project templates: pre-built mechanism configurations that ship with the app and appear on the welcome screen. Opening a template creates a new untitled project with the template's mechanism pre-loaded. This gives new users working examples to learn from and experienced users quick starting points.

## Read These First (in order)
- `docs/architecture/principles.md` — engine is computational authority
- `packages/frontend/AGENTS.md` — frontend owns authoring UX
- `packages/ui/AGENTS.md` — UI component conventions
- `schemas/mechanism/mechanism.proto` — Mechanism, Body, Joint, Datum definitions
- The existing epic brief: `docs/briefs/epic-20-prompts.md` — read Prompt 1 for welcome screen structure

## What Exists Now (after Prompt 1)

### Welcome screen (`packages/frontend/src/components/WelcomeScreen.tsx`)
Shows New Project, Open Project, Recent Projects. Has a placeholder section for templates at the bottom.

### Project save/load flow
SaveProjectCommand → engine serializes Mechanism + display data → ProjectFile protobuf bytes. LoadProjectCommand with bytes → engine deserializes, rebuilds MechanismState and ShapeRegistry, sends LoadProjectResult with full mechanism + body display data.

### `schemas/mechanism/mechanism.proto` — ProjectFile
```protobuf
message ProjectFile {
  uint32 version = 1;
  ProjectMetadata metadata = 2;
  Mechanism mechanism = 3;
  repeated BodyDisplayData body_display_data = 4;
}
```

### Engine import + save pipeline
The engine can: import STEP/IGES → create bodies with meshes and mass properties → create datums → create joints → save all state to ProjectFile bytes → load from ProjectFile bytes and fully reconstruct state.

### Joint types available
Revolute, prismatic, fixed, spherical, cylindrical, planar.

## What to Build

### 1. Create template project files

Each template is a `.motionlab` file (serialized ProjectFile protobuf) created by manually building the mechanism in MotionLab and saving it. The templates include all bodies, datums, joints, and simulation settings — everything needed to run a simulation immediately.

Templates to create:

**"Empty Project"**
- No bodies, no joints, no datums
- Default simulation settings (timestep 0.001s, gravity -9.81 m/s^2)
- This is effectively the same as "New Project" but appears as a template card for consistency

**"Simple Pendulum"**
- Ground body (fixed box or plate) at origin
- Pendulum arm (rectangular bar, ~0.5m long, ~0.02m cross-section)
- One revolute joint connecting arm to ground at a datum on the ground body's edge
- Gravity enabled
- Good for: basic simulation validation, understanding revolute joints

**"Four-Bar Linkage"**
- Ground body (fixed, flat plate)
- Crank arm (short bar, ~0.1m)
- Coupler bar (medium bar, ~0.3m)
- Follower arm (medium bar, ~0.2m)
- Four revolute joints forming the classic planar linkage
- Good for: understanding closed kinematic chains, Grashof condition

**"Slider-Crank"**
- Ground body (fixed)
- Crank arm with revolute joint to ground
- Connecting rod with revolute joint to crank
- Slider block with prismatic joint to ground, revolute joint to connecting rod
- Good for: mixed joint types, engine-to-wheel conversion concept

**"Double Pendulum"**
- Ground body (fixed)
- Upper arm with revolute joint to ground
- Lower arm with revolute joint to upper arm
- Good for: chaotic dynamics, sensitivity to initial conditions

### 2. Template creation workflow

Since templates are just .motionlab files, create them using the existing MotionLab tooling:
1. Launch MotionLab
2. Import simple geometry (create basic shapes in a CAD tool, or use primitive shapes if the engine supports them)
3. Add datums at the desired joint locations
4. Create joints between datums
5. Configure simulation settings
6. Save the project as a template file

If primitive shapes aren't available for import, create minimal STEP files for each template part (box, cylinder, bar) using a script or external tool. The template files should be small — simple geometry only.

Alternative approach if STEP creation is impractical: create the template files programmatically by constructing ProjectFile protobuf messages in a build script:

Create `scripts/build-templates.ts`:
```ts
// Constructs template .motionlab files from protobuf definitions
// Uses @motionlab/protocol to serialize ProjectFile messages
// Writes to apps/desktop/resources/templates/
```

This script would define body meshes (simple box vertices/indices), positions, datums, and joints directly in code. The resulting files are valid ProjectFile protobufs that the engine can load.

**Note:** Templates created this way won't have B-Rep shapes in the ShapeRegistry (since they weren't imported via the CAD pipeline). This means face-level topology features won't work on template bodies. This is acceptable — templates are for learning mechanism concepts, not face picking. Document this limitation.

### 3. Bundle templates with the app

Store templates in the app resources directory:

Development: `apps/desktop/resources/templates/`
```
templates/
  empty.motionlab
  simple-pendulum.motionlab
  four-bar-linkage.motionlab
  slider-crank.motionlab
  double-pendulum.motionlab
  manifest.json
```

`manifest.json` describes each template:
```json
{
  "templates": [
    {
      "id": "empty",
      "name": "Empty Project",
      "description": "A blank canvas with default simulation settings.",
      "filename": "empty.motionlab",
      "icon": "file-plus",
      "category": "basics"
    },
    {
      "id": "simple-pendulum",
      "name": "Simple Pendulum",
      "description": "A single arm swinging under gravity. Demonstrates revolute joints and basic dynamics.",
      "filename": "simple-pendulum.motionlab",
      "icon": "rotate-ccw",
      "category": "basics"
    },
    {
      "id": "four-bar-linkage",
      "name": "Four-Bar Linkage",
      "description": "A classic planar mechanism with four revolute joints forming a closed kinematic chain.",
      "filename": "four-bar-linkage.motionlab",
      "icon": "box",
      "category": "linkages"
    },
    {
      "id": "slider-crank",
      "name": "Slider-Crank",
      "description": "Crank, connecting rod, and slider with revolute and prismatic joints.",
      "filename": "slider-crank.motionlab",
      "icon": "move-horizontal",
      "category": "linkages"
    },
    {
      "id": "double-pendulum",
      "name": "Double Pendulum",
      "description": "Two arms in series — a classic example of chaotic dynamics.",
      "filename": "double-pendulum.motionlab",
      "icon": "git-branch",
      "category": "dynamics"
    }
  ]
}
```

For packaged builds, templates go into `resources/` (Electron's `process.resourcesPath`). For dev, resolve relative to the repo root.

### 4. Template listing IPC

In main.ts:
```ts
ipcMain.handle('get-templates', async () => {
  const templatesDir = app.isPackaged
    ? path.join(process.resourcesPath, 'templates')
    : path.join(repoRoot, 'apps', 'desktop', 'resources', 'templates');

  const manifestPath = path.join(templatesDir, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
  return manifest.templates;
});

ipcMain.handle('open-template', async (_event, templateFilename: string) => {
  const templatesDir = /* same resolution as above */;
  const filePath = path.join(templatesDir, templateFilename);
  const buffer = await fs.readFile(filePath);
  return new Uint8Array(buffer);
});
```

In preload.ts:
```ts
getTemplates(): Promise<TemplateInfo[]>;
openTemplate(filename: string): Promise<Uint8Array>;
```

### 5. Template selection UI

Update the welcome screen to show template cards. Replace the placeholder section from Prompt 1.

Template card design:
- Grid layout, 3-4 cards per row
- Each card:
  - Icon (Lucide icon from manifest)
  - Template name (bold)
  - Short description (1-2 lines, muted text)
  - Click → opens template as new untitled project

Card component: use shadcn Card or a custom styled div. Follow the existing component patterns in `packages/ui/`.

When a template is clicked:
1. Dirty guard (if a project is open with unsaved changes)
2. Read template file via `openTemplate(filename)`
3. Call `sendLoadProject(data)` — engine loads the template mechanism
4. Set project name to template name (e.g., "Simple Pendulum")
5. Set projectFilePath to null (this is a new unsaved project based on a template)
6. Mark as clean (the template is the "saved" baseline — no changes yet)

Important: opening a template must NOT modify the template file. The template is read-only. Any changes the user makes are only saved when they explicitly Save As.

### 6. Template cards in File menu (future)

For MVP, templates are only on the welcome screen. A future enhancement would add "File > New from Template" submenu. Not in scope for this prompt.

### 7. Electron build config for bundling templates

Ensure the template files are included in the packaged app:

For electron-forge:
```json
{
  "packagerConfig": {
    "extraResource": ["resources/templates"]
  }
}
```

For electron-builder:
```json
{
  "extraResources": [{
    "from": "resources/templates",
    "to": "templates"
  }]
}
```

## Architecture Constraints
- Templates are read-only files bundled with the app — never modified at runtime
- Opening a template creates a copy in memory (new untitled project), not a reference to the template file
- Template bodies may lack B-Rep shapes (if created programmatically) — face-level features gracefully degrade
- The template manifest is a static JSON file — no dynamic template discovery
- User-created templates are a future feature (save current project as template) — not in scope
- Template files use the same ProjectFile protobuf format as regular project files
- Template loading goes through the same LoadProjectCommand path as regular project loading — no special engine logic needed

## Expected Behavior (testable)

### Template listing
1. Launch app → welcome screen shows template cards below Recent Projects
2. Cards show: icon, name, description for each template
3. Templates include: Empty Project, Simple Pendulum, Four-Bar Linkage, Slider-Crank, Double Pendulum

### Opening a template
1. Click "Simple Pendulum" card → project loads, welcome screen disappears
2. Title bar shows "Simple Pendulum — MotionLab" (no asterisk — clean state)
3. Viewport shows the pendulum mechanism (ground + arm + joint)
4. Project tree shows bodies and joints
5. projectFilePath is null (unsaved new project)
6. Ctrl+S → Save As dialog (no existing path)
7. Make a change → title bar shows "Simple Pendulum* — MotionLab"

### Template integrity
1. Open template → make changes → save as "MyProject.motionlab"
2. Open same template again → original template state (no changes from step 1)
3. Template files on disk are never modified

### Template with simulation
1. Open "Simple Pendulum" template
2. Click Compile → compilation succeeds (mechanism is valid)
3. Click Play → simulation runs, pendulum swings under gravity

### Dirty guard with templates
1. Open a project, make changes
2. Click a template card → dirty guard dialog shown
3. Cancel → stay on current project
4. Don't Save → template loads, previous changes discarded

## Done Looks Like
- 5 template cards on welcome screen (Empty, Simple Pendulum, Four-Bar, Slider-Crank, Double Pendulum)
- Clicking a template creates a new untitled project with the mechanism pre-loaded
- Template mechanism compiles and simulates correctly
- Templates are read-only — opening one never modifies the template file
- Template files bundled in Electron app resources
- `pnpm --filter @motionlab/frontend typecheck` passes

## What NOT to Build
- User-created templates (save as template) — future feature
- Template preview images/thumbnails — future enhancement
- "File > New from Template" menu item — future enhancement
- Online template library or sharing — future feature
- Template versioning or migration
- Parametric templates (template with user-adjustable parameters)
```

---

## Integration Verification

After all three prompts complete, verify the full project management flow:

1. **Fresh launch:** Welcome screen appears with logo, version, New/Open, empty recent list, template cards
2. **New Project:** Click "New Project" → name dialog → "TestProject" → blank canvas, title bar "TestProject — MotionLab"
3. **Import + dirty:** Import a STEP file → title bar "TestProject* — MotionLab"
4. **Save:** Ctrl+S → save dialog → save to disk → title bar "TestProject — MotionLab", autosave cleaned up
5. **Recent list:** Close and relaunch → "TestProject" appears in recent projects with timestamp
6. **Open from recent:** Click "TestProject" in recent list → project loads correctly
7. **Template:** Click "Simple Pendulum" template → dirty guard → Don't Save → pendulum loads, title "Simple Pendulum — MotionLab"
8. **Simulate template:** Compile → Play → pendulum swings
9. **Auto-save:** Make changes, wait 2+ minutes → `.autosave` file exists alongside project
10. **Crash recovery:** Force-kill app → relaunch → recovery dialog → Recover → project restored with changes
11. **File association:** Double-click .motionlab file in file manager → MotionLab opens that project
12. **Keyboard shortcuts:** Ctrl+N (new), Ctrl+O (open), Ctrl+S (save), Ctrl+Shift+S (save as) — all work with dirty guards
13. **Clean exit:** Close app normally → autosave deleted, no recovery dialog on next launch

## Future Work (out of scope)

- **User-created templates:** Save current project as a template, stored in userData
- **Template library:** Browse/download templates from an online repository
- **Project thumbnails:** Render viewport screenshot as thumbnail for recent projects and templates
- **Multi-window:** Open multiple projects in separate windows
- **Project versioning:** Undo/redo at the project level, version history
- **Cloud sync:** Sync projects across devices
- **Import/export:** Export to standard formats (URDF, SDF, MJCF)
- **Configurable auto-save interval:** User preference for auto-save frequency
