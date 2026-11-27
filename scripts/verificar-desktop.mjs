/**
 * Verificación real del empaquetado de escritorio.
 *
 * Arranca Xvfb, lanza el binario empaquetado (Linux, mismo `app.asar` que el
 * .exe de Windows), se conecta por CDP con Playwright y comprueba que la
 * ventana renderiza la app: título, cantidad de bloques y ausencia de errores
 * de consola. Guarda una captura como evidencia.
 *
 * Uso: node scripts/verificar-desktop.mjs <ruta-al-binario>
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';
import { capturar } from './_captura.mjs';

const bin = process.argv[2];
if (!bin) {
  console.error('Falta la ruta del binario');
  process.exit(1);
}

const DISPLAY = ':99';
const PORT = 9222;

const env = { ...process.env, DISPLAY };
delete env.ELECTRON_RUN_AS_NODE;

const xvfb = spawn('Xvfb', [DISPLAY, '-screen', '0', '1440x900x24'], { stdio: 'ignore' });
await sleep(1200);

const app = spawn(bin, ['--no-sandbox', `--remote-debugging-port=${PORT}`], {
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let logs = '';
app.stdout.on('data', (d) => (logs += d));
app.stderr.on('data', (d) => (logs += d));

const problemas = [];
let browser;

try {
  let ok = false;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) {
        ok = true;
        break;
      }
    } catch {
      /* todavía no levantó */
    }
  }
  if (!ok) throw new Error('El puerto de depuración nunca respondió');

  browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? (await context.waitForEvent('page'));

  page.on('console', (msg) => {
    if (msg.type() === 'error') problemas.push(msg.text());
  });
  page.on('pageerror', (err) => problemas.push(String(err)));

  await page.waitForLoadState('domcontentloaded');
  await sleep(2500);

  const datos = await page.evaluate(() => ({
    url: location.href,
    titulo: document.title,
    bloques: document.querySelectorAll('[data-block-id]').length,
    tablas: document.querySelectorAll('[role="table"]').length,
    plan: (() => {
      const st = window.__nookStore?.getState?.();
      if (!st) return null;
      // retención efectiva del historial, tal como la lee la app
      const dias = st.plan.tier === 'enterprise' && st.plan.active ? null : { free: 7, pro: 30, business: 90 }[st.plan.tier] ?? 7;
      const retencion = st.plan.active ? dias : 7;
      return {
        activo: st.plan.active,
        tier: st.plan.tier,
        miembros: st.members.length,
        historial: retencion === null ? 'sin límite' : `${retencion} días`,
        versiones: Object.values(st.versions ?? {}).reduce((n, l) => n + l.length, 0),
      };
    })(),
    texto: (document.body.innerText || '').slice(0, 160).replace(/\s+/g, ' '),
    storage: (() => {
      try {
        localStorage.setItem('__probe', '1');
        const ok = localStorage.getItem('__probe') === '1';
        localStorage.removeItem('__probe');
        return ok;
      } catch {
        return false;
      }
    })(),
  }));

  await capturar(page, 'nook-desktop-prueba.png');

  console.log('URL       :', datos.url);
  console.log('Título    :', datos.titulo);
  console.log('Bloques   :', datos.bloques);
  console.log('Tablas    :', datos.tablas);
  console.log(
    'Plan      :',
    datos.plan?.tier,
    datos.plan?.activo
      ? `(activo · historial ${datos.plan?.historial ?? '?'})`
      : '(inactivo)',
  );
  console.log('Miembros  :', datos.plan?.miembros, '(límite: ninguno)');
  console.log('localStorage:', datos.storage ? 'OK' : 'FALLA');
  console.log('Texto     :', datos.texto);
  console.log('Consola   :', problemas.length ? problemas : 'sin errores');

  /* --------------------- carpetas y archivos en el .exe ------------------- */
  /**
   * IndexedDB es lo que más riesgo tiene al empaquetar: el protocolo propio
   * (`nook://`) y el origen del `.exe` no son los del navegador. Si esto falla,
   * los adjuntos no existen en escritorio y hay que saberlo antes de entregar.
   */
  const archivos = await page.evaluate(async () => {
    const st = window.__nookStore.getState();
    const carpeta = st.createFolder(null, 'Carpeta de prueba');
    const contenido = new File([new Uint8Array([137, 80, 78, 71])], 'prueba.bin', {
      type: 'application/octet-stream',
    });
    const subido = await window.__nookStore.getState().addFile(contenido, carpeta);
    // se recupera el blob para comprobar que IndexedDB funciona de verdad
    const leido = await new Promise((resolve) => {
      const req = indexedDB.open('nook-files');
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('blobs')) return resolve(null);
        const get = db.transaction('blobs', 'readonly').objectStore('blobs').get(subido.file?.id ?? '');
        get.onsuccess = () => resolve(get.result ? get.result.size : null);
        get.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    });
    return { subido: subido.ok, error: subido.error ?? '', tam: leido };
  });

  console.log(
    'Archivos  :',
    archivos.subido ? `subida OK · blob de ${archivos.tam} bytes` : `FALLÓ: ${archivos.error}`,
  );

  const valido =
    datos.bloques > 5 &&
    datos.tablas > 0 &&
    datos.plan?.activo === true &&
    datos.storage &&
    archivos.subido === true &&
    archivos.tam === 4 &&
    problemas.length === 0;
  console.log(valido ? '\n✅ App de escritorio verificada' : '\n❌ Verificación fallida');
  process.exitCode = valido ? 0 : 1;
} catch (err) {
  console.error('ERROR:', err.message);
  console.error(logs.slice(-2000));
  process.exitCode = 1;
} finally {
  try {
    await browser?.close();
  } catch {
    /* noop */
  }
  app.kill('SIGKILL');
  xvfb.kill('SIGKILL');
}
