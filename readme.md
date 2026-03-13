# MotionLab

> A modern, offline-capable multibody dynamics workbench for mechanical engineers.

MotionLab is a hybrid desktop/web engineering application for authoring, inspecting, and simulating mechanical systems. It combines a high-velocity React/Babylon user experience with a native C++ engine for CAD processing, mass-property extraction, and multibody dynamics.

The product exists to make professional-grade mechanism analysis feel accessible, modern, and fast. It is not a general CAD modeler. It is an **assembler, analyzer, and simulator** for imported geometry and engineer-defined mechanisms.

---

## 1. Product Vision

### The problem

Mechanical dynamics tools are split into two unsatisfying camps:

* legacy commercial software with strong solvers but weak UX, high cost, and dated interaction models
* open-source simulation stacks with strong engines but poor engineer-facing authoring workflows

There is a gap for a product that feels like a modern engineering workbench: visual, interactive, precise, offline-capable, and built for how engineers actually define mechanisms.

### The opportunity

MotionLab aims to become the modern front-end for engineering-grade mechanism authoring and simulation:

* import production CAD
* derive mass and inertia from real geometry
* define datums and joints precisely
* simulate with a robust native solver
* inspect reactions, motion, and constraints in a modern viewport
* run both locally and remotely with the same core protocol

### The product promise

A user should be able to:

1. import CAD assemblies or parts
2. create precise datum frames on meaningful geometry
3. define joints as relationships between frames
4. run kinematic and dynamic simulations
5. inspect reactions, motion histories, and assembly behavior
6. do all of the above on a local machine without a network connection

---

## 2. Product Identity

### What MotionLab is

MotionLab is:

* a mechanism authoring environment
* a multibody dynamics front-end
* a CAD-derived mass property and mesh pipeline
* a desktop-first engineering application with a shared web-capable frontend
* a platform built around a transport-agnostic Mechanism IR

### What MotionLab is not

MotionLab is not:

* a full parametric CAD modeler
* a mesh sculpting tool
* a game engine editor
* a browser-only toy physics demo
* a solver-locked UI married permanently to one backend implementation

### The core mental model

The application is based on the idea that engineers should define mechanisms through **frames, bodies, and constraints**, not by dragging ad hoc pivots onto triangles.

The primary authoring primitives are:

* **Bodies** — rigid parts with geometry, mass, center of mass, and inertia
* **Datums** — local coordinate frames anchored to bodies
* **Joints** — typed relationships between two datums
* **Mechanisms** — systems of rigid bodies and constraints compiled into a solver model

---

## 3. UX Philosophy

### Frame-first authoring

All joints are defined between explicit datum frames. Users do not attach motion constraints to arbitrary mesh vertices or screen-space handles. Datums are created on meaningful CAD features such as planar faces, cylindrical axes, edges, and user-defined reference geometry.

### Engineering-grade interaction

The viewport must prioritize precise picking, stable camera behavior, unambiguous transforms, feature-aware selection, and deterministic engineering overlays over purely cinematic presentation.

### Dual-mode rendering

The rendering system supports two distinct usage modes:

* **Engineering Mode** for authoring and inspection

  * shaded solids
  * crisp silhouette and feature edges
  * x-ray / ghosting
  * section planes
  * ID-based picking
  * measurement-friendly visuals
* **Presentation Mode** for communication and demos

  * PBR materials
  * shadows
  * environment lighting
  * stakeholder-friendly visuals

### Fast where it matters

React is used for product UX, not for frame-by-frame simulation playback. High-frequency data flows directly into the renderer. Low-frequency application state remains in structured stores.

### Solo-dev realism

The product architecture must be ambitious in capability but ruthless in scope. Every architectural choice must preserve the ability for a single developer to ship a credible prototype without building an entire CAD suite, distributed platform, or native desktop UI stack from scratch.

---

## 4. North-Star Principles

These principles are non-negotiable.

### 4.1 The native engine is the product core

The C++ engine owns:

* CAD import
* B-Rep processing
* tessellation
* mass property extraction
* collision and simulation mesh preparation
* Mechanism IR compilation into solver objects
* simulation stepping
* solver diagnostics
* optional robotics and automation bridges

The frontend does not reimplement this logic in TypeScript.

### 4.2 The renderer is not the source of truth

Babylon.js renders scene state. It does not define authoritative mechanism state, mass properties, topology, or solver semantics.

### 4.3 React never owns the hot path

React must never be responsible for 60–120 Hz simulation transforms, dense mesh buffers, or high-frequency solver playback. The hot path bypasses React and updates Babylon scene objects imperatively.

### 4.4 The Mechanism IR is the stable contract

The frontend talks to the engine through a versioned, explicit, backend-agnostic mechanism schema. The UI is built around this schema, not around Project Chrono implementation details.

### 4.5 Desktop and cloud share one protocol

