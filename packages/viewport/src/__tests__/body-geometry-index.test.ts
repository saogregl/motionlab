import { describe, expect, it } from 'vitest';

import { BodyGeometryIndex } from '../body-geometry-index.js';

describe('BodyGeometryIndex', () => {
  it('maps triangles to faces from partIndex', () => {
    const index = new BodyGeometryIndex([2, 1, 3]);

    expect(index.faceCount).toBe(3);
    expect(index.getFaceFromTriangle(0)).toBe(0);
    expect(index.getFaceFromTriangle(1)).toBe(0);
    expect(index.getFaceFromTriangle(2)).toBe(1);
    expect(index.getFaceFromTriangle(3)).toBe(2);
    expect(index.getFaceFromTriangle(5)).toBe(2);
  });

  it('returns -1 for out-of-range triangles', () => {
    const index = new BodyGeometryIndex([1, 1]);

    expect(index.getFaceFromTriangle(-1)).toBe(-1);
    expect(index.getFaceFromTriangle(2)).toBe(-1);
  });
});
