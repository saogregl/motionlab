import {
  BufferGeometry,
  ConeGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  TorusGeometry,
  Vector3,
} from 'three';

import type { Color } from 'three';

import { JOINT_STEEL_BLUE } from './colors-three.js';

// ── DOF table ──

export interface DofSpec {
  rotational: number;
  translational: number;
  total: number;
  label: string;
}

export const DOF_TABLE: Record<string, DofSpec> = {
  revolute: { rotational: 1, translational: 0, total: 1, label: '1R' },
  prismatic: { rotational: 0, translational: 1, total: 1, label: '1T' },
  fixed: { rotational: 0, translational: 0, total: 0, label: '0' },
  spherical: { rotational: 3, translational: 0, total: 3, label: '3R' },
  cylindrical: { rotational: 1, translational: 1, total: 2, label: '1R+1T' },
  planar: { rotational: 1, translational: 2, total: 3, label: '1R+2T' },
  universal: { rotational: 2, translational: 0, total: 2, label: '2R' },
  distance: { rotational: 0, translational: 0, total: 5, label: '5' },
  'point-line': { rotational: 0, translational: 0, total: 4, label: '4' },
  'point-plane': { rotational: 0, translational: 0, total: 3, label: '3' },
};

// ── Indicator result ──

export interface DofIndicatorResult {
  rootNode: Group;
  meshes: Mesh[];
  /** No-op — indicators are static. Kept for interface compatibility. */
  update(): void;
  dispose(): void;
}

// ── Geometry constants ──

const ARC_RADIUS = 0.12;
const ARC_TUBE = 0.005;
const ARC_RADIAL_SEGMENTS = 8;
const ARC_TUBULAR_SEGMENTS = 32;
const ARROW_LENGTH = 0.20;
const ARROWHEAD_RADIUS = 0.012;
const ARROWHEAD_HEIGHT = 0.025;
const ARROWHEAD_SEGMENTS = 8;

// ── Shared geometry templates (module-level, reused via .clone()) ──

let _arcGeometry: TorusGeometry | null = null;
let _arrowheadGeometry: ConeGeometry | null = null;

function getArcGeometry(): TorusGeometry {
  if (!_arcGeometry) {
    _arcGeometry = new TorusGeometry(
      ARC_RADIUS,
      ARC_TUBE,
      ARC_RADIAL_SEGMENTS,
      ARC_TUBULAR_SEGMENTS,
      Math.PI * 1.5, // 270 degrees
    );
  }
  return _arcGeometry;
}

function getArrowheadGeometry(): ConeGeometry {
  if (!_arrowheadGeometry) {
    _arrowheadGeometry = new ConeGeometry(ARROWHEAD_RADIUS, ARROWHEAD_HEIGHT, ARROWHEAD_SEGMENTS);
  }
  return _arrowheadGeometry;
}

// ── Material helpers ──

function makeIndicatorMaterial(color: Color, opacity = 0.7): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
  });
}

function makeLineMaterial(color: Color, opacity = 0.7): LineBasicMaterial {
  return new LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
  });
}

// ── Geometry builders ──

function createArcArrow(color: Color, arcAngle = Math.PI * 1.5): Group {
  const group = new Group();

  const arcGeo =
    arcAngle === Math.PI * 1.5
      ? getArcGeometry().clone()
      : new TorusGeometry(ARC_RADIUS, ARC_TUBE, ARC_RADIAL_SEGMENTS, ARC_TUBULAR_SEGMENTS, arcAngle);
  const arc = new Mesh(arcGeo, makeIndicatorMaterial(color));
  arc.userData = { entityType: 'indicator' };
  group.add(arc);

  // Arrowhead at end of arc
  const arrowhead = new Mesh(getArrowheadGeometry().clone(), makeIndicatorMaterial(color));
  arrowhead.userData = { entityType: 'indicator' };
  const endAngle = arcAngle;
  arrowhead.position.set(
    Math.cos(endAngle) * ARC_RADIUS,
    Math.sin(endAngle) * ARC_RADIUS,
    0,
  );
  arrowhead.rotation.z = endAngle;
  group.add(arrowhead);

  return group;
}

