# Epic 8 — Parallel Agent Prompts

> **Status:** Not Started
> **Deviations:** None. UI primitives for timeline (`timeline-transport.tsx`, `timeline-scrubber.tsx`) exist in the `@motionlab/ui` package as empty shells but no backend or data flow work has begun.

Three prompts for engineering outputs, inspection, and playback UX. Prompt 8.2 can partially overlap with 8.1 (chart component with mock data). 8.3 depends on both.

**Governance:** Epics 5+ are under full governance — every boundary change needs an ADR, every protocol change needs seam tests, every architecture change needs doc updates.

## Shared Contract

| Interface | Owner | Consumer |
|-----------|-------|----------|
| `OutputChannelDescriptor` + `SimulationTrace` proto messages | Prompt 1 (defines + engine implements) | Prompt 2 (frontend consumes) |
| Trace data Zustand store | Prompt 2 (creates) | Prompt 3 (chart component reads) |
| Frame buffer for scrubbing | Prompt 1 (engine buffers) or Prompt 2 (frontend buffers) | Prompt 3 (scrubber reads) |
| Timeline/scrubber position | Prompt 3 (creates) | Prompt 2 (viewport responds to scrub) |
| Chart surface component | Prompt 2 (creates) | Prompt 3 (wires into layout) |

After all three are built, the integration test is: Run simulation, select a joint, see position/velocity traces in chart, scrub timeline, viewport updates to scrubbed time. **Validates Scenario D.**

---

## Prompt 1: Output Channels + Trace Streaming from Engine

```
# Epic 8 — Output Channels and Trace Streaming from Engine

You are implementing the engine-side output channel system: defining trace data schemas, streaming engineering outputs during simulation, and supporting scrub/replay from buffered data. This depends on Epic 7 being complete.

**Governance reminder:** Epics 5+ are under full governance. Protocol changes require seam tests. Boundary changes require an ADR. Write ADR for output channel naming and typing convention.

## Read These First (in order)
- `docs/architecture/principles.md` — non-negotiable rules
- `docs/architecture/protocol-overview.md` — protocol contract rules
- `docs/architecture/results-architecture.md` — output channel concepts
- `native/engine/AGENTS.md` — native boundary rules
- `schemas/AGENTS.md` — schema ownership
- `docs/decisions/` — relevant ADRs, especially the simulation streaming ADR from Epic 7

## What Exists Now

### `native/engine/src/simulation.h` / `simulation.cpp` (from Epic 7)
SimulationRuntime with compile/step/reset, getBodyPoses(), getJointStates(). Joint states include position, velocity, reaction force, reaction torque.

### `native/engine/src/transport.cpp` (from Epic 7)
Handles CompileMechanism, SimulationControl commands. Streams SimulationFrame events with body poses on a background thread. Frame delivery is best-effort with backpressure handling.

### `schemas/protocol/transport.proto` (from Epic 7)
Includes CompileMechanismCommand, SimulationControlCommand, CompilationResult, SimulationState, SimulationFrame, BodyPose. SimulationFrame only carries body poses — no engineering output data yet.

### `packages/protocol/src/transport.ts` (from Epic 7)
TypeScript transport helpers for simulation commands and events.

### `packages/frontend/src/engine/connection.ts` (from Epic 7)
Handles compilationResult, simulationState, simulationFrame events. SimulationFrame goes directly to SceneGraphManager on the hot path.

### `schemas/mechanism/mechanism.proto`
Mechanism with Bodies, Datums, Joints (REVOLUTE, PRISMATIC, FIXED with limits). ElementId uses UUIDv7 for authored entities.

## What to Build

### 1. Define output channel schema

Add to `schemas/protocol/transport.proto` (or create a new `schemas/protocol/outputs.proto` if cleaner separation is desired):

```protobuf
message OutputChannelDescriptor {
  string channel_id = 1;    // e.g., "joint/abc-123/position"
  string name = 2;          // human-readable: "Revolute1 Position"
  string unit = 3;          // e.g., "rad", "m", "N", "Nm"
  ChannelDataType data_type = 4;
}

