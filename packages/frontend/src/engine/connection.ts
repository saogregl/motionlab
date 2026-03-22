import {
  ChannelDataType,
  createCompileMechanismCommand,
  createCreateDatumCommand,
  createCreateDatumFromFaceCommand,
  createCreateJointCommand,
  createDeleteDatumCommand,
  createDeleteJointCommand,
  createHandshakeCommand,
  createImportAssetCommand,
  createLoadProjectCommand,
  createRelocateAssetCommand,
  createRenameDatumCommand,
  createUpdateDatumPoseCommand,
  createSaveProjectCommand,
  createScrubCommand,
  createSimulationControlCommand,
  createUpdateBodyCommand,
  createUpdateJointCommand,
  engineStateToString,
  eventToDebugJson,
  FaceSurfaceClass,
  mapJointType,
  parseEvent,
  SimStateEnum,
  SimulationAction,
  toProtoJointType,
  PROTOCOL_VERSION,
} from '@motionlab/protocol';
import type { MissingAssetInfo } from '@motionlab/protocol';
import type { SceneGraphManager } from '@motionlab/viewport';
import { useAuthoringStatusStore } from '../stores/authoring-status.js';
import { clearBodyPoses, setBodyPose } from '../stores/body-poses.js';
import type { EngineConnectionState } from '../stores/engine-connection.js';
import type { BodyState } from '../stores/mechanism.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { type ChannelDescriptor, useSimulationStore } from '../stores/simulation.js';
import { useToolModeStore } from '../stores/tool-mode.js';
import { type StoreSample, useTraceStore } from '../stores/traces.js';

type SetState = (
  updater:
    | Partial<EngineConnectionState>
    | ((state: EngineConnectionState) => Partial<EngineConnectionState>),
) => void;
type GetState = () => EngineConnectionState;

let ws: WebSocket | null = null;
let handshakeTimer: ReturnType<typeof setTimeout> | null = null;
let connectEpoch = 0;

// ---------------------------------------------------------------------------
// SceneGraphManager registry for hot-path frame updates
// ---------------------------------------------------------------------------

let sceneGraphManager: SceneGraphManager | null = null;

