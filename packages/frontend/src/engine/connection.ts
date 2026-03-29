import {
  ChannelDataType,
  createAnalyzeFacePairCommand,
  createCompileMechanismCommand,
  createCreateDatumCommand,
  createCreateDatumFromFaceCommand,
  createCreateJointCommand,
  createDeleteDatumCommand,
  createDeleteGeometryCommand,
  createDeleteJointCommand,
  createCreateActuatorCommand,
  createUpdateActuatorCommand,
  createDeleteActuatorCommand,
  createCreateLoadCommand,
  createUpdateLoadCommand,
  createDeleteLoadCommand,
  createHandshakeCommand,
  createImportAssetCommand,
  createPlaceAssetInSceneCommand,
  createCreatePrimitiveBodyCommand,
  createLoadProjectCommand,
  createNewProjectCommand,
  createRelocateAssetCommand,
  createRenameDatumCommand,
  createRenameGeometryCommand,
  createUpdateDatumPoseCommand,
  createUpdateGeometryPoseCommand,
  createSaveProjectCommand,
  createScrubCommand,
  createSimulationControlCommand,
  createAttachGeometryCommand,
  createCreateBodyCommand,
  createDeleteBodyCommand,
  createDetachGeometryCommand,
  createUpdateBodyCommand,
  createUpdateJointCommand,
  createUpdateMassPropertiesCommand,
  createUpdatePrimitiveCommand,
  createUpdateCollisionConfigCommand,
  createMakeCompoundBodyCommand,
  createSplitBodyCommand,
  createReparentGeometryCommand,
  type CollisionConfigInput,
  type PrimitiveParamsInput,
  type SimulationSettingsInput,
  engineStateToString,
  eventToDebugJson,
  FacePairAlignment,
  FaceSurfaceClass,
  mapFacePairAlignment,
  mapJointType,
  parseEvent,
  SimStateEnum,
  SimulationAction,
  toProtoJointType,
  PROTOCOL_VERSION,
  ReferenceFrame,
  ActuatorControlMode,
  type Load,
  type PointForceLoad,
  type PointTorqueLoad,
  type LinearSpringDamperLoad,
  type Actuator,
  type RevoluteMotorActuator,
  type PrismaticMotorActuator,
  DatumSurfaceClass,
  DiagnosticSeverity,
} from '@motionlab/protocol';
import type { AnalyzeFacePairSuccess, CreateDatumFromFaceSuccess, ElementId, Joint, MissingAssetInfo } from '@motionlab/protocol';
import type { SceneGraphManager } from '@motionlab/viewport';
import { useAssetLibraryStore } from '../stores/asset-library.js';
import { useAuthoringStatusStore } from '../stores/authoring-status.js';
import { clearBodyPoses, setBodyPose } from '../stores/body-poses.js';
import type { EngineConnectionState } from '../stores/engine-connection.js';
import { useImportFlowStore } from '../stores/import-flow.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import { useLoadCreationStore } from '../stores/load-creation.js';
import type { ActuatorState, ActuatorTypeId, ControlModeId, BodyMassProperties, BodyPose, BodyState, DatumState, FaceGeometryInfo, GeometryState, JointTypeId, LoadState, LoadTypeId, ReferenceFrameId, MeshData } from '../stores/mechanism.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { type ChannelDescriptor, type StructuredDiagnostic, useSimulationStore } from '../stores/simulation.js';
import { useSimulationSettingsStore } from '../stores/simulation-settings.js';
import { useUILayoutStore } from '../stores/ui-layout.js';
import { useToolModeStore } from '../stores/tool-mode.js';
import { useToastStore } from '../stores/toast.js';
import { type StoreSample, addSamplesBatched, useTraceStore } from '../stores/traces.js';
import { alignmentFromEngineAnalysis, analyzeDatumAlignment, computeDatumWorldPose } from '../utils/datum-alignment.js';
import { getDebugRecorder } from '../debug/api.js';
import { SaveIntentTracker } from './save-intent.js';

// ---------------------------------------------------------------------------
// Proto extraction helpers — reduce duplication across import/load/relocate
// ---------------------------------------------------------------------------

