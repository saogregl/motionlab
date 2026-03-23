# Epic 18 — Trace Visualization & Results Pipeline

> **Status:** Not started
> **Dependencies:** Epic 7 (Simulation Runtime) -- complete. Epic 8 (Output Channels -- Engine Side) -- ~40% complete (engine-side done, frontend partially wired).
> **Packages affected:** `packages/frontend/`, `packages/protocol/`, `packages/ui/`
>
> **What already exists (from Epics 7-8):**
> - Engine streams `SimulationTrace` events with per-channel `TimeSample` batches (~6/sec round-robin)
> - Engine sends `OutputChannelDescriptor` list with `CompilationResultEvent`
> - Engine-side `SimulationRingBuffer` with 60-second retention, O(log n) time lookup
> - `ScrubCommand` handler pauses sim, queries ring buffer, sends windowed trace data
> - `connection.ts` handles `compilationResult.channels` -> `useSimulationStore.setCompilationResult()` + `useTraceStore.setChannels()`
> - `connection.ts` handles `simulationTrace` events -> `useTraceStore.addSamples()`
> - `traces.ts` Zustand store with `channels`, `traces`, `activeChannels`, 60-second rolling buffer
> - `ChartPanel.tsx` with uPlot integration: selection-linked channel activation, imperative data pump via RAF, scrub marker plugin, ResizeObserver, channel legend with toggle
> - `TimelinePanel.tsx` with `BottomDock` tabs (Timeline, Charts, Diagnostics), `TimelineTransport` controls, `TimelineScrubber` with throttled seek, playback speed, loop toggle
> - `JointInspector.tsx` shows live position/velocity from trace store during simulation (binary search nearest sample)
> - `SimulationMetadataSection.tsx` shows duration, step count, timestep, solver, frame rate
> - `sendScrub()` and `sendSimulationControl()` wired in connection.ts
>
> **What's NOT done (this epic):**
> - No CSV export or file-based results output
> - No spark-line mini-charts in inspector rows
> - No results summary (min/max/final values) after simulation completes
> - No multi-run session history or run comparison overlays
> - No chart click-to-scrub (clicking chart time to scrub viewport)
> - No chart zoom/pan interactions (cursor drag disabled)
> - No channel selector tree/panel (channels auto-activate from selection only)
> - Chart Y-axis label is generic "Value" -- not per-channel unit
>
> **Governance note:** Epics 5+ are under full governance -- every boundary or contract change requires an ADR, every protocol/schema change requires seam tests, every architecture change requires doc updates.

Three prompts. Prompt 1 is a BLOCKER. Prompts 2 and 3 can run in parallel after Prompt 1 lands.

## Motivation

The engine already generates and streams all the simulation data -- output channel descriptors, per-channel trace batches, scrub responses -- but the frontend experience is incomplete. The simulation *runs*, but the user cannot fully *use* the results.

Specifically:
- **Chart interaction is read-only.** Users cannot click a point on the chart to scrub the viewport to that time, zoom into a region of interest, or pan the time axis. The chart is a passive display, not an interactive analysis tool.
- **No channel browser.** Channel activation is coupled to entity selection. If the user wants to see reaction forces on three joints simultaneously, they cannot -- there is no dedicated panel to browse and toggle channels independently of selection.
- **No results export.** There is no way to get data out of MotionLab. Engineers need CSV files for reports, validation against hand calculations, and comparison with other tools.
- **No results summary.** After simulation completes, there is no at-a-glance summary of min/max/final values per channel. The user must visually scan the chart.
- **No session history.** Every reset erases all trace data. Users cannot compare the current run against a previous run with different parameters.
- **No inline spark-lines.** Inspector panels show a single numeric value but no recent-history context. A tiny inline chart next to "Position: 1.234 rad" would convey trend and stability at a glance.

This epic completes the results pipeline that Epic 8 started, turning MotionLab from a tool that simulates into a tool that *analyzes*.

## Shared Contract

| Interface | Owner | Consumer |
|-----------|-------|----------|
| Chart interaction events (click-to-scrub, zoom, pan) | Prompt 1 (chart component) | Prompt 1 (connection/scrub), existing TimelinePanel |
| Channel browser panel + `useTraceStore.setActiveChannels()` | Prompt 1 (creates panel) | ChartPanel (reads `activeChannels`) |
| `useTraceStore` extended API (per-channel stats, session runs) | Prompt 1 (extends store) | Prompt 2 (spark-lines read), Prompt 3 (export reads, summary reads) |
| `SparkLine` UI component | Prompt 2 (creates in `@motionlab/ui`) | Prompt 2 (inspector uses) |
| CSV export function | Prompt 3 (implements) | Prompt 3 (toolbar/menu wires) |
| Session run history in trace store | Prompt 3 (extends store) | Prompt 1 (chart reads for overlay), Prompt 3 (summary reads) |

