# MotionLab — UX Flows

## Overview

This document describes what the user experiences step by step for each major workflow. It reflects the current implementation where applicable and marks planned features explicitly. Agents should implement these flows using whatever UI patterns best fit the existing codebase and design system.

---

## Flow 1 — CAD Import

### What happens (current)

1. User triggers import (toolbar button, menu, or keyboard shortcut).
2. A native file dialog opens (via Electron). User selects a STEP or IGES file.
3. The engine processes the file via OCCT/XDE — parsing geometry, computing tessellation, extracting solid properties. Progress indication in the status bar.
4. On completion, one Body + one Geometry per STEP part appear in the scene tree and viewport. Mass properties are auto-computed from solid geometry with a default density.
5. The imported asset also appears in the bottom Asset Browser panel for future reference and re-instantiation.

### What happens (planned enhancement)

On import, a lightweight inline choice:
- **Auto-body** (default): Each STEP part gets its own Body + Geometry pair. Current behavior. Fast, familiar.
- **Visual only**: Import as Geometry entities without parent bodies. They appear under a "Loose Geometry" group. User builds bodies later via "Make Body" flow. Better for assemblies that need manual grouping.

### On-demand inspection

Selecting a geometry in the tree or asset browser shows the source file, computed mass properties, face count, and asset reference in the inspector. The original CAD structure is preserved in the asset cache for re-import.

---

## Flow 2 — Placing an Existing Asset (from Asset Browser)

### What happens (planned)

1. User opens the Asset Browser (bottom panel, Assets tab).
2. User drags an asset card into the viewport, or uses "Place in Scene" action.
3. A new Body + Geometry pair is created from the cached asset data, positioned at the drop location.
4. The new entities are selected automatically.

This enables placing multiple instances of the same CAD asset without re-importing.

---

## Flow 3 — Body Authoring

This is the core workflow. Users create bodies, place datums on surfaces, and connect them with joints.

### Create Body

User activates "Create Body" from the scene tree menu or toolbar.

A new empty body appears in the tree. The user can then attach existing loose geometries to it (drag-and-drop in tree, or context menu "Attach to Body"). Mass properties aggregate from attached geometries.

For the common case where bodies are created during import (auto-body mode), this step is automatic.

### Make Body from Selection (planned enhancement)

Select one or more loose geometries in the viewport → activate "Make Body."

A new Body is created and the selected geometries are attached to it via `AttachGeometryCommand`. Mass aggregates automatically. This is the body authoring entry point for the "visual only" import mode.

### Pin (Fix to World)

User selects a body → activates "Pin" (or toggles `is_fixed` in inspector).

The body's `is_fixed` flag is set to true. A visual indicator (pin icon in tree, anchor overlay in viewport) shows that the body is fixed. This sends an `UpdateBodyCommand` to the engine.

### Create Datum

User activates the datum tool (D key or toolbar) → clicks a face on any geometry in the viewport.

The system sends `CreateDatumFromFaceCommand` with the `geometry_id` and `face_index` from the raycast hit. The engine computes the datum pose from the face geometry and returns the surface class (planar, cylindrical, conical, spherical, toroidal, other).

The datum appears as a coordinate frame gizmo at the face location. It is listed under its parent body in the scene tree.

**Alternative:** Datums can also be created manually (right-click body → "Create Datum") with an explicit local pose.

### Create Joint

User activates the joint tool (J key or toolbar) → enters a two-step picking mode:

1. **Pick parent datum:** Click a datum on body A. The datum highlights. Status overlay shows "Click a datum on the second body..."
2. **Pick child datum:** Click a datum on body B. The joint creation panel opens.
3. **Select joint type:** A type picker appears with recommendations based on datum surface classes (e.g., cylindrical datum suggests revolute). User picks a type.
4. **Configure:** Type-specific limits and parameters are editable in the panel. User confirms.

