/**
 * Verificación de arrastrar páginas en el árbol lateral.
 *
 * La app de referencia permite anidar páginas arrastrándolas unas dentro de
 * otras, sacarlas de donde estaban y cambiar el orden soltando arriba o abajo
 * de una fila. Lo que puede fallar:
 *
 *  1. que la fila de una página sea arrastrable y declare el tipo de página;
 *  2. que la fila muestre la zona donde va a caer (antes / dentro / después);
 *  3. que soltar en el centro anide la página dentro de la otra;
 *  4. que soltar arriba o abajo reordene entre hermanos;
 *  5. que el orden se **renumere** sin repetidos (dos hermanos con el mismo
 *     `order` dejan el árbol en orden impredecible);
 *  6. que no se pueda soltar una página dentro de su propio descendiente;
 *  7. que soltar sobre la cabecera la devuelva a la raíz;
 *  8. que soltar sobre el encabezado de una sección la mueva a ese espacio
 *     (Privado / Equipo);
 *  9. que todo sobreviva a la recarga y la consola quede limpia.
 *
 * Uso: node scripts/verificar-arrastrar-paginas.mjs http://127.0.0.1:4321
 */

import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:4321";
const res = [];
const ok = (n, d = "") => res.push({ n, ok: true, d });
const mal = (n, d = "") => res.push({ n, ok: false, d });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 950 } });

const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon|404/i.test(m.text())) errores.push(m.text());
});

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("[data-block-id]", { timeout: 20000 });

/** Tres páginas hermanas en la raíz, con nombres que se ordenan a mano. */
const ids = await page.evaluate(() => {
  const st = window.__nookStore.getState();
  const base = Object.keys(st.pages).length;
  const a = st.createPage(null, { title: "Alfa arrastre" });
  const b = st.createPage(null, { title: "Beta arrastre" });
  const c = st.createPage(null, { title: "Gamma arrastre" });
  st.selectPage(a);
  return { a, b, c, base };
});
await page.waitForTimeout(700);

const estado = () =>
  page.evaluate(({ a, b, c }) => {
    const st = window.__nookStore.getState();
    const p = (id) => (st.pages[id] ? { parentId: st.pages[id].parentId, order: st.pages[id].order, space: st.pages[id].space } : null);
    // hermanos del padre de "a", para comprobar que el orden no tiene repetidos
    const padre = st.pages[a]?.parentId ?? null;
    const hermanos = Object.values(st.pages)
      .filter((x) => x.parentId === padre && !x.trashed)
      .sort((x, y) => x.order - y.order)
      .map((x) => ({ id: x.id, order: x.order }));
    return { a: p(a), b: p(b), c: p(c), hermanos };
  }, ids);

// ------------------------------------------------ 1. la fila es arrastrable
const filaA = page.locator(`[data-page-row="${ids.a}"]`);
(await filaA.getAttribute("draggable")) === "true"
  ? ok("la fila de la página es arrastrable")
  : mal("la fila de la página es arrastrable");

// ------------------------------------------------------- 2. zonas de soltado
// El indicador se comprueba con eventos de arrastre sintéticos: los `dragover`
// que Playwright genera moviendo el mouse a mano no siempre llegan a la fila
// destino, y el handler es exactamente el mismo (un listener nativo sobre la
// barra). El arrastre real se prueba más abajo, con `dragTo`.
const zonas = await page.evaluate(({ a, b }) => {
  const filaA = document.querySelector(`[data-page-row="${a}"]`);
  const filaB = document.querySelector(`[data-page-row="${b}"]`);
  const dt = new DataTransfer();
  filaA.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
  const r = filaB.getBoundingClientRect();
  const leer = (fraccion) => {
    const ev = new DragEvent("dragover", {
      bubbles: true,
      cancelable: true,
      dataTransfer: dt,
      clientX: r.left + 40,
      clientY: r.top + r.height * fraccion,
    });
    filaB.dispatchEvent(ev);
    return filaB.getAttribute("data-drop-zone");
  };
  const salida = { antes: leer(0.1), dentro: leer(0.5), despues: leer(0.9) };
  filaA.dispatchEvent(new DragEvent("dragend", { bubbles: true }));
  return salida;
}, { a: ids.a, b: ids.b });
zonas.dentro === "dentro" && zonas.antes === "antes" && zonas.despues === "despues"
  ? ok("la fila indica si la página cae antes, dentro o después", `${zonas.antes} · ${zonas.dentro} · ${zonas.despues}`)
  : mal("la fila indica si la página cae antes, dentro o después", JSON.stringify(zonas));

