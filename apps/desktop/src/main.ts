import fs from 'node:fs/promises';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
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

function broadcastToRenderers(channel: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, data);
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

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'bottom' });
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
    return await supervisor.start();
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

app.whenReady().then(() => {
  let engineReady: Promise<EngineEndpoint | null> = startEngineWithRetry();

  ipcMain.handle('get-engine-endpoint', () => engineReady);

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
    return { data: new Uint8Array(buffer), filePath };
  });

  // Broadcast crash/restart status to all renderer windows
  supervisor.onCrash((info) => {
    broadcastToRenderers('engine-status-changed', info);

    // On fatal (max restarts exhausted), show error dialog
    if (info.status === 'fatal') {
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
    broadcastToRenderers('engine-status-changed', {
      status: 'restarted',
      host: endpoint.host,
      port: endpoint.port,
      sessionToken: endpoint.sessionToken,
    });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', async (e) => {
  if (quitting) return;
  quitting = true;
  e.preventDefault();

  // Notify renderers so they can close WebSocket connections
  broadcastToRenderers('engine-status-changed', { status: 'shutting_down' });

  // Give renderers time to close connections
  await new Promise((resolve) => setTimeout(resolve, 500));

  await supervisor.shutdown();
  app.quit();
});

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    await supervisor.shutdown();
    app.quit();
  }
});
