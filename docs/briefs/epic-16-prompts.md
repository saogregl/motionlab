# Epic 16 — Forces, Actuators & Motion Inputs UI

> **Status:** Not started
> **Dependencies:** Epic 5 (Datum CRUD) — complete. Epic 7 (Simulation lifecycle) — complete. Protocol load/actuator commands — already defined in transport.proto and handled by engine.
>
> **Governance note:** Pre-MVP lighter process applies (Epics 1-4 complete). Tests required at integration seams. Doc updates batched per epic.

Three prompts. Prompts 1 and 2 can run in parallel. Prompt 3 depends on both.

## Motivation

The engine and protocol already support loads and actuators — `CreateLoadCommand`, `UpdateLoadCommand`, `DeleteLoadCommand`, `CreateActuatorCommand`, `UpdateActuatorCommand`, `DeleteActuatorCommand` are all defined in `transport.proto`, and the native engine compiles them to Chrono objects during simulation. But there is **zero frontend UI** for creating, editing, or visualizing these entities.

This is a fundamental gap: you can build a mechanism with bodies, datums, and joints — but you cannot apply forces, torques, springs, or motors. Users need to:

1. Apply a point force to a body at a datum location
2. Apply a torque to a body at a datum location
3. Add spring-damper connections between two datums/bodies
4. Add revolute motors to revolute joints
5. Add prismatic motors to prismatic joints
6. Configure motor control modes (position, speed, effort)
7. See force arrows, torque indicators, spring coil graphics, and motor icons in the viewport

Visualization is critical: without visual feedback, users cannot verify that loads are applied at the correct locations, in the correct directions, or with the correct magnitudes.

## Prior Art

### Adams (MSC Software) — Forces Panel

Adams provides a modal dialog for force creation:
- **Point Force:** Select body + datum marker, specify magnitude + direction in global or body-local frame
- **Torque:** Select body + datum marker, specify magnitude + axis
- **Spring-Damper:** Select two markers, specify stiffness (N/m), damping (Ns/m), free length (m)
- **Visualization:** Force arrows scaled by magnitude, spring coil zigzag lines between markers

Key insight: Forces are always anchored to markers (Adams term for datums). The marker provides both the application point and the reference frame.

### ANSYS Motion — Load Browser

ANSYS Motion uses a tree-based load browser:
- Loads grouped by type (Force, Torque, Spring, Bush)
- Each load shows parent body, magnitude, direction
- Force arrows in the 3D view with configurable scale factor
- Spring-damper shows as a coil element with color-coded stretch during animation

### Simscape (MATLAB/Simulink) — Actuation Blocks

Simscape represents actuators as blocks connecting to joint ports:
- **Joint Actuation:** Attach a motion or torque/force input to a joint
- **Control modes:** Position (prescribe trajectory), Speed (prescribe velocity), Effort (prescribe force/torque)
- Each mode has a single scalar input port
- Live scopes show commanded vs. actual values during simulation

Key insight: Actuators are always associated with joints, not bodies. The joint defines the DOF; the actuator drives it.

## Shared Contract

| Interface | Owner | Consumer |
|-----------|-------|----------|
| `Load` / `Actuator` protobuf messages | Existing (mechanism.proto) | All prompts |
| `Create/Update/Delete Load` commands + results | Existing (transport.proto + engine) | Prompt 1 (frontend sends), Prompt 3 (inspectors show results) |
| `Create/Update/Delete Actuator` commands + results | Existing (transport.proto + engine) | Prompt 2 (frontend sends), Prompt 3 (inspectors show results) |
| `LoadState` / `ActuatorState` in mechanism store | Prompt 1 / Prompt 2 (define) | Prompt 3 (inspectors read) |
| `sendCreateLoad` / `sendDeleteLoad` in connection.ts | Prompt 1 (implements) | Prompt 3 (context menus use) |
| `sendCreateActuator` / `sendDeleteActuator` in connection.ts | Prompt 2 (implements) | Prompt 3 (context menus use) |
| Force arrow rendering for loads | Prompt 1 (implements) | Prompt 3 (visibility toggle) |
| Motor icon rendering for actuators | Prompt 2 (implements) | Prompt 3 (visibility toggle) |
| `LoadInspector` component | Prompt 3 (implements) | EntityInspector (renders) |
| `ActuatorInspector` component | Prompt 3 (implements) | EntityInspector (renders) |

Integration test: Import STEP file with two bodies + joint. Create a point force on body A. Create a revolute motor on the joint. Run simulation. Verify force arrow and motor icon visible. Verify load and actuator appear in ProjectTree. Select load — LoadInspector shows editable properties. Select actuator — ActuatorInspector shows control mode and live effort readout.

---

## Prompt 1: Load Creation UI & Force Visualization

