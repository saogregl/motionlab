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
  EventSchema,
  HandshakeSchema,
  ImportAssetCommandSchema,
  ImportAssetResultSchema,
  ImportOptionsSchema,
  ProtocolVersionSchema,
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