Desktop and remote execution should use the same conceptual message contract. The only difference should be transport endpoint and deployment topology, not product semantics.

### 4.6 The product is an assembler/analyzer, not a CAD modeler

For MVP, geometry is imported. MotionLab may support limited helper geometry later, but it must not drift into full-featured CAD authoring.

### 4.7 Imported geometry and solver state are different assets

A body has multiple representations:

* B-Rep / source CAD representation
* display mesh
* simplified collision or solver representation
* physical properties

These representations must be modeled explicitly and cached independently.

### 4.8 Performance is designed, not hoped for

Caching, binary transport, coarse/fine geometry separation, and strict state ownership are baseline architectural requirements, not later optimizations.

---

## 5. System Overview

MotionLab is built as a split system:

* a **frontend** responsible for editing, visualization, and product UX
* a **native engine** responsible for geometry, physics, and computation
* an optional **platform backend** for cloud storage, remote jobs, collaboration, and account services

### High-level topology

```text
┌──────────────────────────────────────────────────────────────┐
│ Frontend (React + Babylon.js)                               │
│ - viewport                                                   │
│ - inspectors                                                 │
│ - timeline                                                   │
│ - charts                                                     │
│ - project UX                                                 │
└───────────────┬──────────────────────────────────────────────┘
                │
                │ versioned protocol
                │ Protobuf + binary payloads
                │
        ┌───────▼──────────────────────────┐
        │ Native Engine (C++ / local or    │
        │ remote worker)                   │
        │ - OCCT                           │
        │ - Project Chrono                 │
        │ - asset cache                    │
        │ - simulation runtime             │
        └───────┬──────────────────────────┘
                │
                │ optional integrations
                │
        ┌───────▼──────────────────────────┐
        │ Platform Services                │
        │ - auth                           │
        │ - projects                       │
        │ - job queue                      │
        │ - remote execution               │
        └──────────────────────────────────┘
```

### Desktop topology

```text
┌──────────────────────────────────────────────────────────────┐
│ Electron                                                     │
│ - window lifecycle                                           │
│ - file dialogs                                               │
│ - process supervision                                        │
│ - desktop packaging                                          │
└───────────────┬──────────────────────────────────────────────┘
                │ spawn + supervise
                │
┌───────────────▼────────────────────────────┐
│ Native Engine Process                      │
│ - local C++ executable                     │
│ - listens on loopback endpoint             │
│ - session token handshake                  │
└───────────────┬────────────────────────────┘
                │ direct connection
                │ WebSocket + Protobuf
┌───────────────▼────────────────────────────┐
│ Renderer                                   │
│ - React + Babylon                          │
│ - direct hot-path streaming                │
└────────────────────────────────────────────┘
```

---

## 6. Chosen Technology Direction

### Frontend

* **React 19 + TypeScript + Vite**
* **Babylon.js** for viewport and scene systems
* **Zustand** for structured UI state
* **uPlot** for highly performant engineering charts
* headless, composable UI primitives for a fast desktop-like interface

### Native engine

* **Modern C++20**
* **OpenCASCADE** for CAD import, B-Rep interrogation, tessellation, and physical properties
* **Project Chrono** for multibody dynamics and constraint handling
* optional **ROS2** integration through native engine modules

### Desktop runtime

* **Electron** as shell and lifecycle manager

Electron is used as a stable desktop container and process orchestrator. It is **not** the primary hot-path transport between simulation and rendering.

### Transport

* **Direct renderer-to-engine WebSocket communication**
* **Protobuf** for command and state messages
* raw binary payloads or chunked payloads for large mesh data where appropriate

### Build and workspace

* **pnpm workspaces**
* **Turborepo** or equivalent monorepo orchestration
* **CMake + Ninja + Presets** for native builds
* **vcpkg manifest mode** for reproducible native dependencies

---

## 7. Strict Architectural Rules

The following rules are binding. Future work must preserve them unless explicitly re-architected and documented.

### Rule 1 — One product, two execution topologies

The same frontend and Mechanism IR must support:

* local desktop execution
* remote/cloud execution

Deployment topology may differ. Product semantics may not.

### Rule 2 — Electron is a shell, not a solver bus

Electron main process may:

* launch and supervise the engine
* expose desktop integrations
* pass connection metadata to the renderer

Electron main process may not become the high-frequency relay for transforms, mesh streams, or simulation playback.

### Rule 3 — The renderer connects directly to the engine

The Babylon renderer must receive simulation and scene data directly from the engine endpoint. Avoid redundant message relays.

### Rule 4 — Keep React off the simulation hot path

Simulation playback updates Babylon objects imperatively. React state stores handle:

* tool state
* active selection
* inspector values
* project structure
* low-frequency status

### Rule 5 — The engine owns geometry truth

The engine is authoritative for:

