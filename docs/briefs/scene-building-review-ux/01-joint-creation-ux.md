# Agent Task: Joint Creation UX — Viewport Interaction Design

## Context

You are working on MotionLab, a multibody dynamics simulation tool. The core workflow is: import CAD or create primitives → group parts into rigid bodies → connect bodies with joints → simulate.

Joint creation is one of the most frequent and most error-prone operations in multibody simulation. Most competing tools make this painful — either requiring the user to type coordinates manually, or forcing them through multi-step wizards. We want to be significantly better.

## Your Task

Design and implement a joint creation workflow that feels direct, spatial, and fast. The goal is: the user should be able to create a joint between two bodies in 2-3 clicks in the common case, with the system inferring as much as possible from geometry.

## What Most Joints Need

Almost all joints require the same inputs:

- **Two bodies** being connected
- **A point** (the joint location in space)
- **One or two axes** (the joint's degrees of freedom)

That's it. Everything else (limits, motors, damping) is configuration that belongs in the inspector after the joint exists.

## The Core Interaction Idea: Infer from Geometry

The key insight is that CAD geometry already encodes the information needed to define joints. The user shouldn't have to type coordinates — they should click on geometry and the system should extract the right data.

### Geometry → Joint Parameter Mapping

Study the codebase and understand what geometric references are available (faces, edges, datum features, etc.). Then implement inference along these lines:

**Cylindrical face → axis.** When the user clicks a cylindrical surface (a hole, a shaft, a bore), extract the cylinder axis. This is the most common way to define a revolute joint axis.

**Planar face → plane/normal.** When the user clicks a flat face, extract the plane. The plane normal can serve as an axis. Two planar face selections can define a point (plane-plane intersection with an axis, or midplane).

**Circular edge → point + axis.** A circular edge gives both a center point and a normal axis in one click.

**Axis + plane → point.** If the user has already defined an axis (from a cylindrical face), clicking a planar face that intersects that axis gives a point.

**Two planar faces → midplane.** Selecting two parallel planar faces can produce a midplane, useful for centering a joint.

### The Interaction Flow

Research the codebase to understand existing selection, picking, and datum infrastructure. Then design a flow that works roughly like this:

1. User activates the joint tool and selects two bodies (or the tool infers bodies from the geometry they click on)
2. User clicks geometry on or near the joint location
3. System infers point and axis from the geometry clicked
4. Joint is created with a preview showing the inferred frame
5. User can accept (click/Enter) or refine

The system should show a live preview of the inferred joint frame (axis arrow + point marker) as the user hovers and clicks geometry, so they can see what the system is inferring before committing.

### The Fallback: Primitives and Manual Input

For primitives (boxes, cylinders, spheres created without B-Rep face detail, or cases where geometry inference isn't sufficient), the user needs a way to specify joint parameters manually.

Research what inspection panels and input patterns exist in the codebase. The manual input should be:

- Available in the inspector panel once a joint is created (or during creation)
- Position as XYZ coordinates relative to the body frame or world frame (with a toggle)
- Axis as a direction vector, with quick presets for common axes (X, Y, Z, and their negatives)
- Optionally: a viewport gizmo that the user can drag to reposition/reorient the joint frame

The manual path should feel like a refinement tool, not the primary creation method. For the common case (CAD geometry with holes and shafts), clicking geometry should be enough.

## Benchmarks and Inspiration to Research

Before implementing, research how these tools handle joint/constraint creation:

1. **OnShape Mate Connectors** — OnShape lets users create "mate connectors" by clicking geometry (faces, edges, vertices). The system infers a coordinate frame from what's clicked. Then mates reference these connectors. Research how they handle the inference and preview.

2. **SolidWorks Mates** — SolidWorks infers mate types from selected geometry (two cylindrical faces → concentric, planar face to planar face → coincident). The selection-to-inference pipeline is worth studying.

3. **Blender Constraints** — Blender's constraint system is viewport-centric. Constraints are added to objects and configured in a properties panel. The 3D cursor is used as a placement reference. Less geometry-aware than CAD tools but very fast for the manual-input case.

4. **Unity/Unreal Joint Tools** — Game engines use gizmos for joint anchor placement. Simple but effective for the manual case.

Search the web for screenshots, videos, or documentation of these tools' joint/mate creation workflows. Note what works well and what feels clunky. Bring specific ideas back into your implementation.

## Quality Criteria

At every step, evaluate your work against these questions:

- **Is this simpler than it needs to be?** If the user needs 5 clicks where 2 would suffice, simplify.
- **Is the system doing work the user shouldn't have to?** If the user is typing coordinates that the geometry already encodes, add inference.
- **Is the feedback immediate?** The user should see what they're going to get (preview) before they commit.
- **Does the fallback path feel natural?** When inference can't help, the manual input should feel like a natural continuation, not a completely different workflow.
- **Would a mechanical engineer find this intuitive?** The target user thinks in terms of shafts, holes, faces, and axes — not coordinate tuples.

## Deliverables

1. A written assessment of the current codebase capabilities: what selection/picking/datum infrastructure exists, what geometric queries are available, what inspector patterns are in place.

2. A proposed interaction design (before writing code) that covers: the common case (geometry-inferred joint creation), the manual case (primitives or complex orientations), and edge cases (what happens when inference is ambiguous, what happens when the user clicks non-useful geometry).

3. Implementation of the joint creation tool with geometry inference, live preview, and inspector-based refinement.

4. At least 3 specific UX ideas borrowed or adapted from the benchmark tools, with rationale for why they fit MotionLab.
