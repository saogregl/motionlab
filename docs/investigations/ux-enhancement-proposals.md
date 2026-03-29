# UX Enhancement Proposals: Simple but Flexible Mechanism Authoring

**Date:** 2026-03-28
**Informed by:** `datum-body-transforms.md`, `transform-consistency-audit.md`
**Design principle:** Every interaction should have a sensible default that works without configuration. Flexibility is revealed progressively, never forced upfront.

---

## The Core Problem

MotionLab is powerful under the hood — the data model, the Chrono backend, the datum-based joint system — but the UX makes the user do too much mental bookkeeping. The user must:

- Guess what coordinate frame a displayed value is in
- Drag a gizmo to position things because there's no numeric input
- Infer the joint axis from a tiny datum triad
- Wonder where their datums went after a Make Body
- Accept that "move body" leaves datums behind (counter-intuitive)

Each of these is a small friction. Together they make the tool feel unpredictable. The fix is not more features — it's making existing capabilities **visible, consistent, and direct**.

---

## Design Principles

1. **Show the frame.** Every pose display says what space it's in. Every selected entity shows its coordinate axes in the viewport.

2. **Type or drag — always both.** If you can drag something in the viewport, you can also type exact values in the inspector. Same data, two input methods.

3. **Degrees, meters, plain language.** No quaternions in the UI. Euler angles in degrees. Positions in meters (or the project unit). Labels like "Position (world)" not "Pose".

4. **Move means move everything.** When you translate a body, its geometries, datums, and joints move with it. This is what every user expects. The rare "pin datum in world space" case is the opt-in, not the default.

5. **Operations preserve work.** Make Body, Split Body, Reparent — none of these should silently delete or orphan datums and joints the user spent time creating.

6. **Progressive disclosure.** The inspector shows what matters first. Advanced properties (damping, friction, inertia tensor) are in collapsible sections that start closed.

---

## Proposals by Workflow

### W1. Positioning Things

**Today:** Drag gizmo only. No numeric input. No snap. No frame indication.

**Proposed — the inspector becomes the precision tool:**

Every entity that has a pose gets an editable **Transform** section at the top of its inspector:

```
Transform (world)                              [local ↕]
  Position   X [  0.000 ] m   Y [  0.150 ] m   Z [  0.000 ] m
  Rotation   X [  0.0   ]°    Y [  0.0   ]°    Z [ 90.0   ]°
```

- **Position:** editable `Vec3Display` with `editable=true` (the prop already exists, unused)
- **Rotation:** editable Euler angles in degrees. The existing `QuatDisplay` already shows Euler by default — add an `onChange` that converts back to quaternion via `eulerDegToQuat`
- **Frame toggle:** a small dropdown in the section header lets the user switch between "world" and "relative to body" views. Default: world for bodies, body-local for geometries/datums. The joint inspector already has this toggle — extend the pattern.
- **Debounce:** 300ms, matching existing mass/load update patterns
- **Gizmo stays:** the viewport gizmo remains for quick visual positioning. It and the inspector show the same live values. Dragging the gizmo updates the inspector numbers; typing in the inspector moves the gizmo.

**Snap (gizmo only):**
- Hold **Shift** during drag → snap to grid increments
- Default: 10mm translation, 15° rotation
- Configurable via a small popover on the gizmo toolbar (no settings page needed — just a dropdown)

**New protocol command needed:**
- `UpdateGeometryPoseCommand` — to reposition a geometry within its body from the inspector

**Scope:** Body, Geometry, Datum inspectors. ~3 components to change, 1 new command.

---

### W2. Moving a Body (and Everything on It)

**Today:** Moving a body co-translates datums to pin them in world space. This is surprising — the body moves but datums stay behind.

**Proposed — default to "move everything together":**

- **Default behavior:** when a body moves (gizmo drag or inspector edit), datums move with it. No co-translation. The datum `localPose` values stay unchanged because they're relative to the body. Three.js already handles this correctly via parent-child hierarchy — the problem is the engine actively fighting it with `co_translate_datums()`.
- **Remove co-translation as default.** The `co_translate_datums()` call in `transport.cpp:999` should be gated behind an explicit flag, not run automatically.
- **Advanced option:** if the user specifically wants to reposition a body while keeping a datum in world space, they can hold a modifier key or use a context menu option ("Reposition body origin"). This is the rare case.

