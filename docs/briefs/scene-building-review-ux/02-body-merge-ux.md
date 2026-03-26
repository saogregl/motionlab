# Agent Task: Body Merge and Grouping UX

## Context

You are working on MotionLab, a multibody dynamics simulation tool. Users import CAD assemblies that arrive as many individual parts. A critical workflow is grouping parts into rigid bodies — for example, selecting 12 parts that make up a chassis and saying "these are all one rigid body."

The codebase already has utilities for combining bodies. Your job is to make the end-to-end user experience seamless, especially for the most common case: selecting multiple parts in the model tree and merging them into a single rigid body.

## Your Task

Design and implement a body merge/grouping workflow that is fast, forgiving, and hard to get wrong.

## What "Merge" Actually Means

When the user merges N parts into one body, the system needs to:

1. **Create a single rigid body entity** that represents the group
2. **Reparent the selected parts** as children of the new body
3. **Aggregate mass properties** — sum masses, compute combined center of mass, combine inertia tensors (parallel axis theorem)
4. **Aggregate collision** — each child part keeps its own collision shape (if any); the body presents them as a compound collider to the solver
5. **Preserve visuals** — each child part keeps its own visual mesh; they render as before, just grouped
6. **Preserve provenance** — the user should be able to see which original parts make up the body

The key principle: merging is a **grouping operation, not a geometric boolean.** We are not fusing meshes or creating a single solid. We are saying "these N things move as one rigid body."

## Scenarios to Support

### Scenario 1: Select parts in model tree → Merge

The most common case. User multi-selects parts in the model tree (Shift+click, Ctrl/Cmd+click), right-clicks → "Make Body" or uses a toolbar action.

Research the codebase to understand:
- Does multi-selection in the model tree already work? If not, implement it.
- What happens when selected parts are at different levels in the hierarchy?
- What happens when some selected parts are already children of another body?

### Scenario 2: Select parts in viewport → Merge

User selects parts visually in the 3D viewport, then triggers "Make Body." This requires:
- Multi-selection in the viewport (click, Shift+click, possibly marquee/box select)
- Mapping viewport picks back to model tree entities
- Same merge operation as Scenario 1

### Scenario 3: Merge bodies that already exist

User has two bodies and wants to combine them into one. This is a merge of bodies, not just loose parts. The system should handle this gracefully — dissolve the child bodies and re-group everything under a new parent.

### Scenario 4: Remove parts from a body

The inverse operation. User selects a part inside a body and says "detach" or "ungroup." The part becomes loose again (or can be moved to another body). The body's mass properties are recomputed.

### Scenario 5: Split a body

User selects some parts within a body and says "split" — creates a new body from the selection, leaving the rest in the original body. Both bodies' mass properties are recomputed.

## UX Requirements

### Naming

When a new body is created from a merge, the system should auto-generate a reasonable name. Research what naming patterns the codebase uses. If the selected parts share a common prefix (e.g., "chassis_frame", "chassis_bracket", "chassis_tab"), use it ("Chassis Body"). Otherwise, use a generic name ("Body 1") and let the user rename.

An inline rename should activate immediately after merge so the user can type a name without an extra click.

### Undo

Merge must be undoable as a single operation. One Ctrl+Z should restore all parts to their previous state. Research the codebase's undo infrastructure and ensure the merge operation is a single undoable transaction.

### Validation and Edge Cases

Think through and handle:
- **Empty selection:** Do nothing, no error.
- **Single part selected:** Still valid — creates a body with one part.
- **Parts from different assemblies:** Valid — the body just groups them.
- **Parts already in a body:** Should they be moved (detached from old body, attached to new)? Or should this be an error? Recommend: move them, and if the old body becomes empty, delete it.
- **Selection includes both bodies and loose parts:** Dissolve the existing bodies and merge everything into one new body.

### Visual Feedback

After merge, the user should immediately see:
- The new body in the model tree with its children
- Some visual indication in the viewport that these parts are grouped (subtle shared highlight, outline, or color tint — research what the codebase supports)
- The inspector showing the new body's properties (aggregated mass, part count)

### Inspector After Merge

The body's inspector should show:
- Name (editable)
- Motion type (dynamic/fixed)
- Part count
- Aggregated mass properties (total mass, combined COM, combined inertia)
- A way to see and manage the child parts (expand in tree, or a list in the inspector)

## Quality Criteria

Evaluate every decision against:

- **Is the common case fast?** Selecting 5 parts and merging should be 3 actions: select, trigger merge, (optionally) rename. Not more.
- **Is it reversible?** Every merge, split, and detach operation must be undoable.
- **Is the hierarchy obvious?** After merging, the user should instantly see the parent-child relationship in the tree. No ambiguity about what's grouped.
- **Does it handle messy input gracefully?** Users will select weird combinations (mix of bodies and parts, parts from different levels). The system should do something reasonable, not error out.
- **Would this feel natural to someone coming from SolidWorks or Fusion 360?** CAD users are used to selecting parts and grouping them. The interaction should feel familiar.

## Codebase Research (Do This First)

Before writing any code:

1. **Find the existing merge/combine utilities** mentioned in the codebase. Understand what they do, what protocol commands they use, and what's missing.
2. **Understand the model tree component** — how entities are displayed, whether multi-selection works, what interactions (right-click, drag) are supported.
3. **Understand the entity hierarchy model** — how parent/child relationships work, how reparenting is handled, whether there are constraints on hierarchy depth.
4. **Understand mass property aggregation** — is there existing code to sum masses and compute combined COM/inertia? If not, this needs to be implemented.
5. **Understand the undo system** — how to make a multi-step operation (create body + reparent N parts + recompute mass) into a single undoable transaction.

Write up your findings before proposing an implementation plan.

## Deliverables

1. A codebase research summary covering the five areas above.
2. A proposed interaction design for all five scenarios, with specific UI decisions (where the action lives, what the user sees, how feedback works).
3. Implementation of Scenarios 1 and 2 (merge from tree and viewport) as the first pass.
4. Implementation of Scenarios 4 and 5 (detach and split) as the second pass.
5. Scenario 3 (merge existing bodies) can be handled as part of Scenario 1 if the implementation naturally supports it.
