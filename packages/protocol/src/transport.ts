import { create, fromBinary, toBinary, toJsonString } from '@bufbuild/protobuf';
import {
  ElementIdSchema,
  JointType,
  PoseSchema,
  QuatSchema,
  Vec3Schema,
} from './generated/mechanism/mechanism_pb.js';
import type { Event, SimulationAction } from './generated/protocol/transport_pb.js';
import {
  CommandSchema,
  CompileMechanismCommandSchema,
  CreateDatumCommandSchema,
  CreateDatumFromFaceCommandSchema,
  CreateJointCommandSchema,
  DeleteDatumCommandSchema,
  DeleteJointCommandSchema,
  EngineStatus_State,
  EventSchema,
  HandshakeSchema,
  ImportAssetCommandSchema,
  ImportOptionsSchema,
  LoadProjectCommandSchema,
  PingSchema,
  ProtocolVersionSchema,
  RenameDatumCommandSchema,
  SaveProjectCommandSchema,
  ScrubCommandSchema,
  SimulationControlCommandSchema,
  UpdateJointCommandSchema,
} from './generated/protocol/transport_pb.js';
import { PROTOCOL_NAME, PROTOCOL_VERSION } from './version.js';

/**
 * Creates a binary-encoded Command envelope containing a Handshake payload.
 */
