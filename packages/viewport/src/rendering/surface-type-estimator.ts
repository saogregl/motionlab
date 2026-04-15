/**
 * Pure-function surface type estimation from triangle normals.
 *
 * No Babylon.js dependency — operates on raw Float32Array / Uint32Array
 * data extracted from mesh geometry buffers.
 */

export type DatumPreviewType = 'plane' | 'axis' | 'point';

/** Threshold for planar classification: ~5 degrees. */
const PLANE_THRESHOLD_RAD = 0.087;

/** Threshold for cylindrical cross-product parallelism: ~10 degrees. */
const CYLINDER_THRESHOLD_RAD = 0.175;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeVec3(out: [number, number, number]): [number, number, number] {
  const len = Math.sqrt(out[0] * out[0] + out[1] * out[1] + out[2] * out[2]);
  if (len < 1e-12) return [0, 0, 0];
  out[0] /= len;
  out[1] /= len;
  out[2] /= len;
  return out;
}

function dot3(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function vecLength(v: [number, number, number]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

/**
 * Read the normal for a given vertex index from the flat normals array.
 */
function readNormal(normals: Float32Array, vertexIndex: number): [number, number, number] {
  const base = vertexIndex * 3;
  return [normals[base], normals[base + 1], normals[base + 2]];
}

/**
 * Collect all per-vertex normals for triangles within a face range.
 * Returns an array of normalized normal vectors, one per vertex.
 */
function collectFaceNormals(
  normals: Float32Array,
  indices: Uint32Array,
  faceRange: { start: number; count: number },
): [number, number, number][] {
  const result: [number, number, number][] = [];
  for (let i = 0; i < faceRange.count; i++) {
    const triIndex = faceRange.start + i;
    for (let v = 0; v < 3; v++) {
      const vertexIndex = indices[triIndex * 3 + v];
      const n = readNormal(normals, vertexIndex);
      normalizeVec3(n);
      result.push(n);
    }
  }
  return result;
}

/**
 * Compute the average normal from an array of normal vectors.
 * Returns a normalized average, or [0,0,0] if degenerate.
 */
function averageNormal(faceNormals: [number, number, number][]): [number, number, number] {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const n of faceNormals) {
    sx += n[0];
    sy += n[1];
    sz += n[2];
  }
  const avg: [number, number, number] = [sx, sy, sz];
  return normalizeVec3(avg);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Estimate whether a mesh face is planar, cylindrical, or general (spherical / freeform).
 *
 * Algorithm:
 * 1. Collect all vertex normals within the face range.
 * 2. Compute average normal; measure max angular deviation.
 * 3. If deviation < ~5 deg  -> plane.
 * 4. Otherwise check cross-product parallelism -> axis (cylinder).
 * 5. Fallback -> point.
 */
export function estimateSurfaceType(
  normals: Float32Array,
  indices: Uint32Array,
  faceRange: { start: number; count: number },
): DatumPreviewType {
  // Safety: degenerate / empty face
  if (faceRange.count <= 0) return 'plane';

  const faceNormals = collectFaceNormals(normals, indices, faceRange);
  if (faceNormals.length === 0) return 'plane';

  const avg = averageNormal(faceNormals);
  const avgIsDegenerate = vecLength(avg) < 1e-4;

  // Step 3: max angular deviation from average (only meaningful when avg is valid)
  if (!avgIsDegenerate) {
    let maxDev = 0;
    for (const n of faceNormals) {
      const d = Math.max(-1, Math.min(1, dot3(n, avg)));
      const angle = Math.acos(d);
      if (angle > maxDev) maxDev = angle;
    }

    // Step 4 & 7: planar if deviation is small
    if (maxDev < PLANE_THRESHOLD_RAD) return 'plane';
  }

  // Step 5: cylindrical test — sample cross products of normals from
  // *different* triangles (not adjacent vertices within the same triangle,
  // which tend to be nearly parallel and yield degenerate cross products).
  // Use one representative normal per triangle (first vertex).
  const triNormals: [number, number, number][] = [];
  for (let i = 0; i < faceRange.count; i++) {
    const triIndex = faceRange.start + i;
    const vertexIndex = indices[triIndex * 3];
    const n = readNormal(normals, vertexIndex);
    triNormals.push(normalizeVec3(n));
  }

  const crossProducts: [number, number, number][] = [];
  for (let i = 0; i + 1 < triNormals.length; i++) {
    const cp = cross3(triNormals[i], triNormals[i + 1]);
    if (vecLength(cp) > 1e-8) {
      crossProducts.push(normalizeVec3(cp));
    }
  }

  if (crossProducts.length >= 2) {
    const ref = crossProducts[0];
    let isCylindrical = true;
    for (let i = 1; i < crossProducts.length; i++) {
      let cp = crossProducts[i];
      // Ensure sign consistency
      if (dot3(cp, ref) < 0) {
        cp = [-cp[0], -cp[1], -cp[2]];
      }
      const d = Math.max(-1, Math.min(1, dot3(cp, ref)));
      const angle = Math.acos(d);
      if (angle > CYLINDER_THRESHOLD_RAD) {
        isCylindrical = false;
        break;
      }
    }
    if (isCylindrical) return 'axis';
  }

  // Step 6: conservative fallback
  return 'point';
}

/**
 * Estimate the axis direction for a cylindrical face.
 *
 * Computes cross products of pairs of normals, averages them with
 * sign consistency, normalizes, and returns the axis direction.
 *
 * Returns `null` for planar faces or when cross products are degenerate.
 */
export function estimateAxisDirection(
  normals: Float32Array,
  indices: Uint32Array,
  faceRange: { start: number; count: number },
): [number, number, number] | null {
  if (faceRange.count <= 0) return null;

  const faceNormals = collectFaceNormals(normals, indices, faceRange);
  if (faceNormals.length < 2) return null;

  // Check planarity first — axis direction is meaningless for flat faces.
  // A degenerate average (near-zero) means normals cancel out — the face
  // wraps around (cylinder/sphere) so it is definitely not planar.
  const avg = averageNormal(faceNormals);
  const avgIsDegenerate = vecLength(avg) < 1e-4;

  if (!avgIsDegenerate) {
    let maxDev = 0;
    for (const n of faceNormals) {
      const d = Math.max(-1, Math.min(1, dot3(n, avg)));
      maxDev = Math.max(maxDev, Math.acos(d));
    }
    if (maxDev < PLANE_THRESHOLD_RAD) return null;
  }

  // Compute cross products of normals from different triangles
  // (one representative per triangle — first vertex)
  const triNormals: [number, number, number][] = [];
  for (let i = 0; i < faceRange.count; i++) {
    const triIndex = faceRange.start + i;
    const vertexIndex = indices[triIndex * 3];
    const n = readNormal(normals, vertexIndex);
    triNormals.push(normalizeVec3(n));
  }

  const crossProducts: [number, number, number][] = [];
  for (let i = 0; i + 1 < triNormals.length; i++) {
    const cp = cross3(triNormals[i], triNormals[i + 1]);
    if (vecLength(cp) > 1e-8) {
      crossProducts.push(normalizeVec3(cp));
    }
  }

  if (crossProducts.length === 0) return null;

  // Average with sign consistency relative to the first cross product
  const ref = crossProducts[0];
  let sx = ref[0];
  let sy = ref[1];
  let sz = ref[2];

  for (let i = 1; i < crossProducts.length; i++) {
    let cp = crossProducts[i];
    if (dot3(cp, ref) < 0) {
      cp = [-cp[0], -cp[1], -cp[2]];
    }
    sx += cp[0];
    sy += cp[1];
    sz += cp[2];
  }

  const result: [number, number, number] = [sx, sy, sz];
  if (vecLength(result) < 1e-8) return null;

  return normalizeVec3(result);
}
