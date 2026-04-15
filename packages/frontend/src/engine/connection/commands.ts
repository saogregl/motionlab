// All outbound `send*` functions extracted from connection.ts.
// They share `connState.ws` + `connState.nextSequenceId` and otherwise only
// call protocol command builders.

import type {
  CollisionConfigInput,
  ElementId,
  Joint,
  PrimitiveParamsInput,
  SimulationSettingsInput,
} from '@motionlab/protocol';
import {
  createAnalyzeFacePairCommand,
  createAttachGeometryCommand,
  createCompileMechanismCommand,
  createCreateActuatorCommand,
  createCreateBodyCommand,
  createCreateDatumCommand,
  createCreateDatumFromFaceCommand,
  createCreateJointCommand,
  createCreateLoadCommand,
  createCreatePrimitiveBodyCommand,
  createCreateSensorCommand,
  createDeleteActuatorCommand,
  createDeleteBodyCommand,
  createDeleteDatumCommand,
  createDeleteGeometryCommand,
  createDeleteJointCommand,
  createDeleteLoadCommand,
  createDeleteSensorCommand,
  createDetachGeometryCommand,
  createImportAssetCommand,
  createLoadProjectCommand,
  createMakeCompoundBodyCommand,
  createNewProjectCommand,
  createPlaceAssetInSceneCommand,
  createPrepareFacePickingCommand,
  createRelocateAssetCommand,
  createRenameDatumCommand,
  createRenameGeometryCommand,
  createReparentGeometryCommand,
  createSaveProjectCommand,
  createScrubCommand,
  createSimulationControlCommand,
  createSplitBodyCommand,
  createUpdateActuatorCommand,
  createUpdateBodyCommand,
  createUpdateCollisionConfigCommand,
  createUpdateDatumPoseCommand,
  createUpdateGeometryPoseCommand,
  createUpdateJointCommand,
  createUpdateLoadCommand,
  createUpdateMassPropertiesCommand,
  createUpdatePrimitiveCommand,
  createUpdateSensorCommand,
  SimulationAction,
  toProtoJointType,
} from '@motionlab/protocol';
import { getDebugRecorder } from '../../debug/api.js';
import type {
  ActuatorState,
  JointTypeId,
  LoadState,
  SensorState,
} from '../../stores/mechanism.js';
import { useMechanismStore } from '../../stores/mechanism.js';
import { useSimulationStore } from '../../stores/simulation.js';
import { useSimulationSettingsStore } from '../../stores/simulation-settings.js';
import { actuatorStateToProto, loadStateToProto, sensorStateToProto } from './converters.js';
import { connState } from './state.js';

function allocateSequenceId(): bigint {
  const id = connState.nextSequenceId;
  connState.nextSequenceId += 1n;
  return id;
}

function sendBinaryCommand(builder: (sequenceId: bigint) => Uint8Array): boolean {
  if (!connState.ws || connState.ws.readyState !== WebSocket.OPEN) return false;
  const bytes = builder(allocateSequenceId());
  getDebugRecorder().recordOutboundCommand(bytes);
  connState.ws.send(bytes);
  return true;
}

export function sendImportAsset(
  filePath: string,
  options?: {
    densityOverride?: number;
    tessellationQuality?: number;
    unitSystem?: string;
    importMode?: 'auto-body' | 'visual-only';
  },
): void {
  sendBinaryCommand((sequenceId) => createImportAssetCommand(filePath, options, sequenceId));
}

export function sendPlaceAssetInScene(
  assetId: string,
  position: { x: number; y: number; z: number },
): void {
  sendBinaryCommand((sequenceId) => createPlaceAssetInSceneCommand(assetId, position, sequenceId));
}

export function sendCreatePrimitiveBody(
  shape: 'box' | 'cylinder' | 'sphere',
  name: string,
  position: { x: number; y: number; z: number },
  params: {
    box?: { width: number; height: number; depth: number };
    cylinder?: { radius: number; height: number };
    sphere?: { radius: number };
  },
  density?: number,
): void {
  connState.pendingPrimitiveSource = { shape, params };
  sendBinaryCommand((sequenceId) =>
    createCreatePrimitiveBodyCommand(shape, name, position, params, density, sequenceId),
  );
}

export function sendUpdatePrimitive(
  geometryId: string,
  params: PrimitiveParamsInput,
  density?: number,
): void {
  sendBinaryCommand((sequenceId) =>
    createUpdatePrimitiveCommand(geometryId, params, density, sequenceId),
  );
}

export function sendUpdateCollisionConfig(geometryId: string, config: CollisionConfigInput): void {
  sendBinaryCommand((sequenceId) =>
    createUpdateCollisionConfigCommand(geometryId, config, sequenceId),
  );
}

