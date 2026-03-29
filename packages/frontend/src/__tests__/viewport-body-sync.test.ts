import { describe, expect, it } from 'vitest';

import type { BodyState } from '../stores/mechanism.js';
import { bodyPoseSignature } from '../hooks/useViewportBridge.js';

function makeBody(): BodyState {
  return {
    id: 'body-1',
    name: 'Body 1',
    massProperties: {
      mass: 1,
      centerOfMass: { x: 0, y: 0, z: 0 },
      ixx: 1,
      iyy: 1,
      izz: 1,
      ixy: 0,
      ixz: 0,
      iyz: 0,
    },
    pose: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
    motionType: 'dynamic',
  };
}

describe('viewport body sync helpers', () => {
  it('changes the sync signature when the authored body pose changes', () => {
    const before = makeBody();
    const after = {
      ...before,
      pose: {
        position: { x: 0.25, y: -0.5, z: 1 },
        rotation: { x: 0, y: 0.70710678, z: 0, w: 0.70710678 },
      },
    };

    expect(bodyPoseSignature(after)).not.toBe(bodyPoseSignature(before));
  });

  it('ignores mass-property changes when deciding whether the viewport transform must update', () => {
    const before = makeBody();
    const after = {
      ...before,
      massProperties: {
        ...before.massProperties,
        centerOfMass: { x: 0.1, y: 0.2, z: 0.3 },
      },
    };

    expect(bodyPoseSignature(after)).toBe(bodyPoseSignature(before));
  });
});
