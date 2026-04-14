import { describe, expect, it } from 'vitest';

import { estimateAxisDirection, estimateSurfaceType } from '../rendering/surface-type-estimator.js';

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

/**
 * Build a flat normals array and sequential indices for N triangles
 * where every vertex has the same normal.
 */
function buildPlanarData(
  normal: [number, number, number],
  triCount: number,
): { normals: Float32Array; indices: Uint32Array } {
  const vertexCount = triCount * 3;
  const normals = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    normals[i * 3] = normal[0];
    normals[i * 3 + 1] = normal[1];
    normals[i * 3 + 2] = normal[2];
    indices[i] = i;
  }
  return { normals, indices };
}

/**
 * Build cylindrical face data: normals perpendicular to the Y axis,
 * rotating around it at regular angular intervals.
 * Each triangle gets 3 vertices with normals at slightly different angles
 * to simulate a tessellated cylinder.
 */
function buildCylindricalData(triCount: number): {
  normals: Float32Array;
  indices: Uint32Array;
} {
  const vertexCount = triCount * 3;
  const normals = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(vertexCount);
  const angleStep = (2 * Math.PI) / vertexCount;

  for (let i = 0; i < vertexCount; i++) {
    const theta = i * angleStep;
    normals[i * 3] = Math.cos(theta);
    normals[i * 3 + 1] = 0;
    normals[i * 3 + 2] = Math.sin(theta);
    indices[i] = i;
  }
  return { normals, indices };
}

/**
 * Build spherical face data: normals radiating outward in many directions.
 */
function buildSphericalData(): {
  normals: Float32Array;
  indices: Uint32Array;
} {
  // Use 8 triangles (24 vertices) with normals pointing in diverse directions
  const directions: [number, number, number][] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [-1, 0, 0],
    [0, -1, 0],
    [0, 0, -1],
    [0.707, 0.707, 0],
    [-0.707, 0, 0.707],
    [0, 0.707, -0.707],
    [0.577, 0.577, 0.577],
    [-0.577, 0.577, -0.577],
    [0.577, -0.577, 0.577],
    // Repeat to fill remaining vertices for 8 triangles (24 vertices)
    [0.707, -0.707, 0],
    [-0.707, 0.707, 0],
    [0, -0.707, 0.707],
    [0.33, 0.33, -0.88],
    [-0.33, -0.33, 0.88],
    [0.88, -0.33, 0.33],
    [0, 0.5, 0.866],
    [0.866, 0, -0.5],
    [-0.5, 0.866, 0],
    [0.5, -0.866, 0],
    [0, -0.5, -0.866],
    [-0.866, 0, 0.5],
  ];

  const vertexCount = directions.length;
  const normals = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(vertexCount);

  for (let i = 0; i < vertexCount; i++) {
    const d = directions[i];
    const len = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
    normals[i * 3] = d[0] / len;
    normals[i * 3 + 1] = d[1] / len;
    normals[i * 3 + 2] = d[2] / len;
    indices[i] = i;
  }

  return { normals, indices };
}

// ---------------------------------------------------------------------------
// estimateSurfaceType
// ---------------------------------------------------------------------------

describe('estimateSurfaceType', () => {
  it('classifies a flat face (all normals identical, pointing up) as plane', () => {
    const { normals, indices } = buildPlanarData([0, 1, 0], 10);
    const result = estimateSurfaceType(normals, indices, { start: 0, count: 10 });
    expect(result).toBe('plane');
  });

  it('classifies a cylindrical face as axis', () => {
    const { normals, indices } = buildCylindricalData(12);
    const result = estimateSurfaceType(normals, indices, { start: 0, count: 12 });
    expect(result).toBe('axis');
  });

  it('classifies a spherical face as point', () => {
    const { normals, indices } = buildSphericalData();
    // 24 vertices = 8 triangles
    const result = estimateSurfaceType(normals, indices, { start: 0, count: 8 });
    expect(result).toBe('point');
  });

  it('returns plane for a single-triangle face (low-confidence fallback)', () => {
    const { normals, indices } = buildPlanarData([0, 1, 0], 1);
    const result = estimateSurfaceType(normals, indices, { start: 0, count: 1 });
    expect(result).toBe('plane');
  });

  it('returns plane for an empty face range (count = 0)', () => {
    const normals = new Float32Array(0);
    const indices = new Uint32Array(0);
    const result = estimateSurfaceType(normals, indices, { start: 0, count: 0 });
    expect(result).toBe('plane');
  });

  it('classifies a face with a non-unit normal still as plane if all identical', () => {
    // Use non-unit normals — estimator should still normalize them
    const { normals, indices } = buildPlanarData([0, 5, 0], 6);
    const result = estimateSurfaceType(normals, indices, { start: 0, count: 6 });
    expect(result).toBe('plane');
  });

  it('respects faceRange offset', () => {
    // First 3 triangles are cylindrical, next 3 are planar
    const vertexCount = 18; // 6 triangles * 3 vertices
    const normals = new Float32Array(vertexCount * 3);
    const indices = new Uint32Array(vertexCount);

    // Cylindrical normals for triangles 0-2
    for (let i = 0; i < 9; i++) {
      const theta = (i / 9) * 2 * Math.PI;
      normals[i * 3] = Math.cos(theta);
      normals[i * 3 + 1] = 0;
      normals[i * 3 + 2] = Math.sin(theta);
      indices[i] = i;
    }
    // Planar normals for triangles 3-5
    for (let i = 9; i < 18; i++) {
      normals[i * 3] = 0;
      normals[i * 3 + 1] = 1;
      normals[i * 3 + 2] = 0;
      indices[i] = i;
    }

    const planarResult = estimateSurfaceType(normals, indices, { start: 3, count: 3 });
    expect(planarResult).toBe('plane');
  });
});

// ---------------------------------------------------------------------------
// estimateAxisDirection
// ---------------------------------------------------------------------------

describe('estimateAxisDirection', () => {
  it('returns approximately [0, 1, 0] for a cylinder along Y', () => {
    const { normals, indices } = buildCylindricalData(12);
    const result = estimateAxisDirection(normals, indices, { start: 0, count: 12 });

    expect(result).not.toBeNull();
    if (!result) return;

    // The axis should be approximately along Y (may be positive or negative)
    const absY = Math.abs(result[1]);
    expect(absY).toBeGreaterThan(0.9);
    // X and Z components should be near zero
    expect(Math.abs(result[0])).toBeLessThan(0.2);
    expect(Math.abs(result[2])).toBeLessThan(0.2);
  });

  it('returns null for a planar face', () => {
    const { normals, indices } = buildPlanarData([0, 1, 0], 10);
    const result = estimateAxisDirection(normals, indices, { start: 0, count: 10 });
    expect(result).toBeNull();
  });

  it('returns null for an empty face range', () => {
    const normals = new Float32Array(0);
    const indices = new Uint32Array(0);
    const result = estimateAxisDirection(normals, indices, { start: 0, count: 0 });
    expect(result).toBeNull();
  });

  it('returns a unit-length vector when non-null', () => {
    const { normals, indices } = buildCylindricalData(12);
    const result = estimateAxisDirection(normals, indices, { start: 0, count: 12 });

    expect(result).not.toBeNull();
    if (!result) return;

    const len = Math.sqrt(result[0] ** 2 + result[1] ** 2 + result[2] ** 2);
    expect(len).toBeCloseTo(1, 4);
  });
});
