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
  ): () => void;
  openFileDialog(options?: {
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<string | null>;
  windowMinimize(): void;
  windowMaximize(): void;
  windowClose(): void;
  windowIsMaximized(): Promise<boolean>;
  onWindowMaximizedChange(callback: (maximized: boolean) => void): void;
  saveProjectFile(
    data: Uint8Array,
    defaultName?: string,
  ): Promise<{ saved: boolean; filePath?: string }>;
  openProjectFile(): Promise<{ data: Uint8Array; filePath: string } | null>;
  /** Register a callback invoked by the main process to check dirty state before quit. */
  onCheckDirty(callback: () => boolean): () => void;
  /** Open the application logs folder in the system file manager. */
  showLogsFolder(): Promise<void>;
  /** Save project bytes to an existing path without showing a dialog. */
  saveProjectToPath(
    data: Uint8Array,
    filePath: string,
  ): Promise<{ saved: boolean; filePath: string }>;
  /** Update the native window title (taskbar/dock). */
  setWindowTitle(title: string): void;
  /** Get the list of recently opened projects. */
  getRecentProjects(): Promise<
    Array<{ name: string; filePath: string; lastOpened: string }>
  >;
  /** Add or update a project in the recent list. */
  addRecentProject(project: { name: string; filePath: string }): Promise<void>;
  /** Remove a project from the recent list by file path. */
  removeRecentProject(filePath: string): Promise<void>;
  /** Register a callback invoked by the main process auto-save timer. */
  onAutoSaveTick(callback: () => void): () => void;
  /** Write auto-save data to the autosave file. */
  autoSaveWrite(
    data: Uint8Array,
    projectPath: string | null,
  ): Promise<{ saved: boolean; path: string }>;
  /** Delete the autosave file for a project after a successful manual save. */
  autoSaveCleanup(projectPath: string | null): Promise<void>;
  /** Check for autosave files from a previous crash. */
  checkAutoSaveRecovery(): Promise<
    Array<{ name: string; originalPath: string | null; autoSavePath: string; modifiedAt: string }>
  >;
  /** Read autosave file contents for crash recovery. */
  readAutoSave(autoSavePath: string): Promise<Uint8Array>;
  /** Discard an autosave file (user chose not to recover). */
  discardAutoSave(autoSavePath: string): Promise<void>;
  /** Register a callback for file-open requests (file associations, CLI args). */
  onOpenFileRequest(callback: (filePath: string) => void): () => void;
  /** Read a project file by path without showing a dialog. */
  readFileByPath(
    filePath: string,
  ): Promise<{ data: Uint8Array; filePath: string; projectName: string } | null>;
  /** Get the list of available project templates. */
  getTemplates(): Promise<
    Array<{
      id: string;
      name: string;
      description: string;
      filename: string;
      icon: string;
      category: string;
    }>
  >;
  /** Read a template file by filename, returning its raw bytes. */
  openTemplate(filename: string): Promise<Uint8Array>;
  /** Debug-mode only: return session metadata for the current agent-debug run. */
  getDebugSessionInfo?(): Promise<{
    enabled: boolean;
    sessionId: string;
    startedAt: string;
    sessionDir: string;
    exportDir: string;
    cdpPort: number | null;
    captureLimits: Record<string, number>;
    engine?: { pid: number | null; host: string | null; port: number | null };
    logPaths: {
      supervisor: string | null;
      protocol: string | null;
      rendererConsole: string | null;
      anomalies: string | null;
    };
  } | null>;
  /** Debug-mode only: export a local debug bundle. */
  exportDebugBundle?(request: { reason?: string; snapshot: Record<string, unknown> }): Promise<{
    bundlePath: string;
    sessionId: string;
  }>;
  /** Internal debug sink for structured protocol entries. */
  appendDebugProtocolEntry?(entry: Record<string, unknown>): void;
  /** Internal debug sink for structured console entries. */
  appendDebugConsoleEntry?(entry: Record<string, unknown>): void;
  /** Internal debug sink for anomalies. */
  appendDebugAnomaly?(entry: Record<string, unknown>): void;
  /** Subscribe to main-process debug events. */
  onDebugEvent?(callback: (event: Record<string, unknown>) => void): () => void;
}

const api: MotionLabAPI = {
  platform: process.platform,
  getEngineEndpoint: () => ipcRenderer.invoke('get-engine-endpoint'),
  onEngineStatusChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, status: { status: string; code?: number | null; signal?: string | null }) => {
      callback(status);
    };
    ipcRenderer.on('engine-status-changed', listener);
    return () => ipcRenderer.removeListener('engine-status-changed', listener);
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
  saveProjectFile: (data, defaultName) =>
    ipcRenderer.invoke('save-project-file', data, defaultName),
  openProjectFile: () => ipcRenderer.invoke('open-project-file'),
  onCheckDirty: (callback) => {
    const listener = () => {
      const isDirty = callback();
      ipcRenderer.send('check-dirty-response', isDirty);
    };
    ipcRenderer.on('check-dirty', listener);
    return () => ipcRenderer.removeListener('check-dirty', listener);
  },
  showLogsFolder: () => ipcRenderer.invoke('show-logs-folder'),
  saveProjectToPath: (data: Uint8Array, filePath: string) =>
    ipcRenderer.invoke('save-project-to-path', data, filePath),
  setWindowTitle: (title: string) => ipcRenderer.send('set-window-title', title),
  getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
  addRecentProject: (project: { name: string; filePath: string }) =>
    ipcRenderer.invoke('add-recent-project', project),
  removeRecentProject: (filePath: string) =>
    ipcRenderer.invoke('remove-recent-project', filePath),
  onAutoSaveTick: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('auto-save-tick', listener);
    return () => ipcRenderer.removeListener('auto-save-tick', listener);
  },
  autoSaveWrite: (data: Uint8Array, projectPath: string | null) =>
    ipcRenderer.invoke('auto-save-write', data, projectPath),
  autoSaveCleanup: (projectPath: string | null) =>
    ipcRenderer.invoke('auto-save-cleanup', projectPath),
  checkAutoSaveRecovery: () => ipcRenderer.invoke('check-autosave-recovery'),
  readAutoSave: (autoSavePath: string) => ipcRenderer.invoke('read-autosave', autoSavePath),
  discardAutoSave: (autoSavePath: string) => ipcRenderer.invoke('discard-autosave', autoSavePath),
  onOpenFileRequest: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, filePath: string) => callback(filePath);
    ipcRenderer.on('open-file-request', listener);
    return () => ipcRenderer.removeListener('open-file-request', listener);
  },
  readFileByPath: (filePath: string) => ipcRenderer.invoke('read-file-by-path', filePath),
  getTemplates: () => ipcRenderer.invoke('get-templates'),
  openTemplate: (filename: string) => ipcRenderer.invoke('open-template', filename),
  getDebugSessionInfo: () => ipcRenderer.invoke('get-debug-session-info'),
  exportDebugBundle: (request: { reason?: string; snapshot: Record<string, unknown> }) =>
    ipcRenderer.invoke('export-debug-bundle', request),
  appendDebugProtocolEntry: (entry: Record<string, unknown>) =>
    ipcRenderer.send('append-debug-protocol-entry', entry),
  appendDebugConsoleEntry: (entry: Record<string, unknown>) =>
    ipcRenderer.send('append-debug-console-entry', entry),
  appendDebugAnomaly: (entry: Record<string, unknown>) =>
    ipcRenderer.send('append-debug-anomaly', entry),
  onDebugEvent: (callback: (event: Record<string, unknown>) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, event: Record<string, unknown>) =>
      callback(event);
    ipcRenderer.on('debug-event', listener);
    return () => ipcRenderer.removeListener('debug-event', listener);
  },
};

contextBridge.exposeInMainWorld('motionlab', api);
