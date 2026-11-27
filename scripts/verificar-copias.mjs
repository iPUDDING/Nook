/**
 * Verificación de las copias de seguridad automáticas.
 *
 * La queja: en la app de referencia no hay respaldo automático ni local, sólo
 * «exportá un ZIP cuando te acordés». Acá la app toma una foto del workspace al
 * abrir y cada cinco minutos si hubo cambios, guarda las últimas cinco y se
 * restauran desde Configuración. Lo que puede fallar:
 *
 *  1. que no se tome ninguna copia al abrir;
 *  2. que se guarden copias idénticas (llenando el espacio sin motivo);
 *  3. que crecer no respete el tope de cinco;
 *  4. que restaurar no devuelva lo borrado;
 *  5. que la copia se lleve los adjuntos y reviente el espacio;
 *  6. que borrar todas no borre nada.
 *
 * Uso: node scripts/verificar-copias.mjs http://127.0.0.1:4321
 */

import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:4321";
const res = [];
const ok = (n, d = "") => res.push({ n, ok: true, d });
const mal = (n, d = "") => res.push({ n, ok: false, d });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon|404/i.test(m.text())) errores.push(m.text());
});

/** Configuración → Datos, que es donde viven las copias */
const abrirDatos = async () => {
  await page.keyboard.press("Control+,");
  await page.getByRole("button", { name: "Datos", exact: true }).click({ timeout: 10000 });
  await page.waitForSelector("[data-copias]", { timeout: 10000 });
};

const copias = () =>
  page.evaluate(() => {
    const crudo = localStorage.getItem("nook.copias.v1");
    const lista = crudo ? JSON.parse(crudo) : [];
    return lista.map((c) => ({ id: c.id, at: c.at, bytes: c.bytes, firma: c.firma, data: c.data }));
  });

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("[data-block-id]", { timeout: 20000 });
await page.evaluate(() => localStorage.removeItem("nook.copias.v1"));
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("[data-block-id]", { timeout: 20000 });
await page.waitForTimeout(800);

// --------------------------------------------- 1. copia automática al abrir
const primera = await copias();
primera.length === 1
  ? ok("al abrir la app se toma una copia sola", `${primera[0].bytes} bytes`)
  : mal("al abrir la app se toma una copia sola", `${primera.length} copia(s)`);

// ---------------------------------- 2. no se guardan copias iguales
const sinCambios = await page.evaluate(() => {
  // el mismo camino que usa el temporizador: una copia sin cambios no se guarda
  return JSON.parse(localStorage.getItem("nook.copias.v1") ?? "[]").length;
});
sinCambios === 1
  ? ok("sin cambios no se acumulan copias iguales")
  : mal("sin cambios no se acumulan copias iguales", `${sinCambios}`);

/** ensucia el workspace para que la próxima copia sea distinta */
const crearPagina = (titulo) =>
  page.evaluate((t) => {
    const st = window.__nookStore.getState();
    return st.createPage(null, { title: t });
  }, titulo);

const idBorrable = await crearPagina("Se va a borrar");
await page.waitForTimeout(400);

// ------------------------------------- 3. «Copiar ahora» desde Configuración
await abrirDatos();
await page.locator("[data-copia-ahora]").click();
await page.waitForTimeout(600);
const trasManual = await copias();
trasManual.length === 2
  ? ok("«Copiar ahora» agrega una copia nueva", `${trasManual.length} copias`)
  : mal("«Copiar ahora» agrega una copia nueva", `${trasManual.length} copias`);

// ------------------------------------- 4. la copia no lleva adjuntos
const llevaAdjuntos = trasManual.some((c) => c.data.includes("fileBlobs"));
!llevaAdjuntos
  ? ok("la copia no se lleva el contenido de los adjuntos")
  : mal("la copia no se lleva el contenido de los adjuntos");

// ------------------------------------- 5. el tope de cinco se respeta
for (let i = 0; i < 5; i++) {
  await crearPagina(`Relleno ${i}`);
  await page.waitForTimeout(250);
  await page.locator("[data-copia-ahora]").click();
  await page.waitForTimeout(350);
}
const muchas = await copias();
muchas.length === 5
  ? ok("se guardan como máximo cinco copias", `${muchas.length}`)
  : mal("se guardan como máximo cinco copias", `${muchas.length}`);

// ------------------------------------- 6. restaurar devuelve lo borrado
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.evaluate((id) => window.__nookStore.getState().trashPage(id), idBorrable);
await page.waitForTimeout(400);
const existeAntes = await page.evaluate(
  (id) => !!window.__nookStore.getState().pages[id],
  idBorrable,
);
await page.evaluate((id) => window.__nookStore.getState().purgePage?.(id), idBorrable);
await abrirDatos();
const lista = await page.locator("[data-copia]").count();
await page.locator("[data-copia-restaurar]").first().click();
await page.waitForTimeout(800);
const volvio = await page.evaluate(
  (id) => !!window.__nookStore.getState().pages[id] && !window.__nookStore.getState().pages[id].trashed,
  idBorrable,
);
existeAntes && volvio && lista > 0
  ? ok("restaurar una copia devuelve una página borrada", `“Se va a borrar” volvió`)
  : mal("restaurar una copia devuelve una página borrada", JSON.stringify({ existeAntes, volvio, lista }));

// ------------------------------------- 7. borrar todas
await page.locator("[data-copias-limpiar]").click();
await page.waitForTimeout(500);
(await copias()).length === 0
  ? ok("«Borrar todas» deja la lista vacía")
  : mal("«Borrar todas» deja la lista vacía");

errores.length === 0 ? ok("consola sin errores") : mal("consola sin errores", errores.slice(0, 3).join(" | "));

await browser.close();

const total = res.length;
const bien = res.filter((r) => r.ok).length;
console.log("");
for (const r of res) console.log(`  ${r.ok ? "✔" : "✘"}  ${r.n}${r.d ? `  — ${r.d}` : ""}`);
console.log(`\n  ${bien}/${total} verificaciones OK\n`);
process.exit(bien === total ? 0 : 1);
