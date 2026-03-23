# Epic 10 — Face-Level Topology Selection & Geometry-Aware Datum Creation

> **Status:** Complete except for parity hardening
> **Completed through:** Commits `782d9dc` and `0aac00f`
> **Dependency:** Epic 5 (Datum CRUD) — complete. Epic 3 (OCCT import pipeline) — complete.
>
> **What's done:**
> - Prompt 1 (Engine): Complete. `ShapeRegistry` persists B-Rep shapes after import (`shape_registry.h/.cpp`). `FaceClassifier` classifies faces and computes datum poses for Planar, Cylindrical, Conical, Spherical, and Other types (`face_classifier.h/.cpp`). `MeshData.part_index` emitted during tessellation. `CreateDatumFromFaceCommand`/`Result` with `FaceSurfaceClass` enum in transport.proto. Engine handler in transport.cpp. `test_face_classifier.cpp` with box, cylinder, cone, sphere, torus tests. ADR-0007 written.
> - Prompt 2 (Frontend Topology Index): Complete. `BodyGeometryIndex` (`body-geometry-index.ts`) with O(1) triangleToFace lookup from partIndex. Face highlighting via vertex colors in `SceneGraphManager.highlightFace()`/`clearFaceHighlight()`. Face-aware hover in `PickingManager.updateHoveredFace()` with `pickSpatialData()` returning faceIndex. `getHoveredFace()` exposed for click consumption.
> - Prompt 3 (Face-Aware Datum Creation Mode): Complete. `sendCreateDatumFromFace()` wired in connection.ts. Create-datum mode uses hoveredFace to send `CreateDatumFromFaceCommand`. Surface class label mapping in `surfaceClassToLabel()`. Result handler updates mechanism store.
>
> **Remaining hardening before close-out:**
> - Add explicit toroidal surface support to `FaceSurfaceClass`
> - Strengthen the native seam to cover both planar and cylindrical faces plus invalid indices
> - Keep validating the OCCT 8 overlay build as the migration settles

Three prompts. Prompt 1 is a BLOCKER spike. Prompts 2 and 3 can run in parallel after Prompt 1 succeeds.

**Governance note:** Epics 5+ are under full governance — every boundary or contract change requires an ADR, every protocol/schema change requires seam tests, every architecture change requires doc updates.

## Motivation

Epic 5 creates datums from raw surface picks: user clicks a point, gets a datum with Z-axis along the surface normal at that exact point. This works but is imprecise and geometry-unaware. Engineers think in topology: "put a datum on **that face**", not "put a datum at pixel (412, 303)."

The key insight: a single cylindrical face already encodes an axis and radius. A single planar face already encodes a normal and reference point. **You don't need feature recognition to get useful geometry-aware datums** — you just need to know which B-Rep face the user clicked, then analyze that face's surface type.

This is exactly how FreeCAD works. FreeCAD has no feature recognition for datum creation — it works at the individual face/edge level using an attachment engine that classifies surface types and computes optimal placements.

## Prior Art: FreeCAD's Approach

FreeCAD solves this with three components:

### 1. The `partIndex` Array — Triangle-to-Face Bridge

FreeCAD's `SoBrepFaceSet` node (`src/Mod/Part/Gui/SoBrepFaceSet.h:45-98`) stores one integer per B-Rep face: the number of triangles that face tessellated into.

```
Example: shape with 3 faces → partIndex = [10, 5, 8]
Face 0 = triangles 0-9, Face 1 = triangles 10-14, Face 2 = triangles 15-22
```

When a user clicks a triangle, `createTriangleDetail()` (`SoBrepFaceSet.cpp:2195-2219`) accumulates `partIndex` values to find which face owns that triangle:

```cpp
// FreeCAD: SoBrepFaceSet.cpp:2207-2216
int index = face_detail->getFaceIndex();  // triangle index from ray pick
int count = 0;
for (int i = 0; i < num; i++) {
    count += indices[i];       // accumulate triangle counts
    if (index < count) {
        face_detail->setPartIndex(i);  // → this is Face i
        break;
    }
}
```

### 2. Element Naming — `"Face1"`, `"Edge3"`, `"Vertex5"`

The face index becomes a topology name (`ViewProviderExt.cpp:584-606`):

```cpp
// FreeCAD: ViewProviderExt.cpp:590-591
int face = face_detail->getPartIndex() + 1;  // 0-based → 1-based
str << "Face" << face;                        // → "Face7"
```

These names are the universal currency — selection, highlighting, datum references, constraints all speak this language. The numbering follows `TopExp::MapShapes()` iteration order (deterministic, stable).

### 3. Attachment Engine — Face Type → Datum Placement

FreeCAD's `AttachEngine::getShapeType()` (`Attacher.cpp:587-613`) classifies faces using `BRepAdaptor_Surface`:

```cpp
// FreeCAD: Attacher.cpp:588-612
const TopoDS_Face& f = TopoDS::Face(sh);
BRepAdaptor_Surface surf(f, Standard_False);
switch (surf.GetType()) {
    case GeomAbs_Plane:      return rtFlatFace;
    case GeomAbs_Cylinder:   return rtCylindricalFace;
    case GeomAbs_Cone:       return rtConicalFace;
    case GeomAbs_Sphere:     return rtSphericalFace;
    case GeomAbs_Torus:      return rtToroidalFace;
    // ...
}
```

Then computes placement per type:
- **Planar face** (`Attacher.cpp:1544-1572`): Z-axis = plane normal, origin = projected reference point
- **Cylindrical face** (`Attacher.cpp:2213-2230`): Z-axis = cylinder axis direction, origin = axis center projected to face midpoint