```
# Epic 16 — Load Creation UI & Force Visualization

You are implementing the frontend UI for creating, editing, and visualizing mechanism loads (point forces, point torques, and spring-dampers). The protocol commands and engine handling already exist — this is purely frontend work plus viewport visualization.

## Read These First (in order)
- `docs/architecture/principles.md` — engine is computational authority; React is not the hot path for viewport
- `packages/frontend/AGENTS.md` — frontend owns authoring UX
- `packages/viewport/AGENTS.md` — viewport owns visualization
- `packages/ui/AGENTS.md` — UI component conventions (longhand padding, shadcn patterns)
- `schemas/mechanism/mechanism.proto` — Load, PointForceLoad, PointTorqueLoad, LinearSpringDamperLoad messages
- `schemas/protocol/transport.proto` — CreateLoadCommand, UpdateLoadCommand, DeleteLoadCommand and corresponding results
- `packages/protocol/src/transport.ts` — createCreateLoadCommand, createUpdateLoadCommand, createDeleteLoadCommand already exist
- `packages/frontend/src/engine/connection.ts` — existing send helpers and event handlers
- `packages/frontend/src/stores/mechanism.ts` — BodyState, DatumState, JointState, MechanismState
- `packages/viewport/src/rendering/force-arrows.ts` — existing ForceArrowManager (currently only wired for joint reaction forces)
- `packages/frontend/src/components/ProjectTree.tsx` — tree structure with body/datum/joint nodes

## What Exists Now

### Protocol (already complete)
- `mechanism.proto` defines `Load` message with oneof config: `PointForceLoad`, `PointTorqueLoad`, `LinearSpringDamperLoad`
- `PointForceLoad`: datum_id, vector (Vec3), reference_frame (DATUM_LOCAL or WORLD)
- `PointTorqueLoad`: datum_id, vector (Vec3), reference_frame
- `LinearSpringDamperLoad`: parent_datum_id, child_datum_id, rest_length, stiffness, damping
- `transport.proto` defines CreateLoadCommand (takes Load draft), UpdateLoadCommand (takes Load), DeleteLoadCommand (takes load_id)
- Results: CreateLoadResult, UpdateLoadResult, DeleteLoadResult with oneof success/error

### Protocol helpers (already complete)
- `packages/protocol/src/transport.ts` exports: `createCreateLoadCommand(draft: Load)`, `createUpdateLoadCommand(load: Load)`, `createDeleteLoadCommand(loadId: string)`
- `packages/protocol/src/index.ts` re-exports all of these

### Engine (already complete)
- Engine handles CreateLoadCommand → stores load in MechanismState → returns CreateLoadResult with confirmed Load
- Engine compiles loads to Chrono forces during CompileMechanism
- MechanismSnapshot includes loads in the mechanism message

### Viewport (partial)
- `ForceArrowManager` in `packages/viewport/src/rendering/force-arrows.ts` creates arrow geometry (shaft + cone head)
- Currently only used for joint reaction forces during simulation
- Has `update(jointId, jointRootNode, data)`, `hideAll()`, `showAll()`, `clear()`, `dispose()`
- Force color: `FORCE_ARROW` from `colors.ts` — crimson. Torque color: `TORQUE_ARROW` from `colors.ts` — blue

### Mechanism store
- Has `bodies`, `datums`, `joints` Maps — but NO `loads` Map
- Has `addJoint`, `updateJoint`, `removeJoint` — but NO load equivalents

### connection.ts
- Has `sendCreateJoint`, `sendUpdateJoint`, `sendDeleteJoint` — but NO sendCreateLoad, sendUpdateLoad, sendDeleteLoad
- Has event handlers for createJointResult, updateJointResult, deleteJointResult — but NO load result handlers

### ProjectTree
- Shows bodies (with child datums) and joints — but NO loads

## What to Build

### 1. Add LoadState to mechanism store

In `packages/frontend/src/stores/mechanism.ts`:

```ts
export type LoadTypeId = 'point-force' | 'point-torque' | 'spring-damper';
export type ReferenceFrameId = 'datum-local' | 'world';

export interface LoadState {
  id: string;
  name: string;
  type: LoadTypeId;
  // Point force / point torque
  datumId?: string;
  vector?: { x: number; y: number; z: number };
  referenceFrame?: ReferenceFrameId;
  // Spring-damper
  parentDatumId?: string;
  childDatumId?: string;
  restLength?: number;
  stiffness?: number;
  damping?: number;
}
```

Add `loads: Map<string, LoadState>` to the store, plus `addLoad`, `updateLoad`, `removeLoad` actions. Follow the exact same pattern as joint CRUD in the store.

### 2. Wire load CRUD in connection.ts

Add send helpers following the joint pattern:

```ts
export function sendCreateLoad(load: LoadState): void {
  // Convert LoadState to protobuf Load message
  // Use createCreateLoadCommand from @motionlab/protocol
  // Send over WebSocket
}

