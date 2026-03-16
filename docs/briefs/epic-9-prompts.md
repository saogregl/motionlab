# Epic 9 — Parallel Agent Prompts

> **Status:** Not Started

Three prompts for MVP hardening, packaging, and product credibility pass. Prompts 9.1 and 9.2 can run in parallel. Prompt 9.3 depends on both.

**Governance:** Epics 5+ are under full governance — every boundary change needs an ADR, every protocol change needs seam tests, every architecture change needs doc updates.

## Shared Contract

| Interface | Owner | Consumer |
|-----------|-------|----------|
| Persistence edge case fixes | Prompt 1 (implements) | Prompt 3 (validates) |
| Packaged binary paths + extraResource | Prompt 2 (configures) | Prompt 3 (validates in packaged build) |
| Sample projects | Prompt 3 (creates) | Prompt 3 (regression validates) |

After all three are built, the integration test is: Full validation scenarios A-D work in a packaged desktop build. App installs, launches, and all four scenarios complete reliably.

---

## Prompt 1: Persistence Hardening + Error Recovery (parallel with 9.2)

```
# Epic 9 — Persistence Hardening and Error Recovery

You are hardening the save/load pipeline, handling edge cases, and adding recovery UX for missing or corrupted assets. This runs in parallel with Prompt 9.2 (packaging). This depends on Epics 1-8 being complete.

**Governance reminder:** Epics 5+ are under full governance. Protocol changes require seam tests. Boundary changes require an ADR. Update relevant subsystem docs.

## Read These First (in order)
- `docs/architecture/principles.md` — non-negotiable rules
- `docs/architecture/runtime-topology.md` — engine is authority for save/load
- `native/engine/AGENTS.md` — native boundary rules
- `apps/AGENTS.md` — Electron file dialog rules
- `docs/decisions/` — relevant ADRs

## What Exists Now

### Save/Load pipeline (from Epic 6)
- Engine handles SaveProject/LoadProject commands
- ProjectFile proto with Mechanism + ProjectMetadata
- Engine serializes/deserializes mechanism state to/from binary protobuf
- Frontend sends SaveProject/LoadProject commands, receives results
- Electron provides file dialogs (open/save) via IPC
- Asset cache with content hash validation stores tessellated mesh data

### `schemas/mechanism/mechanism.proto`
ProjectFile message containing Mechanism and ProjectMetadata. Body references AssetReference with content_hash, relative_path, original_filename.

### `native/engine/src/mechanism_state.cpp`
In-memory mechanism model. Handles serialization to/from ProjectFile proto.

### `native/engine/src/cad_import.cpp`
CadImporter class: imports STEP files via OCCT, tessellates, produces DisplayMesh, stores in asset cache keyed by content hash.

### `apps/desktop/src/main.ts`
Electron main process with IPC handlers for file dialogs. Engine supervisor.

### `packages/frontend/src/stores/mechanism.ts`
Zustand store with bodies, datums, joints. Updated via MechanismSnapshot events from the engine.

## What to Build

### 1. Missing asset recovery on project load

When the engine loads a project and a referenced asset (STEP file) cannot be found at its stored path:

**Engine side:**
- During LoadProject, check each body's AssetReference path
- If the file is missing AND the cached tessellation is also missing, include it in the LoadProjectResult as a missing asset
- Add a `repeated MissingAsset missing_assets` field to LoadProjectResult:
  ```protobuf
  message MissingAsset {
    ElementId body_id = 1;
    string body_name = 2;
    string expected_path = 3;
    string original_filename = 4;
  }
  ```

**Frontend side:**
- If LoadProjectResult contains missing assets, show a dialog listing them
- For each missing asset, offer:
  - **Relocate:** Open a file browser to locate the file at its new path. Send a RelocateAsset command to the engine.
  - **Skip:** Keep the body but show it as a placeholder (no mesh, just a bounding box or wireframe)
- Add a `RelocateAssetCommand { ElementId body_id, string new_path }` to the Command oneof
- Engine handles RelocateAsset: re-import from the new path, update the AssetReference, regenerate cache

### 2. Cache invalidation on load

When loading a project, verify each asset's content hash against the cached data:
- Read the source file (if present), compute its content hash
- If the hash differs from the stored hash (file was modified externally), re-import automatically
- Log a message: `[ENGINE] Asset re-imported: <filename> (content hash changed)`
- If the source file is present but the cache entry is missing, re-import from source

### 3. Invalid cache recovery

If cache files are corrupted or deleted:
- On startup or project load, validate cache entries
- If a cache entry fails to deserialize (corrupted protobuf), delete it and re-derive from the source asset
- If the source asset is also missing, mark the body as a placeholder (same as missing asset flow)
- Log warnings for each recovered/invalidated cache entry

### 4. Project file version field

Add `uint32 format_version = 10` to the ProjectFile message (use a high field number to avoid conflicts):

```protobuf
message ProjectFile {
  Mechanism mechanism = 1;
  ProjectMetadata metadata = 2;
  uint32 format_version = 10;  // NEW: currently 1
}
```

**Engine side:**
- Set `format_version = 1` when saving
- On load, check format_version:
  - If 0 (missing/unset): treat as version 1 (backwards compat with pre-versioned files)
  - If > current supported version: reject with clear error message ("Project file created by a newer version of MotionLab")
  - If < current version: run migration (skeleton for now — no actual migrations exist yet)

Create a migration skeleton:
```cpp
// migrations.h
namespace motionlab::engine {
  ProjectFile migrateProjectFile(ProjectFile&& file);
  // Currently a no-op — returns the file unchanged.
  // Future migrations will transform older formats here.
}
```

### 5. Dirty project tracking

**Frontend side:**
- Add `isDirty: boolean` to the mechanism store (or a dedicated project store)
- Set `isDirty = true` on any mechanism edit: import, datum CRUD, joint CRUD, rename
- Set `isDirty = false` after a successful SaveProject
- Display a dirty indicator in the title bar: "ProjectName *" (asterisk when dirty)

**Electron side:**
- On `before-quit` event, check if the project is dirty via IPC
- If dirty, show a native confirmation dialog:
  - "Unsaved Changes" / "Do you want to save changes to your project?"
  - Buttons: Save / Don't Save / Cancel
- Save: trigger SaveProject flow, then quit
- Don't Save: quit without saving
- Cancel: abort quit

Add IPC handler:
```typescript
ipcMain.handle('check-unsaved-changes', async () => {
  // Frontend calls this; main process shows native dialog
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    title: 'Unsaved Changes',
    message: 'Do you want to save changes to your project?',
  });
  return result.response; // 0=Save, 1=Don't Save, 2=Cancel
});
```

### 6. ID stability exhaustive test

Write a test that verifies ID stability across save/load cycles:
1. Create a mechanism with all element types (bodies, datums, joints)
2. Save the project
3. Load the project
4. Verify all element IDs match the originals (byte-for-byte comparison of UUIDs)
5. Save again
6. Load again
7. Verify all IDs still match

This proves that serialization/deserialization preserves identity. Run as a C++ test and/or a protocol-level integration test.

### 7. Project relocation test

Test the relocation flow:
1. Save a project to directory A
2. Move the project file to directory B
3. Open from directory B
4. Verify: if assets used relative paths, they may not resolve. Recovery UX should appear.
5. Relocate the missing assets via the recovery dialog
6. Verify the project loads fully after relocation

### 8. Empty mechanism edge case

Test saving and loading an empty mechanism:
- Create a new project (no bodies, no datums, no joints)
- Save it
- Close and reopen
- Verify the app doesn't crash, the mechanism store is empty, and the viewport is clean

### 9. Protocol changes — run codegen and add seam tests

For any new proto messages (MissingAsset, RelocateAssetCommand, format_version):
- Run `pnpm generate:proto`
- Add protocol seam tests for the new commands/events
- Write ADR if the changes affect the persistence contract boundary

## Architecture Constraints
- Engine remains authoritative for save/load. Frontend never directly writes mechanism data.
- Recovery UX should be informative, not panic-inducing. Clear messages, actionable options.
- File version migration is a skeleton — do not implement actual schema migrations (there are no schema changes to migrate yet). The infrastructure must exist so future versions can add migrations without refactoring.
- ID stability is a hard requirement — any save/load cycle that changes an element's ID is a bug.
- Dirty tracking must not produce false positives (marking clean state as dirty) or false negatives (missing an edit).

## Done Looks Like
- Save/load handles edge cases gracefully
- Missing assets show a recovery dialog with relocate/skip options
- Cache corruption auto-heals by re-deriving from source assets
- Dirty tracking shows asterisk in title bar, prompts on close
- ID stability verified across two full save/load cycles
- Empty mechanism saves and loads without crash
- Project relocation scenario works via recovery dialog
- Format version field is set on save, checked on load
- Protocol seam tests pass for new commands/events

## What NOT to Build
- Actual schema migrations (no schema changes to migrate yet — just the skeleton)
- Project format encryption
- Cloud sync or remote storage
- Auto-save
- Project templates
- Undo/redo for save/load operations
```

