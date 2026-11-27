/**
 * Verificación de la vista calendario (la sexta vista de la app de referencia).
 *
 * Lo que puede romperse sin que se note en una captura:
 *
 *  1. que la barra ofrezca seis vistas y marque Calendario como activa;
 *  2. que el mes se dibuje con siete columnas y la rejilla completa (42 celdas);
 *  3. que hoy quede marcado y que la cabecera diga el mes y el año;
 *  4. que cada fila con fecha caiga en la celda de **su** día;
 *  5. que ‹ y › cambien de mes y que "Hoy" vuelva al actual;
 *  6. que pulsar una entrada abra el peek y Escape lo cierre;
 *  7. que el "+" de un día cree una fila con esa fecha ya puesta;
 *  8. que las entradas sin fecha se listen aparte;
 *  9. que sin propiedad de fecha la vista lo avise;
 * 10. que la vista elegida sobreviva a la recarga y la consola quede limpia.
 *
 * Uso: node scripts/verificar-calendario.mjs http://127.0.0.1:4321
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

const db = () =>
  page.evaluate(() => {
    const st = window.__nookStore.getState();
    const p = Object.values(st.pages).find((x) => x.database && !x.trashed);
    return p ? { id: p.id, view: p.database.view, filas: p.database.rows.length } : null;
  });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-block-id]', { timeout: 20000 });

const inicial = await db();
await page.evaluate((id) => {
  const st = window.__nookStore.getState();
  st.patchDatabase(id, { filter: null });
  st.setView(id, "calendar");
  st.selectPage(id);
}, inicial.id);
await page.waitForTimeout(700);

// -------------------------------------------------------------- 1. la barra
const barra = await page.evaluate(() =>
  [...document.querySelectorAll('[data-view-bar] [data-view]')].map((b) => ({
    vista: b.getAttribute("data-view"),
    activa: b.getAttribute("aria-pressed") === "true",
  })),
);
barra.length === 6 && barra.some((b) => b.vista === "calendar")
  ? ok("la barra ofrece seis vistas", barra.map((b) => b.vista).join(" · "))
  : mal("la barra ofrece seis vistas", JSON.stringify(barra));
barra.find((b) => b.vista === "calendar")?.activa
  ? ok("la vista calendario queda marcada como activa")
  : mal("la vista calendario queda marcada como activa");

// ------------------------------------------------------- 2. rejilla del mes
const rejilla = await page.evaluate(() => {
  const celdas = [...document.querySelectorAll("[data-cal-day]")];
  const cabecera = document.querySelector("[data-cal-label]")?.textContent ?? "";
  return {
    celdas: celdas.length,
    dias: celdas.filter((c) => !/bg-surface-hover\/20/.test(c.className)).length,
    cabecera: cabecera.trim(),
    columnas: getComputedStyle(document.querySelector("[data-cal-day]").parentElement).gridTemplateColumns.split(" ").length,
  };
});
rejilla.celdas === 42
  ? ok("la rejilla tiene 42 celdas (seis semanas)", `${rejilla.dias} días del mes`)
  : mal("la rejilla tiene 42 celdas", String(rejilla.celdas));
rejilla.columnas === 7 ? ok("la rejilla tiene siete columnas") : mal("la rejilla tiene siete columnas", String(rejilla.columnas));

const crudo = new Date().toLocaleDateString("es-AR", { month: "long", year: "numeric" });
const mesActual = crudo.charAt(0).toUpperCase() + crudo.slice(1);
rejilla.cabecera.toLowerCase() === mesActual.toLowerCase()
  ? ok("la cabecera dice el mes y el año", rejilla.cabecera)
  : mal("la cabecera dice el mes y el año", `${rejilla.cabecera} ≠ ${mesActual}`);

// --------------------------------------------------------------- 3. hoy
const hoyClave = (() => {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
})();
(await page.evaluate(() => document.querySelectorAll("[data-today]").length)) === 1
  ? ok("hoy queda marcado en la rejilla", hoyClave)
  : mal("hoy queda marcado en la rejilla");
(await page.evaluate((k) => document.querySelector(`[data-cal-day="${k}"]`)?.hasAttribute("data-today"), hoyClave))
  ? ok("la marca de hoy está en la celda correcta")
  : mal("la marca de hoy está en la celda correcta");

// -------------------------------------------- 4. cada fila en su día
const ubicacion = await page.evaluate(() => {
  const st = window.__nookStore.getState();
  const p = Object.values(st.pages).find((x) => x.database && !x.trashed);
  const props = p.database.properties;
  const fecha = props.find((x) => x.type === "date");
  const titulo = props.find((x) => x.type === "title");
  // filas con fecha dentro del mes que se está mostrando
  const chips = [...document.querySelectorAll("[data-cal-chip]")].map((c) => ({
    id: c.getAttribute("data-cal-chip"),
    dia: c.closest("[data-cal-day]").getAttribute("data-cal-day"),
  }));
  const filas = p.database.rows
    .filter((r) => typeof r.cells[fecha.id] === "string" && r.cells[fecha.id])
    .map((r) => ({ id: r.id, dia: String(r.cells[fecha.id]).slice(0, 10), titulo: r.cells[titulo.id] }));
  return { chips, filas };
});
const bienUbicadas = ubicacion.chips.filter((c) => ubicacion.filas.find((f) => f.id === c.id)?.dia === c.dia);
ubicacion.chips.length > 0 && bienUbicadas.length === ubicacion.chips.length
  ? ok("cada entrada cae en la celda de su fecha", `${ubicacion.chips.length} entradas`)
  : mal(
      "cada entrada cae en la celda de su fecha",
      `${bienUbicadas.length}/${ubicacion.chips.length} · fechas: ${ubicacion.filas
        .map((f) => f.dia)
        .slice(0, 3)
        .join(",")}`,
    );

// ---------------------------------------------------- 5. navegación de mes
const leerMes = () => page.evaluate(() => document.querySelector("[data-cal-label]")?.textContent?.trim() ?? "");
const mes0 = await leerMes();
await page.locator("[data-cal-next]").click();
await page.waitForTimeout(350);
const mes1 = await leerMes();
mes1 !== mes0 ? ok("› avanza al mes siguiente", `${mes0} → ${mes1}`) : mal("› avanza al mes siguiente", `${mes0} → ${mes1}`);
await page.locator("[data-cal-prev]").click();
await page.waitForTimeout(300);
await page.locator("[data-cal-prev]").click();
await page.waitForTimeout(350);
const mes2 = await leerMes();
mes2 !== mes0 && mes2 !== mes1 ? ok("‹ retrocede de mes", mes2) : mal("‹ retrocede de mes", mes2);
await page.locator("[data-cal-today]").click();
await page.waitForTimeout(350);
(await leerMes()) === mes0 ? ok('"Hoy" vuelve al mes actual') : mal('"Hoy" vuelve al mes actual', await leerMes());

// ------------------------------------------------------ 6. chip → peek
const chip = page.locator("[data-cal-chip]").first();
if ((await chip.count()) > 0) {
  await chip.click();
  await page.waitForSelector("[data-row-peek]", { timeout: 5000 });
  ok("pulsar una entrada abre el panel de la fila");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  (await page.evaluate(() => document.querySelector("[data-row-peek]"))) === null
    ? ok("Escape cierra el panel")
    : mal("Escape cierra el panel");
} else {
  mal("pulsar una entrada abre el panel de la fila", "no hay entradas en el mes visible");
}

// ------------------------------------------- 7. crear entrada en un día
const antes = (await db()).filas;
await page.locator(`[data-add-day="${hoyClave}"]`).click();
await page.waitForTimeout(600);
const creada = await page.evaluate(
  ({ antes, hoy }) => {
    const st = window.__nookStore.getState();
    const p = Object.values(st.pages).find((x) => x.database && !x.trashed);
    const fecha = p.database.properties.find((x) => x.type === "date");
    const nueva = p.database.rows[p.database.rows.length - 1];
    return {
      filas: p.database.rows.length,
      fecha: String(nueva?.cells[fecha.id] ?? "").slice(0, 10),
      mismoDia: p.database.rows.filter((r) => String(r.cells[fecha.id]).slice(0, 10) === hoy).length,
      antes,
    };
  },
  { antes, hoy: hoyClave },
);
creada.filas === antes + 1 && creada.fecha === hoyClave
  ? ok('el "+" de un día crea la entrada con esa fecha', `${creada.filas} filas`)
  : mal('el "+" de un día crea la entrada con esa fecha', JSON.stringify(creada));

// ------------------------------------------------------- 8. sin fecha
const sinFecha = await page.evaluate(() => {
  const st = window.__nookStore.getState();
  const p = Object.values(st.pages).find((x) => x.database && !x.trashed);
  const fecha = p.database.properties.find((x) => x.type === "date");
  const vacias = p.database.rows.filter((r) => !r.cells[fecha.id]).length;
  return { vacias, aviso: /Sin fecha · \d+/.test(document.body.innerText) };
});
sinFecha.vacias === 0
  ? ok("las entradas sin fecha se listan aparte", "no hay entradas sin fecha: no aplica")
  : sinFecha.aviso
    ? ok("las entradas sin fecha se listan aparte", `${sinFecha.vacias}`)
    : mal("las entradas sin fecha se listan aparte", JSON.stringify(sinFecha));

// ------------------------------------- 9. sin propiedad de fecha: aviso
await page.evaluate(() => {
  const st = window.__nookStore.getState();
  const p = Object.values(st.pages).find((x) => x.database && !x.trashed);
  window.__propsCal ??= p.database.properties;
  st.patchDatabase(p.id, {
    properties: p.database.properties.map((x) => (x.type === "date" ? { ...x, type: "text" } : x)),
  });
});
await page.waitForTimeout(450);
const aviso = await page.evaluate(() => ({
  celdas: document.querySelectorAll("[data-cal-day]").length,
  texto: document.body.innerText.includes("El calendario necesita una propiedad de tipo fecha"),
}));
aviso.celdas === 0 && aviso.texto
  ? ok("sin propiedad de fecha, el calendario lo avisa en vez de quedar vacío")
  : mal("sin propiedad de fecha, el calendario lo avisa en vez de quedar vacío", JSON.stringify(aviso));
await page.evaluate(() => {
  const st = window.__nookStore.getState();
  const p = Object.values(st.pages).find((x) => x.database && !x.trashed);
  st.patchDatabase(p.id, { properties: window.__propsCal });
});
await page.waitForTimeout(400);

// --------------------------------------------- 10. persistencia + consola
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("[data-view-bar], [data-block-id]", { timeout: 20000 });
await page.waitForTimeout(400);
const recarga = await db();
recarga?.view === "calendar"
  ? ok("la vista calendario sobrevive a la recarga")
  : mal("la vista calendario sobrevive a la recarga", JSON.stringify(recarga));

errores.length === 0 ? ok("consola sin errores") : mal("consola sin errores", errores.slice(0, 3).join(" | "));

await browser.close();

const total = res.length;
const bien = res.filter((r) => r.ok).length;
console.log("");
for (const r of res) console.log(`  ${r.ok ? "✔" : "✘"}  ${r.n}${r.d ? `  — ${r.d}` : ""}`);
console.log(`\n  ${bien}/${total} verificaciones OK\n`);
process.exit(bien === total ? 0 : 1);