Integration test: Import a mechanism with two revolute joints. Compile and simulate. Open channel browser, activate position + reaction force for both joints. Chart shows 4 series with interactive zoom. Click a chart point -- viewport scrubs to that time. Export CSV. Reset, change a parameter, simulate again. Switch between runs in chart view. Compare overlay shows both runs.

---

## Prompt 1: Interactive Chart & Channel Browser

```
# Epic 18 -- Interactive Chart & Channel Browser

You are upgrading the chart component from a passive display to an interactive analysis tool, and adding a channel browser panel for independent channel selection. This builds on the existing uPlot integration in ChartPanel.tsx and the trace store pipeline.

**Governance reminder:** Epics 5+ are under full governance. Update relevant subsystem docs when the epic completes.

## Read These First (in order)
- `docs/architecture/principles.md` -- React is NOT the hot path
- `packages/frontend/AGENTS.md` -- frontend owns workbench UX, Zustand for state
- `docs/architecture/results-architecture.md` -- output channel concepts
- `docs/decisions/` -- relevant ADRs (output channels from Epic 8)
- `packages/ui/AGENTS.md` -- shared component rules

## What Exists Now

### `packages/frontend/src/components/ChartPanel.tsx`
uPlot-based time-series chart. `buildAlignedData()` merges timestamps from active channels into `uPlot.AlignedData`. `scrubMarkerPlugin()` draws a dashed vertical line at current `simTime`. Selection-linked channel activation via `useEffect` on `selectedIds`. Imperative data pump: `useTraceStore.subscribe()` -> `requestAnimationFrame` -> `uplot.setData()`. `ResizeObserver` for container resize. Channel legend below chart with color swatches and toggle buttons. Cursor drag is disabled: `cursor: { drag: { x: false, y: false } }`.

### `packages/frontend/src/stores/traces.ts`
Zustand store: `channels` (Map of descriptors), `traces` (Map of channel_id -> StoreSample[]), `activeChannels` (Set). `addSamples()` appends and trims to 60-second window. `setActiveChannels()` replaces entire set. `toggleChannel()` toggles one channel.

### `packages/frontend/src/stores/simulation.ts`
`channelDescriptors: ChannelDescriptor[]` populated from `CompilationResultEvent`.

### `packages/frontend/src/components/TimelinePanel.tsx`
`BottomDock` with tabs: Timeline (transport + scrubber), Charts (ChartPanel or empty state), Diagnostics. `throttledSeek` sends `ScrubCommand` at <= 30/sec. `handlePlayPause`, `handleStepForward`, `handleSkipBack`, `handleSpeedChange`, `handleLoopToggle`.

### `packages/frontend/src/engine/connection.ts`
`sendScrub(time)` sends `ScrubCommand`. `compilationResult` handler stores channels in both `useSimulationStore` and `useTraceStore`. `simulationTrace` handler routes samples to `useTraceStore.addSamples()`.

### `packages/protocol/src/transport.ts`
`createScrubCommand(time, sequenceId?)` builds binary command envelope.

## What to Build

### 1. Enable chart zoom and pan

Update `ChartPanel.tsx` uPlot options to enable interactive zoom and pan:

```typescript
cursor: {
  drag: {
    x: true,   // enable X-axis drag-to-zoom
    y: true,   // enable Y-axis drag-to-zoom
  },
},
```

Add zoom reset: double-click on chart resets to auto-scale (uPlot supports this natively via `scales.x.auto` and `scales.y.auto` set back to `true`).

Add a "Reset Zoom" button above the chart that calls:
```typescript
uplotRef.current?.setScale('x', { min: autoMin, max: autoMax });
uplotRef.current?.setScale('y', { min: autoMin, max: autoMax });
```

### 2. Chart click-to-scrub

When the user clicks on the chart (not drags), scrub the viewport to the clicked time:

```typescript
// In buildOpts, add a setCursor hook:
hooks: {
  setCursor: [
    (u: uPlot) => {
      // Only on click (mouseup without drag)
      const time = u.posToVal(u.cursor.left!, 'x');
      if (isFinite(time) && time >= 0) {
        sendScrub(time);
      }
    },
  ],
},
```

Distinguish click from drag: track `mousedown` position, only fire scrub if the mouse moved less than 3px. Use a uPlot plugin or a canvas overlay event listener.

When scrubbing via chart click:
- Auto-pause if simulation is running (same behavior as timeline scrubber)
- Update the scrub marker position immediately for visual responsiveness
- The engine responds with a historical `SimulationFrame` that updates body poses via the existing hot-path handler

### 3. Y-axis unit labels

When all active channels share the same unit, display that unit on the Y-axis label:

```typescript
const units = new Set(activeIds.map(id => channelMap.get(id)?.unit).filter(Boolean));
const yLabel = units.size === 1 ? `Value (${[...units][0]})` : 'Value';
```

When channels have mixed units (e.g., rad and rad/s), keep the generic "Value" label but add unit info to each series label in the legend: "Revolute1 Position (rad)".

### 4. Create channel browser panel

Create `packages/frontend/src/components/ChannelBrowser.tsx`:

A tree-structured panel listing all available output channels grouped by entity:

```
Joint: Revolute1
  ├── Position (rad)
  ├── Velocity (rad/s)
  ├── Reaction Force (N)
  └── Reaction Torque (Nm)
