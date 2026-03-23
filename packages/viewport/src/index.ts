// Pure utilities (no renderer deps)
export { BodyGeometryIndex } from './body-geometry-index.js';
export { computeDatumLocalPose } from './datum-pose.js';
export { estimateAxisDirection, estimateSurfaceType, type DatumPreviewType } from './rendering/surface-type-estimator.js';

// Scene graph (Three.js implementation)
export {
  type CameraPreset,
  type GizmoDragEndCallback,
  type GizmoDragEndEvent,
  type GizmoMode,
  type MeshDataInput,
  type PoseInput,
  type SceneEntity,
  type SceneGraphDeps,
  SceneGraphManager,
} from './scene-graph-three.js';

// Viewport component (R3F)
export {
  type FaceHoverCallback,
  type HoverCallback,
  type InteractionMode,
  type PickCallback,
  type SpatialPickData,
  Viewport,
  type ViewportProps,
  type ViewportTheme,
} from './R3FViewport.js';

// Materials (Three.js)
export {
  createMaterialFactory,
  type MaterialFactory,
  type MaterialPreset,
} from './rendering/materials-three.js';
