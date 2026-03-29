/**
 * World-origin triad: a small, always-visible XYZ landmark at (0,0,0).
 *
 * Rendered behind other overlays (renderOrder 1) with depthTest off so it
 * stays visible through geometry.  Not pickable.
 */

import { Group, Vector3 } from 'three';

import { AXIS_X, AXIS_Y, AXIS_Z } from './colors-three.js';
import { createFatLine, disposeFatLine, isFatLine } from './fat-line-three.js';

const AXIS_LENGTH = 0.1;
const LINE_WIDTH = 1.5;
const OPACITY = 0.35;
const ARROW_SIZE = 0.02;
const RENDER_ORDER = 1;

export interface OriginTriadResult {
  readonly rootNode: Group;
  dispose(): void;
}

export function createOriginTriad(): OriginTriadResult {
  const root = new Group();
  root.name = 'world-origin-triad';
  root.renderOrder = RENDER_ORDER;

  const axes: [Vector3, typeof AXIS_X][] = [
    [new Vector3(AXIS_LENGTH, 0, 0), AXIS_X],
    [new Vector3(0, AXIS_LENGTH, 0), AXIS_Y],
    [new Vector3(0, 0, AXIS_LENGTH), AXIS_Z],
  ];

  const origin = new Vector3(0, 0, 0);

  for (const [axisEnd, color] of axes) {
    // Axis line
    const line = createFatLine([origin, axisEnd], {
      color,
      lineWidth: LINE_WIDTH,
      transparent: true,
      opacity: OPACITY,
      depthTest: false,
    }, { isPickable: false });
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
    const back = axisEnd.clone().sub(dir.clone().multiplyScalar(ARROW_SIZE));
    const arrow = createFatLine([
      back.clone().add(perp.clone().multiplyScalar(ARROW_SIZE * 0.4)),
      axisEnd.clone(),
      back.clone().sub(perp.clone().multiplyScalar(ARROW_SIZE * 0.4)),
    ], {
      color,
      lineWidth: LINE_WIDTH,
      transparent: true,
      opacity: OPACITY,
      depthTest: false,
    }, { isPickable: false });
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
