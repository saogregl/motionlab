# Quality and UX Evaluation Rubric

## Purpose

Use this rubric to evaluate every design decision and implementation pass. Apply it before proposing, after implementing, and during review. If something fails these checks, fix it before moving on.

---

## The Five Tests

### 1. The Count Test — How many actions does this take?

Count the user actions (clicks, keypresses, selections) required for the most common case of this workflow.

- **Excellent:** 1-3 actions for the common case
- **Acceptable:** 4-5 actions
- **Failing:** 6+ actions, or any required action that feels like busywork

If you're over 3, ask: what is the user doing that the system could infer? Every manual step the user takes should be one the system genuinely can't do for them.

### 2. The Inference Test — Is the system doing its share of the work?

For any input the user provides manually (coordinates, axis directions, joint types, body groupings), ask: could the system have inferred this from context?

- Cylindrical geometry implies an axis — don't ask the user to type it
- Selecting two bodies and clicking between them implies a joint location — don't make them type coordinates
- Selecting parts that share a name prefix implies a group name — don't make them name it from scratch
- A part that's already inside a body implies it should be detached first when re-assigned — don't error out

The best interaction is one where the system proposes and the user confirms or adjusts.

### 3. The Feedback Test — Can the user see what's going to happen?

Before the user commits to an action, they should be able to see the result.

- **Joint creation:** Live preview of the joint frame (axis arrow, point marker) before clicking to confirm
- **Body merge:** Visual highlight of what's about to be grouped before confirming
- **Placement:** Ghost preview showing where the entity will land before dropping

If the user has to commit to an action, wait for the result, and then undo if it's wrong — the feedback is too late.

### 4. The Recovery Test — How easy is it to fix a mistake?

- Every operation should be undoable with one undo action
- The user should never feel trapped — if they merged wrong, they split. If they placed a joint wrong, they move it or delete and redo.
- Error states should be recoverable without starting over

Ask: if the user does this wrong, what's the fastest path back to a good state? If the answer is "start over," the workflow has a problem.

### 5. The Vocabulary Test — Would the user use these words?

Read every label, tooltip, menu item, and status message out loud. Ask: would a mechanical engineer say this?

- "Fixed" — yes. "Grounded body" — no.
- "Make Body" — yes. "Create rigid body entity with aggregated components" — no.
- "This part has no mass assigned" — yes. "MassPropertiesComponent source is unresolved" — no.

If a label needs explanation, it's the wrong label.

---

## Per-Feature Checklist

Before shipping any feature, answer these:

- [ ] What is the action count for the common case? (Target: ≤3)
- [ ] What does the system infer that the user doesn't have to specify?
- [ ] Is there a live preview before commit?
- [ ] Is the operation undoable as a single step?
- [ ] Are all labels in user vocabulary, not system vocabulary?
- [ ] What happens with empty/invalid/weird selection? (Should be graceful, not an error)
- [ ] Does this work identically for CAD-derived and primitive entities?
- [ ] Did I test the workflow end-to-end, not just the happy path?

---

## Red Flags

Stop and redesign if you see any of these:

- **A modal dialog for something that should be inline.** Modals break flow. Use inline prompts, popovers, or inspector sections instead.
- **A wizard with more than one step for a common operation.** Wizards are for rare, complex setup — not for things users do dozens of times per session.
- **An action that requires the user to leave the viewport to complete.** The viewport is the primary workspace. If the user has to switch to a different panel to finish what they started in the viewport, the flow is broken.
- **An error message where a reasonable default would work.** If the user forgot to specify something and there's an obvious default, use the default and let them change it — don't block them.
- **UI that's comprehensive but not prioritized.** Showing 15 options when 3 cover 90% of cases. The 3 should be prominent; the other 12 should be discoverable but not in the way.
