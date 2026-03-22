import {
  type AbstractMesh,
  ArcRotateCamera,
  Color4,
  Mesh,
  type Observer,
  Quaternion,
  type Scene,
  TransformNode,
  Vector3,
  VertexBuffer,
  VertexData,
} from '@babylonjs/core';

import { BodyGeometryIndex } from './body-geometry-index.js';
import {
  DatumGizmoManager,
  type GizmoDragEndCallback,
  type GizmoMode,
} from './gizmo-manager.js';
import { createDatumTriad } from './rendering/datum-triad.js';
import type { GridOverlay } from './rendering/grid.js';
import {
  createFixedJointVisual,
  createPrismaticJointVisual,
  createRevoluteJointVisual,
} from './rendering/joint-visuals.js';
import type { LightingRig } from './rendering/lighting.js';
import type { MaterialFactory } from './rendering/materials.js';
import type { SelectionVisuals } from './rendering/selection.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  readonly type: 'body' | 'datum' | 'joint';
  readonly rootNode: TransformNode;
  readonly meshes: AbstractMesh[];
}

export interface MeshDataInput {
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
  readonly normals: Float32Array;
}

export interface PoseInput {
  readonly position: [number, number, number];
  readonly rotation: [number, number, number, number]; // quaternion [x, y, z, w]
}

export interface SceneGraphDeps {
  materialFactory: MaterialFactory;
  lightingRig: LightingRig;
  selectionVisuals: SelectionVisuals;
  grid: GridOverlay;
}

// ---------------------------------------------------------------------------
// Camera preset angles
// ---------------------------------------------------------------------------

const PRESET_ANGLES: Record<Exclude<CameraPreset, 'fit-all'>, { alpha: number; beta: number }> = {
  isometric: { alpha: Math.PI / 4, beta: Math.PI / 3 },
  front: { alpha: -Math.PI / 2, beta: Math.PI / 2 },
  back: { alpha: Math.PI / 2, beta: Math.PI / 2 },
  left: { alpha: Math.PI, beta: Math.PI / 2 },
  right: { alpha: 0, beta: Math.PI / 2 },
  top: { alpha: -Math.PI / 2, beta: 0.01 },
  bottom: { alpha: -Math.PI / 2, beta: Math.PI - 0.01 },
};

// ---------------------------------------------------------------------------
// Datum triad view-distance scaling
// ---------------------------------------------------------------------------

/** Triads render at this fraction of camera distance, keeping screen size constant. */
const DATUM_SCALE_FACTOR = 0.05;

// ---------------------------------------------------------------------------
// SceneGraphManager
// ---------------------------------------------------------------------------

/**
 * Imperative manager that maps mechanism entities to Babylon.js scene objects.
 *
 * This is NOT a React hook — Babylon.js updates bypass React entirely.
 * Entity IDs correspond 1:1 to mechanism ElementIds (UUIDv7 strings).
 */
// ---------------------------------------------------------------------------
// Camera animation
// ---------------------------------------------------------------------------

const DEFAULT_CAMERA_ANIM_DURATION_MS = 400;

interface CameraAnimation {
  startAlpha: number;
  startBeta: number;
  startRadius: number;
  targetAlpha: number;
  targetBeta: number;
  targetRadius: number;
  startTime: number;
  duration: number;
}

/** Ease-out cubic: decelerating to zero velocity. */
function easeOutCubic(t: number): number {
  const t1 = 1 - t;
  return 1 - t1 * t1 * t1;
}

/**
 * Normalize an angle delta so the interpolation takes the shortest path.
 * Returns the adjusted target so that |target - start| <= PI.
 */
function shortestAngleTo(start: number, target: number): number {
  let delta = target - start;
  // Normalize into [-2PI, 2PI] then pick the shortest direction
  delta = delta - Math.PI * 2 * Math.round(delta / (Math.PI * 2));
  return start + delta;
}

// ---------------------------------------------------------------------------
// SceneGraphManager
// ---------------------------------------------------------------------------