export function sendUpdateLoad(load: LoadState): void { ... }
export function sendDeleteLoad(loadId: string): void { ... }
```

Add event handlers in the message switch for:
- `createLoadResult` — on success, call `mechStore.addLoad(...)` mapping proto Load to LoadState
- `updateLoadResult` — on success, call `mechStore.updateLoad(...)`
- `deleteLoadResult` — on success, call `mechStore.removeLoad(...)`

Mapping from proto to store:
- `Load.config.case === 'pointForce'` → type: 'point-force', datumId from config, vector from config, referenceFrame mapped
- `Load.config.case === 'pointTorque'` → type: 'point-torque', same pattern
- `Load.config.case === 'linearSpringDamper'` → type: 'spring-damper', parentDatumId, childDatumId, restLength, stiffness, damping

Mapping from store to proto (for send):
- Use `create(LoadSchema, { ... })` with the appropriate oneof config
- Reference the generated `PointForceLoadSchema`, `PointTorqueLoadSchema`, `LinearSpringDamperLoadSchema`
- Map ReferenceFrameId to proto `ReferenceFrame` enum

### 3. Populate loads from MechanismSnapshot

In the `mechanismSnapshot` event handler (which fires on project load and engine reconnect), iterate `mechanism.loads` and populate the store. Follow the same pattern as the existing joints population.

### 4. Load creation workflow — viewport-first with floating card

Create a "create load" mode that follows the same viewport-first pattern established in Epic 15's joint creation flow. **The viewport is the interface, not a viewer — force creation is a spatial operation.**

Add mode to tool-mode store:
```ts
type ToolMode = 'select' | 'create-datum' | 'create-joint' | 'create-load';
```

**Primary workflow (viewport-driven):**
1. User clicks "Add Force" button in the toolbar (keyboard shortcut `F`), or via datum/body context menu
2. Tool mode switches to `create-load`, cursor changes to crosshair
3. User clicks a datum in the viewport (or clicks a face to auto-create a datum, same shortcut as Epic 15)
4. A floating tool card appears **anchored near the clicked datum** (using `WorldSpaceOverlay` from Epic 14/15) with:
   - Load type selector: Point Force, Point Torque, Spring-Damper
   - For Point Force: magnitude (N) input, direction vector (x,y,z) inputs, reference frame toggle (World / Body-Local)
   - For Point Torque: magnitude (Nm) input, axis vector (x,y,z) inputs, reference frame toggle
   - For Spring-Damper: "Click a second datum" prompt → user clicks another datum → stiffness (N/m), damping (Ns/m), rest length (m) fields appear
5. **Live preview:** As the user fills in parameters, a ghost force arrow (or spring coil) appears in the viewport showing the direction, magnitude, and attachment point. The preview updates in real-time as values change.
6. User clicks "Create" → `sendCreateLoad(...)` sends the command
7. On success, load appears in viewport and tree. Stay in create-load mode for rapid authoring.
8. ESC exits create-load mode.

**Progressive disclosure:** The floating card shows only essential fields for the selected load type. Advanced properties (damping coefficients, effort limits) are edited later via the LoadInspector after creation.

**Fallback workflow (context menu):**
- "Create Load" in the datum context menu in ProjectTree also works — it opens the same floating card pre-targeted to the selected datum. This supports users who prefer the tree-first approach.

Create `packages/frontend/src/components/LoadCreationCard.tsx` (floating tool card, NOT a modal dialog):
- Uses `FloatingToolCard` from `@motionlab/ui`
- Props: `datumId: string` (pre-selected datum), `position: { x: number; y: number }` (screen coords near datum)
- Load type selector at top
- Dynamic fields based on selected type
- For spring-damper: a second datum picker (click another datum in viewport, not a dropdown)
- Create button sends the command
- Use NumericInput from @motionlab/ui

### 5. Load force visualization in viewport

Extend the existing `ForceArrowManager` or create a new `LoadVisualsManager` in `packages/viewport/src/rendering/`:

For **Point Force** loads:
- Arrow at the datum's world position
- Arrow direction = load vector (in world frame, or rotated by datum orientation if body-local)
- Arrow length proportional to magnitude: `len = clamp(magnitude * FORCE_SCALE, MIN_LEN, MAX_LEN)`
- Color: `FORCE_ARROW` from `colors.ts` (crimson)
- Arrow always visible in authoring mode (not just during simulation)

For **Point Torque** loads:
- Curved arrow (arc) around the torque axis at the datum position
- Color: `TORQUE_ARROW` from `colors.ts` (blue)
- Or reuse the straight arrow with a distinct head shape — simpler for now

For **Spring-Damper** loads:
- Line (or zigzag/coil) between the two datum world positions
- Color: `SPRING_NEUTRAL` from `colors.ts` (#4ade80 green) for neutral, transitioning toward red when compressed or blue when extended during simulation
- Label showing stiffness value (optional, can defer)

Integration with SceneGraphManager:
- Add `addLoadVisual(loadId, loadState)`, `updateLoadVisual(loadId, loadState)`, `removeLoadVisual(loadId)` methods
- Load visuals are parented to datum TransformNodes (so they move with the body during simulation)
- Force arrows must update during simulation as datum positions change (they are parented to the datum node, so transform is automatic)

For spring-damper visuals during simulation:
- The line/coil endpoints track the two datum world positions
- This requires a per-frame update: register a scene `onBeforeRender` callback to update the spring-damper line endpoints from the current datum node positions

### 6. Add loads to ProjectTree

Extend the tree node building in `ProjectTree.tsx`:

- Add a `LOADS_GROUP_ID = '__group_loads'` sentinel
- Under each body, show its loads (loads whose datumId belongs to a datum on that body)
- For spring-dampers, show under the parent datum's body
- Load nodes have type `'load'` with an icon (lucide `Zap` for force, `RotateCw` for torque, `GitBranchPlus` or similar for spring)
- Add `LoadContextMenu` with: Edit, Delete actions

Add to the delete handler: if `loads.has(id)`, call `sendDeleteLoad(id)`.

### 7. Handle selection of load entities

When a load is selected (via tree click or viewport pick), set the selection to the load's ID. The EntityInspector routing (Prompt 3) will show the LoadInspector.

For viewport picking of load visuals: load arrow meshes should be pickable and tagged with the load's entity ID, so the existing picking system resolves them.

## Architecture Constraints
- Protocol commands already exist — do NOT modify .proto files
- Force arrows are viewport-package rendering, not React components
- Load creation dialog is a frontend-package React component using @motionlab/ui
- Follow the existing entity CRUD pattern (command -> result -> store update)
- Force visualization must not leak into React render cycles — use Babylon scene graph parenting
- Use longhand Tailwind padding (ps-, pe-) not shorthand (px-) per project conventions
- Load visuals should be pickable but render in the same rendering group as joint visuals (group 1 = always on top)

## Done Looks Like
- User can create point force, point torque, and spring-damper loads from the UI
- Loads appear in the mechanism store and ProjectTree
- Force arrows render at datum positions in the viewport
- Spring-damper renders as a line between two datums
- Load CRUD round-trips through the engine (create -> result -> store -> viewport)
- Loads persist through save/load project (engine already handles this via MechanismSnapshot)
- Deleting a load removes it from store, tree, and viewport
- `pnpm --filter @motionlab/frontend typecheck` passes
- `pnpm --filter @motionlab/viewport typecheck` passes
- `pnpm --filter @motionlab/protocol typecheck` passes

## What NOT to Build
- LoadInspector component (that's Prompt 3)
- ActuatorInspector component (that's Prompt 2/3)
- Time-varying force profiles (future epic)
- Instanced rendering for many loads (optimize later if needed)
- Simulation-time load output channels (spring stretch, applied force) — deferred to Prompt 3 integration
```