Joint: Prismatic1
  ├── Position (m)
  ├── Velocity (m/s)
  ├── Reaction Force (N)
  └── Reaction Torque (Nm)
```

Channel browser features:
- Read channel descriptors from `useSimulationStore.channelDescriptors`
- Group channels by entity: parse `channel_id` format `<entity_type>/<entity_id>/<measurement>` to extract entity type and ID
- Resolve entity name from `useMechanismStore` (joints, loads, actuators)
- Each channel row has a checkbox to toggle it in `useTraceStore.activeChannels`
- Active channels show their assigned chart color swatch
- "Select All" / "Deselect All" buttons per entity group
- Search/filter input at top to filter channels by name

### 5. Wire channel browser into TimelinePanel

Add the channel browser as a sidebar or collapsible panel within the Charts tab:

```typescript
{activeTab === 'charts' && channelDescriptors.length > 0 && (
  <div className="flex h-full">
    <ChannelBrowser className="w-48 shrink-0 border-e border-neutral-700" />
    <ChartPanel className="min-w-0 flex-1" />
  </div>
)}
```

The channel browser replaces the current selection-only channel activation as the primary channel picker. Selection-linked activation remains as a convenience shortcut: selecting a joint in the tree still auto-activates its position + velocity channels, but the user can modify the active set via the browser.

### 6. Multi-axis support

When active channels have different units (e.g., position in rad and force in N), render them on separate Y-axes:

```typescript
// Group channels by unit
const unitGroups = groupBy(activeIds, id => channelMap.get(id)?.unit ?? '');

// Assign Y-axis per unit group
// uPlot supports multiple Y scales: 'y', 'y2', etc.
```

uPlot supports up to ~4 Y-axes. Assign one axis per distinct unit. Series with the same unit share an axis. Axis labels show the unit.

If there are more than 3 distinct units, fall back to a single auto-scaled axis with unit labels in the legend only.

### 7. Chart toolbar

Add a small toolbar above the chart surface:

```
[Reset Zoom] [Auto-scale Y] [Show Cursor Values] | Channels: 4 active
```

- **Reset Zoom**: resets X and Y scales to auto
- **Auto-scale Y**: toggles between auto-scale and fixed Y range
- **Show Cursor Values**: toggles the crosshair value readout tooltip
- **Channel count**: shows how many channels are active

Use existing `@motionlab/ui` button primitives. Keep the toolbar minimal -- 28px height.

## Architecture Constraints
- Chart interactions (zoom, pan, click-to-scrub) use uPlot's native event system, not React synthetic events
- Click-to-scrub sends `ScrubCommand` through the same `sendScrub()` path as the timeline scrubber
- Channel browser reads from `useSimulationStore.channelDescriptors` (metadata) and writes to `useTraceStore.activeChannels` (chart state)
- Multi-axis assignment is computed in `buildOpts()`, not stored in state
- Do not add heavy dependencies -- uPlot is already integrated and handles zoom/pan natively
- Channel browser must handle 50+ channels without performance issues (mechanism with 10+ joints)

## Done Looks Like
- Chart supports drag-to-zoom on both axes, double-click to reset
- Clicking a time on the chart scrubs the viewport to that time
- Y-axis shows correct unit labels (single unit) or per-series labels (mixed units)
- Channel browser shows all available channels grouped by entity with toggle checkboxes
- Selecting a joint still auto-activates its channels (backward compatible)
- User can manually add/remove channels via the browser independently of selection
- Multi-axis rendering works when channels have different units
- Chart toolbar provides zoom reset and auto-scale controls
- `pnpm --filter @motionlab/frontend typecheck` passes
- `pnpm --filter @motionlab/frontend lint` passes

## What NOT to Build
- CSV export (that's Prompt 3)
- Spark-line mini-charts in inspectors (that's Prompt 2)
- Results summary / statistics (that's Prompt 3)
- Multi-run comparison overlays (that's Prompt 3)
- Chart screenshot/image export
- Custom chart color themes
- Chart annotations or markers
```

