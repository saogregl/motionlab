# MotionLab MVP Plan

## Epic Status

| # | Epic | Status |
|---|------|--------|
| 1 | Desktop Runtime and Engine Supervision (Spike) | Complete |
| 2 | Versioned Protocol and Mechanism IR Foundation | Complete |
| 3 | CAD Import, Derived Properties, and Asset Cache | Complete |
| 4 | Viewport Core, Scene Graph, and Picking | Complete |
| 5 | Datum Authoring and Frame-First Editing | Complete |
| 6 | Assembly Structure, Joint Authoring, and Mechanism Editing | ~70% — Joint CRUD + visualization complete, Save/Load not started |
| 7 | Simulation Compilation and Native Dynamics Runtime | ~75% — Chrono integration + protocol + streaming + frontend controls done, tests/scrubber incomplete |
| 8 | Engineering Outputs, Inspection, and Playback UX | ~40% — Engine-side output channels + ring buffer + trace batching complete, frontend trace/chart wiring not started |
| 9 | MVP Hardening, Packaging, and Product Credibility Pass | Not Started |
| 10 | Face-Level Topology Selection & Geometry-Aware Datum Creation | ~95% — All engine + frontend components implemented, minor gaps (torus type, seam test) |

---

> This document defines the MVP as a set of product epics. These epics are intentionally written as deep specifications rather than task checklists. They describe the purpose, scope, constraints, acceptance criteria, and architectural boundaries of the first shippable product.

---

## 1. Purpose of This Document

This plan exists to translate the product vision into a realistic MVP execution frame.

It does **not** attempt to describe every future capability in the broader concept. Instead, it answers a narrower question:

> What is the smallest product that proves the architecture, validates the workflow, and feels like the first real version of MotionLab?

The MVP must validate four things simultaneously:

1. the desktop runtime architecture is correct
2. the engine-to-frontend protocol is sound
3. the frame-first mechanism authoring model is usable
4. imported CAD + native dynamics can be made to feel modern and interactive

---

## 2. MVP Definition

The MVP is a **desktop-first, offline-capable mechanism workbench** that allows a user to:

1. import CAD bodies
2. inspect physical properties derived from geometry
3. create datum frames on imported bodies
4. define joints between datums
5. assemble a mechanism graph
6. run local kinematic and dynamic simulation through the native engine
7. visualize motion in a modern viewport
8. inspect at least basic engineering outputs such as joint states and reaction channels
9. save and reopen projects without losing authored mechanism structure

This is enough to prove the product’s core claim.

---

## 3. MVP Boundaries

### In scope

* desktop app via Electron
* local native engine process
* STEP/IGES import
* mesh generation for viewport display
* mass, center of mass, and inertia extraction
* body tree / assembly-like project structure
* frame-first datum authoring
* basic joint authoring
* mechanism IR definition and persistence
* native Chrono-backed simulation
* simulation playback in Babylon.js
* basic charts / engineering outputs
* project save/load

### Explicitly out of scope for MVP

* multi-user collaboration
* cloud-first accounts and project syncing
* browser-hosted simulation parity
* advanced materials database workflows
* broad export ecosystem beyond the essentials
* extensive custom CAD authoring
* broad solver abstraction across multiple engines in production
* large robotics workflow surface area
* production ROS2 authoring UX
* plugin marketplace or scripting platform

### Stretch, not baseline

* ROS2 runtime bridge
* remote execution service
* presentation-mode polish beyond reasonable defaults
* advanced section planes and x-ray authoring helpers
* closed-loop authoring UX beyond what is necessary to prove the architecture

---

## 4. Release Philosophy

The MVP must not be a loose demo. It should behave like the first serious internal alpha of a real product.

That means:

* architecture must already reflect long-term invariants
* data contracts must be explicit
* core workflows must be deterministic
* the app must tolerate real project reopening
* the engine boundary must be treated as a production boundary

The MVP does not need maximum breadth. It needs credibility.

