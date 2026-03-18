# Epic 3 — Parallel Agent Prompts

> **Status:** Complete
> **Completed:** Commits `acfa303` through `8f65600`
> **Deviations:** None. OCCT import, asset cache, protocol expansion, and frontend import flow all delivered as specified.
>
> **Dependency:** Prompt 3.1 (OpenCASCADE spike) is a BLOCKER — must succeed before Prompts 3.2 and 3.3 can proceed.

Three prompts. Prompt 3.1 must complete first. Prompts 3.2 and 3.3 can run in parallel after 3.1 succeeds (3.3 can start once proto message shapes from 3.2 are agreed).

## Shared Contract

| Interface | Owner | Consumer |
|-----------|-------|----------|
| `CadImporter` C++ class with `import_step()` returning bodies+meshes+mass | Prompt 1 (engine spike) | Prompt 2 (wire into transport) |
| Expanded `ImportAssetCommand`/`ImportAssetResult` in transport.proto | Prompt 2 (protocol expansion) | Prompt 1 (engine implements), Prompt 3 (frontend sends/receives) |
| `DisplayMesh` proto + mesh data transfer format | Prompt 2 (defines) | Prompt 1 (engine populates), Prompt 3 (frontend renders) |
| `pnpm generate:proto` regeneration after schema changes | Prompt 2 (runs) | All |
| Mechanism Zustand store with bodies | Prompt 3 (frontend creates) | Prompt 3 (UI consumes) |
| File dialog via Electron preload | Prompt 3 (frontend uses) | Prompt 3 (preload+IPC implements) |

After all three are built, the integration test is: `pnpm dev:desktop` — user imports a STEP file, bodies appear in viewport, mass properties visible in inspector.

---

## Prompt 1: OpenCASCADE Integration Spike + Import Pipeline

**BLOCKER for all of Epic 3. Must complete first.**

```
# Epic 3 — OpenCASCADE Integration Spike and CAD Import Pipeline

You are implementing the C++ CAD import pipeline for MotionLab using OpenCASCADE. This is a BLOCKER spike — it must prove that OCCT links, loads STEP files, tessellates geometry, and extracts mass properties before any protocol or frontend work begins.

## Read These First (in order)
- `docs/architecture/principles.md` — non-negotiable rules (engine is authoritative for geometry)
- `docs/architecture/runtime-topology.md` — engine owns B-Rep, only display mesh crosses the boundary
- `native/engine/AGENTS.md` — native boundary rules, required checks
- `docs/domain/mechanism-model.md` — Body, MassProperties, AssetReference definitions

## What Exists Now

### `native/engine/vcpkg.json`
Dependencies include `ixwebsocket` and `protobuf`. No OCCT dependency yet.

### `native/engine/CMakeLists.txt`
Static lib `motionlab-engine-lib` with transport.cpp and generated protobuf sources. Lines 22-23 have placeholder comments:
```
# OCCT — deferred to Epic 3 (CAD Import)
# find_package(OpenCASCADE CONFIG REQUIRED)
```
No OCCT sources or link targets.

### `native/engine/src/transport.cpp`
Handles Handshake and Ping commands only. Uses `cmd.payload_case()` switch with `case Command::kHandshake:` and `case Command::kPing:`. No import command handling.

### `native/engine/src/main.cpp`
CLI arg parsing (`--port`, `--session-token`), signal handling (SIGTERM/SIGINT), event loop. No CAD-related code.

### `schemas/mechanism/mechanism.proto`
Defines Body (with name, pose, mass_properties, source_asset_ref), MassProperties (mass, center_of_mass as Vec3, inertia as 6-component repeated double), AssetReference (content_hash, relative_path, original_filename).

### `schemas/protocol/transport.proto`
Has stub messages:
```protobuf
message ImportAssetCommand {
  string file_path = 1;
}
message ImportAssetResult {
  bool success = 1;
  string error_message = 2;
  AssetReference asset_ref = 3;
}
```
These stubs will be expanded by Prompt 2. Your C++ code uses internal structs for now.

## What to Build

### 1. Add OpenCASCADE to vcpkg.json
Add `opencascade` to the dependencies array in `native/engine/vcpkg.json`. Note: the vcpkg port name is `opencascade` — verify with `vcpkg search opencascade` if needed.

### 2. Uncomment and configure find_package(OpenCASCADE) in CMakeLists.txt
Replace the placeholder comments with a working OCCT configuration:
```cmake
find_package(OpenCASCADE CONFIG REQUIRED)

