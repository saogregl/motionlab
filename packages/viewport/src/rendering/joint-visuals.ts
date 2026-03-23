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
  JOINT_FIXED,
  JOINT_PLANAR,
  JOINT_PRISMATIC,
  JOINT_REVOLUTE,
  JOINT_SPHERICAL,
} from './colors.js';

const TESSELLATION = 16;

/** Rendering group for joint overlays — draws on top of body meshes (group 0). */
const JOINT_RENDERING_GROUP = 1;

export interface JointVisualResult {
  rootNode: TransformNode;
  meshes: AbstractMesh[];
}

function makeEmissiveMaterial(scene: Scene, name: string, color: Color3): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.emissiveColor = color;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  return mat;
}

function tagMeshes(meshes: AbstractMesh[], id: string): void {
  for (const mesh of meshes) {
    mesh.metadata = { entityId: id, entityType: 'joint' };
    mesh.isPickable = true;
    mesh.receiveShadows = false;
    mesh.renderingGroupId = JOINT_RENDERING_GROUP;
  }
}

/**
 * Revolute joint — orange torus at midpoint, oriented along the axis between datums.
 */
export function createRevoluteJointVisual(
  scene: Scene,
  id: string,
  position: Vector3,
  axis: Vector3,
): JointVisualResult {
  const root = new TransformNode(`joint_${id}`, scene);
  root.metadata = { entityId: id, entityType: 'joint', jointType: 'revolute' };
  root.position = position;

  const mat = makeEmissiveMaterial(scene, `joint_${id}_mat`, JOINT_REVOLUTE);

  const torus = Mesh.CreateTorus(`joint_${id}_torus`, 0.06, 0.012, TESSELLATION, scene, false);
  torus.material = mat;
  torus.parent = root;

  // Orient torus so its plane normal aligns with the axis
  const up = Vector3.Up();
  if (Math.abs(Vector3.Dot(axis.normalize(), up)) < 0.999) {
    root.lookAt(root.position.add(axis));
  }

  const meshes = [torus];
  tagMeshes(meshes, id);
  return { rootNode: root, meshes };
}

/**
 * Prismatic joint — cyan cylinder + cone arrow from parent to child.
 */
export function createPrismaticJointVisual(
  scene: Scene,
  id: string,
  fromPos: Vector3,
  toPos: Vector3,
): JointVisualResult {
  const midpoint = Vector3.Center(fromPos, toPos);
  const dist = Vector3.Distance(fromPos, toPos);
  const shaftLen = Math.max(dist * 0.7, 0.02);
  const headLen = Math.max(dist * 0.2, 0.01);

  const root = new TransformNode(`joint_${id}`, scene);
  root.metadata = { entityId: id, entityType: 'joint', jointType: 'prismatic' };
  root.position = midpoint;

  const mat = makeEmissiveMaterial(scene, `joint_${id}_mat`, JOINT_PRISMATIC);

  const shaft = Mesh.CreateCylinder(
    `joint_${id}_shaft`,
    shaftLen,
    0.008,
    0.008,
    TESSELLATION,
    1,
    scene,
    false,
  );
  shaft.material = mat;
  shaft.parent = root;

  const head = Mesh.CreateCylinder(
    `joint_${id}_head`,
    headLen,
    0,
    0.02,
    TESSELLATION,
    1,
    scene,
    false,
  );
  head.material = mat;
  head.parent = root;
  head.position.y = shaftLen / 2 + headLen / 2;

  // Orient toward child
  const dir = toPos.subtract(fromPos).normalize();
  const up = Vector3.Up();
  if (Math.abs(Vector3.Dot(dir, up)) < 0.999) {
    root.lookAt(root.position.add(dir));
    root.rotate(Vector3.Right(), Math.PI / 2);
  }

  const meshes = [shaft, head];
  tagMeshes(meshes, id);
  return { rootNode: root, meshes };
}

/**
 * Fixed joint — gray cylinder bar between parent and child.
 */
