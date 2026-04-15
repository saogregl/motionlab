# Epic C4 — Capability-Section Inspector Model

**Mission:** introduce a lightweight registry that lets a single inspector section
(e.g., Collision, Contact Diagnostics, Soil) attach to multiple typed entities based
on the *capabilities* the entity declares. **This is not an ECS.** Entities remain
typed; the registry only governs which shared inspector sections render for which
entity types.

**Cross-cuts:** all of C1–C3 and the terrain epics. Best landed after C1 has shipped
its first cross-entity section so the abstraction is justified by a real second user.

---

## Why

The constraint from `feedback_no_full_ecs.md` is firm: no general-purpose ECS, but
shared inspector sections are explicitly sanctioned. C1 wants Collision to live on
both Body and Geometry. C3 wants Contact Diagnostics on Body. Terrain epics want a
Soil section on Terrain entities. Sensors already exist as their own typed entity but
their inspector sections want to be reusable.

Without a registry, each new section is wired by hand into every relevant inspector —
copy-paste across N inspector files. That copy-paste is what tempts people toward an
ECS for the wrong reasons. A registry gives 90% of the benefit with none of the
architectural cost.

This epic also **supersedes the Phase 1 portion of `epic-4-entity-component-system.md`**.
Same goal (uniform inspector rendering), smaller surface, no protocol changes.

## Existing state

- `EntityInspector.tsx` switches on entity type and renders a hardcoded inspector
  component per type (`BodyInspector`, `JointInspector`, `LoadInspector`, …).
- Each inspector hardcodes its sections in JSX.
- C1 will introduce a Collision section that needs to render on both Body and
  Geometry inspectors. Without C4, that means duplicating the section wiring.
- `epic-4-entity-component-system.md` exists but proposes a much larger
  componentization. Mark it superseded.

## Proposed model

### Capability declaration

A capability is a string tag:

```ts
type Capability =
  | 'collision'
  | 'contact-diagnostics'
  | 'soil'
  | 'sensor-output'
  | 'actuator-command'
  | 'joint-diagnostics';
```

Each typed entity declares which capabilities it supports — a static map, not a
runtime query:

```ts
const ENTITY_CAPABILITIES: Record<EntityType, Capability[]> = {
  body:     ['collision', 'contact-diagnostics'],
  geometry: ['collision'],
  joint:    ['joint-diagnostics'],
  load:     [],
  actuator: ['actuator-command'],
  sensor:   ['sensor-output'],
  terrain:  ['collision', 'soil'],   // added by terrain epics
};
```

### Section registry

```ts
interface CapabilitySection {
  capability: Capability;
  title: string;
  order: number;            // sort key within an entity's section list
  Component: React.FC<{ entityId: string; entityType: EntityType }>;
  // Optional finer-grained filter: e.g., only show on bodies that own at least one
  // collidable geometry, or only on terrains with a soft soil model.
  shouldRender?: (entityId: string, store: StoreSnapshot) => boolean;
}

registerCapabilitySection({
  capability: 'collision',
  title: 'Collision',
  order: 30,
  Component: CollisionSection,
});
```

### Inspector composition

A new `EntityInspector` reads, in order:

1. The selected entity's type.
2. The static capabilities for that type.
3. The registered sections matching those capabilities, filtered by `shouldRender`.

…and renders them in `order`. Identity, transform, and per-type **core** sections
(e.g., `MassSection` for Body, `JointConfigSection` for Joint) are still owned by the
typed inspector — they're not "capabilities," they're the entity's *essence*.

The split is deliberate:

- **Core sections** = what the entity *is*. Rendered by the typed inspector. One per
  entity type. Examples: Body has Mass and Inertia; Joint has Type, Frames, and
  Limits; Terrain has Patch and Pose.
- **Capability sections** = what the entity *can do*. Rendered by the registry.
  Many-to-many between entity types and section types. Examples: Collision (on
  Body, Geometry, Terrain), Contact Diagnostics (on Body), Soil (on Terrain).

This avoids the ECS rabbit hole where "what is this thing" becomes a query over a
bag of components. The entity's identity stays typed; only its supplementary
sections compose.

### Protocol implications

None. Capabilities are purely a frontend rendering concept. The proto stays typed
and unchanged.

### Section ordering convention

Document a stable ordering convention so authors of new sections don't have to read
existing code:

```
0–9    : identity / name
10–19  : transform / pose
20–29  : core entity properties (Mass, Joint Type, Patch Kind, ...)
30–39  : collision
40–49  : contact diagnostics
50–59  : soil
60–69  : sensor output
70–79  : actuator command
80–89  : joint diagnostics
90–99  : runtime metadata (sim state, last step time)
```

---

## Phases

### Phase 1 — Registry + plumbing, one capability migrated

- Implement the registry and the new `EntityInspector` composition logic.
- Migrate one capability (`collision`) to the registry. `BodyInspector` and
  `GeometryInspector` both stop hardcoding the Collision section.
- All other inspectors continue to work unchanged.

### Phase 2 — Migrate other shared sections

- As C3 lands, register `contact-diagnostics`.
- As terrain epics land, register `soil`.
- As sensor work continues, migrate sensor sections.

### Phase 3 — Documentation

- Update `docs/briefs/scene-building-ux/02-ENTITY-MODEL.md` to describe the
  capability split alongside the typed-entity rule.
- Mark `docs/briefs/epic-4-entity-component-system.md` as superseded by this epic.
- Add a Storybook entry showing the registry pattern for future contributors.

## Acceptance criteria

- [ ] A new section can be added by writing one component file and one
      `registerCapabilitySection` call — no edits to typed inspectors required.
- [ ] `BodyInspector` and `GeometryInspector` both render the Collision section
      through the registry, with no duplicated code.
- [ ] Section ordering is deterministic and respects the `order` convention.
- [ ] No visual regression in any existing inspector.
- [ ] The capability map is type-safe (TypeScript catches misspellings).
- [ ] Storybook example demonstrates the pattern.

## Out of scope

- Runtime/dynamic capability detection (capabilities are static per type).
- User-defined custom sections / plugin loading.
- Multi-selection inspector merging (handled separately when it becomes painful).
- Any change to the proto, engine, or store layout.
- Auto-generated section forms from proto schemas.

## File checklist

| Action | File |
|---|---|
| Create | `packages/frontend/src/components/inspector/capability-registry.ts` |
| Create | `packages/frontend/src/components/inspector/EntityInspector.v2.tsx` (replaces existing once stable) |
| Modify | `packages/frontend/src/components/BodyInspector.tsx` (stop hardcoding CollisionSection) |
| Modify | `packages/frontend/src/components/GeometryInspector.tsx` (same) |
| Modify | `docs/briefs/scene-building-ux/02-ENTITY-MODEL.md` (capability section explanation) |
| Modify | `docs/briefs/epic-4-entity-component-system.md` (mark superseded by C4) |
| Create | `packages/ui/src/components/inspector/capability-registry.stories.tsx` |

## Risks

- **Naming drift**: capability strings as union types are easy to typo. Enforce via
  TypeScript and a single source-of-truth file.
- **Order collisions**: two sections with the same `order` value have undefined
  relative order. Document the convention and add a dev-mode warning when collisions
  are detected.
- **Section explosion**: if every minor concern becomes a capability, the inspector
  becomes a wall of collapsibles. Capability is a real architectural decision, not a
  default — when in doubt, keep it as a core section on the typed inspector.