---

## 5. Global Architectural Invariants for All Epics

Every epic below inherits these invariants.

### 5.1 Desktop is the primary shipping topology

The first shipped product is a local desktop application. The web/frontend stack may remain shared in architecture, but MVP execution is optimized around desktop correctness.

### 5.2 The native engine is authoritative

All geometry processing, physical property computation, solver compilation, and simulation execution happen in the native engine.

### 5.3 The transport boundary is real

All communication between renderer and engine must use a versioned protocol. Avoid hidden in-process shortcuts that would later break parity.

### 5.4 Hot-path rendering bypasses React

Simulation playback must update Babylon scene state directly.

### 5.5 Imported geometry is the workflow foundation

The MVP revolves around imported CAD assets. Internal body modeling is not a prerequisite.

### 5.6 Every user-authored mechanism element must survive persistence

Bodies, datums, joints, project metadata, and view-relevant identifiers must survive save/load.

---

## 6. Epic 1 — Desktop Runtime and Engine Supervision (Spike)

### Spike-First Approach

Epic 1 is a spike, not a specification. The goal is to validate the Electron + native engine + WebSocket topology through working code before investing in polish. Specifically, the spike must answer:

* How does the renderer discover the engine's WebSocket port? (Electron IPC? Env var? File?)
* How is the startup race handled? (Renderer ready before engine is listening)
* What happens when the engine crashes mid-session? (Detection, reporting, recovery)
* How is the native binary packaged alongside the Electron app? (Platform-specific)
* Does CSP in the Electron renderer allow WebSocket connections to localhost?

Get a binary launching, a WebSocket connecting, and a handshake completing before writing any further architecture docs. These questions have architectural implications that are best resolved through implementation, not documentation.

### Implementation Progress

**Native engine WebSocket server (Prompt 1): Complete.**

The engine now accepts a WebSocket connection, performs a JSON handshake with session token and protocol version validation, and stays alive in a blocking event loop. Implementation details:

* **Library**: `ixwebsocket` (server + client, no Boost dependency, via vcpkg) + `nlohmann-json` for JSON serialization
* **Architecture**: `motionlab-engine-lib` static library (shared between exe and tests), pimpl-based `TransportServer` class in `native/engine/src/transport.cpp`
* **CLI**: `--port <port> --session-token <token>`, validated via `parse_args()`
* **Protocol**: JSON messages matching `schemas/protocol/transport.proto` shapes — `handshake`/`handshakeAck`, `engineStatus`, `ping`/`pong`
* **Single-client**: second connections are rejected with close code 4001
* **Lifecycle**: signal handling (SIGINT + `SetConsoleCtrlHandler` on Windows), structured stdout logging (`[ENGINE] status=<state>`)
* **Tests**: in-process integration tests — valid handshake, wrong token rejection, ping/pong — using ixwebsocket client, passing via `ctest --preset dev -C Debug`

**Electron supervision (Prompt 2): Not started.** Engine spawn, free port allocation, session token generation, IPC for endpoint discovery.

**Frontend WebSocket client (Prompt 3): Not started.** Zustand store, connection lifecycle, engine status UX.

### Objective

Establish a reliable desktop runtime in which Electron launches, supervises, and coordinates a native C++ engine process without becoming the hot-path data relay.

### Why this epic exists

The entire product depends on a stable execution model. Before solving CAD or physics, the application must prove that:

* a desktop container can host the product UX consistently
* a local engine can be spawned and monitored robustly
* the renderer can connect directly to the engine
* the app can run entirely offline

If this foundation is weak, every later system inherits fragility.

### Product outcome

A user launches the desktop app and receives a working engineering shell that:

* starts cleanly
* boots the engine automatically
* reports engine readiness/failure clearly
* can reconnect or surface fatal startup issues gracefully
* exposes a stable project workspace

### Required capabilities

