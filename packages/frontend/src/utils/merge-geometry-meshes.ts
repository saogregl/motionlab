import type { MeshData } from '../stores/mechanism.js';

interface GeometryMeshInput {
  meshData: MeshData;
  partIndex?: Uint32Array;
}

const EMPTY_MESH: MeshData = {
  vertices: new Float32Array(0),
  indices: new Uint32Array(0),
  normals: new Float32Array(0),
};

/**
 * Merges multiple geometry meshes into a single mesh suitable for
 * SceneGraphManager.addBody(). Single-geometry bodies (the common case)
 * are a zero-cost pass-through.
 *
 * Deprecated for face-aware workflows. The viewport now renders one child mesh
 * per geometry and uses geometry-local topology for picking.
 *
 * If this helper is still used for legacy rendering paths, `partIndex`
 * preserves BodyGeometryIndex semantics: each entry is the triangle count for
 * one face, and multi-geometry merges concatenate those face ranges without
 * rebasing them into synthetic face ids.
 */
export function mergeGeometryMeshes(geometries: GeometryMeshInput[]): {
  meshData: MeshData;
  partIndex?: Uint32Array;
} {
  if (geometries.length === 0) {
    return { meshData: EMPTY_MESH };
  }

  if (geometries.length === 1) {
    return { meshData: geometries[0].meshData, partIndex: geometries[0].partIndex };
  }

  // Multi-geometry merge
  let totalVertexFloats = 0;
  let totalIndices = 0;
  let totalPartEntries = 0;
  let hasAnyPartIndex = false;

  for (const g of geometries) {
    totalVertexFloats += g.meshData.vertices.length;
    totalIndices += g.meshData.indices.length;
    const triCount = g.meshData.indices.length / 3;
    totalPartEntries += g.partIndex ? g.partIndex.length : triCount;
    if (g.partIndex) hasAnyPartIndex = true;
  }

  const mergedVertices = new Float32Array(totalVertexFloats);
  const mergedNormals = new Float32Array(totalVertexFloats);
  const mergedIndices = new Uint32Array(totalIndices);
  const mergedPartIndex = hasAnyPartIndex ? new Uint32Array(totalPartEntries) : undefined;

  let vertexOffset = 0;
  let indexOffset = 0;
  let partIndexOffset = 0;

  for (const g of geometries) {
    mergedVertices.set(g.meshData.vertices, vertexOffset);
    mergedNormals.set(g.meshData.normals, vertexOffset);

    // Offset indices by vertex count so far
    const baseVertex = vertexOffset / 3;
    for (let i = 0; i < g.meshData.indices.length; i++) {
      mergedIndices[indexOffset + i] = g.meshData.indices[i] + baseVertex;
    }

    // Merge partIndex
    if (mergedPartIndex) {
      if (g.partIndex) {
        for (let i = 0; i < g.partIndex.length; i++) {
          mergedPartIndex[partIndexOffset + i] = g.partIndex[i];
        }
        partIndexOffset += g.partIndex.length;
      } else {
        // No partIndex — treat each triangle as its own face.
        const triCount = g.meshData.indices.length / 3;
        for (let i = 0; i < triCount; i++) {
          mergedPartIndex[partIndexOffset + i] = 1;
        }
        partIndexOffset += triCount;
      }
    }

    vertexOffset += g.meshData.vertices.length;
    indexOffset += g.meshData.indices.length;
  }

  return {
    meshData: { vertices: mergedVertices, indices: mergedIndices, normals: mergedNormals },
    partIndex: mergedPartIndex,
  };
}
