import {
  createHandshakeCommand,
  createImportAssetCommand,
  engineStateToString,
  eventToDebugJson,
  parseEvent,
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
      ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        set({ status: 'handshaking' });

        ws?.send(createHandshakeCommand(endpoint.sessionToken ?? ''));

        handshakeTimer = setTimeout(() => {
          set({ status: 'error', errorMessage: 'Handshake timed out' });
          cleanup();
        }, 5000);
      };

      ws.onmessage = (event) => {
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
          case 'pong':
            break;
        }
      };

      ws.onclose = () => {
        if (handshakeTimer) {
          clearTimeout(handshakeTimer);
          handshakeTimer = null;
        }
        set({ status: 'disconnected' });
        ws = null;
      };

      ws.onerror = () => {
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