# OCCT component libraries needed for STEP/IGES import + tessellation + mass props
set(OCCT_LIBS
  TKernel TKMath TKG2d TKG3d TKGeomBase TKBRep
  TKGeomAlgo TKTopAlgo TKShHealing
  TKSTEP TKSTEPBase TKSTEPAttr TKXSBase
  TKIGES
  TKXCAF TKLCAF TKXDEStep TKXDEIGES
  TKMesh
  TKPrim
)
```
Link these to `motionlab-engine-lib`.

### 3. Create `native/engine/src/cad_import.h` — CadImporter class declaration
Define the public interface:
```cpp
#pragma once
#include <string>
#include <vector>
#include <array>
#include <cstdint>

namespace motionlab::engine {

struct MeshData {
    std::vector<float> vertices;    // flat [x,y,z, x,y,z, ...]
    std::vector<uint32_t> indices;  // triangle indices
    std::vector<float> normals;     // flat [nx,ny,nz, nx,ny,nz, ...]
};

struct MassPropertiesResult {
    double mass;                     // computed from volume * density
    std::array<double, 3> center_of_mass;  // [x, y, z]
    std::array<double, 6> inertia;   // [Ixx, Iyy, Izz, Ixy, Ixz, Iyz]
};

struct BodyResult {
    std::string name;
    MeshData mesh;
    MassPropertiesResult mass_properties;
    std::array<double, 3> translation;   // body position
    std::array<double, 4> rotation;      // quaternion [x, y, z, w]
};

struct ImportResult {
    std::vector<BodyResult> bodies;
    std::string content_hash;        // SHA-256 of source file
    std::vector<std::string> diagnostics;  // warnings, info messages
    bool success = false;
    std::string error_message;
};

class CadImporter {
public:
    struct ImportOptions {
        double density = 1000.0;           // kg/m^3, default steel-ish
        double tessellation_quality = 0.1; // linear deflection for BRepMesh
    };

    ImportResult import_step(const std::string& file_path,
                             const ImportOptions& options = {});
    ImportResult import_iges(const std::string& file_path,
                             const ImportOptions& options = {});

private:
    ImportResult import_xde(const std::string& file_path,
                            const ImportOptions& options,
                            bool is_step);
    MeshData tessellate(const class TopoDS_Shape& shape, double quality);
    MassPropertiesResult compute_mass_properties(
        const class TopoDS_Shape& shape, double density);
    std::string compute_file_hash(const std::string& file_path);
};

} // namespace motionlab::engine
```

### 4. Create `native/engine/src/cad_import.cpp` — Implementation
Implement the full import pipeline:

**STEP import via XDE:**
```cpp
ImportResult CadImporter::import_step(const std::string& file_path,
                                       const ImportOptions& options) {
    return import_xde(file_path, options, true);
}
```

**XDE-based import (shared by STEP and IGES):**
- Create an `XCAFApp_Application` and new document
- Use `STEPCAFControl_Reader` (for STEP) or `IGESCAFControl_Reader` (for IGES)
- Read the file, transfer into the XDE document
- Walk the assembly tree via `XCAFDoc_ShapeTool` to extract individual bodies
- For each body shape: extract name from `TDataStd_Name`, location from shape location
- Call tessellate() and compute_mass_properties() for each body

**Tessellation:**
```cpp
MeshData CadImporter::tessellate(const TopoDS_Shape& shape, double quality) {
    BRepMesh_IncrementalMesh mesher(shape, quality);
    mesher.Perform();
    // Walk faces, extract triangulations via BRep_Tool::Triangulation
    // Collect vertices, normals, indices into flat arrays
    // Transform vertices by face location
    // Return MeshData
}
```

**Mass properties:**
```cpp
MassPropertiesResult CadImporter::compute_mass_properties(
    const TopoDS_Shape& shape, double density) {
    GProp_GProps props;
    BRepGProp::VolumeProperties(shape, props);
    double volume = props.Mass();  // GProp returns volume for VolumeProperties
    double mass = volume * density;
    gp_Pnt com = props.CentreOfMass();
    gp_Mat inertia = props.MatrixOfInertia();
    // Scale inertia by density (GProp returns volume-based inertia)
    // Pack into MassPropertiesResult
}
```

**Content hash:**
- Read the source file as bytes
- Compute SHA-256 (use a lightweight implementation or OpenSSL if available via vcpkg)
- Return hex-encoded hash string

### 5. Add OCCT source files to CMakeLists.txt
Add `src/cad_import.cpp` to the `motionlab-engine-lib` sources. Link OCCT libraries.

### 6. Write standalone test
Create `native/engine/tests/test_cad_import.cpp`:
- Load a sample STEP file from `native/engine/tests/fixtures/`
- Call `CadImporter::import_step()`
- Verify `result.success == true`
- Verify `result.bodies.size() > 0`
- For each body: verify non-empty mesh data (vertices.size() > 0, indices.size() > 0)
- Verify plausible mass properties (mass > 0, non-zero inertia)
- Verify content_hash is a 64-character hex string

### 7. Include a sample STEP file
Add a small but valid STEP file in `native/engine/tests/fixtures/`. Options:
- A simple box or cylinder (can be generated with FreeCAD or similar)
- A small multi-body assembly (2-3 parts) to test assembly extraction
- Keep it small (< 100 KB) for fast tests

Name it `native/engine/tests/fixtures/test_assembly.step`.

## Architecture Constraints
- Engine is authoritative for all geometry — source B-Rep stays in engine memory
- Only display meshes (tessellated triangles) cross the engine boundary
- MassProperties layout must match the proto schema: mass, center_of_mass (Vec3), inertia (6-component)
- Internal C++ structs are the source of truth during the spike; they will be mapped to proto messages by Prompt 2
- No frontend or protocol changes in this prompt
- Content hash enables the cache (Prompt 2) but this prompt only computes it, doesn't cache

## Done Looks Like
- `cmake --preset dev && cmake --build build/dev` succeeds with OCCT linked
- `ctest --preset dev` passes with the STEP import test
- Test imports a STEP file and produces: non-empty vertex arrays, non-empty index arrays, plausible mass values
- Assembly structure is extracted (multiple bodies from a multi-body file)
- Body names are extracted from the STEP file metadata
- Tessellation quality is controllable via the options parameter
- No regressions: existing handshake and ping/pong tests still pass

## What NOT to Build
- Protocol changes or proto schema expansion (that's Prompt 2)
- Transport wiring or ImportAssetCommand handling (that's Prompt 2)
- Asset cache (that's Prompt 2)
- Frontend UI, file dialogs, or body tree (that's Prompt 3)
- Viewport rendering of meshes (that's Epic 4)
- IGES testing (implement the function, but STEP is the priority for the spike)
- Material/color extraction from STEP (future enhancement)
```

