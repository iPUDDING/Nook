/**
 * Verificación de "Mover a…" en el árbol lateral.
 *
 * Es la acción que la app de referencia ofrece en el menú ••• de cada página y
 * la única forma cómoda de reorganizar sin arrastrar. Lo que puede fallar:
 *
 *  1. que el menú ••• del árbol tenga "Mover a…" y abra su panel;
 *  2. que el panel liste destinos y **excluya la propia página**;
 *  3. que excluya también todo su subárbol (mover dentro del hijo la perdería);
 *  4. que el buscador filtre destinos y avise cuando no hay coincidencias;
 *  5. que mover a otra página cambie `parentId` y que la página aparezca bajo
 *     el nuevo padre en el árbol;
 *  6. que "Sin página (raíz)" devuelva la página a la raíz;
 *  7. que el movimiento sobreviva a la recarga;
 *  8. que la consola quede limpia.
 *
 * Uso: node scripts/verificar-mover.mjs http://127.0.0.1:4321
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4321';
const res = [];
const ok = (n, d = '') => res.push({ n, ok: true, d });
const mal = (n, d = '') => res.push({ n, ok: false, d });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 950 } });

const errores = [];
page.on('pageerror', (e) => errores.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errores.push(m.text());
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-block-id]', { timeout: 20000 });

/** Crea dos páginas de prueba: "Alfa" en la raíz y "Alfa hija" dentro de Alfa. */
const ids = await page.evaluate(() => {
  const st = window.__nookStore.getState();
  const alfa = st.createPage(null, { title: "Alfa mover" });
  const hija = st.createPage(alfa, { title: "Alfa hija" });
  st.selectPage(alfa);
  return { alfa, hija };
});
await page.waitForTimeout(600);

/** Abre el menú ••• de una página del árbol por su título. */
async function abrirMenu(titulo) {
  const fila = page.locator('aside div.group', { hasText: titulo }).last();
  await fila.hover();
  await fila.locator('button[aria-label="Más opciones"]').click();
  await page.waitForSelector('[role="menu"]', { timeout: 5000 });
}

await abrirMenu('Alfa mover');
await page.getByRole('menu').getByText('Mover a…', { exact: true }).click();
await page.waitForSelector('[data-move-panel]', { timeout: 5000 });
ok('el menú del árbol abre el panel "Mover a…"');

// -------------------------------------------------- 2 y 3. destinos excluidos
const destinos = await page.evaluate(() =>
  [...document.querySelectorAll('[data-move-target]')].map((b) => ({
    id: b.getAttribute('data-move-target'),
    texto: (b.textContent || '').trim(),
  })),
);
destinos.some((d) => d.id === 'raiz')
  ? ok('el panel ofrece volver a la raíz')
  : mal('el panel ofrece volver a la raíz');
!destinos.some((d) => d.id === ids.alfa)
  ? ok('la propia página no aparece como destino')
  : mal('la propia página no aparece como destino');
!destinos.some((d) => d.id === ids.hija)
  ? ok('el subárbol propio tampoco aparece como destino', `${destinos.length} destinos`)
  : mal('el subárbol propio tampoco aparece como destino', JSON.stringify(destinos.map((d) => d.texto)));

// ------------------------------------------------------------- 4. buscador
await page.locator('[data-move-search]').fill('zzzznoexiste');
await page.waitForTimeout(250);
const vacio = await page.evaluate(() => ({
  destinos: document.querySelectorAll('[data-move-target]').length,
  aviso: document.body.innerText.includes('Ningún destino coincide'),
}));
vacio.destinos === 1 && vacio.aviso
  ? ok('el buscador filtra destinos y avisa si no hay coincidencias', 'queda sólo la raíz')
  : mal('el buscador filtra destinos y avisa si no hay coincidencias', JSON.stringify(vacio));

await page.locator('[data-move-search]').fill('Docs');
await page.waitForTimeout(250);
const filtrado = await page.evaluate(() =>
  [...document.querySelectorAll('[data-move-target]')].map((b) => (b.textContent || '').trim()),
);
filtrado.length >= 1 && filtrado.every((t) => /raíz|docs/i.test(t))
  ? ok('el buscador deja sólo los destinos que coinciden', filtrado.join(' · ').slice(0, 60))
  : mal('el buscador deja sólo los destinos que coinciden', filtrado.join(' · ').slice(0, 60));

