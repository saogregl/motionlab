import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../engine/connection.js', () => ({
  sendDetachGeometry: vi.fn(),
  sendMakeCompoundBody: vi.fn(),
  sendSplitBody: vi.fn(),
}));

import { sendMakeCompoundBody } from '../engine/connection.js';
import { useMechanismStore, type BodyState, type GeometryState } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { executeMakeBody, resolveMakeBodyReferenceBodyId } from '../utils/body-merge.js';

function makeBody(id: string, motionType: 'dynamic' | 'fixed' = 'dynamic'): BodyState {
  return {
    id,
    name: `Body ${id}`,
    massProperties: {
      mass: 1,
      centerOfMass: { x: 0, y: 0, z: 0 },
      ixx: 1,
      iyy: 1,
      izz: 1,
      ixy: 0,
      ixz: 0,
      iyz: 0,
    },
    pose: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
    motionType,
    massOverride: false,
  };
}

function makeGeometry(id: string, name: string, parentBodyId: string | null): GeometryState {
  return {
    id,
    name,
    parentBodyId,
    localPose: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
    meshData: {
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    },
    computedMassProperties: {
      mass: 1,
      centerOfMass: { x: 0, y: 0, z: 0 },
      ixx: 1,
      iyy: 1,
      izz: 1,
      ixy: 0,
      ixz: 0,
      iyz: 0,
    },
    sourceAssetRef: { contentHash: 'abc', originalFilename: 'test.step' },
  };
}

describe('body merge utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMechanismStore.setState({
      bodies: new Map(),
      geometries: new Map(),
    });
    useSelectionStore.setState({
      selectedIds: new Set(),
      hoveredId: null,
      lastSelectedId: null,
      selectionFilter: null,
    });
  });

  it('preserves the last selected body frame when executing make body', () => {
    useMechanismStore.setState({
      bodies: new Map([
        ['b1', makeBody('b1')],
        ['b2', makeBody('b2', 'fixed')],
      ]),
      geometries: new Map([
        ['g1', makeGeometry('g1', 'Frame Left', 'b1')],
        ['g2', makeGeometry('g2', 'Frame Right', 'b2')],
      ]),
    });
    const selectedIds = new Set(['g1', 'g2']);
    useSelectionStore.setState({ selectedIds, lastSelectedId: 'g2' });

    executeMakeBody(selectedIds);

    expect(sendMakeCompoundBody).toHaveBeenCalledWith(
      ['g1', 'g2'],
      'Frame Body',
      {
        dissolveEmptyBodies: true,
        motionType: 'fixed',
        referenceBodyId: 'b2',
      },
    );
  });

  it('resolves a geometry selection to its parent body frame', () => {
    useMechanismStore.setState({
      bodies: new Map([['b1', makeBody('b1')]]),
      geometries: new Map([['g1', makeGeometry('g1', 'Part', 'b1')]]),
    });
    const selectedIds = new Set(['g1']);
    useSelectionStore.setState({ selectedIds, lastSelectedId: 'g1' });

    expect(resolveMakeBodyReferenceBodyId(selectedIds)).toBe('b1');
  });
});
