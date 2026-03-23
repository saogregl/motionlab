import {
  type AbstractMesh,
  Color3,
  Mesh,
  type Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';

import { FORCE_ARROW, TORQUE_ARROW } from './colors.js';

const JOINT_RENDERING_GROUP = 1;
const MIN_ARROW_LEN = 0.01;
const MAX_ARROW_LEN = 0.5;
const FORCE_SCALE = 0.01;
const TORQUE_SCALE = 0.05;

// ── Types ──

export interface ForceArrowData {
  force: { x: number; y: number; z: number };
  torque: { x: number; y: number; z: number };
}

interface ArrowPool {
  rootNode: TransformNode;
  forceArrow: TransformNode;
  forceMeshes: AbstractMesh[];
  torqueArrow: TransformNode;
  torqueMeshes: AbstractMesh[];
}

// ── Helpers ──

function makeArrowMaterial(scene: Scene, name: string, color: Color3): StandardMaterial {
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

  const meshes = [shaft, head];
  for (const m of meshes) {
    m.isPickable = false;
    m.renderingGroupId = JOINT_RENDERING_GROUP;
  }

  return { root, meshes };
}

// ── Pre-allocated scratch vectors ──

const _scratchDir = new Vector3();
const _scratchUp = Vector3.Up();

// ── Force Arrow Manager ──

export class ForceArrowManager {
  private readonly _scene: Scene;
  private readonly _pool = new Map<string, ArrowPool>();
  private readonly _forceMat: StandardMaterial;
  private readonly _torqueMat: StandardMaterial;

  constructor(scene: Scene) {
    this._scene = scene;
    this._forceMat = makeArrowMaterial(scene, 'force_arrow_mat', FORCE_ARROW);
    this._torqueMat = makeArrowMaterial(scene, 'torque_arrow_mat', TORQUE_ARROW);
  }

  /**
   * Update force/torque arrows for a joint. Creates pooled arrows on first call.
   */
  update(jointId: string, jointRootNode: TransformNode, data: ForceArrowData): void {
    let pool = this._pool.get(jointId);
    if (!pool) {
      pool = this._createPool(jointId);
      this._pool.set(jointId, pool);
    }

    // Parent to joint so it scales with view distance
    pool.rootNode.parent = jointRootNode;
    pool.rootNode.position.setAll(0);

    // Force arrow
    this._updateArrow(pool.forceArrow, pool.forceMeshes, data.force, FORCE_SCALE);

    // Torque arrow
    this._updateArrow(pool.torqueArrow, pool.torqueMeshes, data.torque, TORQUE_SCALE);
  }

  private _updateArrow(
    arrowRoot: TransformNode,
    meshes: AbstractMesh[],
    vec: { x: number; y: number; z: number },
    scale: number,
  ): void {
    const mag = Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
    if (mag < 1e-8) {
      arrowRoot.setEnabled(false);
      return;
    }

    arrowRoot.setEnabled(true);
    const len = Math.min(Math.max(mag * scale, MIN_ARROW_LEN), MAX_ARROW_LEN);
    arrowRoot.scaling.set(1, len, 1);

    // Orient arrow along force/torque direction
    _scratchDir.set(vec.x / mag, vec.y / mag, vec.z / mag);
    const lookTarget = arrowRoot.getAbsolutePosition().add(_scratchDir);
    arrowRoot.lookAt(lookTarget);
    arrowRoot.rotate(Vector3.Right(), Math.PI / 2);
  }

  private _createPool(jointId: string): ArrowPool {
    const root = new TransformNode(`force_pool_${jointId}`, this._scene);

    const force = createArrowGeometry(this._scene, `force_${jointId}`, this._forceMat);
    force.root.parent = root;

    const torque = createArrowGeometry(this._scene, `torque_${jointId}`, this._torqueMat);
    torque.root.parent = root;

    return {
      rootNode: root,
      forceArrow: force.root,
      forceMeshes: force.meshes,
      torqueArrow: torque.root,
      torqueMeshes: torque.meshes,
    };
  }

  /** Hide all force arrows (e.g., on sim pause/reset). */
  hideAll(): void {
    for (const pool of this._pool.values()) {
      pool.rootNode.setEnabled(false);
    }
  }

  /** Show all force arrows (e.g., when sim resumes). */
  showAll(): void {
    for (const pool of this._pool.values()) {
      pool.rootNode.setEnabled(true);
    }
  }

  /** Dispose all pooled arrows. Call on sim reset or scene teardown. */
  clear(): void {
    for (const pool of this._pool.values()) {
      for (const m of pool.forceMeshes) m.dispose();
      for (const m of pool.torqueMeshes) m.dispose();
      pool.forceArrow.dispose();
      pool.torqueArrow.dispose();
      pool.rootNode.dispose();
    }
    this._pool.clear();
  }

  dispose(): void {
    this.clear();
    this._forceMat.dispose();
    this._torqueMat.dispose();
  }
}