```cpp
// FreeCAD: Attacher.cpp:2213-2228 — cylindrical face axis extraction
if (adaptorSurface.GetType() == GeomAbs_Cylinder) {
    const gp_Cylinder cyl = adaptorSurface.Cylinder();
    const gp_Ax1 axis = cyl.Axis();
    const gp_Pnt origin = axis.Location();
    const gp_Dir axisDir = axis.Direction();
    const gp_Pnt midPnt = adaptorSurface.Value(midU, midV);
    // Project midpoint onto cylinder axis
    const gp_Vec v(origin, midPnt);
    const Standard_Real t = v.Dot(gp_Vec(axisDir));
    const gp_Pnt axisCenter = origin.Translated(gp_Vec(axisDir) * t);
    // Datum: position = axisCenter, Z-axis = axisDir
}
```

### What FreeCAD Does NOT Do

- No feature recognition (no AAG, no hole/shaft grouping)
- No multi-face selection for datums — one face = one datum reference
- No "this face and that face are the same hole" intelligence

This is sufficient because a single cylindrical face already gives you the full axis and radius. You don't need to know it's part of a 3-face hole to create an axis datum.

## Design: MotionLab Adaptation

We adapt FreeCAD's architecture to MotionLab's engine-authority WebSocket model:

### Data Flow

```
┌─────────────────────────── ENGINE (C++) ───────────────────────────┐
│                                                                     │
│  STEP/IGES file                                                     │
│       ↓                                                             │
│  CadImporter::import_xde()                                         │
│       ↓                                                             │
│  TopoDS_Shape per body (PERSISTED in ShapeRegistry)                │
│       ↓                                                             │
│  CadImporter::tessellate()                                          │
│       ↓                                                             │
│  For each face (TopExp_Explorer, TopAbs_FACE):                      │
│    ├─ BRepMesh → triangles → append to flat vertex/index buffer     │
│    └─ Record partIndex[faceIdx] = triangleCount   ← NEW            │
│       ↓                                                             │
│  ImportAssetResult { bodies[], partIndex per body }                 │
│       ↓ (WebSocket)                                                 │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────── FRONTEND (TS) ──────────────────────────┐
│                                                                     │
│  connection.ts receives ImportAssetResult                           │
│       ↓                                                             │
│  mechanism store: addBodies() with partIndex                        │
│       ↓                                                             │
│  SceneGraphManager.addBody(): create Mesh + build BodyGeometryIndex │
│    └─ triangleToFace: Uint16Array (from partIndex, O(1) lookup)    │
│       ↓                                                             │
│  User hovers body surface                                           │
│       ↓                                                             │
│  PickingManager: Babylon pickResult.faceId → triangleIndex          │
│       ↓                                                             │
│  BodyGeometryIndex.triangleToFace[triangleIndex] → brepFaceIndex   │
│       ↓                                                             │
│  Highlight all triangles of that face (vertex colors)               │
│       ↓                                                             │
│  User clicks face in create-datum mode                              │
│       ↓                                                             │
│  Send CreateDatumFromFace { bodyId, faceIndex }                     │
│       ↓ (WebSocket)                                                 │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────── ENGINE (C++) ───────────────────────────┐
│                                                                     │
│  Receive CreateDatumFromFace { bodyId, faceIndex }                  │
│       ↓                                                             │
│  ShapeRegistry.get(bodyId) → TopoDS_Shape                          │
│       ↓                                                             │
│  TopExp::MapShapes(shape, TopAbs_FACE) → face at faceIndex         │
│       ↓                                                             │
│  BRepAdaptor_Surface(face).GetType() → classify                    │
│       ↓                                                             │
│  ┌─ GeomAbs_Plane:    Z = normal, origin = face centroid           │
│  ├─ GeomAbs_Cylinder: Z = axis dir, origin = axis center           │
│  ├─ GeomAbs_Cone:     Z = axis dir, origin = apex                  │
│  ├─ GeomAbs_Sphere:   Z = world up, origin = sphere center         │
│  └─ (other):          Z = surface normal at midpoint               │
│       ↓                                                             │
│  mechanism_state_.create_datum(bodyId, pose, autoName)              │
│       ↓                                                             │
│  Send CreateDatumFromFaceResult { datum }                           │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Differences from FreeCAD

| Aspect | FreeCAD | MotionLab |
|--------|---------|-----------|
| Scene graph | Coin3D (OpenInventor) | Babylon.js (WebGL) |
| `partIndex` storage | SoMFInt32 field on Coin3D node | Uint32Array sent via protobuf, stored per body |
| Triangle→Face lookup | Linear scan in `createTriangleDetail()` | Precomputed `Uint16Array` O(1) lookup |
| Face classification | Client-side (Attacher.cpp in GUI process) | Engine-side (engine has the B-Rep, frontend doesn't) |
| Highlighting | `setEmissive()` on Coin3D state | Vertex color buffer update on Babylon Mesh |
| Element naming | String `"Face7"` passed through selection system | Integer `faceIndex` sent over protocol |

## Shared Contract

| Interface | Owner | Consumer |
|-----------|-------|----------|
| `partIndex` array per body in ImportAssetResult | Prompt 1 (engine emits) | Prompt 2 (frontend builds lookup) |
| Persistent B-Rep in ShapeRegistry | Prompt 1 (implements) | Prompt 1 (face classification uses it) |
| `CreateDatumFromFace` command/result | Prompt 1 (proto + engine handler) | Prompt 2 (frontend sends on click) |
| `BodyGeometryIndex` (triangleToFace lookup) | Prompt 2 (builds from partIndex) | Prompt 2 (picking uses), Prompt 3 (highlight uses) |
| Face highlighting via vertex colors | Prompt 2 (implements) | Prompt 3 (create-datum mode uses) |
| Face type info in `CreateDatumFromFaceResult` | Prompt 1 (engine classifies) | Prompt 3 (tooltip/preview uses) |

Integration test: Import STEP file → hover a cylindrical face → entire face highlights → click in create-datum mode → axis datum appears at cylinder center aligned to cylinder axis.

---

## Prompt 1: B-Rep Persistence + partIndex + CreateDatumFromFace Protocol & Engine

**BLOCKER for all of Epic 10. Must complete first.**

```
# Epic 10 — B-Rep Persistence, partIndex, and CreateDatumFromFace

