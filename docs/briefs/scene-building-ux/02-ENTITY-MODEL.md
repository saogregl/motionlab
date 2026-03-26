# MotionLab — Entity and Component Model

## Overview

This document describes the entity model — what kinds of things exist in the system, what can be attached to what, and the rules governing their relationships. It reflects the current architecture (protocol v5, project file v3) and identifies planned extensions.

---

## Assets (Source Layer)

An asset is a source resource. Assets are never mutated by scene authoring.

### Asset kinds and their capabilities

**CAD asset** — an imported STEP/IGES file processed by the OCCT/XDE backend. Contains the preserved assembly structure, tessellation data for rendering, and per-node solid properties where computable (volume, center of mass, inertia via BRepGProp). CAD assets can serve as a source for **visual and mass/inertia/COM**. Referenced via `AssetReference` (content hash + original filename) on Geometry entities.

**Mesh asset (planned)** — an imported mesh file (OBJ, glTF, STL). Simpler than CAD — geometry only, no solid properties. Can serve as a source for **visual only**. Cannot provide mass/inertia because triangle meshes lack volumetric information.

**Primitive template (planned)** — a built-in parametric shape: box, cylinder, sphere, capsule. No import needed. Primitives can source visual, collision approximation, and mass (since their volume is analytically known).

### Asset rules

- Assets are registered on import. The engine caches processed results in `~/.motionlab/cache/assets/`.
- Multiple geometries in the scene can reference the same asset.
- Modifying an entity does not modify the asset it came from.
- Re-importing an updated STEP file triggers the `RelocateAssetCommand` flow — affected geometries are flagged for review (ADR-0011).

---

## Entity Types (Authoring Layer)

The scene contains six typed entity collections, each with its own proto message, store slice, protocol commands, and inspector.

### Body

The fundamental physics unit. A body represents a rigid object that participates in simulation.

**Fields:**
- `id`, `name` — identity
- `pose` — world-space position and orientation (quaternion)
- `mass_properties` — mass, center of mass, inertia tensor (ixx, iyy, izz, ixy, ixz, iyz)
- `is_fixed` — whether the body is anchored to world (planned: evolve to `motion_type` enum with dynamic/fixed/kinematic)
- `mass_override` — when false, mass aggregates from attached geometries; when true, user-specified values take precedence

**Relationships:**
- Owns zero or more Geometries (via `Geometry.parent_body_id`)
- Owns zero or more Datums (via `Datum.parent_body_id`)
- Referenced indirectly by Joints, Loads, Actuators through their datums

**Key behavior:** Deleting a body cascades to delete its geometries, datums, and any joints/loads/actuators that reference those datums.

### Geometry

A visual mesh attached to a body. Separated from Body by ADR-0013 to enable multi-geometry bodies, empty bodies, and geometry reparenting.

**Fields:**
- `id`, `name` — identity
- `parent_body_id` — the body this geometry belongs to (nullable — detached geometry is possible)
- `local_pose` — position and rotation relative to parent body frame
- `source_asset_ref` — `AssetReference` with content hash and original filename
- `display_mesh` — vertices, normals, indices for rendering
- `computed_mass_properties` — mass properties derived from CAD solid geometry via BRepGProp
- `face_count` — number of B-Rep faces (for face-aware datum creation)
- `part_index` — per-face triangle mapping for raycast → face index resolution

**Key behavior:** Geometry is the bridge between CAD source data and the scene. When `mass_override` is off on the parent body, the body's mass aggregates from its geometries using the parallel axis theorem.

### Datum

A reference frame anchored to a body surface. Datums are the universal connection mechanism — joints connect datum-to-datum, loads attach to datums, future sensors will mount to datums.

**Fields:**
- `id`, `name` — identity
- `parent_body_id` — the body this datum belongs to (required)
- `local_pose` — position and rotation relative to parent body frame
- `surface_class` (frontend-only) — detected surface type when created from a geometry face: `planar`, `cylindrical`, `conical`, `spherical`, `toroidal`, `other`

**Creation modes:**
- **Manual:** specify parent body and local pose directly
- **Face-aware:** click a face on a geometry → `CreateDatumFromFaceCommand` sends `geometry_id + face_index` → engine computes the datum pose from the face geometry and returns the surface class

**Key behavior:** Surface class detection enables smart joint type recommendations. A cylindrical surface suggests revolute joints. A planar surface suggests prismatic or planar joints.

### Joint

A mechanical constraint connecting two bodies through their datums.

**Fields:**
- `id`, `name` — identity
- `type` — `JointType` enum: revolute, prismatic, fixed, spherical, cylindrical, planar, universal, distance, point-line, point-plane
- `parent_datum_id`, `child_datum_id` — the two datums defining the joint frames
- `config` — oneof typed configuration (e.g., `RevoluteJointConfig` with angle limits, `PrismaticJointConfig` with translation limits)

