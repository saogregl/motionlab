# Epic 3 — Dedicated Results Route / Workspace

**Execution order: Depends on Epic 1 (floating shell). Independent of Epic 2 — can run in parallel with Epic 2.**
**Depends on: Epic 1 Phase 2 (floating layout mode in AppShell, `useUILayoutStore` extensions).**

---

## Mission

Create a dedicated **Results workspace** so build and results stop competing inside the same screen.
Results should become a distinct task context with its own layout, while reusing the same
floating-panel system from Epic 1.

---

## Product intent

Trying to make build, simulation, playback, plots, legends, and diagnostics coexist in one shell
damages both experiences. Results needs a **viewport + timeline + charts** layout where analysis is
the primary task, not an afterthought bolted onto the authoring screen.

---

## Current codebase state

### Workspace switching — there is none

MotionLab has **no router**. The app is a single-page Zustand state machine.
Navigation happens through store mutations, not URL changes.

| Fact | Detail |
|---|---|
| Router library | None (no React Router, TanStack Router, or custom) |
| Entry point | `packages/frontend/src/App.tsx` — single render tree |
| View switching | Conditional rendering on store state (e.g., `WelcomeScreen` when no bodies loaded) |
| `WorkspaceTabBar` | `packages/ui/src/components/shell/workspace-tab-bar.tsx` — **exists but is completely unwired in `App.tsx`** |
| `AppShell` tab bar slot | `tabBar` prop exists in `app-shell.tsx` — not used |

### Results UI today (inline in build shell)

| Component | File | Current location |
|---|---|---|
| `TimelinePanel` | `packages/frontend/src/components/TimelinePanel.tsx` | Renders inside `BottomDock` as a tab |
| `ChartPanel` | `packages/frontend/src/components/ChartPanel.tsx` | Tab content inside `TimelinePanel` — uses uPlot |
| `ChannelBrowser` | `packages/frontend/src/components/ChannelBrowser.tsx` | Left sidebar inside `ChartPanel` — hierarchical channel tree |
| `DiagnosticsPanel` | `packages/frontend/src/components/DiagnosticsPanel.tsx` | Tab content inside `TimelinePanel` |
| `SimulationMetadataSection` | `packages/frontend/src/components/SimulationMetadataSection.tsx` | Appended to entity inspectors during simulation |
| `TimelineTransport` | `packages/ui/src/components/primitives/timeline-transport.tsx` | Play/pause, step, loop, speed — headless primitive |
| `TimelineScrubber` | `packages/ui/src/components/primitives/timeline-scrubber.tsx` | Drag-to-seek scrubber bar — headless primitive |

### Simulation state stores

| Store | File | Key fields |
|---|---|---|
| `useSimulationStore` | `packages/frontend/src/stores/simulation.ts` | `state` (idle/compiling/running/paused/error), `simTime`, `maxSimTime`, `stepCount`, `channelDescriptors[]`, `structuredDiagnostics[]`, `loopEnabled` |
| `useTraceStore` | `packages/frontend/src/stores/traces.ts` | `traces: Map<channelId, StoreSample[]>`, `channels: Map<channelId, ChannelDescriptor>`, `activeChannels: Set<string>` — 60 s rolling window |
| `useSimulationSettingsStore` | `packages/frontend/src/stores/simulation-settings.ts` | Timestep, gravity, duration, solver config, contact settings |
| `useUILayoutStore` | `packages/frontend/src/stores/ui-layout.ts` | `bottomDockExpanded`, `bottomDockActiveTab` |

### State that must survive workspace transition

All Zustand stores persist across workspace switches (they are in-memory singletons, not route-scoped):

| State | Store | Survival |
|---|---|---|
| Mechanism definition | `useMechanismStore` | Always persists |
| Simulation state (time, running/paused) | `useSimulationStore` | Persists — key for results viewing |
| Trace data (channel samples) | `useTraceStore` | Persists — up to 60 s rolling window |
| Channel descriptors | `useSimulationStore.channelDescriptors` | Persists from compilation |
| Active channels (chart selection) | `useTraceStore.activeChannels` | Persists |
| Selection | `useSelectionStore` | Preserving is optional — could reset on workspace switch |
| Tool mode | `useToolModeStore` | Reset to `'select'` on entering Results |
| Camera / viewport | SceneGraphManager (imperative) | **Must be preserved** — same viewport instance |