You are implementing the engine-side infrastructure for face-level topology selection and geometry-aware datum creation. This involves three things: persisting B-Rep shapes after import, emitting a partIndex (triangle-count-per-face) array alongside meshes, and handling a new CreateDatumFromFace command that classifies a face and computes optimal datum placement.

This follows the same architecture as FreeCAD's SoBrepFaceSet.partIndex and Attacher engine, adapted for MotionLab's engine-authority WebSocket model.

## Read These First (in order)
- `docs/architecture/principles.md` — engine is computational authority
- `docs/architecture/runtime-topology.md` — engine owns B-Rep
- `native/engine/AGENTS.md` — native boundary rules, required checks
- `docs/domain/mechanism-model.md` — Body, Datum definitions
- `docs/decisions/` — all existing ADRs

## Governance Reminder
This is Epic 10 — full governance applies:
- Any boundary or contract change requires an ADR
- Any protocol/schema change requires seam tests at the affected seam
- Any architecture change requires doc updates

## What Exists Now

### `native/engine/src/cad_import.h` / `.cpp`
CadImporter class. The `tessellate()` method (line 282) iterates faces with `TopExp_Explorer(shape, TopAbs_FACE)`, extracts `Poly_Triangulation` per face, and merges vertices/indices into flat buffers with a running `vertex_offset`. **Shapes are discarded after tessellation** — only MeshData survives. The face iteration order is deterministic (OCCT's TopExp_Explorer order).

Key code in tessellate() (lines 290-356):
```cpp
for (TopExp_Explorer exp(shape, TopAbs_FACE); exp.More(); exp.Next()) {
    const TopoDS_Face& face = TopoDS::Face(exp.Current());
    // ... extract triangles, append to mesh.vertices/indices/normals ...
    vertex_offset += static_cast<uint32_t>(nb_nodes);
}
```

### `native/engine/src/mechanism_state.h` / `.cpp`
MechanismState holds bodies, datums, joints. Bodies are registered by ID+name. No geometry stored.

### `schemas/mechanism/mechanism.proto`
Body message has: id, name, pose, mass_properties, source_asset_ref, display_mesh. Datum has: id, name, parent_body_id, local_pose.

### `schemas/protocol/transport.proto`
Command/Event oneofs with: Handshake, Ping, ImportAsset, Datum CRUD, Joint CRUD.

### `native/engine/vcpkg.json`
Already includes `opencascade`. Engine already links: TKernel, TKMath, TKBRep, TKTopAlgo, TKGeomAlgo, TKGeomBase, TKG3d, TKMesh, etc.

## What to Build

### 1. Persist B-Rep shapes after import

Create `native/engine/src/shape_registry.h`:

```cpp
#pragma once
#include <string>
#include <unordered_map>
#include <TopoDS_Shape.hxx>

namespace motionlab::engine {

/// Retains TopoDS_Shape objects after import so the engine can
/// answer topology queries (face classification, sub-shape extraction).
class ShapeRegistry {
public:
    void store(const std::string& body_id, const TopoDS_Shape& shape);
    const TopoDS_Shape* get(const std::string& body_id) const;
    void remove(const std::string& body_id);
    void clear();
private:
    std::unordered_map<std::string, TopoDS_Shape> shapes_;
};

} // namespace motionlab::engine
```

Wire into the import pipeline: in `collect_bodies()` (cad_import.cpp), after calling `tessellate()` and `compute_mass_properties()`, also store the shape in the registry. The ShapeRegistry lives in TransportServer alongside MechanismState.

### 2. Emit partIndex during tessellation

Modify `CadImporter::tessellate()` to also return a per-face triangle count array. This is the MotionLab equivalent of FreeCAD's `SoBrepFaceSet.partIndex`.

Extend MeshData:
```cpp
struct MeshData {
    std::vector<float> vertices;
    std::vector<uint32_t> indices;
    std::vector<float> normals;
    std::vector<int32_t> part_index;  // NEW: part_index[i] = triangle count for face i
};
```

In `tessellate()`, record `nb_tris` per face:
```cpp
// In the TopExp_Explorer loop, after extracting triangles for each face:
mesh.part_index.push_back(nb_tris);
```

This is a one-line change — the face loop already has `nb_tris` (from `tri->NbTriangles()`).

Analogous to FreeCAD's `ViewProviderExt.cpp:1309`:
```cpp
parts[ii] = nbTriInFace;  // FreeCAD stores triangle count per face
```

### 3. Add partIndex to protocol

In `mechanism.proto`, extend the Body message (or DisplayMesh if separated):

```protobuf
message Body {
  // existing fields...

  // Face-to-triangle mapping (one entry per B-Rep face).
  // part_index[i] = number of triangles in face i.
  // Triangle ranges are contiguous: face 0 owns triangles [0, part_index[0]),
  // face 1 owns [part_index[0], part_index[0]+part_index[1]), etc.
  // Follows TopExp_Explorer(shape, TopAbs_FACE) iteration order.
  repeated int32 part_index = 10;
}
```

Populate this in the import result serialization in `transport.cpp`.

### 4. Add CreateDatumFromFace command

In `transport.proto`:

```protobuf
// Command: create a datum from a specific B-Rep face.
// Engine classifies the face geometry and computes optimal placement.
message CreateDatumFromFaceCommand {
  ElementId body_id = 1;
  int32 face_index = 2;     // 0-based index into TopExp_Explorer order
  string name = 3;           // optional, auto-generated if empty
}

message CreateDatumFromFaceResult {
  oneof result {
    DatumFromFaceSuccess success = 1;
    string error_message = 2;
  }
}

message DatumFromFaceSuccess {
  Datum datum = 1;
  string face_type = 2;      // "plane", "cylinder", "cone", "sphere", "torus", "other"
}
```

Add to Command oneof:
```protobuf
CreateDatumFromFaceCommand create_datum_from_face = 30;
```

Add to Event oneof:
```protobuf
CreateDatumFromFaceResult create_datum_from_face_result = 30;
```

The result includes `face_type` so the frontend can show what kind of face was used (useful for tooltip/status feedback).

### 5. Implement face classification and datum pose computation

Create `native/engine/src/face_classifier.h` and `face_classifier.cpp`:

```cpp
#pragma once
#include <TopoDS_Face.hxx>
#include <array>
#include <string>

namespace motionlab::engine {

enum class FaceType {
    PLANE,
    CYLINDER,
    CONE,
    SPHERE,
    TORUS,
    OTHER
};

struct DatumPoseFromFace {
    std::array<double, 3> position;
    std::array<double, 4> orientation;  // quaternion [x, y, z, w]
    FaceType face_type;
    std::string auto_name;              // e.g. "Plane Face 3", "Cyl Face 7 Axis"
};

/// Classify a B-Rep face and compute optimal datum placement.
///
/// Follows FreeCAD's Attacher.cpp approach:
/// - Planar face (GeomAbs_Plane): Z = face normal, origin = face centroid
/// - Cylindrical face (GeomAbs_Cylinder): Z = cylinder axis, origin = axis center
///   projected to face midpoint (FreeCAD Attacher.cpp:2213-2228)
/// - Conical face (GeomAbs_Cone): Z = cone axis, origin = cone apex
/// - Spherical face (GeomAbs_Sphere): Z = world up, origin = sphere center
/// - Toroidal face (GeomAbs_Torus): Z = torus axis, origin = torus center
/// - Other: Z = surface normal at face midpoint, origin = midpoint
DatumPoseFromFace classify_and_compute_pose(
    const TopoDS_Face& face,
    int face_index  // for auto-naming
);

/// Extract the Nth face (0-based) from a shape using TopExp_Explorer order.
/// Returns null face if index is out of range.
TopoDS_Face get_face_by_index(const TopoDS_Shape& shape, int face_index);

} // namespace motionlab::engine
```

Implementation for each face type (in `face_classifier.cpp`):

```cpp
#include <BRepAdaptor_Surface.hxx>
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Quaternion.hxx>

// Follows FreeCAD Attacher.cpp:588-612 pattern
DatumPoseFromFace classify_and_compute_pose(
    const TopoDS_Face& face, int face_index)
{
    DatumPoseFromFace result;
    BRepAdaptor_Surface surf(face, Standard_False);

    switch (surf.GetType()) {
    case GeomAbs_Plane: {
        // FreeCAD Attacher.cpp:1544-1572
        gp_Pln plane = surf.Plane();
        if (face.Orientation() == TopAbs_REVERSED)
            plane.IsFlip() ? plane.UReverse() : (void)0;
        gp_Dir normal = plane.Axis().Direction();
        if (face.Orientation() == TopAbs_REVERSED)
            normal.Reverse();

        // Centroid via GProp
        GProp_GProps props;
        BRepGProp::SurfaceProperties(face, props);
        gp_Pnt centroid = props.CentreOfMass();

        result.face_type = FaceType::PLANE;
        result.position = {centroid.X(), centroid.Y(), centroid.Z()};
        result.orientation = quaternion_from_z_axis(normal);
        result.auto_name = "Plane (Face " + std::to_string(face_index + 1) + ")";
        break;
    }
    case GeomAbs_Cylinder: {
        // FreeCAD Attacher.cpp:2213-2228
        gp_Cylinder cyl = surf.Cylinder();
        gp_Ax1 axis = cyl.Axis();
        gp_Pnt origin = axis.Location();
        gp_Dir axis_dir = axis.Direction();

        // Project face midpoint onto cylinder axis to get a center
        // point near the face (not at the infinite axis origin)
        double midU = (surf.FirstUParameter() + surf.LastUParameter()) / 2.0;
        double midV = (surf.FirstVParameter() + surf.LastVParameter()) / 2.0;
        gp_Pnt mid_pt = surf.Value(midU, midV);
        gp_Vec v(origin, mid_pt);
        double t = v.Dot(gp_Vec(axis_dir));
        gp_Pnt axis_center = origin.Translated(gp_Vec(axis_dir) * t);

        result.face_type = FaceType::CYLINDER;
        result.position = {axis_center.X(), axis_center.Y(), axis_center.Z()};
        result.orientation = quaternion_from_z_axis(axis_dir);
        result.auto_name = "Axis (Face " + std::to_string(face_index + 1) + ")";
        break;
    }
    case GeomAbs_Cone: {
        gp_Cone cone = surf.Cone();
        gp_Pnt apex = cone.Apex();
        gp_Dir axis_dir = cone.Axis().Direction();

        result.face_type = FaceType::CONE;
        result.position = {apex.X(), apex.Y(), apex.Z()};
        result.orientation = quaternion_from_z_axis(axis_dir);
        result.auto_name = "Cone Axis (Face " + std::to_string(face_index + 1) + ")";
        break;
    }
    case GeomAbs_Sphere: {
        gp_Sphere sphere = surf.Sphere();
        gp_Pnt center = sphere.Location();

        result.face_type = FaceType::SPHERE;
        result.position = {center.X(), center.Y(), center.Z()};
        result.orientation = {0, 0, 0, 1}; // identity — no preferred axis
        result.auto_name = "Center (Face " + std::to_string(face_index + 1) + ")";
        break;
    }
    case GeomAbs_Torus: {
        gp_Torus torus = surf.Torus();
        gp_Pnt center = torus.Location();
        gp_Dir axis_dir = torus.Axis().Direction();

        result.face_type = FaceType::TORUS;
        result.position = {center.X(), center.Y(), center.Z()};
        result.orientation = quaternion_from_z_axis(axis_dir);
        result.auto_name = "Torus Axis (Face " + std::to_string(face_index + 1) + ")";
        break;
    }
    default: {
        // Fallback: surface normal at midpoint
        double midU = (surf.FirstUParameter() + surf.LastUParameter()) / 2.0;
        double midV = (surf.FirstVParameter() + surf.LastVParameter()) / 2.0;
        gp_Pnt pt;
        gp_Vec du, dv;
        surf.D1(midU, midV, pt, du, dv);
        gp_Dir normal = du.Crossed(dv).IsNull() ? gp_Dir(0,0,1) : gp_Dir(du.Crossed(dv));
        if (face.Orientation() == TopAbs_REVERSED)
            normal.Reverse();

        result.face_type = FaceType::OTHER;
        result.position = {pt.X(), pt.Y(), pt.Z()};
        result.orientation = quaternion_from_z_axis(normal);
        result.auto_name = "Face " + std::to_string(face_index + 1);
        break;
    }
    }
    return result;
}
```

### 6. Implement engine command handler

In `transport.cpp`, add:

```cpp
case Command::kCreateDatumFromFace: {
    const auto& cmd = command.create_datum_from_face();
    const std::string& body_id = cmd.body_id().id();
    int face_index = cmd.face_index();

    const auto* shape = shape_registry_.get(body_id);
    if (!shape) {
        send_error(command, "Body not found");
        break;
    }

    TopoDS_Face face = get_face_by_index(*shape, face_index);
    if (face.IsNull()) {
        send_error(command, "Face index out of range");
        break;
    }

    auto pose_result = classify_and_compute_pose(face, face_index);
    auto name = cmd.name().empty() ? pose_result.auto_name : cmd.name();

    // Create datum using existing mechanism_state_ infrastructure
    auto datum = mechanism_state_.create_datum(body_id, pose, name);
    // Send result with face_type...
}
```

### 7. Add protocol helper in transport.ts

```ts
export function createCreateDatumFromFaceCommand(
  bodyId: string,
  faceIndex: number,
  name: string,
  sequenceId: bigint
): Uint8Array { ... }
```

### 8. Handle event in connection.ts

Add case for `createDatumFromFaceResult`. On success, call `addDatum()` on mechanism store (same as existing datum creation). Optionally log/display `face_type`.

### 9. Run codegen

`pnpm generate:proto` — verify generated TS and C++ include new messages.

### 10. Write unit tests

`native/engine/tests/test_face_classifier.cpp`:

1. **Box (6 planar faces):** classify each face → all FaceType::PLANE, normals along ±X, ±Y, ±Z
2. **Cylinder:** classify lateral face → FaceType::CYLINDER, axis along Z, correct radius center
3. **Cylinder end caps:** classify top/bottom → FaceType::PLANE
4. **Cone:** classify lateral face → FaceType::CONE, axis toward apex
5. **Sphere:** classify face → FaceType::SPHERE, origin at center
6. **partIndex correctness:** tessellate a box, verify sum(partIndex) = total triangles, verify 6 entries
7. **get_face_by_index:** verify round-trip (store shape, retrieve face by index, classify)
8. **Out-of-range face index:** returns null face, no crash

### 11. Write protocol seam test

1. Import a STEP file with a block + hole
2. Verify ImportAssetResult includes `part_index` array (non-empty, sum = total triangles)
3. Send CreateDatumFromFaceCommand with a planar face index
4. Verify result: datum created, face_type = "plane", Z-axis = face normal
5. Send CreateDatumFromFaceCommand with a cylindrical face index
6. Verify result: datum created, face_type = "cylinder", Z-axis = cylinder axis
7. Send CreateDatumFromFaceCommand with invalid face index
8. Verify error response

### 12. Write ADR

Document:
- B-Rep shapes persist in memory after import (memory implications)
- partIndex follows FreeCAD's SoBrepFaceSet.partIndex pattern
- Face indices use TopExp_Explorer iteration order (0-based)
- Face classification uses BRepAdaptor_Surface::GetType() (same as FreeCAD Attacher.cpp:588-612)
- CreateDatumFromFace is engine-authoritative — frontend sends face index, engine computes pose

## Architecture Constraints
- Engine is authoritative for face classification — frontend never runs BRepAdaptor
- B-Rep shapes must not leak through the protocol — only partIndex (integers) crosses the boundary
- face_classifier.h must not include OCCT headers in the public interface if possible — confine to .cpp
- partIndex ordering matches the face iteration order in tessellate() which matches TopExp_Explorer order
- The face index is 0-based internally (matching array indices), not 1-based like FreeCAD's "Face1" naming

## Done Looks Like
- `cmake --preset dev && cmake --build build/dev` succeeds
- B-Rep shapes persist and are queryable by body ID
- partIndex emitted in ImportAssetResult for each body
- CreateDatumFromFace works end-to-end for all face types
- Unit tests pass for face classification on box, cylinder, cone, sphere
- Protocol seam test passes
- `ctest --preset dev` passes
- `pnpm generate:proto` succeeds
- `pnpm --filter @motionlab/protocol typecheck` passes
- ADR written

## What NOT to Build
- Frontend face highlighting (that's Prompt 2)
- Create-datum-mode UX integration (that's Prompt 3)
- Feature recognition (AAG, hole grouping) — that's a future epic
- Edge or vertex selection — faces only for now
```

---

## Prompt 2: Face Highlighting + Frontend Topology Index

```
# Epic 10 — Face Highlighting and Frontend Topology Index

You are implementing the frontend infrastructure for face-level topology awareness: building the BodyGeometryIndex from partIndex data, face highlighting via vertex colors, and face-level hover/selection in the viewport.

This follows FreeCAD's SoBrepFaceSet.partIndex pattern, adapted for Babylon.js.

## Read These First (in order)
- `docs/architecture/principles.md` — React is NOT the hot path for viewport
- `packages/viewport/AGENTS.md` — viewport owns visualization and picking
- `packages/frontend/AGENTS.md` — frontend owns workbench UX
- Relevant ADRs (especially the new ADR from Prompt 1 on partIndex/face classification)

## Governance Reminder
Full governance applies.

## What Exists Now

### `packages/viewport/src/scene-graph.ts`
SceneGraphManager.addBody() creates a single Mesh per body from flat vertex/index/normal buffers using VertexData. No per-face awareness. Meshes are single-material.

### `packages/viewport/src/picking.ts`
PickingManager uses GPU picking (Babylon GPUPicker) with CPU fallback. Returns entityId. Babylon's CPU `scene.pick()` returns `pickResult.faceId` which is a **triangle index** (not a face index).

### `packages/frontend/src/stores/mechanism.ts`
After Prompt 1, ImportAssetResult includes `part_index` per body. BodyState will carry partIndex.

### `packages/frontend/src/engine/connection.ts`
Handles ImportAssetResult. After Prompt 1, includes partIndex in body data and handles CreateDatumFromFaceResult.

### `packages/protocol/src/transport.ts`
After Prompt 1, exports `createCreateDatumFromFaceCommand`.

## What to Build

### 1. Store partIndex on BodyState

In mechanism store, extend BodyState:

```ts
interface BodyState {
  // existing fields...
  partIndex: Int32Array;  // triangle count per B-Rep face
}
```

Populate from ImportAssetResult in connection.ts.

### 2. Build BodyGeometryIndex

Create `packages/viewport/src/body-geometry-index.ts`:

```ts
/**
 * Per-body lookup structure for resolving triangles to B-Rep faces.
 * Built once at import time from the engine-provided partIndex.
 *
 * This is the MotionLab equivalent of FreeCAD's SoBrepFaceSet.partIndex,
 * but precomputed into a flat array for O(1) lookup instead of FreeCAD's
 * O(numFaces) linear scan in createTriangleDetail().
 *
 * Reference: FreeCAD SoBrepFaceSet.cpp:2195-2219
 */
export class BodyGeometryIndex {
  /** triangleToFace[triangleIndex] = brepFaceIndex (0-based) */
  readonly triangleToFace: Uint16Array;
  /** faceRanges[faceIndex] = { start: firstTriangle, count: numTriangles } */
  readonly faceRanges: ReadonlyArray<{ start: number; count: number }>;
  /** Total number of B-Rep faces */
  readonly faceCount: number;

  constructor(partIndex: Int32Array | number[]) {
    const faceCount = partIndex.length;
    const totalTriangles = partIndex.reduce((sum, c) => sum + c, 0);

    const triangleToFace = new Uint16Array(totalTriangles);
    const faceRanges: Array<{ start: number; count: number }> = [];

    let triOffset = 0;
    for (let face = 0; face < faceCount; face++) {
      const count = partIndex[face];
      faceRanges.push({ start: triOffset, count });
      for (let t = 0; t < count; t++) {
        triangleToFace[triOffset + t] = face;
      }
      triOffset += count;
    }

    this.triangleToFace = triangleToFace;
    this.faceRanges = faceRanges;
    this.faceCount = faceCount;
  }

  /** O(1) triangle → face lookup */
  getFaceFromTriangle(triangleIndex: number): number {
    return this.triangleToFace[triangleIndex] ?? -1;
  }
}
```

Memory: for 50K triangles, `triangleToFace` = 100KB (Uint16Array). For 500 faces, `faceRanges` ≈ 4KB. Negligible.

### 3. Build index on body import

In SceneGraphManager.addBody(), after creating the mesh, also build and store the geometry index:

```ts
private readonly bodyIndices = new Map<string, BodyGeometryIndex>();

addBody(id: string, name: string, meshData: MeshDataInput, pose: PoseInput,
        partIndex: Int32Array): SceneEntity {
  // existing mesh creation...

  // Build topology index
  if (partIndex.length > 0) {
    this.bodyIndices.set(id, new BodyGeometryIndex(partIndex));
  }

  // Allocate updatable vertex color buffer for face highlighting
  const vertexCount = meshData.vertices.length / 3;
  const colors = new Float32Array(vertexCount * 4);
  colors.fill(1.0);  // white = no tint
  mesh.setVerticesData('color', colors, true);  // true = updatable

  return entity;
}
```

The body material needs `useVertexColors = true` (or a shader that multiplies diffuse by vertex color).

### 4. Face highlighting via vertex colors

Add to SceneGraphManager:

```ts
/**
 * Highlight all triangles belonging to a B-Rep face on a body mesh.
 * Uses updatable vertex colors — no mesh rebuild needed.
 *
 * Analogous to FreeCAD's SoBrepFaceSet::renderHighlight()
 * (SoBrepFaceSet.cpp:1384-1453) which sets emissive color for the
 * highlighted face's triangles. We use vertex colors instead of
 * emissive because Babylon.js doesn't support per-face emissive.
 */
highlightFace(bodyId: string, faceIndex: number): void {
  const entity = this.entities.get(bodyId);
  if (!entity) return;
  const mesh = entity.meshes[0] as Mesh;
  const index = this.bodyIndices.get(bodyId);
  if (!index) return;

  const range = index.faceRanges[faceIndex];
  if (!range) return;

  const indices = mesh.getIndices()!;
  const colors = mesh.getVerticesData('color') as Float32Array;

  // Reset all to white (neutral)
  colors.fill(1.0);

  // Tint vertices of the highlighted face's triangles
  const H = [0.4, 0.7, 1.0, 1.0];  // light blue highlight
  for (let t = range.start; t < range.start + range.count; t++) {
    const i0 = indices[t * 3]!;
    const i1 = indices[t * 3 + 1]!;
    const i2 = indices[t * 3 + 2]!;
    for (const vi of [i0, i1, i2]) {
      colors[vi * 4] = H[0];
      colors[vi * 4 + 1] = H[1];
      colors[vi * 4 + 2] = H[2];
      colors[vi * 4 + 3] = H[3];
    }
  }

  mesh.updateVerticesData('color', colors);
}

clearFaceHighlight(bodyId: string): void {
  const entity = this.entities.get(bodyId);
  if (!entity) return;
  const mesh = entity.meshes[0] as Mesh;
  const colors = mesh.getVerticesData('color') as Float32Array;
  if (!colors) return;
  colors.fill(1.0);
  mesh.updateVerticesData('color', colors);
}
```

### 5. Face-aware hover in PickingManager

Extend the hover handler to resolve triangles to faces and highlight them:

```ts
// In PickingManager hover handler, after resolving entityId:
if (entity.type === 'body') {
  // Need supplemental CPU pick to get triangle index
  // (GPU picker doesn't return faceId)
  const cpuPick = this.scene.pick(pointerX, pointerY);
  if (cpuPick?.hit && cpuPick.faceId >= 0) {
    const bodyId = entity.id;
    const geoIndex = sceneGraph.getBodyGeometryIndex(bodyId);
    if (geoIndex) {
      const faceIndex = geoIndex.getFaceFromTriangle(cpuPick.faceId);
      if (faceIndex >= 0) {
        sceneGraph.highlightFace(bodyId, faceIndex);
        // Store current hovered face for click handler
        this.hoveredFace = { bodyId, faceIndex };
        return;
      }
    }
  }
  sceneGraph.clearFaceHighlight(entity.id);
  this.hoveredFace = null;
}
```

**Performance note:** CPU `scene.pick()` on hover is acceptable — FreeCAD does the same (ray pick on every mouse move). Babylon's CPU pick is fast for single-mesh bodies. If needed, throttle to 30fps.

### 6. Expose hovered face for click consumption

Add a public method or event on PickingManager:

```ts
getHoveredFace(): { bodyId: string; faceIndex: number } | null;
```

This is consumed by Prompt 3's create-datum-mode handler.

## Architecture Constraints
- BodyGeometryIndex is read-only after construction — never mutated
- Vertex color updates happen on the Babylon thread, not React — no setState in the hot path
- Face highlighting is a viewport concern only — mechanism store has no concept of highlighted faces
- The partIndex array is trusted (comes from the engine) — no validation needed beyond bounds checking
- Face indices are 0-based (matching array indices), consistent with engine's TopExp_Explorer order

## Expected Behavior (testable)

### Hover highlighting
1. User moves mouse over a body → individual B-Rep face under cursor highlights in blue
2. Moving to a different face → previous face un-highlights, new face highlights
3. Moving off the body → all highlights cleared
4. Faces highlight as complete topological faces (all triangles of one face), not individual triangles
5. Performance: highlighting responds within one frame (<16ms)

### partIndex integrity
1. `sum(partIndex)` equals total triangle count in the mesh
2. `partIndex.length` equals number of B-Rep faces
3. All entries are positive integers

### Edge cases
1. Body with no partIndex (legacy import or import failure) → no face highlighting, no crash
2. Triangle index out of range → returns -1, no crash
3. Multiple bodies in scene → each has independent highlighting

## Done Looks Like
- Hovering over a body highlights individual B-Rep faces
- Face highlighting uses vertex colors (no mesh rebuild)
- BodyGeometryIndex provides O(1) triangle→face lookup
- partIndex flows from engine → protocol → mechanism store → SceneGraphManager
- `pnpm --filter @motionlab/viewport typecheck` passes
- `pnpm --filter @motionlab/frontend typecheck` passes

## What NOT to Build
- Create-datum-from-face UX flow (that's Prompt 3)
- Feature recognition or multi-face grouping (future epic)
- Edge or vertex highlighting
- Face selection persistence in selection store (face hover is transient)
```

---

## Prompt 3: Face-Aware Datum Creation Mode

```
# Epic 10 — Face-Aware Datum Creation Mode

You are wiring face-level topology selection into the datum creation workflow. When in create-datum mode, clicking a face sends CreateDatumFromFace (engine classifies the face and computes optimal placement) instead of the Epic 5 point+normal approach. Non-face clicks fall back to Epic 5 behavior.

## Read These First (in order)
- `docs/architecture/principles.md` — engine is authority
- `packages/viewport/AGENTS.md` — viewport owns picking
- `packages/frontend/AGENTS.md` — frontend owns tool modes
- Relevant ADRs (especially Epic 10 ADR on face classification)

## Governance Reminder
Full governance applies.

## What Exists Now

### `packages/frontend/src/stores/tool-mode.ts`
From Epic 5: tool mode store with 'select' | 'create-datum' modes.

### Epic 5 datum creation flow
In create-datum mode: click body surface → compute pose from point+normal → send CreateDatumCommand.

### Face highlighting (Prompt 2)
SceneGraphManager.highlightFace(), BodyGeometryIndex, PickingManager.getHoveredFace().

### CreateDatumFromFace protocol (Prompt 1)
CreateDatumFromFaceCommand/Result. Engine classifies face and computes pose. Result includes face_type.

### `packages/frontend/src/engine/connection.ts`
After Prompt 1: handles CreateDatumFromFaceResult, has `sendCreateDatumFromFace()`.

## What to Build

### 1. Wire face click to CreateDatumFromFace

In the create-datum mode click handler:

```ts
function handleCreateDatumClick() {
  const hoveredFace = pickingManager.getHoveredFace();

  if (hoveredFace) {
    // Face-aware path: engine classifies face and computes optimal pose
    sendCreateDatumFromFace(
      hoveredFace.bodyId,
      hoveredFace.faceIndex,
      '',  // empty name = auto-generate
    );
  } else {
    // Fallback: Epic 5 point+normal path (no face data available)
    // ... existing CreateDatumCommand logic ...
  }
}
```

### 2. Face type tooltip during hover

When hovering over a face in create-datum mode, show a tooltip indicating what kind of datum will be created. The face type isn't known until the engine classifies it, but we can approximate client-side from the face normal pattern (optional), or simply show "Click to create datum from face."

Better approach: after the first CreateDatumFromFace succeeds for a body, cache the face_type per face for subsequent tooltip display. Or just show a generic tooltip — the datum auto-name from the engine result is informative enough.

### 3. Visual feedback differentiation

In create-datum mode, face highlighting should use a distinct color from select-mode hover:
- **Select mode hover:** existing hover highlight (e.g., warm outline)
- **Create-datum mode hover:** blue face fill tint (from Prompt 2's vertex colors)

This gives the user clear feedback that they're in a face-aware creation mode.

### 4. Post-creation behavior

After a datum is created from a face:
- Stay in create-datum mode (rapid authoring — same as Epic 5)
- The new datum appears in the viewport (via existing datum rendering from Epic 5)
- The new datum appears in the tree under the parent body
- Brief status message: "Created Plane (Face 3)" or "Created Axis (Face 7)" using the face_type from the result

### 5. Escape key and mode switching

Same as Epic 5: Escape returns to select mode. Face highlighting clears when leaving create-datum mode.

## Architecture Constraints
- Face-aware creation is an upgrade to Epic 5's create-datum mode, not a separate mode
- The engine decides the datum pose — frontend sends face index, not coordinates
- If face data isn't available (no partIndex, GPU-only pick), fall back to Epic 5 behavior
- Tool mode logic is frontend-only — engine has no concept of modes

## Expected Behavior (testable)

### Planar face → plane datum
1. Import a box (6 planar faces)
2. Switch to create-datum mode
3. Hover over the top face → face highlights in blue
4. Click → datum created with Z-axis pointing up (face normal), positioned at face centroid
5. Datum auto-named "Plane (Face 1)" (or similar)
6. Datum triad visible in viewport at the face center

### Cylindrical face → axis datum
1. Import a part with a hole (cylindrical face)
2. Switch to create-datum mode
3. Hover over the cylindrical face → entire cylindrical face highlights
4. Click → datum created with Z-axis along cylinder axis, positioned at axis center
5. Datum auto-named "Axis (Face 7)" (or similar)
6. Datum triad visible at the hole center with Z pointing along the bore

### Conical face → axis datum at apex
1. Import a part with a countersink (conical face)
2. Click the conical face → datum at cone apex, Z along cone axis

### Spherical face → center datum
1. Import a part with a spherical cavity
2. Click the spherical face → datum at sphere center, identity orientation

### Fallback to point+normal
1. Pick miss (click empty space) → nothing happens
2. Click on a body surface where partIndex is unavailable → Epic 5 point+normal datum

### Multiple datums in sequence
1. Create datum from face A → stay in create-datum mode
2. Create datum from face B → second datum created
3. Both datums visible in tree and viewport

### Mode transitions
1. In select mode: hover over body → standard entity hover (no face highlight)
2. Switch to create-datum mode → face-level highlights appear on hover
3. Press Escape → back to select mode, face highlights cleared

## Done Looks Like
- Clicking a face in create-datum mode creates a geometry-aware datum
- Planar faces → plane datums, cylindrical faces → axis datums, etc.
- Auto-naming reflects face type
- Fallback to Epic 5 behavior when face data unavailable
- Visual feedback (face highlight) during create-datum hover
- `pnpm --filter @motionlab/frontend typecheck` passes
- `pnpm --filter @motionlab/viewport typecheck` passes

## What NOT to Build
- Feature recognition or multi-face grouping (future epic — asiAlgo integration)
- Face-aware joint creation (future)
- Edge or vertex selection
- Face type caching or prefetching (optimize later if needed)
```

---

## Integration Verification

After all three prompts complete, verify the full face-aware datum creation flow:

1. **Import a STEP file** with a box with drilled holes (planar + cylindrical + conical faces)
2. **Verify partIndex:** Check that ImportAssetResult includes non-empty partIndex array
3. **Switch to select mode:** Hover body → standard entity hover (no face highlight)
4. **Switch to create-datum mode:** Hover body → individual B-Rep faces highlight on hover
5. **Click a planar face:** Datum created with Z = face normal, auto-named "Plane (Face N)"
6. **Click a cylindrical face:** Datum created with Z = cylinder axis, positioned at axis center, auto-named "Axis (Face N)"
7. **Verify tree:** Both datums appear under the body in the project tree
8. **Verify viewport:** Both datum triads visible at correct positions/orientations
9. **Click a conical face:** Datum at cone apex with Z along axis
10. **Escape key:** Returns to select mode, face highlights cleared
11. **Typecheck:** all `pnpm --filter ... typecheck` pass
12. **Engine tests:** `ctest --preset dev` passes with face classifier tests

## Future Work (out of scope)

- **Feature recognition (Level 2):** asiAlgo AAG integration to group faces into holes/shafts — highlights entire hole on hover, not just one face. See Analysis Situs exploration in project memory.
- **Edge/vertex selection:** Extend partIndex pattern to edges (SoBrepEdgeSet equivalent)
- **Attachment modes:** FreeCAD-style mode suggestion (mmFlatFace, mmConcentric, etc.) — richer than single-face classification
- **Multi-reference datums:** Datum from 2+ faces (e.g., midplane between two parallel faces)
- **OCCT 8 migration:** Mostly mechanical — run migration scripts, patch deprecated APIs
