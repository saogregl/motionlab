import {
  ConeGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  TorusGeometry,
  BufferGeometry,
  Float32BufferAttribute,
} from 'three';

import { MOTOR_INDICATOR } from './colors-three.js';

// ── Result interface ──

export interface MotorVisualResult {
  rootNode: Group;
  meshes: Mesh[];
  dispose(): void;
}

// ── Geometry constants ──

const RING_RADIUS = 0.065;
const RING_TUBE = 0.006;
const RING_RADIAL_SEGMENTS = 8;
const RING_TUBULAR_SEGMENTS = 24;
const ARROWHEAD_RADIUS = 0.01;
const ARROWHEAD_HEIGHT = 0.02;
const ARROWHEAD_SEGMENTS = 6;
const ARROW_LENGTH = 0.14;

// ── Shared geometry templates ──

let _ringGeometry: TorusGeometry | null = null;
let _arrowheadGeometry: ConeGeometry | null = null;

function getRingGeometry(): TorusGeometry {
  if (!_ringGeometry) {
    _ringGeometry = new TorusGeometry(
      RING_RADIUS,
      RING_TUBE,
      RING_RADIAL_SEGMENTS,
      RING_TUBULAR_SEGMENTS,
      Math.PI * 1.5,
    );
  }
  return _ringGeometry;
}

function getArrowheadGeometry(): ConeGeometry {
  if (!_arrowheadGeometry) {
    _arrowheadGeometry = new ConeGeometry(ARROWHEAD_RADIUS, ARROWHEAD_HEIGHT, ARROWHEAD_SEGMENTS);
  }
  return _arrowheadGeometry;
}

// ── Material helpers ──

function makeMotorMaterial(opacity = 0.85): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: MOTOR_INDICATOR,
    transparent: true,
    opacity,
    depthTest: false,
  });
}

function makeMotorLineMaterial(opacity = 0.85): LineBasicMaterial {
  return new LineBasicMaterial({
    color: MOTOR_INDICATOR,
    transparent: true,
    opacity,
    depthTest: false,
  });
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

// ── Per-type indicator factories ──

function createRevoluteMotorVisual(): MotorVisualResult {
  const root = new Group();
  root.name = 'motor_revolute';
  root.renderOrder = 11;

  // Amber arc ring (270°) — similar to DOF indicator but smaller + amber
  const arcGeo = getRingGeometry().clone();
  const arc = new Mesh(arcGeo, makeMotorMaterial());
  arc.userData = { entityType: 'actuator' };
  root.add(arc);

  // Arrowhead at end of arc
  const arrowhead = new Mesh(getArrowheadGeometry().clone(), makeMotorMaterial());
  arrowhead.userData = { entityType: 'actuator' };
  const endAngle = Math.PI * 1.5;
  arrowhead.position.set(
    Math.cos(endAngle) * RING_RADIUS,
    Math.sin(endAngle) * RING_RADIUS,
    0,
  );
  arrowhead.rotation.z = endAngle + Math.PI / 2;
  root.add(arrowhead);

  // Offset slightly so it doesn't fully overlap the DOF indicator
  root.position.z = 0.015;

  const meshes = collectMeshes(root);

  return {
    rootNode: root,
    meshes,
    dispose() {
      disposeChildren(root);
    },
  };
}

function createPrismaticMotorVisual(): MotorVisualResult {
  const root = new Group();
  root.name = 'motor_prismatic';
  root.renderOrder = 11;

  const halfLen = ARROW_LENGTH / 2;

  // Top arrowhead
  const topArrow = new Mesh(getArrowheadGeometry().clone(), makeMotorMaterial());
  topArrow.position.set(0, halfLen, 0);
  topArrow.userData = { entityType: 'actuator' };
  root.add(topArrow);

  // Bottom arrowhead (pointing down)
  const botArrow = new Mesh(getArrowheadGeometry().clone(), makeMotorMaterial());
  botArrow.position.set(0, -halfLen, 0);
  botArrow.rotation.z = Math.PI;
  botArrow.userData = { entityType: 'actuator' };
  root.add(botArrow);

  // Shaft line
  const shaftGeo = new BufferGeometry();
  shaftGeo.setAttribute(
    'position',
    new Float32BufferAttribute(
      [0, -halfLen + ARROWHEAD_HEIGHT * 0.5, 0, 0, halfLen - ARROWHEAD_HEIGHT * 0.5, 0],
      3,
    ),
  );
  const shaft = new Line(shaftGeo, makeMotorLineMaterial());
  shaft.userData = { entityType: 'actuator' };
  root.add(shaft);

  // Offset slightly to not overlap the DOF indicator
  root.position.x = 0.015;

  const meshes = collectMeshes(root);

  return {
    rootNode: root,
    meshes,
    dispose() {
      disposeChildren(root);
    },
  };
}

// ── Public factory ──

export function createMotorVisual(actuatorType: string): MotorVisualResult | undefined {
  switch (actuatorType) {
    case 'revolute-motor':
      return createRevoluteMotorVisual();
    case 'prismatic-motor':
      return createPrismaticMotorVisual();
    default:
      return undefined;
  }
}
