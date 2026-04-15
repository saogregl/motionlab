import { describe, expect, it } from 'vitest';
import type { BodyPose } from '../stores/mechanism.js';
import {
  analyzeDatumAlignment,
  computeDatumWorldPose,
  type DatumWorldPose,
} from '../utils/datum-alignment.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const IDENTITY_Q = { x: 0, y: 0, z: 0, w: 1 };
const ORIGIN = { x: 0, y: 0, z: 0 };

/** 90-degree rotation around Y: axis=[0,1,0], angle=pi/2 */
const ROT_Y_90 = { x: 0, y: Math.sin(Math.PI / 4), z: 0, w: Math.cos(Math.PI / 4) };

/** 90-degree rotation around X: axis=[1,0,0], angle=pi/2 */
const ROT_X_90 = { x: Math.sin(Math.PI / 4), y: 0, z: 0, w: Math.cos(Math.PI / 4) };

function pose(pos: { x: number; y: number; z: number } = ORIGIN, rot = IDENTITY_Q): BodyPose {
  return { position: pos, rotation: rot };
}

function worldPose(
  pos: { x: number; y: number; z: number },
  zAxis: { x: number; y: number; z: number },
): DatumWorldPose {
  return { position: pos, zAxis };
}

function expectVecClose(
  actual: { x: number; y: number; z: number },
  expected: { x: number; y: number; z: number },
  tolerance = 1e-6,
) {
  expect(actual.x).toBeCloseTo(expected.x, -Math.log10(tolerance));
  expect(actual.y).toBeCloseTo(expected.y, -Math.log10(tolerance));
  expect(actual.z).toBeCloseTo(expected.z, -Math.log10(tolerance));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeDatumWorldPose', () => {
  it('identity body + identity datum → origin with Z=[0,0,1]', () => {
    const result = computeDatumWorldPose(pose(), pose());
    expectVecClose(result.position, ORIGIN);
    expectVecClose(result.zAxis, { x: 0, y: 0, z: 1 });
  });

  it('body translated, datum at local origin → world position equals body position', () => {
    const bodyPose = pose({ x: 5, y: 3, z: -2 });
    const datumPose = pose();
    const result = computeDatumWorldPose(bodyPose, datumPose);
    expectVecClose(result.position, { x: 5, y: 3, z: -2 });
    expectVecClose(result.zAxis, { x: 0, y: 0, z: 1 });
  });

  it('body rotated 90° around Y, datum at local [1,0,0] → world position accounts for rotation', () => {
    // Rotating [1,0,0] by 90° around Y yields [0,0,-1] (right-hand rule)
    const bodyPose = pose(ORIGIN, ROT_Y_90);
    const datumPose = pose({ x: 1, y: 0, z: 0 });
    const result = computeDatumWorldPose(bodyPose, datumPose);
    expectVecClose(result.position, { x: 0, y: 0, z: -1 });
  });

  it('composed rotation: body rotated + datum rotated → Z-axis reflects both', () => {
    // Body rotated 90° around Y: Z-axis [0,0,1] → [1,0,0]
    // Datum rotated 90° around X (in local frame, applied after body)
    // Composed: first local datum rot (X 90°), then body rot (Y 90°)
    // Local Z [0,0,1] after datum X90 → [0,-1,0], after body Y90 → [0,-1,0]
    const bodyPose = pose(ORIGIN, ROT_Y_90);
    const datumPose = pose(ORIGIN, ROT_X_90);
    const result = computeDatumWorldPose(bodyPose, datumPose);

    // After datum rotation around X by 90°: Z → [0,-1,0]
    // After body rotation around Y by 90°: [0,-1,0] → [0,-1,0]
    // (Y rotation does not affect the Y component)
    expectVecClose(result.zAxis, { x: 0, y: -1, z: 0 });
  });
});

