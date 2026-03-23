import { create, fromBinary, toBinary, toJsonString } from '@bufbuild/protobuf';
import {
  ActuatorSchema,
  ElementIdSchema,
  JointSchema,
  JointType,
  LoadSchema,
  MassPropertiesSchema,
  PoseSchema,
  QuatSchema,
  Vec3Schema,
} from './generated/mechanism/mechanism_pb.js';
import type { Actuator, Joint, Load } from './generated/mechanism/mechanism_pb.js';
import type { Event, SimulationAction } from './generated/protocol/transport_pb.js';
import {
  CommandSchema,
  CompileMechanismCommandSchema,
  CreateActuatorCommandSchema,
  CreateDatumCommandSchema,
  CreateDatumFromFaceCommandSchema,
  CreateJointCommandSchema,
  CreateLoadCommandSchema,
  DeleteDatumCommandSchema,
  DeleteActuatorCommandSchema,
  DeleteJointCommandSchema,
  DeleteLoadCommandSchema,
  EngineStatus_State,
  EventSchema,
  HandshakeSchema,
  ImportAssetCommandSchema,
  ImportOptionsSchema,
  LoadProjectCommandSchema,
  NewProjectCommandSchema,
  PingSchema,
  RelocateAssetCommandSchema,
  ProtocolVersionSchema,
  RenameDatumCommandSchema,
  SaveProjectCommandSchema,
  ScrubCommandSchema,
  SimulationControlCommandSchema,
  SimulationSettingsSchema,
  SolverSettingsSchema,
  SolverType,
  ContactSettingsSchema,
  IntegratorType,
  CompilationDiagnosticSchema,
  DiagnosticSeverity,
  AttachGeometryCommandSchema,
  CreateBodyCommandSchema,
  DeleteBodyCommandSchema,
  DetachGeometryCommandSchema,
  UpdateActuatorCommandSchema,
  UpdateBodyCommandSchema,
  UpdateDatumPoseCommandSchema,
  UpdateJointCommandSchema,
  UpdateLoadCommandSchema,
  UpdateMassPropertiesCommandSchema,
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
 * Creates a binary-encoded Command envelope containing an UpdateDatumPose payload.
 */
export function createUpdateDatumPoseCommand(
  datumId: string,
  newLocalPose: {
    position: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
  },
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'updateDatumPose',
      value: create(UpdateDatumPoseCommandSchema, {
        datumId: create(ElementIdSchema, { id: datumId }),
        newLocalPose: create(PoseSchema, {
          position: create(Vec3Schema, newLocalPose.position),
          orientation: create(QuatSchema, {
            w: newLocalPose.orientation.w,
            x: newLocalPose.orientation.x,
            y: newLocalPose.orientation.y,
            z: newLocalPose.orientation.z,
          }),
        }),
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a CreateJoint payload.
 */
export function createCreateJointCommand(
  draft: Joint,
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'createJoint',
      value: create(CreateJointCommandSchema, {
        draft: create(JointSchema, draft),
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing an UpdateJoint payload.
 */
export function createUpdateJointCommand(
  joint: Joint,
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'updateJoint',
      value: create(UpdateJointCommandSchema, {
        joint: create(JointSchema, joint),
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
 * Creates a binary-encoded Command envelope containing a CreateLoad payload.
 */
export function createCreateLoadCommand(draft: Load, sequenceId?: bigint): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'createLoad',
      value: create(CreateLoadCommandSchema, {
        draft: create(LoadSchema, draft),
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing an UpdateLoad payload.
 */
export function createUpdateLoadCommand(load: Load, sequenceId?: bigint): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'updateLoad',
      value: create(UpdateLoadCommandSchema, {
        load: create(LoadSchema, load),
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a DeleteLoad payload.
 */
export function createDeleteLoadCommand(loadId: string, sequenceId?: bigint): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'deleteLoad',
      value: create(DeleteLoadCommandSchema, {
        loadId: create(ElementIdSchema, { id: loadId }),
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a CreateActuator payload.
 */
export function createCreateActuatorCommand(draft: Actuator, sequenceId?: bigint): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'createActuator',
      value: create(CreateActuatorCommandSchema, {
        draft: create(ActuatorSchema, draft),
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing an UpdateActuator payload.
 */
export function createUpdateActuatorCommand(
  actuator: Actuator,
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'updateActuator',
      value: create(UpdateActuatorCommandSchema, {
        actuator: create(ActuatorSchema, actuator),
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a DeleteActuator payload.
 */
export function createDeleteActuatorCommand(
  actuatorId: string,
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'deleteActuator',
      value: create(DeleteActuatorCommandSchema, {
        actuatorId: create(ElementIdSchema, { id: actuatorId }),
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Maps a proto JointType enum to a store-friendly string.
 */
export function mapJointType(
  type: JointType,
):
  | 'revolute'
  | 'prismatic'
  | 'fixed'
  | 'spherical'
  | 'cylindrical'
  | 'planar'
  | 'universal'
  | 'distance'
  | 'point-line'
  | 'point-plane' {
  switch (type) {
    case JointType.REVOLUTE:
      return 'revolute';
    case JointType.PRISMATIC:
      return 'prismatic';
    case JointType.FIXED:
      return 'fixed';
    case JointType.SPHERICAL:
      return 'spherical';
    case JointType.CYLINDRICAL:
      return 'cylindrical';
    case JointType.PLANAR:
      return 'planar';
    case JointType.UNIVERSAL:
      return 'universal';
    case JointType.DISTANCE:
      return 'distance';
    case JointType.POINT_LINE:
      return 'point-line';
    case JointType.POINT_PLANE:
      return 'point-plane';
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
    case 'spherical':
      return JointType.SPHERICAL;
    case 'cylindrical':
      return JointType.CYLINDRICAL;
    case 'planar':
      return JointType.PLANAR;
    case 'universal':
      return JointType.UNIVERSAL;
    case 'distance':
      return JointType.DISTANCE;
    case 'point-line':
      return JointType.POINT_LINE;
    case 'point-plane':
      return JointType.POINT_PLANE;
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

export interface SolverSettingsInput {
  type?: 'psor' | 'barzilai-borwein' | 'apgd' | 'minres';
  maxIterations?: number;
  tolerance?: number;
  integrator?: 'euler-implicit-linearized' | 'hht' | 'newmark';
}

export interface ContactSettingsInput {
  friction?: number;
  restitution?: number;
  compliance?: number;
  damping?: number;
  enableContact?: boolean;
}

export interface SimulationSettingsInput {
  timestep?: number;
  gravity?: { x: number; y: number; z: number };
  duration?: number;
  solver?: SolverSettingsInput;
  contact?: ContactSettingsInput;
}

function mapSolverType(type: SolverSettingsInput['type']): SolverType {
  switch (type) {
    case 'barzilai-borwein': return SolverType.SOLVER_BARZILAI_BORWEIN;
    case 'apgd': return SolverType.SOLVER_APGD;
    case 'minres': return SolverType.SOLVER_MINRES;
    case 'psor': default: return SolverType.SOLVER_PSOR;
  }
}

function mapIntegratorType(type: SolverSettingsInput['integrator']): IntegratorType {
  switch (type) {
    case 'hht': return IntegratorType.INTEGRATOR_HHT;
    case 'newmark': return IntegratorType.INTEGRATOR_NEWMARK;
    case 'euler-implicit-linearized': default: return IntegratorType.INTEGRATOR_EULER_IMPLICIT_LINEARIZED;
  }
}

/**
 * Creates a binary-encoded Command envelope containing a CompileMechanism payload.
 */
export function createCompileMechanismCommand(
  settings?: SimulationSettingsInput,
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'compileMechanism',
      value: create(CompileMechanismCommandSchema, {
        settings: settings
          ? create(SimulationSettingsSchema, {
              timestep: settings.timestep ?? 0,
              gravity: settings.gravity ? create(Vec3Schema, settings.gravity) : undefined,
              duration: settings.duration ?? 0,
              solver: settings.solver
                ? create(SolverSettingsSchema, {
                    type: mapSolverType(settings.solver.type),
                    maxIterations: settings.solver.maxIterations ?? 0,
                    tolerance: settings.solver.tolerance ?? 0,
                    integrator: mapIntegratorType(settings.solver.integrator),
                  })
                : undefined,
              contact: settings.contact
                ? create(ContactSettingsSchema, {
                    friction: settings.contact.friction ?? 0,
                    restitution: settings.contact.restitution ?? 0,
                    compliance: settings.contact.compliance ?? 0,
                    damping: settings.contact.damping ?? 0,
                    enableContact: settings.contact.enableContact ?? true,
                  })
                : undefined,
            })
          : undefined,
      }),
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

/**
 * Creates a binary-encoded Command envelope containing a NewProject payload.
 */
export function createNewProjectCommand(projectName: string, sequenceId?: bigint): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'newProject',
      value: create(NewProjectCommandSchema, { projectName }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing an UpdateBody payload.
 */
export function createUpdateBodyCommand(
  bodyId: string,
  updates: { isFixed?: boolean; name?: string },
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'updateBody',
      value: create(UpdateBodyCommandSchema, {
        bodyId: create(ElementIdSchema, { id: bodyId }),
        isFixed: updates.isFixed,
        name: updates.name,
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a RelocateAsset payload.
 */
export function createRelocateAssetCommand(
  bodyId: string,
  newFilePath: string,
  importOptions?: { densityOverride?: number; tessellationQuality?: number; unitSystem?: string },
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'relocateAsset',
      value: create(RelocateAssetCommandSchema, {
        bodyId,
        newFilePath,
        importOptions: importOptions
          ? create(ImportOptionsSchema, {
              densityOverride: importOptions.densityOverride ?? 0,
              tessellationQuality: importOptions.tessellationQuality ?? 0,
              unitSystem: importOptions.unitSystem ?? '',
            })
          : undefined,
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a CreateBody payload.
 */
export function createCreateBodyCommand(
  name: string,
  options?: {
    massProperties?: { mass: number; centerOfMass: { x: number; y: number; z: number }; ixx: number; iyy: number; izz: number; ixy: number; ixz: number; iyz: number };
    pose?: { position: { x: number; y: number; z: number }; orientation: { x: number; y: number; z: number; w: number } };
    isFixed?: boolean;
  },
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'createBody',
      value: create(CreateBodyCommandSchema, {
        name,
        massProperties: options?.massProperties
          ? create(MassPropertiesSchema, {
              mass: options.massProperties.mass,
              centerOfMass: create(Vec3Schema, options.massProperties.centerOfMass),
              ixx: options.massProperties.ixx,
              iyy: options.massProperties.iyy,
              izz: options.massProperties.izz,
              ixy: options.massProperties.ixy,
              ixz: options.massProperties.ixz,
              iyz: options.massProperties.iyz,
            })
          : undefined,
        pose: options?.pose
          ? create(PoseSchema, {
              position: create(Vec3Schema, options.pose.position),
              orientation: create(QuatSchema, options.pose.orientation),
            })
          : undefined,
        isFixed: options?.isFixed ?? false,
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a DeleteBody payload.
 */
export function createDeleteBodyCommand(
  bodyId: string,
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'deleteBody',
      value: create(DeleteBodyCommandSchema, {
        bodyId: create(ElementIdSchema, { id: bodyId }),
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing an AttachGeometry payload.
 */
export function createAttachGeometryCommand(
  geometryId: string,
  targetBodyId: string,
  localPose?: { position: { x: number; y: number; z: number }; orientation: { x: number; y: number; z: number; w: number } },
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'attachGeometry',
      value: create(AttachGeometryCommandSchema, {
        geometryId: create(ElementIdSchema, { id: geometryId }),
        targetBodyId: create(ElementIdSchema, { id: targetBodyId }),
        localPose: localPose
          ? create(PoseSchema, {
              position: create(Vec3Schema, localPose.position),
              orientation: create(QuatSchema, localPose.orientation),
            })
          : undefined,
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a DetachGeometry payload.
 */
export function createDetachGeometryCommand(
  geometryId: string,
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'detachGeometry',
      value: create(DetachGeometryCommandSchema, {
        geometryId: create(ElementIdSchema, { id: geometryId }),
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing an UpdateMassProperties payload.
 */
export function createUpdateMassPropertiesCommand(
  bodyId: string,
  massOverride: boolean,
  massProperties?: { mass: number; centerOfMass: { x: number; y: number; z: number }; ixx: number; iyy: number; izz: number; ixy: number; ixz: number; iyz: number },
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'updateMassProperties',
      value: create(UpdateMassPropertiesCommandSchema, {
        bodyId: create(ElementIdSchema, { id: bodyId }),
        massOverride,
        massProperties: massProperties
          ? create(MassPropertiesSchema, {
              mass: massProperties.mass,
              centerOfMass: create(Vec3Schema, massProperties.centerOfMass),
              ixx: massProperties.ixx,
              iyy: massProperties.iyy,
              izz: massProperties.izz,
              ixy: massProperties.ixy,
              ixz: massProperties.ixz,
              iyz: massProperties.iyz,
            })
          : undefined,
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

export { SimulationAction } from './generated/protocol/transport_pb.js';
