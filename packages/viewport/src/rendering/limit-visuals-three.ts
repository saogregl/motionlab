/**
 * Joint limit visuals — fat-line-based arcs and rails showing motion range.
 *
 * Revolute: arc in XY plane from lowerLimit to upperLimit.
 * Prismatic: parallel rails along Z-axis spanning [lower, upper].
 */

import { Group, Vector3 } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

import { DOF_FREE, JOINT_STEEL_BLUE } from './colors-three.js';
import { trackMaterial, untrackMaterial } from './fat-line-three.js';
import { buildArcPoints } from './line-primitives-three.js';

// ── Types ──

export interface LimitVisual {
  rootNode: Group;
  /** Update the current-position indicator (value in radians or meters). */
  update(currentValue: number | null): void;
  dispose(): void;
}

// ── Constants ──

const ARC_RADIUS = 0.1;
const LIMIT_LINE_WIDTH = 2;
const LIMIT_OPACITY = 0.3;
const MARKER_LINE_WIDTH = 1.5;
const MARKER_OPACITY = 0.85;
const MARKER_LENGTH = 0.12;
const RAIL_SEPARATION = 0.016;
const RAIL_LINE_WIDTH = 1.5;
const ARC_SEGMENTS_PER_RAD = 10;

// ── Helpers ──

function makeLineMat(
  color: THREE.Color,
  lineWidth: number,
  opacity: number,
  dashed = false,
): LineMaterial {
  const mat = new LineMaterial({
    color: color.getHex(),
    linewidth: lineWidth,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    dashed,
    dashSize: dashed ? 0.008 : 0.02,
    gapSize: dashed ? 0.004 : 0.01,
    dashScale: 1,
  });
  trackMaterial(mat);
  return mat;
}

import type * as THREE from 'three';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';

function makeLine(points: Vector3[], mat: LineMaterial): Line2 {
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
  line.renderOrder = 1;
  return line;
}

function updateLinePoints(line: Line2, points: Vector3[]): void {
  const geo = line.geometry as LineGeometry;
  const arr = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    arr[i * 3] = points[i].x;
    arr[i * 3 + 1] = points[i].y;
    arr[i * 3 + 2] = points[i].z;
  }
  geo.setPositions(arr);
  line.computeLineDistances();
}

// ── Revolute limit: fat-line arc ──

export function createRevoluteLimitVisual(
  lowerLimit: number,
  upperLimit: number,
): LimitVisual | null {
  const arc = upperLimit - lowerLimit;
  if (arc <= 0) return null;

  const root = new Group();
  root.name = 'limit-visual-revolute';

  const segs = Math.max(8, Math.round(arc * ARC_SEGMENTS_PER_RAD));
  // Arc in XY plane (TorusGeometry was also XY)
  const arcPts = buildArcPoints(ARC_RADIUS, lowerLimit, upperLimit, segs, 'xy');
  const arcMat = makeLineMat(JOINT_STEEL_BLUE, LIMIT_LINE_WIDTH, LIMIT_OPACITY);
  const arcLine = makeLine(arcPts, arcMat);
  root.add(arcLine);

  // Current-position marker: radial line from origin to arc radius
  const markerMat = makeLineMat(DOF_FREE, MARKER_LINE_WIDTH, MARKER_OPACITY);
  const markerLine = makeLine([new Vector3(0, 0, 0), new Vector3(MARKER_LENGTH, 0, 0)], markerMat);
  markerLine.visible = false;
  markerLine.renderOrder = 2;
  root.add(markerLine);

  const lines = [arcLine, markerLine];

  return {
    rootNode: root,
    update(currentValue: number | null) {
      markerLine.visible = currentValue !== null;
      if (currentValue === null) return;
      const clamped = Math.min(Math.max(currentValue, lowerLimit), upperLimit);
      // Rotate the marker line to the current angle
      markerLine.rotation.z = clamped;
    },
    dispose() {
      for (const l of lines) {
        l.geometry.dispose();
        untrackMaterial(l.material as LineMaterial);
        (l.material as LineMaterial).dispose();
      }
    },
  };
}

// ── Prismatic limit: parallel rail lines along Z-axis ──

export function createPrismaticLimitVisual(
  lowerLimit: number,
  upperLimit: number,
): LimitVisual | null {
  const length = upperLimit - lowerLimit;
  if (length <= 0) return null;

  const root = new Group();
  root.name = 'limit-visual-prismatic';

  const half = RAIL_SEPARATION / 2;

  // Two parallel rails along Z
  const railMat = makeLineMat(JOINT_STEEL_BLUE, RAIL_LINE_WIDTH, LIMIT_OPACITY);
  const leftRail = makeLine(
    [new Vector3(-half, 0, lowerLimit), new Vector3(-half, 0, upperLimit)],
    railMat,
  );
  leftRail.name = 'prismatic-limit-left-rail';
  const rightMat = makeLineMat(JOINT_STEEL_BLUE, RAIL_LINE_WIDTH, LIMIT_OPACITY);
  const rightRail = makeLine(
    [new Vector3(half, 0, lowerLimit), new Vector3(half, 0, upperLimit)],
    rightMat,
  );
  rightRail.name = 'prismatic-limit-right-rail';
  root.add(leftRail);
  root.add(rightRail);

  // End caps
  const capMat = makeLineMat(JOINT_STEEL_BLUE, RAIL_LINE_WIDTH, LIMIT_OPACITY);
  const lowCap = makeLine(
    [new Vector3(-half, 0, lowerLimit), new Vector3(half, 0, lowerLimit)],
    capMat,
  );
  lowCap.name = 'prismatic-limit-low-cap';
  const highCap = makeLine(
    [new Vector3(-half, 0, upperLimit), new Vector3(half, 0, upperLimit)],
    capMat,
  );
  highCap.name = 'prismatic-limit-high-cap';
  root.add(lowCap);
  root.add(highCap);

  // Current-position marker: small crosshair at position along Z
  const markerMat = makeLineMat(DOF_FREE, MARKER_LINE_WIDTH, MARKER_OPACITY);
  const crossSize = 0.008;
  const markerLine = makeLine(
    [new Vector3(-crossSize, 0, 0), new Vector3(crossSize, 0, 0)],
    markerMat,
  );
  markerLine.name = 'prismatic-limit-marker';
  markerLine.visible = false;
  markerLine.renderOrder = 2;
  root.add(markerLine);

  const lines = [leftRail, rightRail, lowCap, highCap, markerLine];

  return {
    rootNode: root,
    update(currentValue: number | null) {
      markerLine.visible = currentValue !== null;
      if (currentValue === null) return;
      markerLine.position.z = Math.min(Math.max(currentValue, lowerLimit), upperLimit);
    },
    dispose() {
      for (const l of lines) {
        l.geometry.dispose();
        untrackMaterial(l.material as LineMaterial);
        (l.material as LineMaterial).dispose();
      }
    },
  };
}

// ── Cylindrical limit ──

export function createCylindricalLimitVisual(
  lowerLimit: number,
  upperLimit: number,
): LimitVisual | null {
  return createPrismaticLimitVisual(lowerLimit, upperLimit);
}

// ── Factory dispatcher ──

export function createLimitVisual(
  jointType: string,
  lowerLimit: number,
  upperLimit: number,
): LimitVisual | null {
  switch (jointType) {
    case 'revolute':
      return createRevoluteLimitVisual(lowerLimit, upperLimit);
    case 'prismatic':
      return createPrismaticLimitVisual(lowerLimit, upperLimit);
    case 'cylindrical':
      return createCylindricalLimitVisual(lowerLimit, upperLimit);
    default:
      return null;
  }
}
