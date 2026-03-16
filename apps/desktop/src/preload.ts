import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script — minimal surface area.
 *
 * Expose only what the renderer needs:
 * - Engine connection metadata (port, session token)
 * - Desktop integration hooks (file dialogs, app info)
 *
 * Do NOT expose:
 * - Direct IPC channels for simulation data
 * - Node.js APIs
 * - File system access
 */

interface MotionLabAPI {
  platform: string;
  getEngineEndpoint(): Promise<{
    host: string;
    port: number;
    sessionToken: string;
  } | null>;
  onEngineStatusChanged(
    callback: (status: { status: string; code?: number | null; signal?: string | null }) => void,
  ): void;
}

const api: MotionLabAPI = {
  platform: process.platform,
  getEngineEndpoint: () => ipcRenderer.invoke('get-engine-endpoint'),
  onEngineStatusChanged: (callback) => {
    ipcRenderer.on('engine-status-changed', (_event, status) => {
      callback(status);
    });
  },
};

contextBridge.exposeInMainWorld('motionlab', api);
