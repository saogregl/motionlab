import type { OcctBrepFace, OcctImportMesh } from 'occt-import-js';
import { describe, expect, it } from 'vitest';

import {
  brepFacesToPartIndex,
  convertOcctMesh,
  normalizeStepImportParams,
  resolveDefaultWasmBasePath,
} from '../loaders/step-loader.js';

describe('brepFacesToPartIndex', () => {
  it('converts brep_faces to triangle counts per face', () => {
    const faces: OcctBrepFace[] = [
      { first: 0, last: 9, color: null },
      { first: 10, last: 14, color: null },
      { first: 15, last: 22, color: null },
    ];
    const result = brepFacesToPartIndex(faces);
    expect(result).toEqual(new Uint32Array([10, 5, 8]));
  });

  it('handles single face', () => {
    const faces: OcctBrepFace[] = [{ first: 0, last: 99, color: null }];
    const result = brepFacesToPartIndex(faces);
    expect(result).toEqual(new Uint32Array([100]));
  });

  it('handles empty faces array', () => {
    const result = brepFacesToPartIndex([]);
    expect(result).toEqual(new Uint32Array([]));
    expect(result.length).toBe(0);
  });

  it('handles single-triangle faces', () => {
    const faces: OcctBrepFace[] = [
      { first: 0, last: 0, color: null },
      { first: 1, last: 1, color: null },
      { first: 2, last: 2, color: null },
    ];
    const result = brepFacesToPartIndex(faces);
    expect(result).toEqual(new Uint32Array([1, 1, 1]));
  });
});

describe('convertOcctMesh', () => {
  function makeMesh(opts: { triangleCount: number; brepFaces: OcctBrepFace[] }): OcctImportMesh {
    const vertexCount = opts.triangleCount * 3;
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < vertexCount; i++) {
      positions.push(i * 0.1, i * 0.2, i * 0.3);
      normals.push(0, 1, 0);
      indices.push(i);
    }

    return {
      name: 'test-mesh',
      color: [0.5, 0.5, 0.5],
      brep_faces: opts.brepFaces,
      attributes: {
        position: { array: positions },
        normal: { array: normals },
      },
      index: { array: indices },
    };
  }

  it('converts mesh data to Float32Array and Uint32Array', () => {
    const mesh = makeMesh({
      triangleCount: 6,
      brepFaces: [
        { first: 0, last: 2, color: null },
        { first: 3, last: 5, color: null },
      ],
    });

    const result = convertOcctMesh(mesh);

    expect(result.meshData.vertices).toBeInstanceOf(Float32Array);
    expect(result.meshData.normals).toBeInstanceOf(Float32Array);
    expect(result.meshData.indices).toBeInstanceOf(Uint32Array);
    expect(result.partIndex).toBeInstanceOf(Uint32Array);
  });

  it('produces correct partIndex from brep_faces', () => {
    const mesh = makeMesh({
      triangleCount: 12,
      brepFaces: [
        { first: 0, last: 1, color: null },
        { first: 2, last: 5, color: null },
        { first: 6, last: 11, color: null },
      ],
    });

    const result = convertOcctMesh(mesh);
    expect(result.partIndex).toEqual(new Uint32Array([2, 4, 6]));
  });

  it('preserves vertex count', () => {
    const mesh = makeMesh({
      triangleCount: 4,
      brepFaces: [{ first: 0, last: 3, color: null }],
    });

    const result = convertOcctMesh(mesh);
    expect(result.meshData.vertices.length).toBe(4 * 3 * 3); // 4 tris * 3 verts * 3 coords
    expect(result.meshData.normals.length).toBe(4 * 3 * 3);
    expect(result.meshData.indices.length).toBe(4 * 3); // 4 tris * 3 indices
  });

  it('partIndex sum equals triangle count', () => {
    const mesh = makeMesh({
      triangleCount: 20,
      brepFaces: [
        { first: 0, last: 7, color: null },
        { first: 8, last: 14, color: null },
        { first: 15, last: 19, color: null },
      ],
    });

    const result = convertOcctMesh(mesh);
    let sum = 0;
    for (const count of result.partIndex) {
      sum += count;
    }
    expect(sum).toBe(20);
  });
});

describe('normalizeStepImportParams', () => {
  it('defaults STEP story imports to meter output', () => {
    expect(normalizeStepImportParams()).toEqual({ linearUnit: 'meter' });
  });

  it('preserves explicit unit overrides', () => {
    expect(
      normalizeStepImportParams({
        linearUnit: 'inch',
        linearDeflectionType: 'absolute_value',
        linearDeflection: 0.01,
      }),
    ).toEqual({
      linearUnit: 'inch',
      linearDeflectionType: 'absolute_value',
      linearDeflection: 0.01,
    });
  });

  it('adds meter output when other triangulation params are provided', () => {
    expect(
      normalizeStepImportParams({
        angularDeflection: 0.5,
      }),
    ).toEqual({
      linearUnit: 'meter',
      angularDeflection: 0.5,
    });
  });
});

describe('resolveDefaultWasmBasePath', () => {
  it('uses absolute /occt-wasm path in dev', () => {
    expect(
      resolveDefaultWasmBasePath({
        isDev: true,
        moduleUrl: 'http://localhost:6008/src/loaders/step-loader.ts',
      }),
    ).toBe('/occt-wasm/');
  });

  it('uses module-relative path in production for file URLs', () => {
    const moduleUrl =
      'file:///C:/Program%20Files/MotionLab/resources/app/.vite/renderer/main_window/assets/step-loader-abc.js';

    expect(
      resolveDefaultWasmBasePath({
        isDev: false,
        moduleUrl,
      }),
    ).toBe(
      'file:///C:/Program%20Files/MotionLab/resources/app/.vite/renderer/main_window/occt-wasm/',
    );
  });
});
