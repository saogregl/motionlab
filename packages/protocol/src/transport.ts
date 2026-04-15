import { create, fromBinary, toBinary, toJsonString } from '@bufbuild/protobuf';
import type { Actuator, Joint, Load, Sensor } from './generated/mechanism/mechanism_pb.js';
import {
  ActuatorSchema,
  BoxParamsSchema,
  CollisionConfigSchema,
  CollisionShapeType,
  CylinderParamsSchema,
  ElementIdSchema,
  JointSchema,
  JointType,
  LoadSchema,
  MassPropertiesSchema,
  MotionType,
  PoseSchema,
  PrimitiveParamsSchema,
  PrimitiveShape,
  QuatSchema,
  SensorAxis,
  SensorSchema,
  SensorType,
  SphereParamsSchema,
  Vec3Schema,
} from './generated/mechanism/mechanism_pb.js';
import type { Command, Event, SimulationAction } from './generated/protocol/transport_pb.js';
import {
  AnalyzeFacePairCommandSchema,
  AttachGeometryCommandSchema,
  CommandSchema,
  CompilationDiagnosticSchema,
  CompileMechanismCommandSchema,
  ContactSettingsSchema,
  CreateActuatorCommandSchema,
  CreateBodyCommandSchema,
  CreateDatumCommandSchema,
  CreateDatumFromFaceCommandSchema,
  CreateJointCommandSchema,
  CreateLoadCommandSchema,
  CreatePrimitiveBodyCommandSchema,
  CreateSensorCommandSchema,
  DeleteActuatorCommandSchema,
  DeleteBodyCommandSchema,
  DeleteDatumCommandSchema,
  DeleteGeometryCommandSchema,
  DeleteJointCommandSchema,
  DeleteLoadCommandSchema,
  DeleteSensorCommandSchema,
  DetachGeometryCommandSchema,
  DiagnosticSeverity,
  EngineStatus_State,
  EventSchema,
  FacePairAlignment,
  HandshakeSchema,
  ImportAssetCommandSchema,
  ImportMode,
  ImportOptionsSchema,
  IntegratorType,
  LoadProjectCommandSchema,
  MakeCompoundBodyCommandSchema,
  NewProjectCommandSchema,
  PingSchema,
  PlaceAssetInSceneCommandSchema,
  PrepareFacePickingCommandSchema,
  ProtocolVersionSchema,
  RelocateAssetCommandSchema,
  RenameDatumCommandSchema,
  RenameGeometryCommandSchema,
  ReparentGeometryCommandSchema,
  SaveProjectCommandSchema,
  ScrubCommandSchema,
  SimulationControlCommandSchema,
  SimulationSettingsSchema,
  SolverSettingsSchema,
  SolverType,
  SplitBodyCommandSchema,
  UpdateActuatorCommandSchema,
  UpdateBodyCommandSchema,
  UpdateCollisionConfigCommandSchema,
  UpdateDatumPoseCommandSchema,
  UpdateGeometryPoseCommandSchema,
  UpdateJointCommandSchema,
  UpdateLoadCommandSchema,
  UpdateMassPropertiesCommandSchema,
  UpdatePrimitiveCommandSchema,
  UpdateSensorCommandSchema,
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
export type ImportModeType = 'auto-body' | 'visual-only';

export function createImportAssetCommand(
  filePath: string,
  options?: {
    densityOverride?: number;
    tessellationQuality?: number;
    unitSystem?: string;
    importMode?: ImportModeType;
  },
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
              importMode:
                options.importMode === 'visual-only'
                  ? ImportMode.VISUAL_ONLY
                  : ImportMode.AUTO_BODY,
            })
          : undefined,
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a PlaceAssetInScene payload.
 */
