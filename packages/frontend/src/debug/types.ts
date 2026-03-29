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

export type DebugSeverity = 'info' | 'warning' | 'error';
export type DebugDirection = 'outbound' | 'inbound';

export interface DebugProtocolEntry {
  timestamp: string;
  monotonicMs: number;
  direction: DebugDirection;
  sequenceId: string;
  messageType: string;
  payloadJson: string;
  sizeBytes: number;
  streaming: boolean;
}

export interface DebugConsoleEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'log';
  args: unknown[];
}

export interface DebugAnomaly {
  timestamp: string;
  severity: DebugSeverity;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface DebugPendingCommand {
  sequenceId: string;
  messageType: string;
  sentAt: string;
  ageMs: number;
  timedOut: boolean;
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
  connection: {
    status: string;
    engineVersion?: string;
    engineStatus?: string;
    errorMessage?: string;
    endpoint?: {
      host: string;
      port: number;
      sessionToken?: string;
    };
  };
  stores: {
    mechanism: Record<string, unknown>;
    selection: Record<string, unknown>;
    simulation: Record<string, unknown>;
    dialogs: Record<string, unknown>;
    importFlow: Record<string, unknown>;
    uiLayout: Record<string, unknown>;
  };
  runtime: {
    bodyPoseCount: number;
    traceChannelCount: number;
    activeChannelCount: number;
    traceSummaries: Array<Record<string, unknown>>;
  };
  protocol: {
    recentEntries: DebugProtocolEntry[];
    recentStreamEntries: DebugProtocolEntry[];
    pendingCommands: DebugPendingCommand[];
  };
  console: DebugConsoleEntry[];
  anomalies: DebugAnomaly[];
}

export interface DebugBundleResult {
  bundlePath: string;
  sessionId: string;
}

export interface DebugBundleRequest {
  reason?: string;
  snapshot: DebugSnapshot;
}

export type DebugEvent =
  | { type: 'anomaly'; anomaly: DebugAnomaly }
  | { type: 'bundle-exported'; bundlePath: string; reason?: string }
  | { type: 'host'; event: Record<string, unknown> };

export interface MotionLabDebugAPI {
  isEnabled(): boolean;
  getSessionInfo(): Promise<DebugSessionInfo | null>;
  getSnapshot(): Promise<DebugSnapshot>;
  exportBundle(reason?: string): Promise<DebugBundleResult>;
  onDebugEvent(callback: (event: DebugEvent) => void): () => void;
}
