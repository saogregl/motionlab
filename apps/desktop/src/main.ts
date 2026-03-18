import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { EngineSupervisor } from './engine-supervisor';

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

app.whenReady().then(() => {
  const engineReady = supervisor.start().catch((err) => {
    console.error('[MAIN]', err.message ?? err);
    return null;
  });

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
      return result.canceled ? null : result.filePaths[0] ?? null;
    },
  );

  supervisor.onCrash((info) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('engine-status-changed', info);
    }
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
  await supervisor.shutdown();
  app.quit();
});

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    await supervisor.shutdown();
    app.quit();
  }
});
