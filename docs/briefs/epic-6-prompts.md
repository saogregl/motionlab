# Epic 6 — Parallel Agent Prompts

> **Status:** Not Started

Four prompts. Largest epic. Prompt 3 can run in parallel with Prompts 1 and 2. Prompt 4 depends on all others.

**Governance note:** Epics 5+ are under full governance — every boundary or contract change requires an ADR, every protocol/schema change requires seam tests, every architecture change requires doc updates.

## Shared Contract

| Interface | Owner | Consumer |
|-----------|-------|----------|
| `CreateJointCommand`/Result, `UpdateJointCommand`, `DeleteJointCommand` | Prompt 1 (proto + engine) | Prompt 2 (frontend sends), Prompt 4 (save includes) |
| Joint entries in mechanism store | Prompt 1 (store updated) | Prompt 2 (joint UX reads), Prompt 3 (tree shows), Prompt 4 (save serializes) |
| Joint visualization in SceneGraphManager | Prompt 2 (viewport renders) | Prompt 3 (tree+viewport sync) |
| Project tree structure | Prompt 3 (creates full tree) | Prompt 2 (joint creation uses tree), Prompt 4 (save/load rebuilds tree) |
| `SaveProjectCommand`/`LoadProjectCommand` + file I/O | Prompt 4 (protocol + implementation) | All (integration test) |
| `openSaveDialog`/`openProject` preload API | Prompt 4 (Electron IPC) | Prompt 4 (frontend calls) |

Integration test: Author a mechanism (bodies + datums + joints) → save → close → reopen → all elements intact with correct IDs. **Validates Scenario C.**

---

## Prompt 1: Joint Protocol + Engine-Side CRUD

```
# Epic 6 — Joint Protocol and Engine-Side CRUD

You are implementing the joint CRUD protocol, engine-side joint management, and frontend store updates for MotionLab. Joints connect two datums on different bodies and define the kinematic relationship between them. Joint types include revolute, prismatic, and fixed.

## Read These First (in order)
- `docs/architecture/principles.md` — non-negotiable rules (engine is authority, joints reference datums not raw transforms)
- `docs/architecture/protocol-overview.md` — protocol contract rules
- `docs/domain/` — joint and mechanism domain docs
- `schemas/AGENTS.md` — schema ownership
- `packages/protocol/AGENTS.md` — generated bindings are read-only artifacts
- `native/engine/AGENTS.md` — native boundary rules, required checks
- Relevant ADRs under `docs/decisions/`

## Governance Reminder
This is Epic 6 — full governance applies:
- Any boundary or contract change requires an ADR
- Any protocol/schema change requires seam tests at the affected seam
- Any architecture change requires doc updates

## What Exists Now

### `schemas/protocol/transport.proto`
Command/Event oneofs with: kHandshake, kPing, kImportAsset, kCreateDatum, kDeleteDatum, kRenameDatum (added in Epic 5). You will add joint CRUD messages.

### `schemas/mechanism/mechanism.proto`
Full mechanism IR including Joint message: `{ id, name, type (JointType enum), parent_datum_id, child_datum_id, limits }`. JointType enum: REVOLUTE, PRISMATIC, FIXED. Joint limits exist but may need refinement (lower_limit, upper_limit fields).

### `native/engine/src/transport.cpp`
Command switch handles: kHandshake, kPing, kImportAsset, kCreateDatum, kDeleteDatum, kRenameDatum. You will add kCreateJoint, kUpdateJoint, kDeleteJoint cases.

### `native/engine/src/mechanism_state.h` / `.cpp`
After Epic 5: MechanismState class holding bodies and datums with CRUD operations. You will add joint management.

### `packages/frontend/src/stores/mechanism.ts`
Zustand store with `bodies: Map<string, BodyState>` and `datums: Map<string, DatumState>`. You will add joint state.

### `packages/frontend/src/engine/connection.ts`
WebSocket client. Handles events by `payload.case` switch. You will add cases for joint results.

### `packages/protocol/src/transport.ts`
Exports command creators for handshake, import, and datum CRUD. You will add joint command creators.

### `packages/protocol/src/index.ts`
Re-exports all protocol types and helpers.

## What to Build

### 1. Add joint CRUD messages to transport.proto

Add to the `Command` oneof:
```protobuf
// Joint authoring commands
CreateJointCommand create_joint = 20;
UpdateJointCommand update_joint = 21;
DeleteJointCommand delete_joint = 22;
```

Define the message types:
```protobuf
message CreateJointCommand {
  ElementId parent_datum_id = 1;
  ElementId child_datum_id = 2;
  JointType type = 3;
  string name = 4;
  double lower_limit = 5;
  double upper_limit = 6;
}

message UpdateJointCommand {
  ElementId joint_id = 1;
  // Fields to update — all optional, only set fields are applied
  optional string name = 2;
  optional JointType type = 3;
  optional double lower_limit = 4;
  optional double upper_limit = 5;
}

message DeleteJointCommand {
  ElementId joint_id = 1;
}
```

Add to the `Event` oneof:
```protobuf
CreateJointResult create_joint_result = 20;
UpdateJointResult update_joint_result = 21;
DeleteJointResult delete_joint_result = 22;
```

Define the result types:
```protobuf
message CreateJointResult {
  oneof result {
    Joint joint = 1;
    string error_message = 2;
  }
}

message UpdateJointResult {
  oneof result {
    Joint joint = 1;
    string error_message = 2;
  }
}

message DeleteJointResult {
  oneof result {
    ElementId deleted_id = 1;
    string error_message = 2;
  }
}
```

### 2. Run codegen

Run `pnpm generate:proto` and verify generated TS and C++ files include the new joint messages.

### 3. Engine-side joint management in MechanismState

Extend `native/engine/src/mechanism_state.h`:

```cpp
// Joint management
std::optional<motionlab::mechanism::Joint> createJoint(
    const std::string& parent_datum_id,
    const std::string& child_datum_id,
    motionlab::mechanism::JointType type,
    const std::string& name,
    double lower_limit,
    double upper_limit
);
std::optional<motionlab::mechanism::Joint> updateJoint(
    const std::string& joint_id,
    const std::optional<std::string>& name,
    const std::optional<motionlab::mechanism::JointType>& type,
    const std::optional<double>& lower_limit,
    const std::optional<double>& upper_limit
);
bool deleteJoint(const std::string& joint_id);
const motionlab::mechanism::Joint* getJoint(const std::string& id) const;