export class SceneGraphManager {
  private readonly _scene: Scene;
  private readonly _camera: ArcRotateCamera;
  private readonly deps: SceneGraphDeps;
  private readonly entities = new Map<string, SceneEntity>();
  private readonly bodyGeometryIndices = new Map<string, BodyGeometryIndex>();
  private currentSelectedIds: Set<string> = new Set();
  private readonly _datumScaleObserver: Observer<Scene>;
  private highlightedFaceBodyId: string | null = null;
  private _cameraAnimation: CameraAnimation | null = null;
  private _cameraAnimObserver: Observer<Scene> | null = null;
  private readonly _gizmoManager: DatumGizmoManager;

  /** Called by PickingManager to invalidate the GPU picker list cache. */
  onEntityListChanged?: () => void;

  constructor(scene: Scene, camera: ArcRotateCamera, deps: SceneGraphDeps) {
    this._scene = scene;
    this._camera = camera;
    this.deps = deps;

    // Per-frame view-distance scaling for datum triads and joint visuals
    const observer = scene.onBeforeRenderObservable.add(() => {
      const camPos = this._camera.position;
      for (const entity of this.entities.values()) {
        if (entity.type !== 'datum' && entity.type !== 'joint') continue;
        const worldPos = entity.rootNode.getAbsolutePosition();
        const dist = Vector3.Distance(camPos, worldPos);
        const s = Math.max(dist * DATUM_SCALE_FACTOR, 0.001);
        entity.rootNode.scaling.set(s, s, s);
      }
    });
    if (!observer) throw new Error('Failed to register onBeforeRender observer');
    this._datumScaleObserver = observer;

    this._gizmoManager = new DatumGizmoManager(scene);
  }

  get scene(): Scene {
    return this._scene;
  }

  // -----------------------------------------------------------------------
  // Body management
  // -----------------------------------------------------------------------

  addBody(
    id: string,
    _name: string,
    meshData: MeshDataInput,
    pose: PoseInput,
    partIndex?: Uint32Array,
  ): SceneEntity {
    if (this.entities.has(id)) {
      console.warn(`SceneGraphManager: entity '${id}' already exists, removing first`);
      this.removeBody(id);
    }

    const root = new TransformNode(`body_${id}`, this._scene);
    root.metadata = { entityId: id, entityType: 'body' };

    const mesh = new Mesh(`body_mesh_${id}`, this._scene);
    const vertexData = new VertexData();
    vertexData.positions = meshData.vertices;
    vertexData.indices = meshData.indices;
    vertexData.normals = meshData.normals;

    // Safety net: if the native engine sent all-zero normals (e.g. OCCT
    // triangulation without BRepLib::EnsureNormalConsistency), recompute
    // them from geometry so PBR lighting works.
    if (vertexData.normals && vertexData.normals.every((n) => n === 0)) {
      const computed = new Float32Array(vertexData.positions!.length);
      VertexData.ComputeNormals(vertexData.positions!, vertexData.indices!, computed);
      vertexData.normals = computed;
    }

    vertexData.applyToMesh(mesh);

    mesh.material = this.deps.materialFactory.getDefaultMaterial();
    mesh.parent = root;
    mesh.metadata = { entityId: id, entityType: 'body' };
    mesh.isPickable = true;

    // Always-on subtle edges for geometric readability
    mesh.enableEdgesRendering(0.9999);
    mesh.edgesWidth = 2.0;
    mesh.edgesColor = new Color4(0.15, 0.15, 0.2, 0.3);

    const vertexCount = meshData.vertices.length / 3;
    const colors = new Float32Array(vertexCount * 4);
    colors.fill(1.0);
    mesh.setVerticesData(VertexBuffer.ColorKind, colors, true);
    mesh.useVertexColors = true;

    if (partIndex && partIndex.length > 0) {
      this.bodyGeometryIndices.set(id, new BodyGeometryIndex(partIndex));
    }

    root.position = new Vector3(pose.position[0], pose.position[1], pose.position[2]);
    root.rotationQuaternion = new Quaternion(
      pose.rotation[0],
      pose.rotation[1],
      pose.rotation[2],
      pose.rotation[3],
    );

    const entity: SceneEntity = {
      id,
      type: 'body',
      rootNode: root,
      meshes: [mesh],
    };
    this.entities.set(id, entity);
    this.onEntityListChanged?.();
    return entity;
  }

