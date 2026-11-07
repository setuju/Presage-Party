import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const FIXTURES_DIR = join(__dirname, '..', '..', 'fixtures');
const TIMELINE_PATH = join(FIXTURES_DIR, 'face30.metrics.json');
const VIDEO_URL = 'presage://local/face30.mp4';

// Must be called BEFORE app.whenReady().
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'presage',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

function readTimeline(): unknown {
  try {
    return JSON.parse(readFileSync(TIMELINE_PATH, 'utf8'));
  } catch (err) {
    return { error: (err as Error).message, path: TIMELINE_PATH };
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    backgroundColor: '#0b0b0b',
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
  // Serve files from fixtures/ via presage://local/<filename>
  protocol.handle('presage', (request) => {
    const url = new URL(request.url);
    const filename = url.pathname.replace(/^\/+/, '');
    const filePath = join(FIXTURES_DIR, filename);
    return net.fetch(pathToFileURL(filePath).toString());
  });

  ipcMain.handle('get-timeline', () => readTimeline());
  ipcMain.handle('get-video-url', () => VIDEO_URL);

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
