import {
  createCompileMechanismCommand,
  createCreateDatumCommand,
  createCreateDatumFromFaceCommand,
  createCreateJointCommand,
  createDeleteDatumCommand,
  createDeleteJointCommand,
  createSimulationControlCommand,
  FaceSurfaceClass,
  createHandshakeCommand,
  createImportAssetCommand,
  createRenameDatumCommand,
  createUpdateJointCommand,
  engineStateToString,
  eventToDebugJson,
  mapJointType,
  parseEvent,
  SimulationAction,
  SimStateEnum,
  toProtoJointType,
} from '@motionlab/protocol';
import type { SceneGraphManager } from '@motionlab/viewport';

import type { EngineConnectionState } from '../stores/engine-connection.js';
import { useAuthoringStatusStore } from '../stores/authoring-status.js';
import type { BodyState } from '../stores/mechanism.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useToolModeStore } from '../stores/tool-mode.js';

type SetState = (
  updater:
    | Partial<EngineConnectionState>
    | ((state: EngineConnectionState) => Partial<EngineConnectionState>),
) => void;
type GetState = () => EngineConnectionState;

let ws: WebSocket | null = null;
let handshakeTimer: ReturnType<typeof setTimeout> | null = null;

// ---------------------------------------------------------------------------
// SceneGraphManager registry for hot-path frame updates
// ---------------------------------------------------------------------------

let sceneGraphManager: SceneGraphManager | null = null;

export function registerSceneGraph(sg: SceneGraphManager | null): void {
  sceneGraphManager = sg;
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

  set({ status: 'discovering' });

  if (!window.motionlab) {
    set({ status: 'error', errorMessage: 'Not running in desktop app' });
    return;
  }

  window.motionlab
    .getEngineEndpoint()
    .then((endpoint) => {
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
        if (ws !== socket) return; // stale socket from StrictMode double-invoke
        set({ status: 'handshaking' });

        socket.send(createHandshakeCommand(endpoint.sessionToken ?? ''));

        handshakeTimer = setTimeout(() => {
          set({ status: 'error', errorMessage: 'Handshake timed out' });
          cleanup();
        }, 5000);
      };

      socket.onmessage = (event) => {
        let evt: ReturnType<typeof parseEvent>;
        try {
          evt = parseEvent(event.data as ArrayBuffer);
        } catch {
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
              const remoteVersion = ack.engineProtocol?.version ?? 'unknown';
              set({
                status: 'error',
                errorMessage: `Incompatible protocol: engine v${remoteVersion}`,
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
                partIndex:
                  b.partIndex.length > 0 ? new Uint32Array(b.partIndex) : undefined,
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
              const d = success.datum!;
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
            useSimulationStore
              .getState()
              .setCompilationResult(
                result.success,
                result.errorMessage,
                result.diagnostics,
              );
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
              sev.state === SIM.SIM_STATE_RUNNING ? 'running' as const
              : sev.state === SIM.SIM_STATE_PAUSED ? 'paused' as const
              : sev.state === SIM.SIM_STATE_COMPILING ? 'compiling' as const
              : sev.state === SIM.SIM_STATE_ERROR ? 'error' as const
              : 'idle' as const;
            useSimulationStore
              .getState()
              .setSimState(mapped, sev.simTime, Number(sev.stepCount));
            break;
          }
          case 'simulationFrame': {
            if (!sceneGraphManager) break;
            const frame = evt.payload.value;
            for (const bp of frame.bodyPoses) {
              sceneGraphManager.updateBodyTransform(bp.bodyId, {
                position: [
                  bp.position?.x ?? 0,
                  bp.position?.y ?? 0,
                  bp.position?.z ?? 0,
                ],
                rotation: [
                  bp.orientation?.x ?? 0,
                  bp.orientation?.y ?? 0,
                  bp.orientation?.z ?? 0,
                  bp.orientation?.w ?? 1,
                ],
              });
            }
            break;
          }
          case 'pong':
            break;
        }
      };

      socket.onclose = () => {
        if (handshakeTimer) {
          clearTimeout(handshakeTimer);
          handshakeTimer = null;
        }
        set({ status: 'disconnected' });
        ws = null;
      };

      socket.onerror = () => {
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

export function sendCreateJoint(
  parentDatumId: string,
  childDatumId: string,
  type: 'revolute' | 'prismatic' | 'fixed',
  name: string,
  lowerLimit: number,
  upperLimit: number,
): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(createCreateJointCommand(parentDatumId, childDatumId, toProtoJointType(type), name, lowerLimit, upperLimit));
}

export function sendUpdateJoint(
  jointId: string,
  updates: { name?: string; type?: 'revolute' | 'prismatic' | 'fixed'; lowerLimit?: number; upperLimit?: number },
): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(createUpdateJointCommand(jointId, {
    name: updates.name,
    type: updates.type !== undefined ? toProtoJointType(updates.type) : undefined,
    lowerLimit: updates.lowerLimit,
    upperLimit: updates.upperLimit,
  }));
}

export function sendDeleteJoint(jointId: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(createDeleteJointCommand(jointId));
}

export function sendCompileMechanism(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(createCompileMechanismCommand());
}

export function sendSimulationControl(action: SimulationAction): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(createSimulationControlCommand(action));
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
    case FaceSurfaceClass.OTHER:
    default:
      return 'surface';
  }
}