export function registerSceneGraph(sg: SceneGraphManager | null): void {
  sceneGraphManager = sg;
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

export function getMeasuredFps(): number {
  return measuredFps;
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
}

export function connect(set: SetState, _get: GetState) {
  cleanup();
  const myEpoch = ++connectEpoch;

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

        socket.send(createHandshakeCommand(endpoint.sessionToken ?? ''));

        handshakeTimer = setTimeout(() => {
          set({ status: 'error', errorMessage: 'Handshake timed out' });
          cleanup();
        }, 5000);
      };

      socket.onmessage = (event) => {
        if (ws !== socket) return;
        let evt: ReturnType<typeof parseEvent>;
        try {
          evt = parseEvent(event.data as ArrayBuffer);
        } catch (err) {
          console.warn('[protocol] failed to parse event:', err);
          return;
        }

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
              const mapped: BodyState[] = result.bodies.map((b) => ({
                id: b.bodyId,
                name: b.name,
                meshData: {
                  vertices: new Float32Array(b.displayMesh?.vertices ?? []),
                  indices: new Uint32Array(b.displayMesh?.indices ?? []),
                  normals: new Float32Array(b.displayMesh?.normals ?? []),
                },
                partIndex: b.partIndex.length > 0 ? new Uint32Array(b.partIndex) : undefined,
                massProperties: {
                  mass: b.massProperties?.mass ?? 0,
                  centerOfMass: {
                    x: b.massProperties?.centerOfMass?.x ?? 0,
                    y: b.massProperties?.centerOfMass?.y ?? 0,
                    z: b.massProperties?.centerOfMass?.z ?? 0,
                  },
                  ixx: b.massProperties?.ixx ?? 0,
                  iyy: b.massProperties?.iyy ?? 0,
                  izz: b.massProperties?.izz ?? 0,
                  ixy: b.massProperties?.ixy ?? 0,
                  ixz: b.massProperties?.ixz ?? 0,
                  iyz: b.massProperties?.iyz ?? 0,
                },
                pose: {
                  position: {
                    x: b.pose?.position?.x ?? 0,
                    y: b.pose?.position?.y ?? 0,
                    z: b.pose?.position?.z ?? 0,
                  },
                  rotation: {
                    x: b.pose?.orientation?.x ?? 0,
                    y: b.pose?.orientation?.y ?? 0,
                    z: b.pose?.orientation?.z ?? 0,
                    w: b.pose?.orientation?.w ?? 1,
                  },
                },
                sourceAssetRef: {
                  contentHash: b.sourceAssetRef?.contentHash ?? '',
                  originalFilename: b.sourceAssetRef?.originalFilename ?? '',
                },
              }));
              mechStore.addBodies(mapped);
            } else {
              mechStore.setImportError(result.errorMessage);
            }
            mechStore.setImporting(false);
            break;
          }
          case 'createDatumResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            if (result.result.case === 'datum') {
              const d = result.result.value;
              mechStore.addDatum({
                id: d.id?.id ?? '',
                name: d.name,
                parentBodyId: d.parentBodyId?.id ?? '',
                localPose: {
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
                },
              });
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
              mechStore.addDatum({
                id: d.id?.id ?? '',
                name: d.name,
                parentBodyId: d.parentBodyId?.id ?? '',
                localPose: {
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
                },
              });
              statusStore.setMessage(
                `Created datum from ${surfaceClassToLabel(success.surfaceClass)} face`,
              );
            } else if (result.result.case === 'errorMessage') {
              statusStore.setMessage(result.result.value);
              console.error('[datum] create-from-face failed:', result.result.value);
            }
            break;
          }
          case 'deleteDatumResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            if (result.result.case === 'deletedId') {
              mechStore.removeDatum(result.result.value.id);
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
            } else if (result.result.case === 'errorMessage') {
              console.error('[datum] update pose failed:', result.result.value);
            }
            break;
          }
          case 'updateBodyResult': {
            const result = evt.payload.value;
            const mechStore = useMechanismStore.getState();
            if (result.result.case === 'body') {
              const b = result.result.value;
              // Update the body's isFixed state in the store
              const existing = mechStore.bodies.get(b.id?.id ?? '');
              if (existing) {
                mechStore.addBodies([{ ...existing, isFixed: b.isFixed }]);
              }
            } else if (result.result.case === 'errorMessage') {
              console.error('[body] update failed:', result.result.value);
            }
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
              });
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
              });
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
            } else if (result.result.case === 'errorMessage') {
              console.error('[joint] delete failed:', result.result.value);
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
            useSimulationStore
              .getState()
              .setCompilationResult(
                result.success,
                result.errorMessage,
                result.diagnostics,
                channels,
              );
            useTraceStore.getState().setChannels(channels);
            if (result.success) {
              useToolModeStore.getState().setMode('select');
            } else {
              useAuthoringStatusStore
                .getState()
                .setMessage(result.errorMessage || 'Compilation failed');
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
                const { bodies } = useMechanismStore.getState();
                for (const body of bodies.values()) {
                  sceneGraphManager.updateBodyTransform(body.id, {
                    position: [body.pose.position.x, body.pose.position.y, body.pose.position.z],
                    rotation: [
                      body.pose.rotation.x,
                      body.pose.rotation.y,
                      body.pose.rotation.z,
                      body.pose.rotation.w,
                    ],
                  });
                }
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
              break;
            }
            const frame = evt.payload.value;
            if (frame.bodyPoses.length === 0) {
              console.warn('[sim] frame has no body poses');
            }
            for (const bp of frame.bodyPoses) {
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
              if (frameCount <= 3) {
                console.log(`[sim] frame ${frameCount}: ${bp.bodyId} pos=(${pos.x.toFixed(4)}, ${pos.y.toFixed(4)}, ${pos.z.toFixed(4)})`);
              }
              sceneGraphManager.updateBodyTransform(bp.bodyId, {
                position: [pos.x, pos.y, pos.z],
                rotation: [rot.x, rot.y, rot.z, rot.w],
              });
              setBodyPose(bp.bodyId, pos, rot);
            }
            // Update simulation time from frame data so timeline tracks progress
            useSimulationStore
              .getState()
              .setSimState('running', frame.simTime, Number(frame.stepCount));
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
            useTraceStore.getState().addSamples(trace.channelId, samples);
            break;
          }
          case 'saveProjectResult': {
            const result = evt.payload.value;
            if (result.result.case === 'projectData') {
              const bytes = result.result.value;
              const mechStore = useMechanismStore.getState();
              const projectName = mechStore.projectName;
              window.motionlab
                ?.saveProjectFile(new Uint8Array(bytes), projectName)
                .then((saveResult) => {
                  if (saveResult.saved && saveResult.filePath) {
                    mechStore.setProjectMeta(projectName, saveResult.filePath);
                    mechStore.markClean();
                  }
                })
                .catch((err: unknown) => {
                  console.error('[project] save failed:', err);
                });
            } else if (result.result.case === 'errorMessage') {
              console.error('[project] save failed:', result.result.value);
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

              // Build lookup for isFixed from mechanism bodies
              const mechanismBodies = new Map(
                (success.mechanism?.bodies ?? []).map((b) => [b.id?.id ?? '', b]),
              );

              // Rebuild bodies
              const mapped: BodyState[] = success.bodies.map((b) => ({
                id: b.bodyId,
                name: b.name,
                meshData: {
                  vertices: new Float32Array(b.displayMesh?.vertices ?? []),
                  indices: new Uint32Array(b.displayMesh?.indices ?? []),
                  normals: new Float32Array(b.displayMesh?.normals ?? []),
                },
                partIndex: b.partIndex.length > 0 ? new Uint32Array(b.partIndex) : undefined,
                massProperties: {
                  mass: b.massProperties?.mass ?? 0,
                  centerOfMass: {
                    x: b.massProperties?.centerOfMass?.x ?? 0,
                    y: b.massProperties?.centerOfMass?.y ?? 0,
                    z: b.massProperties?.centerOfMass?.z ?? 0,
                  },
                  ixx: b.massProperties?.ixx ?? 0,
                  iyy: b.massProperties?.iyy ?? 0,
                  izz: b.massProperties?.izz ?? 0,
                  ixy: b.massProperties?.ixy ?? 0,
                  ixz: b.massProperties?.ixz ?? 0,
                  iyz: b.massProperties?.iyz ?? 0,
                },
                pose: {
                  position: {
                    x: b.pose?.position?.x ?? 0,
                    y: b.pose?.position?.y ?? 0,
                    z: b.pose?.position?.z ?? 0,
                  },
                  rotation: {
                    x: b.pose?.orientation?.x ?? 0,
                    y: b.pose?.orientation?.y ?? 0,
                    z: b.pose?.orientation?.z ?? 0,
                    w: b.pose?.orientation?.w ?? 1,
                  },
                },
                sourceAssetRef: {
                  contentHash: b.sourceAssetRef?.contentHash ?? '',
                  originalFilename: b.sourceAssetRef?.originalFilename ?? '',
                },
                isFixed: mechanismBodies.get(b.bodyId)?.isFixed ?? false,
              }));
              mechStore.addBodies(mapped);

              // Add bodies to scene graph
              if (sceneGraphManager) {
                for (const body of mapped) {
                  sceneGraphManager.addBody(
                    body.id,
                    body.name,
                    body.meshData,
                    {
                      position: [body.pose.position.x, body.pose.position.y, body.pose.position.z],
                      rotation: [
                        body.pose.rotation.x,
                        body.pose.rotation.y,
                        body.pose.rotation.z,
                        body.pose.rotation.w,
                      ],
                    },
                    body.partIndex,
                  );
                }
              }

              // Rebuild datums
              const mechanism = success.mechanism;
              if (mechanism) {
                for (const d of mechanism.datums) {
                  const datumState = {
                    id: d.id?.id ?? '',
                    name: d.name,
                    parentBodyId: d.parentBodyId?.id ?? '',
                    localPose: {
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
                    },
                  };
                  mechStore.addDatum(datumState);
                  if (sceneGraphManager) {
                    sceneGraphManager.addDatum(datumState.id, datumState.parentBodyId, {
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
                    });
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

              // Rebuild the body with new mesh/asset data (same as importAssetResult mapping)
              const updated: BodyState = {
                id: b.bodyId,
                name: b.name,
                meshData: {
                  vertices: new Float32Array(b.displayMesh?.vertices ?? []),
                  indices: new Uint32Array(b.displayMesh?.indices ?? []),
                  normals: new Float32Array(b.displayMesh?.normals ?? []),
                },
                partIndex: b.partIndex.length > 0 ? new Uint32Array(b.partIndex) : undefined,
                massProperties: {
                  mass: b.massProperties?.mass ?? 0,
                  centerOfMass: {
                    x: b.massProperties?.centerOfMass?.x ?? 0,
                    y: b.massProperties?.centerOfMass?.y ?? 0,
                    z: b.massProperties?.centerOfMass?.z ?? 0,
                  },
                  ixx: b.massProperties?.ixx ?? 0,
                  iyy: b.massProperties?.iyy ?? 0,
                  izz: b.massProperties?.izz ?? 0,
                  ixy: b.massProperties?.ixy ?? 0,
                  ixz: b.massProperties?.ixz ?? 0,
                  iyz: b.massProperties?.iyz ?? 0,
                },
                pose: {
                  position: {
                    x: b.pose?.position?.x ?? 0,
                    y: b.pose?.position?.y ?? 0,
                    z: b.pose?.position?.z ?? 0,
                  },
                  rotation: {
                    x: b.pose?.orientation?.x ?? 0,
                    y: b.pose?.orientation?.y ?? 0,
                    z: b.pose?.orientation?.z ?? 0,
                    w: b.pose?.orientation?.w ?? 1,
                  },
                },
                sourceAssetRef: {
                  contentHash: b.sourceAssetRef?.contentHash ?? '',
                  originalFilename: b.sourceAssetRef?.originalFilename ?? '',
                },
              };
              mechStore.addBodies([updated]);

              // Update scene graph
              if (sceneGraphManager) {
                sceneGraphManager.addBody(
                  updated.id,
                  updated.name,
                  updated.meshData,
                  {
                    position: [updated.pose.position.x, updated.pose.position.y, updated.pose.position.z],
                    rotation: [
                      updated.pose.rotation.x,
                      updated.pose.rotation.y,
                      updated.pose.rotation.z,
                      updated.pose.rotation.w,
                    ],
                  },
                  updated.partIndex,
                );
              }

              console.log('[project] asset relocated successfully:', b.bodyId);
              if (relocateAssetCallback) relocateAssetCallback(b.bodyId, true);
            } else if (result.result.case === 'errorMessage') {
              console.error('[project] asset relocation failed:', result.result.value);
              if (relocateAssetCallback) relocateAssetCallback('', false, result.result.value);
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
        set({ status: 'disconnected' });
        ws = null;
      };

      socket.onerror = () => {
        if (ws !== socket) return;
        set({ status: 'error', errorMessage: 'WebSocket error' });
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
  options?: { densityOverride?: number; tessellationQuality?: number; unitSystem?: string },
): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(createImportAssetCommand(filePath, options));
}

export function sendCreateDatum(
  parentBodyId: string,
  name: string,
  localPose: {
    position: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
  },
): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(createCreateDatumCommand(parentBodyId, localPose, name));
}

export function sendCreateDatumFromFace(
  parentBodyId: string,
  faceIndex: number,
  name: string,
): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(createCreateDatumFromFaceCommand(parentBodyId, faceIndex, name));
}

export function sendDeleteDatum(datumId: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(createDeleteDatumCommand(datumId));
}

export function sendRenameDatum(datumId: string, newName: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(createRenameDatumCommand(datumId, newName));
}

export function sendUpdateDatumPose(
  datumId: string,
  newLocalPose: {
    position: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
  },
): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(createUpdateDatumPoseCommand(datumId, newLocalPose));
}