---

## Prompt 2: Protocol Expansion + Asset Cache + Transport Wiring

```
# Epic 3 — Protocol Expansion, Asset Cache, and Transport Wiring

You are expanding the protobuf schema to support CAD import results and wiring the CadImporter (from Prompt 1) into the engine's transport layer. You also implement a content-addressed asset cache.

## Read These First (in order)
- `docs/architecture/principles.md` — non-negotiable rules
- `docs/architecture/protocol-overview.md` — protocol contract rules
- `schemas/AGENTS.md` — schema ownership
- `packages/protocol/AGENTS.md` — generated bindings are read-only artifacts
- `native/engine/AGENTS.md` — native boundary rules

## What Exists Now

### From Prompt 3.1 (completed):
- `native/engine/src/cad_import.h` — CadImporter class with `import_step()` returning `ImportResult` containing `BodyResult` (name, MeshData, MassPropertiesResult, transform)
- `native/engine/src/cad_import.cpp` — Working implementation using OpenCASCADE XDE reader, BRepMesh tessellation, BRepGProp mass properties
- Internal C++ structs: MeshData (vertices, indices, normals as flat arrays), MassPropertiesResult (mass, CoM, 6-component inertia), BodyResult, ImportResult

### `schemas/protocol/transport.proto`
Has stub messages that need expansion:
```protobuf
message ImportAssetCommand {
  string file_path = 1;
}
message ImportAssetResult {
  bool success = 1;
  string error_message = 2;
  AssetReference asset_ref = 3;
}
```
These are inside the Command and Event oneof envelopes.

### `schemas/mechanism/mechanism.proto`
Defines Body (name, pose, mass_properties, source_asset_ref), MassProperties (mass, center_of_mass, inertia), AssetReference (content_hash, relative_path, original_filename). No DisplayMesh message yet.

### `packages/protocol/src/transport.ts`
Binary helpers: `createHandshakeCommand()`, `createPingCommand()`, `parseEvent()`. Exports typed construction functions for the protocol layer.

### `packages/protocol/src/index.ts`
Re-exports generated types and convenience wrappers.

### `buf.yaml` + `buf.gen.yaml`
Codegen pipeline is working. `pnpm generate:proto` generates both TS and C++ from all schemas.

### `native/engine/src/transport.cpp`
Command switch handles `kHandshake` and `kPing` only. Binary protobuf on the wire. Uses `cmd.payload_case()` dispatch.

## What to Build

### 1. Add `DisplayMesh` message to `schemas/mechanism/mechanism.proto`
```protobuf
// Tessellated mesh for viewport display — NOT the source B-Rep.
// Flat arrays for efficient GPU upload.
message DisplayMesh {
  repeated float vertices = 1;   // flat [x,y,z, x,y,z, ...]
  repeated uint32 indices = 2;   // triangle indices
  repeated float normals = 3;    // flat [nx,ny,nz, nx,ny,nz, ...]
}
```
Add this as a field on Body if appropriate, or reference it from the import result.

### 2. Expand `ImportAssetCommand` in `schemas/protocol/transport.proto`
```protobuf
message ImportAssetCommand {
  string file_path = 1;
  ImportOptions import_options = 2;
}

