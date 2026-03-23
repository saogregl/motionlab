import type { BodyPose, JointTypeId } from '../stores/mechanism.js';

export type AlignmentKind = 'coaxial' | 'coplanar' | 'coincident' | 'general';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface DatumAlignment {
  kind: AlignmentKind;
  recommendedTypes: JointTypeId[];
  /** Shared axis direction (world frame) for coaxial, or plane normal for coplanar. */
  axis?: Vec3;
  /** Distance between datum origins in world frame. */
  distance: number;
}

export interface DatumWorldPose {
  position: Vec3;
  zAxis: Vec3;
}

// --- Quaternion math helpers ---

function quaternionMultiply(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function rotateVector(v: Vec3, q: Quat): Vec3 {
  // q * [0, v] * q_conj — expanded to avoid temporary allocations
  const qx = q.x,
    qy = q.y,
    qz = q.z,
    qw = q.w;
  const vx = v.x,
    vy = v.y,
    vz = v.z;

  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);

  return {
    x: vx + qw * tx + (qy * tz - qz * ty),
    y: vy + qw * ty + (qz * tx - qx * tz),
    z: vz + qw * tz + (qx * ty - qy * tx),
  };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function magnitude(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function normalize(v: Vec3): Vec3 {
  const len = magnitude(v);
  if (len < 1e-10) return { x: 0, y: 0, z: 1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function averageAxis(a: Vec3, b: Vec3): Vec3 {
  // Average the two axes, handling anti-parallel case
  const d = dot(a, b);
  const sign = d >= 0 ? 1 : -1;
  return normalize({
    x: a.x + sign * b.x,
    y: a.y + sign * b.y,
    z: a.z + sign * b.z,
  });
}

// --- Thresholds ---

/** Z-axes are considered parallel if |dot| > this (< ~2.5 degree deviation). */
const PARALLEL_THRESHOLD = 0.999;

/** Origins are considered coincident if distance < this (1mm). */
const COINCIDENT_THRESHOLD = 0.001;

/** Origins are considered coplanar if offset projection onto Z < this. */
const COPLANAR_THRESHOLD = 0.001;

// --- Public API ---

/**
 * Compute the world-frame pose of a datum from its body's world pose and the datum's local pose.
 *
 * World position = body.position + rotate(datum.localPosition, body.rotation)
 * World Z-axis = rotate([0,0,1], body.rotation * datum.localRotation)
 */
export function computeDatumWorldPose(bodyPose: BodyPose, datumLocalPose: BodyPose): DatumWorldPose {
  const bodyQ = bodyPose.rotation;
  const datumQ = datumLocalPose.rotation;

  // World position
  const rotatedLocal = rotateVector(datumLocalPose.position, bodyQ);
  const position: Vec3 = {
    x: bodyPose.position.x + rotatedLocal.x,
    y: bodyPose.position.y + rotatedLocal.y,
    z: bodyPose.position.z + rotatedLocal.z,
  };

  // World Z-axis = rotate([0,0,1], composed quaternion)
  const composedQ = quaternionMultiply(bodyQ, datumQ);
  const zAxis = rotateVector({ x: 0, y: 0, z: 1 }, composedQ);

  return { position, zAxis };
}

/**
 * Analyze the geometric relationship between two datums to recommend joint types.
 *
 * Classification:
 * - Coincident: origins within 1mm → Spherical, Revolute, Fixed
 * - Coaxial: Z-axes parallel (dot > 0.999), origins not coincident → Revolute, Cylindrical, Prismatic
 * - Coplanar: Z-axes parallel and origins in same plane perpendicular to Z → Planar, Fixed
 * - General: none of the above → all types
 */
export function analyzeDatumAlignment(
  parentWorldPose: DatumWorldPose,
  childWorldPose: DatumWorldPose,
): DatumAlignment {
  const offset = subtract(childWorldPose.position, parentWorldPose.position);
  const distance = magnitude(offset);

  const zDot = dot(parentWorldPose.zAxis, childWorldPose.zAxis);
  const isParallel = Math.abs(zDot) > PARALLEL_THRESHOLD;
  const isCoincident = distance < COINCIDENT_THRESHOLD;

  // Check coincident first (strongest constraint)
  if (isCoincident) {
    return {
      kind: 'coincident',
      recommendedTypes: ['spherical', 'revolute', 'fixed'],
      distance,
    };
  }

  if (isParallel) {
    // Check if origins lie in a plane perpendicular to the shared Z-axis
    const projectionOntoZ = Math.abs(dot(offset, parentWorldPose.zAxis));

    if (projectionOntoZ < COPLANAR_THRESHOLD) {
      return {
        kind: 'coplanar',
        recommendedTypes: ['planar', 'fixed'],
        axis: averageAxis(parentWorldPose.zAxis, childWorldPose.zAxis),
        distance,
      };
    }

    return {
      kind: 'coaxial',
      recommendedTypes: ['revolute', 'cylindrical', 'prismatic'],
      axis: averageAxis(parentWorldPose.zAxis, childWorldPose.zAxis),
      distance,
    };
  }

  return {
    kind: 'general',
    recommendedTypes: ['fixed', 'revolute', 'prismatic', 'spherical', 'cylindrical', 'planar'],
    distance,
  };
}
