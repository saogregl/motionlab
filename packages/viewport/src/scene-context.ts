/**
 * scene-context.ts
 *
 * Shared type definitions and the SceneContext interface consumed by all
 * viewport sub-managers.  This file has no runtime dependencies on other
 * project-local modules — only on Three.js and the rendering/ utilities.
 */

import type {
  ArrowHelper,
  BufferAttribute,
  BufferGeometry,
  Group,
  LineSegments,
  Mesh,
  OrthographicCamera,
  Scene,
  Vector3,
} from 'three';
import type { BodyGeometryIndex } from './body-geometry-index.js';
import type { Line2 } from './rendering/fat-line-three.js';
import type { JointGlyphResult } from './rendering/joint-glyph-three.js';
import type { MaterialFactory } from './rendering/materials-three.js';
import type { DatumPreviewType } from './rendering/surface-type-estimator.js';

// ── Public exported types ──────────────────────────────────────────────────
// These are re-exported from scene-graph-three.ts to maintain backward
// compatibility with existing consumers.

export type CameraPreset =
  | 'isometric'
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'fit-all';

export interface SceneEntity {
  readonly id: string;
  readonly type: 'body' | 'datum' | 'joint' | 'load' | 'actuator';
  readonly rootNode: Group;
  readonly meshes: Mesh[];
}

export interface MeshDataInput {
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
  readonly normals: Float32Array;
}

export interface PoseInput {
  readonly position: [number, number, number];
  readonly rotation: [number, number, number, number];
}

export type DatumVisualSurfaceClass =
  | 'planar'
  | 'cylindrical'
  | 'conical'
  | 'spherical'
  | 'toroidal'
  | 'other';

export interface DatumVisualFaceGeometry {
  readonly axisDirection?: { readonly x: number; readonly y: number; readonly z: number };
  readonly normal?: { readonly x: number; readonly y: number; readonly z: number };
  readonly radius?: number;
  readonly secondaryRadius?: number;
  readonly semiAngle?: number;
}

export interface DatumVisualOptions {
  readonly surfaceClass?: DatumVisualSurfaceClass;
  readonly faceGeometry?: DatumVisualFaceGeometry;
}

export interface JointPreviewAlignment {
  readonly kind: 'coaxial' | 'coplanar' | 'coincident' | 'perpendicular' | 'general';
  readonly axis?: { readonly x: number; readonly y: number; readonly z: number };
  readonly distance: number;
}

export type GizmoMode = 'translate' | 'rotate' | 'off';

export interface GizmoDragEndEvent {
  entityId: string;
  entityKind: 'datum' | 'body';
  position: [number, number, number];
  rotation: [number, number, number, number];
}

export type GizmoDragEndCallback = (event: GizmoDragEndEvent) => void;

/** Label data snapshot for the HTML overlay layer. */
export interface LabelEntry {
  entityId: string;
  entityType: 'body' | 'joint';
  name: string;
  jointType?: string;
  worldPosition: { x: number; y: number; z: number };
  /** Approximate screen-space radius of the entity's visual extent (px). */
  screenRadius: number;
  isSelected: boolean;
  isHovered: boolean;
}

export interface BodyTransformUpdate {
  id: string;
  pose: PoseInput;
}

export interface JointForceUpdate {
  jointId: string;
  force?: { x?: number; y?: number; z?: number };
  torque?: { x?: number; y?: number; z?: number };
}

export type BodyBvhState = 'none' | 'building' | 'ready' | 'failed';

export interface LoadStateInput {
  type?: string;
  datumId?: string;
  parentDatumId?: string;
  childDatumId?: string;
  vector?: { x?: number; y?: number; z?: number };
  referenceFrame?: 'datum-local' | 'world';
}

export interface DatumPreviewConfig {
  bodyId: string;
  type: 'point' | 'axis' | 'plane';
  position: [number, number, number];
  normal?: [number, number, number];
  axisDirection?: [number, number, number] | null;
}

// ── Internal types ─────────────────────────────────────────────────────────

export type SceneEntityInternal = SceneEntity & {
  readonly meta: EntityMeta;
};

export type HighlightedFace = {
  geometryId: string;
  faceIndex: number;
};