* Electron main process bootstrap
* native engine child process launch
* engine readiness handshake
* session token or equivalent local connection gate
* structured logging and startup diagnostics
* crash/failure state surfaced in the UI
* clean shutdown behavior
* developer mode and packaged mode parity

### Architecture constraints

* Electron is allowed to supervise, not relay simulation frames
* renderer connects directly to engine endpoint
* preload surface must be minimal and secure
* desktop packaging must not assume internet access at runtime

### Done looks like

* launching the desktop app starts the engine automatically
* the renderer can discover and connect to the engine
* engine failures are observable and debuggable
* packaged desktop builds preserve the same runtime model as development

### Risks to watch

* process startup race conditions
* platform-specific executable packaging issues
* brittle assumptions around ports, paths, or asset locations
* accidental dependence on Electron IPC for large payloads

---

## 7. Epic 2 — Versioned Protocol and Mechanism IR Foundation

### Codegen-First Implementation Order

The protobuf codegen pipeline (TypeScript + C++) is the highest-risk task in this epic and must be tackled first. The pipeline is currently unbuilt — tooling choice is deferred, C++ protobuf integration via vcpkg is untested, and cross-platform codegen is notoriously painful to set up.

**Required first task:** Get end-to-end codegen working for one simple message (e.g., `Handshake`) before expanding the schema. This means:

1. Choose and wire the TypeScript protobuf library (protobuf-es or ts-proto)
2. Wire C++ protobuf through vcpkg and CMake
3. Prove round-trip: TS client serializes `Handshake` → C++ engine deserializes it → C++ serializes `HandshakeAck` → TS client deserializes it
4. Only then expand the schema to the full Mechanism IR

Do not expand the proto schemas until the codegen pipeline is proven end-to-end.

### Early Persistence Thinking

This epic must also establish the ID and serialization foundations that persistence (later) depends on:

* Element IDs must be deterministic and stable across save/load (not random UUIDs generated at runtime)
* Asset references must use a strategy that survives project relocation (relative paths or content-addressed)
* The Mechanism IR serialization format must be defined with persistence in mind — even if full save/load ships later, the IR must be round-trippable to disk from day one
* Add a naive JSON or protobuf-binary dump of mechanism state as a smoke test for serialization correctness

### Objective

Define the narrow waist of the entire product: a stable, versioned contract between frontend and engine, plus the core domain schema for authored mechanisms.

### Why this epic exists

Without a durable protocol and domain model, the app will collapse into accidental coupling between UI components and native implementation details.

This epic prevents that by forcing the product to name its fundamental concepts explicitly.

### Product outcome

The product has a coherent language for:

* bodies
* datums
* joints
* mechanisms
* simulation commands
* scene assets
* analysis outputs

The frontend reasons in these terms, and the engine accepts and emits them.

### Required capabilities

* protocol schema source of truth
* transport envelopes for commands, events, and streamed frames
* explicit message versioning strategy
* Mechanism IR schema with stable identifiers
* serialization support in TypeScript and C++
* project model mapping between persisted project data and transport messages

### Must be modeled from the beginning

* body identifiers and authored names
* datum ownership and local transforms
* joint endpoints and types
* authored project metadata
* simulation settings container
* channels for engineering outputs

### Architecture constraints

* the IR must not mirror Chrono internals directly
* scene/render identifiers must be stable across save/load/reopen
* schema evolution must be possible without silent breakage
* geometry references and authored mechanism elements must remain separate concerns

### Done looks like

* frontend and engine can exchange typed messages end-to-end
* a mechanism with bodies, datums, and joints can be serialized and deserialized
* the project file format and runtime protocol align conceptually
* the app can reject incompatible protocol/schema versions intentionally

### Risks to watch

* designing too solver-specific an IR
* conflating imported asset metadata with authored mechanism state
* unstable ID semantics causing renderer/project drift

---

## 8. Epic 3 — CAD Import, Derived Properties, and Asset Cache

### Objective