function extractMassProperties(
  mp: { mass?: number; centerOfMass?: { x?: number; y?: number; z?: number }; ixx?: number; iyy?: number; izz?: number; ixy?: number; ixz?: number; iyz?: number } | undefined,
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

function extractPose(
  pose: { position?: { x?: number; y?: number; z?: number }; orientation?: { x?: number; y?: number; z?: number; w?: number } } | undefined,
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

function mapDatumSurfaceClass(surfaceClass: DatumSurfaceClass | undefined): DatumState['surfaceClass'] | undefined {
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

function extractMeshData(
  dm: { vertices?: number[]; indices?: number[]; normals?: number[] } | undefined,
): MeshData {
  return {
    vertices: new Float32Array(dm?.vertices ?? []),
    indices: new Uint32Array(dm?.indices ?? []),
    normals: new Float32Array(dm?.normals ?? []),
  };
}

function extractAssetRef(
  ref: { contentHash?: string; originalFilename?: string } | undefined,
): { contentHash: string; originalFilename: string } {
  return {
    contentHash: ref?.contentHash ?? '',
    originalFilename: ref?.originalFilename ?? '',
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- proto types are complex; extract values by key
function extractPrimitiveSource(
  ps: any,
): GeometryState['primitiveSource'] | undefined {
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
    params.box = { width: p.value.width ?? 0, height: p.value.height ?? 0, depth: p.value.depth ?? 0 };
  } else if (p?.case === 'cylinder') {
    params.cylinder = { radius: p.value.radius ?? 0, height: p.value.height ?? 0 };
  } else if (p?.case === 'sphere') {
    params.sphere = { radius: p.value.radius ?? 0 };
  }
  return { shape, params };
}

type CollisionConfigState = GeometryState['collisionConfig'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- proto types are complex; extract values by key
function extractCollisionConfig(
  cc: any,
): CollisionConfigState {
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
    halfExtents: { x: cc.halfExtents?.x ?? 0, y: cc.halfExtents?.y ?? 0, z: cc.halfExtents?.z ?? 0 },
    radius: cc.radius ?? 0,
    height: cc.height ?? 0,
    offset: { x: cc.offset?.x ?? 0, y: cc.offset?.y ?? 0, z: cc.offset?.z ?? 0 },
  };
}

function mapReferenceFrame(rf: ReferenceFrame): ReferenceFrameId {
  switch (rf) {
    case ReferenceFrame.DATUM_LOCAL:
      return 'datum-local';
    case ReferenceFrame.WORLD:
      return 'world';
    default:
      return 'world';
  }
}

function toProtoReferenceFrame(rf: ReferenceFrameId | undefined): ReferenceFrame {
  switch (rf) {
    case 'datum-local':
      return ReferenceFrame.DATUM_LOCAL;
    case 'world':
      return ReferenceFrame.WORLD;
    default:
      return ReferenceFrame.WORLD;
  }
}

function extractLoadState(load: Load): LoadState {
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

function loadStateToProto(s: LoadState): Load {
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
            vector: { $typeName: 'motionlab.mechanism.Vec3', x: s.vector?.x ?? 0, y: s.vector?.y ?? 0, z: s.vector?.z ?? 0 },
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
            vector: { $typeName: 'motionlab.mechanism.Vec3', x: s.vector?.x ?? 0, y: s.vector?.y ?? 0, z: s.vector?.z ?? 0 },
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

function mapControlMode(mode: ActuatorControlMode): ControlModeId {
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

function toProtoControlMode(mode: ControlModeId): ActuatorControlMode {
  switch (mode) {
    case 'position':
      return ActuatorControlMode.POSITION;
    case 'speed':
      return ActuatorControlMode.SPEED;
    case 'effort':
      return ActuatorControlMode.EFFORT;
  }
}

function extractActuatorState(actuator: Actuator): ActuatorState {
  const base = {
    id: actuator.id?.id ?? '',
    name: actuator.name,
  };
  switch (actuator.config.case) {
    case 'revoluteMotor':
      return {
        ...base,
        type: 'revolute-motor' as ActuatorTypeId,
        jointId: actuator.config.value.jointId?.id ?? '',
        controlMode: mapControlMode(actuator.config.value.controlMode),
        commandValue: actuator.config.value.commandValue,
        effortLimit: actuator.config.value.effortLimit,
      };
    case 'prismaticMotor':
      return {
        ...base,
        type: 'prismatic-motor' as ActuatorTypeId,
        jointId: actuator.config.value.jointId?.id ?? '',
        controlMode: mapControlMode(actuator.config.value.controlMode),
        commandValue: actuator.config.value.commandValue,
        effortLimit: actuator.config.value.effortLimit,
      };
    default:
      return { ...base, type: 'revolute-motor' as ActuatorTypeId, jointId: '', controlMode: 'position', commandValue: 0 };
  }
}

function actuatorStateToProto(s: ActuatorState): Actuator {
  const id = s.id
    ? ({ $typeName: 'motionlab.mechanism.ElementId', id: s.id } as ElementId)
    : undefined;
  const jointId = s.jointId
    ? ({ $typeName: 'motionlab.mechanism.ElementId', id: s.jointId } as ElementId)
    : undefined;
  const controlMode = toProtoControlMode(s.controlMode);
  const motorFields = {
    jointId,
    controlMode,
    commandValue: s.commandValue,
    effortLimit: s.effortLimit,
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

function extractBodyState(
  body: {
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
  },
): BodyState {
  // Read motionType, fall back to isFixed for old projects
  const motionType: 'dynamic' | 'fixed' = body.motionType === 2 ? 'fixed'
    : body.motionType === 1 ? 'dynamic'
    : body.isFixed ? 'fixed' : 'dynamic';

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

const IDENTITY_POSE: BodyPose = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
};

/** Add a body's merged geometry meshes to the scene graph. */
export const DETACHED_BODY_PREFIX = '__detached_';

function addDetachedGeometryToSceneGraph(
  sg: SceneGraphManager,
  geometry: GeometryState,
): void {
  const syntheticBodyId = `${DETACHED_BODY_PREFIX}${geometry.id}`;
  const pose = geometry.localPose; // for detached geometries, localPose stores world pose
  sg.upsertBody(syntheticBodyId, geometry.name, {
    position: [pose.position.x, pose.position.y, pose.position.z],
    rotation: [pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w],
  });
  sg.addBodyGeometry(
    syntheticBodyId,
    geometry.id,
    geometry.name,
    geometry.meshData,
    { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
    geometry.partIndex,
  );
}

function addBodyToSceneGraph(
  sg: SceneGraphManager,
  body: BodyState,
  geometries: GeometryState[],
): void {
  sg.upsertBody(
    body.id,
    body.name,
    {
      position: [body.pose.position.x, body.pose.position.y, body.pose.position.z],
      rotation: [body.pose.rotation.x, body.pose.rotation.y, body.pose.rotation.z, body.pose.rotation.w],
    },
  );
  for (const geometry of geometries) {
    sg.addBodyGeometry(
      body.id,
      geometry.id,
      geometry.name,
      geometry.meshData,
      {
        position: [geometry.localPose.position.x, geometry.localPose.position.y, geometry.localPose.position.z],
        rotation: [
          geometry.localPose.rotation.x,
          geometry.localPose.rotation.y,
          geometry.localPose.rotation.z,
          geometry.localPose.rotation.w,
        ],
      },
      geometry.partIndex,
    );
  }
}

type SetState = (
  updater:
    | Partial<EngineConnectionState>
    | ((state: EngineConnectionState) => Partial<EngineConnectionState>),
) => void;
type GetState = () => EngineConnectionState;

let ws: WebSocket | null = null;
let handshakeTimer: ReturnType<typeof setTimeout> | null = null;
let connectEpoch = 0;
// Queued action to dispatch immediately after a successful auto-compile.
let pendingActionAfterCompile: 'play' | 'step' | null = null;

// ---------------------------------------------------------------------------
// SceneGraphManager registry for hot-path frame updates
// ---------------------------------------------------------------------------

let sceneGraphManager: SceneGraphManager | null = null;

export function registerSceneGraph(sg: SceneGraphManager | null): void {
  sceneGraphManager = sg;
}

export function getSceneGraph(): SceneGraphManager | null {
  return sceneGraphManager;
}

// ---------------------------------------------------------------------------
// Missing assets callback — notifies App when a loaded project has missing assets
// ---------------------------------------------------------------------------

let missingAssetsCallback: ((assets: MissingAssetInfo[]) => void) | null = null;

export function onMissingAssets(cb: ((assets: MissingAssetInfo[]) => void) | null): void {
  missingAssetsCallback = cb;
}

// ---------------------------------------------------------------------------
// Relocate asset result callback — notifies dialog when relocation succeeds/fails
// ---------------------------------------------------------------------------

let relocateAssetCallback: ((bodyId: string, success: boolean, errorMessage?: string) => void) | null = null;

/** Pending primitive source info — set before sending, consumed by result handler. */
let pendingPrimitiveSource: GeometryState['primitiveSource'] | null = null;

const saveIntentTracker = new SaveIntentTracker();

export function onRelocateAssetResult(
  cb: ((bodyId: string, success: boolean, errorMessage?: string) => void) | null,
): void {
  relocateAssetCallback = cb;
}

// ---------------------------------------------------------------------------
// Playback speed — frame skipping for sub-1x speeds
// ---------------------------------------------------------------------------

let playbackSpeed = 1;
let frameSkipCounter = 0;

export function setPlaybackSpeed(speed: number): void {
  playbackSpeed = speed;
  frameSkipCounter = 0;
}

// ---------------------------------------------------------------------------
// FPS measurement
// ---------------------------------------------------------------------------

let frameCount = 0;
let lastFpsMeasure = 0;
let measuredFps = 0;
let nextSequenceId = 1n;
let reportedMissingSceneGraphForSession = false;

export function getMeasuredFps(): number {
  return measuredFps;
}

function allocateSequenceId(): bigint {
  const id = nextSequenceId;
  nextSequenceId += 1n;
  return id;
}

function sendBinaryCommand(builder: (sequenceId: bigint) => Uint8Array): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  const bytes = builder(allocateSequenceId());
  getDebugRecorder().recordOutboundCommand(bytes);
  ws.send(bytes);
  return true;
}

function cleanup() {
  if (handshakeTimer) {
    clearTimeout(handshakeTimer);
    handshakeTimer = null;
  }
  if (ws) {
    ws.onopen = null;
    ws.onclose = null;
    ws.onerror = null;
    ws.onmessage = null;
    ws.close();
    ws = null;
  }
  getDebugRecorder().markConnectionClosed('cleanup');
}

export function connect(set: SetState, _get: GetState) {
  cleanup();
  const myEpoch = ++connectEpoch;
  reportedMissingSceneGraphForSession = false;

  set({ status: 'discovering' });

  if (!window.motionlab) {
    set({ status: 'error', errorMessage: 'Not running in desktop app' });
    return;
  }

  window.motionlab
    .getEngineEndpoint()
    .then((endpoint) => {
      // Guard against StrictMode double-invoke: if connect() was called again
      // while this promise was in flight, this invocation is stale.
      if (myEpoch !== connectEpoch) return;

      if (!endpoint) {
        set({ status: 'error', errorMessage: 'Engine endpoint not available' });
        return;
      }

      set({ status: 'connecting', endpoint });

      const url = `ws://${endpoint.host}:${endpoint.port}`;
      const socket = new WebSocket(url);
      socket.binaryType = 'arraybuffer';
      ws = socket;

      socket.onopen = () => {
        if (ws !== socket) return;
        set({ status: 'handshaking' });
        const handshakeBytes = createHandshakeCommand(endpoint.sessionToken ?? '', allocateSequenceId());
        getDebugRecorder().recordOutboundCommand(handshakeBytes);
        socket.send(handshakeBytes);

        handshakeTimer = setTimeout(() => {
          getDebugRecorder().recordAnomaly({
            severity: 'error',
            code: 'handshake-timeout',
            message: 'Handshake timed out',
            details: { timeoutMs: 5000 },
          });
          set({ status: 'error', errorMessage: 'Handshake timed out' });
          cleanup();
        }, 5000);
      };

      socket.onmessage = (event) => {
        if (ws !== socket) return;
        let evt: ReturnType<typeof parseEvent>;
        const sizeBytes = event.data instanceof ArrayBuffer ? event.data.byteLength : 0;
        try {
          evt = parseEvent(event.data as ArrayBuffer);
        } catch (err) {
          console.warn('[protocol] failed to parse event:', err);
          getDebugRecorder().recordParseFailure('event', err, sizeBytes);
          return;
        }
        getDebugRecorder().recordInboundEvent(evt, sizeBytes);

        if ((import.meta as unknown as { env: { DEV: boolean } }).env.DEV) {
          console.debug('[protocol] ←', eventToDebugJson(evt));
        }

        switch (evt.payload.case) {
          case 'handshakeAck': {
            const ack = evt.payload.value;
            if (handshakeTimer) {
              clearTimeout(handshakeTimer);
              handshakeTimer = null;
            }
            if (!ack.compatible) {
              const engineVersion = ack.engineProtocol?.version ?? 'unknown';
              getDebugRecorder().recordAnomaly({
                severity: 'error',
                code: 'handshake-incompatible',
                message: 'Protocol version mismatch during handshake',
                details: {
                  expectedVersion: PROTOCOL_VERSION,
                  engineVersion,
                },
              });
              set({
                status: 'error',
                errorMessage: `Protocol version mismatch: frontend expects v${PROTOCOL_VERSION} but engine reports v${engineVersion}. Please rebuild both components.`,
              });
              cleanup();
              return;
            }
            set({ status: 'ready', engineVersion: ack.engineVersion });
            break;
          }
          case 'engineStatus': {
            set({ engineStatus: engineStateToString(evt.payload.value.state) });
            break;
          }
          case 'importAssetResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            if (result.success) {
              const bodies: BodyState[] = [];
              const geometries: GeometryState[] = [];

              if (result.geometries.length > 0) {
                // V4 path: geometry-based import
                const seenBodies = new Set<string>();
                for (const g of result.geometries) {
                  const hasBody = !!g.bodyId;
                  if (hasBody && !seenBodies.has(g.bodyId)) {
                    seenBodies.add(g.bodyId);
                    bodies.push({
                      id: g.bodyId,
                      name: g.name,
                      massProperties: extractMassProperties(g.computedMassProperties),
                      pose: extractPose(g.pose),
                      isFixed: false,
                      motionType: 'dynamic',
                      massOverride: false,
                    });
                  }
                  geometries.push({
                    id: g.geometryId,
                    name: g.name,
                    parentBodyId: hasBody ? g.bodyId : null,
                    // Bodyless geometries store world pose in localPose; parented use identity
                    localPose: hasBody ? IDENTITY_POSE : extractPose(g.pose),
                    meshData: extractMeshData(g.displayMesh),
                    partIndex: g.partIndex.length > 0 ? new Uint32Array(g.partIndex) : undefined,
                    computedMassProperties: extractMassProperties(g.computedMassProperties),
                    sourceAssetRef: extractAssetRef(g.sourceAssetRef),
                  });
                }
              } else if (result.bodies.length > 0) {
                // V3 fallback: create synthetic geometries from deprecated bodies field
                for (const b of result.bodies) {
                  bodies.push({
                    id: b.bodyId,
                    name: b.name,
                    massProperties: extractMassProperties(b.massProperties),
                    pose: extractPose(b.pose),
                    isFixed: false,
                    motionType: 'dynamic',
                    massOverride: false,
                  });
                  geometries.push({
                    id: `${b.bodyId}_geom`,
                    name: b.name,
                    parentBodyId: b.bodyId,
                    localPose: IDENTITY_POSE,
                    meshData: extractMeshData(b.displayMesh),
                    partIndex: b.partIndex.length > 0 ? new Uint32Array(b.partIndex) : undefined,
                    computedMassProperties: extractMassProperties(b.massProperties),
                    sourceAssetRef: extractAssetRef(b.sourceAssetRef),
                  });
                }
              }

              mechStore.addBodiesWithGeometries(bodies, geometries);

              // Add to scene graph
              if (sceneGraphManager) {
                for (const body of bodies) {
                  const bodyGeoms = geometries.filter((g) => g.parentBodyId === body.id);
                  addBodyToSceneGraph(sceneGraphManager, body, bodyGeoms);
                }
                // Add bodyless geometries as detached viewport entities
                for (const geom of geometries) {
                  if (!geom.parentBodyId) {
                    addDetachedGeometryToSceneGraph(sceneGraphManager, geom);
                  }
                }
              }

              // Apply viewport focus-point offset so imports land near the camera target
              if (sceneGraphManager && bodies.length > 0) {
                const focusPoint = sceneGraphManager.getViewportFocusPoint();
                // Compute centroid of all imported body positions
                let cx = 0, cy = 0, cz = 0;
                for (const b of bodies) {
                  cx += b.pose.position.x;
                  cy += b.pose.position.y;
                  cz += b.pose.position.z;
                }
                cx /= bodies.length;
                cy /= bodies.length;
                cz /= bodies.length;
                const dx = focusPoint.x - cx;
                const dz = focusPoint.z - cz;
                // Only offset if the focus point is meaningfully different from centroid
                if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
                  for (const b of bodies) {
                    sendUpdateBody(b.id, {
                      pose: {
                        position: {
                          x: b.pose.position.x + dx,
                          y: b.pose.position.y,
                          z: b.pose.position.z + dz,
                        },
                        orientation: b.pose.rotation,
                      },
                    });
                  }
                }
              }

              // Auto-select first imported entity
              if (bodies.length > 0) {
                useSelectionStore.getState().select(bodies[0].id);
              } else if (geometries.length > 0) {
                useSelectionStore.getState().select(geometries[0].id);
              }

              // Register in asset library for subsequent Place-in-Scene
              const assetId = result.assetId;
              if (assetId) {
                const importFlowStore = useImportFlowStore.getState();
                useAssetLibraryStore.getState().registerImportedAsset({
                  assetId,
                  filename: geometries[0]?.sourceAssetRef.originalFilename || bodies[0]?.name || 'Unknown',
                  contentHash: geometries[0]?.sourceAssetRef.contentHash || '',
                  partCount: geometries.length || bodies.length,
                  type: 'cad-import',
                  importFilePath: importFlowStore.pendingFilePath || '',
                  importOptions: importFlowStore.pendingImportOptions ?? undefined,
                });
              }

              useSimulationStore.getState().setNeedsCompile(true);
              const detachedCount = geometries.filter((g) => !g.parentBodyId).length;
              useToastStore.getState().addToast({
                variant: 'success',
                title: 'Import complete',
                description: detachedCount > 0
                  ? `${detachedCount} ${detachedCount === 1 ? 'geometry' : 'geometries'} imported (visual only)`
                  : `${bodies.length} ${bodies.length === 1 ? 'body' : 'bodies'} imported`,
                duration: 3000,
              });
            } else {
              mechStore.setImportError(result.errorMessage);
              useToastStore.getState().addToast({
                variant: 'error',
                title: 'Import failed',
                description: result.errorMessage,
              });
            }
            mechStore.setImporting(false);
            break;
          }
          case 'placeAssetInSceneResult': {
            const result = evt.payload.value;
            if (!result.success) {
              useToastStore.getState().addToast({
                variant: 'error',
                title: 'Placement failed',
                description: result.errorMessage || 'Asset not found in cache. Re-import required.',
              });
              break;
            }

            const mechStore = useMechanismStore.getState();
            const bodies: BodyState[] = [];
            const geometries: GeometryState[] = [];

            if (result.geometries.length > 0) {
              const seenBodies = new Set<string>();
              for (const g of result.geometries) {
                if (!seenBodies.has(g.bodyId)) {
                  seenBodies.add(g.bodyId);
                  bodies.push({
                    id: g.bodyId,
                    name: g.name,
                    massProperties: extractMassProperties(g.computedMassProperties),
                    pose: extractPose(g.pose),
                    isFixed: false,
                    motionType: 'dynamic',
                    massOverride: false,
                  });
                }
                geometries.push({
                  id: g.geometryId,
                  name: g.name,
                  parentBodyId: g.bodyId,
                  localPose: IDENTITY_POSE,
                  meshData: extractMeshData(g.displayMesh),
                  partIndex: g.partIndex.length > 0 ? new Uint32Array(g.partIndex) : undefined,
                  computedMassProperties: extractMassProperties(g.computedMassProperties),
                  sourceAssetRef: extractAssetRef(g.sourceAssetRef),
                });
              }
            } else if (result.bodies.length > 0) {
              for (const b of result.bodies) {
                bodies.push({
                  id: b.bodyId,
                  name: b.name,
                  massProperties: extractMassProperties(b.massProperties),
                  pose: extractPose(b.pose),
                  isFixed: false,
                  motionType: 'dynamic',
                  massOverride: false,
                });
                geometries.push({
                  id: `${b.bodyId}_geom`,
                  name: b.name,
                  parentBodyId: b.bodyId,
                  localPose: IDENTITY_POSE,
                  meshData: extractMeshData(b.displayMesh),
                  partIndex: b.partIndex.length > 0 ? new Uint32Array(b.partIndex) : undefined,
                  computedMassProperties: extractMassProperties(b.massProperties),
                  sourceAssetRef: extractAssetRef(b.sourceAssetRef),
                });
              }
            }

            mechStore.addBodiesWithGeometries(bodies, geometries);

            // Add to scene graph
            if (sceneGraphManager) {
              for (const body of bodies) {
                const bodyGeoms = geometries.filter((g) => g.parentBodyId === body.id);
                addBodyToSceneGraph(sceneGraphManager, body, bodyGeoms);
              }
            }

            // Auto-select the first placed body
            if (bodies.length > 0) {
              useSelectionStore.getState().select(bodies[0].id);
            }

            useSimulationStore.getState().setNeedsCompile(true);
            useToastStore.getState().addToast({
              variant: 'success',
              title: 'Asset placed',
              description: `${bodies.length} ${bodies.length === 1 ? 'body' : 'bodies'} added to scene`,
              duration: 3000,
            });
            break;
          }
          case 'createPrimitiveBodyResult': {
            const result = evt.payload.value;
            if (result.result.case === 'geometry') {
              const g = result.result.value;
              const bodyProto = result.body;

              const body: BodyState = {
                id: g.bodyId,
                name: g.name,
                massProperties: extractMassProperties(bodyProto?.massProperties),
                pose: extractPose(bodyProto?.pose ?? g.pose),
                isFixed: bodyProto?.isFixed ?? false,
                motionType: bodyProto?.motionType === 2 ? 'fixed'
                  : bodyProto?.motionType === 1 ? 'dynamic'
                  : bodyProto?.isFixed ? 'fixed' : 'dynamic',
                massOverride: bodyProto?.massOverride ?? false,
              };

              // Prefer proto-sourced primitiveSource; fall back to pending client-side source
              const primSource = g.primitiveSource
                ? extractPrimitiveSource(g.primitiveSource)
                : pendingPrimitiveSource ?? undefined;
              pendingPrimitiveSource = null;

              const geometry: GeometryState = {
                id: g.geometryId,
                name: g.name,
                parentBodyId: g.bodyId,
                localPose: IDENTITY_POSE,
                meshData: extractMeshData(g.displayMesh),
                partIndex: g.partIndex.length > 0 ? new Uint32Array(g.partIndex) : undefined,
                computedMassProperties: extractMassProperties(g.computedMassProperties),
                sourceAssetRef: { contentHash: '', originalFilename: '' },
                primitiveSource: primSource,
              };

              const mechStore = useMechanismStore.getState();
              mechStore.addBodiesWithGeometries([body], [geometry]);

              if (sceneGraphManager) {
                addBodyToSceneGraph(sceneGraphManager, body, [geometry]);
              }

              useSelectionStore.getState().select(body.id);
              useSimulationStore.getState().setNeedsCompile(true);
              useToastStore.getState().addToast({
                variant: 'success',
                title: 'Primitive created',
                description: `${g.name} added to scene`,
                duration: 3000,
              });
            } else if (result.result.case === 'errorMessage') {
              pendingPrimitiveSource = null;
              useToastStore.getState().addToast({
                variant: 'error',
                title: 'Primitive creation failed',
                description: result.result.value,
              });
            }
            break;
          }
          case 'updatePrimitiveResult': {
            const result = evt.payload.value;
            if (result.result.case === 'success') {
              const s = result.result.value;
              const geomProto = s.geometry;
              const geomId = geomProto?.id?.id ?? '';
              const mechStore = useMechanismStore.getState();

              mechStore.updateGeometry(geomId, {
                meshData: extractMeshData(s.displayMesh),
                computedMassProperties: extractMassProperties(geomProto?.computedMassProperties),
                primitiveSource: extractPrimitiveSource(geomProto?.primitiveSource),
              });

              // Update parent body with recomputed aggregate mass
              if (s.parentBody) {
                const bodyId = s.parentBody.id?.id ?? '';
                if (bodyId) {
                  mechStore.addBodies([extractBodyState(s.parentBody)]);
                }
              }
              applyUpdatedDatums(s.updatedDatums);

              // Replace mesh in scene graph
              if (sceneGraphManager && geomProto) {
                const bodyId = geomProto.parentBodyId?.id ?? '';
                const partIndex = s.partIndex.length > 0 ? new Uint32Array(s.partIndex) : undefined;
                sceneGraphManager.addBodyGeometry(
                  bodyId, geomId, geomProto.name ?? '',
                  extractMeshData(s.displayMesh),
                  { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
                  partIndex,
                );
              }

              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              useToastStore.getState().addToast({
                variant: 'error',
                title: 'Primitive update failed',
                description: result.result.value,
              });
            }
            break;
          }
          case 'updateCollisionConfigResult': {
            const result = evt.payload.value;
            if (result.result.case === 'success') {
              const s = result.result.value;
              const geomId = s.geometry?.id?.id ?? '';
              useMechanismStore.getState().updateGeometry(geomId, {
                collisionConfig: extractCollisionConfig(s.resolvedConfig),
              });
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              useToastStore.getState().addToast({
                variant: 'error',
                title: 'Collision config update failed',
                description: result.result.value,
              });
            }
            break;
          }
          case 'createDatumResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            if (result.result.case === 'datum') {
              const d = result.result.value;
              mechStore.addDatum(extractDatumState(d));
              useSimulationStore.getState().setNeedsCompile(true);

              // If joint creation is waiting for this datum (primitive fallback path),
              // advance the state machine the same way createDatumFromFaceResult does.
              const jcs = useJointCreationStore.getState();
              if (jcs.creatingDatum) {
                const newDatumId = d.id?.id ?? '';
                if (jcs.step === 'pick-parent') {
                  jcs.setParentDatum(newDatumId);
                } else if (jcs.step === 'pick-child') {
                  const parentDatum = jcs.parentDatumId
                    ? mechStore.datums.get(jcs.parentDatumId)
                    : undefined;
                  const childDatum = mechStore.datums.get(newDatumId);
                  if (parentDatum && childDatum) {
                    const parentBody = mechStore.bodies.get(parentDatum.parentBodyId);
                    const childBody = mechStore.bodies.get(childDatum.parentBodyId);
                    if (parentBody && childBody) {
                      const alignment = analyzeDatumAlignment(
                        computeDatumWorldPose(parentBody.pose, parentDatum.localPose),
                        computeDatumWorldPose(childBody.pose, childDatum.localPose),
                      );
                      jcs.setChildDatum(newDatumId, alignment);
                    } else {
                      jcs.setChildDatum(newDatumId);
                    }
                  }
                }
                jcs.setCreatingDatum(false);
              }

              // Also advance load creation if waiting
              const lcs = useLoadCreationStore.getState();
              if (lcs.creatingDatum) {
                const newDatumId = d.id?.id ?? '';
                if (lcs.step === 'pick-datum') {
                  lcs.setDatum(newDatumId);
                } else if (lcs.step === 'pick-second-datum') {
                  lcs.setSecondDatum(newDatumId);
                }
                lcs.setCreatingDatum(false);
              }
            } else if (result.result.case === 'errorMessage') {
              console.error('[datum] create failed:', result.result.value);
            }
            break;
          }
          case 'createDatumFromFaceResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            const statusStore = useAuthoringStatusStore.getState();
            if (result.result.case === 'success') {
              const success = result.result.value;
              const d = success.datum;
              if (!d) break;
              mechStore.addDatum(extractDatumState(d));
              statusStore.setMessage(
                `Created datum from ${surfaceClassToLabel(success.surfaceClass)} face`,
              );

              // If joint creation is waiting for this datum, advance the state machine
              const jcs = useJointCreationStore.getState();
              if (jcs.creatingDatum) {
                const newDatumId = d.id?.id ?? '';
                const surfaceClass = mapSurfaceClass(success.surfaceClass) ?? null;
                if (jcs.step === 'pick-parent') {
                  jcs.setParentDatum(newDatumId, surfaceClass, success.geometryId?.id ?? null, success.faceIndex);
                } else if (jcs.step === 'pick-child') {
                  const parentDatum = jcs.parentDatumId
                    ? mechStore.datums.get(jcs.parentDatumId)
                    : undefined;
                  const childDatum = mechStore.datums.get(newDatumId);
                  if (parentDatum && childDatum) {
                    const parentBody = mechStore.bodies.get(parentDatum.parentBodyId);
                    const childBody = mechStore.bodies.get(childDatum.parentBodyId);
                    if (parentBody && childBody) {
                      const alignment = analyzeDatumAlignment(
                        computeDatumWorldPose(parentBody.pose, parentDatum.localPose),
                        computeDatumWorldPose(childBody.pose, childDatum.localPose),
                      );
                      jcs.setChildDatum(newDatumId, alignment, surfaceClass);
                    } else {
                      jcs.setChildDatum(newDatumId, undefined, surfaceClass);
                    }
                  }
                }
                jcs.setCreatingDatum(false);

                // The type selector panel always appears so the user can
                // confirm or override the recommended joint type.
              }

              const lcs = useLoadCreationStore.getState();
              if (lcs.creatingDatum) {
                const newDatumId = d.id?.id ?? '';
                if (lcs.step === 'pick-datum') {
                  lcs.setDatum(newDatumId);
                } else if (lcs.step === 'pick-second-datum') {
                  if (lcs.datumId === newDatumId) {
                    useAuthoringStatusStore
                      .getState()
                      .setMessage('Choose a different datum for the spring-damper target');
                  } else {
                    lcs.setSecondDatum(newDatumId);
                  }
                }
                lcs.setCreatingDatum(false);
              }
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              statusStore.setMessage(result.result.value);
              console.error('[datum] create-from-face failed:', result.result.value);
              // Clear the creating flag if face-to-datum failed during joint creation
              const jcs = useJointCreationStore.getState();
              if (jcs.creatingDatum) {
                jcs.setCreatingDatum(false);
              }
              const lcs = useLoadCreationStore.getState();
              if (lcs.creatingDatum) {
                lcs.setCreatingDatum(false);
              }
            }
            break;
          }
          case 'analyzeFacePairResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            const statusStore = useAuthoringStatusStore.getState();
            if (result.result.case === 'success') {
              const success = result.result.value;
              const d = success.childDatum;
              if (!d) break;

              // Add child datum to mechanism store
              mechStore.addDatum(extractDatumState(d));

              const jcs = useJointCreationStore.getState();
              if (jcs.creatingDatum) {
                const childId = d.id?.id ?? '';
                const childSurfaceClass = mapSurfaceClass(success.childSurfaceClass) ?? null;

                // Build alignment from engine analysis
                const alignmentKind = mapFacePairAlignment(success.alignment);
                const recommendedType = mapJointType(success.recommendedJointType);
                const alignment = alignmentFromEngineAnalysis(alignmentKind, recommendedType, success.recommendationConfidence);

                jcs.setChildDatum(childId, alignment, childSurfaceClass);
                jcs.setCreatingDatum(false);

                // The type selector panel always appears so the user can
                // confirm or override the recommended joint type.

                statusStore.setMessage(
                  `Analyzed: ${alignmentKind} alignment (${Math.round(success.recommendationConfidence * 100)}% confidence)`,
                );
              }

              // Handle load creation fallback (same pattern as createDatumFromFaceResult)
              const lcs = useLoadCreationStore.getState();
              if (lcs.creatingDatum) {
                const newDatumId = d.id?.id ?? '';
                if (lcs.step === 'pick-datum') {
                  lcs.setDatum(newDatumId);
                } else if (lcs.step === 'pick-second-datum') {
                  if (lcs.datumId === newDatumId) {
                    useAuthoringStatusStore
                      .getState()
                      .setMessage('Choose a different datum for the spring-damper target');
                  } else {
                    lcs.setSecondDatum(newDatumId);
                  }
                }
                lcs.setCreatingDatum(false);
              }
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              statusStore.setMessage(result.result.value);
              console.error('[analyze-face-pair] failed:', result.result.value);
              const jcs = useJointCreationStore.getState();
              if (jcs.creatingDatum) {
                jcs.setCreatingDatum(false);
              }
              const lcs = useLoadCreationStore.getState();
              if (lcs.creatingDatum) {
                lcs.setCreatingDatum(false);
              }
            }
            break;
          }
          case 'deleteDatumResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            if (result.result.case === 'deletedId') {
              mechStore.removeDatum(result.result.value.id);
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              console.error('[datum] delete failed:', result.result.value);
            }
            break;
          }
          case 'renameDatumResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            if (result.result.case === 'datum') {
              const d = result.result.value;
              mechStore.renameDatum(d.id?.id ?? '', d.name);
            } else if (result.result.case === 'errorMessage') {
              console.error('[datum] rename failed:', result.result.value);
            }
            break;
          }
          case 'updateDatumPoseResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            if (result.result.case === 'datum') {
              const d = result.result.value;
              mechStore.updateDatumPose(d.id?.id ?? '', {
                position: {
                  x: d.localPose?.position?.x ?? 0,
                  y: d.localPose?.position?.y ?? 0,
                  z: d.localPose?.position?.z ?? 0,
                },
                rotation: {
                  x: d.localPose?.orientation?.x ?? 0,
                  y: d.localPose?.orientation?.y ?? 0,
                  z: d.localPose?.orientation?.z ?? 0,
                  w: d.localPose?.orientation?.w ?? 1,
                },
              });
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              console.error('[datum] update pose failed:', result.result.value);
            }
            break;
          }
          case 'updateGeometryPoseResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            if (result.result.case === 'geometry') {
              const g = result.result.value;
              const geomId = g.id?.id ?? '';
              mechStore.updateGeometry(geomId, {
                localPose: extractPose(g.localPose),
              });
              // Update parent body with recomputed aggregate mass
              if (result.updatedParentBody?.id?.id) {
                mechStore.addBodies([extractBodyState(result.updatedParentBody)]);
              }
              applyUpdatedDatums(result.updatedDatums);
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              console.error('[geometry] update pose failed:', result.result.value);
            }
            break;
          }
          case 'updateBodyResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            if (result.result.case === 'body') {
              const b = result.result.value;
              mechStore.addBodies([extractBodyState(b)]);
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              console.error('[body] update failed:', result.result.value);
            }
            applyUpdatedDatums(result.updatedDatums);
            break;
          }
          case 'createJointResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            if (result.result.case === 'joint') {
              const j = result.result.value;
              mechStore.addJoint({
                id: j.id?.id ?? '',
                name: j.name,
                type: mapJointType(j.type),
                parentDatumId: j.parentDatumId?.id ?? '',
                childDatumId: j.childDatumId?.id ?? '',
                lowerLimit: j.lowerLimit,
                upperLimit: j.upperLimit,
                ...extractJointDamping(j),
              });
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              console.error('[joint] create failed:', result.result.value);
            }
            break;
          }
          case 'updateJointResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            if (result.result.case === 'joint') {
              const j = result.result.value;
              mechStore.updateJoint(j.id?.id ?? '', {
                name: j.name,
                type: mapJointType(j.type),
                parentDatumId: j.parentDatumId?.id ?? '',
                childDatumId: j.childDatumId?.id ?? '',
                lowerLimit: j.lowerLimit,
                upperLimit: j.upperLimit,
                ...extractJointDamping(j),
              });
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              console.error('[joint] update failed:', result.result.value);
            }
            break;
          }
          case 'deleteJointResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            if (result.result.case === 'deletedId') {
              mechStore.removeJoint(result.result.value.id);
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              console.error('[joint] delete failed:', result.result.value);
            }
            break;
          }
          case 'createLoadResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            if (result.result.case === 'load') {
              const loadState = extractLoadState(result.result.value);
              mechStore.addLoad(loadState);
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              console.error('[load] create failed:', result.result.value);
            }
            break;
          }
          case 'updateLoadResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            if (result.result.case === 'load') {
              const loadState = extractLoadState(result.result.value);
              mechStore.updateLoad(loadState.id, loadState);
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              console.error('[load] update failed:', result.result.value);
            }
            break;
          }
          case 'deleteLoadResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            if (result.result.case === 'deletedId') {
              mechStore.removeLoad(result.result.value.id);
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              console.error('[load] delete failed:', result.result.value);
            }
            break;
          }
          case 'createActuatorResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            if (result.result.case === 'actuator') {
              const actuatorState = extractActuatorState(result.result.value);
              mechStore.addActuator(actuatorState);
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              console.error('[actuator] create failed:', result.result.value);
            }
            break;
          }
          case 'updateActuatorResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            if (result.result.case === 'actuator') {
              const actuatorState = extractActuatorState(result.result.value);
              mechStore.updateActuator(actuatorState.id, actuatorState);
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              console.error('[actuator] update failed:', result.result.value);
            }
            break;
          }
          case 'deleteActuatorResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            if (result.result.case === 'deletedId') {
              mechStore.removeActuator(result.result.value.id);
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              console.error('[actuator] delete failed:', result.result.value);
            }
            break;
          }
          case 'compilationResult': {
            const result = evt.payload.value;
            const channels: ChannelDescriptor[] = (result.channels ?? []).map((ch) => ({
              channelId: ch.channelId,
              name: ch.name,
              unit: ch.unit,
              dataType:
                ch.dataType === ChannelDataType.VEC3 ? ('vec3' as const) : ('scalar' as const),
            }));
            const severityMap: Record<number, StructuredDiagnostic['severity']> = {
              [DiagnosticSeverity.DIAGNOSTIC_INFO]: 'info',
              [DiagnosticSeverity.DIAGNOSTIC_WARNING]: 'warning',
              [DiagnosticSeverity.DIAGNOSTIC_ERROR]: 'error',
            };
            const structuredDiags: StructuredDiagnostic[] = (
              result.structuredDiagnostics ?? []
            ).map((d) => ({
              severity: severityMap[d.severity] ?? 'info',
              message: d.message,
              affectedEntityIds: [...(d.affectedEntityIds ?? [])],
              suggestion: d.suggestion,
              code: d.code,
            }));
            useSimulationStore
              .getState()
              .setCompilationResult(
                result.success,
                result.errorMessage,
                result.diagnostics,
                channels,
                structuredDiags,
              );
            useTraceStore.getState().setChannels(channels);
            // Auto-switch to diagnostics tab if there are issues
            if (structuredDiags.length > 0) {
              useUILayoutStore.getState().setBottomPanelActiveTab('diagnostics');
            }
            if (result.success) {
              useToolModeStore.getState().setMode('select');
              // Dispatch any queued play/step that triggered this auto-compile.
              if (pendingActionAfterCompile) {
                const action = pendingActionAfterCompile;
                pendingActionAfterCompile = null;
                sendSimulationControl(
                  action === 'play' ? SimulationAction.PLAY : SimulationAction.STEP,
                );
              } else {
                useToastStore.getState().addToast({
                  variant: 'success',
                  title: 'Compilation successful',
                  duration: 2000,
                });
              }
            } else {
              pendingActionAfterCompile = null;
              useAuthoringStatusStore
                .getState()
                .setMessage(result.errorMessage || 'Compilation failed');
              useToastStore.getState().addToast({
                variant: 'error',
                title: 'Compilation failed',
                description: result.errorMessage || 'Unknown error',
              });
            }
            break;
          }
          case 'simulationState': {
            const sev = evt.payload.value;
            const SIM = SimStateEnum;
            const mapped =
              sev.state === SIM.SIM_STATE_RUNNING
                ? ('running' as const)
                : sev.state === SIM.SIM_STATE_PAUSED
                  ? ('paused' as const)
                  : sev.state === SIM.SIM_STATE_COMPILING
                    ? ('compiling' as const)
                    : sev.state === SIM.SIM_STATE_ERROR
                      ? ('error' as const)
                      : ('idle' as const);

            const prevState = useSimulationStore.getState().state;
            useSimulationStore.getState().setSimState(mapped, sev.simTime, Number(sev.stepCount));

            // TODO: When finite-duration simulations are added, check
            // useSimulationStore.getState().loopEnabled here and auto-restart
            // via sendSimulationControl(SimulationAction.PLAY) on natural end.

            // Clear traces, body pose cache, and restore initial poses on reset
            if (
              mapped === 'idle' &&
              (prevState === 'running' || prevState === 'paused' || prevState === 'error')
            ) {
              useTraceStore.getState().clear();
              clearBodyPoses();
              if (sceneGraphManager) {
                sceneGraphManager.clearForceArrows();
                const { bodies } = useMechanismStore.getState();
                sceneGraphManager.applyBodyTransforms(
                  Array.from(bodies.values(), (body) => ({
                    id: body.id,
                    pose: {
                      position: [body.pose.position.x, body.pose.position.y, body.pose.position.z],
                      rotation: [
                        body.pose.rotation.x,
                        body.pose.rotation.y,
                        body.pose.rotation.z,
                        body.pose.rotation.w,
                      ],
                    },
                  })),
                );
              }
            }
            break;
          }
          case 'simulationFrame': {
            // FPS measurement
            const now = performance.now();
            frameCount++;
            if (now - lastFpsMeasure > 1000) {
              measuredFps = frameCount;
              frameCount = 0;
              lastFpsMeasure = now;
            }

            // Frame skipping for sub-1x playback speeds
            if (playbackSpeed < 1) {
              frameSkipCounter++;
              const skip = Math.round(1 / playbackSpeed); // 0.5→2, 0.25→4
              if (frameSkipCounter % skip !== 0) break;
            }

            if (!sceneGraphManager) {
              console.warn('[sim] no sceneGraphManager, skipping frame');
              if (!reportedMissingSceneGraphForSession) {
                reportedMissingSceneGraphForSession = true;
                getDebugRecorder().recordAnomaly({
                  severity: 'warning',
                  code: 'simulation-frame-without-scene-graph',
                  message: 'Simulation frames arrived before the scene graph manager was attached',
                });
              }
              break;
            }
            const frame = evt.payload.value;
            if (frame.bodyPoses.length === 0) {
              console.warn('[sim] frame has no body poses');
            }
            sceneGraphManager.applyBodyTransforms(
              frame.bodyPoses.map((bp) => {
                const pos = {
                  x: bp.position?.x ?? 0,
                  y: bp.position?.y ?? 0,
                  z: bp.position?.z ?? 0,
                };
                const rot = {
                  x: bp.orientation?.x ?? 0,
                  y: bp.orientation?.y ?? 0,
                  z: bp.orientation?.z ?? 0,
                  w: bp.orientation?.w ?? 1,
                };
                setBodyPose(bp.bodyId, pos, rot);
                return {
                  id: bp.bodyId,
                  pose: {
                    position: [pos.x, pos.y, pos.z],
                    rotation: [rot.x, rot.y, rot.z, rot.w],
                  },
                };
              }),
            );
            sceneGraphManager.applyJointForceUpdates(
              frame.jointStates.map((js) => ({
                jointId: js.jointId,
                force: {
                  x: js.reactionForce?.x ?? 0,
                  y: js.reactionForce?.y ?? 0,
                  z: js.reactionForce?.z ?? 0,
                },
                torque: {
                  x: js.reactionTorque?.x ?? 0,
                  y: js.reactionTorque?.y ?? 0,
                  z: js.reactionTorque?.z ?? 0,
                },
              })),
            );
            /*
             * Update simulation time from frame data so timeline tracks progress.
             * Keep this out of the viewport hot path.
             */
            useSimulationStore
              .getState()
              .updateSimTime(frame.simTime, Number(frame.stepCount));
            break;
          }
          case 'simulationTrace': {
            const trace = evt.payload.value;
            const samples: StoreSample[] = [];
            for (const s of trace.samples) {
              if (s.value.case === 'vector') {
                const v = s.value.value;
                samples.push({
                  time: s.time,
                  value: Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z),
                  vec: { x: v.x, y: v.y, z: v.z },
                });
              } else if (s.value.case === 'scalar') {
                samples.push({ time: s.time, value: s.value.value });
              }
            }
            addSamplesBatched(trace.channelId, samples);
            break;
          }
          case 'saveProjectResult': {
            const result = evt.payload.value;
            if (result.result.case === 'projectData') {
              const bytes = new Uint8Array(result.result.value);
              const mechStore = useMechanismStore.getState();

              const saveIntent = saveIntentTracker.consumeProjectData(mechStore.projectFilePath);

              if (saveIntent.kind === 'autosave') {
                const projectPath = mechStore.projectFilePath;
                window.motionlab?.autoSaveWrite?.(bytes, projectPath)
                  .catch((err: unknown) => console.error('[autosave] write failed:', err));
                break;
              }

              // Manual save flow
              const projectName = mechStore.projectName;
              const existingPath = saveIntent.existingPath;

              const savePromise = existingPath && window.motionlab?.saveProjectToPath
                ? window.motionlab.saveProjectToPath(bytes, existingPath)
                : window.motionlab?.saveProjectFile(bytes, projectName);

              savePromise
                ?.then((saveResult) => {
                  if (saveResult.saved && saveResult.filePath) {
                    mechStore.setProjectMeta(projectName, saveResult.filePath);
                    mechStore.markClean();
                    window.motionlab?.addRecentProject?.({ name: projectName, filePath: saveResult.filePath });
                    // Clean up autosave file after successful manual save
                    window.motionlab?.autoSaveCleanup?.(saveResult.filePath);
                  }
                })
                .catch((err: unknown) => {
                  console.error('[project] save failed:', err);
                });
            } else if (result.result.case === 'errorMessage') {
              const intent = saveIntentTracker.consumeError();
              console.error(intent === 'autosave' ? '[autosave] save failed:' : '[project] save failed:', result.result.value);
            }
            break;
          }
          case 'loadProjectResult': {
            const result = evt.payload.value;
            if (result.result.case === 'success') {
              const success = result.result.value;
              const mechStore = useMechanismStore.getState();

              // Clear all state
              mechStore.clear();
              useSimulationStore.getState().reset();
              if (sceneGraphManager) sceneGraphManager.clear();

              const mechanism = success.mechanism;

              // Build lookup for mechanism body protos
              const mechanismBodies = new Map(
                (mechanism?.bodies ?? []).map((b) => [b.id?.id ?? '', b]),
              );

              // Build body states from mechanism protos
              const bodyStates: BodyState[] = (mechanism?.bodies ?? []).map(extractBodyState);

              // Build geometry states
              const geometryStates: GeometryState[] = [];

              if (mechanism && mechanism.geometries.length > 0) {
                // V4 path: use geometry-first display data keyed by geometry id
                const geometryImportLookup = new Map(
                  success.geometries.map((g) => [g.geometryId, g]),
                );
                const bodyImportLookup = new Map(
                  success.bodies.map((b) => [b.bodyId, b]),
                );

                for (const g of mechanism.geometries) {
                  const geomId = g.id?.id ?? '';
                  const parentBodyId = g.parentBodyId?.id ?? null;
                  const geometryImport = geometryImportLookup.get(geomId);
                  const bodyImport = parentBodyId ? bodyImportLookup.get(parentBodyId) : undefined;

                  let meshData: MeshData;
                  let partIndex: Uint32Array | undefined;

                  if (geometryImport) {
                    meshData = extractMeshData(geometryImport.displayMesh);
                    partIndex = geometryImport.partIndex.length > 0
                      ? new Uint32Array(geometryImport.partIndex)
                      : undefined;
                  } else if (g.displayMesh && (g.displayMesh.vertices?.length ?? 0) > 0) {
                    meshData = extractMeshData(g.displayMesh);
                    partIndex = bodyImport && bodyImport.partIndex.length > 0
                      ? new Uint32Array(bodyImport.partIndex)
                      : undefined;
                  } else {
                    meshData = extractMeshData(bodyImport?.displayMesh);
                    partIndex = bodyImport && bodyImport.partIndex.length > 0
                      ? new Uint32Array(bodyImport.partIndex)
                      : undefined;
                  }

                  geometryStates.push({
                    id: geomId,
                    name: g.name,
                    parentBodyId,
                    localPose: extractPose(g.localPose),
                    meshData,
                    partIndex,
                    computedMassProperties: extractMassProperties(
                      geometryImport?.computedMassProperties ?? g.computedMassProperties,
                    ),
                    sourceAssetRef: extractAssetRef(
                      geometryImport?.sourceAssetRef ?? g.sourceAssetRef,
                    ),
                    primitiveSource: extractPrimitiveSource(
                      geometryImport?.primitiveSource ?? g.primitiveSource,
                    ),
                    collisionConfig: extractCollisionConfig(g.collisionConfig),
                  });
                }
              } else if (success.bodies.length > 0) {
                // V3 fallback: create synthetic geometries from body import results
                for (const b of success.bodies) {
                  const mechBody = mechanismBodies.get(b.bodyId);
                  geometryStates.push({
                    id: `${b.bodyId}_geom`,
                    name: b.name,
                    parentBodyId: b.bodyId,
                    localPose: IDENTITY_POSE,
                    meshData: extractMeshData(b.displayMesh),
                    partIndex: b.partIndex.length > 0 ? new Uint32Array(b.partIndex) : undefined,
                    computedMassProperties: extractMassProperties(b.massProperties),
                    sourceAssetRef: extractAssetRef(mechBody?.sourceAssetRef ?? b.sourceAssetRef),
                  });
                }
              }

              mechStore.addBodiesWithGeometries(bodyStates, geometryStates);

              // Add bodies to scene graph
              if (sceneGraphManager) {
                for (const body of bodyStates) {
                  const bodyGeoms = geometryStates.filter((g) => g.parentBodyId === body.id);
                  addBodyToSceneGraph(sceneGraphManager, body, bodyGeoms);
                }
              }

              // Rebuild datums
              if (mechanism) {
                for (const d of mechanism.datums) {
                  const datumState = extractDatumState(d);
                  mechStore.addDatum(datumState);
                  if (sceneGraphManager) {
                    sceneGraphManager.addDatum(
                      datumState.id,
                      datumState.parentBodyId,
                      {
                        position: [
                          datumState.localPose.position.x,
                          datumState.localPose.position.y,
                          datumState.localPose.position.z,
                        ],
                        rotation: [
                          datumState.localPose.rotation.x,
                          datumState.localPose.rotation.y,
                          datumState.localPose.rotation.z,
                          datumState.localPose.rotation.w,
                        ],
                      },
                      datumState.name,
                      {
                        surfaceClass: datumState.surfaceClass,
                        faceGeometry: datumState.faceGeometry,
                      },
                    );
                  }
                }

                // Rebuild joints
                for (const j of mechanism.joints) {
                  const jointState = {
                    id: j.id?.id ?? '',
                    name: j.name,
                    type: mapJointType(j.type),
                    parentDatumId: j.parentDatumId?.id ?? '',
                    childDatumId: j.childDatumId?.id ?? '',
                    lowerLimit: j.lowerLimit,
                    upperLimit: j.upperLimit,
                    ...extractJointDamping(j),
                  };
                  mechStore.addJoint(jointState);
                  if (sceneGraphManager) {
                    sceneGraphManager.addJoint(
                      jointState.id,
                      jointState.parentDatumId,
                      jointState.childDatumId,
                      jointState.type,
                    );
                  }
                }

                // Rebuild loads
                for (const l of mechanism.loads) {
                  const loadState = extractLoadState(l);
                  mechStore.addLoad(loadState);
                }

                // Rebuild actuators
                for (const a of mechanism.actuators) {
                  const actuatorState = extractActuatorState(a);
                  mechStore.addActuator(actuatorState);
                }
              }

              // Set project metadata
              if (success.metadata) {
                mechStore.setProjectMeta(success.metadata.name, null);
              }
              mechStore.markClean();

              // Notify about missing assets so the UI can show the relocation dialog
              if (success.missingAssets.length > 0) {
                console.warn('[project] missing assets:', success.missingAssets);
                if (missingAssetsCallback) missingAssetsCallback(success.missingAssets);
              }
            } else if (result.result.case === 'errorMessage') {
              console.error('[project] load failed:', result.result.value);
            }
            break;
          }
          case 'relocateAssetResult': {
            const result = evt.payload.value;
            if (result.result.case === 'body') {
              const b = result.result.value;
              const mechStore = useMechanismStore.getState();

              // Find the geometry attached to this body and update it
              const geomEntry = [...mechStore.geometries.values()].find(
                (g) => g.parentBodyId === b.bodyId,
              );
              if (geomEntry) {
                mechStore.updateGeometry(geomEntry.id, {
                  meshData: extractMeshData(b.displayMesh),
                  partIndex: b.partIndex.length > 0 ? new Uint32Array(b.partIndex) : undefined,
                  computedMassProperties: extractMassProperties(b.massProperties),
                  sourceAssetRef: extractAssetRef(b.sourceAssetRef),
                });
              }

              // Update body mass if not overridden
              const existingBody = mechStore.bodies.get(b.bodyId);
              if (existingBody && !existingBody.massOverride) {
                mechStore.updateBodyMass(b.bodyId, extractMassProperties(b.massProperties), false);
              }

              // Rebuild scene graph for this body
              if (sceneGraphManager) {
                sceneGraphManager.removeBody(b.bodyId);
                const updatedBody = useMechanismStore.getState().bodies.get(b.bodyId);
                const bodyGeoms = [...useMechanismStore.getState().geometries.values()].filter(
                  (g) => g.parentBodyId === b.bodyId,
                );
                if (updatedBody && bodyGeoms.length > 0) {
                  addBodyToSceneGraph(sceneGraphManager, updatedBody, bodyGeoms);
                }
              }

              console.log('[project] asset relocated successfully:', b.bodyId);
              if (relocateAssetCallback) relocateAssetCallback(b.bodyId, true);
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              console.error('[project] asset relocation failed:', result.result.value);
              if (relocateAssetCallback) relocateAssetCallback('', false, result.result.value);
            }
            break;
          }
          case 'createBodyResult': {
            const result = evt.payload.value;
            if (result.result.case === 'body') {
              const b = result.result.value;
              useMechanismStore.getState().addBodies([extractBodyState(b)]);
              useSimulationStore.getState().setNeedsCompile(true);
              useToastStore.getState().addToast({
                variant: 'success',
                title: 'Body created',
                description: b.name,
                duration: 3000,
              });
            } else if (result.result.case === 'errorMessage') {
              useToastStore.getState().addToast({
                variant: 'error',
                title: 'Create body failed',
                description: result.result.value,
              });
            }
            break;
          }
          case 'deleteBodyResult': {
            const result = evt.payload.value;
            if (result.result.case === 'deletedId') {
              const bodyId = result.result.value.id;
              const mechStore = useMechanismStore.getState();

              // Cascade: remove child geometries, datums, and dependent joints
              const childGeomIds = [...mechStore.geometries.values()]
                .filter((g) => g.parentBodyId === bodyId)
                .map((g) => g.id);
              const childDatumIds = [...mechStore.datums.values()]
                .filter((d) => d.parentBodyId === bodyId)
                .map((d) => d.id);
              const dependentJointIds = [...mechStore.joints.values()]
                .filter((j) => childDatumIds.includes(j.parentDatumId) || childDatumIds.includes(j.childDatumId))
                .map((j) => j.id);

              for (const jId of dependentJointIds) mechStore.removeJoint(jId);
              for (const dId of childDatumIds) mechStore.removeDatum(dId);
              for (const gId of childGeomIds) mechStore.removeGeometry(gId);
              mechStore.removeBody(bodyId);

              if (sceneGraphManager) {
                for (const jId of dependentJointIds) sceneGraphManager.removeJoint(jId);
                for (const dId of childDatumIds) sceneGraphManager.removeDatum(dId);
                sceneGraphManager.removeBody(bodyId);
              }

              // Clear selection if deleted body was selected
              const sel = useSelectionStore.getState();
              if (sel.selectedIds.has(bodyId)) {
                sel.clearSelection();
              }
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              useToastStore.getState().addToast({
                variant: 'error',
                title: 'Delete body failed',
                description: result.result.value,
              });
            }
            break;
          }
          case 'attachGeometryResult': {
            const result = evt.payload.value;
            if (result.result.case === 'geometry') {
              const g = result.result.value;
              const geomId = g.id?.id ?? '';
              const newParentId = g.parentBodyId?.id ?? null;
              const mechStore = useMechanismStore.getState();

              // Track old parent for scene graph rebuild
              const oldGeom = mechStore.geometries.get(geomId);
              const oldParentId = oldGeom?.parentBodyId ?? null;

              mechStore.updateGeometry(geomId, {
                parentBodyId: newParentId,
                localPose: extractPose(g.localPose),
              });
              if (result.oldParentBody?.id?.id) {
                mechStore.addBodies([extractBodyState(result.oldParentBody)]);
              }
              if (result.newParentBody?.id?.id) {
                mechStore.addBodies([extractBodyState(result.newParentBody)]);
              }
              applyUpdatedDatums(result.updatedDatums);

              // Rebuild scene graph for affected bodies
              if (sceneGraphManager) {
                const updatedStore = useMechanismStore.getState();
                // Remove synthetic detached body if geometry was previously unparented
                if (!oldParentId) {
                  sceneGraphManager.removeBody(`${DETACHED_BODY_PREFIX}${geomId}`);
                }
                if (oldParentId) {
                  sceneGraphManager.removeBody(oldParentId);
                  const oldBody = updatedStore.bodies.get(oldParentId);
                  if (oldBody) {
                    const oldBodyGeoms = [...updatedStore.geometries.values()].filter((gg) => gg.parentBodyId === oldParentId);
                    addBodyToSceneGraph(sceneGraphManager, oldBody, oldBodyGeoms);
                  }
                }
                if (newParentId && newParentId !== oldParentId) {
                  sceneGraphManager.removeBody(newParentId);
                  const newBody = updatedStore.bodies.get(newParentId);
                  if (newBody) {
                    const newBodyGeoms = [...updatedStore.geometries.values()].filter((gg) => gg.parentBodyId === newParentId);
                    addBodyToSceneGraph(sceneGraphManager, newBody, newBodyGeoms);
                  }
                }
              }
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              useToastStore.getState().addToast({
                variant: 'error',
                title: 'Attach geometry failed',
                description: result.result.value,
              });
            }
            break;
          }
          case 'detachGeometryResult': {
            const result = evt.payload.value;
            if (result.result.case === 'detachedId') {
              const geomId = result.result.value.id;
              const mechStore = useMechanismStore.getState();
              const oldGeom = mechStore.geometries.get(geomId);
              const oldParentId = oldGeom?.parentBodyId ?? null;

              mechStore.updateGeometry(geomId, {
                parentBodyId: null,
                localPose: extractPose(result.geometry?.localPose),
              });
              if (result.formerParentBody?.id?.id) {
                mechStore.addBodies([extractBodyState(result.formerParentBody)]);
              }

              // Rebuild former parent's scene graph mesh
              if (sceneGraphManager && oldParentId) {
                sceneGraphManager.removeBody(oldParentId);
                const updatedStore = useMechanismStore.getState();
                const oldBody = updatedStore.bodies.get(oldParentId);
                if (oldBody) {
                  const bodyGeoms = [...updatedStore.geometries.values()].filter((gg) => gg.parentBodyId === oldParentId);
                  addBodyToSceneGraph(sceneGraphManager, oldBody, bodyGeoms);
                }
                // Render the now-detached geometry as a standalone viewport entity
                const detachedGeom = updatedStore.geometries.get(geomId);
                if (detachedGeom) {
                  addDetachedGeometryToSceneGraph(sceneGraphManager, detachedGeom);
                }
              }
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              useToastStore.getState().addToast({
                variant: 'error',
                title: 'Detach geometry failed',
                description: result.result.value,
              });
            }
            break;
          }
          // TODO: Engine-side handlers for deleteGeometry and renameGeometry are not yet implemented.
          // Once the native engine handles these commands, these result handlers will process the responses.
          case 'deleteGeometryResult': {
            const result = evt.payload.value;
            if (result.result.case === 'deletedId') {
              const geomId = result.result.value.id;
              const mechStore = useMechanismStore.getState();
              const geom = mechStore.geometries.get(geomId);
              const parentBodyId = geom?.parentBodyId ?? null;

              mechStore.removeGeometry(geomId);

              // Rebuild parent body's scene graph mesh if geometry was attached
              if (sceneGraphManager && parentBodyId) {
                sceneGraphManager.removeBody(parentBodyId);
                const updatedStore = useMechanismStore.getState();
                const parentBody = updatedStore.bodies.get(parentBodyId);
                if (parentBody) {
                  const bodyGeoms = [...updatedStore.geometries.values()].filter((gg) => gg.parentBodyId === parentBodyId);
                  addBodyToSceneGraph(sceneGraphManager, parentBody, bodyGeoms);
                }
              } else if (sceneGraphManager) {
                // Remove detached geometry from viewport
                sceneGraphManager.removeBody(geomId);
              }

              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              useToastStore.getState().addToast({
                variant: 'error',
                title: 'Delete geometry failed',
                description: result.result.value,
              });
            }
            break;
          }
          case 'renameGeometryResult': {
            const result = evt.payload.value;
            if (result.result.case === 'geometry') {
              const g = result.result.value;
              const geomId = g.id?.id ?? '';
              useMechanismStore.getState().updateGeometry(geomId, { name: g.name });
            } else if (result.result.case === 'errorMessage') {
              useToastStore.getState().addToast({
                variant: 'error',
                title: 'Rename geometry failed',
                description: result.result.value,
              });
            }
            break;
          }
          case 'updateMassPropertiesResult': {
            const result = evt.payload.value;
            if (result.result.case === 'body') {
              const b = result.result.value;
              const bodyId = b.id?.id ?? '';
              useMechanismStore.getState().updateBodyMass(
                bodyId,
                extractMassProperties(b.massProperties),
                b.massOverride ?? false,
              );
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              useToastStore.getState().addToast({
                variant: 'error',
                title: 'Update mass properties failed',
                description: result.result.value,
              });
            }
            break;
          }
          case 'newProjectResult': {
            const result = evt.payload.value;
            if (result.success) {
              const mechStore = useMechanismStore.getState();
              mechStore.resetProject(mechStore.projectName);
              useSimulationStore.getState().reset();
              if (sceneGraphManager) sceneGraphManager.clear();
            } else {
              console.error('[project] new project failed:', result.errorMessage);
            }
            break;
          }
          case 'makeCompoundBodyResult': {
            console.debug('[make-body] received makeCompoundBodyResult');
            const result = evt.payload.value;
            if (result.result.case === 'success') {
              const success = result.result.value;
              const bodyId = success.createdBody?.id?.id ?? '';
              useMechanismStore.setState((state) => {
                const bodies = new Map(state.bodies);
                const geometries = new Map(state.geometries);
                const datums = new Map(state.datums);

                if (success.createdBody) {
                  console.debug('[make-body] new body:', {
                    id: bodyId,
                    pose: success.createdBody.pose,
                  });
                  bodies.set(bodyId, extractBodyState(success.createdBody));
                }

                for (const g of success.attachedGeometries) {
                  const geomId = g.id?.id ?? '';
                  const existing = geometries.get(geomId);
                  if (!existing) continue;
                  console.debug('[make-body] geometry:', {
                    id: geomId,
                    parentBodyId: g.parentBodyId?.id,
                    localPose: g.localPose,
                  });
                  geometries.set(geomId, {
                    ...existing,
                    parentBodyId: g.parentBodyId?.id ?? null,
                    localPose: extractPose(g.localPose),
                  });
                }

                for (const datum of success.updatedDatums) {
                  const datumId = datum.id?.id ?? '';
                  if (!datumId) continue;
                  datums.set(datumId, extractDatumState(datum, datums.get(datumId)));
                }

                for (const eid of success.dissolvedBodyIds) {
                  bodies.delete(eid.id);
                }

                for (const mb of success.modifiedBodies) {
                  const mbId = mb.id?.id ?? '';
                  if (!mbId) continue;
                  bodies.set(mbId, extractBodyState(mb));
                }

                return {
                  bodies,
                  geometries,
                  datums,
                  isDirty: true,
                };
              });

              useMechanismStore.getState().setPendingRenameEntityId(bodyId);
              useSelectionStore.getState().select(bodyId);
              useSimulationStore.getState().setNeedsCompile(true);
              useToastStore.getState().addToast({
                variant: 'success',
                title: 'Body created',
                description: `${success.createdBody?.name ?? 'Body'} — ${success.attachedGeometries.length} ${success.attachedGeometries.length === 1 ? 'geometry' : 'geometries'}`,
                duration: 3000,
              });
            } else if (result.result.case === 'errorMessage') {
              useToastStore.getState().addToast({
                variant: 'error',
                title: 'Make body failed',
                description: result.result.value,
              });
            }
            break;
          }
          case 'splitBodyResult': {
            const result = evt.payload.value;
            if (result.result.case === 'success') {
              const success = result.result.value;
              const mechStore = useMechanismStore.getState();
              const bodyId = success.createdBody?.id?.id ?? '';

              // Add new body
              if (success.createdBody) {
                mechStore.addBodies([extractBodyState(success.createdBody)]);
              }

              // Update geometries
              for (const g of success.attachedGeometries) {
                const geomId = g.id?.id ?? '';
                mechStore.updateGeometry(geomId, {
                  parentBodyId: g.parentBodyId?.id ?? null,
                  localPose: extractPose(g.localPose),
                });
              }

              // Update source body (recomputed mass)
              if (success.sourceBody?.id?.id) {
                mechStore.addBodies([extractBodyState(success.sourceBody)]);
              }
              applyUpdatedDatums(success.updatedDatums);

              // Rebuild scene graph
              if (sceneGraphManager) {
                const updatedStore = useMechanismStore.getState();

                // Rebuild new body
                const newBody = updatedStore.bodies.get(bodyId);
                if (newBody) {
                  sceneGraphManager.removeBody(bodyId);
                  const newGeoms = [...updatedStore.geometries.values()].filter((gg) => gg.parentBodyId === bodyId);
                  addBodyToSceneGraph(sceneGraphManager, newBody, newGeoms);
                }

                // Rebuild source body
                const srcId = success.sourceBody?.id?.id ?? '';
                if (srcId) {
                  sceneGraphManager.removeBody(srcId);
                  const srcBody = updatedStore.bodies.get(srcId);
                  if (srcBody) {
                    const srcGeoms = [...updatedStore.geometries.values()].filter((gg) => gg.parentBodyId === srcId);
                    addBodyToSceneGraph(sceneGraphManager, srcBody, srcGeoms);
                  }
                }
              }

              mechStore.setPendingRenameEntityId(bodyId);
              useSelectionStore.getState().select(bodyId);
              useSimulationStore.getState().setNeedsCompile(true);
              useToastStore.getState().addToast({
                variant: 'success',
                title: 'Body split',
                description: `${success.createdBody?.name ?? 'Body'} — ${success.attachedGeometries.length} ${success.attachedGeometries.length === 1 ? 'geometry' : 'geometries'}`,
                duration: 3000,
              });
            } else if (result.result.case === 'errorMessage') {
              useToastStore.getState().addToast({
                variant: 'error',
                title: 'Split body failed',
                description: result.result.value,
              });
            }
            break;
          }
          case 'reparentGeometryResult': {
            const result = evt.payload.value;
            if (result.result.case === 'success') {
              const success = result.result.value;
              const mechStore = useMechanismStore.getState();

              const geomId = success.geometry?.id?.id ?? '';
              const newParentId = success.geometry?.parentBodyId?.id ?? null;
              const oldGeom = mechStore.geometries.get(geomId);
              const oldParentId = oldGeom?.parentBodyId ?? null;

              // Update geometry
              if (success.geometry) {
                mechStore.updateGeometry(geomId, {
                  parentBodyId: newParentId,
                  localPose: extractPose(success.geometry.localPose),
                });
              }

              // Update parent bodies
              if (success.oldParentBody?.id?.id) {
                mechStore.addBodies([extractBodyState(success.oldParentBody)]);
              }
              if (success.newParentBody?.id?.id) {
                mechStore.addBodies([extractBodyState(success.newParentBody)]);
              }
              applyUpdatedDatums(success.updatedDatums);

              // Rebuild scene graph
              if (sceneGraphManager) {
                const updatedStore = useMechanismStore.getState();

                // Remove synthetic detached-geometry if was unparented
                if (!oldParentId) {
                  sceneGraphManager.removeBody(`${DETACHED_BODY_PREFIX}${geomId}`);
                }

                // Rebuild old parent
                if (oldParentId) {
                  sceneGraphManager.removeBody(oldParentId);
                  const oldBody = updatedStore.bodies.get(oldParentId);
                  if (oldBody) {
                    const oldGeoms = [...updatedStore.geometries.values()].filter((gg) => gg.parentBodyId === oldParentId);
                    addBodyToSceneGraph(sceneGraphManager, oldBody, oldGeoms);
                  }
                }

                // Rebuild new parent
                if (newParentId && newParentId !== oldParentId) {
                  sceneGraphManager.removeBody(newParentId);
                  const newBody = updatedStore.bodies.get(newParentId);
                  if (newBody) {
                    const newGeoms = [...updatedStore.geometries.values()].filter((gg) => gg.parentBodyId === newParentId);
                    addBodyToSceneGraph(sceneGraphManager, newBody, newGeoms);
                  }
                }
              }
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              useToastStore.getState().addToast({
                variant: 'error',
                title: 'Move geometry failed',
                description: result.result.value,
              });
            }
            break;
          }
          case 'pong':
            break;
        }
      };

      socket.onclose = () => {
        if (ws !== socket) return;
        if (handshakeTimer) {
          clearTimeout(handshakeTimer);
          handshakeTimer = null;
        }
        getDebugRecorder().recordAnomaly({
          severity: 'warning',
          code: 'websocket-closed',
          message: 'Engine WebSocket connection closed',
        });
        getDebugRecorder().markConnectionClosed('socket-close');
        set({ status: 'disconnected' });
        ws = null;
      };

      socket.onerror = () => {
        if (ws !== socket) return;
        getDebugRecorder().recordAnomaly({
          severity: 'error',
          code: 'websocket-error',
          message: 'Engine WebSocket encountered an error',
        });
        set({ status: 'error', errorMessage: 'WebSocket error' });
        useToastStore.getState().addToast({
          variant: 'error',
          title: 'Engine connection error',
        });
      };
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to discover engine';
      set({ status: 'error', errorMessage: message });
    });
}