---

## Prompt 2: Packaging + Desktop Distribution (parallel with 9.1)

```
# Epic 9 — Packaging and Desktop Distribution

You are configuring the build pipeline to produce a distributable desktop application: native engine bundled with the Electron app, release builds, and packaging. This runs in parallel with Prompt 9.1 (persistence hardening). This depends on Epics 1-8 being complete.

**Governance reminder:** Epics 5+ are under full governance. Update relevant subsystem docs.

## Read These First (in order)
- `docs/architecture/principles.md` — non-negotiable rules
- `docs/architecture/runtime-topology.md` — engine + Electron topology
- `apps/AGENTS.md` — Electron Forge config, known quirks
- `native/engine/AGENTS.md` — native build rules

## What Exists Now

### `apps/desktop/forge.config.ts`
- `packagerConfig.asar: true` with `extraResource: []` (empty, with TODO comment)
- Forge VitePlugin handles main, preload, and renderer builds
- Makers configured: ZIP (mac/win), DEB (linux)

### `apps/desktop/src/engine-supervisor.ts` (or `main.ts`)
- `resolveEnginePath()` handles packaged mode: checks `process.resourcesPath` for the engine binary
- In dev mode: looks for the binary at a known relative path from the repo root
- Never tested in a packaged build

### `native/engine/CMakeLists.txt`
- Presets: dev and release
- Links: ixwebsocket, protobuf, opencascade, chrono
- Builds: static lib, executable (`motionlab-engine` / `motionlab-engine.exe`), tests

### `native/engine/CMakePresets.json`
- `dev` preset: Debug build type
- `release` preset: Release build type (if it exists — may need to be created)

### Root `package.json`
- `pnpm dev:desktop` — runs Forge dev mode
- No packaging script exists yet

## What to Build

### 1. Ensure release CMake preset exists

Verify or create a `release` preset in `native/engine/CMakePresets.json`:

```json
{
  "name": "release",
  "displayName": "Release",
  "inherits": "vcpkg-base",
  "binaryDir": "${sourceDir}/build/release",
  "cacheVariables": {
    "CMAKE_BUILD_TYPE": "Release"
  }
}
```

### 2. Build the engine in release mode

Verify the full release build works:

```bash
cd native/engine
cmake --preset release
cmake --build build/release --config Release
```

Verify the output binary exists:
- Windows: `native/engine/build/release/motionlab-engine.exe`
- macOS: `native/engine/build/release/motionlab-engine`
- Linux: `native/engine/build/release/motionlab-engine`

### 3. Configure extraResource in forge.config.ts

Update `forge.config.ts` to include the native engine binary:

```typescript
packagerConfig: {
  asar: true,
  extraResource: [
    // Native engine binary — bundled alongside the ASAR
    ...(process.platform === 'win32'
      ? ['../../native/engine/build/release/motionlab-engine.exe']
      : ['../../native/engine/build/release/motionlab-engine']),
  ],
},
```

Note: The path is relative to the `apps/desktop` directory. Adjust based on actual Forge resolution behavior. Test that the file is actually copied to the output.

If platform-conditional config is problematic, use a build script that copies the correct binary before packaging.

### 4. Verify resolveEnginePath in packaged build

Test that the engine binary is found correctly:
- In packaged mode: `path.join(process.resourcesPath, 'motionlab-engine.exe')` (Windows) or `path.join(process.resourcesPath, 'motionlab-engine')` (others)
- Verify the file exists at this path after packaging
- Verify the file is executable (permissions on macOS/Linux)

### 5. CSP verification in packaged build

Verify that WebSocket connections to localhost still work in the packaged build:
- CSP in index.html allows `ws://localhost:*`
- No CORS differences between dev and packaged mode
- The engine still binds to 127.0.0.1