---

## Implementation scope

### A. Workspace switching system

**P3-A-1: Add workspace state to `useUILayoutStore`**
- File: `packages/frontend/src/stores/ui-layout.ts`
- Add: `activeWorkspace: 'build' | 'results'` (default `'build'`)
- Add: `setActiveWorkspace(workspace: 'build' | 'results'): void`

**P3-A-2: Wire `WorkspaceTabBar`**
- File: `packages/frontend/src/App.tsx`
- Import `WorkspaceTabBar` from `@motionlab/ui`
- Pass to `AppShell`'s `tabBar` slot
- Two tabs: "Build" (default) and "Results"
- Tab click calls `setActiveWorkspace()`
- Active tab highlighted with accent color

**P3-A-3: Conditional workspace rendering**
- File: `packages/frontend/src/App.tsx`
- When `activeWorkspace === 'build'`: render existing build shell (left panel + viewport + right panel)
- When `activeWorkspace === 'results'`: render `ResultsWorkspace` component
- Both share the same `TopBar` and `StatusBar`
- Both share the same viewport instance (R3F canvas) — it must not unmount/remount

### B. Results workspace layout

**P3-B-1: Create `ResultsWorkspace` component**
- File: `packages/frontend/src/components/ResultsWorkspace.tsx`
- Uses the same floating-panel system from Epic 1
- Layout:
  - **Viewport** (full-bleed, same as build — reuses the R3F canvas without remounting)
  - **Left floating panel:** Channel browser + run info
  - **Bottom floating card:** Timeline transport + scrubber (larger than in build mode)
  - **Right floating panel:** Charts (dedicated, full-height chart area)
  - **No entity inspector** in results mode (viewport-only inspection via hover/click)
- Panels use `FloatingPanel` from Epic 1

**P3-B-2: Results left panel — Channel browser**
- Reuse `ChannelBrowser` from `packages/frontend/src/components/ChannelBrowser.tsx`
- Wrap in a `FloatingPanel side="left"`
- Add a header: "Channels" or "Output"
- Add run metadata section: duration, step count, solver, timestep (from `SimulationMetadataSection`)

**P3-B-3: Results bottom panel — Timeline**
- Reuse `TimelineTransport` and `TimelineScrubber` primitives
- Make the timeline more prominent in results mode:
  - Wider scrubber (not squeezed into a small bottom dock tab)
  - Time readout always visible
  - Loop and speed controls always visible
- Wrap in a floating card at bottom center

