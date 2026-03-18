import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { describe, expect, it } from 'vitest';
import {
  AssetReferenceSchema,
  BodySchema,
  DatumSchema,
  DisplayMeshSchema,
  ElementIdSchema,
  JointSchema,
  JointType,
  MassPropertiesSchema,
  MechanismSchema,
  PoseSchema,
  QuatSchema,
  Vec3Schema,
} from '../generated/mechanism/mechanism_pb.js';
import {
  BodyImportResultSchema,
  CommandSchema,
  CreateDatumCommandSchema,
  CreateDatumResultSchema,
  CreateJointCommandSchema,
  CreateJointResultSchema,
  DeleteDatumCommandSchema,
  DeleteDatumResultSchema,
  DeleteJointCommandSchema,
  DeleteJointResultSchema,
  EventSchema,
  HandshakeSchema,
  ImportAssetCommandSchema,
  ImportAssetResultSchema,
  ImportOptionsSchema,
  ProtocolVersionSchema,
  RenameDatumCommandSchema,
  RenameDatumResultSchema,
  UpdateJointCommandSchema,
  UpdateJointResultSchema,
} from '../generated/protocol/transport_pb.js';

describe('Mechanism binary round-trip', () => {
  it('should survive serialize/deserialize for a complete mechanism', () => {
    const mechanism = create(MechanismSchema, {
      id: create(ElementIdSchema, { id: 'mech-001' }),
      name: 'Test Mechanism',
      bodies: [
        create(BodySchema, {
          id: create(ElementIdSchema, { id: 'body-001' }),
          name: 'Ground',
          pose: create(PoseSchema, {
            position: create(Vec3Schema, { x: 0, y: 0, z: 0 }),
            orientation: create(QuatSchema, { w: 1, x: 0, y: 0, z: 0 }),
          }),
          massProperties: create(MassPropertiesSchema, {
            mass: 10.0,
            centerOfMass: create(Vec3Schema, { x: 0, y: 0, z: 0 }),
            ixx: 1.0,
            iyy: 1.0,
            izz: 1.0,
            ixy: 0,
            ixz: 0,
            iyz: 0,
          }),
        }),
      ],
      datums: [
        create(DatumSchema, {
          id: create(ElementIdSchema, { id: 'datum-001' }),
          name: 'Origin',
          parentBodyId: create(ElementIdSchema, { id: 'body-001' }),
          localPose: create(PoseSchema, {
            position: create(Vec3Schema, { x: 1, y: 0, z: 0 }),
            orientation: create(QuatSchema, { w: 1, x: 0, y: 0, z: 0 }),
          }),
        }),
      ],
      joints: [
        create(JointSchema, {
          id: create(ElementIdSchema, { id: 'joint-001' }),
          name: 'Revolute1',
          type: JointType.REVOLUTE,
          parentDatumId: create(ElementIdSchema, { id: 'datum-001' }),
          childDatumId: create(ElementIdSchema, { id: 'datum-002' }),
          lowerLimit: -3.14,
          upperLimit: 3.14,
        }),
      ],
    });

    const bytes = toBinary(MechanismSchema, mechanism);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(0);

    const restored = fromBinary(MechanismSchema, bytes);
    expect(restored.id?.id).toBe('mech-001');
    expect(restored.name).toBe('Test Mechanism');
    expect(restored.bodies).toHaveLength(1);
    expect(restored.bodies[0].name).toBe('Ground');
    expect(restored.bodies[0].massProperties?.mass).toBe(10.0);
    expect(restored.bodies[0].massProperties?.ixx).toBe(1.0);
    expect(restored.datums).toHaveLength(1);
    expect(restored.datums[0].parentBodyId?.id).toBe('body-001');
    expect(restored.datums[0].localPose?.position?.x).toBe(1);
    expect(restored.joints).toHaveLength(1);
    expect(restored.joints[0].type).toBe(JointType.REVOLUTE);
    expect(restored.joints[0].lowerLimit).toBe(-3.14);
    expect(restored.joints[0].upperLimit).toBe(3.14);
    expect(restored.joints[0].parentDatumId?.id).toBe('datum-001');
    expect(restored.joints[0].childDatumId?.id).toBe('datum-002');
  });
});