export function disconnect(set: SetState) {
  cleanup();
  set({ status: 'disconnected' });
}

export function sendImportAsset(
  filePath: string,
  options?: { densityOverride?: number; tessellationQuality?: number; unitSystem?: string; importMode?: 'auto-body' | 'visual-only' },
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
  params: { box?: { width: number; height: number; depth: number }; cylinder?: { radius: number; height: number }; sphere?: { radius: number } },
  density?: number,
): void {
  pendingPrimitiveSource = { shape, params };
  sendBinaryCommand((sequenceId) =>
    createCreatePrimitiveBodyCommand(shape, name, position, params, density, sequenceId));
}

export function sendUpdatePrimitive(
  geometryId: string,
  params: PrimitiveParamsInput,
  density?: number,
): void {
  sendBinaryCommand((sequenceId) => createUpdatePrimitiveCommand(geometryId, params, density, sequenceId));
}

export function sendUpdateCollisionConfig(
  geometryId: string,
  config: CollisionConfigInput,
): void {
  sendBinaryCommand((sequenceId) => createUpdateCollisionConfigCommand(geometryId, config, sequenceId));
}

export function sendCreateDatum(
  parentBodyId: string,
  name: string,
  localPose: {
    position: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
  },
): void {
  sendBinaryCommand((sequenceId) => createCreateDatumCommand(parentBodyId, localPose, name, sequenceId));
}

