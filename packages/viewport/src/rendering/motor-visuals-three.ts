/**
 * Motor / actuator overlay visuals — fat-line-based arcs and arrows.
 *
 * Revolute motor: amber 270° arc with arrowhead chevron.
 * Prismatic motor: amber double-ended arrow along Y-axis.
 */

import { Group, Vector3 } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

import { MOTOR_INDICATOR } from './colors-three.js';
import { trackMaterial, untrackMaterial } from './fat-line-three.js';
import { buildArcPoints, buildArrowChevron } from './line-primitives-three.js';

// ── Result interface ──

export interface MotorVisualResult {
  rootNode: Group;
  dispose(): void;
}

// ── Constants ──

const RING_RADIUS = 0.065;
const ARC_LINE_WIDTH = 2;
const ARC_OPACITY = 0.85;
const ARROW_LINE_WIDTH = 1.5;
const ARROW_LENGTH = 0.14;
const PI = Math.PI;

// ── Helpers ──

function makeMotorMat(lineWidth: number, opacity = ARC_OPACITY): LineMaterial {
  const mat = new LineMaterial({
    color: MOTOR_INDICATOR.getHex(),
    linewidth: lineWidth,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    dashed: false,
    dashScale: 1,
    dashSize: 0.02,
    gapSize: 0.01,
  });
  trackMaterial(mat);
  return mat;
}

function makeLine(points: Vector3[], mat: LineMaterial, renderOrder = 11): Line2 {
  const geo = new LineGeometry();
  const arr = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    arr[i * 3] = points[i].x;
    arr[i * 3 + 1] = points[i].y;
    arr[i * 3 + 2] = points[i].z;
  }
  geo.setPositions(arr);
  const line = new Line2(geo, mat);
  line.computeLineDistances();
  line.frustumCulled = false;
  line.renderOrder = renderOrder;
  return line;
}

// ── Per-type factories ──

function createRevoluteMotorVisual(): MotorVisualResult {
  const root = new Group();
  root.name = 'motor_revolute';
  root.renderOrder = 11;

  // 270° arc in XY plane (matching old TorusGeometry plane)
  const arcPts = buildArcPoints(RING_RADIUS, 0, PI * 1.5, 36, 'xy');
  const arcMat = makeMotorMat(ARC_LINE_WIDTH);
  const arcLine = makeLine(arcPts, arcMat);
  root.add(arcLine);

  // Arrowhead chevron at the end of the arc
  const endPt = arcPts[arcPts.length - 1];
  const endDir = endPt.clone().normalize();
  // Tangent at end: perpendicular to radial in XY plane
  const tangent = new Vector3(-endDir.y, endDir.x, 0).normalize();
  const chevronPts = buildArrowChevron(endPt, tangent, endDir, 0.012);
  const chevronMat = makeMotorMat(ARROW_LINE_WIDTH);
  const chevronLine = makeLine(chevronPts, chevronMat);
  root.add(chevronLine);

  // Offset slightly along Z so it doesn't overlap the joint glyph
  root.position.z = 0.015;

  const lines = [arcLine, chevronLine];

  return {
    rootNode: root,
    dispose() {
      for (const l of lines) {
        l.geometry.dispose();
        untrackMaterial(l.material as LineMaterial);
        (l.material as LineMaterial).dispose();
      }
    },
  };
}

function createPrismaticMotorVisual(): MotorVisualResult {
  const root = new Group();
  root.name = 'motor_prismatic';
  root.renderOrder = 11;

  const halfLen = ARROW_LENGTH / 2;

  // Shaft line along Y
  const shaftMat = makeMotorMat(ARROW_LINE_WIDTH);
  const shaftLine = makeLine(
    [new Vector3(0, -halfLen, 0), new Vector3(0, halfLen, 0)],
    shaftMat,
  );
  root.add(shaftLine);

  // Arrow chevrons at both ends
  const yUp = new Vector3(0, 1, 0);
  const yDown = new Vector3(0, -1, 0);
  const xPerp = new Vector3(1, 0, 0);

  const topMat = makeMotorMat(ARROW_LINE_WIDTH);
  const topChevron = makeLine(
    buildArrowChevron(new Vector3(0, halfLen, 0), yUp, xPerp, 0.012),
    topMat,
  );
  root.add(topChevron);

  const botMat = makeMotorMat(ARROW_LINE_WIDTH);
  const botChevron = makeLine(
    buildArrowChevron(new Vector3(0, -halfLen, 0), yDown, xPerp, 0.012),
    botMat,
  );
  root.add(botChevron);

  // Offset slightly in X so it doesn't overlap the joint glyph
  root.position.x = 0.015;

  const lines = [shaftLine, topChevron, botChevron];

  return {
    rootNode: root,
    dispose() {
      for (const l of lines) {
        l.geometry.dispose();
        untrackMaterial(l.material as LineMaterial);
        (l.material as LineMaterial).dispose();
      }
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