function createDoubleArrow(length: number, color: Color): Group {
  const group = new Group();
  const halfLen = length / 2;

  // Top arrowhead (pointing up along Y)
  const topArrow = new Mesh(getArrowheadGeometry().clone(), makeIndicatorMaterial(color));
  topArrow.position.set(0, halfLen, 0);
  topArrow.userData = { entityType: 'indicator' };
  group.add(topArrow);

  // Bottom arrowhead (pointing down)
  const botArrow = new Mesh(getArrowheadGeometry().clone(), makeIndicatorMaterial(color));
  botArrow.position.set(0, -halfLen, 0);
  botArrow.rotation.z = Math.PI;
  botArrow.userData = { entityType: 'indicator' };
  group.add(botArrow);

  // Shaft line connecting the two arrowheads
  const shaftGeo = new BufferGeometry();
  shaftGeo.setAttribute(
    'position',
    new Float32BufferAttribute(
      [0, -halfLen + ARROWHEAD_HEIGHT * 0.5, 0, 0, halfLen - ARROWHEAD_HEIGHT * 0.5, 0],
      3,
    ),
  );
  const shaft = new Line(shaftGeo, makeLineMaterial(color));
  shaft.userData = { entityType: 'indicator' };
  group.add(shaft);

  return group;
}

// ── Alignment helper ──

const _zAxis = new Vector3(0, 0, 1);
const _yAxis = new Vector3(0, 1, 0);
const _tempQ = new Quaternion();

function orientGroupToAxis(group: Group, alignmentAxis: Vector3, referenceAxis: Vector3): void {
  const axis = alignmentAxis.clone().normalize();
  _tempQ.setFromUnitVectors(referenceAxis, axis);
  group.quaternion.copy(_tempQ);
}

// ── Per-type indicator factories ──

function createRevoluteIndicator(alignmentAxis?: Vector3): DofIndicatorResult {
  const root = new Group();
  root.name = 'dof_revolute';
  root.renderOrder = 10;

  const arc = createArcArrow(JOINT_STEEL_BLUE);
  root.add(arc);

  if (alignmentAxis && alignmentAxis.lengthSq() > 1e-6) {
    orientGroupToAxis(root, alignmentAxis, _zAxis);
  }

  const meshes = collectMeshes(root);

  return {
    rootNode: root,
    meshes,
    update() {},
    dispose() {
      disposeChildren(root);
    },
  };
}

function createPrismaticIndicator(alignmentAxis?: Vector3): DofIndicatorResult {
  const root = new Group();
  root.name = 'dof_prismatic';
  root.renderOrder = 10;

  const arrows = createDoubleArrow(ARROW_LENGTH, JOINT_STEEL_BLUE);
  root.add(arrows);

  if (alignmentAxis && alignmentAxis.lengthSq() > 1e-6) {
    orientGroupToAxis(root, alignmentAxis, _yAxis);
  }

  const meshes = collectMeshes(root);

  return {
    rootNode: root,
    meshes,
    update() {},
    dispose() {
      disposeChildren(root);
    },
  };
}

function createSphericalIndicator(): DofIndicatorResult {
  const root = new Group();
  root.name = 'dof_spherical';
  root.renderOrder = 10;

  const arcs: Group[] = [];

  for (let i = 0; i < 3; i++) {
    const arc = createArcArrow(JOINT_STEEL_BLUE);
    if (i === 0) arc.rotation.y = Math.PI / 2; // YZ plane
    if (i === 1) arc.rotation.x = Math.PI / 2; // XZ plane
    // i === 2: XY plane (default)
    arcs.push(arc);
    root.add(arc);
  }

  const meshes = collectMeshes(root);

  return {
    rootNode: root,
    meshes,
    update() {},
    dispose() {
      disposeChildren(root);
    },
  };
}