export function sendCreateDatumFromFace(
  geometryId: string,
  faceIndex: number,
  name: string,
): void {
  sendBinaryCommand((sequenceId) =>
    createCreateDatumFromFaceCommand(geometryId, faceIndex, name, sequenceId));
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
    ));
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
  sendBinaryCommand((sequenceId) => createUpdateDatumPoseCommand(datumId, newLocalPose, sequenceId));
}

export function sendUpdateGeometryPose(
  geometryId: string,
  newLocalPose: {
    position: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
  },
): void {
  sendBinaryCommand((sequenceId) => createUpdateGeometryPoseCommand(geometryId, newLocalPose, sequenceId));
}

/** Extract damping values from a Joint proto's typed config oneof. */
function extractJointDamping(j: Joint): { damping: number; translationalDamping: number; rotationalDamping: number } {
  let damping = 0;
  let translationalDamping = 0;
  let rotationalDamping = 0;
  if (j.config.case === 'revolute') {
    damping = j.config.value.damping;
  } else if (j.config.case === 'prismatic') {
    damping = j.config.value.damping;
  } else if (j.config.case === 'cylindrical') {
    translationalDamping = j.config.value.translationalDamping;
    rotationalDamping = j.config.value.rotationalDamping;
  }
  return { damping, translationalDamping, rotationalDamping };
}

