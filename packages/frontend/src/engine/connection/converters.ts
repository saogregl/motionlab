// Pure proto ↔ store converters extracted from connection.ts.
// No state access; safe to import from anywhere in the engine bridge.

import type {
  Actuator,
  CommandFunction,
  ElementId,
  LinearSpringDamperLoad,
  Load,
  PointForceLoad,
  PointTorqueLoad,
  PrismaticMotorActuator,
  RevoluteMotorActuator,
  Sensor,
} from '@motionlab/protocol';
import {
  ActuatorControlMode,
  DatumSurfaceClass,
  mapSensorAxis,
  mapSensorType,
  ReferenceFrame,
  SmoothStepProfile,
  toProtoSensorAxis,
  toProtoSensorType,
} from '@motionlab/protocol';
import type {
  ActuatorState,
  ActuatorTypeId,
  BodyMassProperties,
  BodyPose,
  BodyState,
  CommandFunctionShape,
  ControlModeId,
  DatumState,
  GeometryState,
  LoadState,
  LoadTypeId,
  MeshData,
  ReferenceFrameId,
  SensorAxisId,
  SensorState,
  SensorTypeId,
} from '../../stores/mechanism.js';

export function extractMassProperties(
  mp:
    | {
        mass?: number;
        centerOfMass?: { x?: number; y?: number; z?: number };
        ixx?: number;
        iyy?: number;
        izz?: number;
        ixy?: number;
        ixz?: number;
        iyz?: number;
      }
    | undefined,
): BodyMassProperties {
  return {
    mass: mp?.mass ?? 0,
    centerOfMass: {
      x: mp?.centerOfMass?.x ?? 0,
      y: mp?.centerOfMass?.y ?? 0,
      z: mp?.centerOfMass?.z ?? 0,
    },
    ixx: mp?.ixx ?? 0,
    iyy: mp?.iyy ?? 0,
    izz: mp?.izz ?? 0,
    ixy: mp?.ixy ?? 0,
    ixz: mp?.ixz ?? 0,
    iyz: mp?.iyz ?? 0,
  };
}

export function extractPose(
  pose:
    | {
        position?: { x?: number; y?: number; z?: number };
        orientation?: { x?: number; y?: number; z?: number; w?: number };
      }
    | undefined,
): BodyPose {
  return {
    position: {
      x: pose?.position?.x ?? 0,
      y: pose?.position?.y ?? 0,
      z: pose?.position?.z ?? 0,
    },
    rotation: {
      x: pose?.orientation?.x ?? 0,
      y: pose?.orientation?.y ?? 0,
      z: pose?.orientation?.z ?? 0,
      w: pose?.orientation?.w ?? 1,
    },
  };
}

export function mapDatumSurfaceClass(
  surfaceClass: DatumSurfaceClass | undefined,
): DatumState['surfaceClass'] | undefined {
  switch (surfaceClass) {
    case DatumSurfaceClass.PLANAR:
      return 'planar';
    case DatumSurfaceClass.CYLINDRICAL:
      return 'cylindrical';
    case DatumSurfaceClass.CONICAL:
      return 'conical';
    case DatumSurfaceClass.SPHERICAL:
      return 'spherical';
    case DatumSurfaceClass.TOROIDAL:
      return 'toroidal';
    case DatumSurfaceClass.OTHER:
      return 'other';
    default:
      return undefined;
  }
}

export function extractMeshData(
  dm: { vertices?: number[]; indices?: number[]; normals?: number[] } | undefined,
): MeshData {
  return {
    vertices: new Float32Array(dm?.vertices ?? []),
    indices: new Uint32Array(dm?.indices ?? []),
    normals: new Float32Array(dm?.normals ?? []),
  };
}

