import type { JointTypeId, LoadTypeId } from '../stores/mechanism.js';

export interface JointCoordinateChannelIds {
  position: string;
  velocity: string;
}

export interface LoadChannelIds {
  vector?: string;
  length?: string;
  lengthRate?: string;
  force?: string;
}

export function getJointCoordinateChannelIds(
  jointId: string,
  jointType: JointTypeId,
): JointCoordinateChannelIds | null {
  switch (jointType) {
    case 'revolute':
      return {
        position: `joint/${jointId}/coord/rot_z`,
        velocity: `joint/${jointId}/coord_rate/rot_z`,
      };
    case 'prismatic':
      return {
        position: `joint/${jointId}/coord/trans_z`,
        velocity: `joint/${jointId}/coord_rate/trans_z`,
      };
    case 'cylindrical':
      return {
        position: `joint/${jointId}/coord/trans_z`,
        velocity: `joint/${jointId}/coord_rate/trans_z`,
      };
    case 'distance':
      return {
        position: `joint/${jointId}/coord/distance`,
        velocity: `joint/${jointId}/coord_rate/distance`,
      };
    default:
      return null;
  }
}

export function getLoadChannelIds(loadId: string, loadType: LoadTypeId): LoadChannelIds {
  if (loadType === 'point-force') {
    return { vector: `load/${loadId}/applied_force` };
  }
  if (loadType === 'point-torque') {
    return { vector: `load/${loadId}/applied_torque` };
  }
  return {
    length: `load/${loadId}/length`,
    lengthRate: `load/${loadId}/length_rate`,
    force: `load/${loadId}/force`,
  };
}
