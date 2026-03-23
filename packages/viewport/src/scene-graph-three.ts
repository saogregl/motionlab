
import {
  ArrowHelper,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  EdgesGeometry,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
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

import { BodyGeometryIndex } from './body-geometry-index.js';
import {
  ACCENT,
  AXIS_X,
  AXIS_Y,
  AXIS_Z,
  FORCE_ARROW,
  HOVER_HIGHLIGHT,
  JOINT_FIXED,
  JOINT_PLANAR,
  JOINT_PRISMATIC,
  JOINT_REVOLUTE,
  JOINT_SPHERICAL,
  PREVIEW_OWNERSHIP_EDGE,
  TORQUE_ARROW,
} from './rendering/colors-three.js';
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
  readonly type: 'body' | 'datum' | 'joint' | 'load';
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

export interface SceneGraphDeps {
  materialFactory: MaterialFactory;
}

export type GizmoMode = 'translate' | 'rotate' | 'off';

export interface GizmoDragEndEvent {
  entityId: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
}

export type GizmoDragEndCallback = (event: GizmoDragEndEvent) => void;

type SceneEntityInternal = SceneEntity & {
  readonly meta: EntityMeta;
};

type BodyMeta = {
  kind: 'body';
  normals: Float32Array;
  indices: Uint32Array;
  geometryIndex?: BodyGeometryIndex;
  highlightedFace: number | null;
  edgeLines?: LineSegments;
};

type DatumMeta = {
  kind: 'datum';
  parentBodyId: string;
  localPose: PoseInput;
  baseOpacity: number;
};

type JointMeta = {
  kind: 'joint';
  parentDatumId: string;
  childDatumId: string;
  jointType: string;
  linkLine?: Line;
};

type LoadMeta = {
  kind: 'load';
  loadState: unknown;
  kindTag: 'point-force' | 'point-torque' | 'spring-damper' | 'unknown';
  anchorDatumId?: string;
  secondDatumId?: string;
  line?: Line;
  arrow?: ArrowHelper;
};

type EntityMeta = BodyMeta | DatumMeta | JointMeta | LoadMeta;

type DatumPreviewConfig = {
  bodyId: string;
  type: 'point' | 'axis' | 'plane';
  position: [number, number, number];
  normal?: [number, number, number];
  axisDirection?: [number, number, number] | null;
};

const DEFAULT_BODY_COLOR = new Color('#8faac8');
const FACE_HIGHLIGHT_COLOR = new Color('#f59e0b');
const HOVER_EMISSIVE = new Color(HOVER_HIGHLIGHT);
const DATUM_COLOR = new Color('#4ade80');
const LOAD_COLOR = new Color('#f87171');
const GRID_SIZE = 20;
const GRID_DIVISIONS = 20;
const FOCUS_PADDING = 1.6;
const MIN_CAMERA_EXTENT = 0.5;
const EPSILON = 1e-6;

function cloneColor(color: Color): Color {
  return new Color(color.r, color.g, color.b);
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

function applyHoverState(mesh: Mesh, hovered: boolean): void {
  if (!isMeshStandardMaterial(mesh.material)) return;
  mesh.material.emissive.copy(hovered ? HOVER_EMISSIVE : new Color(0, 0, 0));
  mesh.material.emissiveIntensity = hovered ? 0.35 : 0;
}

function createLine(points: Vector3[], color: Color, userData: Record<string, unknown>): Line {
  const geometry = new BufferGeometry().setFromPoints(points);
  const material = new LineBasicMaterial({ color });
  const line = new Line(geometry, material);
  line.userData = userData;
  return line;
}

function disposeObject3D(root: Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof Mesh) {
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

function createJointColor(jointType: string): Color {
  switch (jointType) {
    case 'revolute':
      return cloneColor(JOINT_REVOLUTE);
    case 'prismatic':
      return cloneColor(JOINT_PRISMATIC);
    case 'fixed':
      return cloneColor(JOINT_FIXED);
    case 'spherical':
      return cloneColor(JOINT_SPHERICAL);
    case 'planar':
      return cloneColor(JOINT_PLANAR);
    case 'cylindrical':
      return new Color('#22d3ee');
    default:
      return new Color('#f59e0b');
  }
}

function getLoadKind(loadState: unknown): LoadMeta['kindTag'] {
  if (!loadState || typeof loadState !== 'object') return 'unknown';
  const candidate = loadState as { type?: string };
  if (
    candidate.type === 'point-force' ||
    candidate.type === 'point-torque' ||
    candidate.type === 'spring-damper'
  ) {
    return candidate.type;
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
  private readonly gridHelper: GridHelper;
  private readonly datumPreviewRoot = new Group();
  private readonly forceArrowIds = new Set<string>();

  private currentSelectedIds = new Set<string>();
  private _hoveredId: string | null = null;
  private _gridVisible = true;
  private _canvasSize = { width: 1, height: 1 };
  private _gizmoMode: GizmoMode = 'off';
  private _gizmoAttachedId: string | null = null;
  private _gizmoDragEndCallback: GizmoDragEndCallback | undefined;
  private _datumPreviewBodyId: string | null = null;

  onEntityListChanged?: () => void;
  onGizmoStateChanged?: () => void;

  constructor(scene: Scene, camera: OrthographicCamera, deps: SceneGraphDeps) {
    this._scene = scene;
    this._camera = camera;
    this.deps = deps;

    this.gridHelper = new GridHelper(GRID_SIZE, GRID_DIVISIONS, 0x505050, 0x303030);
    this.gridHelper.material.transparent = true;
    this.gridHelper.material.opacity = 0.55;
    this.gridHelper.name = 'viewport_grid';
    this._scene.add(this.gridHelper);

    this.datumPreviewRoot.name = 'datum_preview';
    this.datumPreviewRoot.visible = false;
    this._scene.add(this.datumPreviewRoot);
  }

  get scene(): Scene {
    return this._scene;
  }

  get camera(): OrthographicCamera {
    return this._camera;
  }

  setCanvasSize(width: number, height: number): void {
    this._canvasSize.width = Math.max(1, width);
    this._canvasSize.height = Math.max(1, height);
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

    const material = this.deps.materialFactory.getDefaultMaterial().clone();
    material.color.copy(DEFAULT_BODY_COLOR);
    material.roughness = 0.65;
    material.envMapIntensity = 0.4;

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
        edgeLines,
      },
    };

    // Defer expensive edge computation for large meshes
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
        group.add(deferred);
        (entity.meta as BodyMeta).edgeLines = deferred;
        this.applyVisualState(entity);
      }, 0);
    }
    this.entities.set(id, entity);

    for (const child of this.entities.values()) {
      if (child.meta.kind !== 'datum' || child.meta.parentBodyId !== id) continue;
      group.attach(child.rootNode);
      setPose(child.rootNode, child.meta.localPose);
    }

    this.refreshJointPositions();
    this.refreshLoadVisuals();
    this.applyVisualState(entity);
    this.onEntityListChanged?.();
    return entity;
  }

  removeBody(id: string): boolean {
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
    this.onEntityListChanged?.();
    return true;
  }

  updateBodyTransform(id: string, pose: PoseInput): void {
    const entity = this.entities.get(id);
    if (!entity) return;
    setPose(entity.rootNode, pose);
    this.refreshJointPositions();
    this.refreshLoadVisuals();
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
    // Use fixed isometric direction to prevent drift on repeated calls
    const direction = new Vector3(1, 1, 1).normalize();
    setCameraToBox(this._camera, getBoxForRoots(roots), direction, this.canvasAspect);
  }

  clear(): void {
    for (const entity of this.entities.values()) {
      this._scene.remove(entity.rootNode);
      disposeObject3D(entity.rootNode);
    }
    this.entities.clear();
    this.forceArrowIds.clear();
    this.clearDatumPreview();
    this.onEntityListChanged?.();
  }

  dispose(): void {
    this.clear();
    this._scene.remove(this.gridHelper);
    this.gridHelper.geometry.dispose();
    this.gridHelper.material.dispose();
    this._scene.remove(this.datumPreviewRoot);
    disposeObject3D(this.datumPreviewRoot);
  }

  addDatum(
    id: string,
    parentBodyId: string,
    localPose: PoseInput,
    _name?: string,
  ): SceneEntity | undefined {
    const parent = this.entities.get(parentBodyId);
    if (!parent || parent.meta.kind !== 'body') {
      return undefined;
    }

    this.removeDatum(id);

    const root = new Group();
    root.name = `datum_${id}`;
    root.userData = { entityId: id, entityType: 'datum' };

    // Invisible pick sphere (larger radius for easy picking)
    const pickSphere = new Mesh(
      new SphereGeometry(0.04, 8, 8),
      new MeshBasicMaterial({ visible: false }),
    );
    pickSphere.userData = { entityId: id, entityType: 'datum' };
    root.add(pickSphere);

    // Visible origin dot (flat white, no lighting)
    const originDot = new Mesh(
      new SphereGeometry(0.018, 8, 8),
      new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    );
    root.add(originDot);

    // 2D line-based axis triad (flat color, no shading — CAD style)
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

      // Axis line
      const lineGeo = new BufferGeometry().setFromPoints([
        new Vector3(0, 0, 0),
        new Vector3(dx, dy, dz),
      ]);
      root.add(new Line(lineGeo, lineMat));

      // V-shaped arrowhead at tip
      const dir = new Vector3(dx, dy, dz).normalize();
      const perp = new Vector3();
      if (Math.abs(dir.y) < 0.9) {
        perp.crossVectors(dir, new Vector3(0, 1, 0)).normalize();
      } else {
        perp.crossVectors(dir, new Vector3(1, 0, 0)).normalize();
      }
      const tip = new Vector3(dx, dy, dz);
      const back = tip.clone().sub(dir.clone().multiplyScalar(ARROW_SIZE));
      const arrowGeo = new BufferGeometry().setFromPoints([
        back.clone().add(perp.clone().multiplyScalar(ARROW_SIZE * 0.4)),
        tip.clone(),
        back.clone().sub(perp.clone().multiplyScalar(ARROW_SIZE * 0.4)),
      ]);
      root.add(new Line(arrowGeo, lineMat));
    }

    setPose(root, localPose);
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
        baseOpacity: 1,
      },
    };
    this.entities.set(id, entity);
    this.applyVisualState(entity);
    this.onEntityListChanged?.();
    this.refreshJointPositions();
    this.refreshLoadVisuals();
    return entity;
  }

  updateDatumPose(id: string, localPose: PoseInput): void {
    const entity = this.entities.get(id);
    if (!entity || entity.meta.kind !== 'datum') return;
    entity.meta.localPose = localPose;
    setPose(entity.rootNode, localPose);
    this.refreshJointPositions();
    this.refreshLoadVisuals();
  }

  removeDatum(id: string): boolean {
    const entity = this.entities.get(id);
    if (!entity || entity.meta.kind !== 'datum') return false;
    entity.rootNode.removeFromParent();
    disposeObject3D(entity.rootNode);
    this.entities.delete(id);
    this.onEntityListChanged?.();
    this.refreshJointPositions();
    this.refreshLoadVisuals();
    return true;
  }
  addJoint(
    id: string,
    parentDatumId: string,
    childDatumId: string,
    jointType: string,
  ): SceneEntity | undefined {
    this.removeJoint(id);

    const root = new Group();
    root.name = `joint_${id}`;
    root.userData = { entityId: id, entityType: 'joint', jointType };

    // Link line only — no 3D marker meshes (joint indicators removed for redesign)
    const color = createJointColor(jointType);
    const linkLine = createLine(
      [new Vector3(0, 0, 0), new Vector3(0, 0, 0)],
      color,
      { entityId: id, entityType: 'joint' },
    );
    root.add(linkLine);

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
        linkLine,
      },
    };
    this.entities.set(id, entity);
    this.refreshJointPositions();
    this.applyVisualState(entity);
    this.onEntityListChanged?.();
    return entity;
  }

  removeJoint(id: string): boolean {
    const entity = this.entities.get(id);
    if (!entity || entity.meta.kind !== 'joint') return false;
    entity.rootNode.removeFromParent();
    disposeObject3D(entity.rootNode);
    this.entities.delete(id);
    this.onEntityListChanged?.();
    return true;
  }

  updateJoint(id: string, jointType: string): void {
    const entity = this.entities.get(id);
    if (!entity || entity.meta.kind !== 'joint') return;
    entity.meta.jointType = jointType;
    entity.rootNode.userData.jointType = jointType;
    if (entity.meta.linkLine) {
      (entity.meta.linkLine.material as LineBasicMaterial).color.copy(createJointColor(jointType));
    }
  }

  refreshJointPositions(): void {
    const start = new Vector3();
    const end = new Vector3();
    const center = new Vector3();

    for (const entity of this.entities.values()) {
      if (entity.meta.kind !== 'joint') continue;
      const parentDatum = this.entities.get(entity.meta.parentDatumId);
      const childDatum = this.entities.get(entity.meta.childDatumId);
      if (!parentDatum || !childDatum) {
        entity.rootNode.visible = false;
        continue;
      }

      parentDatum.rootNode.getWorldPosition(start);
      childDatum.rootNode.getWorldPosition(end);
      center.copy(start).add(end).multiplyScalar(0.5);
      entity.rootNode.position.copy(center);
      entity.rootNode.quaternion.identity();
      entity.rootNode.visible = true;

      if (entity.meta.linkLine) {
        const geometry = entity.meta.linkLine.geometry as BufferGeometry;
        geometry.setFromPoints([
          start.clone().sub(center),
          end.clone().sub(center),
        ]);
        geometry.computeBoundingSphere();
      }
    }
  }

  addLoadVisual(loadId: string, loadState: unknown): void {
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

    if (loadState && typeof loadState === 'object') {
      const candidate = loadState as {
        datumId?: string;
        parentDatumId?: string;
        childDatumId?: string;
      };
      meta.anchorDatumId = candidate.datumId ?? candidate.parentDatumId;
      meta.secondDatumId = candidate.childDatumId;
    }

    if (kindTag === 'spring-damper') {
      const line = createLine(
        [new Vector3(0, 0, 0), new Vector3(0, 0, 0)],
        LOAD_COLOR,
        { entityId: loadId, entityType: 'load' },
      );
      root.add(line);
      meta.line = line;
    } else {
      const shaft = createLine(
        [new Vector3(0, 0, 0), new Vector3(0, 0.5, 0)],
        kindTag === 'point-torque' ? TORQUE_ARROW : FORCE_ARROW,
        { entityId: loadId, entityType: 'load' },
      );
      root.add(shaft);
      meta.line = shaft;
      const arrow = new ArrowHelper(
        new Vector3(0, 1, 0),
        new Vector3(0, 0, 0),
        0.5,
        kindTag === 'point-torque' ? TORQUE_ARROW.getHex() : FORCE_ARROW.getHex(),
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

    const entity: SceneEntityInternal = {
      id: loadId,
      type: 'load',
      rootNode: root,
      meshes: [pickMesh],
      meta,
    };
    this.entities.set(loadId, entity);
    this.refreshLoadVisuals();
    this.applyVisualState(entity);
    this.onEntityListChanged?.();
  }

  removeLoadVisual(loadId: string): boolean {
    const entity = this.entities.get(loadId);
    if (!entity || entity.meta.kind !== 'load') return false;
    entity.rootNode.removeFromParent();
    disposeObject3D(entity.rootNode);
    this.entities.delete(loadId);
    this.forceArrowIds.delete(loadId);
    this.onEntityListChanged?.();
    return true;
  }

  updateLoadVisual(loadId: string, loadState: unknown): void {
    const entity = this.entities.get(loadId);
    if (!entity || entity.meta.kind !== 'load') return;
    entity.meta.loadState = loadState;
    entity.meta.kindTag = getLoadKind(loadState);
    if (loadState && typeof loadState === 'object') {
      const candidate = loadState as {
        datumId?: string;
        parentDatumId?: string;
        childDatumId?: string;
      };
      entity.meta.anchorDatumId = candidate.datumId ?? candidate.parentDatumId;
      entity.meta.secondDatumId = candidate.childDatumId;
    }
    this.refreshLoadVisuals();
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
    setCameraToBox(this._camera, box, directions[preset], this.canvasAspect);
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
    const direction = this._camera.position.clone();
    if (direction.lengthSq() < EPSILON) {
      direction.set(1, 1, 1);
    }
    setCameraToBox(this._camera, getBoxForRoots([entity.rootNode]), direction, this.canvasAspect);
  }

  focusOnEntities(ids: string[]): void {
    const roots = ids
      .map((id) => this.entities.get(id)?.rootNode)
      .filter((value): value is Group => Boolean(value));
    if (roots.length === 0) return;
    const direction = new Vector3();
    this._camera.getWorldDirection(direction);
    direction.negate();
    setCameraToBox(this._camera, getBoxForRoots(roots), direction, this.canvasAspect);
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
  }

  applyHover(hoveredId: string | null): void {
    const prev = this._hoveredId;
    this._hoveredId = hoveredId;

    if (prev === hoveredId) return;

    if (prev) {
      const entity = this.entities.get(prev);
      if (entity) this.applyVisualState(entity);
    }
    if (hoveredId) {
      const entity = this.entities.get(hoveredId);
      if (entity) this.applyVisualState(entity);
    }
  }

  highlightFace(bodyId: string, faceIndex: number): void {
    const entity = this.entities.get(bodyId);
    if (!entity || entity.meta.kind !== 'body') return;
    this.clearFaceHighlight(bodyId);

    const mesh = entity.meshes[0];
    const geometry = mesh.geometry as BufferGeometry;
    const indexAttr = geometry.getIndex();
    const geometryIndex = entity.meta.geometryIndex;
    if (!indexAttr || !geometryIndex) return;

    // Lazily create vertex color buffer on first face highlight
    let colorAttr = geometry.getAttribute('color');
    if (!colorAttr) {
      const vertexCount = geometry.getAttribute('position').count;
      const colors = new Float32Array(vertexCount * 3);
      colors.fill(1);
      geometry.setAttribute('color', new BufferAttribute(colors, 3));
      (mesh.material as MeshStandardMaterial).vertexColors = true;
      (mesh.material as MeshStandardMaterial).needsUpdate = true;
      colorAttr = geometry.getAttribute('color');
    }
    if (faceIndex < 0 || faceIndex >= geometryIndex.faceRanges.length) return;

    const faceRange = geometryIndex.faceRanges[faceIndex];
    for (let tri = faceRange.start; tri < faceRange.start + faceRange.count; tri++) {
      const base = tri * 3;
      for (let corner = 0; corner < 3; corner++) {
        const vertexIndex = indexAttr.getX(base + corner);
        colorAttr.setXYZ(vertexIndex, FACE_HIGHLIGHT_COLOR.r, FACE_HIGHLIGHT_COLOR.g, FACE_HIGHLIGHT_COLOR.b);
      }
    }
    colorAttr.needsUpdate = true;
    entity.meta.highlightedFace = faceIndex;
  }

  clearFaceHighlight(bodyId: string): void {
    const entity = this.entities.get(bodyId);
    if (!entity || entity.meta.kind !== 'body') return;
    const mesh = entity.meshes[0];
    const geometry = mesh.geometry as BufferGeometry;
    const colorAttr = geometry.getAttribute('color');
    if (!colorAttr) return;
    for (let i = 0; i < colorAttr.count; i++) {
      colorAttr.setXYZ(i, 1, 1, 1);
    }
    colorAttr.needsUpdate = true;
    entity.meta.highlightedFace = null;
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
    entity.rootNode.visible = visible;
  }

  attachGizmo(entityId: string): void {
    this._gizmoAttachedId = entityId;
    this.onGizmoStateChanged?.();
  }

  detachGizmo(): void {
    this._gizmoAttachedId = null;
    this.onGizmoStateChanged?.();
  }

  setGizmoMode(mode: GizmoMode): void {
    this._gizmoMode = mode;
    this.onGizmoStateChanged?.();
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
    this.refreshJointPositions();
    this.refreshLoadVisuals();
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

  updateJointForces(jointId: string, data: unknown): void {
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
  }

  clearForceArrows(): void {
    for (const id of Array.from(this.forceArrowIds)) {
      this.removeLoadVisual(id);
    }
    this.forceArrowIds.clear();
  }

  showDatumPreview(config: unknown): void {
    if (!config || typeof config !== 'object') return;
    const preview = config as DatumPreviewConfig;
    this.clearDatumPreview();

    this._datumPreviewBodyId = preview.bodyId;
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
  }

  clearDatumPreview(): void {
    while (this.datumPreviewRoot.children.length > 0) {
      const child = this.datumPreviewRoot.children[0];
      this.datumPreviewRoot.remove(child);
      disposeObject3D(child);
    }
    this.datumPreviewRoot.visible = false;
    this._datumPreviewBodyId = null;
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
      entity.meta.baseOpacity = entity.meta.parentBodyId === bodyId ? 0.2 : 1;
      this.applyVisualState(entity);
    }
  }

  restoreDimmedDatums(): void {
    for (const entity of this.entities.values()) {
      if (entity.meta.kind !== 'datum') continue;
      entity.meta.baseOpacity = 1;
      this.applyVisualState(entity);
    }
  }

  applyJointCreationHighlights(parentDatumId: string | null, childDatumId: string | null): void {
    for (const entity of this.entities.values()) {
      if (entity.meta.kind !== 'datum') continue;
      const isImportant = entity.id === parentDatumId || entity.id === childDatumId;
      entity.meta.baseOpacity = isImportant ? 1 : 0.45;
      this.applyVisualState(entity);
    }
  }

  clearJointCreationHighlights(): void {
    this.restoreDimmedDatums();
  }
  showJointPreviewLine(parentDatumId: string, childDatumId: string): void {
    const id = '__joint_preview__';
    const parent = this.entities.get(parentDatumId);
    const child = this.entities.get(childDatumId);
    if (!parent || !child) return;

    this.clearJointPreviewLine();

    const start = new Vector3();
    const end = new Vector3();
    parent.rootNode.getWorldPosition(start);
    child.rootNode.getWorldPosition(end);

    const root = new Group();
    root.userData = { entityId: id, entityType: 'load' };
    const line = createLine([start, end], ACCENT, { entityId: id, entityType: 'load' });
    root.add(line);
    this._scene.add(root);
    this.entities.set(id, {
      id,
      type: 'load',
      rootNode: root,
      meshes: [],
      meta: {
        kind: 'load',
        loadState: null,
        kindTag: 'unknown',
        line,
        anchorDatumId: parentDatumId,
        secondDatumId: childDatumId,
      },
    });
  }

  clearJointPreviewLine(): void {
    this.removeLoadVisual('__joint_preview__');
  }

  pickEntityAtPoint(): { entityId: string; entityType: string } | null {
    if (!this._hoveredId) return null;
    const entity = this.entities.get(this._hoveredId);
    if (!entity) return null;
    return { entityId: entity.id, entityType: entity.type };
  }

  toggleGrid(): void {
    this._gridVisible = !this._gridVisible;
    this.gridHelper.visible = this._gridVisible;
  }

  get gridVisible(): boolean {
    return this._gridVisible;
  }

  getBodyGeometryIndex(id: string): unknown {
    const entity = this.entities.get(id);
    return entity && entity.meta.kind === 'body' ? entity.meta.geometryIndex : undefined;
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

    if (entity.meta.kind === 'datum') {
      // Datum uses MeshBasicMaterial + LineBasicMaterial (flat, no PBR)
      const opacity = entity.meta.baseOpacity;
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
          this.deps.materialFactory.applySelectionTint(mesh, ACCENT);
        } else {
          this.deps.materialFactory.removeSelectionTint(mesh);
        }
        applyHoverState(mesh, isHovered && !isSelected);
      }
    }

    if (entity.meta.kind === 'body' && entity.meta.edgeLines) {
      const edgeMat = entity.meta.edgeLines.material as LineBasicMaterial;
      if (isSelected) {
        edgeMat.color.set(ACCENT.getHex());
        edgeMat.opacity = 0.8;
      } else if (isHovered) {
        edgeMat.color.set(HOVER_HIGHLIGHT.getHex());
        edgeMat.opacity = 0.5;
      } else {
        edgeMat.color.set(0x202028);
        edgeMat.opacity = 0.3;
      }
      edgeMat.needsUpdate = true;
    }

    if (entity.meta.kind === 'joint' && entity.meta.linkLine) {
      const lineMaterial = entity.meta.linkLine.material as LineBasicMaterial;
      lineMaterial.color.copy(isSelected ? ACCENT : createJointColor(entity.meta.jointType));
    }

    if (entity.meta.kind === 'load' && entity.meta.line) {
      const lineMaterial = entity.meta.line.material as LineBasicMaterial;
      lineMaterial.color.copy(isSelected ? ACCENT : LOAD_COLOR);
    }
  }

  private refreshLoadVisuals(): void {
    const anchor = new Vector3();
    const second = new Vector3();

    for (const entity of this.entities.values()) {
      if (entity.meta.kind !== 'load') continue;
      if (entity.id === '__joint_preview__') continue;

      const anchorDatum = entity.meta.anchorDatumId
        ? this.entities.get(entity.meta.anchorDatumId)
        : undefined;
      if (!anchorDatum) {
        entity.rootNode.visible = false;
        continue;
      }

      anchorDatum.rootNode.getWorldPosition(anchor);
      entity.rootNode.visible = true;
      entity.rootNode.position.copy(anchor);

      if (entity.meta.kindTag === 'spring-damper' && entity.meta.line) {
        const secondDatum = entity.meta.secondDatumId
          ? this.entities.get(entity.meta.secondDatumId)
          : undefined;
        if (!secondDatum) {
          entity.rootNode.visible = false;
          continue;
        }
        secondDatum.rootNode.getWorldPosition(second);
        entity.rootNode.position.set(0, 0, 0);
        (entity.meta.line.geometry as BufferGeometry).setFromPoints([anchor.clone(), second.clone()]);
        continue;
      }

      if (entity.meta.line) {
        const vectorData = entity.meta.loadState && typeof entity.meta.loadState === 'object'
          ? (entity.meta.loadState as { vector?: { x?: number; y?: number; z?: number } }).vector
          : undefined;
        const direction = new Vector3(
          vectorData?.x ?? 0,
          vectorData?.y ?? 1,
          vectorData?.z ?? 0,
        );
        const length = Math.max(direction.length(), 0.25);
        const normalized = direction.lengthSq() > EPSILON
          ? direction.normalize()
          : new Vector3(0, 1, 0);
        (entity.meta.line.geometry as BufferGeometry).setFromPoints([
          new Vector3(0, 0, 0),
          normalized.clone().multiplyScalar(length),
        ]);
        if (entity.meta.arrow) {
          entity.meta.arrow.position.set(0, 0, 0);
          entity.meta.arrow.setDirection(normalized);
          entity.meta.arrow.setLength(length, Math.min(length * 0.25, 0.18), Math.min(length * 0.14, 0.1));
          entity.meta.arrow.setColor(entity.meta.kindTag === 'point-torque' ? TORQUE_ARROW : FORCE_ARROW);
        }
      }
    }
  }
}
