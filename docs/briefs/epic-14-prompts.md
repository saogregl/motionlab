# Epic 14 — Viewport-Centric Datum & Reference Geometry Authoring

> **Status:** Not started
> **Dependencies:** Epic 10 (Face-Level Topology Selection) — complete. Epic 5 (Datum CRUD) — complete.
>
> **Governance note:** Epics 5+ are under full governance — every boundary or contract change requires an ADR, every protocol/schema change requires seam tests, every architecture change requires doc updates.

Three prompts. Prompt 1 is a foundation — Prompts 2 and 3 build on it but can run in parallel after Prompt 1 succeeds.

## Motivation

Epic 10 gave us face-level topology selection: users can hover over faces, see them highlight, and click to create datums. But the datum creation workflow is still mechanical — click face, datum appears. There is no visual preview of what the datum will look like before committing, no way to create datums from edges or edge intersections, no body-ownership indicator, and the inspector panel shows minimal information during and after creation.

Engineers working in CAD tools think in terms of geometry primitives: "I want an axis along this cylinder", "I want a plane on this face", "I want a point where these two edges meet." The viewport should drive this workflow, with the inspector panel providing supplementary editing and coordinate display — not the other way around.

### What's Missing

1. **No visual preview.** When hovering over a cylindrical face in create-datum mode, the user sees a blue highlight on the face — but no indication of what the resulting datum will look like (axis line through the cylinder center, plane overlay on the face, point marker at the sphere center). The user must click, inspect the result, and undo if wrong.

2. **No body ownership indicator.** When creating a datum, there is no visual cue showing which body the datum will belong to. This matters for multi-body assemblies where bodies overlap or sit adjacent.

3. **No edge-based datums.** Users can only create datums from faces. There is no way to pick an edge to create an axis along a linear edge, or pick two edges to create a point at their intersection. This limits the precision of datum placement.

4. **Sparse inspector feedback.** The DatumInspector shows local pose, parent body name, and orientation — but no surface class, no flip action, no global coordinates, no coordinate display during creation, and no align-to shortcuts.

## Prior Art

### Onshape — Reference Geometry Tools

Onshape's "Insert Point", "Insert Axis", and "Insert Plane" tools provide visual previews during creation. When hovering over a cylindrical face with the axis tool active, Onshape shows a dashed line along the cylinder axis before the user clicks. When hovering over a planar face with the plane tool, it shows a translucent plane overlay. The preview disappears if the hover target changes, and commits on click.

### SolidWorks — Mate References and Reference Geometry

SolidWorks shows a preview of the reference geometry (plane, axis, point) before insertion. The preview updates in real-time as the mouse moves. A small floating card near the cursor shows the reference type and relevant measurements. The parent part is highlighted with a subtle tint.

### FreeCAD — Attachment Engine

FreeCAD's attachment engine (`Part::AttachEngine`) supports multiple attachment modes per geometry type. For edges, it uses `BRepAdaptor_Curve` to classify edge types (line, circle, ellipse, etc.) and compute appropriate attachment points. Edge-edge intersections use `GeomAPI_ExtremaCurveCurve` for closest-point calculations. FreeCAD maps edges via `SoBrepEdgeSet` with an `edgeIndex` array analogous to `partIndex` for faces.

## Shared Contract

| Interface | Owner | Consumer |
|-----------|-------|----------|
| `DatumPreviewOverlay` (Babylon.js transient rendering) | Prompt 1 (implements) | Prompt 1 (picking system drives) |
| `DatumPreviewType` enum (plane/axis/point) | Prompt 1 (defines) | Prompt 3 (inspector references) |
| Edge topology in `ShapeRegistry` (edge tessellation + edge index) | Prompt 2 (engine implements) | Prompt 2 (frontend edge picking uses) |
| `CreateDatumFromEdgeCommand/Result` | Prompt 2 (proto + engine handler) | Prompt 2 (frontend sends on click) |
| `FaceSurfaceClass` on DatumState | Prompt 1 (stores after face creation) | Prompt 3 (inspector displays) |
| `FlipDatumCommand/Result` | Prompt 3 (proto + engine handler) | Prompt 3 (inspector flip button uses) |
| Datum name auto-generation with type prefix | Prompt 1 (refines existing naming) | Prompt 3 (inspector displays) |
| Floating coordinate card (viewport overlay) | Prompt 3 (implements) | Prompt 1 (creation mode displays) |

Integration test: Import a STEP file with holes and fillets. Enter create-datum mode. Hover a cylindrical face — see axis preview line through cylinder center. Click — datum created. Hover a planar face — see plane overlay. Click — plane datum created. Hover an edge (Prompt 2) — see point indicator. Click — point datum created. Select a datum — inspector shows full coordinate info, surface class, flip button (Prompt 3).

---

## Prompt 1: Datum Creation Visual Guides & Preview System

