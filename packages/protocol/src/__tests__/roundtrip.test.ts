import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { describe, expect, it } from 'vitest';
import {
  ActuatorControlMode,
  ActuatorSchema,
  AssetReferenceSchema,
  BodyDisplayDataSchema,
  BodySchema,
  DatumSchema,
  DisplayMeshSchema,
  ElementIdSchema,
  JointSchema,
  JointType,
  LinearSpringDamperLoadSchema,
  LoadSchema,
  PointForceLoadSchema,
  PointTorqueLoadSchema,
  PrismaticJointConfigSchema,
  PrismaticMotorActuatorSchema,
  MassPropertiesSchema,
  MechanismSchema,
  PoseSchema,
  ProjectFileSchema,
  ProjectMetadataSchema,
  QuatSchema,
  RangeSchema,
  ReferenceFrame,
  RevoluteJointConfigSchema,
  RevoluteMotorActuatorSchema,
  Vec3Schema,
} from '../generated/mechanism/mechanism_pb.js';
import {
  BodyImportResultSchema,
  BodyPoseDataSchema,
  ChannelDataType,
  CommandSchema,
  CompilationDiagnosticSchema,
  CompilationResultEventSchema,
  CompileMechanismCommandSchema,
  ContactSettingsSchema,
  CreateActuatorCommandSchema,
  CreateActuatorResultSchema,
  CreateDatumCommandSchema,
  CreateDatumFromFaceCommandSchema,
  CreateDatumFromFaceResultSchema,
  CreateDatumFromFaceSuccessSchema,
  CreateDatumResultSchema,
  CreateJointCommandSchema,
  CreateJointResultSchema,
  CreateLoadCommandSchema,
  CreateLoadResultSchema,
  DeleteActuatorCommandSchema,
  DeleteActuatorResultSchema,
  DeleteDatumCommandSchema,
  DeleteDatumResultSchema,
  DeleteJointCommandSchema,
  DeleteJointResultSchema,
  DeleteLoadCommandSchema,
  DeleteLoadResultSchema,
  DiagnosticSeverity,
  EngineStatus_State,
  EngineStatusSchema,
  EventSchema,
  FaceSurfaceClass,
  HandshakeAckSchema,
  HandshakeSchema,
  ImportAssetCommandSchema,
  ImportAssetResultSchema,
  ImportOptionsSchema,
  IntegratorType,
  JointStateDataSchema,
  LoadProjectCommandSchema,
  LoadProjectResultSchema,
  LoadProjectSuccessSchema,
  MechanismSnapshotSchema,
  OutputChannelDescriptorSchema,
  PingSchema,
  PongSchema,
  ProtocolVersionSchema,
  RenameDatumCommandSchema,
  RenameDatumResultSchema,
  SaveProjectCommandSchema,
  SaveProjectResultSchema,
  ScrubCommandSchema,
  SimStateEnum,
  SimulationAction,
  SimulationControlCommandSchema,
  SimulationFrameSchema,
  SimulationSettingsSchema,
  SimulationStateEventSchema,
  SimulationTraceSchema,
  SolverSettingsSchema,
  SolverType,
  TimeSampleSchema,
  UpdateActuatorCommandSchema,
  UpdateActuatorResultSchema,
  UpdateJointCommandSchema,
  UpdateJointResultSchema,
  UpdateLoadCommandSchema,
  UpdateLoadResultSchema,
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
          config: {
            case: 'revolute',
            value: create(RevoluteJointConfigSchema, {
              angleLimit: create(RangeSchema, { lower: -3.14, upper: 3.14 }),
            }),
          },
        }),
      ],
      loads: [
        create(LoadSchema, {
          id: create(ElementIdSchema, { id: 'load-001' }),
          name: 'Force1',
          config: {
            case: 'pointForce',
            value: create(PointForceLoadSchema, {
              datumId: create(ElementIdSchema, { id: 'datum-001' }),
              vector: create(Vec3Schema, { x: 0, y: -10, z: 0 }),
              referenceFrame: ReferenceFrame.WORLD,
            }),
          },
        }),
      ],
      actuators: [
        create(ActuatorSchema, {
          id: create(ElementIdSchema, { id: 'actuator-001' }),
          name: 'Motor1',
          config: {
            case: 'revoluteMotor',
            value: create(RevoluteMotorActuatorSchema, {
              jointId: create(ElementIdSchema, { id: 'joint-001' }),
              controlMode: ActuatorControlMode.SPEED,
              commandValue: 2.5,
            }),
          },
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
    expect(restored.joints[0].config.case).toBe('revolute');
    if (restored.joints[0].config.case === 'revolute') {
      expect(restored.joints[0].config.value.angleLimit?.lower).toBe(-3.14);
      expect(restored.joints[0].config.value.angleLimit?.upper).toBe(3.14);
    }
    expect(restored.loads).toHaveLength(1);
    expect(restored.loads[0].config.case).toBe('pointForce');
    expect(restored.actuators).toHaveLength(1);
    expect(restored.actuators[0].config.case).toBe('revoluteMotor');
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
          partIndex: [1],
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
    expect(body.partIndex).toEqual([1]);
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

  it('should round-trip a CreateDatumFromFaceCommand in Command envelope', () => {
    const cmd = create(CommandSchema, {
      sequenceId: 53n,
      payload: {
        case: 'createDatumFromFace',
        value: create(CreateDatumFromFaceCommandSchema, {
          geometryId: create(ElementIdSchema, { id: 'geom-001' }),
          faceIndex: 7,
          name: 'Face Datum',
        }),
      },
    });

    const bytes = toBinary(CommandSchema, cmd);
    const restored = fromBinary(CommandSchema, bytes);

    expect(restored.payload.case).toBe('createDatumFromFace');
    if (restored.payload.case === 'createDatumFromFace') {
      expect(restored.payload.value.geometryId?.id).toBe('geom-001');
      expect(restored.payload.value.faceIndex).toBe(7);
      expect(restored.payload.value.name).toBe('Face Datum');
    }
  });

  it('should round-trip a CreateDatumFromFaceResult (success) in Event envelope', () => {
    const event = create(EventSchema, {
      sequenceId: 54n,
      payload: {
        case: 'createDatumFromFaceResult',
        value: create(CreateDatumFromFaceResultSchema, {
          result: {
            case: 'success',
            value: create(CreateDatumFromFaceSuccessSchema, {
              datum: create(DatumSchema, {
                id: create(ElementIdSchema, { id: 'datum-010' }),
                name: 'Face Datum',
                parentBodyId: create(ElementIdSchema, { id: 'body-001' }),
                localPose: create(PoseSchema, {
                  position: create(Vec3Schema, { x: 1, y: 2, z: 3 }),
                  orientation: create(QuatSchema, { w: 1, x: 0, y: 0, z: 0 }),
                }),
              }),
              faceIndex: 7,
              surfaceClass: FaceSurfaceClass.PLANAR,
              geometryId: create(ElementIdSchema, { id: 'geom-001' }),
            }),
          },
        }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.payload.case).toBe('createDatumFromFaceResult');
    if (restored.payload.case === 'createDatumFromFaceResult') {
      expect(restored.payload.value.result.case).toBe('success');
      if (restored.payload.value.result.case === 'success') {
        expect(restored.payload.value.result.value.faceIndex).toBe(7);
        expect(restored.payload.value.result.value.surfaceClass).toBe(FaceSurfaceClass.PLANAR);
        expect(restored.payload.value.result.value.geometryId?.id).toBe('geom-001');
        expect(restored.payload.value.result.value.datum?.id?.id).toBe('datum-010');
      }
    }
  });

  it('should round-trip a CreateDatumFromFaceResult (error) in Event envelope', () => {
    const event = create(EventSchema, {
      sequenceId: 55n,
      payload: {
        case: 'createDatumFromFaceResult',
        value: create(CreateDatumFromFaceResultSchema, {
          result: {
            case: 'errorMessage',
            value: 'Face index out of range',
          },
        }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.payload.case).toBe('createDatumFromFaceResult');
    if (restored.payload.case === 'createDatumFromFaceResult') {
      expect(restored.payload.value.result.case).toBe('errorMessage');
      if (restored.payload.value.result.case === 'errorMessage') {
        expect(restored.payload.value.result.value).toBe('Face index out of range');
      }
    }
  });

  it('should round-trip the toroidal face surface class enum', () => {
    const event = create(EventSchema, {
      sequenceId: 56n,
      payload: {
        case: 'createDatumFromFaceResult',
        value: create(CreateDatumFromFaceResultSchema, {
          result: {
            case: 'success',
            value: create(CreateDatumFromFaceSuccessSchema, {
              faceIndex: 3,
              surfaceClass: FaceSurfaceClass.TOROIDAL,
            }),
          },
        }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.payload.case).toBe('createDatumFromFaceResult');
    if (restored.payload.case === 'createDatumFromFaceResult') {
      expect(restored.payload.value.result.case).toBe('success');
      if (restored.payload.value.result.case === 'success') {
        expect(restored.payload.value.result.value.surfaceClass).toBe(FaceSurfaceClass.TOROIDAL);
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
          draft: create(JointSchema, {
            name: 'RevJoint1',
            type: JointType.REVOLUTE,
            parentDatumId: create(ElementIdSchema, { id: 'datum-001' }),
            childDatumId: create(ElementIdSchema, { id: 'datum-002' }),
            lowerLimit: -3.14,
            upperLimit: 3.14,
            config: {
              case: 'revolute',
              value: create(RevoluteJointConfigSchema, {
                angleLimit: create(RangeSchema, { lower: -3.14, upper: 3.14 }),
              }),
            },
          }),
        }),
      },
    });

    const bytes = toBinary(CommandSchema, cmd);
    const restored = fromBinary(CommandSchema, bytes);

    expect(restored.sequenceId).toBe(80n);
    expect(restored.payload.case).toBe('createJoint');
    if (restored.payload.case === 'createJoint') {
      expect(restored.payload.value.draft?.parentDatumId?.id).toBe('datum-001');
      expect(restored.payload.value.draft?.childDatumId?.id).toBe('datum-002');
      expect(restored.payload.value.draft?.type).toBe(JointType.REVOLUTE);
      expect(restored.payload.value.draft?.name).toBe('RevJoint1');
      expect(restored.payload.value.draft?.lowerLimit).toBe(-3.14);
      expect(restored.payload.value.draft?.upperLimit).toBe(3.14);
      expect(restored.payload.value.draft?.config.case).toBe('revolute');
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
              config: {
                case: 'revolute',
                value: create(RevoluteJointConfigSchema, {
                  angleLimit: create(RangeSchema, { lower: -3.14, upper: 3.14 }),
                }),
              },
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
          joint: create(JointSchema, {
            id: create(ElementIdSchema, { id: 'joint-001' }),
            name: 'UpdatedName',
            type: JointType.PRISMATIC,
            parentDatumId: create(ElementIdSchema, { id: 'datum-001' }),
            childDatumId: create(ElementIdSchema, { id: 'datum-002' }),
            config: {
              case: 'prismatic',
              value: create(PrismaticJointConfigSchema, {}),
            },
          }),
        }),
      },
    });

    const bytes = toBinary(CommandSchema, cmd);
    const restored = fromBinary(CommandSchema, bytes);

    expect(restored.sequenceId).toBe(83n);
    expect(restored.payload.case).toBe('updateJoint');
    if (restored.payload.case === 'updateJoint') {
      expect(restored.payload.value.joint?.id?.id).toBe('joint-001');
      expect(restored.payload.value.joint?.name).toBe('UpdatedName');
      expect(restored.payload.value.joint?.type).toBe(JointType.PRISMATIC);
      expect(restored.payload.value.joint?.config.case).toBe('prismatic');
      if (restored.payload.value.joint?.config.case === 'prismatic') {
        expect(restored.payload.value.joint.config.value.translationLimit).toBeUndefined();
      }
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
              config: {
                case: 'prismatic',
                value: create(PrismaticJointConfigSchema, {
                  translationLimit: create(RangeSchema, { lower: 0, upper: 100 }),
                }),
              },
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

describe('Load and actuator CRUD round-trip', () => {
  it('should round-trip load commands and results', () => {
    const load = create(LoadSchema, {
      id: create(ElementIdSchema, { id: 'load-001' }),
      name: 'Force1',
      config: {
        case: 'pointForce',
        value: create(PointForceLoadSchema, {
          datumId: create(ElementIdSchema, { id: 'datum-001' }),
          vector: create(Vec3Schema, { x: 5, y: -3, z: 0 }),
          referenceFrame: ReferenceFrame.WORLD,
        }),
      },
    });

    const createCmd = create(CommandSchema, {
      sequenceId: 86n,
      payload: {
        case: 'createLoad',
        value: create(CreateLoadCommandSchema, { draft: load }),
      },
    });
    const updateCmd = create(CommandSchema, {
      sequenceId: 87n,
      payload: {
        case: 'updateLoad',
        value: create(UpdateLoadCommandSchema, { load }),
      },
    });
    const deleteCmd = create(CommandSchema, {
      sequenceId: 88n,
      payload: {
        case: 'deleteLoad',
        value: create(DeleteLoadCommandSchema, {
          loadId: create(ElementIdSchema, { id: 'load-001' }),
        }),
      },
    });

    expect(fromBinary(CommandSchema, toBinary(CommandSchema, createCmd)).payload.case).toBe('createLoad');
    expect(fromBinary(CommandSchema, toBinary(CommandSchema, updateCmd)).payload.case).toBe('updateLoad');
    expect(fromBinary(CommandSchema, toBinary(CommandSchema, deleteCmd)).payload.case).toBe('deleteLoad');

    const createEvent = create(EventSchema, {
      sequenceId: 86n,
      payload: {
        case: 'createLoadResult',
        value: create(CreateLoadResultSchema, {
          result: { case: 'load', value: load },
        }),
      },
    });
    const updateEvent = create(EventSchema, {
      sequenceId: 87n,
      payload: {
        case: 'updateLoadResult',
        value: create(UpdateLoadResultSchema, {
          result: { case: 'load', value: load },
        }),
      },
    });
    const deleteEvent = create(EventSchema, {
      sequenceId: 88n,
      payload: {
        case: 'deleteLoadResult',
        value: create(DeleteLoadResultSchema, {
          result: {
            case: 'deletedId',
            value: create(ElementIdSchema, { id: 'load-001' }),
          },
        }),
      },
    });

    const restoredCreate = fromBinary(EventSchema, toBinary(EventSchema, createEvent));
    const restoredUpdate = fromBinary(EventSchema, toBinary(EventSchema, updateEvent));
    const restoredDelete = fromBinary(EventSchema, toBinary(EventSchema, deleteEvent));

    expect(restoredCreate.payload.case).toBe('createLoadResult');
    expect(restoredUpdate.payload.case).toBe('updateLoadResult');
    expect(restoredDelete.payload.case).toBe('deleteLoadResult');
  });

  it('should round-trip pointTorque load commands and results', () => {
    const load = create(LoadSchema, {
      id: create(ElementIdSchema, { id: 'load-002' }),
      name: 'Torque1',
      config: {
        case: 'pointTorque',
        value: create(PointTorqueLoadSchema, {
          datumId: create(ElementIdSchema, { id: 'datum-002' }),
          vector: create(Vec3Schema, { x: 0, y: 0, z: 10 }),
          referenceFrame: ReferenceFrame.DATUM_LOCAL,
        }),
      },
    });

    const createCmd = create(CommandSchema, {
      sequenceId: 92n,
      payload: {
        case: 'createLoad',
        value: create(CreateLoadCommandSchema, { draft: load }),
      },
    });
    const updateCmd = create(CommandSchema, {
      sequenceId: 93n,
      payload: {
        case: 'updateLoad',
        value: create(UpdateLoadCommandSchema, { load }),
      },
    });
    const deleteCmd = create(CommandSchema, {
      sequenceId: 94n,
      payload: {
        case: 'deleteLoad',
        value: create(DeleteLoadCommandSchema, {
          loadId: create(ElementIdSchema, { id: 'load-002' }),
        }),
      },
    });

    expect(fromBinary(CommandSchema, toBinary(CommandSchema, createCmd)).payload.case).toBe('createLoad');
    expect(fromBinary(CommandSchema, toBinary(CommandSchema, updateCmd)).payload.case).toBe('updateLoad');
    expect(fromBinary(CommandSchema, toBinary(CommandSchema, deleteCmd)).payload.case).toBe('deleteLoad');

    const createEvent = create(EventSchema, {
      sequenceId: 92n,
      payload: {
        case: 'createLoadResult',
        value: create(CreateLoadResultSchema, {
          result: { case: 'load', value: load },
        }),
      },
    });
    const updateEvent = create(EventSchema, {
      sequenceId: 93n,
      payload: {
        case: 'updateLoadResult',
        value: create(UpdateLoadResultSchema, {
          result: { case: 'load', value: load },
        }),
      },
    });
    const deleteEvent = create(EventSchema, {
      sequenceId: 94n,
      payload: {
        case: 'deleteLoadResult',
        value: create(DeleteLoadResultSchema, {
          result: {
            case: 'deletedId',
            value: create(ElementIdSchema, { id: 'load-002' }),
          },
        }),
      },
    });

    const restoredCreate = fromBinary(EventSchema, toBinary(EventSchema, createEvent));
    const restoredUpdate = fromBinary(EventSchema, toBinary(EventSchema, updateEvent));
    const restoredDelete = fromBinary(EventSchema, toBinary(EventSchema, deleteEvent));

    expect(restoredCreate.payload.case).toBe('createLoadResult');
    expect(restoredUpdate.payload.case).toBe('updateLoadResult');
    expect(restoredDelete.payload.case).toBe('deleteLoadResult');
  });

  it('should round-trip linearSpringDamper load commands and results', () => {
    const load = create(LoadSchema, {
      id: create(ElementIdSchema, { id: 'load-003' }),
      name: 'Spring1',
      config: {
        case: 'linearSpringDamper',
        value: create(LinearSpringDamperLoadSchema, {
          parentDatumId: create(ElementIdSchema, { id: 'datum-003' }),
          childDatumId: create(ElementIdSchema, { id: 'datum-004' }),
          stiffness: 500,
          damping: 10,
          restLength: 0.25,
        }),
      },
    });

    const createCmd = create(CommandSchema, {
      sequenceId: 95n,
      payload: {
        case: 'createLoad',
        value: create(CreateLoadCommandSchema, { draft: load }),
      },
    });
    const updateCmd = create(CommandSchema, {
      sequenceId: 96n,
      payload: {
        case: 'updateLoad',
        value: create(UpdateLoadCommandSchema, { load }),
      },
    });
    const deleteCmd = create(CommandSchema, {
      sequenceId: 97n,
      payload: {
        case: 'deleteLoad',
        value: create(DeleteLoadCommandSchema, {
          loadId: create(ElementIdSchema, { id: 'load-003' }),
        }),
      },
    });

    expect(fromBinary(CommandSchema, toBinary(CommandSchema, createCmd)).payload.case).toBe('createLoad');
    expect(fromBinary(CommandSchema, toBinary(CommandSchema, updateCmd)).payload.case).toBe('updateLoad');
    expect(fromBinary(CommandSchema, toBinary(CommandSchema, deleteCmd)).payload.case).toBe('deleteLoad');

    const createEvent = create(EventSchema, {
      sequenceId: 95n,
      payload: {
        case: 'createLoadResult',
        value: create(CreateLoadResultSchema, {
          result: { case: 'load', value: load },
        }),
      },
    });
    const updateEvent = create(EventSchema, {
      sequenceId: 96n,
      payload: {
        case: 'updateLoadResult',
        value: create(UpdateLoadResultSchema, {
          result: { case: 'load', value: load },
        }),
      },
    });
    const deleteEvent = create(EventSchema, {
      sequenceId: 97n,
      payload: {
        case: 'deleteLoadResult',
        value: create(DeleteLoadResultSchema, {
          result: {
            case: 'deletedId',
            value: create(ElementIdSchema, { id: 'load-003' }),
          },
        }),
      },
    });

    const restoredCreate = fromBinary(EventSchema, toBinary(EventSchema, createEvent));
    const restoredUpdate = fromBinary(EventSchema, toBinary(EventSchema, updateEvent));
    const restoredDelete = fromBinary(EventSchema, toBinary(EventSchema, deleteEvent));

    expect(restoredCreate.payload.case).toBe('createLoadResult');
    expect(restoredUpdate.payload.case).toBe('updateLoadResult');
    expect(restoredDelete.payload.case).toBe('deleteLoadResult');
  });

  it('should round-trip actuator commands and results', () => {
    const actuator = create(ActuatorSchema, {
      id: create(ElementIdSchema, { id: 'actuator-001' }),
      name: 'Motor1',
      config: {
        case: 'revoluteMotor',
        value: create(RevoluteMotorActuatorSchema, {
          jointId: create(ElementIdSchema, { id: 'joint-001' }),
          controlMode: ActuatorControlMode.EFFORT,
          commandValue: 12,
          effortLimit: 20,
        }),
      },
    });

    const createCmd = create(CommandSchema, {
      sequenceId: 89n,
      payload: {
        case: 'createActuator',
        value: create(CreateActuatorCommandSchema, { draft: actuator }),
      },
    });
    const updateCmd = create(CommandSchema, {
      sequenceId: 90n,
      payload: {
        case: 'updateActuator',
        value: create(UpdateActuatorCommandSchema, { actuator }),
      },
    });
    const deleteCmd = create(CommandSchema, {
      sequenceId: 91n,
      payload: {
        case: 'deleteActuator',
        value: create(DeleteActuatorCommandSchema, {
          actuatorId: create(ElementIdSchema, { id: 'actuator-001' }),
        }),
      },
    });

    expect(fromBinary(CommandSchema, toBinary(CommandSchema, createCmd)).payload.case).toBe('createActuator');
    expect(fromBinary(CommandSchema, toBinary(CommandSchema, updateCmd)).payload.case).toBe('updateActuator');
    expect(fromBinary(CommandSchema, toBinary(CommandSchema, deleteCmd)).payload.case).toBe('deleteActuator');

    const createEvent = create(EventSchema, {
      sequenceId: 89n,
      payload: {
        case: 'createActuatorResult',
        value: create(CreateActuatorResultSchema, {
          result: { case: 'actuator', value: actuator },
        }),
      },
    });
    const updateEvent = create(EventSchema, {
      sequenceId: 90n,
      payload: {
        case: 'updateActuatorResult',
        value: create(UpdateActuatorResultSchema, {
          result: { case: 'actuator', value: actuator },
        }),
      },
    });
    const deleteEvent = create(EventSchema, {
      sequenceId: 91n,
      payload: {
        case: 'deleteActuatorResult',
        value: create(DeleteActuatorResultSchema, {
          result: {
            case: 'deletedId',
            value: create(ElementIdSchema, { id: 'actuator-001' }),
          },
        }),
      },
    });

    const restoredCreate = fromBinary(EventSchema, toBinary(EventSchema, createEvent));
    const restoredUpdate = fromBinary(EventSchema, toBinary(EventSchema, updateEvent));
    const restoredDelete = fromBinary(EventSchema, toBinary(EventSchema, deleteEvent));

    expect(restoredCreate.payload.case).toBe('createActuatorResult');
    expect(restoredUpdate.payload.case).toBe('updateActuatorResult');
    expect(restoredDelete.payload.case).toBe('deleteActuatorResult');
  });

  it('should round-trip prismaticMotor actuator commands and results', () => {
    const actuator = create(ActuatorSchema, {
      id: create(ElementIdSchema, { id: 'actuator-002' }),
      name: 'LinearMotor1',
      config: {
        case: 'prismaticMotor',
        value: create(PrismaticMotorActuatorSchema, {
          jointId: create(ElementIdSchema, { id: 'joint-002' }),
          controlMode: ActuatorControlMode.POSITION,
          commandValue: 0.5,
          effortLimit: 100,
        }),
      },
    });

    const createCmd = create(CommandSchema, {
      sequenceId: 98n,
      payload: {
        case: 'createActuator',
        value: create(CreateActuatorCommandSchema, { draft: actuator }),
      },
    });
    const updateCmd = create(CommandSchema, {
      sequenceId: 99n,
      payload: {
        case: 'updateActuator',
        value: create(UpdateActuatorCommandSchema, { actuator }),
      },
    });
    const deleteCmd = create(CommandSchema, {
      sequenceId: 100n,
      payload: {
        case: 'deleteActuator',
        value: create(DeleteActuatorCommandSchema, {
          actuatorId: create(ElementIdSchema, { id: 'actuator-002' }),
        }),
      },
    });

    expect(fromBinary(CommandSchema, toBinary(CommandSchema, createCmd)).payload.case).toBe('createActuator');
    expect(fromBinary(CommandSchema, toBinary(CommandSchema, updateCmd)).payload.case).toBe('updateActuator');
    expect(fromBinary(CommandSchema, toBinary(CommandSchema, deleteCmd)).payload.case).toBe('deleteActuator');

    const createEvent = create(EventSchema, {
      sequenceId: 98n,
      payload: {
        case: 'createActuatorResult',
        value: create(CreateActuatorResultSchema, {
          result: { case: 'actuator', value: actuator },
        }),
      },
    });
    const updateEvent = create(EventSchema, {
      sequenceId: 99n,
      payload: {
        case: 'updateActuatorResult',
        value: create(UpdateActuatorResultSchema, {
          result: { case: 'actuator', value: actuator },
        }),
      },
    });
    const deleteEvent = create(EventSchema, {
      sequenceId: 100n,
      payload: {
        case: 'deleteActuatorResult',
        value: create(DeleteActuatorResultSchema, {
          result: {
            case: 'deletedId',
            value: create(ElementIdSchema, { id: 'actuator-002' }),
          },
        }),
      },
    });

    const restoredCreate = fromBinary(EventSchema, toBinary(EventSchema, createEvent));
    const restoredUpdate = fromBinary(EventSchema, toBinary(EventSchema, updateEvent));
    const restoredDelete = fromBinary(EventSchema, toBinary(EventSchema, deleteEvent));

    expect(restoredCreate.payload.case).toBe('createActuatorResult');
    expect(restoredUpdate.payload.case).toBe('updateActuatorResult');
    expect(restoredDelete.payload.case).toBe('deleteActuatorResult');
  });
});

describe('Simulation lifecycle round-trip', () => {
  it('should round-trip a CompileMechanismCommand', () => {
    const cmd = create(CommandSchema, {
      sequenceId: 100n,
      payload: {
        case: 'compileMechanism',
        value: create(CompileMechanismCommandSchema, {}),
      },
    });

    const bytes = toBinary(CommandSchema, cmd);
    const restored = fromBinary(CommandSchema, bytes);

    expect(restored.sequenceId).toBe(100n);
    expect(restored.payload.case).toBe('compileMechanism');
  });

  it('should round-trip CompileMechanismCommand with full SimulationSettings', () => {
    const cmd = create(CommandSchema, {
      sequenceId: 110n,
      payload: {
        case: 'compileMechanism',
        value: create(CompileMechanismCommandSchema, {
          settings: create(SimulationSettingsSchema, {
            timestep: 0.0005,
            gravity: create(Vec3Schema, { x: 0, y: -1.62, z: 0 }),
            duration: 5.0,
            solver: create(SolverSettingsSchema, {
              type: SolverType.SOLVER_APGD,
              maxIterations: 200,
              tolerance: 1e-10,
              integrator: IntegratorType.INTEGRATOR_HHT,
            }),
            contact: create(ContactSettingsSchema, {
              friction: 0.5,
              restitution: 0.3,
              compliance: 1e-5,
              damping: 0.01,
              enableContact: true,
            }),
          }),
        }),
      },
    });

    const bytes = toBinary(CommandSchema, cmd);
    const restored = fromBinary(CommandSchema, bytes);

    expect(restored.sequenceId).toBe(110n);
    expect(restored.payload.case).toBe('compileMechanism');
    if (restored.payload.case === 'compileMechanism') {
      const settings = restored.payload.value.settings!;
      expect(settings.timestep).toBeCloseTo(0.0005);
      expect(settings.gravity!.y).toBeCloseTo(-1.62);
      expect(settings.duration).toBeCloseTo(5.0);

      const solver = settings.solver!;
      expect(solver.type).toBe(SolverType.SOLVER_APGD);
      expect(solver.maxIterations).toBe(200);
      expect(solver.tolerance).toBeCloseTo(1e-10);
      expect(solver.integrator).toBe(IntegratorType.INTEGRATOR_HHT);

      const contact = settings.contact!;
      expect(contact.friction).toBeCloseTo(0.5);
      expect(contact.restitution).toBeCloseTo(0.3);
      expect(contact.compliance).toBeCloseTo(1e-5);
      expect(contact.damping).toBeCloseTo(0.01);
      expect(contact.enableContact).toBe(true);
    }
  });

  it('should round-trip CompileMechanismCommand with empty settings (proto3 defaults)', () => {
    const cmd = create(CommandSchema, {
      sequenceId: 111n,
      payload: {
        case: 'compileMechanism',
        value: create(CompileMechanismCommandSchema, {
          settings: create(SimulationSettingsSchema, {}),
        }),
      },
    });

    const bytes = toBinary(CommandSchema, cmd);
    const restored = fromBinary(CommandSchema, bytes);

    expect(restored.payload.case).toBe('compileMechanism');
    if (restored.payload.case === 'compileMechanism') {
      const settings = restored.payload.value.settings;
      expect(settings).toBeDefined();
      // Proto3 defaults: 0 for numbers, enum zero-value for enums
      expect(settings!.timestep).toBe(0);
      expect(settings!.duration).toBe(0);
    }
  });

  it('should round-trip CompilationResultEvent with structured diagnostics', () => {
    const event = create(EventSchema, {
      sequenceId: 112n,
      payload: {
        case: 'compilationResult',
        value: create(CompilationResultEventSchema, {
          success: true,
          structuredDiagnostics: [
            create(CompilationDiagnosticSchema, {
              severity: DiagnosticSeverity.DIAGNOSTIC_WARNING,
              message: 'Body "Arm" has no ground connection',
              affectedEntityIds: ['body-001', 'body-002'],
              suggestion: 'Add a Fixed joint to anchor this body',
              code: 'FLOATING_BODY',
            }),
            create(CompilationDiagnosticSchema, {
              severity: DiagnosticSeverity.DIAGNOSTIC_INFO,
              message: '2 bodies compiled successfully',
              affectedEntityIds: [],
              suggestion: '',
              code: 'COMPILE_OK',
            }),
          ],
        }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.payload.case).toBe('compilationResult');
    if (restored.payload.case === 'compilationResult') {
      const diags = restored.payload.value.structuredDiagnostics;
      expect(diags).toHaveLength(2);

      expect(diags[0].severity).toBe(DiagnosticSeverity.DIAGNOSTIC_WARNING);
      expect(diags[0].message).toBe('Body "Arm" has no ground connection');
      expect(diags[0].affectedEntityIds).toEqual(['body-001', 'body-002']);
      expect(diags[0].suggestion).toBe('Add a Fixed joint to anchor this body');
      expect(diags[0].code).toBe('FLOATING_BODY');

      expect(diags[1].severity).toBe(DiagnosticSeverity.DIAGNOSTIC_INFO);
      expect(diags[1].code).toBe('COMPILE_OK');
    }
  });

  it('should round-trip SolverSettings field integrity', () => {
    const settings = create(SolverSettingsSchema, {
      type: SolverType.SOLVER_MINRES,
      maxIterations: 500,
      tolerance: 1e-12,
      integrator: IntegratorType.INTEGRATOR_NEWMARK,
    });

    const bytes = toBinary(SolverSettingsSchema, settings);
    const restored = fromBinary(SolverSettingsSchema, bytes);

    expect(restored.type).toBe(SolverType.SOLVER_MINRES);
    expect(restored.maxIterations).toBe(500);
    expect(restored.tolerance).toBeCloseTo(1e-12);
    expect(restored.integrator).toBe(IntegratorType.INTEGRATOR_NEWMARK);
  });

  it('should round-trip SimulationControlCommand with each action', () => {
    const actions = [
      SimulationAction.PLAY,
      SimulationAction.PAUSE,
      SimulationAction.STEP,
      SimulationAction.RESET,
    ];

    for (const action of actions) {
      const cmd = create(CommandSchema, {
        sequenceId: 101n,
        payload: {
          case: 'simulationControl',
          value: create(SimulationControlCommandSchema, { action }),
        },
      });

      const bytes = toBinary(CommandSchema, cmd);
      const restored = fromBinary(CommandSchema, bytes);

      expect(restored.payload.case).toBe('simulationControl');
      if (restored.payload.case === 'simulationControl') {
        expect(restored.payload.value.action).toBe(action);
      }
    }
  });

  it('should round-trip CompilationResultEvent (success)', () => {
    const event = create(EventSchema, {
      sequenceId: 102n,
      payload: {
        case: 'compilationResult',
        value: create(CompilationResultEventSchema, {
          success: true,
          errorMessage: '',
          diagnostics: ['2 bodies compiled', '1 joint created'],
        }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.payload.case).toBe('compilationResult');
    if (restored.payload.case === 'compilationResult') {
      expect(restored.payload.value.success).toBe(true);
      expect(restored.payload.value.diagnostics).toEqual(['2 bodies compiled', '1 joint created']);
    }
  });

  it('should round-trip CompilationResultEvent (failure)', () => {
    const event = create(EventSchema, {
      sequenceId: 103n,
      payload: {
        case: 'compilationResult',
        value: create(CompilationResultEventSchema, {
          success: false,
          errorMessage: 'No bodies in mechanism',
        }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.payload.case).toBe('compilationResult');
    if (restored.payload.case === 'compilationResult') {
      expect(restored.payload.value.success).toBe(false);
      expect(restored.payload.value.errorMessage).toBe('No bodies in mechanism');
    }
  });

  it('should round-trip SimulationStateEvent', () => {
    const event = create(EventSchema, {
      sequenceId: 104n,
      payload: {
        case: 'simulationState',
        value: create(SimulationStateEventSchema, {
          state: SimStateEnum.SIM_STATE_RUNNING,
          simTime: 1.234,
          stepCount: 1234n,
        }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.payload.case).toBe('simulationState');
    if (restored.payload.case === 'simulationState') {
      expect(restored.payload.value.state).toBe(SimStateEnum.SIM_STATE_RUNNING);
      expect(restored.payload.value.simTime).toBe(1.234);
      expect(restored.payload.value.stepCount).toBe(1234n);
    }
  });

  it('should round-trip SimulationFrame with body poses and joint states', () => {
    const event = create(EventSchema, {
      sequenceId: 105n,
      payload: {
        case: 'simulationFrame',
        value: create(SimulationFrameSchema, {
          simTime: 0.5,
          stepCount: 500n,
          bodyPoses: [
            create(BodyPoseDataSchema, {
              bodyId: 'body-001',
              position: create(Vec3Schema, { x: 1, y: 2, z: 3 }),
              orientation: create(QuatSchema, { w: 1, x: 0, y: 0, z: 0 }),
            }),
          ],
          jointStates: [
            create(JointStateDataSchema, {
              jointId: 'joint-001',
              position: 1.57,
              velocity: 0.5,
              reactionForce: create(Vec3Schema, { x: 10, y: 0, z: 0 }),
              reactionTorque: create(Vec3Schema, { x: 0, y: 5, z: 0 }),
            }),
          ],
        }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.payload.case).toBe('simulationFrame');
    if (restored.payload.case === 'simulationFrame') {
      const frame = restored.payload.value;
      expect(frame.simTime).toBe(0.5);
      expect(frame.stepCount).toBe(500n);
      expect(frame.bodyPoses).toHaveLength(1);
      expect(frame.bodyPoses[0].bodyId).toBe('body-001');
      expect(frame.bodyPoses[0].position?.x).toBe(1);
      expect(frame.bodyPoses[0].orientation?.w).toBe(1);
      expect(frame.jointStates).toHaveLength(1);
      expect(frame.jointStates[0].jointId).toBe('joint-001');
      expect(frame.jointStates[0].position).toBe(1.57);
      expect(frame.jointStates[0].velocity).toBe(0.5);
      expect(frame.jointStates[0].reactionForce?.x).toBe(10);
      expect(frame.jointStates[0].reactionTorque?.y).toBe(5);
    }
  });
});

describe('Output channels round-trip', () => {
  it('should round-trip a ScrubCommand in Command envelope', () => {
    const cmd = create(CommandSchema, {
      sequenceId: 200n,
      payload: {
        case: 'scrub',
        value: create(ScrubCommandSchema, { time: 1.5 }),
      },
    });

    const bytes = toBinary(CommandSchema, cmd);
    const restored = fromBinary(CommandSchema, bytes);

    expect(restored.sequenceId).toBe(200n);
    expect(restored.payload.case).toBe('scrub');
    if (restored.payload.case === 'scrub') {
      expect(restored.payload.value.time).toBe(1.5);
    }
  });

  it('should round-trip SimulationTrace with scalar and vector samples', () => {
    const trace = create(SimulationTraceSchema, {
      channelId: 'joint/abc-123/position',
      samples: [
        create(TimeSampleSchema, {
          time: 0.0,
          value: { case: 'scalar', value: 1.57 },
        }),
        create(TimeSampleSchema, {
          time: 0.016,
          value: { case: 'scalar', value: 1.58 },
        }),
        create(TimeSampleSchema, {
          time: 0.033,
          value: {
            case: 'vector',
            value: create(Vec3Schema, { x: 10, y: 20, z: 30 }),
          },
        }),
      ],
    });

    const bytes = toBinary(SimulationTraceSchema, trace);
    const restored = fromBinary(SimulationTraceSchema, bytes);

    expect(restored.channelId).toBe('joint/abc-123/position');
    expect(restored.samples).toHaveLength(3);
    expect(restored.samples[0].time).toBe(0.0);
    expect(restored.samples[0].value.case).toBe('scalar');
    if (restored.samples[0].value.case === 'scalar') {
      expect(restored.samples[0].value.value).toBe(1.57);
    }
    expect(restored.samples[2].value.case).toBe('vector');
    if (restored.samples[2].value.case === 'vector') {
      expect(restored.samples[2].value.value.x).toBe(10);
      expect(restored.samples[2].value.value.y).toBe(20);
      expect(restored.samples[2].value.value.z).toBe(30);
    }
  });

  it('should round-trip SimulationTrace in Event envelope', () => {
    const event = create(EventSchema, {
      sequenceId: 201n,
      payload: {
        case: 'simulationTrace',
        value: create(SimulationTraceSchema, {
          channelId: 'joint/abc-123/velocity',
          samples: [
            create(TimeSampleSchema, {
              time: 0.5,
              value: { case: 'scalar', value: 3.14 },
            }),
          ],
        }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.payload.case).toBe('simulationTrace');
    if (restored.payload.case === 'simulationTrace') {
      expect(restored.payload.value.channelId).toBe('joint/abc-123/velocity');
      expect(restored.payload.value.samples).toHaveLength(1);
      expect(restored.payload.value.samples[0].time).toBe(0.5);
    }
  });

  it('should round-trip CompilationResultEvent with channels', () => {
    const event = create(EventSchema, {
      sequenceId: 202n,
      payload: {
        case: 'compilationResult',
        value: create(CompilationResultEventSchema, {
          success: true,
          errorMessage: '',
          diagnostics: ['Compiled 2 bodies'],
          channels: [
            create(OutputChannelDescriptorSchema, {
              channelId: 'joint/abc-123/position',
              name: 'Revolute1 Position',
              unit: 'rad',
              dataType: ChannelDataType.SCALAR,
            }),
            create(OutputChannelDescriptorSchema, {
              channelId: 'joint/abc-123/reaction_force',
              name: 'Revolute1 Reaction Force',
              unit: 'N',
              dataType: ChannelDataType.VEC3,
            }),
          ],
        }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.payload.case).toBe('compilationResult');
    if (restored.payload.case === 'compilationResult') {
      expect(restored.payload.value.success).toBe(true);
      expect(restored.payload.value.channels).toHaveLength(2);
      expect(restored.payload.value.channels[0].channelId).toBe('joint/abc-123/position');
      expect(restored.payload.value.channels[0].name).toBe('Revolute1 Position');
      expect(restored.payload.value.channels[0].unit).toBe('rad');
      expect(restored.payload.value.channels[0].dataType).toBe(ChannelDataType.SCALAR);
      expect(restored.payload.value.channels[1].channelId).toBe('joint/abc-123/reaction_force');
      expect(restored.payload.value.channels[1].dataType).toBe(ChannelDataType.VEC3);
    }
  });

  it('should round-trip OutputChannelDescriptor field integrity', () => {
    const desc = create(OutputChannelDescriptorSchema, {
      channelId: 'joint/def-456/velocity',
      name: 'Prismatic1 Velocity',
      unit: 'm/s',
      dataType: ChannelDataType.SCALAR,
    });

    const bytes = toBinary(OutputChannelDescriptorSchema, desc);
    const restored = fromBinary(OutputChannelDescriptorSchema, bytes);

    expect(restored.channelId).toBe('joint/def-456/velocity');
    expect(restored.name).toBe('Prismatic1 Velocity');
    expect(restored.unit).toBe('m/s');
    expect(restored.dataType).toBe(ChannelDataType.SCALAR);
  });
});

describe('Protocol coverage: Ping, Pong, HandshakeAck, EngineStatus, MechanismSnapshot', () => {
  it('should round-trip Ping command in Command envelope', () => {
    const cmd = create(CommandSchema, {
      sequenceId: 300n,
      payload: {
        case: 'ping',
        value: create(PingSchema, { timestamp: 1711000000000n }),
      },
    });

    const bytes = toBinary(CommandSchema, cmd);
    const restored = fromBinary(CommandSchema, bytes);

    expect(restored.sequenceId).toBe(300n);
    expect(restored.payload.case).toBe('ping');
    if (restored.payload.case === 'ping') {
      expect(restored.payload.value.timestamp).toBe(1711000000000n);
    }
  });

  it('should round-trip Pong event in Event envelope', () => {
    const event = create(EventSchema, {
      sequenceId: 301n,
      payload: {
        case: 'pong',
        value: create(PongSchema, { timestamp: 1711000000001n }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.sequenceId).toBe(301n);
    expect(restored.payload.case).toBe('pong');
    if (restored.payload.case === 'pong') {
      expect(restored.payload.value.timestamp).toBe(1711000000001n);
    }
  });

  it('should round-trip HandshakeAck (compatible=true)', () => {
    const event = create(EventSchema, {
      sequenceId: 302n,
      payload: {
        case: 'handshakeAck',
        value: create(HandshakeAckSchema, {
          compatible: true,
          engineProtocol: create(ProtocolVersionSchema, {
            name: 'motionlab',
            version: 1,
          }),
          engineVersion: '0.1.0-alpha',
        }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.payload.case).toBe('handshakeAck');
    if (restored.payload.case === 'handshakeAck') {
      expect(restored.payload.value.compatible).toBe(true);
      expect(restored.payload.value.engineProtocol?.name).toBe('motionlab');
      expect(restored.payload.value.engineProtocol?.version).toBe(1);
      expect(restored.payload.value.engineVersion).toBe('0.1.0-alpha');
    }
  });

  it('should round-trip HandshakeAck (compatible=false)', () => {
    const event = create(EventSchema, {
      sequenceId: 303n,
      payload: {
        case: 'handshakeAck',
        value: create(HandshakeAckSchema, {
          compatible: false,
          engineVersion: '0.2.0',
        }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.payload.case).toBe('handshakeAck');
    if (restored.payload.case === 'handshakeAck') {
      expect(restored.payload.value.compatible).toBe(false);
      expect(restored.payload.value.engineVersion).toBe('0.2.0');
    }
  });

  it('should round-trip EngineStatus event (READY)', () => {
    const event = create(EventSchema, {
      sequenceId: 304n,
      payload: {
        case: 'engineStatus',
        value: create(EngineStatusSchema, {
          state: EngineStatus_State.READY,
          message: 'Engine initialized',
        }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.payload.case).toBe('engineStatus');
    if (restored.payload.case === 'engineStatus') {
      expect(restored.payload.value.state).toBe(EngineStatus_State.READY);
      expect(restored.payload.value.message).toBe('Engine initialized');
    }
  });

  it('should round-trip EngineStatus all enum values', () => {
    const allStates = [
      EngineStatus_State.UNSPECIFIED,
      EngineStatus_State.INITIALIZING,
      EngineStatus_State.READY,
      EngineStatus_State.BUSY,
      EngineStatus_State.ERROR,
      EngineStatus_State.SHUTTING_DOWN,
    ];

    for (const state of allStates) {
      const msg = create(EngineStatusSchema, { state, message: `state=${state}` });
      const bytes = toBinary(EngineStatusSchema, msg);
      const restored = fromBinary(EngineStatusSchema, bytes);
      expect(restored.state).toBe(state);
    }
  });

  it('should round-trip MechanismSnapshot with populated mechanism', () => {
    const event = create(EventSchema, {
      sequenceId: 305n,
      payload: {
        case: 'mechanismSnapshot',
        value: create(MechanismSnapshotSchema, {
          mechanism: create(MechanismSchema, {
            id: create(ElementIdSchema, { id: 'mech-001' }),
            name: 'Snapshot Test',
            bodies: [
              create(BodySchema, {
                id: create(ElementIdSchema, { id: 'body-001' }),
                name: 'Ground',
              }),
            ],
            datums: [
              create(DatumSchema, {
                id: create(ElementIdSchema, { id: 'datum-001' }),
                name: 'Origin',
                parentBodyId: create(ElementIdSchema, { id: 'body-001' }),
              }),
            ],
            joints: [
              create(JointSchema, {
                id: create(ElementIdSchema, { id: 'joint-001' }),
                name: 'Rev1',
                type: JointType.REVOLUTE,
                parentDatumId: create(ElementIdSchema, { id: 'datum-001' }),
                childDatumId: create(ElementIdSchema, { id: 'datum-002' }),
              }),
            ],
          }),
        }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.payload.case).toBe('mechanismSnapshot');
    if (restored.payload.case === 'mechanismSnapshot') {
      const mech = restored.payload.value.mechanism;
      expect(mech).toBeDefined();
      expect(mech?.id?.id).toBe('mech-001');
      expect(mech?.name).toBe('Snapshot Test');
      expect(mech?.bodies).toHaveLength(1);
      expect(mech?.datums).toHaveLength(1);
      expect(mech?.joints).toHaveLength(1);
      expect(mech?.joints[0].type).toBe(JointType.REVOLUTE);
    }
  });

  it('should round-trip MechanismSnapshot with empty mechanism', () => {
    const snapshot = create(MechanismSnapshotSchema, {
      mechanism: create(MechanismSchema, {}),
    });

    const bytes = toBinary(MechanismSnapshotSchema, snapshot);
    const restored = fromBinary(MechanismSnapshotSchema, bytes);

    expect(restored.mechanism).toBeDefined();
    expect(restored.mechanism?.bodies).toHaveLength(0);
    expect(restored.mechanism?.datums).toHaveLength(0);
    expect(restored.mechanism?.joints).toHaveLength(0);
  });
});

describe('Project save/load round-trip (Epic 6.4)', () => {
  it('should round-trip SaveProjectCommand in Command envelope', () => {
    const cmd = create(CommandSchema, {
      sequenceId: 400n,
      payload: {
        case: 'saveProject',
        value: create(SaveProjectCommandSchema, {
          projectName: 'My Project',
        }),
      },
    });

    const bytes = toBinary(CommandSchema, cmd);
    const restored = fromBinary(CommandSchema, bytes);

    expect(restored.sequenceId).toBe(400n);
    expect(restored.payload.case).toBe('saveProject');
    if (restored.payload.case === 'saveProject') {
      expect(restored.payload.value.projectName).toBe('My Project');
    }
  });

  it('should round-trip LoadProjectCommand with binary data', () => {
    const projectData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const cmd = create(CommandSchema, {
      sequenceId: 401n,
      payload: {
        case: 'loadProject',
        value: create(LoadProjectCommandSchema, { projectData }),
      },
    });

    const bytes = toBinary(CommandSchema, cmd);
    const restored = fromBinary(CommandSchema, bytes);

    expect(restored.sequenceId).toBe(401n);
    expect(restored.payload.case).toBe('loadProject');
    if (restored.payload.case === 'loadProject') {
      expect(new Uint8Array(restored.payload.value.projectData)).toEqual(projectData);
    }
  });

  it('should round-trip SaveProjectResult with project_data (success)', () => {
    const projectBytes = new Uint8Array([10, 20, 30, 40]);
    const event = create(EventSchema, {
      sequenceId: 402n,
      payload: {
        case: 'saveProjectResult',
        value: create(SaveProjectResultSchema, {
          result: { case: 'projectData', value: projectBytes },
        }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.payload.case).toBe('saveProjectResult');
    if (restored.payload.case === 'saveProjectResult') {
      expect(restored.payload.value.result.case).toBe('projectData');
      if (restored.payload.value.result.case === 'projectData') {
        expect(new Uint8Array(restored.payload.value.result.value)).toEqual(projectBytes);
      }
    }
  });

  it('should round-trip SaveProjectResult with error_message (failure)', () => {
    const event = create(EventSchema, {
      sequenceId: 403n,
      payload: {
        case: 'saveProjectResult',
        value: create(SaveProjectResultSchema, {
          result: { case: 'errorMessage', value: 'Serialization failed' },
        }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.payload.case).toBe('saveProjectResult');
    if (restored.payload.case === 'saveProjectResult') {
      expect(restored.payload.value.result.case).toBe('errorMessage');
      if (restored.payload.value.result.case === 'errorMessage') {
        expect(restored.payload.value.result.value).toBe('Serialization failed');
      }
    }
  });

  it('should round-trip LoadProjectResult with success', () => {
    const event = create(EventSchema, {
      sequenceId: 404n,
      payload: {
        case: 'loadProjectResult',
        value: create(LoadProjectResultSchema, {
          result: {
            case: 'success',
            value: create(LoadProjectSuccessSchema, {
              mechanism: create(MechanismSchema, {
                id: create(ElementIdSchema, { id: 'mech-loaded' }),
                name: 'Loaded Mechanism',
                bodies: [
                  create(BodySchema, {
                    id: create(ElementIdSchema, { id: 'body-loaded' }),
                    name: 'LoadedBody',
                  }),
                ],
              }),
              bodies: [
                create(BodyImportResultSchema, {
                  bodyId: 'body-loaded',
                  name: 'LoadedBody',
                  displayMesh: create(DisplayMeshSchema, {
                    vertices: [1.0, 2.0, 3.0],
                    indices: [0],
                    normals: [0.0, 1.0, 0.0],
                  }),
                }),
              ],
              metadata: create(ProjectMetadataSchema, {
                name: 'Test Project',
                createdAt: '2026-03-19T00:00:00Z',
                modifiedAt: '2026-03-19T00:00:00Z',
              }),
            }),
          },
        }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.payload.case).toBe('loadProjectResult');
    if (restored.payload.case === 'loadProjectResult') {
      expect(restored.payload.value.result.case).toBe('success');
      if (restored.payload.value.result.case === 'success') {
        const success = restored.payload.value.result.value;
        expect(success.mechanism?.name).toBe('Loaded Mechanism');
        expect(success.mechanism?.bodies).toHaveLength(1);
        expect(success.bodies).toHaveLength(1);
        expect(success.bodies[0].bodyId).toBe('body-loaded');
        expect(success.bodies[0].displayMesh?.vertices).toEqual([1.0, 2.0, 3.0]);
        expect(success.metadata?.name).toBe('Test Project');
      }
    }
  });

  it('should round-trip LoadProjectResult with error', () => {
    const event = create(EventSchema, {
      sequenceId: 405n,
      payload: {
        case: 'loadProjectResult',
        value: create(LoadProjectResultSchema, {
          result: { case: 'errorMessage', value: 'Invalid project version' },
        }),
      },
    });

    const bytes = toBinary(EventSchema, event);
    const restored = fromBinary(EventSchema, bytes);

    expect(restored.payload.case).toBe('loadProjectResult');
    if (restored.payload.case === 'loadProjectResult') {
      expect(restored.payload.value.result.case).toBe('errorMessage');
      if (restored.payload.value.result.case === 'errorMessage') {
        expect(restored.payload.value.result.value).toBe('Invalid project version');
      }
    }
  });

  it('should round-trip ProjectFile message', () => {
    const pf = create(ProjectFileSchema, {
      version: 1,
      metadata: create(ProjectMetadataSchema, {
        name: 'Round-trip Test',
        createdAt: '2026-03-19T12:00:00Z',
        modifiedAt: '2026-03-19T12:00:00Z',
      }),
      mechanism: create(MechanismSchema, {
        id: create(ElementIdSchema, { id: 'mech-rt' }),
        name: 'RT Mechanism',
        bodies: [
          create(BodySchema, {
            id: create(ElementIdSchema, { id: 'b1' }),
            name: 'Body1',
            pose: create(PoseSchema, {
              position: create(Vec3Schema, { x: 1, y: 2, z: 3 }),
              orientation: create(QuatSchema, { w: 1, x: 0, y: 0, z: 0 }),
            }),
          }),
        ],
      }),
      bodyDisplayData: [
        create(BodyDisplayDataSchema, {
          bodyId: 'b1',
          displayMesh: create(DisplayMeshSchema, {
            vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
            indices: [0, 1, 2],
            normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
          }),
          partIndex: [1],
        }),
      ],
    });

    const bytes = toBinary(ProjectFileSchema, pf);
    const restored = fromBinary(ProjectFileSchema, bytes);

    expect(restored.version).toBe(1);
    expect(restored.metadata?.name).toBe('Round-trip Test');
    expect(restored.mechanism?.bodies).toHaveLength(1);
    expect(restored.bodyDisplayData).toHaveLength(1);
    expect(restored.bodyDisplayData[0].bodyId).toBe('b1');
    expect(Array.from(restored.bodyDisplayData[0].displayMesh?.vertices ?? [])).toEqual([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
    ]);
    expect(restored.bodyDisplayData[0].partIndex).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
// Epic 13: New command builder round-trips
// ---------------------------------------------------------------------------
import {
  createCreateBodyCommand,
  createDeleteBodyCommand,
  createAttachGeometryCommand,
  createDetachGeometryCommand,
  createUpdateBodyCommand,
  createUpdateMassPropertiesCommand,
  parseEvent,
} from '../transport.js';

describe('Epic 13 command builder round-trips', () => {
  it('createCreateBodyCommand round-trips', () => {
    const bytes = createCreateBodyCommand('TestBody', {
      massProperties: {
        mass: 2.5,
        centerOfMass: { x: 1, y: 0, z: 0 },
        ixx: 1, iyy: 2, izz: 3, ixy: 0, ixz: 0, iyz: 0,
      },
      pose: {
        position: { x: 0, y: 0, z: 1 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
      isFixed: true,
    });
    const cmd = fromBinary(CommandSchema, bytes);
    expect(cmd.payload.case).toBe('createBody');
    if (cmd.payload.case === 'createBody') {
      expect(cmd.payload.value.name).toBe('TestBody');
      expect(cmd.payload.value.isFixed).toBe(true);
      expect(cmd.payload.value.massProperties?.mass).toBe(2.5);
      expect(cmd.payload.value.pose?.position?.x).toBe(0);
      expect(cmd.payload.value.pose?.position?.z).toBe(1);
    }
  });

  it('createCreateBodyCommand with no options', () => {
    const bytes = createCreateBodyCommand('EmptyBody');
    const cmd = fromBinary(CommandSchema, bytes);
    expect(cmd.payload.case).toBe('createBody');
    if (cmd.payload.case === 'createBody') {
      expect(cmd.payload.value.name).toBe('EmptyBody');
      expect(cmd.payload.value.isFixed).toBe(false);
    }
  });

  it('createDeleteBodyCommand round-trips', () => {
    const bytes = createDeleteBodyCommand('body-123');
    const cmd = fromBinary(CommandSchema, bytes);
    expect(cmd.payload.case).toBe('deleteBody');
    if (cmd.payload.case === 'deleteBody') {
      expect(cmd.payload.value.bodyId?.id).toBe('body-123');
    }
  });

  it('createUpdateBodyCommand round-trips name and fixed state', () => {
    const bytes = createUpdateBodyCommand('body-123', {
      isFixed: true,
      name: 'Renamed Body',
    });
    const cmd = fromBinary(CommandSchema, bytes);
    expect(cmd.payload.case).toBe('updateBody');
    if (cmd.payload.case === 'updateBody') {
      expect(cmd.payload.value.bodyId?.id).toBe('body-123');
      expect(cmd.payload.value.isFixed).toBe(true);
      expect(cmd.payload.value.name).toBe('Renamed Body');
    }
  });

  it('createUpdateBodyCommand round-trips pose', () => {
    const bytes = createUpdateBodyCommand('body-456', {
      pose: {
        position: { x: 1, y: 2, z: 3 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
    });
    const cmd = fromBinary(CommandSchema, bytes);
    expect(cmd.payload.case).toBe('updateBody');
    if (cmd.payload.case === 'updateBody') {
      expect(cmd.payload.value.bodyId?.id).toBe('body-456');
      expect(cmd.payload.value.pose?.position?.x).toBe(1);
      expect(cmd.payload.value.pose?.position?.y).toBe(2);
      expect(cmd.payload.value.pose?.position?.z).toBe(3);
      expect(cmd.payload.value.pose?.orientation?.w).toBe(1);
      expect(cmd.payload.value.isFixed).toBeUndefined();
      expect(cmd.payload.value.name).toBeUndefined();
    }
  });

  it('createAttachGeometryCommand round-trips', () => {
    const bytes = createAttachGeometryCommand('geom-1', 'body-2', {
      position: { x: 1, y: 2, z: 3 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    });
    const cmd = fromBinary(CommandSchema, bytes);
    expect(cmd.payload.case).toBe('attachGeometry');
    if (cmd.payload.case === 'attachGeometry') {
      expect(cmd.payload.value.geometryId?.id).toBe('geom-1');
      expect(cmd.payload.value.targetBodyId?.id).toBe('body-2');
      expect(cmd.payload.value.localPose?.position?.x).toBe(1);
    }
  });

  it('createAttachGeometryCommand without localPose', () => {
    const bytes = createAttachGeometryCommand('geom-1', 'body-2');
    const cmd = fromBinary(CommandSchema, bytes);
    expect(cmd.payload.case).toBe('attachGeometry');
    if (cmd.payload.case === 'attachGeometry') {
      expect(cmd.payload.value.geometryId?.id).toBe('geom-1');
      expect(cmd.payload.value.localPose).toBeUndefined();
    }
  });

  it('createDetachGeometryCommand round-trips', () => {
    const bytes = createDetachGeometryCommand('geom-99');
    const cmd = fromBinary(CommandSchema, bytes);
    expect(cmd.payload.case).toBe('detachGeometry');
    if (cmd.payload.case === 'detachGeometry') {
      expect(cmd.payload.value.geometryId?.id).toBe('geom-99');
    }
  });

  it('createUpdateMassPropertiesCommand with override', () => {
    const bytes = createUpdateMassPropertiesCommand('body-1', true, {
      mass: 10,
      centerOfMass: { x: 0, y: 0, z: 0 },
      ixx: 5, iyy: 5, izz: 5, ixy: 0, ixz: 0, iyz: 0,
    });
    const cmd = fromBinary(CommandSchema, bytes);
    expect(cmd.payload.case).toBe('updateMassProperties');
    if (cmd.payload.case === 'updateMassProperties') {
      expect(cmd.payload.value.bodyId?.id).toBe('body-1');
      expect(cmd.payload.value.massOverride).toBe(true);
      expect(cmd.payload.value.massProperties?.mass).toBe(10);
    }
  });

  it('createUpdateMassPropertiesCommand revert to computed', () => {
    const bytes = createUpdateMassPropertiesCommand('body-1', false);
    const cmd = fromBinary(CommandSchema, bytes);
    expect(cmd.payload.case).toBe('updateMassProperties');
    if (cmd.payload.case === 'updateMassProperties') {
      expect(cmd.payload.value.bodyId?.id).toBe('body-1');
      expect(cmd.payload.value.massOverride).toBe(false);
      expect(cmd.payload.value.massProperties).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 3: CreatePrimitiveBody + ImportMode round-trips
// ---------------------------------------------------------------------------
import {
  createCreatePrimitiveBodyCommand,
  createImportAssetCommand,
} from '../transport.js';
import {
  BoxParamsSchema,
  GeometrySchema,
  PrimitiveParamsSchema,
  PrimitiveShape,
  PrimitiveSourceSchema,
} from '../generated/mechanism/mechanism_pb.js';
import { ImportMode } from '../generated/protocol/transport_pb.js';

describe('Phase 3: CreatePrimitiveBody command round-trips', () => {
  it('createCreatePrimitiveBodyCommand with box params', () => {
    const bytes = createCreatePrimitiveBodyCommand(
      'box',
      'TestBox',
      { x: 1, y: 2, z: 3 },
      { box: { width: 0.2, height: 0.3, depth: 0.4 } },
      2000,
    );
    const cmd = fromBinary(CommandSchema, bytes);
    expect(cmd.payload.case).toBe('createPrimitiveBody');
    if (cmd.payload.case === 'createPrimitiveBody') {
      expect(cmd.payload.value.shape).toBe(PrimitiveShape.BOX);
      expect(cmd.payload.value.name).toBe('TestBox');
      expect(cmd.payload.value.position?.x).toBe(1);
      expect(cmd.payload.value.position?.y).toBe(2);
      expect(cmd.payload.value.position?.z).toBe(3);
      expect(cmd.payload.value.density).toBe(2000);
      expect(cmd.payload.value.params?.shapeParams.case).toBe('box');
      if (cmd.payload.value.params?.shapeParams.case === 'box') {
        expect(cmd.payload.value.params.shapeParams.value.width).toBe(0.2);
        expect(cmd.payload.value.params.shapeParams.value.height).toBe(0.3);
        expect(cmd.payload.value.params.shapeParams.value.depth).toBe(0.4);
      }
    }
  });

  it('createCreatePrimitiveBodyCommand with cylinder params', () => {
    const bytes = createCreatePrimitiveBodyCommand(
      'cylinder',
      'TestCyl',
      { x: 0, y: 0, z: 0 },
      { cylinder: { radius: 0.05, height: 0.1 } },
    );
    const cmd = fromBinary(CommandSchema, bytes);
    expect(cmd.payload.case).toBe('createPrimitiveBody');
    if (cmd.payload.case === 'createPrimitiveBody') {
      expect(cmd.payload.value.shape).toBe(PrimitiveShape.CYLINDER);
      expect(cmd.payload.value.params?.shapeParams.case).toBe('cylinder');
      if (cmd.payload.value.params?.shapeParams.case === 'cylinder') {
        expect(cmd.payload.value.params.shapeParams.value.radius).toBe(0.05);
        expect(cmd.payload.value.params.shapeParams.value.height).toBe(0.1);
      }
    }
  });

  it('createCreatePrimitiveBodyCommand with sphere params', () => {
    const bytes = createCreatePrimitiveBodyCommand(
      'sphere',
      'TestSphere',
      { x: 0, y: 0, z: 0 },
      { sphere: { radius: 0.1 } },
    );
    const cmd = fromBinary(CommandSchema, bytes);
    expect(cmd.payload.case).toBe('createPrimitiveBody');
    if (cmd.payload.case === 'createPrimitiveBody') {
      expect(cmd.payload.value.shape).toBe(PrimitiveShape.SPHERE);
      expect(cmd.payload.value.params?.shapeParams.case).toBe('sphere');
      if (cmd.payload.value.params?.shapeParams.case === 'sphere') {
        expect(cmd.payload.value.params.shapeParams.value.radius).toBe(0.1);
      }
    }
  });
});

describe('Phase 3: PrimitiveSource on Geometry round-trips', () => {
  it('Geometry with primitive_source survives serialize/deserialize', () => {
    const geom = create(GeometrySchema, {
      id: create(ElementIdSchema, { id: 'geom-001' }),
      name: 'Box1',
      parentBodyId: create(ElementIdSchema, { id: 'body-001' }),
      faceCount: 6,
      primitiveSource: create(PrimitiveSourceSchema, {
        shape: PrimitiveShape.BOX,
        params: create(PrimitiveParamsSchema, {
          shapeParams: {
            case: 'box',
            value: create(BoxParamsSchema, { width: 0.1, height: 0.2, depth: 0.3 }),
          },
        }),
      }),
    });

    const bytes = toBinary(GeometrySchema, geom);
    const restored = fromBinary(GeometrySchema, bytes);
    expect(restored.primitiveSource?.shape).toBe(PrimitiveShape.BOX);
    expect(restored.primitiveSource?.params?.shapeParams.case).toBe('box');
    if (restored.primitiveSource?.params?.shapeParams.case === 'box') {
      expect(restored.primitiveSource.params.shapeParams.value.width).toBe(0.1);
      expect(restored.primitiveSource.params.shapeParams.value.height).toBe(0.2);
      expect(restored.primitiveSource.params.shapeParams.value.depth).toBe(0.3);
    }
  });
});

describe('Phase 3: ImportMode on ImportOptions round-trips', () => {
  it('ImportAssetCommand with importMode VISUAL_ONLY', () => {
    const bytes = createImportAssetCommand('test.step', {
      densityOverride: 1000,
      tessellationQuality: 0.1,
      unitSystem: 'millimeter',
      importMode: 'visual-only',
    });
    const cmd = fromBinary(CommandSchema, bytes);
    expect(cmd.payload.case).toBe('importAsset');
    if (cmd.payload.case === 'importAsset') {
      expect(cmd.payload.value.importOptions?.importMode).toBe(ImportMode.VISUAL_ONLY);
    }
  });

  it('ImportAssetCommand without importMode defaults to AUTO_BODY', () => {
    const bytes = createImportAssetCommand('test.step', {
      densityOverride: 1000,
      tessellationQuality: 0.1,
      unitSystem: 'millimeter',
    });
    const cmd = fromBinary(CommandSchema, bytes);
    expect(cmd.payload.case).toBe('importAsset');
    if (cmd.payload.case === 'importAsset') {
      expect(cmd.payload.value.importOptions?.importMode).toBe(ImportMode.AUTO_BODY);
    }
  });
});
