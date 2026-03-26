# MotionLab — Glossary and Design Language

## Core Concepts

| Term | Definition | Don't say |
|------|-----------|-----------|
| **Asset** | A source resource — an imported CAD file cached by the engine. Referenced by Geometry entities. | "part", "import", "file" |
| **Body** | A physics-participating rigid entity with mass properties and an `is_fixed` flag. Owns geometries and datums. | "part", "solid", "node" |
| **Geometry** | A visual mesh entity attached to a body. Carries display mesh data, source asset reference, and computed mass properties from CAD. | "mesh" (too ambiguous), "shape" |
| **Datum** | A reference frame anchored to a body surface. The universal connection point for joints, loads, and future sensors. Created by face-clicking or manually. | "frame" (too vague), "marker" |
| **Joint** | A mechanical constraint connecting two bodies through their datums. | "link", "constraint" |
| **Load** | An external force, torque, or spring-damper applied at datum(s). | "force" (too narrow) |
| **Actuator** | A motor driving a joint. Product-level concept, not a Chrono class. | "motor" is acceptable in UI |
| **Scene** | The authored simulation model. Contains bodies, geometries, datums, joints, loads, actuators. | "model", "assembly" |
| **Surface class** | The geometric type of the face a datum was created from: planar, cylindrical, conical, spherical, toroidal, other. Used to recommend joint types. | "face type" |

### Asset capability summary

| Asset type | Visual source | Mass source | Collision source |
|-----------|:---:|:---:|:---:|
| CAD (STEP/IGES) | Yes | Yes (computed from solid via BRepGProp) | No (by default; planned) |
| Mesh (OBJ, glTF, STL) | Yes | No | No |
| Primitive (box, cylinder, etc.) | Yes (planned) | Yes (analytical, planned) | Yes (matching shape, planned) |

---

## UI Language

Use these terms in the interface. Avoid engineering/solver jargon.

### Motion types (on Body)

| Label | Meaning |
|-------|---------|
| **Fixed** | Cannot move. Anchored to world. (`is_fixed = true`) |
| **Dynamic** | Moves under forces, contacts, and joints. (`is_fixed = false`) |
| **Kinematic** | Motion prescribed by user or controller. (Planned — not yet in proto) |

### Tools

| Label | Action |
|-------|--------|
| **Create Body** | Create a new empty body (attach geometries to it) |
| **Make Body** (planned) | Group selected loose geometries into a new body |
| **Pin** | Fix body to world (`is_fixed = true`) |
| **Create Datum** | Place a reference frame on a body surface by clicking a face |
| **Create Joint** | Connect two bodies by picking a datum pair + joint type |
| **Create Load** | Apply force/torque at a datum or spring-damper between two datums |
| **Add Motor** | Attach an actuator to a joint |

### Import modes (planned)

| Label | Meaning |
|-------|---------|
| **Auto-body** | Each STEP part creates a Body + Geometry pair (current default) |
| **Visual only** | Import as loose Geometry without parent bodies. User builds bodies later. |

---

## Forbidden Terms in UI

Do not use these in labels, tooltips, or user-facing strings:

| Don't say | Say instead |
|-----------|-------------|
| Node (for scene items) | Body, geometry, datum, joint, load, or actuator |
| Contact geometry | Collision shape |
| Grounded | Fixed |
| Link (for joints) | Joint |
| ChLink, ChBody (Chrono classes) | Joint, body |
| Import wizard | (there isn't one — import is a single action) |
| Inertia properties component | Mass properties |
| Promoted / demoted | Enabled / disabled, or added / removed |
| Suppressed | Hidden or excluded |

---

## The Seven Questions

The UI must help the user answer these questions at a glance for any selected entity:

1. **What is this?** — What entity type? Body, geometry, datum, joint, load, actuator?
2. **What body does it belong to?** — For geometries, datums: which body is the parent?
3. **Is it fixed or dynamic?** — For bodies: what is the motion type?
4. **What connects to what?** — For joints: which bodies (via which datums)? For loads: which datum(s)?
5. **Where did it come from?** — For geometries: what asset? For datums: what face?
6. **What are the mass properties?** — For bodies: computed or overridden? Resolved or unresolved?
7. **What does it output?** — For joints/loads/actuators: what channels are available for plotting?

If a UI element doesn't help answer one of these, question whether it belongs.