```
# Epic 14 — Datum Creation Visual Guides & Preview System

You are implementing a real-time visual preview system for datum creation.
When in create-datum mode and hovering over geometry, a transient overlay
shows what the datum will look like BEFORE the user commits by clicking.
The preview is pure Babylon.js imperative rendering — no React re-renders,
no protocol messages.

## Read These First (in order)
- `docs/architecture/principles.md` — React is NOT the hot path for viewport
- `packages/viewport/AGENTS.md` — viewport owns visualization and picking
- `packages/frontend/AGENTS.md` — frontend owns tool modes and authoring UX
- `packages/viewport/src/scene-graph.ts` — SceneGraphManager, datum triads, face highlighting
- `packages/viewport/src/picking.ts` — PickingManager, face hover, SpatialPickData
- `packages/viewport/src/rendering/datum-triad.ts` — existing datum triad rendering
- `packages/viewport/src/body-geometry-index.ts` — BodyGeometryIndex, faceRanges
- `packages/frontend/src/stores/tool-mode.ts` — tool mode store
- `packages/frontend/src/hooks/useViewportBridge.ts` — viewport bridge with pick/hover handlers
- `packages/frontend/src/engine/connection.ts` — sendCreateDatumFromFace
- `native/engine/src/face_classifier.h` — FaceDatumSurfaceClass enum
- `native/engine/src/face_classifier.cpp` — classify_face_for_datum implementation
- `schemas/protocol/transport.proto` — FaceSurfaceClass enum, CreateDatumFromFace messages
- `docs/decisions/` — all existing ADRs

## Governance Reminder
Full governance applies:
- Any boundary or contract change requires an ADR
- Any protocol/schema change requires seam tests
- Any architecture change requires doc updates

## What Exists Now

### Face hover system (Epic 10)
- `PickingManager` tracks hovered face via `hoveredFace: { bodyId, faceIndex }`.
- `updateHoveredFace()` resolves GPU pick → CPU pick → triangle → face via BodyGeometryIndex.
- `SceneGraphManager.highlightFace()` tints face triangles via vertex colors (light blue `[0.4, 0.7, 1.0]`).
- Face highlighting responds within one frame.

### Create-datum mode
- `useToolModeStore` tracks `activeMode: 'select' | 'create-datum' | 'create-joint'`.
- In `useViewportBridge`, when `mode === 'create-datum'`, click resolves via `resolveDatumFacePick()` and calls `sendCreateDatumFromFace(bodyId, faceIndex, name)`.
- Engine classifies face (Planar/Cylindrical/Conical/Spherical/Other), computes pose, creates datum.
- Result handled in `connection.ts` — calls `addDatum()` on mechanism store.

### Datum rendering
- `createDatumTriad()` creates RGB arrow triad (X=red, Y=green, Z=blue) from cylinders + cones.
- Triads scale based on camera distance (DATUM_SCALE_FACTOR = 0.05).
- Triads parent to body rootNode, inheriting body world transform.

### FaceTooltip component
- `FaceTooltip.tsx` shows "Face {index}" near cursor during create-datum mode.
- Follows pointer via RAF-gated event listener. Pure presentation.

### FaceSurfaceClass in protocol
- transport.proto has `FaceSurfaceClass` enum: PLANAR, CYLINDRICAL, CONICAL, SPHERICAL, OTHER.
- `CreateDatumFromFaceSuccess` includes `surface_class` field.
- Frontend receives it but does not currently store or display it.

## What to Build

### 1. Create DatumPreviewManager

Create `packages/viewport/src/rendering/datum-preview.ts`:

This is a singleton manager that owns transient preview geometry. It is NOT
part of the scene graph entity system — preview meshes have no entity ID,
are not pickable, and are disposed when the preview clears.

```ts
export type DatumPreviewType = 'plane' | 'axis' | 'point';

export interface DatumPreviewConfig {
  type: DatumPreviewType;
  position: [number, number, number];
  direction: [number, number, number]; // Z-axis direction (normal or axis)
  bodyId: string;
}

export class DatumPreviewManager {
  // Transient mesh pool for preview overlay
  // Uses ghost white / light blue materials to distinguish from committed datums
  // All meshes: isPickable = false, renderingGroupId = 1 (renders on top)

