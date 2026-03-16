import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { describe, expect, it } from 'vitest';
import {
  BodySchema,
  DatumSchema,
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
  CommandSchema,
  HandshakeSchema,
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
});
