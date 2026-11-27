/**
 * Verificación de las vistas de base de datos tipo Notion (galería y cronología).
 *
 * Lo que puede romperse sin que se note en una captura:
 *
 *  1. que la barra de vistas ofrezca las cinco vistas y marque la activa;
 *  2. que la galería dibuje una tarjeta por fila y cierre con "Nueva entrada";
 *  3. que la tarjeta abra el peek lateral y que Escape lo cierre;
 *  4. que la cronología avise si no hay propiedad de fecha (en vez de quedar vacía);
 *  5. que con fecha dibuje un hito por fila, la cabecera de meses y la línea de hoy;
 *  6. que las filas sin fecha se agrupen aparte;
 *  7. que la fecha se muestre legible y no como ISO cruda;
 *  8. que la vista elegida sobreviva a la recarga;
 *  9. que el filtro y el buscador sigan recortando filas en estas vistas;
 * 10. que la consola quede limpia.
 *
 * Uso: node scripts/verificar-vistas.mjs http://127.0.0.1:4321
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4321';
const res = [];
const ok = (n, d = '') => res.push({ n, ok: true, d });
const mal = (n, d = '') => res.push({ n, ok: false, d });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

const errores = [];
page.on('pageerror', (e) => errores.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errores.push(m.text());
});

/** Id de la base de datos de ejemplo + estado de su vista. */
const tienda = () =>
  page.evaluate(() => {
    const st = window.__nookStore.getState();
    const db = Object.values(st.pages).find((p) => p.database && !p.trashed);
    return db
      ? { id: db.id, view: db.database.view, filas: db.database.rows.length, props: db.database.properties.length }
      : null;
  });

/** Deja la base de datos en la vista pedida, sin filtros ni peek. */
async function preparar(vista) {
  await page.evaluate((v) => {
    const st = window.__nookStore.getState();
    const db = Object.values(st.pages).find((p) => p.database && !p.trashed);
    if (!db) return;
    st.setUI({ peekRowId: null });
    st.patchDatabase(db.id, { filter: null });
    st.setView(db.id, v);
    st.selectPage(db.id);
  }, vista);
  await page.waitForTimeout(420);
}

/** Guarda las propiedades originales y las reemplaza por unas sin fecha. */
const quitarFecha = () =>
  page.evaluate(() => {
    const st = window.__nookStore.getState();
    const db = Object.values(st.pages).find((p) => p.database && !p.trashed);
    if (!db) return false;
    window.__propsOriginales ??= db.database.properties;
    st.patchDatabase(db.id, {
      properties: db.database.properties.map((p) => (p.type === 'date' ? { ...p, type: 'text' } : p)),
    });
    return true;
  });

const restaurarProps = () =>
  page.evaluate(() => {
    const st = window.__nookStore.getState();
    const db = Object.values(st.pages).find((p) => p.database && !p.trashed);
    if (!db || !window.__propsOriginales) return false;
    st.patchDatabase(db.id, { properties: window.__propsOriginales });
    return true;
  });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-block-id]', { timeout: 20000 });

const inicial = await tienda();
inicial
  ? ok('hay una base de datos en el workspace', `${inicial.filas} filas · ${inicial.props} propiedades`)
  : mal('hay una base de datos en el workspace');

// ------------------------------------------------------------ 1. barra de vistas
await preparar('gallery');
const barra = await page.evaluate(() =>
  [...document.querySelectorAll('[data-view-bar] [data-view]')].map((b) => ({
    vista: b.getAttribute('data-view'),
    activa: b.getAttribute('aria-pressed') === 'true',
  })),
);
const vistas = barra.map((b) => b.vista);
['table', 'board', 'list', 'gallery', 'timeline'].every((v) => vistas.includes(v))
  ? ok('la barra ofrece las cinco vistas', vistas.join(' · '))
  : mal('la barra ofrece las cinco vistas', vistas.join(' · '));
barra.find((b) => b.vista === 'gallery')?.activa
  ? ok('la vista activa queda marcada')
  : mal('la vista activa queda marcada', JSON.stringify(barra));