describe('analyzeDatumAlignment', () => {
  describe('coaxial', () => {
    it('parallel Z-axes, offset along Z → coaxial', () => {
      const parent = worldPose({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
      const child = worldPose({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 1 });
      const result = analyzeDatumAlignment(parent, child);
      expect(result.kind).toBe('coaxial');
      expect(result.recommendedTypes).toContain('revolute');
      expect(result.recommendedTypes).toContain('cylindrical');
      expect(result.recommendedTypes).toContain('prismatic');
      expect(result.distance).toBeCloseTo(5);
      expect(result.axis).toBeDefined();
    });
  });

  describe('coplanar', () => {
    it('parallel Z-axes, offset perpendicular to Z → coplanar', () => {
      const parent = worldPose({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
      const child = worldPose({ x: 3, y: 4, z: 0 }, { x: 0, y: 0, z: 1 });
      const result = analyzeDatumAlignment(parent, child);
      expect(result.kind).toBe('coplanar');
      expect(result.recommendedTypes).toContain('planar');
      expect(result.recommendedTypes).toContain('fixed');
      expect(result.distance).toBeCloseTo(5);
      expect(result.axis).toBeDefined();
    });
  });

  describe('coincident', () => {
    it('two datums at same position → coincident', () => {
      const parent = worldPose({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: 1 });
      const child = worldPose({ x: 1, y: 2, z: 3 }, { x: 1, y: 0, z: 0 });
      const result = analyzeDatumAlignment(parent, child);
      expect(result.kind).toBe('coincident');
      expect(result.recommendedTypes).toContain('spherical');
      expect(result.recommendedTypes).toContain('revolute');
      expect(result.recommendedTypes).toContain('fixed');
      expect(result.distance).toBeCloseTo(0);
    });
  });

  describe('general', () => {
    it('non-parallel Z-axes, non-coincident → general', () => {
      const parent = worldPose({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
      const child = worldPose({ x: 5, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
      const result = analyzeDatumAlignment(parent, child);
      expect(result.kind).toBe('general');
      expect(result.recommendedTypes).toContain('fixed');
      expect(result.recommendedTypes).toContain('revolute');
      expect(result.recommendedTypes).toContain('prismatic');
      expect(result.recommendedTypes).toContain('spherical');
      expect(result.recommendedTypes).toContain('cylindrical');
      expect(result.recommendedTypes).toContain('planar');
      expect(result.distance).toBeCloseTo(5);
    });

    it('parallel but laterally offset axes are not misclassified as coaxial', () => {
      const parent = worldPose({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
      const child = worldPose({ x: 2, y: 0, z: 5 }, { x: 0, y: 0, z: 1 });
      const result = analyzeDatumAlignment(parent, child);
      expect(result.kind).toBe('general');
    });
  });

  describe('anti-parallel Z-axes', () => {
    it('Z-axes pointing opposite directions are still detected as parallel (coaxial)', () => {
      const parent = worldPose({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
      const child = worldPose({ x: 0, y: 0, z: 3 }, { x: 0, y: 0, z: -1 });
      const result = analyzeDatumAlignment(parent, child);
      expect(result.kind).toBe('coaxial');
      expect(result.recommendedTypes).toContain('revolute');
      expect(result.recommendedTypes).toContain('cylindrical');
      expect(result.recommendedTypes).toContain('prismatic');
    });
  });

  describe('near threshold', () => {
    it('small angular deviations do not override the stricter coaxial distance check', () => {
      // 2 degrees ≈ 0.0349 radians, cos(2°) ≈ 0.99939 > 0.999 threshold
      const angleDeg = 2;
      const angleRad = (angleDeg * Math.PI) / 180;
      // Tilt Z-axis by 2° in the XZ plane
      const tiltedZ = { x: Math.sin(angleRad), y: 0, z: Math.cos(angleRad) };
      const parent = worldPose({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
      const child = worldPose({ x: 0, y: 0, z: 5 }, tiltedZ);
      const result = analyzeDatumAlignment(parent, child);
      expect(result.kind).toBe('general');
    });

    it('Z-axes at ~3° (outside threshold) → general', () => {
      // 3 degrees ≈ 0.0524 radians, cos(3°) ≈ 0.99863 < 0.999 threshold
      const angleDeg = 3;
      const angleRad = (angleDeg * Math.PI) / 180;
      const tiltedZ = { x: Math.sin(angleRad), y: 0, z: Math.cos(angleRad) };
      const parent = worldPose({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
      const child = worldPose({ x: 0, y: 0, z: 5 }, tiltedZ);
      const result = analyzeDatumAlignment(parent, child);
      expect(result.kind).toBe('general');
    });
  });

  describe('distance field', () => {
    it('always populated with correct Euclidean distance', () => {
      const parent = worldPose({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: 1 });
      const child = worldPose({ x: 4, y: 6, z: 3 }, { x: 0, y: 0, z: 1 });
      // distance = sqrt((4-1)^2 + (6-2)^2 + (3-3)^2) = sqrt(9+16) = 5
      const result = analyzeDatumAlignment(parent, child);
      expect(result.distance).toBeCloseTo(5);
    });

    it('general alignment still has correct distance', () => {
      const parent = worldPose({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
      const child = worldPose({ x: 3, y: 4, z: 0 }, { x: 1, y: 0, z: 0 });
      const result = analyzeDatumAlignment(parent, child);
      expect(result.distance).toBeCloseTo(5);
    });

    it('coincident alignment has near-zero distance', () => {
      const parent = worldPose({ x: 7, y: 8, z: 9 }, { x: 0, y: 0, z: 1 });
      const child = worldPose({ x: 7, y: 8, z: 9 }, { x: 0, y: 1, z: 0 });
      const result = analyzeDatumAlignment(parent, child);
      expect(result.distance).toBeLessThan(0.001);
    });
  });
});
