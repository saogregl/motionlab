// Pure utilities (no renderer deps)
export { BodyGeometryIndex } from './body-geometry-index.js';
export { computeDatumLocalPose } from './datum-pose.js';
export { computeLabelLayout, type PlacedLabel, type ScreenLabel } from './label-layout.js';
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
// Joint glyph (technical-drawing style)
export {
  createJointGlyph,
  DOF_TABLE,
  type DofSpec,
  type GlyphMode,
  type JointGlyphResult,
} from './rendering/joint-glyph-three.js';
// Materials (Three.js)
export {
  createMaterialFactory,
  type MaterialFactory,
  type MaterialPreset,
} from './rendering/materials-three.js';
export {
  type DatumPreviewType,
  estimateAxisDirection,
  estimateSurfaceType,
} from './rendering/surface-type-estimator.js';
// Scene graph (Three.js implementation)
export {
  type BodyTransformUpdate,
  type CameraPreset,
  type DatumPreviewConfig,
  type DatumVisualFaceGeometry,
  type DatumVisualOptions,
  type DatumVisualSurfaceClass,
  type GizmoDragEndCallback,
  type GizmoDragEndEvent,
  type GizmoMode,
  type JointForceUpdate,
  type JointPreviewAlignment,
  type LabelEntry,
  type LoadStateInput,
  type MeshDataInput,
  type PoseInput,
  type SceneEntity,
  type SceneGraphDeps,
  SceneGraphManager,
} from './scene-graph-three.js';