// Validation
bool areDatumsOnDifferentBodies(
    const std::string& datum_id_1,
    const std::string& datum_id_2
) const;
```

Add `std::unordered_map<std::string, motionlab::mechanism::Joint> joints_` to private members.

### 4. Engine-side validation rules

Joint creation must validate:
- `parent_datum_id` exists in the mechanism state
- `child_datum_id` exists in the mechanism state
- The two datums belong to different bodies (a body cannot be jointed to itself)
- Joint type is valid (REVOLUTE, PRISMATIC, or FIXED)
- For FIXED joints, limits are ignored
- For REVOLUTE/PRISMATIC joints, `lower_limit <= upper_limit`

Return descriptive error messages for each validation failure.

### 5. Engine-side command handlers

In `transport.cpp`, add cases to the command switch:

```cpp
case Command::kCreateJoint: {
    const auto& cmd = command.create_joint();
    auto result = mechanism_state_.createJoint(
        cmd.parent_datum_id().id(),
        cmd.child_datum_id().id(),
        cmd.type(),
        cmd.name(),
        cmd.lower_limit(),
        cmd.upper_limit()
    );
    Event event;
    event.set_sequence_id(command.sequence_id());
    auto* r = event.mutable_create_joint_result();
    if (result) {
        *r->mutable_joint() = *result;
    } else {
        r->set_error_message("Joint creation failed: <specific reason>");
    }
    sendEvent(event);
    break;
}

case Command::kUpdateJoint: {
    const auto& cmd = command.update_joint();
    // Extract optional fields, apply update
    auto result = mechanism_state_.updateJoint(
        cmd.joint_id().id(),
        cmd.has_name() ? std::optional(cmd.name()) : std::nullopt,
        cmd.has_type() ? std::optional(cmd.type()) : std::nullopt,
        cmd.has_lower_limit() ? std::optional(cmd.lower_limit()) : std::nullopt,
        cmd.has_upper_limit() ? std::optional(cmd.upper_limit()) : std::nullopt
    );
    Event event;
    event.set_sequence_id(command.sequence_id());
    auto* r = event.mutable_update_joint_result();
    if (result) {
        *r->mutable_joint() = *result;
    } else {
        r->set_error_message("Joint not found");
    }
    sendEvent(event);
    break;
}

case Command::kDeleteJoint: {
    const auto& cmd = command.delete_joint();
    Event event;
    event.set_sequence_id(command.sequence_id());
    auto* r = event.mutable_delete_joint_result();
    if (mechanism_state_.deleteJoint(cmd.joint_id().id())) {
        r->mutable_deleted_id()->set_id(cmd.joint_id().id());
    } else {
        r->set_error_message("Joint not found");
    }
    sendEvent(event);
    break;
}
```

### 6. Update mechanism Zustand store

In `packages/frontend/src/stores/mechanism.ts`, add joint state:

```ts
interface JointState {
  id: string;
  name: string;
  type: 'revolute' | 'prismatic' | 'fixed';
  parentDatumId: string;
  childDatumId: string;
  lowerLimit: number;
  upperLimit: number;
}

interface MechanismStore {
  // existing
  bodies: Map<string, BodyState>;
  datums: Map<string, DatumState>;
  // new
  joints: Map<string, JointState>;
  addJoint(joint: JointState): void;
  updateJoint(id: string, updates: Partial<Omit<JointState, 'id'>>): void;
  removeJoint(id: string): void;
}
```

### 7. Handle joint events in connection.ts

Add cases to the event payload switch:

```ts
case 'createJointResult': {
  const result = payload.value;
  if (result.result.case === 'joint') {
    const joint = result.result.value;
    useMechanismStore.getState().addJoint({
      id: joint.id!.id,
      name: joint.name,
      type: mapJointType(joint.type),
      parentDatumId: joint.parentDatumId!.id,
      childDatumId: joint.childDatumId!.id,
      lowerLimit: joint.lowerLimit ?? 0,
      upperLimit: joint.upperLimit ?? 0,
    });
  } else {
    console.error('[connection] CreateJoint failed:', result.result.value);
  }
  break;
}

case 'updateJointResult': {
  const result = payload.value;
  if (result.result.case === 'joint') {
    const joint = result.result.value;
    useMechanismStore.getState().updateJoint(joint.id!.id, {
      name: joint.name,
      type: mapJointType(joint.type),
      lowerLimit: joint.lowerLimit ?? 0,
      upperLimit: joint.upperLimit ?? 0,
    });
  }
  break;
}

case 'deleteJointResult': {
  const result = payload.value;
  if (result.result.case === 'deletedId') {
    useMechanismStore.getState().removeJoint(result.result.value.id);
  }
  break;
}
```

### 8. Add protocol helper functions

In `packages/protocol/src/transport.ts`, add:

```ts
export function createCreateJointCommand(
  parentDatumId: string,
  childDatumId: string,
  type: JointType,
  name: string,
  lowerLimit: number,
  upperLimit: number,
  sequenceId: bigint
): Uint8Array { ... }

export function createUpdateJointCommand(
  jointId: string,
  updates: { name?: string; type?: JointType; lowerLimit?: number; upperLimit?: number },
  sequenceId: bigint
): Uint8Array { ... }

export function createDeleteJointCommand(
  jointId: string,
  sequenceId: bigint
): Uint8Array { ... }
```

Add `sendCreateJoint`, `sendUpdateJoint`, `sendDeleteJoint` convenience methods in `connection.ts`.

### 9. Write protocol seam tests

Add tests that cover:
1. Create a joint between two datums on different bodies → success, returns Joint with UUIDv7 ID
2. Create a joint between two datums on the same body → error message
3. Create a joint with nonexistent datum IDs → error message
4. Update a joint's name and type → success, returns updated Joint
5. Update a nonexistent joint → error message
6. Delete a joint → success, returns deleted ID
7. Delete a nonexistent joint → error message
8. Create a REVOLUTE joint with lower_limit > upper_limit → error message

### 10. Write ADR for joint creation contract

Document:
- Joints reference datums, NOT raw transforms or body IDs directly
- Engine validates referential integrity (both datums must exist, must be on different bodies)
- UUIDv7 IDs generated engine-side
- Create/Update/Delete follow the Command→Result pattern
- Update uses optional fields — only set fields are applied

## Architecture Constraints
- Engine is authoritative — joint creation happens in the engine, frontend receives confirmation
- Joints reference datums, NOT raw transforms — this is a core domain rule
- Engine validates referential integrity: both datums must exist and belong to different bodies
- UUIDv7 for joint IDs generated engine-side
- Frontend store is a projection of engine state, updated via events

## Done Looks Like
- `pnpm generate:proto` generates updated TS and C++ with joint messages
- Engine can create joints between datums on different bodies
- Engine rejects invalid joint configurations with descriptive errors
- Engine can update joint properties (name, type, limits)
- Engine can delete joints
- Frontend mechanism store reflects joint state from engine events
- Protocol seam tests pass for all joint CRUD operations
- `cmake --preset dev && cmake --build build/dev` succeeds
- `ctest --preset dev` passes with joint tests
- `pnpm --filter @motionlab/protocol typecheck` passes
- `pnpm --filter @motionlab/frontend typecheck` passes

## What NOT to Build
- Joint creation UX or tool mode (that's Prompt 2)
- Viewport joint visualization (that's Prompt 2)
- Tree UI for joints (that's Prompt 3)
- Save/load (that's Prompt 4)
- Simulation or physics
- Joint limits enforcement at runtime (future)
```

