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

const bin = process.argv[2];
if (!bin) {
  console.error('Falta la ruta del binario');
  process.exit(1);
}

const DISPLAY = ':99';
const PORT = 9222;
const SHOT = '/home/user/nook-desktop-prueba.png';

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

  await page.screenshot({ path: SHOT });

  console.log('URL       :', datos.url);
  console.log('Título    :', datos.titulo);
  console.log('Bloques   :', datos.bloques);
  console.log('localStorage:', datos.storage ? 'OK' : 'FALLA');
  console.log('Texto     :', datos.texto);
  console.log('Consola   :', problemas.length ? problemas : 'sin errores');

  const valido = datos.bloques > 5 && datos.storage && problemas.length === 0;
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