  show(config: DatumPreviewConfig): void;   // create or update preview
  clear(): void;                             // dispose all preview meshes
  dispose(): void;                           // full teardown
}
```

Preview geometry per type:
- **Plane preview:** Semi-transparent quad (e.g., 0.15m side) with surface normal arrow.
  Material: StandardMaterial, diffuseColor = light blue, alpha = 0.3, backFaceCulling = false.
  Arrow: thin cylinder + cone along normal direction, same ghost-blue color.
  Position: at the face centroid from SpatialPickData.worldPoint, oriented by face normal.

- **Axis preview:** Dashed or solid line along the axis direction, extending ~0.2m in both
  directions from the axis center. Small arrowhead at one end.
  Material: StandardMaterial, emissiveColor = light blue, alpha = 0.7.
  Position: at the cylinder/cone axis center (from SpatialPickData), oriented along axis.

- **Point preview:** Small sphere (radius ~0.008m) or crosshair marker.
  Material: StandardMaterial, emissiveColor = light blue.
  Position: at the sphere center or face centroid.

All preview meshes are re-created each time `show()` is called (or pooled and
repositioned). The manager tracks whether a preview is active.

Scale preview geometry based on camera distance, same as datum triads
(DATUM_SCALE_FACTOR). Register an onBeforeRender observer for this.

### 2. Map FaceSurfaceClass to DatumPreviewType

The mapping from face surface class to preview type is client-side — we do NOT
want to send a protocol message for every hover move. Instead, infer the preview
type from the face surface class.

Problem: the frontend does not know the face surface class until after the
engine classifies it via CreateDatumFromFace. We need a lightweight client-side
approximation OR a pre-classification query.

**Recommended approach: client-side heuristic from face geometry.**

The SpatialPickData already gives us `worldPoint` and `worldNormal` from the CPU
pick. The face highlight system already knows `faceIndex`. We can estimate the
surface type by checking the normal variation across the face:
- If all normals on the face triangles point the same direction → likely planar → plane preview
- If normals vary but all are perpendicular to a common axis → likely cylindrical → axis preview
- If normals radiate from a center → likely spherical → point preview
- Otherwise → fallback to plane preview

This estimation is approximate but sufficient for preview purposes. The engine
remains authoritative for the actual datum classification on click.

Implement this in BodyGeometryIndex or a new utility:
```ts
export function estimateSurfaceType(
  normals: Float32Array,
  indices: Uint32Array,
  faceRange: { start: number; count: number },
): DatumPreviewType;
```

Logic:
1. Gather all unique normals from the face's triangles.
2. Compute the average normal.
3. If max deviation from average < threshold (e.g., 5 degrees) → 'plane'.
4. Otherwise, check if normals are coplanar (all perpendicular to a common direction):
   compute cross products of adjacent normals — if they're parallel → 'axis'.
5. Otherwise → 'point' (conservative fallback for spherical/toroidal/unknown).

**Fallback safety:** Finely-tessellated cylinders with few triangles per ring can have normals that look planar per-face. If step 3 passes but the face has very few triangles (< 6), treat the classification as low-confidence and fall back to `'plane'` (the safest preview). The engine remains authoritative on click — a misclassified preview is a minor visual artifact, but showing an 'axis' preview on a face the engine will classify as planar would confuse the user.

The average normal direction serves as the `direction` for the preview config.
For 'axis' type, estimate the axis direction as the cross product of two normals.

### 3. Integrate preview into PickingManager hover loop

In the create-datum interaction mode, after `updateHoveredFace()` succeeds:

1. Get the face range and normals from BodyGeometryIndex + mesh vertex data.
2. Call `estimateSurfaceType()` to determine preview type.
3. Compute preview position and direction from SpatialPickData.
4. Call `previewManager.show({ type, position, direction, bodyId })`.

When hover clears (mouse moves off body or off face):
- Call `previewManager.clear()`.

When leaving create-datum mode:
- Call `previewManager.clear()`.

The preview manager lives on SceneGraphManager (created in constructor,
disposed in dispose()). PickingManager accesses it via the sceneGraph reference
it already holds.

### 4. Body ownership indicator

When the preview is active, apply a subtle visual cue to the body that the
datum will belong to. This helps in multi-body assemblies.

Approach: apply a subtle border/outline color shift to the body mesh.

Options (choose one):
- **Vertex color tint:** Set body mesh vertex colors to a very subtle warm tint
  (e.g., `[1.0, 0.97, 0.92, 1.0]`) while preview is active. Reset to
  `[1.0, 1.0, 1.0, 1.0]` when preview clears. This reuses the existing
  vertex color infrastructure from face highlighting.
- **Edge rendering color:** Temporarily change the body mesh's `edgesColor`
  from the default subtle gray to a more visible tint (e.g., warm orange
  `[0.8, 0.5, 0.2, 0.5]`). Revert on clear. Body meshes already have
  `enableEdgesRendering()` active.

Use the edge rendering approach — it is less intrusive than vertex colors
(which are already used for face highlighting) and provides a distinct
ownership signal.

Store the previously-highlighted body ID in the preview manager to revert
edge color when the body changes.

### 5. Enhance FaceTooltip with surface type

Update `FaceTooltip.tsx` to show the estimated surface type alongside the face index:

```
Plane (Face 3)     — for planar faces
Axis (Face 7)      — for cylindrical faces
Point (Face 12)    — for spherical faces
Face 15            — for unclassified faces
```

Pass the estimated `DatumPreviewType` from the picking system through to the
face hover callback. Extend `FaceHoverCallback`:

```ts
export type FaceHoverCallback = (
  face: { bodyId: string; faceIndex: number; previewType?: DatumPreviewType } | null,
) => void;
```

### 6. Store surface class on DatumState after creation

When `CreateDatumFromFaceResult` arrives with a `surface_class`, store it on
DatumState so the inspector (Prompt 3) can display it:

In `packages/frontend/src/stores/mechanism.ts`:
```ts
export interface DatumState {
  id: string;
  name: string;
  parentBodyId: string;
  localPose: BodyPose;
  surfaceClass?: 'planar' | 'cylindrical' | 'conical' | 'spherical' | 'other';
}
```

In `connection.ts`, when handling `CreateDatumFromFaceResult`, map the proto
`FaceSurfaceClass` enum to the string and include it in the `addDatum` call.

### 7. Export preview system from viewport package

Add exports to `packages/viewport/src/rendering/index.ts`:
```ts
export { DatumPreviewManager, type DatumPreviewConfig, type DatumPreviewType } from './datum-preview.js';
export { estimateSurfaceType } from './surface-type-estimator.js';
```

## Architecture Constraints
- Preview rendering is viewport-only — NO protocol messages for previews
- Preview meshes are transient — they have no entity ID, are not pickable, are not in the entity map
- Surface type estimation is a client-side heuristic — engine remains authoritative on click
- Visual guides must NOT cause React re-renders — pure Babylon.js imperative rendering
- Preview geometry scales with camera distance, same as datum triads
- Body ownership indicator must revert cleanly when preview clears

## Expected Behavior (testable)

### Planar face preview
1. Import a box. Switch to create-datum mode.
2. Hover over the top face → face highlights in blue + semi-transparent plane overlay appears at face centroid with normal arrow pointing up.
3. Move mouse to side face → previous preview disappears, new plane preview appears with normal pointing sideways.
4. Move mouse off body → preview clears, face highlight clears.

### Cylindrical face preview
1. Import a part with a hole.
2. Hover over the cylindrical face → face highlights + axis line preview appears through cylinder center, extending along the bore axis.
3. The axis preview is visually distinct from the face highlight.

### Spherical face preview
1. Import a part with a spherical cavity.
2. Hover over the spherical face → face highlights + point marker appears at sphere center.

### Body ownership indicator
1. In a multi-body assembly, hover over body A in create-datum mode.
2. Body A shows subtle edge color shift (ownership indicator).
3. Move to body B → body A reverts to normal, body B shows indicator.

### Active tool cursor
1. Switch to create-datum mode → viewport cursor changes to crosshair (`cursor: crosshair`).
2. This prevents the "I forgot I was in create mode" error.
3. Press Escape → cursor reverts to default, back to select mode.

### Mode transitions
1. In select mode → no previews, standard hover behavior.
2. Switch to create-datum mode → face hover shows previews, cursor is crosshair.
3. Press Escape → back to select mode, all previews cleared, cursor reverts.

### Click to commit
1. Hover shows preview. Click → preview clears, real datum appears at the same position/orientation.
2. The committed datum triad matches what the preview showed.

### Performance
1. Preview updates within one frame (< 16ms).
2. No React re-renders triggered by preview updates.
3. Preview dispose is clean — no leaked meshes or materials.

## Done Looks Like
- Hovering over faces in create-datum mode shows surface-type-appropriate preview overlays
- Planar → plane overlay, Cylindrical → axis line, Spherical → point marker
- Preview is ghost blue, visually distinct from committed datum triads
- Body ownership indicated via edge color shift
- FaceTooltip shows estimated surface type (e.g., "Plane (Face 3)")
- Surface class stored on DatumState after creation
- Preview clears on mode change, hover off, and click-to-commit
- No protocol messages sent during hover/preview
- `pnpm --filter @motionlab/viewport typecheck` passes
- `pnpm --filter @motionlab/frontend typecheck` passes

## What NOT to Build
- Edge picking or edge previews (that's Prompt 2)
- Inspector integration or coordinate display (that's Prompt 3)
- Feature recognition or multi-face grouping
- Persistent preview caching across sessions
```

---

## Prompt 2: Advanced Datum Types — Edge & Intersection Picking

