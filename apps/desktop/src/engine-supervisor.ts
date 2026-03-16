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

const READY_TIMEOUT_MS = 10_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;

export class EngineSupervisor {
  private child: ChildProcess | null = null;
  private shuttingDown = false;
  private crashListeners: CrashCallback[] = [];

  resolveEnginePath(): { command: string; args: string[] } {
    if (app.isPackaged) {
      const ext = process.platform === 'win32' ? '.exe' : '';
      const binPath = path.join(process.resourcesPath, `motionlab-engine${ext}`);
      return { command: binPath, args: [] };
    }

    // Dev mode: look for native binary first
    const repoRoot = path.resolve(app.getAppPath(), '..', '..');
    const ext = process.platform === 'win32' ? '.exe' : '';
    const devBin = path.join(
      repoRoot,
      'native',
      'engine',
      'build',
      'dev',
      `motionlab-engine${ext}`,
    );

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
    console.log('[SUPERVISOR] Resolving engine path...');
    const { command, args: baseArgs } = this.resolveEnginePath();

    const sessionToken = crypto.randomBytes(16).toString('hex');
    const port = await this.findFreePort();

    const args = [...baseArgs, '--port', String(port), '--session-token', sessionToken];

    console.log(`[SUPERVISOR] Spawning engine on port ${port}`);
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;

    console.log(`[SUPERVISOR] Engine PID: ${child.pid}`);

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      if (text) console.error(`[ENGINE stderr] ${text}`);
    });

    return new Promise<EngineEndpoint>((resolve, reject) => {
      let settled = false;
      let stdoutBuf = '';

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('[SUPERVISOR] Engine did not become ready within 10s'));
          this.shutdown();
        }
      }, READY_TIMEOUT_MS);

      child.stdout?.on('data', (data: Buffer) => {
        stdoutBuf += data.toString();
        const lines = stdoutBuf.split('\n');
        stdoutBuf = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) console.log(`[ENGINE] ${trimmed}`);
          if (trimmed.includes('[ENGINE] status=ready') && !settled) {
            settled = true;
            clearTimeout(timeout);
            console.log('[SUPERVISOR] Engine ready');
            this.setupCrashHandler(child);
            resolve({ host: '127.0.0.1', port, sessionToken });
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
      console.log(`[SUPERVISOR] Engine exited (code: ${code}, signal: ${signal})`);
      this.child = null;

      if (!this.shuttingDown) {
        const info = { status: 'crashed', code, signal };
        for (const cb of this.crashListeners) {
          try {
            cb(info);
          } catch (e) {
            console.error('[SUPERVISOR] Crash listener error:', e);
          }
        }
      }
    });
  }

  onCrash(callback: CrashCallback): void {
    this.crashListeners.push(callback);
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown || !this.child) return;
    this.shuttingDown = true;

    const child = this.child;
    console.log('[SUPERVISOR] Shutting down engine...');

    return new Promise<void>((resolve) => {
      const forceKillTimeout = setTimeout(() => {
        console.log('[SUPERVISOR] Force-killing engine');
        child.kill('SIGKILL');
      }, SHUTDOWN_TIMEOUT_MS);

      child.on('exit', () => {
        clearTimeout(forceKillTimeout);
        this.child = null;
        this.shuttingDown = false;
        console.log('[SUPERVISOR] Engine shutdown complete');
        resolve();
      });

      child.kill();
    });
  }
}
