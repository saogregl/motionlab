export { Viewport, type ViewportProps } from './Viewport.js';
export { BodyGeometryIndex } from './body-geometry-index.js';
export {
  SceneGraphManager,
  type CameraPreset,
  type MeshDataInput,
  type PoseInput,
  type SceneEntity,
  type SceneGraphDeps,
} from './scene-graph.js';
export {
  PickingManager,
  type PickCallback,
  type HoverCallback,
  type InteractionMode,
  type PickResult,
  type SpatialPickData,
} from './picking.js';
export { computeDatumLocalPose } from './datum-pose.js';

// Rendering primitives
export {
  setupEnvironment,
  type EnvironmentOptions,
  type EnvironmentSetup,
  createLightingRig,
  type LightingRig,
  createMaterialFactory,
  type MaterialFactory,
  type MaterialPreset,
  createGrid,
  type GridOverlay,
  type GridOptions,
  createPostProcessing,
  type PostProcessingPipeline,
  type PostProcessingOptions,
  createSelectionVisuals,
  type SelectionVisuals,
  CAD_NEUTRAL_STUDIO,
  type ViewportPreset,
} from './rendering/index.js';