export function extractAssetRef(
  ref: { contentHash?: string; originalFilename?: string } | undefined,
): {
  contentHash: string;
  originalFilename: string;
} {
  return {
    contentHash: ref?.contentHash ?? '',
    originalFilename: ref?.originalFilename ?? '',
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- proto types are complex; extract values by key
export function extractPrimitiveSource(ps: any): GeometryState['primitiveSource'] | undefined {
  if (!ps || !ps.shape) return undefined;
  const shapeMap: Record<number, 'box' | 'cylinder' | 'sphere'> = {
    1: 'box',
    2: 'cylinder',
    3: 'sphere',
  };
  const shape = shapeMap[ps.shape as number];
  if (!shape) return undefined;
  const p = ps.params?.shapeParams;
  const params: NonNullable<GeometryState['primitiveSource']>['params'] = {};
  if (p?.case === 'box') {
    params.box = {
      width: p.value.width ?? 0,
      height: p.value.height ?? 0,
      depth: p.value.depth ?? 0,
    };
  } else if (p?.case === 'cylinder') {
    params.cylinder = { radius: p.value.radius ?? 0, height: p.value.height ?? 0 };
  } else if (p?.case === 'sphere') {
    params.sphere = { radius: p.value.radius ?? 0 };
  }
  return { shape, params };
}

type CollisionConfigState = GeometryState['collisionConfig'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- proto types are complex; extract values by key
export function extractCollisionConfig(cc: any): CollisionConfigState {
  if (!cc || !cc.shapeType) return undefined;
  const typeMap: Record<number, NonNullable<CollisionConfigState>['shapeType']> = {
    0: 'none',
    1: 'box',
    2: 'sphere',
    3: 'cylinder',
    4: 'convex-hull',
  };
  return {
    shapeType: typeMap[cc.shapeType as number] ?? 'none',
    halfExtents: {
      x: cc.halfExtents?.x ?? 0,
      y: cc.halfExtents?.y ?? 0,
      z: cc.halfExtents?.z ?? 0,
    },
    radius: cc.radius ?? 0,
    height: cc.height ?? 0,
    offset: { x: cc.offset?.x ?? 0, y: cc.offset?.y ?? 0, z: cc.offset?.z ?? 0 },
  };
}

export function mapReferenceFrame(rf: ReferenceFrame): ReferenceFrameId {
  switch (rf) {
    case ReferenceFrame.DATUM_LOCAL:
      return 'datum-local';
    case ReferenceFrame.WORLD:
      return 'world';
    default:
      return 'world';
  }
}

export function toProtoReferenceFrame(rf: ReferenceFrameId | undefined): ReferenceFrame {
  switch (rf) {
    case 'datum-local':
      return ReferenceFrame.DATUM_LOCAL;
    case 'world':
      return ReferenceFrame.WORLD;
    default:
      return ReferenceFrame.WORLD;
  }
}

export function extractLoadState(load: Load): LoadState {
  const base = {
    id: load.id?.id ?? '',
    name: load.name,
  };
  switch (load.config.case) {
    case 'pointForce':
      return {
        ...base,
        type: 'point-force' as LoadTypeId,
        datumId: load.config.value.datumId?.id ?? '',
        vector: {
          x: load.config.value.vector?.x ?? 0,
          y: load.config.value.vector?.y ?? 0,
          z: load.config.value.vector?.z ?? 0,
        },
        referenceFrame: mapReferenceFrame(load.config.value.referenceFrame),
      };
    case 'pointTorque':
      return {
        ...base,
        type: 'point-torque' as LoadTypeId,
        datumId: load.config.value.datumId?.id ?? '',
        vector: {
          x: load.config.value.vector?.x ?? 0,
          y: load.config.value.vector?.y ?? 0,
          z: load.config.value.vector?.z ?? 0,
        },
        referenceFrame: mapReferenceFrame(load.config.value.referenceFrame),
      };
    case 'linearSpringDamper':
      return {
        ...base,
        type: 'spring-damper' as LoadTypeId,
        parentDatumId: load.config.value.parentDatumId?.id ?? '',
        childDatumId: load.config.value.childDatumId?.id ?? '',
        restLength: load.config.value.restLength,
        stiffness: load.config.value.stiffness,
        damping: load.config.value.damping,
      };
    default:
      return { ...base, type: 'point-force' as LoadTypeId };
  }
}

export function loadStateToProto(s: LoadState): Load {
  const id = s.id
    ? ({ $typeName: 'motionlab.mechanism.ElementId', id: s.id } as ElementId)
    : undefined;
  switch (s.type) {
    case 'point-force':
      return {
        $typeName: 'motionlab.mechanism.Load',
        id,
        name: s.name,
        config: {
          case: 'pointForce',
          value: {
            $typeName: 'motionlab.mechanism.PointForceLoad',
            datumId: s.datumId
              ? ({ $typeName: 'motionlab.mechanism.ElementId', id: s.datumId } as ElementId)
              : undefined,
            vector: {
              $typeName: 'motionlab.mechanism.Vec3',
              x: s.vector?.x ?? 0,
              y: s.vector?.y ?? 0,
              z: s.vector?.z ?? 0,
            },
            referenceFrame: toProtoReferenceFrame(s.referenceFrame),
          } as PointForceLoad,
        },
      } as Load;
    case 'point-torque':
      return {
        $typeName: 'motionlab.mechanism.Load',
        id,
        name: s.name,
        config: {
          case: 'pointTorque',
          value: {
            $typeName: 'motionlab.mechanism.PointTorqueLoad',
            datumId: s.datumId
              ? ({ $typeName: 'motionlab.mechanism.ElementId', id: s.datumId } as ElementId)
              : undefined,
            vector: {
              $typeName: 'motionlab.mechanism.Vec3',
              x: s.vector?.x ?? 0,
              y: s.vector?.y ?? 0,
              z: s.vector?.z ?? 0,
            },
            referenceFrame: toProtoReferenceFrame(s.referenceFrame),
          } as PointTorqueLoad,
        },
      } as Load;
    case 'spring-damper':
      return {
        $typeName: 'motionlab.mechanism.Load',
        id,
        name: s.name,
        config: {
          case: 'linearSpringDamper',
          value: {
            $typeName: 'motionlab.mechanism.LinearSpringDamperLoad',
            parentDatumId: s.parentDatumId
              ? ({ $typeName: 'motionlab.mechanism.ElementId', id: s.parentDatumId } as ElementId)
              : undefined,
            childDatumId: s.childDatumId
              ? ({ $typeName: 'motionlab.mechanism.ElementId', id: s.childDatumId } as ElementId)
              : undefined,
            restLength: s.restLength ?? 0,
            stiffness: s.stiffness ?? 0,
            damping: s.damping ?? 0,
          } as LinearSpringDamperLoad,
        },
      } as Load;
  }
}

// ---------------------------------------------------------------------------
// Actuator proto ↔ store helpers
// ---------------------------------------------------------------------------

export function mapControlMode(mode: ActuatorControlMode): ControlModeId {
  switch (mode) {
    case ActuatorControlMode.POSITION:
      return 'position';
    case ActuatorControlMode.SPEED:
      return 'speed';
    case ActuatorControlMode.EFFORT:
      return 'effort';
    default:
      return 'position';
  }
}

export function toProtoControlMode(mode: ControlModeId): ActuatorControlMode {
  switch (mode) {
    case 'position':
      return ActuatorControlMode.POSITION;
    case 'speed':
      return ActuatorControlMode.SPEED;
    case 'effort':
      return ActuatorControlMode.EFFORT;
  }
}

export function extractCommandFunction(
  cf: CommandFunction | undefined,
  legacyValue: number,
): CommandFunctionShape {
  if (!cf) return { shape: 'constant', value: legacyValue };
  switch (cf.shape.case) {
    case 'constant':
      return { shape: 'constant', value: cf.shape.value.value };
    case 'ramp':
      return {
        shape: 'ramp',
        initialValue: cf.shape.value.initialValue,
        slope: cf.shape.value.slope,
      };
    case 'sine':
      return {
        shape: 'sine',
        amplitude: cf.shape.value.amplitude,
        frequency: cf.shape.value.frequency,
        phase: cf.shape.value.phase,
        offset: cf.shape.value.offset,
      };
    case 'piecewiseLinear':
      return {
        shape: 'piecewise-linear',
        times: [...cf.shape.value.times],
        values: [...cf.shape.value.values],
      };
    case 'smoothStep':
      return {
        shape: 'smooth-step',
        displacement: cf.shape.value.displacement,
        duration: cf.shape.value.duration,
        profile:
          cf.shape.value.profile === SmoothStepProfile.TRAPEZOIDAL ? 'trapezoidal' : 'cycloidal',
        accelFraction: cf.shape.value.accelFraction,
        decelFraction: cf.shape.value.decelFraction,
      };
    default:
      return { shape: 'constant', value: legacyValue };
  }
}

export function commandFunctionToProto(fn: CommandFunctionShape): CommandFunction {
  switch (fn.shape) {
    case 'constant':
      return {
        $typeName: 'motionlab.mechanism.CommandFunction',
        shape: {
          case: 'constant',
          value: { $typeName: 'motionlab.mechanism.ConstantFunction', value: fn.value },
        },
      } as CommandFunction;
    case 'ramp':
      return {
        $typeName: 'motionlab.mechanism.CommandFunction',
        shape: {
          case: 'ramp',
          value: {
            $typeName: 'motionlab.mechanism.RampFunction',
            initialValue: fn.initialValue,
            slope: fn.slope,
          },
        },
      } as CommandFunction;
    case 'sine':
      return {
        $typeName: 'motionlab.mechanism.CommandFunction',
        shape: {
          case: 'sine',
          value: {
            $typeName: 'motionlab.mechanism.SineFunction',
            amplitude: fn.amplitude,
            frequency: fn.frequency,
            phase: fn.phase,
            offset: fn.offset,
          },
        },
      } as CommandFunction;
    case 'piecewise-linear':
      return {
        $typeName: 'motionlab.mechanism.CommandFunction',
        shape: {
          case: 'piecewiseLinear',
          value: {
            $typeName: 'motionlab.mechanism.PiecewiseLinearFunction',
            times: fn.times,
            values: fn.values,
          },
        },
      } as CommandFunction;
    case 'smooth-step':
      return {
        $typeName: 'motionlab.mechanism.CommandFunction',
        shape: {
          case: 'smoothStep',
          value: {
            $typeName: 'motionlab.mechanism.SmoothStepFunction',
            displacement: fn.displacement,
            duration: fn.duration,
            profile:
              fn.profile === 'trapezoidal'
                ? SmoothStepProfile.TRAPEZOIDAL
                : SmoothStepProfile.CYCLOIDAL,
            accelFraction: fn.accelFraction,
            decelFraction: fn.decelFraction,
          },
        },
      } as CommandFunction;
  }
}

export function extractActuatorState(actuator: Actuator): ActuatorState {
  const base = {
    id: actuator.id?.id ?? '',
    name: actuator.name,
  };
  switch (actuator.config.case) {
    case 'revoluteMotor': {
      const commandFunction = extractCommandFunction(
        actuator.config.value.commandFunction,
        actuator.config.value.commandValue,
      );
      return {
        ...base,
        type: 'revolute-motor' as ActuatorTypeId,
        jointId: actuator.config.value.jointId?.id ?? '',
        controlMode: mapControlMode(actuator.config.value.controlMode),
        commandValue: actuator.config.value.commandValue,
        commandFunction,
        effortLimit: actuator.config.value.effortLimit,
      };
    }
    case 'prismaticMotor': {
      const commandFunction = extractCommandFunction(
        actuator.config.value.commandFunction,
        actuator.config.value.commandValue,
      );
      return {
        ...base,
        type: 'prismatic-motor' as ActuatorTypeId,
        jointId: actuator.config.value.jointId?.id ?? '',
        controlMode: mapControlMode(actuator.config.value.controlMode),
        commandValue: actuator.config.value.commandValue,
        commandFunction,
        effortLimit: actuator.config.value.effortLimit,
      };
    }
    default:
      return {
        ...base,
        type: 'revolute-motor' as ActuatorTypeId,
        jointId: '',
        controlMode: 'position',
        commandValue: 0,
        commandFunction: { shape: 'constant', value: 0 },
      };
  }
}

export function actuatorStateToProto(s: ActuatorState): Actuator {
  const id = s.id
    ? ({ $typeName: 'motionlab.mechanism.ElementId', id: s.id } as ElementId)
    : undefined;
  const jointId = s.jointId
    ? ({ $typeName: 'motionlab.mechanism.ElementId', id: s.jointId } as ElementId)
    : undefined;
  const controlMode = toProtoControlMode(s.controlMode);
  const commandFunction = commandFunctionToProto(s.commandFunction);
  const motorFields = {
    jointId,
    controlMode,
    commandValue: s.commandValue,
    effortLimit: s.effortLimit,
    commandFunction,
  };
  switch (s.type) {
    case 'revolute-motor':
      return {
        $typeName: 'motionlab.mechanism.Actuator',
        id,
        name: s.name,
        config: {
          case: 'revoluteMotor',
          value: {
            $typeName: 'motionlab.mechanism.RevoluteMotorActuator',
            ...motorFields,
          } as RevoluteMotorActuator,
        },
      } as Actuator;
    case 'prismatic-motor':
      return {
        $typeName: 'motionlab.mechanism.Actuator',
        id,
        name: s.name,
        config: {
          case: 'prismaticMotor',
          value: {
            $typeName: 'motionlab.mechanism.PrismaticMotorActuator',
            ...motorFields,
          } as PrismaticMotorActuator,
        },
      } as Actuator;
  }
}

export function extractSensorState(sensor: Sensor): SensorState {
  const base: SensorState = {
    id: sensor.id?.id ?? '',
    name: sensor.name,
    type: mapSensorType(sensor.type) as SensorTypeId,
    datumId: sensor.datumId?.id ?? '',
  };
  switch (sensor.config.case) {
    case 'tachometer':
      return { ...base, axis: mapSensorAxis(sensor.config.value.axis) as SensorAxisId };
    case 'encoder':
      return { ...base, jointId: sensor.config.value.jointId?.id ?? '' };
    default:
      return base;
  }
}

export function sensorStateToProto(s: SensorState): Sensor {
  const id = s.id
    ? ({ $typeName: 'motionlab.mechanism.ElementId', id: s.id } as ElementId)
    : undefined;
  const datumId = s.datumId
    ? ({ $typeName: 'motionlab.mechanism.ElementId', id: s.datumId } as ElementId)
    : undefined;
  const sensorType = toProtoSensorType(s.type);

  let config: Sensor['config'];
  switch (s.type) {
    case 'accelerometer':
      config = {
        case: 'accelerometer' as const,
        // biome-ignore lint/suspicious/noExplicitAny: proto generated type
        value: { $typeName: 'motionlab.mechanism.AccelerometerConfig' } as any,
      };
      break;
    case 'gyroscope':
      config = {
        case: 'gyroscope' as const,
        // biome-ignore lint/suspicious/noExplicitAny: proto generated type
        value: { $typeName: 'motionlab.mechanism.GyroscopeConfig' } as any,
      };
      break;
    case 'tachometer':
      config = {
        case: 'tachometer' as const,
        value: {
          $typeName: 'motionlab.mechanism.TachometerConfig',
          axis: toProtoSensorAxis(s.axis ?? 'z'),
          // biome-ignore lint/suspicious/noExplicitAny: proto generated type
        } as any,
      };
      break;
    case 'encoder':
      config = {
        case: 'encoder' as const,
        value: {
          $typeName: 'motionlab.mechanism.EncoderConfig',
          jointId: s.jointId
            ? ({ $typeName: 'motionlab.mechanism.ElementId', id: s.jointId } as ElementId)
            : undefined,
          // biome-ignore lint/suspicious/noExplicitAny: proto generated type
        } as any,
      };
      break;
  }

  return {
    $typeName: 'motionlab.mechanism.Sensor',
    id,
    name: s.name,
    type: sensorType,
    datumId,
    config,
  } as Sensor;
}

export function extractBodyState(body: {
  id?: { id?: string };
  name?: string;
  massProperties?: {
    mass?: number;
    centerOfMass?: { x?: number; y?: number; z?: number };
    ixx?: number;
    iyy?: number;
    izz?: number;
    ixy?: number;
    ixz?: number;
    iyz?: number;
  };
  pose?: {
    position?: { x?: number; y?: number; z?: number };
    orientation?: { x?: number; y?: number; z?: number; w?: number };
  };
  isFixed?: boolean;
  massOverride?: boolean;
  motionType?: number;
}): BodyState {
  const motionType: 'dynamic' | 'fixed' =
    body.motionType === 2
      ? 'fixed'
      : body.motionType === 1
        ? 'dynamic'
        : body.isFixed
          ? 'fixed'
          : 'dynamic';

  return {
    id: body.id?.id ?? '',
    name: body.name ?? '',
    massProperties: extractMassProperties(body.massProperties),
    pose: extractPose(body.pose),
    isFixed: body.isFixed ?? false,
    motionType,
    massOverride: body.massOverride ?? false,
  };
}

export const IDENTITY_POSE: BodyPose = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
};