---

## Prompt 2: Actuator Creation UI & Motor Visualization

```
# Epic 16 — Actuator Creation UI & Motor Visualization

You are implementing the frontend UI for creating, editing, and visualizing mechanism actuators (revolute motors and prismatic motors). The protocol commands and engine handling already exist — this is purely frontend work plus viewport visualization.

## Read These First (in order)
- `docs/architecture/principles.md` — engine is computational authority; React is not the hot path
- `packages/frontend/AGENTS.md` — frontend owns authoring UX
- `packages/viewport/AGENTS.md` — viewport owns visualization
- `packages/ui/AGENTS.md` — UI component conventions
- `schemas/mechanism/mechanism.proto` — Actuator, RevoluteMotorActuator, PrismaticMotorActuator, ActuatorControlMode
- `schemas/protocol/transport.proto` — CreateActuatorCommand, UpdateActuatorCommand, DeleteActuatorCommand and results
- `packages/protocol/src/transport.ts` — createCreateActuatorCommand, createUpdateActuatorCommand, createDeleteActuatorCommand already exist
- `packages/frontend/src/engine/connection.ts` — existing send helpers and event handlers
- `packages/frontend/src/stores/mechanism.ts` — JointState, mechanism store
- `packages/frontend/src/components/JointInspector.tsx` — joint inspector with type selector, limits, sim values
- `packages/frontend/src/components/ProjectTree.tsx` — tree with joint nodes

## What Exists Now

### Protocol (already complete)
- `mechanism.proto` defines `Actuator` message with oneof config: `RevoluteMotorActuator`, `PrismaticMotorActuator`
- `RevoluteMotorActuator`: joint_id, control_mode (POSITION/SPEED/EFFORT), command_value, optional effort_limit
- `PrismaticMotorActuator`: joint_id, control_mode, command_value, optional effort_limit
- `ActuatorControlMode` enum: UNSPECIFIED, POSITION, SPEED, EFFORT
- `transport.proto` defines CreateActuatorCommand (takes Actuator draft), UpdateActuatorCommand (takes Actuator), DeleteActuatorCommand (takes actuator_id)
- Results: CreateActuatorResult, UpdateActuatorResult, DeleteActuatorResult with oneof success/error

### Protocol helpers (already complete)
- `packages/protocol/src/transport.ts` exports: `createCreateActuatorCommand(draft: Actuator)`, `createUpdateActuatorCommand(actuator: Actuator)`, `createDeleteActuatorCommand(actuatorId: string)`

### Engine (already complete)
- Engine handles CreateActuatorCommand → stores actuator in MechanismState → returns CreateActuatorResult
- Engine compiles actuators to Chrono motor objects during CompileMechanism
- RevoluteMotorActuator → ChLinkMotorRotation (position), ChLinkMotorRotationSpeed (speed), or ChLinkMotorRotationTorque (effort)
- PrismaticMotorActuator → corresponding linear motor types

### Mechanism store
- Has `bodies`, `datums`, `joints` Maps — but NO `actuators` Map
- Has joint CRUD actions — but NO actuator equivalents

### connection.ts
- Has joint send helpers and result handlers — but NO actuator equivalents

### ProjectTree
- Shows joints as flat list under "Joints" group — no actuator children

### JointInspector
- Shows identity, connection (parent/child datums), limits, simulation values (position, velocity)
- No actuator section, no "Add Motor" button

## What to Build

### 1. Add ActuatorState to mechanism store

In `packages/frontend/src/stores/mechanism.ts`:

```ts
export type ActuatorTypeId = 'revolute-motor' | 'prismatic-motor';
export type ControlModeId = 'position' | 'speed' | 'effort';

