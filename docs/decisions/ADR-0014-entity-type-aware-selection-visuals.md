# ADR-0014: Entity-Type-Aware Selection Visuals

- Status: Accepted
- Date: 2026-03-22
- Decision makers: TBD

## Context

The `SelectionVisuals` API in `@motionlab/viewport` originally accepted plain `AbstractMesh[]` arrays for both `applySelection()` and `applyHover()`, applying a single accent color (`#0f62fe`) to all entity types. This made it impossible to visually distinguish bodies, datums, joints, and other entity types when selected or hovered in the viewport.

CAD tools universally use color-coded selection to differentiate entity types (Blender, Onshape, Fusion 360). Without this, users reported that they could not tell what was selected in complex assemblies — MotionLab's #1 user complaint.

The change touches the contract between `SceneGraphManager` (caller) and `SelectionVisuals` (renderer), both within `@motionlab/viewport`. It also introduces a new exported type (`SelectionMeshEntry`) and constant (`ENTITY_COLORS`) consumed by frontend code.

## Decision

Replace the `AbstractMesh[]` parameter in `SelectionVisuals.applySelection()` and the `AbstractMesh | null` parameter in `applyHover()` with a `SelectionMeshEntry` type that pairs each mesh with its entity type:

```ts
export interface SelectionMeshEntry {
  mesh: AbstractMesh;
  entityType: EntityColorType;
}

export interface SelectionVisuals {
  applySelection: (entries: SelectionMeshEntry[]) => void;
  applyHover: (entry: SelectionMeshEntry | null) => void;
  clearAll: () => void;
  dispose: () => void;
}
```

Entity type colors are defined in `packages/viewport/src/rendering/colors.ts` and assembled into an `ENTITY_COLORS` lookup map in `selection.ts`. The `MaterialFactory.applySelectionTint()` signature gains an optional `accentColor` parameter and guards against non-PBR materials (joints and datums use emissive `StandardMaterial`).

All call sites (`SceneGraphManager.applySelection`, `SceneGraphManager.applyHover`) were updated in the same change to maintain consistency.

## Consequences

**Positive:**
- Each entity type renders with a distinct selection/hover color (body=steel-blue, datum=emerald-green, joint=dark-orange)
- Multi-selection clearly shows which entities are selected and their types
- `ENTITY_COLORS` is exported for reuse in tree badges and UI indicators
- Pre-computed edge color variants avoid per-frame allocation
- Load, actuator, and ground colors are defined for future entity types

**Tradeoffs:**
- The `SelectionVisuals` interface is no longer a simple mesh list — callers must provide entity type metadata
- Material tinting is skipped for non-PBR materials (joints, datums get glow + edges only, no surface tint)

**Follow-up:**
- Tree badges can import `ENTITY_COLORS` for consistent color coding across UI
- Future entity types (loads, actuators) will use the pre-defined colors with no API change needed