Enable the engine to import engineering geometry, extract physical properties, generate viewport-ready meshes, and cache all derived assets intelligently.

### Why this epic exists

Imported geometry is the substrate of the whole application. If the import and derivation pipeline is weak, frame creation, joint authoring, simulation setup, and rendering all become unreliable.

### Product outcome

A user can import one or more CAD files and obtain usable rigid bodies with:

* geometry visible in the viewport
* stable body identity
* computed mass properties
* inspectable metadata
* reusable cached derived assets

### Required capabilities

* STEP/IGES ingestion
* validation and import diagnostics
* body and assembly-like structure extraction when possible
* tessellation pipeline for display meshes
* physical property computation
* cache keys for source asset + options + derived representations
* ability to reopen imported projects without full unnecessary recomputation

### Product expectations

Imported bodies should feel like first-class engineering assets, not temporary meshes. The app should expose:

* body names
* source file reference or import provenance
* mass / COM / inertia summary
* visibility and organization hooks

### Architecture constraints

* source CAD, display mesh, and physical properties must remain distinct layers
* renderer receives display assets, not B-Rep internals
* cache invalidation must be explicit when import options or source content change
* the engine remains authoritative for mass and inertia

### Done looks like

* a user can import CAD and see it rendered reliably
* body properties are visible and consistent across reloads
* re-opening a project reuses cached assets when valid
* mesh generation does not block the UI in uncontrolled ways

### Risks to watch

* expensive re-tessellation caused by poor cache boundaries
* unstable mapping between imported assembly structure and body IDs
* weak import diagnostics producing opaque failures

---

## 9. Epic 4 — Viewport Core, Scene Graph, and Picking

### Objective

Create the engineering viewport foundation: stable scene graph ownership, deterministic picking, large-body rendering, and simulation-ready object identity.

### Why this epic exists

The viewport is the product’s main interaction surface. If it does not feel precise and performant, the rest of the architecture will not matter to users.

### Product outcome

The user can:

* orbit, pan, and inspect imported assemblies
* select bodies deterministically
* visually distinguish selection states
* trust object identity in the viewport
* see motion playback without UI stutter

### Required capabilities

* Babylon scene bootstrapping and lifecycle management
* body-to-node identity mapping
* camera presets suitable for engineering work
* deterministic selection/picking path
* viewport state model that does not depend on React frame updates
* selection overlays/highlights that remain legible in engineering scenes
* support for hundreds of visible bodies without collapsing interaction quality

### Engineering standards for this epic

* picking should be ID-driven or equivalent in reliability
* selection feedback must be unambiguous
* view controls should privilege precision over cinematic feel
* simulation transforms must update scene nodes directly

### Architecture constraints

* rendering data ownership must be separate from app UI state ownership
* pick identity must remain stable across style changes
* engineering overlays must not depend on fragile material hacks
* the scene graph should tolerate future authoring tools without re-architecture

### Done looks like

* imported bodies render predictably in a desktop viewport
* picking and selection are stable and easy to reason about
* simulation-ready transforms can be applied without React-induced frame drops
* the scene can scale to realistic MVP assembly sizes

### Risks to watch

* too much coupling between React components and Babylon scene lifecycle
* selection systems tied too tightly to visual materials
* future datum/joint authoring blocked by weak pick metadata

---

## 10. Epic 5 — Datum Authoring and Frame-First Editing

### Objective

Make datum creation on imported bodies a first-class, precise authoring workflow.

### Why this epic exists

This is the signature differentiator of the product. If users cannot create trustworthy frames on real geometry, MotionLab becomes just another mesh viewer with a solver attached.

### Product outcome

A user can select geometry-derived references and create named datum frames anchored to bodies in a way that feels explicit, inspectable, and repeatable.

### Required capabilities

* datum creation tool mode
* geometry-aware picking inputs suitable for frame construction
* local-frame generation from selected references
* datum visualization in the viewport
* inspector editing for datum naming and orientation metadata where allowed
* project-tree representation of datums under bodies or equivalent structure