### 6. Startup diagnostics

If the engine fails to start in the packaged build, show a native dialog with actionable information:

```typescript
if (!fs.existsSync(enginePath)) {
  dialog.showErrorBox(
    'Engine Not Found',
    `The native engine was not found at:\n${enginePath}\n\n` +
    `This may indicate a packaging error. Please reinstall the application.\n\n` +
    `Log file: ${logFilePath}`
  );
  app.quit();
}
```

If the engine starts but crashes immediately, show the last few lines of stderr.

### 7. Structured log capture

Write engine stdout/stderr and supervisor logs to a file:

```typescript
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const logDir = app.getPath('logs');
const logFile = path.join(logDir, 'motionlab.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

// Pipe engine stdout/stderr to the log file
engineProcess.stdout.on('data', (data) => {
  logStream.write(`[ENGINE stdout] ${data}`);
});
engineProcess.stderr.on('data', (data) => {
  logStream.write(`[ENGINE stderr] ${data}`);
});

// Also log supervisor events
function supervisorLog(msg: string) {
  const timestamp = new Date().toISOString();
  logStream.write(`[SUPERVISOR ${timestamp}] ${msg}\n`);
}
```

Log file management:
- Rotate or cap at 10MB (truncate the beginning if needed)
- New session appends to the same file with a session separator

