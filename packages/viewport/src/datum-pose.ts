import { Matrix4, Quaternion, Vector3 } from 'three';

/**
 * Computes the local pose (position + orientation) for a datum placed on a
 * body surface.  All inputs/outputs are plain objects — no Three.js types leak
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
  const z = new Vector3(worldNormal.x, worldNormal.y, worldNormal.z).normalize();

  // Choose a reference vector that isn't nearly parallel to Z
  const worldUp = new Vector3(0, 1, 0);
  const worldRight = new Vector3(1, 0, 0);
  const ref = Math.abs(z.dot(worldUp)) > 0.99 ? worldRight : worldUp;

  // X-axis = normalize(cross(ref, Z))
  const x = new Vector3().crossVectors(ref, z).normalize();
  // Y-axis = cross(Z, X)
  const y = new Vector3().crossVectors(z, x);

  // Build datum world matrix (column-major — Three.js Matrix4 stores column-major)
  const datumWorld = new Matrix4().set(
    x.x,
    y.x,
    z.x,
    worldPoint.x,
    x.y,
    y.y,
    z.y,
    worldPoint.y,
    x.z,
    y.z,
    z.z,
    worldPoint.z,
    0,
    0,
    0,
    1,
  );

  // bodyInverse * datumWorld → local matrix
  const bodyMat = new Matrix4().fromArray(Array.from(bodyWorldMatrix));
  const bodyInverse = bodyMat.clone().invert();
  const localMatrix = bodyInverse.multiply(datumWorld);

  // Decompose into position + quaternion
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  localMatrix.decompose(position, rotation, scale);

  return {
    position: { x: position.x, y: position.y, z: position.z },
    orientation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
  };
}