---

## Prompt 2: Joint Authoring UX + Viewport Visualization

```
# Epic 6 — Joint Authoring UX and Viewport Visualization

You are implementing the interactive joint creation flow and joint rendering in the viewport. Users select two datums, choose a joint type, and the joint is created and visualized. This prompt also adds the JointInspector for editing joint properties.

## Read These First (in order)
- `docs/architecture/principles.md` — React is NOT the hot path for viewport; engine is authority
- `packages/viewport/AGENTS.md` — viewport owns visualization
- `packages/frontend/AGENTS.md` — frontend owns workbench UX
- `packages/ui/AGENTS.md` — UI primitives available (Dialog, DropdownMenu, etc.)
- Relevant ADRs under `docs/decisions/`

## Governance Reminder
This is Epic 6 — full governance applies:
- Any boundary or contract change requires an ADR
- Any protocol/schema change requires seam tests at the affected seam
- Any architecture change requires doc updates

## What Exists Now

### `packages/frontend/src/stores/tool-mode.ts`
After Epic 5: tool mode store with 'select' and 'create-datum' modes. You will add 'create-joint' mode.

### `packages/viewport/src/scene-graph.ts`
After Epic 5: SceneGraphManager with `addBody`, `removeBody`, `addDatum`, `removeDatum`, entity map. You will add joint rendering.

### `packages/viewport/src/picking.ts`
After Epic 5: PickingManager with mode-based pick handling, supports body and datum picking. You will extend for joint picking and the two-datum selection flow.

### `packages/frontend/src/stores/mechanism.ts`
After Prompt 1: Zustand store with `bodies`, `datums`, and `joints` Maps.

### `packages/frontend/src/stores/selection.ts`
After Epic 5: Selection store supporting body and datum selection. You will extend for joint selection.

### `packages/frontend/src/engine/connection.ts`
After Prompt 1: has `sendCreateJoint`, `sendUpdateJoint`, `sendDeleteJoint`.

### `packages/ui/src/`
UI components: Button, Toggle, Dialog, DropdownMenu, ContextMenu, Tabs, PropertyRow, InspectorPanel, InspectorSection, etc.

### `schemas/mechanism/mechanism.proto`
Joint message with type (REVOLUTE, PRISMATIC, FIXED), parent_datum_id, child_datum_id, limits.

## What to Build

### 1. Add 'create-joint' to tool mode store

Update `packages/frontend/src/stores/tool-mode.ts`:

```ts
type ToolMode = 'select' | 'create-datum' | 'create-joint';
```

Add a "Create Joint" toggle button to the tool mode toolbar alongside "Select" and "Create Datum".

### 2. Joint creation flow — two-datum selection

When `activeMode === 'create-joint'`:

**Step 1 — Select parent datum:**
- Clicking a datum in the viewport or tree highlights it as the "parent datum"
- Show visual feedback: the selected datum triad gets a distinct highlight (e.g., pulsing glow or outline)
- Show a status message: "Select parent datum..." → "Parent: [datum name]. Select child datum..."

**Step 2 — Select child datum:**
- Clicking a second datum (must be on a different body) triggers the joint creation dialog
- If the user clicks a datum on the same body, show an error toast/message: "Child datum must be on a different body"
- If the user clicks something that is not a datum, ignore or show a hint

**Step 3 — Joint configuration dialog:**
- Open a Dialog (from @motionlab/ui) with:
  - Joint type selector: radio group or DropdownMenu with Revolute, Prismatic, Fixed
  - Name field: auto-generated default "Joint 1", "Joint 2", etc. (editable)
  - Limit fields: lower and upper limits (number inputs). Shown only for Revolute and Prismatic. Hidden for Fixed.
  - Confirm/Cancel buttons
- On confirm: call `sendCreateJoint(parentDatumId, childDatumId, type, name, lowerLimit, upperLimit)`
- On cancel: reset selection, stay in create-joint mode

**Reset/escape:**
- Pressing Escape at any step cancels and returns to select mode
- After successful joint creation, reset the two-datum selection state but stay in create-joint mode for rapid authoring

### 3. Joint creation state management

Create a local state for the multi-step flow (this is transient UI state, not in the mechanism store):

```ts
interface JointCreationState {
  step: 'select-parent' | 'select-child' | 'configure';
  parentDatumId: string | null;
  childDatumId: string | null;
}
```

This can be a separate small Zustand store or local React state in the joint creation component. Prefer Zustand if the viewport needs to read it for visual feedback.

### 4. Joint visualization in SceneGraphManager

Add `addJoint(id, parentDatumWorldPose, childDatumWorldPose, jointType)` to SceneGraphManager:

```ts
addJoint(
  id: string,
  parentDatumId: string,
  childDatumId: string,
  jointType: 'revolute' | 'prismatic' | 'fixed'
): void {
  const parentEntity = this.getEntity(parentDatumId);
  const childEntity = this.getEntity(childDatumId);

  // Create visual connector between the two datums
  switch (jointType) {
    case 'revolute':
      // Render an arc/ring around the joint axis
      // The joint axis is the Z-axis of the parent datum
      // Use a Torus or arc mesh, colored orange/yellow
      break;
    case 'prismatic':
      // Render an arrow along the joint axis
      // Use a cylinder + cone, colored cyan
      break;
    case 'fixed':
      // Render a rigid bar/beam connecting the two datums
      // Use a cylinder mesh, colored gray
      break;
  }

  // Joint visual positioned between the two datums
  // Store entity reference for picking
  this.entities.set(id, { type: 'joint', mesh: jointMesh, ... });
}

updateJoint(id: string, jointType: 'revolute' | 'prismatic' | 'fixed'): void {
  // Rebuild visual if joint type changed
}

