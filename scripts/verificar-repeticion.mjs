/**
 * Verificación de las filas que se repiten (tareas recurrentes).
 *
 * La app de referencia no tiene tareas recurrentes de verdad: hay plantillas que
 * se duplican el día que toca, así que no ves la tarea futura hasta que llega y
 * te quedan copias sueltas. Acá la fila es la tarea. Lo que puede fallar:
 *
 *  1. que la repetición no se guarde;
 *  2. que el calendario no muestre las apariciones futuras;
 *  3. que una fila sin repetición deje «fantasmas» dando vueltas;
 *  4. que completar no mueva la fecha, o la mueva al pasado;
 *  5. que una tarea mensual del 31 se quede pegada en el 28 para siempre;
 *  6. que la tabla no avise que la fila se repite.
 *
 * Uso: node scripts/verificar-repeticion.mjs http://127.0.0.1:4321
 */

import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:4321";
const res = [];
const ok = (n, d = "") => res.push({ n, ok: true, d });
const mal = (n, d = "") => res.push({ n, ok: false, d });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });

const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon|404/i.test(m.text())) errores.push(m.text());
});

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("[data-block-id]", { timeout: 20000 });

const clave = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const hoy = new Date();
const hoyClave = clave(hoy);

/** base de datos con una fila de hoy, una repetida semanal y una evento único */
const datos = await page.evaluate(
  ({ hoyClave }) => {
    const st = window.__nookStore.getState();
    const pagina = Object.values(st.pages).find((p) => p.database && !p.trashed);
    const fecha = pagina.database.properties.find((p) => p.type === "date");
    const unica = st.addRow(pagina.id, { [fecha.id]: hoyClave });
    const semanal = st.addRow(pagina.id, { [fecha.id]: hoyClave });
    st.setRowRepeat(pagina.id, semanal, { cada: 1, unidad: "semana" });
    const mensual = st.addRow(pagina.id, { [fecha.id]: "2027-01-31" });
    st.setRowRepeat(pagina.id, mensual, { cada: 1, unidad: "mes" });
    st.patchDatabase(pagina.id, { view: "calendar", filter: null });
    st.selectPage(pagina.id);
    return { paginaId: pagina.id, fechaId: fecha.id, unica, semanal, mensual };
  },
  { hoyClave },
);
await page.waitForTimeout(900);

const fila = (rowId) =>
  page.evaluate(
    ({ paginaId, rowId }) =>
      window.__nookStore.getState().pages[paginaId].database.rows.find((r) => r.id === rowId) ?? null,
    { paginaId: datos.paginaId, rowId },
  );

// ------------------------------------------------ 1. la repetición se guarda
const guardada = await fila(datos.semanal);
guardada?.repeat?.unidad === "semana"
  ? ok("la repetición se guarda en la fila")
  : mal("la repetición se guarda en la fila", JSON.stringify(guardada?.repeat));

// ------------------------------- 2. el calendario muestra el futuro
const fantasmasHoy = await page.evaluate(
  () => [...document.querySelectorAll("[data-cal-repeat]")].length,
);
const proxima = new Date(hoy);
proxima.setDate(proxima.getDate() + 7);
const fantasmaEsperado = await page.evaluate(
  (c) => document.querySelectorAll(`[data-cal-day="${c}"] [data-cal-repeat]`).length,
  clave(proxima),
);
fantasmasHoy >= 1 && fantasmaEsperado >= 1
  ? ok("el calendario dibuja la próxima aparición antes de que llegue", clave(proxima))
  : mal("el calendario dibuja la próxima aparición antes de que llegue", JSON.stringify({ fantasmasHoy, fantasmaEsperado }));

// ------------------------- 3. el chip del día real sigue siendo el real
const chipReal = await page.evaluate(
  ({ c, rowId }) => document.querySelector(`[data-cal-day="${c}"] [data-cal-chip="${rowId}"]`) !== null,
  { c: hoyClave, rowId: datos.semanal },
);
chipReal
  ? ok("el día de la fecha guardada no se pinta como aparición futura")
  : mal("el día de la fecha guardada no se pinta como aparición futura");

// ------------------------------ 4. una fila sin repetición no deja fantasmas
const fantasmasUnica = await page.evaluate(
  (rowId) => document.querySelectorAll(`[data-cal-repeat="${rowId}"]`).length,
  datos.unica,
);
fantasmasUnica === 0
  ? ok("una fila sin repetición no deja apariciones fantasma")
  : mal("una fila sin repetición no deja apariciones fantasma", String(fantasmasUnica));

