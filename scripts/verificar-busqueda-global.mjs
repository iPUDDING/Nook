/**
 * Verificación de la búsqueda global de contenido.
 *
 * La queja: la búsqueda de la app de referencia "sólo sirve para títulos". Si la
 * palabra está dentro de un párrafo o de una celda, no aparece; y no hay forma de
 * acotar el alcance. Lo que puede fallar acá:
 *
 *  1. que no encuentre una palabra que está dentro de un bloque;
 *  2. que muestre el extracto sin el texto alrededor (no sabés dónde está);
 *  3. que no encuentre valores de la base (celdas);
 *  4. que el alcance «esta página y sus hijas» no acote de verdad;
 *  5. que al abrir un resultado no se salte al bloque y lo marque;
 *  6. que las tildes rompan la búsqueda;
 *  7. que con menos de dos letras invente resultados.
 *
 * Uso: node scripts/verificar-busqueda-global.mjs http://127.0.0.1:4321
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

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("[data-block-id]", { timeout: 20000 });

const ids = await page.evaluate(() => {
  const st = window.__nookStore.getState();
  const padre = st.createPage(null, { title: "Proyecto Andrómeda" });
  const hija = st.createPage(padre, { title: "Notas internas" });
  st.setBlocks(hija, [
    { id: "sg1", type: "paragraph", html: "El módulo lleva <strong>ornitorrinco</strong> como nombre clave", indent: 0 },
  ]);
  const aparte = st.createPage(null, { title: "Documentación suelta" });
  st.setBlocks(aparte, [
    { id: "sg2", type: "paragraph", html: "Acá también se habla del ornitorrinco y de su pico", indent: 0 },
    { id: "sg3", type: "paragraph", html: "Página sobre configuración del sistema", indent: 0 },
  ]);
  st.selectPage(padre);
  return { padre, hija, aparte };
});
await page.waitForTimeout(800);

const abrirPaleta = async (texto) => {
  await page.keyboard.press("Control+k");
  await page.waitForSelector("[data-alcance]", { timeout: 10000 });
  const campo = page.locator('[role="dialog"] input');
  await campo.fill(texto);
  await page.waitForTimeout(400);
};

const resultados = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"] button')]
      .map((b) => b.innerText)
      .filter((t) => t.includes("ornitorrinco") || t.includes("__nada__")),
  );

// ------------------------------------ 1. encuentra dentro de un bloque
await abrirPaleta("ornitorrinco");
const encontrados = await resultados();
encontrados.length === 2
  ? ok("encuentra la palabra dentro de los bloques, no sólo en títulos", `${encontrados.length} resultados`)
  : mal("encuentra la palabra dentro de los bloques, no sólo en títulos", `${encontrados.length} resultados`);

// ------------------------------------ 2. muestra el extracto con contexto
const conContexto = encontrados.every((t) => /módulo|pico|clave/i.test(t));
conContexto
  ? ok("muestra el pedazo de texto donde está la coincidencia")
  : mal("muestra el pedazo de texto donde está la coincidencia", encontrados[0]?.slice(0, 90));

// ------------------------------------ 3. acota a la rama de la página
await page.locator('[data-alcance="rama"]').click();
await page.waitForTimeout(400);
const enRama = await resultados();
enRama.length === 1 && enRama[0].includes("Notas internas")
  ? ok("«Esta página y sus hijas» acota de verdad", `${enRama.length} resultado`)
  : mal("«Esta página y sus hijas» acota de verdad", `${enRama.length} resultados`);

await page.locator('[data-alcance="todo"]').click();
await page.waitForTimeout(300);
(await resultados()).length === 2
  ? ok("«Todo el workspace» vuelve a traer los dos")
  : mal("«Todo el workspace» vuelve a traer los dos");

// ------------------------------- 4. las tildes no rompen la búsqueda
await page.locator('[role="dialog"] input').fill("configuracion");
await page.waitForTimeout(450);
const sinTilde = await page.evaluate(() =>
  [...document.querySelectorAll('[role="dialog"] button')].some((b) =>
    b.innerText.includes("configuración"),
  ),
);
sinTilde
  ? ok("buscar sin tildes encuentra el texto con tildes")
  : mal("buscar sin tildes encuentra el texto con tildes");

// ------------------------------- 5. con una sola letra no inventa nada
await page.locator('[role="dialog"] input').fill("o");
await page.waitForTimeout(350);
const contadorCorto = await page.locator("[data-hit-count]").count();
contadorCorto === 0
  ? ok("con menos de dos letras no busca en el contenido")
  : mal("con menos de dos letras no busca en el contenido");

// ------------------------------- 6. abre la página y salta al bloque
await abrirPaleta("ornitorrinco");
const boton = page.locator('[role="dialog"] button', { hasText: "pico" }).first();
await boton.click();
await page.waitForTimeout(900);
const abierta = await page.evaluate(
  () =>
    Object.values(window.__nookStore.getState().pages).find(
      (p) => p.id === window.__nookStore.getState().selectedId,
    )?.title,
);
const marcado = await page.evaluate(() => document.querySelectorAll("[data-hit]").length);
abierta === "Documentación suelta" && marcado === 1
  ? ok("al abrir el resultado salta al bloque y lo marca", abierta ?? "")
  : mal("al abrir el resultado salta al bloque y lo marca", JSON.stringify({ abierta, marcado }));

// ------------------------------- 7. encuentra valores de la base de datos
const filaId = await page.evaluate(() => {
  const st = window.__nookStore.getState();
  const pagina = Object.values(st.pages).find((p) => p.database && !p.trashed);
  const titulo = pagina.database.properties.find((p) => p.type === "title");
  const rowId = st.addRow(pagina.id, { [titulo.id]: "Zanahoria radiactiva" });
  return rowId;
});
await page.waitForTimeout(500);
await abrirPaleta("radiactiva");
const enBase = await page.evaluate(() =>
  [...document.querySelectorAll('[role="dialog"] button')].some((b) => b.innerText.includes("radiactiva")),
);
enBase
  ? ok("encuentra valores de las filas de una base", filaId.slice(0, 8))
  : mal("encuentra valores de las filas de una base");
await page.keyboard.press("Escape");

errores.length === 0 ? ok("consola sin errores") : mal("consola sin errores", errores.slice(0, 3).join(" | "));

await browser.close();

const total = res.length;
const bien = res.filter((r) => r.ok).length;
console.log("");
for (const r of res) console.log(`  ${r.ok ? "✔" : "✘"}  ${r.n}${r.d ? `  — ${r.d}` : ""}`);
console.log(`\n  ${bien}/${total} verificaciones OK\n`);
process.exit(bien === total ? 0 : 1);
