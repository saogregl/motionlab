# ADR-0009: Project Save/Load Contract

- Status: Accepted
- Date: 2026-03-19
- Decision makers: MotionLab team

## Context

MotionLab needs project persistence — save authored mechanism state (bodies, datums, joints, display meshes) to a `.motionlab` file and restore it on load. The key challenge is that the `Mechanism` proto contains body structure (pose, mass, refs) but NOT display mesh data (vertices/indices/normals), which the frontend needs to render. The engine is authoritative for serialization.

## Decision

### Protocol

- **SaveProjectCommand** (frontend → engine): Sends a project name; engine serializes the current mechanism state plus cached display data into a `ProjectFile` protobuf and returns the raw bytes in `SaveProjectResult`.
- **LoadProjectCommand** (frontend → engine): Sends raw project file bytes; engine deserializes, rebuilds its internal state, and returns a `LoadProjectResult` containing the mechanism, body import results (with display meshes), and project metadata.

### Data format

- **ProjectFile** is a binary protobuf message in `mechanism.proto` with:
  - `version` (uint32, starting at 1) for forward compatibility
  - `metadata` (ProjectMetadata: name, created_at, modified_at)
  - `mechanism` (Mechanism: bodies, datums, joints)
  - `body_display_data` (repeated BodyDisplayData: body_id, display_mesh, part_index)
- File extension: `.motionlab`
- Files are self-contained — display mesh data is embedded so projects can be opened without the original CAD files.

### Data flow

- **Save**: Frontend → Engine (serialize to `ProjectFile` bytes) → Frontend (receive bytes) → Electron (file dialog + `fs.writeFile`)
- **Load**: Electron (file dialog + `fs.readFile`) → Frontend (send bytes) → Engine (deserialize, rebuild state) → Frontend (receive mechanism snapshot + display data, rebuild stores and scene graph)

### Engine internals

- `body_import_results_` map in `TransportServer::Impl` stores `BodyImportResult` per body_id during import, used to populate `BodyDisplayData` on save.
- `MechanismState::load_from_proto()` reconstructs internal state from a Mechanism proto, preserving original IDs (no new UUID generation).

## Consequences

- Projects are self-contained binary files — no external asset references needed to render after load.
- Engine is authoritative for serialization/deserialization, maintaining the boundary principle.
- Version field enables future format evolution with clear rejection of unsupported versions.
- **Known MVP limitation:** B-Rep shape registry is NOT serialized — face-picking for datum creation won't work after load until the original CAD file is re-imported.
- Electron handles file I/O only, keeping simulation data transport on the direct WebSocket path.
- Protocol fields 40/41 reserved for save/load in both Command and Event envelopes.
