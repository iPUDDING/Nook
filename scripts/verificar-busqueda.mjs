/**
 * Verificación de buscar y reemplazar dentro de la página.
 *
 * La queja detrás de esto: en la app de referencia no hay buscar dentro de la
 * página (sólo el del navegador, que no reemplaza nada) y no existe reemplazar.
 * Lo que puede fallar acá:
 *
 *  1. que ⌘F abra el buscar del navegador en vez de la barra;
 *  2. que el contador cuente etiquetas o no cuente coincidencias dentro de
 *     `<strong>` (la búsqueda es sobre texto, no sobre HTML);
 *  3. que el recorrido no seleccione el texto en el documento;
 *  4. que reemplazar todo no deje el cambio guardado;
 *  5. que reemplazar una sola cambie la equivocada;
 *  6. que el texto de reemplazo se interprete como HTML (inyección);
 *  7. que Escape no cierre la barra.
 *
 * Uso: node scripts/verificar-busqueda.mjs http://127.0.0.1:4321
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

/** página con un texto conocido, para buscar con números redondos */
const idPagina = await page.evaluate(() => {
  const st = window.__nookStore.getState();
  const id = st.createPage(null, { title: "Búsqueda" });
  st.setBlocks(id, [
    { id: "bf1", type: "paragraph", html: "La casa de la luna y la otra casa", indent: 0 },
    { id: "bf2", type: "paragraph", html: "Otra <strong>casa</strong> al final", indent: 0 },
  ]);
  st.selectPage(id);
  return id;
});
await page.waitForTimeout(700);

const html = () =>
  page.evaluate((id) => {
    const p = window.__nookStore.getState().pages[id];
    return p.blocks.map((b) => b.html);
  }, idPagina);

// ------------------------------------------------------- 1. ⌘F abre la barra
await page.keyboard.press("Control+f");
await page.waitForTimeout(400);
(await page.locator("[data-find-bar]").count()) === 1
  ? ok("Control+F abre la barra de búsqueda de la página")
  : mal("Control+F abre la barra de búsqueda de la página");

// ------------------------------------------- 2. cuenta texto, no etiquetas
await page.locator("[data-find-input]").fill("casa");
await page.waitForTimeout(400);
const cuenta = (await page.locator("[data-find-count]").innerText()).trim();
cuenta === "1 de 3"
  ? ok("cuenta las apariciones, también dentro de <strong>", cuenta)
  : mal("cuenta las apariciones, también dentro de <strong>", cuenta);

// ------------------------------------------- 3. el recorrido selecciona
await page.locator("[data-find-input]").press("Enter");
await page.waitForTimeout(500);
const seleccion = await page.evaluate(() => window.getSelection()?.toString() ?? "");
const segundo = (await page.locator("[data-find-count]").innerText()).trim();
seleccion.toLowerCase() === "casa" && segundo === "2 de 3"
  ? ok("Enter pasa a la siguiente y la selecciona en el documento", `${segundo} · “${seleccion}”`)
  : mal("Enter pasa a la siguiente y la selecciona en el documento", `${segundo} · “${seleccion}”`);

// las coincidencias quedan pintadas sin tocar el documento
const pintados = await page.evaluate(() => (CSS.highlights ? CSS.highlights.size : 0));
const docLimpio = await page.evaluate(
  (id) => !window.__nookStore.getState().pages[id].blocks.some((b) => b.html.includes("<mark")),
  idPagina,
);
pintados >= 2 && docLimpio
  ? ok("pinta las coincidencias sin escribir en el documento", `${pintados} resaltados`)
  : mal("pinta las coincidencias sin escribir en el documento", JSON.stringify({ pintados, docLimpio }));

await page.locator("[data-find-input]").press("Shift+Enter");
await page.waitForTimeout(400);
(await page.locator("[data-find-count]").innerText()).trim() === "1 de 3"
  ? ok("Shift+Enter vuelve a la anterior")
  : mal("Shift+Enter vuelve a la anterior");

