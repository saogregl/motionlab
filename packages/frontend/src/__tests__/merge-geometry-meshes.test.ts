import { describe, expect, it } from 'vitest';
import { mergeGeometryMeshes } from '../utils/merge-geometry-meshes.js';

function makeGeomInput(vertCount: number, partValues?: number[]) {
  const vertices = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const indices = new Uint32Array(vertCount); // one triangle per 3 vertices
  for (let i = 0; i < vertCount; i++) {
    vertices[i * 3] = i;
    normals[i * 3 + 2] = 1;
    indices[i] = i;
  }
  return {
    meshData: { vertices, indices, normals },
    partIndex: partValues ? new Uint32Array(partValues) : undefined,
  };
}

describe('mergeGeometryMeshes', () => {
  it('returns empty mesh for empty array', () => {
    const result = mergeGeometryMeshes([]);
    expect(result.meshData.vertices.length).toBe(0);
    expect(result.meshData.indices.length).toBe(0);
    expect(result.meshData.normals.length).toBe(0);
    expect(result.partIndex).toBeUndefined();
  });

  it('passes through single geometry', () => {
    const input = makeGeomInput(3, [1]);
    const result = mergeGeometryMeshes([input]);
    expect(result.meshData).toBe(input.meshData); // same reference
    expect(result.partIndex).toBe(input.partIndex);
  });

  it('merges two geometries with correct vertex count', () => {
    const g1 = makeGeomInput(3);
    const g2 = makeGeomInput(6);
    const result = mergeGeometryMeshes([g1, g2]);
    expect(result.meshData.vertices.length).toBe(9 + 18); // 3*3 + 6*3
    expect(result.meshData.normals.length).toBe(9 + 18);
    expect(result.meshData.indices.length).toBe(3 + 6);
  });

  it('offsets indices correctly', () => {
    const g1 = {
      meshData: {
        vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        indices: new Uint32Array([0, 1, 2]),
        normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      },
    };
    const g2 = {
      meshData: {
        vertices: new Float32Array([2, 0, 0, 3, 0, 0, 2, 1, 0]),
        indices: new Uint32Array([0, 1, 2]),
        normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      },
    };
    const result = mergeGeometryMeshes([g1, g2]);
    // Second geometry indices should be offset by 3 (first geometry's vertex count)
    expect(result.meshData.indices[3]).toBe(3); // 0 + 3
    expect(result.meshData.indices[4]).toBe(4); // 1 + 3
    expect(result.meshData.indices[5]).toBe(5); // 2 + 3
  });

  it('concatenates face triangle counts across geometries', () => {
    const g1 = {
      meshData: {
        vertices: new Float32Array(9),
        indices: new Uint32Array([0, 1, 2]),
        normals: new Float32Array(9),
      },
      partIndex: new Uint32Array([1]),
    };
    const g2 = {
      meshData: {
        vertices: new Float32Array(18),
        indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
        normals: new Float32Array(18),
      },
      partIndex: new Uint32Array([2]),
    };
    const result = mergeGeometryMeshes([g1, g2]);
    expect(result.partIndex).toEqual(new Uint32Array([1, 2]));
  });

  it('falls back to one triangle per face when topology metadata is missing', () => {
    const g1 = {
      meshData: {
        vertices: new Float32Array(9),
        indices: new Uint32Array([0, 1, 2]),
        normals: new Float32Array(9),
      },
      partIndex: new Uint32Array([1]),
    };
    const g2 = {
      meshData: {
        vertices: new Float32Array(18),
        indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
        normals: new Float32Array(18),
      },
    };
    const result = mergeGeometryMeshes([g1, g2]);
    expect(result.partIndex).toEqual(new Uint32Array([1, 1, 1]));
  });
});