```
# Epic 14 — Advanced Datum Types: Edge & Intersection Picking

You are extending the face-only datum creation system to support edge-based
datums. Users can pick edges to create point datums (at click location on
edge), axis datums (along linear edges), and intersection datums (where two
edges or two faces meet). This requires engine-side edge topology support
and frontend edge picking infrastructure.

## Read These First (in order)
- `docs/architecture/principles.md` — engine is computational authority
- `native/engine/AGENTS.md` — native boundary rules
- `packages/viewport/AGENTS.md` — viewport owns visualization and picking
- `native/engine/src/shape_registry.h` — ShapeRegistry stores B-Rep shapes
- `native/engine/src/face_classifier.h/.cpp` — existing face classification
- `native/engine/src/cad_import.h/.cpp` — tessellation with partIndex
- `schemas/protocol/transport.proto` — existing protocol messages
- `packages/viewport/src/body-geometry-index.ts` — BodyGeometryIndex (face partIndex)
- `packages/viewport/src/picking.ts` — PickingManager, SpatialPickData
- `packages/viewport/src/scene-graph.ts` — SceneGraphManager
- `docs/decisions/` — all existing ADRs

## Governance Reminder
Full governance applies:
- Any boundary or contract change requires an ADR
- Any protocol/schema change requires seam tests
- Any architecture change requires doc updates

## What Exists Now

### ShapeRegistry (native/engine)
- Stores `TopoDS_Shape` per body after import.
- `get(body_id)` returns the persisted shape.
- Used by `classify_face_for_datum()` to extract faces via `TopTools_IndexedMapOfShape`.

### Face topology pipeline
- Engine: `tessellate()` emits `part_index` (triangle count per face).
- Protocol: `Body` message carries `repeated uint32 part_index`.
- Frontend: `BodyGeometryIndex` builds O(1) triangleToFace lookup from partIndex.
- Picking: `PickingManager` resolves triangle → face on hover.

### Face classifier
- `classify_face_for_datum(body_shape, face_index)` uses `TopExp::MapShapes(TopAbs_FACE)`.
- Returns `FaceDatumPose` with position, orientation, and surface class.
- Supports Planar, Cylindrical, Conical, Spherical, Other.

### No edge support
- Engine: no edge iteration, no edge tessellation, no edge index mapping.
- Protocol: no edge-related messages.
- Frontend: no edge picking, no edge highlighting.
- Body meshes have `enableEdgesRendering()` for visual edges, but these are
  Babylon.js wireframe edges (every triangle edge), NOT B-Rep edges.

## What to Build

### Part A: Engine Edge Topology

#### A1. Edge tessellation and edgeIndex in CadImporter

Extend `CadImporter::tessellate()` to also emit edge polyline data.

In OCCT, edges are tessellated by `BRepMesh_IncrementalMesh` alongside faces.
Edge polylines are stored as `Poly_PolygonOnTriangulation` on each edge.
Extract them using:

```cpp
TopTools_IndexedMapOfShape edges;
TopExp::MapShapes(shape, TopAbs_EDGE, edges);

std::vector<float> edge_vertices;     // flat [x,y,z, x,y,z, ...]
std::vector<uint32_t> edge_index;     // edge_index[i] = vertex count for edge i
std::vector<uint32_t> edge_offsets;   // edge_offsets[i] = start vertex index for edge i

for (int i = 1; i <= edges.Extent(); i++) {
    const TopoDS_Edge& edge = TopoDS::Edge(edges(i));
    // Find the face that references this edge for triangulation access
    TopLoc_Location loc;
    Handle(Poly_Triangulation) tri;
    Handle(Poly_PolygonOnTriangulation) poly;
    BRep_Tool::PolygonOnTriangulation(edge, poly, tri, loc);
    if (poly.IsNull()) continue;

    const TColStd_Array1OfInteger& nodes = poly->Nodes();
    edge_offsets.push_back(edge_vertices.size() / 3);
    int count = 0;
    for (int j = nodes.Lower(); j <= nodes.Upper(); j++) {
        gp_Pnt pt = tri->Node(nodes(j)).Transformed(loc);
        edge_vertices.push_back(pt.X());
        edge_vertices.push_back(pt.Y());
        edge_vertices.push_back(pt.Z());
        count++;
    }
    edge_index.push_back(count);
}
```

Extend MeshData:
```cpp
struct MeshData {
    // existing face data...
    std::vector<float> edge_vertices;    // polyline vertices for edges
    std::vector<uint32_t> edge_index;    // vertex count per edge
};
```

#### A2. Edge classification

Create `native/engine/src/edge_classifier.h` and `.cpp`:

```cpp
enum class EdgeDatumType {
    Linear,      // straight line → axis datum
    Circular,    // circle/arc → axis datum (through center, along circle normal)
    Other        // spline/ellipse → point datum at click location
};

struct EdgeDatumPose {
    EdgeDatumType edge_type;
    double position[3];
    double orientation[4]; // w,x,y,z
};

std::optional<EdgeDatumPose> classify_edge_for_datum(
    const TopoDS_Shape& body_shape,
    uint32_t edge_index,
    double u_parameter = 0.5  // parametric position on edge, 0..1
);
```

Use `BRepAdaptor_Curve` to classify:
- `GeomAbs_Line` → EdgeDatumType::Linear. Position = midpoint of edge, orientation Z-axis = line direction.
- `GeomAbs_Circle` → EdgeDatumType::Circular. Position = circle center, orientation Z-axis = circle normal.
- Other → EdgeDatumType::Other. Position = point at u_parameter, orientation = tangent direction.

#### A3. Edge-edge intersection

Create `native/engine/src/edge_intersection.h` and `.cpp`:

```cpp
struct EdgeIntersectionResult {
    bool found;
    double position[3];
    double orientation[4]; // Z-axis = average of edge tangents at intersection
};

EdgeIntersectionResult compute_edge_intersection(
    const TopoDS_Shape& body_shape,
    uint32_t edge_index_1,
    uint32_t edge_index_2
);
```

Use `GeomAPI_ExtremaCurveCurve` to find the closest point between two edges.
If distance < tolerance (e.g., 1e-6), return the intersection point.
If edges don't intersect, return the midpoint of the closest approach segment.

#### A4. Face-face intersection

```cpp
struct FaceIntersectionResult {
    bool found;
    double position[3];      // midpoint of intersection curve
    double orientation[4];    // Z-axis = intersection line direction
};

FaceIntersectionResult compute_face_intersection(
    const TopoDS_Shape& body_shape,
    uint32_t face_index_1,
    uint32_t face_index_2
);
```

Use `BRepAlgoAPI_Section` or `BRepTools::IntersectCurves` to compute the
intersection curve of two faces. For two planes, this gives a line.
Position = midpoint of the intersection curve. Orientation Z-axis = curve direction.

### Part B: Protocol Changes

#### B1. Edge topology in Body message

In `schemas/mechanism/mechanism.proto`:

```protobuf
message Body {
  // existing fields...

  // Edge polyline data for edge picking.
  // edge_vertices: flat array of [x,y,z] polyline points for all edges.
  // edge_index: vertex count per edge (edge_index[i] = number of vertices for edge i).
  repeated float edge_vertices = 11;
  repeated uint32 edge_index = 12;
}
```

#### B2. Edge datum commands

In `schemas/protocol/transport.proto`:

```protobuf
enum EdgeDatumType {
  EDGE_DATUM_TYPE_UNSPECIFIED = 0;
  EDGE_DATUM_TYPE_LINEAR = 1;
  EDGE_DATUM_TYPE_CIRCULAR = 2;
  EDGE_DATUM_TYPE_OTHER = 3;
}