### 8. Help menu — Show Logs

Add a menu item to access logs:

```typescript
{
  label: 'Help',
  submenu: [
    {
      label: 'Show Logs',
      click: () => {
        shell.openPath(path.join(app.getPath('logs'), 'motionlab.log'));
      },
    },
  ],
}
```

### 9. Engine binary size check

After building in release mode, measure the combined binary size:
- Run `ls -lh` on the engine binary
- Document the sizes of major dependencies: OCCT, Chrono, protobuf, ixwebsocket
- If the binary exceeds 100MB, investigate:
  - Strip debug symbols: `strip motionlab-engine` (Linux/macOS) or `/LTCG` + `/OPT:REF` (MSVC)
  - Static vs dynamic linking trade-offs
  - Document findings in a comment or brief

### 10. Test offline operation

Verify no network calls happen during any workflow:
- Disconnect network (or use a firewall rule)
- Launch the packaged app
- Import a STEP file, create datums/joints, simulate, save, load
- Verify everything works without network access
- Check that no DNS lookups or HTTP requests are attempted (inspect with Wireshark or network monitor if needed)

### 11. Build automation script

Add to root `package.json`:

```json
{
  "scripts": {
    "build:engine": "cd native/engine && cmake --preset release && cmake --build build/release --config Release",
    "package:desktop": "pnpm build:engine && pnpm --filter desktop package"
  }
}
```

The `package:desktop` script should:
1. Build the native engine in release mode
2. Run Electron Forge's package command
3. Output the distributable artifact

Document prerequisites (CMake, vcpkg, C++ compiler) in a comment or brief.

### 12. Installer considerations

For MVP, ZIP distribution is sufficient:
- Windows: ZIP maker (already configured)
- macOS: ZIP maker (already configured)
- Linux: DEB maker (already configured)

Document these for future enhancement:
- Windows: consider Squirrel or WiX for proper installer with Start Menu shortcut
- macOS: consider DMG maker for drag-to-Applications UX
- Auto-update: consider Electron's autoUpdater for future releases

Do NOT implement installers beyond ZIP/DEB for MVP — just document the path forward.

