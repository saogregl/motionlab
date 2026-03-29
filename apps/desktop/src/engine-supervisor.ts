import { type ChildProcess, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { app } from 'electron';

export interface EngineEndpoint {
  host: string;
  port: number;
  sessionToken: string;
}

type CrashCallback = (info: { status: string; code: number | null; signal: string | null }) => void;
type RestartCallback = (endpoint: EngineEndpoint) => void;

const READY_TIMEOUT_MS = 10_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;
const MAX_RESTARTS = 3;

const LOG_MAX_AGE_DAYS = 7;

export class EngineSupervisor {
  private child: ChildProcess | null = null;
  private shuttingDown = false;
  private crashListeners: CrashCallback[] = [];
  private restartListeners: RestartCallback[] = [];
  private restartCount = 0;
  private logStream: fs.WriteStream | null = null;
  private logDir: string = '';
  private logPath: string | null = null;
  private externalLogDir: string | null = null;

  /** Get the log directory path (for IPC exposure). */
  getLogDir(): string {
    return this.logDir;
  }

  getLogPath(): string | null {
    return this.logPath;
  }

  getChildPid(): number | null {
    return this.child?.pid ?? null;
  }

  setLogDir(logDir: string | null): void {
    this.externalLogDir = logDir;
  }

  private initLogFile(): void {
    this.logDir = this.externalLogDir ?? path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(this.logDir, { recursive: true });

    // Rotate: delete logs older than LOG_MAX_AGE_DAYS
    try {
      const cutoff = Date.now() - LOG_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
      for (const entry of fs.readdirSync(this.logDir)) {
        const filePath = path.join(this.logDir, entry);
        try {
          const stat = fs.statSync(filePath);
          if (stat.isFile() && stat.mtimeMs < cutoff) {
            fs.unlinkSync(filePath);
          }
        } catch { /* ignore individual file errors */ }
      }
    } catch { /* ignore rotation errors */ }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logPath = path.join(this.logDir, `motionlab-${timestamp}.log`);
    this.logStream = fs.createWriteStream(this.logPath, { flags: 'a' });
    this.supervisorLog('Session started');
  }

  private supervisorLog(msg: string): void {
    const ts = new Date().toISOString();
    const line = `[SUPERVISOR ${ts}] ${msg}\n`;
    this.logStream?.write(line);
    console.log(`[SUPERVISOR] ${msg}`);
  }
  resolveEnginePath(): { command: string; args: string[] } {
    if (app.isPackaged) {
      const ext = process.platform === 'win32' ? '.exe' : '';
      const binPath = path.join(process.resourcesPath, `motionlab-engine${ext}`);
      return { command: binPath, args: [] };
    }

    // Dev mode: walk up from app path to find repo root (contains pnpm-workspace.yaml)
    let repoRoot = path.resolve(app.getAppPath());
    for (let i = 0; i < 6; i++) {
      if (fs.existsSync(path.join(repoRoot, 'pnpm-workspace.yaml'))) break;
      repoRoot = path.dirname(repoRoot);
    }
    const ext = process.platform === 'win32' ? '.exe' : '';

    // Try common build directory names
    const buildDirs = ['dev', 'dev-linux', 'msvc-dev', 'Release', 'Debug'];
    let devBin = '';
    for (const dir of buildDirs) {
      const candidate = path.join(
        repoRoot,
        'native',
        'engine',
        'build',
        dir,
        `motionlab-engine${ext}`,
      );
      if (fs.existsSync(candidate)) {
        devBin = candidate;
        break;
      }
    }
    if (!devBin) {
      devBin = path.join(repoRoot, 'native', 'engine', 'build', 'dev', `motionlab-engine${ext}`);
    }

    try {
      fs.accessSync(devBin);
      return { command: devBin, args: [] };
    } catch {
      // Fallback to mock engine (lives in source, not in Vite output)
      const mockPath = path.join(repoRoot, 'apps', 'desktop', 'src', 'mock-engine.mjs');
      try {
        fs.accessSync(mockPath);
      } catch {
        throw new Error(
          `[SUPERVISOR] No engine binary or mock engine found. Expected mock at: ${mockPath}`,
        );
      }
      console.log('[SUPERVISOR] Using mock engine (no native binary found)');
      return { command: process.execPath, args: [mockPath] };
    }
  }

  async findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          const { port } = addr;
          server.close(() => resolve(port));
        } else {
          server.close(() => reject(new Error('Failed to get port')));
        }
      });
      server.on('error', reject);
    });
  }

  async start(): Promise<EngineEndpoint> {
    this.restartCount = 0;
    this.initLogFile();
    return this.spawnEngine();
  }

  private async spawnEngine(): Promise<EngineEndpoint> {
    this.supervisorLog('Resolving engine path...');
    const { command, args: baseArgs } = this.resolveEnginePath();

    const sessionToken = crypto.randomBytes(16).toString('hex');
    const port = await this.findFreePort();

    const args = [...baseArgs, '--port', String(port), '--session-token', sessionToken];

    const logLevel = process.env.MOTIONLAB_LOG_LEVEL;
    if (logLevel) {
      args.push('--log-level', logLevel);
    }

    this.supervisorLog(`Spawning engine on port ${port}`);
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;

    this.supervisorLog(`Engine PID: ${child.pid}`);

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        this.logStream?.write(`[ENGINE stderr] ${text}\n`);
        console.error(`[ENGINE stderr] ${text}`);
      }
    });

    return new Promise<EngineEndpoint>((resolve, reject) => {
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('[SUPERVISOR] Engine did not become ready within 10s'));
          this.shutdown();
        }
      }, READY_TIMEOUT_MS);

      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        const lines = text.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            this.logStream?.write(`[ENGINE stdout] ${trimmed}\n`);
            if (!settled) console.log(`[ENGINE] ${trimmed}`);
          }
          if (trimmed.includes('[ENGINE] status=ready') && !settled) {
            settled = true;
            clearTimeout(timeout);
            this.supervisorLog('Engine ready');
            this.setupCrashHandler(child);
            const endpoint = { host: '127.0.0.1', port, sessionToken };
            resolve(endpoint);
          }
        }
      });

      child.on('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(`[SUPERVISOR] Failed to spawn engine: ${err.message}`));
        }
      });

      child.on('exit', (code, signal) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(
            new Error(`[SUPERVISOR] Engine exited before ready (code: ${code}, signal: ${signal})`),
          );
        }
      });
    });
  }

  private setupCrashHandler(child: ChildProcess): void {
    child.on('exit', (code, signal) => {
      this.supervisorLog(`Engine exited (code: ${code}, signal: ${signal})`);
      this.child = null;

      if (!this.shuttingDown) {
        if (this.restartCount < MAX_RESTARTS) {
          this.restartCount++;
          const delay = 1000 * 2 ** (this.restartCount - 1);
          this.supervisorLog(
            `Auto-restarting engine (attempt ${this.restartCount}/${MAX_RESTARTS}) in ${delay}ms...`,
          );

          // Notify listeners about restart attempt
          const restartingInfo = {
            status: 'restarting',
            code,
            signal,
            attempt: this.restartCount,
            maxAttempts: MAX_RESTARTS,
          };
          for (const cb of this.crashListeners) {
            try {
              cb(restartingInfo);
            } catch (e) {
              console.error('[SUPERVISOR] Crash listener error:', e);
            }
          }

          setTimeout(() => {
            this.spawnEngine()
              .then((endpoint) => {
                console.log('[SUPERVISOR] Engine restarted successfully');
                for (const cb of this.restartListeners) {
                  try {
                    cb(endpoint);
                  } catch (e) {
                    console.error('[SUPERVISOR] Restart listener error:', e);
                  }
                }
              })
              .catch((err) => {
                console.error('[SUPERVISOR] Restart failed:', err.message);
                // Exhaust remaining attempts or notify fatal
                const fatalInfo = { status: 'fatal', code, signal };
                for (const cb of this.crashListeners) {
                  try {
                    cb(fatalInfo);
                  } catch (e) {
                    console.error('[SUPERVISOR] Crash listener error:', e);
                  }
                }
              });
          }, delay);
        } else {
          const info = { status: 'fatal', code, signal };
          for (const cb of this.crashListeners) {
            try {
              cb(info);
            } catch (e) {
              console.error('[SUPERVISOR] Crash listener error:', e);
            }
          }
        }
      }
    });
  }

  onCrash(callback: CrashCallback): void {
    this.crashListeners.push(callback);
  }

  onRestart(callback: RestartCallback): void {
    this.restartListeners.push(callback);
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown || !this.child) return;
    this.shuttingDown = true;

    const child = this.child;
    this.supervisorLog('Shutting down engine...');

    return new Promise<void>((resolve) => {
      const forceKillTimeout = setTimeout(() => {
        console.log('[SUPERVISOR] Force-killing engine');
        child.kill('SIGKILL');
      }, SHUTDOWN_TIMEOUT_MS);

      child.on('exit', () => {
        clearTimeout(forceKillTimeout);
        this.child = null;
        this.shuttingDown = false;
        this.supervisorLog('Engine shutdown complete');
        this.logStream?.end();
        resolve();
      });

      child.kill();
    });
  }
}