### UX expectations

Datum creation should feel like engineering intent capture, not low-level transform hacking. The system should make it clear:

* what geometry or reference the datum came from
* which body owns it
* what the resulting local frame is
* whether it is valid for downstream joint creation

### Architecture constraints

* datums are persisted authored entities, not viewport-only markers
* body local-space ownership must be explicit
* future reimport strategies must not silently invalidate datum meaning without surfacing it
* datum visuals must be renderer artifacts derived from persisted model data

### Done looks like

* a user can create, inspect, rename, select, and delete datums
* datums survive save/load correctly
* datums can be referenced reliably by later joint authoring
* the workflow feels precise enough to support real mechanism definition

### Risks to watch

* datum definitions that depend on transient render-only geometry assumptions
* weak local/global frame bookkeeping
* poor visual feedback making frame orientation ambiguous

---

## 11. Epic 6 — Assembly Structure, Joint Authoring, and Mechanism Editing

### Objective

Allow users to convert imported rigid bodies plus authored datums into an actual mechanism graph through joint creation and editable project structure.

### Why this epic exists

Bodies and datums are only preparation. The real product value appears when users can declare mechanical relationships and build a mechanism that the engine can simulate.

### Product outcome

A user can:

* organize bodies
* choose two datums
* create a joint between them
* edit joint properties
* inspect the mechanism graph in project structure and inspectors

### Required capabilities

* body tree / project structure UI
* joint creation flow between datum A and datum B
* support for initial MVP joint types
* property editing for joint limits and essential parameters
* clear graph ownership and identity
* delete/edit/rebind flows for authored mechanism elements

### MVP joint scope

At minimum, support a narrow but meaningful subset such as:

* revolute
* prismatic
* fixed

Additional types can be layered later if architecture remains clean.

### Architecture constraints

* joints reference datums, not arbitrary raw transforms
* authored graph must map cleanly into the Mechanism IR
* UI should not assume tree-only mechanisms if loops are planned later
* mechanism editing must preserve stable IDs for persistence and simulation reconciliation

### Basic Save/Load (pulled forward from former Epic 9)

By the end of this epic, the product must support basic project persistence:

* A project file format (even naive JSON serialization of the Mechanism IR) that captures all authored state: bodies, datums, joints, project metadata
* Save and load through the desktop shell (File > Save / File > Open)
* Stable element IDs that survive round-trip serialization
* Asset references that work after project reopen (relative paths or content-addressed)
* Cache reuse for derived assets (meshes, mass properties) when the source hasn't changed

This does not need to be the final persistence architecture. It needs to be correct enough that Validation Scenario C (save/reopen) works reliably, and that ID and asset reference decisions are validated through real usage before simulation and output epics build on top of them.

### Done looks like

* the user can author a basic jointed mechanism from imported bodies
* the project model expresses bodies, datums, and joints coherently
* edits survive save/load and can be compiled by the engine
* inspectors are sufficient to understand the current mechanism definition
* **the user can save a project, close the app, reopen it, and continue authoring**

### Risks to watch

* joint authoring becoming too coupled to Chrono-specific semantics
* UI structure assuming only simple serial chains
* poor identity management causing broken references on edits
* persistence format locking in assumptions that are expensive to change later

---

## 12. Epic 7 — Simulation Compilation and Native Dynamics Runtime

### Objective

Compile authored mechanisms into a native Chrono-backed runtime and execute local simulation with deterministic playback outputs.

### Why this epic exists

This epic proves that MotionLab is not only a viewer/editor but a functioning simulation product.

### Product outcome

The user can run a simulation on a locally authored mechanism and see bodies move in the viewport under engine control.

### Required capabilities

* mechanism-to-engine compilation pipeline
* Chrono body and joint construction from IR
* simulation lifecycle commands: initialize, play, pause, reset, step
* timebase management
* streamed transform outputs
* basic error handling for invalid mechanisms or failed compilation

