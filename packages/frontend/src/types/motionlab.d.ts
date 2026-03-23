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
  onCheckDirty(callback: () => boolean): void;
  showLogsFolder(): Promise<void>;
  setWindowTitle(title: string): void;
  getRecentProjects(): Promise<RecentProject[]>;
  addRecentProject(project: { name: string; filePath: string }): Promise<void>;
  removeRecentProject(filePath: string): Promise<void>;
  onEngineStatusChanged(
    callback: (status: { status: string; code?: number | null; signal?: string | null }) => void,
  ): void;
  onAutoSaveTick(callback: () => void): void;
  autoSaveWrite(
    data: Uint8Array,
    projectPath: string | null,
  ): Promise<{ saved: boolean; path: string }>;
  autoSaveCleanup(projectPath: string | null): Promise<void>;
  checkAutoSaveRecovery(): Promise<RecoverableProject[]>;
  readAutoSave(autoSavePath: string): Promise<Uint8Array>;
  discardAutoSave(autoSavePath: string): Promise<void>;
  onOpenFileRequest(callback: (filePath: string) => void): void;
  readFileByPath(
    filePath: string,
  ): Promise<{ data: Uint8Array; filePath: string; projectName: string } | null>;
  getTemplates(): Promise<TemplateInfo[]>;
  openTemplate(filename: string): Promise<Uint8Array>;
}

declare global {
  interface Window {
    motionlab?: MotionLabAPI;
  }
}
