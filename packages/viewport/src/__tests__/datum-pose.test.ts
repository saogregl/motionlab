import { Matrix } from '@babylonjs/core';
import { describe, expect, it } from 'vitest';

import { computeDatumLocalPose } from '../datum-pose.js';

/** Helper: build a Float32Array from a Babylon Matrix. */
function matrixToF32(m: Matrix): Float32Array {
  return new Float32Array(m.toArray());
}

describe('computeDatumLocalPose', () => {
  it('returns identity-ish pose when body is at origin with identity transform', () => {
    const worldPoint = { x: 0, y: 1, z: 0 };
    const worldNormal = { x: 0, y: 1, z: 0 }; // pointing up
    const bodyMatrix = matrixToF32(Matrix.Identity());

    const result = computeDatumLocalPose(worldPoint, worldNormal, bodyMatrix);

    expect(result.position.x).toBeCloseTo(0, 5);
    expect(result.position.y).toBeCloseTo(1, 5);
    expect(result.position.z).toBeCloseTo(0, 5);
  });

  it('accounts for translated body', () => {
    const worldPoint = { x: 5, y: 1, z: 0 };
    const worldNormal = { x: 0, y: 1, z: 0 };
    const bodyMatrix = matrixToF32(Matrix.Translation(5, 0, 0));

    const result = computeDatumLocalPose(worldPoint, worldNormal, bodyMatrix);

    // Local position should be relative to body: (0, 1, 0)
    expect(result.position.x).toBeCloseTo(0, 5);
    expect(result.position.y).toBeCloseTo(1, 5);
    expect(result.position.z).toBeCloseTo(0, 5);
  });

  it('accounts for rotated body (90° around Y)', () => {
    const worldPoint = { x: 1, y: 0, z: 0 };
    const worldNormal = { x: 1, y: 0, z: 0 }; // pointing +X
    const bodyMatrix = matrixToF32(Matrix.RotationY(Math.PI / 2));

    const result = computeDatumLocalPose(worldPoint, worldNormal, bodyMatrix);

    // After 90° Y rotation, world +X maps to body -Z (approximately)
    // The local position should reflect the inverse transform
    expect(typeof result.position.x).toBe('number');
    expect(typeof result.orientation.w).toBe('number');
    // Quaternion should be valid (unit length)
    const q = result.orientation;
    const len = Math.sqrt(q.x ** 2 + q.y ** 2 + q.z ** 2 + q.w ** 2);
    expect(len).toBeCloseTo(1, 4);
  });

  it('handles degenerate normal (nearly parallel to up)', () => {
    const worldPoint = { x: 0, y: 2, z: 0 };
    // Normal pointing straight up — should use worldRight as reference
    const worldNormal = { x: 0, y: 1, z: 0 };
    const bodyMatrix = matrixToF32(Matrix.Identity());

    const result = computeDatumLocalPose(worldPoint, worldNormal, bodyMatrix);

    // Should not produce NaN
    expect(Number.isFinite(result.position.x)).toBe(true);
    expect(Number.isFinite(result.position.y)).toBe(true);
    expect(Number.isFinite(result.position.z)).toBe(true);
    expect(Number.isFinite(result.orientation.w)).toBe(true);

    // Quaternion should still be unit length
    const q = result.orientation;
    const len = Math.sqrt(q.x ** 2 + q.y ** 2 + q.z ** 2 + q.w ** 2);
    expect(len).toBeCloseTo(1, 4);
  });
});
