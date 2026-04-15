import { eulerDegToQuat, isNearGimbalLock, quatToEulerDeg } from '@motionlab/ui';
import { describe, expect, it } from 'vitest';

function expectQuatClose(
  actual: { x: number; y: number; z: number; w: number },
  expected: { x: number; y: number; z: number; w: number },
  tol = 1e-10,
) {
  expect(actual.w).toBeCloseTo(expected.w, -Math.log10(tol));
  expect(actual.x).toBeCloseTo(expected.x, -Math.log10(tol));
  expect(actual.y).toBeCloseTo(expected.y, -Math.log10(tol));
  expect(actual.z).toBeCloseTo(expected.z, -Math.log10(tol));
}

function expectEulerClose(
  actual: { x: number; y: number; z: number },
  expected: { x: number; y: number; z: number },
  tol = 1e-6,
) {
  expect(actual.x).toBeCloseTo(expected.x, -Math.log10(tol));
  expect(actual.y).toBeCloseTo(expected.y, -Math.log10(tol));
  expect(actual.z).toBeCloseTo(expected.z, -Math.log10(tol));
}

describe('eulerDegToQuat', () => {
  it('identity: all zeros → identity quaternion', () => {
    expectQuatClose(eulerDegToQuat({ x: 0, y: 0, z: 0 }), { w: 1, x: 0, y: 0, z: 0 });
  });

  it('pure X rotation (45°)', () => {
    const q = eulerDegToQuat({ x: 45, y: 0, z: 0 });
    expect(q.y).toBeCloseTo(0);
    expect(q.z).toBeCloseTo(0);
    expect(q.w).toBeCloseTo(Math.cos((45 * Math.PI) / 360));
    expect(q.x).toBeCloseTo(Math.sin((45 * Math.PI) / 360));
  });

  it('pure Y rotation (90°)', () => {
    const q = eulerDegToQuat({ x: 0, y: 90, z: 0 });
    expect(q.x).toBeCloseTo(0);
    expect(q.z).toBeCloseTo(0);
    expect(q.w).toBeCloseTo(Math.cos((90 * Math.PI) / 360));
    expect(q.y).toBeCloseTo(Math.sin((90 * Math.PI) / 360));
  });

  it('pure Z rotation (60°)', () => {
    const q = eulerDegToQuat({ x: 0, y: 0, z: 60 });
    expect(q.x).toBeCloseTo(0);
    expect(q.y).toBeCloseTo(0);
    expect(q.w).toBeCloseTo(Math.cos((60 * Math.PI) / 360));
    expect(q.z).toBeCloseTo(Math.sin((60 * Math.PI) / 360));
  });
});

describe('quatToEulerDeg round-trip', () => {
  const cases: [string, { x: number; y: number; z: number }][] = [
    ['identity', { x: 0, y: 0, z: 0 }],
    ['pure X', { x: 45, y: 0, z: 0 }],
    ['pure Y', { x: 0, y: 30, z: 0 }],
    ['pure Z', { x: 0, y: 0, z: 60 }],
    ['multi-axis', { x: 30, y: 45, z: 60 }],
    ['negative angles', { x: -20, y: -50, z: -10 }],
  ];

  for (const [name, euler] of cases) {
    it(`round-trips ${name}: euler → quat → euler`, () => {
      const q = eulerDegToQuat(euler);
      const back = quatToEulerDeg(q);
      expectEulerClose(back, euler);
    });
  }
});

describe('gimbal lock: X and Z coupled at pitch = ±90°', () => {
  it('{x:90, y:-90, z:0} and {x:0, y:-90, z:90} produce same quaternion', () => {
    const qA = eulerDegToQuat({ x: 90, y: -90, z: 0 });
    const qB = eulerDegToQuat({ x: 0, y: -90, z: 90 });
    expectQuatClose(qA, qB);
  });

  it('{x:45, y:90, z:0} and {x:0, y:90, z:-45} produce same quaternion', () => {
    const qA = eulerDegToQuat({ x: 45, y: 90, z: 0 });
    const qB = eulerDegToQuat({ x: 0, y: 90, z: -45 });
    expectQuatClose(qA, qB);
  });
});

describe('isNearGimbalLock', () => {
  it('detects gimbal lock at pitch = -90°', () => {
    const q = eulerDegToQuat({ x: 0, y: -90, z: 0 });
    expect(isNearGimbalLock(q)).toBe(true);
  });

  it('detects gimbal lock at pitch = +90°', () => {
    const q = eulerDegToQuat({ x: 0, y: 90, z: 0 });
    expect(isNearGimbalLock(q)).toBe(true);
  });

  it('detects near gimbal lock at pitch = -89.5°', () => {
    const q = eulerDegToQuat({ x: 0, y: -89.5, z: 0 });
    expect(isNearGimbalLock(q)).toBe(true);
  });

  it('returns false at pitch = 0°', () => {
    const q = eulerDegToQuat({ x: 30, y: 0, z: 45 });
    expect(isNearGimbalLock(q)).toBe(false);
  });

  it('returns false at pitch = 45°', () => {
    const q = eulerDegToQuat({ x: 10, y: 45, z: 20 });
    expect(isNearGimbalLock(q)).toBe(false);
  });
});
