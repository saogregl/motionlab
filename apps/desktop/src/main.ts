import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import {
  DebugSession,
  isDebugModeEnabled,
  resolveDebugCdpPort,
  type DebugBundleRequest,
} from './debug-session';
import { type EngineEndpoint, EngineSupervisor } from './engine-supervisor';

// TypeScript declarations for Forge Vite plugin globals
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

/**
 * MotionLab Electron main process.
 *
 * Responsibilities:
 * - Window lifecycle management
 * - Native engine process supervision
 * - Desktop integrations (file dialogs, menus)
 *
 * NOT responsible for:
 * - Relaying simulation data (renderer connects directly to engine)
 * - Hot-path frame transport
 */

const supervisor = new EngineSupervisor();
let quitting = false;
let debugSession: DebugSession | null = null;

// ---------------------------------------------------------------------------
// Recent projects persistence (Epic 20.1)
// ---------------------------------------------------------------------------

interface RecentProject {
  name: string;
  filePath: string;
  lastOpened: string;
}

const MAX_RECENT = 10;

function recentProjectsPath(): string {
  return path.join(app.getPath('userData'), 'recent-projects.json');
}

async function readRecentProjects(): Promise<RecentProject[]> {
  try {
    const raw = await fs.readFile(recentProjectsPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.recentProjects) ? parsed.recentProjects : [];
  } catch {
    return [];
  }
}

async function writeRecentProjects(list: RecentProject[]): Promise<void> {
  await fs.writeFile(recentProjectsPath(), JSON.stringify({ recentProjects: list }, null, 2));
}

async function addRecentProject(project: { name: string; filePath: string }): Promise<void> {
  const list = await readRecentProjects();
  const filtered = list.filter((p) => p.filePath !== project.filePath);
  filtered.unshift({
    name: project.name,
    filePath: project.filePath,
    lastOpened: new Date().toISOString(),
  });
  await writeRecentProjects(filtered.slice(0, MAX_RECENT));
}

// ---------------------------------------------------------------------------
// Auto-save persistence (Epic 20.2)
// ---------------------------------------------------------------------------

const AUTO_SAVE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
let autoSaveTimer: ReturnType<typeof setInterval> | null = null;
let currentProjectPath: string | null = null;
let untitledAutoSaveId: string | null = null;

function autoSaveDir(): string {
  return path.join(app.getPath('userData'), 'autosave');
}

function getAutoSavePath(projectPath: string | null): string {
  if (projectPath) {
    return `${projectPath}.autosave`;
  }
  // For unsaved projects, use a stable ID per session
  if (!untitledAutoSaveId) {
    untitledAutoSaveId = `untitled-${Date.now()}`;
  }
  return path.join(autoSaveDir(), `${untitledAutoSaveId}.motionlab.autosave`);
}

async function deleteAutoSaveFile(projectPath: string | null): Promise<void> {
  try {
    await fs.unlink(getAutoSavePath(projectPath));
  } catch {
    /* ignore ENOENT */
  }
}

async function cleanAllAutoSaves(): Promise<void> {
  // Clean untitled autosaves
  try {
    const dir = autoSaveDir();
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      if (entry.endsWith('.autosave')) {
        try {
          await fs.unlink(path.join(dir, entry));
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore if dir doesn't exist */
  }
  // Clean project-sibling autosave
  if (currentProjectPath) {
    await deleteAutoSaveFile(currentProjectPath);
  }
}

interface RecoverableProject {
  name: string;
  originalPath: string | null;
  autoSavePath: string;
  modifiedAt: string;
}

async function scanForAutoSaves(): Promise<RecoverableProject[]> {
  const results: RecoverableProject[] = [];

  // Scan userData/autosave/ for untitled autosaves
  try {
    const dir = autoSaveDir();
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      if (!entry.endsWith('.autosave')) continue;
      const fullPath = path.join(dir, entry);
      try {
        const stat = await fs.stat(fullPath);
        const name = entry.replace('.motionlab.autosave', '').replace(/^untitled-\d+$/, 'Untitled');
        results.push({
          name,
          originalPath: null,
          autoSavePath: fullPath,
          modifiedAt: stat.mtime.toISOString(),
        });
      } catch {
        /* skip unreadable */
      }
    }
  } catch {
    /* dir may not exist */
  }

  // Check recent project paths for .autosave siblings
  const recent = await readRecentProjects();
  for (const project of recent) {
    const autoSavePath = `${project.filePath}.autosave`;
    try {
      const stat = await fs.stat(autoSavePath);
      results.push({
        name: project.name,
        originalPath: project.filePath,
        autoSavePath,
        modifiedAt: stat.mtime.toISOString(),
      });
    } catch {
      /* no autosave for this project */
    }
  }

  return results;
}

function startAutoSaveTimer(): void {
  stopAutoSaveTimer();
  autoSaveTimer = setInterval(() => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send('auto-save-tick');
  }, AUTO_SAVE_INTERVAL_MS);
}

