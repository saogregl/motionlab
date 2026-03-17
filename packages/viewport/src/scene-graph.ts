import {
  type AbstractMesh,
  ArcRotateCamera,
  Color3,
  Color4,
  CreateLineSystem,
  Mesh,
  PBRMaterial,
  Quaternion,
  type Scene,
  TransformNode,
  Vector3,
  VertexData,
} from '@babylonjs/core';

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
  private readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private readonly entities = new Map<string, SceneEntity>();
  private readonly defaultMaterial: PBRMaterial;
  private gridNodes: AbstractMesh[] = [];
  private _gridVisible = true;

  constructor(scene: Scene, camera: ArcRotateCamera) {
    this.scene = scene;
    this.camera = camera;
    this.defaultMaterial = this.createDefaultMaterial();
    this.createGrid();
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

    const root = new TransformNode(`body_${id}`, this.scene);
    root.metadata = { entityId: id, entityType: 'body' };

    const mesh = new Mesh(`body_mesh_${id}`, this.scene);
    const vertexData = new VertexData();
    vertexData.positions = meshData.vertices;
    vertexData.indices = meshData.indices;
    vertexData.normals = meshData.normals;
    vertexData.applyToMesh(mesh);

    mesh.material = this.defaultMaterial;
    mesh.parent = root;
    mesh.metadata = { entityId: id, entityType: 'body' };

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
      mesh.dispose();
    }
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

  // -----------------------------------------------------------------------
  // Camera
  // -----------------------------------------------------------------------

  setCameraPreset(preset: CameraPreset): void {
    if (preset === 'fit-all') {
      this.fitAll();
      return;
    }

    const angles = PRESET_ANGLES[preset];
    this.camera.alpha = angles.alpha;
    this.camera.beta = angles.beta;
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

    this.camera.target = center;
    this.camera.radius = radius > 0 ? radius * 2.5 : 10;
  }

  // -----------------------------------------------------------------------
  // Grid
  // -----------------------------------------------------------------------

  get gridVisible(): boolean {
    return this._gridVisible;
  }

  toggleGrid(): void {
    this._gridVisible = !this._gridVisible;
    for (const node of this.gridNodes) {
      node.setEnabled(this._gridVisible);
    }
  }

  private createGrid(): void {
    const gridSize = 50;
    const step = 1;
    const gridColor = new Color4(0.3, 0.3, 0.3, 0.4);

    const lines: Vector3[][] = [];
    const colors: Color4[][] = [];

    // Lines parallel to X axis (varying Z)
    for (let z = -gridSize; z <= gridSize; z += step) {
      if (z === 0) continue; // axis line drawn separately
      lines.push([
        new Vector3(-gridSize, 0, z),
        new Vector3(gridSize, 0, z),
      ]);
      colors.push([gridColor, gridColor]);
    }

    // Lines parallel to Z axis (varying X)
    for (let x = -gridSize; x <= gridSize; x += step) {
      if (x === 0) continue;
      lines.push([
        new Vector3(x, 0, -gridSize),
        new Vector3(x, 0, gridSize),
      ]);
      colors.push([gridColor, gridColor]);
    }

    const gridMesh = CreateLineSystem(
      'grid_lines',
      { lines, colors, useVertexAlpha: true },
      this.scene,
    );
    gridMesh.isPickable = false;

    // X axis (red)
    const xAxisColor = new Color4(0.8, 0.2, 0.2, 1.0);
    const xAxis = CreateLineSystem(
      'axis_x',
      {
        lines: [
          [new Vector3(-gridSize, 0, 0), new Vector3(gridSize, 0, 0)],
        ],
        colors: [[xAxisColor, xAxisColor]],
      },
      this.scene,
    );
    xAxis.isPickable = false;

    // Z axis (blue)
    const zAxisColor = new Color4(0.2, 0.2, 0.8, 1.0);
    const zAxis = CreateLineSystem(
      'axis_z',
      {
        lines: [
          [new Vector3(0, 0, -gridSize), new Vector3(0, 0, gridSize)],
        ],
        colors: [[zAxisColor, zAxisColor]],
      },
      this.scene,
    );
    zAxis.isPickable = false;

    this.gridNodes = [gridMesh, xAxis, zAxis];
  }

  // -----------------------------------------------------------------------
  // Material
  // -----------------------------------------------------------------------

  private createDefaultMaterial(): PBRMaterial {
    const mat = new PBRMaterial('default_body', this.scene);
    mat.albedoColor = new Color3(0.7, 0.72, 0.75);
    mat.metallic = 0.3;
    mat.roughness = 0.6;
    mat.backFaceCulling = true;
    return mat;
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  dispose(): void {
    for (const entity of this.entities.values()) {
      for (const mesh of entity.meshes) {
        mesh.dispose();
      }
      entity.rootNode.dispose();
    }
    this.entities.clear();

    for (const node of this.gridNodes) {
      node.dispose();
    }
    this.gridNodes = [];

    this.defaultMaterial.dispose();
  }
}