export function sendCreateDatum(
  parentBodyId: string,
  name: string,
  localPose: {
    position: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
  },
): void {
  sendBinaryCommand((sequenceId) =>
    createCreateDatumCommand(parentBodyId, localPose, name, sequenceId),
  );
}

export function sendCreateDatumFromFace(geometryId: string, faceIndex: number, name: string): void {
  sendBinaryCommand((sequenceId) =>
    createCreateDatumFromFaceCommand(geometryId, faceIndex, name, sequenceId),
  );
}

export function sendPrepareFacePicking(geometryIds: string[]): void {
  if (geometryIds.length === 0) return;
  sendBinaryCommand((sequenceId) => createPrepareFacePickingCommand(geometryIds, sequenceId));
}

export function sendAnalyzeFacePair(
  parentDatumId: string,
  parentGeometryId: string,
  parentFaceIndex: number,
  childGeometryId: string,
  childFaceIndex: number,
  childDatumName: string,
): void {
  sendBinaryCommand((sequenceId) =>
    createAnalyzeFacePairCommand(
      parentDatumId,
      parentGeometryId,
      parentFaceIndex,
      childGeometryId,
      childFaceIndex,
      childDatumName,
      sequenceId,
    ),
  );
}

export function sendDeleteDatum(datumId: string): void {
  sendBinaryCommand((sequenceId) => createDeleteDatumCommand(datumId, sequenceId));
}

export function sendRenameDatum(datumId: string, newName: string): void {
  sendBinaryCommand((sequenceId) => createRenameDatumCommand(datumId, newName, sequenceId));
}

export function sendUpdateDatumPose(
  datumId: string,
  newLocalPose: {
    position: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
  },
): void {
  sendBinaryCommand((sequenceId) =>
    createUpdateDatumPoseCommand(datumId, newLocalPose, sequenceId),
  );
}

export function sendUpdateGeometryPose(
  geometryId: string,
  newLocalPose: {
    position: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
  },
): void {
  sendBinaryCommand((sequenceId) =>
    createUpdateGeometryPoseCommand(geometryId, newLocalPose, sequenceId),
  );
}

function buildJointConfig(
  type: JointTypeId,
  lowerLimit: number,
  upperLimit: number,
  damping: number,
  translationalDamping: number,
  rotationalDamping: number,
): Joint['config'] {
  switch (type) {
    case 'revolute':
      return {
        case: 'revolute',
        value: {
          $typeName: 'motionlab.mechanism.RevoluteJointConfig',
          angleLimit:
            lowerLimit !== 0 || upperLimit !== 0
              ? { $typeName: 'motionlab.mechanism.Range', lower: lowerLimit, upper: upperLimit }
              : undefined,
          damping,
        },
      } as Joint['config'];
    case 'prismatic':
      return {
        case: 'prismatic',
        value: {
          $typeName: 'motionlab.mechanism.PrismaticJointConfig',
          translationLimit:
            lowerLimit !== 0 || upperLimit !== 0
              ? { $typeName: 'motionlab.mechanism.Range', lower: lowerLimit, upper: upperLimit }
              : undefined,
          damping,
        },
      } as Joint['config'];
    case 'cylindrical':
      return {
        case: 'cylindrical',
        value: {
          $typeName: 'motionlab.mechanism.CylindricalJointConfig',
          translationLimit:
            lowerLimit !== 0 || upperLimit !== 0
              ? { $typeName: 'motionlab.mechanism.Range', lower: lowerLimit, upper: upperLimit }
              : undefined,
          translationalDamping,
          rotationalDamping,
        },
      } as Joint['config'];
    default:
      return { case: undefined, value: undefined } as unknown as Joint['config'];
  }
}

export function sendCreateJoint(
  parentDatumId: string,
  childDatumId: string,
  type: JointTypeId,
  name: string,
  lowerLimit: number,
  upperLimit: number,
  damping = 0,
  translationalDamping = 0,
  rotationalDamping = 0,
): void {
  sendBinaryCommand((sequenceId) =>
    createCreateJointCommand(
      {
        parentDatumId: {
          $typeName: 'motionlab.mechanism.ElementId',
          id: parentDatumId,
        } as ElementId,
        childDatumId: { $typeName: 'motionlab.mechanism.ElementId', id: childDatumId } as ElementId,
        type: toProtoJointType(type),
        name,
        lowerLimit,
        upperLimit,
        config: buildJointConfig(
          type,
          lowerLimit,
          upperLimit,
          damping,
          translationalDamping,
          rotationalDamping,
        ),
      } as Joint,
      sequenceId,
    ),
  );
}