function stopAutoSaveTimer(): void {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function broadcastToRenderers(channel: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, data);
  }
}

function broadcastDebugEvent(data: Record<string, unknown>): void {
  broadcastToRenderers('debug-event', data);
}

async function collectRendererDebugSnapshot(
  win: BrowserWindow | null,
): Promise<Record<string, unknown> | null> {
  if (!win || win.isDestroyed()) return null;
  try {
    return await win.webContents.executeJavaScript(
      'window.motionlabDebug?.getSnapshot ? window.motionlabDebug.getSnapshot() : null',
      true,
    );
  } catch {
    return null;
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 800,
    minHeight: 600,
    title: 'MotionLab',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Notify renderer when maximized state changes (snap, double-click, etc.)
  win.on('maximize', () => win.webContents.send('window-maximized-changed', true));
  win.on('unmaximize', () => win.webContents.send('window-maximized-changed', false));
  win.webContents.on('render-process-gone', (_event, details) => {
    broadcastDebugEvent({
      type: 'renderer-process-gone',
      reason: details.reason,
      exitCode: details.exitCode,
    });
    void debugSession?.appendAnomaly({
      timestamp: new Date().toISOString(),
      severity: 'error',
      code: 'renderer-process-gone',
      message: 'Renderer process exited unexpectedly',
      details: {
        reason: details.reason,
        exitCode: details.exitCode,
      },
    });
  });

  // Send pending file-open request after the renderer is ready (Epic 20.2)
  win.webContents.on('did-finish-load', () => {
    if (pendingOpenFile) {
      win.webContents.send('open-file-request', pendingOpenFile);
      pendingOpenFile = null;
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  return win;
}

async function showEngineErrorDialog(message: string): Promise<'retry' | 'quit'> {
  const result = await dialog.showMessageBox({
    type: 'error',
    title: 'Engine Error',
    message: 'MotionLab Engine Failed',
    detail: message,
    buttons: ['Retry', 'Quit'],
    defaultId: 0,
    cancelId: 1,
  });
  return result.response === 0 ? 'retry' : 'quit';
}

async function startEngineWithRetry(): Promise<EngineEndpoint | null> {
  try {
    const endpoint = await supervisor.start();
    debugSession?.setSupervisorLogPath(supervisor.getLogPath());
    debugSession?.updateEngineInfo({
      pid: supervisor.getChildPid(),
      host: endpoint.host,
      port: endpoint.port,
    });
    return endpoint;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[MAIN]', errMsg);

    const choice = await showEngineErrorDialog(
      `The simulation engine failed to start.\n\n${errMsg}`,
    );
    if (choice === 'retry') {
      return startEngineWithRetry();
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// File associations & single instance (Epic 20.2)
// ---------------------------------------------------------------------------

let pendingOpenFile: string | null = null;

// macOS: handle open-file before app is ready
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('open-file-request', filePath);
  } else {
    pendingOpenFile = filePath;
  }
});

// Single instance lock — reuse existing window when double-clicking a .motionlab file
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const file = argv.find((a) => a.endsWith('.motionlab') && !a.startsWith('-'));
    if (file) {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.webContents.send('open-file-request', path.resolve(file));
        if (win.isMinimized()) win.restore();
        win.focus();
      }
    }
  });
}

// Check command-line args for a .motionlab file
const fileArg = process.argv.find((a) => a.endsWith('.motionlab') && !a.startsWith('-'));
if (fileArg) {
  pendingOpenFile = path.resolve(fileArg);
}