message ImportOptions {
  double density_override = 1;       // kg/m^3, 0 = use default
  double tessellation_quality = 2;   // linear deflection, 0 = use default
  string unit_system = 3;           // "millimeter", "meter", "inch"
}
```

### 3. Expand `ImportAssetResult` in `schemas/protocol/transport.proto`
```protobuf
message ImportAssetResult {
  bool success = 1;
  string error_message = 2;
  repeated BodyImportResult bodies = 3;
  repeated string diagnostics = 4;
}

message BodyImportResult {
  string body_id = 1;          // generated UUIDv7
  string name = 2;
  DisplayMesh display_mesh = 3;
  MassProperties mass_properties = 4;
  Pose pose = 5;
  AssetReference source_asset_ref = 6;
}
```

### 4. Run `pnpm generate:proto` to regenerate TS + C++ code
After schema changes, regenerate all bindings. Verify:
- TS generated files in `packages/protocol/src/generated/` compile
- C++ generated files in `native/engine/src/generated/` compile
- No breaking changes to existing messages (buf breaking check)

### 5. Wire CadImporter into transport.cpp
Add import command handling to the command switch:
```cpp
case Command::kImportAsset: {
    const auto& import_cmd = cmd.import_asset();

    CadImporter importer;
    CadImporter::ImportOptions opts;
    if (import_cmd.has_import_options()) {
        if (import_cmd.import_options().density_override() > 0)
            opts.density = import_cmd.import_options().density_override();
        if (import_cmd.import_options().tessellation_quality() > 0)
            opts.tessellation_quality =
                import_cmd.import_options().tessellation_quality();
    }

    auto result = importer.import_step(import_cmd.file_path(), opts);

    // Build ImportAssetResult event
    motionlab::protocol::Event event;
    event.set_sequence_id(cmd.sequence_id());
    auto* import_result = event.mutable_import_asset_result();
    import_result->set_success(result.success);
    import_result->set_error_message(result.error_message);

    for (const auto& body : result.bodies) {
        auto* body_result = import_result->add_bodies();
        body_result->set_body_id(generate_uuidv7());
        body_result->set_name(body.name);

        auto* mesh = body_result->mutable_display_mesh();
        *mesh->mutable_vertices() = {body.mesh.vertices.begin(),
                                      body.mesh.vertices.end()};
        *mesh->mutable_indices() = {body.mesh.indices.begin(),
                                     body.mesh.indices.end()};
        *mesh->mutable_normals() = {body.mesh.normals.begin(),
                                     body.mesh.normals.end()};

        auto* mass = body_result->mutable_mass_properties();
        mass->set_mass(body.mass_properties.mass);
        // ... set CoM, inertia from body.mass_properties
    }

    std::string serialized;
    event.SerializeToString(&serialized);
    ws.sendBinary(serialized);
    break;
}
```

### 6. Implement content-addressed asset cache
Create `native/engine/src/asset_cache.h` and `native/engine/src/asset_cache.cpp`:

**Cache key:** SHA-256(source file content + serialized import options)
**Cache storage:** On-disk directory (e.g., `~/.motionlab/cache/assets/`)
**Cache entry:** Serialized protobuf `ImportAssetResult` (binary file on disk)

```cpp
class AssetCache {
public:
    explicit AssetCache(const std::string& cache_dir);

    // Returns cached result if available, nullopt otherwise
    std::optional<ImportResult> lookup(const std::string& cache_key);