// el indicador se apaga al terminar el arrastre
await page.waitForTimeout(200);
(await page.evaluate(() => document.querySelectorAll("[data-drop-zone]").length)) === 0
  ? ok("el indicador se apaga al terminar el arrastre")
  : mal("el indicador se apaga al terminar el arrastre");

// ------------------------------------------------ 3. soltar dentro (anidar)
const cajaA = await page.locator(`[data-page-row="${ids.a}"]`).boundingBox();
const cajaB = await page.locator(`[data-page-row="${ids.b}"]`).boundingBox();
await page.mouse.move(cajaA.x + 40, cajaA.y + cajaA.height / 2);
await page.mouse.down();
await page.mouse.move(cajaA.x + 60, cajaA.y + cajaA.height / 2 + 4, { steps: 3 });
await page.mouse.move(cajaB.x + 60, cajaB.y + cajaB.height / 2, { steps: 8 });
await page.waitForTimeout(150);
await page.mouse.up();
await page.waitForTimeout(700);
let e = await estado();
e.a.parentId === ids.b
  ? ok("soltar en el centro anida la página dentro de la otra")
  : mal("soltar en el centro anida la página dentro de la otra", JSON.stringify(e.a));

// ------------------------------------------- 4 y 5. reordenar y renumerar
// A ya está dentro de B: se saca arrastrándola a la cabecera y después se
// ordena C arriba de B
await page.evaluate(({ a }) => window.__nookStore.getState().movePageTo(a, null, 0), ids);
await page.waitForTimeout(500);
const cajaC = await page.locator(`[data-page-row="${ids.c}"]`).boundingBox();
const cajaB2 = await page.locator(`[data-page-row="${ids.b}"]`).boundingBox();
await page.mouse.move(cajaC.x + 40, cajaC.y + cajaC.height / 2);
await page.mouse.down();
await page.mouse.move(cajaB2.x + 60, cajaB2.y + 1, { steps: 8 });
await page.waitForTimeout(150);
await page.mouse.up();
await page.waitForTimeout(700);
e = await estado();
const ordenB = e.b.order;
const ordenC = e.c.order;
ordenC < ordenB
  ? ok("soltar arriba de una fila reordena el hermano", `C(${ordenC}) antes de B(${ordenB})`)
  : mal("soltar arriba de una fila reordena el hermano", `C(${ordenC}) · B(${ordenB})`);

const ordenes = e.hermanos.map((h) => h.order);
new Set(ordenes).size === ordenes.length && ordenes.join(",") === ordenes.map((_, i) => i).join(",")
  ? ok("el orden de los hermanos queda renumerado sin repetidos", ordenes.join(" · "))
  : mal("el orden de los hermanos queda renumerado sin repetidos", JSON.stringify(ordenes));

// ---------------------------------- 6. no se puede soltar en un descendiente
const anidado = await page.evaluate(async ({ b, c }) => {
  const st = window.__nookStore.getState();
  st.movePageTo(c, b, 0); // C dentro de B
  const antes = st.pages[b].parentId;
  st.movePageTo(b, c, 0); // B dentro de C (que es su hijo) → debe ignorarse
  const despues = window.__nookStore.getState().pages[b].parentId;
  return { antes, despues };
}, ids);
anidado.despues === anidado.antes
  ? ok("no se puede mover una página dentro de su propio descendiente")
  : mal("no se puede mover una página dentro de su propio descendiente", JSON.stringify(anidado));

