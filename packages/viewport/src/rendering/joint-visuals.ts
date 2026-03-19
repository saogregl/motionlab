import {
  type AbstractMesh,
  Color3,
  Mesh,
  type Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';

const TESSELLATION = 16;

interface JointVisualResult {
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
  root.metadata = { entityId: id, entityType: 'joint' };
  root.position = position;

  const mat = makeEmissiveMaterial(scene, `joint_${id}_mat`, new Color3(1, 0.55, 0)); // #FF8C00

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
  root.metadata = { entityId: id, entityType: 'joint' };
  root.position = midpoint;

  const mat = makeEmissiveMaterial(scene, `joint_${id}_mat`, new Color3(0, 0.81, 0.82)); // #00CED1

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
  root.metadata = { entityId: id, entityType: 'joint' };
  root.position = midpoint;

  const mat = makeEmissiveMaterial(scene, `joint_${id}_mat`, new Color3(0.5, 0.5, 0.5)); // #808080

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