removeJoint(id: string): void {
  const entity = this.entities.get(id);
  if (entity) {
    entity.mesh.dispose();
    this.entities.delete(id);
  }
}
```

Joint visuals should update when parent or child datums move (via Babylon's scene graph parenting or a beforeRender update loop).

### 5. Joint picking and selection

Extend PickingManager:
- Joint visual meshes are clickable
- In select mode: clicking a joint visual selects the joint
- Map joint meshes back to joint IDs via metadata or entity map
- Selection store tracks joint selection alongside body and datum selection

### 6. JointInspector component

Create `packages/frontend/src/components/JointInspector.tsx`:

```tsx
function JointInspector({ jointId }: { jointId: string }) {
  const joint = useMechanismStore((s) => s.joints.get(jointId));
  const parentDatum = useMechanismStore((s) => s.datums.get(joint?.parentDatumId ?? ''));
  const childDatum = useMechanismStore((s) => s.datums.get(joint?.childDatumId ?? ''));

  if (!joint) return null;

  return (
    <InspectorPanel title="Joint">
      <InspectorSection title="Identity">
        <PropertyRow label="Name">
          <InlineEdit
            value={joint.name}
            onCommit={(name) => sendUpdateJoint(jointId, { name })}
          />
        </PropertyRow>
        <PropertyRow label="Type">
          <DropdownMenu
            value={joint.type}
            options={[
              { value: 'revolute', label: 'Revolute' },
              { value: 'prismatic', label: 'Prismatic' },
              { value: 'fixed', label: 'Fixed' },
            ]}
            onValueChange={(type) => sendUpdateJoint(jointId, { type })}
          />
        </PropertyRow>
      </InspectorSection>
      <InspectorSection title="Connection">
        <PropertyRow label="Parent Datum">
          <span>{parentDatum?.name ?? 'Unknown'}</span>
        </PropertyRow>
        <PropertyRow label="Child Datum">
          <span>{childDatum?.name ?? 'Unknown'}</span>
        </PropertyRow>
      </InspectorSection>
      {joint.type !== 'fixed' && (
        <InspectorSection title="Limits">
          <PropertyRow label="Lower Limit">
            <NumberInput
              value={joint.lowerLimit}
              onCommit={(v) => sendUpdateJoint(jointId, { lowerLimit: v })}
            />
          </PropertyRow>
          <PropertyRow label="Upper Limit">
            <NumberInput
              value={joint.upperLimit}
              onCommit={(v) => sendUpdateJoint(jointId, { upperLimit: v })}
            />
          </PropertyRow>
        </InspectorSection>
      )}
    </InspectorPanel>
  );
}
```

Wire the right sidebar inspector to show JointInspector when a joint is selected.

### 7. Joint deletion

- Select a joint → press Delete key → sends DeleteJointCommand
- Right-click joint in viewport → context menu → "Delete" → sends DeleteJointCommand
- On deletion: SceneGraphManager.removeJoint() called, store updates, inspector clears

### 8. Selection highlight for joints

When a joint is selected:
- Highlight the joint visual (brighter color, glow, or outline)
- Consistent with body and datum highlight approach

## Architecture Constraints
- Joint visuals are viewport artifacts — the viewport renders what the mechanism store contains
- Joint creation always goes through the engine for validation — the frontend never creates joints locally
- Selection works identically across bodies, datums, and joints
- The viewport package must not import from `@motionlab/frontend` — use callbacks/events
- Tool mode state is frontend-only — not part of the protocol

## Done Looks Like
- "Create Joint" mode available in toolbar alongside Select and Create Datum
- Full two-datum selection flow works: click parent datum → click child datum → dialog → confirm → joint created
- Same-body datum pair is rejected with clear feedback
- Joint visuals render in viewport: revolute (arc), prismatic (arrow), fixed (bar)
- Joint visuals are clickable and selectable
- JointInspector shows joint properties with inline editing
- Can change joint type, name, and limits from inspector
- Can delete joints via Delete key or context menu
- `pnpm --filter @motionlab/frontend typecheck` passes
- `pnpm --filter @motionlab/viewport typecheck` passes

## What NOT to Build
- Save/load (that's Prompt 4)
- Project tree UI for joints (that's Prompt 3)
- Simulation or physics
- Joint limit visualization (future)
- Joint axis dragging or reorientation (future)
- Undo/redo (future)
```

---

## Prompt 3: Full Project Tree UI (can run parallel with 6.1/6.2)

