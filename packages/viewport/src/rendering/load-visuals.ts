import {
  type AbstractMesh,
  Color3,
  Mesh,
  MeshBuilder,
  type Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';

import { FORCE_ARROW, SPRING_NEUTRAL, TORQUE_ARROW } from './colors.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JOINT_RENDERING_GROUP = 1;
const MIN_ARROW_LEN = 0.01;
const MAX_ARROW_LEN = 0.5;
const FORCE_SCALE = 0.01;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoadVisualData {
  type: 'point-force' | 'point-torque' | 'spring-damper';
  datumId?: string;
  vector?: { x: number; y: number; z: number };
  referenceFrame?: 'datum-local' | 'world';
  parentDatumId?: string;
  childDatumId?: string;
}

interface LoadVisualEntry {
  rootNode: TransformNode;
  meshes: AbstractMesh[];
  type: LoadVisualData['type'];
  /** For spring-damper: reference to parent datum node. */
  parentDatumNode?: TransformNode;
  /** For spring-damper: reference to child datum node. */
  childDatumNode?: TransformNode;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLoadMaterial(scene: Scene, name: string, color: Color3): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.emissiveColor = color;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  mat.alpha = 0.7;
  return mat;
}

function createArrowGeometry(
  scene: Scene,
  prefix: string,
  mat: StandardMaterial,
): { root: TransformNode; meshes: AbstractMesh[] } {
  const root = new TransformNode(prefix, scene);

  const shaft = Mesh.CreateCylinder(`${prefix}_shaft`, 1.0, 0.006, 0.006, 8, 1, scene, false);
  shaft.material = mat;
  shaft.parent = root;
  shaft.position.y = 0.5;

  const head = Mesh.CreateCylinder(`${prefix}_head`, 0.06, 0, 0.02, 8, 1, scene, false);
  head.material = mat;
  head.parent = root;
  head.position.y = 1.03;

  return { root, meshes: [shaft, head] };
}

function tagLoadMeshes(meshes: AbstractMesh[], loadId: string): void {
  for (const mesh of meshes) {
    mesh.metadata = { entityId: loadId, entityType: 'load' };
    mesh.isPickable = true;
    mesh.renderingGroupId = JOINT_RENDERING_GROUP;
  }
}

// Pre-allocated scratch vectors
const _scratchDir = new Vector3();

// ---------------------------------------------------------------------------
// LoadVisualsManager
// ---------------------------------------------------------------------------

export class LoadVisualsManager {
  private readonly _scene: Scene;
  private readonly _pool = new Map<string, LoadVisualEntry>();
  private readonly _forceMat: StandardMaterial;
  private readonly _torqueMat: StandardMaterial;
  private readonly _springMat: StandardMaterial;

  constructor(scene: Scene) {
    this._scene = scene;
    this._forceMat = makeLoadMaterial(scene, 'load_force_mat', FORCE_ARROW);
    this._torqueMat = makeLoadMaterial(scene, 'load_torque_mat', TORQUE_ARROW);
    this._springMat = makeLoadMaterial(scene, 'load_spring_mat', SPRING_NEUTRAL);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  addLoadVisual(
    loadId: string,
    data: LoadVisualData,
    datumNode: TransformNode,
    secondDatumNode?: TransformNode,
  ): { rootNode: TransformNode; meshes: AbstractMesh[] } {
    // Remove existing visual for this id if present
    if (this._pool.has(loadId)) {
      this.removeLoadVisual(loadId);
    }

    switch (data.type) {
      case 'point-force':
        return this._addForceArrow(loadId, data, datumNode);
      case 'point-torque':
        return this._addTorqueArrow(loadId, data, datumNode);
      case 'spring-damper':
        return this._addSpringDamper(loadId, datumNode, secondDatumNode);
      default:
        return this._addForceArrow(loadId, data, datumNode);
    }
  }

  updateLoadVisual(loadId: string, data: LoadVisualData): void {
    const entry = this._pool.get(loadId);
    if (!entry) return;

    if (data.type === 'spring-damper') {
      // Spring-damper endpoints are updated via refreshSpringEndpoints()
      return;
    }

    this._orientArrow(entry.rootNode, data.vector);
  }

  removeLoadVisual(loadId: string): void {
    const entry = this._pool.get(loadId);
    if (!entry) return;

    for (const mesh of entry.meshes) mesh.dispose();
    entry.rootNode.dispose();
    this._pool.delete(loadId);
  }

  /**
   * Per-frame update for spring-damper line endpoints.
   * Recreates lines between the two datum world positions.
   */
  refreshSpringEndpoints(): void {
    for (const [loadId, entry] of this._pool) {
      if (entry.type !== 'spring-damper') continue;
      if (!entry.parentDatumNode || !entry.childDatumNode) continue;

      const startPos = entry.parentDatumNode.getAbsolutePosition();
      const endPos = entry.childDatumNode.getAbsolutePosition();

      // Dispose old line meshes and recreate
      for (const mesh of entry.meshes) mesh.dispose();

      const line = MeshBuilder.CreateLines(`load_spring_${loadId}`, {
        points: [startPos, endPos],
        updatable: false,
      }, this._scene);

      line.color = new Color3(SPRING_NEUTRAL.r, SPRING_NEUTRAL.g, SPRING_NEUTRAL.b);
      line.alpha = 0.7;
      line.renderingGroupId = JOINT_RENDERING_GROUP;
      line.metadata = { entityId: loadId, entityType: 'load' };
      line.isPickable = true;

      entry.meshes = [line];
    }
  }

  hideAll(): void {
    for (const entry of this._pool.values()) {
      entry.rootNode.setEnabled(false);
    }
  }

  showAll(): void {
    for (const entry of this._pool.values()) {
      entry.rootNode.setEnabled(true);
    }
  }

  clear(): void {
    for (const entry of this._pool.values()) {
      for (const mesh of entry.meshes) mesh.dispose();
      entry.rootNode.dispose();
    }
    this._pool.clear();
  }

  dispose(): void {
    this.clear();
    this._forceMat.dispose();
    this._torqueMat.dispose();
    this._springMat.dispose();
  }

  // -----------------------------------------------------------------------
  // Private — geometry creation
  // -----------------------------------------------------------------------

  private _addForceArrow(
    loadId: string,
    data: LoadVisualData,
    datumNode: TransformNode,
  ): { rootNode: TransformNode; meshes: AbstractMesh[] } {
    const { root, meshes } = createArrowGeometry(
      this._scene,
      `load_force_${loadId}`,
      this._forceMat,
    );

    root.parent = datumNode;
    root.position.setAll(0);
    tagLoadMeshes(meshes, loadId);

    this._orientArrow(root, data.vector);

    const entry: LoadVisualEntry = {
      rootNode: root,
      meshes,
      type: 'point-force',
    };
    this._pool.set(loadId, entry);

    return { rootNode: root, meshes };
  }

  private _addTorqueArrow(
    loadId: string,
    data: LoadVisualData,
    datumNode: TransformNode,
  ): { rootNode: TransformNode; meshes: AbstractMesh[] } {
    const { root, meshes } = createArrowGeometry(
      this._scene,
      `load_torque_${loadId}`,
      this._torqueMat,
    );

    root.parent = datumNode;
    root.position.setAll(0);
    tagLoadMeshes(meshes, loadId);

    this._orientArrow(root, data.vector);

    const entry: LoadVisualEntry = {
      rootNode: root,
      meshes,
      type: 'point-torque',
    };
    this._pool.set(loadId, entry);

    return { rootNode: root, meshes };
  }

  private _addSpringDamper(
    loadId: string,
    parentDatumNode: TransformNode,
    childDatumNode?: TransformNode,
  ): { rootNode: TransformNode; meshes: AbstractMesh[] } {
    const rootNode = new TransformNode(`load_spring_root_${loadId}`, this._scene);
    rootNode.metadata = { entityId: loadId, entityType: 'load' };

    const startPos = parentDatumNode.getAbsolutePosition();
    const endPos = childDatumNode
      ? childDatumNode.getAbsolutePosition()
      : startPos.add(new Vector3(0, 0.1, 0));

    const line = MeshBuilder.CreateLines(`load_spring_${loadId}`, {
      points: [startPos, endPos],
      updatable: false,
    }, this._scene);

    line.color = new Color3(SPRING_NEUTRAL.r, SPRING_NEUTRAL.g, SPRING_NEUTRAL.b);
    line.alpha = 0.7;
    line.renderingGroupId = JOINT_RENDERING_GROUP;
    line.metadata = { entityId: loadId, entityType: 'load' };
    line.isPickable = true;

    // Spring-damper line is NOT parented to a single datum since it spans two
    const meshes: AbstractMesh[] = [line];

    const entry: LoadVisualEntry = {
      rootNode,
      meshes,
      type: 'spring-damper',
      parentDatumNode,
      childDatumNode,
    };
    this._pool.set(loadId, entry);

    return { rootNode, meshes };
  }

  // -----------------------------------------------------------------------
  // Private — arrow orientation
  // -----------------------------------------------------------------------

  private _orientArrow(
    arrowRoot: TransformNode,
    vec?: { x: number; y: number; z: number },
  ): void {
    if (!vec) {
      arrowRoot.setEnabled(false);
      return;
    }

    const mag = Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
    if (mag < 1e-8) {
      arrowRoot.setEnabled(false);
      return;
    }

    arrowRoot.setEnabled(true);
    const len = Math.min(Math.max(mag * FORCE_SCALE, MIN_ARROW_LEN), MAX_ARROW_LEN);
    arrowRoot.scaling.set(1, len, 1);

    // Orient arrow along vector direction
    _scratchDir.set(vec.x / mag, vec.y / mag, vec.z / mag);
    const lookTarget = arrowRoot.getAbsolutePosition().add(_scratchDir);
    arrowRoot.lookAt(lookTarget);
    arrowRoot.rotate(Vector3.Right(), Math.PI / 2);
  }
}
