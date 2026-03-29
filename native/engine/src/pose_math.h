#pragma once

/**
 * Rigid-body pose composition and inverse utilities.
 *
 * Quaternion convention: [w, x, y, z] as double[4].
 * Position: [x, y, z] as double[3].
 */

namespace motionlab::engine {

/** Rotate a vector by a unit quaternion: q * v * q^(-1). */
inline void quat_rotate_vec3(const double q[4], const double v[3], double out[3]) {
    // Optimised form: result = v + 2 * cross(q.xyz, cross(q.xyz, v) + q.w * v)
    // q = [w, x, y, z]
    double w = q[0], x = q[1], y = q[2], z = q[3];
    double cx = y * v[2] - z * v[1] + w * v[0];
    double cy = z * v[0] - x * v[2] + w * v[1];
    double cz = x * v[1] - y * v[0] + w * v[2];
    out[0] = v[0] + 2.0 * (y * cz - z * cy);
    out[1] = v[1] + 2.0 * (z * cx - x * cz);
    out[2] = v[2] + 2.0 * (x * cy - y * cx);
}

/** Hamilton product of two quaternions: out = a * b. */
inline void quat_multiply(const double a[4], const double b[4], double out[4]) {
    // a, b = [w, x, y, z]
    out[0] = a[0]*b[0] - a[1]*b[1] - a[2]*b[2] - a[3]*b[3];  // w
    out[1] = a[0]*b[1] + a[1]*b[0] + a[2]*b[3] - a[3]*b[2];  // x
    out[2] = a[0]*b[2] - a[1]*b[3] + a[2]*b[0] + a[3]*b[1];  // y
    out[3] = a[0]*b[3] + a[1]*b[2] - a[2]*b[1] + a[3]*b[0];  // z
}

/**
 * Compose two rigid-body poses: child_world = parent * local.
 *
 * out_pos = parent_pos + parent_orient * local_pos
 * out_orient = parent_orient * local_orient
 */
inline void compose_pose(const double parent_pos[3], const double parent_orient[4],
                          const double local_pos[3], const double local_orient[4],
                          double out_pos[3], double out_orient[4]) {
    double rotated[3];
    quat_rotate_vec3(parent_orient, local_pos, rotated);
    out_pos[0] = parent_pos[0] + rotated[0];
    out_pos[1] = parent_pos[1] + rotated[1];
    out_pos[2] = parent_pos[2] + rotated[2];
    quat_multiply(parent_orient, local_orient, out_orient);
}

/**
 * Compute the inverse of a rigid-body pose.
 *
 * inv_orient = conjugate(orient)   (unit quaternion inverse = conjugate)
 * inv_pos    = inv_orient * (-pos)
 */
inline void inverse_pose(const double pos[3], const double orient[4],
                          double out_pos[3], double out_orient[4]) {
    // Conjugate: negate xyz, keep w
    out_orient[0] =  orient[0];
    out_orient[1] = -orient[1];
    out_orient[2] = -orient[2];
    out_orient[3] = -orient[3];
    double neg_pos[3] = {-pos[0], -pos[1], -pos[2]};
    quat_rotate_vec3(out_orient, neg_pos, out_pos);
}

/**
 * Extract position and orientation arrays from a protobuf Pose message.
 * If the pose has no position/orientation, defaults to identity.
 */
template <typename PoseT>
inline void extract_pose_arrays(const PoseT& pose, double pos[3], double orient[4]) {
    if (pose.has_position()) {
        pos[0] = pose.position().x();
        pos[1] = pose.position().y();
        pos[2] = pose.position().z();
    } else {
        pos[0] = pos[1] = pos[2] = 0.0;
    }
    if (pose.has_orientation()) {
        orient[0] = pose.orientation().w();
        orient[1] = pose.orientation().x();
        orient[2] = pose.orientation().y();
        orient[3] = pose.orientation().z();
    } else {
        orient[0] = 1.0;
        orient[1] = orient[2] = orient[3] = 0.0;
    }
}

} // namespace motionlab::engine