export interface ActuatorState {
  id: string;
  name: string;
  type: ActuatorTypeId;
  jointId: string;
  controlMode: ControlModeId;
  commandValue: number;
  effortLimit?: number;
}
```

Add `actuators: Map<string, ActuatorState>` to the store, plus `addActuator`, `updateActuator`, `removeActuator` actions. Follow the same pattern as joint CRUD.

### 2. Wire actuator CRUD in connection.ts

Add send helpers:

```ts
export function sendCreateActuator(actuator: ActuatorState): void {
  // Convert ActuatorState to protobuf Actuator message
  // Map type + jointId + controlMode + commandValue to the appropriate oneof config
  // Use createCreateActuatorCommand from @motionlab/protocol
}

export function sendUpdateActuator(actuator: ActuatorState): void { ... }
export function sendDeleteActuator(actuatorId: string): void { ... }
```

Add event handlers in the message switch for:
- `createActuatorResult` — on success, map proto Actuator to ActuatorState, call `mechStore.addActuator(...)`
- `updateActuatorResult` — on success, call `mechStore.updateActuator(...)`
- `deleteActuatorResult` — on success, call `mechStore.removeActuator(...)`

Mapping from proto to store:
- `Actuator.config.case === 'revoluteMotor'` → type: 'revolute-motor', jointId from config.jointId.id, controlMode mapped from proto enum, commandValue, effortLimit
- `Actuator.config.case === 'prismaticMotor'` → type: 'prismatic-motor', same pattern

Mapping `ActuatorControlMode` enum:
- `ACTUATOR_CONTROL_MODE_POSITION` → 'position'
- `ACTUATOR_CONTROL_MODE_SPEED` → 'speed'
- `ACTUATOR_CONTROL_MODE_EFFORT` → 'effort'

### 3. Populate actuators from MechanismSnapshot

In the `mechanismSnapshot` handler, iterate `mechanism.actuators` and populate the store. Same pattern as joints/loads population.

### 4. Actuator creation workflow — from JointInspector

The natural place to create an actuator is from the joint it drives. Add an "Add Motor" button to JointInspector:

```tsx
// In JointInspector, after the Connection section:
{!isSimulating && !hasActuator && canHaveMotor && (
  <InspectorSection title="Actuation" icon={<Zap className="size-3.5" />}>
    <Button onClick={() => setShowCreateActuator(true)}>
      Add Motor
    </Button>
  </InspectorSection>
)}
```

Where:
- `hasActuator` checks if any actuator in the store references this jointId
- `canHaveMotor` is true for revolute and prismatic joints (not fixed, spherical, etc.)

Create `packages/frontend/src/components/CreateActuatorDialog.tsx`:
- Props: `jointId: string`, `jointType: JointTypeId`, `open: boolean`, `onClose: () => void`
- Auto-selects actuator type based on joint type (revolute → revolute-motor, prismatic → prismatic-motor)
- Control mode selector: Position, Speed, Effort (dropdown)
- Command value input with dynamic units:
  - Revolute + Position: rad
  - Revolute + Speed: rad/s
  - Revolute + Effort: Nm
  - Prismatic + Position: m
  - Prismatic + Speed: m/s
  - Prismatic + Effort: N
- Optional effort limit input (N or Nm)
- Auto-generated name: "Motor: {JointName}" (editable)
- Create button sends the command

Also add "Add Motor" to the joint context menu in ProjectTree (for revolute and prismatic joints only).

### 5. Motor visualization in viewport

Create `packages/viewport/src/rendering/motor-visuals.ts`:

For motor indication on joints:
- Small icon/badge near the joint visual: a circular arrow (for revolute) or linear arrow (for prismatic)
- Color: `MOTOR_INDICATOR` from `colors.ts` (amber #f59e0b) to distinguish from force arrows (crimson) and torque arrows (blue)
- The visual is parented to the joint's root TransformNode, offset slightly so it doesn't occlude the joint symbol
- During simulation: show the applied effort as a force/torque arrow at the joint location, using the ForceArrowManager or a dedicated arrow

For the initial implementation, a simpler approach is acceptable:
- Render a small colored ring or marker at the joint position to indicate "this joint has a motor"
- During simulation, the existing joint reaction force arrows (already in ForceArrowManager) can serve as motor effort visualization
- A full motor icon/glyph can be deferred to a polish pass

Integration with SceneGraphManager:
- Add `addMotorVisual(actuatorId, jointId)`, `removeMotorVisual(actuatorId)` methods
- Motor visual is parented to the joint's TransformNode
- Motor visual is pickable and tagged with the actuator entity ID

### 6. Add actuators to ProjectTree

Extend tree node building:
- Actuators appear as children of their parent joint node
- This means joints that have actuators need `hasChildren: true`
- Actuator nodes have type `'actuator'` with icon (lucide `Zap` or `Cog`)
- Add `ActuatorContextMenu` with: Edit (select to show inspector), Delete actions

For the tree structure:
```
Joints (2)
  ├─ Revolute1 [revolute]
  │    └─ Motor: Revolute1 [position]
  └─ Prismatic1 [prismatic]