export function createFixedJointVisual(
  scene: Scene,
  id: string,
  fromPos: Vector3,
  toPos: Vector3,
): JointVisualResult {
  const midpoint = Vector3.Center(fromPos, toPos);
  const dist = Vector3.Distance(fromPos, toPos);
  const barLen = Math.max(dist, 0.02);

  const root = new TransformNode(`joint_${id}`, scene);
  root.metadata = { entityId: id, entityType: 'joint', jointType: 'fixed' };
  root.position = midpoint;

  const mat = makeEmissiveMaterial(scene, `joint_${id}_mat`, JOINT_FIXED);

  const bar = Mesh.CreateCylinder(
    `joint_${id}_bar`,
    barLen,
    0.01,
    0.01,
    TESSELLATION,
    1,
    scene,
    false,
  );
  bar.material = mat;
  bar.parent = root;

  // Orient toward child
  const dir = toPos.subtract(fromPos).normalize();
  const up = Vector3.Up();
  if (Math.abs(Vector3.Dot(dir, up)) < 0.999) {
    root.lookAt(root.position.add(dir));
    root.rotate(Vector3.Right(), Math.PI / 2);
  }

  const meshes = [bar];
  tagMeshes(meshes, id);
  return { rootNode: root, meshes };
}

/**
 * Spherical joint — purple wireframe sphere (ball joint) at midpoint.
 */
export function createSphericalJointVisual(
  scene: Scene,
  id: string,
  position: Vector3,
  _axis: Vector3,
): JointVisualResult {
  const root = new TransformNode(`joint_${id}`, scene);
  root.metadata = { entityId: id, entityType: 'joint', jointType: 'spherical' };
  root.position = position;

  const mat = makeEmissiveMaterial(scene, `joint_${id}_mat`, JOINT_SPHERICAL);
  mat.wireframe = true;

  const sphere = Mesh.CreateSphere(`joint_${id}_sphere`, 12, 0.06, scene, false);
  sphere.material = mat;
  sphere.parent = root;

  // Add 3 orthogonal ring outlines to reinforce the "ball joint" look
  const ringMat = makeEmissiveMaterial(scene, `joint_${id}_ring_mat`, JOINT_SPHERICAL);

  const ringXZ = Mesh.CreateTorus(`joint_${id}_ring_xz`, 0.06, 0.004, TESSELLATION, scene, false);
  ringXZ.material = ringMat;
  ringXZ.parent = root;

  const ringXY = Mesh.CreateTorus(`joint_${id}_ring_xy`, 0.06, 0.004, TESSELLATION, scene, false);
  ringXY.material = ringMat;
  ringXY.parent = root;
  ringXY.rotation.x = Math.PI / 2;

  const ringYZ = Mesh.CreateTorus(`joint_${id}_ring_yz`, 0.06, 0.004, TESSELLATION, scene, false);
  ringYZ.material = ringMat;
  ringYZ.parent = root;
  ringYZ.rotation.z = Math.PI / 2;

  const meshes = [sphere, ringXZ, ringXY, ringYZ];
  tagMeshes(meshes, id);
  return { rootNode: root, meshes };
}

/**
 * Cylindrical joint — orange torus (rotation) + cyan double-headed arrow (translation).
 * Combines revolute and prismatic visual elements.
 */
export function createCylindricalJointVisual(
  scene: Scene,
  id: string,
  fromPos: Vector3,
  toPos: Vector3,
): JointVisualResult {
  const midpoint = Vector3.Center(fromPos, toPos);
  const dist = Vector3.Distance(fromPos, toPos);

  const root = new TransformNode(`joint_${id}`, scene);
  root.metadata = { entityId: id, entityType: 'joint', jointType: 'cylindrical' };
  root.position = midpoint;

  // Rotation component: orange torus
  const torusMat = makeEmissiveMaterial(scene, `joint_${id}_torus_mat`, JOINT_REVOLUTE);
  const torus = Mesh.CreateTorus(`joint_${id}_torus`, 0.06, 0.01, TESSELLATION, scene, false);
  torus.material = torusMat;
  torus.parent = root;

  // Translation component: cyan double-headed arrow along axis
  const arrowMat = makeEmissiveMaterial(scene, `joint_${id}_arrow_mat`, JOINT_PRISMATIC);
  const shaftLen = Math.max(dist * 0.5, 0.02);
  const headLen = Math.max(dist * 0.15, 0.008);

  const shaft = Mesh.CreateCylinder(
    `joint_${id}_shaft`,
    shaftLen,
    0.006,
    0.006,
    TESSELLATION,
    1,
    scene,
    false,
  );
  shaft.material = arrowMat;
  shaft.parent = root;

  // Top arrowhead
  const headTop = Mesh.CreateCylinder(
    `joint_${id}_head_top`,
    headLen,
    0,
    0.016,
    TESSELLATION,
    1,
    scene,
    false,
  );
  headTop.material = arrowMat;
  headTop.parent = root;
  headTop.position.y = shaftLen / 2 + headLen / 2;

  // Bottom arrowhead (inverted)
  const headBot = Mesh.CreateCylinder(
    `joint_${id}_head_bot`,
    headLen,
    0.016,
    0,
    TESSELLATION,
    1,
    scene,
    false,
  );
  headBot.material = arrowMat;
  headBot.parent = root;
  headBot.position.y = -(shaftLen / 2 + headLen / 2);

  // Orient toward child
  const dir = toPos.subtract(fromPos).normalize();
  const up = Vector3.Up();
  if (Math.abs(Vector3.Dot(dir, up)) < 0.999) {
    root.lookAt(root.position.add(dir));
    root.rotate(Vector3.Right(), Math.PI / 2);
  }

  const meshes = [torus, shaft, headTop, headBot];
  tagMeshes(meshes, id);
  return { rootNode: root, meshes };
}