```
# Epic 6 — Full Project Tree UI

You are refactoring the body tree into a comprehensive project tree that displays the full mechanism hierarchy: bodies, datums, and joints. This prompt also adds context menus, inline rename, multi-select, and bidirectional selection sync with the viewport.

This prompt can run in parallel with Prompts 1 and 2. It consumes the mechanism store interface (bodies, datums, joints Maps) but does not depend on joint creation UX or visualization.

## Read These First (in order)
- `docs/architecture/principles.md` — tree state derived from model, no duplication
- `packages/frontend/AGENTS.md` — frontend owns workbench UX
- `packages/ui/AGENTS.md` — UI primitives: TreeView, TreeRow, ContextMenu, etc.
- Relevant ADRs under `docs/decisions/`

## Governance Reminder
This is Epic 6 — full governance applies:
- Any boundary or contract change requires an ADR
- Any architecture change requires doc updates

## What Exists Now

### `packages/frontend/src/components/BodyTree.tsx`
After Epic 5: shows bodies with child datums using TreeView from @motionlab/ui. Supports single selection synced with viewport. You will replace this with a full ProjectTree.

### `packages/frontend/src/stores/mechanism.ts`
Zustand store with:
- `bodies: Map<string, BodyState>`
- `datums: Map<string, DatumState>` (each has `parentBodyId`)
- `joints: Map<string, JointState>` (each has `parentDatumId`, `childDatumId`, after Prompt 1)

### `packages/frontend/src/stores/selection.ts`
Selection store: `selectedIds`, `hoveredId`, `select`, `deselect`, `toggle`. Supports body and datum selection (after Epic 5).

### `packages/frontend/src/engine/connection.ts`
Exposes send functions: `sendCreateDatum`, `sendDeleteDatum`, `sendRenameDatum`, and (after Prompt 1) `sendCreateJoint`, `sendUpdateJoint`, `sendDeleteJoint`.

### `packages/frontend/src/stores/tool-mode.ts`
Tool mode store with select, create-datum, and (after Prompt 2) create-joint modes.

### `packages/ui/src/`
UI components: TreeView, TreeRow, ContextMenu, Button, Dialog, etc.

## What to Build

### 1. ProjectTree component

Replace BodyTree with `packages/frontend/src/components/ProjectTree.tsx`:

```tsx
function ProjectTree() {
  const bodies = useMechanismStore((s) => s.bodies);
  const datums = useMechanismStore((s) => s.datums);
  const joints = useMechanismStore((s) => s.joints);
  const { selectedIds, select, toggle } = useSelectionStore();

  // Group datums by parent body
  const datumsByBody = groupBy(datums, (d) => d.parentBodyId);

  return (
    <TreeView>
      {/* Mechanism root node */}
      <TreeRow id="mechanism-root" label="Mechanism" icon={<MechanismIcon />} defaultExpanded>

        {/* Bodies with child datums */}
        {Array.from(bodies.values()).map((body) => (
          <TreeRow
            key={body.id}
            id={body.id}
            label={body.name}
            icon={<BodyIcon />}
            selected={selectedIds.has(body.id)}
            onSelect={() => select(body.id)}
            contextMenu={<BodyContextMenu bodyId={body.id} />}
          >
            {(datumsByBody.get(body.id) ?? []).map((datum) => (
              <TreeRow
                key={datum.id}
                id={datum.id}
                label={datum.name}
                icon={<DatumIcon />}
                selected={selectedIds.has(datum.id)}
                onSelect={() => select(datum.id)}
                contextMenu={<DatumContextMenu datumId={datum.id} />}
              />
            ))}
          </TreeRow>
        ))}

        {/* Joints group */}
        {joints.size > 0 && (
          <TreeRow id="joints-group" label="Joints" icon={<JointsGroupIcon />} defaultExpanded>
            {Array.from(joints.values()).map((joint) => (
              <TreeRow
                key={joint.id}
                id={joint.id}
                label={joint.name}
                icon={<JointTypeIcon type={joint.type} />}
                selected={selectedIds.has(joint.id)}
                onSelect={() => select(joint.id)}
                contextMenu={<JointContextMenu jointId={joint.id} />}
              />
            ))}
          </TreeRow>
        )}
      </TreeRow>
    </TreeView>
  );
}
```

### 2. Tree item icons

Create type-specific icons for tree items:
- **Body**: solid cube or mesh icon
- **Datum**: coordinate axes / triad icon
- **Joint (revolute)**: rotation arrow icon
- **Joint (prismatic)**: linear arrow icon
- **Joint (fixed)**: lock or rigid bar icon
- **Mechanism root**: assembly / gears icon
- **Joints group**: folder or chain icon

Use simple SVG icons or emoji placeholders initially. Icons can be refined later.

### 3. Context menus

**Body context menu:**
```tsx
function BodyContextMenu({ bodyId }: { bodyId: string }) {
  return (
    <ContextMenu>
      <ContextMenu.Item onSelect={() => enterCreateDatumOnBody(bodyId)}>
        Create Datum
      </ContextMenu.Item>
      <ContextMenu.Item onSelect={() => startRename(bodyId)}>
        Rename
      </ContextMenu.Item>
      <ContextMenu.Separator />
      <ContextMenu.Item onSelect={() => sendDeleteBody(bodyId)} variant="destructive">
        Delete
      </ContextMenu.Item>
    </ContextMenu>
  );
}
```

**Datum context menu:**
```tsx
function DatumContextMenu({ datumId }: { datumId: string }) {
  return (
    <ContextMenu>
      <ContextMenu.Item onSelect={() => startRename(datumId)}>
        Rename
      </ContextMenu.Item>
      <ContextMenu.Separator />
      <ContextMenu.Item onSelect={() => sendDeleteDatum(datumId)} variant="destructive">
        Delete
      </ContextMenu.Item>
    </ContextMenu>
  );
}
```

**Joint context menu:**
```tsx
function JointContextMenu({ jointId }: { jointId: string }) {
  return (
    <ContextMenu>
      <ContextMenu.Item onSelect={() => openJointEditor(jointId)}>
        Edit Properties
      </ContextMenu.Item>
      <ContextMenu.Item onSelect={() => startRename(jointId)}>
        Rename
      </ContextMenu.Item>
      <ContextMenu.Separator />
      <ContextMenu.Item onSelect={() => sendDeleteJoint(jointId)} variant="destructive">
        Delete
      </ContextMenu.Item>
    </ContextMenu>
  );
}
```

**Mechanism root context menu:**
```tsx
function MechanismContextMenu() {
  return (
    <ContextMenu>
      <ContextMenu.Item onSelect={() => setMode('create-joint')}>
        Create Joint
      </ContextMenu.Item>
      <ContextMenu.Item onSelect={() => triggerImportDialog()}>
        Import Body
      </ContextMenu.Item>
    </ContextMenu>
  );
}
```

### 4. Inline rename

Double-click a tree item name to enter inline edit mode:
- Replace the label span with a text input
- Pre-select all text
- On Enter or blur: commit the rename (send appropriate command: RenameDatum, UpdateJoint name, etc.)
- On Escape: cancel and revert

```tsx
function InlineRenameRow({ id, label, onRename }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { onRename(value); setEditing(false); }
          if (e.key === 'Escape') { setValue(label); setEditing(false); }
        }}
        onBlur={() => { onRename(value); setEditing(false); }}
      />
    );
  }

  return <span onDoubleClick={() => setEditing(true)}>{label}</span>;
}
```

### 5. Multi-select

Extend the selection store to support multi-select:
- **Click**: select single item (deselect others)
- **Ctrl+Click**: toggle item in selection (add or remove without deselecting others)
- **Shift+Click**: select range from last selected to clicked item (in tree order)

Update `packages/frontend/src/stores/selection.ts`:

```ts
interface SelectionStore {
  selectedIds: Set<string>;
  lastSelectedId: string | null;
  hoveredId: string | null;
  select(id: string): void;           // single select
  toggleSelect(id: string): void;     // ctrl+click
  rangeSelect(id: string, orderedIds: string[]): void;  // shift+click
  deselect(id: string): void;
  clearSelection(): void;
}
```

### 6. Bidirectional selection sync

**Tree → Viewport:** Clicking an item in the tree selects it in the selection store. The viewport reads the selection store and highlights the corresponding entity.

**Viewport → Tree:** Clicking an entity in the viewport selects it in the selection store. The tree reads the selection store and highlights the corresponding row, scrolling it into view if needed.

This already partially exists from Epic 5. Verify it works for all entity types (body, datum, joint) and for multi-select.

### 7. Empty state

When no bodies are imported, show a helpful empty state:

```tsx
{bodies.size === 0 ? (
  <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4 text-center">
    <p className="text-sm">No bodies in the mechanism</p>
    <Button variant="outline" size="sm" onClick={triggerImportDialog} className="mt-2">
      Import a CAD file
    </Button>
  </div>
) : (
  <TreeView>...</TreeView>
)}
```

### 8. Delete key handler

Wire the Delete key to delete selected items:
- If selected item is a datum → sendDeleteDatum
- If selected item is a joint → sendDeleteJoint
- If selected item is a body → sendDeleteBody (if supported)
- If multiple items selected → delete all (send commands sequentially)

```ts
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Delete' && selectedIds.size > 0) {
      for (const id of selectedIds) {
        const entity = resolveEntityType(id); // look up in bodies, datums, joints
        switch (entity.type) {
          case 'datum': sendDeleteDatum(id); break;
          case 'joint': sendDeleteJoint(id); break;
          // body deletion if supported
        }
      }
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [selectedIds]);
```

## Architecture Constraints
- Tree state is derived from the mechanism store — no duplicated entity state in the tree component
- Tree operations dispatch to the engine via commands — no local-only mutations
- Context menu actions go through the same command flow as toolbar actions
- The tree is a React component; viewport is Babylon — they communicate through the shared Zustand selection store
- The ProjectTree replaces BodyTree — remove the old component

## Done Looks Like
- Full project tree shows: Mechanism root → Bodies (with child Datums) → Joints group
- Each entity type has a distinct icon
- Context menus work for all entity types with appropriate actions
- Inline rename works via double-click on any renamable entity
- Multi-select works (Ctrl+click, Shift+click)
- Selection syncs bidirectionally between tree and viewport
- Delete key deletes selected items
- Empty state shows when no bodies are imported
- `pnpm --filter @motionlab/frontend typecheck` passes

## What NOT to Build
- Drag-and-drop reordering (stretch goal, not MVP)
- Tree filtering or search
- Save/load (that's Prompt 4)
- Undo/redo
- Body reparenting or datum reassignment
```