describe('Transport envelope round-trip', () => {
  it('should round-trip a Command with Handshake payload', () => {
    const cmd = create(CommandSchema, {
      sequenceId: 1n,
      payload: {
        case: 'handshake',
        value: create(HandshakeSchema, {
          protocol: create(ProtocolVersionSchema, {
            name: 'motionlab',
            version: 1,
          }),
          sessionToken: 'test-token-abc',
        }),
      },
    });

    const bytes = toBinary(CommandSchema, cmd);
    const restored = fromBinary(CommandSchema, bytes);

    expect(restored.sequenceId).toBe(1n);
    expect(restored.payload.case).toBe('handshake');
    if (restored.payload.case === 'handshake') {
      expect(restored.payload.value.protocol?.name).toBe('motionlab');
      expect(restored.payload.value.protocol?.version).toBe(1);
      expect(restored.payload.value.sessionToken).toBe('test-token-abc');
    }
  });

  it('should round-trip an ImportAssetCommand with options', () => {
    const cmd = create(CommandSchema, {
      sequenceId: 42n,
      payload: {
        case: 'importAsset',
        value: create(ImportAssetCommandSchema, {
          filePath: '/models/assembly.step',
          importOptions: create(ImportOptionsSchema, {
            densityOverride: 7850.0,
            tessellationQuality: 0.05,
            unitSystem: 'millimeter',
          }),
        }),
      },
    });

    const bytes = toBinary(CommandSchema, cmd);
    const restored = fromBinary(CommandSchema, bytes);

    expect(restored.sequenceId).toBe(42n);
    expect(restored.payload.case).toBe('importAsset');
    if (restored.payload.case === 'importAsset') {
      expect(restored.payload.value.filePath).toBe('/models/assembly.step');
      expect(restored.payload.value.importOptions?.densityOverride).toBe(7850.0);
      expect(restored.payload.value.importOptions?.tessellationQuality).toBe(0.05);
      expect(restored.payload.value.importOptions?.unitSystem).toBe('millimeter');
    }
  });
});