/** Build the typed config oneof for a Joint proto, merging limits and damping. */
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
          angleLimit: lowerLimit !== 0 || upperLimit !== 0
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
          translationLimit: lowerLimit !== 0 || upperLimit !== 0
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
          translationLimit: lowerLimit !== 0 || upperLimit !== 0
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
    createCreateJointCommand({
      parentDatumId: { $typeName: 'motionlab.mechanism.ElementId', id: parentDatumId } as ElementId,
      childDatumId: { $typeName: 'motionlab.mechanism.ElementId', id: childDatumId } as ElementId,
      type: toProtoJointType(type),
      name,
      lowerLimit,
      upperLimit,
      config: buildJointConfig(type, lowerLimit, upperLimit, damping, translationalDamping, rotationalDamping),
    } as Joint, sequenceId));
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
    createUpdateJointCommand({
      id: { $typeName: 'motionlab.mechanism.ElementId', id: jointId } as ElementId,
      parentDatumId: { $typeName: 'motionlab.mechanism.ElementId', id: updates.parentDatumId ?? existing.parentDatumId } as ElementId,
      childDatumId: { $typeName: 'motionlab.mechanism.ElementId', id: updates.childDatumId ?? existing.childDatumId } as ElementId,
      type: toProtoJointType(type),
      name: updates.name ?? existing.name,
      lowerLimit,
      upperLimit,
      config: buildJointConfig(type, lowerLimit, upperLimit, damping, translationalDamping, rotationalDamping),
    } as Joint, sequenceId));
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
    massProperties?: { mass: number; centerOfMass: { x: number; y: number; z: number }; ixx: number; iyy: number; izz: number; ixy: number; ixz: number; iyz: number };
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
    createAttachGeometryCommand(geometryId, targetBodyId, undefined, sequenceId));
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
  options?: { motionType?: 'dynamic' | 'fixed'; dissolveEmptyBodies?: boolean; referenceBodyId?: string },
): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('[make-body] WebSocket not open, cannot send command. ws:', ws ? `readyState=${ws.readyState}` : 'null');
    return;
  }
  console.debug('[make-body] sending binary command over WebSocket');
  sendBinaryCommand((sequenceId) => createMakeCompoundBodyCommand(geometryIds, name, options, sequenceId));
}