export type BodyGeometryRenderState = {
  id: string;
  name: string;
  rootNode: Group;
  mesh: Mesh;
  localPose: PoseInput;
  normals: Float32Array;
  indices: Uint32Array;
  geometryIndex?: BodyGeometryIndex;
  colorAttribute?: BufferAttribute;
  facePreviewCache: Map<number, FacePreviewData>;
  faceVertexIndicesCache: Map<number, Uint32Array>;
  edgeLines?: LineSegments;
  collisionWireframe?: Mesh;
  bvhState: BodyBvhState;
  bvhBuildToken: number;
};

export type BodyMeta = {
  kind: 'body';
  geometries: Map<string, BodyGeometryRenderState>;
  primaryGeometryId: string | null;
  highlightedFace: HighlightedFace | null;
  bodyName: string;
};

export type DatumMeta = {
  kind: 'datum';
  parentBodyId: string;
  localPose: PoseInput;
  surfaceClass?: DatumVisualSurfaceClass;
  faceGeometry?: DatumVisualFaceGeometry;
  disabledOpacity: number;
  emphasisOpacity: number;
  isCreationAnchor: boolean;
};

export type JointMeta = {
  kind: 'joint';
  parentDatumId: string;
  childDatumId: string;
  jointType: string;
  jointName: string;
  linkLine?: Line2;
  glyph?: JointGlyphResult;
  lowerLimit?: number;
  upperLimit?: number;
};

export type LoadMeta = {
  kind: 'load';
  loadState: LoadStateInput | null;
  kindTag: 'point-force' | 'point-torque' | 'spring-damper' | 'unknown';
  anchorDatumId?: string;
  secondDatumId?: string;
  line?: Line2;
  arrow?: ArrowHelper;
};

export type ActuatorMeta = {
  kind: 'actuator';
  jointId: string;
  actuatorType: string;
};

export type EntityMeta = BodyMeta | DatumMeta | JointMeta | LoadMeta | ActuatorMeta;

export type FacePreviewData = {
  previewType: DatumPreviewType;
  axisDirection: [number, number, number] | null;
  localCentroid: [number, number, number] | null;
};

export type PendingBvhBuild = {
  bodyId: string;
  geometryId: string;
  geometry: BufferGeometry;
  workerGeometry: BufferGeometry;
  buildToken: number;
};

// ── SceneContext interface ─────────────────────────────────────────────────
// The shared contract passed to all sub-managers.  SceneGraphManager
// implements this interface and passes `this` as the context.

export interface SceneContext {
  // ── Shared infrastructure ──
  readonly scene: Scene;
  readonly camera: OrthographicCamera;
  readonly materialFactory: MaterialFactory;

  // ── Shared mutable state ──
  readonly entities: Map<string, SceneEntityInternal>;
  readonly geometryToBodyId: Map<string, string>;

  // ── Selection / hover state (owned by SelectionManager) ──
  readonly currentSelectedIds: ReadonlySet<string>;
  readonly hoveredId: string | null;

  // ── Canvas state ──
  readonly canvasSize: { readonly width: number; readonly height: number };

  // ── Visibility flags (owned by VisibilityToggles) ──
  readonly datumsVisible: boolean;
  readonly jointAnchorsVisible: boolean;
  readonly collisionWireframesVisible: boolean;
  readonly comVisible: boolean;
  readonly comPositions: ReadonlyMap<string, Vector3>;

  // ── Mutation plumbing ──
  requestRender(): void;
  batchMutation<T>(fn: () => T): T;
  markJointRefreshNeeded(): void;
  markLoadRefreshNeeded(): void;
  markEntityListChanged(): void;

  // ── Cross-cutting behaviors ──
  applyVisualState(entity: SceneEntityInternal): void;
  applyHover(id: string | null): void;

  // ── Callbacks ──
  onLabelStateChanged?: () => void;
}

// ── Type guards ────────────────────────────────────────────────────────────

export function isBodyEntity(
  entity: SceneEntityInternal | undefined,
): entity is SceneEntityInternal & { meta: BodyMeta } {
  return Boolean(entity && entity.meta.kind === 'body');
}
