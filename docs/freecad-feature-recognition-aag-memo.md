# Memo: FreeCAD Feature Recognition & Attributed Adjacency Graphs

**Date:** 2026-03-18
**Subject:** How FreeCAD handles feature recognition, face adjacency, and topology analysis
**Scope:** Full codebase survey of FreeCAD (commit `12cced5`, `main` branch)

---

## Executive Summary

FreeCAD **does not implement a unified Attributed Adjacency Graph (AAG)** in the classical academic sense (Joshi & Chang 1988, etc.). Instead, it distributes face-adjacency analysis, surface-type classification, and feature detection across several independent modules, each purpose-built for a specific downstream task. The closest analog to a formal AAG lives in the **Part module's `ModelRefine` namespace**, which constructs face-edge-face adjacency maps and classifies surfaces by type — but it uses this information for *face merging*, not for manufacturing feature extraction.

This memo catalogs every relevant subsystem, explains how each works, and assesses what would be required to build a proper AAG on top of FreeCAD's existing infrastructure.

---

## 1. Core Face Adjacency Infrastructure — `ModelRefine` (Part Module)

**Files:**
- `src/Mod/Part/App/modelRefine.h`
- `src/Mod/Part/App/modelRefine.cpp`

This is the most graph-like subsystem in FreeCAD. It operates on `TopoDS_Shell` objects from OpenCASCADE and provides four cooperating classes:

### 1.1 `FaceAdjacencySplitter`

Builds a **bidirectional face-edge adjacency structure** and uses it to find connected components among a filtered set of faces.

**Data structures (the implicit graph):**
```
faceToEdgeMap : IndexedDataMap< Face → List<Edge> >
edgeToFaceMap : IndexedDataMap< Edge → List<Face> >
```

**Construction** — iterates every face in the shell, collects its edges via `TopExp_Explorer(face, TopAbs_EDGE)`, then calls `TopExp::MapShapesAndAncestors(shell, TopAbs_EDGE, TopAbs_FACE, ...)` to build the reverse map.

**`split(facesIn)`** — given a subset of faces (e.g., "all planar faces"), finds connected components by DFS:

```
for each face in facesIn:
    if not processed:
        recursiveFind(face, group)
        if group.size > 1: store group
```

**`recursiveFind(face, outVector)`** — classic DFS over the adjacency:
1. Add `face` to `outVector` and mark processed.
2. For each edge of `face`, look up adjacent faces via `edgeToFaceMap`.
3. For each adjacent face: if it's in the allowed set and not yet processed, recurse.

**Key observation:** This is structurally an adjacency graph traversal, but the edges carry **no attributes** (no convexity/concavity classification). The graph is implicit — stored in two OCCT indexed maps, never materialized as a standalone graph object.

### 1.2 `FaceTypeSplitter`

Classifies every face in a shell by `GeomAbs_SurfaceType`:

| Enum Value | Geometric Meaning |
|---|---|
| `GeomAbs_Plane` | Flat face |
| `GeomAbs_Cylinder` | Cylindrical surface |
| `GeomAbs_Cone` | Conical surface |
| `GeomAbs_Sphere` | Spherical surface |
| `GeomAbs_Torus` | Toroidal surface |
| `GeomAbs_BSplineSurface` | Freeform B-spline |
| `GeomAbs_SurfaceOfRevolution` | Revolved profile |
| `GeomAbs_SurfaceOfExtrusion` | Extruded profile |

Uses `BRep_Tool::Surface()` → `GeomAdaptor_Surface::GetType()` for classification.

### 1.3 `FaceEqualitySplitter`

Groups faces of the *same* surface type that are also geometrically equivalent (e.g., coplanar planes, coaxial cylinders). Delegates to type-specific `isEqual()` implementations:

- **Planes:** Same normal direction and distance from origin.
- **Cylinders:** Same axis, radius, and center.
- **BSplines:** Control-point-level comparison.

### 1.4 `FaceUniter` — The Orchestrator

Runs the full pipeline: **type-split → adjacency-split → equality-split → merge**.

```
for each registered surface type:
    faces = typeSplitter.getTypedFaceVector(type)
    adjacencySplitter.split(faces)
    for each adjacency group:
        equalitySplitter.split(group, typeObject)
        for each equality group:
            merged = typeObject.buildFace(group)   // BRepLib_FuseEdges
            update shell
```

