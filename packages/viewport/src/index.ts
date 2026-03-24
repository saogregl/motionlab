// Pure utilities (no renderer deps)
export { BodyGeometryIndex } from './body-geometry-index.js';
export { computeDatumLocalPose } from './datum-pose.js';
export { estimateAxisDirection, estimateSurfaceType, type DatumPreviewType } from './rendering/surface-type-estimator.js';

// Scene graph (Three.js implementation)
export {
  type BodyTransformUpdate,
  type CameraPreset,
  type DatumPreviewConfig,
  type GizmoDragEndCallback,
  type GizmoDragEndEvent,
  type GizmoMode,
  type JointForceUpdate,
  type JointPreviewAlignment,
  type LoadStateInput,
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

// DOF indicators
export {
  createDofIndicator,
  DOF_TABLE,
  type DofIndicatorResult,
  type DofSpec,
} from './rendering/dof-indicators-three.js';

// Joint anchor glyph
export {
  createJointAnchor,
  type JointAnchorResult,
} from './rendering/joint-anchor-three.js';