**Impact:** Simpler code (remove default co-translation path), more intuitive behavior. Joints automatically follow because they reference datums by ID.

---

### W3. Make Body

**Today:** Moves body origin to centroid, doesn't re-parent datums (they get orphaned or deleted).

**Proposed — preserve everything, minimize surprise:**

- **Keep first body's origin** as the compound body's origin (not the centroid). The user selected these parts for a reason — the first one's origin is the natural anchor. Geometry world positions don't change; only their `localPose` values are recomputed relative to the kept origin.
- **Re-parent all datums** from source bodies to the compound body. Recompute datum `localPose` values to preserve their world positions (same math as geometry re-parenting). Include updated datums in the `MakeCompoundBodySuccess` response.
- **Re-attach joints** that referenced re-parented datums. Since joints reference datums by ID and datums survive, joints should just work. Validate this in the handler.
- **No silent deletion.** If something can't be preserved, warn the user before proceeding — not after.

**Impact:** Make Body becomes a safe, predictable grouping operation. Users don't lose work.

---

### W4. Understanding What You're Looking At

**Today:** Only datums show coordinate frames. Bodies have no visible axes. Joint axis is invisible. No world origin marker. Frame labels are inconsistent.

**Proposed — show frames contextually:**

| When | Show |
|------|------|
| Always | World origin triad (small, subtle, at 0,0,0) |
| Always | Grid (already exists) |
| Body selected | Body origin triad (XYZ axes at body position) |
| Datum selected | Datum triad (already exists) + parent body triad (dimmed) |
| Joint selected | Joint axis as a dashed line through the joint + parent/child triads (already exists) |
| Geometry selected | Geometry local frame triad (at geometry origin within body) |

The joint axis visualization is the most important addition. When you select a revolute joint, a clear dashed line shows "this is the axis of rotation." No mental math from quaternion triads needed.

**Frame labels everywhere:**
- Inspector section headers always include the frame: "Position (world)", "Position (body-local)"
- Rename "Local Pose" → "Transform" throughout — more natural for engineers
- Detached geometry correctly labeled "(world)" instead of the misleading "(local)"

---

### W5. Joint Creation and Configuration

**Today:** Joint axis is the Z-axis of the datum quaternion but never shown. Datum orientation set via 6 axis-aligned presets only. No per-joint damping/friction/velocity limits.

**Proposed — keep datum-based creation, make the axis visible and editable:**

The datum-based joint creation flow is actually good — click two surfaces, pick a type. The problem is post-creation inspection and adjustment.

- **Show the axis.** When a joint is selected, render its rotation/translation axis as a visible line in the viewport. Label it. This turns the implicit "datum Z-axis" into something the user can see and verify.
- **Euler rotation for datums.** The 6 axis-preset buttons are a good shortcut, but keep them AND add the full Euler rotation fields (from W1). This way users can set any arbitrary axis, not just the 6 cardinal directions.
- **Joint dynamics in a collapsible "Advanced" section:**

```
Limits
  ☑ Enable    Lower [ -3.14 ] rad    Upper [ 3.14 ] rad

Dynamics                                    [collapsed by default]
  Damping     [  0.00 ] N·m·s/rad
  Friction    [  0.00 ] N·m
  Vel. Limit  [  0.00 ] rad/s
```

These appear **only when relevant** (revolute/prismatic/cylindrical). Fixed and spherical joints don't show them. The section starts collapsed — simple by default, advanced on demand.

---

### W6. Inspecting Properties — Progressive Disclosure

**Today:** Inspectors show everything at once. Mass override, inertia tensors, collision config ��� all visible immediately.

**Proposed — tier the information:**

**Always visible (top of inspector):**
- Name (editable)
- Transform section (W1)
- Type-specific identity (joint type + DOF, body motion type, geometry source)

**Visible but collapsible (start open):**
- Joint limits
- Collision shape
- Mass (with computed/override toggle)

