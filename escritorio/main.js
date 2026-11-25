'use strict';
const { app, BrowserWindow, Menu, dialog, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const TITULO = 'SIVEA · Sistema Inteligente de Verificación Ambiental';
const INDEX = path.join(__dirname, 'app', 'index.html');
const desarrollo = !app.isPackaged;

const INDEX_URL = pathToFileURL(INDEX).href;

// De file: solo el index de la app (con cualquier #hash), no otros archivos del disco.
// data: y blob: se dejan pasar (el visor de PDF usa blob:). En desarrollo también devtools:.
const permitida = (url) => {
  if (/^(data|blob):/i.test(url)) return true;
  if (/^file:/i.test(url)) return url.split(/[?#]/)[0].toLowerCase() === INDEX_URL.toLowerCase();
  return desarrollo && /^devtools:/i.test(url);
};

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
  const sinNavegar = (e, url) => {
    if (url !== ventana.webContents.getURL()) e.preventDefault();
  };
  ventana.webContents.on('will-navigate', sinNavegar);
  ventana.webContents.on('will-redirect', sinNavegar);
  ventana.webContents.on('will-attach-webview', (e) => e.preventDefault());
  ventana.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  ventana.loadFile(INDEX).catch((e) => {
    dialog.showErrorBox('SIVEA', `No se pudo abrir la aplicación: ${e.message}`);
    app.quit();
  });
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