// ------------------------------------------- 7. soltar en la cabecera = raíz
await page.evaluate(({ a }) => window.__nookStore.getState().movePageTo(a, null, 0), ids);
await page.waitForTimeout(400);
const filaA2 = await page.locator(`[data-page-row="${ids.a}"]`).boundingBox();
const cabecera = await page.locator("[data-root-drop]").boundingBox();
await page.mouse.move(filaA2.x + 40, filaA2.y + filaA2.height / 2);
await page.mouse.down();
await page.mouse.move(cabecera.x + 40, cabecera.y + 12, { steps: 8 });
await page.waitForTimeout(150);
await page.mouse.up();
await page.waitForTimeout(600);
// primero se mete dentro de B para que la cabecera tenga algo que sacar
await page.evaluate(({ a, b }) => window.__nookStore.getState().movePageTo(a, b, 0), ids);
await page.waitForTimeout(400);
const antesCabecera = (await estado()).a.parentId;
await page.evaluate(({ a }) => window.__nookStore.getState().selectPage(a), ids);
await page.waitForTimeout(300);
const filaA3 = await page.locator(`[data-page-row="${ids.a}"]`).boundingBox();
await page.mouse.move(filaA3.x + 40, filaA3.y + filaA3.height / 2);
await page.mouse.down();
await page.mouse.move(cabecera.x + 40, cabecera.y + 12, { steps: 10 });
await page.waitForTimeout(200);
await page.mouse.up();
await page.waitForTimeout(700);
e = await estado();
antesCabecera === ids.b && e.a.parentId === null
  ? ok("soltar en la cabecera devuelve la página a la raíz")
  : mal("soltar en la cabecera devuelve la página a la raíz", `antes ${antesCabecera} · ahora ${e.a.parentId}`);

// --------------------------------- 8. soltar en el encabezado de una sección
await page.evaluate(({ a }) => window.__nookStore.getState().movePageTo(a, null, 0, "private"), ids);
await page.waitForTimeout(400);
const filaA4 = await page.locator(`[data-page-row="${ids.a}"]`).boundingBox();
const seccionEquipo = await page.locator('[data-section-drop="team"]').boundingBox();
await page.mouse.move(filaA4.x + 40, filaA4.y + filaA4.height / 2);
await page.mouse.down();
await page.mouse.move(seccionEquipo.x + 60, seccionEquipo.y + 12, { steps: 10 });
await page.waitForTimeout(200);
await page.mouse.up();
await page.waitForTimeout(700);
e = await estado();
e.a.space === "team"
  ? ok('soltar en el encabezado mueve la página a ese espacio', "Equipo")
  : mal('soltar en el encabezado mueve la página a ese espacio', JSON.stringify(e.a));

// ------------------------------------------- 9. persistencia y consola
await page.evaluate(({ a, b }) => window.__nookStore.getState().movePageTo(a, b, 0), ids);
await page.waitForTimeout(400);
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("aside", { timeout: 20000 });
await page.waitForTimeout(600);
e = await estado();
e.a.parentId === ids.b
  ? ok("el anidado sobrevive a la recarga")
  : mal("el anidado sobrevive a la recarga", JSON.stringify(e.a));

errores.length === 0 ? ok("consola sin errores") : mal("consola sin errores", errores.slice(0, 3).join(" | "));

await browser.close();

const total = res.length;
const bien = res.filter((r) => r.ok).length;
console.log("");
for (const r of res) console.log(`  ${r.ok ? "✔" : "✘"}  ${r.n}${r.d ? `  — ${r.d}` : ""}`);
console.log(`\n  ${bien}/${total} verificaciones OK\n`);
process.exit(bien === total ? 0 : 1);