function createCylindricalIndicator(alignmentAxis?: Vector3): DofIndicatorResult {
  const root = new Group();
  root.name = 'dof_cylindrical';
  root.renderOrder = 10;

  const arc = createArcArrow(JOINT_STEEL_BLUE);
  root.add(arc);

  const arrows = createDoubleArrow(ARROW_LENGTH, JOINT_STEEL_BLUE);
  root.add(arrows);

  if (alignmentAxis && alignmentAxis.lengthSq() > 1e-6) {
    orientGroupToAxis(root, alignmentAxis, _zAxis);
  }

  const meshes = collectMeshes(root);

  return {
    rootNode: root,
    meshes,
    update() {},
    dispose() {
      disposeChildren(root);
    },
  };
}

function createPlanarIndicator(alignmentAxis?: Vector3): DofIndicatorResult {
  const root = new Group();
  root.name = 'dof_planar';
  root.renderOrder = 10;

  const arc = createArcArrow(JOINT_STEEL_BLUE);
  root.add(arc);

  const arrowX = createDoubleArrow(ARROW_LENGTH * 0.8, JOINT_STEEL_BLUE);
  arrowX.rotation.z = Math.PI / 2;
  root.add(arrowX);

  const arrowY = createDoubleArrow(ARROW_LENGTH * 0.8, JOINT_STEEL_BLUE);
  root.add(arrowY);

  if (alignmentAxis && alignmentAxis.lengthSq() > 1e-6) {
    orientGroupToAxis(root, alignmentAxis, _zAxis);
  }

  const meshes = collectMeshes(root);

  return {
    rootNode: root,
    meshes,
    update() {},
    dispose() {
      disposeChildren(root);
    },
  };
}

function createUniversalIndicator(alignmentAxis?: Vector3): DofIndicatorResult {
  const root = new Group();
  root.name = 'dof_universal';
  root.renderOrder = 10;

  const arc1 = createArcArrow(JOINT_STEEL_BLUE);
  arc1.rotation.y = Math.PI / 2;
  root.add(arc1);

  const arc2 = createArcArrow(JOINT_STEEL_BLUE);
  arc2.rotation.x = Math.PI / 2;
  root.add(arc2);

  if (alignmentAxis && alignmentAxis.lengthSq() > 1e-6) {
    orientGroupToAxis(root, alignmentAxis, _zAxis);
  }

  const meshes = collectMeshes(root);

  return {
    rootNode: root,
    meshes,
    update() {},
    dispose() {
      disposeChildren(root);
    },
  };
}

// ── Utilities ──

function collectMeshes(root: Group): Mesh[] {
  const meshes: Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof Mesh) meshes.push(child);
  });
  return meshes;
}

function disposeChildren(root: Group): void {
  root.traverse((child) => {
    if (child instanceof Mesh || child instanceof Line) {
      child.geometry.dispose();
      if (child.material instanceof MeshBasicMaterial || child.material instanceof LineBasicMaterial) {
        child.material.dispose();
      }
    }
  });
}

// ── Public factory ──

export function createDofIndicator(
  jointType: string,
  alignmentAxis?: Vector3,
): DofIndicatorResult | undefined {
  switch (jointType) {
    case 'revolute':
      return createRevoluteIndicator(alignmentAxis);
    case 'prismatic':
      return createPrismaticIndicator(alignmentAxis);
    case 'fixed':
      return undefined;
    case 'spherical':
      return createSphericalIndicator();
    case 'cylindrical':
      return createCylindricalIndicator(alignmentAxis);
    case 'planar':
      return createPlanarIndicator(alignmentAxis);
    case 'universal':
      return createUniversalIndicator(alignmentAxis);
    case 'distance':
    case 'point-line':
    case 'point-plane':
      // TODO: uncommon joint types — implement when used in UI
      return undefined;
    default:
      return undefined;
  }
}