export function sendSplitBody(
  sourceBodyId: string,
  geometryIds: string[],
  name: string,
  options?: { motionType?: 'dynamic' | 'fixed' },
): void {
  sendBinaryCommand((sequenceId) => createSplitBodyCommand(sourceBodyId, geometryIds, name, options, sequenceId));
}

export function sendReparentGeometry(geometryId: string, targetBodyId: string): void {
  sendBinaryCommand((sequenceId) => createReparentGeometryCommand(geometryId, targetBodyId, sequenceId));
}

export function sendUpdateMassProperties(
  bodyId: string,
  massOverride: boolean,
  massProperties?: { mass: number; centerOfMass: { x: number; y: number; z: number }; ixx: number; iyy: number; izz: number; ixy: number; ixz: number; iyz: number },
): void {
  sendBinaryCommand((sequenceId) =>
    createUpdateMassPropertiesCommand(bodyId, massOverride, massProperties, sequenceId));
}

export function sendDeleteJoint(jointId: string): void {
  sendBinaryCommand((sequenceId) => createDeleteJointCommand(jointId, sequenceId));
}

export function sendCreateLoad(loadState: LoadState): void {
  sendBinaryCommand((sequenceId) => createCreateLoadCommand(loadStateToProto(loadState), sequenceId));
}

