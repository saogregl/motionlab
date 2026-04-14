/**
 * Coordinate-frame triad for bodies and geometries.
 *
 * Shared factory — callers control size/opacity via options.
 * depthTest is off so the triad is visible through geometry.
 */

import { Group, Vector3 } from 'three';

import { AXIS_X, AXIS_Y, AXIS_Z } from './colors-three.js';
import {
  createFatLine,
  disposeFatLine,
  INDICATOR_LINE_WIDTH,
  isFatLine,
} from './fat-line-three.js';

const RENDER_ORDER = 8;
const ARROW_RATIO = 0.2; // arrowhead = 20% of axis length

export interface FrameTriadOptions {
  axisLength: number;
  opacity: number;
  lineWidth?: number;
}

export interface FrameTriadResult {
  readonly rootNode: Group;
  dispose(): void;
}

export function createFrameTriad(opts: FrameTriadOptions): FrameTriadResult {
  const { axisLength, opacity, lineWidth = INDICATOR_LINE_WIDTH } = opts;
  const arrowSize = axisLength * ARROW_RATIO;

  const root = new Group();
  root.name = 'frame-triad';
  root.renderOrder = RENDER_ORDER;

  const axes: [Vector3, typeof AXIS_X][] = [
    [new Vector3(axisLength, 0, 0), AXIS_X],
    [new Vector3(0, axisLength, 0), AXIS_Y],
    [new Vector3(0, 0, axisLength), AXIS_Z],
  ];

  const origin = new Vector3(0, 0, 0);

  for (const [axisEnd, color] of axes) {
    // Axis line
    const line = createFatLine(
      [origin, axisEnd],
      {
        color,
        lineWidth,
        transparent: true,
        opacity,
        depthTest: false,
      },
      { isPickable: false },
    );
    line.renderOrder = RENDER_ORDER;
    root.add(line);

    // Arrowhead
    const dir = axisEnd.clone().normalize();
    const perp = new Vector3();
    if (Math.abs(dir.y) < 0.9) {
      perp.crossVectors(dir, new Vector3(0, 1, 0)).normalize();
    } else {
      perp.crossVectors(dir, new Vector3(1, 0, 0)).normalize();
    }
    const back = axisEnd.clone().sub(dir.clone().multiplyScalar(arrowSize));
    const arrow = createFatLine(
      [
        back.clone().add(perp.clone().multiplyScalar(arrowSize * 0.4)),
        axisEnd.clone(),
        back.clone().sub(perp.clone().multiplyScalar(arrowSize * 0.4)),
      ],
      {
        color,
        lineWidth,
        transparent: true,
        opacity,
        depthTest: false,
      },
      { isPickable: false },
    );
    arrow.renderOrder = RENDER_ORDER;
    root.add(arrow);
  }

  return {
    rootNode: root,
    dispose() {
      root.traverse((child) => {
        if (isFatLine(child)) disposeFatLine(child);
      });
    },
  };
}
