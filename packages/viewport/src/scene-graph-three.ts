/// <reference path="./three-mesh-bvh-worker.d.ts" />

/// <reference path="./three-mesh-bvh-worker.d.ts" />

import {
  ArrowHelper,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  EdgesGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/src/workers/GenerateMeshBVHWorker.js';

import { BodyGeometryIndex } from './body-geometry-index.js';
import { ensureBvhRaycastingPatched } from './rendering/bvh-raycast.js';
import {
  ACCENT,
  AXIS_X,
  AXIS_Y,
  AXIS_Z,
  ENTITY_COLORS,
  ENTITY_DATUM,
  ENTITY_JOINT,
  FORCE_ARROW,
  JOINT_STEEL_BLUE,
  MOTOR_INDICATOR,
  PREVIEW_OWNERSHIP_EDGE,
  SPRING_NEUTRAL,
  TORQUE_ARROW,
} from './rendering/colors-three.js';
import {
  estimateAxisDirection,
  estimateSurfaceType,
  type DatumPreviewType,
} from './rendering/surface-type-estimator.js';
import { createDofIndicator, type DofIndicatorResult } from './rendering/dof-indicators-three.js';
import { createJointAnchor, type JointAnchorResult } from './rendering/joint-anchor-three.js';
import { createLimitVisual } from './rendering/limit-visuals-three.js';
import { createMotorVisual } from './rendering/motor-visuals-three.js';
import type { MaterialFactory } from './rendering/materials-three.js';

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

export interface JointPreviewAlignment {
  readonly kind: 'coaxial' | 'coplanar' | 'coincident' | 'general';
  readonly axis?: { readonly x: number; readonly y: number; readonly z: number };
  readonly distance: number;
}

export interface SceneGraphDeps {
  materialFactory: MaterialFactory;
  requestRender?: () => void;
}

export type GizmoMode = 'translate' | 'rotate' | 'off';

export interface GizmoDragEndEvent {
  entityId: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
}

export type GizmoDragEndCallback = (event: GizmoDragEndEvent) => void;

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

type SceneEntityInternal = SceneEntity & {
  readonly meta: EntityMeta;
};

type BodyMeta = {
  kind: 'body';
  normals: Float32Array;
  indices: Uint32Array;
  geometryIndex?: BodyGeometryIndex;
  highlightedFace: number | null;
  colorAttribute?: BufferAttribute;
  facePreviewCache: Map<number, FacePreviewData>;
  faceVertexIndicesCache: Map<number, Uint32Array>;
  edgeLines?: LineSegments;
  bvhState: BodyBvhState;
  bvhBuildToken: number;
};

type DatumMeta = {
  kind: 'datum';
  parentBodyId: string;
  localPose: PoseInput;
  disabledOpacity: number;
  emphasisOpacity: number;
  isCreationAnchor: boolean;
};

type JointMeta = {
  kind: 'joint';
  parentDatumId: string;
  childDatumId: string;
  jointType: string;
  linkLine?: Line;
  anchor?: JointAnchorResult;
  lowerLimit?: number;
  upperLimit?: number;
};

export interface LoadStateInput {
  type?: string;
  datumId?: string;
  parentDatumId?: string;
  childDatumId?: string;
  vector?: { x?: number; y?: number; z?: number };
  referenceFrame?: 'datum-local' | 'world';
}

type LoadMeta = {
  kind: 'load';
  loadState: LoadStateInput | null;
  kindTag: 'point-force' | 'point-torque' | 'spring-damper' | 'unknown';
  anchorDatumId?: string;
  secondDatumId?: string;
  line?: Line;
  arrow?: ArrowHelper;
};

type ActuatorMeta = {
  kind: 'actuator';
  jointId: string;
  actuatorType: string;
};

type EntityMeta = BodyMeta | DatumMeta | JointMeta | LoadMeta | ActuatorMeta;

type FacePreviewData = {
  previewType: DatumPreviewType;
  axisDirection: [number, number, number] | null;
};

export interface DatumPreviewConfig {
  bodyId: string;
  type: 'point' | 'axis' | 'plane';
  position: [number, number, number];
  normal?: [number, number, number];
  axisDirection?: [number, number, number] | null;
}

const DEFAULT_BODY_COLOR = new Color('#8faac8');
const FACE_HIGHLIGHT_COLOR = new Color('#f59e0b');
const BLACK = new Color(0, 0, 0);
const DATUM_COLOR = new Color('#4ade80');
const LOAD_COLOR = new Color('#f87171');
const FOCUS_PADDING = 1.6;
const MIN_CAMERA_EXTENT = 0.5;
const EPSILON = 1e-6;
export const VIEWPORT_PICK_LAYER = 1;
const BVH_ASYNC_TRI_THRESHOLD = 100_000;

// Scratch objects for joint anchor orientation (avoid per-frame allocations)
const _anchorYAxis = new Vector3(0, 1, 0);
const _anchorQuat = new Quaternion();
const BVH_BUILD_OPTIONS = { indirect: true } as Parameters<BufferGeometry['computeBoundsTree']>[0] & {
  indirect: true;
};

type PendingBvhBuild = {
  bodyId: string;
  geometry: BufferGeometry;
  workerGeometry: BufferGeometry;
  buildToken: number;
};

function cloneColor(color: Color): Color {
  return new Color(color.r, color.g, color.b);
}

function getLoadBaseColor(kindTag: LoadMeta['kindTag']): Color {
  switch (kindTag) {
    case 'point-torque':
      return TORQUE_ARROW;
    case 'spring-damper':
      return SPRING_NEUTRAL;
    case 'point-force':
    case 'unknown':
    default:
      return FORCE_ARROW;
  }
}

function setPose(target: Object3D, pose: PoseInput): void {
  target.position.set(pose.position[0], pose.position[1], pose.position[2]);
  target.quaternion.set(
    pose.rotation[0],
    pose.rotation[1],
    pose.rotation[2],
    pose.rotation[3],
  );
}

function isMeshStandardMaterial(material: unknown): material is MeshStandardMaterial {
  return material instanceof MeshStandardMaterial;
}

function applyOpacity(mesh: Mesh, opacity: number): void {
  if (!isMeshStandardMaterial(mesh.material)) return;
  mesh.material.transparent = opacity < 0.999;
  mesh.material.opacity = opacity;
  mesh.material.depthWrite = opacity >= 0.999;
}

function createLine(points: Vector3[], color: Color, userData: Record<string, unknown>): Line {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(points.length * 3);
  const attribute = new BufferAttribute(positions, 3);
  attribute.setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', attribute);
  const material = new LineBasicMaterial({ color });
  const line = new Line(geometry, material);
  line.userData = userData;
  line.frustumCulled = false;
  setLinePoints(line, points);
  return line;
}

function setLinePoints(line: Line, points: readonly Vector3[]): void {
  const attribute = line.geometry.getAttribute('position') as BufferAttribute;
  const positions = attribute.array as Float32Array;
  for (let i = 0; i < points.length; i++) {
    const offset = i * 3;
    const point = points[i];
    positions[offset] = point.x;
    positions[offset + 1] = point.y;
    positions[offset + 2] = point.z;
  }
  attribute.needsUpdate = true;
}

function disposeObject3D(root: Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof Mesh) {
      obj.geometry.disposeBoundsTree?.();
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        for (const mat of obj.material) {
          mat.dispose();
        }
      } else {
        obj.material.dispose();
      }
    }
    if (obj instanceof Line) {
      obj.geometry.dispose();
      obj.material.dispose();
    }
  });
}

