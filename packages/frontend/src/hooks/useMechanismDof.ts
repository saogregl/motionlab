import { useMemo } from 'react';

import { useMechanismStore } from '../stores/mechanism.js';
import { computeMechanismDof, type MechanismDofResult } from '../utils/dof-counter.js';

/**
 * Reactive hook returning the mechanism's Gruebler DOF.
 * Recalculates only when bodies or joints maps change (authoring actions).
 */
export function useMechanismDof(): MechanismDofResult {
  const bodies = useMechanismStore((s) => s.bodies);
  const joints = useMechanismStore((s) => s.joints);

  return useMemo(() => computeMechanismDof(bodies.size, joints.values()), [bodies, joints]);
}
