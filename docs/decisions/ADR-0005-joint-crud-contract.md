# ADR-0005: Joint CRUD Contract

- Status: Accepted
- Date: 2026-03-17
- Decision makers: MotionLab team

## Context

Joints connect two datums on different bodies and define kinematic relationships (revolute, prismatic, fixed). They are the second authored entity type after datums. We need CRUD transport messages, engine-side state management, and frontend store wiring that follows the patterns established by ADR-0004 (Datum CRUD).

## Decision

1. **Joints follow the Command→Result oneof pattern (ADR-0004).** CreateJointCommand/Result, UpdateJointCommand/Result, and DeleteJointCommand/Result use the same oneof success/error shape as datum CRUD.

2. **Joints reference datums, not bodies or raw transforms.** A joint connects a parent datum and a child datum. The engine validates that both datums exist and belong to different bodies.

3. **Engine validates referential integrity.** Both datums must exist, and they must be on different bodies. Datum deletion is rejected if the datum is referenced by any joint.

4. **UpdateJointCommand uses proto3 `optional` for partial updates.** This gives `has_*()` in C++ and field presence in protobuf-es, so the engine only applies fields that are explicitly set.

5. **UUIDv7 IDs are generated engine-side.** Consistent with ADR-0004 — the frontend never mints entity IDs.

6. **JointResult struct provides rich error reporting.** Unlike datum CRUD (which returns nullopt with no reason), joint operations return a `JointResult` with `optional<JointEntry> + string error`, allowing the engine to communicate specific validation failures.

7. **Field numbers 20-22 in transport.proto oneofs.** This leaves a gap (16-19) for future non-joint messages between the datum and joint blocks.

## Consequences

- Positive: Consistent pattern with datum CRUD makes the codebase predictable.
- Positive: Referential integrity prevents dangling joint references.
- Positive: Rich error messages from validation improve developer experience and future UI error reporting.
- Positive: Proto3 optional fields enable partial updates without sentinel values.
- Tradeoff: Datum deletion now requires checking joint references, adding a linear scan. Acceptable at MVP scale.
- Follow-up: Sensor CRUD will follow the same Command→Result pattern when implemented.
