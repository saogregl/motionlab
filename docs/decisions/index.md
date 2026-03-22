# Architecture Decision Records

| ADR | Title | Status | Summary |
|-----|-------|--------|---------|
| [ADR-0001](ADR-0001-repo-truth-and-github-execution.md) | Repo Truth and GitHub Execution | Accepted | Repository is the single source of truth; GitHub is the execution platform for all project work. |
| [ADR-0002](ADR-0002-sensors-are-first-class-authored-entities.md) | Sensors Are First-Class Authored Entities | Accepted | Sensors are persisted authored entities mounted to datums, not transient backend runtime objects. |
| [ADR-0003](ADR-0003-runs-and-channel-contracts.md) | Runs Are Immutable and Channels Unify Live and Replay | Accepted | Simulation runs are immutable artifacts; channel descriptors provide unified live/query/replay semantics. |
| [ADR-0004](ADR-0004-datum-crud-contract.md) | Datum CRUD Contract | Accepted | Datums use engine-authoritative Command→Result oneof pattern with UUIDv7 IDs; pattern reused for joints and sensors. |
| [ADR-0005](ADR-0005-joint-crud-contract.md) | Joint CRUD Contract | Accepted | Joints follow Command→Result oneof pattern (ADR-0004); reference datums, engine validates referential integrity, proto3 optional for partial updates. |
| [ADR-0006](ADR-0006-simulation-streaming-contract.md) | Simulation Streaming Contract | Accepted | Engine streams simulation state and frames over the protobuf transport while keeping backend-specific runtime objects behind the native boundary. |
| [ADR-0007](ADR-0007-face-level-datum-creation.md) | Face-Level Datum Creation Contract | Accepted | Face-aware datum creation is engine-authoritative; the wire carries `part_index`, while native B-Rep retention stays behind the boundary and create-datum mode no longer falls back to point+normal picks. |
| [ADR-0008](ADR-0008-output-channel-naming-and-typing.md) | Output Channel Naming, Typing, and Trace Streaming | Accepted | Channel IDs use `entity/id/measurement` convention; descriptors sent in CompilationResult; traces streamed round-robin; ring buffer enables scrub within 60s window. |
| [ADR-0009](ADR-0009-project-save-load-contract.md) | Project Save/Load Contract | Accepted | Engine-authoritative serialization via SaveProject/LoadProject Command→Result; ProjectFile is self-contained binary protobuf with version field; display meshes embedded for offline rendering. |
| [ADR-0010](ADR-0010-protocol-v2-native-boundary-cleanup.md) | Protocol v2 Native Boundary Cleanup | Accepted | Protocol v2 aligns asset references, import unit handling, datum pose updates, and paused-state semantics across engine and frontend contracts. |
| [ADR-0011](ADR-0011-missing-asset-recovery-contract.md) | Missing Asset Recovery and Cache Validation Contract | Accepted | LoadProjectSuccess reports missing/changed assets; RelocateAssetCommand enables re-import from a new path; BodyDisplayData carries import parameters for cache key reconstruction. |

## Adding a New ADR

Use `docs/decisions/ADR-template.md` as the starting template. Number sequentially (ADR-0004, etc.) and update this index.