export function createHandshakeCommand(sessionToken: string, sequenceId = 0n): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId,
    payload: {
      case: 'handshake',
      value: create(HandshakeSchema, {
        protocol: create(ProtocolVersionSchema, {
          name: PROTOCOL_NAME,
          version: PROTOCOL_VERSION,
        }),
        sessionToken,
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a Ping payload.
 */
export function createPingCommand(sequenceId: bigint): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId,
    payload: {
      case: 'ping',
      value: create(PingSchema, {
        timestamp: BigInt(Date.now()),
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing an ImportAsset payload.
 */
export function createImportAssetCommand(
  filePath: string,
  options?: { densityOverride?: number; tessellationQuality?: number; unitSystem?: string },
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'importAsset',
      value: create(ImportAssetCommandSchema, {
        filePath,
        importOptions: options
          ? create(ImportOptionsSchema, {
              densityOverride: options.densityOverride ?? 0,
              tessellationQuality: options.tessellationQuality ?? 0,
              unitSystem: options.unitSystem ?? '',
            })
          : undefined,
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Parses a binary Event envelope from an ArrayBuffer.
 */
export function parseEvent(data: ArrayBuffer): Event {
  return fromBinary(EventSchema, new Uint8Array(data));
}

/**
 * Returns a JSON string representation of an Event for debug logging.
 */
export function eventToDebugJson(evt: Event): string {
  return toJsonString(EventSchema, evt);
}

/**
 * Creates a binary-encoded Command envelope containing a CreateDatum payload.
 */
export function createCreateDatumCommand(
  parentBodyId: string,
  localPose: {
    position: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
  },
  name: string,
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'createDatum',
      value: create(CreateDatumCommandSchema, {
        parentBodyId: create(ElementIdSchema, { id: parentBodyId }),
        localPose: create(PoseSchema, {
          position: create(Vec3Schema, localPose.position),
          orientation: create(QuatSchema, {
            w: localPose.orientation.w,
            x: localPose.orientation.x,
            y: localPose.orientation.y,
            z: localPose.orientation.z,
          }),
        }),
        name,
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a CreateDatumFromFace payload.
 */
export function createCreateDatumFromFaceCommand(
  parentBodyId: string,
  faceIndex: number,
  name: string,
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'createDatumFromFace',
      value: create(CreateDatumFromFaceCommandSchema, {
        parentBodyId: create(ElementIdSchema, { id: parentBodyId }),
        faceIndex,
        name,
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a DeleteDatum payload.
 */
export function createDeleteDatumCommand(datumId: string, sequenceId?: bigint): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'deleteDatum',
      value: create(DeleteDatumCommandSchema, {
        datumId: create(ElementIdSchema, { id: datumId }),
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a RenameDatum payload.
 */
export function createRenameDatumCommand(
  datumId: string,
  name: string,
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'renameDatum',
      value: create(RenameDatumCommandSchema, {
        datumId: create(ElementIdSchema, { id: datumId }),
        name,
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a CreateJoint payload.
 */
export function createCreateJointCommand(
  parentDatumId: string,
  childDatumId: string,
  type: JointType,
  name: string,
  lowerLimit: number,
  upperLimit: number,
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'createJoint',
      value: create(CreateJointCommandSchema, {
        parentDatumId: create(ElementIdSchema, { id: parentDatumId }),
        childDatumId: create(ElementIdSchema, { id: childDatumId }),
        type,
        name,
        lowerLimit,
        upperLimit,
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing an UpdateJoint payload.
 */
export function createUpdateJointCommand(
  jointId: string,
  updates: { name?: string; type?: JointType; lowerLimit?: number; upperLimit?: number },
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'updateJoint',
      value: create(UpdateJointCommandSchema, {
        jointId: create(ElementIdSchema, { id: jointId }),
        name: updates.name,
        type: updates.type,
        lowerLimit: updates.lowerLimit,
        upperLimit: updates.upperLimit,
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a DeleteJoint payload.
 */
export function createDeleteJointCommand(jointId: string, sequenceId?: bigint): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'deleteJoint',
      value: create(DeleteJointCommandSchema, {
        jointId: create(ElementIdSchema, { id: jointId }),
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Maps a proto JointType enum to a store-friendly string.
 */
export function mapJointType(type: JointType): 'revolute' | 'prismatic' | 'fixed' {
  switch (type) {
    case JointType.REVOLUTE:
      return 'revolute';
    case JointType.PRISMATIC:
      return 'prismatic';
    case JointType.FIXED:
      return 'fixed';
    default:
      return 'fixed';
  }
}

/**
 * Maps a store-friendly joint type string to the proto JointType enum.
 */
export function toProtoJointType(type: string): JointType {
  switch (type) {
    case 'revolute':
      return JointType.REVOLUTE;
    case 'prismatic':
      return JointType.PRISMATIC;
    case 'fixed':
      return JointType.FIXED;
    default:
      return JointType.UNSPECIFIED;
  }
}

/**
 * Maps a proto EngineStatus.State enum value to a store-friendly string.
 */
export function engineStateToString(state: EngineStatus_State): string {
  switch (state) {
    case EngineStatus_State.READY:
      return 'ready';
    case EngineStatus_State.INITIALIZING:
      return 'initializing';
    case EngineStatus_State.BUSY:
      return 'busy';
    case EngineStatus_State.ERROR:
      return 'error';
    case EngineStatus_State.SHUTTING_DOWN:
      return 'shutting_down';
    default:
      return 'unknown';
  }
}

/**
 * Creates a binary-encoded Command envelope containing a CompileMechanism payload.
 */
export function createCompileMechanismCommand(sequenceId?: bigint): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'compileMechanism',
      value: create(CompileMechanismCommandSchema, {}),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a SimulationControl payload.
 */
export function createSimulationControlCommand(
  action: SimulationAction,
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'simulationControl',
      value: create(SimulationControlCommandSchema, { action }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a Scrub payload.
 */
export function createScrubCommand(time: number, sequenceId?: bigint): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'scrub',
      value: create(ScrubCommandSchema, { time }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a SaveProject payload.
 */
export function createSaveProjectCommand(projectName: string, sequenceId?: bigint): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'saveProject',
      value: create(SaveProjectCommandSchema, { projectName }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a LoadProject payload.
 */
export function createLoadProjectCommand(projectData: Uint8Array, sequenceId?: bigint): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'loadProject',
      value: create(LoadProjectCommandSchema, { projectData }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

export { SimulationAction } from './generated/protocol/transport_pb.js';
