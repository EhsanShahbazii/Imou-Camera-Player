const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  scanFolder: (folderPath) => ipcRenderer.invoke('scan-folder', folderPath),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  exportVideo: (filePath) => ipcRenderer.invoke('export-video', filePath),
  saveSnapshot: (dataUrl, defaultName) => ipcRenderer.invoke('save-snapshot', { dataUrl, defaultName }),
  revealInFinder: (filePath) => ipcRenderer.invoke('reveal-in-finder', filePath),
  getServerPort: () => ipcRenderer.invoke('get-server-port'),
  getDefaultFolder: () => ipcRenderer.invoke('get-default-folder')
});
