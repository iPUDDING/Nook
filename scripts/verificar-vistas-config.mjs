/**
 * Verificación de la configuración por vista de la base de datos.
 *
 * En la app de referencia cada vista guarda su propio filtro, orden y
 * agrupación: filtrar la tabla no cambia el board. Lo que puede fallar:
 *
 *  1. que un filtro puesto en la tabla se vea sólo en la tabla;
 *  2. que al volver a la tabla su filtro siga puesto;
 *  3. que el board conserve su propia agrupación y su propio filtro;
 *  4. que el orden (sorts) también sea por vista;
 *  5. que el buscador de la vista siga afectando a todas (es efímero, no config);
 *  6. que todo sobreviva a la recarga y la consola quede limpia.
 *
 * Uso: node scripts/verificar-vistas-config.mjs http://127.0.0.1:4321
 */

import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:4321";
const res = [];
const ok = (n, d = "") => res.push({ n, ok: true, d });
const mal = (n, d = "") => res.push({ n, ok: false, d });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon|404/i.test(m.text())) errores.push(m.text());
});

const estado = () =>
  page.evaluate(() => {
    const st = window.__nookStore.getState();
    const p = Object.values(st.pages).find((x) => x.database && !x.trashed);
    const db = p.database;
    return {
      id: p.id,
      view: db.view,
      filter: db.filter,
      sorts: db.sorts,
      groupBy: db.groupBy,
      guardadas: Object.keys(db.viewConfig ?? {}),
      filas: db.rows.length,
    };
  });

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("[data-block-id]", { timeout: 20000 });

const inicial = await estado();
await page.evaluate((id) => {
  const st = window.__nookStore.getState();
  st.patchDatabase(id, { filter: null, sorts: [] });
  st.setView(id, "table");
  st.selectPage(id);
}, inicial.id);
await page.waitForTimeout(600);

/** Opciones de estado del ejemplo, para filtrar de verdad. */
const opciones = await page.evaluate((id) => {
  const st = window.__nookStore.getState();
  const db = st.pages[id].database;
  const prop = db.properties.find((p) => p.type === "status" || p.type === "select");
  return {
    prop: prop.id,
    opciones: prop.options.map((o) => ({
      id: o.id,
      usadas: db.rows.filter((r) => r.cells[prop.id] === o.id).length,
    })),
  };
}, inicial.id);
const conFilas = opciones.opciones.filter((o) => o.usadas > 0 && o.usadas < 8);

// ---------------------------------------------- 1. filtro sólo en la tabla
await page.evaluate(
  ({ id, prop, op }) => window.__nookStore.getState().patchDatabase(id, { filter: { propertyId: prop, optionId: op } }),
  { id: inicial.id, prop: opciones.prop, op: conFilas[0].id },
);
await page.waitForTimeout(500);
const enTabla = await page.evaluate(() => ({
  filas: document.querySelectorAll("[data-tabla-fila]").length,
  texto: (document.body.innerText.match(/(\d+) de (\d+) filas/) ?? []).slice(1).join("/"),
}));
enTabla.texto.startsWith(String(conFilas[0].usadas))
  ? ok("el filtro se aplica en la tabla", `${enTabla.texto}`)
  : mal("el filtro se aplica en la tabla", JSON.stringify(enTabla));

// ------------------------------------------------ 2. el board no lo hereda
await page.evaluate((id) => window.__nookStore.getState().setView(id, "board"), inicial.id);
await page.waitForTimeout(600);
const enBoard = await estado();
enBoard.filter === null
  ? ok("cambiar al board no arrastra el filtro de la tabla")
  : mal("cambiar al board no arrastra el filtro de la tabla", JSON.stringify(enBoard.filter));

// ------------------------------------- 3. el board guarda su propia config
await page.evaluate(
  ({ id, prop, op }) => window.__nookStore.getState().patchDatabase(id, { filter: { propertyId: prop, optionId: op } }),
  { id: inicial.id, prop: opciones.prop, op: conFilas[conFilas.length - 1].id },
);
await page.waitForTimeout(500);
const otroFiltro = await estado();
otroFiltro.filter?.optionId === conFilas[conFilas.length - 1].id
  ? ok("el board acepta su propio filtro")
  : mal("el board acepta su propio filtro", JSON.stringify(otroFiltro.filter));