**P3-B-4: Results right panel — Charts**
- Reuse `ChartPanel` from `packages/frontend/src/components/ChartPanel.tsx`
- Remove the built-in channel browser sidebar (it's now in the left panel)
- Wrap in `FloatingPanel side="right"`
- Full-height chart area with legend
- `DiagnosticsPanel` can be a tab or collapsible section within this panel

### C. Navigation triggers

**P3-C-1: Auto-switch to Results on simulation play**
- When `sim.play` is executed and compilation succeeds, automatically switch to `'results'` workspace
- File: `packages/frontend/src/commands/definitions/simulate-commands.ts`
- After `sendSimulationControl(SimulationAction.PLAY)` succeeds, call `setActiveWorkspace('results')`
- Only if `activeWorkspace === 'build'` (don't re-trigger if already in results)

**P3-C-2: Manual switch back to Build**
- Click "Build" tab in `WorkspaceTabBar`
- Keyboard shortcut: `Ctrl+1` (Build), `Ctrl+2` (Results) — add to `view-commands.ts`
- Simulation keeps running in background when switching back to build

**P3-C-3: Reset behavior**
- `sim.reset` command: switch back to `'build'` workspace automatically
- Clear trace data, reset time to 0
- Viewport returns to authored poses

### D. Viewport sharing

**P3-D-1: Single viewport instance**
- The R3F `Viewport` canvas must **not** unmount when switching workspaces
- Both `BuildWorkspace` and `ResultsWorkspace` share the same `ViewportOverlay` component
- The viewport is rendered once at the top level (in `App.tsx` or `AppShell`)
- Workspace components render their panels around/above it

**P3-D-2: Viewport behavior in Results mode**
- Camera controls (orbit, pan, zoom) remain active
- Entity picking shows hover highlights but does **not** open the build inspector
- Instead, picking could show a tooltip with entity name + current sim values
- Transform gizmos are disabled in results mode (`gizmoMode: 'off'`)

---

## Task dependency graph

```
Epic 1 Phase 2 (complete)
  │
  ├─── P3-A-1: Workspace state in store ──┐
  ├─── P3-A-2: Wire WorkspaceTabBar ──────┤ (A-1 must complete first)
  └─── P3-A-3: Conditional rendering ─────┘ (A-1, A-2 must complete first)
       │
       ├─── P3-B-1: ResultsWorkspace component ──┐
       ├─── P3-B-2: Channel browser panel ────────┤ (all B parallel)
       ├─── P3-B-3: Timeline panel ───────────────┤
       └─── P3-B-4: Charts panel ─────────────────┘
            │
            ├─── P3-C-1: Auto-switch on play (after B-1)
            ├─── P3-C-2: Manual switch shortcuts (after A-2)
            ├─── P3-C-3: Reset behavior (after C-1)
            │
            └─── P3-D-1: Viewport sharing (parallel with B)
                 └─── P3-D-2: Viewport results behavior (after D-1)
```

**Key parallel opportunity:** All B tasks (results panels) can run in parallel once A-3 provides the workspace shell. D-1 (viewport sharing) is independent of the panel work.

---

## Acceptance criteria

- [ ] A "Build" / "Results" tab bar appears at the bottom of the shell
- [ ] Clicking "Results" switches to the results workspace layout
- [ ] Clicking "Build" returns to the build workspace with all state intact
- [ ] `Ctrl+1` / `Ctrl+2` switches workspaces via keyboard
- [ ] Running a simulation auto-switches to Results workspace
- [ ] `sim.reset` auto-switches back to Build workspace
- [ ] Results workspace shows: channel browser (left), charts (right), timeline (bottom), viewport (full-bleed)
- [ ] The R3F viewport does **not** remount on workspace switch (no flash, no state loss)
- [ ] Camera position and orbit state survive workspace transitions
- [ ] Trace data (channel samples) remains available after switching back to Build and returning to Results
- [ ] Build workspace no longer shows the charts/timeline bottom dock (moved to Results)
- [ ] Diagnostics remain accessible (either in Results or as a global panel)
- [ ] All floating panels in Results use the same visual system as Build (Epic 1 primitives)

---

## Out of scope

- Multi-run comparison (future — requires persistent run storage)
- Run history / study management UI
- Second Electron window for results
- Full widget layout editor (drag-to-arrange charts)
- Deep solver/settings redesign
- Persistent run artifacts (Epic 9 in architecture docs)

---

## File checklist

| Action | File |
|---|---|
| **Create** | `packages/frontend/src/components/ResultsWorkspace.tsx` |
| **Create** | `packages/frontend/src/components/BuildWorkspace.tsx` (refactored from current App.tsx build layout) |
| **Modify** | `packages/frontend/src/App.tsx` (workspace switching, viewport sharing, tab bar wiring) |
| **Modify** | `packages/frontend/src/stores/ui-layout.ts` (`activeWorkspace` field) |
| **Modify** | `packages/ui/src/components/shell/app-shell.tsx` (wire `tabBar` slot) |
| **Modify** | `packages/frontend/src/components/ChartPanel.tsx` (extract channel browser sidebar) |
| **Modify** | `packages/frontend/src/components/TimelinePanel.tsx` (results-specific layout variant) |
| **Modify** | `packages/frontend/src/commands/definitions/simulate-commands.ts` (auto-switch on play/reset) |
| **Modify** | `packages/frontend/src/commands/definitions/view-commands.ts` (Ctrl+1/2 shortcuts) |
| **Modify** | `packages/frontend/src/stores/tool-mode.ts` (reset to select on entering Results) |
