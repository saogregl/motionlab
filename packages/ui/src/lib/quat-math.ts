/**
 * Convert a quaternion to Euler angles in degrees (intrinsic ZYX convention).
 * Returns { x: roll, y: pitch, z: yaw } in degrees.
 */
export function quatToEulerDeg(q: { x: number; y: number; z: number; w: number }): {
  x: number;
  y: number;
  z: number;
} {
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

/**
 * Convert Euler angles in degrees to a quaternion (intrinsic ZYX convention).
 * Inverse of `quatToEulerDeg` — round-tripping is consistent.
 */
export function eulerDegToQuat(euler: { x: number; y: number; z: number }): {
  x: number;
  y: number;
  z: number;
  w: number;
} {
  const DEG2RAD = Math.PI / 180;
  const halfRoll = (euler.x * DEG2RAD) / 2;
  const halfPitch = (euler.y * DEG2RAD) / 2;
  const halfYaw = (euler.z * DEG2RAD) / 2;

  const cr = Math.cos(halfRoll);
  const sr = Math.sin(halfRoll);
  const cp = Math.cos(halfPitch);
  const sp = Math.sin(halfPitch);
  const cy = Math.cos(halfYaw);
  const sy = Math.sin(halfYaw);

  return {
    w: cr * cp * cy + sr * sp * sy,
    x: sr * cp * cy - cr * sp * sy,
    y: cr * sp * cy + sr * cp * sy,
    z: cr * cp * sy - sr * sp * cy,
  };
}

/**
 * Returns true when the quaternion is near gimbal lock (pitch ≈ ±90°).
 * At gimbal lock, roll (X) and yaw (Z) are coupled and euler angles
 * become degenerate — edits to X look identical to edits to Z.
 */
export function isNearGimbalLock(
  q: { x: number; y: number; z: number; w: number },
  thresholdDeg = 1,
): boolean {
  const sinp = 2 * (q.w * q.y - q.z * q.x);
  return Math.abs(sinp) > Math.cos((thresholdDeg * Math.PI) / 180);
}