* tessellation results
* mass properties
* body frames
* collision representations
* solver body definitions

The frontend may cache and render this data but must not silently invent or reinterpret it.

### Rule 6 — No runtime dependency on live internet for desktop core workflows

Desktop import, authoring, and simulation must work fully offline.

### Rule 7 — Every body has layered representations

At minimum, bodies must support distinct references to:

* source asset
* display mesh
* physical properties
* simulation/collision form
* authored datums and metadata

### Rule 8 — Incremental invalidation only

The engine must avoid full recomputation when not required. Changes should invalidate only the affected layers:

* project metadata
* display mesh
* physical properties
* collision mesh
* solver model
* simulation state

### Rule 9 — Mechanism IR is explicit and versioned

The protocol between frontend and engine must be versioned and evolvable. Breaking changes must be deliberate and migrated.

### Rule 10 — Precision beats convenience

For engineering interactions, feature-aware picking, stable frame definitions, and deterministic transformations take precedence over casual freeform editing.

---

## 8. Core Domain Model

### Bodies

Rigid mechanical parts with:

* identifier
* name
* source geometry reference
* pose
* visibility/suppression state
* display representation
* physical properties
* optional simulation flags

### Datums

Named local frames attached to a body or body feature, defined by:

* parent body
* local pose
* semantic origin
* optional feature association

Datums are first-class entities, not temporary gizmos.

### Joints

Typed relations between two datums, including:

* revolute
* prismatic
* fixed
* spherical
* future extensible types

A joint references parent and child datums and may define:

* motion limits
* actuation properties
* damping/friction parameters
* closure/loop semantics

### Mechanism

A compiled graph of bodies, datums, and joints suitable for:

* kinematic evaluation
* dynamic simulation
* diagnostics
* export

---

## 9. Mechanism IR

The Mechanism IR is the product’s long-lived abstraction layer.

### Why it exists

It isolates product authoring semantics from any one solver backend. The UI should reason in terms of:

* bodies
* frames
* joints
* constraints
* actuator targets
* analysis requests

not in terms of raw Chrono classes.

### What it must support

The IR must be capable of describing:

* rigid bodies with mass/inertia
* datum frames
* tree and closed-loop joint graphs
* actuator definitions
* joint limits
* simulation options
* playback requests
* analysis channels and outputs

### What it must not become

The IR must not become a leaky serialization of internal C++ classes. It is a product-level contract, not a dump of solver implementation details.

---

## 10. Geometry and Asset Pipeline

### Input formats

Initial focus:

* STEP
* IGES

### Engine responsibilities

For imported geometry, the engine must be able to:

* import and validate CAD assets
* build or preserve assembly structure when available
* compute volume, center of mass, and inertia tensor
* generate display meshes
* generate simplified solver/collision meshes if needed
* cache generated representations for reuse

### Caching philosophy

Tessellation and CAD interrogation are expensive. The engine should cache by:

* source asset identity
* import options
* tessellation quality
* derived representation type

### Scope boundary

MVP does not include a general parametric modeler. Any future support for helper geometry must remain narrow and purposeful.

---

## 11. Rendering Architecture

### Rendering goals

The viewport must support:

* large imported assemblies
* smooth camera interaction
* robust object selection
* feature-aware authoring workflows
* simulation playback
* engineering overlays

### Rendering principles

* static mesh data uploads once whenever possible
* simulation updates stream transforms, not full geometry
* picking must be deterministic and decoupled from visual styling
* overlays and engineering affordances are first-class features, not afterthoughts

### Scene responsibilities

Babylon is responsible for:

* scene graph
* materials
* camera and controls
* overlays
* picking integration
* playback transforms

Babylon is not responsible for:

* mass property calculation
* solver construction
* joint semantics
* B-Rep feature reasoning beyond data supplied by the engine

---

## 12. Performance Model

Performance must be intentional from day one.

### Hot path

High-frequency data includes:

* body transforms
* joint positions/velocities
* playback time
* transient status

This data should flow directly into rendering and chart ingestion, bypassing React-driven re-render loops.

### Cold path

Low-frequency or heavy operations include:

* file import
* tessellation
* recompute of mass properties
* assembly tree changes
* mechanism compilation
* loading/saving projects

These may flow through application state and explicit jobs.

### Required optimizations

* mesh caching
* layered body representations
* binary transport for large payloads
* minimal invalidation on edit
* stable ID mapping between engine and renderer

### Anti-patterns to avoid

* re-sending mesh payloads for simulation playback
* storing render-frame transforms in React state
* tying pickability to visible material state
* rebuilding the entire solver or scene graph for localized edits

---

## 13. Desktop-First Offline Strategy

The first credible product must feel excellent as a local desktop workbench.

### Why desktop first

