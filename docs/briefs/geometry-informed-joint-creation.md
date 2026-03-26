# Geometry-Informed Joint Creation — Leveraging Chrono & OCCT

## Motivation

Joint creation is the most frequent operation in mechanism authoring. Today it takes ~6 user actions. The frontend implementation (Phases 1-7 of the scene-building-review-ux work) reduced this to 2-3 clicks by adding face hover in joint mode, geometry inference, connector previews, and auto-commit for high-confidence cases.

However, the current implementation has a fundamental limitation: **the frontend re-estimates geometry from triangle mesh normals** because the engine doesn't send enough geometric information back. The engine already has exact B-Rep data from OCCT, and the physics compilation already converts datums to Chrono frames — but neither of these capabilities is fully surfaced through the protocol.

This document defines three epics to close that gap, each building on the last.

---

## Research Findings

### What Chrono provides that we're not fully using

Chrono has two joint API patterns:

1. **ChLinkLock\*** (legacy, marker-based) — what MotionLab currently uses. Creates explicit ChMarker objects on each body, then constrains them. Heavier, more steps.

2. **ChLinkMate\*** (modern, frame-based) — a cleaner API that maps directly to CAD mate connectors. Supports a **point + direction** initialization:

```cpp
mate->Initialize(body1, body2, /*pos_are_relative=*/false,
    point1, point2,    // Face centroids
    dir1, dir2);       // Face normal/axis directions
```

Chrono auto-generates X/Y axes from just a Z-direction via `SetFromAxisZ()`. This is exactly what our datum system does with `quaternion_from_z()`. The ChLinkMate types map 1:1 to our joint types:

| MotionLab Joint | Chrono ChLinkMate | DOF Pattern |
|----------------|-------------------|-------------|
| Revolute | ChLinkMateRevolute | Constrain X,Y,Z,Rx,Ry — free Rz |
| Prismatic | ChLinkMatePrismatic | Constrain X,Y,Rx,Ry,Rz — free Z |
| Fixed | ChLinkMateFix | Constrain all |
| Spherical | ChLinkMateSpherical | Constrain X,Y,Z — free Rx,Ry,Rz |
| Cylindrical | ChLinkMateCylindrical | Constrain X,Y,Rx,Ry — free Z,Rz |
| Planar | ChLinkMatePlanar | Constrain Z,Rx,Ry — free X,Y,Rz |
| Universal | (use ChLinkMateGeneric) | Custom DOF mask |

### What OCCT provides that we're not fully using

The face classifier (`face_classifier.cpp`) calls OCCT APIs that return rich geometric data:

```cpp
const gp_Cylinder cylinder = surface.Cylinder();
// Available: cylinder.Radius(), cylinder.Axis(), cylinder.Location()

const gp_Sphere sphere = surface.Sphere();
// Available: sphere.Radius(), sphere.Location()

const gp_Cone cone = surface.Cone();
// Available: cone.SemiAngle(), cone.Apex(), cone.Axis()
```

But it only sends back position + orientation + surface class enum. The radius, axis direction vector, and other geometric properties are discarded.

OCCT also has pairwise geometric analysis that we don't use at all:

- **`gp_Ax1::IsCoaxial(other, angTol, linTol)`** — answers "are these two axes coaxial?" in one call
- **`gp_Dir::IsParallel(other, angTol)`** — answers "are these directions parallel?"
- **`gp_Lin::Distance(other)`** — shortest distance between two lines (axis separation)
- **`IntAna_QuadQuadGeo(cyl1, cyl2, tol)`** — full cylinder-cylinder intersection analysis

These are currently being approximated in the frontend with dot products on mesh normals in `datum-alignment.ts` and `surface-type-estimator.ts`.

### What's currently wasted

| Data | Available in engine | Sent to frontend | Frontend workaround |
|------|-------------------|-----------------|-------------------|
| Cylinder axis direction | Exact from OCCT `gp_Cylinder::Axis()` | Only as quaternion (orientation) | Estimated from mesh triangle normal cross-products |
| Cylinder radius | Exact from OCCT `gp_Cylinder::Radius()` | Not sent | Not available |
| Plane normal | Exact from OCCT `gp_Pln::Axis().Direction()` | Only as quaternion | Estimated from mesh face normals |
| Sphere radius | Exact from OCCT `gp_Sphere::Radius()` | Not sent | Not available |
| Coaxial relationship | Can use OCCT `gp_Ax1::IsCoaxial()` | Not computed | Heuristic in `datum-alignment.ts` using 0.999 dot threshold |
| Parallel planes | Can use OCCT `gp_Dir::IsParallel()` | Not computed | Heuristic in `datum-alignment.ts` |