function setObjectLayerRecursive(root: Object3D, layer: number): void {
  root.traverse((obj) => {
    obj.layers.set(layer);
  });
}

function createJointColor(_jointType: string): Color {
  return cloneColor(JOINT_STEEL_BLUE);
}

function getLoadKind(loadState: LoadStateInput | null): LoadMeta['kindTag'] {
  if (!loadState?.type) return 'unknown';
  if (
    loadState.type === 'point-force' ||
    loadState.type === 'point-torque' ||
    loadState.type === 'spring-damper'
  ) {
    return loadState.type;
  }
  return 'unknown';
}

function getBoxForRoots(roots: Object3D[]): Box3 {
  const box = new Box3();
  for (const root of roots) {
    root.updateMatrixWorld(true);
    box.expandByObject(root);
  }
  return box;
}

function setCameraToBox(
  camera: OrthographicCamera,
  box: Box3,
  direction: Vector3,
  canvasAspect: number,
): void {
  if (box.isEmpty()) return;

  const center = new Vector3();
  const size = new Vector3();
  box.getCenter(center);
  box.getSize(size);

  const dir = direction.lengthSq() > EPSILON
    ? direction.clone().normalize()
    : new Vector3(1, 1, 1).normalize();

  const maxDim = Math.max(size.x, size.y, size.z, MIN_CAMERA_EXTENT);
  camera.position.copy(center).add(dir.multiplyScalar(maxDim * 2.5));
  camera.lookAt(center);

  const aspect = Math.max(canvasAspect, EPSILON);
  const fitHeight = Math.max(size.y, size.z, size.x / aspect, MIN_CAMERA_EXTENT) * FOCUS_PADDING;
  const fitWidth = fitHeight * aspect;

  camera.top = fitHeight / 2;
  camera.bottom = -fitHeight / 2;
  camera.left = -fitWidth / 2;
  camera.right = fitWidth / 2;
  camera.near = -Math.max(maxDim * 10, 100);
  camera.far = Math.max(maxDim * 10, 100);
  camera.updateProjectionMatrix();
}

export class SceneGraphManager {
  private readonly _scene: Scene;
  private readonly _camera: OrthographicCamera;
  private readonly deps: SceneGraphDeps;
  private readonly entities = new Map<string, SceneEntityInternal>();
  private readonly datumPreviewRoot = new Group();
  private readonly jointPreviewRoot = new Group();
  private readonly dofPreviewRoot = new Group();
  private readonly loadPreviewRoot = new Group();
  private readonly forceArrowIds = new Set<string>();
  private readonly activeDofIndicators = new Map<string, DofIndicatorResult>();
  private readonly activeLimitVisuals = new Map<string, import('./rendering/limit-visuals-three.js').LimitVisual>();
  private readonly jointSelectionOverlays = new Map<string, Group>();
  private _dofPreviewIndicator: DofIndicatorResult | null = null;
  private readonly jointLineStart = new Vector3();
  private readonly jointLineEnd = new Vector3();
  private readonly jointLineCenter = new Vector3();
  private readonly loadAnchor = new Vector3();
  private readonly loadSecond = new Vector3();
  private readonly loadDirection = new Vector3();
  private readonly loadOrientation = new Quaternion();
  private readonly lineOrigin = new Vector3(0, 0, 0);
  private readonly lineStart = new Vector3();
  private readonly lineEnd = new Vector3();
  private readonly faceNormalMatrix = new Matrix4();
  private readonly faceNormalVector = new Vector3();
  private readonly axisWorldVector = new Vector3();

  private currentSelectedIds = new Set<string>();
  private _hoveredId: string | null = null;
  private readonly connectedBodyHighlights = new Set<string>();
  private _gridVisible = true;
  private _canvasSize = { width: 1, height: 1 };
  private _gizmoMode: GizmoMode = 'off';
  private _gizmoAttachedId: string | null = null;
  private _gizmoDragEndCallback: GizmoDragEndCallback | undefined;
  private _datumPreviewBodyId: string | null = null;
  private mutationDepth = 0;
  private pendingJointRefresh = false;
  private pendingLoadRefresh = false;
  private pendingEntityListChange = false;
  private pendingRender = false;
  private bvhWorker: GenerateMeshBVHWorker | null = null;
  private bvhBuildQueue: PendingBvhBuild[] = [];
  private bvhBuildInFlight = false;
  private nextBvhBuildToken = 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drei's useBounds return type isn't exported
  private boundsApi: any = null;

  private entityListChangedListeners: (() => void)[] = [];
  onGizmoStateChanged?: () => void;
  onGridVisibilityChanged?: () => void;

