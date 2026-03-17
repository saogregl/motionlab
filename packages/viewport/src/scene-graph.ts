import {
  type AbstractMesh,
  ArcRotateCamera,
  Mesh,
  Quaternion,
  type Scene,
  TransformNode,
  Vector3,
  VertexData,
} from '@babylonjs/core';

import type { GridOverlay } from './rendering/grid.js';
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

const PRESET_ANGLES: Record<
  Exclude<CameraPreset, 'fit-all'>,
  { alpha: number; beta: number }
> = {
  isometric: { alpha: Math.PI / 4, beta: Math.PI / 3 },
  front: { alpha: -Math.PI / 2, beta: Math.PI / 2 },
  back: { alpha: Math.PI / 2, beta: Math.PI / 2 },
  left: { alpha: Math.PI, beta: Math.PI / 2 },
  right: { alpha: 0, beta: Math.PI / 2 },
  top: { alpha: -Math.PI / 2, beta: 0.01 },
  bottom: { alpha: -Math.PI / 2, beta: Math.PI - 0.01 },
};

// ---------------------------------------------------------------------------
// SceneGraphManager
// ---------------------------------------------------------------------------

/**
 * Imperative manager that maps mechanism entities to Babylon.js scene objects.
 *
 * This is NOT a React hook — Babylon.js updates bypass React entirely.
 * Entity IDs correspond 1:1 to mechanism ElementIds (UUIDv7 strings).
 */
export class SceneGraphManager {
  private readonly _scene: Scene;
  private readonly _camera: ArcRotateCamera;
  private readonly deps: SceneGraphDeps;
  private readonly entities = new Map<string, SceneEntity>();
  private currentSelectedIds: Set<string> = new Set();

  constructor(scene: Scene, camera: ArcRotateCamera, deps: SceneGraphDeps) {
    this._scene = scene;
    this._camera = camera;
    this.deps = deps;
  }

  get scene(): Scene {
    return this._scene;
  }

  // -----------------------------------------------------------------------
  // Body management
  // -----------------------------------------------------------------------

  addBody(
    id: string,
    name: string,
    meshData: MeshDataInput,
    pose: PoseInput,
  ): SceneEntity {
    if (this.entities.has(id)) {
      console.warn(
        `SceneGraphManager: entity '${id}' already exists, removing first`,
      );
      this.removeBody(id);
    }

    const root = new TransformNode(`body_${id}`, this._scene);
    root.metadata = { entityId: id, entityType: 'body' };

    const mesh = new Mesh(`body_mesh_${id}`, this._scene);
    const vertexData = new VertexData();
    vertexData.positions = meshData.vertices;
    vertexData.indices = meshData.indices;
    vertexData.normals = meshData.normals;
    vertexData.applyToMesh(mesh);

    mesh.material = this.deps.materialFactory.getDefaultMaterial();
    mesh.parent = root;
    mesh.metadata = { entityId: id, entityType: 'body' };
    mesh.receiveShadows = true;

    // Register as shadow caster
    this.deps.lightingRig.addShadowCaster(mesh);

    root.position = new Vector3(
      pose.position[0],
      pose.position[1],
      pose.position[2],
    );
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
    return entity;
  }

  removeBody(id: string): boolean {
    const entity = this.entities.get(id);
    if (!entity) {
      console.warn(
        `SceneGraphManager: cannot remove unknown entity '${id}'`,
      );
      return false;
    }

    for (const mesh of entity.meshes) {
      this.deps.lightingRig.removeShadowCaster(mesh);
      this.deps.selectionVisuals.applyHover(null);
      mesh.dispose();
    }
    this.currentSelectedIds.delete(id);
    entity.rootNode.dispose();
    this.entities.delete(id);
    return true;
  }

  updateBodyTransform(id: string, pose: PoseInput): void {
    const entity = this.entities.get(id);
    if (!entity) {
      console.warn(
        `SceneGraphManager: cannot update transform for unknown entity '${id}'`,
      );
      return;
    }

    entity.rootNode.position.set(
      pose.position[0],
      pose.position[1],
      pose.position[2],
    );

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

  // -----------------------------------------------------------------------
  // Camera
  // -----------------------------------------------------------------------

  setCameraPreset(preset: CameraPreset): void {
    if (preset === 'fit-all') {
      this.fitAll();
      return;
    }

    const angles = PRESET_ANGLES[preset];
    this._camera.alpha = angles.alpha;
    this._camera.beta = angles.beta;
  }

  fitAll(): void {
    if (this.entities.size === 0) return;

    const allMeshes = Array.from(this.entities.values()).flatMap(
      (e) => e.meshes,
    );

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

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  dispose(): void {
    this.deps.selectionVisuals.clearAll();

    for (const entity of this.entities.values()) {
      for (const mesh of entity.meshes) {
        this.deps.lightingRig.removeShadowCaster(mesh);
        mesh.dispose();
      }
      entity.rootNode.dispose();
    }
    this.entities.clear();
  }
}