The joint is created via `CreateJointCommand`. It appears in the scene tree under "Joints" with a visual connection indicator in the viewport.

**Smart recommendations:** When both datums have detected surface classes, the system recommends compatible joint types. A cylindrical-to-cylindrical pair defaults to revolute. A planar pair suggests prismatic or planar.

### Create Load

User activates the load tool → picks a datum → selects load type (point force, point torque, spring-damper).

For **point force/torque**: One datum. Direction and magnitude set in the floating creation card.

For **spring-damper**: Two datums (on different bodies). Rest length, stiffness, and damping set in the creation card.

### Create Actuator

User right-clicks a joint → "Add Motor" (or uses the inspector).

An actuator is created targeting that joint. Control mode (position/speed/effort), command value, and effort limit are set in the inspector.

---

## Flow 4 — Primitive-First Modeling (Planned)

### What happens

1. User opens the Asset Browser → selects a primitive (box, cylinder, sphere) from built-in assets.
2. Drag into viewport or click "Add to Scene."
3. A Body + synthetic Geometry appears with the primitive shape. It has a RigidBody, visual mesh, and auto-computed mass.
4. Primitive dimensions are editable in the inspector.
5. User positions primitives, creates datums, adds joints — same workflow as CAD-derived bodies.

### Later: Replace with CAD

Import a STEP file and replace the visual on an existing body:
- Detach the primitive geometry (`DetachGeometryCommand`)
- Attach the CAD geometry (`AttachGeometryCommand`)
- Mass recomputes from the new geometry (unless overridden)

---

## Flow 5 — Mass Properties

### CAD-sourced bodies (default)

Mass, center of mass, and inertia are auto-computed from the attached geometry's solid properties (via BRepGProp) combined with a density value. This happens at import time.

The inspector shows computed values as read-only when `mass_override = false`. A toggle lets the user switch to manual override.

### Manual override

Toggle `mass_override = true` on the body → all mass fields become editable. The user sets mass, center of mass, and inertia tensor directly via `UpdateMassPropertiesCommand`.

### Future: Mesh-sourced bodies

Mesh files cannot provide computed mass (no volumetric data). The user must set mass manually or approximate via a primitive volume + density.

### Visualization

Center of mass can be visualized in the viewport as a marker.

---

## Flow 6 — Pre-Run Validation

### What happens

When the user compiles the mechanism (`CompileMechanismCommand`), the engine performs validation:

- Bodies with unresolved mass
- Joints referencing deleted datums
- Unconstrained dynamic bodies (no joints, no fixed constraint)
- Configuration errors (zero-length spring, motor on incompatible joint type)

Results come back as `CompilationDiagnostic` messages in the `CompilationResultEvent`, each with:
- Severity (warning, error)
- Plain-language message
- Affected entity IDs (for selection/highlight)
- Suggestion text
- Machine-readable code

The Diagnostics tab in the bottom panel shows these. Users can click diagnostics to select the affected entity and see the suggested fix.

---

## Flow 7 — Simulation Playback

### What happens

1. User clicks Play (or Step for single-step).
2. If not already compiled, auto-compile runs first.
3. Body poses stream in via `SimulationFrame` at tick rate. Viewport updates in real time.
4. Output channels (joint coords, load forces, actuator effort) stream via `SimulationTrace` at ~6 batches/second.
5. Timeline scrubber tracks current simulation time. User can pause and scrub to any point in the 60-second ring buffer.
6. Inspector shows live values during simulation (read-only). Entity editing is disabled.
7. Reset returns to the pre-simulation state.

---

## Interaction Philosophy

The overall feel should be:

- **Assembling actors on a stage** — not filling out forms
- **Clicking where things connect** — datums on surfaces, not abstract pickers
- **Progressively increasing fidelity** — start with auto-computed defaults, refine later
- **Direct manipulation** — viewport is primary, tree and inspector support it

The app should feel more like a creative tool (Blender, Unity) than an enterprise admin panel.