  constructor(scene: Scene, camera: OrthographicCamera, deps: SceneGraphDeps) {
    ensureBvhRaycastingPatched();
    this._scene = scene;
    this._camera = camera;
    this.deps = deps;
    this._camera.layers.enable(VIEWPORT_PICK_LAYER);

    this.datumPreviewRoot.name = 'datum_preview';
    this.datumPreviewRoot.visible = false;
    setObjectLayerRecursive(this.datumPreviewRoot, VIEWPORT_PICK_LAYER);
    this._scene.add(this.datumPreviewRoot);

    this.jointPreviewRoot.name = 'joint_preview';
    this.jointPreviewRoot.visible = false;
    setObjectLayerRecursive(this.jointPreviewRoot, VIEWPORT_PICK_LAYER);
    this._scene.add(this.jointPreviewRoot);

    this.dofPreviewRoot.name = 'dof_preview';
    this.dofPreviewRoot.visible = false;
    setObjectLayerRecursive(this.dofPreviewRoot, VIEWPORT_PICK_LAYER);
    this._scene.add(this.dofPreviewRoot);

    this.loadPreviewRoot.name = 'load_preview';
    this.loadPreviewRoot.visible = false;
    setObjectLayerRecursive(this.loadPreviewRoot, VIEWPORT_PICK_LAYER);
    this._scene.add(this.loadPreviewRoot);
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

  private ensureBodyColorAttribute(entity: SceneEntityInternal & { meta: BodyMeta }): BufferAttribute {
    const existing = entity.meta.colorAttribute;
    if (existing) {
      return existing;
    }

    const mesh = entity.meshes[0];
    const geometry = mesh.geometry as BufferGeometry;
    const vertexCount = geometry.getAttribute('position').count;
    const colors = new Float32Array(vertexCount * 3);
    colors.fill(1);
    const colorAttribute = new BufferAttribute(colors, 3);
    colorAttribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute('color', colorAttribute);
    (mesh.material as MeshStandardMaterial).vertexColors = true;
    (mesh.material as MeshStandardMaterial).needsUpdate = true;
    entity.meta.colorAttribute = colorAttribute;
    return colorAttribute;
  }

  private scheduleBodyBvhBuild(
    bodyId: string,
    geometry: BufferGeometry,
    triangleCount: number,
  ): void {
    const entity = this.entities.get(bodyId);
    if (!this.isBodyEntity(entity)) return;

    const buildToken = this.nextBvhBuildToken++;
    entity.meta.bvhBuildToken = buildToken;
    entity.meta.bvhState = 'building';

    if (triangleCount < BVH_ASYNC_TRI_THRESHOLD) {
      this.buildBodyBvhSync(bodyId, geometry, buildToken);
      return;
    }

    const worker = this.getOrCreateBvhWorker();
    const workerGeometry = worker ? this.cloneGeometryForBvhBuild(geometry) : null;
    if (!worker || !workerGeometry) {
      this.buildBodyBvhSync(bodyId, geometry, buildToken);
      return;
    }

    this.bvhBuildQueue.push({
      bodyId,
      geometry,
      workerGeometry,
      buildToken,
    });
    void this.pumpBvhBuildQueue();
  }

  private buildBodyBvhSync(
    bodyId: string,
    geometry: BufferGeometry,
    buildToken: number,
  ): void {
    try {
      geometry.computeBoundsTree(BVH_BUILD_OPTIONS);
      const entity = this.entities.get(bodyId);
      if (!this.isBodyEntity(entity) || entity.meta.bvhBuildToken !== buildToken) return;
      entity.meta.bvhState = 'ready';
    } catch {
      const entity = this.entities.get(bodyId);
      if (!this.isBodyEntity(entity) || entity.meta.bvhBuildToken !== buildToken) return;
      entity.meta.bvhState = 'failed';
    }
  }

  private getOrCreateBvhWorker(): GenerateMeshBVHWorker | null {
    if (typeof Worker === 'undefined') return null;
    if (!this.bvhWorker) {
      this.bvhWorker = new GenerateMeshBVHWorker();
    }
    return this.bvhWorker;
  }

  private cloneGeometryForBvhBuild(geometry: BufferGeometry): BufferGeometry | null {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    if (!(position instanceof BufferAttribute) || !index) {
      return null;
    }

    const clone = new BufferGeometry();
    const positionArray = position.array;
    const positionCopy = new Float32Array(positionArray.length);
    positionCopy.set(positionArray as ArrayLike<number>);
    clone.setAttribute(
      'position',
      new BufferAttribute(positionCopy, position.itemSize, position.normalized),
    );

    const indexArray = index.array;
    const IndexArrayCtor = indexArray.constructor as {
      new (source: ArrayLike<number>): Uint16Array | Uint32Array;
    };
    const indexCopy = new IndexArrayCtor(indexArray as ArrayLike<number>);
    clone.setIndex(new BufferAttribute(indexCopy, index.itemSize, index.normalized));
    return clone;
  }

  private async pumpBvhBuildQueue(): Promise<void> {
    if (this.bvhBuildInFlight) return;

    const next = this.bvhBuildQueue.shift();
    if (!next) return;

    const worker = this.getOrCreateBvhWorker();
    if (!worker) {
      next.workerGeometry.dispose();
      this.buildBodyBvhSync(next.bodyId, next.geometry, next.buildToken);
      void this.pumpBvhBuildQueue();
      return;
    }

    this.bvhBuildInFlight = true;

    try {
      const bvh = await worker.generate(next.workerGeometry, BVH_BUILD_OPTIONS);
      const entity = this.entities.get(next.bodyId);
      if (
        this.isBodyEntity(entity) &&
        entity.meta.bvhBuildToken === next.buildToken &&
        entity.meshes[0]?.geometry === next.geometry
      ) {
        next.geometry.boundsTree = bvh;
        entity.meta.bvhState = 'ready';
        this.requestRender();
      }
    } catch {
      const entity = this.entities.get(next.bodyId);
      if (this.isBodyEntity(entity) && entity.meta.bvhBuildToken === next.buildToken) {
        entity.meta.bvhState = 'failed';
      }
    } finally {
      next.workerGeometry.dispose();
      this.bvhBuildInFlight = false;
      void this.pumpBvhBuildQueue();
    }
  }

  private getFaceVertexIndices(entity: SceneEntityInternal & { meta: BodyMeta }, faceIndex: number): Uint32Array {
    const cached = entity.meta.faceVertexIndicesCache.get(faceIndex);
    if (cached) {
      return cached;
    }

    const geometry = entity.meshes[0].geometry as BufferGeometry;
    const indexAttr = geometry.getIndex();
    const geometryIndex = entity.meta.geometryIndex;
    if (!indexAttr || !geometryIndex) {
      const empty = new Uint32Array(0);
      entity.meta.faceVertexIndicesCache.set(faceIndex, empty);
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
    entity.meta.faceVertexIndicesCache.set(faceIndex, vertices);
    return vertices;
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

  private isBodyEntity(
    entity: SceneEntityInternal | undefined,
  ): entity is SceneEntityInternal & { meta: BodyMeta } {
    return Boolean(entity && entity.meta.kind === 'body');
  }

  setCanvasSize(width: number, height: number): void {
    this._canvasSize.width = Math.max(1, width);
    this._canvasSize.height = Math.max(1, height);
  }

  /** Injected by BoundsBridge — provides drei Bounds camera-fitting API. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setBoundsApi(api: any): void {
    this.boundsApi = api;
  }

  private get canvasAspect(): number {
    return this._canvasSize.width / Math.max(this._canvasSize.height, 1);
  }
  addBody(
    id: string,
    _name: string,
    meshData: MeshDataInput,
    pose: PoseInput,
    partIndex?: Uint32Array,
  ): SceneEntity {
    return this.batchMutation(() => {
      const existing = this.entities.get(id);
      if (existing) {
        this.removeBody(id);
      }

      const group = new Group();
      group.name = `body_${id}`;
      group.userData = { entityId: id, entityType: 'body' };

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
      mesh.name = `body_mesh_${id}`;
      mesh.userData = { entityId: id, entityType: 'body' };
      group.add(mesh);

      const EDGE_DEFER_THRESHOLD = 100_000;
      const triangleCount = meshData.indices.length / 3;
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
        edgeLines.name = `body_edges_${id}`;
        edgeLines.userData = { entityId: id, entityType: 'body', isEdge: true };
        edgeLines.renderOrder = 1;
        group.add(edgeLines);
      }

      setPose(group, pose);
      setObjectLayerRecursive(group, VIEWPORT_PICK_LAYER);
      this._scene.add(group);

      const entity: SceneEntityInternal = {
        id,
        type: 'body',
        rootNode: group,
        meshes: [mesh],
        meta: {
          kind: 'body',
          normals: meshData.normals,
          indices: meshData.indices,
          geometryIndex: partIndex ? new BodyGeometryIndex(partIndex) : undefined,
          highlightedFace: null,
          facePreviewCache: new Map(),
          faceVertexIndicesCache: new Map(),
          edgeLines,
          bvhState: 'none',
          bvhBuildToken: 0,
        },
      };

      if (triangleCount > EDGE_DEFER_THRESHOLD) {
        setTimeout(() => {
          if (!this.entities.has(id)) return;
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
          deferred.name = `body_edges_${id}`;
          deferred.userData = { entityId: id, entityType: 'body', isEdge: true };
          deferred.renderOrder = 1;
          setObjectLayerRecursive(deferred, VIEWPORT_PICK_LAYER);
          group.add(deferred);
          (entity.meta as BodyMeta).edgeLines = deferred;
          this.applyVisualState(entity);
          this.requestRender();
        }, 0);
      }
      this.entities.set(id, entity);
      this.scheduleBodyBvhBuild(id, geometry, triangleCount);

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
      this.bvhBuildQueue.length = 0;
      this.bvhWorker?.dispose();
      this.bvhWorker = null;
      this.bvhBuildInFlight = false;
      for (const entity of this.entities.values()) {
        this._scene.remove(entity.rootNode);
        disposeObject3D(entity.rootNode);
      }
      this.entities.clear();
      this.forceArrowIds.clear();
      this.clearDatumPreview();
      this.clearJointPreviewLine();
      this.clearJointTypePreview();
      for (const [id, indicator] of this.activeDofIndicators) {
        indicator.dispose();
      }
      this.activeDofIndicators.clear();
      this.markEntityListChanged();
      this.requestRender();
    });
  }

  dispose(): void {
    this.clear();
    this._scene.remove(this.datumPreviewRoot);
    disposeObject3D(this.datumPreviewRoot);
    this._scene.remove(this.jointPreviewRoot);
    disposeObject3D(this.jointPreviewRoot);
    this._scene.remove(this.dofPreviewRoot);
    disposeObject3D(this.dofPreviewRoot);
  }

  addDatum(
    id: string,
    parentBodyId: string,
    localPose: PoseInput,
    _name?: string,
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
        new SphereGeometry(0.018, 8, 8),
        new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
      );
      root.add(originDot);

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
        const lineMat = new LineBasicMaterial({ color, toneMapped: false });
        const axisEnd = new Vector3(dx, dy, dz);
        root.add(createLine([this.lineOrigin, axisEnd], color, {}));

        const dir = axisEnd.clone().normalize();
        const perp = new Vector3();
        if (Math.abs(dir.y) < 0.9) {
          perp.crossVectors(dir, new Vector3(0, 1, 0)).normalize();
        } else {
          perp.crossVectors(dir, new Vector3(1, 0, 0)).normalize();
        }
        const back = axisEnd.clone().sub(dir.clone().multiplyScalar(ARROW_SIZE));
        const arrowGeo = new BufferGeometry().setFromPoints([
          back.clone().add(perp.clone().multiplyScalar(ARROW_SIZE * 0.4)),
          axisEnd.clone(),
          back.clone().sub(perp.clone().multiplyScalar(ARROW_SIZE * 0.4)),
        ]);
        root.add(new Line(arrowGeo, lineMat));
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
          disabledOpacity: 1,
          emphasisOpacity: 1,
          isCreationAnchor: false,
        },
      };
      this.entities.set(id, entity);
      this.applyVisualState(entity);
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
  ): SceneEntity | undefined {
    return this.batchMutation(() => {
      this.removeJoint(id);

      const root = new Group();
      root.name = `joint_${id}`;
      root.userData = { entityId: id, entityType: 'joint', jointType };

      const color = createJointColor(jointType);
      const linkLine = createLine(
        [this.lineOrigin, this.lineOrigin],
        color,
        { entityId: id, entityType: 'joint' },
      );
      // Enable transparency for hover/idle opacity changes
      (linkLine.material as LineBasicMaterial).transparent = true;
      (linkLine.material as LineBasicMaterial).opacity = 0.6;
      root.add(linkLine);

      // Joint anchor glyph (always visible sphere + axis pin)
      const anchor = createJointAnchor();
      anchor.rootNode.userData = { entityId: id, entityType: 'joint' };
      root.add(anchor.rootNode);

      setObjectLayerRecursive(root, VIEWPORT_PICK_LAYER);

      this._scene.add(root);

      const entity: SceneEntityInternal = {
        id,
        type: 'joint',
        rootNode: root,
        meshes: [...anchor.meshes],
        meta: {
          kind: 'joint',
          parentDatumId,
          childDatumId,
          jointType,
          linkLine,
          anchor,
        },
      };
      this.entities.set(id, entity);
      this.markJointRefreshNeeded();
      this.applyVisualState(entity);
      this.markEntityListChanged();
      this.requestRender();
      return entity;
    });
  }

  removeJoint(id: string): boolean {
    return this.batchMutation(() => {
      const entity = this.entities.get(id);
      if (!entity || entity.meta.kind !== 'joint') return false;
      const indicator = this.activeDofIndicators.get(id);
      if (indicator) {
        indicator.dispose();
        this.activeDofIndicators.delete(id);
      }
      if (entity.meta.anchor) {
        entity.meta.anchor.dispose();
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
        (entity.meta.linkLine.material as LineBasicMaterial).color.copy(createJointColor(jointType));
      }
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
  private createJointCoordinateOverlay(
    entity: SceneEntityInternal,
  ): Group | null {
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
    const createTriad = (worldPos: Vector3, color: Color, scale: number) => {
      const triGroup = new Group();
      triGroup.position.copy(worldPos);
      const axisLength = 0.04 * scale;
      const axes: [Vector3, Color][] = [
        [new Vector3(axisLength, 0, 0), AXIS_X],
        [new Vector3(0, axisLength, 0), AXIS_Y],
        [new Vector3(0, 0, axisLength), AXIS_Z],
      ];
      for (const [dir, axisColor] of axes) {
        const geo = new BufferGeometry().setFromPoints([new Vector3(0, 0, 0), dir]);
        const mat = new LineBasicMaterial({ color: axisColor });
        const line = new Line(geo, mat);
        line.userData.isPickable = false;
        triGroup.add(line);
      }
      return triGroup;
    };

    // Helper: create a dashed line between multiple world-space points
    const createDashedLine = (points: Vector3[], color: Color) => {
      const geo = new BufferGeometry().setFromPoints(points);
      const mat = new LineDashedMaterial({
        color,
        dashSize: 0.02,
        gapSize: 0.01,
      });
      const line = new Line(geo, mat);
      line.computeLineDistances();
      line.userData.isPickable = false;
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
      this.jointLineCenter
        .copy(this.jointLineStart)
        .add(this.jointLineEnd)
        .multiplyScalar(0.5);
      entity.rootNode.position.copy(this.jointLineCenter);
      entity.rootNode.quaternion.identity();
      entity.rootNode.visible = true;

      if (entity.meta.linkLine) {
        this.lineStart.copy(this.jointLineStart).sub(this.jointLineCenter);
        this.lineEnd.copy(this.jointLineEnd).sub(this.jointLineCenter);
        setLinePoints(entity.meta.linkLine, [
          this.lineStart,
          this.lineEnd,
        ]);
      }

      // Orient anchor pin along parent→child axis
      if (entity.meta.anchor) {
        // lineEnd points from center toward child datum (already computed above)
        const dir = this.lineEnd;
        if (dir.lengthSq() > 1e-8) {
          const yAxis = _anchorYAxis;
          _anchorQuat.setFromUnitVectors(yAxis, dir.clone().normalize());
          entity.meta.anchor.rootNode.quaternion.copy(_anchorQuat);
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
        const line = createLine(
          [this.lineOrigin, this.lineOrigin],
          getLoadBaseColor(kindTag),
          { entityId: loadId, entityType: 'load' },
        );
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
        meshes: visual.meshes,
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
      this.boundsApi.refresh(box).moveTo([pos.x, pos.y, pos.z]).lookAt({ target: [center.x, center.y, center.z] }).fit();
    } else {
      setCameraToBox(this._camera, box, directions[preset], this.canvasAspect);
    }
    this.requestRender();
  }

  animateCameraTo(
    _alpha: number,
    _beta: number,
    _radius?: number,
    _duration?: number,
  ): void {
    this.fitAll();
  }

  focusOnEntity(id: string): void {
    const entity = this.entities.get(id);
    if (!entity) return;
    const box = getBoxForRoots([entity.rootNode]);
    if (this.boundsApi) {
      this.boundsApi.refresh(box).fit();
    } else {
      const direction = this._camera.position.clone();
      if (direction.lengthSq() < EPSILON) direction.set(1, 1, 1);
      setCameraToBox(this._camera, box, direction, this.canvasAspect);
    }
    this.requestRender();
  }

  focusOnEntities(ids: string[]): void {
    const roots = ids
      .map((id) => this.entities.get(id)?.rootNode)
      .filter((value): value is Group => Boolean(value));
    if (roots.length === 0) return;
    const box = getBoxForRoots(roots);
    if (this.boundsApi) {
      this.boundsApi.refresh(box).fit();
    } else {
      const direction = new Vector3();
      this._camera.getWorldDirection(direction);
      direction.negate();
      setCameraToBox(this._camera, box, direction, this.canvasAspect);
    }
    this.requestRender();
  }
  applySelection(selectedIds: Set<string>): void {
    const prev = this.currentSelectedIds;
    this.currentSelectedIds = new Set(selectedIds);

    // Only update entities whose selection state changed
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

    // DOF indicators: remove for joints no longer selected
    for (const [id, indicator] of this.activeDofIndicators) {
      if (!selectedIds.has(id)) {
        indicator.rootNode.removeFromParent();
        indicator.dispose();
        this.activeDofIndicators.delete(id);
      }
    }
    // DOF indicators: create for newly selected joints
    for (const id of selectedIds) {
      if (this.activeDofIndicators.has(id)) continue;
      const entity = this.entities.get(id);
      if (!entity || entity.meta.kind !== 'joint') continue;
      const indicator = createDofIndicator(entity.meta.jointType);
      if (!indicator) continue;
      entity.rootNode.add(indicator.rootNode);
      this.activeDofIndicators.set(id, indicator);
    }

    // Limit visuals: remove for joints no longer selected
    for (const [id, visual] of this.activeLimitVisuals) {
      if (!selectedIds.has(id)) {
        visual.rootNode.removeFromParent();
        visual.dispose();
        this.activeLimitVisuals.delete(id);
      }
    }
    // Limit visuals: create for newly selected joints with limits
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

    // Joint selection coordinate overlays: remove for deselected joints
    for (const [id, overlay] of this.jointSelectionOverlays) {
      if (!selectedIds.has(id)) {
        overlay.removeFromParent();
        disposeObject3D(overlay);
        this.jointSelectionOverlays.delete(id);
      }
    }
    // Joint selection coordinate overlays: create for newly selected joints
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
      if (!body || body.meta.kind !== 'body' || !body.meta.edgeLines) continue;
      const edgeMat = body.meta.edgeLines.material as LineBasicMaterial;
      edgeMat.color.copy(JOINT_STEEL_BLUE);
      edgeMat.opacity = 0.4;
      edgeMat.needsUpdate = true;
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
    this.requestRender();
  }

  highlightFace(bodyId: string, faceIndex: number): void {
    const entity = this.entities.get(bodyId);
    if (!this.isBodyEntity(entity)) return;
    const geometryIndex = entity.meta.geometryIndex;
    if (!geometryIndex || faceIndex < 0 || faceIndex >= geometryIndex.faceRanges.length) return;
    if (entity.meta.highlightedFace === faceIndex) return;

    this.clearFaceHighlight(bodyId);

    const colorAttr = this.ensureBodyColorAttribute(entity);
    const vertexIndices = this.getFaceVertexIndices(entity, faceIndex);
    this.setFaceVertexColor(colorAttr, vertexIndices, FACE_HIGHLIGHT_COLOR);
    entity.meta.highlightedFace = faceIndex;
    this.requestRender();
  }

  clearFaceHighlight(bodyId: string): void {
    const entity = this.entities.get(bodyId);
    if (!this.isBodyEntity(entity)) return;
    if (entity.meta.highlightedFace === null) return;
    const colorAttr = entity.meta.colorAttribute;
    if (!colorAttr) return;
    const vertexIndices = this.getFaceVertexIndices(entity, entity.meta.highlightedFace);
    this.setFaceVertexColor(colorAttr, vertexIndices, new Color(1, 1, 1));
    entity.meta.highlightedFace = null;
    this.requestRender();
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

  setGizmoOnDragEnd(callback: GizmoDragEndCallback | undefined): void {
    this._gizmoDragEndCallback = callback;
  }

  getGizmoTargetObject(): Object3D | null {
    if (!this._gizmoAttachedId || this._gizmoMode === 'off') {
      return null;
    }
    const entity = this.entities.get(this._gizmoAttachedId);
    return entity?.meta.kind === 'datum' ? entity.rootNode : null;
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
    if (!entity || entity.meta.kind !== 'datum') return;

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

    entity.meta.localPose = { position, rotation };
    this._gizmoDragEndCallback({
      entityId: entity.id,
      position,
      rotation,
    });
  }

  // TODO (Epic 15.2): Wire to simulation channels `joint/{id}/reaction-force`
  // and `joint/{id}/reaction-torque`. Currently called imperatively; future
  // integration will subscribe to live result channels via the trace store.
  updateJointForces(jointId: string, data: unknown): void {
    this.batchMutation(() => {
      const entity = this.entities.get(jointId);
      if (!entity || entity.meta.kind !== 'joint') return;
      const payload = data as {
        force?: { x?: number; y?: number; z?: number };
        torque?: { x?: number; y?: number; z?: number };
      } | undefined;

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
    const preview = config;
    this.clearDatumPreview();

    this._datumPreviewBodyId = preview.bodyId;

    // Body ownership indicator — tint edge lines on the target body
    const ownerEntity = this.entities.get(preview.bodyId);
    if (ownerEntity?.meta.kind === 'body' && ownerEntity.meta.edgeLines) {
      const edgeMat = ownerEntity.meta.edgeLines.material as LineBasicMaterial;
      edgeMat.color.copy(PREVIEW_OWNERSHIP_EDGE.color);
      edgeMat.opacity = PREVIEW_OWNERSHIP_EDGE.alpha;
      edgeMat.needsUpdate = true;
    }

    this.datumPreviewRoot.visible = true;
    this.datumPreviewRoot.position.set(preview.position[0], preview.position[1], preview.position[2]);

    const color = cloneColor(PREVIEW_OWNERSHIP_EDGE.color);
    const previewMat = new LineBasicMaterial({ color, toneMapped: false });

    if (preview.type === 'point') {
      // Crosshair lines (flat, no 3D geometry)
      const size = 0.06;
      const xGeo = new BufferGeometry().setFromPoints([new Vector3(-size, 0, 0), new Vector3(size, 0, 0)]);
      const yGeo = new BufferGeometry().setFromPoints([new Vector3(0, -size, 0), new Vector3(0, size, 0)]);
      const zGeo = new BufferGeometry().setFromPoints([new Vector3(0, 0, -size), new Vector3(0, 0, size)]);
      this.datumPreviewRoot.add(new Line(xGeo, previewMat));
      this.datumPreviewRoot.add(new Line(yGeo, previewMat));
      this.datumPreviewRoot.add(new Line(zGeo, previewMat));
      setObjectLayerRecursive(this.datumPreviewRoot, VIEWPORT_PICK_LAYER);
      this.requestRender();
      return;
    }

    if (preview.type === 'axis') {
      const dir = new Vector3(...(preview.axisDirection ?? [0, 1, 0])).normalize();
      const length = 0.6;
      const tip = dir.clone().multiplyScalar(length);

      // Axis line
      const lineGeo = new BufferGeometry().setFromPoints([new Vector3(0, 0, 0), tip]);
      this.datumPreviewRoot.add(new Line(lineGeo, previewMat));

      // V arrowhead at tip
      const arrowSize = 0.08;
      const perp = new Vector3();
      if (Math.abs(dir.y) < 0.9) {
        perp.crossVectors(dir, new Vector3(0, 1, 0)).normalize();
      } else {
        perp.crossVectors(dir, new Vector3(1, 0, 0)).normalize();
      }
      const back = tip.clone().sub(dir.clone().multiplyScalar(arrowSize));
      const arrowGeo = new BufferGeometry().setFromPoints([
        back.clone().add(perp.clone().multiplyScalar(arrowSize * 0.4)),
        tip.clone(),
        back.clone().sub(perp.clone().multiplyScalar(arrowSize * 0.4)),
      ]);
      this.datumPreviewRoot.add(new Line(arrowGeo, previewMat));
      setObjectLayerRecursive(this.datumPreviewRoot, VIEWPORT_PICK_LAYER);
      this.requestRender();
      return;
    }

    const plane = createLine(
      [
        new Vector3(-0.25, 0, -0.25),
        new Vector3(0.25, 0, -0.25),
        new Vector3(0.25, 0, 0.25),
        new Vector3(-0.25, 0, 0.25),
        new Vector3(-0.25, 0, -0.25),
      ],
      color,
      { entityId: '__datum_preview__', entityType: 'preview' },
    );
    const normal = preview.normal ?? [0, 1, 0];
    plane.quaternion.copy(
      new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        new Vector3(normal[0], normal[1], normal[2]).normalize(),
      ),
    );
    this.datumPreviewRoot.add(plane);
    setObjectLayerRecursive(this.datumPreviewRoot, VIEWPORT_PICK_LAYER);
    this.requestRender();
  }

  clearDatumPreview(): void {
    // Revert body ownership indicator
    if (this._datumPreviewBodyId) {
      const prevEntity = this.entities.get(this._datumPreviewBodyId);
      if (prevEntity?.meta.kind === 'body' && prevEntity.meta.edgeLines) {
        const edgeMat = prevEntity.meta.edgeLines.material as LineBasicMaterial;
        edgeMat.color.set(0x202028);
        edgeMat.opacity = 0.3;
        edgeMat.needsUpdate = true;
      }
    }

    while (this.datumPreviewRoot.children.length > 0) {
      const child = this.datumPreviewRoot.children[0];
      this.datumPreviewRoot.remove(child);
      disposeObject3D(child);
    }
    this.datumPreviewRoot.visible = false;
    this._datumPreviewBodyId = null;
    this.requestRender();
  }

  showLoadPreview(loadState: LoadStateInput | null): void {
    this.clearLoadPreview();
    if (!loadState) return;

    const kindTag = getLoadKind(loadState);
    const anchorDatumId = loadState.datumId ?? loadState.parentDatumId;
    const anchorDatum = anchorDatumId ? this.entities.get(anchorDatumId) : undefined;
    if (!anchorDatum) return;

    anchorDatum.rootNode.getWorldPosition(this.loadAnchor);
    this.loadPreviewRoot.visible = true;

    if (kindTag === 'spring-damper') {
      const secondDatum = loadState.childDatumId ? this.entities.get(loadState.childDatumId) : undefined;
      if (!secondDatum) return;
      secondDatum.rootNode.getWorldPosition(this.loadSecond);
      this.loadPreviewRoot.add(
        createLine(
          [this.loadAnchor, this.loadSecond],
          getLoadBaseColor(kindTag),
          { entityId: '__load_preview__', entityType: 'preview' },
        ),
      );
      this.requestRender();
      return;
    }

    this.loadDirection.set(
      loadState.vector?.x ?? 0,
      loadState.vector?.y ?? 0,
      loadState.vector?.z ?? 0,
    );
    if (loadState.referenceFrame === 'datum-local') {
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

    this.loadPreviewRoot.add(
      createLine(
        [this.loadAnchor, this.loadAnchor.clone().add(this.lineEnd)],
        getLoadBaseColor(kindTag),
        { entityId: '__load_preview__', entityType: 'preview' },
      ),
    );
    this.loadPreviewRoot.add(
      new ArrowHelper(
        this.loadDirection.clone(),
        this.loadAnchor.clone(),
        length,
        getLoadBaseColor(kindTag).getHex(),
        Math.min(length * 0.25, 0.18),
        Math.min(length * 0.14, 0.1),
      ),
    );
    this.requestRender();
  }

  clearLoadPreview(): void {
    while (this.loadPreviewRoot.children.length > 0) {
      const child = this.loadPreviewRoot.children[0];
      this.loadPreviewRoot.remove(child);
      disposeObject3D(child);
    }
    this.loadPreviewRoot.visible = false;
    this.requestRender();
  }

  getDatumPreviewBodyId(): string | null {
    return this._datumPreviewBodyId;
  }

  getBodyMeshNormals(bodyId: string): Float32Array | null {
    const entity = this.entities.get(bodyId);
    return entity && entity.meta.kind === 'body' ? entity.meta.normals : null;
  }

  getBodyMeshIndices(bodyId: string): Uint32Array | null {
    const entity = this.entities.get(bodyId);
    return entity && entity.meta.kind === 'body' ? entity.meta.indices : null;
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
    const parent = this.entities.get(parentDatumId);
    const child = this.entities.get(childDatumId);
    if (!parent || !child) return;

    this.clearJointPreviewLine();

    const start = new Vector3();
    const end = new Vector3();
    parent.rootNode.getWorldPosition(start);
    child.rootNode.getWorldPosition(end);

    const line = createLine(this.resolveJointPreviewLinePoints(start, end, alignment), ACCENT, {});
    const material = line.material as LineBasicMaterial;
    material.transparent = true;
    material.opacity = 0.55;
    this.jointPreviewRoot.add(line);
    this.jointPreviewRoot.visible = true;
    setObjectLayerRecursive(this.jointPreviewRoot, VIEWPORT_PICK_LAYER);
    this.requestRender();
  }

  clearJointPreviewLine(): void {
    while (this.jointPreviewRoot.children.length > 0) {
      const child = this.jointPreviewRoot.children[0];
      this.jointPreviewRoot.remove(child);
      disposeObject3D(child);
    }
    this.jointPreviewRoot.visible = false;
    this.requestRender();
  }

  showJointTypePreview(
    jointType: string,
    parentDatumId: string,
    childDatumId: string,
    alignmentAxis?: { x: number; y: number; z: number } | null,
  ): void {
    this.clearJointTypePreview();

    const parent = this.entities.get(parentDatumId);
    const child = this.entities.get(childDatumId);
    if (!parent || !child) return;

    const start = new Vector3();
    const end = new Vector3();
    parent.rootNode.getWorldPosition(start);
    child.rootNode.getWorldPosition(end);
    const midpoint = start.clone().add(end).multiplyScalar(0.5);
    const previewAxis = alignmentAxis
      ? new Vector3(alignmentAxis.x, alignmentAxis.y, alignmentAxis.z)
      : end.clone().sub(start);
    if (previewAxis.lengthSq() < EPSILON) {
      previewAxis.set(0, 0, 1);
    }
    previewAxis.normalize();

    const indicator = createDofIndicator(jointType, previewAxis);
    if (!indicator) {
      this.dofPreviewRoot.visible = false;
      return;
    }

    indicator.rootNode.position.copy(midpoint);
    // Reduce opacity for preview appearance
    indicator.rootNode.traverse((obj) => {
      if (obj instanceof Mesh && obj.material instanceof MeshBasicMaterial) {
        obj.material.opacity = 0.5;
      }
    });

    this.dofPreviewRoot.add(indicator.rootNode);
    this.dofPreviewRoot.visible = true;
    this._dofPreviewIndicator = indicator;
    setObjectLayerRecursive(this.dofPreviewRoot, VIEWPORT_PICK_LAYER);
    this.requestRender();
  }

  clearJointTypePreview(): void {
    if (this._dofPreviewIndicator) {
      this._dofPreviewIndicator.dispose();
      this._dofPreviewIndicator = null;
    }
    while (this.dofPreviewRoot.children.length > 0) {
      const child = this.dofPreviewRoot.children[0];
      this.dofPreviewRoot.remove(child);
      disposeObject3D(child);
    }
    this.dofPreviewRoot.visible = false;
    this.requestRender();
  }

  /** DOF indicators are now static — no per-frame animation needed. */
  hasDofAnimations(): boolean {
    return false;
  }

  /** No-op — DOF indicators are static. Kept for interface compatibility. */
  updateDofAnimations(_time: number): void {}

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

  getBodyGeometryIndex(id: string): BodyGeometryIndex | undefined {
    const entity = this.entities.get(id);
    return entity && entity.meta.kind === 'body' ? entity.meta.geometryIndex : undefined;
  }

  getBodyBvhState(id: string): BodyBvhState {
    const entity = this.entities.get(id);
    return entity && entity.meta.kind === 'body' ? entity.meta.bvhState : 'none';
  }

  hasPendingBodyBvhs(): boolean {
    if (this.bvhBuildInFlight || this.bvhBuildQueue.length > 0) {
      return true;
    }
    for (const entity of this.entities.values()) {
      if (entity.meta.kind === 'body' && entity.meta.bvhState === 'building') {
        return true;
      }
    }
    return false;
  }

  getBodyFacePreview(bodyId: string, faceIndex: number): FacePreviewData | null {
    const entity = this.entities.get(bodyId);
    if (!this.isBodyEntity(entity)) return null;
    const geometryIndex = entity.meta.geometryIndex;
    if (!geometryIndex || faceIndex < 0 || faceIndex >= geometryIndex.faceRanges.length) {
      return null;
    }

    const cached = entity.meta.facePreviewCache.get(faceIndex);
    if (cached) {
      return cached;
    }

    const faceRange = geometryIndex.faceRanges[faceIndex];
    const previewType = estimateSurfaceType(entity.meta.normals, entity.meta.indices, faceRange);
    const axisDirection = previewType === 'axis'
      ? estimateAxisDirection(entity.meta.normals, entity.meta.indices, faceRange)
      : null;
    const result: FacePreviewData = { previewType, axisDirection };
    entity.meta.facePreviewCache.set(faceIndex, result);
    return result;
  }

  projectToScreen(
    worldPos: { x: number; y: number; z: number },
  ): { x: number; y: number; z: number } {
    this._camera.updateMatrixWorld(true);
    this._camera.updateProjectionMatrix();
    const projected = new Vector3(worldPos.x, worldPos.y, worldPos.z).project(this._camera);
    return {
      x: ((projected.x + 1) * 0.5) * this._canvasSize.width,
      y: ((1 - projected.y) * 0.5) * this._canvasSize.height,
      z: projected.z,
    };
  }

  private applyVisualState(entity: SceneEntityInternal): void {
    const isSelected = this.currentSelectedIds.has(entity.id);
    const isHovered = this._hoveredId === entity.id;
    const entityColor = ENTITY_COLORS[entity.type] ?? ACCENT;

    if (entity.meta.kind === 'datum') {
      // Datum uses MeshBasicMaterial + LineBasicMaterial (flat, no PBR)
      const opacity = entity.meta.isCreationAnchor || entity.meta.emphasisOpacity >= 1
        ? 1
        : Math.min(entity.meta.disabledOpacity, entity.meta.emphasisOpacity);
      entity.rootNode.traverse((child) => {
        if (child instanceof Line) {
          const mat = child.material as LineBasicMaterial;
          mat.transparent = opacity < 0.999;
          mat.opacity = opacity;
        }
        if (child instanceof Mesh && child.material instanceof MeshBasicMaterial) {
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

    if (entity.meta.kind === 'body' && entity.meta.edgeLines) {
      const edgeMat = entity.meta.edgeLines.material as LineBasicMaterial;
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

    if (entity.meta.kind === 'joint') {
      if (entity.meta.linkLine) {
        const lineMaterial = entity.meta.linkLine.material as LineBasicMaterial;
        if (isSelected) {
          lineMaterial.color.copy(entityColor);
          lineMaterial.opacity = 1.0;
        } else if (isHovered) {
          lineMaterial.color.copy(JOINT_STEEL_BLUE);
          lineMaterial.opacity = 1.0;
        } else {
          lineMaterial.color.copy(JOINT_STEEL_BLUE);
          lineMaterial.opacity = 0.6;
        }
        lineMaterial.needsUpdate = true;
      }
      // Anchor glyph emissive hover / selection tint
      if (entity.meta.anchor) {
        for (const mesh of entity.meta.anchor.meshes) {
          const mat = mesh.material as MeshStandardMaterial;
          if (isSelected) {
            mat.emissive.set(0x000000);
            mat.emissiveIntensity = 0;
            mat.color.copy(entityColor);
            mat.opacity = 1.0;
          } else if (isHovered) {
            mat.color.copy(JOINT_STEEL_BLUE);
            mat.emissive.copy(JOINT_STEEL_BLUE);
            mat.emissiveIntensity = 0.3;
            mat.opacity = 1.0;
          } else {
            mat.color.copy(JOINT_STEEL_BLUE);
            mat.emissive.set(0x000000);
            mat.emissiveIntensity = 0;
            mat.opacity = 0.7;
          }
          mat.needsUpdate = true;
        }
      }
    }

    if (entity.meta.kind === 'load' && entity.meta.line) {
      const lineMaterial = entity.meta.line.material as LineBasicMaterial;
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
        this.loadDirection.set(
          vectorData?.x ?? 0,
          vectorData?.y ?? 1,
          vectorData?.z ?? 0,
        );
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
          entity.meta.arrow.setLength(length, Math.min(length * 0.25, 0.18), Math.min(length * 0.14, 0.1));
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
}