// ------------------------------------------------- 4. sin resultados
await page.locator("[data-find-input]").fill("ornitorrinco");
await page.waitForTimeout(400);
(await page.locator("[data-find-count]").innerText()).trim() === "Sin resultados"
  ? ok("avisa cuando no hay coincidencias")
  : mal("avisa cuando no hay coincidencias");

// ------------------------------------------------ 5. reemplazar todo
await page.locator("[data-find-input]").fill("casa");
await page.waitForTimeout(300);
await page.locator("[data-find-toggle-replace]").click();
await page.locator("[data-find-replace]").fill("cabaña");
await page.locator("[data-find-replace-all]").click();
await page.waitForTimeout(500);
const trasTodo = await html();
const esperado = ["La cabaña de la luna y la otra cabaña", "Otra <strong>cabaña</strong> al final"];
JSON.stringify(trasTodo) === JSON.stringify(esperado)
  ? ok("reemplazar todo cambia todas las apariciones y queda guardado", trasTodo[0])
  : mal("reemplazar todo cambia todas las apariciones y queda guardado", JSON.stringify(trasTodo));

// ------------------------------------------------ 6. el texto no inyecta HTML
await page.locator("[data-find-input]").fill("cabaña");
await page.waitForTimeout(300);
await page.locator("[data-find-replace]").fill("<b>x</b>");
await page.locator("[data-find-replace-all]").click();
await page.waitForTimeout(500);
const trasInyectar = await html();
!trasInyectar.join(" ").includes("<b>x</b>") && trasInyectar.join(" ").includes("&lt;b&gt;x&lt;/b&gt;")
  ? ok("el reemplazo se escribe como texto, no como HTML", trasInyectar[0])
  : mal("el reemplazo se escribe como texto, no como HTML", JSON.stringify(trasInyectar));

// --------------------------------------------- 7. reemplazar de a una
await page.evaluate((id) => {
  const st = window.__nookStore.getState();
  st.setBlocks(id, [
    { id: "bf1", type: "paragraph", html: "casa casa casa", indent: 0 },
    { id: "bf2", type: "paragraph", html: "y otra casa", indent: 0 },
  ]);
}, idPagina);
await page.waitForTimeout(400);
await page.locator("[data-find-input]").fill("casa");
await page.waitForTimeout(400);
await page.locator("[data-find-replace]").fill("hogar");
await page.locator("[data-find-input]").press("Enter"); // va a la segunda
await page.waitForTimeout(300);
await page.locator("[data-find-replace-one]").click();
await page.waitForTimeout(500);
const trasUna = await html();
trasUna[0] === "casa hogar casa" && trasUna[1] === "y otra casa"
  ? ok("reemplazar cambia sólo la coincidencia en la que estás", trasUna[0])
  : mal("reemplazar cambia sólo la coincidencia en la que estás", JSON.stringify(trasUna));

// ------------------------------------------------------ 8. Escape cierra
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
const cerrada = (await page.locator("[data-find-bar]").count()) === 0;
const sinPintar = await page.evaluate(() => (CSS.highlights ? CSS.highlights.size : 0));
cerrada && sinPintar === 0
  ? ok("Escape cierra la barra y borra los resaltados")
  : mal("Escape cierra la barra y borra los resaltados", JSON.stringify({ cerrada, sinPintar }));

// ------------------------------------------------------ 9. consola limpia
errores.length === 0 ? ok("consola sin errores") : mal("consola sin errores", errores.slice(0, 3).join(" | "));

await browser.close();

const total = res.length;
const bien = res.filter((r) => r.ok).length;
console.log("");
for (const r of res) console.log(`  ${r.ok ? "✔" : "✘"}  ${r.n}${r.d ? `  — ${r.d}` : ""}`);
console.log(`\n  ${bien}/${total} verificaciones OK\n`);
process.exit(bien === total ? 0 : 1);
