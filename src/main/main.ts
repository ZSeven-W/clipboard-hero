import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  clipboard,
  Tray,
  Menu,
  nativeImage,
} from 'electron';
import path from 'path';
import {
  initDatabase,
  getClips,
  searchClips,
  getClipById,
  deleteClip,
  clearClips,
  closeDatabase,
} from './database';
import { startWatching, stopWatching, skipNextChange } from './clipboard-watcher';

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

  ipcMain.handle('clips:copy', (_event, id: number) => {
    const clip = getClipById(id);
    if (clip) {
      skipNextChange();
      clipboard.writeText(clip.content);
    }
  });
}

app.whenReady().then(() => {
  // Hide dock icon on macOS — run as a menu-bar / tray app
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  initDatabase();
  createWindow();
  createTray();
  setupIPC();

  globalShortcut.register('CommandOrControl+Shift+V', toggleWindow);

  startWatching((clip) => {
    mainWindow?.webContents.send('clipboard:changed', clip);
  });
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
