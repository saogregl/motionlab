import {
  type AbstractMesh,
  ArcRotateCamera,
  Color3,
  Color4,
  Matrix,
  Mesh,
  MeshBuilder,
  type Observer,
  Quaternion,
  type Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexBuffer,
  VertexData,
  Viewport as BabylonViewport,
} from '@babylonjs/core';

import { BodyGeometryIndex } from './body-geometry-index.js';
import {
  DatumGizmoManager,
  type GizmoDragEndCallback,
  type GizmoMode,
} from './gizmo-manager.js';
import { AXIS_X, AXIS_Y, AXIS_Z } from './rendering/colors.js';
import { createDatumTriad } from './rendering/datum-triad.js';
import { DatumPreviewManager, type DatumPreviewConfig } from './rendering/datum-preview.js';
import { createDofIndicator, type DofIndicator } from './rendering/dof-indicators.js';
import { type ForceArrowData, ForceArrowManager } from './rendering/force-arrows.js';
import { type LoadVisualData, LoadVisualsManager } from './rendering/load-visuals.js';
import type { GridOverlay } from './rendering/grid.js';
import {
  createCylindricalJointVisual,
  createFixedJointVisual,
  createPlanarJointVisual,
  createPrismaticJointVisual,
  createRevoluteJointVisual,
  createSphericalJointVisual,
} from './rendering/joint-visuals.js';
import type { LightingRig } from './rendering/lighting.js';
import type { MaterialFactory } from './rendering/materials.js';
import type { EntityColorType, SelectionMeshEntry, SelectionVisuals } from './rendering/selection.js';

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
  readonly type: 'body' | 'datum' | 'joint' | 'load';
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
  startTarget?: Vector3;
  targetTarget?: Vector3;
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
  private readonly _forceArrows: ForceArrowManager;
  private readonly _loadVisuals: LoadVisualsManager;
  private readonly _datumPreview: DatumPreviewManager;
  private readonly _dofIndicators = new Map<string, DofIndicator>();
  private _animTime = 0;
  private _dimmedDatumIds = new Set<string>();
  private _jointCreationHighlightIds = new Set<string>();
  private _previewLine: AbstractMesh | null = null;

  /** Called by PickingManager to invalidate the GPU picker list cache. */
  onEntityListChanged?: () => void;

  constructor(scene: Scene, camera: ArcRotateCamera, deps: SceneGraphDeps) {
    this._scene = scene;
    this._camera = camera;
    this.deps = deps;

    // Per-frame view-distance scaling for datum triads and joint visuals, plus DOF animation
    const observer = scene.onBeforeRenderObservable.add(() => {
      const dt = scene.getEngine().getDeltaTime() / 1000;
      this._animTime += dt;

      const camPos = this._camera.position;
      for (const entity of this.entities.values()) {
        if (entity.type !== 'datum' && entity.type !== 'joint' && entity.type !== 'load') continue;
        const worldPos = entity.rootNode.getAbsolutePosition();
        const dist = Vector3.Distance(camPos, worldPos);
        const s = Math.max(dist * DATUM_SCALE_FACTOR, 0.001);
        entity.rootNode.scaling.set(s, s, s);
      }

      // Animate active DOF indicators
      for (const indicator of this._dofIndicators.values()) {
        indicator.update(this._animTime);
      }

      // Update spring-damper line endpoints each frame
      this._loadVisuals.refreshSpringEndpoints();
    });
    if (!observer) throw new Error('Failed to register onBeforeRender observer');
    this._datumScaleObserver = observer;

    this._gizmoManager = new DatumGizmoManager(scene);
    this._forceArrows = new ForceArrowManager(scene);
    this._loadVisuals = new LoadVisualsManager(scene);
    this._datumPreview = new DatumPreviewManager(
      scene,
      camera,
      (id) => this.entities.get(id)?.meshes[0] ?? null,
    );
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

    // Store parentBodyId in metadata for lookup by dimming / highlight helpers
    rootNode.metadata = { ...rootNode.metadata, parentBodyId };

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
      case 'spherical':
        result = createSphericalJointVisual(this._scene, id, midpoint, axis);
        break;
      case 'cylindrical':
        result = createCylindricalJointVisual(this._scene, id, parentPos, childPos);
        break;
      case 'planar':
        result = createPlanarJointVisual(this._scene, id, midpoint, axis);
        break;
      default:
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

  /**
   * Reposition all joint visuals to match current datum world positions.
   * Called after datum gizmo moves and during simulation frame updates.
   */
  refreshJointPositions(): void {
    for (const entity of this.entities.values()) {
      if (entity.type !== 'joint') continue;

      const meta = entity.rootNode.metadata as {
        parentDatumId?: string;
        childDatumId?: string;
        jointType?: string;
      };
      if (!meta?.parentDatumId || !meta?.childDatumId) continue;

      const parentEntity = this.entities.get(meta.parentDatumId);
      const childEntity = this.entities.get(meta.childDatumId);
      if (!parentEntity || !childEntity) continue;

      const parentPos = parentEntity.rootNode.getAbsolutePosition();
      const childPos = childEntity.rootNode.getAbsolutePosition();
      const midpoint = Vector3.Center(parentPos, childPos);
      const axis = childPos.subtract(parentPos);

      // Update position — midpoint for all joint types
      entity.rootNode.position.copyFrom(midpoint);

      // Re-orient if axis is non-degenerate
      if (axis.lengthSquared() > 1e-12) {
        const dir = axis.normalize();
        const up = Vector3.Up();
        if (Math.abs(Vector3.Dot(dir, up)) < 0.999) {
          entity.rootNode.lookAt(entity.rootNode.position.add(dir));
        }
      }
    }
  }

  removeJoint(id: string): boolean {
    const entity = this.entities.get(id);
    if (!entity || entity.type !== 'joint') {
      console.warn(`SceneGraphManager: cannot remove unknown joint '${id}'`);
      return false;
    }

    // Clean up DOF indicator if present
    const indicator = this._dofIndicators.get(id);
    if (indicator) {
      indicator.dispose();
      this._dofIndicators.delete(id);
    }

    for (const mesh of entity.meshes) mesh.dispose();
    this.currentSelectedIds.delete(id);
    entity.rootNode.dispose();
    this.entities.delete(id);
    this.onEntityListChanged?.();
    return true;
  }

  // -----------------------------------------------------------------------
  // Projection
  // -----------------------------------------------------------------------

  /**
   * Project a world-space position to screen coordinates.
   * Returns { x, y, z } where x/y are pixel coords and z is depth (>1 = behind camera).
   */
  projectToScreen(worldPos: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const engine = this._scene.getEngine();
    const w = engine.getRenderWidth();
    const h = engine.getRenderHeight();
    const transformMatrix = this._scene.getTransformMatrix();
    const viewport = new BabylonViewport(0, 0, w, h);
    const projected = Vector3.Project(
      new Vector3(worldPos.x, worldPos.y, worldPos.z),
      Matrix.Identity(),
      transformMatrix,
      viewport,
    );
    return { x: projected.x, y: projected.y, z: projected.z };
  }

  // -----------------------------------------------------------------------
  // Load visual management
  // -----------------------------------------------------------------------

  addLoadVisual(loadId: string, loadState: LoadVisualData): void {
    const datumEntity = loadState.datumId
      ? this.entities.get(loadState.datumId)
      : loadState.parentDatumId
        ? this.entities.get(loadState.parentDatumId)
        : undefined;
    const datumNode = datumEntity?.rootNode;
    if (!datumNode && loadState.type !== 'spring-damper') return;

    const secondDatumEntity = loadState.childDatumId
      ? this.entities.get(loadState.childDatumId)
      : undefined;
    const secondDatumNode = secondDatumEntity?.rootNode;

    const result = this._loadVisuals.addLoadVisual(
      loadId,
      loadState,
      datumNode!,
      secondDatumNode,
    );

    // Register in entities map for picking/selection
    const entity: SceneEntity = {
      id: loadId,
      type: 'load',
      rootNode: result.rootNode,
      meshes: result.meshes,
    };
    this.entities.set(loadId, entity);
    this.onEntityListChanged?.();
  }

  updateLoadVisual(loadId: string, loadState: LoadVisualData): void {
    this._loadVisuals.updateLoadVisual(loadId, loadState);
  }

  removeLoadVisual(loadId: string): boolean {
    this._loadVisuals.removeLoadVisual(loadId);
    const entity = this.entities.get(loadId);
    if (entity) {
      this.entities.delete(loadId);
      this.onEntityListChanged?.();
      return true;
    }
    return false;
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

      if (anim.startTarget && anim.targetTarget) {
        this._camera.target = Vector3.Lerp(anim.startTarget, anim.targetTarget, e);
      }

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
      if (this._cameraAnimation.targetTarget) {
        this._camera.target = this._cameraAnimation.targetTarget.clone();
      }
      this._cameraAnimation = null;
      // Re-enable camera input
      const canvas = this._scene.getEngine().getRenderingCanvas();
      if (canvas) this._camera.attachControl(canvas, true);
    }
  }

  /**
   * Smoothly animate the camera target and radius while preserving the
   * current alpha/beta angles. Reuses the same animation infrastructure
   * as animateCameraTo.
   */
  private animateCameraToTarget(
    target: Vector3,
    radius: number,
    duration = DEFAULT_CAMERA_ANIM_DURATION_MS,
  ): void {
    this.cancelCameraAnimation();

    this._cameraAnimation = {
      startAlpha: this._camera.alpha,
      startBeta: this._camera.beta,
      startRadius: this._camera.radius,
      targetAlpha: this._camera.alpha,
      targetBeta: this._camera.beta,
      targetRadius: radius,
      startTarget: this._camera.target.clone(),
      targetTarget: target,
      startTime: performance.now(),
      duration,
    };

    this._camera.detachControl();

    this._cameraAnimObserver = this._scene.onBeforeRenderObservable.add(() => {
      const anim = this._cameraAnimation;
      if (!anim) return;

      const elapsed = performance.now() - anim.startTime;
      const t = Math.min(elapsed / anim.duration, 1);
      const e = easeOutCubic(t);

      this._camera.radius = anim.startRadius + (anim.targetRadius - anim.startRadius) * e;

      if (anim.startTarget && anim.targetTarget) {
        this._camera.target = Vector3.Lerp(anim.startTarget, anim.targetTarget, e);
      }

      if (t >= 1) {
        this.cancelCameraAnimation();
      }
    });
  }

  /**
   * Animate the camera to frame multiple entities.
   * Computes combined bounding box and smoothly transitions camera.
   */
  focusOnEntities(ids: string[]): void {
    if (ids.length === 0) return;
    if (ids.length === 1) {
      this.focusOnEntity(ids[0]);
      return;
    }

    let min = new Vector3(Infinity, Infinity, Infinity);
    let max = new Vector3(-Infinity, -Infinity, -Infinity);
    let found = false;

    for (const id of ids) {
      const entity = this.entities.get(id);
      if (!entity) continue;

      if (entity.type === 'body') {
        for (const mesh of entity.meshes) {
          mesh.computeWorldMatrix(true);
          const bounds = mesh.getBoundingInfo().boundingBox;
          min = Vector3.Minimize(min, bounds.minimumWorld);
          max = Vector3.Maximize(max, bounds.maximumWorld);
          found = true;
        }
      } else {
        const pos = entity.rootNode.getAbsolutePosition();
        min = Vector3.Minimize(min, pos);
        max = Vector3.Maximize(max, pos);
        found = true;
      }
    }

    if (!found) return;

    const center = Vector3.Center(min, max);
    const radius = Vector3.Distance(min, max) / 2;
    this.animateCameraToTarget(center, radius > 0 ? radius * 2.5 : 10);
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

    const entries: SelectionMeshEntry[] = [];
    for (const id of selectedIds) {
      const entity = this.entities.get(id);
      if (!entity) continue;
      const entityType = entity.type as EntityColorType;
      for (const mesh of entity.meshes) {
        entries.push({ mesh, entityType });
      }
    }

    this.deps.selectionVisuals.applySelection(entries);

    // Update DOF indicators: show for selected joints, hide others
    // Remove indicators for joints no longer selected
    for (const [id, indicator] of this._dofIndicators) {
      if (!selectedIds.has(id)) {
        indicator.dispose();
        this._dofIndicators.delete(id);
      }
    }
    // Create indicators for newly selected joints
    for (const id of selectedIds) {
      if (this._dofIndicators.has(id)) continue;
      const entity = this.entities.get(id);
      if (!entity || entity.type !== 'joint') continue;

      const meta = entity.rootNode.metadata as { jointType?: string } | undefined;
      const jointType = meta?.jointType;
      if (!jointType) continue;

      const indicator = createDofIndicator(this._scene, id, jointType);
      if (indicator) {
        indicator.rootNode.parent = entity.rootNode;
        this._dofIndicators.set(id, indicator);
      }
    }
  }

  applyHover(hoveredId: string | null): void {
    if (hoveredId == null || this.currentSelectedIds.has(hoveredId)) {
      this.deps.selectionVisuals.applyHover(null);
      return;
    }

    const entity = this.entities.get(hoveredId);
    if (!entity) return;

    const firstMesh = entity.meshes[0];
    if (!firstMesh) return;
    this.deps.selectionVisuals.applyHover({
      mesh: firstMesh,
      entityType: entity.type as EntityColorType,
    });
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
  // Visibility
  // -----------------------------------------------------------------------

  setEntityVisibility(id: string, visible: boolean): void {
    const entity = this.entities.get(id);
    if (!entity) return;
    entity.rootNode.setEnabled(visible);
    for (const mesh of entity.meshes) {
      mesh.isPickable = visible;
    }
  }

  // -----------------------------------------------------------------------
  // Focus on entity
  // -----------------------------------------------------------------------

  /**
   * Animate the camera to frame a specific entity.
   * For bodies: frames the bounding box. For datums/joints: moves target to position.
   */
  focusOnEntity(id: string): void {
    const entity = this.entities.get(id);
    if (!entity) return;

    if (entity.type === 'body') {
      // Compute bounding box of body meshes
      let min = new Vector3(Infinity, Infinity, Infinity);
      let max = new Vector3(-Infinity, -Infinity, -Infinity);
      for (const mesh of entity.meshes) {
        mesh.computeWorldMatrix(true);
        const bounds = mesh.getBoundingInfo().boundingBox;
        min = Vector3.Minimize(min, bounds.minimumWorld);
        max = Vector3.Maximize(max, bounds.maximumWorld);
      }
      const center = Vector3.Center(min, max);
      const radius = Vector3.Distance(min, max) / 2;
      this.animateCameraToTarget(center, radius > 0 ? radius * 2.5 : 10);
    } else {
      // Datums and joints: fly to their world position
      const pos = entity.rootNode.getAbsolutePosition();
      this.animateCameraToTarget(pos.clone(), Math.min(this._camera.radius, 0.5));
    }
  }

  // -----------------------------------------------------------------------
  // Force / Torque arrows
  // -----------------------------------------------------------------------

  /**
   * Update force/torque arrows for a joint during simulation.
   * Arrows are pooled per joint and only disposed on clearForceArrows().
   */
  updateJointForces(jointId: string, data: ForceArrowData): void {
    const entity = this.entities.get(jointId);
    if (!entity || entity.type !== 'joint') return;
    this._forceArrows.update(jointId, entity.rootNode, data);
  }

  /** Dispose all force/torque arrow visuals (call on sim reset). */
  clearForceArrows(): void {
    this._forceArrows.clear();
  }

  // -----------------------------------------------------------------------
  // Datum preview
  // -----------------------------------------------------------------------

  showDatumPreview(config: DatumPreviewConfig): void {
    this._datumPreview.show(config);
  }

  clearDatumPreview(): void {
    this._datumPreview.clear();
  }

  getDatumPreviewBodyId(): string | null {
    return this._datumPreview.getCurrentBodyId();
  }

  getBodyMeshNormals(bodyId: string): Float32Array | null {
    const entity = this.entities.get(bodyId);
    if (!entity || entity.type !== 'body') return null;
    const mesh = entity.meshes[0];
    if (!(mesh instanceof Mesh)) return null;
    return mesh.getVerticesData(VertexBuffer.NormalKind) as Float32Array | null;
  }

  getBodyMeshIndices(bodyId: string): Uint32Array | null {
    const entity = this.entities.get(bodyId);
    if (!entity || entity.type !== 'body') return null;
    const mesh = entity.meshes[0];
    if (!(mesh instanceof Mesh)) return null;
    const indices = mesh.getIndices();
    return indices ? new Uint32Array(indices) : null;
  }

  // -----------------------------------------------------------------------
  // Datum dimming
  // -----------------------------------------------------------------------

  /**
   * Dim all datum visuals belonging to a specific body.
   * Lerps emissive colours toward gray and disables picking.
   */
  dimDatumsByBody(bodyId: string): void {
    const gray = new Color3(0.5, 0.5, 0.5);
    for (const entity of this.entities.values()) {
      if (entity.type !== 'datum') continue;
      const meta = entity.rootNode.metadata as { parentBodyId?: string } | undefined;
      if (meta?.parentBodyId !== bodyId) continue;

      for (const mesh of entity.meshes) {
        if (mesh.material && mesh.material instanceof StandardMaterial) {
          mesh.material.emissiveColor = Color3.Lerp(
            mesh.material.emissiveColor,
            gray,
            0.7,
          );
        }
        mesh.isPickable = false;
      }
      this._dimmedDatumIds.add(entity.id);
    }
  }

  /**
   * Restore original axis colours and pickability for all previously dimmed datums.
   */
  restoreDimmedDatums(): void {
    for (const id of this._dimmedDatumIds) {
      const entity = this.entities.get(id);
      if (!entity) continue;

      for (const mesh of entity.meshes) {
        if (mesh.material && mesh.material instanceof StandardMaterial) {
          // Mesh names follow the pattern datum_<id>_shaft_<axis> / datum_<id>_head_<axis>
          const name = mesh.name.toLowerCase();
          if (name.includes('_x')) {
            mesh.material.emissiveColor = AXIS_X.clone();
          } else if (name.includes('_y')) {
            mesh.material.emissiveColor = AXIS_Y.clone();
          } else if (name.includes('_z')) {
            mesh.material.emissiveColor = AXIS_Z.clone();
          }
        }
        mesh.isPickable = true;
      }
    }
    this._dimmedDatumIds.clear();
  }

  // -----------------------------------------------------------------------
  // Joint creation highlights
  // -----------------------------------------------------------------------

  /**
   * Apply selection-style highlights to parent and/or child datums during
   * joint creation. Parent datum uses the 'datum' entity colour (green) and
   * child datum uses the 'joint' entity colour (orange).
   */
  applyJointCreationHighlights(
    parentDatumId: string | null,
    childDatumId: string | null,
  ): void {
    this.clearJointCreationHighlights();

    const entries: SelectionMeshEntry[] = [];

    if (parentDatumId) {
      const entity = this.entities.get(parentDatumId);
      if (entity) {
        for (const mesh of entity.meshes) {
          entries.push({ mesh, entityType: 'datum' });
        }
        this._jointCreationHighlightIds.add(parentDatumId);
      }
    }

    if (childDatumId) {
      const entity = this.entities.get(childDatumId);
      if (entity) {
        for (const mesh of entity.meshes) {
          entries.push({ mesh, entityType: 'joint' });
        }
        this._jointCreationHighlightIds.add(childDatumId);
      }
    }

    if (entries.length > 0) {
      this.deps.selectionVisuals.applySelection(entries);
    }
  }

  /**
   * Remove joint-creation highlights and restore the normal selection state.
   */
  clearJointCreationHighlights(): void {
    this.deps.selectionVisuals.clearAll();
    this.applySelection(this.currentSelectedIds);
    this._jointCreationHighlightIds.clear();
  }

  // -----------------------------------------------------------------------
  // Joint preview line
  // -----------------------------------------------------------------------

  /**
   * Draw a dashed white line between two datums to preview where a joint
   * will be created.
   */
  showJointPreviewLine(parentDatumId: string, childDatumId: string): void {
    const parentEntity = this.entities.get(parentDatumId);
    const childEntity = this.entities.get(childDatumId);
    if (!parentEntity || !childEntity) return;

    const parentPos = parentEntity.rootNode.getAbsolutePosition();
    const childPos = childEntity.rootNode.getAbsolutePosition();

    // Dispose any existing preview line first
    this.clearJointPreviewLine();

    const line = MeshBuilder.CreateDashedLines('joint-preview-line', {
      points: [parentPos, childPos],
      dashSize: 0.01,
      gapSize: 0.005,
      dashNb: 40,
    }, this._scene);

    line.color = new Color3(1, 1, 1);
    line.alpha = 0.5;
    line.renderingGroupId = 1;
    line.isPickable = false;

    this._previewLine = line;
  }

  /**
   * Dispose the joint preview dashed line, if any.
   */
  clearJointPreviewLine(): void {
    if (this._previewLine) {
      this._previewLine.dispose();
      this._previewLine = null;
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  clear(): void {
    this.deps.selectionVisuals.clearAll();
    this.clearAllFaceHighlights();
    this._datumPreview.clear();
    this.clearJointPreviewLine();
    this._dimmedDatumIds.clear();
    this._jointCreationHighlightIds.clear();

    for (const indicator of this._dofIndicators.values()) indicator.dispose();
    this._dofIndicators.clear();
    this._forceArrows.clear();
    this._loadVisuals.clear();

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

  /**
   * Synchronous CPU pick at the current pointer position.
   * Used by context menus to determine what entity was right-clicked.
   */
  pickEntityAtPoint(): { entityId: string; entityType: string } | null {
    const pickResult = this._scene.pick(this._scene.pointerX, this._scene.pointerY);
    if (!pickResult?.hit || !pickResult.pickedMesh) return null;

    let current: AbstractMesh | null = pickResult.pickedMesh;
    while (current) {
      if (current.metadata?.entityId) {
        return {
          entityId: current.metadata.entityId as string,
          entityType: (current.metadata.entityType as string) ?? 'body',
        };
      }
      current = current.parent as AbstractMesh | null;
    }
    return null;
  }

  dispose(): void {
    this.cancelCameraAnimation();
    this._gizmoManager.dispose();
    this._datumPreview.dispose();
    this.clearJointPreviewLine();
    this._dimmedDatumIds.clear();
    this._jointCreationHighlightIds.clear();
    this._scene.onBeforeRenderObservable.remove(this._datumScaleObserver);
    this.deps.selectionVisuals.clearAll();
    this.clearAllFaceHighlights();

    for (const indicator of this._dofIndicators.values()) indicator.dispose();
    this._dofIndicators.clear();
    this._forceArrows.dispose();
    this._loadVisuals.dispose();

    for (const entity of this.entities.values()) {
      for (const mesh of entity.meshes) {
        mesh.dispose();
      }
      entity.rootNode.dispose();
    }
    this.entities.clear();
  }
}
