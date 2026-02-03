import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } from 'electron';
import * as path from 'path';
import log from 'electron-log';
import * as pc2Manager from './pc2Manager';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let currentStatus: pc2Manager.PC2Status = 'stopped';

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 580,
    minWidth: 400,
    minHeight: 500,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0f0f1a',
    show: false,
    icon: path.join(__dirname, '../../resources/icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, '../../src/renderer/index.html'));

  mainWindow.once('ready-to-show', async () => {
    mainWindow?.show();
    
    // Check initial status
    currentStatus = await pc2Manager.getStatus();
    mainWindow?.webContents.send('pc2:status', currentStatus);
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray(): void {
  // Simple tray icon
  const iconPath = path.join(__dirname, '../../resources/icon.png');
  let icon: nativeImage;
  
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      // Fallback to a simple icon
      icon = nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAA7AAAAOwBeShxvQAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAH5SURBVFiF7Ze/axRBFMc/M7t3yUWjhYVYiI2NjQERbfwPrGxEOwsLsRAsLPwPbGwsxMbKQrCwEWzEQrDQRhALC8FCCYiIRuNdkuzujsXu3e7l7nKXM+D3wzDM8N7MZ+a9NzOQUXAIGAN2s+0CtXBkCfgD/AJ+ArPAT2ANWBdRFXgEZuUmcAEodshrA5yECcBTcBB4BZwGfOAZ8ETESv+X+i5wEbiY9H0Z2AmMA/uTvieqGuvpxfMYOJbSrqvOIEACMpAJSAJeAF5S9gM2U2OaAYmqhcAz8BpoBc+BzuuLdEiKZrLMSj0B7JIGFQK1wBM/xhp05QfsBKoNYC8wDzzvFyQJiCeJN8DFaJHXxXJV1tQ68IaYcLrpDyLoJ5APvCOLCRwNVCcJYy2wyQs7KiZlJuoB79oj/wBwtXNOtfYmGIrLWpLK+w5c60UYTANFJOsYcKRPCHPAAWASeMojwChWBxTpFrKu2vQC4BlwyUeFE0KxP0AqYT3JQE+B4SSwH6hnQAFYBO6JqPQKkQZYS5bXgccitP8N/oEKMCGi3C/IEPARuNcvRIb+yO4nngvMAe+Tzr5BkoBBYDfwot9qSOsUyxUNjQ8i6sMggmRoD7nHI/+wHTAGPBNR7hciCRj6LpjCxBpw00d5nyAZGgT2AEv/M/4vmHGRlTWP0ioAAAAASUVORK5CYII='
      );
    }
  } catch (e) {
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAA7AAAAOwBeShxvQAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAH5SURBVFiF7Ze/axRBFMc/M7t3yUWjhYVYiI2NjQERbfwPrGxEOwsLsRAsLPwPbGwsxMbKQrCwEWzEQrDQRhALC8FCCYiIRuNdkuzujsXu3e7l7nKXM+D3wzDM8N7MZ+a9NzOQUXAIGAN2s+0CtXBkCfgD/AJ+ArPAT2ANWBdRFXgEZuUmcAEodshrA5yECcBTcBB4BZwGfOAZ8ETESv+X+i5wEbiY9H0Z2AmMA/uTvieqGuvpxfMYOJbSrqvOIEACMpAJSAJeAF5S9gM2U2OaAYmqhcAz8BpoBc+BzuuLdEiKZrLMSj0B7JIGFQK1wBM/xhp05QfsBKoNYC8wDzzvFyQJiCeJN8DFaJHXxXJV1tQ68IaYcLrpDyLoJ5APvCOLCRwNVCcJYy2wyQs7KiZlJuoB79oj/wBwtXNOtfYmGIrLWpLK+w5c60UYTANFJOsYcKRPCHPAAWASeMojwChWBxTpFrKu2vQC4BlwyUeFE0KxP0AqYT3JQE+B4SSwH6hnQAFYBO6JqPQKkQZYS5bXgccitP8N/oEKMCGi3C/IEPARuNcvRIb+yO4nngvMAe+Tzr5BkoBBYDfwot9qSOsUyxUNjQ8i6sMggmRoD7nHI/+wHTAGPBNR7hciCRj6LpjCxBpw00d5nyAZGgT2AEv/M/4vmHGRlTWP0ioAAAAASUVORK5CYII='
    );
  }

  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('ElastOS Personal Cloud');
  updateTrayMenu();

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
    }
  });
}

function updateTrayMenu(): void {
  const statusLabels: Record<pc2Manager.PC2Status, string> = {
    'running': '🟢 Running',
    'stopped': '⚫ Stopped',
    'starting': '🟡 Starting...',
    'stopping': '🟡 Stopping...',
    'error': '🔴 Error',
    'not-installed': '⚪ Not Installed'
  };

  const contextMenu = Menu.buildFromTemplate([
    { label: `Status: ${statusLabels[currentStatus]}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Start PC2',
      enabled: currentStatus === 'stopped' || currentStatus === 'error',
      click: () => pc2Manager.startPC2()
    },
    {
      label: 'Stop PC2',
      enabled: currentStatus === 'running',
      click: () => pc2Manager.stopPC2()
    },
    { type: 'separator' },
    {
      label: 'Open in Browser',
      enabled: currentStatus === 'running',
      click: () => pc2Manager.openInBrowser()
    },
    { type: 'separator' },
    { label: 'Show Window', click: () => mainWindow?.show() },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray?.setContextMenu(contextMenu);
}

// Set up status change listener
pc2Manager.onStatusChange((status) => {
  currentStatus = status;
  mainWindow?.webContents.send('pc2:status', status);
  updateTrayMenu();
});

// Set up log listener
pc2Manager.onLog((logMessage) => {
  mainWindow?.webContents.send('pc2:log', logMessage);
});

// IPC Handlers
ipcMain.handle('pc2:getStatus', () => pc2Manager.getStatus());
ipcMain.handle('pc2:start', () => pc2Manager.startPC2());
ipcMain.handle('pc2:stop', () => pc2Manager.stopPC2());
ipcMain.handle('pc2:restart', () => pc2Manager.restartPC2());
ipcMain.handle('pc2:getLogs', (_, lines) => pc2Manager.getLogs(lines));
ipcMain.handle('pc2:isInstalled', () => pc2Manager.isInstalled());
ipcMain.handle('pc2:openBrowser', () => pc2Manager.openInBrowser());
ipcMain.handle('pc2:install', async (event) => {
  return pc2Manager.installPC2((msg) => {
    event.sender.send('pc2:installProgress', msg);
  });
});

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    isQuitting = true;
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow?.show();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});