```

The joint node's `hasChildren` should be true if any actuator in the store references that joint.

### 7. Actuator inline preview in JointInspector

When a joint has an associated actuator, show a summary in the JointInspector:

```tsx
{hasActuator && (
  <InspectorSection title="Motor" icon={<Zap className="size-3.5" />}>
    <PropertyRow label="Type">
      <span className="text-2xs">{actuator.type === 'revolute-motor' ? 'Revolute Motor' : 'Prismatic Motor'}</span>
    </PropertyRow>
    <PropertyRow label="Mode">
      <span className="text-2xs capitalize">{actuator.controlMode}</span>
    </PropertyRow>
    <PropertyRow label="Command" unit={commandUnit} numeric>
      <span className="font-[family-name:var(--font-mono)] tabular-nums">
        {formatEngValue(actuator.commandValue)}
      </span>
    </PropertyRow>
    <Button variant="ghost" size="sm" onClick={() => selectActuator(actuator.id)}>
      Edit Motor
    </Button>
    <Button variant="ghost" size="sm" onClick={() => sendDeleteActuator(actuator.id)}>
      Remove Motor
    </Button>
  </InspectorSection>
)}
```

This gives quick access without needing to navigate to the actuator in the tree.

## Architecture Constraints
- Protocol commands already exist — do NOT modify .proto files
- Actuator type is constrained by joint type: revolute joints get revolute motors, prismatic joints get prismatic motors
- A joint can have at most one actuator (enforce in UI; engine may also enforce)
- Motor visuals are viewport-package rendering, not React
- Actuator creation dialog is a frontend-package React component
- Follow existing entity CRUD pattern
- Time-varying motor profiles (function of time) are deferred to a future epic — constant command values only
- Use longhand Tailwind padding per project conventions

## Done Looks Like
- User can create a revolute motor on a revolute joint, and a prismatic motor on a prismatic joint
- Actuator control mode (position, speed, effort) is configurable
- Actuator command value has correct units based on joint type + control mode
- Actuators appear in the mechanism store and ProjectTree (under their joint)
- Motor visual indicator renders at the joint position in viewport
- Actuator CRUD round-trips through the engine
- JointInspector shows actuator summary when one exists
- Deleting an actuator removes it from store, tree, and viewport
- `pnpm --filter @motionlab/frontend typecheck` passes
- `pnpm --filter @motionlab/viewport typecheck` passes
- `pnpm --filter @motionlab/protocol typecheck` passes

## What NOT to Build
- Full ActuatorInspector component (that's Prompt 3)
- Live simulation readouts on actuator (effort applied, actual position) — Prompt 3
- Time-varying motor profiles — future epic
- Actuator output channels for trace visualization — Prompt 3 integration
- Load creation UI (that's Prompt 1)
```

---

## Prompt 3: Load & Actuator Inspectors + Full Entity Integration

