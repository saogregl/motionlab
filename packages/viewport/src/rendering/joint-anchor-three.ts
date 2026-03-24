import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';

import { JOINT_STEEL_BLUE } from './colors-three.js';

// ── Result interface ──

export interface JointAnchorResult {
  rootNode: Group;
  meshes: Mesh[];
  dispose(): void;
}

// ── Geometry constants ──

const SPHERE_RADIUS = 0.018;
const SPHERE_SEGMENTS = 12;
const PIN_RADIUS = 0.004;
const PIN_LENGTH = 0.06;
const PIN_RADIAL_SEGMENTS = 8;

// ── Shared geometry templates (module-level, reused via .clone()) ──

let _sphereGeometry: SphereGeometry | null = null;
let _pinGeometry: CylinderGeometry | null = null;

function getSphereGeometry(): SphereGeometry {
  if (!_sphereGeometry) {
    _sphereGeometry = new SphereGeometry(SPHERE_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
  }
  return _sphereGeometry;
}

function getPinGeometry(): CylinderGeometry {
  if (!_pinGeometry) {
    _pinGeometry = new CylinderGeometry(
      PIN_RADIUS,
      PIN_RADIUS,
      PIN_LENGTH,
      PIN_RADIAL_SEGMENTS,
    );
  }
  return _pinGeometry;
}

// ── Material ──

function makeAnchorMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: JOINT_STEEL_BLUE,
    metalness: 0.4,
    roughness: 0.35,
    envMapIntensity: 0.8,
    transparent: true,
    opacity: 0.55,
    depthTest: false,
    depthWrite: false,
  });
}

// ── Alignment helper ──

const _yAxis = new Vector3(0, 1, 0);
const _tempQ = new Quaternion();

function orientToAxis(group: Group, axis: Vector3): void {
  const dir = axis.clone().normalize();
  _tempQ.setFromUnitVectors(_yAxis, dir);
  group.quaternion.copy(_tempQ);
}

// ── Factory ──

export function createJointAnchor(alignmentAxis?: Vector3): JointAnchorResult {
  const root = new Group();
  root.name = 'joint_anchor';
  root.renderOrder = 5;

  const material = makeAnchorMaterial();

  // Sphere node
  const sphere = new Mesh(getSphereGeometry().clone(), material);
  sphere.userData = { entityType: 'joint' };
  sphere.renderOrder = 5;
  root.add(sphere);

  // Axis pin (CylinderGeometry is along Y by default)
  const pinMaterial = makeAnchorMaterial();
  const pin = new Mesh(getPinGeometry().clone(), pinMaterial);
  pin.userData = { entityType: 'joint' };
  pin.renderOrder = 5;
  root.add(pin);

  // Orient pin along alignment axis if provided
  if (alignmentAxis && alignmentAxis.lengthSq() > 1e-6) {
    orientToAxis(root, alignmentAxis);
  }

  const meshes = [sphere, pin];

  return {
    rootNode: root,
    meshes,
    dispose() {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        (mesh.material as MeshStandardMaterial).dispose();
      }
    },
  };
}
