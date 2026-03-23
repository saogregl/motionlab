/**
 * STL file loader that produces MeshDataInput compatible with SceneGraphManager.addBody().
 *
 * Uses Three.js STLLoader to parse binary/ASCII STL files and extracts
 * vertex positions, normals, and face indices as typed arrays.
 */

import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { MeshDataInput } from '../scene-graph-three.js';

const loader = new STLLoader();

/**
 * Load an STL file from a URL and return MeshDataInput.
 *
 * STL files have no index buffer (every 3 vertices form a triangle),
 * so we generate a sequential index array.
 */
export async function loadSTL(url: string): Promise<MeshDataInput> {
  const geometry = await new Promise<ReturnType<STLLoader['parse']>>((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });

  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');

  const vertices = new Float32Array(positions.array);
  const normalData = normals
    ? new Float32Array(normals.array)
    : new Float32Array(vertices.length);

  // STL has no index buffer — generate sequential indices
  const vertexCount = vertices.length / 3;
  const indices = new Uint32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    indices[i] = i;
  }

  // If normals are missing or all-zero, they'll be recomputed by addBody()
  return { vertices, normals: normalData, indices };
}
