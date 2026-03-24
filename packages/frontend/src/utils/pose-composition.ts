import type { BodyPose } from '../stores/mechanism.js';

/**
 * Compose a body world-frame pose with a child local-frame pose to get the
 * child's world-frame pose.
 *
 * world_pos = body_pos + body_rot * local_pos
 * world_rot = body_rot * local_rot
 */
export function composeWorldPose(bodyPose: BodyPose, localPose: BodyPose): BodyPose {
  // Rotate local position by body quaternion, then add body position
  const worldPos = quatRotateVec3(bodyPose.rotation, localPose.position);
  worldPos.x += bodyPose.position.x;
  worldPos.y += bodyPose.position.y;
  worldPos.z += bodyPose.position.z;

  // Compose rotations: body_rot * local_rot (Hamilton product)
  const worldRot = quatMultiply(bodyPose.rotation, localPose.rotation);

  return { position: worldPos, rotation: worldRot };
}

/** Rotate a vector by a unit quaternion: q * v * q^-1 */
function quatRotateVec3(
  q: { x: number; y: number; z: number; w: number },
  v: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  // Optimised form: result = v + 2 * cross(q.xyz, cross(q.xyz, v) + q.w * v)
  const cx = q.y * v.z - q.z * v.y + q.w * v.x;
  const cy = q.z * v.x - q.x * v.z + q.w * v.y;
  const cz = q.x * v.y - q.y * v.x + q.w * v.z;
  return {
    x: v.x + 2 * (q.y * cz - q.z * cy),
    y: v.y + 2 * (q.z * cx - q.x * cz),
    z: v.z + 2 * (q.x * cy - q.y * cx),
  };
}

/** Hamilton product of two quaternions (a * b). */
function quatMultiply(
  a: { x: number; y: number; z: number; w: number },
  b: { x: number; y: number; z: number; w: number },
): { x: number; y: number; z: number; w: number } {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}