enum ChannelDataType {
  CHANNEL_DATA_TYPE_UNSPECIFIED = 0;
  CHANNEL_DATA_TYPE_SCALAR = 1;
  CHANNEL_DATA_TYPE_VEC3 = 2;
}

message TimeSample {
  double time = 1;
  oneof value {
    double scalar = 2;
    Vec3 vector = 3;
  }
}

message SimulationTrace {
  string channel_id = 1;
  repeated TimeSample samples = 2;
}
```

### 2. Add channel manifest to CompilationResult

Extend the CompilationResult message:

```protobuf
message CompilationResult {
  bool success = 1;
  string error_message = 2;
  repeated string diagnostics = 3;
  repeated OutputChannelDescriptor channels = 4;  // NEW: available output channels
}
```

This tells the frontend what channels will be produced during simulation, before any simulation runs.

### 3. Add trace streaming event

Add to the Event oneof:

```protobuf
SimulationTrace simulation_trace = 23;
```

### 4. Add scrub command

Add to the Command oneof:

```protobuf
ScrubCommand scrub = 22;
```

```protobuf
message ScrubCommand {
  double time = 1;  // target simulation time to scrub to
}
```

### 5. Run `pnpm generate:proto`

Regenerate both TypeScript and C++ bindings. Verify both compile cleanly.

### 6. Engine-side channel generation

After compilation, generate channel descriptors for each joint in the mechanism:

- `joint/<joint_id>/position` — scalar, unit depends on joint type (rad for revolute, m for prismatic)
- `joint/<joint_id>/velocity` — scalar, unit depends on joint type (rad/s for revolute, m/s for prismatic)
- `joint/<joint_id>/reaction_force` — Vec3, unit: N
- `joint/<joint_id>/reaction_torque` — Vec3, unit: Nm

Channel IDs follow the convention: `<entity_type>/<entity_id>/<measurement>`.

Human-readable names combine the joint's authored name with the measurement: e.g., "Revolute1 Position".

### 7. Sample channels during simulation

After each simulation step, read channel values from Chrono joint objects via `getJointStates()`:
- Joint position: generalized coordinate from the Chrono link
- Joint velocity: generalized velocity from the Chrono link
- Reaction force: `GetReactionForceBody2()` or equivalent
- Reaction torque: `GetReactionTorqueBody2()` or equivalent

Store samples in an internal buffer keyed by channel_id.

### 8. Batch and stream trace data

Trace data is streamed alongside body poses but at LOWER frequency:
- Batch samples: accumulate samples and send a SimulationTrace event every 10 steps or every 100ms (whichever comes first)
- Each SimulationTrace event carries samples for ONE channel
- Send traces for all active channels in round-robin

This keeps individual message sizes small while providing near-real-time data.

### 9. Engine-side ring buffer for scrub support

Maintain a ring buffer of historical data for scrub/replay:
- Buffer the last N seconds of data (default: 60 seconds, configurable)
- Store both body poses (SimulationFrame data) and trace samples per timestep
- Index by simulation time for fast lookup

When the buffer is full, drop the oldest data.

### 10. Handle ScrubCommand

When the engine receives a ScrubCommand:
- Look up the buffered frame closest to the requested time
- Send a SimulationFrame event with the historical body poses
- Send SimulationTrace events with samples around the scrub time (a small window, e.g., +/- 1 second)
- If the requested time is outside the buffer range, send an error or clamp to the buffer bounds

Scrubbing should pause the simulation if it's running (or operate independently if already paused).

### 11. TypeScript transport helpers

Add to `packages/protocol/src/transport.ts`:

```typescript
export function createScrubCommand(time: number, sequenceId: bigint): Uint8Array {
  const cmd = new Command({
    sequenceId,
    payload: {
      case: 'scrub',
      value: new ScrubCommand({ time }),
    },
  });
  return cmd.toBinary();
}
```

Update parseEvent to handle the simulationTrace event type.

### 12. Protocol seam test

Write a test that exercises the output channel pipeline:
1. Load or construct a mechanism with at least one revolute joint
2. Send CompileMechanism — verify CompilationResult includes channel descriptors
3. Verify channel descriptors have correct IDs, names, units, and data types
4. Send SimulationControl(PLAY)
5. Run for 50+ steps
6. Verify SimulationTrace events received with plausible values (position changes, nonzero reaction forces)
7. Send SimulationControl(PAUSE)
8. Send ScrubCommand to a time within the buffer
9. Verify a SimulationFrame is received with historical body poses

### 13. Write ADR for output channel naming and typing convention

Write `docs/decisions/adr-NNNN-output-channels.md` covering:
- Channel ID naming convention: `<entity_type>/<entity_id>/<measurement>`
- Supported data types: SCALAR, VEC3
- Units are explicit in the descriptor and follow SI conventions
- Channel manifest is sent once after compilation
- Trace data is batched and streamed at lower frequency than body poses
- Ring buffer provides scrub support with configurable retention

## Architecture Constraints
- Trace data is streamed alongside body poses but at lower frequency (batched, not per-step)
- Channel names follow a consistent convention: `<entity_type>/<entity_id>/<measurement>`
- Units are explicit in the descriptor, never implicit
- Engine buffers historical data for scrub support — the frontend does not need to maintain a complete history
- Scrub response must be fast (< 100ms from command to frame delivery)
- Trace streaming must not impact simulation performance — if batching falls behind, skip samples

## Done Looks Like
- `pnpm generate:proto` produces updated TS and C++ bindings with trace types
- Engine produces trace data during simulation
- Channel manifest sent after compilation with correct descriptors
- SimulationTrace events received by the frontend with plausible engineering values
- ScrubCommand returns historical body poses and trace data
- Protocol seam test passes
- ADR for output channels is written
- `cmake --preset dev && cmake --build build/dev` succeeds
- `ctest --preset dev` passes including the new seam test

## What NOT to Build
- Chart rendering (that's Prompt 8.2)
- Timeline UI (that's Prompt 8.3)
- Playback controls beyond what Epic 7 provides (that's Prompt 8.3)
- Frontend trace storage or buffering (that's Prompt 8.2)
- Selection-linked channel activation (that's Prompt 8.2)
```