  removeBody(id: string): boolean {
    const entity = this.entities.get(id);
    if (!entity) {
      console.warn(`SceneGraphManager: cannot remove unknown entity '${id}'`);
      return false;
    }

    for (const mesh of entity.meshes) {
      this.deps.selectionVisuals.applyHover(null);
      mesh.dispose();
    }
    this.bodyGeometryIndices.delete(id);
    if (this.highlightedFaceBodyId === id) {
      this.highlightedFaceBodyId = null;
    }
    this.currentSelectedIds.delete(id);
    entity.rootNode.dispose();
    this.entities.delete(id);
    this.onEntityListChanged?.();
    return true;
  }

  updateBodyTransform(id: string, pose: PoseInput): void {
    const entity = this.entities.get(id);
    if (!entity) {
      console.warn(`SceneGraphManager: cannot update transform for unknown entity '${id}'`);
      return;
    }

    entity.rootNode.position.set(pose.position[0], pose.position[1], pose.position[2]);

    if (!entity.rootNode.rotationQuaternion) {
      entity.rootNode.rotationQuaternion = new Quaternion();
    }
    entity.rootNode.rotationQuaternion.set(
      pose.rotation[0],
      pose.rotation[1],
      pose.rotation[2],
      pose.rotation[3],
    );
  }

  // -----------------------------------------------------------------------
  // Datum management
  // -----------------------------------------------------------------------

  addDatum(id: string, parentBodyId: string, localPose: PoseInput, name?: string): SceneEntity | undefined {
    if (this.entities.has(id)) {
      console.warn(`SceneGraphManager: datum '${id}' already exists, removing first`);
      this.removeDatum(id);
    }

    const parentEntity = this.entities.get(parentBodyId);
    if (!parentEntity) {
      console.warn(`SceneGraphManager: parent body '${parentBodyId}' not found for datum '${id}'`);
      return undefined;
    }

    const { rootNode, meshes } = createDatumTriad(this._scene, id, name);

    // Parent to body so datum inherits body world transform
    rootNode.parent = parentEntity.rootNode;

    rootNode.position = new Vector3(
      localPose.position[0],
      localPose.position[1],
      localPose.position[2],
    );
    rootNode.rotationQuaternion = new Quaternion(
      localPose.rotation[0],
      localPose.rotation[1],
      localPose.rotation[2],
      localPose.rotation[3],
    );

    const entity: SceneEntity = {
      id,
      type: 'datum',
      rootNode,
      meshes,
    };
    this.entities.set(id, entity);
    this.onEntityListChanged?.();
    return entity;
  }

  removeDatum(id: string): boolean {
    const entity = this.entities.get(id);
    if (!entity || entity.type !== 'datum') {
      console.warn(`SceneGraphManager: cannot remove unknown datum '${id}'`);
      return false;
    }

    for (const mesh of entity.meshes) {
      mesh.dispose();
    }
    this.currentSelectedIds.delete(id);
    entity.rootNode.dispose();
    this.entities.delete(id);
    this.onEntityListChanged?.();
    return true;
  }

  // -----------------------------------------------------------------------
  // Joint management
  // -----------------------------------------------------------------------

