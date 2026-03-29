import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';

import { AXIS_X, AXIS_Y, AXIS_Z, JOINT_STEEL_BLUE, JOINT_TYPE_COLORS } from './colors-three.js';

// ── Result interface ──

export interface JointAnchorResult {
  rootNode: Group;
  meshes: Mesh[];
  triadLines: Line[];
  dispose(): void;
}

// ── Per-type geometry presets ──

interface AnchorPreset {
  sphereRadius: number;
  pinLength: number;
  showPin: boolean;
}

const DEFAULT_PRESET: AnchorPreset = {
  sphereRadius: 0.025,
  pinLength: 0.08,
  showPin: true,
};

const ANCHOR_PRESETS: Record<string, AnchorPreset> = {
  revolute: { sphereRadius: 0.025, pinLength: 0.08, showPin: true },
  prismatic: { sphereRadius: 0.02, pinLength: 0.12, showPin: true },
  fixed: { sphereRadius: 0.02, pinLength: 0, showPin: false },
  spherical: { sphereRadius: 0.032, pinLength: 0.04, showPin: true },
  cylindrical: { sphereRadius: 0.022, pinLength: 0.1, showPin: true },
  planar: { sphereRadius: 0.02, pinLength: 0.06, showPin: true },
  universal: { sphereRadius: 0.025, pinLength: 0.06, showPin: true },
};

const SPHERE_SEGMENTS = 12;
const PIN_RADIUS = 0.006;
const PIN_RADIAL_SEGMENTS = 8;

// ── Geometry template cache (keyed by dimensions) ──

const _sphereGeoCache = new Map<string, SphereGeometry>();
const _pinGeoCache = new Map<string, CylinderGeometry>();

function getSphereGeometry(radius: number): SphereGeometry {
  const key = radius.toFixed(4);
  let geo = _sphereGeoCache.get(key);
  if (!geo) {
    geo = new SphereGeometry(radius, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
    _sphereGeoCache.set(key, geo);
  }
  return geo;
}

function getPinGeometry(length: number): CylinderGeometry {
  const key = length.toFixed(4);
  let geo = _pinGeoCache.get(key);
  if (!geo) {
    geo = new CylinderGeometry(PIN_RADIUS, PIN_RADIUS, length, PIN_RADIAL_SEGMENTS);
    _pinGeoCache.set(key, geo);
  }
  return geo;
}

// ── Material ──

function makeAnchorMaterial(color: Color): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    metalness: 0.4,
    roughness: 0.35,
    envMapIntensity: 0.8,
    transparent: true,
    opacity: 0.75,
    depthTest: false,
    depthWrite: false,
  });
}

// ── Triad constants ──

const TRIAD_LENGTH = 0.04;
const TRIAD_Z_LENGTH = 0.055;
const TRIAD_OPACITY = 0.35;

function createMiniTriad(): { group: Group; lines: Line[] } {
  const group = new Group();
  group.name = 'joint_triad';
  group.renderOrder = 6;

  const axes: Array<{ dir: [number, number, number]; color: typeof AXIS_X; length: number }> = [
    { dir: [1, 0, 0], color: AXIS_X, length: TRIAD_LENGTH },
    { dir: [0, 1, 0], color: AXIS_Y, length: TRIAD_LENGTH },
    { dir: [0, 0, 1], color: AXIS_Z, length: TRIAD_Z_LENGTH },
  ];

  const lines: Line[] = [];
  for (const { dir, color, length } of axes) {
    const geo = new BufferGeometry();
    geo.setAttribute(
      'position',
      new Float32BufferAttribute([0, 0, 0, dir[0] * length, dir[1] * length, dir[2] * length], 3),
    );
    const mat = new LineBasicMaterial({
      color,
      transparent: true,
      opacity: TRIAD_OPACITY,
      depthTest: false,
    });
    const line = new Line(geo, mat);
    line.renderOrder = 6;
    group.add(line);
    lines.push(line);
  }

  return { group, lines };
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

export function createJointAnchor(jointType: string, alignmentAxis?: Vector3): JointAnchorResult {
  const preset = ANCHOR_PRESETS[jointType] ?? DEFAULT_PRESET;
  const color = JOINT_TYPE_COLORS[jointType] ?? JOINT_STEEL_BLUE;

  const root = new Group();
  root.name = 'joint_anchor';
  root.renderOrder = 5;

  const meshes: Mesh[] = [];

  const sphereMaterial = makeAnchorMaterial(color);
  const sphere = new Mesh(getSphereGeometry(preset.sphereRadius).clone(), sphereMaterial);
  sphere.userData = { entityType: 'joint' };
  sphere.renderOrder = 5;
  root.add(sphere);
  meshes.push(sphere);

  if (preset.showPin && preset.pinLength > 0) {
    const pinMaterial = makeAnchorMaterial(color);
    const pin = new Mesh(getPinGeometry(preset.pinLength).clone(), pinMaterial);
    pin.userData = { entityType: 'joint' };
    pin.renderOrder = 5;
    root.add(pin);
    meshes.push(pin);
  }

  const { group: triadGroup, lines: triadLines } = createMiniTriad();
  root.add(triadGroup);

  if (alignmentAxis && alignmentAxis.lengthSq() > 1e-6) {
    orientToAxis(root, alignmentAxis);
  }

  return {
    rootNode: root,
    meshes,
    triadLines,
    dispose() {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        (mesh.material as MeshStandardMaterial).dispose();
      }
      for (const line of triadLines) {
        line.geometry.dispose();
        (line.material as LineBasicMaterial).dispose();
      }
    },
  };
}
