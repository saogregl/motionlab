import type {
  AnalyzeFacePairSuccess,
  CreateDatumFromFaceSuccess,
  ElementId,
  Joint,
  MissingAssetInfo,
} from '@motionlab/protocol';
import {
  type Actuator,
  ActuatorControlMode,
  ChannelDataType,
  type CollisionConfigInput,
  type CommandFunction,
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
  createHandshakeCommand,
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
  DatumSurfaceClass,
  DiagnosticSeverity,
  engineStateToString,
  eventToDebugJson,
  FacePairAlignment,
  FaceSurfaceClass,
  type LinearSpringDamperLoad,
  type Load,
  mapFacePairAlignment,
  mapJointType,
  mapSensorAxis,
  mapSensorType,
  type PointForceLoad,
  type PointTorqueLoad,
  PROTOCOL_VERSION,
  type PrimitiveParamsInput,
  type PrismaticMotorActuator,
  parseEvent,
  ReferenceFrame,
  type RevoluteMotorActuator,
  type Sensor,
  SensorAxis,
  SensorType,
  SimStateEnum,
  SimulationAction,
  type SimulationSettingsInput,
  SmoothStepProfile,
  toProtoJointType,
  toProtoSensorAxis,
  toProtoSensorType,
} from '@motionlab/protocol';
import type { BodyTransformUpdate, JointForceUpdate, SceneGraphManager } from '@motionlab/viewport';
import { getDebugRecorder } from '../debug/api.js';
import { useAssetLibraryStore } from '../stores/asset-library.js';
import { useAuthoringStatusStore } from '../stores/authoring-status.js';
import { clearBodyPoses, setBodyPose } from '../stores/body-poses.js';
import type { EngineConnectionState } from '../stores/engine-connection.js';
import { useImportFlowStore } from '../stores/import-flow.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import { useLoadCreationStore } from '../stores/load-creation.js';
import type {
  ActuatorState,
  ActuatorTypeId,
  BodyMassProperties,
  BodyPose,
  BodyState,
  CommandFunctionShape,
  ControlModeId,
  DatumState,
  FaceGeometryInfo,
  GeometryState,
  JointTypeId,
  LoadState,
  LoadTypeId,
  MeshData,
  ReferenceFrameId,
  SensorAxisId,
  SensorState,
  SensorTypeId,
} from '../stores/mechanism.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { resetSimClock, scheduleReactBroadcast, setSimClock } from '../stores/sim-clock.js';
import {
  type ChannelDescriptor,
  type StructuredDiagnostic,
  useSimulationStore,
} from '../stores/simulation.js';
import { useSimulationSettingsStore } from '../stores/simulation-settings.js';
import { useToastStore } from '../stores/toast.js';
import { useToolModeStore } from '../stores/tool-mode.js';
import { addSamplesBatched, type StoreSample, useTraceStore } from '../stores/traces.js';
import { useUILayoutStore } from '../stores/ui-layout.js';
import {
  alignmentFromEngineAnalysis,
  analyzeDatumAlignment,
  computeDatumWorldPose,
} from '../utils/datum-alignment.js';

import {
  actuatorStateToProto,
  commandFunctionToProto,
  extractActuatorState,
  extractAssetRef,
  extractBodyState,
  extractCollisionConfig,
  extractCommandFunction,
  extractLoadState,
  extractMassProperties,
  extractMeshData,
  extractPose,
  extractPrimitiveSource,
  extractSensorState,
  IDENTITY_POSE,
  loadStateToProto,
  mapControlMode,
  mapDatumSurfaceClass,
  mapReferenceFrame,
  sensorStateToProto,
  toProtoControlMode,
  toProtoReferenceFrame,
} from './connection/converters.js';
import { connState } from './connection/state.js';
import {
  sendSimulationControl,
  sendUpdateBody,
} from './connection/commands.js';
export * from './connection/commands.js';
import { handleSimulationFrame, handleSimulationTrace } from './connection/hot-path.js';

/** Add a body's merged geometry meshes to the scene graph. */
export const DETACHED_BODY_PREFIX = '__detached_';

