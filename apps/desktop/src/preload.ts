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
  openFileDialog(options?: {
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<string | null>;
  windowMinimize(): void;
  windowMaximize(): void;
  windowClose(): void;
  windowIsMaximized(): Promise<boolean>;
  onWindowMaximizedChange(callback: (maximized: boolean) => void): void;
}

const api: MotionLabAPI = {
  platform: process.platform,
  getEngineEndpoint: () => ipcRenderer.invoke('get-engine-endpoint'),
  onEngineStatusChanged: (callback) => {
    ipcRenderer.on('engine-status-changed', (_event, status) => {
      callback(status);
    });
  },
  openFileDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowMaximizedChange: (callback) => {
    ipcRenderer.on('window-maximized-changed', (_event, maximized) => {
      callback(maximized);
    });
  },
};

contextBridge.exposeInMainWorld('motionlab', api);