// ------------------------------------ 5. completar mueve a una fecha futura
await page.locator(`[data-cal-chip="${datos.semanal}"]`).click();
await page.waitForSelector("[data-repeat-panel]", { timeout: 10000 });
const estadoTexto = await page.locator("[data-repeat-estado]").innerText();
await page.locator("[data-repeat-avanzar]").click();
await page.waitForTimeout(600);
const trasAvanzar = await fila(datos.semanal);
const nuevaFecha = String(trasAvanzar?.cells[datos.fechaId] ?? "");
/avanzado|por adelantado|Cada semana/i.test(estadoTexto) && nuevaFecha > hoyClave
  ? ok("«Completar y pasar a la próxima» la mueve al futuro", nuevaFecha)
  : mal("«Completar y pasar a la próxima» la mueve al futuro", JSON.stringify({ nuevaFecha, estadoTexto }));
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// ------------------------- 6. la mensual del 31 no se queda en el 28
// enero 2027 (31) → febrero 2027 tiene que caer el 28 y marzo otra vez el 31
await page.evaluate(() => {
  const st = window.__nookStore.getState();
  window.scrollTo(0, 0);
  st.setUI?.({ paletteOpen: false });
});
/** lleva el calendario a un mes concreto contando desde el que se muestra */
const irAMes = async (objetivo) => {
  for (let i = 0; i < 8; i++) {
    const etiqueta = await page.locator("[data-cal-label]").innerText();
    if (etiqueta.toLowerCase().includes(objetivo.mes)) return true;
    await page.locator("[data-cal-next]").click();
    await page.waitForTimeout(180);
  }
  return false;
};
await irAMes({ mes: "febrero" });
const febrero = await page.evaluate(
  () => [...document.querySelectorAll("[data-cal-repeat]")].map((e) => e.closest("[data-cal-day]")?.getAttribute("data-cal-day")),
);
await page.locator("[data-cal-next]").click();
await page.waitForTimeout(250);
const marzo = await page.evaluate(
  () => [...document.querySelectorAll("[data-cal-repeat]")].map((e) => e.closest("[data-cal-day]")?.getAttribute("data-cal-day")),
);
const febrero28 = febrero.some((f) => f?.endsWith("-02-28"));
const marzo31 = marzo.some((f) => f?.endsWith("-03-31"));
febrero28 && marzo31
  ? ok("una mensual del 31 cae el 28 en febrero y vuelve al 31 en marzo", `${febrero.find((f) => f?.endsWith("-02-28"))} · ${marzo.find((f) => f?.endsWith("-03-31"))}`)
  : mal("una mensual del 31 cae el 28 en febrero y vuelve al 31 en marzo", JSON.stringify({ febrero, marzo }));

// ---------------------------------- 7. la tabla avisa que la fila se repite
await page.evaluate((id) => window.__nookStore.getState().patchDatabase(id, { view: "table" }), datos.paginaId);
await page.waitForTimeout(600);
const marca = await page.evaluate(
  (rowId) => document.querySelector(`[data-row-repeat="${rowId}"]`) !== null,
  datos.semanal,
);
marca ? ok("la tabla marca la fila que se repite") : mal("la tabla marca la fila que se repite");

// ---------------------------------- 8. se puede quitar la repetición
await page.evaluate(
  ({ paginaId, rowId }) => window.__nookStore.getState().setRowRepeat(paginaId, rowId, null),
  { paginaId: datos.paginaId, rowId: datos.semanal },
);
await page.waitForTimeout(400);
const sinRepeat = await fila(datos.semanal);
sinRepeat?.repeat === undefined
  ? ok("se puede quitar la repetición")
  : mal("se puede quitar la repetición", JSON.stringify(sinRepeat?.repeat));

errores.length === 0 ? ok("consola sin errores") : mal("consola sin errores", errores.slice(0, 3).join(" | "));

await browser.close();

const total = res.length;
const bien = res.filter((r) => r.ok).length;
console.log("");
for (const r of res) console.log(`  ${r.ok ? "✔" : "✘"}  ${r.n}${r.d ? `  — ${r.d}` : ""}`);
console.log(`\n  ${bien}/${total} verificaciones OK\n`);
process.exit(bien === total ? 0 : 1);