```
# Epic 16 — Load & Actuator Inspectors + Full Entity Integration

You are building the inspector panels for loads and actuators, integrating them into the entity selection system, and wiring simulation output channels for live readouts. This prompt depends on Prompts 1 and 2 being complete.

## Read These First (in order)
- `docs/architecture/principles.md` — engine authority, React not on hot path
- `packages/frontend/AGENTS.md` — frontend owns authoring UX and inspection
- `packages/ui/AGENTS.md` — UI component conventions
- `packages/frontend/src/components/JointInspector.tsx` — reference for inspector structure, sim value display, inline editing
- `packages/frontend/src/components/BodyInspector.tsx` — reference for inspector with property rows
- `packages/frontend/src/components/DatumInspector.tsx` — reference for inspector with datum references
- `packages/frontend/src/stores/mechanism.ts` — LoadState, ActuatorState (from Prompts 1 & 2)
- `packages/frontend/src/stores/simulation.ts` — simulation state, channels
- `packages/frontend/src/stores/traces.ts` — trace store for live sim data
- `packages/frontend/src/engine/connection.ts` — sendUpdateLoad, sendUpdateActuator (from Prompts 1 & 2)

## What Exists Now (after Prompts 1 & 2)

### Mechanism store
- `loads: Map<string, LoadState>` with addLoad, updateLoad, removeLoad
- `actuators: Map<string, ActuatorState>` with addActuator, updateActuator, removeActuator
- LoadState: id, name, type, datumId, vector, referenceFrame, parentDatumId, childDatumId, restLength, stiffness, damping
- ActuatorState: id, name, type, jointId, controlMode, commandValue, effortLimit

### connection.ts
- sendCreateLoad, sendUpdateLoad, sendDeleteLoad
- sendCreateActuator, sendUpdateActuator, sendDeleteActuator
- Event handlers for all load/actuator CRUD results

### ProjectTree
- Loads appear under their parent body (Prompt 1)
- Actuators appear under their parent joint (Prompt 2)

### Viewport
- Force arrows for point forces/torques (Prompt 1)
- Spring-damper lines between datums (Prompt 1)
- Motor indicator on joints with actuators (Prompt 2)

### Entity selection
- Selection store manages selectedIds
- EntityInspector (or equivalent routing component) shows BodyInspector, DatumInspector, or JointInspector based on what's selected
- No routing for loads or actuators yet

## What to Build

### 1. LoadInspector component

Create `packages/frontend/src/components/LoadInspector.tsx`:

Follow the same structure as JointInspector:

```tsx
export function LoadInspector({ loadId }: { loadId: string }) {
  const load = useMechanismStore((s) => s.loads.get(loadId));
  const datum = useMechanismStore((s) =>
    load?.datumId ? s.datums.get(load.datumId) : undefined
  );
  // ... sim state, traces for live values
```

Sections:

**Identity section:**
- Name (inline editable, same pattern as JointInspector)
- Type indicator: "Point Force" / "Point Torque" / "Spring-Damper" (read-only after creation)
- Load ID (copyable)

**Application section (point force / point torque):**
- Parent Datum reference (datum name, clickable to select datum)
- Magnitude display (computed from vector)
- Direction vector inputs (X, Y, Z) — editable NumericInput, on change call `sendUpdateLoad`
- Reference Frame toggle: World / Body-Local (Select dropdown)
- Unit display: N for force, Nm for torque

**Application section (spring-damper):**
- Parent Datum reference (clickable)
- Child Datum reference (clickable)
- Rest Length input (m) — editable
- Stiffness input (N/m) — editable
- Damping input (Ns/m) — editable

**Simulation Values section (visible when simulating):**
For point force/torque:
- Applied Force/Torque vector (from output channels if available)

For spring-damper:
- Current Length (m) — from output channel
- Stretch (m) — currentLength - restLength
- Spring Force magnitude (N) — from output channel

Each editable field should:
- Use `NumericInput` from @motionlab/ui
- Be disabled during simulation (`isSimulating` check)
- Call the appropriate update function on change: `sendUpdateLoad({ ...load, vector: { ...load.vector, x: newVal } })`

### 2. ActuatorInspector component

Create `packages/frontend/src/components/ActuatorInspector.tsx`:

```tsx
export function ActuatorInspector({ actuatorId }: { actuatorId: string }) {
  const actuator = useMechanismStore((s) => s.actuators.get(actuatorId));
  const joint = useMechanismStore((s) =>
    actuator ? s.joints.get(actuator.jointId) : undefined
  );
  // ...
```

Sections:

**Identity section:**
- Name (inline editable)
- Type indicator: "Revolute Motor" / "Prismatic Motor" (read-only)
- Actuator ID (copyable)

**Configuration section:**
- Joint reference (joint name, clickable to select joint)
- Control Mode selector (dropdown: Position, Speed, Effort) — editable, on change call `sendUpdateActuator`
  - Changing control mode should update the displayed unit
- Command Value input with dynamic units:
  - Revolute + Position: rad
  - Revolute + Speed: rad/s
  - Revolute + Effort: Nm
  - Prismatic + Position: m
  - Prismatic + Speed: m/s
  - Prismatic + Effort: N
- Effort Limit input (optional, Nm or N) — editable

**Simulation Values section (visible when simulating):**
- Actual Position (from the joint's primary coordinate channel, for example `joint/{jointId}/coord/rot_z` or `joint/{jointId}/coord/trans_z`)
- Actual Velocity (from the matching rate channel, for example `joint/{jointId}/coord_rate/rot_z` or `joint/{jointId}/coord_rate/trans_z`)
- Applied Effort (from actuator output channel if available, or from joint reaction data)

Use the same `nearestSample` binary search pattern from JointInspector to look up trace values at the current sim time.

### 3. Entity selection routing

In the component that routes selection to inspectors (likely in `MechanismInspector.tsx` or a parent component), add cases for loads and actuators:

```tsx
// Determine what to show based on selected entity
const selectedId = selectedIds[0]; // single selection
if (bodies.has(selectedId)) return <BodyInspector bodyId={selectedId} />;
if (datums.has(selectedId)) return <DatumInspector datumId={selectedId} />;
if (joints.has(selectedId)) return <JointInspector jointId={selectedId} />;
if (loads.has(selectedId)) return <LoadInspector loadId={selectedId} />;
if (actuators.has(selectedId)) return <ActuatorInspector actuatorId={selectedId} />;
```

### 4. Context menu integration

Ensure ProjectTree context menus for loads and actuators include:
- **Load context menu:** Select in Viewport, Edit (selects to show inspector), Rename, Delete
- **Actuator context menu:** Select in Viewport, Edit (selects to show inspector), Rename, Delete

For the body context menu, add "Add Force" / "Add Load" action (triggers load creation dialog with a datum on that body pre-selected).

For the joint context menu (for revolute/prismatic joints without an actuator), add "Add Motor" action.

### 5. Datum context menu — "Add Force Here"

Extend the datum context menu with an "Add Force" option:
- Opens the CreateLoadDialog (from Prompt 1) with that datum pre-selected
- Only available when not simulating

This is the most natural entry point: right-click a datum → "Add Force Here" → configure and create.

### 6. Output channel integration

During simulation, the engine emits output channels. Load and actuator channels follow patterns like:
- `load/{loadId}/applied_force` — applied force vector for point force loads
- `load/{loadId}/applied_torque` — applied torque vector for point torque loads
- `load/{loadId}/length` — current spring length
- `load/{loadId}/length_rate` — current spring length rate
- `load/{loadId}/force` — spring force magnitude
- `actuator/{actuatorId}/command` — commanded value
- `actuator/{actuatorId}/effort` — applied effort

These channel IDs are defined by the engine during compilation (in `CompilationResultEvent.channels`). In the inspectors, look up channel descriptors that match the entity ID pattern and display their values.

If the engine does not yet emit these channels, the inspectors should gracefully handle missing data (show "Awaiting data..." or simply hide the sim values section — same pattern as JointInspector).

### 7. ProjectTree integration polish

Ensure loads and actuators are fully integrated:

- Loads under body nodes:
```
Bodies (2)
  ├─ Link1
  │    ├─ Datum1 [datum]
  │    ├─ Datum2 [datum]
  │    └─ Force1 [point-force]        ← load child of body
  └─ Link2
       ├─ Datum3 [datum]
       └─ Spring1 [spring-damper]     ← load child of body
```

- Actuators under joint nodes:
```
Joints (1)
  └─ Revolute1 [revolute]
       └─ Motor: Revolute1 [position] ← actuator child of joint
```

- Rename handling: for loads, call `sendUpdateLoad` with updated name. For actuators, call `sendUpdateActuator` with updated name.

### 8. Keyboard shortcuts

- Delete key on selected load → `sendDeleteLoad(loadId)`
- Delete key on selected actuator → `sendDeleteActuator(actuatorId)`
- These should already work if the delete handler in ProjectTree checks `loads.has(id)` and `actuators.has(id)`.

## Architecture Constraints
- Inspectors are React components in `packages/frontend/src/components/`
- Inspectors use @motionlab/ui primitives (InspectorPanel, InspectorSection, PropertyRow, NumericInput, Select, CopyableId, InlineEditableName)
- Live simulation values use the trace store + binary search pattern from JointInspector — not direct WebSocket reads
- Editable fields in inspectors dispatch update commands to the engine — the engine is authoritative
- All editable fields are disabled during simulation (mechanism is immutable while running)
- Use longhand Tailwind padding per project conventions
- Load and actuator entities are first-class in the selection system — selecting them in the tree or viewport shows their inspector

## Done Looks Like
- LoadInspector shows all load properties with correct units, editable when not simulating
- ActuatorInspector shows control mode, command value with dynamic units, editable when not simulating
- Selecting a load in the tree shows LoadInspector
- Selecting an actuator in the tree shows ActuatorInspector
- Context menus on loads/actuators provide Edit, Rename, Delete
- Datum context menu has "Add Force Here" action
- Joint context menu has "Add Motor" action (for compatible joint types without existing actuator)
- Delete key removes selected loads/actuators
- During simulation, inspectors show live values from trace channels (if available)
- Spring-damper inspector shows current length, stretch, force
- Actuator inspector shows actual position, velocity, applied effort
- All entities (body, datum, joint, load, actuator) have consistent selection/inspection UX
- `pnpm --filter @motionlab/frontend typecheck` passes
- `pnpm --filter @motionlab/viewport typecheck` passes

## What NOT to Build
- Time-varying force profiles or motor trajectories (future epic)
- Trace chart visualization for load/actuator channels (that's Epic 18)
- Instanced rendering optimizations for many loads
- New .proto changes — use existing protocol as-is
- Load/actuator creation from viewport click (clicking empty space) — use dialog-based creation for now
- Drag-and-drop reordering in the tree
```

---

## Integration Verification

After all three prompts complete, verify the full loads and actuators workflow:

1. **Import a STEP file** with at least two bodies
2. **Create datums** on both bodies (face-click or manual)
3. **Create a joint** between the bodies (revolute)
4. **Create a point force** on a datum (via datum context menu → "Add Force Here"):
   - Select Point Force type
   - Set magnitude and direction
   - Verify force arrow appears in viewport at datum position
   - Verify load appears in ProjectTree under the body
5. **Create a point torque** on another datum:
   - Verify torque arrow appears
6. **Create a spring-damper** between two datums:
   - Verify spring line renders between the two datum positions
   - Verify load appears in tree
7. **Create a revolute motor** on the revolute joint (via joint context menu → "Add Motor"):
   - Select Speed mode, set 1.0 rad/s
   - Verify motor indicator appears at joint in viewport
   - Verify actuator appears in tree under the joint
8. **Select entities and verify inspectors:**
   - Select the point force → LoadInspector with vector inputs, reference frame toggle
   - Select the spring-damper → LoadInspector with stiffness, damping, rest length inputs
   - Select the actuator → ActuatorInspector with control mode, command value
9. **Edit from inspector:**
   - Change force vector → arrow updates in viewport
   - Change control mode → unit label updates
   - Change command value → store updates
10. **Run simulation:**
    - Bodies move under applied force + motor
    - Force arrows remain visible and track body positions
    - Spring-damper line updates as bodies move apart/together
    - Inspector shows live sim values (if channels available)
    - Editable fields are disabled during simulation
11. **Delete entities:**
    - Delete load from context menu → removed from tree, store, viewport
    - Delete actuator → removed from tree, store, viewport, JointInspector actuator section clears
12. **Save and load project:**
    - Save project with loads and actuators
    - Load project → all loads and actuators restored in store, tree, viewport
13. **Typecheck:** `pnpm --filter @motionlab/frontend typecheck` and `pnpm --filter @motionlab/viewport typecheck` pass

## Future Work (out of scope)

- **Time-varying profiles (Epic 17+):** Motor command as a function of time (ramp, sine, step, CSV import). Force magnitude as time function. Requires a new `Profile` message type in the protocol.
- **Sensor integration:** Loads and actuators as first-class sensor sources (force sensor on a spring, torque sensor on a motor).
- **Trace visualization (Epic 18):** Plot load/actuator output channels over time in a chart panel.
- **Gravity as a load:** Expose gravity as a visible "gravity load" entity with an arrow, rather than a hidden simulation setting.
- **Contact forces:** Visualize contact forces between bodies during simulation (requires engine to emit contact data).
- **Multi-body spring networks:** Springs connecting more than two points — bushing elements.