  addJoint(
    id: string,
    parentDatumId: string,
    childDatumId: string,
    jointType: string,
  ): SceneEntity | undefined {
    if (this.entities.has(id)) {
      console.warn(`SceneGraphManager: joint '${id}' already exists, removing first`);
      this.removeJoint(id);
    }

    const parentEntity = this.entities.get(parentDatumId);
    const childEntity = this.entities.get(childDatumId);
    if (!parentEntity || !childEntity) {
      console.warn(
        `SceneGraphManager: datum(s) not found for joint '${id}' (parent='${parentDatumId}', child='${childDatumId}')`,
      );
      return undefined;
    }

    const parentPos = parentEntity.rootNode.getAbsolutePosition();
    const childPos = childEntity.rootNode.getAbsolutePosition();
    const midpoint = Vector3.Center(parentPos, childPos);
    const axis = childPos.subtract(parentPos);

    let result: { rootNode: TransformNode; meshes: AbstractMesh[] };
    switch (jointType) {
      case 'revolute':
        result = createRevoluteJointVisual(this._scene, id, midpoint, axis);
        break;
      case 'prismatic':
        result = createPrismaticJointVisual(this._scene, id, parentPos, childPos);
        break;
      case 'fixed':
        result = createFixedJointVisual(this._scene, id, parentPos, childPos);
        break;
      default:
        // For new joint types (spherical, cylindrical, planar), use revolute visual as fallback
        result = createRevoluteJointVisual(this._scene, id, midpoint, axis);
        break;
    }

    // Store datum references on rootNode metadata for future updates
    result.rootNode.metadata = {
      ...result.rootNode.metadata,
      parentDatumId,
      childDatumId,
    };

    const entity: SceneEntity = {
      id,
      type: 'joint',
      rootNode: result.rootNode,
      meshes: result.meshes,
    };
    this.entities.set(id, entity);
    this.onEntityListChanged?.();
    return entity;
  }

  updateJoint(id: string, jointType: string): void {
    const entity = this.entities.get(id);
    if (!entity || entity.type !== 'joint') {
      console.warn(`SceneGraphManager: cannot update unknown joint '${id}'`);
      return;
    }

    const meta = entity.rootNode.metadata as {
      parentDatumId?: string;
      childDatumId?: string;
    };
    const parentDatumId = meta?.parentDatumId;
    const childDatumId = meta?.childDatumId;
    if (!parentDatumId || !childDatumId) return;

    // Dispose old meshes and rootNode
    for (const mesh of entity.meshes) mesh.dispose();
    entity.rootNode.dispose();
    this.entities.delete(id);

    // Recreate
    this.addJoint(id, parentDatumId, childDatumId, jointType);
  }

  removeJoint(id: string): boolean {
    const entity = this.entities.get(id);
    if (!entity || entity.type !== 'joint') {
      console.warn(`SceneGraphManager: cannot remove unknown joint '${id}'`);
      return false;
    }

    for (const mesh of entity.meshes) mesh.dispose();
    this.currentSelectedIds.delete(id);
    entity.rootNode.dispose();
    this.entities.delete(id);
    this.onEntityListChanged?.();
    return true;
  }

  // -----------------------------------------------------------------------
  // Lookups
  // -----------------------------------------------------------------------

  getEntity(id: string): SceneEntity | undefined {
    return this.entities.get(id);
  }

  getAllEntities(): SceneEntity[] {
    return Array.from(this.entities.values());
  }

  getAllPickableMeshes(): AbstractMesh[] {
    return Array.from(this.entities.values()).flatMap((e) => e.meshes);
  }

  getBodyGeometryIndex(id: string): BodyGeometryIndex | undefined {
    return this.bodyGeometryIndices.get(id);
  }

  // -----------------------------------------------------------------------
  // Camera
  // -----------------------------------------------------------------------

  get camera(): ArcRotateCamera {
    return this._camera;
  }

  setCameraPreset(preset: CameraPreset, animated = true): void {
    if (preset === 'fit-all') {
      this.fitAll();
      return;
    }

    const angles = PRESET_ANGLES[preset];
    if (animated) {
      this.animateCameraTo(angles.alpha, angles.beta);
    } else {
      this._camera.alpha = angles.alpha;
      this._camera.beta = angles.beta;
    }
  }

