// electron-main.js
// Wraps the DOGE2 visualizer server in an Electron desktop app.
// Starts the HTTP server as a child process, then opens a browser window.

const { app, BrowserWindow, Tray, Menu, shell, dialog } = require('electron');
const path   = require('path');
const http   = require('http');
const { fork, execFile } = require('child_process');
const fs     = require('fs');
const os     = require('os');

const SERVER_PORT = 3100;
const SERVER_FILE = path.join(__dirname, 'doge2-server.js');
const ICON_FILE   = path.join(__dirname, 'icons', process.platform === 'darwin' ? 'doge2.icns'
                            : process.platform === 'win32'   ? 'doge2.ico'
                            : 'doge2-256.png');

let mainWindow = null;
let serverProc = null;
let tray       = null;

// ── Start the HTTP server ──────────────────────────────────────
function startServer() {
  return new Promise((resolve, reject) => {
    serverProc = fork(SERVER_FILE, [], { silent: true });
    serverProc.stderr.on('data', d => console.error('[server]', d.toString()));

    // Poll until server responds
    let attempts = 0;
    const check = setInterval(() => {
      const req = http.get(`http://127.0.0.1:${SERVER_PORT}/`, res => {
        clearInterval(check);
        resolve();
      });
      req.on('error', () => {});
      req.end();
      if (++attempts > 30) { clearInterval(check); reject(new Error('Server did not start')); }
    }, 500);
  });
}

// ── Create the main browser window ────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'DC2 Visualizer',
    icon: ICON_FILE,
    backgroundColor: '#000010',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${SERVER_PORT}/`);
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── System tray ────────────────────────────────────────────────
function createTray() {
  tray = new Tray(ICON_FILE);
  const menu = Menu.buildFromTemplate([
    { label: 'Open DC2 Visualizer', click: () => { if (mainWindow) mainWindow.focus(); else createWindow(); } },
    { label: 'Open in Browser', click: () => shell.openExternal(`http://127.0.0.1:${SERVER_PORT}/`) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setToolTip('DC2 Visualizer');
  tray.setContextMenu(menu);
  tray.on('double-click', () => { if (mainWindow) mainWindow.focus(); else createWindow(); });
}

// ── Check for DOGE2 daemon ─────────────────────────────────────
function checkDaemon() {
  return new Promise(resolve => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 22655,
      method: 'POST',
      path: '/',
      headers: { 'Content-Type': 'text/plain' },
    }, res => resolve(true));
    req.on('error', () => resolve(false));
    req.write(JSON.stringify({ method: 'getblockcount', params: [], id: 1 }));
    req.end();
  });
}

// ── App lifecycle ──────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    await startServer();
  } catch (e) {
    dialog.showErrorBox('Server Error', 'Could not start the visualizer server.\n\n' + e.message);
    app.quit();
    return;
  }

  const daemonRunning = await checkDaemon();
  if (!daemonRunning) {
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      title: 'DOGE2 Daemon Not Found',
      message: 'The DOGE2 daemon (dogecoin2d) does not appear to be running on port 22655.',
      detail: 'You can still open the visualizer, but it will show no blockchain data until the daemon is started.',
      buttons: ['Open Anyway', 'Quit'],
      defaultId: 0,
    });
    if (choice === 1) { app.quit(); return; }
  }

  createTray();
  createWindow();

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProc) { serverProc.kill(); serverProc = null; }
  if (tray)       { tray.destroy(); tray = null; }
});
