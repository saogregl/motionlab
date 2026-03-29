export interface MotionLabEndpoint {
  host: string;
  port: number;
  sessionToken?: string;
}

export interface RecentProject {
  name: string;
  filePath: string;
  lastOpened: string;
}

export interface RecoverableProject {
  name: string;
  originalPath: string | null;
  autoSavePath: string;
  modifiedAt: string;
}

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  filename: string;
  icon: string;
  category: string;
}

export interface DebugCaptureLimits {
  maxRecentProtocolEntries: number;
  maxRecentStreamEntries: number;
  maxRecentConsoleEntries: number;
  maxRecentAnomalies: number;
  maxPendingCommands: number;
  commandTimeoutMs: number;
  maxStreamWindowSeconds: number;
}

export interface DebugSessionInfo {
  enabled: boolean;
  sessionId: string;
  startedAt: string;
  sessionDir: string;
  exportDir: string;
  cdpPort: number | null;
  captureLimits: DebugCaptureLimits;
  engine?: {
    pid: number | null;
    host: string | null;
    port: number | null;
  };
  logPaths: {
    supervisor: string | null;
    protocol: string | null;
    rendererConsole: string | null;
    anomalies: string | null;
  };
}

export interface DebugBundleResult {
  bundlePath: string;
  sessionId: string;
}

export interface DebugSnapshot {
  capturedAt: string;
  session: DebugSessionInfo | null;
  project: {
    hasActiveProject: boolean;
    projectName: string;
    projectFilePath: string | null;
    isDirty: boolean;
  };
  connection: Record<string, unknown>;
  stores: Record<string, unknown>;
  runtime: Record<string, unknown>;
  protocol: Record<string, unknown>;
  console: unknown[];
  anomalies: unknown[];
}

export interface DebugBundleRequest {
  reason?: string;
  snapshot: DebugSnapshot;
}

export interface MotionLabDebugAPI {
  isEnabled(): boolean;
  getSessionInfo(): Promise<DebugSessionInfo | null>;
  getSnapshot(): Promise<DebugSnapshot>;
  exportBundle(reason?: string): Promise<DebugBundleResult>;
  onDebugEvent(callback: (event: Record<string, unknown>) => void): () => void;
}

export interface MotionLabAPI {
  platform: string;
  getEngineEndpoint(): Promise<MotionLabEndpoint | null>;
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
  saveProjectToPath(
    data: Uint8Array,
    filePath: string,
  ): Promise<{ saved: boolean; filePath: string }>;
  openProjectFile(): Promise<{ data: Uint8Array; filePath: string } | null>;
  onCheckDirty(callback: () => boolean): () => void;
  showLogsFolder(): Promise<void>;
  setWindowTitle(title: string): void;
  getRecentProjects(): Promise<RecentProject[]>;
  addRecentProject(project: { name: string; filePath: string }): Promise<void>;
  removeRecentProject(filePath: string): Promise<void>;
  onEngineStatusChanged(
    callback: (status: { status: string; code?: number | null; signal?: string | null }) => void,
  ): () => void;
  onAutoSaveTick(callback: () => void): () => void;
  autoSaveWrite(
    data: Uint8Array,
    projectPath: string | null,
  ): Promise<{ saved: boolean; path: string }>;
  autoSaveCleanup(projectPath: string | null): Promise<void>;
  checkAutoSaveRecovery(): Promise<RecoverableProject[]>;
  readAutoSave(autoSavePath: string): Promise<Uint8Array>;
  discardAutoSave(autoSavePath: string): Promise<void>;
  onOpenFileRequest(callback: (filePath: string) => void): () => void;
  readFileByPath(
    filePath: string,
  ): Promise<{ data: Uint8Array; filePath: string; projectName: string } | null>;
  getTemplates(): Promise<TemplateInfo[]>;
  openTemplate(filename: string): Promise<Uint8Array>;
  getDebugSessionInfo?(): Promise<DebugSessionInfo | null>;
  exportDebugBundle?(request: DebugBundleRequest): Promise<DebugBundleResult>;
  appendDebugProtocolEntry?(entry: Record<string, unknown>): void;
  appendDebugConsoleEntry?(entry: Record<string, unknown>): void;
  appendDebugAnomaly?(entry: Record<string, unknown>): void;
  onDebugEvent?(callback: (event: Record<string, unknown>) => void): () => void;
}

declare global {
  interface Window {
    motionlab?: MotionLabAPI;
    motionlabDebug?: MotionLabDebugAPI;
  }
}