export function sendUpdateLoad(loadState: LoadState): void {
  sendBinaryCommand((sequenceId) => createUpdateLoadCommand(loadStateToProto(loadState), sequenceId));
}

export function sendDeleteLoad(loadId: string): void {
  sendBinaryCommand((sequenceId) => createDeleteLoadCommand(loadId, sequenceId));
}

export function sendCreateActuator(actuatorState: ActuatorState): void {
  sendBinaryCommand((sequenceId) =>
    createCreateActuatorCommand(actuatorStateToProto(actuatorState), sequenceId));
}

export function sendUpdateActuator(actuatorState: ActuatorState): void {
  sendBinaryCommand((sequenceId) =>
    createUpdateActuatorCommand(actuatorStateToProto(actuatorState), sequenceId));
}

export function sendDeleteActuator(actuatorId: string): void {
  sendBinaryCommand((sequenceId) => createDeleteActuatorCommand(actuatorId, sequenceId));
}

export function sendCompileMechanism(
  settings?: SimulationSettingsInput,
): void {
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
  pendingActionAfterCompile = 'play';
  sendCompileMechanism(buildSettingsInput());
}

/** Step, auto-compiling first if the model is stale or not yet compiled. */
export function sendCompileAndStep(): void {
  const { state, needsCompile } = useSimulationStore.getState();
  if (state === 'paused' && !needsCompile) {
    sendSimulationControl(SimulationAction.STEP);
    return;
  }
  pendingActionAfterCompile = 'step';
  sendCompileMechanism(buildSettingsInput());
}

