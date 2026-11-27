/**
 * Verificación de propiedades visibles por vista y columnas redimensionables.
 *
 * Dos quejas seguidas de la app de referencia: el ancho de las columnas se
 * arrastra pero **nunca se puede volver atrás**, y las propiedades se ocultan en
 * un menú que cambia la vista para siempre (o no se guardan por vista). Lo que
 * puede fallar acá:
 *
 *  1. que ocultar una propiedad no la saque de la tabla;
 *  2. que el título se pueda ocultar (una tabla sin nombre no se entiende);
 *  3. que el ajuste no se guarde por vista (tapá el board y aparecen columnas);
 *  4. que arrastrar el borde no cambie el ancho;
 *  5. que el ancho no sobreviva a la recarga;
 *  6. que «restablecer» no devuelva las columnas a su ancho de fábrica.
 *
 * Uso: node scripts/verificar-propiedades.mjs http://127.0.0.1:4321
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

const datos = await page.evaluate(() => {
  const st = window.__nookStore.getState();
  const pagina = Object.values(st.pages).find((p) => p.database && !p.trashed);
  st.patchDatabase(pagina.id, { view: "table", filter: null, ocultas: [], anchos: {} });
  st.selectPage(pagina.id);
  return {
    paginaId: pagina.id,
    props: pagina.database.properties.map((p) => ({ id: p.id, name: p.name, type: p.type })),
  };
});
await page.waitForTimeout(800);

const columnas = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("th[data-col]")].map((th) => ({
      id: th.getAttribute("data-col"),
      ancho: Math.round(th.getBoundingClientRect().width),
    })),
  );

const total = datos.props.length;
const primeraNoTitulo = datos.props.find((p) => p.type !== "title");
const titulo = datos.props.find((p) => p.type === "title");

// ------------------------------------------ 1. ocultar una propiedad
(await columnas()).length === total
  ? ok("la tabla muestra todas las propiedades", `${total} columnas`)
  : mal("la tabla muestra todas las propiedades", String((await columnas()).length));

await page.locator("[data-props-btn]").click();
await page.waitForTimeout(250);
await page.locator(`[data-prop-toggle="${primeraNoTitulo.id}"]`).click();
await page.waitForTimeout(400);
const trasOcultar = await columnas();
trasOcultar.length === total - 1 && !trasOcultar.some((c) => c.id === primeraNoTitulo.id)
  ? ok("ocultar una propiedad la saca de la tabla", `“${primeraNoTitulo.name}” oculta`)
  : mal("ocultar una propiedad la saca de la tabla", JSON.stringify(trasOcultar.map((c) => c.id)));

// ------------------------------------------ 2. el título no se puede ocultar
const tituloDeshabilitado = await page.evaluate(
  (id) => document.querySelector(`[data-prop-toggle="${id}"]`)?.hasAttribute("disabled") ?? false,
  titulo.id,
);
tituloDeshabilitado
  ? ok("el título no se puede ocultar")
  : mal("el título no se puede ocultar");

// ------------------------------------------ 3. se guarda por vista
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.evaluate((id) => window.__nookStore.getState().setView(id, "board"), datos.paginaId);
await page.waitForTimeout(400);
await page.evaluate((id) => window.__nookStore.getState().setView(id, "table"), datos.paginaId);
await page.waitForTimeout(500);
const alVolver = await columnas();
alVolver.length === total - 1
  ? ok("la propiedad oculta sigue oculta al volver a la tabla", `${alVolver.length} columnas`)
  : mal("la propiedad oculta sigue oculta al volver a la tabla", `${alVolver.length} columnas`);

const enOtraVista = await page.evaluate((id) => {
  const p = window.__nookStore.getState().pages[id].database;
  return { view: p.view, ocultas: p.ocultas ?? [] };
}, datos.paginaId);
enOtraVista.ocultas.length === 1
  ? ok("la configuración viaja con la vista, no con la base", `vista ${enOtraVista.view}`)
  : mal("la configuración viaja con la vista, no con la base", JSON.stringify(enOtraVista));

// ------------------------------------------ 4. arrastrar el borde cambia el ancho
const antes = (await columnas()).find((c) => c.id === titulo.id)?.ancho ?? 0;
const caja = await page.locator(`th[data-col="${titulo.id}"]`).boundingBox();
await page.mouse.move(caja.x + caja.width - 3, caja.y + 12);
await page.mouse.down();
await page.mouse.move(caja.x + caja.width + 110, caja.y + 12, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(400);
const despues = (await columnas()).find((c) => c.id === titulo.id)?.ancho ?? 0;
despues > antes + 60
  ? ok("arrastrar el borde ensancha la columna", `${antes}px → ${despues}px`)
  : mal("arrastrar el borde ensancha la columna", `${antes}px → ${despues}px`);

// ------------------------------------------ 5. sobrevive a la recarga
await page.reload({ waitUntil: "networkidle" });
// la página es una base de datos: no tiene bloques, así que se espera la barra
await page.waitForFunction(() => !!window.__nookStore, null, { timeout: 20000 });
await page.evaluate((id) => window.__nookStore.getState().selectPage(id), datos.paginaId);
await page.waitForSelector("[data-props-btn]", { timeout: 20000 });
await page.waitForTimeout(800);
const trasRecarga = (await columnas()).find((c) => c.id === titulo.id)?.ancho ?? 0;
Math.abs(trasRecarga - despues) <= 3
  ? ok("el ancho de la columna sobrevive a la recarga", `${trasRecarga}px`)
  : mal("el ancho de la columna sobrevive a la recarga", `${trasRecarga}px`);

// ------------------------------------------ 6. restablecer anchos
await page.locator("[data-props-btn]").click();
await page.waitForTimeout(250);
await page.evaluate(() =>
  [...document.querySelectorAll(".menu button, [role='menu'] button")]
    .find((b) => (b.textContent ?? "").includes("Restablecer anchos"))
    ?.click(),
);
await page.waitForTimeout(400);
const restablecido = (await columnas()).find((c) => c.id === titulo.id)?.ancho ?? 0;
restablecido < despues - 40
  ? ok("«Restablecer anchos» vuelve al ancho de fábrica", `${despues}px → ${restablecido}px`)
  : mal("«Restablecer anchos» vuelve al ancho de fábrica", `${despues}px → ${restablecido}px`);

errores.length === 0 ? ok("consola sin errores") : mal("consola sin errores", errores.slice(0, 3).join(" | "));

await browser.close();

const totalRes = res.length;
const bien = res.filter((r) => r.ok).length;
console.log("");
for (const r of res) console.log(`  ${r.ok ? "✔" : "✘"}  ${r.n}${r.d ? `  — ${r.d}` : ""}`);
console.log(`\n  ${bien}/${totalRes} verificaciones OK\n`);
process.exit(bien === totalRes ? 0 : 1);