  /**
   * Smoothly interpolate the camera to target angles using ease-out cubic.
   * Handles alpha wrap-around to always take the shortest angular path.
   */
  animateCameraTo(
    alpha: number,
    beta: number,
    radius?: number,
    duration = DEFAULT_CAMERA_ANIM_DURATION_MS,
  ): void {
    // Cancel any in-progress animation
    this.cancelCameraAnimation();

    const adjustedAlpha = shortestAngleTo(this._camera.alpha, alpha);
    const adjustedBeta = shortestAngleTo(this._camera.beta, beta);
    const targetRadius = radius ?? this._camera.radius;

    this._cameraAnimation = {
      startAlpha: this._camera.alpha,
      startBeta: this._camera.beta,
      startRadius: this._camera.radius,
      targetAlpha: adjustedAlpha,
      targetBeta: adjustedBeta,
      targetRadius,
      startTime: performance.now(),
      duration,
    };

    // Disable camera input during animation to prevent fighting
    this._camera.detachControl();

    this._cameraAnimObserver = this._scene.onBeforeRenderObservable.add(() => {
      const anim = this._cameraAnimation;
      if (!anim) return;

      const elapsed = performance.now() - anim.startTime;
      const t = Math.min(elapsed / anim.duration, 1);
      const e = easeOutCubic(t);

      this._camera.alpha = anim.startAlpha + (anim.targetAlpha - anim.startAlpha) * e;
      this._camera.beta = anim.startBeta + (anim.targetBeta - anim.startBeta) * e;
      this._camera.radius = anim.startRadius + (anim.targetRadius - anim.startRadius) * e;

      if (t >= 1) {
        this.cancelCameraAnimation();
      }
    });
  }

  private cancelCameraAnimation(): void {
    if (this._cameraAnimObserver) {
      this._scene.onBeforeRenderObservable.remove(this._cameraAnimObserver);
      this._cameraAnimObserver = null;
    }
    if (this._cameraAnimation) {
      // Snap to final values
      this._camera.alpha = this._cameraAnimation.targetAlpha;
      this._camera.beta = this._cameraAnimation.targetBeta;
      this._camera.radius = this._cameraAnimation.targetRadius;
      this._cameraAnimation = null;
      // Re-enable camera input
      const canvas = this._scene.getEngine().getRenderingCanvas();
      if (canvas) this._camera.attachControl(canvas, true);
    }
  }

  fitAll(): void {
    if (this.entities.size === 0) return;

    const allMeshes = Array.from(this.entities.values()).flatMap((e) => e.meshes);

    let min = new Vector3(Infinity, Infinity, Infinity);
    let max = new Vector3(-Infinity, -Infinity, -Infinity);

    for (const mesh of allMeshes) {
      mesh.computeWorldMatrix(true);
      const bounds = mesh.getBoundingInfo().boundingBox;
      min = Vector3.Minimize(min, bounds.minimumWorld);
      max = Vector3.Maximize(max, bounds.maximumWorld);
    }

    const center = Vector3.Center(min, max);
    const radius = Vector3.Distance(min, max) / 2;

    this._camera.target = center;
    // In ortho mode, radius controls the ortho half-size via the per-frame
    // observer in Viewport.tsx. Setting radius adjusts zoom level.
    this._camera.radius = radius > 0 ? radius * 2.5 : 10;
  }

  // -----------------------------------------------------------------------
  // Grid
  // -----------------------------------------------------------------------

  get gridVisible(): boolean {
    return this.deps.grid.visible;
  }

  toggleGrid(): void {
    this.deps.grid.setVisible(!this.deps.grid.visible);
  }

  // -----------------------------------------------------------------------
  // Gizmo
  // -----------------------------------------------------------------------

  /**
   * Attach the transform gizmo to a datum entity.
   * Automatically shows position or rotation gizmo based on current mode.
   */
  attachGizmo(entityId: string): void {
    const entity = this.entities.get(entityId);
    if (!entity || entity.type !== 'datum') {
      this._gizmoManager.detach();
      return;
    }
    this._gizmoManager.attachTo(entityId, entity.rootNode);
  }

  detachGizmo(): void {
    this._gizmoManager.detach();
  }

  setGizmoMode(mode: GizmoMode): void {
    this._gizmoManager.setMode(mode);
  }

  getGizmoMode(): GizmoMode {
    return this._gizmoManager.getMode();
  }

  setGizmoOnDragEnd(callback: GizmoDragEndCallback | undefined): void {
    this._gizmoManager.setOnDragEnd(callback);
  }