export function createPlaceAssetInSceneCommand(
  assetId: string,
  position: { x: number; y: number; z: number },
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'placeAssetInScene',
      value: create(PlaceAssetInSceneCommandSchema, {
        assetId,
        position: create(Vec3Schema, position),
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
 * Parses a binary Command envelope from an ArrayBuffer or Uint8Array.
 */
export function parseCommand(data: ArrayBuffer | Uint8Array): Command {
  return fromBinary(CommandSchema, data instanceof Uint8Array ? data : new Uint8Array(data));
}

/**
 * Returns a JSON string representation of a Command for debug logging.
 */
export function commandToDebugJson(cmd: Command): string {
  return toJsonString(CommandSchema, cmd);
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
  geometryId: string,
  faceIndex: number,
  name: string,
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'createDatumFromFace',
      value: create(CreateDatumFromFaceCommandSchema, {
        geometryId: create(ElementIdSchema, { id: geometryId }),
        faceIndex,
        name,
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a PrepareFacePicking payload.
 */
export function createPrepareFacePickingCommand(
  geometryIds: string[],
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'prepareFacePicking',
      value: create(PrepareFacePickingCommandSchema, {
        geometryIds: geometryIds.map((id) => create(ElementIdSchema, { id })),
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing an AnalyzeFacePair payload.
 */
export function createAnalyzeFacePairCommand(
  parentDatumId: string,
  parentGeometryId: string,
  parentFaceIndex: number,
  childGeometryId: string,
  childFaceIndex: number,
  childDatumName: string,
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'analyzeFacePair',
      value: create(AnalyzeFacePairCommandSchema, {
        parentDatumId: create(ElementIdSchema, { id: parentDatumId }),
        parentGeometryId: create(ElementIdSchema, { id: parentGeometryId }),
        parentFaceIndex,
        childGeometryId: create(ElementIdSchema, { id: childGeometryId }),
        childFaceIndex,
        childDatumName,
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
 * Creates a binary-encoded Command envelope containing an UpdateGeometryPose payload.
 */
export function createUpdateGeometryPoseCommand(
  geometryId: string,
  newLocalPose: {
    position: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
  },
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'updateGeometryPose',
      value: create(UpdateGeometryPoseCommandSchema, {
        geometryId: create(ElementIdSchema, { id: geometryId }),
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
export function createCreateJointCommand(draft: Joint, sequenceId?: bigint): Uint8Array {
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
export function createUpdateJointCommand(joint: Joint, sequenceId?: bigint): Uint8Array {
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
export function createUpdateActuatorCommand(actuator: Actuator, sequenceId?: bigint): Uint8Array {
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
export function createDeleteActuatorCommand(actuatorId: string, sequenceId?: bigint): Uint8Array {
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

// ──────────────────────────────────────────────
// Sensor CRUD
// ──────────────────────────────────────────────

export function createCreateSensorCommand(draft: Sensor, sequenceId?: bigint): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'createSensor',
      value: create(CreateSensorCommandSchema, {
        draft: create(SensorSchema, draft),
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

export function createUpdateSensorCommand(sensor: Sensor, sequenceId?: bigint): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'updateSensor',
      value: create(UpdateSensorCommandSchema, {
        sensor: create(SensorSchema, sensor),
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

export function createDeleteSensorCommand(sensorId: string, sequenceId?: bigint): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'deleteSensor',
      value: create(DeleteSensorCommandSchema, {
        sensorId: create(ElementIdSchema, { id: sensorId }),
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

export type SensorTypeId = 'accelerometer' | 'gyroscope' | 'tachometer' | 'encoder';
export type SensorAxisId = 'x' | 'y' | 'z';

export function mapSensorType(type: SensorType): SensorTypeId {
  switch (type) {
    case SensorType.ACCELEROMETER:
      return 'accelerometer';
    case SensorType.GYROSCOPE:
      return 'gyroscope';
    case SensorType.TACHOMETER:
      return 'tachometer';
    case SensorType.ENCODER:
      return 'encoder';
    default:
      return 'accelerometer';
  }
}

export function toProtoSensorType(type: SensorTypeId): SensorType {
  switch (type) {
    case 'accelerometer':
      return SensorType.ACCELEROMETER;
    case 'gyroscope':
      return SensorType.GYROSCOPE;
    case 'tachometer':
      return SensorType.TACHOMETER;
    case 'encoder':
      return SensorType.ENCODER;
  }
}

export function mapSensorAxis(axis: SensorAxis): SensorAxisId {
  switch (axis) {
    case SensorAxis.X:
      return 'x';
    case SensorAxis.Y:
      return 'y';
    case SensorAxis.Z:
    default:
      return 'z';
  }
}

export function toProtoSensorAxis(axis: SensorAxisId): SensorAxis {
  switch (axis) {
    case 'x':
      return SensorAxis.X;
    case 'y':
      return SensorAxis.Y;
    case 'z':
      return SensorAxis.Z;
  }
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
 * Maps a proto FacePairAlignment enum to a store-friendly string.
 */
export type FacePairAlignmentId =
  | 'coaxial'
  | 'coplanar'
  | 'coincident'
  | 'perpendicular'
  | 'general';

export function mapFacePairAlignment(alignment: FacePairAlignment): FacePairAlignmentId {
  switch (alignment) {
    case FacePairAlignment.COAXIAL:
      return 'coaxial';
    case FacePairAlignment.COPLANAR:
      return 'coplanar';
    case FacePairAlignment.COINCIDENT:
      return 'coincident';
    case FacePairAlignment.PERPENDICULAR:
      return 'perpendicular';
    case FacePairAlignment.GENERAL:
    default:
      return 'general';
  }
}

/**
 * Store-friendly motion type identifier.
 */
export type MotionTypeId = 'dynamic' | 'fixed';

/**
 * Maps a proto MotionType enum value to a store-friendly string.
 */
export function mapMotionType(proto: number): MotionTypeId {
  switch (proto) {
    case MotionType.FIXED:
      return 'fixed';
    case MotionType.DYNAMIC:
    case MotionType.UNSPECIFIED:
    default:
      return 'dynamic';
  }
}

/**
 * Maps a store-friendly motion type string to the proto MotionType enum value.
 */
export function toProtoMotionType(id: MotionTypeId): MotionType {
  switch (id) {
    case 'fixed':
      return MotionType.FIXED;
    case 'dynamic':
      return MotionType.DYNAMIC;
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
    case 'barzilai-borwein':
      return SolverType.SOLVER_BARZILAI_BORWEIN;
    case 'apgd':
      return SolverType.SOLVER_APGD;
    case 'minres':
      return SolverType.SOLVER_MINRES;
    case 'psor':
    default:
      return SolverType.SOLVER_PSOR;
  }
}

function mapIntegratorType(type: SolverSettingsInput['integrator']): IntegratorType {
  switch (type) {
    case 'hht':
      return IntegratorType.INTEGRATOR_HHT;
    case 'newmark':
      return IntegratorType.INTEGRATOR_NEWMARK;
    case 'euler-implicit-linearized':
    default:
      return IntegratorType.INTEGRATOR_EULER_IMPLICIT_LINEARIZED;
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
  updates: {
    isFixed?: boolean;
    name?: string;
    pose?: {
      position: { x: number; y: number; z: number };
      orientation: { x: number; y: number; z: number; w: number };
    };
    motionType?: MotionTypeId;
    pinDatumsInWorld?: boolean;
  },
  sequenceId?: bigint,
): Uint8Array {
  // Dual-write: set isFixed from motionType for backward compat with C++ engine
  const isFixed =
    updates.motionType !== undefined ? updates.motionType === 'fixed' : updates.isFixed;

  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'updateBody',
      value: create(UpdateBodyCommandSchema, {
        bodyId: create(ElementIdSchema, { id: bodyId }),
        isFixed,
        name: updates.name,
        pose: updates.pose
          ? create(PoseSchema, {
              position: create(Vec3Schema, updates.pose.position),
              orientation: create(QuatSchema, {
                w: updates.pose.orientation.w,
                x: updates.pose.orientation.x,
                y: updates.pose.orientation.y,
                z: updates.pose.orientation.z,
              }),
            })
          : undefined,
        motionType:
          updates.motionType !== undefined ? toProtoMotionType(updates.motionType) : undefined,
        pinDatumsInWorld: updates.pinDatumsInWorld ?? false,
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
    massProperties?: {
      mass: number;
      centerOfMass: { x: number; y: number; z: number };
      ixx: number;
      iyy: number;
      izz: number;
      ixy: number;
      ixz: number;
      iyz: number;
    };
    pose?: {
      position: { x: number; y: number; z: number };
      orientation: { x: number; y: number; z: number; w: number };
    };
    isFixed?: boolean;
    motionType?: MotionTypeId;
  },
  sequenceId?: bigint,
): Uint8Array {
  // Dual-write: set isFixed from motionType for backward compat with C++ engine
  const isFixed =
    options?.motionType !== undefined
      ? options.motionType === 'fixed'
      : (options?.isFixed ?? false);

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
        isFixed,
        motionType:
          options?.motionType !== undefined
            ? toProtoMotionType(options.motionType)
            : MotionType.DYNAMIC,
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a DeleteBody payload.
 */
export function createDeleteBodyCommand(bodyId: string, sequenceId?: bigint): Uint8Array {
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
  localPose?: {
    position: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
  },
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
export function createDetachGeometryCommand(geometryId: string, sequenceId?: bigint): Uint8Array {
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
 * Creates a binary-encoded Command envelope containing a DeleteGeometry payload.
 */
export function createDeleteGeometryCommand(geometryId: string, sequenceId?: bigint): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'deleteGeometry',
      value: create(DeleteGeometryCommandSchema, {
        geometryId: create(ElementIdSchema, { id: geometryId }),
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a RenameGeometry payload.
 */
export function createRenameGeometryCommand(
  geometryId: string,
  name: string,
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'renameGeometry',
      value: create(RenameGeometryCommandSchema, {
        geometryId: create(ElementIdSchema, { id: geometryId }),
        name,
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
  massProperties?: {
    mass: number;
    centerOfMass: { x: number; y: number; z: number };
    ixx: number;
    iyy: number;
    izz: number;
    ixy: number;
    ixz: number;
    iyz: number;
  },
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

export type PrimitiveShapeType = 'box' | 'cylinder' | 'sphere';

export interface PrimitiveParamsInput {
  box?: { width: number; height: number; depth: number };
  cylinder?: { radius: number; height: number };
  sphere?: { radius: number };
}

function mapPrimitiveShape(shape: PrimitiveShapeType): PrimitiveShape {
  switch (shape) {
    case 'box':
      return PrimitiveShape.BOX;
    case 'cylinder':
      return PrimitiveShape.CYLINDER;
    case 'sphere':
      return PrimitiveShape.SPHERE;
  }
}

/**
 * Creates a binary-encoded Command envelope containing a CreatePrimitiveBody payload.
 */
export function createCreatePrimitiveBodyCommand(
  shape: PrimitiveShapeType,
  name: string,
  position: { x: number; y: number; z: number },
  params: PrimitiveParamsInput,
  density?: number,
  sequenceId?: bigint,
): Uint8Array {
  const protoParams = create(PrimitiveParamsSchema, {
    shapeParams: params.box
      ? { case: 'box' as const, value: create(BoxParamsSchema, params.box) }
      : params.cylinder
        ? { case: 'cylinder' as const, value: create(CylinderParamsSchema, params.cylinder) }
        : params.sphere
          ? { case: 'sphere' as const, value: create(SphereParamsSchema, params.sphere) }
          : { case: undefined, value: undefined },
  });

  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'createPrimitiveBody',
      value: create(CreatePrimitiveBodyCommandSchema, {
        shape: mapPrimitiveShape(shape),
        name,
        position: create(Vec3Schema, position),
        params: protoParams,
        density: density ?? 0,
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing an UpdatePrimitive payload.
 */
export function createUpdatePrimitiveCommand(
  geometryId: string,
  params: PrimitiveParamsInput,
  density?: number,
  sequenceId?: bigint,
): Uint8Array {
  const protoParams = create(PrimitiveParamsSchema, {
    shapeParams: params.box
      ? { case: 'box' as const, value: create(BoxParamsSchema, params.box) }
      : params.cylinder
        ? { case: 'cylinder' as const, value: create(CylinderParamsSchema, params.cylinder) }
        : params.sphere
          ? { case: 'sphere' as const, value: create(SphereParamsSchema, params.sphere) }
          : { case: undefined, value: undefined },
  });

  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'updatePrimitive',
      value: create(UpdatePrimitiveCommandSchema, {
        geometryId: create(ElementIdSchema, { id: geometryId }),
        params: protoParams,
        density: density ?? 0,
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

// Collision config types

export type CollisionShapeTypeId = 'none' | 'box' | 'sphere' | 'cylinder' | 'convex-hull';

export interface CollisionConfigInput {
  shapeType: CollisionShapeTypeId;
  halfExtents?: { x: number; y: number; z: number };
  radius?: number;
  height?: number;
  offset?: { x: number; y: number; z: number };
}

function mapCollisionShapeType(type: CollisionShapeTypeId): CollisionShapeType {
  switch (type) {
    case 'none':
      return CollisionShapeType.NONE;
    case 'box':
      return CollisionShapeType.BOX;
    case 'sphere':
      return CollisionShapeType.SPHERE;
    case 'cylinder':
      return CollisionShapeType.CYLINDER;
    case 'convex-hull':
      return CollisionShapeType.CONVEX_HULL;
  }
}

/**
 * Creates a binary-encoded Command envelope containing an UpdateCollisionConfig payload.
 */
export function createUpdateCollisionConfigCommand(
  geometryId: string,
  config: CollisionConfigInput,
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'updateCollisionConfig',
      value: create(UpdateCollisionConfigCommandSchema, {
        geometryId: create(ElementIdSchema, { id: geometryId }),
        collisionConfig: create(CollisionConfigSchema, {
          shapeType: mapCollisionShapeType(config.shapeType),
          halfExtents: config.halfExtents ? create(Vec3Schema, config.halfExtents) : undefined,
          radius: config.radius ?? 0,
          height: config.height ?? 0,
          offset: config.offset ? create(Vec3Schema, config.offset) : undefined,
        }),
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a MakeCompoundBody payload.
 */
export function createMakeCompoundBodyCommand(
  geometryIds: string[],
  name: string,
  options?: {
    motionType?: MotionTypeId;
    dissolveEmptyBodies?: boolean;
    referenceBodyId?: string;
  },
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'makeCompoundBody',
      value: create(MakeCompoundBodyCommandSchema, {
        geometryIds: geometryIds.map((id) => create(ElementIdSchema, { id })),
        name,
        motionType:
          options?.motionType !== undefined
            ? toProtoMotionType(options.motionType)
            : MotionType.DYNAMIC,
        dissolveEmptyBodies: options?.dissolveEmptyBodies ?? false,
        referenceBodyId: options?.referenceBodyId
          ? create(ElementIdSchema, { id: options.referenceBodyId })
          : undefined,
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a SplitBody payload.
 */
export function createSplitBodyCommand(
  sourceBodyId: string,
  geometryIds: string[],
  name: string,
  options?: {
    motionType?: MotionTypeId;
  },
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'splitBody',
      value: create(SplitBodyCommandSchema, {
        sourceBodyId: create(ElementIdSchema, { id: sourceBodyId }),
        geometryIds: geometryIds.map((id) => create(ElementIdSchema, { id })),
        name,
        motionType:
          options?.motionType !== undefined
            ? toProtoMotionType(options.motionType)
            : MotionType.DYNAMIC,
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a ReparentGeometry payload.
 */
export function createReparentGeometryCommand(
  geometryId: string,
  targetBodyId: string,
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'reparentGeometry',
      value: create(ReparentGeometryCommandSchema, {
        geometryId: create(ElementIdSchema, { id: geometryId }),
        targetBodyId: create(ElementIdSchema, { id: targetBodyId }),
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

export { SimulationAction } from './generated/protocol/transport_pb.js';