export function sendUpdateJoint(
  jointId: string,
  updates: {
    name?: string;
    type?: JointTypeId;
    lowerLimit?: number;
    upperLimit?: number;
    parentDatumId?: string;
    childDatumId?: string;
    damping?: number;
    translationalDamping?: number;
    rotationalDamping?: number;
  },
): void {
  const existing = useMechanismStore.getState().joints.get(jointId);
  if (!existing) return;
  const type = updates.type ?? existing.type;
  const lowerLimit = updates.lowerLimit ?? existing.lowerLimit;
  const upperLimit = updates.upperLimit ?? existing.upperLimit;
  const damping = updates.damping ?? existing.damping;
  const translationalDamping = updates.translationalDamping ?? existing.translationalDamping;
  const rotationalDamping = updates.rotationalDamping ?? existing.rotationalDamping;
  sendBinaryCommand((sequenceId) =>
    createUpdateJointCommand(
      {
        id: { $typeName: 'motionlab.mechanism.ElementId', id: jointId } as ElementId,
        parentDatumId: {
          $typeName: 'motionlab.mechanism.ElementId',
          id: updates.parentDatumId ?? existing.parentDatumId,
        } as ElementId,
        childDatumId: {
          $typeName: 'motionlab.mechanism.ElementId',
          id: updates.childDatumId ?? existing.childDatumId,
        } as ElementId,
        type: toProtoJointType(type),
        name: updates.name ?? existing.name,
        lowerLimit,
        upperLimit,
        config: buildJointConfig(
          type,
          lowerLimit,
          upperLimit,
          damping,
          translationalDamping,
          rotationalDamping,
        ),
      } as Joint,
      sequenceId,
    ),
  );
}

export function sendUpdateBody(
  bodyId: string,
  updates: {
    isFixed?: boolean;
    name?: string;
    pose?: {
      position: { x: number; y: number; z: number };
      orientation: { x: number; y: number; z: number; w: number };
    };
    motionType?: 'dynamic' | 'fixed';
    pinDatumsInWorld?: boolean;
  },
): void {
  sendBinaryCommand((sequenceId) => createUpdateBodyCommand(bodyId, updates, sequenceId));
}

export function sendCreateBody(
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
    isFixed?: boolean;
    motionType?: 'dynamic' | 'fixed';
  },
): void {
  sendBinaryCommand((sequenceId) => createCreateBodyCommand(name, options, sequenceId));
}

export function sendDeleteBody(bodyId: string): void {
  sendBinaryCommand((sequenceId) => createDeleteBodyCommand(bodyId, sequenceId));
}

export function sendAttachGeometry(geometryId: string, targetBodyId: string): void {
  sendBinaryCommand((sequenceId) =>
    createAttachGeometryCommand(geometryId, targetBodyId, undefined, sequenceId),
  );
}

export function sendDetachGeometry(geometryId: string): void {
  sendBinaryCommand((sequenceId) => createDetachGeometryCommand(geometryId, sequenceId));
}

export function sendDeleteGeometry(geometryId: string): void {
  sendBinaryCommand((sequenceId) => createDeleteGeometryCommand(geometryId, sequenceId));
}

export function sendRenameGeometry(geometryId: string, newName: string): void {
  sendBinaryCommand((sequenceId) => createRenameGeometryCommand(geometryId, newName, sequenceId));
}

export function sendMakeCompoundBody(
  geometryIds: string[],
  name: string,
  options?: {
    motionType?: 'dynamic' | 'fixed';
    dissolveEmptyBodies?: boolean;
    referenceBodyId?: string;
  },
): void {
  if (!connState.ws || connState.ws.readyState !== WebSocket.OPEN) {
    console.warn(
      '[make-body] WebSocket not open, cannot send command. ws:',
      connState.ws ? `readyState=${connState.ws.readyState}` : 'null',
    );
    return;
  }
  console.debug('[make-body] sending binary command over WebSocket');
  sendBinaryCommand((sequenceId) =>
    createMakeCompoundBodyCommand(geometryIds, name, options, sequenceId),
  );
}

export function sendSplitBody(
  sourceBodyId: string,
  geometryIds: string[],
  name: string,
  options?: { motionType?: 'dynamic' | 'fixed' },
): void {
  sendBinaryCommand((sequenceId) =>
    createSplitBodyCommand(sourceBodyId, geometryIds, name, options, sequenceId),
  );
}

export function sendReparentGeometry(geometryId: string, targetBodyId: string): void {
  sendBinaryCommand((sequenceId) =>
    createReparentGeometryCommand(geometryId, targetBodyId, sequenceId),
  );
}

export function sendUpdateMassProperties(
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
): void {
  sendBinaryCommand((sequenceId) =>
    createUpdateMassPropertiesCommand(bodyId, massOverride, massProperties, sequenceId),
  );
}

export function sendDeleteJoint(jointId: string): void {
  sendBinaryCommand((sequenceId) => createDeleteJointCommand(jointId, sequenceId));
}