---

## Prompt 2: Chart Surface + Trace Store

```
# Epic 8 — Chart Surface and Trace Store

You are building the frontend trace data store and chart rendering component for engineering output visualization. This depends on Prompt 8.1 for the protocol types but can partially overlap (build the chart with mock data first, then wire to real trace events).

**Governance reminder:** Epics 5+ are under full governance. Update relevant subsystem docs when the epic completes.

## Read These First (in order)
- `docs/architecture/principles.md` — React is NOT the hot path
- `packages/frontend/AGENTS.md` — frontend owns workbench UX, Zustand for state
- `packages/viewport/AGENTS.md` — viewport rendering rules
- `docs/architecture/results-architecture.md` — output channel concepts
- `docs/decisions/` — relevant ADRs, especially the output channels ADR from Prompt 8.1

## What Exists Now

### `packages/frontend/src/stores/simulation.ts` (from Epic 7)
Zustand store with simulation state: idle/compiling/running/paused/error, currentTime, stepCount.

### `packages/frontend/src/stores/mechanism.ts`
Zustand store with bodies, datums, joints. Each entity has an id and name.

### `packages/frontend/src/stores/selection.ts`
Zustand store with selectedIds set.

### `packages/frontend/src/engine/connection.ts` (from Epic 7, updated by Prompt 8.1)
WebSocket client handling all event types. After Prompt 8.1, it will also receive compilationResult with channel descriptors and simulationTrace events.

### `packages/protocol/src/transport.ts` (updated by Prompt 8.1)
TypeScript transport helpers including parseEvent that handles simulationTrace events. Exports OutputChannelDescriptor, SimulationTrace, TimeSample types.

### `packages/frontend/src/components/` (existing)
AppShell layout: ProjectTree left, viewport center, inspector right. SimulationToolbar from Epic 7.

## What to Build

### 1. Create trace data Zustand store

Create `packages/frontend/src/stores/traces.ts`:

```typescript
import { create } from 'zustand';

interface ChannelDescriptor {
  channelId: string;
  name: string;
  unit: string;
  dataType: 'scalar' | 'vec3';
}

