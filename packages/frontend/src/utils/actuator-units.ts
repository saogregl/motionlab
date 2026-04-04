import type { ActuatorTypeId, ControlModeId } from '../stores/mechanism.js';

/** Unit string for an actuator command value given its type and control mode. */
export function getActuatorUnit(actuatorType: ActuatorTypeId, controlMode: ControlModeId): string {
  const isRevolute = actuatorType === 'revolute-motor';
  switch (controlMode) {
    case 'position':
      return isRevolute ? 'rad' : 'm';
    case 'speed':
      return isRevolute ? 'rad/s' : 'm/s';
    case 'effort':
      return isRevolute ? 'Nm' : 'N';
  }
}

/** Unit string for an actuator effort limit. */
export function getEffortUnit(actuatorType: ActuatorTypeId): string {
  return actuatorType === 'revolute-motor' ? 'Nm' : 'N';
}