function addDetachedGeometryToSceneGraph(sg: SceneGraphManager, geometry: GeometryState): void {
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
  sg.upsertBody(body.id, body.name, {
    position: [body.pose.position.x, body.pose.position.y, body.pose.position.z],
    rotation: [
      body.pose.rotation.x,
      body.pose.rotation.y,
      body.pose.rotation.z,
      body.pose.rotation.w,
    ],
  });
  for (const geometry of geometries) {
    sg.addBodyGeometry(
      body.id,
      geometry.id,
      geometry.name,
      geometry.meshData,
      {
        position: [
          geometry.localPose.position.x,
          geometry.localPose.position.y,
          geometry.localPose.position.z,
        ],
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

// Queued action to dispatch immediately after a successful auto-compile.

// ---------------------------------------------------------------------------
// SceneGraphManager registry for hot-path frame updates
// ---------------------------------------------------------------------------


export function registerSceneGraph(sg: SceneGraphManager | null): void {
  connState.sceneGraphManager = sg;
}

export function getSceneGraph(): SceneGraphManager | null {
  return connState.sceneGraphManager;
}

// ---------------------------------------------------------------------------
// Missing assets callback — notifies App when a loaded project has missing assets
// ---------------------------------------------------------------------------


export function onMissingAssets(cb: ((assets: MissingAssetInfo[]) => void) | null): void {
  connState.missingAssetsCallback = cb;
}

// ---------------------------------------------------------------------------
// Relocate asset result callback — notifies dialog when relocation succeeds/fails
// ---------------------------------------------------------------------------


/** Pending primitive source info — set before sending, consumed by result handler. */


export function onRelocateAssetResult(
  cb: ((bodyId: string, success: boolean, errorMessage?: string) => void) | null,
): void {
  connState.relocateAssetCallback = cb;
}

// ---------------------------------------------------------------------------
// Playback speed — frame skipping for sub-1x speeds
// ---------------------------------------------------------------------------


export function setPlaybackSpeed(speed: number): void {
  connState.playbackSpeed = speed;
  connState.frameSkipCounter = 0;
}

// ---------------------------------------------------------------------------
// FPS measurement
// ---------------------------------------------------------------------------


// Reused per-frame to avoid GC pressure at 60+ Hz. Inner pose/force/torque
// objects and their tuples are mutated in place; applyBodyTransforms and
// applyJointForceUpdates only read these synchronously.

export function getMeasuredFps(): number {
  return connState.measuredFps;
}

function allocateSequenceId(): bigint {
  const id = connState.nextSequenceId;
  connState.nextSequenceId += 1n;
  return id;
}

/** Extract damping values from a Joint proto's typed config oneof. */
function extractJointDamping(j: Joint): {
  damping: number;
  translationalDamping: number;
  rotationalDamping: number;
} {
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

function cleanup() {
  if (connState.handshakeTimer) {
    clearTimeout(connState.handshakeTimer);
    connState.handshakeTimer = null;
  }
  if (connState.ws) {
    connState.ws.onopen = null;
    connState.ws.onclose = null;
    connState.ws.onerror = null;
    connState.ws.onmessage = null;
    connState.ws.close();
    connState.ws = null;
  }
  getDebugRecorder().markConnectionClosed('cleanup');
}

export function connect(set: SetState, _get: GetState) {
  cleanup();
  const myEpoch = ++connState.connectEpoch;
  connState.reportedMissingSceneGraphForSession = false;

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
      if (myEpoch !== connState.connectEpoch) return;

      if (!endpoint) {
        set({ status: 'error', errorMessage: 'Engine endpoint not available' });
        return;
      }

      set({ status: 'connecting', endpoint });

      const url = `ws://${endpoint.host}:${endpoint.port}`;
      const socket = new WebSocket(url);
      socket.binaryType = 'arraybuffer';
      connState.ws = socket;

      socket.onopen = () => {
        if (connState.ws !== socket) return;
        set({ status: 'handshaking' });
        const handshakeBytes = createHandshakeCommand(
          endpoint.sessionToken ?? '',
          allocateSequenceId(),
        );
        getDebugRecorder().recordOutboundCommand(handshakeBytes);
        socket.send(handshakeBytes);

        connState.handshakeTimer = setTimeout(() => {
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
        if (connState.ws !== socket) return;
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

        const messageType = evt.payload.case;
        const isStreamingEvent =
          messageType === 'simulationFrame' || messageType === 'simulationTrace';
        if ((import.meta as unknown as { env: { DEV: boolean } }).env.DEV && !isStreamingEvent) {
          console.debug('[protocol] ←', eventToDebugJson(evt));
        }

        switch (evt.payload.case) {
          case 'handshakeAck': {
            const ack = evt.payload.value;
            if (connState.handshakeTimer) {
              clearTimeout(connState.handshakeTimer);
              connState.handshakeTimer = null;
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
              if (connState.sceneGraphManager) {
                for (const body of bodies) {
                  const bodyGeoms = geometries.filter((g) => g.parentBodyId === body.id);
                  addBodyToSceneGraph(connState.sceneGraphManager, body, bodyGeoms);
                }
                // Add bodyless geometries as detached viewport entities
                for (const geom of geometries) {
                  if (!geom.parentBodyId) {
                    addDetachedGeometryToSceneGraph(connState.sceneGraphManager, geom);
                  }
                }
              }

              // Apply viewport focus-point offset so imports land near the camera target
              if (connState.sceneGraphManager && bodies.length > 0) {
                const focusPoint = connState.sceneGraphManager.getViewportFocusPoint();
                // Compute centroid of all imported body positions
                let cx = 0,
                  cy = 0,
                  cz = 0;
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
                  filename:
                    geometries[0]?.sourceAssetRef.originalFilename || bodies[0]?.name || 'Unknown',
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
                description:
                  detachedCount > 0
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
            if (connState.sceneGraphManager) {
              for (const body of bodies) {
                const bodyGeoms = geometries.filter((g) => g.parentBodyId === body.id);
                addBodyToSceneGraph(connState.sceneGraphManager, body, bodyGeoms);
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
                motionType:
                  bodyProto?.motionType === 2
                    ? 'fixed'
                    : bodyProto?.motionType === 1
                      ? 'dynamic'
                      : bodyProto?.isFixed
                        ? 'fixed'
                        : 'dynamic',
                massOverride: bodyProto?.massOverride ?? false,
              };

              // Prefer proto-sourced primitiveSource; fall back to pending client-side source
              const primSource = g.primitiveSource
                ? extractPrimitiveSource(g.primitiveSource)
                : (connState.pendingPrimitiveSource ?? undefined);
              connState.pendingPrimitiveSource = null;

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

              if (connState.sceneGraphManager) {
                addBodyToSceneGraph(connState.sceneGraphManager, body, [geometry]);
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
              connState.pendingPrimitiveSource = null;
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
              if (connState.sceneGraphManager && geomProto) {
                const bodyId = geomProto.parentBodyId?.id ?? '';
                const partIndex = s.partIndex.length > 0 ? new Uint32Array(s.partIndex) : undefined;
                connState.sceneGraphManager.addBodyGeometry(
                  bodyId,
                  geomId,
                  geomProto.name ?? '',
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
                  jcs.setParentDatum(
                    newDatumId,
                    surfaceClass,
                    success.geometryId?.id ?? null,
                    success.faceIndex,
                  );
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
                const alignment = alignmentFromEngineAnalysis(
                  alignmentKind,
                  recommendedType,
                  success.recommendationConfidence,
                );

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
          case 'createSensorResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            if (result.result.case === 'sensor') {
              const sensorState = extractSensorState(result.result.value);
              mechStore.addSensor(sensorState);
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              console.error('[sensor] create failed:', result.result.value);
            }
            break;
          }
          case 'updateSensorResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            if (result.result.case === 'sensor') {
              const sensorState = extractSensorState(result.result.value);
              mechStore.updateSensor(sensorState.id, sensorState);
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              console.error('[sensor] update failed:', result.result.value);
            }
            break;
          }
          case 'deleteSensorResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            if (result.result.case === 'deletedId') {
              mechStore.removeSensor(result.result.value.id);
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              console.error('[sensor] delete failed:', result.result.value);
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
              if (connState.pendingActionAfterCompile) {
                const action = connState.pendingActionAfterCompile;
                connState.pendingActionAfterCompile = null;
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
              connState.pendingActionAfterCompile = null;
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
              resetSimClock();
              if (connState.sceneGraphManager) {
                connState.sceneGraphManager.clearForceArrows();
                const { bodies } = useMechanismStore.getState();
                connState.sceneGraphManager.applyBodyTransforms(
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
            handleSimulationFrame(evt.payload.value);
            break;
          }
          case 'simulationTrace': {
            handleSimulationTrace(evt.payload.value);
            break;
          }
          case 'saveProjectResult': {
            const result = evt.payload.value;
            if (result.result.case === 'projectData') {
              const bytes = new Uint8Array(result.result.value);
              const mechStore = useMechanismStore.getState();

              const saveIntent = connState.saveIntentTracker.consumeProjectData(mechStore.projectFilePath);

              if (saveIntent.kind === 'autosave') {
                const projectPath = mechStore.projectFilePath;
                window.motionlab
                  ?.autoSaveWrite?.(bytes, projectPath)
                  .catch((err: unknown) => console.error('[autosave] write failed:', err));
                break;
              }

              // Manual save flow
              const projectName = mechStore.projectName;
              const existingPath = saveIntent.existingPath;

              const savePromise =
                existingPath && window.motionlab?.saveProjectToPath
                  ? window.motionlab.saveProjectToPath(bytes, existingPath)
                  : window.motionlab?.saveProjectFile(bytes, projectName);

              savePromise
                ?.then((saveResult) => {
                  if (saveResult.saved && saveResult.filePath) {
                    mechStore.setProjectMeta(projectName, saveResult.filePath);
                    mechStore.markClean();
                    window.motionlab?.addRecentProject?.({
                      name: projectName,
                      filePath: saveResult.filePath,
                    });
                    // Clean up autosave file after successful manual save
                    window.motionlab?.autoSaveCleanup?.(saveResult.filePath);
                  }
                })
                .catch((err: unknown) => {
                  console.error('[project] save failed:', err);
                });
            } else if (result.result.case === 'errorMessage') {
              const intent = connState.saveIntentTracker.consumeError();
              console.error(
                intent === 'autosave' ? '[autosave] save failed:' : '[project] save failed:',
                result.result.value,
              );
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
              if (connState.sceneGraphManager) connState.sceneGraphManager.clear();

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
                const bodyImportLookup = new Map(success.bodies.map((b) => [b.bodyId, b]));

                for (const g of mechanism.geometries) {
                  const geomId = g.id?.id ?? '';
                  const parentBodyId = g.parentBodyId?.id ?? null;
                  const geometryImport = geometryImportLookup.get(geomId);
                  const bodyImport = parentBodyId ? bodyImportLookup.get(parentBodyId) : undefined;

                  let meshData: MeshData;
                  let partIndex: Uint32Array | undefined;

                  if (geometryImport) {
                    meshData = extractMeshData(geometryImport.displayMesh);
                    partIndex =
                      geometryImport.partIndex.length > 0
                        ? new Uint32Array(geometryImport.partIndex)
                        : undefined;
                  } else if (g.displayMesh && (g.displayMesh.vertices?.length ?? 0) > 0) {
                    meshData = extractMeshData(g.displayMesh);
                    partIndex =
                      bodyImport && bodyImport.partIndex.length > 0
                        ? new Uint32Array(bodyImport.partIndex)
                        : undefined;
                  } else {
                    meshData = extractMeshData(bodyImport?.displayMesh);
                    partIndex =
                      bodyImport && bodyImport.partIndex.length > 0
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
              if (connState.sceneGraphManager) {
                for (const body of bodyStates) {
                  const bodyGeoms = geometryStates.filter((g) => g.parentBodyId === body.id);
                  addBodyToSceneGraph(connState.sceneGraphManager, body, bodyGeoms);
                }
              }

              // Rebuild datums
              if (mechanism) {
                for (const d of mechanism.datums) {
                  const datumState = extractDatumState(d);
                  mechStore.addDatum(datumState);
                  if (connState.sceneGraphManager) {
                    connState.sceneGraphManager.addDatum(
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
                  if (connState.sceneGraphManager) {
                    connState.sceneGraphManager.addJoint(
                      jointState.id,
                      jointState.parentDatumId,
                      jointState.childDatumId,
                      jointState.type,
                      jointState.name,
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

                // Rebuild sensors
                for (const s of mechanism.sensors) {
                  const sensorState = extractSensorState(s);
                  mechStore.addSensor(sensorState);
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
                if (connState.missingAssetsCallback) connState.missingAssetsCallback(success.missingAssets);
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
              if (connState.sceneGraphManager) {
                connState.sceneGraphManager.removeBody(b.bodyId);
                const updatedBody = useMechanismStore.getState().bodies.get(b.bodyId);
                const bodyGeoms = [...useMechanismStore.getState().geometries.values()].filter(
                  (g) => g.parentBodyId === b.bodyId,
                );
                if (updatedBody && bodyGeoms.length > 0) {
                  addBodyToSceneGraph(connState.sceneGraphManager, updatedBody, bodyGeoms);
                }
              }

              console.log('[project] asset relocated successfully:', b.bodyId);
              if (connState.relocateAssetCallback) connState.relocateAssetCallback(b.bodyId, true);
              useSimulationStore.getState().setNeedsCompile(true);
            } else if (result.result.case === 'errorMessage') {
              console.error('[project] asset relocation failed:', result.result.value);
              if (connState.relocateAssetCallback) connState.relocateAssetCallback('', false, result.result.value);
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
                .filter(
                  (j) =>
                    childDatumIds.includes(j.parentDatumId) ||
                    childDatumIds.includes(j.childDatumId),
                )
                .map((j) => j.id);

              for (const jId of dependentJointIds) mechStore.removeJoint(jId);
              for (const dId of childDatumIds) mechStore.removeDatum(dId);
              for (const gId of childGeomIds) mechStore.removeGeometry(gId);
              mechStore.removeBody(bodyId);

              if (connState.sceneGraphManager) {
                for (const jId of dependentJointIds) connState.sceneGraphManager.removeJoint(jId);
                for (const dId of childDatumIds) connState.sceneGraphManager.removeDatum(dId);
                connState.sceneGraphManager.removeBody(bodyId);
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
              if (connState.sceneGraphManager) {
                const updatedStore = useMechanismStore.getState();
                // Remove synthetic detached body if geometry was previously unparented
                if (!oldParentId) {
                  connState.sceneGraphManager.removeBody(`${DETACHED_BODY_PREFIX}${geomId}`);
                }
                if (oldParentId) {
                  connState.sceneGraphManager.removeBody(oldParentId);
                  const oldBody = updatedStore.bodies.get(oldParentId);
                  if (oldBody) {
                    const oldBodyGeoms = [...updatedStore.geometries.values()].filter(
                      (gg) => gg.parentBodyId === oldParentId,
                    );
                    addBodyToSceneGraph(connState.sceneGraphManager, oldBody, oldBodyGeoms);
                  }
                }
                if (newParentId && newParentId !== oldParentId) {
                  connState.sceneGraphManager.removeBody(newParentId);
                  const newBody = updatedStore.bodies.get(newParentId);
                  if (newBody) {
                    const newBodyGeoms = [...updatedStore.geometries.values()].filter(
                      (gg) => gg.parentBodyId === newParentId,
                    );
                    addBodyToSceneGraph(connState.sceneGraphManager, newBody, newBodyGeoms);
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
              if (connState.sceneGraphManager && oldParentId) {
                connState.sceneGraphManager.removeBody(oldParentId);
                const updatedStore = useMechanismStore.getState();
                const oldBody = updatedStore.bodies.get(oldParentId);
                if (oldBody) {
                  const bodyGeoms = [...updatedStore.geometries.values()].filter(
                    (gg) => gg.parentBodyId === oldParentId,
                  );
                  addBodyToSceneGraph(connState.sceneGraphManager, oldBody, bodyGeoms);
                }
                // Render the now-detached geometry as a standalone viewport entity
                const detachedGeom = updatedStore.geometries.get(geomId);
                if (detachedGeom) {
                  addDetachedGeometryToSceneGraph(connState.sceneGraphManager, detachedGeom);
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
              if (connState.sceneGraphManager && parentBodyId) {
                connState.sceneGraphManager.removeBody(parentBodyId);
                const updatedStore = useMechanismStore.getState();
                const parentBody = updatedStore.bodies.get(parentBodyId);
                if (parentBody) {
                  const bodyGeoms = [...updatedStore.geometries.values()].filter(
                    (gg) => gg.parentBodyId === parentBodyId,
                  );
                  addBodyToSceneGraph(connState.sceneGraphManager, parentBody, bodyGeoms);
                }
              } else if (connState.sceneGraphManager) {
                // Remove detached geometry from viewport
                connState.sceneGraphManager.removeBody(geomId);
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
              useMechanismStore
                .getState()
                .updateBodyMass(
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
              if (connState.sceneGraphManager) connState.sceneGraphManager.clear();
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
              if (connState.sceneGraphManager) {
                const updatedStore = useMechanismStore.getState();

                // Rebuild new body
                const newBody = updatedStore.bodies.get(bodyId);
                if (newBody) {
                  connState.sceneGraphManager.removeBody(bodyId);
                  const newGeoms = [...updatedStore.geometries.values()].filter(
                    (gg) => gg.parentBodyId === bodyId,
                  );
                  addBodyToSceneGraph(connState.sceneGraphManager, newBody, newGeoms);
                }

                // Rebuild source body
                const srcId = success.sourceBody?.id?.id ?? '';
                if (srcId) {
                  connState.sceneGraphManager.removeBody(srcId);
                  const srcBody = updatedStore.bodies.get(srcId);
                  if (srcBody) {
                    const srcGeoms = [...updatedStore.geometries.values()].filter(
                      (gg) => gg.parentBodyId === srcId,
                    );
                    addBodyToSceneGraph(connState.sceneGraphManager, srcBody, srcGeoms);
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
              if (connState.sceneGraphManager) {
                const updatedStore = useMechanismStore.getState();

                // Remove synthetic detached-geometry if was unparented
                if (!oldParentId) {
                  connState.sceneGraphManager.removeBody(`${DETACHED_BODY_PREFIX}${geomId}`);
                }

                // Rebuild old parent
                if (oldParentId) {
                  connState.sceneGraphManager.removeBody(oldParentId);
                  const oldBody = updatedStore.bodies.get(oldParentId);
                  if (oldBody) {
                    const oldGeoms = [...updatedStore.geometries.values()].filter(
                      (gg) => gg.parentBodyId === oldParentId,
                    );
                    addBodyToSceneGraph(connState.sceneGraphManager, oldBody, oldGeoms);
                  }
                }

                // Rebuild new parent
                if (newParentId && newParentId !== oldParentId) {
                  connState.sceneGraphManager.removeBody(newParentId);
                  const newBody = updatedStore.bodies.get(newParentId);
                  if (newBody) {
                    const newGeoms = [...updatedStore.geometries.values()].filter(
                      (gg) => gg.parentBodyId === newParentId,
                    );
                    addBodyToSceneGraph(connState.sceneGraphManager, newBody, newGeoms);
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
        if (connState.ws !== socket) return;
        if (connState.handshakeTimer) {
          clearTimeout(connState.handshakeTimer);
          connState.handshakeTimer = null;
        }
        getDebugRecorder().recordAnomaly({
          severity: 'warning',
          code: 'websocket-closed',
          message: 'Engine WebSocket connection closed',
        });
        getDebugRecorder().markConnectionClosed('socket-close');
        set({ status: 'disconnected' });
        connState.ws = null;
      };

      socket.onerror = () => {
        if (connState.ws !== socket) return;
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

function mapSurfaceClass(sc: FaceSurfaceClass): DatumState['surfaceClass'] {
  switch (sc) {
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
      return 'other';
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
      datum.sourceFaceIndex !== undefined
        ? Number(datum.sourceFaceIndex)
        : existing?.sourceFaceIndex,
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