---

## Prompt 4: Basic Save/Load — Validation Scenario C

```
# Epic 6 — Basic Save/Load (Validation Scenario C)

You are implementing project save and load for MotionLab. This is the foundation for persistence: serialize the entire mechanism state (bodies, datums, joints, asset references) to a `.motionlab` project file, and restore it on load. This prompt depends on all other Epic 6 prompts and validates the full authoring pipeline.

## Read These First (in order)
- `docs/architecture/principles.md` — engine is authority for serialization, simulation runs are immutable
- `docs/architecture/protocol-overview.md` — protocol contract rules
- `docs/architecture/runtime-topology.md` — Electron is shell and supervisor, not data bus
- `apps/AGENTS.md` — Electron preload surface rules, IPC patterns
- `native/engine/AGENTS.md` — native boundary rules
- `schemas/AGENTS.md` — schema ownership
- Relevant ADRs under `docs/decisions/`

## Governance Reminder
This is Epic 6 — full governance applies:
- Any boundary or contract change requires an ADR
- Any protocol/schema change requires seam tests at the affected seam
- Any architecture change requires doc updates
- This prompt changes the protocol, Electron IPC, and engine persistence boundary — ADR required

## What Exists Now

### `schemas/protocol/transport.proto`
Command/Event oneofs with handshake, ping, import, datum CRUD, and (after Prompt 1) joint CRUD messages.

### `schemas/mechanism/mechanism.proto`
Full mechanism IR: Body, Datum, Joint, Mechanism, MassProperties, AssetReference, ProjectMetadata. The Mechanism message can hold the full mechanism graph.

### `native/engine/src/mechanism_state.h` / `.cpp`
After Epics 5-6: MechanismState class holding bodies, datums, and joints. Can serialize its state to/from protobuf.

### `native/engine/src/transport.cpp`
Handles all existing commands. You will add save/load handlers.

### `packages/frontend/src/stores/mechanism.ts`
Zustand store with bodies, datums, joints. You will add project metadata and a mechanism rebuild function for load.

### `packages/frontend/src/engine/connection.ts`
WebSocket client. You will add save/load command senders and result handlers.

### `apps/desktop/src/main.ts`
Electron main process. Spawns engine, handles IPC. Currently has `show-open-dialog` IPC handler for file import. You will add save/load file I/O handlers.

### `apps/desktop/src/preload.ts`
Exposes `window.motionlab.getEngineEndpoint()` and `showOpenDialog()`. You will add save/load preload APIs.

## What to Build

### 1. Define ProjectFile message

Add to `schemas/mechanism/mechanism.proto` (or create `schemas/project/project.proto` if a separate schema module is cleaner):

```protobuf
message ProjectFile {
  uint32 version = 1;              // File format version (start at 1)
  ProjectMetadata metadata = 2;     // Project name, timestamps
  Mechanism mechanism = 3;          // Full mechanism graph
  repeated AssetReference assets = 4; // Referenced CAD assets
}
```

Ensure `ProjectMetadata` has:
```protobuf
message ProjectMetadata {
  string name = 1;
  int64 created_at = 2;   // Unix timestamp millis
  int64 modified_at = 3;  // Unix timestamp millis
}
```

Ensure `AssetReference` has:
```protobuf
message AssetReference {
  string content_hash = 1;    // SHA-256 of the original file
  string relative_path = 2;   // Path relative to project directory
  string original_filename = 3;
}
```

### 2. Add save/load messages to transport.proto

Add to Command oneof:
```protobuf
SaveProjectCommand save_project = 30;
LoadProjectCommand load_project = 31;
```

Add to Event oneof:
```protobuf
SaveProjectResult save_project_result = 30;
LoadProjectResult load_project_result = 31;
```

Define messages:
```protobuf
message SaveProjectCommand {
  // Empty — engine serializes its current state
  // Metadata (name, etc.) is set from the mechanism store or provided here
  string project_name = 1;
}

message SaveProjectResult {
  oneof result {
    bytes project_data = 1;       // Binary protobuf of ProjectFile
    string error_message = 2;
  }
}

message LoadProjectCommand {
  bytes project_data = 1;          // Binary protobuf of ProjectFile
}

message LoadProjectResult {
  oneof result {
    MechanismSnapshot snapshot = 1; // Full mechanism state after load
    string error_message = 2;
  }
}

