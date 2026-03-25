# Epic 4 — Entity→Component System

**Execution order: Independent of Epics 1–3 at the design/schema level. Frontend work depends on Epic 2 (inspector primitives).**
**This is the most structurally complex epic. Plan thoroughly before implementing.**

---

## Mission

Transition MotionLab from a **flat-property entity model** to an **entity→component architecture**
where entities (Bodies, Joints, Motors, Sensors) are containers for typed, composable components
(Transform, Mass, Inertia, Shape, Constraint, Actuation, Output Channel, etc.).

This unlocks:
- **Uniform inspector rendering** — each component type maps to one inspector section
- **Extensibility** — new component types can be added without changing entity definitions
- **Cleaner protocol contracts** — components are self-describing, not flattened into entity messages
- **Future sensor system** — sensors become entities with measurement components

---

## Current entity model

### Architecture: proto-first, flat properties

The source of truth is `schemas/mechanism/mechanism.proto`. Each entity type has its properties
baked directly into the message definition — there is no component concept.

### Proto schema (current)

**File:** `packages/protocol/src/generated/mechanism/mechanism_pb.ts` (generated from `schemas/mechanism/mechanism.proto`)

```
Body
├── id: ElementId
├── name: string
├── pose: Pose { position: Vec3, orientation: Quat }
├── mass_properties: MassProperties { mass, centerOfMass, ixx, iyy, izz, ixy, ixz, iyz }
├── is_fixed: bool
├── mass_override: bool
└── source_asset_ref: AssetReference [DEPRECATED]

Geometry
├── id, name
├── parent_body_id: ElementId
├── local_pose: Pose
├── source_asset_ref: AssetReference
├── display_mesh: DisplayMesh
├── computed_mass_properties: MassProperties
└── face_count: uint32

Datum
├── id, name
├── parent_body_id: ElementId
├── local_pose: Pose
└── (surface_class added on frontend only)

Joint
├── id, name
├── type: JointType (enum: 10 variants)
├── parent_datum_id, child_datum_id
├── oneof config { RevoluteJointConfig, PrismaticJointConfig, ... }
└── lower_limit, upper_limit [DEPRECATED]

Load
├── id, name
├── oneof config { PointForceLoad, PointTorqueLoad, LinearSpringDamperLoad }
└── (each config has its own fields)

Actuator
├── id, name
├── oneof config { RevoluteMotorActuator, PrismaticMotorActuator }
└── (each has joint_id, control_mode, command_value, effort_limit)
```

### Frontend store types (current)

**File:** `packages/frontend/src/stores/mechanism.ts`

```typescript
interface BodyState {
  id: string; name: string;
  massProperties: BodyMassProperties;
  pose: BodyPose;
  isFixed?: boolean; massOverride?: boolean;
}

interface JointState {
  id: string; name: string;
  type: JointTypeId;
  parentDatumId: string; childDatumId: string;
  lowerLimit: number; upperLimit: number;
}

// ... similar flat structures for Geometry, Datum, Load, Actuator
```

### Output channels (current sensor equivalent)

Sensors do not exist as authored entities. Runtime output is modeled as **output channels** — descriptors emitted by the engine after compilation.

**File:** `packages/frontend/src/stores/traces.ts`

```typescript
interface ChannelDescriptor {
  channelId: string;  // e.g., "joint/<uuid>/coord/rot_z"
  name: string;
  unit: string;       // "rad", "m", "N", etc.
  dataType: 'scalar' | 'vec3';
}
```

Channel naming follows: `<entity_type>/<entity_uuid>/<quantity>/<component>` (see `packages/frontend/src/utils/runtime-channel-ids.ts`).

### Inspector rendering (current)

Each entity type has a dedicated inspector component with hardcoded sections:

| Inspector | File | Hardcoded sections |
|---|---|---|
| `BodyInspector` | `packages/frontend/src/components/BodyInspector.tsx` | Identity, Mass, Inertia, Pose |
| `JointInspector` | `packages/frontend/src/components/JointInspector.tsx` | Identity, Type, Frames, Limits, Actuator |
| `LoadInspector` | `packages/frontend/src/components/LoadInspector.tsx` | Identity, Application, Vector/Spring-Damper |
| `ActuatorInspector` | `packages/frontend/src/components/ActuatorInspector.tsx` | Identity, Control, Command, Effort |

Adding a new component type (e.g., a contact material, a visual override, a sensor mount) requires modifying both the entity proto message and its dedicated inspector.

---

## Proposed component model

### Core concept

An **entity** is an identity container. A **component** is a typed data bag attached to an entity.

```
Entity { id, name, type }
├── TransformComponent { position, orientation }
├── MassComponent { mass, center_of_mass, override }
├── InertiaComponent { ixx, iyy, izz, ixy, ixz, iyz }
├── ShapeComponent { geometry_ref, local_pose }
├── ConstraintComponent { joint_type, parent_datum, child_datum, limits }
├── ActuationComponent { control_mode, command, effort_limit }
├── LoadComponent { load_type, vector, reference_frame, ... }
├── SensorComponent { sensor_type, target_entity, sample_rate }
├── OutputComponent { channels[] }
└── ... extensible
```

### Component type registry

Each component type defines:
1. **Proto message** — wire format
2. **Frontend type** — TypeScript interface
3. **Inspector renderer** — React component for that component's section
4. **Validation** — constraints on the component's values

The inspector becomes a **component iterator**: for each component on the selected entity, render its registered section.

### Entity types and their default components

| Entity type | Required components | Optional components |
|---|---|---|
| Body | Transform, Mass | Inertia, Visual, ContactMaterial |
| Geometry | LocalTransform, Shape, ComputedMass | — |
| Datum | LocalTransform | SurfaceClass |
| Joint | Constraint | Limits, Actuation |
| Load | LoadApplication | — |
| Sensor (new) | SensorConfig, OutputChannels | — |
| Motor | Actuation, OutputChannels | — |

---

## Implementation scope

> This epic is large. It should be split into sub-phases, each independently shippable.

### Phase 1 — Frontend component abstraction (no protocol changes)

**Goal:** Introduce a component registry on the frontend that maps component types to inspector sections, without changing the protocol. The frontend internally restructures flat entity data into components for rendering.

**P4-1-A: Component type registry**
- File: `packages/frontend/src/components/inspector/component-registry.ts` (new)
- Define `ComponentType` enum: `'transform'`, `'mass'`, `'inertia'`, `'constraint'`, `'limits'`, `'actuation'`, `'load-application'`, `'output-channels'`
- Define `ComponentRendererMap`: maps `ComponentType` → React component
- Each renderer receives `{ entityId, entityType, componentData, isSimulating }`

**P4-1-B: Component extractors**
- File: `packages/frontend/src/components/inspector/component-extractors.ts` (new)
- Functions that decompose flat entity state into component data:
  - `extractBodyComponents(body: BodyState)` → `[TransformData, MassData, InertiaData]`
  - `extractJointComponents(joint: JointState, actuator?: ActuatorState)` → `[ConstraintData, LimitsData?, ActuationData?]`
  - `extractLoadComponents(load: LoadState)` → `[LoadApplicationData]`
- These are adapters — no store changes needed

**P4-1-C: Generic `ComponentInspector`**
- File: `packages/frontend/src/components/inspector/ComponentInspector.tsx` (new)
- Replaces `EntityInspector.tsx` routing logic
- For the selected entity:
  1. Determine entity type
  2. Call the appropriate extractor to get component data
  3. Look up renderers in the component registry
  4. Render each component's section in order

**P4-1-D: Component section renderers**
- Migrate existing inspector sections into standalone renderers:
  - `TransformSection.tsx` — position + orientation (from `BodyInspector`, `DatumInspector`)
  - `MassSection.tsx` — mass, center of mass, override toggle (from `BodyInspector`)
  - `InertiaSection.tsx` — 3×3 tensor (from `BodyInspector`)
  - `ConstraintSection.tsx` — joint type, parent/child datums (from `JointInspector`)
  - `LimitsSection.tsx` — joint limits by type (from `JointInspector`)
  - `ActuationSection.tsx` — motor control mode, command, effort limit (from `JointInspector`, `ActuatorInspector`)
  - `LoadApplicationSection.tsx` — force/torque vector or spring-damper (from `LoadInspector`)