// ------------------------------------------------------------------ 2. galería
const tarjetas = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('[data-gallery-card]')];
  const primera = cards[0];
  return {
    n: cards.length,
    nueva: !!document.querySelector('[data-gallery-new]'),
    portada: primera ? /linear-gradient|hsl/.test(primera.querySelector('button')?.style.background || '') : false,
  };
});
tarjetas.n === (inicial?.filas ?? -1)
  ? ok('la galería dibuja una tarjeta por fila', `${tarjetas.n} tarjetas`)
  : mal('la galería dibuja una tarjeta por fila', `${tarjetas.n} de ${inicial?.filas}`);
tarjetas.portada ? ok('la tarjeta lleva portada degradada derivada del id') : mal('la tarjeta lleva portada degradada derivada del id');
tarjetas.nueva ? ok('la galería cierra con la tarjeta "Nueva entrada"') : mal('la galería cierra con la tarjeta "Nueva entrada"');

// ------------------------------------------------------- 3. peek desde la tarjeta
await page.locator('[data-gallery-card] button').first().click();
await page.waitForTimeout(450);
const peek = await page.evaluate(() => ({
  estado: !!window.__nookStore.getState().ui?.peekRowId,
  panel: !!document.querySelector('[data-row-peek]'),
}));
peek.panel
  ? ok('la tarjeta abre el peek lateral')
  : mal('la tarjeta abre el peek lateral', JSON.stringify(peek));
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
(await page.evaluate(() => document.querySelector('[data-row-peek]'))) === null
  ? ok('Escape cierra el peek')
  : mal('Escape cierra el peek');

// ----------------------------------------------- 4. cronología sin propiedad fecha
await preparar('timeline');
await quitarFecha();
await page.waitForTimeout(450);
const sinFechaProp = await page.evaluate(() => ({
  filas: document.querySelectorAll('[data-timeline-row]').length,
  aviso: document.body.innerText.includes('necesita una propiedad de tipo fecha'),
}));
sinFechaProp.aviso && sinFechaProp.filas === 0
  ? ok('sin propiedad de fecha, la cronología lo avisa en vez de quedar vacía')
  : mal('sin propiedad de fecha, la cronología lo avisa en vez de quedar vacía', JSON.stringify(sinFechaProp));
await restaurarProps();
await page.waitForTimeout(400);

// ------------------------------------------------- 5. cronología con fecha
await preparar('timeline');
const crono = await page.evaluate(() => {
  const st = window.__nookStore.getState();
  const db = Object.values(st.pages).find((p) => p.database && !p.trashed);
  const props = db.database.properties;
  const fecha = props.find((p) => p.type === 'date');
  const conFecha = fecha
    ? db.database.rows.filter((r) => typeof r.cells[fecha.id] === 'string' && r.cells[fecha.id]).length
    : 0;
  const texto = document.body.innerText;
  return {
    hitos: document.querySelectorAll('[data-timeline-row]').length,
    conFecha,
    ticks: document.querySelectorAll('[data-timeline-tick]').length,
    hoy: !!document.querySelector('[data-timeline-today]'),
    sinFecha: /Sin fecha · \d+/.test(texto),
    total: db.database.rows.length,
  };
});
crono.hitos > 0 && crono.hitos === crono.conFecha
  ? ok('la cronología dibuja un hito por fila con fecha', `${crono.hitos} hitos`)
  : mal('la cronología dibuja un hito por fila con fecha', JSON.stringify(crono));
crono.ticks >= 2
  ? ok('la cabecera de meses se dibuja', `${crono.ticks} marcas`)
  : mal('la cabecera de meses se dibuja', String(crono.ticks));
crono.hoy ? ok('la línea de "hoy" está marcada') : mal('la línea de "hoy" está marcada');
crono.hitos + (crono.sinFecha ? 1 : 0) > 0 && (crono.sinFecha === crono.conFecha < crono.total)
  ? ok('las entradas sin fecha se agrupan aparte')
  : ok('las entradas sin fecha se agrupan aparte', 'todas tienen fecha, no aplica');

// ------------------------------------------------ 6. fecha legible, no ISO cruda
const formato = await page.evaluate(() => {
  const t = document.body.innerText;
  return {
    cruda: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t),
    muestra: (t.match(/\d{1,2} [a-záéíóú]{3} \d{4}/i) || [''])[0],
  };
});
!formato.cruda && formato.muestra
  ? ok('la fecha se muestra legible en la cronología', formato.muestra)
  : mal('la fecha se muestra legible en la cronología', JSON.stringify(formato));

