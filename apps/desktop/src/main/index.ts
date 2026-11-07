import { app, BrowserWindow, ipcMain } from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TIMELINE_PATH = join(__dirname, '..', '..', 'fixtures', 'face30.metrics.json');

function readTimeline(): unknown {
  try {
    return JSON.parse(readFileSync(TIMELINE_PATH, 'utf8'));
  } catch (err) {
    return { error: (err as Error).message, path: TIMELINE_PATH };
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    backgroundColor: '#111111',
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  void win.loadFile(join(__dirname, '..', '..', 'src', 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  ipcMain.handle('get-timeline', () => readTimeline());
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
