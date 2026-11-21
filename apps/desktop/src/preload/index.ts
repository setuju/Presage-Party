import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('presage', {
  getTimeline: (): Promise<unknown> => ipcRenderer.invoke('get-timeline'),
  getVideoUrl: (): Promise<string> => ipcRenderer.invoke('get-video-url'),
  checkAssets: (): Promise<{ ready: boolean; missing: number; dir: string; found: string[] }> =>
    ipcRenderer.invoke('check-assets'),
});