- Each renderer is a self-contained component that can be reused across entity types

### Phase 2 — Protocol evolution (requires engine coordination)

> **This phase requires coordination with native engine development.** Design the schema first, implement engine-side second, frontend adapter third.

**P4-2-A: Design component proto schema**
- File: `schemas/mechanism/components.proto` (new)
- Define a `Component` oneof message containing all component types
- Define each component message (TransformComponent, MassComponent, etc.)
- Define `EntityComponents` message: `repeated Component components`
- Add `EntityComponents components` field to Body, Joint, Load, Actuator messages
- **Backwards compatible:** existing flat fields remain; components field is additive

**P4-2-B: Engine-side component model**
- Map the internal Chrono representation to the component model
- Emit component data in `MechanismSnapshot` messages
- Accept component-level updates (not just entity-level)

**P4-2-C: Protocol migration**
- File: `packages/protocol/src/transport.ts`
- Add command/event types for component-level CRUD:
  - `AddComponentCommand` / `RemoveComponentCommand` / `UpdateComponentCommand`
- These complement (not replace) the existing entity-level commands during migration

**P4-2-D: Frontend store migration**
- File: `packages/frontend/src/stores/mechanism.ts`
- Add component data alongside existing flat fields
- Extractors from Phase 1 switch to reading component data when available, falling back to flat fields
- Eventually deprecate flat fields

### Phase 3 — Sensor entities (new entity type)

> Depends on Phase 2 (component model in protocol).

**P4-3-A: Define Sensor entity in proto**
- Entity type: `Sensor`
- Required components: `SensorConfigComponent` (sensor type, target entity, sample rate)
- Output: `OutputChannelsComponent` (list of channel descriptors this sensor produces)
- Sensor types (initial set): ForceSensor, TorqueSensor, PositionSensor, VelocitySensor, AccelerationSensor

**P4-3-B: Sensor creation flows**
- Wire `create.sensor` command (currently a stub)
- Add sensor to tree hierarchy (under a "Sensors" group, or attached to the target entity)
- Sensor inspector: uses the generic `ComponentInspector` — no custom inspector needed

**P4-3-C: Sensor output → trace store**
- Engine emits `SimulationTrace` samples for sensor channels
- Channel IDs follow: `sensor/<uuid>/<measurement_type>`
- Frontend `useTraceStore` already handles arbitrary channel IDs — no change needed

---

## Task dependency graph

```
Phase 1 (frontend only — no engine changes)
  ├── P4-1-A: Component registry (independent)
  ├── P4-1-B: Component extractors (independent)
  ├── P4-1-C: ComponentInspector (depends on A, B)
  └── P4-1-D: Section renderers (parallel, depends on Epic 2 inspector primitives)

Phase 2 (protocol + engine — sequential)
  ├── P4-2-A: Proto schema design (independent)
  ├── P4-2-B: Engine implementation (depends on A)
  ├── P4-2-C: Protocol migration (depends on A)
  └── P4-2-D: Frontend store migration (depends on B, C)

Phase 3 (sensors — depends on Phase 2)
  ├── P4-3-A: Sensor proto definition (depends on 2-A)
  ├── P4-3-B: Sensor creation flows (depends on 3-A, 2-D)
  └── P4-3-C: Sensor output integration (depends on 3-A)
```

**Key insight:** Phase 1 can ship independently and immediately improves inspector maintainability. Phases 2 and 3 are larger coordinated efforts.

---

## Acceptance criteria