export function sendScrub(time: number): void {
  sendBinaryCommand((sequenceId) => createScrubCommand(time, sequenceId));
}

export function sendSaveProject(projectName: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  saveIntentTracker.requestManualSave();
  sendBinaryCommand((sequenceId) => createSaveProjectCommand(projectName, sequenceId));
}

export function sendAutoSave(projectName: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (!saveIntentTracker.requestAutoSave()) return;
  sendBinaryCommand((sequenceId) => createSaveProjectCommand(projectName, sequenceId));
}

export function sendLoadProject(data: Uint8Array): void {
  sendBinaryCommand((sequenceId) => createLoadProjectCommand(data, sequenceId));
}

export function sendRelocateAsset(bodyId: string, newFilePath: string): void {
  sendBinaryCommand((sequenceId) =>
    createRelocateAssetCommand(bodyId, newFilePath, undefined, sequenceId));
}

export function sendNewProject(projectName: string): void {
  sendBinaryCommand((sequenceId) => createNewProjectCommand(projectName, sequenceId));
}

export function sendSaveProjectAs(projectName: string): void {
  saveIntentTracker.requestSaveAs();
  sendSaveProject(projectName);
}

function mapSurfaceClass(sc: FaceSurfaceClass): DatumState['surfaceClass'] {
  switch (sc) {
    case FaceSurfaceClass.PLANAR: return 'planar';
    case FaceSurfaceClass.CYLINDRICAL: return 'cylindrical';
    case FaceSurfaceClass.CONICAL: return 'conical';
    case FaceSurfaceClass.SPHERICAL: return 'spherical';
    case FaceSurfaceClass.TOROIDAL: return 'toroidal';
    default: return 'other';
  }
}

function mapFaceGeometry(
  fg:
    | CreateDatumFromFaceSuccess['faceGeometry']
    | {
        axisDirection?: { x?: number; y?: number; z?: number };
        normal?: { x?: number; y?: number; z?: number };
        radius?: number;
        secondaryRadius?: number;
        semiAngle?: number;
      }
    | undefined,
): FaceGeometryInfo | undefined {
  if (!fg) return undefined;
  const result: FaceGeometryInfo = {};
  if (fg.axisDirection) {
    result.axisDirection = {
      x: fg.axisDirection.x ?? 0,
      y: fg.axisDirection.y ?? 0,
      z: fg.axisDirection.z ?? 0,
    };
  }
  if (fg.normal) {
    result.normal = {
      x: fg.normal.x ?? 0,
      y: fg.normal.y ?? 0,
      z: fg.normal.z ?? 0,
    };
  }
  if (fg.radius !== undefined) result.radius = fg.radius;
  if (fg.secondaryRadius !== undefined) result.secondaryRadius = fg.secondaryRadius;
  if (fg.semiAngle !== undefined) result.semiAngle = fg.semiAngle;
  return Object.keys(result).length > 0 ? result : undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated mechanism/protocol datum shapes are large but structurally consistent here
function extractDatumState(datum: any, existing?: DatumState): DatumState {
  return {
    id: datum.id?.id ?? '',
    name: datum.name ?? existing?.name ?? '',
    parentBodyId: datum.parentBodyId?.id ?? existing?.parentBodyId ?? '',
    localPose: extractPose(datum.localPose),
    sourceGeometryId: datum.sourceGeometryId?.id || existing?.sourceGeometryId,
    sourceFaceIndex:
      datum.sourceFaceIndex !== undefined ? Number(datum.sourceFaceIndex) : existing?.sourceFaceIndex,
    sourceGeometryLocalPose: datum.sourceGeometryLocalPose
      ? extractPose(datum.sourceGeometryLocalPose)
      : existing?.sourceGeometryLocalPose,
    surfaceClass: mapDatumSurfaceClass(datum.surfaceClass) ?? existing?.surfaceClass,
    faceGeometry: mapFaceGeometry(datum.faceGeometry) ?? existing?.faceGeometry,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated repeated datum payloads vary by result type
function applyUpdatedDatums(datums: readonly any[]): void {
  const mechStore = useMechanismStore.getState();
  for (const datum of datums) {
    const datumId = datum.id?.id ?? '';
    if (!datumId) continue;
    mechStore.addDatum(extractDatumState(datum, mechStore.datums.get(datumId)));
  }
}

function surfaceClassToLabel(surfaceClass: FaceSurfaceClass): string {
  switch (surfaceClass) {
    case FaceSurfaceClass.PLANAR:
      return 'planar';
    case FaceSurfaceClass.CYLINDRICAL:
      return 'cylindrical';
    case FaceSurfaceClass.CONICAL:
      return 'conical';
    case FaceSurfaceClass.SPHERICAL:
      return 'spherical';
    case FaceSurfaceClass.TOROIDAL:
      return 'toroidal';
    default:
      return 'surface';
  }
}
