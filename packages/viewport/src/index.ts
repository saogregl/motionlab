export { Viewport, type ViewportProps } from './Viewport.js';
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
  type PickResult,
} from './picking.js';

// Rendering primitives
export {
  setupEnvironment,
  type EnvironmentOptions,
  type EnvironmentSetup,
  createLightingRig,
  type LightingRig,
  type LightingRigOptions,
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
} from './rendering/index.js';