message CreateDatumFromEdgeCommand {
  motionlab.mechanism.ElementId parent_body_id = 1;
  uint32 edge_index = 2;
  double u_parameter = 3;   // 0..1, parametric position on edge
  string name = 4;
}

message CreateDatumFromEdgeSuccess {
  motionlab.mechanism.Datum datum = 1;
  uint32 edge_index = 2;
  EdgeDatumType edge_type = 3;
}

message CreateDatumFromEdgeResult {
  oneof result {
    CreateDatumFromEdgeSuccess success = 1;
    string error_message = 2;
  }
}

message CreateDatumFromEdgeIntersectionCommand {
  motionlab.mechanism.ElementId parent_body_id = 1;
  uint32 edge_index_1 = 2;
  uint32 edge_index_2 = 3;
  string name = 4;
}

message CreateDatumFromEdgeIntersectionSuccess {
  motionlab.mechanism.Datum datum = 1;
}

message CreateDatumFromEdgeIntersectionResult {
  oneof result {
    CreateDatumFromEdgeIntersectionSuccess success = 1;
    string error_message = 2;
  }
}

message CreateDatumFromFaceIntersectionCommand {
  motionlab.mechanism.ElementId parent_body_id = 1;
  uint32 face_index_1 = 2;
  uint32 face_index_2 = 3;
  string name = 4;
}

message CreateDatumFromFaceIntersectionSuccess {
  motionlab.mechanism.Datum datum = 1;
}

message CreateDatumFromFaceIntersectionResult {
  oneof result {
    CreateDatumFromFaceIntersectionSuccess success = 1;
    string error_message = 2;
  }
}
```

Add to Command oneof:
```protobuf
CreateDatumFromEdgeCommand create_datum_from_edge = 31;
CreateDatumFromEdgeIntersectionCommand create_datum_from_edge_intersection = 32;
CreateDatumFromFaceIntersectionCommand create_datum_from_face_intersection = 33;
```

Add to Event oneof:
```protobuf
CreateDatumFromEdgeResult create_datum_from_edge_result = 31;
CreateDatumFromEdgeIntersectionResult create_datum_from_edge_intersection_result = 32;
CreateDatumFromFaceIntersectionResult create_datum_from_face_intersection_result = 33;
```

### Part C: Frontend Edge Picking

#### C1. EdgeGeometryIndex

Create `packages/viewport/src/edge-geometry-index.ts`:

```ts
export class EdgeGeometryIndex {
  /** Per-edge polyline segments: edgePolylines[i] = array of [x,y,z] points */
  readonly edgePolylines: ReadonlyArray<Float32Array>;
  readonly edgeCount: number;

  constructor(edgeVertices: Float32Array, edgeIndex: Uint32Array) {
    // Build per-edge polyline arrays from flat data
  }

  /**
   * Find the closest edge to a world-space ray.
   * Returns edge index and parametric position (0..1) along the edge.
   */
  pickEdge(
    rayOrigin: { x: number; y: number; z: number },
    rayDirection: { x: number; y: number; z: number },
    threshold: number,
  ): { edgeIndex: number; u: number; worldPoint: { x: number; y: number; z: number } } | null;
}
```

Edge picking works by testing ray-line-segment distance for each edge's
polyline segments. Return the closest edge within the pixel threshold
(converted to world-space distance based on camera distance).

#### C2. Edge line rendering

Create `packages/viewport/src/rendering/edge-lines.ts`:

Render B-Rep edges as thin `LinesMesh` overlays. These are initially invisible
but appear when in create-datum mode and the user hovers near an edge.
Highlighted edge renders in a brighter color.

```ts
export class EdgeLineRenderer {
  constructor(scene: Scene);
  buildFromEdgeData(bodyId: string, edgeVertices: Float32Array, edgeIndex: Uint32Array): void;
  highlightEdge(bodyId: string, edgeIndex: number): void;
  clearHighlight(): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}
