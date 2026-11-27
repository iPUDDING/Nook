/**
 * Verificación de los modales.
 *
 * Cada modal del producto se abre, se mira (tiene contenido y un título) y se
 * cierra con Escape. Es la clase de prueba que atrapa lo barato y frecuente:
 * un modal que queda abierto, que no renderiza nada o que rompe la consola.
 *
 * Uso: node scripts/verificar-modales.mjs http://127.0.0.1:4321
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4321';
const res = [];
const ok = (n, d = '') => res.push({ n, ok: true, d });
const mal = (n, d = '') => res.push({ n, ok: false, d });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const errores = [];
page.on('pageerror', (e) => errores.push(String(e).slice(0, 160)));
page.on('console', (m) => m.type() === 'error' && errores.push(m.text().slice(0, 160)));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

/** Abre el modal por la acción del store, lo mide y lo cierra con Escape. */
const probar = async (nombre, abrir, cerrar) => {
  const antes = errores.length;
  const estado = await page.evaluate(abrir);
  await page.waitForTimeout(450);

  const visible = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    if (!dlg) return null;
    const r = dlg.getBoundingClientRect();
    return {
      texto: (dlg.textContent ?? '').trim().length,
      ancho: Math.round(r.width),
      alto: Math.round(r.height),
      enPantalla: r.width > 120 && r.height > 60 && r.top >= -4 && r.left >= -4,
    };
  });

  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  const cerrado = await page.evaluate(cerrar);

  const nuevos = errores.slice(antes);

  if (visible && visible.enPantalla && visible.texto > 8 && cerrado && !nuevos.length) {
    ok(`${nombre}: abre, renderiza y cierra`, `${visible.ancho}×${visible.alto} px`);
  } else {
    mal(`${nombre}: abre, renderiza y cierra`, JSON.stringify({ estado, visible, cerrado, errores: nuevos }));
  }
};

/* ------------------------------- compartir -------------------------------- */
await probar(
  'Compartir',
  () => window.__nookStore.getState().setUI({ shareOpen: true }),
  () => window.__nookStore.getState().shareOpen === false,
);

/* -------------------------------- atajos ---------------------------------- */
await probar(
  'Atajos de teclado',
  () => window.__nookStore.getState().setUI({ shortcutsOpen: true }),
  () => window.__nookStore.getState().shortcutsOpen === false,
);

/* -------------------------------- papelera -------------------------------- */
await probar(
  'Papelera',
  () => window.__nookStore.getState().setUI({ trashOpen: true }),
  () => window.__nookStore.getState().trashOpen === false,
);

/* ----------------------------- pegar Markdown ----------------------------- */
await probar(
  'Pegar Markdown',
  () => window.__nookStore.getState().setUI({ pasteOpen: true }),
  () => window.__nookStore.getState().pasteOpen === false,
);

/* ------------------------------ configuración ----------------------------- */
await probar(
  'Configuración',
  () => window.__nookStore.getState().setUI({ settingsOpen: true }),
  () => window.__nookStore.getState().settingsOpen === false,
);

/* ------------------------------ paleta ⌘K --------------------------------- */
await probar(
  'Paleta de comandos',
  () => window.__nookStore.getState().setUI({ paletteOpen: true }),
  () => window.__nookStore.getState().paletteOpen === false,
);

/* -------------------------------- mapa ----------------------------------- */
await probar(
  'Mapa mental',
  () => window.__nookStore.getState().setUI({ mindmapOpen: true }),
  () => window.__nookStore.getState().mindmapOpen === false,
);


/* ---------------------------- panel de Pomodoro --------------------------- */
const pomodoro = await (async () => {
  const mirar = () =>
    page.evaluate(() => ({
      pildora: !!document.querySelector('button[aria-label="Mostrar Pomodoro"]'),
      panel: !![...document.querySelectorAll("div")].find(
        (d) => /Pomodoro · /i.test(d.textContent ?? "") && String(d.className).includes("glass"),
      ),
    }));

  await page.keyboard.press("Control+Shift+P");
  await page.waitForTimeout(500);
  const abierto = await mirar();

  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const cerrado = await mirar();

  return { abierto, cerrado };
})();

if (pomodoro.abierto.panel && !pomodoro.abierto.pildora && pomodoro.cerrado.pildora && !pomodoro.cerrado.panel) {
  ok("Pomodoro: abre con ⌘⇧P y cierra con Escape");
} else {
  mal("Pomodoro: abre con ⌘⇧P y cierra con Escape", JSON.stringify(pomodoro));
}

/* --------------------------- peek de una fila ----------------------------- */
const peek = await page.evaluate(async () => {
  const store = window.__nookStore.getState();
  const pagina = Object.values(store.pages).find((p) => p.database);
  if (!pagina) return { error: 'sin base de datos' };
  store.selectPage(pagina.id);
  await new Promise((r) => setTimeout(r, 400));

  const fila = window.__nookStore.getState().pages[pagina.id].database.rows[0];
  window.__nookStore.getState().setUI({ peekRowId: fila.id });
  await new Promise((r) => setTimeout(r, 600));

  const panel = document.querySelector('[role="dialog"]');
  const dentro = {
    hay: !!panel,
    texto: (panel?.textContent ?? '').trim().length,
    editable: !!panel?.querySelector('[contenteditable], input, textarea'),
  };
  window.__nookStore.getState().setUI({ peekRowId: null });
  await new Promise((r) => setTimeout(r, 300));
  return { dentro, cerrado: window.__nookStore.getState().peekRowId === null };
});

if (peek.dentro?.hay && peek.dentro.texto > 8 && peek.dentro.editable && peek.cerrado) {
  ok('Fila de base de datos: el panel abre con campos editables');
} else {
  mal('Fila de base de datos: el panel abre con campos editables', JSON.stringify(peek));
}

/* ---------------------- la app queda usable al final ---------------------- */
// volver a una página con contenido: el peek dejó seleccionada la base de datos
await page.evaluate(() => {
  const s = window.__nookStore.getState();
  const conBloques = Object.values(s.pages).find((p) => !p.trashed && p.blocks.length > 5);
  if (conBloques) s.selectPage(conBloques.id);
});
await page.waitForTimeout(500);

const final = await page.evaluate(() => {
  const s = window.__nookStore.getState();
  const abiertos = ["paletteOpen", "shareOpen", "settingsOpen", "shortcutsOpen", "trashOpen", "mindmapOpen", "pasteOpen"].filter(
    (k) => s[k],
  );
  return { abiertos, bloques: document.querySelectorAll('[data-block-id]').length };
});

if (final.abiertos.length === 0 && final.bloques > 0) {
  ok('ningún modal quedó abierto', `${final.bloques} bloques editables`);
} else {
  mal('ningún modal quedó abierto', JSON.stringify(final));
}

const ruido = errores.filter((e) => !/Failed to load resource/i.test(e));
if (!ruido.length) ok('consola sin errores');
else mal('consola sin errores', ruido.slice(0, 3).join(' | '));

await browser.close();

console.log('');
for (const r of res) console.log(`${r.ok ? '✅' : '❌'} ${r.n}${r.d ? ` — ${r.d}` : ''}`);
const fallos = res.filter((r) => !r.ok).length;
console.log(`\n${res.length - fallos}/${res.length} verificaciones OK`);
process.exit(fallos ? 1 : 0);