**Collapsible (start closed):**
- Inertia tensor
- Joint dynamics (damping, friction, velocity limit)
- Center of mass offset
- Collision offset
- Coordinate frames display (joint inspector's local/world view)

**Sim-only sections (appear during simulation):**
- Current pose (body)
- Reaction forces/torques (joint)
- Applied loads (load)
- Actuator actual position/velocity

This keeps the inspector short for common tasks and deep for investigation.

---

### W7. Collision Configuration

**Today:** Per-geometry collision shapes with auto-fit. Good foundation, but no visualization and no rotation offset.

**Proposed — visible and complete:**

- **Collision wireframe overlay** (toggleable, like datum visibility): when enabled, render collision shapes as translucent wireframes over the visual geometry. Users can instantly see if the collision shape matches their intent. This is critical — you can't debug what you can't see.
- **Auto-fit stays as default.** When the user picks a collision shape type, auto-fit runs immediately. If they need to tweak, the dimension fields are right there.
- **Add rotation to CollisionConfig.** A `Pose offset` instead of just `Vec3 offset` — position + rotation. UI: optional, collapsed "Offset" section in the collision panel. For most users, auto-fit + position offset is enough. Rotation offset is there when needed.

---

### W8. Mass & Inertial Properties

**Today:** Auto-computed from CAD geometry with manual override. No COM visualization. No inertia frame rotation.

**Proposed — trust the automation, visualize the result:**

- **Keep auto-compute as default.** The BRepGProp pipeline + parallel axis theorem aggregation is solid. Most users should never touch mass properties manually.
- **COM indicator in viewport** (toggleable): a small cross-hair or sphere at the body's center of mass. Visible when the body is selected. This lets users verify the auto-computed COM is where they expect.
- **Override UX stays.** The toggle between "Computed" and "Manual" is a good pattern. Keep it.
- **Inertia frame rotation** via `ChBodyAuxRef`: once the engine switches to `ChBodyAuxRef`, the body reference frame and COM naturally decouple. This matches URDF's model and solves the "import origin shifts to COM" issue. No new UI needed beyond the existing COM offset field — the decoupling is structural.

---

## Implementation Priority

Ordered by user impact per engineering effort:

| # | Proposal | Effort | Impact | Notes |
|---|----------|--------|--------|-------|
| 1 | **W2: Move body moves everything** | Small | High | Remove co-translation default. Less code, not more. |
| 2 | **W1: Editable transform in inspectors** | Medium | High | Enable `Vec3Display.editable`, add `QuatDisplay.onChange`, add frame labels. Most of the UI components exist. |
| 3 | **W3: Make Body preserves datums** | Medium | High | Add datum re-parenting to `make_compound_body`. Protocol change for response message. |
| 4 | **W4: Frame visualization** | Medium | Medium | Body triad on selection. Joint axis line. World origin triad. |
| 5 | **W6: Progressive disclosure** | Small | Medium | Collapse sections, reorder inspector. Pure frontend, no backend. |
| 6 | **W5: Joint dynamics** | Medium | Medium | Depends on P5a (ChLinkLock switch). Proto + UI + engine. |
| 7 | **W7: Collision wireframe** | Medium | Medium | New viewport overlay. Purely additive. |
| 8 | **W8: COM visualization + ChBodyAuxRef** | Large | Medium | Engine refactor (ChBody → ChBodyAuxRef). Viewport overlay. |

---

## What NOT to Build

- **Custom coordinate system per entity** — overkill. World and body-local cover 99% of cases.
- **Undo/redo for individual property edits** — desirable eventually, but don't block UX improvements on it.
- **Real-time collaborative editing** — irrelevant for desktop-first.
- **Visual scripting for joint dynamics** — Euler angle input + numeric fields are sufficient. No node graphs.
- **Detachable/floating inspector panels** — the right panel is fine. Don't add layout complexity.

---

## The "Simple but Flexible" Test

For every feature, ask:

1. **Can the user do nothing and get a reasonable result?** (auto-fit collision, auto-compute mass, datums move with body)
2. **When they need precision, is it one click away?** (type exact coordinates in inspector, expand advanced section for dynamics)
3. **Can they verify what they did?** (frame triads, collision wireframes, joint axis line, COM marker)
4. **Did we avoid surprising them?** (Make Body keeps datums, move means move, frame labels are explicit)

If all four are yes, the feature is ready.