  // -----------------------------------------------------------------------
  // Selection & Hover
  // -----------------------------------------------------------------------

  applySelection(selectedIds: Set<string>): void {
    this.currentSelectedIds = new Set(selectedIds);

    const meshes: AbstractMesh[] = [];
    for (const id of selectedIds) {
      const entity = this.entities.get(id);
      if (!entity) continue;
      meshes.push(...entity.meshes);
    }

    this.deps.selectionVisuals.applySelection(meshes);
  }

  applyHover(hoveredId: string | null): void {
    if (hoveredId == null || this.currentSelectedIds.has(hoveredId)) {
      this.deps.selectionVisuals.applyHover(null);
      return;
    }

    const entity = this.entities.get(hoveredId);
    if (!entity) return;

    // Apply hover to the first mesh of the entity
    this.deps.selectionVisuals.applyHover(entity.meshes[0] ?? null);
  }

  highlightFace(bodyId: string, faceIndex: number): void {
    const entity = this.entities.get(bodyId);
    if (!entity || entity.type !== 'body') return;

    const mesh = entity.meshes[0];
    if (!(mesh instanceof Mesh)) return;

    const geometryIndex = this.bodyGeometryIndices.get(bodyId);
    const faceRange = geometryIndex?.faceRanges[faceIndex];
    if (!geometryIndex || !faceRange) return;

    if (this.highlightedFaceBodyId && this.highlightedFaceBodyId !== bodyId) {
      this.clearFaceHighlight(this.highlightedFaceBodyId);
    }

    const colors = mesh.getVerticesData(VertexBuffer.ColorKind);
    const indices = mesh.getIndices();
    if (!colors || !indices) return;

    colors.fill(1.0);
    for (let triangle = faceRange.start; triangle < faceRange.start + faceRange.count; triangle++) {
      const i0 = indices[triangle * 3];
      const i1 = indices[triangle * 3 + 1];
      const i2 = indices[triangle * 3 + 2];
      if (i0 == null || i1 == null || i2 == null) continue;
      for (const vertexIndex of [i0, i1, i2]) {
        colors[vertexIndex * 4] = 0.4;
        colors[vertexIndex * 4 + 1] = 0.7;
        colors[vertexIndex * 4 + 2] = 1.0;
        colors[vertexIndex * 4 + 3] = 1.0;
      }
    }

    mesh.updateVerticesData(VertexBuffer.ColorKind, colors);
    this.highlightedFaceBodyId = bodyId;
  }

  clearFaceHighlight(bodyId: string): void {
    const entity = this.entities.get(bodyId);
    if (!entity || entity.type !== 'body') return;

    const mesh = entity.meshes[0];
    if (!(mesh instanceof Mesh)) return;

    const colors = mesh.getVerticesData(VertexBuffer.ColorKind);
    if (!colors) return;
    colors.fill(1.0);
    mesh.updateVerticesData(VertexBuffer.ColorKind, colors);

    if (this.highlightedFaceBodyId === bodyId) {
      this.highlightedFaceBodyId = null;
    }
  }

  clearAllFaceHighlights(): void {
    if (this.highlightedFaceBodyId) {
      this.clearFaceHighlight(this.highlightedFaceBodyId);
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  clear(): void {
    this.deps.selectionVisuals.clearAll();
    this.clearAllFaceHighlights();

    for (const entity of this.entities.values()) {
      for (const mesh of entity.meshes) {
        mesh.dispose();
      }
      entity.rootNode.dispose();
    }
    this.entities.clear();
    this.bodyGeometryIndices.clear();
    this.currentSelectedIds = new Set();
    this.highlightedFaceBodyId = null;
  }

  dispose(): void {
    this.cancelCameraAnimation();
    this._gizmoManager.dispose();
    this._scene.onBeforeRenderObservable.remove(this._datumScaleObserver);
    this.deps.selectionVisuals.clearAll();
    this.clearAllFaceHighlights();

    for (const entity of this.entities.values()) {
      for (const mesh of entity.meshes) {
        mesh.dispose();
      }
      entity.rootNode.dispose();
    }
    this.entities.clear();
  }
}
