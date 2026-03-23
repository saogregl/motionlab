import {
  type AbstractMesh,
  Color3,
  Mesh,
  type Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';

import {
  AXIS_X,
  AXIS_Y,
  AXIS_Z,
  JOINT_PLANAR,
  JOINT_PRISMATIC,
  JOINT_REVOLUTE,
} from './colors.js';

const JOINT_RENDERING_GROUP = 1;

// ── Types ──

export interface DofIndicator {
  readonly rootNode: TransformNode;
  readonly meshes: AbstractMesh[];
  /** Animate the indicator. Call per frame with elapsed seconds. */
  update(time: number): void;
  dispose(): void;
}

// ── Materials ──

function makeIndicatorMaterial(scene: Scene, name: string, color: Color3): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.emissiveColor = color;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  mat.alpha = 0.6;
  return mat;
}

function tagIndicatorMeshes(meshes: AbstractMesh[]): void {
  for (const mesh of meshes) {
    mesh.isPickable = false;
    mesh.renderingGroupId = JOINT_RENDERING_GROUP;
  }
}

// ── Revolute: arc arrow oscillating around axis ──

function createRevoluteDof(scene: Scene, id: string): DofIndicator {
  const root = new TransformNode(`dof_${id}`, scene);

  const mat = makeIndicatorMaterial(scene, `dof_${id}_mat`, JOINT_REVOLUTE);

  // 120-degree arc via a partial torus approximation: thin torus visible as arc
  const arc = Mesh.CreateTorus(`dof_${id}_arc`, 0.08, 0.003, 32, scene, false);
  arc.material = mat;
  arc.parent = root;

  // Small arrowhead at arc end
  const head = Mesh.CreateCylinder(`dof_${id}_head`, 0.008, 0, 0.01, 8, 1, scene, false);
  head.material = mat;
  head.parent = root;
  head.position.x = 0.04;
  head.position.z = 0;
  head.rotation.z = -Math.PI / 2;

  const meshes = [arc, head];
  tagIndicatorMeshes(meshes);

  return {
    rootNode: root,
    meshes,
    update(time: number) {
      // Gentle oscillation around Y axis
      root.rotation.y = Math.sin(time * 1.5) * 0.4;
    },
    dispose() {
      for (const m of meshes) m.dispose();
      root.dispose();
    },
  };
}

// ── Prismatic: double-headed arrow oscillating along axis ──

function createPrismaticDof(scene: Scene, id: string): DofIndicator {
  const root = new TransformNode(`dof_${id}`, scene);

  const mat = makeIndicatorMaterial(scene, `dof_${id}_mat`, JOINT_PRISMATIC);

  const shaft = Mesh.CreateCylinder(`dof_${id}_shaft`, 0.06, 0.003, 0.003, 8, 1, scene, false);
  shaft.material = mat;
  shaft.parent = root;

  const headTop = Mesh.CreateCylinder(`dof_${id}_ht`, 0.008, 0, 0.01, 8, 1, scene, false);
  headTop.material = mat;
  headTop.parent = root;
  headTop.position.y = 0.038;

  const headBot = Mesh.CreateCylinder(`dof_${id}_hb`, 0.008, 0.01, 0, 8, 1, scene, false);
  headBot.material = mat;
  headBot.parent = root;
  headBot.position.y = -0.038;

  const meshes = [shaft, headTop, headBot];
  tagIndicatorMeshes(meshes);

  return {
    rootNode: root,
    meshes,
    update(time: number) {
      // Oscillate along local Y (joint axis direction)
      root.position.y = Math.sin(time * 2) * 0.01;
    },
    dispose() {
      for (const m of meshes) m.dispose();
      root.dispose();
    },
  };
}

// ── Cylindrical: arc + linear arrow combined ──

function createCylindricalDof(scene: Scene, id: string): DofIndicator {
  const root = new TransformNode(`dof_${id}`, scene);

  const rotMat = makeIndicatorMaterial(scene, `dof_${id}_rot`, JOINT_REVOLUTE);
  const transMat = makeIndicatorMaterial(scene, `dof_${id}_trans`, JOINT_PRISMATIC);

  // Rotation arc
  const arc = Mesh.CreateTorus(`dof_${id}_arc`, 0.08, 0.003, 32, scene, false);
  arc.material = rotMat;
  arc.parent = root;

  // Translation arrow
  const shaft = Mesh.CreateCylinder(`dof_${id}_shaft`, 0.05, 0.003, 0.003, 8, 1, scene, false);
  shaft.material = transMat;
  shaft.parent = root;

  const headTop = Mesh.CreateCylinder(`dof_${id}_ht`, 0.008, 0, 0.01, 8, 1, scene, false);
  headTop.material = transMat;
  headTop.parent = root;
  headTop.position.y = 0.033;

  const headBot = Mesh.CreateCylinder(`dof_${id}_hb`, 0.008, 0.01, 0, 8, 1, scene, false);
  headBot.material = transMat;
  headBot.parent = root;
  headBot.position.y = -0.033;

  const meshes = [arc, shaft, headTop, headBot];
  tagIndicatorMeshes(meshes);

  return {
    rootNode: root,
    meshes,
    update(time: number) {
      // Rotate arc, translate arrows
      arc.rotation.y = Math.sin(time * 1.5) * 0.4;
      const offset = Math.sin(time * 2) * 0.008;
      shaft.position.y = offset;
      headTop.position.y = 0.033 + offset;
      headBot.position.y = -0.033 + offset;
    },
    dispose() {
      for (const m of meshes) m.dispose();
      root.dispose();
    },
  };
}

