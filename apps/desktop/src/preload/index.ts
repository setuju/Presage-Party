import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('presage', {
  getTimeline: (): Promise<unknown> => ipcRenderer.invoke('get-timeline'),
  getVideoUrl: (): Promise<string> => ipcRenderer.invoke('get-video-url'),
});