/**
 * Planar joint — green/teal semi-transparent disc + two in-plane arrows.
 * Shows the constraint surface and 2T+1R allowed motion.
 */
export function createPlanarJointVisual(
  scene: Scene,
  id: string,
  position: Vector3,
  axis: Vector3,
): JointVisualResult {
  const root = new TransformNode(`joint_${id}`, scene);
  root.metadata = { entityId: id, entityType: 'joint', jointType: 'planar' };
  root.position = position;

  // Semi-transparent disc for the constraint plane
  const discMat = makeEmissiveMaterial(scene, `joint_${id}_disc_mat`, JOINT_PLANAR);
  discMat.alpha = 0.4;

  const disc = Mesh.CreateDisc(`joint_${id}_disc`, 0.04, TESSELLATION, scene, false);
  disc.material = discMat;
  disc.parent = root;

  // Two in-plane arrows showing translational freedom
  const arrowMat = makeEmissiveMaterial(scene, `joint_${id}_arrow_mat`, JOINT_PLANAR);
  const arrowLen = 0.03;

  // Arrow 1 (along local X)
  const arrow1 = Mesh.CreateCylinder(
    `joint_${id}_arrow1`,
    arrowLen,
    0.004,
    0.004,
    8,
    1,
    scene,
    false,
  );
  arrow1.material = arrowMat;
  arrow1.parent = root;
  arrow1.rotation.z = Math.PI / 2;

  const head1a = Mesh.CreateCylinder(`joint_${id}_h1a`, 0.01, 0, 0.012, 8, 1, scene, false);
  head1a.material = arrowMat;
  head1a.parent = root;
  head1a.position.x = arrowLen / 2 + 0.005;
  head1a.rotation.z = -Math.PI / 2;

  const head1b = Mesh.CreateCylinder(`joint_${id}_h1b`, 0.01, 0.012, 0, 8, 1, scene, false);
  head1b.material = arrowMat;
  head1b.parent = root;
  head1b.position.x = -(arrowLen / 2 + 0.005);
  head1b.rotation.z = -Math.PI / 2;

  // Arrow 2 (along local Y)
  const arrow2 = Mesh.CreateCylinder(
    `joint_${id}_arrow2`,
    arrowLen,
    0.004,
    0.004,
    8,
    1,
    scene,
    false,
  );
  arrow2.material = arrowMat;
  arrow2.parent = root;

  const head2a = Mesh.CreateCylinder(`joint_${id}_h2a`, 0.01, 0, 0.012, 8, 1, scene, false);
  head2a.material = arrowMat;
  head2a.parent = root;
  head2a.position.y = arrowLen / 2 + 0.005;

  const head2b = Mesh.CreateCylinder(`joint_${id}_h2b`, 0.01, 0.012, 0, 8, 1, scene, false);
  head2b.material = arrowMat;
  head2b.parent = root;
  head2b.position.y = -(arrowLen / 2 + 0.005);

  // Small rotation arc indicator (thin torus around normal)
  const arcMat = makeEmissiveMaterial(scene, `joint_${id}_arc_mat`, JOINT_PLANAR);
  const arc = Mesh.CreateTorus(`joint_${id}_arc`, 0.05, 0.003, TESSELLATION, scene, false);
  arc.material = arcMat;
  arc.parent = root;

  // Orient disc so its normal aligns with the axis
  const up = Vector3.Up();
  if (Math.abs(Vector3.Dot(axis.normalize(), up)) < 0.999) {
    root.lookAt(root.position.add(axis));
  }

  const meshes = [disc, arrow1, head1a, head1b, arrow2, head2a, head2b, arc];
  tagMeshes(meshes, id);
  return { rootNode: root, meshes };
}