interface TimeSample {
  time: number;
  value: number | { x: number; y: number; z: number };
}

interface TraceStore {
  // Channel metadata (populated from CompilationResult)
  channels: Map<string, ChannelDescriptor>;

  // Accumulated trace data (populated from SimulationTrace events)
  traces: Map<string, TimeSample[]>;

  // Which channels are actively displayed in the chart
  activeChannels: Set<string>;

  // Actions
  setChannels: (descriptors: ChannelDescriptor[]) => void;
  addSamples: (channelId: string, samples: TimeSample[]) => void;
  setActiveChannels: (channelIds: string[]) => void;
  toggleChannel: (channelId: string) => void;
  clear: () => void;
}
```

### 2. Handle trace events in connection.ts

Wire the new event types into the trace store:

**From compilationResult:** Extract channel descriptors and call `traceStore.setChannels(descriptors)`.

**From simulationTrace:** Call `traceStore.addSamples(channelId, samples)` for each incoming trace event.

### 3. Memory management for trace buffer

Limit the trace buffer in the frontend store:
- Maximum 60 seconds of data per channel (configurable via a constant)
- When adding new samples, drop the oldest samples if the buffer exceeds the limit
- Use a simple array with shift/push, or a more efficient ring buffer if performance requires it
- At 100 samples/second for 60 seconds = 6,000 samples per channel — well within memory limits

### 4. Selection-linked channel activation

When a joint is selected (via the selection store), auto-activate its output channels:

```typescript
// Subscribe to selection changes
useEffect(() => {
  const selectedJointIds = getSelectedJointIds(); // filter selection for joints
  if (selectedJointIds.length > 0) {
    const channelIds = selectedJointIds.flatMap(jointId => [
      `joint/${jointId}/position`,
      `joint/${jointId}/velocity`,
    ]);
    traceStore.setActiveChannels(channelIds);
  }
}, [selectedIds]);
```

When a body is selected, show channels for any joints attached to that body.

### 5. Install chart library

Add `uplot` to `packages/frontend/package.json`:

```json
"dependencies": {
  "uplot": "^1.6.0"
}
```

uplot is recommended for performance with dense engineering data — it handles 10K+ points per series efficiently using canvas rendering, not SVG.

Install types if available: `@types/uplot` or use uplot's built-in types.

### 6. Create ChartPanel component

Create `packages/frontend/src/components/ChartPanel.tsx`:

```typescript
// ChartPanel renders a time-series chart of active trace channels
// using uplot for high-performance canvas rendering.
//
// Key design:
// - uplot is initialized once and updated imperatively (not re-created on each render)
// - New data is pushed via uplot.setData() on requestAnimationFrame
// - React only handles channel legend and axis labels
```

**Chart features:**
- X-axis: simulation time (seconds)
- Y-axis: channel value (auto-scaled per visible range)
- Multiple channels overlaid with different colors
- Line chart with thin lines (1-2px)
- No markers on individual points (too many)
- Axis labels include units from the channel descriptor

**Channel legend:**
- List of active channels below the chart
- Each with a color swatch and show/hide toggle
- Channel name and current value at the latest time point
- Click to toggle visibility

### 7. Imperative chart updates

The chart MUST update via uplot's imperative API, not React re-renders:

```typescript
// In a useEffect or external subscription:
const unsubscribe = traceStore.subscribe((state) => {
  // Only update chart when traces change
  const data = buildUplotData(state.traces, state.activeChannels);
  if (uplotRef.current) {
    uplotRef.current.setData(data);
  }
});
```

Use `requestAnimationFrame` to batch updates if traces arrive faster than the display refresh rate.

### 8. Chart performance requirements

The chart must handle:
- 10K+ samples per channel without jank
- 4-6 simultaneous channels (position + velocity for 2-3 joints)
- Smooth scrolling/zooming on the time axis
- Auto-scaling Y axis that adjusts to visible data range

uplot handles all of these well out of the box. Configure it with:
- `cursor.sync` disabled (no crosshair sync for now)
- `scales.x.auto` enabled
- `scales.y.auto` enabled

### 9. Chart resize handling

The chart must resize when its container changes:
- Listen for container resize via ResizeObserver
- Call `uplot.setSize({ width, height })` on resize
- Debounce resize handling to avoid excessive redraws

### 10. Wire into AppShell layout

The ChartPanel does NOT get wired into the final layout position in this prompt — that's Prompt 8.3's job (bottom dock with timeline). For now, render the ChartPanel in the inspector area or as a toggleable panel so it can be tested.

Add a toggle button in the SimulationToolbar: "Show Chart" / "Hide Chart".

## Architecture Constraints
- Chart data is read from the trace store, not from React state. Chart updates via requestAnimationFrame and uplot's imperative API, not React re-renders.
- uplot's imperative API aligns well with the hot-path requirement — it renders to canvas directly.
- The trace store is the single source of truth for channel data. The chart reads from it.
- Do not add `@motionlab/protocol` as a dependency of the chart component — it receives plain data from the trace store, not proto types.
- Memory management is critical — unbounded trace accumulation will eventually OOM.

## Done Looks Like
- Trace store accumulates channel data from simulation events
- Chart panel shows time-series traces during simulation
- Selecting a joint auto-activates its position and velocity channels in the chart
- Chart performs well with 10K+ samples per channel (no jank)
- Channel legend shows/hides individual channels
- Axis labels include units from channel descriptors
- Auto-scaling Y axis works correctly
- Chart resizes correctly when its container changes
- `pnpm --filter @motionlab/frontend typecheck` passes

## What NOT to Build
- Timeline scrubber (that's Prompt 8.3)
- Viewport scrub synchronization (that's Prompt 8.3)
- Playback speed control (that's Prompt 8.3)
- Bottom dock layout integration (that's Prompt 8.3)
- Chart zoom/pan interactions beyond basic auto-scale
- Chart export (screenshot, CSV)
- Multi-axis charts (single Y axis is sufficient for MVP)
```

