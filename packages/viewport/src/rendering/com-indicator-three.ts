/**
 * Center-of-mass indicator: a small crosshair + dot rendered at a body's COM.
 *
 * Parented to a body rootNode so it automatically follows body motion.
 * depthTest off for consistent visibility through geometry.
 */

import { Group, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three';

import { COM_INDICATOR } from './colors-three.js';
import { createFatLine, disposeFatLine, isFatLine } from './fat-line-three.js';

const CROSSHAIR_HALF = 0.015;
const DOT_RADIUS = 0.008;
const LINE_WIDTH = 2;
const RENDER_ORDER = 9;

let _dotGeometry: SphereGeometry | null = null;
function getDotGeometry(): SphereGeometry {
  if (!_dotGeometry) _dotGeometry = new SphereGeometry(DOT_RADIUS, 8, 8);
  return _dotGeometry;
}

export interface ComIndicatorResult {
  readonly rootNode: Group;
  dispose(): void;
}

export function createComIndicator(): ComIndicatorResult {
  const root = new Group();
  root.name = 'com-indicator';
  root.renderOrder = RENDER_ORDER;

  // Central dot
  const dot = new Mesh(
    getDotGeometry().clone(),
    new MeshBasicMaterial({
      color: COM_INDICATOR,
      toneMapped: false,
      depthTest: false,
    }),
  );
  dot.renderOrder = RENDER_ORDER;
  dot.userData = { isPickable: false };
  root.add(dot);

  // Three orthogonal crosshair lines
  const axes: [Vector3, Vector3][] = [
    [new Vector3(-CROSSHAIR_HALF, 0, 0), new Vector3(CROSSHAIR_HALF, 0, 0)],
    [new Vector3(0, -CROSSHAIR_HALF, 0), new Vector3(0, CROSSHAIR_HALF, 0)],
    [new Vector3(0, 0, -CROSSHAIR_HALF), new Vector3(0, 0, CROSSHAIR_HALF)],
  ];

  for (const [start, end] of axes) {
    const line = createFatLine(
      [start, end],
      {
        color: COM_INDICATOR,
        lineWidth: LINE_WIDTH,
        depthTest: false,
      },
      { isPickable: false },
    );
    line.renderOrder = RENDER_ORDER;
    root.add(line);
  }

  return {
    rootNode: root,
    dispose() {
      root.traverse((child) => {
        if (isFatLine(child)) disposeFatLine(child);
        if (child instanceof Mesh) {
          child.geometry.dispose();
          if (child.material instanceof MeshBasicMaterial) child.material.dispose();
        }
      });
    },
  };
}