**Purpose:** This entire pipeline exists to *clean up* B-Rep models by merging unnecessarily split faces (e.g., after boolean operations). It is not feature recognition — but the infrastructure (adjacency maps, type classification) is exactly what an AAG would need.

---

## 2. Edge Graph with Planar Embedding — TechDraw Module

**Files:**
- `src/Mod/TechDraw/App/EdgeWalker.h`
- `src/Mod/TechDraw/App/EdgeWalker.cpp`

### 2.1 Boost Graph Integration

TechDraw uses `boost::adjacency_list` (bidirectional, indexed) to represent edge-vertex topology for 2D drawing generation:

```cpp
using graph = boost::adjacency_list<
    vecS, vecS, bidirectionalS,
    property<vertex_index_t, int>,
    property<edge_index_t, int>
>;
```

### 2.2 `EdgeWalker`

Converts OCCT `TopoDS_Edge` collections into a Boost graph and performs **planar face traversal** to extract closed wires:

1. `makeUniqueVList()` — deduplicates vertices.
2. `makeWalkerEdges()` — maps OCCT edges to graph edges.
3. `makeEmbedding()` — builds a planar embedding (vertex incidence lists sorted by angle).
4. `execute()` — runs `boost::planar_face_traversal` with an `edgeVisitor` to enumerate all enclosed regions.

### 2.3 Supporting Structures

- **`WalkerEdge`**: Bridges OCCT `TopoDS_Edge` with Boost `edge_t` descriptor.
- **`incidenceItem`**: Stores edge index + angle at a vertex (for planar embedding ordering).
- **`embedItem`**: Per-vertex incidence list.
- **`edgeVisitor`**: Implements `planar_face_traversal_visitor` — collects edges per face during traversal.

**Relevance to AAG:** This is a proper graph with traversal, but it operates on **projected 2D edges** for drawing views, not on 3D B-Rep faces. The planar-embedding machinery could be repurposed for 3D face-adjacency if edge attributes (convexity) were added.

---

## 3. CAM Feature Detection — Hole Recognition

**Files:**
- `src/Mod/CAM/Path/Base/Drillable.py`
- `src/Mod/CAM/Path/Op/Drilling.py`
- `src/Mod/CAM/Path/Op/CircularHoleBase.py`

### 3.1 `isDrillable()` — The Main Dispatcher

Classifies a candidate face or edge for drillability:

```
if Face:
    if Cylinder → isDrillableCylinder()
    if Plane    → isDrillableFace()
if Edge:
    → isDrillableEdge()
```

### 3.2 `isDrillableCylinder()`

Recognizes cylindrical holes by:
1. Checking `isinstance(candidate.Surface, Part.Cylinder)`
2. Verifying exactly 3 edges (seam + 2 circular boundary edges)
3. Testing `obj.isInside(center)` — negative means hole, positive means boss
4. Checking axis alignment against drilling vector
5. Calling `checkForBlindHole()` to distinguish through vs. blind holes

### 3.3 `isDrillableFace()`

Recognizes flat faces that are hole bottoms:
- 1 circular edge → simple hole bottom
- 2 concentric circular edges → counterbored/countersunk (donut face)
- Validates normal alignment and tool diameter fit

### 3.4 `getDrillableTargets()`

Bulk scanner — iterates all faces on a shape, filters for cylinders with negative volume (holes), groups multi-face holes by center point, and returns `(obj, 'FaceN')` tuples.

### 3.5 `checkForBlindHole()`

Finds the bottom face of a blind hole by:
1. Collecting all circular faces (single-edge faces with circular boundary).
2. Finding shared edges between the candidate cylinder and circular faces.
3. Returning the bottom face if found, `None` if through-hole.

**Relevance to AAG:** This is **heuristic, per-feature-type recognition** — not graph-based. Each feature type (hole, counterbore) has hand-coded geometric predicates. No adjacency graph is consulted; faces are tested independently.

---

## 4. Mesh Segmentation — Reverse Engineering Module

**Files:**
- `src/Mod/ReverseEngineering/App/Segmentation.h` / `.cpp`
- `src/Mod/ReverseEngineering/App/RegionGrowing.h` / `.cpp`

### 4.1 `Segmentation`

