'use strict';

/**
 * Nook — proceso principal de Electron.
 *
 * Estrategia de carga
 * -------------------
 * Next.js con `output: "export"` genera rutas ABSOLUTAS para sus assets
 * (`/_next/static/chunks/...`). Bajo `file://` esas rutas apuntan a la raíz del
 * disco y la ventana queda en blanco. Por eso registramos un esquema propio,
 * `nook://`, y resolvemos cada request contra la carpeta de la web empaquetada.
 *
 * Beneficios:
 *   - las rutas absolutas funcionan sin tocar el build de Next;
 *   - origen estable (`nook://nook`) → `localStorage` persiste entre sesiones,
 *     cosa que con `file://` es inconsistente;
 *   - no se expone el sistema de archivos: sólo se sirve lo que está en
 *     `resources/web`, con protección contra path traversal.
 *
 * Seguridad
 * ---------
 *   - contextIsolation ON, nodeIntegration OFF, sandbox ON;
 *   - `window.open` y navegaciones externas se delegan al navegador del SO;
 *   - la app no hace pedidos de red (todo es local).
 */

const { app, BrowserWindow, Menu, protocol, net, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const APP_SCHEME = 'nook';
const APP_HOST = 'nook';

/** Raíz de archivos web: empaquetada en producción, `../out` en desarrollo. */
const WEB_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, 'web')
  : path.join(__dirname, '..', 'out');

/** Una sola instancia: evita dos ventanas peleando por el mismo localStorage. */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

/** @type {BrowserWindow | null} */
let mainWindow = null;

/**
 * Traduce una ruta de URL a un archivo real dentro de WEB_ROOT.
 * @param {string} pathname Ruta ya decodificada, p. ej. `/` o `/_next/static/x.js`.
 * @returns {string | null} Ruta absoluta al archivo, o null si no corresponde.
 */
function resolveTarget(pathname) {
  let rel = pathname || '/';
  if (rel.endsWith('/')) rel += 'index.html';

  const candidate = path.normalize(path.join(WEB_ROOT, rel));

  // Defensa contra `../` y rutas que escapan de la raíz.
  if (candidate !== WEB_ROOT && !candidate.startsWith(WEB_ROOT + path.sep)) {
    return null;
  }

  const candidates = [candidate, `${candidate}.html`, path.join(candidate, 'index.html')];
  for (const file of candidates) {
    try {
      if (fs.statSync(file).isFile()) return file;
    } catch {
      /* no existe: probamos el siguiente */
    }
  }
  return null;
}

function registerProtocolHandler() {
  protocol.handle(APP_SCHEME, async (request) => {
    try {
      const { pathname } = new URL(request.url);
      const file = resolveTarget(decodeURIComponent(pathname));

      if (!file) {
        const notFound = path.join(WEB_ROOT, '404.html');
        const body = fs.existsSync(notFound)
          ? await fs.promises.readFile(notFound)
          : Buffer.from('404 — no encontrado');
        return new Response(body, {
          status: 404,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }

      return net.fetch(pathToFileURL(file).toString());
    } catch (err) {
      console.error('[nook] Error sirviendo', request.url, err);
      return new Response('500 — error interno', {
        status: 500,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#ffffff',
    title: 'Nook',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Enlaces externos: fuera de la app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${APP_SCHEME}://`)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(`${APP_SCHEME}://${APP_HOST}/`).catch((err) => {
    console.error('[nook] No se pudo cargar la app:', err);
  });
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(() => {
  registerProtocolHandler();
  Menu.setApplicationMenu(null); // sin menú nativo: la app tiene su propia UI
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
