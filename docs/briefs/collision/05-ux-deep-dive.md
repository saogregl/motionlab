# Collision & Terrain — UX Deep Dive

> Cross-cutting UX brief for the collision (C1–C4) and terrain (T1–T2) epics.
> Read after the technical briefs. Where they describe *what* to build, this
> describes *what makes the difference between users adopting it and users
> avoiding it*.

---

## Why a separate UX pass

Collision authoring is the kind of feature that quietly breaks even when every
technical box is ticked. The proto compiles, the engine runs, the inspector shows
fields — and users still leave collision off because they can't see what it's
doing, can't tell whether their proxies are reasonable, and can't predict what
will happen when they hit Play.

Soil simulation amplifies the same problem. The numeric inputs are intimidating,
the simulation cost is real, and the user has no visual confirmation that their
parameter tweaks did anything until the wheels are halfway through the dirt.

This document focuses on the affordances and feedback loops that turn those
features from "technically there" into "obviously there."

---

## Make-or-break principles

These are ordered roughly by how badly the experience suffers if they're missed.

### 1. Always show the user what they built

The single most important thing across both series. **Collision proxies, contact
points, contact forces, terrain extents, and deformed soil must all be visible
on demand without leaving the viewport.** If the user has to run a simulation
to find out whether their authoring worked, the loop is too slow and they will
guess instead of iterating.

This is what view modes (Collision Overlay, Contact Overlay, Terrain Wireframe,
Rut Depth) are for. Each one is cheap to implement and indispensable in
practice. **None of them is optional.**

### 2. Async work needs feedback before the user reaches for the kill switch

Convex decomposition can take 5+ seconds on a real CAD part. SCM compilation
can take several seconds for a dense grid. Heightfield import can take a
moment. None of these should ever look like a freeze.

The rule: **acknowledge within 100 ms, show progress within 500 ms, allow
cancel for anything longer than 2 s.** Inspector-inline progress is preferred
over modal dialogs — the user is configuring the thing that's working, they
shouldn't be torn away from it.

### 3. Numeric controls without context are user-hostile

`Bekker_Kphi: 2080000` is meaningless to anyone who isn't already a
tribologist. Two affordances rescue this:

- **Presets first, parameters second.** The Soil section opens on the preset
  dropdown. Numeric fields are below it. Tweaking a parameter clears the
  preset key but does not reset the other values.
- **Tooltips with physical meaning, not formula meaning.** "Higher values mean
  the soil resists sinkage more — picture wet sand vs dry sand." Not "Bekker
  pressure-sinkage frictional modulus."

Apply the same principle to material parameters (`compliance`, `cohesion`),
decomposition parameters (`concavity`), and SCM mesh resolution (with a
"that's a lot of cells" warning at the threshold).

### 4. Visibility into authored state must outrank visual polish

A contact-force arrow that looks beautiful but obscures the body it's
attached to is worse than an ugly arrow that gets out of the way. The
collision overlay's translucent wireframe is more useful than a solid
color-coded mesh, even though the second looks better in screenshots.

Practical consequence: any time we have a choice between visual fidelity and
visual deference, deference wins. Selection outlines, gizmos, and existing
viewport conventions take precedence over collision/contact/soil overlays.

### 5. Defaults must be safe enough that "just turn it on" works

A user who clicks "Add Collision" on a geometry should get a working,
non-disastrous result without further configuration. That means:

- Default shape = `auto-fit primitive` (smallest enclosing box of the mesh).
- Default material = the project's `default` material.
- Default decomposition params = balanced (16 hulls, 64 verts each).
- Default terrain = flat, 10×10 m, `default` material, world origin pose.

A user who *does* configure should never get worse defaults than the click-once
flow. If "balanced" is good enough for click-once, it is the floor for
explicit configuration.

### 6. The viewport is where users live

Every flow — creating terrain, assigning materials, debugging contacts —
should have a viewport entry point in addition to the inspector entry point.
Drag a heightmap onto empty space → create terrain. Click a body → see its
collision proxy. Right-click an unexpected contact → "Investigate this pair"
that opens both bodies in a multi-select.

The inspector is the configuration surface; the viewport is the discovery
surface. Both must be reachable from the other.

### 7. Reversibility of authoring, not of expensive computation

