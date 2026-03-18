import {
  createCreateDatumCommand,
  createCreateJointCommand,
  createDeleteDatumCommand,
  createDeleteJointCommand,
  createHandshakeCommand,
  createImportAssetCommand,
  createRenameDatumCommand,
  createUpdateJointCommand,
  engineStateToString,
  eventToDebugJson,
  mapJointType,
  parseEvent,
  toProtoJointType,
} from '@motionlab/protocol';
import type { EngineConnectionState } from '../stores/engine-connection.js';
import type { BodyState } from '../stores/mechanism.js';
import { useMechanismStore } from '../stores/mechanism.js';

type SetState = (
  updater:
    | Partial<EngineConnectionState>
    | ((state: EngineConnectionState) => Partial<EngineConnectionState>),
) => void;
type GetState = () => EngineConnectionState;

let ws: WebSocket | null = null;
let handshakeTimer: ReturnType<typeof setTimeout> | null = null;

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
