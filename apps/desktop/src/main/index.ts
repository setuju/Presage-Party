import { app, BrowserWindow, ipcMain, protocol } from 'electron';
import { readFileSync, stat, createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';

const FIXTURES_DIR = join(__dirname, '..', '..', 'fixtures');
const TIMELINE_PATH = join(FIXTURES_DIR, 'face30.metrics.json');
const VIDEO_URL = 'presage://local/face30.mp4';

// Opsional: Nonaktifkan hardware acceleration jika video masih stutter.
// app.disableHardwareAcceleration();

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
        
        // Konversi eksplisit Node.js ReadStream ke Web ReadableStream
        const webStream = Readable.toWeb(stream) as any;
        
        return new Response(webStream, {
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
        const webStream = Readable.toWeb(stream) as any;
        return new Response(webStream, {
          status: 200,
          headers: {
            'Content-Length': fileStat.size.toString(),
            'Content-Type': filename.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream',
            'Accept-Ranges': 'bytes',
          }
        });
      }
    } catch (err) {
      return new Response('Not found', { status: 404 });
    }
  });

  ipcMain.handle('get-timeline', () => readTimeline());
  ipcMain.handle('get-video-url', () => VIDEO_URL);
  ipcMain.handle('check-assets', () => {
    const distDir = join(FIXTURES_DIR, 'distractions');
    console.log('[check-assets] Looking for videos in:', distDir);
    
    let missing = 0;
    const found = [];
    for (let i = 1; i <= 8; i++) {
      const filePath = join(distDir, `distraction_${i}.mp4`);
      if (existsSync(filePath)) {
        found.push(filePath);
      } else {
        missing++;
        console.warn('[check-assets] Missing:', filePath);
      }
    }
    console.log(`[check-assets] Found ${8 - missing}/8 videos. Ready: ${missing === 0}`);
    return { ready: missing === 0, missing, dir: distDir, found };
  });

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
