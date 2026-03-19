import { beforeEach, describe, expect, it } from 'vitest';

import {
  type BodyState,
  type DatumState,
  type JointState,
  useMechanismStore,
} from '../stores/mechanism.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBody(id: string): BodyState {
  return {
    id,
    name: `Body ${id}`,
    meshData: {
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    },
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
    sourceAssetRef: { contentHash: 'abc', originalFilename: 'test.step' },
  };
}

function makeDatum(id: string, parentBodyId: string): DatumState {
  return {
    id,
    name: `Datum ${id}`,
    parentBodyId,
    localPose: {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
  };
}

function makeJoint(id: string, parentDatumId: string, childDatumId: string): JointState {
  return {
    id,
    name: `Joint ${id}`,
    type: 'revolute',
    parentDatumId,
    childDatumId,
    lowerLimit: -3.14,
    upperLimit: 3.14,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Mechanism store', () => {
  beforeEach(() => {
    useMechanismStore.setState({
      bodies: new Map(),
      datums: new Map(),
      joints: new Map(),
      importing: false,
      importError: null,
    });
  });

  // --- Bodies ---

  it('addBodies adds to map', () => {
    const { addBodies } = useMechanismStore.getState();
    addBodies([makeBody('b1'), makeBody('b2')]);
    const { bodies } = useMechanismStore.getState();
    expect(bodies.size).toBe(2);
    expect(bodies.has('b1')).toBe(true);
    expect(bodies.has('b2')).toBe(true);
  });

  it('addBodies overwrites same ID', () => {
    const { addBodies } = useMechanismStore.getState();
    addBodies([makeBody('b1')]);
    const updated = { ...makeBody('b1'), name: 'Updated' };
    addBodies([updated]);
    const { bodies } = useMechanismStore.getState();
    expect(bodies.size).toBe(1);
    expect(bodies.get('b1')?.name).toBe('Updated');
  });

  it('removeBody deletes from map', () => {
    const { addBodies } = useMechanismStore.getState();
    addBodies([makeBody('b1')]);
    useMechanismStore.getState().removeBody('b1');
    expect(useMechanismStore.getState().bodies.size).toBe(0);
  });

  it('removeBody unknown is no-op', () => {
    const { addBodies } = useMechanismStore.getState();
    addBodies([makeBody('b1')]);
    useMechanismStore.getState().removeBody('nonexistent');
    expect(useMechanismStore.getState().bodies.size).toBe(1);
  });

  // --- Datums ---

  it('addDatum adds to map', () => {
    useMechanismStore.getState().addDatum(makeDatum('d1', 'b1'));
    expect(useMechanismStore.getState().datums.has('d1')).toBe(true);
  });

  it('removeDatum deletes', () => {
    useMechanismStore.getState().addDatum(makeDatum('d1', 'b1'));
    useMechanismStore.getState().removeDatum('d1');
    expect(useMechanismStore.getState().datums.size).toBe(0);
  });

  it('renameDatum updates name only', () => {
    const datum = makeDatum('d1', 'b1');
    useMechanismStore.getState().addDatum(datum);
    useMechanismStore.getState().renameDatum('d1', 'NewName');
    const updated = useMechanismStore.getState().datums.get('d1');
    expect(updated?.name).toBe('NewName');
    expect(updated?.parentBodyId).toBe('b1');
    expect(updated?.localPose).toEqual(datum.localPose);
  });

  it('renameDatum unknown is no-op', () => {
    useMechanismStore.getState().addDatum(makeDatum('d1', 'b1'));
    const _before = useMechanismStore.getState().datums;
    useMechanismStore.getState().renameDatum('nonexistent', 'X');
    // Map reference may differ but content should be the same
    expect(useMechanismStore.getState().datums.get('d1')?.name).toBe('Datum d1');
  });

  // --- Joints ---

  it('addJoint adds to map', () => {
    useMechanismStore.getState().addJoint(makeJoint('j1', 'd1', 'd2'));
    expect(useMechanismStore.getState().joints.has('j1')).toBe(true);
  });

  it('addJoint stores without validating datum refs', () => {
    // Store is a dumb projection — engine validates datum references
    const joint = makeJoint('j1', 'nonexistent-parent', 'nonexistent-child');
    useMechanismStore.getState().addJoint(joint);
    const stored = useMechanismStore.getState().joints.get('j1');
    expect(stored?.parentDatumId).toBe('nonexistent-parent');
    expect(stored?.childDatumId).toBe('nonexistent-child');
  });

  it('updateJoint partial merge', () => {
    useMechanismStore.getState().addJoint(makeJoint('j1', 'd1', 'd2'));
    useMechanismStore.getState().updateJoint('j1', { name: 'Updated', type: 'prismatic' });
    const updated = useMechanismStore.getState().joints.get('j1');
    expect(updated?.name).toBe('Updated');
    expect(updated?.type).toBe('prismatic');
    expect(updated?.parentDatumId).toBe('d1');
    expect(updated?.lowerLimit).toBe(-3.14);
  });

  it('updateJoint unknown is no-op', () => {
    useMechanismStore.getState().updateJoint('nonexistent', { name: 'X' });
    expect(useMechanismStore.getState().joints.size).toBe(0);
  });

  it('removeJoint deletes', () => {
    useMechanismStore.getState().addJoint(makeJoint('j1', 'd1', 'd2'));
    useMechanismStore.getState().removeJoint('j1');
    expect(useMechanismStore.getState().joints.size).toBe(0);
  });

  // --- Clear ---

  it('clear resets all maps and importError', () => {
    useMechanismStore.getState().addBodies([makeBody('b1')]);
    useMechanismStore.getState().addDatum(makeDatum('d1', 'b1'));
    useMechanismStore.getState().addJoint(makeJoint('j1', 'd1', 'd2'));
    useMechanismStore.getState().setImportError('oops');

    useMechanismStore.getState().clear();

    const s = useMechanismStore.getState();
    expect(s.bodies.size).toBe(0);
    expect(s.datums.size).toBe(0);
    expect(s.joints.size).toBe(0);
    expect(s.importError).toBeNull();
  });
});
