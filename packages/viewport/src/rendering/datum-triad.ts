import {
  type AbstractMesh,
  Color3,
  Mesh,
  Quaternion,
  type Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';

/** Default arrow dimensions (meters, before view-distance scaling). */
const DEFAULT_SHAFT_RADIUS = 0.008;
const DEFAULT_SHAFT_HEIGHT = 0.12;
const DEFAULT_HEAD_RADIUS = 0.02;
const DEFAULT_HEAD_HEIGHT = 0.04;
const TESSELLATION = 8;

interface DatumTriadResult {
  rootNode: TransformNode;
  meshes: AbstractMesh[];
}

interface AxisDef {
  name: string;
  color: Color3;
  rotation: Quaternion;
}

const AXES: AxisDef[] = [
  {
    name: 'x',
    color: new Color3(1, 0.2, 0.2), // red
    rotation: Quaternion.FromEulerAngles(0, 0, -Math.PI / 2), // default Y→ aim along X
  },
  {
    name: 'y',
    color: new Color3(0.2, 0.85, 0.2), // green
    rotation: Quaternion.Identity(), // default up (Y)
  },
  {
    name: 'z',
    color: new Color3(0.3, 0.5, 1), // blue
    rotation: Quaternion.FromEulerAngles(Math.PI / 2, 0, 0), // Y→ aim along Z
  },
];

/**
 * Creates a coordinate-frame triad (RGB arrows) for a datum entity.
 *
 * All child meshes are tagged with `metadata.entityId` / `metadata.entityType`
 * so the PickingManager resolves them to the datum entity automatically.
 */
export function createDatumTriad(
  scene: Scene,
  id: string,
  shaftHeight = DEFAULT_SHAFT_HEIGHT,
  shaftRadius = DEFAULT_SHAFT_RADIUS,
): DatumTriadResult {
  const root = new TransformNode(`datum_${id}`, scene);
  root.metadata = { entityId: id, entityType: 'datum' };

  const meshes: AbstractMesh[] = [];

  for (const axis of AXES) {
    const mat = new StandardMaterial(`datum_${id}_mat_${axis.name}`, scene);
    mat.emissiveColor = axis.color;
    mat.disableLighting = true;
    mat.backFaceCulling = false;

    // Shaft
    const shaft = Mesh.CreateCylinder(
      `datum_${id}_shaft_${axis.name}`,
      shaftHeight,
      shaftRadius,
      shaftRadius,
      TESSELLATION,
      1,
      scene,
      false,
    );
    shaft.material = mat;
    shaft.metadata = { entityId: id, entityType: 'datum' };
    shaft.isPickable = true;
    shaft.receiveShadows = false;

    // Head (cone)
    const head = Mesh.CreateCylinder(
      `datum_${id}_head_${axis.name}`,
      DEFAULT_HEAD_HEIGHT,
      0,
      DEFAULT_HEAD_RADIUS,
      TESSELLATION,
      1,
      scene,
      false,
    );
    head.material = mat;
    head.metadata = { entityId: id, entityType: 'datum' };
    head.isPickable = true;
    head.receiveShadows = false;

    // Group under an axis transform
    const axisNode = new TransformNode(`datum_${id}_axis_${axis.name}`, scene);
    axisNode.parent = root;
    axisNode.rotationQuaternion = axis.rotation;

    // Position shaft so bottom starts at origin, center at half-height
    shaft.parent = axisNode;
    shaft.position = new Vector3(0, shaftHeight / 2, 0);

    // Position head on top of shaft
    head.parent = axisNode;
    head.position = new Vector3(0, shaftHeight + DEFAULT_HEAD_HEIGHT / 2, 0);

    meshes.push(shaft, head);
  }

  return { rootNode: root, meshes };
}