export function sendCreateLoad(loadState: LoadState): void {
  sendBinaryCommand((sequenceId) =>
    createCreateLoadCommand(loadStateToProto(loadState), sequenceId),
  );
}

export function sendUpdateLoad(loadState: LoadState): void {
  sendBinaryCommand((sequenceId) =>
    createUpdateLoadCommand(loadStateToProto(loadState), sequenceId),
  );
}

export function sendDeleteLoad(loadId: string): void {
  sendBinaryCommand((sequenceId) => createDeleteLoadCommand(loadId, sequenceId));
}

export function sendCreateActuator(actuatorState: ActuatorState): void {
  sendBinaryCommand((sequenceId) =>
    createCreateActuatorCommand(actuatorStateToProto(actuatorState), sequenceId),
  );
}

export function sendUpdateActuator(actuatorState: ActuatorState): void {
  sendBinaryCommand((sequenceId) =>
    createUpdateActuatorCommand(actuatorStateToProto(actuatorState), sequenceId),
  );
}

export function sendDeleteActuator(actuatorId: string): void {
  sendBinaryCommand((sequenceId) => createDeleteActuatorCommand(actuatorId, sequenceId));
}

export function sendCreateSensor(sensorState: SensorState): void {
  sendBinaryCommand((sequenceId) =>
    createCreateSensorCommand(sensorStateToProto(sensorState), sequenceId),
  );
}

export function sendUpdateSensor(sensorState: SensorState): void {
  sendBinaryCommand((sequenceId) =>
    createUpdateSensorCommand(sensorStateToProto(sensorState), sequenceId),
  );
}

export function sendDeleteSensor(sensorId: string): void {
  sendBinaryCommand((sequenceId) => createDeleteSensorCommand(sensorId, sequenceId));
}

export function sendCompileMechanism(settings?: SimulationSettingsInput): void {
  sendBinaryCommand((sequenceId) => createCompileMechanismCommand(settings, sequenceId));
}

export function sendSimulationControl(action: SimulationAction): void {
  sendBinaryCommand((sequenceId) => createSimulationControlCommand(action, sequenceId));
}

function buildSettingsInput(): SimulationSettingsInput {
  const s = useSimulationSettingsStore.getState();
  return {
    timestep: s.timestep,
    gravity: s.gravity,
    duration: s.duration,
    solver: {
      type: s.solverType,
      maxIterations: s.maxIterations,
      tolerance: s.tolerance,
      integrator: s.integratorType,
    },
    contact: {
      friction: s.friction,
      restitution: s.restitution,
      compliance: s.compliance,
      damping: s.contactDamping,
      enableContact: s.enableContact,
    },
  };
}

/** Play, auto-compiling first if the model is stale or not yet compiled. */
export function sendCompileAndPlay(): void {
  const { state, needsCompile } = useSimulationStore.getState();
  if (state === 'paused' && !needsCompile) {
    sendSimulationControl(SimulationAction.PLAY);
    return;
  }
  connState.pendingActionAfterCompile = 'play';
  sendCompileMechanism(buildSettingsInput());
}

/** Step, auto-compiling first if the model is stale or not yet compiled. */
export function sendCompileAndStep(): void {
  const { state, needsCompile } = useSimulationStore.getState();
  if (state === 'paused' && !needsCompile) {
    sendSimulationControl(SimulationAction.STEP);
    return;
  }
  connState.pendingActionAfterCompile = 'step';
  sendCompileMechanism(buildSettingsInput());
}

export function sendScrub(time: number): void {
  sendBinaryCommand((sequenceId) => createScrubCommand(time, sequenceId));
}

export function sendSaveProject(projectName: string): void {
  if (!connState.ws || connState.ws.readyState !== WebSocket.OPEN) return;
  connState.saveIntentTracker.requestManualSave();
  sendBinaryCommand((sequenceId) => createSaveProjectCommand(projectName, sequenceId));
}

export function sendAutoSave(projectName: string): void {
  if (!connState.ws || connState.ws.readyState !== WebSocket.OPEN) return;
  if (!connState.saveIntentTracker.requestAutoSave()) return;
  sendBinaryCommand((sequenceId) => createSaveProjectCommand(projectName, sequenceId));
}

export function sendLoadProject(data: Uint8Array): void {
  sendBinaryCommand((sequenceId) => createLoadProjectCommand(data, sequenceId));
}

export function sendRelocateAsset(bodyId: string, newFilePath: string): void {
  sendBinaryCommand((sequenceId) =>
    createRelocateAssetCommand(bodyId, newFilePath, undefined, sequenceId),
  );
}

export function sendNewProject(projectName: string): void {
  sendBinaryCommand((sequenceId) => createNewProjectCommand(projectName, sequenceId));
}

export function sendSaveProjectAs(projectName: string): void {
  connState.saveIntentTracker.requestSaveAs();
  sendSaveProject(projectName);
}