---

## Prompt 2: Inspector Spark-Lines & Live Enrichment

```
# Epic 18 -- Inspector Spark-Lines and Live Value Enrichment

You are adding inline spark-line mini-charts and enriched live value displays to the inspector panels. During simulation, each numeric property row (position, velocity, reaction force) will show a tiny chart of recent history alongside the current value, giving engineers instant visual context for trend and stability.

**Governance reminder:** Epics 5+ are under full governance. Update relevant subsystem docs when the epic completes.

## Read These First (in order)
- `docs/architecture/principles.md` -- React is NOT the hot path
- `packages/frontend/AGENTS.md` -- frontend owns workbench UX
- `packages/ui/AGENTS.md` -- shared component rules, Tailwind v4 notes
- `docs/architecture/results-architecture.md` -- output channel concepts

## What Exists Now

### `packages/frontend/src/components/JointInspector.tsx`
Shows joint identity, connection, limits. When simulating (`isSimulating`), renders a "Simulation Values" section with live position and velocity from the trace store. Uses `nearestSample()` (binary search) to find the closest sample to `simTime`. Displays value with `formatEngValue()` and unit from channel descriptor.

### `packages/frontend/src/components/BodyInspector.tsx`
Shows body identity, mass properties, pose. During simulation, shows live pose from `getBodyPose()` (body-poses store updated on each `SimulationFrame`). No trace store integration -- body pose comes from frame data, not output channels.

### `packages/frontend/src/stores/traces.ts`
`traces: Map<string, StoreSample[]>` with `StoreSample { time, value, vec? }`. Rolling 60-second buffer. `addSamples()` appends + trims.

### `packages/frontend/src/stores/simulation.ts`
`simTime`, `simState`, `channelDescriptors`, `stepCount`, `maxSimTime`.

### `packages/ui/src/components/primitives/property-row.tsx`
`PropertyRow` component with label, optional unit, optional `numeric` flag. Children render in the value slot.

### `packages/ui/src/components/engineering/vec3-display.tsx`
`Vec3Display` for {x, y, z} values with formatting.

### `packages/frontend/src/components/SimulationMetadataSection.tsx`
Shows duration, step count, timestep, solver type, frame rate. Frame rate uses `getMeasuredFps()` which is a snapshot, not reactive.

## What to Build

### 1. Create SparkLine component in @motionlab/ui

Create `packages/ui/src/components/engineering/spark-line.tsx`:

A tiny inline chart (~80px wide, 20px tall) showing recent time-series history:

```typescript
interface SparkLineProps {
  /** Array of [time, value] pairs, assumed sorted by time */
  data: [number, number][];
  /** Width in pixels (default: 80) */
  width?: number;
  /** Height in pixels (default: 20) */
  height?: number;
  /** Line color (default: currentColor) */
  color?: string;
  /** Optional: highlight the last point with a dot */
  showEndpoint?: boolean;
  /** Optional: className for the container */
  className?: string;
}
```

Implementation:
- Use a `<canvas>` element for performance (not SVG -- these update at ~6Hz during simulation)
- Draw a simple polyline path scaled to fit the canvas
- Auto-scale Y-axis to the data range with 10% padding
- X-axis spans the full data time range
- Optional endpoint dot (small circle at the last data point)
- Render via `useEffect` + `canvas.getContext('2d')` -- no external library needed
- Handle empty data gracefully (render nothing or a flat line)
- Use `devicePixelRatio` for crisp rendering on high-DPI displays

Export from `packages/ui/src/index.ts`.

### 2. Add spark-lines to JointInspector

Enhance the "Simulation Values" section in `JointInspector.tsx`:

```typescript
{posVal !== undefined && (
  <PropertyRow label="Position" unit={posChannel?.unit ?? ''} numeric>
    <div className="flex items-center gap-1.5">
      <SparkLine
        data={recentSamples(posSamples, simTime, 5)} // last 5 seconds
        width={64}
        height={16}
        color="var(--color-accent)"
        showEndpoint
      />
      <span className="font-[family-name:var(--font-mono)] tabular-nums">
        {formatEngValue(posVal.value)}
      </span>
    </div>
  </PropertyRow>
)}
```

Create a helper function `recentSamples()`:
```typescript
function recentSamples(
  samples: StoreSample[] | undefined,
  currentTime: number,
  windowSeconds: number,
): [number, number][] {
  if (!samples || samples.length === 0) return [];
  const cutoff = currentTime - windowSeconds;
  // Binary search for start index
  // Return [time, value] pairs within window
}
```

Add spark-lines for:
- Position (scalar)
- Velocity (scalar)
- Reaction force magnitude (vec3 -> magnitude, already computed in connection.ts)
- Reaction torque magnitude (vec3 -> magnitude)

### 3. Add spark-lines for reaction force/torque

The JointInspector currently only shows position and velocity. Extend it to also show reaction force and reaction torque channels:

```typescript
const forceId = `joint/${jointId}/reaction_force`;
const torqueId = `joint/${jointId}/reaction_torque`;
const forceSamples = traces.get(forceId);
const torqueSamples = traces.get(torqueId);
const forceChannel = channels.get(forceId);
const torqueChannel = channels.get(torqueId);
const forceVal = forceSamples ? nearestSample(forceSamples, simTime) : undefined;
const torqueVal = torqueSamples ? nearestSample(torqueSamples, simTime) : undefined;
```

Show these as additional rows in the "Simulation Values" section, each with a spark-line. For Vec3 channels, display the magnitude in the main readout and optionally show the component values (x, y, z) in a collapsible sub-row.

### 4. Enhance SimulationMetadataSection

Make the simulation metadata section more informative:

- **Frame rate**: make it reactive. Create a Zustand atom or use `useSyncExternalStore` to subscribe to the FPS counter instead of calling `getMeasuredFps()` which returns a stale snapshot.
- **Average step time**: compute from `simTime / stepCount` when `stepCount > 0`.
- **Trace channels**: show count of active channels (e.g., "8 channels streaming").
- **Buffer usage**: show how many seconds of trace data are retained (e.g., "42s / 60s buffered").

### 5. Add live pose readout to BodyInspector during simulation

The BodyInspector already shows live position/orientation during simulation via `getBodyPose()`. Enhance it:

- Show position delta from rest pose: `delta = livePose.position - body.pose.position`
- Format with engineering notation via `formatEngValue()`
- Add a small label "(live)" next to the pose section header during simulation

### 6. Throttle inspector updates during simulation

Inspector spark-lines and values update when `simTime` changes in the simulation store. The simulation store fires `setSimState()` on every `SimulationFrame` (~60fps), but the inspector should not re-render at 60fps.

Implement a throttled selector:

```typescript
// Create a throttled version of simTime that updates at most every 150ms
function useThrottledSimTime(): number {
  const simTime = useSimulationStore((s) => s.simTime);
  const [throttled, setThrottled] = useState(simTime);

  useEffect(() => {
    const id = setInterval(() => {
      setThrottled(useSimulationStore.getState().simTime);
    }, 150);
    return () => clearInterval(id);
  }, []);

  return throttled;
}
```

Use this throttled time for:
- Spark-line data window computation
- `nearestSample()` lookups
- SimulationMetadataSection updates

This limits inspector re-renders to ~6-7Hz, matching the trace data arrival rate.

## Architecture Constraints
- SparkLine renders to canvas, not SVG or DOM elements -- it is a rendering primitive, not a React tree
- SparkLine is a `@motionlab/ui` component, not a `@motionlab/frontend` component -- it has no knowledge of stores or protocol
- Inspector updates are throttled to ~6-7Hz during simulation, not coupled to the 60fps frame loop
- The `recentSamples()` helper uses binary search for efficiency (trace arrays can have thousands of entries)
- Do not add any new dependencies -- canvas 2D API is sufficient for spark-lines

## Done Looks Like
- SparkLine component renders a tiny canvas-based time-series chart
- JointInspector shows spark-lines for position, velocity, reaction force, and reaction torque during simulation
- Spark-lines update at ~6-7Hz (matching trace data frequency)
- SimulationMetadataSection shows reactive frame rate, average step time, channel count, buffer usage
- BodyInspector shows position delta from rest pose during simulation
- Inspector re-renders are throttled and do not impact viewport performance
- SparkLine handles empty data, single-point data, and normal data gracefully
- `pnpm --filter @motionlab/ui typecheck` passes
- `pnpm --filter @motionlab/frontend typecheck` passes
- `pnpm --filter @motionlab/frontend lint` passes

## What NOT to Build
- Full chart component (that's ChartPanel, already exists and enhanced by Prompt 1)
- CSV export (that's Prompt 3)
- Results summary statistics (that's Prompt 3)
- Multi-run comparison (that's Prompt 3)
- Load or actuator inspectors (not yet implemented -- defer to when those inspectors exist)
- Spark-line interactions (hover, click, zoom) -- they are read-only visual indicators
```

