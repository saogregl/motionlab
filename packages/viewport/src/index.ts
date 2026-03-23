export { BodyGeometryIndex } from './body-geometry-index.js';
export { computeDatumLocalPose } from './datum-pose.js';
export {
  DatumGizmoManager,
  type GizmoDragEndCallback,
  type GizmoDragEndEvent,
  type GizmoMode,
} from './gizmo-manager.js';
export {
  type FaceHoverCallback,
  type HoverCallback,
  type InteractionMode,
  type PickCallback,
  PickingManager,
  type PickResult,
  type SpatialPickData,
} from './picking.js';
// Rendering primitives
export {
  CAD_NEUTRAL_STUDIO,
  createGrid,
  createLightingRig,
  createMaterialFactory,
  createPostProcessing,
  createSelectionVisuals,
  type DatumPreviewConfig,
  type DatumPreviewType,
  ENTITY_COLORS,
  type EntityColorType,
  type EnvironmentOptions,
  type EnvironmentSetup,
  type GridOptions,
  type GridOverlay,
  type LightingRig,
  type LoadVisualData,
  type MaterialFactory,
  type MaterialPreset,
  type PostProcessingOptions,
  type PostProcessingPipeline,
  type SelectionMeshEntry,
  type SelectionVisuals,
  setupEnvironment,
  type ViewportPreset,
} from './rendering/index.js';
export {
  type CameraPreset,
  type MeshDataInput,
  type PoseInput,
  type SceneEntity,
  type SceneGraphDeps,
  SceneGraphManager,
} from './scene-graph.js';
export { Viewport, type ViewportProps } from './Viewport.js';