    // Store result under cache key
    void store(const std::string& cache_key, const ImportResult& result);

    // Compute cache key from file content + options
    std::string compute_cache_key(const std::string& file_path,
                                   const CadImporter::ImportOptions& options);

    void clear();

private:
    std::string cache_dir_;
    std::string key_to_path(const std::string& key);
};
```

Wire the cache into the import command handler: check cache before calling CadImporter, store result after successful import.

### 7. Add UUIDv7 generation utility
Create a minimal UUIDv7 generator (or use a header-only library). UUIDv7 embeds a Unix timestamp and random bits. Used for generating body IDs during import.

### 8. Add protocol helpers to `packages/protocol/src/transport.ts`
```typescript
export function createImportAssetCommand(
  filePath: string,
  options?: {
    densityOverride?: number;
    tessellationQuality?: number;
    unitSystem?: string;
  },
  sequenceId?: bigint
): Uint8Array {
  const cmd = new Command({
    sequenceId: sequenceId ?? BigInt(Date.now()),
    payload: {
      case: 'importAsset',
      value: new ImportAssetCommand({
        filePath,
        importOptions: options ? new ImportOptions({
          densityOverride: options.densityOverride ?? 0,
          tessellationQuality: options.tessellationQuality ?? 0,
          unitSystem: options.unitSystem ?? '',
        }) : undefined,
      }),
    },
  });
  return cmd.toBinary();
}
```

Verify that `parseEvent()` already handles `importAssetResult` via the protobuf-es oneof — it should work automatically since it deserializes the full Event.

### 9. Update `packages/protocol/src/index.ts`
Export the new helper function and any new generated types that consumers need (ImportAssetCommand, ImportAssetResult, BodyImportResult, DisplayMesh, ImportOptions).

### 10. Write protocol seam test
Create or extend `packages/protocol/src/__tests__/roundtrip.test.ts`:
- Construct an ImportAssetCommand in TS with file path and options
- Serialize to binary
- Verify it deserializes correctly
- Construct an ImportAssetResult with body data, mesh, mass properties
- Serialize to binary, deserialize, verify all fields round-trip
- Verify DisplayMesh vertex/index/normal arrays survive serialization

## Architecture Constraints
- DisplayMesh is a transport/display artifact, NOT the B-Rep geometry
- Source B-Rep stays in engine memory — never serialized across the boundary
- Asset cache lives on the engine side — frontend never touches raw geometry or cache
- Cache key must include import options (different tessellation quality = different cache entry)
- UUIDv7 for body IDs — time-sortable, globally unique
- Frontend imports from `@motionlab/protocol`, never from generated paths directly

## Done Looks Like
- `pnpm generate:proto` succeeds with expanded schemas
- `cmake --preset dev && cmake --build build/dev` succeeds
- Engine receives an ImportAssetCommand over WebSocket, calls CadImporter, returns a full ImportAssetResult with mesh data and mass properties
- Cache avoids re-importing the same file with the same options
- Protocol seam test passes: ImportAssetCommand and ImportAssetResult round-trip through binary serialization
- TS helpers (`createImportAssetCommand`) are exported and typecheck
- No regressions: handshake and ping/pong still work

## What NOT to Build
- Frontend UI, file dialogs, or body tree (that's Prompt 3)
- Viewport rendering of meshes (that's Epic 4)
- Scene graph or selection system (that's Epic 4)
- Save/load mechanism files
- IGES transport wiring (only STEP for now, IGES can use the same path later)
```

---

## Prompt 3: Frontend Import Flow + Body Store + Basic Layout