```

#### C3. Edge picking in PickingManager

Extend the hover loop in create-datum mode:

1. First, try face picking (existing behavior).
2. If no face hit, try edge picking via `EdgeGeometryIndex.pickEdge()`.
3. If edge hit, highlight the edge and show edge preview (from Prompt 1's
   DatumPreviewManager — axis line for linear edges, point for others).
4. If neither face nor edge hit, clear all highlights and previews.

Edge hover takes lower priority than face hover — faces are the primary
selection target. Edge picking activates when the cursor is near an edge
but not over a face, or when the cursor is close to an edge boundary.

**Snapping behavior:** When the cursor is within 10-15 pixels of an edge,
the face highlight should drop and the edge highlight should snap in.
This prevents the user from having to "thread the needle" to hit a thin
line. Convert the pixel threshold to world-space distance using the
camera's current distance to maintain consistent feel across zoom levels.

#### C4. Wire to protocol

In `packages/frontend/src/engine/connection.ts`:
- `sendCreateDatumFromEdge(bodyId, edgeIndex, uParameter, name)`
- `sendCreateDatumFromEdgeIntersection(bodyId, edgeIdx1, edgeIdx2, name)`
- `sendCreateDatumFromFaceIntersection(bodyId, faceIdx1, faceIdx2, name)`
- Handle result events, call `addDatum()` on mechanism store.

In `packages/protocol/src/transport.ts`:
- `createCreateDatumFromEdgeCommand()`
- `createCreateDatumFromEdgeIntersectionCommand()`
- `createCreateDatumFromFaceIntersectionCommand()`

### Part D: Engine Command Handlers

In `transport.cpp`, add handlers for:
- `kCreateDatumFromEdge` → classify edge, compute pose, create datum
- `kCreateDatumFromEdgeIntersection` → compute intersection, create datum
- `kCreateDatumFromFaceIntersection` → compute intersection, create datum

### Part E: Unit Tests

`native/engine/tests/test_edge_classifier.cpp`:

1. **Linear edge on box:** Classify a box edge → EdgeDatumType::Linear, axis along edge direction.
2. **Circular edge on cylinder:** Classify end-cap circle edge → EdgeDatumType::Circular, axis through center.
3. **Edge-edge intersection (box corner):** Two adjacent box edges → intersection at shared vertex.
4. **Edge-edge near-miss:** Two non-intersecting edges → closest approach point returned.
5. **Face-face intersection (two planes):** Two planar faces → intersection line direction correct.
6. **edgeIndex correctness:** Tessellate a box, verify edgeIndex entries sum to total edge vertices.
7. **Out-of-range edge index:** Returns nullopt, no crash.

### Part F: Protocol Seam Test

1. Import STEP file, verify Body message includes edge_vertices and edge_index.
2. Send CreateDatumFromEdgeCommand with a linear edge index → verify axis datum created.
3. Send CreateDatumFromEdgeCommand with a circular edge index → verify axis datum at circle center.
4. Send CreateDatumFromEdgeIntersectionCommand → verify point datum at intersection.
5. Send CreateDatumFromFaceIntersectionCommand with two planar faces → verify axis datum along intersection line.
6. Send with invalid indices → verify error response.

### Part G: ADR

Write ADR documenting:
- Edge topology follows the same partIndex pattern as face topology.
- Edge indices use `TopExp::MapShapes(TopAbs_EDGE)` iteration order (0-based).
- Edge polylines use OCCT's `Poly_PolygonOnTriangulation` (pre-computed by BRepMesh).
- Edge picking uses ray-segment distance testing on polyline data.
- Intersection commands use OCCT geometric algorithms (GeomAPI_ExtremaCurveCurve, BRepAlgoAPI_Section).

## Architecture Constraints
- Edge topology requires engine-side changes (ShapeRegistry already stores shapes, but edge iteration is new).
- Edge polyline data crosses the protocol boundary as flat arrays, same as face partIndex.
- Edge picking is frontend-side ray-segment testing — no engine round-trip for hover.
- Intersection computation is engine-authoritative — frontend sends indices, engine computes.
- B-Rep edge data must not leak OCCT types through the protocol.
- Edge indices follow TopExp::MapShapes ordering, consistent with face indices.

## Done Looks Like
- Edge polyline data emitted during import and sent via protocol.
- EdgeGeometryIndex built on frontend from edge data.
- Edges highlight on hover in create-datum mode when cursor is near an edge.
- Clicking a linear edge creates an axis datum along the edge direction.
- Clicking a circular edge creates an axis datum through the circle center.
- Edge-edge intersection creates a point datum at the intersection.
- Face-face intersection creates an axis datum along the intersection line.
- Engine tests pass for edge classification and intersection computation.
- Protocol seam tests pass.
- ADR written.
- `cmake --preset dev && cmake --build build/dev` succeeds.
- `ctest --preset dev` passes.
- `pnpm generate:proto` succeeds.
- `pnpm --filter @motionlab/protocol typecheck` passes.
- `pnpm --filter @motionlab/viewport typecheck` passes.
- `pnpm --filter @motionlab/frontend typecheck` passes.

## What NOT to Build
- Datum preview overlays for edge picks (reuse DatumPreviewManager from Prompt 1 — axis for linear/circular, point for other).
- Inspector integration for edge-created datums (that's Prompt 3 — they're just datums with different surface class).
- Multi-edge selection (pick one edge at a time; intersection picks are two sequential clicks).
- Spline/NURBS edge tessellation improvements — OCCT's default is sufficient.
```

---

## Prompt 3: Datum Inspector Integration & Coordinate Display

