# Viewport Architecture

This document captures the target architecture for `packages/viewport`. Implementation may land incrementally, but the ownership and boundary rules here are durable.

See also:

- [`principles.md`](./principles.md)
- [`runtime-topology.md`](./runtime-topology.md)
- [`sensor-architecture.md`](./sensor-architecture.md)
- [`results-architecture.md`](./results-architecture.md)

## Role

The viewport is a rendering and interaction runtime, not the product authority.

It owns:

- Babylon engine and scene lifecycle
- scene graph resources and render modes
- cameras, controls, overlays, gizmos, and utility layers
- picking and interaction translation
- playback application of runtime transforms
- sensor visualization surfaces and authored sensor overlays

It must not own:

- authoritative authored mechanism state
- simulation truth or backend semantics
- replay persistence or long-lived run storage
- product-facing protocol policy

## Integration Model

The viewport follows an imperative-root, declarative-host pattern.

- React owns mounting, layout, and high-level intent.
- The viewport controller owns the frame loop, Babylon scene mutation, and hot-path playback state.
- Backend selection should prefer WebGPU when available with clean fallback to WebGL.
- Per-frame scene updates must stay outside React state.

Representative controller surface:

- `createViewport(canvas, options)`
- `dispose()`
- `attachRun(runHandle)`
- `setSelection(selection)`
- `setMode("engineering" | "presentation")`
- `setPlaybackTime(t)`
- `setSensorView(sensorId, outputType)`

## Scene Model

The scene is composed of explicit subgraphs with stable ownership:

- static assembly graph for imported meshes and fixtures
- runtime transform graph for moving bodies and authored entities
- overlay graph for selection, datums, joints, and debug aids
- utility-layer graph for gizmos and transient interaction affordances
- sensor surface graph for frusta, badges, HUDs, and optional live previews

Every selectable or updatable product/runtime entity must resolve to one stable scene identity:

- `entityId`
- `entityKind`
- `nodeRef`
- optional `meshRef`
- optional `pickProxyRef`

Display assets are cacheable render resources, not engineering truth. The viewport may add, remove, swap LOD, restyle, and mount them to runtime transform nodes without reinterpreting product semantics.

## Data Planes and Clocks

The viewport consumes three data classes:

- authored view state for selection, tool mode, visibility, overlay toggles, and authoring previews
- live runtime data for body poses, joint state overlays, latest sensor values, and live clock state
- replay/query data for scrub ranges, point-in-time sensor frames, event markers, and summaries

These planes must not collapse into one store. The viewport keeps separate UI, live simulation, and replay clocks.

## Interaction and Playback

Picking is a two-stage process:

1. Babylon determines a render-space hit candidate.
2. Viewport services resolve that hit into a product/runtime entity.

Picking results must resolve to product entities such as bodies, datums, joints, sensors, overlays, or gizmo elements rather than exposing raw Babylon meshes as application identity.

Transient interaction affordances belong in utility layers. Authored scene content and gizmo/overlay controls should not share one graph unless there is a clear reason.

Playback applies runtime frames imperatively:

- mesh and material resources are created once or infrequently
- playback mutates transform nodes, visibility, and overlay state
- runtime motion updates do not round-trip through React

Sensors have two viewport-facing forms:

- authored overlays such as mount triads, frusta, sweep glyphs, and labels
- live surfaces such as image panels, HUDs, and optional in-scene previews

Sensor geometry belongs in the viewport. Primary sensor outputs remain dedicated viewers or panels rather than being forced into the 3D scene.

## Render Modes

The viewport should support one scene with mode-switched materials and overlays.

- Engineering mode prioritizes deterministic highlights, crisp overlays, x-ray/ghosting aids, and low post-processing.
- Presentation mode can enable richer materials, shadows, environment lighting, and reduced engineering chrome.

Do not maintain separate render stacks unless one scene can no longer satisfy both modes.

## Performance Rules

- Build a stable scene graph per model/run session and mutate existing nodes during playback.
- Prefer immutable mesh resources plus mutable transform nodes.
- Use thin instances for repeated visual markers only when independent bounds and rich per-entity overlays are not required.
- Avoid per-frame creation of materials, textures, buffers, helper meshes, or other GPU resources.
- Treat snapshot-style rendering as an opt-in optimization experiment, not the default viewport architecture.
- Keep instrumentation available in development for frame time, GPU time, draw calls, active meshes, textures, and buffers.

## Package Direction

The package should continue to separate the hot-path viewport runtime from higher-level integration concerns:

- `core/` for controller creation, engine selection, and lifecycle
- `scene/` for entity maps, scene registries, and asset mounts
- `picking/` for Babylon hit handling and product-entity resolution
- `overlays/` and `gizmos/` for transient engineering visuals
- `playback/` for pose buffering, interpolation, and transform application
- `sensors/` for authored overlays and live sensor-facing surfaces
- `modes/` and `diagnostics/` for render configuration and instrumentation

## Change Rules

- If viewport work changes runtime data contracts, update the relevant protocol, sensor, and results docs in the same change.
- If viewport work changes durable ownership boundaries or public contracts, add or update an ADR.
- Contract changes at the protocol or runtime seam require corresponding seam tests.
