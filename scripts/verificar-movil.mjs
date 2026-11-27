/**
 * Verificación de pantallas angostas.
 *
 * La app es de escritorio, pero se abre en el navegador y en el .exe se puede
 * reducir la ventana. Lo que se comprueba acá: que no haya scroll horizontal y
 * que el editor conserve un ancho usable.
 *
 * Uso: node scripts/verificar-movil.mjs http://127.0.0.1:4321
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4321';
const res = [];
const ok = (n, d = '') => res.push({ n, ok: true, d });
const mal = (n, d = '') => res.push({ n, ok: false, d });

const browser = await chromium.launch();

const medir = async (w, h) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const datos = await page.evaluate(() => {
    const doc = document.documentElement;
    const ed = document.querySelector('[data-block-id] [contenteditable]');
    const r = ed?.getBoundingClientRect();
    return {
      overflowX: doc.scrollWidth - doc.clientWidth,
      anchoEditor: r ? Math.round(r.width) : 0,
      sidebar: window.__nookStore.getState().sidebarOpen,
      parrafos: document.querySelectorAll('[data-block-id]').length,
    };
  });
  await page.close();
  return { ...datos, errores };
};

/* ------------------------------ 1. teléfono ------------------------------ */
const movil = await medir(390, 844);
if (movil.overflowX <= 0 && movil.anchoEditor >= 240 && !movil.sidebar && movil.parrafos > 0) {
  ok('teléfono (390 px): editor usable y sin scroll lateral', `${movil.anchoEditor} px de editor`);
} else {
  mal('teléfono (390 px): editor usable y sin scroll lateral', JSON.stringify(movil));
}

/* ------------------------------- 2. tablet ------------------------------- */
const tablet = await medir(768, 1024);
if (tablet.overflowX <= 0 && tablet.anchoEditor >= 220) {
  ok('tablet (768 px): sin desborde', `${tablet.anchoEditor} px de editor`);
} else {
  mal('tablet (768 px): sin desborde', JSON.stringify(tablet));
}

/* --------------------- 3. ventana chica del escritorio -------------------- */
const chica = await medir(900, 600);
if (chica.overflowX <= 0 && chica.anchoEditor >= 300 && chica.errores.length === 0) {
  ok('ventana chica (900 px): sin desborde ni errores', `${chica.anchoEditor} px de editor`);
} else {
  mal('ventana chica (900 px): sin desborde ni errores', JSON.stringify(chica));
}

await browser.close();

console.log('');
for (const r of res) console.log(`${r.ok ? '✅' : '❌'} ${r.n}${r.d ? ` — ${r.d}` : ''}`);
const fallos = res.filter((r) => !r.ok).length;
console.log(`\n${res.length - fallos}/${res.length} verificaciones OK`);
process.exit(fallos ? 1 : 0);