---

## Prompt 3: Playback UX + Timeline + Inspection Integration

```
# Epic 8 — Playback UX, Timeline, and Inspection Integration

You are building the full playback experience: timeline scrubber, chart synchronization, viewport scrub, speed control, and inspection during playback. This depends on Prompts 8.1 and 8.2 being complete.

**Governance reminder:** Epics 5+ are under full governance. Update all relevant subsystem docs and architecture docs at the end of this prompt.

## Read These First (in order)
- `docs/architecture/principles.md` — React is NOT the hot path
- `packages/frontend/AGENTS.md` — frontend owns workbench UX
- `packages/viewport/AGENTS.md` — viewport rendering rules
- `docs/architecture/results-architecture.md` — output channel and playback concepts
- `docs/decisions/` — relevant ADRs (simulation streaming, output channels)

## What Exists Now

### `packages/frontend/src/stores/simulation.ts` (from Epic 7)
Zustand store with simulation state, currentTime, stepCount.

### `packages/frontend/src/stores/traces.ts` (from Prompt 8.2)
Zustand store with channels map, traces map, activeChannels set. Accumulates trace data from simulation events.

### `packages/frontend/src/components/ChartPanel.tsx` (from Prompt 8.2)
uplot-based time-series chart showing active trace channels. Imperative updates via uplot.setData(). Currently rendered in a toggleable panel.

### `packages/frontend/src/components/SimulationToolbar.tsx` (from Epic 7)
Compile, Play/Pause, Step, Reset buttons. Time display.

### `packages/frontend/src/engine/connection.ts` (from Epic 7 + Prompt 8.1)
WebSocket client handling all event types including simulationFrame (hot path to SceneGraphManager) and simulationTrace (to trace store).

### `packages/protocol/src/transport.ts` (from Prompt 8.1)
Includes createScrubCommand(time, sequenceId) for timeline scrubbing.

### `packages/viewport/src/scene-graph.ts` (from Epic 7)
SceneGraphManager with updateBodyTransform(bodyId, pose) for hot-path viewport updates.

### `packages/frontend/src/components/` (existing layout)
AppShell layout: ProjectTree left, viewport center, inspector right. SimulationToolbar above viewport.

### Inspector components (existing)
BodyInspector, DatumInspector, JointInspector — show static properties of selected entities.

## What to Build

### 1. Create TimelineBar component

Create `packages/frontend/src/components/TimelineBar.tsx`:

A horizontal timeline scrubber positioned at the bottom of the viewport area:

```typescript
// TimelineBar renders:
// - A horizontal track showing the simulation time range (0 to currentTime)
// - A draggable playhead indicating the current position
// - Time labels at the start, end, and playhead position
// - Integrated Play/Pause button (optional, mirrors toolbar)
```

**Playhead interaction:**
- Click anywhere on the track to jump to that time
- Drag the playhead to scrub through the simulation
- While dragging, continuously send ScrubCommand to the engine
- Throttle scrub commands to avoid flooding (max 30 commands/second)

**Visual design:**
- Full width of the viewport area
- Thin track (4-6px height) with a larger playhead indicator
- Time range labels at left (0s) and right (current max time)
- Playhead label showing precise time (e.g., "1.234s")

### 2. Wire scrubber to engine

When the user drags the playhead:
1. Calculate the target time from the drag position
2. Send ScrubCommand(time) via the connection module
3. Engine responds with a historical SimulationFrame (body poses at that time)
4. SimulationFrame is handled by the existing hot-path handler — SceneGraphManager.updateBodyTransform
5. If simulation is running, pause it first (scrubbing implies pause)

```typescript
function handleScrub(time: number) {
  const { state } = useSimulation.getState();
  if (state === 'running') {
    sendSimulationControl(SimulationAction.PAUSE);
  }
  sendScrubCommand(time);
}
```

### 3. Wire scrubber to chart

The chart should show a vertical marker at the current scrub position:

```typescript
// Add a vertical cursor line to the uplot chart at the scrub time
// uplot supports cursor plugins or manual overlay drawing
```

Options:
- Use uplot's built-in cursor feature with a fixed position
- Draw a vertical line on the chart canvas via a uplot plugin
- Use a CSS overlay positioned at the scrub time's X coordinate

The marker must update in real-time as the user drags the playhead.

### 4. Playback speed control

Add speed control to the SimulationToolbar or TimelineBar:

- Speed options: 0.25x, 0.5x, 1x, 2x, 4x
- Display current speed next to the time display
- Implementation: send the speed multiplier to the engine OR control frame skipping on the frontend side

If the engine supports a speed parameter:
- Add a `SetPlaybackSpeed` command (requires proto change — follow governance, add seam test)

If controlling frontend-side:
- Adjust the frame acceptance rate: at 0.5x, display every other frame. At 2x, the engine steps faster (requires engine support) or the frontend skips to the latest frame.

For MVP, prefer the simpler approach. If engine-side speed control is too complex, implement frontend-side frame timing: control how often SceneGraphManager updates are applied.

### 5. Loop mode toggle

Add a loop toggle button to the TimelineBar or SimulationToolbar:
- When enabled: when simulation reaches the end of the buffer or a target time, restart from the beginning
- Implementation: on SimulationState transition to PAUSED/IDLE at the end, send SimulationControl(RESET) then SimulationControl(PLAY)
- Visual: a loop icon button that toggles between active/inactive

### 6. Step backward

Add a "Step Back" button to the SimulationToolbar:
- When clicked, send ScrubCommand to (currentTime - dt) where dt is the simulation timestep
- Only enabled when simulation is paused and currentTime > 0
- Uses the engine's ring buffer for historical frame lookup

### 7. Selection-linked inspection during playback

When scrubbing or during playback, the inspector should show live values:

**For selected joints:**
- Show current position, velocity (from the trace store at the current scrub time)
- Look up the nearest sample in the trace buffer for the current time
- Display: "Position: 1.234 rad", "Velocity: 0.567 rad/s"

**For selected bodies:**
- Show current position, orientation (from the last SimulationFrame)
- Display: "Position: (1.0, 2.0, 3.0)", "Orientation: (0.0, 0.0, 0.707, 0.707)"

Update the existing inspector components to show simulation values when the simulation is running or paused (not idle):

```typescript
// In JointInspector:
const simState = useSimulation(s => s.state);
const traces = useTraces(s => s.traces);

