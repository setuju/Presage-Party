import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import { readFileSync, stat, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';

const FIXTURES_DIR = join(__dirname, '..', '..', 'fixtures');
const TIMELINE_PATH = join(FIXTURES_DIR, 'face30.metrics.json');
const VIDEO_URL = 'presage://local/face30.mp4';

protocol.registerSchemesAsPrivileged([
  { scheme: 'presage', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function readTimeline(): unknown {
  try { return JSON.parse(readFileSync(TIMELINE_PATH, 'utf8')); } 
  catch (err) { return { error: (err as Error).message, path: TIMELINE_PATH }; }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100, height: 750, backgroundColor: '#0b0b0b',
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  void win.loadFile(join(__dirname, '..', '..', 'src', 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  // Robust video streaming with HTTP 206 Partial Content (Range Requests)
  protocol.handle('presage', async (request) => {
    const url = new URL(request.url);
    const filename = url.pathname.replace(/^\/+/, '');
    const filePath = join(FIXTURES_DIR, filename);

    try {
      const fileStat = await new Promise<any>((resolve, reject) => {
        stat(filePath, (err, stats) => err ? reject(err) : resolve(stats));
      });
      const range = request.headers.get('Range');
      
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileStat.size - 1;
        const chunksize = (end - start) + 1;
        const stream = createReadStream(filePath, { start, end });
        
        return new Response(Readable.toWeb(stream) as any, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileStat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize.toString(),
            'Content-Type': filename.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream',
          }
        });
      } else {
        const stream = createReadStream(filePath);
        return new Response(Readable.toWeb(stream) as any, {
          status: 200,
          headers: {
            'Content-Length': fileStat.size.toString(),
            'Content-Type': filename.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream',
          }
        });
      }
    } catch (err) {
      return new Response('Not found', { status: 404 });
    }
  });

  ipcMain.handle('get-timeline', () => readTimeline());
  ipcMain.handle('get-video-url', () => VIDEO_URL);

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