---

## Epic 1: Enrich Face Classification Protocol

**Goal**: Send the geometric data the engine already has back to the frontend, eliminating the mesh-based surface type estimator hack.

**Effort**: Small — protocol schema change + ~30 lines in face_classifier.cpp + frontend consumer update.

### Proto Changes

```protobuf
// In transport.proto — extend CreateDatumFromFaceSuccess

message FaceGeometryMetadata {
  // Axis direction vector for cylindrical, conical, toroidal faces.
  // Not set for planar or spherical faces.
  optional motionlab.mechanism.Vec3 axis_direction = 1;

  // Surface normal vector for planar faces.
  // Not set for non-planar faces.
  optional motionlab.mechanism.Vec3 normal = 2;

  // Primary radius: cylinder radius, sphere radius, cone base radius,
  // torus major radius. Not set for planar/other faces.
  optional double radius = 3;

  // Secondary radius: torus minor radius. Only set for toroidal faces.
  optional double secondary_radius = 4;

  // Cone semi-angle in radians. Only set for conical faces.
  optional double semi_angle = 5;
}

message CreateDatumFromFaceSuccess {
  motionlab.mechanism.Datum datum = 1;
  uint32 face_index = 2;
  FaceSurfaceClass surface_class = 3;
  motionlab.mechanism.ElementId geometry_id = 4;

  // New: enriched geometric metadata from the B-Rep face.
  FaceGeometryMetadata face_geometry = 5;
}
```

### Engine Changes

**`face_classifier.h`** — Extend `FaceDatumPose` struct:
```cpp
struct FaceDatumPose {
    FaceDatumSurfaceClass surface_class;
    double position[3];
    double orientation[4];

    // New fields
    std::optional<std::array<double, 3>> axis_direction;  // For cylindrical/conical/toroidal
    std::optional<std::array<double, 3>> normal;           // For planar
    std::optional<double> radius;                          // Primary radius
    std::optional<double> secondary_radius;                // Torus minor radius
    std::optional<double> semi_angle;                      // Cone half-angle
};
```

**`face_classifier.cpp`** — Extract and store the data that's already available:
```cpp
case GeomAbs_Cylinder: {
    const gp_Cylinder cylinder = surface.Cylinder();
    // ... existing position/orientation code ...
    result.axis_direction = {axis_dir.X(), axis_dir.Y(), axis_dir.Z()};
    result.radius = cylinder.Radius();
    break;
}
case GeomAbs_Plane: {
    // ... existing position/orientation code ...
    result.normal = {normal.X(), normal.Y(), normal.Z()};
    break;
}
// Similarly for sphere, cone, torus
```

**`transport.cpp`** — Populate the new proto field in `handle_create_datum_from_face_command()`.

### Frontend Changes

**`packages/frontend/src/stores/mechanism.ts`** — Extend `DatumState`:
```typescript
interface DatumState {
  // ... existing fields ...
  faceGeometry?: {
    axisDirection?: { x: number; y: number; z: number };
    normal?: { x: number; y: number; z: number };
    radius?: number;
    secondaryRadius?: number;
    semiAngle?: number;
  };
}
```

**`packages/frontend/src/utils/joint-frame-inference.ts`** — Use exact geometry instead of estimated types:
- Use `faceGeometry.axisDirection` directly instead of inferring from mesh normals
- Use `faceGeometry.radius` for sizing previews proportionally

**`packages/viewport/src/rendering/surface-type-estimator.ts`** — Can be gradually deprecated once all datum creation paths go through the engine.

### Files to Modify