## Architecture Constraints
- Packaged build must use identical runtime topology as dev mode: same supervisor, same WebSocket, same protocol. No dev-only shortcuts that bypass the engine.
- The engine binary is an opaque resource bundled alongside the ASAR — it is NOT inside the ASAR.
- Log files must not contain sensitive data (no session tokens in log output).
- Offline operation is a hard requirement — no network calls during any workflow.

## Done Looks Like
- `pnpm package:desktop` produces a distributable app (ZIP on Windows)
- App launches on a clean machine (without dev tools installed)
- Engine starts from extraResource path in the packaged build
- All workflows work without network: import, model, simulate, save, load
- Startup errors show native dialogs with actionable messages
- Logs are written to `app.getPath('logs')/motionlab.log`
- Help > Show Logs opens the log file
- Engine binary size is documented
- Build automation script works end-to-end

## What NOT to Build
- Auto-update mechanism
- Code signing (requires certificates)
- Cross-compilation (build on the target platform for now)
- Windows installer (NSIS/Squirrel) — ZIP is sufficient for MVP
- macOS DMG — ZIP is sufficient for MVP
- CI/CD pipeline for packaging
- Telemetry or crash reporting
```

---

## Prompt 3: Product Credibility Pass + Regression Scenarios (after 9.1 + 9.2)

```
# Epic 9 — Product Credibility Pass and Regression Scenarios

You are performing the final quality pass: creating sample projects, running all validation scenarios, fixing UX papercuts, and updating documentation to match implementation. This depends on Prompts 9.1 and 9.2 being complete.

**Governance reminder:** Epics 5+ are under full governance. This prompt includes the final documentation pass — update all architecture and subsystem docs to reflect implemented reality.

## Read These First (in order)
- `docs/architecture/principles.md` — non-negotiable rules
- `docs/architecture/index.md` — architecture overview
- All `AGENTS.md` files — subsystem rules
- `docs/decisions/` — all ADRs
- All subsystem docs under `docs/architecture/` and `docs/domain/`

## What Exists Now

### Complete application (Epics 1-8 + Prompts 9.1-9.2)
- Native engine with OCCT import, Chrono simulation, WebSocket transport, save/load
- Frontend with AppShell, project tree, inspectors, simulation toolbar, chart panel, timeline
- Viewport with scene graph, picking, selection, simulation playback
- Protocol with full command/event set, binary transport
- Desktop packaging with engine bundled as extraResource
- Persistence hardening with recovery UX, dirty tracking, format versioning

### Validation Scenarios (from plan.md or architecture docs)
- **Scenario A:** Import STEP file, inspect mass properties
- **Scenario B:** Create datums, joints, simulate, see motion
- **Scenario C:** Save project, close, reopen, continue working
- **Scenario D:** Simulate, inspect traces, scrub timeline

## What to Build

### 1. Create sample projects

Create `samples/` directory at the repo root with 2-3 sample projects:

**`samples/simple-pendulum/`:**
- `simple-pendulum.motionlab` — project file
- `pendulum-arm.step` — single rectangular body STEP file
- Description: Ground body (fixed) + pendulum arm connected by a revolute joint. Demonstrates Scenarios A + B.

**`samples/four-bar-linkage/`:**
- `four-bar-linkage.motionlab` — project file
- `link-1.step`, `link-2.step`, `link-3.step`, `link-4.step` — four link bodies
- Description: Classic four-bar mechanism with 4 bodies + 4 revolute joints. Tests multi-body simulation and more complex joint topology.

For each sample:
- Include the source STEP files alongside the project file
- Create the project by running the app: import bodies, create datums, create joints, save
- Verify the project loads cleanly on a fresh app instance

If STEP files are not readily available, create simple box/cylinder shapes using a CAD tool or a programmatic STEP generator. The shapes don't need to be realistic — they need to be valid STEP files with solid bodies.

### 2. Run all 4 validation scenarios

Execute each scenario on each sample project and document results:

**Scenario A — Import + Inspect:**
1. Launch app
2. Import STEP file
3. Body appears in project tree and viewport
4. Select body, inspect mass properties in inspector
5. Verify mass, center of mass, inertia tensor are displayed

