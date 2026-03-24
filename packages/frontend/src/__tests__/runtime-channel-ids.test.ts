import { describe, expect, it } from 'vitest';

import { getJointCoordinateChannelIds, getLoadChannelIds } from '../utils/runtime-channel-ids.js';

describe('runtime channel ids', () => {
  it('maps revolute joints to rotational coordinate channels', () => {
    expect(getJointCoordinateChannelIds('joint-1', 'revolute')).toEqual({
      position: 'joint/joint-1/coord/rot_z',
      velocity: 'joint/joint-1/coord_rate/rot_z',
    });
  });

  it('maps prismatic joints to translational coordinate channels', () => {
    expect(getJointCoordinateChannelIds('joint-2', 'prismatic')).toEqual({
      position: 'joint/joint-2/coord/trans_z',
      velocity: 'joint/joint-2/coord_rate/trans_z',
    });
  });

  it('returns null for joint types without a scalar primary coordinate', () => {
    expect(getJointCoordinateChannelIds('joint-3', 'fixed')).toBeNull();
  });

  it('maps point-force and point-torque loads to applied vector channels', () => {
    expect(getLoadChannelIds('load-force', 'point-force')).toEqual({
      vector: 'load/load-force/applied_force',
    });
    expect(getLoadChannelIds('load-torque', 'point-torque')).toEqual({
      vector: 'load/load-torque/applied_torque',
    });
  });

  it('maps spring-damper loads to scalar runtime channels', () => {
    expect(getLoadChannelIds('load-spring', 'spring-damper')).toEqual({
      length: 'load/load-spring/length',
      lengthRate: 'load/load-spring/length_rate',
      force: 'load/load-spring/force',
    });
  });
});