Authoring changes (material assignment, shape type swap, soil parameter
edits) must be undo-able as ordinary edits. Expensive computations
(decomposition, SCM grid construction) should *not* be undone — they are
side-effect derivations of the authored state, cached and recomputed as
needed. Conflating the two means undo either becomes painfully slow or
becomes inconsistent. Keep them separate.

---

## New view modes

Each one is a toggle in the viewport pill toolbar (`ViewportToolModeToolbar`).
They are independent — multiple can be on simultaneously, with documented
visual layering.

| View mode | Source epic | Purpose | Default |
|---|---|---|---|
| Collision Overlay | C2 | Translucent wireframe of every collision proxy, color-coded by shape type | Off |
| Contact Overlay | C3 | Spheres at contact points + scaled normal-force arrows | Off |
| Terrain Wireframe | T1 | Wireframe over terrain meshes for resolution/orientation debugging | Off |
| Rut Depth | T2 | Soil heightmap shaded by delta from initial, instead of absolute height | Off |

**Layering rule (top to bottom):** selection outlines → contact arrows →
contact points → collision proxies → terrain wireframe → soil deformation →
visual mesh → grid. Anything overlay-only is translucent so the visual mesh
shows through.

**Toggle persistence:** per-project, not per-session. A user who works in
Collision Overlay all the time should not retoggle it every launch. Per-project
state lives in the existing `useUILayoutStore`.

**Discoverability:** when the user first creates a collision shape, briefly
flash the Collision Overlay button with a tooltip "See what you built." Same
treatment for the first contact event (Contact Overlay) and the first SCM
terrain (Rut Depth). One-time hint per project, dismissable.

---

## Components that need design care

### Material swatch chip

The most reused atom in this series. Appears in:
- Asset browser physics materials tab (large)
- Inspector material dropdown (small, with name)
- Collision section material picker row (small, with name + click-to-open)
- Terrain Soil section (small, with name)

**Design decisions:**
- Color is hashed from the material id, not authored. Two materials named
  "steel" can exist and look distinct. The user is not asked to pick a color.
- Shape is a small rounded square (~16 px) with a 1 px subtle border. Not a
  circle — circles read as "status indicator," squares read as "swatch."
- The chip is not interactive on its own; it's a label decoration. Click
  behavior belongs to the surrounding row.

**Anti-pattern:** showing material parameters inline in the chip's tooltip.
That belongs to a hover card on the row, not the chip.

### Material picker dropdown vs dialog

Two modes for two contexts:

- **Inline dropdown** (collision section row): up to ~10 materials. Good for
  the common case. Includes a "+ New material" entry at the bottom and an
  "Edit material…" entry that opens the inspector.
- **Picker dialog** (button at the right of the row, opens on demand): full
  searchable list with parameter previews. Used when the project has dozens
  of materials and the dropdown becomes a wall of names.

Switch from dropdown to dialog is automatic at a threshold (e.g., >12
materials). Document the threshold and surface it in dev mode.

### Collision shape type dropdown

This is the user's first and most consequential collision authoring decision.
Make it forgiving:

- Each entry has an icon (box, sphere, cylinder, hull, decomposition cluster,
  triangle mesh).
- Each entry has a one-line description: "Best for boxes." "Best for
  one-piece curved parts." "Best for complex geometry."
- Triangle mesh entry is **always present** but greyed with a tooltip
  "Available for Fixed bodies only — change this body's motion type to
  enable" when the parent body is dynamic. This is more discoverable than
  hiding the option.
- Switching shape types preserves the material assignment.

### Decomposition progress UI

Inline in the collision section, not modal. Layout:

```
[Convex Decomposition ▼]
Max hulls       [16]
Max vertices    [64]
Concavity       [0.001]
                                          [Recompute]

▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░  53%  · 9 hulls so far
```

When complete, the progress bar disappears and is replaced by:

```
✓ 14 hulls · cached
                                          [Recompute]
```

**The Recompute button is always present** so the user can re-run with
different params without hunting for a menu.

**Cancellation:** clicking Recompute while a computation is in flight cancels
the current run and starts a new one. There is no separate Cancel button —
the action the user wants is "use these params instead," which is what
Recompute does.

### Contact point markers and force arrows

The visual language must communicate magnitude at a glance without
quantitative precision (which lives in the chart panel):