// --------------------------------------------------- 5. mover a otra página
const destino = await page.evaluate(() => {
  const st = window.__nookStore.getState();
  const docs = Object.values(st.pages).find((p) => p.title === "Docs" && !p.trashed);
  return docs?.id ?? null;
});
await page.locator('[data-move-search]').fill('');
await page.waitForTimeout(250);
await page.locator(`[data-move-target="${destino}"]`).click();
await page.waitForTimeout(600);
const movido = await page.evaluate((id) => {
  const st = window.__nookStore.getState();
  return st.pages[id]?.parentId ?? "sin página";
}, ids.alfa);
movido === destino
  ? ok('mover cambia el padre de la página')
  : mal('mover cambia el padre de la página', `${movido} ≠ ${destino}`);

// la página tiene que aparecer anidada bajo el nuevo padre en el árbol
const anidada = await page.evaluate(
  ({ alfa, padre }) => {
    const filas = [...document.querySelectorAll('aside div.group')];
    const iHijo = filas.findIndex((f) => (f.textContent || '').includes('Alfa mover'));
    const iPadre = filas.findIndex((f) => (f.textContent || '').includes('Docs'));
    if (iHijo < 0 || iPadre < 0) return { iHijo, iPadre, sangria: null };
    const sangria = (el) => parseInt(getComputedStyle(el).paddingLeft || '0', 10);
    return { iHijo, iPadre, sangria: sangria(filas[iHijo]), sangriaPadre: sangria(filas[iPadre]) };
  },
  { alfa: ids.alfa, padre: destino },
);
anidada.iHijo > anidada.iPadre && anidada.sangria > (anidada.sangriaPadre ?? 0)
  ? ok('la página aparece anidada bajo el nuevo padre', `sangría ${anidada.sangria} > ${anidada.sangriaPadre}`)
  : mal('la página aparece anidada bajo el nuevo padre', JSON.stringify(anidada));

// ------------------------------------------------------- 6. volver a la raíz
await abrirMenu('Alfa mover');
await page.getByRole('menu').getByText('Mover a…', { exact: true }).click();
await page.waitForSelector('[data-move-panel]', { timeout: 5000 });
await page.locator('[data-move-target="raiz"]').click();
await page.waitForTimeout(500);
const volvio = await page.evaluate((id) => window.__nookStore.getState().pages[id]?.parentId, ids.alfa);
volvio === null ? ok('"Sin página (raíz)" devuelve la página a la raíz') : mal('"Sin página (raíz)" devuelve la página a la raíz', String(volvio));

// ---------------------------------------------------------- 7. persistencia
await page.evaluate((id) => window.__nookStore.getState().movePage(id, null), ids.hija);
await abrirMenu('Alfa hija');
await page.getByRole('menu').getByText('Mover a…', { exact: true }).click();
await page.waitForSelector('[data-move-panel]', { timeout: 5000 });
await page.locator(`[data-move-target="${destino}"]`).click();
await page.waitForTimeout(500);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-block-id], aside', { timeout: 20000 });
const trasRecarga = await page.evaluate(
  ({ alfa, hija }) => {
    const st = window.__nookStore.getState();
    return { alfa: st.pages[alfa]?.parentId ?? null, hija: st.pages[hija]?.parentId ?? null };
  },
  { alfa: ids.alfa, hija: ids.hija },
);
trasRecarga.hija === destino
  ? ok('el movimiento sobrevive a la recarga', `hija → ${trasRecarga.hija === destino ? "Docs" : trasRecarga.hija}`)
  : mal('el movimiento sobrevive a la recarga', JSON.stringify(trasRecarga));

// ------------------------------------------------------- 8. consola limpia
errores.length === 0 ? ok('consola sin errores') : mal('consola sin errores', errores.slice(0, 3).join(' | '));

await browser.close();

const total = res.length;
const bien = res.filter((r) => r.ok).length;
console.log('');
for (const r of res) console.log(`  ${r.ok ? '✔' : '✘'}  ${r.n}${r.d ? `  — ${r.d}` : ''}`);
console.log(`\n  ${bien}/${total} verificaciones OK\n`);
process.exit(bien === total ? 0 : 1);