### MVP simulation scope

The first version should prioritize:

* basic rigid-body mechanisms
* gravity
* joint motion/state outputs
* enough stability to validate common authored examples

Do not attempt full solver configurability before the basic loop is reliable.

### Architecture constraints

* the frontend initiates simulation intent but does not own solver state
* simulation playback data is streamed, not recomputed in the renderer
* compilation errors must reference authored entities in user-meaningful terms
* hot-path playback must not require React re-renders

### Done looks like

* a user-authored mechanism can be compiled and simulated locally
* the viewport receives motion updates smoothly
* reset/step/play/pause behave coherently
* invalid definitions produce actionable failures rather than silent no-ops

### Risks to watch

* solver failure messages too low-level for product UX
* frame-rate coupling between simulation and rendering
* drift between authored joint semantics and solver configuration

---

## 13. Epic 8 — Engineering Outputs, Inspection, and Playback UX

### Objective

Deliver the first meaningful analysis layer: state inspection, time-series plots, and engineering-facing playback controls.

### Why this epic exists

A simulation product is only valuable if users can inspect what happened, not just watch motion.

### Product outcome

The user can:

* play and scrub simulations
* inspect body/joint state during playback
* view at least a first wave of charts such as joint state or reaction-related output
* correlate simulation time with viewport state

### Required capabilities

* transport channels for sampled outputs
* timeline / playback UI
* chart surface optimized for engineering traces
* selection-linked inspection panels
* basic simulation session metadata and status

### MVP output scope

Choose a minimal but credible set, such as:

* simulation time
* selected joint position/velocity
* selected reaction force/torque channels where available
* compile/runtime diagnostics

### Architecture constraints

* charts must ingest sampled data without contaminating the render hot path
* simulation output channels must be named and typed explicitly
* UI should tolerate long runs without pathological memory behavior

### Done looks like

* a user can run a simulation and inspect trace data meaningfully
* plots are responsive and readable
* selection and playback remain coherent
* the analysis layer feels engineering-oriented rather than decorative

### Risks to watch

* trying to surface too many outputs before the pipeline is stable
* memory growth from naive trace retention
* weak naming/units on analysis channels

---

## 14. Epic 9 — MVP Hardening, Packaging, and Product Credibility Pass

> **Note:** Basic save/load was pulled into Epic 6. This epic combines persistence hardening (from the former standalone persistence epic) with packaging and product polish (from the former Epic 10). The MVP ships 9 epics, not 10.

### Objective

Turn the working vertical slice into a credible first release candidate for internal use, with hardened persistence and reliable packaging.

### Why this epic exists

A product that technically works but is fragile, opaque, or operationally painful is not yet an MVP. This epic closes the gap between prototype and believable tool.

### Persistence Hardening

With basic save/load already working from Epic 6, this epic hardens persistence for production use:

* Missing asset or invalid cache recovery UX
* Cache manifest validation and selective recomputation
* Project file migration strategy for schema evolution
* Broken asset reference recovery paths
* Persisted authored data verified as distinct from regenerable derived data

### Product outcome

The app can be packaged, launched, and exercised repeatedly with confidence. Projects persist reliably.

### Required capabilities

* packaged desktop distribution path
* startup diagnostics and log capture
* graceful engine failure handling
* basic performance instrumentation
* representative sample projects for regression checks
* UX cleanup around core flows
* explicit unsupported-case handling

### Hardening focus areas

* startup and shutdown stability
* import error clarity
* protocol mismatch handling
* save/load edge cases and asset recovery
* large scene responsiveness
* simulation reset and replay reliability

### Architecture constraints

* hardening must reinforce, not bypass, protocol boundaries
* developer-only shortcuts should not become production dependencies
* packaging must preserve the same engine/runtime split used in development
* persisted authored data must remain distinct from regenerable derived data

### Done looks like

