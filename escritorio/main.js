'use strict';
const { app, BrowserWindow, Menu, session } = require('electron');
const path = require('node:path');

const TITULO = 'SIVEA · Sistema Inteligente de Verificación Ambiental';
const INDEX = path.join(__dirname, 'app', 'index.html');
const desarrollo = !app.isPackaged;

// Solo file:, data: y blob: (el visor de PDF usa blob:). En desarrollo se deja pasar devtools:.
const permitida = (url) => /^(file|data|blob):/i.test(url) || (desarrollo && /^devtools:/i.test(url));

function crearVentana() {
  const ventana = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: TITULO,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
  });
  // El título lo manda la ventana, no el <title> de la página.
  ventana.on('page-title-updated', (e) => e.preventDefault());
  ventana.webContents.on('will-navigate', (e, url) => {
    if (url !== ventana.webContents.getURL()) e.preventDefault();
  });
  ventana.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  ventana.loadFile(INDEX);
  return ventana;
}

function crearMenu() {
  if (!desarrollo) return Menu.setApplicationMenu(null);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Ver', submenu: [{ role: 'reload', label: 'Recargar' }, { role: 'toggleDevTools', label: 'Herramientas de desarrollo' }] },
  ]));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [v] = BrowserWindow.getAllWindows();
    if (v) { if (v.isMinimized()) v.restore(); v.focus(); }
  });
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, _permiso, devolver) => devolver(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onBeforeRequest((d, devolver) => devolver({ cancel: !permitida(d.url) }));
    crearMenu();
    crearVentana();
  });
  app.on('window-all-closed', () => app.quit());
}
