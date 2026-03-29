import { beforeEach, describe, expect, it } from 'vitest';

import {
  type ActuatorState,
  type BodyState,
  type DatumState,
  type GeometryState,
  type JointState,
  type LoadState,
  useMechanismStore,
} from '../stores/mechanism.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBody(id: string): BodyState {
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
    motionType: 'dynamic',
  };
}

function makeGeometry(id: string, parentBodyId: string): GeometryState {
  return {
    id,
    name: `Geometry ${id}`,
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
    damping: 0,
    translationalDamping: 0,
    rotationalDamping: 0,
  };
}

function makeLoad(id: string, datumId: string): LoadState {
  return {
    id,
    name: `Load ${id}`,
    type: 'point-force',
    datumId,
    vector: { x: 0, y: -9.81, z: 0 },
    referenceFrame: 'world',
  };
}

function makeActuator(id: string, jointId: string): ActuatorState {
  return {
    id,
    name: `Actuator ${id}`,
    type: 'revolute-motor',
    jointId,
    controlMode: 'speed',
    commandValue: 1,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Mechanism store', () => {
  beforeEach(() => {
    useMechanismStore.setState({
      bodies: new Map(),
      geometries: new Map(),
      datums: new Map(),
      joints: new Map(),
      loads: new Map(),
      actuators: new Map(),
      importing: false,
      importError: null,
      hasActiveProject: false,
      projectName: 'Untitled',
      projectFilePath: null,
      isDirty: false,
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

  // --- Geometries ---

  it('addGeometries adds to map', () => {
    useMechanismStore.getState().addGeometries([makeGeometry('g1', 'b1'), makeGeometry('g2', 'b1')]);
    const { geometries } = useMechanismStore.getState();
    expect(geometries.size).toBe(2);
    expect(geometries.has('g1')).toBe(true);
    expect(geometries.has('g2')).toBe(true);
  });

  it('removeGeometry deletes from map', () => {
    useMechanismStore.getState().addGeometries([makeGeometry('g1', 'b1')]);
    useMechanismStore.getState().removeGeometry('g1');
    expect(useMechanismStore.getState().geometries.size).toBe(0);
  });

  it('updateGeometryParent changes parentBodyId', () => {
    useMechanismStore.getState().addGeometries([makeGeometry('g1', 'b1')]);
    useMechanismStore.getState().updateGeometryParent('g1', 'b2');
    expect(useMechanismStore.getState().geometries.get('g1')?.parentBodyId).toBe('b2');
  });

  it('updateGeometryParent to null (detach)', () => {
    useMechanismStore.getState().addGeometries([makeGeometry('g1', 'b1')]);
    useMechanismStore.getState().updateGeometryParent('g1', null);
    expect(useMechanismStore.getState().geometries.get('g1')?.parentBodyId).toBeNull();
  });

  it('updateBodyMass updates mass and override flag', () => {
    useMechanismStore.getState().addBodies([makeBody('b1')]);
    const newMass = { mass: 5, centerOfMass: { x: 1, y: 0, z: 0 }, ixx: 2, iyy: 2, izz: 2, ixy: 0, ixz: 0, iyz: 0 };
    useMechanismStore.getState().updateBodyMass('b1', newMass, true);
    const body = useMechanismStore.getState().bodies.get('b1');
    expect(body?.massProperties.mass).toBe(5);
    expect(body?.massOverride).toBe(true);
  });

  it('addBodiesWithGeometries adds both atomically', () => {
    useMechanismStore.getState().addBodiesWithGeometries(
      [makeBody('b1')],
      [makeGeometry('g1', 'b1')],
    );
    const { bodies, geometries } = useMechanismStore.getState();
    expect(bodies.size).toBe(1);
    expect(geometries.size).toBe(1);
    expect(geometries.get('g1')?.parentBodyId).toBe('b1');
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
    useMechanismStore.getState().renameDatum('nonexistent', 'X');
    expect(useMechanismStore.getState().datums.get('d1')?.name).toBe('Datum d1');
  });

  it('stores surfaceClass on datum', () => {
    useMechanismStore.getState().addDatum({
      id: 'datum-1',
      name: 'Datum 1',
      parentBodyId: 'body-1',
      localPose: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
      surfaceClass: 'cylindrical',
    });
    const datum = useMechanismStore.getState().datums.get('datum-1');
    expect(datum?.surfaceClass).toBe('cylindrical');
  });

  it('stores datum face provenance metadata', () => {
    useMechanismStore.getState().addDatum({
      id: 'datum-2',
      name: 'Datum 2',
      parentBodyId: 'body-1',
      localPose: {
        position: { x: 1, y: 2, z: 3 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
      sourceGeometryId: 'geom-1',
      sourceFaceIndex: 4,
      sourceGeometryLocalPose: {
        position: { x: 0.1, y: 0.2, z: 0.3 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
      surfaceClass: 'planar',
      faceGeometry: {
        normal: { x: 0, y: 0, z: 1 },
      },
    });

    const datum = useMechanismStore.getState().datums.get('datum-2');
    expect(datum?.sourceGeometryId).toBe('geom-1');
    expect(datum?.sourceFaceIndex).toBe(4);
    expect(datum?.sourceGeometryLocalPose?.position.x).toBe(0.1);
    expect(datum?.faceGeometry?.normal?.z).toBe(1);
  });

  // --- Joints ---

  it('addJoint adds to map', () => {
    useMechanismStore.getState().addJoint(makeJoint('j1', 'd1', 'd2'));
    expect(useMechanismStore.getState().joints.has('j1')).toBe(true);
  });

  it('addJoint stores without validating datum refs', () => {
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

  // --- Loads ---

  it('addLoad adds to map', () => {
    useMechanismStore.getState().addLoad(makeLoad('l1', 'd1'));
    expect(useMechanismStore.getState().loads.has('l1')).toBe(true);
  });

  it('updateLoad merges fields', () => {
    useMechanismStore.getState().addLoad(makeLoad('l1', 'd1'));
    useMechanismStore.getState().updateLoad('l1', {
      vector: { x: 1, y: 2, z: 3 },
      referenceFrame: 'datum-local',
    });
    expect(useMechanismStore.getState().loads.get('l1')).toMatchObject({
      vector: { x: 1, y: 2, z: 3 },
      referenceFrame: 'datum-local',
    });
  });

  it('removeLoad deletes', () => {
    useMechanismStore.getState().addLoad(makeLoad('l1', 'd1'));
    useMechanismStore.getState().removeLoad('l1');
    expect(useMechanismStore.getState().loads.size).toBe(0);
  });

  // --- Actuators ---

  it('addActuator adds to map', () => {
    useMechanismStore.getState().addActuator(makeActuator('a1', 'j1'));
    expect(useMechanismStore.getState().actuators.has('a1')).toBe(true);
  });

  it('updateActuator merges fields', () => {
    useMechanismStore.getState().addActuator(makeActuator('a1', 'j1'));
    useMechanismStore.getState().updateActuator('a1', {
      controlMode: 'effort',
      commandValue: 5,
      effortLimit: 10,
    });
    expect(useMechanismStore.getState().actuators.get('a1')).toMatchObject({
      controlMode: 'effort',
      commandValue: 5,
      effortLimit: 10,
    });
  });

  it('removeActuator deletes', () => {
    useMechanismStore.getState().addActuator(makeActuator('a1', 'j1'));
    useMechanismStore.getState().removeActuator('a1');
    expect(useMechanismStore.getState().actuators.size).toBe(0);
  });

  // --- Clear ---

  it('clear resets all maps and importError', () => {
    useMechanismStore.getState().addBodies([makeBody('b1')]);
    useMechanismStore.getState().addGeometries([makeGeometry('g1', 'b1')]);
    useMechanismStore.getState().addDatum(makeDatum('d1', 'b1'));
    useMechanismStore.getState().addJoint(makeJoint('j1', 'd1', 'd2'));
    useMechanismStore.getState().addLoad(makeLoad('l1', 'd1'));
    useMechanismStore.getState().addActuator(makeActuator('a1', 'j1'));
    useMechanismStore.getState().setImportError('oops');

    useMechanismStore.getState().clear();

    const s = useMechanismStore.getState();
    expect(s.bodies.size).toBe(0);
    expect(s.geometries.size).toBe(0);
    expect(s.datums.size).toBe(0);
    expect(s.joints.size).toBe(0);
    expect(s.loads.size).toBe(0);
    expect(s.actuators.size).toBe(0);
    expect(s.importError).toBeNull();
  });

  it('resetProject clears geometries too', () => {
    useMechanismStore.getState().addGeometries([makeGeometry('g1', 'b1')]);
    useMechanismStore.getState().resetProject();
    expect(useMechanismStore.getState().geometries.size).toBe(0);
  });

  it('starts with no active project until project metadata is set', () => {
    expect(useMechanismStore.getState().hasActiveProject).toBe(false);

    useMechanismStore.getState().setProjectMeta('Demo', null);

    const state = useMechanismStore.getState();
    expect(state.hasActiveProject).toBe(true);
    expect(state.projectName).toBe('Demo');
  });

  it('resetProject marks a new empty project as active and preserves the chosen name', () => {
    useMechanismStore.getState().resetProject('Template Project');

    const state = useMechanismStore.getState();
    expect(state.hasActiveProject).toBe(true);
    expect(state.projectName).toBe('Template Project');
    expect(state.projectFilePath).toBeNull();
    expect(state.isDirty).toBe(false);
  });
});