**Scenario B — Model + Simulate:**
1. Create datums on bodies (at joint locations)
2. Create joints connecting datums
3. Click Compile — verify success
4. Click Play — bodies move under gravity/constraints
5. Pause, Step, Reset all work
6. Keyboard shortcuts (Space, R) work

**Scenario C — Persist + Resume:**
1. After Scenario B, save the project
2. Close the app
3. Reopen the app, load the project
4. All bodies, datums, joints are restored
5. Continue editing (add another datum, save again)
6. Verify dirty tracking (asterisk in title bar)

**Scenario D — Simulate + Inspect Outputs:**
1. After loading a project, compile and run simulation
2. Select a joint
3. Chart panel shows position/velocity traces
4. Scrub timeline — viewport updates to historical poses
5. Chart shows vertical marker at scrub position
6. Inspector shows live values at scrub time

### 3. UX papercut fixes

During scenario testing, identify and fix common papercuts:

**Loading states:**
- Show spinner/progress during STEP import (can take seconds for complex files)
- Show spinner during compilation
- Show loading state during project load

**Error messages:**
- All error messages should be user-readable, not technical stack traces
- Import errors: "Could not read file: <filename>. Ensure it is a valid STEP file."
- Compilation errors: list which bodies/joints have issues by name
- Simulation errors: "Simulation diverged. Try reducing the timestep or checking joint configuration."

**Keyboard shortcuts:**
- Verify Space (Play/Pause) and R (Reset) work globally
- Verify they don't fire when typing in text fields (rename, etc.)
- Escape exits tool modes (return to select mode)

**Focus management:**
- Clicking the viewport captures focus for keyboard shortcuts
- Clicking a tree item or inspector field takes focus away from viewport
- Tab order is logical: tree → viewport → inspector

### 4. Graceful handling of unsupported cases

Test and handle these edge cases:

**STEP file with no solid bodies:**
- Import a STEP file containing only wireframe or surface geometry
- Should show a clear error: "No solid bodies found in <filename>. Only STEP files with solid geometry are supported."

**Mechanism with disconnected bodies:**
- Create bodies that are not connected by any joints
- Compile should show a warning (not error): "Bodies <name1>, <name2> are not connected to any joint and will fall freely."
- Simulation should still work (disconnected bodies fall under gravity)

**Simulation divergence:**
- Set up a mechanism likely to diverge (very stiff constraints, large timestep)
- Engine should detect divergence (NaN/Inf in body positions) and pause with an error
- Frontend shows: "Simulation diverged at t=X.XXs"
- Allow reset after divergence

### 5. Performance instrumentation

Add performance measurement and logging for key operations:

```
[PERF] Import: <filename> — 1.234s (tessellation: 0.890s)
[PERF] Compilation: 0.045s (3 bodies, 2 joints)
[PERF] Simulation step: avg 0.5ms, max 1.2ms (over 1000 steps)
[PERF] Frame delivery: avg 2.1ms latency (engine send → frontend receive)
```

Log to the engine's stdout (captured by Electron supervisor and written to log file). These are diagnostic only — not user-facing.

Measure:
- Import time per file
- Tessellation time (part of import)
- Compilation time
- Simulation step time (average and max over the run)
- Frame delivery latency (timestamp in SimulationFrame vs arrival time)

### 6. Protocol version mismatch detection

On handshake, if the engine and frontend have different PROTOCOL_VERSION:
- HandshakeAck returns `compatible = false`
- Frontend shows a clear error: "Protocol version mismatch: frontend v<X>, engine v<Y>. Please update both components."
- This prevents subtle bugs from mismatched builds

Verify this works by temporarily changing the protocol version in one side and testing.

### 7. Simulation reset reliability

Test that simulation state is fully cleaned up between runs:
1. Compile and run simulation
2. Reset
3. Compile and run again
4. Verify no state leaks: body positions start from initial poses, traces are cleared, step count resets to 0
5. Repeat 5 times — verify consistent behavior

### 8. Packaged build validation

Run all 4 validation scenarios in the PACKAGED build (not dev mode):
1. Build with `pnpm package:desktop`
2. Install/extract the packaged app
3. Run all scenarios
4. Verify identical behavior to dev mode
5. Verify logs are written to the correct location
6. Verify Help > Show Logs works