// ── Spherical: three orthogonal arc rings (RGB) ──

function createSphericalDof(scene: Scene, id: string): DofIndicator {
  const root = new TransformNode(`dof_${id}`, scene);

  const matX = makeIndicatorMaterial(scene, `dof_${id}_x`, AXIS_X);
  const matY = makeIndicatorMaterial(scene, `dof_${id}_y`, AXIS_Y);
  const matZ = makeIndicatorMaterial(scene, `dof_${id}_z`, AXIS_Z);

  const ringX = Mesh.CreateTorus(`dof_${id}_rx`, 0.08, 0.003, 32, scene, false);
  ringX.material = matX;
  ringX.parent = root;
  ringX.rotation.z = Math.PI / 2;

  const ringY = Mesh.CreateTorus(`dof_${id}_ry`, 0.08, 0.003, 32, scene, false);
  ringY.material = matY;
  ringY.parent = root;

  const ringZ = Mesh.CreateTorus(`dof_${id}_rz`, 0.08, 0.003, 32, scene, false);
  ringZ.material = matZ;
  ringZ.parent = root;
  ringZ.rotation.x = Math.PI / 2;

  const meshes = [ringX, ringY, ringZ];
  tagIndicatorMeshes(meshes);

  return {
    rootNode: root,
    meshes,
    update(time: number) {
      // Gentle wobble on all axes
      root.rotation.x = Math.sin(time * 1.2) * 0.15;
      root.rotation.y = Math.sin(time * 1.5 + 1) * 0.15;
      root.rotation.z = Math.sin(time * 1.8 + 2) * 0.15;
    },
    dispose() {
      for (const m of meshes) m.dispose();
      root.dispose();
    },
  };
}

// ── Planar: two in-plane arrows + rotation arc ──

function createPlanarDof(scene: Scene, id: string): DofIndicator {
  const root = new TransformNode(`dof_${id}`, scene);

  const mat = makeIndicatorMaterial(scene, `dof_${id}_mat`, JOINT_PLANAR);

  // X arrow
  const arrowX = Mesh.CreateCylinder(`dof_${id}_ax`, 0.05, 0.003, 0.003, 8, 1, scene, false);
  arrowX.material = mat;
  arrowX.parent = root;
  arrowX.rotation.z = Math.PI / 2;

  const hxA = Mesh.CreateCylinder(`dof_${id}_hxa`, 0.008, 0, 0.01, 8, 1, scene, false);
  hxA.material = mat;
  hxA.parent = root;
  hxA.position.x = 0.033;
  hxA.rotation.z = -Math.PI / 2;

  const hxB = Mesh.CreateCylinder(`dof_${id}_hxb`, 0.008, 0.01, 0, 8, 1, scene, false);
  hxB.material = mat;
  hxB.parent = root;
  hxB.position.x = -0.033;
  hxB.rotation.z = -Math.PI / 2;

  // Y arrow
  const arrowY = Mesh.CreateCylinder(`dof_${id}_ay`, 0.05, 0.003, 0.003, 8, 1, scene, false);
  arrowY.material = mat;
  arrowY.parent = root;

  const hyA = Mesh.CreateCylinder(`dof_${id}_hya`, 0.008, 0, 0.01, 8, 1, scene, false);
  hyA.material = mat;
  hyA.parent = root;
  hyA.position.y = 0.033;

  const hyB = Mesh.CreateCylinder(`dof_${id}_hyb`, 0.008, 0.01, 0, 8, 1, scene, false);
  hyB.material = mat;
  hyB.parent = root;
  hyB.position.y = -0.033;

  // Rotation arc
  const arc = Mesh.CreateTorus(`dof_${id}_arc`, 0.065, 0.003, 32, scene, false);
  arc.material = mat;
  arc.parent = root;

  const meshes = [arrowX, hxA, hxB, arrowY, hyA, hyB, arc];
  tagIndicatorMeshes(meshes);

  return {
    rootNode: root,
    meshes,
    update(time: number) {
      const dx = Math.sin(time * 1.8) * 0.006;
      const dy = Math.sin(time * 1.4 + 1) * 0.006;
      arrowX.position.x = dx;
      hxA.position.x = 0.033 + dx;
      hxB.position.x = -0.033 + dx;
      arrowY.position.y = dy;
      hyA.position.y = 0.033 + dy;
      hyB.position.y = -0.033 + dy;
      arc.rotation.z = Math.sin(time * 1.2) * 0.3;
    },
    dispose() {
      for (const m of meshes) m.dispose();
      root.dispose();
    },
  };
}

// ── Factory ──

/**
 * Create a DOF indicator for a given joint type.
 * Returns `undefined` for fixed joints (0 DOF — no indicator needed).
 */
export function createDofIndicator(
  scene: Scene,
  jointId: string,
  jointType: string,
): DofIndicator | undefined {
  switch (jointType) {
    case 'revolute':
      return createRevoluteDof(scene, jointId);
    case 'prismatic':
      return createPrismaticDof(scene, jointId);
    case 'cylindrical':
      return createCylindricalDof(scene, jointId);
    case 'spherical':
      return createSphericalDof(scene, jointId);
    case 'planar':
      return createPlanarDof(scene, jointId);
    case 'fixed':
    default:
      return undefined;
  }
}