* offline use is essential for real engineering workflows
* local CAD import and simulation reduce latency and infrastructure cost
* native dependencies such as OCCT and Chrono are better served by a native engine
* a stable desktop runtime allows better control of rendering behavior and packaging

### Why Electron

Electron provides:

* a consistent Chromium-based rendering runtime
* robust process management for a local engine
* strong developer productivity for a complex engineering UI
* easier parity across platforms than system-webview-based alternatives

### Desktop responsibility split

**Electron** handles:

* windowing
* lifecycle
* startup orchestration
* desktop integrations

**Native engine** handles:

* computation
* CAD
* physics
* local services

**Renderer** handles:

* UX
* viewport
* playback
* charts

---

## 14. Cloud and Platform Direction

Cloud support is part of the long-term vision, but it must not dilute the MVP.

### Cloud should add

* account-based project storage
* remote compute
* sharing and collaboration
* managed job execution
* centralized asset pipelines

### Cloud must not require

* different authoring semantics
* a different mechanism model
* a separate frontend architecture
* abandonment of offline desktop workflows

Desktop remains a first-class product, not a degraded cache of a cloud-only platform.

---

## 15. Quality Bar

### Technical quality bar

The product must be:

* deterministic in core authoring flows
* explicit in data ownership
* inspectable in failures
* cache-aware
* testable at protocol and engine boundaries
* resilient to large payloads and long-running simulation sessions

### UX quality bar

The product must feel:

* precise
* calm
* modern
* visually legible
* engineering-oriented rather than game-editor-oriented

### MVP quality bar

The MVP is successful if a user can:

1. import CAD
2. inspect bodies and properties
3. create datums
4. define joints
5. build a basic mechanism
6. simulate it locally
7. inspect motion and reactions
8. save and reopen the project

---

## 16. Non-Goals for MVP

These are explicitly out of scope unless promoted by a deliberate decision:

* full CAD modeling
* mesh editing or repair suite
* multi-user live collaboration
* cloud-first dependency for local workflows
* broad plugin marketplace
* large-scale materials database productization
* broad FEA stack
* photoreal renderer ambitions beyond reasonable presentation quality

---

## 17. Suggested Monorepo Shape

```text
apps/
  desktop/            # Electron shell
  web/                # Browser build of the frontend

packages/
  frontend/           # React app shell and product modules
  viewport/           # Babylon scene, picking, overlays, playback
  protocol/           # Protobuf schema, TS bindings, versioning helpers
  ui/                 # design system and reusable UI primitives
  charts/             # engineering plotting wrappers
  project-model/      # client-side project/domain helpers

native/
  engine/             # C++ executable
  cad/                # OCCT-facing modules
  dynamics/           # Chrono-facing modules
  io/                 # protocol server, file import, persistence helpers
  integrations/       # ROS2 and future bridges

schemas/
  mechanism/          # Mechanism IR source schemas
  protocol/           # transport message definitions

docs/
  architecture/
  decisions/
  specs/
```

This structure is directional, not mandatory. The invariant is separation of concerns, not exact folder names.

---

## 18. Development Philosophy

### Build the narrow waist first

The narrow waist of the system is:

* the Mechanism IR
* the protocol contract
* the engine/runtime boundary

If that waist is stable, UI and engine capabilities can evolve without turning into a tangled monolith.

### Solve the hard engineering loops early

The architecture must prove these early:

* CAD import to rendered body
* stable ID mapping from engine to viewport
* datum creation from imported geometry
* joint definition between datums
* simulation playback from native engine to viewport

### Prefer vertical slices over horizontal abstraction sprawl

A thin, end-to-end slice that imports a body, creates datums, defines a revolute joint, and simulates motion is more valuable than broad infrastructure with no working mechanism loop.

### Be aggressive about deferring elegance that does not unlock capability

The MVP should feel production-minded, but the team size is effectively one. The design must stay principled without requiring enterprise-scale infrastructure before core value is proven.

---

## 19. Long-Term Direction

Over time, MotionLab may expand into:

* remote execution and managed compute
* robotics workflows and ROS2 bridges
* richer solver backends via the IR abstraction
* advanced engineering overlays and diagnostics
* improved authoring assistance and automation
* broader import/export capabilities

But the north star remains unchanged:

> **MotionLab is the modern mechanism authoring and simulation workbench for mechanical engineers — precise, offline-capable, visually strong, and architected around a native engineering core.**

---

## 20. Final Development Mandate

When making architectural decisions, preserve the following truths:

1. the native engine is the computational authority
2. the frontend is the authoring and visualization surface
3. Electron is a shell, not the hot-path simulation bus
4. React is not the frame loop
5. the Mechanism IR is the durable product contract
6. imported geometry is the core scope for MVP
7. offline desktop is a first-class mode, not an afterthought
8. performance, cacheability, and deterministic interaction are product requirements

Any work that violates these principles must be treated as a deliberate architectural change, documented before it is merged.