describe('ImportAssetResult round-trip', () => {
  it('should round-trip a full ImportAssetResult with body data', () => {
    const result = create(ImportAssetResultSchema, {
      success: true,
      errorMessage: '',
      diagnostics: ['Imported 1 solid', 'Tessellation OK'],
      bodies: [
        create(BodyImportResultSchema, {
          bodyId: '01912345-6789-7abc-8def-0123456789ab',
          name: 'Bracket',
          displayMesh: create(DisplayMeshSchema, {
            vertices: [0, 0, 0, 1, 0, 0, 1, 1, 0],
            indices: [0, 1, 2],
            normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
          }),
          massProperties: create(MassPropertiesSchema, {
            mass: 2.5,
            centerOfMass: create(Vec3Schema, { x: 0.5, y: 0.5, z: 0 }),
            ixx: 0.1,
            iyy: 0.2,
            izz: 0.3,
            ixy: 0.01,
            ixz: 0.02,
            iyz: 0.03,
          }),
          pose: create(PoseSchema, {
            position: create(Vec3Schema, { x: 10, y: 20, z: 30 }),
            orientation: create(QuatSchema, { w: 1, x: 0, y: 0, z: 0 }),
          }),
          sourceAssetRef: create(AssetReferenceSchema, {
            contentHash: 'abc123def456',
            originalFilename: 'bracket.step',
          }),
        }),
      ],
    });

    const bytes = toBinary(ImportAssetResultSchema, result);
    expect(bytes.byteLength).toBeGreaterThan(0);

    const restored = fromBinary(ImportAssetResultSchema, bytes);
    expect(restored.success).toBe(true);
    expect(restored.diagnostics).toEqual(['Imported 1 solid', 'Tessellation OK']);
    expect(restored.bodies).toHaveLength(1);

    const body = restored.bodies[0];
    expect(body.bodyId).toBe('01912345-6789-7abc-8def-0123456789ab');
    expect(body.name).toBe('Bracket');

    // DisplayMesh arrays (proto repeated fields decode as plain arrays)
    expect(Array.from(body.displayMesh?.vertices ?? [])).toEqual([0, 0, 0, 1, 0, 0, 1, 1, 0]);
    expect(Array.from(body.displayMesh?.indices ?? [])).toEqual([0, 1, 2]);
    expect(Array.from(body.displayMesh?.normals ?? [])).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);

    // MassProperties
    expect(body.massProperties?.mass).toBe(2.5);
    expect(body.massProperties?.centerOfMass?.x).toBe(0.5);
    expect(body.massProperties?.centerOfMass?.y).toBe(0.5);
    expect(body.massProperties?.ixx).toBe(0.1);
    expect(body.massProperties?.iyy).toBe(0.2);
    expect(body.massProperties?.izz).toBe(0.3);
    expect(body.massProperties?.ixy).toBe(0.01);
    expect(body.massProperties?.ixz).toBe(0.02);
    expect(body.massProperties?.iyz).toBe(0.03);

    // Pose
    expect(body.pose?.position?.x).toBe(10);
    expect(body.pose?.position?.y).toBe(20);
    expect(body.pose?.position?.z).toBe(30);
    expect(body.pose?.orientation?.w).toBe(1);
    expect(body.pose?.orientation?.x).toBe(0);

    // AssetReference
    expect(body.sourceAssetRef?.contentHash).toBe('abc123def456');
    expect(body.sourceAssetRef?.originalFilename).toBe('bracket.step');
  });

  it('should survive Event envelope wrapping', () => {
    const importResult = create(ImportAssetResultSchema, {
      success: true,
      bodies: [
        create(BodyImportResultSchema, {
          bodyId: 'test-id',
          name: 'Part1',
        }),
      ],
    });

    const event = create(EventSchema, {
      sequenceId: 99n,
      payload: {
        case: 'importAssetResult',
        value: importResult,
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.sequenceId).toBe(99n);
    expect(restored.payload.case).toBe('importAssetResult');
    if (restored.payload.case === 'importAssetResult') {
      expect(restored.payload.value.success).toBe(true);
      expect(restored.payload.value.bodies).toHaveLength(1);
      expect(restored.payload.value.bodies[0].bodyId).toBe('test-id');
      expect(restored.payload.value.bodies[0].name).toBe('Part1');
    }
  });
});

describe('Datum CRUD round-trip', () => {
  it('should round-trip a CreateDatumCommand in Command envelope', () => {
    const cmd = create(CommandSchema, {
      sequenceId: 50n,
      payload: {
        case: 'createDatum',
        value: create(CreateDatumCommandSchema, {
          parentBodyId: create(ElementIdSchema, { id: 'body-001' }),
          localPose: create(PoseSchema, {
            position: create(Vec3Schema, { x: 1, y: 2, z: 3 }),
            orientation: create(QuatSchema, { w: 1, x: 0, y: 0, z: 0 }),
          }),
          name: 'MyDatum',
        }),
      },
    });

    const bytes = toBinary(CommandSchema, cmd);
    const restored = fromBinary(CommandSchema, bytes);

    expect(restored.sequenceId).toBe(50n);
    expect(restored.payload.case).toBe('createDatum');
    if (restored.payload.case === 'createDatum') {
      expect(restored.payload.value.parentBodyId?.id).toBe('body-001');
      expect(restored.payload.value.name).toBe('MyDatum');
      expect(restored.payload.value.localPose?.position?.x).toBe(1);
      expect(restored.payload.value.localPose?.orientation?.w).toBe(1);
    }
  });

  it('should round-trip a CreateDatumResult (success) in Event envelope', () => {
    const event = create(EventSchema, {
      sequenceId: 51n,
      payload: {
        case: 'createDatumResult',
        value: create(CreateDatumResultSchema, {
          result: {
            case: 'datum',
            value: create(DatumSchema, {
              id: create(ElementIdSchema, { id: 'datum-001' }),
              name: 'MyDatum',
              parentBodyId: create(ElementIdSchema, { id: 'body-001' }),
              localPose: create(PoseSchema, {
                position: create(Vec3Schema, { x: 1, y: 2, z: 3 }),
                orientation: create(QuatSchema, { w: 1, x: 0, y: 0, z: 0 }),
              }),
            }),
          },
        }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.sequenceId).toBe(51n);
    expect(restored.payload.case).toBe('createDatumResult');
    if (restored.payload.case === 'createDatumResult') {
      expect(restored.payload.value.result.case).toBe('datum');
      if (restored.payload.value.result.case === 'datum') {
        expect(restored.payload.value.result.value.id?.id).toBe('datum-001');
        expect(restored.payload.value.result.value.name).toBe('MyDatum');
        expect(restored.payload.value.result.value.parentBodyId?.id).toBe('body-001');
        expect(restored.payload.value.result.value.localPose?.position?.x).toBe(1);
      }
    }
  });

  it('should round-trip a CreateDatumResult (error) in Event envelope', () => {
    const event = create(EventSchema, {
      sequenceId: 52n,
      payload: {
        case: 'createDatumResult',
        value: create(CreateDatumResultSchema, {
          result: {
            case: 'errorMessage',
            value: 'Parent body not found',
          },
        }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.payload.case).toBe('createDatumResult');
    if (restored.payload.case === 'createDatumResult') {
      expect(restored.payload.value.result.case).toBe('errorMessage');
      if (restored.payload.value.result.case === 'errorMessage') {
        expect(restored.payload.value.result.value).toBe('Parent body not found');
      }
    }
  });

  it('should round-trip DeleteDatumCommand and DeleteDatumResult', () => {
    const cmd = create(CommandSchema, {
      sequenceId: 60n,
      payload: {
        case: 'deleteDatum',
        value: create(DeleteDatumCommandSchema, {
          datumId: create(ElementIdSchema, { id: 'datum-001' }),
        }),
      },
    });

    const cmdBytes = toBinary(CommandSchema, cmd);
    const restoredCmd = fromBinary(CommandSchema, cmdBytes);
    expect(restoredCmd.payload.case).toBe('deleteDatum');
    if (restoredCmd.payload.case === 'deleteDatum') {
      expect(restoredCmd.payload.value.datumId?.id).toBe('datum-001');
    }

    const event = create(EventSchema, {
      sequenceId: 60n,
      payload: {
        case: 'deleteDatumResult',
        value: create(DeleteDatumResultSchema, {
          result: {
            case: 'deletedId',
            value: create(ElementIdSchema, { id: 'datum-001' }),
          },
        }),
      },
    });

    const evtBytes = toBinary(EventSchema, event);
    const restoredEvt = fromBinary(EventSchema, evtBytes);
    expect(restoredEvt.payload.case).toBe('deleteDatumResult');
    if (restoredEvt.payload.case === 'deleteDatumResult') {
      expect(restoredEvt.payload.value.result.case).toBe('deletedId');
      if (restoredEvt.payload.value.result.case === 'deletedId') {
        expect(restoredEvt.payload.value.result.value.id).toBe('datum-001');
      }
    }
  });

  it('should round-trip RenameDatumCommand and RenameDatumResult', () => {
    const cmd = create(CommandSchema, {
      sequenceId: 70n,
      payload: {
        case: 'renameDatum',
        value: create(RenameDatumCommandSchema, {
          datumId: create(ElementIdSchema, { id: 'datum-001' }),
          name: 'RenamedDatum',
        }),
      },
    });

    const cmdBytes = toBinary(CommandSchema, cmd);
    const restoredCmd = fromBinary(CommandSchema, cmdBytes);
    expect(restoredCmd.payload.case).toBe('renameDatum');
    if (restoredCmd.payload.case === 'renameDatum') {
      expect(restoredCmd.payload.value.datumId?.id).toBe('datum-001');
      expect(restoredCmd.payload.value.name).toBe('RenamedDatum');
    }

    const event = create(EventSchema, {
      sequenceId: 70n,
      payload: {
        case: 'renameDatumResult',
        value: create(RenameDatumResultSchema, {
          result: {
            case: 'datum',
            value: create(DatumSchema, {
              id: create(ElementIdSchema, { id: 'datum-001' }),
              name: 'RenamedDatum',
              parentBodyId: create(ElementIdSchema, { id: 'body-001' }),
              localPose: create(PoseSchema, {
                position: create(Vec3Schema, { x: 0, y: 0, z: 0 }),
                orientation: create(QuatSchema, { w: 1, x: 0, y: 0, z: 0 }),
              }),
            }),
          },
        }),
      },
    });

    const evtBytes = toBinary(EventSchema, event);
    const restoredEvt = fromBinary(EventSchema, evtBytes);
    expect(restoredEvt.payload.case).toBe('renameDatumResult');
    if (restoredEvt.payload.case === 'renameDatumResult') {
      expect(restoredEvt.payload.value.result.case).toBe('datum');
      if (restoredEvt.payload.value.result.case === 'datum') {
        expect(restoredEvt.payload.value.result.value.name).toBe('RenamedDatum');
      }
    }
  });
});

describe('Joint CRUD round-trip', () => {
  it('should round-trip a CreateJointCommand in Command envelope', () => {
    const cmd = create(CommandSchema, {
      sequenceId: 80n,
      payload: {
        case: 'createJoint',
        value: create(CreateJointCommandSchema, {
          parentDatumId: create(ElementIdSchema, { id: 'datum-001' }),
          childDatumId: create(ElementIdSchema, { id: 'datum-002' }),
          type: JointType.REVOLUTE,
          name: 'RevJoint1',
          lowerLimit: -3.14,
          upperLimit: 3.14,
        }),
      },
    });

    const bytes = toBinary(CommandSchema, cmd);
    const restored = fromBinary(CommandSchema, bytes);

    expect(restored.sequenceId).toBe(80n);
    expect(restored.payload.case).toBe('createJoint');
    if (restored.payload.case === 'createJoint') {
      expect(restored.payload.value.parentDatumId?.id).toBe('datum-001');
      expect(restored.payload.value.childDatumId?.id).toBe('datum-002');
      expect(restored.payload.value.type).toBe(JointType.REVOLUTE);
      expect(restored.payload.value.name).toBe('RevJoint1');
      expect(restored.payload.value.lowerLimit).toBe(-3.14);
      expect(restored.payload.value.upperLimit).toBe(3.14);
    }
  });

  it('should round-trip a CreateJointResult (success with Joint) in Event envelope', () => {
    const event = create(EventSchema, {
      sequenceId: 81n,
      payload: {
        case: 'createJointResult',
        value: create(CreateJointResultSchema, {
          result: {
            case: 'joint',
            value: create(JointSchema, {
              id: create(ElementIdSchema, { id: 'joint-001' }),
              name: 'RevJoint1',
              type: JointType.REVOLUTE,
              parentDatumId: create(ElementIdSchema, { id: 'datum-001' }),
              childDatumId: create(ElementIdSchema, { id: 'datum-002' }),
              lowerLimit: -3.14,
              upperLimit: 3.14,
            }),
          },
        }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.sequenceId).toBe(81n);
    expect(restored.payload.case).toBe('createJointResult');
    if (restored.payload.case === 'createJointResult') {
      expect(restored.payload.value.result.case).toBe('joint');
      if (restored.payload.value.result.case === 'joint') {
        expect(restored.payload.value.result.value.id?.id).toBe('joint-001');
        expect(restored.payload.value.result.value.name).toBe('RevJoint1');
        expect(restored.payload.value.result.value.type).toBe(JointType.REVOLUTE);
        expect(restored.payload.value.result.value.parentDatumId?.id).toBe('datum-001');
        expect(restored.payload.value.result.value.childDatumId?.id).toBe('datum-002');
        expect(restored.payload.value.result.value.lowerLimit).toBe(-3.14);
        expect(restored.payload.value.result.value.upperLimit).toBe(3.14);
      }
    }
  });

  it('should round-trip a CreateJointResult (error) in Event envelope', () => {
    const event = create(EventSchema, {
      sequenceId: 82n,
      payload: {
        case: 'createJointResult',
        value: create(CreateJointResultSchema, {
          result: {
            case: 'errorMessage',
            value: 'Parent datum not found: datum-999',
          },
        }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.payload.case).toBe('createJointResult');
    if (restored.payload.case === 'createJointResult') {
      expect(restored.payload.value.result.case).toBe('errorMessage');
      if (restored.payload.value.result.case === 'errorMessage') {
        expect(restored.payload.value.result.value).toBe('Parent datum not found: datum-999');
      }
    }
  });

  it('should round-trip UpdateJointCommand with optional fields', () => {
    const cmd = create(CommandSchema, {
      sequenceId: 83n,
      payload: {
        case: 'updateJoint',
        value: create(UpdateJointCommandSchema, {
          jointId: create(ElementIdSchema, { id: 'joint-001' }),
          name: 'UpdatedName',
          type: JointType.PRISMATIC,
          // lowerLimit and upperLimit intentionally omitted (optional)
        }),
      },
    });

    const bytes = toBinary(CommandSchema, cmd);
    const restored = fromBinary(CommandSchema, bytes);

    expect(restored.sequenceId).toBe(83n);
    expect(restored.payload.case).toBe('updateJoint');
    if (restored.payload.case === 'updateJoint') {
      expect(restored.payload.value.jointId?.id).toBe('joint-001');
      expect(restored.payload.value.name).toBe('UpdatedName');
      expect(restored.payload.value.type).toBe(JointType.PRISMATIC);
      expect(restored.payload.value.lowerLimit).toBeUndefined();
      expect(restored.payload.value.upperLimit).toBeUndefined();
    }
  });

  it('should round-trip UpdateJointResult in Event envelope', () => {
    const event = create(EventSchema, {
      sequenceId: 84n,
      payload: {
        case: 'updateJointResult',
        value: create(UpdateJointResultSchema, {
          result: {
            case: 'joint',
            value: create(JointSchema, {
              id: create(ElementIdSchema, { id: 'joint-001' }),
              name: 'UpdatedName',
              type: JointType.PRISMATIC,
              parentDatumId: create(ElementIdSchema, { id: 'datum-001' }),
              childDatumId: create(ElementIdSchema, { id: 'datum-002' }),
              lowerLimit: 0,
              upperLimit: 100,
            }),
          },
        }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.payload.case).toBe('updateJointResult');
    if (restored.payload.case === 'updateJointResult') {
      expect(restored.payload.value.result.case).toBe('joint');
      if (restored.payload.value.result.case === 'joint') {
        expect(restored.payload.value.result.value.name).toBe('UpdatedName');
        expect(restored.payload.value.result.value.type).toBe(JointType.PRISMATIC);
      }
    }
  });

  it('should round-trip DeleteJointCommand and DeleteJointResult', () => {
    const cmd = create(CommandSchema, {
      sequenceId: 85n,
      payload: {
        case: 'deleteJoint',
        value: create(DeleteJointCommandSchema, {
          jointId: create(ElementIdSchema, { id: 'joint-001' }),
        }),
      },
    });

    const cmdBytes = toBinary(CommandSchema, cmd);
    const restoredCmd = fromBinary(CommandSchema, cmdBytes);
    expect(restoredCmd.payload.case).toBe('deleteJoint');
    if (restoredCmd.payload.case === 'deleteJoint') {
      expect(restoredCmd.payload.value.jointId?.id).toBe('joint-001');
    }

    const event = create(EventSchema, {
      sequenceId: 85n,
      payload: {
        case: 'deleteJointResult',
        value: create(DeleteJointResultSchema, {
          result: {
            case: 'deletedId',
            value: create(ElementIdSchema, { id: 'joint-001' }),
          },
        }),
      },
    });

    const evtBytes = toBinary(EventSchema, event);
    const restoredEvt = fromBinary(EventSchema, evtBytes);
    expect(restoredEvt.payload.case).toBe('deleteJointResult');
    if (restoredEvt.payload.case === 'deleteJointResult') {
      expect(restoredEvt.payload.value.result.case).toBe('deletedId');
      if (restoredEvt.payload.value.result.case === 'deletedId') {
        expect(restoredEvt.payload.value.result.value.id).toBe('joint-001');
      }
    }
  });
});