```
# Epic 3 — Frontend Import Flow, Body Store, and Basic Layout

You are building the frontend import flow: file dialog, import command, body store, body tree, and inspector. This can start once the proto message shapes from Prompt 2 are agreed (the actual engine implementation can complete in parallel).

## Read These First (in order)
- `docs/architecture/principles.md` — React is NOT the hot path; frontend owns authoring UX
- `packages/frontend/AGENTS.md` — frontend owns workbench UX, uses Zustand, protocol contracts not backend assumptions
- `packages/ui/AGENTS.md` — UI component rules (TreeView, InspectorPanel, PropertyRow)
- `apps/AGENTS.md` — Electron shell rules, preload surface stays minimal

## What Exists Now

### `packages/frontend/src/App.tsx`
Header with engine status indicator and a test button. Renders the Viewport component in the main area. No layout panels, no sidebar structure.

### `packages/frontend/src/stores/engine-connection.ts`
Zustand store for connection state (discovering, connecting, handshaking, ready, error, disconnected). Established pattern for stores.

### `packages/frontend/src/engine/connection.ts`
WebSocket client handling binary protobuf. Handles `handshakeAck`, `engineStatus`, and `pong` event cases in the `parseEvent` switch. Updates the engine connection Zustand store.

### `packages/frontend/src/types/motionlab.d.ts`
Window type declaration:
```typescript
interface MotionLabAPI {
  platform: string;
  getEngineEndpoint(): Promise<MotionLabEndpoint>;
}
declare global {
  interface Window {
    motionlab?: MotionLabAPI;
  }
}
```
No file dialog methods.

### `apps/desktop/src/preload.ts`
Exposes `platform` and `getEngineEndpoint` via contextBridge. Uses `ipcRenderer.invoke('get-engine-endpoint')`. No file dialog support.

### `apps/desktop/src/main.ts`
IPC handler for `get-engine-endpoint`. Engine spawn + lifecycle management. No file dialog IPC handlers.

### `packages/ui/src/`
Existing UI primitives:
- `TreeView` — generic tree component with expand/collapse
- `PropertyRow` — label + value row for inspector panels
- `InspectorPanel` — container for property inspection
- `InspectorSection` — collapsible section within InspectorPanel
- `Shell/` and `Engineering/` subdirectories exist but are empty

### `packages/viewport/src/Viewport.tsx`
Babylon.js canvas with ArcRotateCamera and HemisphericLight. Render loop running. No scene graph, no mesh loading from data, no entity tracking.

### Protocol types (from Prompt 2):
After Prompt 2, the following are available via `@motionlab/protocol`:
- `createImportAssetCommand(filePath, options)` — constructs binary command
- `parseEvent()` — deserializes Event, including `importAssetResult` case
- `ImportAssetResult`, `BodyImportResult`, `DisplayMesh`, `MassProperties` — generated types

## What to Build

### 1. Create mechanism Zustand store
Create `packages/frontend/src/stores/mechanism.ts`:

```typescript
import { create } from 'zustand';

interface MeshData {
  vertices: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
}

interface BodyMassProperties {
  mass: number;
  centerOfMass: [number, number, number];
  inertia: [number, number, number, number, number, number]; // Ixx,Iyy,Izz,Ixy,Ixz,Iyz
}

interface BodyState {
  id: string;
  name: string;
  meshData: MeshData;
  massProperties: BodyMassProperties;
  pose: { position: [number, number, number]; rotation: [number, number, number, number] };
  sourceAssetRef: { contentHash: string; originalFilename: string };
}

interface MechanismState {
  bodies: Map<string, BodyState>;
  addBodies: (bodies: BodyState[]) => void;
  removeBody: (id: string) => void;
  clear: () => void;
}

export const useMechanismStore = create<MechanismState>((set) => ({
  bodies: new Map(),
  addBodies: (bodies) =>
    set((state) => {
      const next = new Map(state.bodies);
      for (const body of bodies) {
        next.set(body.id, body);
      }
      return { bodies: next };
    }),
  removeBody: (id) =>
    set((state) => {
      const next = new Map(state.bodies);
      next.delete(id);
      return { bodies: next };
    }),
  clear: () => set({ bodies: new Map() }),
}));
```

### 2. Add file dialog to Electron preload
Update `apps/desktop/src/preload.ts` to expose a file dialog method:
```typescript
contextBridge.exposeInMainWorld('motionlab', {
  platform: process.platform,
  getEngineEndpoint: () => ipcRenderer.invoke('get-engine-endpoint'),
  openFileDialog: (options: { filters?: Array<{ name: string; extensions: string[] }> }) =>
    ipcRenderer.invoke('show-open-dialog', options),
});
```

### 3. Add IPC handler in `apps/desktop/src/main.ts`
```typescript
import { dialog } from 'electron';

