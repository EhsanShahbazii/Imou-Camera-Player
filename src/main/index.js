const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const MediaServer = require('./server');
const { scanDirectory } = require('./scanner');

// Enable hardware decoding & HEVC acceleration
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');
app.commandLine.appendSwitch('enable-accelerated-video-decode');

let mainWindow = null;
let mediaServer = null;

async function createWindow() {
  mediaServer = new MediaServer();
  await mediaServer.start();

  mainWindow = new BrowserWindow({
    width: 1340,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    title: 'CCTV Viewer',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 16 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#1c1c1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (mediaServer) mediaServer.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers
ipcMain.handle('get-server-port', () => {
  return mediaServer ? mediaServer.port : 0;
});

ipcMain.handle('get-default-folder', () => {
  const defaultPath = path.resolve(__dirname, '../../files');
  return fs.existsSync(defaultPath) ? defaultPath : app.getPath('videos');
});

ipcMain.handle('scan-folder', async (event, folderPath) => {
  try {
    return scanDirectory(folderPath);
  } catch (err) {
    console.error('[Main] Scan error:', err);
    throw err;
  }
});

ipcMain.handle('select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Camera Footage Folder'
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('export-video', async (event, filePath) => {
  if (!mainWindow || !filePath) return { success: false, error: 'Invalid parameters' };

  const parsed = path.parse(filePath);
  const defaultName = `${parsed.name}.mp4`;

  const saveDialogResult = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Video as MP4',
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
  });

  if (saveDialogResult.canceled || !saveDialogResult.filePath) {
    return { success: false, canceled: true };
  }

  const destPath = saveDialogResult.filePath;

  return new Promise((resolve) => {
    // Fast copy remux
    const proc = spawn('ffmpeg', [
      '-hide_banner', '-y',
      '-i', filePath,
      '-c', 'copy',
      '-tag:v', 'hvc1',
      '-movflags', '+faststart',
      destPath
    ]);

    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0 && fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
        resolve({ success: true, destPath });
      } else {
        // Fallback to h264 transcode if direct copy fails
        const procFallback = spawn('ffmpeg', [
          '-hide_banner', '-y',
          '-i', filePath,
          '-c:v', 'h264_videotoolbox',
          '-b:v', '2500k',
          '-c:a', 'aac',
          '-movflags', '+faststart',
          destPath
        ]);
        procFallback.on('close', code2 => {
          if (code2 === 0) {
            resolve({ success: true, destPath });
          } else {
            resolve({ success: false, error: 'FFmpeg export failed' });
          }
        });
      }
    });
    proc.on('error', err => resolve({ success: false, error: err.message }));
  });
});

ipcMain.handle('save-snapshot', async (event, { dataUrl, defaultName }) => {
  if (!mainWindow || !dataUrl) return { success: false, error: 'Invalid parameters' };

  const saveDialogResult = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Snapshot',
    defaultPath: path.join(app.getPath('pictures'), defaultName || 'snapshot.jpg'),
    filters: [{ name: 'JPEG Image', extensions: ['jpg'] }]
  });

  if (saveDialogResult.canceled || !saveDialogResult.filePath) {
    return { success: false, canceled: true };
  }

  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  try {
    fs.writeFileSync(saveDialogResult.filePath, buffer);
    return { success: true, destPath: saveDialogResult.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('reveal-in-finder', async (event, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return true;
  }
  return false;
});
