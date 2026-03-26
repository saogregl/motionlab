import { sendCreateJoint } from '../engine/connection.js';
import type { JointTypeId } from '../stores/mechanism.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import { useAuthoringStatusStore } from '../stores/authoring-status.js';
import { nextJointName } from './joint-naming.js';

/**
 * Commit a new joint creation: send the CreateJointCommand and reset the state
 * machine for chaining. Used by both the manual commit path (JointTypeSelectorPanel)
 * and the auto-commit path (connection.ts datum result handler).
 */
export function commitJointCreation(
  parentDatumId: string,
  childDatumId: string,
  jointType: JointTypeId,
): void {
  const joints = useMechanismStore.getState().joints;
  const name = nextJointName(joints);

  sendCreateJoint(parentDatumId, childDatumId, jointType, name, 0, 0);

  // Provide user feedback
  const parentDatum = useMechanismStore.getState().datums.get(parentDatumId);
  const childDatum = useMechanismStore.getState().datums.get(childDatumId);
  const parentBody = parentDatum
    ? useMechanismStore.getState().bodies.get(parentDatum.parentBodyId)
    : undefined;
  const childBody = childDatum
    ? useMechanismStore.getState().bodies.get(childDatum.parentBodyId)
    : undefined;
  const parentName = parentBody?.name ?? 'body';
  const childName = childBody?.name ?? 'body';
  const typeLabel = jointType.charAt(0).toUpperCase() + jointType.slice(1);
  useAuthoringStatusStore
    .getState()
    .setMessage(`Created ${typeLabel} joint between ${parentName} and ${childName}`);

  // Reset for chaining (pick next joint)
  useJointCreationStore.getState().reset();
}
