/**
 * Convert a quaternion to Euler angles in degrees (intrinsic ZYX convention).
 * Returns { x: roll, y: pitch, z: yaw } in degrees.
 */
export function quatToEulerDeg(q: {
  x: number;
  y: number;
  z: number;
  w: number;
}): { x: number; y: number; z: number } {
  const sinr_cosp = 2 * (q.w * q.x + q.y * q.z);
  const cosr_cosp = 1 - 2 * (q.x * q.x + q.y * q.y);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);

  const sinp = 2 * (q.w * q.y - q.z * q.x);
  const pitch = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp);

  const siny_cosp = 2 * (q.w * q.z + q.x * q.y);
  const cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);

  const RAD2DEG = 180 / Math.PI;
  return { x: roll * RAD2DEG, y: pitch * RAD2DEG, z: yaw * RAD2DEG };
}