---

## Prompt 3: Results Export, Summary & Session History

```
# Epic 18 -- Results Export, Summary Statistics & Session History

You are building the results output pipeline: CSV export, post-simulation summary statistics, and multi-run session history with comparison overlays. This turns MotionLab's simulation output from ephemeral runtime data into persistent, exportable, comparable results.

**Governance reminder:** Epics 5+ are under full governance. Update relevant subsystem docs when the epic completes.

## Read These First (in order)
- `docs/architecture/principles.md` -- simulation runs are immutable artifacts
- `packages/frontend/AGENTS.md` -- frontend owns workbench UX, Zustand for state
- `docs/architecture/results-architecture.md` -- output channel concepts
- `docs/decisions/` -- relevant ADRs
- `apps/AGENTS.md` -- Electron is a shell and supervisor

## What Exists Now

### `packages/frontend/src/stores/traces.ts`
`channels: Map<string, ChannelDescriptor>`, `traces: Map<string, StoreSample[]>`, `activeChannels: Set<string>`. `clear()` wipes everything on simulation reset. No history -- when traces are cleared, all data is gone.

### `packages/frontend/src/components/ChartPanel.tsx` (enhanced by Prompt 1)
uPlot chart with interactive zoom/pan, click-to-scrub, channel browser, multi-axis support.

### `packages/frontend/src/engine/connection.ts`
On simulation reset (`simulationState` -> idle from running/paused), calls `useTraceStore.getState().clear()` and `clearBodyPoses()`.

### `packages/frontend/src/components/TimelinePanel.tsx`
BottomDock with Timeline, Charts, Diagnostics tabs.

### Electron preload API (`window.motionlab`)
Includes `saveProjectFile(bytes, name)` which uses `dialog.showSaveDialog`. No generic "save file" API.

### `packages/frontend/src/stores/simulation.ts`
`simTime`, `stepCount`, `maxSimTime`, `channelDescriptors`.

## What to Build

### 1. Extend trace store with per-channel statistics

Add computed statistics to the trace store, updated incrementally as samples arrive:

```typescript
interface ChannelStats {
  min: number;
  max: number;
  final: number;
  mean: number;
  sampleCount: number;
}