if (simState !== 'idle') {
  const posChannel = `joint/${joint.id}/position`;
  const samples = traces.get(posChannel);
  const currentValue = findNearestSample(samples, currentTime);
  // Render live value
}
```

### 8. Wire bottom dock into AppShell

Restructure the AppShell layout to include a bottom dock:

```
+-------------------------------------------+
| Header + SimulationToolbar                |
+--------+---------------------+------------+
| Project|                     | Inspector  |
| Tree   |    Viewport         |            |
|        |                     |            |
|        |                     |            |
+--------+---------------------+------------+
|        Timeline Bar                        |
+-------------------------------------------+
|        Chart Panel (resizable)             |
+-------------------------------------------+
```

- The bottom area contains the TimelineBar (fixed height, always visible during simulation) and the ChartPanel (resizable height)
- Add a drag splitter between the viewport area and the bottom dock
- The bottom dock can be collapsed (just the timeline visible) or expanded (timeline + chart)
- When simulation is idle, the bottom dock can be hidden entirely

### 9. Simulation metadata panel

Add a collapsible section to the inspector (or a dedicated panel) showing simulation run info:
- Duration: total simulated time
- Step count: total steps completed
- Timestep: simulation dt
- Solver type: NSC or SMC (from CompilationResult or hardcoded for now)
- Frame rate: actual frame delivery rate (measured)

### 10. Responsive layout considerations

- Bottom dock respects minimum viewport height (don't let the chart consume the entire viewport)
- Chart panel has a minimum and maximum height
- Timeline bar has a fixed height (~40px)
- When the window is resized, all panels adjust proportionally
- Keyboard shortcut: Ctrl+Shift+C to toggle chart panel visibility

### 11. Update architecture docs

Update the following docs to reflect the implemented playback and output channel system:
- `docs/architecture/results-architecture.md` — output channels, trace streaming, scrub support
- `docs/architecture/runtime-topology.md` — simulation thread, frame streaming, scrub flow
- `docs/architecture/protocol-overview.md` — new commands and events
- All relevant AGENTS.md files

## Architecture Constraints
- Scrubbing must feel responsive (< 100ms latency from drag to viewport update). The engine's ring buffer lookup must be fast.
- Chart and viewport update independently — they are separate consumers of the same data.
- Timeline interaction is imperative (not React-driven scrub updates). Drag events go directly to the connection module, not through React state.
- Scrubbing automatically pauses live playback — they must not conflict.
- The bottom dock layout must not interfere with the viewport's rendering performance.
- Inspector simulation values update at low frequency (Zustand store subscription), not on every frame.

## Done Looks Like
- Timeline scrubber works: drag playhead, viewport shows historical body poses
- Charts show traces with a vertical scrub marker at the current timeline position
- Viewport syncs with scrub position smoothly (< 100ms latency)
- Playback speed control works (0.25x to 4x)
- Loop mode replays the simulation continuously
- Step backward moves one timestep back
- Inspector shows live joint/body values during playback and scrubbing
- Bottom dock layout with resizable chart panel
- Simulation metadata is displayed
- Architecture docs are updated
- **Completes Validation Scenario D**

## What NOT to Build
- Sensor authoring (deferred past MVP)
- Advanced replay features (bookmarks, annotations)
- Data export (CSV, screenshot)
- Recording simulation to file
- Multi-run comparison charts
- Undo/redo during playback
```

---

## Integration Verification

After all three prompts complete, verify the full output and playback stack:

1. **Proto codegen:** `pnpm generate:proto` produces updated TS and C++ bindings with trace types
2. **Engine trace streaming:** Simulation produces trace events with plausible engineering values
3. **Channel manifest:** CompilationResult includes output channel descriptors
4. **Chart rendering:** Select a joint, see position/velocity traces during simulation
5. **Timeline scrub:** Drag playhead, viewport shows historical body poses
6. **Chart sync:** Vertical marker in chart follows scrub position
7. **Playback controls:** Speed control and loop mode work
8. **Inspection:** Inspector shows live joint/body values during playback
9. **Layout:** Bottom dock with resizable chart panel, timeline bar
10. **Performance:** Chart handles 10K+ samples, scrub latency < 100ms