* the app can be installed or run in packaged form
* startup, import, authoring, simulation, and save/reopen form a coherent loop
* known limitations are visible rather than hidden
* the product feels like a serious alpha, not a one-off demo
* cache rehydration avoids unnecessary heavy recomputation
* persistence feels trustworthy enough for repeated use

### Risks to watch

* polishing secondary flows before core loops are stable
* packaging-specific breakages discovered too late
* observability gaps that make field failures impossible to diagnose
* brittle path assumptions in packaged desktop builds
* weak migration story for evolving schemas

---

## 16. Recommended Epic Order

The intended sequence is vertical, not purely infrastructural.

1. Desktop Runtime and Engine Supervision **(spike — validate topology)**
2. Versioned Protocol and Mechanism IR Foundation **(codegen pipeline first, then schema expansion)**
3. CAD Import, Derived Properties, and Asset Cache
4. Viewport Core, Scene Graph, and Picking
5. Datum Authoring and Frame-First Editing
6. Assembly Structure, Joint Authoring, and Mechanism Editing **(basic save/load by end of this epic)**
7. Simulation Compilation and Native Dynamics Runtime
8. Engineering Outputs, Inspection, and Playback UX
9. MVP Hardening, Packaging, and Product Credibility Pass

This order is intended to prove the hardest architectural loop as early as possible while still yielding usable vertical slices.

### Key ordering changes from initial plan

* **Epic 1 is a spike.** Get the Electron+engine+WebSocket loop working before writing more architecture docs.
* **Persistence is woven in early.** Epic 2 establishes ID stability and serialization foundations. Basic save/load ships by Epic 6 (not deferred to a separate Epic 9). Full rehydration and cache recovery are part of Epic 9 (now hardening).
* **Former Epic 9 (Persistence) content is distributed.** Core serialization moves to Epic 2, basic save/load to Epic 6, and asset rehydration/recovery to the hardening epic.
* **Doc creation is frozen until Epics 1-3 validate the architecture.** Update existing docs as implementation reveals constraints, but do not create new architecture documents until the first vertical slice proves the documented design.

### Process during Epics 1-4

Lighter change hygiene applies (see AGENTS.md "Pre-MVP" section). Focus on building, not documenting. Batch doc updates at epic boundaries.

---

## 17. MVP Validation Scenarios

The MVP should be judged against a small set of canonical end-to-end scenarios.

### Scenario A — Single-body import and inspection

A user imports a CAD part, sees it in the viewport, and inspects its mass properties.

### Scenario B — Two-body revolute mechanism

A user imports two bodies, creates datums, connects them with a revolute joint, and runs a simple simulation.

### Scenario C — Saved project rehydration

A user saves the mechanism project, closes the app, reopens it, and continues from the same authored state.

### Scenario D — Basic engineering inspection

A user runs simulation playback and inspects joint state and at least one reaction-related trace.

If the product cannot satisfy these scenarios reliably, the MVP is incomplete.

---

## 18. Deferred After MVP

The following are intentionally deferred so the first release stays coherent:

* full cloud collaboration model
* remote simulation orchestration
* generalized multi-backend solver support in production
* advanced closed-loop authoring UX beyond the minimum needed to prove architecture
* robotics-first UX layers
* broad import/export matrix
* broad helper geometry and internal modeling tools
* polished presentation-mode storytelling features

These may matter later, but they should not distort the MVP.

---

## 19. Final Execution Mandate

When decomposing these epics into implementation tasks, preserve the spirit of this plan:

* prefer end-to-end slices over abstract plumbing disconnected from user value
* make architecture decisions that survive beyond the prototype
* keep imported CAD and frame-first authoring at the center of the product
* treat the engine boundary as a production boundary from day one
* keep desktop offline workflows first-class
* avoid letting convenience erase the strict ownership rules established in the README

The MVP succeeds when MotionLab already feels like the beginning of the real product, not a throwaway prototype that must be rewritten to grow up.