// In TraceState:
stats: Map<string, ChannelStats>;
```

Update stats incrementally in `addSamples()`:
```typescript
// For each new sample batch:
const existing = state.stats.get(channelId) ?? { min: Infinity, max: -Infinity, final: 0, mean: 0, sampleCount: 0 };
for (const s of samples) {
  existing.min = Math.min(existing.min, s.value);
  existing.max = Math.max(existing.max, s.value);
  existing.final = s.value;
  existing.sampleCount++;
}
// Running mean: update with Welford's online algorithm or simple cumulative
```

Note: stats track the full simulation run, not just the 60-second rolling buffer. This means `min`/`max` reflect the entire run even after old samples are trimmed from the buffer.

### 2. Add session run history

Extend the trace store to keep results from completed simulation runs:

```typescript
interface SimulationRun {
  id: string;           // UUID
  timestamp: number;    // Date.now() when run started
  duration: number;     // total sim time
  stepCount: number;
  channels: Map<string, ChannelDescriptor>;
  traces: Map<string, StoreSample[]>;  // full trace data (not trimmed)
  stats: Map<string, ChannelStats>;
}

// In TraceState:
runs: SimulationRun[];         // last N completed runs
maxRuns: number;               // configurable, default 3
activeRunId: string | null;    // which historical run to display (null = live)
```

When simulation resets (transition to idle):
- Before calling `clear()`, snapshot the current traces + stats into a `SimulationRun`
- Push to `runs` array, trim to `maxRuns`
- Clear live traces

The `clear()` in `connection.ts` should be changed to call a new `archiveAndClear()` method:

```typescript
archiveAndClear: () => set((state) => {
  // Only archive if there is meaningful data
  if (state.traces.size === 0) return { traces: new Map(), stats: new Map(), activeChannels: new Set() };

  const run: SimulationRun = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    duration: /* get from simulation store */,
    stepCount: /* get from simulation store */,
    channels: new Map(state.channels),
    traces: new Map(state.traces),
    stats: new Map(state.stats),
  };

  const runs = [...state.runs, run].slice(-state.maxRuns);
  return {
    runs,
    traces: new Map(),
    stats: new Map(),
    activeChannels: new Set(),
  };
}),
```

### 3. Run selector UI

Add a run selector to the chart toolbar (from Prompt 1):

```
[Run 3 (current)] [Run 2 - 14:32] [Run 1 - 14:28] | [Compare]
```

- Clicking a historical run switches the chart data source to that run's `traces` map
- The "current" button (or "Live" when simulating) switches back to live data
- Run labels show the timestamp formatted as HH:MM

When a historical run is selected:
- ChartPanel reads from `runs[selectedIndex].traces` instead of `traces`
- Timeline scrubber is disabled (no scrubbing historical runs without the engine)
- Inspector values are not updated (they only show live data)

### 4. Run comparison overlay

Add a "Compare" toggle to the chart toolbar:

When active:
- Show the current/selected run's traces as solid lines (existing behavior)
- Overlay a secondary run's traces as dashed lines with reduced opacity
- User picks which run to compare against via a dropdown
- Legend shows both runs' values at the cursor position

Implementation:
```typescript
// In buildAlignedData, merge traces from two runs:
// Primary run: solid lines
// Comparison run: dashed lines (uPlot series option: dash: [5, 3])
```

uPlot supports per-series `dash` styling. Add comparison series with:
```typescript
{
  label: `${ch.name} (Run 2)`,
  stroke: COLORS[i % COLORS.length],
  width: 1,
  dash: [4, 4],       // dashed line
  alpha: 0.5,          // reduced opacity
}
```

### 5. Results summary panel

Create `packages/frontend/src/components/ResultsSummaryPanel.tsx`:

Displayed in the Diagnostics tab (or a new "Results" tab in BottomDock) after simulation completes:

```
Results Summary -- Run 3 (Mar 22, 14:35)
Duration: 2.500 s | Steps: 2500 | Avg step: 1.00 ms