| File | Change |
|------|--------|
| `schemas/protocol/transport.proto` | Add `FaceGeometryMetadata` message, extend `CreateDatumFromFaceSuccess` |
| `native/engine/src/face_classifier.h` | Extend `FaceDatumPose` struct with optional geometry fields |
| `native/engine/src/face_classifier.cpp` | Populate new fields from existing OCCT data |
| `native/engine/src/transport.cpp` | Map new struct fields to proto response |
| `packages/protocol/src/generated/` | Regenerate from proto |
| `packages/frontend/src/stores/mechanism.ts` | Extend `DatumState` |
| `packages/frontend/src/engine/connection.ts` | Parse new fields in `createDatumFromFaceResult` handler |
| `packages/frontend/src/utils/joint-frame-inference.ts` | Use exact geometry data for inference |

### Verification

- Import a CAD model with cylindrical holes. Create datum from face. Verify that `faceGeometry.axisDirection` matches the cylinder axis and `faceGeometry.radius` matches the hole radius.
- Create datum from a flat face. Verify `faceGeometry.normal` matches the face normal.
- Verify the frontend joint inference uses exact axis data instead of mesh estimation.

---

## Epic 2: Engine-Side Pairwise Face Analysis

**Goal**: Move the coaxial/coplanar/coincident detection from frontend heuristics to exact OCCT geometry analysis in the engine. Enable the engine to recommend a joint type and proposed frame from two face picks.

**Effort**: Medium — new proto command, new C++ analysis function using OCCT APIs, frontend integration.

### Interaction Model

When the user picks two faces during joint creation, instead of:
1. Creating datum A (frontend waits for engine response)
2. Creating datum B (frontend waits again)
3. Computing alignment from datum world poses (frontend heuristic)
4. Recommending joint type (frontend inference)

The flow becomes:
1. Frontend sends `AnalyzeFacePairCommand(geometry_id_a, face_a, geometry_id_b, face_b)`
2. Engine returns: both datum poses + exact pairwise alignment + recommended joint type + proposed joint frame
3. Frontend auto-commits or shows type selector with engine-backed recommendation

This collapses two round-trips into one and uses exact B-Rep geometry for the analysis.

### Proto Changes

```protobuf
// New command
message AnalyzeFacePairCommand {
  motionlab.mechanism.ElementId parent_geometry_id = 1;
  uint32 parent_face_index = 2;
  motionlab.mechanism.ElementId child_geometry_id = 3;
  uint32 child_face_index = 4;
}

// Alignment result from exact B-Rep analysis
enum FacePairAlignment {
  FACE_PAIR_ALIGNMENT_UNSPECIFIED = 0;
  FACE_PAIR_ALIGNMENT_COAXIAL = 1;      // Shared axis (cylinders, cones)
  FACE_PAIR_ALIGNMENT_COPLANAR = 2;     // Parallel planes
  FACE_PAIR_ALIGNMENT_COINCIDENT = 3;   // Same point (spheres, close datums)
  FACE_PAIR_ALIGNMENT_PERPENDICULAR = 4; // Axes at 90 degrees
  FACE_PAIR_ALIGNMENT_GENERAL = 5;      // No special relationship
}

message FacePairAnalysisResult {
  oneof result {
    FacePairAnalysisSuccess success = 1;
    string error_message = 2;
  }
}

message FacePairAnalysisSuccess {
  // Datums created from each face
  motionlab.mechanism.Datum parent_datum = 1;
  FaceSurfaceClass parent_surface_class = 2;
  FaceGeometryMetadata parent_face_geometry = 3;
  motionlab.mechanism.ElementId parent_geometry_id = 4;
  uint32 parent_face_index = 5;

  motionlab.mechanism.Datum child_datum = 6;
  FaceSurfaceClass child_surface_class = 7;
  FaceGeometryMetadata child_face_geometry = 8;
  motionlab.mechanism.ElementId child_geometry_id = 9;
  uint32 child_face_index = 10;

  // Pairwise analysis
  FacePairAlignment alignment = 11;
  double alignment_error = 12;           // Numeric measure of fit (0 = perfect)

  // Engine recommendation
  JointType recommended_joint_type = 13;
  double recommendation_confidence = 14; // 0.0 to 1.0
  motionlab.mechanism.Pose proposed_joint_frame = 15; // Midpoint frame for the joint
}
```

### Engine Changes

**New file: `face_pair_analyzer.h` / `face_pair_analyzer.cpp`**