Point-cloud segmentation using **k-nearest-neighbor normal estimation** followed by region growing:
- Input: `PointKernel` (point cloud)
- Output: `list<vector<int>>` clusters (indices grouped by similar normal)
- Uses PCL (Point Cloud Library) under the hood

### 4.2 `NormalEstimation`

Estimates surface normals for point clouds. Configurable via:
- `kSearch`: number of nearest neighbors
- `searchRadius`: sphere radius for neighbor lookup

**Relevance to AAG:** Operates on point clouds / meshes, not B-Rep. Useful for reverse engineering workflows where you go from scan → mesh → surface patches, but fundamentally different from B-Rep face-adjacency analysis.

---

## 5. 2D Area Analysis — CAM Pocket Toolpathing

**Files:**
- `src/Mod/CAM/libarea/` (C++ library)
- `src/Mod/CAM/App/Area.cpp`

### 5.1 `CArea` / `CCurve`

2D pocket geometry represented as lists of curves with boolean operations (union, intersect, subtract, XOR via Clipper library). Supports:
- Spiral, zigzag, and single-offset pocket toolpath generation
- Nested area detection (islands inside pockets)
- Area computation and containment testing

### 5.2 Voronoi Diagram (`src/Mod/CAM/App/Voronoi.h`)

Boost.Polygon Voronoi implementation used for **adaptive milling** — computes medial-axis-like skeleton of pocket geometry to generate high-speed toolpaths that maintain constant tool engagement.

**Relevance to AAG:** These are 2D projections of 3D features. The Voronoi diagram is topologically related to a medial axis transform, which some AAG-based systems use for feature decomposition, but FreeCAD uses it purely for toolpath optimization.

---

## 6. OpenCASCADE Primitives Used Throughout

All modules above rely on these OCCT building blocks:

| OCCT Component | Purpose |
|---|---|
| `TopExp_Explorer` | Iterate sub-shapes (faces, edges, vertices) with type filter |
| `TopExp::MapShapesAndAncestors()` | Build edge→face or vertex→edge reverse maps |
| `TopTools_IndexedDataMapOfShapeListOfShape` | Bidirectional shape association (the adjacency backbone) |
| `BRep_Tool::Surface()` | Extract geometric surface from topological face |
| `GeomAdaptor_Surface::GetType()` | Classify surface type |
| `ShapeAnalysis_Shell` | Validate shell topology (closed, oriented) |
| `ShapeAnalysis_FreeBounds` | Find free boundary edges |
| `BRepGProp` | Compute geometric properties (area, volume, center of mass) |
| `BRepBndLib` | Bounding box computation |

---

## 7. Gap Analysis: What FreeCAD Has vs. What a Full AAG Requires

| AAG Component | FreeCAD Status | Location |
|---|---|---|
| **Face nodes** | Present — OCCT `TopoDS_Face` | All modules |
| **Edge adjacency links** (face-edge-face) | Present — `edgeToFaceMap` / `faceToEdgeMap` | `ModelRefine` |
| **Surface type attributes on faces** | Present — `GeomAbs_SurfaceType` | `FaceTypeSplitter` |
| **Edge convexity attributes** (convex/concave/smooth) | **Missing** — never computed | — |
| **Dihedral angle computation** | **Missing** | — |
| **Graph as first-class object** | **Missing** — implicit in OCCT maps | — |
| **Feature pattern matching on graph** | **Missing** | — |
| **Feature library** (slot, pocket, step, hole, etc.) | **Partial** — only holes in `Drillable.py` | CAM module |
| **Graph decomposition algorithms** | **Missing** (no cell decomposition, delta-volume, etc.) | — |
| **Hint-based or rule-based feature extraction** | **Missing** | — |

### What would be needed to build a proper AAG:

1. **Edge convexity classification** — For each edge shared by two faces, compute the dihedral angle and classify as convex (< 180°), concave (> 180°), or smooth (= 180°). OCCT provides `BRepAdaptor_Surface` and face normals via `BRepGProp_Face` to do this.

2. **First-class graph structure** — Materialize the implicit adjacency into a standalone graph (e.g., Boost.Graph `adjacency_list`) with face-node properties (surface type, area, normal) and edge properties (convexity, dihedral angle, edge length, edge curve type).

3. **Subgraph pattern matching** — Implement or integrate a subgraph isomorphism algorithm (e.g., VF2 from Boost.Graph) to match feature templates against the AAG.