- **Marker:** small sphere, ~4 px on screen at default zoom. Color-ramp from
  pale yellow (low force) to saturated red (high force, near max in the
  current frame).
- **Arrow:** unit-length normal direction, color-matched to the marker. **Not
  scaled to magnitude in length** — that makes high-force contacts look
  unreadable. Magnitude lives in color.
- **Legend:** small corner widget showing the color ramp and the current
  per-frame max-force value, so users can interpret the colors in context.

**Anti-pattern:** rendering all contacts at once on a granular pile. Cap the
viewport overlay to (e.g.) the top 256 contacts by magnitude per frame, with
a small "+148 more" indicator. Channels (in the chart panel) keep their own
cardinality cap from C3 — these caps are independent.

### Pair channel picker tree node

The chart panel's existing channel picker gets a new top-level group:

```
▼ Contacts
  ▼ body_chassis ↔ terrain_ground
    · normal_force
    · tangent_force_mag
    · penetration
  ▼ body_wheel_FL ↔ terrain_ground
    · normal_force
    · ...
  [256 / 256 pair limit reached — older pairs evicted]
```

The pair label uses the body *display names*, not ids. Renaming a body
updates the label live. The underlying channel id stays stable (it's keyed
on the body uuid pair).

**Critical detail:** the pair label uses the `↔` glyph, not `→`. Contact is
symmetric; an arrow falsely implies direction.

### Pause-on-contact toast

Triggers when the runtime stops on a new pair:

```
⏸ Paused on first contact
   chassis ↔ terrain_ground
   [Select pair]   [Resume]   [Disable]
```

`Select pair` selects both bodies in the multi-select store. `Resume`
continues the simulation without disabling pause-on-contact. `Disable` turns
the setting off entirely (the user has seen what they wanted to see).

The toast persists until dismissed. It is not auto-dismissed — the user is
mid-investigation and can't be hurried.

### Terrain creation menu

The structure panel `+` button gains an "Add Terrain" entry. Clicking it
opens a sub-menu, **not** a dialog:

```
+ Add ▼
  ▶ Body
  ▶ Joint
  ▶ Force
  ▼ Terrain
    · Flat
    · Box
    · Heightfield…
    · Mesh…
```

Flat and Box create immediately with default parameters and select the new
terrain in the inspector. Heightfield and Mesh open a file picker first
(ellipsis indicates file action). After file selection they create and
select.

**Why this matters:** users won't think to look for terrain. The `+` menu is
the discovery path. Burying it under a "World" submenu or a separate route
hides it from the people who most need it.

### Heightfield drag-import zone

When the user drags an image file over the viewport on empty space, the
viewport shows a translucent overlay:

```
┌──────────────────────────────────┐
│                                  │
│      Drop to create terrain       │
│      heightmap.png · 1024×1024    │
│                                  │
└──────────────────────────────────┘
```

On drop, a small inline dialog asks for size (X, Y, height min, height
max) with sensible defaults derived from the image dimensions and a 1:1 m/px
assumption. Confirming creates the terrain and selects it. Cancel discards.

This is the kind of moment that either feels magical or broken. Errors (bad
image format, unsupported bit depth) must surface in the inline dialog with
a clear message, not a silent failure.

### Soil preset dropdown with explanatory rows

The Soil section opens with this prominent control:

```
Preset  [ Sand (dry) ▼ ]
        Loose desert sand. Sinks readily under wheeled bodies.
```

Each dropdown entry shows the preset name with a one-line description below
it (smaller, secondary text). Selection updates the inspector and applies
the parameters. The description row stays visible after selection.

Below the preset, a collapsible **Advanced parameters** section holds the
Bekker / Mohr / Janosi inputs. Default state is collapsed — most users will
never open it.

### Bekker / Mohr / Janosi inputs

When the user does open Advanced:

- Each parameter has a label (short name), a numeric input, a unit
  affordance (Pa, Pa/m, deg, m), and a tooltip that explains the *physical
  meaning*, not the formula role.
