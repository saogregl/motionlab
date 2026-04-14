import crypto from 'node:crypto';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import type { BrowserWindow } from 'electron';

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

type EngineInfo = NonNullable<DebugSessionInfo['engine']>;

export interface DebugBundleRequest {
  reason?: string;
  snapshot: {
    project?: {
      projectFilePath?: string | null;
    };
  } & Record<string, unknown>;
}

export interface DebugBundleResult {
  bundlePath: string;
  sessionId: string;
}

const DEFAULT_CAPTURE_LIMITS: DebugCaptureLimits = {
  maxRecentProtocolEntries: 500,
  maxRecentStreamEntries: 240,
  maxRecentConsoleEntries: 200,
  maxRecentAnomalies: 100,
  maxPendingCommands: 200,
  commandTimeoutMs: 15_000,
  maxStreamWindowSeconds: 10,
};

function timestampForPath(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function appendJsonLine(filePath: string, payload: unknown): Promise<void> {
  await fsPromises.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

async function copyIfExists(source: string | null, dest: string): Promise<void> {
  if (!source) return;
  try {
    await fsPromises.copyFile(source, dest);
  } catch {
    // Bundle export remains best effort.
  }
}

export class DebugSession {
  private readonly startedAt = new Date().toISOString();
  private readonly sessionId = `dbg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  private readonly rootDir: string;
  private readonly sessionDir: string;
  private readonly exportDir: string;
  private readonly manifestPath: string;
  private readonly protocolLogPath: string;
  private readonly consoleLogPath: string;
  private readonly anomalyLogPath: string;
  private readonly captureLimits = DEFAULT_CAPTURE_LIMITS;
  private supervisorLogPath: string | null = null;
  private engineInfo: EngineInfo = {
    pid: null,
    host: null,
    port: null,
  };

  constructor(
    userDataDir: string,
    private readonly cdpPort: number | null,
  ) {
    this.rootDir = path.join(userDataDir, 'debug-sessions');
    this.sessionDir = path.join(this.rootDir, this.sessionId);
    this.exportDir = path.join(this.sessionDir, 'exports');
    this.manifestPath = path.join(this.sessionDir, 'session.json');
    this.protocolLogPath = path.join(this.sessionDir, 'protocol.ndjson');
    this.consoleLogPath = path.join(this.sessionDir, 'renderer-console.ndjson');
    this.anomalyLogPath = path.join(this.sessionDir, 'anomalies.ndjson');
  }

  async initialize(): Promise<void> {
    await fsPromises.mkdir(this.exportDir, { recursive: true });
    await this.writeManifest();
  }

  getLogDir(): string {
    return this.sessionDir;
  }

  setSupervisorLogPath(logPath: string | null): void {
    this.supervisorLogPath = logPath;
    void this.writeManifest();
  }

  updateEngineInfo(info: { pid: number | null; host?: string | null; port?: number | null }): void {
    this.engineInfo = {
      pid: info.pid,
      host: info.host ?? this.engineInfo.host ?? null,
      port: info.port ?? this.engineInfo.port ?? null,
    };
    void this.writeManifest();
  }

  getSessionInfo(): DebugSessionInfo {
    return {
      enabled: true,
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      sessionDir: this.sessionDir,
      exportDir: this.exportDir,
      cdpPort: this.cdpPort,
      captureLimits: this.captureLimits,
      engine: this.engineInfo,
      logPaths: {
        supervisor: this.supervisorLogPath,
        protocol: this.protocolLogPath,
        rendererConsole: this.consoleLogPath,
        anomalies: this.anomalyLogPath,
      },
    };
  }

  async appendProtocolEntry(entry: unknown): Promise<void> {
    await appendJsonLine(this.protocolLogPath, entry);
  }

  async appendConsoleEntry(entry: unknown): Promise<void> {
    await appendJsonLine(this.consoleLogPath, entry);
  }

  async appendAnomaly(entry: unknown): Promise<void> {
    await appendJsonLine(this.anomalyLogPath, entry);
  }

  async exportBundle(
    request: DebugBundleRequest,
    window: BrowserWindow | null,
  ): Promise<DebugBundleResult> {
    const bundleDir = path.join(this.exportDir, `bundle-${timestampForPath()}`);
    await fsPromises.mkdir(bundleDir, { recursive: true });

    await fsPromises.writeFile(
      path.join(bundleDir, 'snapshot.json'),
      JSON.stringify(request.snapshot, null, 2),
      'utf8',
    );
    await fsPromises.writeFile(
      path.join(bundleDir, 'session-info.json'),
      JSON.stringify(this.getSessionInfo(), null, 2),
      'utf8',
    );
    if (request.reason) {
      await fsPromises.writeFile(path.join(bundleDir, 'reason.txt'), `${request.reason}\n`, 'utf8');
    }

    await copyIfExists(this.supervisorLogPath, path.join(bundleDir, 'supervisor.log'));
    await copyIfExists(this.protocolLogPath, path.join(bundleDir, 'protocol.ndjson'));
    await copyIfExists(this.consoleLogPath, path.join(bundleDir, 'renderer-console.ndjson'));
    await copyIfExists(this.anomalyLogPath, path.join(bundleDir, 'anomalies.ndjson'));

    const projectFilePath = request.snapshot.project?.projectFilePath;
    if (projectFilePath) {
      const projectCopyPath = path.join(bundleDir, path.basename(projectFilePath));
      await copyIfExists(projectFilePath, projectCopyPath);
    }

    if (window) {
      try {
        const image = await window.capturePage();
        await fsPromises.writeFile(path.join(bundleDir, 'window.png'), image.toPNG());
      } catch {
        // Screenshot capture is best effort.
      }
    }

    return {
      bundlePath: bundleDir,
      sessionId: this.sessionId,
    };
  }

  private async writeManifest(): Promise<void> {
    await fsPromises.mkdir(this.sessionDir, { recursive: true });
    await fsPromises.writeFile(
      this.manifestPath,
      JSON.stringify(this.getSessionInfo(), null, 2),
      'utf8',
    );
  }
}

export function isDebugModeEnabled(): boolean {
  return process.env.MOTIONLAB_DEBUG_AGENT === '1';
}

export function resolveDebugCdpPort(): number | null {
  const raw = process.env.MOTIONLAB_DEBUG_CDP_PORT;
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}
