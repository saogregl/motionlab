import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';

/**
 * Computes the local pose (position + orientation) for a datum placed on a
 * body surface.  All inputs/outputs are plain objects — no Babylon types leak
 * across package boundaries.
 *
 * The datum frame is constructed so that Z aligns with the surface normal.
 */
export function computeDatumLocalPose(
  worldPoint: { x: number; y: number; z: number },
  worldNormal: { x: number; y: number; z: number },
  bodyWorldMatrix: Float32Array,
): {
  position: { x: number; y: number; z: number };
  orientation: { x: number; y: number; z: number; w: number };
} {
  // Z-axis = normalized surface normal
  const z = Vector3.Normalize(new Vector3(worldNormal.x, worldNormal.y, worldNormal.z));

  // Choose a reference vector that isn't nearly parallel to Z
  const worldUp = new Vector3(0, 1, 0);
  const worldRight = new Vector3(1, 0, 0);
  const ref = Math.abs(Vector3.Dot(z, worldUp)) > 0.99 ? worldRight : worldUp;

  // X-axis = normalize(cross(ref, Z))
  const x = Vector3.Normalize(Vector3.Cross(ref, z));
  // Y-axis = cross(Z, X)
  const y = Vector3.Cross(z, x);

  // Build datum world matrix (column-major in Babylon)
  const datumWorld = Matrix.FromValues(
    x.x,
    x.y,
    x.z,
    0,
    y.x,
    y.y,
    y.z,
    0,
    z.x,
    z.y,
    z.z,
    0,
    worldPoint.x,
    worldPoint.y,
    worldPoint.z,
    1,
  );

  // bodyInverse * datumWorld → local matrix
  const bodyMat = Matrix.FromArray(bodyWorldMatrix);
  const bodyInverse = Matrix.Invert(bodyMat);
  const localMatrix = datumWorld.multiply(bodyInverse);

  // Decompose into position + quaternion
  const scale = new Vector3();
  const rotation = new Quaternion();
  const position = new Vector3();
  localMatrix.decompose(scale, rotation, position);

  return {
    position: { x: position.x, y: position.y, z: position.z },
    orientation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
  };
}