// Full mechanism state snapshot — used for load and potentially future sync
message MechanismSnapshot {
  Mechanism mechanism = 1;
  repeated AssetReference assets = 2;
  ProjectMetadata metadata = 3;
}
```

### 3. Run codegen

Run `pnpm generate:proto` and verify new messages compile for both TS and C++.

### 4. Engine-side save handler

In `transport.cpp`, add save handler:

```cpp
case Command::kSaveProject: {
    const auto& cmd = command.save_project();

    // Build ProjectFile from current mechanism state
    motionlab::mechanism::ProjectFile project_file;
    project_file.set_version(1);

    auto* metadata = project_file.mutable_metadata();
    metadata->set_name(cmd.project_name());
    metadata->set_modified_at(current_timestamp_millis());
    if (!project_file.metadata().created_at()) {
        metadata->set_created_at(current_timestamp_millis());
    }

    // Serialize full mechanism
    *project_file.mutable_mechanism() = mechanism_state_.toProto();

    // Include asset references
    for (const auto& asset : mechanism_state_.getAssetReferences()) {
        *project_file.add_assets() = asset;
    }

    // Serialize ProjectFile to bytes
    std::string project_bytes;
    project_file.SerializeToString(&project_bytes);

    Event event;
    event.set_sequence_id(command.sequence_id());
    auto* result = event.mutable_save_project_result();
    result->set_project_data(project_bytes);
    sendEvent(event);
    break;
}
```

Add `toProto()` method to MechanismState that returns the full Mechanism protobuf message.

### 5. Engine-side load handler

```cpp
case Command::kLoadProject: {
    const auto& cmd = command.load_project();

    motionlab::mechanism::ProjectFile project_file;
    if (!project_file.ParseFromString(cmd.project_data())) {
        // Send error
        Event event;
        event.set_sequence_id(command.sequence_id());
        auto* result = event.mutable_load_project_result();
        result->set_error_message("Invalid project file format");
        sendEvent(event);
        break;
    }

    // Check version compatibility
    if (project_file.version() > 1) {
        // Send error for future version
    }

    // Rebuild mechanism state from the loaded data
    mechanism_state_.clear();
    mechanism_state_.loadFromProto(project_file.mechanism());

    // Check asset references — verify cached assets are still valid
    for (const auto& asset : project_file.assets()) {
        mechanism_state_.registerAssetReference(asset);
        // If asset is cached and content hash matches, skip re-tessellation
        // If not cached, the frontend will need to re-import
    }

    // Send snapshot back to frontend
    Event event;
    event.set_sequence_id(command.sequence_id());
    auto* result = event.mutable_load_project_result();
    auto* snapshot = result->mutable_snapshot();
    *snapshot->mutable_mechanism() = mechanism_state_.toProto();
    *snapshot->mutable_metadata() = project_file.metadata();
    for (const auto& asset : project_file.assets()) {
        *snapshot->add_assets() = asset;
    }
    sendEvent(event);
    break;
}
```

Add `clear()`, `loadFromProto()`, `registerAssetReference()`, `getAssetReferences()` methods to MechanismState.

### 6. Electron preload API for file I/O

Update `apps/desktop/src/preload.ts`:

```ts
contextBridge.exposeInMainWorld('motionlab', {
  // existing
  platform: process.platform,
  getEngineEndpoint: () => ipcRenderer.invoke('get-engine-endpoint'),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  // new — save/load
  saveProject: (data: Uint8Array) => ipcRenderer.invoke('save-project', data),
  openProject: () => ipcRenderer.invoke('open-project'),
});
```

### 7. Electron IPC handlers for file I/O

In `apps/desktop/src/main.ts`:

```ts
// Save project
ipcMain.handle('save-project', async (_event, data: Uint8Array) => {
  const result = await dialog.showSaveDialog({
    title: 'Save Project',
    defaultPath: 'untitled.motionlab',
    filters: [{ name: 'MotionLab Project', extensions: ['motionlab'] }],
  });

  if (result.canceled || !result.filePath) return null;

  await fs.promises.writeFile(result.filePath, Buffer.from(data));
  return result.filePath;
});

// Open project
ipcMain.handle('open-project', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open Project',
    filters: [{ name: 'MotionLab Project', extensions: ['motionlab'] }],
    properties: ['openFile'],
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const data = await fs.promises.readFile(filePath);
  return { path: filePath, data: new Uint8Array(data) };
});
```

### 8. Update window type declaration

Add the new preload APIs to the type declaration:

```ts
interface MotionLabAPI {
  platform: string;
  getEngineEndpoint(): Promise<{ host: string; port: number; sessionToken: string }>;
  showOpenDialog(options: OpenDialogOptions): Promise<string[] | null>;
  saveProject(data: Uint8Array): Promise<string | null>;
  openProject(): Promise<{ path: string; data: Uint8Array } | null>;
}
```

### 9. Frontend save flow

```ts
async function handleSave() {
  // 1. Send SaveProjectCommand to engine
  sendSaveProjectCommand(projectName);

  // 2. Engine processes and sends SaveProjectResult with bytes
  // (handled in connection.ts event handler)
}

// In connection.ts event handler:
case 'saveProjectResult': {
  const result = payload.value;
  if (result.result.case === 'projectData') {
    const bytes = result.result.value;
    // 3. Send bytes to Electron for file I/O
    const savedPath = await window.motionlab?.saveProject(bytes);
    if (savedPath) {
      useMechanismStore.getState().setProjectPath(savedPath);
      useMechanismStore.getState().setLastSavedTime(Date.now());
    }
  } else {
    console.error('[connection] Save failed:', result.result.value);
  }
  break;
}
```

### 10. Frontend load flow

```ts
async function handleOpen() {
  // 1. Open file dialog via Electron
  const file = await window.motionlab?.openProject();
  if (!file) return; // user cancelled

  // 2. Send bytes to engine via LoadProjectCommand
  sendLoadProjectCommand(file.data);

  // 3. Engine processes, rebuilds state, sends LoadProjectResult
}