4. **Feature template library** — Define canonical AAG subgraphs for standard manufacturing features:
   - Through-hole: single concave cylindrical face, two convex circular edges
   - Blind hole: concave cylinder + planar bottom, one convex + one concave circular edge
   - Rectangular pocket: planar bottom + 4 concave planar walls + concave connecting edges
   - Slot: planar bottom + 2 concave planar walls + 2 concave cylindrical blends
   - Step: planar top + 1 concave planar wall

5. **Intersecting feature handling** — Decomposition strategies (delta-volume, cell-based, hint-based) for features that share faces or edges.

---

## 8. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenCASCADE (OCCT)                        │
│  TopoDS_Shape  ·  TopExp  ·  BRep_Tool  ·  GeomAdaptor     │
│  TopTools_IndexedDataMap  ·  ShapeAnalysis                  │
└──────────┬──────────────────────┬───────────────────────────┘
           │                      │
    ┌──────▼──────┐        ┌──────▼──────────┐
    │ Part Module │        │  TechDraw Module │
    │ ModelRefine │        │  EdgeWalker      │
    │             │        │                  │
    │ FaceType    │        │ Boost.Graph      │
    │ Splitter    │        │ adjacency_list   │
    │             │        │                  │
    │ FaceAdja-   │        │ Planar face      │
    │ cencySplit  │        │ traversal        │
    │             │        │ (2D only)        │
    │ FaceEqua-   │        └─────────────────┘
    │ litySplit   │
    │             │        ┌──────────────────┐
    │ FaceUniter  │        │  CAM Module      │
    │ (merge)     │        │                  │
    └─────────────┘        │ Drillable.py     │
                           │ (hole detection) │
                           │                  │
                           │ libarea (2D)     │
                           │ Voronoi (MAT)    │
                           └──────────────────┘

                           ┌──────────────────┐
                           │ ReverseEng Module│
                           │                  │
                           │ Segmentation     │
                           │ (point cloud)    │
                           │                  │
                           │ RegionGrowing    │
                           │ NormalEstimation │
                           └──────────────────┘

         ╔═══════════════════════════════════╗
         ║  NOT PRESENT IN FREECAD:          ║
         ║  • Formal AAG with edge attrs     ║
         ║  • Convexity/concavity labels     ║
         ║  • Subgraph pattern matching      ║
         ║  • Feature template library       ║
         ║  • Graph decomposition            ║
         ╚═══════════════════════════════════╝
```

---

## 9. Key Takeaways

1. **FreeCAD's adjacency infrastructure is solid but unattributed.** The `FaceAdjacencySplitter` in `ModelRefine` builds the exact face-edge-face maps that form the backbone of an AAG. Adding edge convexity attributes would upgrade this to a proper AAG with relatively low effort.

2. **Surface type classification already exists.** `FaceTypeSplitter` provides the node attributes (face type) that an AAG requires. This is production-quality code exercised every time a user runs "Refine Shape."

3. **Feature recognition is ad-hoc and domain-specific.** The CAM module recognizes only drillable holes, using hand-coded geometric predicates rather than graph queries. There is no general-purpose feature recognition framework.

4. **The Boost.Graph integration in TechDraw is the most "graph-aware" code**, but it operates on 2D projected edges, not 3D B-Rep topology.

5. **Building a full AAG on FreeCAD is feasible** because the hard parts (OCCT topology traversal, surface classification, shape ancestry tracking) are already working. The missing pieces are: edge attribute computation, graph materialization, and pattern matching — all well-understood algorithms with available implementations.

---

## References

- Joshi, S. & Chang, T.C. (1988). "Graph-based heuristics for recognition of machined features from a 3D solid model." *Computer-Aided Design*, 20(2), 58-66.
- Vandenbrande, J.H. & Requicha, A.A.G. (1993). "Spatial reasoning for the automatic recognition of machinable features in solid models." *IEEE TPAMI*, 15(12), 1269-1285.
- FreeCAD source: `src/Mod/Part/App/modelRefine.{h,cpp}` — Thomas Anderson, 2011
- FreeCAD source: `src/Mod/TechDraw/App/EdgeWalker.{h,cpp}` — WandererFan, 2016
- FreeCAD source: `src/Mod/CAM/Path/Base/Drillable.py`
- OpenCASCADE Technology documentation: topology exploration and shape analysis
