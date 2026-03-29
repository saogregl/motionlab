# Runtime Topology

## Current Runtime Topology

- The native engine (`native/engine`) listens on a loopback WebSocket (`127.0.0.1:<port>`) and performs a binary protobuf handshake with session token and protocol version validation. It uses `ixwebsocket` for transport. Single-client only.
- The WebSocket callback thread is no longer responsible for executing heavy engine commands. Authenticated commands are routed onto a dedicated native worker queue so import, compile, save/load, and scrub work do not block socket parsing or ping handling.
- Cached imports do not eagerly rebuild native topology state. Face-aware commands trigger lazy topology reload only when a retained shape is actually needed.
- Inside the native boundary, transport now delegates import/project concerns and runtime/session concerns to separate native modules instead of keeping those behaviors entirely inside one transport implementation block.
- `apps/desktop` will launch the engine process and expose the desktop shell (not yet implemented — Epic 1, Prompt 2).
- Desktop debug mode adds a local-only inspection layer for AI agents: Electron owns session manifests, bundle export, and artifact capture, while the renderer exposes a read-only debug API. This is not part of the engine protocol contract and does not move hot-path runtime transport through Electron.
- The renderer/frontend will connect through versioned protocol contracts (not yet implemented — Epic 1, Prompt 3).
- `apps/web` reuses the shared frontend without local native-process supervision.

## Target Runtime Topology (Planned)

> The following describes the intended topology. These capabilities are not yet implemented.

- The native engine owns runtime lifecycle, geometry processing, simulation compilation, and results production.
- Imported B-Rep shapes may be retained natively after import so the engine can answer topology-sensitive authoring commands such as face-aware datum creation.
- Imported CAD units are normalized inside the native boundary before authored mechanism bodies are published to the application contract.
- The desktop app supervises and packages the local runtime but does not proxy high-frequency simulation data.
- The viewport consumes runtime updates through stable contracts and keeps playback imperative.
- Capability-sensitive features, such as future Chrono sensor rendering paths, must be detected and surfaced gracefully.

## Rendering Backend

The viewport uses **Three.js** (r175) with **React Three Fiber** (R3F) for declarative scene orchestration and **@react-three/drei** for camera controls, environment lighting, grid, and gizmos. Rendering uses WebGL2 via Three.js's `WebGLRenderer`.

The `SceneGraphManager` class owns the imperative Three.js scene graph (bodies, datums, joints, loads) while the R3F `<Canvas>` manages the camera, controls, environment, and frame invalidation boundary. Materials use `MeshStandardMaterial` with PBR presets and an IBL studio environment for reflections.

Viewport rendering now uses **demand-driven invalidation** instead of an always-on render loop. Imperative scene mutations schedule renders through a coalesced `requestRender` callback, which keeps idle cost low while preserving the imperative simulation update path.

The canvas also uses **adaptive DPR within the existing 1.0-1.5 range** during sustained regressions. This is a renderer-local performance valve only; it does not change authored geometry, picking semantics, or the runtime transport contract.

Viewport-managed scene entities render on a dedicated Three.js layer that is also used by the custom imperative picking system. The R3F event raycaster remains on the default layer for declarative controls and gizmos, which prevents duplicate raycasts against heavy authored meshes during pointer interaction.

Hover picking is suspended while orbit or transform controls are actively dragging. Click picking still uses the viewport's custom picker, but drag interaction no longer continuously re-runs hover/face analysis against dense CAD meshes.

Body rendering now uses a **body root + child geometry mesh** scene graph. Picking and face highlight run against geometry-local topology rather than merged body meshes, which keeps `geometry_id + face_index` stable for multi-geometry bodies and attached geometry local poses. Body roots are created even when a body currently owns zero geometries so authored datums, joints, and loads on empty bodies remain visible and selectable.

Datum rendering is semantic rather than triad-only: planar datums render a persistent plane glyph, cylindrical/conical/toroidal datums render an axis glyph, and manual or point-like datums remain triad-only. Datum parent changes are treated as scene-graph rebuild events instead of pose-only updates.

Geometry meshes use **BVH-accelerated Three.js raycasting** for exact picking. Large static meshes may build their BVH asynchronously per geometry; while that acceleration is still building, select-mode hover is intentionally rate-limited so dense mesh hover does not monopolize the main thread. Face-aware modes still use exact triangle hits and preserve current picking semantics.

## Frame Streaming Path (Epic 8)

The engine sends `SimulationFrame` events containing body poses at the simulation tick rate. The frontend `connection.ts` handler:

1. Measures FPS (module-level counter, exposed via `getMeasuredFps()`).
2. Applies frame skipping for sub-1x playback speeds (e.g., 0.5x skips every other frame).
3. Applies batched `SceneGraphManager` body transform updates (viewport hot path).
4. Caches body poses in the module-level `body-poses.ts` map for inspector readout.

The body-poses module is intentionally not a Zustand store to avoid React re-renders on every simulation frame. Inspectors read from it imperatively, using `simTime` subscription as a low-frequency refresh trigger.

## Pre-Simulation Validation (Epic 17)

Validation runs engine-side inside `compile()`, before Chrono system creation:

1. `validate_mechanism()` inspects the authored Mechanism proto and accumulates `CompilationDiagnostic` entries (severity: ERROR, WARNING, INFO).
2. ERROR-level diagnostics block compilation. WARNING and INFO are non-blocking.
3. Structured diagnostics flow through proto `CompilationResultEvent.structured_diagnostics` to the frontend `structuredDiagnostics` store, and are rendered in the `DiagnosticsPanel`.
4. Clicking a diagnostic with `affectedEntityIds` selects the entity in the tree and viewport.

Checks implemented: NO_BODIES, NO_GROUND, ZERO_MASS, SELF_JOINT, DUPLICATE_ACTUATOR (errors); FLOATING_BODY, UNDER_CONSTRAINED, OVER_CONSTRAINED (warnings); DISCONNECTED_SUBGROUPS (info).

## Native Runtime Notes

- Successful compile transitions the runtime into a paused-ready state before play begins.
- Scrub is served from the engine ring buffer and publishes both a historical `SimulationFrame` and channel traces for the requested window.
- Trace extraction uses per-frame joint lookup tables inside the ring buffer path so scrub/trace cost does not require repeated linear scans across every joint state sample.

## Guardrails

- Do not turn Electron into a simulation data relay.
- Do not make the viewport authoritative for authored state.
- Do not let backend runtime objects escape the native boundary.