- Parameters are grouped under subheaders ("Pressure-sinkage", "Shear
  failure", "Shear displacement", "Elastic / damping") so the user can find
  the one they want to tweak.
- Out-of-range values surface a yellow warning row, not a red error —
  Chrono will accept them and possibly produce nonsense, but the user is
  exploring and we don't want to block.

### Soft terrain visualization mode toggle

A small radio control in the Soil section header:

```
Visualize: ( ) Solid    ( ) Height shaded    (•) Rut depth
```

This is also exposed as a viewport view mode (Rut Depth) but having it
in-context in the soil section is faster for the user who is iterating on
soil parameters.

### Capability section "card" treatment

When a section is rendered through the C4 capability registry, it should
look identical to a hand-coded section. **No visual marker** of its
provenance. The whole point is uniform inspector rendering. If users can
tell that Collision is "registry-based" and Mass is "core," the abstraction
has leaked.

The only difference is the section header may have a small "(?)" icon that
links to a docs page explaining what the capability does — useful for new
sections like Soil that the user hasn't seen before.

---

## New flows and discoverability paths

### "Just give me collision on this body"

Today: open inspector → find Collision section → set shape type → set
material → set dimensions → done.

Target: right-click body in viewport → "Add collision (auto-fit)" →
inspector opens with the collision section expanded showing the result. One
click, then refinement.

This is the path for users who don't yet know the inspector layout. Once
they know it, they go straight to the inspector. Both paths must work.

### "What is touching what?"

Today: not possible.

Target: with Contact Overlay on, contacts are visible. Hovering a contact
marker shows a tooltip with the pair name. Clicking a contact marker selects
both bodies in the multi-select store. Right-click → "Plot contact forces"
adds the pair channels to the chart panel.

### "Why is my body sinking through the floor?"

Today: not diagnosable.

Target: collision overlay shows the body has no collision proxy on its
relevant face, **or** the terrain has no collision (which would be a bug —
terrain always has collision in the rigid case). Either way the user can
see the problem in 2 seconds.

### "Set this whole assembly to the same material"

Common case for imported CAD: 50 parts, all should be steel. Multi-select
in the structure tree, the inspector shows a multi-edit version of the
Collision section with a single Material picker, and applying it sets all
selected entities. **This is not in the technical briefs** — it's a
multi-selection inspector concern that's deferred there. Flag it as a
follow-up that becomes mandatory once C2 ships.

### "I want to use the same material as that other body"

Eyedropper affordance: in the Material picker dialog, a small "pick from
viewport" button enters a one-shot pick mode. The user clicks a body in the
viewport, the material is read from that body's collision config and
selected. Same pattern as the Material picker in any DCC tool.

---

## Inspector layout decisions

### Section ordering for a Body with collision

Per the convention in C4:

1. Identity (0–9)
2. Pose (10–19)
3. Mass (20–29)
4. **Collision** (30–39) — new
5. **Contact Diagnostics** (40–49) — new, only when sim has run at least once
6. Runtime metadata (90–99) — only during sim

Contact Diagnostics is a *runtime* section: collapsed by default, populated
with last-frame contact summary. Users who don't simulate never see it.

### Section ordering for a Terrain

1. Identity (0–9)
2. Pose (10–19)
3. Patch (20–29) — kind, dimensions, asset reference
4. **Collision** (30–39) — material picker only
5. **Soil** (50–59) — rigid vs SCM swap, parameters, presets
6. Runtime metadata (90–99)

### Sticky footer for terrains

The "Add Soil Model" affordance lives in a sticky footer of the Soil
section, not as a button at the bottom of the inspector. This is consistent
with the planned Add Component sticky footer pattern from the inspector
restyle (epic-2-contextual-inspector.md).

### Inspector width pressure

Soil parameter labels (`Bekker Kphi`, `Janosi shear`) are long. The current
property row layout (`[2fr_3fr_auto]`) may not fit them at the default
right-panel width. Either:

- Stack label-above-value for the Soil section only (inline exception), or
- Truncate long labels with ellipsis and full text in tooltip.

Recommendation: stacked layout for Soil only. The visual break also signals
"this section is denser than usual."

---

## Visual language

### Color

- **Joints** stay steel blue (per existing memory).
- **Collision proxies** in Collision Overlay: a desaturated cyan distinct
  from joint blue.
- **Contact markers and arrows**: yellow→red ramp by force magnitude. Never
  blue (would conflict with joints).
- **Terrain selection outline**: a warm earth tone (taupe) distinct from
  the existing entity-type outlines.
- **Soft terrain Rut Depth shading**: brown (deep rut) → green (no
  deformation) gradient. Deliberately not blue or red — those are reserved
  for collision/contact.

Document these in the design system token set so the next epic doesn't have
to relitigate them.

### Shape

- Contact markers are **spheres**, never billboards — billboards lie about
  3D position when the camera tilts.
- Force arrows are **3D cones**, not flat triangles — same reason.
- Collision proxies are **wireframes**, not solid — to defer to the visual
  mesh.

### Motion

- The viewport overlays are static during simulation pause. They do not
  pulse, breathe, or animate idle. Animation is for state transitions, not
  ambient decoration.
- The decomposition progress bar uses a smooth determinate fill, not an
  indeterminate marquee — the engine reports real progress, so we should
  show it.

---

## Cross-cutting notes

### Performance budgets

The user-facing budgets for "feels responsive":

| Action | Target | Hard ceiling |
|---|---|---|
| Toggle a view mode | < 16 ms (1 frame) | 33 ms |
| Material assignment round-trip | < 100 ms | 250 ms |
| Add Terrain (Flat) | < 100 ms | 500 ms |
| Decomposition for ~10k tri part | < 3 s with progress | 10 s |
| SCM frame rate (4 bodies, 200×200) | ≥ 30 Hz | 15 Hz |

If any phase hits the hard ceiling, treat it as a blocker, not a polish item.

### Replay parity

Every new viewport overlay must work in replay. Contact frames recorded
during simulation must replay frame-accurate when scrubbing the timeline.
SCM deformation must replay. If a feature can't replay, document why and
gate it behind a "live only" pill in the toolbar.

### Accessibility

- All view mode toggles must have keyboard shortcuts. Suggest:
  `Shift+C` (Collision Overlay), `Shift+X` (Contact Overlay), `Shift+T`
  (Terrain Wireframe), `Shift+R` (Rut Depth). Verify against existing
  keymap.
- All color-coded information (force ramp, soil type) must have a textual
  alternative — the legend, the tooltip, the inspector.
- Tooltip text must be reachable by keyboard, not hover-only.

### State that must persist across launches

- View mode toggle states (per project).
- Last-used material in the picker (per project).
- Inspector section collapse states (per entity type, global preference).
- Pause-on-contact setting (per project).

### State that must NOT persist

- Decomposition progress (always reset on launch — recompute is fast on
  cache hit).
- Multi-selection state.
- Toast dismissal state for one-time hints (per project, but tracked
  separately from per-session UI state).

---

## Open UX questions

These are decisions the implementing engineer will need to make and can't be
prescribed in advance:

1. **Inline material picker vs dialog threshold.** Best decided by user
   testing, not a fixed number. Start at 12, adjust.
2. **Should Contact Overlay default on?** The case for on: discoverability.
   The case for off: visual noise on dense scenes. Recommendation: off, with
   a one-time hint when the first contact pair appears.
3. **Heightfield orientation convention.** Is Z up or Y up? MotionLab uses
   Z-up — confirm and document so users with Y-up source data know to flip.
4. **Soil preset library size.** Four is enough for v1. More is better but
   each requires real parameter sourcing. Don't fabricate values.
5. **Contact channel auto-pin behavior.** When pause-on-contact triggers,
   should the offending pair's channels auto-add to the chart panel? Yes,
   probably. Confirm with first user test.
6. **Multi-selection material assignment.** Out of scope per the technical
   briefs, but probably mandatory by the time C2 ships. Plan for it.
7. **Terrain in the structure tree under what group?** Top-level peer to
   "Bodies"? Under a "World" parent? Recommendation: top-level peer.
   Re-evaluate if the tree gets crowded.
8. **Rut depth scale**. Auto-scale per frame (good for visibility, bad for
   comparing across time) or fixed scale (good for comparison, bad for
   subtle ruts). Recommendation: fixed by default, with an auto toggle.

---

## What this brief deliberately does not cover

- Specific Figma frames or pixel measurements — those come from the design
  system extraction effort separately.
- Animation timings beyond "snappy."
- Internationalization of the parameter explanations.
- Onboarding flow for the first project.
- Documentation site copy.

These will land alongside the implementation as the design system catches up.
