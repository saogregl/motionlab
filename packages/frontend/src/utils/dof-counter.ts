import { DOF_TABLE } from '@motionlab/viewport';

import type { JointTypeId } from '../stores/mechanism.js';

export interface MechanismDofResult {
  /** Gruebler DOF: 6 * movingBodies - totalConstraints */
  dof: number;
  /** True when dof < 0 (over-constrained / redundant joints) */
  overConstrained: boolean;
}

/**
 * Compute mechanism degrees of freedom via Gruebler's equation (spatial):
 *
 *   DOF = 6 * N_moving - Σ(6 - joint_dof_i)
 *
 * where N_moving = number of bodies excluding ground (ground is implicit
 * in the mechanism store, not counted in bodies.size).
 *
 * Each joint removes (6 - joint_dof) constraints from the system.
 *
 * Notes:
 * - Gruebler's equation is a necessary condition for mobility, not sufficient.
 *   Some mechanisms with Gruebler DOF < 0 are physically valid (intentionally
 *   redundant constraints). The result is informational, not a gate.
 * - Ground body is always implicit (not in the mechanism store).
 */
export function computeMechanismDof(
  movingBodyCount: number,
  joints: Iterable<{ type: JointTypeId }>,
): MechanismDofResult {
  let totalConstraints = 0;

  for (const joint of joints) {
    const jointDof = DOF_TABLE[joint.type]?.total ?? 0;
    totalConstraints += 6 - jointDof;
  }

  const dof = 6 * movingBodyCount - totalConstraints;

  return {
    dof,
    overConstrained: dof < 0,
  };
}
