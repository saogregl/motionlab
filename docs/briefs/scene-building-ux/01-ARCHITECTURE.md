# MotionLab — Architecture

> **One-liner:** Import CAD as an asset, create bodies and datums, then author simulation behavior through direct viewport interaction.

## Core Design Principle

CAD parts are **not** the simulation model. Bodies are the simulation model. CAD files produce Geometry entities that attach to Bodies. Datums (reference frames on body surfaces) are the connection points for joints, loads, and sensors.

The app should never ask "What is every CAD node?" It should ask "What body do you want to create, and how should it connect to others?"

---

## Architectural Layers

### Layer 1 — Source Layer

Holds imported assets and their provenance. Never mutated by scene authoring.

Contents: CAD imports (STEP/IGES via OCCT/XDE), imported meshes, primitive definitions.

**Key rule:** The original import data is never destroyed. Users can always trace back to the source via `AssetReference` on Geometry entities.

### Layer 2 — Authoring Layer (Scene)

Where users compose the simulation model. This is the primary workspace.

Contents: Six entity types — Bodies, Geometries, Datums, Joints, Loads, Actuators — stored as typed collections. Relationships are expressed through ID references (datums reference parent bodies, joints reference parent/child datums, etc.).

### Layer 3 — Representation Layer

The geometric and physical representations attached to entities.

Contents: Display meshes on Geometries, computed mass properties from CAD solid geometry (via BRepGProp), user-overridden mass on Bodies. Visual, collision, and mass are separable concerns (ADR-0013).

### Layer 4 — Solver Layer

What Chrono actually sees. Derived from Layers 2 + 3 at compile time. The frontend never exposes solver internals to the user.

Contents: Chrono rigid bodies, joints, contacts, motors. The `CompileMechanismCommand` triggers this translation; `CompilationResultEvent` returns diagnostics and output channel descriptors.

---

## Entity Model — Typed Entities with Lightweight Organization

Every object in the scene is one of six **typed entities**. Each type has a well-defined schema, its own proto message, store slice, and inspector. This is not a general-purpose ECS — it is a fixed set of domain types that cover multibody simulation authoring.

### The six entity types

| Type | Purpose | Key relationships |
|------|---------|-------------------|
| **Body** | Physics-participating rigid body | Has mass properties, `is_fixed` flag, owns child geometries and datums |
| **Geometry** | Visual mesh from CAD or future primitives | References parent body via `parent_body_id`, carries `source_asset_ref` and `computed_mass_properties` |
| **Datum** | Reference frame on a body surface | References parent body, optionally created from a geometry face with surface class detection |
| **Joint** | Mechanical constraint between two bodies | References parent and child datums (which implicitly reference their bodies) |
| **Load** | External force/torque or spring-damper | References datum(s) for application point |
| **Actuator** | Motor driving a joint | References target joint |

### Lightweight data organization

While the entities are typed (not free-form components), shared inspector sections and consistent data patterns keep the system organized:

- **Identity** — every entity has `id` and `name`
- **Pose data** — bodies have world pose, datums and geometries have `local_pose` relative to parent body
- **Mass data** — bodies own effective mass properties; geometries carry computed mass from CAD
- **Output channels** — joints, loads, and actuators all produce runtime trace data through the same channel system

Inspector sections that render these common patterns (identity, pose, traces) are shared across entity types.

### Key architectural decisions

- **Body/Geometry separation** (ADR-0013): Bodies own physics; Geometries own visuals. A body can have zero, one, or many geometries. This enables empty bodies, multi-geometry assemblies, and geometry reparenting.
- **Datums are first-class**: Datums are the universal connection mechanism. Joints connect datum-to-datum. Loads attach to datums. Future sensors will mount to datums. Face-aware datum creation (clicking a geometry face) detects surface class (planar, cylindrical, etc.) to recommend appropriate joint types.
- **Mass override**: When `Body.mass_override = false` (default), mass aggregates from attached geometries via parallel axis theorem. When `true`, user-specified values take precedence.

---

## UI Layout