### Phase 1
- [ ] A component type registry exists mapping component types to inspector sections
- [ ] `ComponentInspector` renders the correct sections for any entity type by iterating components
- [ ] Each section renderer is a standalone, reusable component
- [ ] Selecting a Body shows: Transform, Mass, Inertia sections (same data as before)
- [ ] Selecting a Joint shows: Constraint, Limits, Actuation sections (same data as before)
- [ ] No visual regression — same information displayed, same interactions
- [ ] Legacy `BodyInspector`, `JointInspector`, etc. can be removed after migration

### Phase 2
- [ ] Component proto schema is defined and code-generated
- [ ] Engine populates component data in `MechanismSnapshot` messages
- [ ] Frontend reads component data from protocol (with flat-field fallback)
- [ ] Component-level update commands work end-to-end
- [ ] No regression on existing entity CRUD operations

### Phase 3
- [ ] Sensor entity type exists in protocol and engine
- [ ] Sensors can be created, configured, and attached to target entities
- [ ] Sensor output channels appear in `useTraceStore` and are plottable in `ChartPanel`
- [ ] Sensor inspector uses generic `ComponentInspector` — no custom inspector needed

---

## Out of scope

- Custom user-defined component types (plugin system)
- Visual override components (material, color, opacity)
- Contact material components (friction, restitution)
- Multi-body sensor aggregates (e.g., "total energy" sensor)
- Component dependencies / validation rules (e.g., "Actuation requires Constraint")

---

## File checklist

### Phase 1

| Action | File |
|---|---|
| **Create** | `packages/frontend/src/components/inspector/component-registry.ts` |
| **Create** | `packages/frontend/src/components/inspector/component-extractors.ts` |
| **Create** | `packages/frontend/src/components/inspector/ComponentInspector.tsx` |
| **Create** | `packages/frontend/src/components/inspector/sections/TransformSection.tsx` |
| **Create** | `packages/frontend/src/components/inspector/sections/MassSection.tsx` |
| **Create** | `packages/frontend/src/components/inspector/sections/InertiaSection.tsx` |
| **Create** | `packages/frontend/src/components/inspector/sections/ConstraintSection.tsx` |
| **Create** | `packages/frontend/src/components/inspector/sections/LimitsSection.tsx` |
| **Create** | `packages/frontend/src/components/inspector/sections/ActuationSection.tsx` |
| **Create** | `packages/frontend/src/components/inspector/sections/LoadApplicationSection.tsx` |
| **Modify** | `packages/frontend/src/components/EntityInspector.tsx` (replace with ComponentInspector) |
| **Modify** | `packages/frontend/src/App.tsx` (swap inspector component) |

### Phase 2

| Action | File |
|---|---|
| **Create** | `schemas/mechanism/components.proto` |
| **Modify** | `schemas/mechanism/mechanism.proto` (add components field to entities) |
| **Modify** | `packages/protocol/src/transport.ts` (component CRUD commands) |
| **Modify** | `packages/frontend/src/stores/mechanism.ts` (component data fields) |
| **Modify** | `packages/frontend/src/engine/connection.ts` (component extraction from proto) |
| **Modify** | `packages/frontend/src/components/inspector/component-extractors.ts` (read from component data) |

### Phase 3

| Action | File |
|---|---|
| **Create** | `packages/frontend/src/components/inspector/sections/SensorConfigSection.tsx` |
| **Modify** | `schemas/mechanism/mechanism.proto` (Sensor entity type) |
| **Modify** | `packages/frontend/src/stores/mechanism.ts` (sensors Map) |
| **Modify** | `packages/frontend/src/components/ProjectTree.tsx` (Sensors group) |
| **Modify** | `packages/frontend/src/commands/definitions/create-commands.ts` (enable create.sensor) |

---

## Migration strategy

Phase 1 is a **pure refactor** with no data model changes. It can be merged immediately.

Phase 2 is a **protocol evolution**. Use an additive migration strategy:
1. Add `components` field to entity messages (engine populates both flat fields and components)
2. Frontend reads from `components` when present, falls back to flat fields
3. Once all clients read from `components`, deprecate flat fields
4. Eventually remove flat fields in a breaking protocol version

This avoids a big-bang migration and keeps the system working at every step.