```
# Epic 14 — Datum Inspector Integration & Coordinate Display

You are enriching the datum inspector panel and adding real-time coordinate
display during creation. The inspector becomes the secondary authoring surface
for datums — showing full coordinate info, surface class, flip/align actions,
and parent body context. During creation, a floating coordinate card near
the cursor shows real-time position and body ownership.

## Read These First (in order)
- `docs/architecture/principles.md` — React is NOT the hot path for viewport; inspector is React
- `packages/frontend/AGENTS.md` — frontend owns authoring UX and inspector
- `packages/ui/AGENTS.md` — UI component conventions, Tailwind v4 rules
- `packages/frontend/src/components/DatumInspector.tsx` — existing datum inspector
- `packages/frontend/src/stores/mechanism.ts` — DatumState, BodyState definitions
- `packages/frontend/src/stores/tool-mode.ts` — tool mode store
- `packages/frontend/src/hooks/useViewportBridge.ts` — viewport bridge, pick handler
- `packages/frontend/src/components/ViewportOverlay.tsx` — viewport overlay layout
- `packages/frontend/src/components/FaceTooltip.tsx` — existing face tooltip
- `packages/ui/src/components/primitives/` — PropertyRow, InspectorPanel, InspectorSection, etc.
- `packages/ui/src/components/engineering/` — Vec3Display, QuatDisplay
- `schemas/protocol/transport.proto` — existing protocol messages
- `docs/decisions/` — all existing ADRs

## Governance Reminder
Full governance applies:
- Any boundary or contract change requires an ADR
- Any protocol/schema change requires seam tests
- Any architecture change requires doc updates

## What Exists Now

### DatumInspector.tsx
Current inspector shows:
- **Identity section:** Name (inline editable), parent body name (text), datum ID (copyable).
- **Local Pose section:** Position as Vec3Display (x, y, z in meters).
- **Orientation section:** QuatDisplay (quaternion values).

Missing:
- Global coordinates (world space).
- Surface class (from face creation).
- Flip button (reverse datum Z-axis).
- Align-to shortcuts.
- Editable position fields.

### DatumState in mechanism store
```ts
interface DatumState {
  id: string;
  name: string;
  parentBodyId: string;
  localPose: BodyPose;
  // After Prompt 1: surfaceClass?: string
}
```

### Vec3Display / QuatDisplay
- `Vec3Display` shows a label + three numeric values (x, y, z) with unit.
- `QuatDisplay` shows quaternion components.
- Both are read-only display components.
- `NumericInput` exists in `packages/ui/` for editable numeric fields.

### FaceTooltip
- Shows "Face {index}" near cursor.
- After Prompt 1: shows estimated surface type (e.g., "Plane (Face 3)").

### Protocol: UpdateDatumPose
- `UpdateDatumPoseCommand` already exists with `datum_id` and `local_pose`.
- Used by gizmo drag-end to update datum position.
- Can be reused for inspector edits.

### Protocol: No FlipDatum command
- No existing command to flip a datum's orientation.
- Flipping = rotating 180 degrees around the datum's local X-axis (reversing Z and Y).

## What to Build

### 1. FlipDatum protocol and engine handler

Flipping a datum reverses its Z-axis (and Y-axis to maintain right-handedness).
This is equivalent to a 180-degree rotation around the local X-axis.

This can be implemented client-side by computing the flipped quaternion and
sending an UpdateDatumPoseCommand — no new protocol message needed.

Flip quaternion computation:
```ts
function flipDatumOrientation(q: { x: number; y: number; z: number; w: number }) {
  // Rotate 180 degrees around local X-axis: multiply by [sin(90), 0, 0, cos(90)] = [1, 0, 0, 0]
  // q_flipped = q * q_flip where q_flip = Quaternion(1, 0, 0, 0)
  return {
    x: q.w,    // w*1 + x*0 + y*0 + z*0
    y: -q.z,   // w*0 + x*0 - y*0 + z*(-1) ... actually use proper quaternion multiply
    z: q.y,
    w: -q.x,
  };
}
```

Use Babylon.js `Quaternion.Multiply()` for correctness rather than manual
computation. Put this utility in `packages/frontend/src/utils/datum-math.ts`.

### 2. Global coordinates computation

Compute world-space position and orientation by combining the parent body's
world pose with the datum's local pose.

```ts
function computeGlobalPose(
  bodyPose: BodyPose,
  datumLocalPose: BodyPose,
): BodyPose {
  // Global = Body * Local
  // Position: rotate local position by body orientation, then add body position
  // Orientation: body quaternion * local quaternion
}
```

This is a frontend computation — no engine round-trip needed. Recompute on
every render (body poses may change during simulation).

Put this utility in `packages/frontend/src/utils/datum-math.ts`.

### 3. Enhanced DatumInspector

Restructure the inspector into these sections:

#### Identity Section (existing, enhanced)
- **Name:** Inline editable (existing).
- **Parent Body:** Clickable — clicking selects the parent body in the selection store.
- **Surface Class:** Badge showing "Planar", "Cylindrical", "Conical", "Spherical", or none if datum was created manually.
- **Datum ID:** Copyable (existing).

#### Coordinates Section (enhanced — with frame toggle)

Add a segmented control toggle: **"Local | World"** at the top of this section. This is the converged coordinate display pattern used across the product (same pattern as Epic 15 joint inspector).

**When "Local" is active (default):**
- **Position:** Editable Vec3 using NumericInput components.
  On value change, debounce 300ms, then send `UpdateDatumPoseCommand` with new position.
  Keep existing orientation when only position changes.
- **Orientation:** QuatDisplay (read-only — editing quaternions directly is not user-friendly).
- Label: "Datum Pose (Body Frame)"

**When "World" is active:**
- **Position:** Vec3Display, read-only, computed from body pose + local pose.
- **Orientation:** QuatDisplay, read-only, computed.
- Label: "Datum Pose (World Frame)"
- Position fields become read-only (world-frame editing is not supported — user must edit in local frame).

> **Pattern note:** Showing one frame at a time with a toggle keeps the inspector compact and matches Onshape's simulation panel convention. The previous design showed both local and global simultaneously, which doubles visual noise for minimal benefit — most users care about one frame at a time.

#### Actions Section (new)
- **Flip button:** "Flip Z-axis" button. On click, compute flipped orientation and send UpdateDatumPoseCommand.
  Visual: icon button with FlipVertical icon (from lucide-react), label "Flip".
  **Animate the flip:** The viewport triad should interpolate the 180-degree rotation over ~200ms (slerp the quaternion) rather than popping instantly. An instant pop can cause spatial disorientation, especially for datum triads that are small and hard to track.
  Disabled during simulation.
- **Align-to dropdown:** Select component with options:
  - "Align to World XY" — sets orientation to identity (Z = world up)
  - "Align to World XZ" — sets orientation so Z = world Y (forward)
  - "Align to World YZ" — sets orientation so Z = world X (right)
  - "Align to another datum" — (future, disabled for now)
  On select, compute the target orientation in body-local space and send UpdateDatumPoseCommand.
  Disabled during simulation.

#### UI Components
Use existing `PropertyRow`, `InspectorSection`, `InspectorPanel` from `@motionlab/ui`.
For editable position, create a new `EditableVec3` component:

```tsx
// packages/ui/src/components/engineering/editable-vec3-display.tsx
export function EditableVec3Display({
  label,
  value,
  unit,
  onValueChange,
  disabled,
}: {
  label: string;
  value: { x: number; y: number; z: number };
  unit?: string;
  onValueChange: (value: { x: number; y: number; z: number }) => void;
  disabled?: boolean;
}) {
  // Three NumericInput fields for x, y, z
  // Debounced onChange that calls onValueChange
}
```

### 4. Floating coordinate card during creation

Enhance the `FaceTooltip` component (or create a new `CreationCoordinateCard`)
to show richer information during datum creation:

When in create-datum mode and hovering over a face/edge:
```
┌─────────────────────────┐
│  Plane (Face 3)         │
│  Body: Link_Arm_1       │
│  Pos: 0.045, 0.012, 0.0│
│  Local | Global         │
└─────────────────────────┘
```

Information sources:
- **Type label:** From Prompt 1's estimated surface type + face index.
- **Body name:** From mechanism store, keyed by bodyId from hoveredFace.
- **Position:** From SpatialPickData.worldPoint (global) or computed local.
- **Local/Global toggle:** Small toggle that switches between body-local and world coordinates.

This component receives data from the face hover callback. It is a React
component rendered in `ViewportOverlay.tsx`, positioned near the cursor.

Position tracking: use the shared `WorldSpaceOverlay` component (see below) with pointer-follow mode. This reuses the same RAF-gated projection primitive that Epic 14 Prompt 1's FaceTooltip and Epic 15's datum floating labels use.

> **Shared abstraction:** The `WorldSpaceOverlay` component (created in `packages/frontend/src/components/WorldSpaceOverlay.tsx`) accepts either a world position prop (for 3D-anchored labels) or a pointer-follow flag (for cursor-tracking cards like this one), and renders children at the projected screen position. This avoids three separate implementations of the same "position React div in screen space from a 3D coordinate or pointer" pattern across Epics 14 and 15.

### 5. Datum name auto-generation with type prefix

After Prompt 1 stores `surfaceClass` on DatumState, enhance the auto-naming:

Update `packages/frontend/src/utils/datum-naming.ts`:

```ts
export function nextDatumName(
  datums: Map<string, DatumState>,
  surfaceClass?: string,
): string {
  // Count existing datums of this type
  // "Plane_1", "Plane_2" for planar
  // "Axis_1", "Axis_2" for cylindrical/conical
  // "Point_1", "Point_2" for spherical
  // "Datum_1" for unknown/other
}
```

Problem: the surface class is not known until after the engine responds.
Auto-naming happens before the command is sent.

Solution: send empty name in the command. The engine already auto-generates
names based on face type (e.g., "Plane (Face 3)"). The engine-generated name
is authoritative. If we want the shorter "Plane_1" format, modify the engine's
auto-naming in `face_classifier.cpp` or rename after creation in the result
handler.

Recommended: keep engine auto-naming as-is. In the `CreateDatumFromFaceResult`
handler, use the engine-provided name. If the user wants to rename, they use
the inline edit in the inspector.

### 6. Datum triad axis colors

Verify that datum triads already use axis colors (X=red, Y=green, Z=blue).
They do — `createDatumTriad()` in `datum-triad.ts` already defines:
- X: Color3(1, 0.2, 0.2) — red
- Y: Color3(0.2, 0.85, 0.2) — green
- Z: Color3(0.3, 0.5, 1) — blue

No changes needed here.

## Architecture Constraints
- Inspector is React — it IS allowed to cause React re-renders (unlike viewport preview).
- Editable position fields send UpdateDatumPoseCommand (existing protocol) — no new messages.
- Global coordinates are computed client-side from body pose + local pose — no engine query.
- Flip uses existing UpdateDatumPoseCommand with computed flipped quaternion.
- Align-to uses existing UpdateDatumPoseCommand with computed target orientation.
- Floating coordinate card is a React overlay in ViewportOverlay, positioned by pointer events.
- NumericInput from @motionlab/ui follows existing patterns (see numeric-input.tsx).
- Use longhand Tailwind padding (ps-/pe-) not shorthand (px-) in base components to avoid Tailwind v4 override bugs (from project memory).

## Expected Behavior (testable)

### Enhanced inspector
1. Select a datum created from a planar face.
2. Inspector shows: Name, Parent Body (clickable), Surface Class: "Planar", Datum ID.
3. Coordinates section shows "Local | World" toggle, defaulting to Local.
4. In Local mode: Position shows editable x, y, z fields with current values.
5. Toggle to World: Position shows computed world-space coordinates (read-only).
6. Orientation shows quaternion (read-only in both modes).

### Editable position
1. Change x value in local position field.
2. After 300ms debounce, datum moves in viewport to new position.
3. Global coordinates update to reflect new position.
4. Undo via Ctrl+Z is not required (future work).

### Flip button
1. Select a datum with Z-axis pointing up.
2. Click "Flip" button.
3. Datum Z-axis now points down (180-degree rotation around local X).
4. Inspector orientation updates to reflect flipped quaternion.
5. Viewport triad visually flips.

### Align-to
1. Select a datum with arbitrary orientation.
2. Select "Align to World XY" from dropdown.
3. Datum orientation changes to identity (Z = world up).
4. Inspector orientation shows [0, 0, 0, 1].

### Parent body click
1. Select a datum. Inspector shows parent body name.
2. Click the parent body name.
3. Selection changes to the parent body. Inspector switches to BodyInspector.

### Floating coordinate card
1. Enter create-datum mode. Hover over a face.
2. Floating card near cursor shows: type label, body name, position coordinates.
3. Move cursor → coordinates update in real-time.
4. Click → card disappears, datum created.
5. Move to empty space → card disappears.

### Coordinate display toggle
1. Inspector "Local | World" toggle defaults to Local (editable).
2. Toggle to World → coordinates show world-space position (read-only).
3. Floating card near cursor also shows "Local | World" toggle, defaulting to World.

### Simulation guard
1. Start simulation. Select a datum.
2. Position fields are disabled (read-only).
3. Flip button is disabled.
4. Align-to dropdown is disabled.

## Done Looks Like
- DatumInspector shows identity, local coordinates (editable), global coordinates, surface class, flip button, align-to dropdown
- Editable position sends UpdateDatumPoseCommand on change (debounced)
- Flip reverses Z-axis via computed quaternion + UpdateDatumPoseCommand
- Align-to sets orientation to world-aligned values
- Parent body name is clickable (selects body)
- Floating coordinate card near cursor during datum creation shows type, body, position
- Local/Global toggle on floating card
- All edit actions disabled during simulation
- `pnpm --filter @motionlab/ui typecheck` passes
- `pnpm --filter @motionlab/frontend typecheck` passes

## What NOT to Build
- Undo/redo for inspector edits (future)
- "Align to another datum" (future — requires datum-to-datum query)
- Datum constraints or parametric relationships
- Custom orientation input (Euler angles, axis-angle) — quaternion display is sufficient for now
- Edge-specific inspector fields (edge index, u-parameter) — these are implementation details
```

