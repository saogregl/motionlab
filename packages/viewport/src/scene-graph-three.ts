/// <reference path="./three-mesh-bvh-worker.d.ts" />

import {
  ArrowHelper,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  EdgesGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/src/workers/GenerateMeshBVHWorker.js';

import { BodyGeometryIndex } from './body-geometry-index.js';
import { BvhManager } from './bvh-manager.js';
import { PreviewManager } from './preview-manager.js';
import { ensureBvhRaycastingPatched } from './rendering/bvh-raycast.js';
import {
  ACCENT,
  AXIS_X,
  AXIS_Y,
  AXIS_Z,
  ENTITY_COLORS,
  ENTITY_DATUM,
  ENTITY_JOINT,
  JOINT_GLYPH_HOVER,
  JOINT_GLYPH_SELECTED,
  JOINT_STEEL_BLUE,
  JOINT_TYPE_COLORS,
  MOTOR_INDICATOR,
  PREVIEW_OWNERSHIP_EDGE,
} from './rendering/colors-three.js';
import { type ComIndicatorResult, createComIndicator } from './rendering/com-indicator-three.js';
import {
  createFatLine,
  disposeFatLine,
  type FatLineOptions,
  isFatLine,
  Line2,
  LineMaterial,
  updateFatLineResolution,
} from './rendering/fat-line-three.js';
import { createFrameTriad, type FrameTriadResult } from './rendering/frame-triad-three.js';
import { createJointGlyph, type JointGlyphResult } from './rendering/joint-glyph-three.js';
import { createLimitVisual } from './rendering/limit-visuals-three.js';
import type { MaterialFactory } from './rendering/materials-three.js';
import { createMotorVisual } from './rendering/motor-visuals-three.js';
import { createOriginTriad, type OriginTriadResult } from './rendering/origin-triad-three.js';
import { updateSDFLineResolution } from './rendering/sdf-line-three.js';
import {
  type DatumPreviewType,
  estimateAxisDirection,
  estimateSurfaceType,
} from './rendering/surface-type-estimator.js';

// ── Internal types from scene-context.ts ──────────────────────────────────
import {
  type BodyBvhState,
  type BodyGeometryRenderState,
  type BodyMeta,
  type BodyTransformUpdate,
  type CameraPreset,
  type DatumMeta,
  type DatumPreviewConfig,
  type DatumVisualOptions,
  type EntityMeta,
  type FacePreviewData,
  type GizmoDragEndCallback,
  type GizmoMode,
  isBodyEntity,
  type JointForceUpdate,
  type JointMeta,
  type JointPreviewAlignment,
  type LabelEntry,
  type LoadMeta,
  type LoadStateInput,
  type MeshDataInput,
  type PendingBvhBuild,
  type PoseInput,
  type SceneEntity,
  type SceneEntityInternal,
} from './scene-context.js';

// ── Utilities from scene-graph-utils.ts ───────────────────────────────────
import {
  _anchorQuat,
  _anchorYAxis,
  _datumWorldQuat,
  _jointAxisScratch,
  BLACK,
  BVH_ASYNC_TRI_THRESHOLD,
  BVH_BUILD_OPTIONS,
  cloneColor,
  createJointColor,
  createLine,
  DATUM_COLOR,
  DEFAULT_BODY_COLOR,
  disposeObject3D,
  EPSILON,
  FACE_HIGHLIGHT_COLOR,
  getBodyEdgeLines,
  getBoxForRoots,
  getLoadBaseColor,
  getLoadKind,
  isMeshStandardMaterial,
  LOAD_COLOR,
  MIN_CAMERA_EXTENT,
  SKIP_AXIS_JOINT_TYPES,
  setCameraToBox,
  setLinePoints,
  setObjectLayerRecursive,
  setPose,
} from './scene-graph-utils.js';

// ── Public type re-exports (backward compat — index.ts imports from here) ──
export type {
  BodyBvhState,
  BodyTransformUpdate,
  CameraPreset,
  DatumPreviewConfig,
  DatumVisualFaceGeometry,
  DatumVisualOptions,
  DatumVisualSurfaceClass,
  GizmoDragEndCallback,
  GizmoDragEndEvent,
  GizmoMode,
  JointForceUpdate,
  JointPreviewAlignment,
  LabelEntry,
  LoadStateInput,
  MeshDataInput,
  PoseInput,
  SceneEntity,
} from './scene-context.js';

export const VIEWPORT_PICK_LAYER = 1;

export interface SceneGraphDeps {
  materialFactory: MaterialFactory;
  requestRender?: () => void;
}

export class SceneGraphManager {
  private readonly _scene: Scene;
  private readonly _camera: OrthographicCamera;
  private readonly deps: SceneGraphDeps;
  private readonly entities = new Map<string, SceneEntityInternal>();
  private readonly forceArrowIds = new Set<string>();
  // DOF indication is now merged into joint glyphs — no separate activeDofIndicators map.
  private readonly activeLimitVisuals = new Map<
    string,
    import('./rendering/limit-visuals-three.js').LimitVisual
  >();
  private readonly jointSelectionOverlays = new Map<string, Group>();
  private readonly activeBodyFrameTriads = new Map<string, FrameTriadResult>();
  private readonly activeGeometryFrameTriads = new Map<string, FrameTriadResult>();
  /** Reverse index: geometryId → body entity ID for O(1) lookup in selection overlays. */
  private readonly geometryToBodyId = new Map<string, string>();
  private readonly activeJointAxisLines = new Map<string, Line2>();
  private readonly activeComIndicators = new Map<string, ComIndicatorResult>();
  private readonly _comPositions = new Map<string, Vector3>();
  private readonly jointLineStart = new Vector3();
  private readonly jointLineEnd = new Vector3();
  private readonly jointLineCenter = new Vector3();
  private readonly lineOrigin = new Vector3();
  private readonly lineEnd = new Vector3();
  private readonly loadDirection = new Vector3(0, 1, 0);
  private readonly loadOrientation = new Quaternion();
  private readonly loadAnchor = new Vector3();
  private readonly loadSecond = new Vector3();
  private readonly faceNormalMatrix = new Matrix4();
  private readonly faceNormalVector = new Vector3();
  private readonly axisWorldVector = new Vector3();

  private currentSelectedIds = new Set<string>();
  private _pendingFocusRoots: Group[] | null = null;
  private _pendingFocusRaf = 0;
  private _pendingOverlayRaf = 0;
  private _pendingOverlaySelectedIds: Set<string> | null = null;
  private _pendingOverlayRawIds: Set<string> | null = null;
  private _selectionGeneration = 0;
  private _hoveredId: string | null = null;
  private readonly connectedBodyHighlights = new Set<string>();
  private _gridVisible = true;
  private _datumsVisible = true;
  private _jointAnchorsVisible = true;
  private _collisionWireframesVisible = false;
  private _labelsVisible = true;
  private _comVisible = true;
  private _canvasSize = { width: 1, height: 1 };
  private _gizmoMode: GizmoMode = 'off';
  private _gizmoAttachedId: string | null = null;
  private _gizmoDragEndCallback: GizmoDragEndCallback | undefined;
  private _gizmoTranslationSnap = 0.01;
  private _gizmoRotationSnap = Math.PI / 12;
  private _gizmoSpace: 'local' | 'world' = 'world';
  private _orbitTarget = new Vector3(0, 0, 0);
  private _originTriad: OriginTriadResult | null = null;
  private mutationDepth = 0;
  private pendingJointRefresh = false;
  private pendingLoadRefresh = false;
  private pendingEntityListChange = false;
  private pendingRender = false;
  private readonly _bvh: BvhManager;
  private readonly _preview: PreviewManager;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drei's useBounds return type isn't exported
  private boundsApi: any = null;

  private entityListChangedListeners: (() => void)[] = [];
  onGizmoStateChanged?: () => void;
  onGridVisibilityChanged?: () => void;
  onDatumsVisibilityChanged?: () => void;
  onJointAnchorsVisibilityChanged?: () => void;
  onLabelStateChanged?: () => void;

  constructor(scene: Scene, camera: OrthographicCamera, deps: SceneGraphDeps) {
    ensureBvhRaycastingPatched();
    this._scene = scene;
    this._camera = camera;
    this.deps = deps;
    this._bvh = new BvhManager(this as unknown as import('./scene-context.js').SceneContext);
    this._preview = new PreviewManager(
      this as unknown as import('./scene-context.js').SceneContext,
    );
    this._camera.layers.enable(VIEWPORT_PICK_LAYER);

    this._originTriad = createOriginTriad();
    this._scene.add(this._originTriad.rootNode);
  }

  get scene(): Scene {
    return this._scene;
  }

  get camera(): OrthographicCamera {
    return this._camera;
  }

  /** Register a listener called when entities are added or removed. Returns an unsubscribe function. */
  onEntityListChanged(listener: () => void): () => void {
    this.entityListChangedListeners.push(listener);
    return () => {
      const idx = this.entityListChangedListeners.indexOf(listener);
      if (idx >= 0) this.entityListChangedListeners.splice(idx, 1);
    };
  }

  private notifyEntityListChanged(): void {
    for (const listener of this.entityListChangedListeners) {
      listener();
    }
  }

  private requestRender(): void {
    if (this.mutationDepth > 0) {
      this.pendingRender = true;
      return;
    }
    this.deps.requestRender?.();
  }

  private markEntityListChanged(): void {
    if (this.mutationDepth > 0) {
      this.pendingEntityListChange = true;
      return;
    }
    this.notifyEntityListChanged();
  }

  private markJointRefreshNeeded(): void {
    if (this.mutationDepth > 0) {
      this.pendingJointRefresh = true;
      return;
    }
    this.refreshJointPositionsInternal();
  }

  private markLoadRefreshNeeded(): void {
    if (this.mutationDepth > 0) {
      this.pendingLoadRefresh = true;
      return;
    }
    this.refreshLoadVisualsInternal();
  }

  private flushPendingMutations(): void {
    const shouldRefreshJoints = this.pendingJointRefresh;
    const shouldRefreshLoads = this.pendingLoadRefresh;
    const shouldNotifyEntityList = this.pendingEntityListChange;
    const shouldRender = this.pendingRender;

    this.pendingJointRefresh = false;
    this.pendingLoadRefresh = false;
    this.pendingEntityListChange = false;
    this.pendingRender = false;

    if (shouldRefreshJoints) {
      this.refreshJointPositionsInternal();
    }
    if (shouldRefreshLoads) {
      this.refreshLoadVisualsInternal();
    }
    if (shouldNotifyEntityList) {
      this.notifyEntityListChanged();
    }
    if (shouldRender) {
      this.deps.requestRender?.();
    }
  }

  private batchMutation<T>(callback: () => T): T {
    this.mutationDepth += 1;
    try {
      return callback();
    } finally {
      this.mutationDepth -= 1;
      if (this.mutationDepth === 0) {
        this.flushPendingMutations();
      }
    }
  }

  private setBodyTransformInternal(id: string, pose: PoseInput): void {
    const entity = this.entities.get(id);
    if (!entity) return;
    setPose(entity.rootNode, pose);
  }

  private getBodyGeometryState(
    entity: SceneEntityInternal & { meta: BodyMeta },
    geometryId: string,
  ): BodyGeometryRenderState | null {
    return entity.meta.geometries.get(geometryId) ?? null;
  }

  private getPrimaryBodyGeometryState(
    entity: SceneEntityInternal & { meta: BodyMeta },
  ): BodyGeometryRenderState | null {
    if (entity.meta.primaryGeometryId) {
      return entity.meta.geometries.get(entity.meta.primaryGeometryId) ?? null;
    }
    const first = entity.meta.geometries.values().next();
    return first.done ? null : first.value;
  }

  private addDatumPlaneGlyph(root: Group): void {
    const halfExtent = 0.16;
    const outline = createFatLine(
      [
        new Vector3(-halfExtent, -halfExtent, 0),
        new Vector3(halfExtent, -halfExtent, 0),
        new Vector3(halfExtent, halfExtent, 0),
        new Vector3(-halfExtent, halfExtent, 0),
        new Vector3(-halfExtent, -halfExtent, 0),
      ],
      { color: DATUM_COLOR, transparent: true, opacity: 0.7 },
      { entityType: 'datum', datumGlyph: 'plane' },
    );
    root.add(outline);

    const fill = new Mesh(
      new PlaneGeometry(halfExtent * 2, halfExtent * 2),
      new MeshBasicMaterial({
        color: DATUM_COLOR,
        transparent: true,
        opacity: 0.08,
        side: DoubleSide,
        depthWrite: false,
        depthTest: false,
      }),
    );
    fill.userData = { entityType: 'datum', datumGlyph: 'plane-fill' };
    root.add(fill);
  }

  private addDatumAxisGlyph(root: Group): void {
    const axisLength = 0.3;
    const tip = new Vector3(0, 0, axisLength);
    const back = new Vector3(0, 0, axisLength - 0.06);
    root.add(
      createFatLine(
        [new Vector3(0, 0, -axisLength), tip],
        { color: DATUM_COLOR, transparent: true, opacity: 0.75 },
        { entityType: 'datum', datumGlyph: 'axis' },
      ),
    );
    root.add(
      createFatLine(
        [new Vector3(0.025, 0, back.z), tip, new Vector3(-0.025, 0, back.z)],
        { color: DATUM_COLOR, transparent: true, opacity: 0.75 },
        { entityType: 'datum', datumGlyph: 'axis-arrow' },
      ),
    );
  }

  private addDatumSphericalGlyph(root: Group): void {
    const radius = 0.1;
    const segments = 24;
    const points: Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push(new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
    }
    root.add(
      createFatLine(
        points,
        { color: DATUM_COLOR, transparent: true, opacity: 0.6, depthTest: false },
        { entityType: 'datum', datumGlyph: 'spherical' },
      ),
    );
  }

  private addDatumSemanticGlyph(root: Group, options?: DatumVisualOptions): void {
    switch (options?.surfaceClass) {
      case 'planar':
        this.addDatumPlaneGlyph(root);
        break;
      case 'cylindrical':
      case 'conical':
      case 'toroidal':
        this.addDatumAxisGlyph(root);
        break;
      case 'spherical':
        this.addDatumSphericalGlyph(root);
        break;
      default:
        break;
    }
  }

  private ensureGeometryColorAttribute(geometryState: BodyGeometryRenderState): BufferAttribute {
    const existing = geometryState.colorAttribute;
    if (existing) {
      return existing;
    }

    const geometry = geometryState.mesh.geometry as BufferGeometry;
    const vertexCount = geometry.getAttribute('position').count;
    const colors = new Float32Array(vertexCount * 3);
    colors.fill(1);
    const colorAttribute = new BufferAttribute(colors, 3);
    colorAttribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute('color', colorAttribute);
    (geometryState.mesh.material as MeshStandardMaterial).vertexColors = true;
    (geometryState.mesh.material as MeshStandardMaterial).needsUpdate = true;
    geometryState.colorAttribute = colorAttribute;
    return colorAttribute;
  }

  private removeBodyGeometryState(
    entity: SceneEntityInternal & { meta: BodyMeta },
    geometryState: BodyGeometryRenderState,
  ): void {
    entity.rootNode.remove(geometryState.rootNode);
    disposeObject3D(geometryState.rootNode);
    entity.meta.geometries.delete(geometryState.id);
    this.geometryToBodyId.delete(geometryState.id);
    const meshIndex = entity.meshes.indexOf(geometryState.mesh);
    if (meshIndex >= 0) {
      entity.meshes.splice(meshIndex, 1);
    }

    if (entity.meta.primaryGeometryId === geometryState.id) {
      const nextPrimary = entity.meta.geometries.values().next();
      entity.meta.primaryGeometryId = nextPrimary.done ? null : nextPrimary.value.id;
    }

    if (entity.meta.highlightedFace?.geometryId === geometryState.id) {
      entity.meta.highlightedFace = null;
    }
  }

  private getFaceVertexIndices(
    entity: SceneEntityInternal & { meta: BodyMeta },
    geometryId: string,
    faceIndex: number,
  ): Uint32Array {
    const geometryState = this.getBodyGeometryState(entity, geometryId);
    if (!geometryState) {
      return new Uint32Array(0);
    }

    const cached = geometryState.faceVertexIndicesCache.get(faceIndex);
    if (cached) {
      return cached;
    }

    const geometry = geometryState.mesh.geometry as BufferGeometry;
    const indexAttr = geometry.getIndex();
    const geometryIndex = geometryState.geometryIndex;
    if (!indexAttr || !geometryIndex) {
      const empty = new Uint32Array(0);
      geometryState.faceVertexIndicesCache.set(faceIndex, empty);
      return empty;
    }

    const faceRange = geometryIndex.faceRanges[faceIndex];
    const unique = new Set<number>();
    for (let tri = faceRange.start; tri < faceRange.start + faceRange.count; tri++) {
      const base = tri * 3;
      unique.add(indexAttr.getX(base));
      unique.add(indexAttr.getX(base + 1));
      unique.add(indexAttr.getX(base + 2));
    }

    const vertices = Uint32Array.from(unique);
    geometryState.faceVertexIndicesCache.set(faceIndex, vertices);
    return vertices;
  }

  /**
   * Compute the geometric center of a face in geometry-local (object) space.
   *
   * - **Planar faces**: vertex centroid (average of all face vertex positions).
   * - **Cylindrical (axis) faces**: least-squares circle fit on the cross-section
   *   perpendicular to the estimated axis, giving the true axis center even for
   *   partial arcs and non-uniform OCCT tessellation.
   * - **Other**: vertex centroid fallback.
   */
  private computeFaceLocalCentroid(
    entity: SceneEntityInternal & { meta: BodyMeta },
    geometryId: string,
    faceIndex: number,
    previewType: DatumPreviewType,
    axisDirection: [number, number, number] | null,
  ): [number, number, number] | null {
    const geometryState = this.getBodyGeometryState(entity, geometryId);
    if (!geometryState) return null;

    const vertexIndices = this.getFaceVertexIndices(entity, geometryId, faceIndex);
    if (vertexIndices.length === 0) return null;

    const geometry = geometryState.mesh.geometry as BufferGeometry;
    const posAttr = geometry.getAttribute('position');
    if (!posAttr) return null;

    // Read vertex positions
    const n = vertexIndices.length;
    const positions: [number, number, number][] = new Array(n);
    let cx = 0,
      cy = 0,
      cz = 0;
    for (let i = 0; i < n; i++) {
      const vi = vertexIndices[i]!;
      const px = posAttr.getX(vi);
      const py = posAttr.getY(vi);
      const pz = posAttr.getZ(vi);
      positions[i] = [px, py, pz];
      cx += px;
      cy += py;
      cz += pz;
    }
    cx /= n;
    cy /= n;
    cz /= n;

    // For non-axis faces, vertex centroid is correct
    if (previewType !== 'axis' || !axisDirection) {
      return [cx, cy, cz];
    }

    // --- Cylindrical face: circle-fit in the cross-section plane ---
    const [dx, dy, dz] = axisDirection;

    // Build orthonormal basis (U, W) perpendicular to axis D
    let ux: number, uy: number, uz: number;
    if (Math.abs(dy) < 0.9) {
      // cross(D, worldUp) where worldUp = (0,1,0)
      ux = dz;
      uy = 0;
      uz = -dx;
    } else {
      // cross(D, worldRight) where worldRight = (1,0,0)
      ux = 0;
      uy = -dz;
      uz = dy;
    }
    const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz);
    if (uLen < 1e-12) return [cx, cy, cz];
    ux /= uLen;
    uy /= uLen;
    uz /= uLen;

    // W = cross(D, U)
    const wx = dy * uz - dz * uy;
    const wy = dz * ux - dx * uz;
    const wz = dx * uy - dy * ux;

    // Project vertices onto the 2D plane (u, w) and along axis (h)
    const us = new Float64Array(n);
    const ws = new Float64Array(n);
    let hSum = 0;
    for (let i = 0; i < n; i++) {
      const [px, py, pz] = positions[i]!;
      us[i] = px * ux + py * uy + pz * uz;
      ws[i] = px * wx + py * wy + pz * wz;
      hSum += px * dx + py * dy + pz * dz;
    }
    const hCenter = hSum / n;

    // Center the 2D data for better numerical conditioning
    let uMean = 0,
      wMean = 0;
    for (let i = 0; i < n; i++) {
      uMean += us[i]!;
      wMean += ws[i]!;
    }
    uMean /= n;
    wMean /= n;

    // Kasa algebraic circle fit:
    // Minimize sum((ui-a)^2 + (wi-b)^2 - R^2)^2
    // Solve 2x2 system for center offset (a', b') from mean
    let Suu = 0,
      Svv = 0,
      Suv = 0,
      Suuu = 0,
      Svvv = 0,
      Suvv = 0,
      Svuu = 0;
    for (let i = 0; i < n; i++) {
      const u = us[i]! - uMean;
      const v = ws[i]! - wMean;
      const uu = u * u;
      const vv = v * v;
      Suu += uu;
      Svv += vv;
      Suv += u * v;
      Suuu += uu * u;
      Svvv += vv * v;
      Suvv += u * vv;
      Svuu += v * uu;
    }

    // | Suu  Suv | | a' |   | 0.5*(Suuu + Suvv) |
    // | Suv  Svv | | b' | = | 0.5*(Svvv + Svuu) |
    const det = Suu * Svv - Suv * Suv;
    if (Math.abs(det) < 1e-20) {
      // Degenerate (collinear vertices) — fall back to vertex centroid
      return [cx, cy, cz];
    }

    const rhs1 = 0.5 * (Suuu + Suvv);
    const rhs2 = 0.5 * (Svvv + Svuu);
    const aLocal = (rhs1 * Svv - rhs2 * Suv) / det;
    const bLocal = (rhs2 * Suu - rhs1 * Suv) / det;

    // Circle center in original 2D coords
    const uCenter = aLocal + uMean;
    const wCenter = bLocal + wMean;

    // Transform back to 3D: center = uCenter*U + wCenter*W + hCenter*D
    return [
      uCenter * ux + wCenter * wx + hCenter * dx,
      uCenter * uy + wCenter * wy + hCenter * dy,
      uCenter * uz + wCenter * wz + hCenter * dz,
    ];
  }

  private setFaceVertexColor(
    attribute: BufferAttribute,
    vertexIndices: Uint32Array,
    color: Color,
  ): void {
    for (let i = 0; i < vertexIndices.length; i++) {
      attribute.setXYZ(vertexIndices[i] ?? 0, color.r, color.g, color.b);
    }
    attribute.needsUpdate = true;
  }

  setCanvasSize(width: number, height: number): void {
    this._canvasSize.width = Math.max(1, width);
    this._canvasSize.height = Math.max(1, height);
    updateFatLineResolution(this._canvasSize.width, this._canvasSize.height);
    updateSDFLineResolution(this._canvasSize.width, this._canvasSize.height);
  }

  /** Injected by BoundsBridge — provides drei Bounds camera-fitting API. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setBoundsApi(api: any): void {
    this.boundsApi = api;
  }

  private get canvasAspect(): number {
    return this._canvasSize.width / Math.max(this._canvasSize.height, 1);
  }

  upsertBody(id: string, name: string, pose: PoseInput): SceneEntity {
    return this.batchMutation(() => {
      const existing = this.entities.get(id);
      if (existing) {
        this.removeBody(id);
      }

      const group = new Group();
      group.name = `body_${id}`;
      group.userData = { entityId: id, entityType: 'body' };

      setPose(group, pose);
      setObjectLayerRecursive(group, VIEWPORT_PICK_LAYER);
      this._scene.add(group);

      const entity: SceneEntityInternal = {
        id,
        type: 'body',
        rootNode: group,
        meshes: [],
        meta: {
          kind: 'body',
          geometries: new Map(),
          primaryGeometryId: null,
          highlightedFace: null,
          bodyName: name,
        },
      };
      this.entities.set(id, entity);

      for (const child of this.entities.values()) {
        if (child.meta.kind !== 'datum' || child.meta.parentBodyId !== id) continue;
        group.attach(child.rootNode);
        setPose(child.rootNode, child.meta.localPose);
      }

      this.markJointRefreshNeeded();
      this.markLoadRefreshNeeded();
      this.applyVisualState(entity);
      this.markEntityListChanged();
      this.requestRender();
      return entity;
    });
  }

  addBodyGeometry(
    bodyId: string,
    geometryId: string,
    name: string,
    meshData: MeshDataInput,
    localPose: PoseInput,
    partIndex?: Uint32Array,
  ): void {
    this.batchMutation(() => {
      const entity = this.entities.get(bodyId);
      if (!isBodyEntity(entity)) {
        return;
      }

      const existingGeometry = this.getBodyGeometryState(entity, geometryId);
      if (existingGeometry) {
        this.removeBodyGeometryState(entity, existingGeometry);
      }

      const geometryRoot = new Group();
      geometryRoot.name = `body_geometry_${geometryId}`;
      geometryRoot.userData = {
        entityId: bodyId,
        entityType: 'body',
        geometryId,
      };

      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(meshData.vertices, 3));
      geometry.setAttribute('normal', new BufferAttribute(meshData.normals, 3));
      geometry.setIndex(new BufferAttribute(meshData.indices, 1));

      let allZero = true;
      for (let i = 0; i < meshData.normals.length; i++) {
        if (meshData.normals[i] !== 0) {
          allZero = false;
          break;
        }
      }
      if (allZero) {
        geometry.computeVertexNormals();
      }

      const material = new MeshStandardMaterial({
        color: DEFAULT_BODY_COLOR.clone(),
        roughness: 0.65,
        metalness: 0.35,
        envMapIntensity: 0.4,
        flatShading: false,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });

      const mesh = new Mesh(geometry, material);
      mesh.name = `body_mesh_${geometryId}`;
      mesh.userData = { entityId: bodyId, entityType: 'body', geometryId };
      geometryRoot.add(mesh);

      const triangleCount = meshData.indices.length / 3;
      const EDGE_DEFER_THRESHOLD = 100_000;
      let edgeLines: LineSegments | undefined;
      if (triangleCount <= EDGE_DEFER_THRESHOLD) {
        const edgesGeometry = new EdgesGeometry(geometry, 15);
        const edgesMaterial = new LineBasicMaterial({
          color: 0x444444,
          transparent: true,
          opacity: 0.85,
          toneMapped: false,
          depthWrite: false,
          linewidth: 1,
        });
        edgeLines = new LineSegments(edgesGeometry, edgesMaterial);
        edgeLines.name = `body_edges_${geometryId}`;
        edgeLines.userData = { entityId: bodyId, entityType: 'body', geometryId, isEdge: true };
        edgeLines.renderOrder = 1;
        geometryRoot.add(edgeLines);
      }

      setPose(geometryRoot, localPose);
      setObjectLayerRecursive(geometryRoot, VIEWPORT_PICK_LAYER);
      entity.rootNode.add(geometryRoot);

      const geometryState: BodyGeometryRenderState = {
        id: geometryId,
        name,
        rootNode: geometryRoot,
        mesh,
        localPose,
        normals: meshData.normals,
        indices: meshData.indices,
        geometryIndex: partIndex ? new BodyGeometryIndex(partIndex) : undefined,
        facePreviewCache: new Map(),
        faceVertexIndicesCache: new Map(),
        edgeLines,
        bvhState: 'none',
        bvhBuildToken: 0,
      };

      if (entity.meta.primaryGeometryId === null) {
        entity.meta.primaryGeometryId = geometryId;
      }
      entity.meta.geometries.set(geometryId, geometryState);
      this.geometryToBodyId.set(geometryId, bodyId);
      entity.meshes.push(mesh);

      if (triangleCount > EDGE_DEFER_THRESHOLD) {
        setTimeout(() => {
          const currentEntity = this.entities.get(bodyId);
          if (!isBodyEntity(currentEntity)) return;
          const currentGeometry = this.getBodyGeometryState(currentEntity, geometryId);
          if (!currentGeometry) return;
          if (currentGeometry.mesh.geometry !== geometry) return;
          const edgesGeometry = new EdgesGeometry(geometry, 15);
          const edgesMaterial = new LineBasicMaterial({
            color: 0x444444,
            transparent: true,
            opacity: 0.85,
            toneMapped: false,
            depthWrite: false,
            linewidth: 1,
          });
          const deferred = new LineSegments(edgesGeometry, edgesMaterial);
          deferred.name = `body_edges_${geometryId}`;
          deferred.userData = { entityId: bodyId, entityType: 'body', geometryId, isEdge: true };
          deferred.renderOrder = 1;
          setObjectLayerRecursive(deferred, VIEWPORT_PICK_LAYER);
          currentGeometry.rootNode.add(deferred);
          currentGeometry.edgeLines = deferred;
          this.applyVisualState(currentEntity);
          this.requestRender();
        }, 0);
      }

      this._bvh.scheduleBodyBvhBuild(bodyId, geometryId, geometry, triangleCount);
      this.applyVisualState(entity);
      this.markEntityListChanged();
      this.requestRender();
    });
  }

  addBody(
    id: string,
    name: string,
    meshData: MeshDataInput,
    pose: PoseInput,
    partIndex?: Uint32Array,
  ): SceneEntity {
    const entity = this.upsertBody(id, name, pose);
    this.addBodyGeometry(
      id,
      id,
      name,
      meshData,
      {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
      },
      partIndex,
    );
    return entity;
  }

  removeBody(id: string): boolean {
    return this.batchMutation(() => {
      const entity = this.entities.get(id);
      if (!entity || entity.meta.kind !== 'body') {
        return false;
      }

      for (const child of this.entities.values()) {
        if (child.meta.kind === 'datum' && child.meta.parentBodyId === id) {
          this._scene.attach(child.rootNode);
        }
      }

      this._scene.remove(entity.rootNode);
      disposeObject3D(entity.rootNode);
      this.entities.delete(id);
      this.markEntityListChanged();
      this.markJointRefreshNeeded();
      this.markLoadRefreshNeeded();
      this.requestRender();
      return true;
    });
  }

  updateBodyTransform(id: string, pose: PoseInput): void {
    this.batchMutation(() => {
      this.setBodyTransformInternal(id, pose);
      this.markJointRefreshNeeded();
      this.markLoadRefreshNeeded();
      this.requestRender();
    });
  }

  applyBodyTransforms(updates: readonly BodyTransformUpdate[]): void {
    this.batchMutation(() => {
      for (const update of updates) {
        this.setBodyTransformInternal(update.id, update.pose);
      }
      this.markJointRefreshNeeded();
      this.markLoadRefreshNeeded();
      this.requestRender();
    });
  }

  getEntity(id: string): SceneEntity | undefined {
    return this.entities.get(id);
  }

  getAllEntities(): SceneEntity[] {
    return Array.from(this.entities.values());
  }

  getAllPickableMeshes(): Mesh[] {
    return Array.from(this.entities.values()).flatMap((entity) => entity.meshes);
  }

  getEntityWorldPosition(id: string): { x: number; y: number; z: number } | null {
    const entity = this.entities.get(id);
    if (!entity) return null;
    const pos = new Vector3();
    entity.rootNode.getWorldPosition(pos);
    return { x: pos.x, y: pos.y, z: pos.z };
  }

  fitAll(): void {
    const roots = Array.from(this.entities.values())
      .filter((entity) => entity.type === 'body')
      .map((entity) => entity.rootNode);
    if (roots.length === 0) return;
    const box = getBoxForRoots(roots);
    if (this.boundsApi) {
      this.boundsApi.refresh(box).fit();
    } else {
      setCameraToBox(this._camera, box, new Vector3(1, 1, 1).normalize(), this.canvasAspect);
    }
    this.requestRender();
  }

  clear(): void {
    this.batchMutation(() => {
      this._bvh.clear();
      for (const entity of this.entities.values()) {
        this._scene.remove(entity.rootNode);
        disposeObject3D(entity.rootNode);
      }
      this.entities.clear();
      this.forceArrowIds.clear();
      this._preview.clear();
      this.markEntityListChanged();
      this.requestRender();
    });
  }

  dispose(): void {
    this.clear();
    this._preview.dispose();
  }

  addDatum(
    id: string,
    parentBodyId: string,
    localPose: PoseInput,
    _name?: string,
    options?: DatumVisualOptions,
  ): SceneEntity | undefined {
    return this.batchMutation(() => {
      const parent = this.entities.get(parentBodyId);
      if (!parent || parent.meta.kind !== 'body') {
        return undefined;
      }

      this.removeDatum(id);

      const root = new Group();
      root.name = `datum_${id}`;
      root.userData = { entityId: id, entityType: 'datum' };

      const pickSphere = new Mesh(
        new SphereGeometry(0.04, 8, 8),
        new MeshBasicMaterial({ visible: false }),
      );
      pickSphere.userData = { entityId: id, entityType: 'datum' };
      root.add(pickSphere);

      const originDot = new Mesh(
        new SphereGeometry(0.012, 8, 8),
        new MeshBasicMaterial({ color: ENTITY_DATUM, toneMapped: false }),
      );
      root.add(originDot);

      this.addDatumSemanticGlyph(root, options);

      const AXIS_LENGTH = 0.18;
      const ARROW_SIZE = 0.03;
      const axisColors = [AXIS_X, AXIS_Y, AXIS_Z] as const;
      const axisDirections: [number, number, number][] = [
        [AXIS_LENGTH, 0, 0],
        [0, AXIS_LENGTH, 0],
        [0, 0, AXIS_LENGTH],
      ];

      for (let i = 0; i < 3; i++) {
        const [dx, dy, dz] = axisDirections[i];
        const color = axisColors[i];
        const axisEnd = new Vector3(dx, dy, dz);
        root.add(createFatLine([this.lineOrigin, axisEnd], { color, depthTest: false }, {}));

        const dir = axisEnd.clone().normalize();
        const perp = new Vector3();
        if (Math.abs(dir.y) < 0.9) {
          perp.crossVectors(dir, new Vector3(0, 1, 0)).normalize();
        } else {
          perp.crossVectors(dir, new Vector3(1, 0, 0)).normalize();
        }
        const back = axisEnd.clone().sub(dir.clone().multiplyScalar(ARROW_SIZE));
        root.add(
          createFatLine(
            [
              back.clone().add(perp.clone().multiplyScalar(ARROW_SIZE * 0.4)),
              axisEnd.clone(),
              back.clone().sub(perp.clone().multiplyScalar(ARROW_SIZE * 0.4)),
            ],
            { color, depthTest: false },
            {},
          ),
        );
      }

      setPose(root, localPose);
      setObjectLayerRecursive(root, VIEWPORT_PICK_LAYER);
      parent.rootNode.add(root);

      const entity: SceneEntityInternal = {
        id,
        type: 'datum',
        rootNode: root,
        meshes: [pickSphere],
        meta: {
          kind: 'datum',
          parentBodyId,
          localPose,
          surfaceClass: options?.surfaceClass,
          faceGeometry: options?.faceGeometry,
          disabledOpacity: 1,
          emphasisOpacity: 1,
          isCreationAnchor: false,
        },
      };
      this.entities.set(id, entity);
      this.applyVisualState(entity);
      if (!this._datumsVisible) {
        root.visible = false;
      }
      this.markEntityListChanged();
      this.markJointRefreshNeeded();
      this.markLoadRefreshNeeded();
      this.requestRender();
      return entity;
    });
  }

  updateDatumPose(id: string, localPose: PoseInput): void {
    this.batchMutation(() => {
      const entity = this.entities.get(id);
      if (!entity || entity.meta.kind !== 'datum') return;
      entity.meta.localPose = localPose;
      setPose(entity.rootNode, localPose);
      this.markJointRefreshNeeded();
      this.markLoadRefreshNeeded();
      this.requestRender();
    });
  }

  removeDatum(id: string): boolean {
    return this.batchMutation(() => {
      const entity = this.entities.get(id);
      if (!entity || entity.meta.kind !== 'datum') return false;
      entity.rootNode.removeFromParent();
      disposeObject3D(entity.rootNode);
      this.entities.delete(id);
      this.markEntityListChanged();
      this.markJointRefreshNeeded();
      this.markLoadRefreshNeeded();
      this.requestRender();
      return true;
    });
  }
  addJoint(
    id: string,
    parentDatumId: string,
    childDatumId: string,
    jointType: string,
    name?: string,
  ): SceneEntity | undefined {
    return this.batchMutation(() => {
      this.removeJoint(id);

      const root = new Group();
      root.name = `joint_${id}`;
      root.userData = { entityId: id, entityType: 'joint', jointType };

      const color = createJointColor(jointType);
      const linkLine = createLine([this.lineOrigin, this.lineOrigin], color, {
        entityId: id,
        entityType: 'joint',
      });
      // Enable transparency for hover/idle opacity changes
      (linkLine.material as LineMaterial).transparent = true;
      (linkLine.material as LineMaterial).opacity = 0.6;
      root.add(linkLine);

      // Technical-drawing-style joint glyph (replaces mesh anchor + DOF indicator)
      const glyph = createJointGlyph(jointType);
      glyph.rootNode.userData = { entityId: id, entityType: 'joint' };
      glyph.setMode('idle');
      root.add(glyph.rootNode);

      const jointName = name || jointType;

      setObjectLayerRecursive(root, VIEWPORT_PICK_LAYER);

      this._scene.add(root);

      const entity: SceneEntityInternal = {
        id,
        type: 'joint',
        rootNode: root,
        meshes: [],
        meta: {
          kind: 'joint',
          parentDatumId,
          childDatumId,
          jointType,
          jointName,
          linkLine,
          glyph,
        },
      };
      this.entities.set(id, entity);
      this.markJointRefreshNeeded();
      this.applyVisualState(entity);
      if (!this._jointAnchorsVisible) {
        glyph.rootNode.visible = false;
        linkLine.visible = false;
      }
      this.markEntityListChanged();
      this.requestRender();
      return entity;
    });
  }

  removeJoint(id: string): boolean {
    return this.batchMutation(() => {
      const entity = this.entities.get(id);
      if (!entity || entity.meta.kind !== 'joint') return false;
      if (entity.meta.glyph) {
        entity.meta.glyph.dispose();
      }
      entity.rootNode.removeFromParent();
      disposeObject3D(entity.rootNode);
      this.entities.delete(id);
      this.markEntityListChanged();
      this.requestRender();
      return true;
    });
  }

  updateJoint(id: string, jointType: string): void {
    this.batchMutation(() => {
      const entity = this.entities.get(id);
      if (!entity || entity.meta.kind !== 'joint') return;
      entity.meta.jointType = jointType;
      entity.rootNode.userData.jointType = jointType;
      if (entity.meta.linkLine) {
        (entity.meta.linkLine.material as LineMaterial).color.copy(createJointColor(jointType));
      }
      // Recreate the glyph with new type-specific shape
      if (entity.meta.glyph) {
        entity.meta.glyph.rootNode.removeFromParent();
        entity.meta.glyph.dispose();
      }
      const newGlyph = createJointGlyph(jointType);
      newGlyph.rootNode.userData = { entityId: id, entityType: 'joint' };
      entity.rootNode.add(newGlyph.rootNode);
      entity.meta.glyph = newGlyph;
      entity.meshes.length = 0;
      if (!this._jointAnchorsVisible) {
        newGlyph.rootNode.visible = false;
      }
      this.markJointRefreshNeeded();
      this.applyVisualState(entity);
      this.requestRender();
    });
  }

  updateJointLimits(id: string, lowerLimit: number, upperLimit: number): void {
    const entity = this.entities.get(id);
    if (!entity || entity.meta.kind !== 'joint') return;
    entity.meta.lowerLimit = lowerLimit;
    entity.meta.upperLimit = upperLimit;
  }

  updateJointLimitValue(id: string, currentValue: number | null): void {
    const visual = this.activeLimitVisuals.get(id);
    if (!visual) return;
    visual.update(currentValue);
    this.requestRender();
  }

  /**
   * Create coordinate frame overlays when a joint is selected:
   * green triad + dashed line at parent body origin,
   * orange triad + dashed line at child body origin,
   * with lines running body → datum → joint center.
   */
  private createJointCoordinateOverlay(entity: SceneEntityInternal): Group | null {
    if (entity.meta.kind !== 'joint') return null;
    const { parentDatumId, childDatumId } = entity.meta;

    const parentDatumEntity = this.entities.get(parentDatumId);
    const childDatumEntity = this.entities.get(childDatumId);
    if (!parentDatumEntity || !childDatumEntity) return null;

    // Find parent and child body entities
    const parentBodyId =
      parentDatumEntity.meta.kind === 'datum' ? parentDatumEntity.meta.parentBodyId : null;
    const childBodyId =
      childDatumEntity.meta.kind === 'datum' ? childDatumEntity.meta.parentBodyId : null;
    if (!parentBodyId || !childBodyId) return null;

    const parentBodyEntity = this.entities.get(parentBodyId);
    const childBodyEntity = this.entities.get(childBodyId);
    if (!parentBodyEntity || !childBodyEntity) return null;

    const overlay = new Group();
    overlay.name = 'joint-selection-overlay';

    const jointPos = new Vector3();
    entity.rootNode.getWorldPosition(jointPos);

    // Helper: create a small triad (3 short axis lines) at a given world position
    const createTriad = (worldPos: Vector3, _color: Color, scale: number) => {
      const triGroup = new Group();
      triGroup.position.copy(worldPos);
      const axisLength = 0.04 * scale;
      const axes: [Vector3, Color][] = [
        [new Vector3(axisLength, 0, 0), AXIS_X],
        [new Vector3(0, axisLength, 0), AXIS_Y],
        [new Vector3(0, 0, axisLength), AXIS_Z],
      ];
      for (const [dir, axisColor] of axes) {
        const line = createFatLine(
          [new Vector3(0, 0, 0), dir],
          { color: axisColor },
          { isPickable: false },
        );
        triGroup.add(line);
      }
      return triGroup;
    };

    // Helper: create a dashed line between multiple world-space points
    const createDashedLine = (points: Vector3[], color: Color) => {
      const line = createFatLine(
        points,
        {
          color,
          dashed: true,
          dashSize: 0.02,
          gapSize: 0.01,
        },
        { isPickable: false },
      );
      return line;
    };

    const parentBodyPos = new Vector3();
    parentBodyEntity.rootNode.getWorldPosition(parentBodyPos);
    const parentDatumPos = new Vector3();
    parentDatumEntity.rootNode.getWorldPosition(parentDatumPos);

    const childBodyPos = new Vector3();
    childBodyEntity.rootNode.getWorldPosition(childBodyPos);
    const childDatumPos = new Vector3();
    childDatumEntity.rootNode.getWorldPosition(childDatumPos);

    // Parent side (green): body origin triad + dashed line body → datum → joint
    overlay.add(createTriad(parentBodyPos, ENTITY_DATUM, 1));
    overlay.add(createDashedLine([parentBodyPos, parentDatumPos, jointPos], ENTITY_DATUM));

    // Child side (orange): body origin triad + dashed line body → datum → joint
    overlay.add(createTriad(childBodyPos, ENTITY_JOINT, 1));
    overlay.add(createDashedLine([childBodyPos, childDatumPos, jointPos], ENTITY_JOINT));

    return overlay;
  }

  private refreshJointPositionsInternal(): void {
    for (const entity of this.entities.values()) {
      if (entity.meta.kind !== 'joint') continue;
      const parentDatum = this.entities.get(entity.meta.parentDatumId);
      const childDatum = this.entities.get(entity.meta.childDatumId);
      if (!parentDatum || !childDatum) {
        entity.rootNode.visible = false;
        continue;
      }

      parentDatum.rootNode.getWorldPosition(this.jointLineStart);
      childDatum.rootNode.getWorldPosition(this.jointLineEnd);

      // Position anchor at parent datum (joint frame is defined there)
      entity.rootNode.position.copy(this.jointLineStart);
      entity.rootNode.quaternion.identity();
      entity.rootNode.visible = true;

      // Link line connects parent datum → child datum
      if (entity.meta.linkLine) {
        this.lineOrigin.set(0, 0, 0);
        this.lineEnd.copy(this.jointLineEnd).sub(this.jointLineStart);
        setLinePoints(entity.meta.linkLine, [this.lineOrigin, this.lineEnd]);
      }

      // Orient glyph along parent datum Z-axis (the joint axis)
      if (entity.meta.glyph) {
        parentDatum.rootNode.getWorldQuaternion(_datumWorldQuat);
        _jointAxisScratch.set(0, 0, 1).applyQuaternion(_datumWorldQuat);
        if (_jointAxisScratch.lengthSq() > 1e-8) {
          _anchorQuat.setFromUnitVectors(_anchorYAxis, _jointAxisScratch.normalize());
          entity.meta.glyph.rootNode.quaternion.copy(_anchorQuat);
        }
      }
    }
  }

  refreshJointPositions(): void {
    this.batchMutation(() => {
      this.markJointRefreshNeeded();
      this.requestRender();
    });
  }

  addLoadVisual(loadId: string, loadState: LoadStateInput | null): void {
    this.batchMutation(() => {
      this.removeLoadVisual(loadId);

      const root = new Group();
      root.name = `load_${loadId}`;
      root.userData = { entityId: loadId, entityType: 'load' };

      const kindTag = getLoadKind(loadState);
      const meta: LoadMeta = {
        kind: 'load',
        loadState,
        kindTag,
      };

      if (loadState) {
        meta.anchorDatumId = loadState.datumId ?? loadState.parentDatumId;
        meta.secondDatumId = loadState.childDatumId;
      }

      if (kindTag === 'spring-damper') {
        const line = createLine([this.lineOrigin, this.lineOrigin], getLoadBaseColor(kindTag), {
          entityId: loadId,
          entityType: 'load',
        });
        root.add(line);
        meta.line = line;
      } else {
        const shaft = createLine(
          [this.lineOrigin, new Vector3(0, 0.5, 0)],
          getLoadBaseColor(kindTag),
          { entityId: loadId, entityType: 'load' },
        );
        root.add(shaft);
        meta.line = shaft;
        const arrow = new ArrowHelper(
          new Vector3(0, 1, 0),
          this.lineOrigin,
          0.5,
          getLoadBaseColor(kindTag).getHex(),
          0.12,
          0.06,
        );
        arrow.userData = { entityId: loadId, entityType: 'load' };
        root.add(arrow);
        meta.arrow = arrow;
      }

      this._scene.add(root);
      const pickMesh = new Mesh(
        new SphereGeometry(0.04, 8, 8),
        new MeshStandardMaterial({ color: LOAD_COLOR, transparent: true, opacity: 0.05 }),
      );
      pickMesh.userData = { entityId: loadId, entityType: 'load' };
      root.add(pickMesh);
      setObjectLayerRecursive(root, VIEWPORT_PICK_LAYER);

      const entity: SceneEntityInternal = {
        id: loadId,
        type: 'load',
        rootNode: root,
        meshes: [pickMesh],
        meta,
      };
      this.entities.set(loadId, entity);
      this.markLoadRefreshNeeded();
      this.applyVisualState(entity);
      this.markEntityListChanged();
      this.requestRender();
    });
  }

  removeLoadVisual(loadId: string): boolean {
    return this.batchMutation(() => {
      const entity = this.entities.get(loadId);
      if (!entity || entity.meta.kind !== 'load') return false;
      entity.rootNode.removeFromParent();
      disposeObject3D(entity.rootNode);
      this.entities.delete(loadId);
      this.forceArrowIds.delete(loadId);
      this.markEntityListChanged();
      this.markLoadRefreshNeeded();
      this.requestRender();
      return true;
    });
  }

  updateLoadVisual(loadId: string, loadState: LoadStateInput | null): void {
    this.batchMutation(() => {
      const entity = this.entities.get(loadId);
      if (!entity || entity.meta.kind !== 'load') return;
      const nextKindTag = getLoadKind(loadState);
      if (entity.meta.kindTag !== nextKindTag) {
        this.removeLoadVisual(loadId);
        this.addLoadVisual(loadId, loadState);
        return;
      }
      entity.meta.loadState = loadState;
      entity.meta.kindTag = nextKindTag;
      if (loadState) {
        entity.meta.anchorDatumId = loadState.datumId ?? loadState.parentDatumId;
        entity.meta.secondDatumId = loadState.childDatumId;
      }
      this.markLoadRefreshNeeded();
      this.requestRender();
    });
  }

  // ── Motor (actuator) visuals ──

  addMotorVisual(actuatorId: string, jointId: string, actuatorType: string): void {
    this.batchMutation(() => {
      // Remove existing if re-adding
      this.removeMotorVisual(actuatorId);

      const visual = createMotorVisual(actuatorType);
      if (!visual) return;

      const root = visual.rootNode;
      root.name = `actuator_${actuatorId}`;
      root.userData = { entityId: actuatorId, entityType: 'actuator' };

      // Tag all children with the entity ID for picking
      root.traverse((child) => {
        child.userData.entityId = actuatorId;
      });

      // Parent to the joint's root node so it follows joint position
      const jointEntity = this.entities.get(jointId);
      if (jointEntity) {
        jointEntity.rootNode.add(root);
      } else {
        this._scene.add(root);
      }

      const entity: SceneEntityInternal = {
        id: actuatorId,
        type: 'actuator',
        rootNode: root,
        meshes: [],
        meta: { kind: 'actuator', jointId, actuatorType },
      };
      this.entities.set(actuatorId, entity);
      this.applyVisualState(entity);
      this.markEntityListChanged();
      this.requestRender();
    });
  }

  removeMotorVisual(actuatorId: string): boolean {
    return this.batchMutation(() => {
      const entity = this.entities.get(actuatorId);
      if (!entity || entity.meta.kind !== 'actuator') return false;
      entity.rootNode.removeFromParent();
      disposeObject3D(entity.rootNode);
      this.entities.delete(actuatorId);
      this.markEntityListChanged();
      this.requestRender();
      return true;
    });
  }

  updateMotorVisual(actuatorId: string, jointId: string, actuatorType: string): void {
    this.batchMutation(() => {
      const entity = this.entities.get(actuatorId);
      if (!entity || entity.meta.kind !== 'actuator') {
        this.addMotorVisual(actuatorId, jointId, actuatorType);
        return;
      }

      if (entity.meta.jointId !== jointId || entity.meta.actuatorType !== actuatorType) {
        this.removeMotorVisual(actuatorId);
        this.addMotorVisual(actuatorId, jointId, actuatorType);
        return;
      }

      const jointEntity = this.entities.get(jointId);
      if (jointEntity && entity.rootNode.parent !== jointEntity.rootNode) {
        jointEntity.rootNode.add(entity.rootNode);
      }
      this.requestRender();
    });
  }

  setCameraPreset(preset: CameraPreset, _animated?: boolean): void {
    if (preset === 'fit-all') {
      this.fitAll();
      return;
    }

    const roots = Array.from(this.entities.values())
      .filter((entity) => entity.type === 'body')
      .map((entity) => entity.rootNode);
    if (roots.length === 0) return;

    const box = getBoxForRoots(roots);
    const directions: Record<Exclude<CameraPreset, 'fit-all'>, Vector3> = {
      isometric: new Vector3(1, 1, 1),
      front: new Vector3(0, 0, 1),
      back: new Vector3(0, 0, -1),
      left: new Vector3(-1, 0, 0),
      right: new Vector3(1, 0, 0),
      top: new Vector3(0, 1, 0),
      bottom: new Vector3(0, -1, 0),
    };
    if (this.boundsApi) {
      const center = new Vector3();
      const size = new Vector3();
      box.getCenter(center);
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z, MIN_CAMERA_EXTENT);
      const dir = directions[preset].clone().normalize();
      const pos = center.clone().add(dir.multiplyScalar(maxDim * 2.5));
      this.boundsApi
        .refresh(box)
        .moveTo([pos.x, pos.y, pos.z])
        .lookAt({ target: [center.x, center.y, center.z] })
        .fit();
    } else {
      setCameraToBox(this._camera, box, directions[preset], this.canvasAspect);
    }
    this.requestRender();
  }

  animateCameraTo(_alpha: number, _beta: number, _radius?: number, _duration?: number): void {
    this.fitAll();
  }

  focusOnEntity(id: string): void {
    const entity = this.entities.get(id);
    if (!entity) return;
    this.scheduleFocus([entity.rootNode]);
  }

  focusOnEntities(ids: string[]): void {
    const roots = ids
      .map((id) => this.entities.get(id)?.rootNode)
      .filter((value): value is Group => Boolean(value));
    if (roots.length === 0) return;
    this.scheduleFocus(roots);
  }

  /** Defer bounding-box computation + camera fit to next animation frame. */
  private scheduleFocus(roots: Group[]): void {
    const executeFocus = () => {
      const box = getBoxForRoots(roots);
      if (this.boundsApi) {
        this.boundsApi.refresh(box).fit();
      } else {
        const direction = roots.length === 1 ? this._camera.position.clone() : new Vector3();
        if (roots.length === 1) {
          if (direction.lengthSq() < EPSILON) direction.set(1, 1, 1);
        } else {
          this._camera.getWorldDirection(direction);
          direction.negate();
        }
        setCameraToBox(this._camera, box, direction, this.canvasAspect);
      }
      this.requestRender();
    };

    if (typeof requestAnimationFrame === 'function') {
      this._pendingFocusRoots = roots;
      if (this._pendingFocusRaf) cancelAnimationFrame(this._pendingFocusRaf);
      this._pendingFocusRaf = requestAnimationFrame(() => {
        this._pendingFocusRaf = 0;
        this._pendingFocusRoots = null;
        executeFocus();
      });
    } else {
      executeFocus();
    }
  }
  applySelection(selectedIds: Set<string>, rawSelectedIds?: Set<string>): void {
    this.batchMutation(() => this.applySelectionInner(selectedIds, rawSelectedIds));
  }

  /** Force deferred selection overlays to be created synchronously (for tests). */
  flushSelectionOverlays(): void {
    if (!this._pendingOverlayRaf) return;
    cancelAnimationFrame(this._pendingOverlayRaf);
    this._pendingOverlayRaf = 0;
    const ids = this._pendingOverlaySelectedIds;
    const rawIds = this._pendingOverlayRawIds;
    this._pendingOverlaySelectedIds = null;
    this._pendingOverlayRawIds = null;
    if (ids) {
      this.batchMutation(() => this.createSelectionOverlays(ids, rawIds ?? new Set()));
    }
  }

  private applySelectionInner(selectedIds: Set<string>, rawSelectedIds?: Set<string>): void {
    const prev = this.currentSelectedIds;
    this.currentSelectedIds = new Set(selectedIds);
    const generation = ++this._selectionGeneration;

    // ── Phase 1 (synchronous): visual state + remove stale overlays ──
    // Material tinting is the primary selection indicator and must be immediate.

    for (const id of selectedIds) {
      if (!prev.has(id)) {
        const entity = this.entities.get(id);
        if (entity) this.applyVisualState(entity);
      }
    }
    for (const id of prev) {
      if (!selectedIds.has(id)) {
        const entity = this.entities.get(id);
        if (entity) this.applyVisualState(entity);
      }
    }

    // Remove overlays for deselected entities (fast — just detach + dispose)
    for (const [id, visual] of this.activeLimitVisuals) {
      if (!selectedIds.has(id)) {
        visual.rootNode.removeFromParent();
        visual.dispose();
        this.activeLimitVisuals.delete(id);
      }
    }
    for (const [id, overlay] of this.jointSelectionOverlays) {
      if (!selectedIds.has(id)) {
        overlay.removeFromParent();
        disposeObject3D(overlay);
        this.jointSelectionOverlays.delete(id);
      }
    }
    for (const [id, triad] of this.activeBodyFrameTriads) {
      if (!selectedIds.has(id)) {
        triad.rootNode.removeFromParent();
        triad.dispose();
        this.activeBodyFrameTriads.delete(id);
      }
    }
    const rawIds = rawSelectedIds ?? new Set<string>();
    for (const [geomId, triad] of this.activeGeometryFrameTriads) {
      if (!rawIds.has(geomId)) {
        triad.rootNode.removeFromParent();
        triad.dispose();
        this.activeGeometryFrameTriads.delete(geomId);
      }
    }
    for (const [id, line] of this.activeJointAxisLines) {
      if (!selectedIds.has(id)) {
        line.removeFromParent();
        disposeFatLine(line);
        this.activeJointAxisLines.delete(id);
      }
    }
    for (const [id, indicator] of this.activeComIndicators) {
      if (!selectedIds.has(id)) {
        indicator.rootNode.removeFromParent();
        indicator.dispose();
        this.activeComIndicators.delete(id);
      }
    }

    this.onLabelStateChanged?.();
    this.requestRender();

    // ── Phase 2 (deferred): create overlays for newly selected entities ──
    // GPU object allocation (Line2, LineMaterial, Geometry) is deferred to the
    // next animation frame so the selection tint is visible immediately.

    // Defer overlay creation to next animation frame so the selection tint
    // renders immediately. Falls back to synchronous if rAF is unavailable (tests).
    if (typeof requestAnimationFrame === 'function') {
      this._pendingOverlaySelectedIds = selectedIds;
      this._pendingOverlayRawIds = rawIds;
      if (this._pendingOverlayRaf) cancelAnimationFrame(this._pendingOverlayRaf);
      this._pendingOverlayRaf = requestAnimationFrame(() => {
        this._pendingOverlayRaf = 0;
        if (this._selectionGeneration !== generation) return;
        this._pendingOverlaySelectedIds = null;
        this._pendingOverlayRawIds = null;
        this.batchMutation(() => this.createSelectionOverlays(selectedIds, rawIds));
      });
    } else {
      this.createSelectionOverlays(selectedIds, rawIds);
    }
  }

  /** Phase 2 of selection: create visual overlays for the current selection set. */
  private createSelectionOverlays(selectedIds: Set<string>, rawIds: Set<string>): void {
    // DOF indication is handled by the joint glyph's 'selected' mode — no separate overlay.

    // Limit visuals
    for (const id of selectedIds) {
      if (this.activeLimitVisuals.has(id)) continue;
      const entity = this.entities.get(id);
      if (!entity || entity.meta.kind !== 'joint') continue;
      const lower = entity.meta.lowerLimit ?? 0;
      const upper = entity.meta.upperLimit ?? 0;
      if (lower === 0 && upper === 0) continue;
      const visual = createLimitVisual(entity.meta.jointType, lower, upper);
      if (!visual) continue;
      entity.rootNode.add(visual.rootNode);
      visual.update(null);
      this.activeLimitVisuals.set(id, visual);
    }

    // Joint coordinate overlays
    for (const id of selectedIds) {
      if (this.jointSelectionOverlays.has(id)) continue;
      const entity = this.entities.get(id);
      if (!entity || entity.meta.kind !== 'joint') continue;
      const overlay = this.createJointCoordinateOverlay(entity);
      if (overlay) {
        this._scene.add(overlay);
        this.jointSelectionOverlays.set(id, overlay);
      }
    }

    // Body frame triads
    for (const id of selectedIds) {
      if (this.activeBodyFrameTriads.has(id)) continue;
      const entity = this.entities.get(id);
      if (!entity || entity.meta.kind !== 'body') continue;
      const triad = createFrameTriad({ axisLength: 0.14, opacity: 0.5 });
      entity.rootNode.add(triad.rootNode);
      this.activeBodyFrameTriads.set(id, triad);
    }

    // Geometry frame triads (O(1) lookup via index)
    for (const geomId of rawIds) {
      if (this.activeGeometryFrameTriads.has(geomId)) continue;
      const bodyId = this.geometryToBodyId.get(geomId);
      if (!bodyId) continue;
      const entity = this.entities.get(bodyId);
      if (!entity || entity.meta.kind !== 'body') continue;
      const geomState = entity.meta.geometries.get(geomId);
      if (!geomState) continue;
      const triad = createFrameTriad({ axisLength: 0.1, opacity: 0.6 });
      geomState.rootNode.add(triad.rootNode);
      this.activeGeometryFrameTriads.set(geomId, triad);
    }

    // Joint axis lines
    for (const id of selectedIds) {
      if (this.activeJointAxisLines.has(id)) continue;
      const entity = this.entities.get(id);
      if (!entity || entity.meta.kind !== 'joint') continue;
      if (SKIP_AXIS_JOINT_TYPES.has(entity.meta.jointType)) continue;
      const parentDatumEntity = this.entities.get(entity.meta.parentDatumId);
      if (!parentDatumEntity) continue;
      const datumQuat = new Quaternion();
      parentDatumEntity.rootNode.getWorldQuaternion(datumQuat);
      const axis = new Vector3(0, 0, 1).applyQuaternion(datumQuat);
      const jointPos = new Vector3();
      entity.rootNode.getWorldPosition(jointPos);
      const start = jointPos.clone().addScaledVector(axis, -0.3);
      const end = jointPos.clone().addScaledVector(axis, 0.3);
      const line = createFatLine(
        [start, end],
        {
          color: JOINT_STEEL_BLUE,
          lineWidth: 2,
          dashed: true,
          dashSize: 0.02,
          gapSize: 0.01,
          depthTest: false,
        },
        { isPickable: false },
      );
      this._scene.add(line);
      this.activeJointAxisLines.set(id, line);
    }

    // COM indicators
    if (this._comVisible) {
      for (const id of selectedIds) {
        if (this.activeComIndicators.has(id)) continue;
        const entity = this.entities.get(id);
        if (!entity || entity.meta.kind !== 'body') continue;
        const com = this._comPositions.get(id);
        if (!com) continue;
        const indicator = createComIndicator();
        indicator.rootNode.position.copy(com);
        entity.rootNode.add(indicator.rootNode);
        this.activeComIndicators.set(id, indicator);
      }
    }

    this.requestRender();
  }

  private applyConnectedBodyHighlights(jointId: string): void {
    const joint = this.entities.get(jointId);
    if (!joint || joint.meta.kind !== 'joint') return;

    const datumIds = [joint.meta.parentDatumId, joint.meta.childDatumId];
    for (const datumId of datumIds) {
      const datum = this.entities.get(datumId);
      if (!datum || datum.meta.kind !== 'datum') continue;
      const bodyId = datum.meta.parentBodyId;
      const body = this.entities.get(bodyId);
      if (!isBodyEntity(body)) continue;
      for (const edgeLines of getBodyEdgeLines(body)) {
        const edgeMat = edgeLines.material as LineBasicMaterial;
        edgeMat.color.copy(JOINT_STEEL_BLUE);
        edgeMat.opacity = 0.4;
        edgeMat.needsUpdate = true;
      }
      this.connectedBodyHighlights.add(bodyId);
    }
  }

  private clearConnectedBodyHighlights(): void {
    for (const bodyId of this.connectedBodyHighlights) {
      const body = this.entities.get(bodyId);
      if (body && body.meta.kind === 'body') this.applyVisualState(body);
    }
    this.connectedBodyHighlights.clear();
  }

  applyHover(hoveredId: string | null): void {
    const prev = this._hoveredId;
    this._hoveredId = hoveredId;

    if (prev === hoveredId) return;

    // Clear connected-body highlights from previous joint hover
    if (this.connectedBodyHighlights.size > 0) {
      this.clearConnectedBodyHighlights();
    }

    if (prev) {
      const entity = this.entities.get(prev);
      if (entity) this.applyVisualState(entity);
    }
    if (hoveredId) {
      const entity = this.entities.get(hoveredId);
      if (entity) this.applyVisualState(entity);
      // Highlight bodies connected by this joint
      if (entity?.type === 'joint') {
        this.applyConnectedBodyHighlights(hoveredId);
      }
    }
    this.onLabelStateChanged?.();
    this.requestRender();
  }

  private clearFaceHighlightInternal(
    entity: SceneEntityInternal & { meta: BodyMeta },
    requestRender: boolean,
  ): void {
    if (entity.meta.highlightedFace === null) return;
    const { geometryId, faceIndex } = entity.meta.highlightedFace;
    const geometryState = this.getBodyGeometryState(entity, geometryId);
    const colorAttr = geometryState?.colorAttribute;
    if (!colorAttr) {
      entity.meta.highlightedFace = null;
      return;
    }
    const vertexIndices = this.getFaceVertexIndices(entity, geometryId, faceIndex);
    this.setFaceVertexColor(colorAttr, vertexIndices, new Color(1, 1, 1));
    entity.meta.highlightedFace = null;
    if (requestRender) {
      this.requestRender();
    }
  }

  highlightFace(bodyId: string, geometryId: string, faceIndex: number): void {
    const entity = this.entities.get(bodyId);
    if (!isBodyEntity(entity)) return;
    const geometryState = this.getBodyGeometryState(entity, geometryId);
    const geometryIndex = geometryState?.geometryIndex;
    if (!geometryIndex || faceIndex < 0 || faceIndex >= geometryIndex.faceRanges.length) return;
    if (
      entity.meta.highlightedFace?.geometryId === geometryId &&
      entity.meta.highlightedFace.faceIndex === faceIndex
    )
      return;

    this.clearFaceHighlightInternal(entity, false);

    const colorAttr = this.ensureGeometryColorAttribute(geometryState);
    const vertexIndices = this.getFaceVertexIndices(entity, geometryId, faceIndex);
    this.setFaceVertexColor(colorAttr, vertexIndices, FACE_HIGHLIGHT_COLOR);
    entity.meta.highlightedFace = { geometryId, faceIndex };
    this.requestRender();
  }

  clearFaceHighlight(bodyId: string): void {
    const entity = this.entities.get(bodyId);
    if (!isBodyEntity(entity)) return;
    this.clearFaceHighlightInternal(entity, true);
  }

  clearAllFaceHighlights(): void {
    for (const entity of this.entities.values()) {
      if (entity.meta.kind === 'body' && entity.meta.highlightedFace !== null) {
        this.clearFaceHighlight(entity.id);
      }
    }
  }

  setEntityVisibility(id: string, visible: boolean): void {
    const entity = this.entities.get(id);
    if (!entity) return;
    if (entity.rootNode.visible === visible) return;
    entity.rootNode.visible = visible;
    this.requestRender();
  }

  attachGizmo(entityId: string): void {
    this._gizmoAttachedId = entityId;
    this.onGizmoStateChanged?.();
    this.requestRender();
  }

  detachGizmo(): void {
    this._gizmoAttachedId = null;
    this.onGizmoStateChanged?.();
    this.requestRender();
  }

  setGizmoMode(mode: GizmoMode): void {
    this._gizmoMode = mode;
    this.onGizmoStateChanged?.();
    this.requestRender();
  }

  getGizmoMode(): GizmoMode {
    return this._gizmoMode;
  }

  setGizmoSnap(translationSnap: number, rotationSnap: number): void {
    this._gizmoTranslationSnap = translationSnap;
    this._gizmoRotationSnap = rotationSnap;
    this.onGizmoStateChanged?.();
  }

  getGizmoSnap(): { translationSnap: number; rotationSnap: number } {
    return {
      translationSnap: this._gizmoTranslationSnap,
      rotationSnap: this._gizmoRotationSnap,
    };
  }

  setGizmoSpace(space: 'local' | 'world'): void {
    this._gizmoSpace = space;
    this.onGizmoStateChanged?.();
    this.requestRender();
  }

  getGizmoSpace(): 'local' | 'world' {
    return this._gizmoSpace;
  }

  getGizmoAttachedEntityKind(): 'body' | 'datum' | null {
    if (!this._gizmoAttachedId) return null;
    const entity = this.entities.get(this._gizmoAttachedId);
    if (!entity) return null;
    if (entity.meta.kind === 'body' || entity.meta.kind === 'datum') return entity.meta.kind;
    return null;
  }

  setGizmoOnDragEnd(callback: GizmoDragEndCallback | undefined): void {
    this._gizmoDragEndCallback = callback;
  }

  getGizmoTargetObject(): Object3D | null {
    if (!this._gizmoAttachedId || this._gizmoMode === 'off') {
      return null;
    }
    const entity = this.entities.get(this._gizmoAttachedId);
    if (!entity) return null;
    if (entity.meta.kind === 'datum' || entity.meta.kind === 'body') return entity.rootNode;
    return null;
  }

  notifyGizmoObjectChanged(): void {
    this.batchMutation(() => {
      this.markJointRefreshNeeded();
      this.markLoadRefreshNeeded();
      this.requestRender();
    });
  }

  notifyGizmoDragEnd(): void {
    if (!this._gizmoAttachedId || !this._gizmoDragEndCallback) return;
    const entity = this.entities.get(this._gizmoAttachedId);
    if (!entity || (entity.meta.kind !== 'datum' && entity.meta.kind !== 'body')) return;

    const position: [number, number, number] = [
      entity.rootNode.position.x,
      entity.rootNode.position.y,
      entity.rootNode.position.z,
    ];
    const rotation: [number, number, number, number] = [
      entity.rootNode.quaternion.x,
      entity.rootNode.quaternion.y,
      entity.rootNode.quaternion.z,
      entity.rootNode.quaternion.w,
    ];

    if (entity.meta.kind === 'datum') {
      entity.meta.localPose = { position, rotation };
    }
    this._gizmoDragEndCallback({
      entityId: entity.id,
      entityKind: entity.meta.kind as 'datum' | 'body',
      position,
      rotation,
    });
  }

  // ── Viewport focus point (placement strategy) ──────────────────

  /** Update the cached orbit target — called from OrbitControls onChange. */
  setOrbitTarget(target: Vector3): void {
    this._orbitTarget.copy(target);
  }

  /** Return the viewport focus point projected onto the ground plane (Y=0). */
  getViewportFocusPoint(): { x: number; y: number; z: number } {
    return { x: this._orbitTarget.x, y: 0, z: this._orbitTarget.z };
  }

  // TODO (Epic 15.2): Wire to simulation channels `joint/{id}/reaction-force`
  // and `joint/{id}/reaction-torque`. Currently called imperatively; future
  // integration will subscribe to live result channels via the trace store.
  updateJointForces(jointId: string, data: unknown): void {
    this.batchMutation(() => {
      const entity = this.entities.get(jointId);
      if (!entity || entity.meta.kind !== 'joint') return;
      const payload = data as
        | {
            force?: { x?: number; y?: number; z?: number };
            torque?: { x?: number; y?: number; z?: number };
          }
        | undefined;

      const vectors = [
        { id: `${jointId}::force`, type: 'point-force' as const, value: payload?.force },
        { id: `${jointId}::torque`, type: 'point-torque' as const, value: payload?.torque },
      ];

      for (const entry of vectors) {
        if (!entry.value) {
          this.removeLoadVisual(entry.id);
          continue;
        }

        const vector = new Vector3(entry.value.x ?? 0, entry.value.y ?? 0, entry.value.z ?? 0);
        if (vector.lengthSq() < EPSILON) {
          this.removeLoadVisual(entry.id);
          continue;
        }

        const nextState = {
          type: entry.type,
          datumId: entity.meta.parentDatumId,
          vector: { x: vector.x, y: vector.y, z: vector.z },
        };

        if (!this.entities.has(entry.id)) {
          this.addLoadVisual(entry.id, nextState);
          this.forceArrowIds.add(entry.id);
        } else {
          this.updateLoadVisual(entry.id, nextState);
        }
      }
      this.requestRender();
    });
  }

  applyJointForceUpdates(updates: readonly JointForceUpdate[]): void {
    this.batchMutation(() => {
      for (const update of updates) {
        this.updateJointForces(update.jointId, update);
      }
      this.requestRender();
    });
  }

  clearForceArrows(): void {
    this.batchMutation(() => {
      for (const id of Array.from(this.forceArrowIds)) {
        this.removeLoadVisual(id);
      }
      this.forceArrowIds.clear();
      this.requestRender();
    });
  }

  showDatumPreview(config: DatumPreviewConfig): void {
    this._preview.showDatumPreview(config);
  }

  getDatumPreviewPosition(): { x: number; y: number; z: number } | null {
    return this._preview.getDatumPreviewPosition();
  }

  clearDatumPreview(): void {
    this._preview.clearDatumPreview();
  }

  showLoadPreview(loadState: LoadStateInput | null): void {
    this._preview.showLoadPreview(loadState);
  }

  clearLoadPreview(): void {
    this._preview.clearLoadPreview();
  }

  getDatumPreviewBodyId(): string | null {
    return this._preview.getDatumPreviewBodyId();
  }

  getBodyMeshNormals(bodyId: string): Float32Array | null {
    const entity = this.entities.get(bodyId);
    if (!isBodyEntity(entity)) return null;
    return this.getPrimaryBodyGeometryState(entity)?.normals ?? null;
  }

  getBodyMeshIndices(bodyId: string): Uint32Array | null {
    const entity = this.entities.get(bodyId);
    if (!isBodyEntity(entity)) return null;
    return this.getPrimaryBodyGeometryState(entity)?.indices ?? null;
  }

  dimDatumsByBody(bodyId: string): void {
    for (const entity of this.entities.values()) {
      if (entity.meta.kind !== 'datum') continue;
      entity.meta.disabledOpacity = entity.meta.parentBodyId === bodyId ? 0.2 : 1;
      this.applyVisualState(entity);
    }
    this.requestRender();
  }

  restoreDimmedDatums(): void {
    for (const entity of this.entities.values()) {
      if (entity.meta.kind !== 'datum') continue;
      entity.meta.disabledOpacity = 1;
      this.applyVisualState(entity);
    }
    this.requestRender();
  }

  applyJointCreationHighlights(parentDatumId: string | null, childDatumId: string | null): void {
    for (const entity of this.entities.values()) {
      if (entity.meta.kind !== 'datum') continue;
      const isImportant = entity.id === parentDatumId || entity.id === childDatumId;
      entity.meta.emphasisOpacity = isImportant ? 1 : 0.45;
      entity.meta.isCreationAnchor = isImportant;
      this.applyVisualState(entity);
    }
    this.requestRender();
  }

  clearJointCreationHighlights(): void {
    for (const entity of this.entities.values()) {
      if (entity.meta.kind !== 'datum') continue;
      entity.meta.emphasisOpacity = 1;
      entity.meta.isCreationAnchor = false;
      this.applyVisualState(entity);
    }
    this.requestRender();
  }
  showJointPreviewLine(
    parentDatumId: string,
    childDatumId: string,
    alignment?: JointPreviewAlignment | null,
  ): void {
    this._preview.showJointPreviewLine(parentDatumId, childDatumId, alignment);
  }

  clearJointPreviewLine(): void {
    this._preview.clearJointPreviewLine();
  }

  showProvisionalJointPreview(
    parentDatumId: string,
    cursorWorldPos: { x: number; y: number; z: number },
  ): void {
    this._preview.showProvisionalJointPreview(parentDatumId, cursorWorldPos);
  }

  clearProvisionalJointPreview(): void {
    this._preview.clearProvisionalJointPreview();
  }

  showProvisionalDofPreview(
    position: { x: number; y: number; z: number },
    jointType: string,
    axisDirection?: { x: number; y: number; z: number } | null,
  ): void {
    this._preview.showProvisionalDofPreview(position, jointType, axisDirection);
  }

  showJointTypePreview(
    jointType: string,
    parentDatumId: string,
    childDatumId: string,
    alignmentAxis?: { x: number; y: number; z: number } | null,
  ): void {
    this._preview.showJointTypePreview(jointType, parentDatumId, childDatumId, alignmentAxis);
  }

  clearJointTypePreview(): void {
    this._preview.clearJointTypePreview();
  }

  /** True when any joint glyph has an active hover animation. */
  hasDofAnimations(): boolean {
    for (const entity of this.entities.values()) {
      if (entity.meta.kind === 'joint' && entity.meta.glyph?.isAnimating()) {
        return true;
      }
    }
    return false;
  }

  /** Advance dash-crawl animation on hovered joint glyphs. */
  updateDofAnimations(time: number): void {
    for (const entity of this.entities.values()) {
      if (entity.meta.kind === 'joint' && entity.meta.glyph?.isAnimating()) {
        entity.meta.glyph.updateAnimation(time);
      }
    }
  }

  pickEntityAtPoint(): { entityId: string; entityType: string } | null {
    if (!this._hoveredId) return null;
    const entity = this.entities.get(this._hoveredId);
    if (!entity) return null;
    return { entityId: entity.id, entityType: entity.type };
  }

  toggleGrid(): void {
    this._gridVisible = !this._gridVisible;
    this.onGridVisibilityChanged?.();
    this.requestRender();
  }

  get gridVisible(): boolean {
    return this._gridVisible;
  }

  get datumsVisible(): boolean {
    return this._datumsVisible;
  }

  toggleDatums(): void {
    this._datumsVisible = !this._datumsVisible;
    this.applyDatumVisibility();
    this.onDatumsVisibilityChanged?.();
    this.requestRender();
  }

  get jointAnchorsVisible(): boolean {
    return this._jointAnchorsVisible;
  }

  toggleJointAnchors(): void {
    this._jointAnchorsVisible = !this._jointAnchorsVisible;
    this.applyJointAnchorVisibility();
    this.onJointAnchorsVisibilityChanged?.();
    this.requestRender();
  }

  get collisionWireframesVisible(): boolean {
    return this._collisionWireframesVisible;
  }

  toggleCollisionWireframes(): void {
    this._collisionWireframesVisible = !this._collisionWireframesVisible;
    this.setCollisionWireframeVisibility(this._collisionWireframesVisible);
    this.requestRender();
  }

  get comVisible(): boolean {
    return this._comVisible;
  }

  toggleCom(): void {
    this._comVisible = !this._comVisible;
    if (this._comVisible) {
      // Create COM indicators for currently selected bodies
      for (const id of this.currentSelectedIds) {
        if (this.activeComIndicators.has(id)) continue;
        const entity = this.entities.get(id);
        if (!entity || entity.meta.kind !== 'body') continue;
        const com = this._comPositions.get(id);
        if (!com) continue;
        const indicator = createComIndicator();
        indicator.rootNode.position.copy(com);
        entity.rootNode.add(indicator.rootNode);
        this.activeComIndicators.set(id, indicator);
      }
    } else {
      // Remove all active COM indicators
      for (const [id, indicator] of this.activeComIndicators) {
        indicator.rootNode.removeFromParent();
        indicator.dispose();
        this.activeComIndicators.delete(id);
      }
    }
    this.requestRender();
  }

  setBodyCom(bodyId: string, com: { x: number; y: number; z: number }): void {
    const vec = this._comPositions.get(bodyId);
    if (vec) {
      vec.set(com.x, com.y, com.z);
    } else {
      this._comPositions.set(bodyId, new Vector3(com.x, com.y, com.z));
    }
    // Update active indicator if one exists
    const indicator = this.activeComIndicators.get(bodyId);
    if (indicator) {
      indicator.rootNode.position.set(com.x, com.y, com.z);
      this.requestRender();
    }
  }

  private applyDatumVisibility(): void {
    for (const [, entity] of this.entities) {
      if (entity.meta.kind === 'datum') {
        entity.rootNode.visible = this._datumsVisible;
      }
    }
  }

  private applyJointAnchorVisibility(): void {
    for (const [, entity] of this.entities) {
      if (entity.meta.kind === 'joint') {
        if (entity.meta.glyph) entity.meta.glyph.rootNode.visible = this._jointAnchorsVisible;
        if (entity.meta.linkLine) entity.meta.linkLine.visible = this._jointAnchorsVisible;
      }
    }
  }

  get labelsVisible(): boolean {
    return this._labelsVisible;
  }

  toggleLabels(): void {
    this._labelsVisible = !this._labelsVisible;
    this.applyLabelVisibility();
    this.requestRender();
  }

  private applyLabelVisibility(): void {
    // Labels are rendered by the HTML overlay (EntityLabelOverlay).
    // Just notify the overlay so it can show/hide.
    this.onLabelStateChanged?.();
  }

  getGeometryIndex(bodyId: string, geometryId: string): BodyGeometryIndex | undefined {
    const entity = this.entities.get(bodyId);
    if (!isBodyEntity(entity)) return undefined;
    return this.getBodyGeometryState(entity, geometryId)?.geometryIndex;
  }

  getBodyGeometryIndex(id: string): BodyGeometryIndex | undefined {
    const entity = this.entities.get(id);
    if (!isBodyEntity(entity)) return undefined;
    return this.getPrimaryBodyGeometryState(entity)?.geometryIndex;
  }

  getGeometryBvhState(bodyId: string, geometryId: string): BodyBvhState {
    return this._bvh.getGeometryBvhState(bodyId, geometryId);
  }

  getBodyBvhState(id: string): BodyBvhState {
    return this._bvh.getBodyBvhState(id);
  }

  hasPendingGeometryBvhs(): boolean {
    return this._bvh.hasPendingGeometryBvhs();
  }

  hasPendingBodyBvhs(): boolean {
    return this._bvh.hasPendingBodyBvhs();
  }

  getGeometryFacePreview(
    bodyId: string,
    geometryId: string,
    faceIndex: number,
  ): FacePreviewData | null {
    const entity = this.entities.get(bodyId);
    if (!isBodyEntity(entity)) return null;
    const geometryState = this.getBodyGeometryState(entity, geometryId);
    const geometryIndex = geometryState?.geometryIndex;
    if (!geometryIndex || faceIndex < 0 || faceIndex >= geometryIndex.faceRanges.length) {
      return null;
    }

    const cached = geometryState.facePreviewCache.get(faceIndex);
    if (cached) {
      return cached;
    }

    const faceRange = geometryIndex.faceRanges[faceIndex];
    const previewType = estimateSurfaceType(
      geometryState.normals,
      geometryState.indices,
      faceRange,
    );
    const axisDirection =
      previewType === 'axis'
        ? estimateAxisDirection(geometryState.normals, geometryState.indices, faceRange)
        : null;
    const result: FacePreviewData = {
      previewType,
      axisDirection,
      localCentroid: null,
    };
    geometryState.facePreviewCache.set(faceIndex, result);
    return result;
  }

  getBodyFacePreview(bodyId: string, faceIndex: number): FacePreviewData | null {
    const entity = this.entities.get(bodyId);
    if (!isBodyEntity(entity) || !entity.meta.primaryGeometryId) return null;
    return this.getGeometryFacePreview(bodyId, entity.meta.primaryGeometryId, faceIndex);
  }

  /**
   * Return the face centroid in world space. Triggers preview computation
   * (and caching) if not already done.
   */
  getFaceCentroidWorld(
    bodyId: string,
    geometryId: string,
    faceIndex: number,
  ): [number, number, number] | null {
    const entity = this.entities.get(bodyId);
    if (!isBodyEntity(entity)) return null;

    const preview = this.getGeometryFacePreview(bodyId, geometryId, faceIndex);
    if (!preview) return null;

    if (!preview.localCentroid) {
      preview.localCentroid = this.computeFaceLocalCentroid(
        entity,
        geometryId,
        faceIndex,
        preview.previewType,
        preview.axisDirection,
      );
    }
    if (!preview.localCentroid) return null;

    const geometryState = this.getBodyGeometryState(entity, geometryId);
    if (!geometryState) return null;

    // Update from the body root so the full parent chain is current
    entity.rootNode.updateMatrixWorld(true);
    const worldPos = new Vector3(...preview.localCentroid);
    worldPos.applyMatrix4(geometryState.mesh.matrixWorld);
    return [worldPos.x, worldPos.y, worldPos.z];
  }

  getBodyFaceCentroidWorld(bodyId: string, faceIndex: number): [number, number, number] | null {
    const entity = this.entities.get(bodyId);
    if (!isBodyEntity(entity) || !entity.meta.primaryGeometryId) return null;
    return this.getFaceCentroidWorld(bodyId, entity.meta.primaryGeometryId, faceIndex);
  }

  projectToScreen(worldPos: { x: number; y: number; z: number }): {
    x: number;
    y: number;
    z: number;
  } {
    this._camera.updateMatrixWorld(true);
    this._camera.updateProjectionMatrix();
    const projected = new Vector3(worldPos.x, worldPos.y, worldPos.z).project(this._camera);
    return {
      x: (projected.x + 1) * 0.5 * this._canvasSize.width,
      y: (1 - projected.y) * 0.5 * this._canvasSize.height,
      z: projected.z,
    };
  }

  // ── Label overlay API ──

  /** Returns a snapshot of all body/joint labels for the HTML overlay layer. */
  getLabelSnapshot(): LabelEntry[] {
    this._camera.updateMatrixWorld(true);
    this._camera.updateProjectionMatrix();

    const result: LabelEntry[] = [];
    const pos = new Vector3();
    const edgePos = new Vector3();
    const hw = this._canvasSize.width * 0.5;
    const hh = this._canvasSize.height * 0.5;

    for (const entity of this.entities.values()) {
      if (entity.meta.kind === 'body') {
        if (!entity.meta.bodyName) continue;
        entity.rootNode.getWorldPosition(pos);

        // Estimate screen radius from bounding sphere of geometry meshes.
        let screenRadius = 0;
        for (const [, geo] of entity.meta.geometries) {
          const sphere = geo.mesh.geometry.boundingSphere;
          if (!sphere) {
            geo.mesh.geometry.computeBoundingSphere();
          }
          const bs = geo.mesh.geometry.boundingSphere;
          if (bs) {
            // Project center and an edge point, measure pixel distance.
            const center = pos.clone().project(this._camera);
            edgePos.copy(pos);
            edgePos.x += bs.radius;
            const edge = edgePos.project(this._camera);
            const dx = (edge.x - center.x) * hw;
            const dy = (edge.y - center.y) * hh;
            const r = Math.sqrt(dx * dx + dy * dy);
            if (r > screenRadius) screenRadius = r;
          }
        }

        result.push({
          entityId: entity.id,
          entityType: 'body',
          name: entity.meta.bodyName,
          worldPosition: { x: pos.x, y: pos.y, z: pos.z },
          screenRadius,
          isSelected: this.currentSelectedIds.has(entity.id),
          isHovered: this._hoveredId === entity.id,
        });
      } else if (entity.meta.kind === 'joint') {
        entity.rootNode.getWorldPosition(pos);
        result.push({
          entityId: entity.id,
          entityType: 'joint',
          name: entity.meta.jointName,
          jointType: entity.meta.jointType,
          worldPosition: { x: pos.x, y: pos.y, z: pos.z },
          screenRadius: 12, // joints are point-like
          isSelected: this.currentSelectedIds.has(entity.id),
          isHovered: this._hoveredId === entity.id,
        });
      }
    }
    return result;
  }

  /** Called by the HTML overlay when a label pill is hovered. */
  onLabelHover(entityId: string | null): void {
    this.applyHover(entityId);
  }

  private applyVisualState(entity: SceneEntityInternal): void {
    const isSelected = this.currentSelectedIds.has(entity.id);
    const isHovered = this._hoveredId === entity.id;
    const entityColor = ENTITY_COLORS[entity.type] ?? ACCENT;

    if (entity.meta.kind === 'datum') {
      // Datum uses MeshBasicMaterial + LineBasicMaterial (flat, no PBR)
      const opacity =
        entity.meta.isCreationAnchor || entity.meta.emphasisOpacity >= 1
          ? 1
          : Math.min(entity.meta.disabledOpacity, entity.meta.emphasisOpacity);
      entity.rootNode.traverse((child) => {
        if (isFatLine(child)) {
          const mat = child.material as LineMaterial;
          mat.transparent = opacity < 0.999;
          mat.opacity = opacity;
        } else if (child instanceof Mesh && child.material instanceof MeshBasicMaterial) {
          child.material.transparent = opacity < 0.999;
          child.material.opacity = opacity;
        }
      });
    } else {
      for (const mesh of entity.meshes) {
        if (isSelected) {
          this.deps.materialFactory.applySelectionTint(mesh, entityColor);
        } else {
          this.deps.materialFactory.removeSelectionTint(mesh);
        }
        // Entity-type-aware hover emissive
        if (isHovered && !isSelected && isMeshStandardMaterial(mesh.material)) {
          mesh.material.emissive.copy(entityColor);
          mesh.material.emissiveIntensity = 0.35;
        } else if (!isHovered && !isSelected && isMeshStandardMaterial(mesh.material)) {
          mesh.material.emissive.copy(BLACK);
          mesh.material.emissiveIntensity = 0;
        }
      }
    }

    if (isBodyEntity(entity)) {
      for (const edgeLines of getBodyEdgeLines(entity)) {
        const edgeMat = edgeLines.material as LineBasicMaterial;
        if (isSelected) {
          edgeMat.color.set(entityColor.getHex());
          edgeMat.opacity = 0.8;
        } else if (isHovered) {
          edgeMat.color.set(entityColor.getHex());
          edgeMat.opacity = 0.5;
        } else {
          edgeMat.color.set(0x202028);
          edgeMat.opacity = 0.3;
        }
        edgeMat.needsUpdate = true;
      }
    }

    if (entity.meta.kind === 'joint') {
      const typeColor = JOINT_TYPE_COLORS[entity.meta.jointType] ?? JOINT_STEEL_BLUE;
      if (entity.meta.linkLine) {
        const lineMaterial = entity.meta.linkLine.material as LineMaterial;
        if (isSelected) {
          lineMaterial.color.copy(entityColor);
          lineMaterial.opacity = 1.0;
        } else if (isHovered) {
          lineMaterial.color.copy(typeColor);
          lineMaterial.opacity = 1.0;
        } else {
          lineMaterial.color.copy(typeColor);
          lineMaterial.opacity = 0.6;
        }
        lineMaterial.needsUpdate = true;
      }
      if (entity.meta.glyph) {
        if (isSelected) {
          entity.meta.glyph.setMode('selected');
          entity.meta.glyph.setColor(JOINT_GLYPH_SELECTED);
        } else if (isHovered) {
          entity.meta.glyph.setMode('hover');
          entity.meta.glyph.setColor(JOINT_GLYPH_HOVER);
        } else {
          entity.meta.glyph.setMode('idle');
          entity.meta.glyph.setColor(JOINT_STEEL_BLUE);
        }
      }
    }

    if (entity.meta.kind === 'load' && entity.meta.line) {
      const lineMaterial = entity.meta.line.material as LineMaterial;
      lineMaterial.color.copy(isSelected ? entityColor : getLoadBaseColor(entity.meta.kindTag));
    }

    if (entity.meta.kind === 'actuator') {
      const accent = isSelected || isHovered ? entityColor : MOTOR_INDICATOR;
      entity.rootNode.traverse((child) => {
        if (child instanceof Line && child.material instanceof LineBasicMaterial) {
          child.material.color.copy(accent);
          child.material.needsUpdate = true;
        }
        if (child instanceof Mesh && child.material instanceof MeshBasicMaterial) {
          child.material.color.copy(accent);
          child.material.needsUpdate = true;
        }
      });
    }
  }

  private refreshLoadVisualsInternal(): void {
    for (const entity of this.entities.values()) {
      if (entity.meta.kind !== 'load') continue;

      const anchorDatum = entity.meta.anchorDatumId
        ? this.entities.get(entity.meta.anchorDatumId)
        : undefined;
      if (!anchorDatum) {
        entity.rootNode.visible = false;
        continue;
      }

      anchorDatum.rootNode.getWorldPosition(this.loadAnchor);
      entity.rootNode.visible = true;
      entity.rootNode.position.copy(this.loadAnchor);

      if (entity.meta.kindTag === 'spring-damper' && entity.meta.line) {
        const secondDatum = entity.meta.secondDatumId
          ? this.entities.get(entity.meta.secondDatumId)
          : undefined;
        if (!secondDatum) {
          entity.rootNode.visible = false;
          continue;
        }
        secondDatum.rootNode.getWorldPosition(this.loadSecond);
        entity.rootNode.position.set(0, 0, 0);
        setLinePoints(entity.meta.line, [this.loadAnchor, this.loadSecond]);
        continue;
      }

      if (entity.meta.line) {
        const vectorData = entity.meta.loadState?.vector;
        this.loadDirection.set(vectorData?.x ?? 0, vectorData?.y ?? 1, vectorData?.z ?? 0);
        if (entity.meta.loadState?.referenceFrame === 'datum-local') {
          anchorDatum.rootNode.getWorldQuaternion(this.loadOrientation);
          this.loadDirection.applyQuaternion(this.loadOrientation);
        }
        const length = Math.max(this.loadDirection.length(), 0.25);
        if (this.loadDirection.lengthSq() > EPSILON) {
          this.loadDirection.normalize();
        } else {
          this.loadDirection.set(0, 1, 0);
        }
        this.lineEnd.copy(this.loadDirection).multiplyScalar(length);
        setLinePoints(entity.meta.line, [this.lineOrigin, this.lineEnd]);
        if (entity.meta.arrow) {
          entity.meta.arrow.position.set(0, 0, 0);
          entity.meta.arrow.setDirection(this.loadDirection);
          entity.meta.arrow.setLength(
            length,
            Math.min(length * 0.25, 0.18),
            Math.min(length * 0.14, 0.1),
          );
          entity.meta.arrow.setColor(getLoadBaseColor(entity.meta.kindTag));
        }
      }
    }
  }

  private resolveJointPreviewLinePoints(
    start: Vector3,
    end: Vector3,
    alignment?: JointPreviewAlignment | null,
  ): [Vector3, Vector3] {
    if (!alignment?.axis || (alignment.kind !== 'coaxial' && alignment.kind !== 'coplanar')) {
      return [start, end];
    }

    const axis = new Vector3(alignment.axis.x, alignment.axis.y, alignment.axis.z);
    if (axis.lengthSq() < EPSILON) {
      return [start, end];
    }

    axis.normalize();
    const midpoint = start.clone().add(end).multiplyScalar(0.5);
    const halfLength = Math.max(alignment.distance * 0.5, 0.12);
    return [
      midpoint.clone().addScaledVector(axis, -halfLength),
      midpoint.clone().addScaledVector(axis, halfLength),
    ];
  }

  // ──────────────────────────────────────────────
  // Collision wireframe overlay (Scene Building E3)
  // ──────────────────────────────────────────────

  private static COLLISION_WIREFRAME_MATERIAL = new MeshBasicMaterial({
    color: 0x00ff88,
    wireframe: true,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });

  updateCollisionWireframe(
    bodyId: string,
    geometryId: string,
    config:
      | {
          shapeType: 'none' | 'box' | 'sphere' | 'cylinder' | 'convex-hull';
          halfExtents?: { x: number; y: number; z: number };
          radius?: number;
          height?: number;
          offset?: { x: number; y: number; z: number };
        }
      | undefined,
  ): void {
    this.batchMutation(() => {
      const entity = this.entities.get(bodyId);
      if (!isBodyEntity(entity)) return;
      const geometryState = this.getBodyGeometryState(entity, geometryId);
      if (!geometryState) return;

      // Remove existing wireframe
      if (geometryState.collisionWireframe) {
        geometryState.rootNode.remove(geometryState.collisionWireframe);
        geometryState.collisionWireframe.geometry.dispose();
        geometryState.collisionWireframe = undefined;
      }

      if (!config || config.shapeType === 'none') return;

      let wireGeometry: BufferGeometry | undefined;
      switch (config.shapeType) {
        case 'box': {
          const hx = config.halfExtents?.x ?? 0;
          const hy = config.halfExtents?.y ?? 0;
          const hz = config.halfExtents?.z ?? 0;
          if (hx > 0 && hy > 0 && hz > 0) {
            wireGeometry = new BoxGeometry(hx * 2, hy * 2, hz * 2);
          }
          break;
        }
        case 'sphere': {
          const r = config.radius ?? 0;
          if (r > 0) {
            wireGeometry = new SphereGeometry(r, 16, 12);
          }
          break;
        }
        case 'cylinder': {
          const r = config.radius ?? 0;
          const h = config.height ?? 0;
          if (r > 0 && h > 0) {
            wireGeometry = new CylinderGeometry(r, r, h, 16);
          }
          break;
        }
      }

      if (!wireGeometry) return;

      const wireMesh = new Mesh(wireGeometry, SceneGraphManager.COLLISION_WIREFRAME_MATERIAL);
      wireMesh.renderOrder = 2;

      if (config.offset) {
        wireMesh.position.set(config.offset.x, config.offset.y, config.offset.z);
      }

      wireMesh.visible = this._collisionWireframesVisible;
      geometryState.rootNode.add(wireMesh);
      geometryState.collisionWireframe = wireMesh;
    });
  }

  setCollisionWireframeVisibility(visible: boolean): void {
    this.batchMutation(() => {
      for (const entity of this.entities.values()) {
        if (!isBodyEntity(entity)) continue;
        for (const geometryState of entity.meta.geometries.values()) {
          if (geometryState.collisionWireframe) {
            geometryState.collisionWireframe.visible = visible;
          }
        }
      }
    });
  }
}