ipcMain.handle('show-open-dialog', async (_event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: options?.filters ?? [
      { name: 'CAD Files', extensions: ['step', 'stp', 'iges', 'igs'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});
```

### 4. Update `packages/frontend/src/types/motionlab.d.ts`
Add the file dialog method to the MotionLabAPI interface:
```typescript
interface MotionLabAPI {
  platform: string;
  getEngineEndpoint(): Promise<MotionLabEndpoint>;
  openFileDialog(options?: {
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<string | null>;
  onEngineStatusChanged?(callback: (status: string) => void): void;
}
```

### 5. Handle `importAssetResult` event in `connection.ts`
Add a case to the event payload switch in the WebSocket message handler:
```typescript
case 'importAssetResult': {
  const result = evt.payload.value;
  if (!result.success) {
    console.error('[connection] Import failed:', result.errorMessage);
    // Optionally surface error to UI via a notification store
    break;
  }
  const bodies = result.bodies.map((b) => ({
    id: b.bodyId,
    name: b.name,
    meshData: {
      vertices: new Float32Array(b.displayMesh?.vertices ?? []),
      indices: new Uint32Array(b.displayMesh?.indices ?? []),
      normals: new Float32Array(b.displayMesh?.normals ?? []),
    },
    massProperties: {
      mass: b.massProperties?.mass ?? 0,
      centerOfMass: [
        b.massProperties?.centerOfMass?.x ?? 0,
        b.massProperties?.centerOfMass?.y ?? 0,
        b.massProperties?.centerOfMass?.z ?? 0,
      ] as [number, number, number],
      inertia: (b.massProperties?.inertia ?? [0, 0, 0, 0, 0, 0]) as
        [number, number, number, number, number, number],
    },
    pose: {
      position: [
        b.pose?.position?.x ?? 0,
        b.pose?.position?.y ?? 0,
        b.pose?.position?.z ?? 0,
      ] as [number, number, number],
      rotation: [
        b.pose?.orientation?.x ?? 0,
        b.pose?.orientation?.y ?? 0,
        b.pose?.orientation?.z ?? 0,
        b.pose?.orientation?.w ?? 1,
      ] as [number, number, number, number],
    },
    sourceAssetRef: {
      contentHash: b.sourceAssetRef?.contentHash ?? '',
      originalFilename: b.sourceAssetRef?.originalFilename ?? '',
    },
  }));
  useMechanismStore.getState().addBodies(bodies);
  break;
}
```

### 6. Add `sendImportAsset` to `connection.ts`
Add a function that sends an ImportAssetCommand over the WebSocket:
```typescript
import { createImportAssetCommand } from '@motionlab/protocol';

export function sendImportAsset(filePath: string, options?: ImportOptions): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error('[connection] Cannot send import: not connected');
    return;
  }
  ws.send(createImportAssetCommand(filePath, options));
}
```

Export this from the connection module so components can call it.

### 7. Create the AppShell layout in App.tsx
Replace the flat layout with a flexbox three-panel structure:
```tsx
export function App() {
  return (
    <div className="app-shell" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header> {/* Engine status + import button + toolbar */} </header>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <aside style={{ width: 250, overflowY: 'auto' }}>
          <BodyTree />
        </aside>
        <main style={{ flex: 1 }}>
          <Viewport />
        </main>
        <aside style={{ width: 300, overflowY: 'auto' }}>
          <BodyInspector />
        </aside>
      </div>
    </div>
  );
}
```

### 8. Create import button in the header/toolbar
Add an Import button that:
1. Calls `window.motionlab?.openFileDialog({ filters: [{ name: 'CAD Files', extensions: ['step', 'stp', 'iges', 'igs'] }] })`
2. If a file path is returned (not null/canceled), calls `sendImportAsset(filePath)`
3. Shows a loading indicator while import is in progress
4. Handle `window.motionlab` being undefined (web mode) — disable the button or show a tooltip explaining desktop-only

### 9. Create `packages/frontend/src/components/BodyTree.tsx`
Use the TreeView component from `@motionlab/ui`:
```tsx
import { TreeView } from '@motionlab/ui';
import { useMechanismStore } from '../stores/mechanism';

export function BodyTree() {
  const bodies = useMechanismStore((s) => s.bodies);
  const items = Array.from(bodies.values()).map((body) => ({
    id: body.id,
    label: body.name,
    icon: 'body', // or a suitable icon identifier
  }));

  return (
    <div className="body-tree-panel">
      <h3>Bodies</h3>
      <TreeView items={items} onSelect={handleSelect} selectedId={selectedId} />
    </div>
  );
}
```
Wire up selection: clicking a tree item sets it as selected. Store selected ID in local state for now (the full selection store comes in Epic 4, but a simple local selection is needed here for the inspector).

### 10. Create `packages/frontend/src/components/BodyInspector.tsx`
Use InspectorPanel and PropertyRow from `@motionlab/ui`:
```tsx
import { InspectorPanel, InspectorSection, PropertyRow } from '@motionlab/ui';
import { useMechanismStore } from '../stores/mechanism';

export function BodyInspector({ selectedBodyId }: { selectedBodyId: string | null }) {
  const bodies = useMechanismStore((s) => s.bodies);
  const body = selectedBodyId ? bodies.get(selectedBodyId) : undefined;

  if (!body) {
    return <InspectorPanel><p>No body selected</p></InspectorPanel>;
  }

  return (
    <InspectorPanel>
      <InspectorSection title="Identity">
        <PropertyRow label="Name" value={body.name} />
        <PropertyRow label="Source" value={body.sourceAssetRef.originalFilename} />
      </InspectorSection>
      <InspectorSection title="Mass Properties">
        <PropertyRow label="Mass" value={`${body.massProperties.mass.toFixed(4)} kg`} />
        <PropertyRow label="CoM X" value={body.massProperties.centerOfMass[0].toFixed(4)} />
        <PropertyRow label="CoM Y" value={body.massProperties.centerOfMass[1].toFixed(4)} />
        <PropertyRow label="CoM Z" value={body.massProperties.centerOfMass[2].toFixed(4)} />
      </InspectorSection>
      <InspectorSection title="Inertia Tensor">
        <PropertyRow label="Ixx" value={body.massProperties.inertia[0].toFixed(6)} />
        <PropertyRow label="Iyy" value={body.massProperties.inertia[1].toFixed(6)} />
        <PropertyRow label="Izz" value={body.massProperties.inertia[2].toFixed(6)} />
        <PropertyRow label="Ixy" value={body.massProperties.inertia[3].toFixed(6)} />
        <PropertyRow label="Ixz" value={body.massProperties.inertia[4].toFixed(6)} />
        <PropertyRow label="Iyz" value={body.massProperties.inertia[5].toFixed(6)} />
      </InspectorSection>
    </InspectorPanel>
  );
}
```

### 11. Add basic selection concept
Implement a simple selection mechanism for this epic:
- Track `selectedBodyId` as state in App.tsx (or a lightweight selection store)
- Clicking a body in the tree sets it as selected
- Selected body is highlighted in the tree and shown in the inspector
- This will be replaced by the full selection store in Epic 4

## Architecture Constraints
- React is NOT the hot path — mechanism store holds data, connection module handles wire protocol
- No direct imports from generated protobuf paths — always import via `@motionlab/protocol`
- Frontend must handle `window.motionlab` being undefined gracefully (web mode): import button disabled, clear message
- Electron preload surface stays minimal — only file dialog + engine connection, no business logic
- Context isolation and sandbox must remain enabled
- Map protobuf types to frontend-friendly types in the connection handler, not in components

## Done Looks Like
- User can click Import button in the header
- File dialog opens filtered to STEP/IGES files
- After selecting a file, the import command is sent to the engine
- When the engine responds, bodies appear in the BodyTree sidebar
- Clicking a body in the tree shows its mass properties in the BodyInspector sidebar
- App has a three-panel layout: left sidebar (tree), center (viewport), right sidebar (inspector)
- Works in desktop mode; web mode shows import button disabled with explanation
- `pnpm --filter @motionlab/frontend typecheck` passes
- No regressions: engine status indicator still works, viewport still renders

## What NOT to Build
- Viewport rendering of imported bodies (that's Epic 4)
- Picking or selection in the viewport (that's Epic 4)
- Datum or joint creation UI (future epics)
- Save/load mechanism files
- Drag-and-drop file import
- Import progress bar (just a simple loading state)
- Context menus
- Undo/redo
```

---

## Integration Verification

After all three prompts complete, verify the full stack:

1. **OCCT build:** `cmake --preset dev && cmake --build build/dev` succeeds with OpenCASCADE linked
2. **Import test:** `ctest --preset dev` passes (STEP file import produces meshes and mass)
3. **Proto codegen:** `pnpm generate:proto` generates updated TS and C++ with expanded schemas
4. **TS typecheck:** `pnpm --filter @motionlab/protocol typecheck` and `pnpm --filter @motionlab/frontend typecheck` pass
5. **Protocol seam:** ImportAssetCommand/Result round-trip test passes
6. **Desktop integration:** `pnpm dev:desktop` — click Import → select STEP file → bodies appear in body tree → click body → mass properties shown in inspector
7. **Web fallback:** `pnpm dev:web` — import button disabled, app otherwise functional
8. **Cache validation:** Import the same file twice — second import completes near-instantly (cache hit)