---

## Integration Verification

After all three prompts complete, verify the full viewport-centric datum authoring flow:

1. **Import a STEP file** with planar, cylindrical, conical, and spherical faces, plus linear and circular edges.
2. **Switch to create-datum mode.**
3. **Hover a planar face:** Face highlights blue. Semi-transparent plane overlay appears at face centroid. FaceTooltip shows "Plane (Face 3)". Floating card shows body name and coordinates. Body edges tint warm.
4. **Click the face:** Plane datum created with Z = face normal. Preview clears, real triad appears. Inspector shows full datum info with surface class "Planar".
5. **Hover a cylindrical face:** Axis line preview appears along bore axis. Tooltip shows "Axis (Face 7)".
6. **Click:** Axis datum created at cylinder center. Inspector shows "Cylindrical".
7. **Hover an edge (Prompt 2):** Edge highlights. Axis or point preview based on edge type.
8. **Click the edge:** Edge-based datum created.
9. **Select a datum. Inspector (Prompt 3):** Shows local + global coordinates, surface class, flip button.
10. **Click Flip:** Datum Z-axis reverses. Triad flips in viewport.
11. **Edit local X position in inspector:** Datum moves to new position after debounce.
12. **Click "Align to World XY":** Datum orientation resets to identity.
13. **Click parent body name in inspector:** Selection changes to body.
14. **Escape:** Returns to select mode. All previews and highlights cleared.
15. **Typecheck:** All `pnpm --filter ... typecheck` pass.
16. **Engine tests:** `ctest --preset dev` passes.
17. **Protocol codegen:** `pnpm generate:proto` succeeds.

## Future Work (out of scope)

- **Vertex picking:** Extend to vertex-level selection (snap to vertices for point datums).
- **Multi-reference datums:** Datum from 2+ faces (e.g., midplane between two parallel faces).
- **Smart snap inference:** When two datums are nearly aligned, offer to snap to exact alignment.
- **Undo/redo for datum edits:** Inspector position/orientation changes should be undoable.
- **Feature recognition integration:** asiAlgo AAG to group faces into holes/shafts for smarter datum suggestions.
- **Constraint-based attachment:** FreeCAD-style attachment modes (Concentric, Coplanar, etc.) for parametric datum placement.
- **Measure tool:** Display distances/angles between datums during creation.