Core function:
```cpp
struct FacePairAnalysis {
    FaceDatumPose parent_pose;
    FaceDatumPose child_pose;
    FacePairAlignment alignment;
    double alignment_error;
    mech::JointType recommended_type;
    double confidence;
    std::array<double, 3> joint_frame_position;
    std::array<double, 4> joint_frame_orientation;
};

std::optional<FacePairAnalysis> analyze_face_pair(
    const TopoDS_Shape& parent_shape,
    uint32_t parent_face_index,
    const TopoDS_Shape& child_shape,
    uint32_t child_face_index,
    const Pose& parent_body_pose,
    const Pose& child_body_pose
);
```

Implementation uses OCCT pairwise APIs:

```cpp
// For two cylindrical faces:
gp_Ax1 ax1 = cyl1.Axis();
gp_Ax1 ax2 = cyl2.Axis();

if (ax1.IsCoaxial(ax2, angular_tol, linear_tol)) {
    result.alignment = FacePairAlignment::COAXIAL;
    result.recommended_type = JOINT_TYPE_REVOLUTE;
    result.confidence = 1.0;
    // Joint frame at midpoint of the two axis projections
}

// For two planar faces:
gp_Dir n1 = pln1.Axis().Direction();
gp_Dir n2 = pln2.Axis().Direction();

if (n1.IsParallel(n2, angular_tol)) {
    result.alignment = FacePairAlignment::COPLANAR;
    result.recommended_type = JOINT_TYPE_FIXED;
    result.confidence = 0.7;
}

// For cylindrical + planar:
// Axis-plane intersection gives a joint point
gp_Lin axis_line(cyl.Axis());
IntAna_IntConicQuad inter(axis_line, pln, angular_tol);
if (inter.IsDone() && inter.NbPoints() > 0) {
    // Intersection point = natural joint location
}
```

**`transport.cpp`** — Add `handle_analyze_face_pair_command()` handler.

### Frontend Changes

**`packages/frontend/src/engine/connection.ts`**:
- Add `sendAnalyzeFacePair()` function
- Add `facePairAnalysisResult` handler that creates both datums and either auto-commits or advances to type selection

**`packages/frontend/src/stores/joint-creation.ts`**:
- Add a `'analyzing'` step between `pick-child` and `select-type`
- Store the analysis result for use by auto-commit and type selector

**`packages/frontend/src/hooks/useViewportBridge.ts`**:
- When both face picks are complete, send `AnalyzeFacePairCommand` instead of two separate `CreateDatumFromFaceCommand` calls

### Alignment Detection Matrix

| Parent Face | Child Face | OCCT Check | Alignment | Recommended Joint |
|------------|------------|------------|-----------|-------------------|
| Cylindrical | Cylindrical | `gp_Ax1::IsCoaxial()` | Coaxial | Revolute (conf: 1.0) |
| Cylindrical | Cylindrical | `gp_Dir::IsParallel()` + `gp_Lin::Distance() > tol` | Parallel | Prismatic (conf: 0.7) |
| Planar | Planar | `gp_Dir::IsParallel()` | Coplanar | Fixed (conf: 0.7) |
| Spherical | Spherical | `Location().Distance() < tol` | Coincident | Spherical (conf: 0.9) |
| Cylindrical | Planar | `IntAna_IntConicQuad` | Axis-plane | Revolute (conf: 0.8) |
| Any | Any | None of above | General | Fixed (conf: 0.3) |

### Files to Create / Modify

| File | Change |
|------|--------|
| `schemas/protocol/transport.proto` | Add `AnalyzeFacePairCommand`, `FacePairAnalysisResult`, `FacePairAlignment` |
| `native/engine/src/face_pair_analyzer.h` | New — analysis interface |
| `native/engine/src/face_pair_analyzer.cpp` | New — OCCT pairwise analysis implementation |
| `native/engine/src/transport.cpp` | Add command handler |
| `packages/protocol/src/generated/` | Regenerate |
| `packages/frontend/src/engine/connection.ts` | Add send/receive functions |
| `packages/frontend/src/stores/joint-creation.ts` | Add `analyzing` step, store analysis result |
| `packages/frontend/src/hooks/useViewportBridge.ts` | Use pairwise command instead of two datum commands |

### Verification

- Import a model with two coaxial cylindrical holes on different bodies. Pick both faces. Verify the engine returns `COAXIAL` alignment with confidence 1.0 and recommends `REVOLUTE`.
- Pick two parallel flat faces. Verify `COPLANAR` alignment.
- Pick a cylindrical face and a flat face that intersects the cylinder axis. Verify the engine computes the intersection point as the joint frame location.
- Verify auto-commit fires for coaxial cylinders and the type selector opens for lower-confidence cases.