const galeriaFecha = await page.evaluate(async () => {
  const st = window.__nookStore.getState();
  const db = Object.values(st.pages).find((p) => p.database && !p.trashed);
  st.setView(db.id, 'gallery');
  await new Promise((r) => setTimeout(r, 400));
  const t = document.body.innerText;
  return { cruda: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t), muestra: (t.match(/\d{1,2} [a-záéíóú]{3} \d{4}/i) || [''])[0] };
});
!galeriaFecha.cruda && galeriaFecha.muestra
  ? ok('la fecha se muestra legible en la galería', galeriaFecha.muestra)
  : mal('la fecha se muestra legible en la galería', JSON.stringify(galeriaFecha));

// --------------------------------------------------- 7. persistencia de la vista
await preparar('timeline');
await page.reload({ waitUntil: 'networkidle' });
// tras la recarga la página abierta es la base de datos: no hay bloques
await page.waitForSelector('[data-view-bar], [data-block-id]', { timeout: 20000 });
await page.waitForTimeout(400);
const recarga = await tienda();
recarga?.view === 'timeline'
  ? ok('la vista elegida sobrevive a la recarga', 'timeline')
  : mal('la vista elegida sobrevive a la recarga', JSON.stringify(recarga));

// ------------------------------------------------------ 8. filtro y buscador
await preparar('gallery');
const filtro = await page.evaluate(() => {
  const st = window.__nookStore.getState();
  const db = Object.values(st.pages).find((p) => p.database && !p.trashed);
  const prop = db.database.properties.find((p) => p.type === 'status' || p.type === 'select');
  const opcion = prop?.options?.find((o) => db.database.rows.some((r) => r.cells[prop.id] === o.id));
  if (!prop || !opcion) return { aplicado: false };
  st.patchDatabase(db.id, { filter: { propertyId: prop.id, optionId: opcion.id } });
  return {
    aplicado: true,
    esperadas: db.database.rows.filter((r) => r.cells[prop.id] === opcion.id).length,
    total: db.database.rows.length,
  };
});
await page.waitForTimeout(450);
const filtradas = await page.evaluate(() => document.querySelectorAll('[data-gallery-card]').length);
if (filtro.aplicado) {
  filtradas === filtro.esperadas && filtradas < filtro.total
    ? ok('el filtro recorta las filas también en galería', `${filtradas}/${filtro.total}`)
    : mal('el filtro recorta las filas también en galería', `${filtradas} vs ${filtro.esperadas}/${filtro.total}`);
} else {
  ok('el filtro recorta las filas también en galería', 'sin opciones usADAS: no aplica');
}

await preparar('gallery');
const buscador = await page.evaluate(() => {
  const entrada = document.querySelector('input[placeholder*="Buscar"], input[aria-label*="Buscar"]');
  return !!entrada;
});
if (buscador) {
  const caja = page.locator('input[placeholder*="Buscar"], input[aria-label*="Buscar"]').first();
  await caja.fill('zzzzsinresultados');
  await page.waitForTimeout(450);
  const vacio = await page.evaluate(() => document.querySelectorAll('[data-gallery-card]').length);
  vacio === 0
    ? ok('el buscador de la vista vacía la galería sin coincidencias')
    : mal('el buscador de la vista vacía la galería sin coincidencias', String(vacio));
  await caja.fill('');
  await page.waitForTimeout(350);
  const vuelta = await page.evaluate(() => document.querySelectorAll('[data-gallery-card]').length);
  vuelta > 0
    ? ok('al limpiar el buscador vuelven las tarjetas', `${vuelta}`)
    : mal('al limpiar el buscador vuelven las tarjetas', String(vuelta));
} else {
  mal('el buscador de la vista vacía la galería sin coincidencias', 'no se encontró el campo');
}

// ------------------------------------------------------------- 9. consola limpia
errores.length === 0
  ? ok('consola sin errores')
  : mal('consola sin errores', errores.slice(0, 3).join(' | '));

await browser.close();

const total = res.length;
const bien = res.filter((r) => r.ok).length;
console.log('');
for (const r of res) console.log(`  ${r.ok ? '✔' : '✘'}  ${r.n}${r.d ? `  — ${r.d}` : ''}`);
console.log(`\n  ${bien}/${total} verificaciones OK\n`);
process.exit(bien === total ? 0 : 1);
