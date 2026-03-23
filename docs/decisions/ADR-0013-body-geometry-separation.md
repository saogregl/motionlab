# ADR-0013: Body-Geometry Separation

- Status: Accepted
- Date: 2026-03-22
- Decision makers: MotionLab team

## Context

MotionLab previously conflated Body and Geometry: importing a STEP file created a `Body` with mesh data, mass properties, and asset references baked in as a single indivisible unit. This prevented:

1. **Empty bodies** — point masses, virtual constraint-routing bodies with no visual representation.
2. **Mass overrides** — engineers need to say "the real mass is 2.5 kg, not what the CAD says."
3. **Multi-geometry bodies** — a wheel assembly (rim + tire + hub) should be one body with multiple geometries.
4. **Geometry reparenting** — detaching geometry from one body and attaching to another without re-importing.

Every serious multibody tool (Adams, ANSYS Motion, Simscape) separates body (physics) from geometry (visual). This ADR moves MotionLab to that model.

## Decision

1. **Body and Geometry are separate first-class entities in the mechanism model.**
   `Mechanism` now carries `repeated Geometry geometries` alongside bodies, datums, joints, loads, and actuators. A body may have zero, one, or many geometries attached.

2. **Body owns effective mass properties; Geometry owns computed mass from CAD.**
   `Body.mass_properties` is the value the solver uses. `Geometry.computed_mass_properties` is the value derived from the CAD shape via BRepGProp.

3. **`mass_override` flag controls computed vs user-specified mass.**
   When `Body.mass_override = false` (default), body mass is aggregated from attached geometries using the parallel axis theorem. When `true`, body mass is user-specified and geometry changes do not affect it.

4. **Import creates Body+Geometry pairs for backward-compatible workflow.**
   Each STEP part produces one Body and one Geometry, auto-parented. The user experience is unchanged — importing "just works." The decoupling enables new workflows without breaking existing ones.

5. **ProjectFile migration v2 → v3 creates Geometry entities from Body.source_asset_ref.**
   Old project files are transparently upgraded. A deterministic UUIDv5 derives geometry IDs from body IDs for stable references.

6. **ShapeRegistry is keyed by geometry_id, not body_id.**
   B-Rep shapes belong to geometries. Face-picking resolves body_id → geometry_ids for shape lookup.

7. **Wire compatibility: Body field 5 (source_asset_ref) is deprecated, not removed.**
   Old v2 Body messages with source_asset_ref at field 5 parse successfully. The field is accessible for migration code, then cleared. New bodies never set it.

8. **Five new transport commands for body and geometry lifecycle.**
   `CreateBody`, `DeleteBody`, `AttachGeometry`, `DetachGeometry`, `UpdateMassProperties` follow the established Command→Result oneof pattern.

9. **Protocol version bumped to 4; project file version bumped to 3.**

## Consequences

### Positive

- Empty bodies, point masses, and virtual bodies are now possible.
- Mass override enables real-world calibration of CAD-derived properties.
- Multi-geometry bodies support assemblies as single physical entities.
- Geometry reparenting enables flexible mechanism restructuring.

### Tradeoffs

- Breaking protocol change requires coordinated frontend update (Prompts 2 and 3).
- Project file migration required for v2 files.
- Face-picking with multi-geometry bodies uses first geometry only (MVP limitation).
- Mass aggregation does not account for geometry local_pose rotation (deferred — import always uses identity orientation).
