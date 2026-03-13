import { contextBridge } from 'electron';

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

contextBridge.exposeInMainWorld('motionlab', {
  platform: process.platform,
  /** Engine connection info will be populated by main process in Epic 1 */
  getEngineEndpoint: async (): Promise<{ host: string; port: number } | null> => {
    // Stub — will be implemented when engine supervision is added
    return null;
  },
});