app.whenReady().then(async () => {
  if (isDebugModeEnabled()) {
    const cdpPort = resolveDebugCdpPort();
    debugSession = new DebugSession(app.getPath('userData'), cdpPort);
    await debugSession.initialize();
    supervisor.setLogDir(debugSession.getLogDir());
  }

  let engineReady: Promise<EngineEndpoint | null> = startEngineWithRetry();

  ipcMain.handle('get-engine-endpoint', () => engineReady);
  ipcMain.handle('get-debug-session-info', () => debugSession?.getSessionInfo() ?? null);
  ipcMain.handle('export-debug-bundle', async (_event, request: DebugBundleRequest) => {
    if (!debugSession) {
      throw new Error('Debug session is not enabled');
    }
    const result = await debugSession.exportBundle(request, BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null);
    broadcastDebugEvent({
      type: 'bundle-exported',
      bundlePath: result.bundlePath,
      reason: request?.reason ?? null,
    });
    return result;
  });
  ipcMain.on('append-debug-protocol-entry', (_event, entry) => {
    void debugSession?.appendProtocolEntry(entry);
  });
  ipcMain.on('append-debug-console-entry', (_event, entry) => {
    void debugSession?.appendConsoleEntry(entry);
  });
  ipcMain.on('append-debug-anomaly', (_event, entry) => {
    void debugSession?.appendAnomaly(entry);
  });

  // Window control IPC
  ipcMain.on('window-minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.on('window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('window-close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle('window-is-maximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });

  ipcMain.handle(
    'show-open-dialog',
    async (_event, options?: { filters?: Array<{ name: string; extensions: string[] }> }) => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return null;
      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: options?.filters ?? [
          { name: 'CAD Files', extensions: ['step', 'stp', 'iges', 'igs'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
  );

  // Project file persistence (Epic 6.4)
  ipcMain.handle('save-project-file', async (_event, data: Uint8Array, defaultName?: string) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { saved: false };
    const result = await dialog.showSaveDialog(win, {
      defaultPath: defaultName ? `${defaultName}.motionlab` : 'Untitled.motionlab',
      filters: [{ name: 'MotionLab Project', extensions: ['motionlab'] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    await fs.writeFile(result.filePath, Buffer.from(data));
    const projectName = defaultName ?? path.basename(result.filePath, '.motionlab');
    await addRecentProject({ name: projectName, filePath: result.filePath });
    currentProjectPath = result.filePath;
    untitledAutoSaveId = null; // Reset untitled ID after Save As
    return { saved: true, filePath: result.filePath };
  });

  ipcMain.handle('open-project-file', async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [
        { name: 'MotionLab Project', extensions: ['motionlab'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    const buffer = await fs.readFile(filePath);
    const projectName = path.basename(filePath, '.motionlab');
    await addRecentProject({ name: projectName, filePath });
    currentProjectPath = filePath;
    untitledAutoSaveId = null;
    return { data: new Uint8Array(buffer), filePath };
  });

  // Show logs folder (Epic 9.2)
  ipcMain.handle('show-logs-folder', async () => {
    const logDir = path.join(app.getPath('userData'), 'logs');
    await shell.openPath(logDir);
  });

  // Save project to existing path without dialog (Epic 20.1)
  ipcMain.handle('save-project-to-path', async (_event, data: Uint8Array, filePath: string) => {
    await fs.writeFile(filePath, Buffer.from(data));
    currentProjectPath = filePath;
    return { saved: true, filePath };
  });

  // Window title sync (Epic 20.1)
  ipcMain.on('set-window-title', (event, title: string) => {
    BrowserWindow.fromWebContents(event.sender)?.setTitle(title);
  });

  // Recent projects (Epic 20.1)
  ipcMain.handle('get-recent-projects', () => readRecentProjects());
  ipcMain.handle('add-recent-project', async (_event, project: { name: string; filePath: string }) => {
    await addRecentProject(project);
  });
  ipcMain.handle('remove-recent-project', async (_event, filePath: string) => {
    const list = await readRecentProjects();
    await writeRecentProjects(list.filter((p) => p.filePath !== filePath));
  });

  // Auto-save IPC (Epic 20.2)
  ipcMain.handle('auto-save-write', async (_event, data: Uint8Array, projectPath: string | null) => {
    const savePath = getAutoSavePath(projectPath);
    await fs.mkdir(path.dirname(savePath), { recursive: true });
    await fs.writeFile(savePath, Buffer.from(data));
    return { saved: true, path: savePath };
  });

  ipcMain.handle('auto-save-cleanup', async (_event, projectPath: string | null) => {
    await deleteAutoSaveFile(projectPath);
  });

  // Crash recovery IPC (Epic 20.2)
  ipcMain.handle('check-autosave-recovery', () => scanForAutoSaves());

  ipcMain.handle('read-autosave', async (_event, autoSavePath: string) => {
    const buffer = await fs.readFile(autoSavePath);
    return new Uint8Array(buffer);
  });

  ipcMain.handle('discard-autosave', async (_event, autoSavePath: string) => {
    try {
      await fs.unlink(autoSavePath);
    } catch {
      /* ignore */
    }
  });

  // Read project file by path without dialog (Epic 20.2)
  ipcMain.handle('read-file-by-path', async (_event, filePath: string) => {
    try {
      const buffer = await fs.readFile(filePath);
      const projectName = path.basename(filePath, '.motionlab');
      await addRecentProject({ name: projectName, filePath });
      return { data: new Uint8Array(buffer), filePath, projectName };
    } catch {
      return null;
    }
  });

  // Templates (Epic 20.3)
  function resolveTemplatesDir(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'templates');
    }
    let repoRoot = path.resolve(app.getAppPath());
    for (let i = 0; i < 6; i++) {
      if (existsSync(path.join(repoRoot, 'pnpm-workspace.yaml'))) break;
      repoRoot = path.dirname(repoRoot);
    }
    return path.join(repoRoot, 'apps', 'desktop', 'resources', 'templates');
  }

  ipcMain.handle('get-templates', async () => {
    try {
      const templatesDir = resolveTemplatesDir();
      const manifestPath = path.join(templatesDir, 'manifest.json');
      const raw = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw);
      return Array.isArray(manifest?.templates) ? manifest.templates : [];
    } catch {
      return [];
    }
  });

  ipcMain.handle('open-template', async (_event, templateFilename: string) => {
    const templatesDir = resolveTemplatesDir();
    const safeName = path.basename(templateFilename);
    const filePath = path.join(templatesDir, safeName);
    const buffer = await fs.readFile(filePath);
    return new Uint8Array(buffer);
  });

  // Broadcast crash/restart status to all renderer windows
  supervisor.onCrash((info) => {
    broadcastToRenderers('engine-status-changed', info);
    broadcastDebugEvent({ type: 'engine-crash', ...info });
    if (debugSession) {
      void debugSession.appendAnomaly({
        timestamp: new Date().toISOString(),
        severity: info.status === 'fatal' ? 'error' : 'warning',
        code: info.status === 'fatal' ? 'engine-fatal' : 'engine-restarting',
        message: 'Engine supervisor observed a crash event',
        details: info,
      });
    }

    // On fatal (max restarts exhausted), show error dialog
    if (info.status === 'fatal') {
      const win = BrowserWindow.getAllWindows()[0] ?? null;
      const session = debugSession;
      if (session) {
        void collectRendererDebugSnapshot(win).then((snapshot) => {
          if (!snapshot) return;
          return session.exportBundle(
            {
              reason: 'engine-fatal',
              snapshot,
            },
            win,
          );
        }).then((result) => {
          if (!result) return;
          broadcastDebugEvent({
            type: 'bundle-exported',
            bundlePath: result.bundlePath,
            reason: 'engine-fatal',
          });
        }).catch(() => {});
      }
      dialog
        .showMessageBox({
          type: 'error',
          title: 'Engine Error',
          message: 'MotionLab Engine Has Stopped',
          detail:
            'The simulation engine crashed repeatedly and could not be restarted. The application will now quit.',
          buttons: ['Quit'],
          defaultId: 0,
        })
        .then(() => {
          app.quit();
        });
    }
  });

  // On successful auto-restart, update cached endpoint and notify renderers
  supervisor.onRestart((endpoint) => {
    engineReady = Promise.resolve(endpoint);
    debugSession?.setSupervisorLogPath(supervisor.getLogPath());
    debugSession?.updateEngineInfo({
      pid: supervisor.getChildPid(),
      host: endpoint.host,
      port: endpoint.port,
    });
    broadcastToRenderers('engine-status-changed', {
      status: 'restarted',
      host: endpoint.host,
      port: endpoint.port,
      sessionToken: endpoint.sessionToken,
    });
    broadcastDebugEvent({
      type: 'engine-restarted',
      host: endpoint.host,
      port: endpoint.port,
    });
  });

  // Ensure autosave directory exists (Epic 20.2)
  fs.mkdir(autoSaveDir(), { recursive: true }).catch(() => {});

  createWindow();
  startAutoSaveTimer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', async (e) => {
  if (quitting) return;
  e.preventDefault();

  // Check if the renderer has unsaved changes
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const dirtyCheck = new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 2000);
      ipcMain.once('check-dirty-response', (_event, isDirty: boolean) => {
        clearTimeout(timeout);
        resolve(isDirty);
      });
      win.webContents.send('check-dirty');
    });

    const isDirty = await dirtyCheck;
    if (isDirty) {
      const result = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Save', "Don't Save", 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        title: 'Unsaved Changes',
        message: 'Do you want to save changes to your project?',
      });
      if (result.response === 2) {
        // Cancel — abort quit
        return;
      }
      // response 0 = Save: the user should save via the UI before quit.
      // For MVP, we proceed with quit (auto-save would require round-tripping
      // through the engine which is complex). The user sees the dialog and can
      // cancel to save manually.
    }
  }

  quitting = true;

  // Clean up auto-save on clean exit (Epic 20.2)
  stopAutoSaveTimer();
  await cleanAllAutoSaves();

  // Notify renderers so they can close WebSocket connections
  broadcastToRenderers('engine-status-changed', { status: 'shutting_down' });

  // Give renderers time to close connections
  await new Promise((resolve) => setTimeout(resolve, 500));

  await supervisor.shutdown();
  app.quit();
});

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    stopAutoSaveTimer();
    await cleanAllAutoSaves();
    await supervisor.shutdown();
    app.quit();
  }
});