const grupoBoard = otroFiltro.groupBy;
await page.evaluate((id) => window.__nookStore.getState().setView(id, "table"), inicial.id);
await page.waitForTimeout(600);
const volvioTabla = await estado();
volvioTabla.filter?.optionId === conFilas[0].id
  ? ok("al volver a la tabla sigue su filtro, no el del board")
  : mal("al volver a la tabla sigue su filtro, no el del board", JSON.stringify(volvioTabla.filter));

await page.evaluate((id) => window.__nookStore.getState().setView(id, "board"), inicial.id);
await page.waitForTimeout(600);
const volvioBoard = await estado();
volvioBoard.filter?.optionId === conFilas[conFilas.length - 1].id && volvioBoard.groupBy === grupoBoard
  ? ok("el board recupera su filtro y su agrupación")
  : mal("el board recupera su filtro y su agrupación", JSON.stringify(volvioBoard));

// --------------------------------------------------------- 4. orden por vista
await page.evaluate(
  ({ id, prop }) =>
    window.__nookStore.getState().patchDatabase(id, { filter: null, sorts: [{ propertyId: prop, dir: "desc" }] }),
  { id: inicial.id, prop: opciones.prop },
);
await page.waitForTimeout(500);
await page.evaluate((id) => window.__nookStore.getState().setView(id, "list"), inicial.id);
await page.waitForTimeout(600);
const enLista = await estado();
enLista.sorts.length === 0
  ? ok("el orden del board no se arrastra a la lista")
  : mal("el orden del board no se arrastra a la lista", JSON.stringify(enLista.sorts));

await page.evaluate((id) => window.__nookStore.getState().setView(id, "board"), inicial.id);
await page.waitForTimeout(600);
const ordenVuelto = await estado();
ordenVuelto.sorts.length === 1 && ordenVuelto.sorts[0].dir === "desc"
  ? ok("el board conserva su orden")
  : mal("el board conserva su orden", JSON.stringify(ordenVuelto.sorts));

// ------------------------------------- 5. el buscador no es configuración
const buscador = await page.evaluate((id) => {
  const st = window.__nookStore.getState();
  st.setView(id, "table");
  return true;
}, inicial.id);
await page.waitForTimeout(500);
const caja = page.locator('input[placeholder*="Buscar"], input[aria-label*="Buscar"]').first();
if (buscador && (await caja.count()) > 0) {
  await caja.fill("zzzznoexiste2");
  await page.waitForTimeout(400);
  const vacio = await page.evaluate(() => (document.body.innerText.match(/(\d+) de (\d+) filas/) ?? []).slice(1).join("/"));
  await caja.fill("");
  await page.waitForTimeout(300);
  const limpio = await page.evaluate(() => (document.body.innerText.match(/(\d+) de (\d+) filas/) ?? []).slice(1).join("/"));
  vacio.startsWith("0") && !limpio.startsWith("0")
    ? ok("el buscador filtra sin tocar el filtro guardado", `${vacio} → ${limpio}`)
    : mal("el buscador filtra sin tocar el filtro guardado", `${vacio} → ${limpio}`);
} else {
  mal("el buscador filtra sin tocar el filtro guardado", "no se encontró el campo");
}

// ---------------------------------------------- 6. persistencia y consola
const antesRecarga = await estado();
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("[data-view-bar], [data-block-id]", { timeout: 20000 });
await page.waitForTimeout(600);
const trasRecarga = await estado();
trasRecarga.filter?.optionId === antesRecarga.filter?.optionId && trasRecarga.sorts.length === antesRecarga.sorts.length
  ? ok("cada vista conserva su configuración tras recargar", `vista ${trasRecarga.view}`)
  : mal("cada vista conserva su configuración tras recargar", JSON.stringify({ antesRecarga, trasRecarga }));

errores.length === 0 ? ok("consola sin errores") : mal("consola sin errores", errores.slice(0, 3).join(" | "));

await browser.close();

const total = res.length;
const bien = res.filter((r) => r.ok).length;
console.log("");
for (const r of res) console.log(`  ${r.ok ? "✔" : "✘"}  ${r.n}${r.d ? `  — ${r.d}` : ""}`);
console.log(`\n  ${bien}/${total} verificaciones OK\n`);
process.exit(bien === total ? 0 : 1);
