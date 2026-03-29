# Investigation: Transform Consistency, Property Exposure & Precision Controls

**Date:** 2026-03-28
**Status:** Audit complete, UX enhancement proposals included
**Triggered by:** Difficulty understanding local vs. global coordinates in UI, inability to position objects precisely, and comparison with URDF's clear coordinate frame model

---

## Table of Contents

1. [URDF Mental Model vs. MotionLab](#1-urdf-mental-model-vs-motionlab)
2. [How Poses Are Stored Today](#2-how-poses-are-stored-today)
3. [What the User Can See and Edit](#3-what-the-user-can-see-and-edit)
4. [Viewport Transform Tools](#4-viewport-transform-tools)
5. [Coordinate Frame Visualization](#5-coordinate-frame-visualization)
6. [Mass & Inertial Properties](#6-mass--inertial-properties)
7. [Collision Properties](#7-collision-properties)
8. [Joint Definition Comparison](#8-joint-definition-comparison)
9. [Gap Analysis: MotionLab vs. URDF](#9-gap-analysis-motionlab-vs-urdf)
10. [Proposed UX Enhancements](#10-proposed-ux-enhancements)

---

## 1. URDF Mental Model vs. MotionLab

URDF gives each element an explicit `<origin xyz="..." rpy="..."/>` that clearly states: "this thing is offset from its parent frame by this transform." Every link, visual, collision, inertial, and joint has this, making coordinate relationships unambiguous.

MotionLab uses a similar hierarchy but expresses it through different abstractions:

| URDF Concept | MotionLab Equivalent | Key Difference |
|-------------|---------------------|----------------|
| `<link>` | Body | Body stores a **world pose**, not a parent-relative transform |
| `<visual>` | Geometry (display_mesh) | Geometry stores `localPose` relative to parent body |
| `<collision>` | Geometry.collision_config | Collision is a field on geometry, not a separate entity |
| `<inertial>` | Body.mass_properties | Aggregated from geometries; no separate inertial origin frame |
| `<joint><origin>` | Datum.localPose (implicit) | No explicit joint transform; derived from two datum poses |
| `<joint><axis>` | Datum Z-axis (implicit) | No explicit axis field; Z-axis of datum orientation is the joint axis |

The fundamental difference: **URDF is declarative and explicit** (every transform is written out), while **MotionLab is computed and implicit** (transforms derive from entity relationships and stored local offsets).

---

## 2. How Poses Are Stored Today

### 2.1 Body Pose — World Space

```
BodyState.pose: { position: {x,y,z}, rotation: {x,y,z,w} }
```

- Stored in **world space** (`packages/frontend/src/stores/mechanism.ts:29`)
- Set at creation/import time
- Updated by simulation frames (world-space body poses from Chrono)
- **Not directly editable** in the inspector after creation — only via viewport gizmo drag

**Proto definition** (`schemas/mechanism/mechanism.proto:82-91`):
```protobuf
message Body {
  ElementId id = 1;
  string name = 2;
  Pose pose = 3;              // world-space
  MassProperties mass_properties = 4;
  MotionType motion_type = 8;
}
```

### 2.2 Geometry LocalPose — Body-Relative (with a caveat)

```
GeometryState.localPose: { position: {x,y,z}, rotation: {x,y,z,w} }
```

- For **parented geometries**: offset relative to parent body origin (`mechanism.proto:100`)
- For **detached geometries** (no parent body): **world pose stored in the localPose field** (`connection.ts:729-730`)
- The field name `localPose` is misleading for detached geometry — it actually holds world coordinates

**Scene graph composition** (`scene-graph-three.ts:1112-1114`):
```
geometry_world = body_world_matrix × geometry_local_matrix
```

Three.js parent-child hierarchy handles this automatically.

### 2.3 Datum LocalPose — Body-Relative

```
DatumState.localPose: { position: {x,y,z}, rotation: {x,y,z,w} }
```

- Always relative to `parentBodyId` (`mechanism.proto:168-173`)
- Created from face picks: engine composes `geometry.local_pose × face_pose` to get body-local result (`transport.cpp:688-693`)
- Co-translated when body moves to preserve world position (`mechanism_state.cpp:825-900`)

### 2.4 Joint Frame — Implicit from Datums

Joints store no transform of their own. The "joint frame" is computed at simulation time:

```cpp
// simulation.cpp:52-65
WorldFrame parent_wf = compute_datum_world_frame(parent_body.pose, parent_datum.local_pose);
WorldFrame child_wf  = compute_datum_world_frame(child_body.pose,  child_datum.local_pose);
```

The joint axis is the Z-axis of the parent datum's world orientation:
```cpp
// simulation.cpp:89-91
ChVector3d z_axis_from_rot(const ChQuaterniond& q) {
    return q.Rotate(ChVector3d(0, 0, 1));
}
```

### 2.5 Summary: What Space Is Each Pose In?

| Entity | Field | Coordinate Space | Clearly Labeled in UI? |
|--------|-------|-----------------|----------------------|
| Body | `pose` | **World** | No label; only shown during sim as "Current Pose" |
| Geometry (parented) | `localPose` | **Body-local** | Shows "Local Pose" (read-only) |
| Geometry (detached) | `localPose` | **World** (confusing!) | Shows "Local Pose" — **mislabeled** |
| Datum | `localPose` | **Body-local** | Shows "Local Pose" |
| Joint | (none) | Derived from datums | Joint inspector shows local/world toggle |
| Collision offset | `CollisionConfig.offset` | **Geometry-local** | Not directly shown |

---

## 3. What the User Can See and Edit

### 3.1 Body Inspector (`BodyInspector.tsx`)

| Property | Visible | Editable | Notes |
|----------|---------|----------|-------|
| Name | Yes | Yes | Inline rename |
| Motion Type | Yes | Yes | Dynamic/Fixed dropdown |
| World Pose | Only during sim | **No** (read-only) | "Current Pose" section |
| Mass | Yes | Yes (if override on) | MassSection toggle |
| Center of Mass | Yes | Yes (if override on) | Vec3, body frame |
| Inertia Tensor | Yes | Yes (if override on) | 6-component symmetric matrix |
| Source File | Yes | No | Read-only |

**Missing:** No way to type a body's world position or rotation.

### 3.2 Geometry Inspector (`GeometryInspector.tsx`)

| Property | Visible | Editable | Notes |
|----------|---------|----------|-------|
| Name | Yes | Yes | Inline rename |
| Local Pose | Yes | **No** (read-only) | Position + rotation display |
| Primitive Params | Yes | Yes (if primitive) | Box/Cylinder/Sphere dimensions |
| Collision Shape | Yes | Yes | Shape type + dimensions |
| Collision Offset | Implicit | Partial | Auto-fit sets it; no direct edit |
| Computed Mass | Yes | No | From CAD, read-only |
| Computed Inertia | Yes | No | From CAD, read-only |

**Missing:** No way to type a geometry's local pose (position or rotation within body).

### 3.3 Datum Inspector (`DatumInspector.tsx`)

| Property | Visible | Editable | Notes |
|----------|---------|----------|-------|
| Name | Yes | Yes | Inline rename |
| Parent Body | Yes | No | Read-only reference |
| Local Pose | Yes | **No** (read-only display) | Position + rotation shown |
| Axis Presets | Yes | Yes | 6 buttons: ±X, ±Y, ±Z — rotation only |

**Missing:** No numeric position input. No free rotation input (only 6 axis-aligned presets).

### 3.4 Joint Inspector (`JointInspector.tsx`)

| Property | Visible | Editable | Notes |
|----------|---------|----------|-------|
| Name | Yes | Yes | Inline rename |
| Type | Yes | Yes | 6-type dropdown |
| Parent/Child Bodies | Yes | Yes (swap button) | Connection diagram |
| Coordinate Frames | Yes | No (read-only) | **Local/World toggle** — best frame UX in app |
| Limits | Yes | Yes | Lower/upper for revolute/prismatic/cylindrical |
| Axis | **No** | **No** | Implicit from datum Z-axis; not shown |
| Damping/Friction | **No** | **No** | Not in data model |
| Velocity Limit | **No** | **No** | Not in data model |
| Reaction Force/Torque | Yes (sim only) | No | From simulation channels |

### 3.5 Load Inspector (`LoadInspector.tsx`)

| Property | Visible | Editable | Notes |
|----------|---------|----------|-------|
| Vector X/Y/Z | Yes | Yes | Numeric inputs |
| Reference Frame | Yes | Yes | **World / Body-Local toggle** |
| Magnitude | Yes | No | Computed |
| Spring-Damper params | Yes | Yes | Rest length, stiffness, damping |

**Noteworthy:** Loads have the clearest frame handling — explicit World vs. Body-Local selector with labeled toggle.

---

## 4. Viewport Transform Tools

### 4.1 Gizmo (Translate + Rotate)

**Implementation:** `R3FViewport.tsx:58-102` wraps `@react-three/drei` `TransformControls`

| Feature | Status | Notes |
|---------|--------|-------|
| Translate gizmo | Yes | Shortcut: W |
| Rotate gizmo | Yes | Shortcut: E |
| Scale gizmo | No | Not implemented |
| Snap to grid | **No** | Grid is purely visual |
| Snap to angle increments | **No** | Free rotation only |
| Numeric input during drag | **No** | No overlay showing coordinates |
| Coordinate frame toggle (local/world) | **No** | Datums always local, bodies always world |

**Update flow** (`useViewportBridge.ts:226-242`):
1. User drags gizmo → Three.js updates Object3D position/quaternion in real-time
2. On mouse-up → reads final transform → sends `sendUpdateBody()` or `sendUpdateDatumPose()`
3. Engine processes → co-translates datums if body moved → sends response
4. Frontend applies response → scene graph refreshes joint visuals

### 4.2 What's Missing

- **No numeric position/rotation input** — cannot type "move to X=0.1, Y=0, Z=0.5"
- **No incremental move** — cannot say "translate +100mm along X"
- **No snap-to-grid** — the grid is cosmetic only
- **No angular snap** — cannot snap to 15°/45°/90° increments
- **No coordinate frame toggle on gizmo** — no local vs. world mode switch for translation axis
- **Vec3Display has an `editable` prop** (`vec3-display.tsx:19`) but it's **never set to true** in any pose inspector
- **QuatDisplay is read-only** (`quat-display.tsx`) — no onChange handler exists. It already shows Euler angles in degrees by default, which is the right display format. It just needs to become editable, with Euler→quaternion conversion on input.

---

## 5. Coordinate Frame Visualization

### 5.1 What's Rendered

| Visual | Visible | Toggleable | Notes |
|--------|---------|-----------|-------|
| World grid (Y=0 plane) | Yes | Yes (G key) | Infinite grid, cell=0.5m, section=2.5m |
| World origin axes | **No** | — | No XYZ triad at (0,0,0) |
| Camera orientation gizmo | Yes | No | Corner widget (navigation aid) |
| Body coordinate frame | **No** | — | Bodies have no visible axes |
| Geometry frame | **No** | — | No local axes shown |
| Datum frame | **Yes** | Yes (toggle) | XYZ triad (R/G/B) at datum position |
| Joint anchor | **Yes** | Yes (toggle) | Small sphere + mini triad |
| Joint selection overlay | **Yes** | On selection | Parent (green) + child (orange) triads with dashed connection lines |

### 5.2 Clarity Assessment

**Clear:**
- Datum frames are always visible with color-coded XYZ axes
- Joint selection overlay clearly shows parent/child relationships
- Load reference frame has explicit World/Body-Local toggle

**Unclear:**
- No world origin marker — users have no fixed reference point except the grid
- No body frame visualization — users cannot see body orientation
- Detached geometry labeled "Local Pose" while actually in world space
- Body "Current Pose" only shown during simulation — hidden at authoring time

---

## 6. Mass & Inertial Properties

### 6.1 Schema (`mechanism.proto:61-71`)

```protobuf
message MassProperties {
  double mass = 1;
  Vec3 center_of_mass = 2;     // offset in body frame
  double ixx = 3; double iyy = 4; double izz = 5;
  double ixy = 6; double ixz = 7; double iyz = 8;
}
```

### 6.2 Computation Pipeline

1. **Import:** BRepGProp computes volume, CoM, inertia per geometry (`cad_import.cpp:464-502`)
2. **Aggregation:** Parallel axis theorem combines geometries → body-level properties (`mechanism_state.cpp:656-724`)
3. **Simulation:** `ch_body->SetMass(mass)` + `SetInertiaXX/XY` (`simulation.cpp:656-659`)

### 6.3 Comparison to URDF `<inertial>`

| URDF Feature | MotionLab Equivalent | Status |
|-------------|---------------------|--------|
| `<mass value="...">` | `MassProperties.mass` | Supported, auto-computed or user override |
| `<origin xyz="..." rpy="...">` | `MassProperties.center_of_mass` (Vec3 only) | **Partial** — position only, no rotation for inertia frame |
| `<inertia ixx iyy izz ixy ixz iyz>` | Six inertia components | Supported |
| Per-geometry density | Import density setting | Supported at import time |
| User override | `Body.mass_override` toggle | Supported with UI |

**Gap:** URDF's `<inertial><origin rpy="...">` allows rotating the inertia frame independently. MotionLab assumes inertia is always expressed at the center of mass without an independent orientation. This matters for asymmetric parts where principal axes don't align with the body frame.

### 6.4 Missing Visualizations

- No center-of-mass indicator in viewport
- No principal inertia axes display
- No inertia ellipsoid rendering

---

## 7. Collision Properties

### 7.1 Schema (`mechanism.proto:147-165`)

```protobuf
message CollisionConfig {
  CollisionShapeType shape_type = 1;  // NONE, BOX, SPHERE, CYLINDER, CONVEX_HULL
  Vec3 half_extents = 2;
  double radius = 3;
  double height = 4;
  Vec3 offset = 5;                    // offset from geometry local_pose origin
}
```

### 7.2 How It Works

- Collision config is **per-geometry**, not per-body (`mechanism.proto:106`)
- Shape frame = `geometry.local_pose + collision_config.offset` (`simulation.cpp:704-711`)
- Auto-fit from mesh bounding box when dimensions are zero (`transport.cpp:1612-1651`)
- Shapes are instantiated at simulation compile time (`simulation.cpp:713-743`)

### 7.3 Comparison to URDF `<collision>`

| URDF Feature | MotionLab Equivalent | Status |
|-------------|---------------------|--------|
| Separate `<collision>` element | `Geometry.collision_config` field | Supported (per-geometry) |
| Independent geometry shape | Yes (box/sphere/cylinder) | Supported + auto-fit |
| Independent origin transform | `CollisionConfig.offset` (position only) | **Partial** — no rotation offset |
| Mesh collision | `CONVEX_HULL` (reserved) | Not yet implemented |
| Multiple collision per link | Multiple geometries per body | Supported |

**Gap:** Collision offset has position (`Vec3`) but no rotation. URDF allows `<collision><origin rpy="..."/>` to rotate the collision shape independently. No collision shape wireframe visualization in viewport.

---

## 8. Joint Definition Comparison

### 8.1 Types

| URDF Type | MotionLab Type | Notes |
|-----------|---------------|-------|
| revolute | REVOLUTE | Equivalent (1R DOF) |
| continuous | — | **Missing** — use revolute with no limits |
| prismatic | PRISMATIC | Equivalent (1T DOF) |
| fixed | FIXED | Equivalent (0 DOF) |
| floating | — | **Missing** — no 6-DOF joint |
| planar | PLANAR | Equivalent (1R+2T DOF) |
| — | SPHERICAL | MotionLab extra (3R DOF) |
| — | CYLINDRICAL | MotionLab extra (1R+1T DOF) |
| — | UNIVERSAL | MotionLab extra (2R DOF) |
| — | DISTANCE | MotionLab extra (5 DOF) |
| — | POINT_LINE | MotionLab extra (4 DOF) |
| — | POINT_PLANE | MotionLab extra (3 DOF) |

### 8.2 Joint Frame

| Aspect | URDF | MotionLab |
|--------|------|-----------|
| Origin | Explicit `<origin xyz rpy>` | Implicit — composed from datum `localPose` + body `pose` |
| Axis | Explicit `<axis xyz="1 0 0">` | Implicit — Z-axis of parent datum quaternion |
| Parent | `<parent link="...">` by name | `parent_datum_id` → datum → body |
| Child | `<child link="...">` by name | `child_datum_id` → datum → body |

### 8.3 Limits & Dynamics

| URDF Feature | MotionLab | Status |
|-------------|-----------|--------|
| `<limit lower upper>` | Type-specific Range configs | Supported (revolute, prismatic, cylindrical) |
| `<limit effort>` | `ActuatorInspector.effortLimit` | Supported (via motor actuator) |
| `<limit velocity>` | — | **Missing** |
| `<dynamics damping>` | — | **Missing** (global contact damping only) |
| `<dynamics friction>` | — | **Missing** (global contact friction only) |
| `<mimic>` | — | **Not supported** |
| `<safety_controller>` | — | **Not supported** |

### 8.4 Chrono Mapping — Current vs. Proposed

| MotionLab Type | Current (dual-path) | Proposed (Lock-only) |
|---------------|--------------------|--------------------|
| FIXED | `ChLinkMateFix` | `ChLinkLockLock` |
| REVOLUTE | `ChLinkMateRevolute` / `ChLinkLockRevolute` | `ChLinkLockRevolute` |
| PRISMATIC | `ChLinkMatePrismatic` / `ChLinkLockPrismatic` | `ChLinkLockPrismatic` |
| CYLINDRICAL | `ChLinkMateCylindrical` / `ChLinkLockCylindrical` | `ChLinkLockCylindrical` |
| SPHERICAL | `ChLinkMateSpherical` | `ChLinkLockSpherical` |
| PLANAR | `ChLinkMatePlanar` | `ChLinkLockPlanar` |
| POINT_LINE | `ChLinkMateGeneric(true,true,false,...)` | `ChLinkLockPointLine` |
| POINT_PLANE | `ChLinkMateGeneric(false,false,true,...)` | `ChLinkLockPointPlane` |
| UNIVERSAL | `ChLinkUniversal` | `ChLinkUniversal` (no Lock variant) |
| DISTANCE | `ChLinkDistance` | `ChLinkDistance` (no Lock variant) |

All Lock types use uniform `Initialize(body1, body2, ChFramed(pos, rot))`. See P5 for full details.

---

## 9. Gap Analysis: MotionLab vs. URDF

### 9.1 Critical Gaps (affect daily workflow)

| # | Gap | Impact | URDF Reference |
|---|-----|--------|---------------|
| G1 | **No numeric pose input** — cannot type position/rotation values for bodies, geometries, or datums | Users cannot precisely position anything | Every `<origin>` in URDF |
| G2 | **No body pose shown at authoring time** — only visible during simulation | Users don't know where their body is in world space | `<link>` position is implicit from joint chain |
| G3 | **No body coordinate frame visualization** | Cannot verify body orientation | URDF viewers show link frames |
| G4 | **Joint axis is invisible** — derived from datum Z-axis but never displayed as an axis vector | Users can't verify the revolute/prismatic axis | `<axis xyz>` is explicit |
| G5 | **No snap-to-grid or angular snap** | Imprecise manual positioning | CAD-standard feature |

### 9.2 Moderate Gaps (affect specific workflows)

| # | Gap | Impact | URDF Reference |
|---|-----|--------|---------------|
| G6 | **No inertial frame orientation** — CoM stored as offset, but no independent inertia rotation | Principal axes must align with body frame | `<inertial><origin rpy>` |
| G7 | **No collision rotation offset** — position offset only | Tilted collision shapes impossible | `<collision><origin rpy>` |
| G8 | **No joint velocity limits** | Cannot constrain max speed | `<limit velocity>` |
| G9 | **No per-joint damping/friction** | Physics tuning limited to global values | `<dynamics damping friction>` |
| G10 | **No world origin axes** | No absolute spatial reference | Standard in 3D viewers |
| G11 | **`localPose` mislabeled for detached geometry** | Confusing dual semantics | — |

### 9.3 Minor Gaps (niche or future needs)

| # | Gap | Impact |
|---|-----|--------|
| G12 | No `continuous` joint type (unbounded revolute) | Workaround: revolute without limits |
| G13 | No `floating` joint type (6-DOF) | Uncommon in constrained mechanisms |
| G14 | No `mimic` joints | Gear/follower joints not supported |
| G15 | No CoM / inertia ellipsoid visualization | Advanced debugging only |
| G16 | No collision wireframe overlay | Hard to verify collision shapes |

---

## 10. Proposed UX Enhancements

### P1: Editable Position + Euler Rotation in All Inspectors (addresses G1, G2)

Every entity inspector should show position (x, y, z) and rotation (Euler angles in degrees) as **editable numeric fields**. No quaternion UI — quaternions are the internal representation; users think in degrees.

The infrastructure is partially there:
- `Vec3Display` already has an `editable` prop (`vec3-display.tsx:19`) — just set it to `true`
- `QuatDisplay` already converts to Euler for display (`quat-display.tsx:37`) — needs an `onChange` that converts Euler input back to quaternion internally
- Body inspector needs to show pose **at all times** (not just during sim)

**Implementation sketch:**
```
Body Inspector:
  Pose (world):
    Position:  X [____] m   Y [____] m   Z [____] m
    Rotation:  X [____]°    Y [____]°    Z [____]°

Geometry Inspector:
  Pose (relative to body):
    Position:  X [____] m   Y [____] m   Z [____] m
    Rotation:  X [____]°    Y [____]°    Z [____]°

Datum Inspector:
  Pose (relative to body):
    Position:  X [____] m   Y [____] m   Z [____] m
    Rotation:  X [____]°    Y [____]°    Z [____]°
```

All numeric fields are editable. The user types exact coordinates and angles. Internally the frontend converts Euler degrees → quaternion before sending to the engine. This is the same pattern every CAD tool and game engine uses.

**Protocol additions needed:**
- `UpdateGeometryPoseCommand` (new) — to move geometry within body
- Body inspector wiring to call `sendUpdateBody({ pose: ... })`
- Datum inspector wiring already exists (`sendUpdateDatumPose`)

**Euler convention:** Use XYZ extrinsic (roll-pitch-yaw), matching URDF's `rpy` convention. Display in degrees, store/transmit as quaternion. The `quatToEulerDeg` utility already exists; add the inverse `eulerDegToQuat`.

**Coordinate space labels:** Every pose section header must state its frame: "(world)" or "(relative to body)".

### P2: Gizmo Enhancements (addresses G5)

- **Grid snap:** Add snap increment to `TransformControls` (drei supports `translationSnap` and `rotationSnap` props)
- **Configurable snap values:** 1mm, 5mm, 10mm, 50mm, 100mm for translation; 5°, 15°, 45°, 90° for rotation
- **Hold Shift to snap** — common convention
- **Local/World frame toggle on gizmo** — button or hotkey to switch transform gizmo orientation

### P3: Frame Visualization (addresses G3, G4, G10)

- **World origin triad** at (0,0,0) — small permanent XYZ axes
- **Body frame triad** — show XYZ axes at body origin when body is selected
- **Joint axis indicator** — render the rotation/translation axis as a dashed line through the joint when joint is selected. Use the datum Z-axis world direction with a label ("Axis: Z" or the actual direction vector).

### P4: Frame Labels Throughout UI (addresses G11)

- Rename "Local Pose" to **"Pose (body-local)"** for parented entities
- For detached geometry, label as **"Pose (world)"**
- Joint inspector already has a local/world toggle — extend this pattern to body and datum inspectors
- When displaying world-space values, add a subtle "(world)" suffix

### P5: Chrono Backend Overhaul — ChLinkLock Everywhere + Simplification Opportunities

This section consolidates findings from the Chrono documentation with the current MotionLab implementation. Several opportunities exist to simplify the engine code, unlock features, and better align with Chrono's intended usage patterns.

#### 5a. Switch ALL joints to ChLinkLock (addresses G8, G9)

**Current state (simulation.cpp:876-1018):**
The engine maintains two code paths per joint type — `ChLinkMate` (no limits) and `ChLinkLock` (limits). Revolute, prismatic, and cylindrical conditionally upgrade. Point-line and point-plane use `ChLinkMateGeneric`. This creates branching complexity and blocks adding dynamics.

**Discovery from Chrono docs:** Lock variants exist for nearly ALL our joint types:

| MotionLab Type | Current Chrono Class | ChLinkLock Equivalent |
|---------------|---------------------|----------------------|
| Fixed | `ChLinkMateFix` | `ChLinkLockLock` |
| Revolute | `ChLinkMateRevolute` / `ChLinkLockRevolute` | `ChLinkLockRevolute` |
| Prismatic | `ChLinkMatePrismatic` / `ChLinkLockPrismatic` | `ChLinkLockPrismatic` |
| Cylindrical | `ChLinkMateCylindrical` / `ChLinkLockCylindrical` | `ChLinkLockCylindrical` |
| Spherical | `ChLinkMateSpherical` | `ChLinkLockSpherical` |
| Planar | `ChLinkMatePlanar` | `ChLinkLockPlanar` |
| Point-Line | `ChLinkMateGeneric(true,true,false,...)` | `ChLinkLockPointLine` |
| Point-Plane | `ChLinkMateGeneric(false,false,true,...)` | `ChLinkLockPointPlane` |
| Universal | `ChLinkUniversal` | No Lock variant (keep as-is) |
| Distance | `ChLinkDistance` | No Lock variant (keep as-is) |

**Recommendation: switch ALL joints to ChLinkLock except Universal and Distance** (which have no Lock equivalents).

Rationale:
- **Eliminates ALL dual-path branching** — every joint becomes a single create + optional config block
- **Uniform initialization** — all Lock variants use `ChFramed(pos, rot)`, replacing the inconsistent Mate init signatures (two-point two-axis, ChFrame pair, single-point, etc.)
- **Uniform feature surface** — limits, damping, friction, velocity limits become optional `if` blocks on any joint. No type-upgrade logic.
- **Uniform reaction force/torque** — `GetReact_Force()` / `GetReact_Torque()` work consistently
- **Eliminates ChLinkMateGeneric** — point-line and point-plane get proper named classes instead of cryptic boolean tuples `(true,true,false,false,false,false)`
- **Performance is irrelevant** — MotionLab mechanisms have tens of joints, not thousands

**Before (current codebase — 3 different init patterns, branching):**
```cpp
// Revolute: two-path, two different init signatures
if (has_limits) {
    auto lock = make_shared<ChLinkLockRevolute>();
    lock->Initialize(parent, child, ChFramed(pos, rot));
    lock->LimitRz().SetActive(true); ...
} else {
    auto mate = make_shared<ChLinkMateRevolute>();
    mate->Initialize(parent, child, false, pos1, pos2, axis1, axis2);
}

// Fixed: ChFrame pair
auto mate = make_shared<ChLinkMateFix>();
mate->Initialize(parent, child, false, ChFrame<>(pos1, rot1), ChFrame<>(pos2, rot2));

// Point-Line: cryptic boolean tuple
auto mate = make_shared<ChLinkMateGeneric>(true, true, false, false, false, false);
mate->Initialize(parent, child, false, ChFrame<>(pos1, rot1), ChFrame<>(pos2, rot2));
```

**After (Lock-only — uniform pattern for all 8 types):**
```cpp
// Every joint type follows the same pattern:
auto lock = chrono_types::make_shared<ChLinkLock____>();
lock->Initialize(parent_body, child_body, ChFramed(parent_wf.pos, parent_wf.rot));
// Optional: limits, damping, friction, velocity limits as simple if-blocks
link = lock;
```

Example — revolute with all optional dynamics:
```cpp
auto lock = chrono_types::make_shared<ChLinkLockRevolute>();
lock->Initialize(parent_body, child_body, ChFramed(parent_wf.pos, parent_wf.rot));
if (joint.has_revolute()) {
    const auto& cfg = joint.revolute();
    if (cfg.has_angle_limit()) {
        lock->LimitRz().SetActive(true);
        lock->LimitRz().SetMin(cfg.angle_limit().lower());
        lock->LimitRz().SetMax(cfg.angle_limit().upper());
    }
    if (cfg.damping() > 0 || cfg.friction() > 0) {
        lock->GetForce_Rz().SetActive(true);
        lock->GetForce_Rz().SetR(cfg.damping());
        lock->GetForce_Rz().SetK(cfg.friction());
    }
    if (cfg.velocity_limit() > 0) {
        lock->LimitDt_Rz().SetActive(true);
        lock->LimitDt_Rz().SetMax(cfg.velocity_limit());
        lock->LimitDt_Rz().SetMin(-cfg.velocity_limit());
    }
}
link = lock;
```

**Proto extension:**
```protobuf
message RevoluteJointConfig {
  Range angle_limit = 1;         // existing
  double damping = 2;            // N·m·s/rad (optional, 0 = none)
  double friction = 3;           // N·m (optional, 0 = none)
  double velocity_limit = 4;     // rad/s (optional, 0 = none)
}
// Same pattern for Prismatic, Cylindrical, Spherical, Planar, PointLine, PointPlane
```

Add UI rows in JointInspector for damping, friction, and velocity limit.

#### 5b. Use ChBodyAuxRef for proper inertial frame (addresses G6)

**Discovery from Chrono docs:**
> "In ChBody base class the COM and Ref always coincide, while only in ChBodyAuxRef and derived classes the Ref frame might be placed elsewhere."

This is exactly the missing URDF `<inertial><origin>` concept. Currently MotionLab uses `ChBody` where the body frame IS the center of mass. This means:
- Visual/collision shapes are positioned relative to the COM
- If the user imports a CAD part where the geometry origin is not at the COM, the body origin silently moves to the COM
- There's no way to decouple the body reference frame from the mass center

**Recommendation:** Switch from `ChBody` to `ChBodyAuxRef`.

With `ChBodyAuxRef`:
- The body's `Ref` frame (where geometries, datums, and visual shapes attach) stays where the user put it
- The COM frame is set separately via the mass properties' center_of_mass offset
- `GetPos()`/`SetPos()` refer to COM, but `GetFrameRefToAbs()` gives the reference frame
- This matches URDF: the link frame is the reference, and `<inertial><origin>` offsets the COM from it

**Impact on existing code:**
- `simulation.cpp` body creation: `make_shared<ChBody>()` → `make_shared<ChBodyAuxRef>()`
- Set ref frame from `body.pose` (user's body origin)
- Set COM offset from `mass_properties.center_of_mass`
- Visual/collision shapes continue to attach to the ref frame (no change)
- Datum world frame computation needs no change (datums are body-local, which means ref-local)

#### 5c. Use ChLinkMotor as joint+actuator instead of separate link (simplification)

**Discovery from Chrono docs:**
> `ChLinkMotorRotation` inherits from `ChLinkMate` and by default embeds a revolute constraint via `SetSpindleConstraint(REVOLUTE)`. Similarly `ChLinkMotorLinear` embeds a prismatic constraint via `SetGuideConstraint(PRISMATIC)`.

**Current approach (simulation.cpp:789-873):** When a joint has an actuator, we create a `ChLinkMotor*` as a separate link alongside the joint constraint. This means two Chrono links for one logical joint — the motor and the constraint.

**Simplified approach:** For actuated revolute/prismatic joints, use `ChLinkMotorRotation*` / `ChLinkMotorLinear*` directly as the ONLY link. The motor already includes the joint constraint. This eliminates the separate joint link entirely for actuated joints.

Available motor+joint combos (from Chrono docs):
- `ChLinkMotorRotationAngle` (position control) + revolute constraint
- `ChLinkMotorRotationSpeed` (velocity control) + revolute constraint
- `ChLinkMotorRotationTorque` (effort control) + revolute constraint
- `ChLinkMotorLinearPosition` + prismatic constraint
- `ChLinkMotorLinearSpeed` + prismatic constraint
- `ChLinkMotorLinearForce` + prismatic constraint

The spindle/guide constraint mode can also be changed:
- `SetSpindleConstraint(CYLINDRICAL)` — motor + cylindrical joint
- `SetSpindleConstraint(OLDHAM)` — motor + Oldham joint
- `SetSpindleConstraint(FREE)` — motor only, no joint constraint
- `SetGuideConstraint(SPHERICAL)` — linear motor + spherical joint

**Impact:** Eliminate the "check for actuator → create motor link" block (lines 789-873) and instead select motor-as-joint when an actuator exists. Fewer Chrono objects in the system, simpler code.

**Caveat:** Motors inherit from ChLinkMate, not ChLinkLock. So actuated joints would not get Lock's limit/damping API. For actuated joints this is acceptable — the motor itself controls the motion. If limits are also needed on an actuated joint, the motor's `ChFunction` can enforce them, or we keep the Lock+Motor dual-link approach for that edge case.

#### 5d. Use ChLinkTSDA / ChLinkRSDA for spring-dampers (simplification)

**Discovery from Chrono docs:**
> `ChLinkTSDA`: linear spring+damper between two points with custom force functors
> `ChLinkRSDA`: rotational spring+damper around Z axis with custom force functors

**Current approach:** MotionLab defines `LinearSpringDamperLoad` in the proto schema and implements it as a custom force in the simulation.

**Simplified approach:** Map `LinearSpringDamperLoad` directly to `ChLinkTSDA`:
```cpp
auto tsda = chrono_types::make_shared<ChLinkTSDA>();
tsda->Initialize(parent_body, child_body, true, parent_pos, child_pos);
tsda->SetRestLength(rest_length);
tsda->SetSpringCoefficient(stiffness);
tsda->SetDampingCoefficient(damping);
```

Benefits:
- Chrono handles the force computation, Jacobians, and integration natively
- `ChLinkTSDA` supports custom force functors for nonlinear springs if needed later
- Eliminates custom force application code

#### 5e. New joint types unlocked by Chrono (future)

The Chrono docs reveal several joint types we could expose with minimal engine work:

| Chrono Class | DOF | Description | Use Case |
|-------------|-----|-------------|----------|
| `ChLinkLockGear` | 1 | Couple rotation over Z axes | Gear trains |
| `ChLinkLockPulley` | 1 | Pulley coupling | Belt/chain drives |
| `ChLinkMateRackPinion` | 1 | Rack-pinion coupling | Steering mechanisms |
| `ChLinkLockOldham` | 4 | Oldham joint | Misaligned shafts |
| `ChLinkRevoluteSpherical` | 2 | Revolute + spherical | Connecting rods |
| `ChLinkBushing` | 6\|3 | Linear compliance + optional spherical | Rubber mounts, compliant joints |

These are not urgent but become trivial to add once the Lock-based architecture is in place.

#### Summary: Chrono simplification impact

| Change | Lines Removed | Lines Added | Net | Complexity Reduction |
|--------|--------------|-------------|-----|---------------------|
| 5a. All joints → Lock | ~80 (dual paths + MateGeneric) | ~50 (uniform Lock) | -30 | Eliminates branching, 3 init patterns → 1 |
| 5b. ChBody → ChBodyAuxRef | ~5 | ~10 | +5 | Unlocks inertial frame, matches URDF |
| 5c. Motor as joint+actuator | ~60 (separate motor block) | ~30 (motor replaces joint) | -30 | Fewer Chrono objects, cleaner actuator flow |
| 5d. ChLinkTSDA for springs | ~30 (custom force code) | ~10 (TSDA init) | -20 | Delegates force math to Chrono |
| **Total** | **~175** | **~100** | **~-75** | **Major** |

### P6: Collision & Inertia Enhancements (addresses G6, G7, G15, G16)

- Add `Quat orientation` to `CollisionConfig` for rotated collision shapes
- Add `Quat inertia_orientation` to `MassProperties` for rotated inertia frames (complementary to P5b's ChBodyAuxRef change)
- Add viewport overlays: collision wireframe, CoM marker, inertia ellipsoid (all toggleable)

---

## Key Files Reference

### Schema
| File | Lines | Content |
|------|-------|---------|
| `schemas/mechanism/mechanism.proto` | 34-53 | Vec3, Quat, Pose |
| | 61-71 | MassProperties |
| | 82-91 | Body |
| | 96-107 | Geometry |
| | 147-165 | CollisionConfig |
| | 168-173 | Datum |
| | 175-255 | Joint, JointType, configs |
| `schemas/protocol/transport.proto` | 332-335 | UpdateDatumPoseCommand |
| | 346-352 | UpdateBodyCommand |
| | 395-408 | AttachGeometryCommand |
| | 450-461 | UpdateMassPropertiesCommand |
| | 515-530 | UpdateCollisionConfigCommand |
| | 546-558 | MakeCompoundBodySuccess |
| | 605-636 | CreateJointCommand |

### Native Engine
| File | Lines | Content |
|------|-------|---------|
| `native/engine/src/pose_math.h` | 40-66 | compose_pose, inverse_pose |
| `native/engine/src/mechanism_state.cpp` | 452-574 | make_compound_body |
| | 656-724 | compute_aggregate_mass |
| | 764-900 | Datum CRUD + co-translation |
| | 1015-1158 | Joint validation + CRUD |
| `native/engine/src/simulation.cpp` | 52-65 | compute_datum_world_frame |
| | 89-91 | z_axis_from_rot |
| | 656-659 | Chrono mass setup |
| | 685-753 | Collision shape registration |
| | 876-1018 | Joint → Chrono link creation |
| `native/engine/src/transport.cpp` | 639-750 | CreateDatumFromFace handler |
| | 955-1008 | UpdateBody + co-translation |
| | 1185-1253 | MakeCompoundBody handler |
| | 1575-1669 | UpdateCollisionConfig + auto-fit |
| `native/engine/src/cad_import.cpp` | 253-368 | STEP transform extraction |
| | 464-502 | Mass properties from BRep |

### Frontend — Stores
| File | Lines | Content |
|------|-------|---------|
| `packages/frontend/src/stores/mechanism.ts` | 20-23 | BodyPose interface |
| | 25-33 | BodyState |
| | 35-59 | GeometryState |
| | 69-76 | DatumState |
| | 78-88 | JointState |

### Frontend — Inspectors
| File | Content |
|------|---------|
| `packages/frontend/src/components/BodyInspector.tsx` | Body properties, mass section, sim pose |
| `packages/frontend/src/components/GeometryInspector.tsx` | Geometry properties, collision, computed mass |
| `packages/frontend/src/components/DatumInspector.tsx` | Datum local pose, axis presets |
| `packages/frontend/src/components/JointInspector.tsx` | Joint type, limits, coordinate frames, reactions |
| `packages/frontend/src/components/LoadInspector.tsx` | Load vectors, reference frame toggle |
| `packages/frontend/src/components/ActuatorInspector.tsx` | Motor control mode, command, effort limit |

### Frontend — Inspector Sections
| File | Content |
|------|---------|
| `packages/frontend/src/components/inspector/sections/MassSection.tsx` | Mass override, CoM, inertia |
| `packages/frontend/src/components/inspector/sections/CollisionSection.tsx` | Collision shape config |
| `packages/frontend/src/components/inspector/sections/PrimitiveParamsSection.tsx` | Primitive dimensions |
| `packages/frontend/src/components/inspector/sections/AxisPresetBar.tsx` | Datum Z-axis presets |
| `packages/frontend/src/components/inspector/sections/PoseSection.tsx` | Read-only pose display wrapper |

### Frontend — UI Primitives
| File | Content |
|------|---------|
| `packages/ui/src/components/engineering/vec3-display.tsx` | Position display (has unused `editable` prop) |
| `packages/ui/src/components/engineering/quat-display.tsx` | Rotation display (read-only, Euler/quat toggle) |

### Viewport
| File | Lines | Content |
|------|-------|---------|
| `packages/viewport/src/R3FViewport.tsx` | 58-102 | GizmoBridge (TransformControls) |
| | 244-258 | Grid rendering |
| `packages/viewport/src/scene-graph-three.ts` | 273-281 | setPose() |
| | 984-1170 | Body + geometry scene graph |
| | 1302-1420 | Datum scene graph (triad rendering) |
| | 1420-1545 | Joint scene graph |
| | 2160-2230 | Gizmo management |
| `packages/viewport/src/datum-pose.ts` | 10-54 | World → body-local datum conversion |
| `packages/frontend/src/hooks/useViewportBridge.ts` | 226-242 | Gizmo drag-end → engine commands |

### Protocol / Connection
| File | Lines | Content |
|------|-------|---------|
| `packages/frontend/src/engine/connection.ts` | 110-126 | extractPose() |
| | 472-523 | addDetachedGeometryToSceneGraph / addBodyToSceneGraph |
| | 1375-1390 | Co-translated datum reception |
| | 2248-2343 | MakeCompoundBody response handler |
| | 2550-2556 | sendUpdateCollisionConfig |
| | 2601-2674 | sendUpdateDatumPose / sendUpdateBody |