export function sendCreateJoint(
  parentDatumId: string,
  childDatumId: string,
  type: 'revolute' | 'prismatic' | 'fixed' | 'spherical' | 'cylindrical' | 'planar',
  name: string,
  lowerLimit: number,
  upperLimit: number,
): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(
    createCreateJointCommand(
      parentDatumId,
      childDatumId,
      toProtoJointType(type),
      name,
      lowerLimit,
      upperLimit,
    ),
  );
}

export function sendUpdateJoint(
  jointId: string,
  updates: {
    name?: string;
    type?: 'revolute' | 'prismatic' | 'fixed' | 'spherical' | 'cylindrical' | 'planar';
    lowerLimit?: number;
    upperLimit?: number;
  },
): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(
    createUpdateJointCommand(jointId, {
      name: updates.name,
      type: updates.type !== undefined ? toProtoJointType(updates.type) : undefined,
      lowerLimit: updates.lowerLimit,
      upperLimit: updates.upperLimit,
    }),
  );
}

export function sendUpdateBody(bodyId: string, updates: { isFixed?: boolean }): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(createUpdateBodyCommand(bodyId, updates));
}

export function sendDeleteJoint(jointId: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(createDeleteJointCommand(jointId));
}

export function sendCompileMechanism(
  settings?: { timestep?: number; gravity?: { x: number; y: number; z: number } },
): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(createCompileMechanismCommand(settings));
}

export function sendSimulationControl(action: SimulationAction): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(createSimulationControlCommand(action));
}

export function sendScrub(time: number): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(createScrubCommand(time));
}

export function sendSaveProject(projectName: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(createSaveProjectCommand(projectName));
}

export function sendLoadProject(data: Uint8Array): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(createLoadProjectCommand(data));
}

export function sendRelocateAsset(bodyId: string, newFilePath: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(createRelocateAssetCommand(bodyId, newFilePath));
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
    default:
      return 'surface';
  }
}