### 9. Final documentation pass

Update ALL architecture and subsystem docs to reflect the implemented reality:

**`docs/architecture/system-overview.md`** (or `index.md`):
- Complete system description covering all components
- Updated diagrams if applicable

**`docs/architecture/runtime-topology.md`:**
- Simulation thread architecture
- Frame streaming and backpressure
- Scrub flow
- Engine process lifecycle in packaged mode

**`docs/architecture/protocol-overview.md`:**
- Complete list of all commands and events
- Simulation lifecycle protocol
- Output channel protocol
- Scrub protocol

**`docs/architecture/results-architecture.md`:**
- Output channel system
- Trace streaming
- Channel naming convention
- Scrub and replay architecture

**All AGENTS.md files:**
- `apps/AGENTS.md` — packaging, log files, Help menu
- `packages/frontend/AGENTS.md` — simulation store, trace store, chart panel
- `packages/viewport/AGENTS.md` — simulation playback, updateBodyTransform
- `packages/protocol/AGENTS.md` — all transport helpers
- `native/engine/AGENTS.md` — Chrono integration, simulation runtime, output channels
- `docs/AGENTS.md` — updated doc inventory

**Known limitations document:**
Create `docs/known-limitations.md` listing:
- Features deferred past MVP (sensors, undo/redo, auto-update, etc.)
- Known performance limits (max bodies, max joints, trace buffer size)
- Platform-specific notes (tested on Windows, macOS/Linux untested)
- Any bugs found during regression that were deferred

### 10. README update

Update the root `README.md` (if it exists) or create a minimal one with:
- What MotionLab is (one paragraph)
- Prerequisites (Node.js, pnpm, CMake, vcpkg, C++ compiler)
- How to build and run (`pnpm install`, `pnpm dev:desktop`)
- How to package (`pnpm package:desktop`)
- Link to `docs/architecture/index.md` for architecture details
- Link to `samples/` for sample projects

## Architecture Constraints
- Regression scenarios should be runnable manually for MVP. Automated E2E testing (Playwright) is a stretch goal, not a requirement.
- Documentation must match implementation — no aspirational descriptions of unbuilt features.
- Sample projects must be committed and loadable by any developer who clones the repo and builds.
- Performance instrumentation is diagnostic (log-only), not user-facing UI.
- Known limitations must be honest — document what's missing, not just what's built.

## Done Looks Like
- 2-3 sample projects in `samples/` work end-to-end
- All 4 validation scenarios pass in both dev and packaged builds
- UX papercuts are fixed: loading states, error messages, keyboard shortcuts
- Edge cases handled gracefully: no-solid STEP, disconnected bodies, divergence
- Performance is measured and logged
- Protocol version mismatch shows clear error
- Simulation reset is reliable across multiple runs
- All architecture docs are updated to reflect reality
- Known limitations are documented
- Product feels like a serious alpha, not a demo
- **MVP is complete**

## What NOT to Build
- Automated E2E test suite (Playwright) — stretch goal, not MVP
- CI/CD pipeline for packaging
- Marketing materials or user documentation
- Video tutorials or guided tours
- Feature flags or A/B testing
- Analytics or telemetry
- Plugin system or extensibility API
```

---

## Integration Verification

After all three prompts complete, verify the full MVP:

1. **Sample projects:** `samples/` contains 2-3 working projects with STEP files
2. **Scenario A:** Import STEP, inspect mass properties
3. **Scenario B:** Create datums/joints, compile, simulate, see motion
4. **Scenario C:** Save, close, reopen, continue working
5. **Scenario D:** Simulate, inspect traces, scrub timeline
6. **Persistence edge cases:** Missing assets show recovery dialog, cache corruption auto-heals, dirty tracking works
7. **Packaged build:** `pnpm package:desktop` produces a working distributable
8. **Packaged scenarios:** All 4 scenarios pass in the packaged build
9. **Error handling:** Graceful messages for all error conditions
10. **Documentation:** All architecture docs match implementation, known limitations documented