// In connection.ts event handler:
case 'loadProjectResult': {
  const result = payload.value;
  if (result.result.case === 'snapshot') {
    const snapshot = result.result.value;
    // 4. Rebuild mechanism store from snapshot
    useMechanismStore.getState().rebuildFromSnapshot(snapshot);
    // 5. Rebuild scene graph
    sceneGraphManager.clear();
    for (const body of snapshot.mechanism.bodies) {
      sceneGraphManager.addBody(body.id.id, body.displayMesh);
    }
    for (const datum of snapshot.mechanism.datums) {
      sceneGraphManager.addDatum(datum.id.id, datum.parentBodyId.id, datum.localPose);
    }
    for (const joint of snapshot.mechanism.joints) {
      sceneGraphManager.addJoint(joint.id.id, joint.parentDatumId.id, joint.childDatumId.id, joint.type);
    }
  } else {
    console.error('[connection] Load failed:', result.result.value);
  }
  break;
}
```

### 11. Add rebuildFromSnapshot to mechanism store

```ts
rebuildFromSnapshot(snapshot: MechanismSnapshot): void {
  // Clear all existing state
  set({
    bodies: new Map(),
    datums: new Map(),
    joints: new Map(),
    projectName: snapshot.metadata?.name ?? 'Untitled',
    projectPath: null, // set after load from file path
    lastSavedTime: snapshot.metadata?.modifiedAt ?? null,
  });

  // Rebuild from snapshot
  for (const body of snapshot.mechanism?.bodies ?? []) {
    get().addBody(convertBody(body));
  }
  for (const datum of snapshot.mechanism?.datums ?? []) {
    get().addDatum(convertDatum(datum));
  }
  for (const joint of snapshot.mechanism?.joints ?? []) {
    get().addJoint(convertJoint(joint));
  }
}
```

### 12. Add project metadata to mechanism store

```ts
interface MechanismStore {
  // existing entity maps...
  projectName: string;
  projectPath: string | null;
  lastSavedTime: number | null;
  setProjectName(name: string): void;
  setProjectPath(path: string | null): void;
  setLastSavedTime(time: number | null): void;
  rebuildFromSnapshot(snapshot: MechanismSnapshot): void;
}
```

### 13. File menu / toolbar buttons

Add Save and Open buttons:
- **Save (Ctrl+S):** triggers handleSave flow
- **Open (Ctrl+O):** triggers handleOpen flow
- Place in a toolbar or header area

Wire keyboard shortcuts:
```ts
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      handleOpen();
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, []);
```

### 14. Asset reference handling on load

When loading a project, the engine checks cached assets:
- If the asset is cached and the content hash matches → skip re-tessellation, use cached display mesh
- If the asset is not cached → the frontend may need to re-import the asset file
- For MVP: assume assets are cached. Add a TODO for broken asset recovery.

### 15. Add version field for future migration

The ProjectFile `version` field starts at 1. On load:
- Version 1: current format, load normally
- Version > 1: reject with "This project was created with a newer version of MotionLab"
- Version 0 or missing: reject with "Invalid project file"

### 16. Protocol helper functions

In `packages/protocol/src/transport.ts`:

```ts
export function createSaveProjectCommand(
  projectName: string,
  sequenceId: bigint
): Uint8Array { ... }

export function createLoadProjectCommand(
  projectData: Uint8Array,
  sequenceId: bigint
): Uint8Array { ... }
```

### 17. Write integration test

Add a test (can be in C++ engine tests or as a protocol-level test):

1. Start engine
2. Import a body (ImportAssetCommand)
3. Create two datums on the body (CreateDatumCommand × 2)
4. Create a joint between the datums (assuming they're on different bodies — import two bodies first)
5. Send SaveProjectCommand
6. Receive SaveProjectResult with bytes
7. Clear engine state (or restart engine)
8. Send LoadProjectCommand with the saved bytes
9. Receive LoadProjectResult with MechanismSnapshot
10. Verify: all bodies present with matching IDs
11. Verify: all datums present with matching IDs, correct parent body refs
12. Verify: all joints present with matching IDs, correct datum refs
13. Verify: project metadata (name, timestamps) preserved

### 18. Write ADR for save/load contract

Document:
- Engine is authoritative for serialization — frontend never directly serializes mechanism state
- ProjectFile is binary protobuf with a version field for forward compatibility
- Save flow: frontend → engine (serialize) → frontend (receive bytes) → Electron (write file)
- Load flow: Electron (read file) → frontend (send bytes) → engine (deserialize + rebuild) → frontend (receive snapshot)
- Asset references use content hashes for cache validation
- .motionlab file extension

## Architecture Constraints
- Engine is authoritative for save/load — it serializes and deserializes the mechanism state
- Frontend never directly serializes mechanism state to the project file
- Electron handles file I/O (dialogs + read/write) but never inspects project file contents
- Add version field to ProjectFile for future migration compatibility
- Asset references use content hashes, not absolute paths
- Save/load is synchronous from the user's perspective (single command-result round trip)

## Done Looks Like
- Save: Click Save (or Ctrl+S) → file dialog → writes `.motionlab` file
- Open: Click Open (or Ctrl+O) → file dialog → reads `.motionlab` file → mechanism fully restored
- All entity IDs are preserved across save/load (UUIDv7 stability)
- All entity relationships are preserved (datum parent refs, joint datum refs)
- Asset cache is reused on load (no re-tessellation if hashes match)
- Project metadata (name, timestamps) round-trips
- **Completes Validation Scenario C:** author → save → close → reopen → continue authoring
- Integration test passes: create mechanism → save → load → verify all elements
- `cmake --preset dev && cmake --build build/dev` succeeds
- `ctest --preset dev` passes with save/load tests
- `pnpm --filter @motionlab/protocol typecheck` passes
- `pnpm --filter @motionlab/frontend typecheck` passes

## What NOT to Build
- Save-on-close prompt (Epic 9 hardening)
- Project file migration across versions
- Broken asset recovery UX (show which assets are missing)
- Simulation state persistence
- Auto-save
- Recent files list
- Undo/redo
```

---

## Integration Verification

After all four prompts complete, verify Validation Scenario C end-to-end:

1. **Import two bodies:** Use existing ImportAsset flow to bring two CAD bodies into the scene
2. **Create datums:** Switch to Create Datum mode, create datums on each body
3. **Create a joint:** Switch to Create Joint mode, select parent datum on body A, child datum on body B, choose Revolute type, confirm
4. **Verify tree:** ProjectTree shows Mechanism → Bodies (with Datums) → Joints group (with the joint)
5. **Verify viewport:** Bodies, datum triads, and joint visual all render correctly
6. **Save:** Press Ctrl+S → save dialog → write file as `test.motionlab`
7. **Close store (simulate reload):** Clear mechanism store and scene graph
8. **Open:** Press Ctrl+O → open `test.motionlab`
9. **Verify restoration:**
   - All bodies present with original IDs and names
   - All datums present with correct parent body references
   - Joint present with correct datum references and type
   - Viewport fully reconstructed
   - Tree fully reconstructed
   - Inspector works for all entities
10. **Typecheck:** `pnpm --filter @motionlab/protocol typecheck && pnpm --filter @motionlab/frontend typecheck && pnpm --filter @motionlab/viewport typecheck` all pass

## ADRs to Write After Implementation

### ADR: Joint Creation Contract
- Joints reference datums, not bodies or raw transforms
- Engine validates referential integrity
- UUIDv7 IDs engine-side
- Full CRUD via Command/Result pattern

### ADR: Project Persistence Contract
- Engine-authoritative serialization
- ProjectFile binary protobuf with version field
- Save/load flow through engine (serialize) + Electron (file I/O)
- Asset references via content hash
- .motionlab extension