```
┌─────────────────────────────────────────────────────────┐
│                      Top Bar (38px)                      │
│  Project Name | Status | Open/Save/Import                │
├──────────┬───────────────────────────────┬───────────────┤
│          │                               │               │
│  Left    │         3D Viewport           │    Right      │
│  Panel   │    + Floating Toolbars        │    Panel      │
│  (Scene  │    + Tool Mode Overlays       │  (Inspector)  │
│   Tree)  │                               │               │
│          │                               │               │
├──────────┴───────────────────────────────┴───────────────┤
│              Bottom Panel (full width, tabbed)            │
│  [Assets] [Timeline] [Diagnostics]                       │
│  ┌─────────────┬─────────────────────────────────────┐   │
│  │ Asset Tree  │  Asset Grid / Timeline / Diagnostics│   │
│  └─────────────┴─────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  [Build] [Results]          Status Bar                   │
└─────────────────────────────────────────────────────────┘
```

### Left — Scene Tree

The authored entity hierarchy. Bodies with their child geometries and datums. Joints, Loads, and Actuators in their own groups. Entity creation menu, context menus, search/filter.

### Center — 3D Viewport

The primary workspace. Selection, transform gizmos, tool mode interactions (datum creation by face-click, joint creation by datum-pair selection). Context-sensitive overlays for active tools.

### Right — Inspector

Properties of the selected entity. Shows sections relevant to the entity type. Shared section renderers for common patterns (identity, pose, traces). Edits flow through protocol commands to the engine.

### Bottom — Asset Browser + Timeline (full width, tabbed)

A full-width panel at the bottom of the window (spanning under left and right panels), with tabs:

- **Assets tab**: Imported CAD files and (future) primitives. Left side shows a folder/category tree, right side shows asset cards with previews. Drag from here to place new instances in the scene. Search and filter.
- **Timeline tab**: Transport controls (play/pause/step/reset), timeline scrubber, simulation time display. Primary during simulation playback.
- **Diagnostics tab**: Compilation warnings, validation issues, structured diagnostics with severity and suggestions.

The panel collapses to a tab bar when not needed, maximizing viewport space.

---

## The Two Primary Workflows

### Workflow A — CAD-Derived

1. Import a STEP file → engine processes it → bodies and geometries appear in the scene tree and asset browser
2. Select bodies in viewport → create datums on surfaces (face-click)
3. Select datum pairs → create joints (with type recommendations based on surface class)
4. Add loads and actuators as needed
5. Compile and simulate

### Workflow B — Primitive-First (Planned)

1. Add primitives directly (box, cylinder, sphere) from the asset browser
2. Position them, create datums, add joints
3. Run simulation
4. Optionally import CAD later and replace geometry on existing bodies

Both workflows produce the same typed entity structure.

---

## Tech Stack

- **Frontend:** React, TypeScript, Tailwind CSS, Radix primitives, Zustand state management
- **3D Viewport:** React Three Fiber + Three.js (r175), with three-mesh-bvh for accelerated picking
- **Desktop Shell:** Electron (window management, file dialogs, engine supervision)
- **Communication:** WebSocket + binary Protobuf (IXWebSocket on engine side, native WebSocket on renderer). Electron IPC is used only to bootstrap the engine endpoint.
- **CAD Backend:** C++ using Open CASCADE Technology (OCCT/XDE) for STEP/IGES import, integrated in the native engine
- **Physics Backend:** C++ using Project Chrono
- **Protocol:** Protobuf-es generated types from `schemas/` directory. Protocol version 5.

---

## Design Principles

1. **Progressive disclosure.** Don't show collision, mass, or advanced settings until the user asks for them. Start simple, add fidelity as needed.

2. **Datum-centric connections.** Joints, loads, and sensors connect through datums — reference frames placed on body surfaces. This is spatially intuitive and geometrically meaningful.

3. **Body/Geometry independence.** A body's physics properties and its visual geometry are separate concerns. Visual meshes can be replaced without affecting mass. Mass can be overridden without touching geometry.

4. **Never destroy provenance.** Source asset references are preserved on Geometry entities. Users can always trace back to the original CAD file.

5. **User language, not solver language.** "Fixed" not "grounded body." "Collision shape" not "contact geometry." "Motor" not "ChLinkMotorRotation."

6. **Simple over complete.** A clean UI with fewer options that cover 90% of use cases beats a comprehensive UI that overwhelms.

7. **Engine-authoritative.** The native engine is the source of truth for geometry processing, mass computation, simulation, and runtime outputs. The frontend is the authoring and visualization layer.
