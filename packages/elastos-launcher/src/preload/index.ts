import { contextBridge, ipcRenderer } from 'electron';

export type PC2Status = 'running' | 'stopped' | 'starting' | 'stopping' | 'error' | 'not-installed';

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('pc2', {
  // Commands
  start: () => ipcRenderer.invoke('pc2:start'),
  stop: () => ipcRenderer.invoke('pc2:stop'),
  restart: () => ipcRenderer.invoke('pc2:restart'),
  openBrowser: () => ipcRenderer.invoke('pc2:openBrowser'),
  install: () => ipcRenderer.invoke('pc2:install'),
  
  // Queries
  getStatus: () => ipcRenderer.invoke('pc2:getStatus'),
  getLogs: (lines: number) => ipcRenderer.invoke('pc2:getLogs', lines),
  isInstalled: () => ipcRenderer.invoke('pc2:isInstalled'),
  
  // Event listeners
  onStatus: (callback: (status: PC2Status) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: PC2Status) => callback(status);
    ipcRenderer.on('pc2:status', listener);
    return () => ipcRenderer.removeListener('pc2:status', listener);
  },
  
  onLog: (callback: (log: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, log: string) => callback(log);
    ipcRenderer.on('pc2:log', listener);
    return () => ipcRenderer.removeListener('pc2:log', listener);
  },
  
  onInstallProgress: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on('pc2:installProgress', listener);
    return () => ipcRenderer.removeListener('pc2:installProgress', listener);
  }
});

// Type declaration for renderer
declare global {
  interface Window {
    pc2: {
      start: () => Promise<void>;
      stop: () => Promise<void>;
      restart: () => Promise<void>;
      openBrowser: () => void;
      install: () => Promise<void>;
      getStatus: () => Promise<PC2Status>;
      getLogs: (lines: number) => Promise<string>;
      isInstalled: () => Promise<boolean>;
      onStatus: (callback: (status: PC2Status) => void) => () => void;
      onLog: (callback: (log: string) => void) => () => void;
      onInstallProgress: (callback: (message: string) => void) => () => void;
    };
  }
}