---

## Epic 3: Migrate from ChLinkLock to ChLinkMate

**Goal**: Replace the legacy ChLinkLock joint compilation with modern ChLinkMate, aligning the engine with Chrono's recommended API and enabling the point+direction initialization pattern.

**Effort**: Medium-large — changes to `simulation.cpp` compilation, motor handling, limit application, and output channel extraction.

### Why Migrate

1. **ChLinkMate is Chrono's modern API** — ChLinkLock is the older marker-based pattern. Chrono documentation and examples increasingly use ChLinkMate.

2. **Cleaner initialization** — ChLinkMate supports `Initialize(body1, body2, point1, point2, dir1, dir2)` which maps directly to datum positions + Z-axes. No need to compose a full frame.

3. **No marker overhead** — ChLinkLock creates ChMarker objects on each body. ChLinkMate stores frames directly in the link.

4. **DOF-mask genericity** — ChLinkMateGeneric allows arbitrary DOF constraint masks, enabling future custom joint types without new ChLink subclasses.

5. **Motor integration** — ChLinkMotor\* classes extend ChLinkMateGeneric, making the actuator compilation path simpler. Currently we switch between ChLinkLock* and ChLinkMotor* depending on whether an actuator is attached; with ChLinkMate the base constraint pattern is the same.

### Current Compilation (simulation.cpp ~lines 722-930)

```cpp
// Current pattern per joint:
auto lock_link = chrono_types::make_shared<ChLinkLockRevolute>();
auto wf = compute_datum_world_frame(body_pose, datum_local_pose);
lock_link->Initialize(parent_chrono_body, child_chrono_body, ChFramed(wf.pos, wf.rot));
lock_link->LimitRz().SetActive(true);
lock_link->LimitRz().SetMin(lower);
lock_link->LimitRz().SetMax(upper);
system->AddLink(lock_link);
```

### Target Compilation

```cpp
// New pattern per joint:
auto mate = chrono_types::make_shared<ChLinkMateRevolute>();
auto parent_wf = compute_datum_world_frame(parent_body_pose, parent_datum_pose);
auto child_wf = compute_datum_world_frame(child_body_pose, child_datum_pose);
mate->Initialize(
    parent_chrono_body, child_chrono_body,
    /*pos_are_relative=*/false,
    ChVector3d(parent_wf.pos),
    ChVector3d(child_wf.pos),
    ChVector3d(parent_wf.z_axis),
    ChVector3d(child_wf.z_axis)
);
system->AddLink(mate);
```

### Migration Map

| MotionLab Joint | Current ChLink | Target ChLinkMate | Notes |
|----------------|---------------|-------------------|-------|
| Revolute | `ChLinkLockRevolute` | `ChLinkMateRevolute` | Limits via ChLinkLimit on the mate's internal ChLinkLock (if needed) or via ChLinkMotorRotation |
| Prismatic | `ChLinkLockPrismatic` | `ChLinkMatePrismatic` | Same limit approach |
| Fixed | `ChLinkLockLock` | `ChLinkMateFix` | No limits needed |
| Spherical | `ChLinkLockSpherical` | `ChLinkMateSpherical` | No limits |
| Cylindrical | `ChLinkLockCylindrical` | `ChLinkMateCylindrical` | Two limit DOFs (Z + Rz) |
| Planar | `ChLinkLockPlanar` | `ChLinkMatePlanar` | Three limit DOFs (X, Y, Rz) |
| Universal | `ChLinkUniversal` | `ChLinkMateGeneric(true,true,true,false,false,true)` | Custom DOF mask |
| Distance | `ChLinkDistance` | Keep as `ChLinkDistance` | Distance constraints don't have a mate equivalent |
| Point-Line | `ChLinkLockPointLine` | `ChLinkMateGeneric(true,true,false,false,false,false)` | Custom mask |
| Point-Plane | `ChLinkLockPointPlane` | `ChLinkMateGeneric(false,false,true,false,false,false)` | Custom mask |

### Limit Handling

ChLinkMate does not expose `LimitRz()` / `LimitZ()` directly like ChLinkLock does. Options:

1. **Use ChLinkMotor\* for limited joints** — when limits are specified, use a motor link with a position clamp function instead of a passive limit. This aligns with the actuator compilation path.

2. **Use ChLinkMateGeneric + manual constraint clamping** — implement limits in the post-step callback.

3. **Wrap with a secondary ChLinkLimit** — add a separate limit constraint referencing the same bodies.

Option 1 is recommended since we already switch to motor links when an actuator is present. Making motors the default for limited joints simplifies the logic.

### Motor Compilation

Current: separate code paths for joints-with-actuators vs joints-without.

Target: all joints use ChLinkMate for the constraint. When an actuator is present, a ChLinkMotor\* is used instead (it inherits ChLinkMateGeneric, so the frame initialization is identical).

```cpp
if (has_actuator) {
    auto motor = chrono_types::make_shared<ChLinkMotorRotationAngle>();
    motor->Initialize(parent, child, false, parent_pos, child_pos, parent_dir, child_dir);
    motor->SetAngleFunction(chrono_types::make_shared<ChFunctionConst>(command_value));
    system->AddLink(motor);
} else {
    auto mate = chrono_types::make_shared<ChLinkMateRevolute>();
    mate->Initialize(parent, child, false, parent_pos, child_pos, parent_dir, child_dir);
    system->AddLink(mate);
}
```

### Output Channel Extraction

Verify that reaction forces/torques and constraint violations can be extracted from ChLinkMate the same way as ChLinkLock:

```cpp
// ChLinkMateGeneric provides:
ChWrenchd GetReaction1();  // Reaction on body1
ChWrenchd GetReaction2();  // Reaction on body2
ChFrame<> GetFrame1Abs();  // Link frame 1 in world
ChFrame<> GetFrame2Abs();  // Link frame 2 in world
```

These map to the existing `joint/<uuid>/reaction_force` and `joint/<uuid>/reaction_torque` output channels.

### Files to Modify

| File | Change |
|------|--------|
| `native/engine/src/simulation.cpp` | Replace ChLinkLock* creation with ChLinkMate* |
| `native/engine/src/simulation.h` | Update stored link type references if any |
| `native/engine/src/mechanism_state.cpp` | No change (operates on proto, not Chrono objects) |

### Risk Assessment

- **Behavioral equivalence**: ChLinkMate and ChLinkLock solve the same constraint equations. The physical behavior should be identical for the same joint frame.
- **Limit handling**: Needs investigation — ChLinkMate's limit story is less straightforward than ChLinkLock's `LimitRz()`.
- **Reaction forces**: Need to verify the sign conventions and reference frames match between the two APIs.
- **Motor links**: Already extend ChLinkMateGeneric, so the transition should be smooth for the actuator path.

### Verification

- Load a saved project with revolute, prismatic, fixed, and spherical joints. Compile and simulate. Verify identical motion compared to the ChLinkLock compilation.
- Verify joint coordinate outputs (position, velocity) match between old and new compilation.
- Verify reaction forces match (may need sign convention adjustment).
- Verify joints with limits behave identically.
- Verify actuator-driven joints work correctly.
- Run the existing integration test suite for mechanism compilation.

---

## Dependency Graph

```
Epic 1 (Protocol Enrichment)
    │
    ├── Can be implemented independently
    │   Immediately improves frontend joint inference accuracy
    │
    v
Epic 2 (Pairwise Analysis)
    │
    ├── Depends on Epic 1 (uses FaceGeometryMetadata in its response)
    │   Collapses 2 round-trips into 1, moves inference to engine
    │
    v
Epic 3 (ChLinkMate Migration)
    │
    ├── Independent of Epics 1-2 (can be done in parallel)
    │   Architectural modernization of the physics compilation
    │
    (future: Epic 2 pairwise analysis can feed point+direction
     directly to ChLinkMate initialization, closing the full loop)
```

## Priority Recommendation

1. **Epic 1 first** — lowest effort, highest immediate impact on UX. Unblocks better frontend inference without any new commands.
2. **Epic 2 next** — medium effort, completes the geometry-informed joint creation story. Eliminates the viewport mesh estimator entirely.
3. **Epic 3 in parallel or after** — architectural improvement. Less visible to the user but aligns the engine with modern Chrono patterns and simplifies future work.