Channel              │ Min       │ Max       │ Final     │ Unit
─────────────────────┼───────────┼───────────┼───────────┼──────
Revolute1 Position   │ -0.0000   │  1.5708   │  1.5708   │ rad
Revolute1 Velocity   │  0.0000   │  3.1416   │  0.0001   │ rad/s
Revolute1 Rxn Force  │  0.0023   │ 48.2100   │  9.8100   │ N
Revolute1 Rxn Torque │  0.0000   │  2.3400   │  0.0000   │ Nm
```

Features:
- Table of all channels with min/max/final/unit from `ChannelStats`
- Sortable by any column (click column header)
- Highlight rows where max exceeds a threshold (visual attention for extreme values)
- Run metadata header: timestamp, duration, step count, average step time
- If viewing a historical run, show that run's stats

### 6. CSV export

Create `packages/frontend/src/utils/csv-export.ts`:

```typescript
interface CsvExportOptions {
  /** Channel IDs to export (default: all active channels) */
  channelIds?: string[];
  /** Time range to export (default: full trace) */
  timeRange?: { start: number; end: number };
  /** Whether to include channel metadata header (default: true) */
  includeHeader?: boolean;
}

export function generateCsv(
  traces: Map<string, StoreSample[]>,
  channels: Map<string, ChannelDescriptor>,
  options?: CsvExportOptions,
): string {
  // Build CSV string:
  // Row 1 (header): time,Revolute1 Position (rad),Revolute1 Velocity (rad/s),...
  // Row 2+: 0.001,0.0000,0.0000,...
  // Align all channels to a common time grid
  // Use empty cells for missing values at a given timestamp
}
```

Time alignment strategy:
- Collect all unique timestamps across selected channels
- Sort ascending
- For each timestamp, look up the value in each channel (or leave empty)
- This produces a dense CSV that any spreadsheet can chart

### 7. Wire CSV export to UI

Add export buttons:

**In chart toolbar** (from Prompt 1):
```
[Export CSV ↓]
```

**In results summary panel:**
```
[Export All Channels] [Export Selected]
```

Export flow:
1. Generate CSV string via `generateCsv()`
2. Convert to Blob / Uint8Array
3. Call Electron's save dialog:
   ```typescript
   window.motionlab?.saveFile(csvBytes, suggestedName, [
     { name: 'CSV Files', extensions: ['csv'] },
   ]);
   ```
4. If `window.motionlab.saveFile` doesn't exist yet, add it to the Electron preload API

If the preload API needs extending:
- Add `saveFile(data: Uint8Array, suggestedName: string, filters: FileFilter[]): Promise<{ saved: boolean; filePath?: string }>`
- Implement in `apps/desktop/src/preload.ts` using `dialog.showSaveDialog` + `fs.writeFile`
- Expose via `contextBridge.exposeInMainWorld`
- This is a small boundary extension -- document in the ADR

### 8. Wire CSV export keyboard shortcut

Add `Ctrl+Shift+E` (or `Cmd+Shift+E` on macOS) as a keyboard shortcut for "Export active channels as CSV":
- Only active when simulation is not idle (there must be trace data)
- Uses the same export flow as the button

### 9. Update connection.ts reset handler

Replace the `clear()` call with `archiveAndClear()`:

```typescript
// In the simulationState handler, idle transition:
if (mapped === 'idle' && (prevState === 'running' || prevState === 'paused' || prevState === 'error')) {
  useTraceStore.getState().archiveAndClear();  // was: clear()
  clearBodyPoses();
  // ... rest of reset logic
}
```

### 10. Add "Results" tab to BottomDock

Update `TimelinePanel.tsx` to add a fourth tab:

```typescript
tabs={[
  { id: 'timeline', label: 'Timeline' },
  { id: 'charts', label: 'Charts' },
  { id: 'results', label: 'Results' },
  { id: 'diagnostics', label: 'Diagnostics' },
]}
```

The Results tab shows `ResultsSummaryPanel`:
- During simulation: shows live stats updating at ~6Hz
- After simulation: shows final stats for the most recent run
- Run selector to switch between historical runs

### 11. Write tests

**Protocol roundtrip test** (in `packages/protocol/src/__tests__/roundtrip.test.ts`):
- Verify `OutputChannelDescriptor` serialization roundtrip
- Verify `SimulationTrace` with multiple `TimeSample` entries roundtrips correctly
- Verify `ScrubCommand` roundtrip

**CSV export unit test** (in `packages/frontend/src/utils/__tests__/csv-export.test.ts`):
- Single channel export produces correct header and data rows
- Multi-channel export aligns timestamps correctly
- Time range filtering works
- Empty data produces header-only CSV
- Vec3 channel exports magnitude

**Trace store test** (in `packages/frontend/src/stores/__tests__/traces.test.ts`):
- `addSamples()` updates stats correctly (min, max, final)
- `archiveAndClear()` creates a run snapshot and clears live data
- `maxRuns` limit trims oldest runs
- Rolling buffer trims samples older than 60 seconds
- Stats survive buffer trimming (min/max reflect full run, not just buffer)

### 12. Update architecture docs

Update the following:
- `docs/architecture/results-architecture.md` -- CSV export, session history, run comparison
- `packages/frontend/AGENTS.md` -- trace store session history, export utilities

If the Electron preload API is extended with `saveFile()`, write an ADR:
- `docs/decisions/adr-NNNN-generic-file-export.md` covering the preload API extension

## Architecture Constraints
- CSV generation is synchronous and produces a string -- do not stream or use Web Workers for this (trace data fits in memory)
- Session history stores full trace data, not just stats. For 60 seconds at ~100 samples/sec across 20 channels, this is ~120KB per run -- well within memory limits for 3 runs
- The `archiveAndClear()` method must atomically snapshot and clear to avoid data races with incoming trace events
- Run comparison in the chart uses uPlot's existing series system (dashed lines), not a second chart overlay
- Electron preload API extension follows the existing pattern in `apps/desktop/src/preload.ts`
- CSV export uses Electron's `dialog.showSaveDialog` -- never write files without user consent

## Done Looks Like
- Per-channel statistics (min, max, final, mean) computed incrementally during simulation
- Last 3 simulation runs preserved in session history
- Run selector in chart toolbar switches between historical and live data
- Run comparison overlay shows dashed lines for a secondary run
- Results summary panel shows tabular stats for all channels
- CSV export via file save dialog works for selected or all channels
- Time range filtering in CSV export
- Protocol roundtrip test for trace types passes
- CSV export unit tests pass
- Trace store unit tests pass (stats, archiving, buffer trimming)
- Ctrl+Shift+E exports CSV when trace data is available
- `pnpm --filter @motionlab/frontend typecheck` passes
- `pnpm --filter @motionlab/frontend lint` passes
- Architecture docs updated

## What NOT to Build
- Export to formats other than CSV (HDF5, Parquet, MATLAB .mat)
- Cloud storage or sharing of results
- Results comparison across different mechanism configurations
- Automated regression testing against reference results
- Chart screenshot/image export
- Results annotations or notes
- Real-time CSV streaming during simulation
```

---

## Integration Verification

After all three prompts complete, verify the full trace visualization and results pipeline:

1. **Chart interaction:** Drag-to-zoom on chart, double-click to reset, pan with scroll
2. **Click-to-scrub:** Click a time on the chart, viewport scrubs to that time, scrub marker updates
3. **Channel browser:** Browse all channels grouped by entity, toggle any combination independently of selection
4. **Multi-axis:** Activate channels with different units (rad + N), see separate Y-axes
5. **Spark-lines:** Select a joint during simulation, inspector shows spark-line mini-charts with recent history
6. **Throttled updates:** Inspector updates at ~6Hz, viewport at ~60fps, no performance coupling
7. **CSV export:** Export selected channels via Ctrl+Shift+E, open CSV in spreadsheet, verify data integrity
8. **Results summary:** After simulation stops, Results tab shows min/max/final table for all channels
9. **Session history:** Reset, change parameter, simulate again. Both runs preserved. Run selector switches chart data.
10. **Run comparison:** Enable compare mode, overlay two runs with solid + dashed lines
11. **Performance:** Chart handles 60 seconds of data at 100 samples/sec across 8 channels (~48K total points) without jank
