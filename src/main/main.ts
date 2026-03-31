import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  clipboard,
  Tray,
  Menu,
  nativeImage,
  dialog,
} from 'electron';
import path from 'path';
import fs from 'fs';
import {
  initDatabase,
  getClips,
  searchClips,
  getClipById,
  deleteClip,
  clearClips,
  closeDatabase,
  pinClip,
  unpinClip,
  incrementCopyCount,
  getAllClips,
  getClipCount,
  importClips,
  pruneExpiredClips,
  updateClipContent,
  getStatistics,
} from './database';
import { startWatching, stopWatching, skipNextChange, updateInterval } from './clipboard-watcher';
import { loadSettings, getSettings, saveSettings, Settings } from './settings';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 500,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Hide on blur (Raycast-style dismiss)
  mainWindow.on('blur', () => {
    if (!isQuitting) mainWindow?.hide();
  });

  // Prevent close — hide instead (keep running in tray)
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
}

function toggleWindow(): void {
  if (!mainWindow) return;

  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.center();
    mainWindow.show();
    mainWindow.focus();
  }
}

function createTray(): void {
  // 1x1 black pixel PNG, resized to 16x16 — works as macOS template image
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    ).resize({ width: 16, height: 16 });
  } catch {
    icon = nativeImage.createEmpty();
  }

  if (process.platform === 'darwin') {
    icon.setTemplateImage(true);
  }

  tray = new Tray(icon);
  tray.setToolTip('ClipboardHero');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show / Hide', click: toggleWindow },
    { type: 'separator' },
    {
      label: 'Settings...',
      click: () => {
        if (!mainWindow) return;
        if (!mainWindow.isVisible()) {
          mainWindow.center();
          mainWindow.show();
          mainWindow.focus();
        }
        mainWindow.webContents.send('settings:open');
      },
    },
    {
      label: 'Export History...',
      click: async () => {
        const win = mainWindow;
        const result = await dialog.showSaveDialog(win ?? new BrowserWindow({ show: false }), {
          title: 'Export Clipboard History',
          defaultPath: `clipboard-hero-export-${new Date().toISOString().slice(0, 10)}.json`,
          filters: [{ name: 'JSON Files', extensions: ['json'] }],
        });

        if (!result.canceled && result.filePath) {
          const clips = getAllClips();
          fs.writeFileSync(result.filePath, JSON.stringify(clips, null, 2), 'utf-8');
        }
      },
    },
    {
      label: 'Import History...',
      click: async () => {
        const win = mainWindow;
        const result = await dialog.showOpenDialog(win ?? new BrowserWindow({ show: false }), {
          title: 'Import Clipboard History',
          filters: [{ name: 'JSON Files', extensions: ['json'] }],
          properties: ['openFile'],
        });

        if (!result.canceled && result.filePaths.length > 0) {
          try {
            const raw = fs.readFileSync(result.filePaths[0], 'utf-8');
            const clips = JSON.parse(raw);
            if (!Array.isArray(clips)) {
              dialog.showErrorBox('Import Error', 'Invalid format: expected a JSON array of clips.');
              return;
            }
            const importResult = importClips(clips);
            mainWindow?.webContents.send('clips:refresh');
            dialog.showMessageBox(win ?? new BrowserWindow({ show: false }), {
              type: 'info',
              title: 'Import Complete',
              message: `Imported ${importResult.imported} clip(s), skipped ${importResult.skipped} duplicate(s).`,
            });
          } catch {
            dialog.showErrorBox('Import Error', 'Failed to read or parse the selected file.');
          }
        }
      },
    },
    {
      label: 'Clear History',
      click: () => {
        clearClips();
        mainWindow?.webContents.send('clips:refresh');
      },
    },
    { type: 'separator' },
    { label: 'Quit ClipboardHero', click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', toggleWindow);
}

function setupIPC(): void {
  ipcMain.handle('clips:getAll', (_event, category?: string) => getClips(category));
  ipcMain.handle('clips:search', (_event, query: string) => searchClips(query));
  ipcMain.handle('clips:delete', (_event, id: number) => deleteClip(id));
  ipcMain.handle('clips:clear', () => clearClips());
  ipcMain.handle('clips:pin', (_event, id: number) => pinClip(id));
  ipcMain.handle('clips:unpin', (_event, id: number) => unpinClip(id));
  ipcMain.handle('clips:export', () => getAllClips());
  ipcMain.handle('clips:import', (_event, clips: Array<Record<string, unknown>>) =>
    importClips(clips as Array<{ content: string; category?: string; pinned?: number; copy_count?: number; created_at?: string }>));

  ipcMain.handle('clips:copy', (_event, id: number) => {
    const clip = getClipById(id);
    if (clip) {
      skipNextChange();
      clipboard.writeText(clip.content);
      incrementCopyCount(id);
    }
  });

  ipcMain.handle('clips:update', (_event, id: number, newContent: string) => {
    return updateClipContent(id, newContent);
  });

  ipcMain.handle('clips:count', () => getClipCount());
  ipcMain.handle('clips:stats', () => getStatistics());

  ipcMain.handle('settings:get', () => getSettings());
  ipcMain.handle('settings:save', (_event, update: Partial<Settings>) => {
    const settings = saveSettings(update);

    // Apply polling interval change
    updateInterval(settings.pollingInterval);

    // Apply launch at login
    if (!app.isPackaged) {
      // In dev mode, setLoginItemSettings may not work — skip silently
    } else {
      app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });
    }

    return settings;
  });
}

app.whenReady().then(() => {
  // Hide dock icon on macOS — run as a menu-bar / tray app
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  const settings = loadSettings();
  initDatabase();
  createWindow();
  createTray();
  setupIPC();

  globalShortcut.register('CommandOrControl+Shift+V', toggleWindow);

  startWatching((clip) => {
    mainWindow?.webContents.send('clipboard:changed', clip);
  }, settings.pollingInterval);

  // Prune expired clips on startup and every hour
  pruneExpiredClips();
  setInterval(() => pruneExpiredClips(), 60 * 60 * 1000);
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopWatching();
  closeDatabase();
});

// Keep the app running when all windows are hidden
app.on('window-all-closed', () => {
  // Do nothing — stay alive in the system tray
});