**Key behavior:** Joint type determines available configuration. Each type has its own config message with type-specific limits and parameters. The two datums implicitly define which bodies are connected.

**Output channels:** `joint/{id}/coord/*`, `joint/{id}/coord_rate/*`, `joint/{id}/reaction_force`, `joint/{id}/reaction_torque`

### Load

An external force, torque, or spring-damper applied to the mechanism.

**Fields:**
- `id`, `name` — identity
- `config` — oneof:
  - `PointForceLoad` — datum, vector (x,y,z), reference frame (datum-local or world)
  - `PointTorqueLoad` — datum, vector (x,y,z), reference frame (datum-local or world)
  - `LinearSpringDamperLoad` — parent datum, child datum, rest length, stiffness, damping

**Key behavior:** Loads are first-class authored entities, not joint extensions. They reference datums for spatial application.

**Output channels:** `load/{id}/applied_force`, `load/{id}/applied_torque`, `load/{id}/length`, `load/{id}/length_rate`, `load/{id}/force`

### Actuator

A motor driving a joint.

**Fields:**
- `id`, `name` — identity
- `config` — oneof:
  - `RevoluteMotorActuator` — joint_id, control_mode (position/speed/effort), command_value, effort_limit
  - `PrismaticMotorActuator` — joint_id, control_mode, command_value, effort_limit

**Key behavior:** Actuators are product-level concepts translated to Chrono motor constraints at compile time. They target joints, not bodies directly.

**Output channels:** `actuator/{id}/command`, `actuator/{id}/effort`

### Sensor (Planned — ADR-0002)

A data output mounted to a datum. Not yet implemented.

**Planned types:** Force/torque sensor, encoder, IMU, contact reporter, camera, lidar.

**Expected pattern:** Same as other entities — proto message, store slice, datum-mounted, produces output channels following `sensor/{id}/{measurement}` convention.

---

## Key Relationships

### Asset → Geometry (one-to-many)

One asset can be the source for many geometries in the scene. The geometry references the asset via `source_asset_ref`; the asset does not know about geometries.

### Body → Geometry (one-to-many)

A body can have zero, one, or many geometries attached. Each geometry has exactly one parent body (or none if detached). Reparenting is supported via `AttachGeometryCommand` / `DetachGeometryCommand`.

### Body → Datum (one-to-many)

A body can have zero or more datums. Each datum has exactly one parent body. Datums are reference frames positioned on the body.

### Datum → Joint/Load (connection point)

Joints reference two datums (parent and child). Loads reference one or two datums. The datum's parent body determines which body participates.

### Joint → Actuator (one-to-one)

An actuator targets a single joint. A joint can have at most one actuator.

---

## Planned Extensions

### Collision authoring

Currently collision is engine-internal. Planned: add collision configuration to Body (shape type, auto-fit parameters). The collision shape would be independent from the visual geometry, following the URDF/SDF pattern.

### Motion type enum

`is_fixed: boolean` will evolve to `motion_type: MotionType` (DYNAMIC, FIXED, KINEMATIC). Additive proto field, deprecate `is_fixed`.

### Primitive entities

Built-in parametric shapes (box, cylinder, sphere) that create Body + synthetic Geometry pairs. Editable parameters in inspector. Same entity model as CAD-derived objects.

### Component origin offsets

Inspired by URDF/SDF, each geometric attachment (visual mesh, future collision shape, inertial frame) could carry an optional origin offset relative to the entity frame. This solves the common problem of CAD files with inconvenient origins. Default: identity (zero offset). Expose when the user needs it, don't clutter the common path.

---

## Rules for Agents

1. **Work with the existing typed entity model.** Don't introduce a general-purpose ECS. The six entity types with their proto schemas are the contract.

2. **Datums are central.** All spatial connections (joints, loads, future sensors) go through datums. Don't create shortcuts that bypass datums.

3. **Body/Geometry separation is settled** (ADR-0013). Don't re-merge them. A body is physics; geometry is visual.

4. **Mass override is the escape hatch.** When `mass_override = true`, the user controls mass. When `false`, it aggregates from geometries. Don't mix these modes.

5. **Engine is authoritative.** All entity CRUD flows through protocol commands to the native engine. The engine generates IDs, validates state, and broadcasts results. The frontend store is a projection of engine state.

6. **Respect asset capability boundaries.** CAD assets can source visual and mass. Mesh assets (when supported) can source visual only. Primitives can source visual, collision approximation, and mass. Never offer operations that violate these boundaries.

7. **Protocol commands are the mutation API.** Don't mutate the frontend store directly for authored state. Send a command, handle the result event, update the store.
