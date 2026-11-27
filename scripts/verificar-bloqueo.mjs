/**
 * Verificación de bloquear / desbloquear página.
 *
 * La app de referencia tiene bloqueo de página pero **nunca** le puso atajo: hay
 * hilos de años pidiéndolo. Acá el atajo es ⌘⇧B (Ctrl+Shift+B). Lo que puede
 * fallar:
 *
 *  1. que el atajo no haga nada o cambie otra cosa;
 *  2. que el contenido siga siendo editable (el foco entra igual);
 *  3. que el título siga aceptando cambios;
 *  4. que el estado no sobreviva a la recarga;
 *  5. que al desbloquear no se pueda volver a escribir;
 *  6. que el árbol no muestre que está bloqueada.
 *
 * Uso: node scripts/verificar-bloqueo.mjs http://127.0.0.1:4321
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

const idPagina = await page.evaluate(() => {
  const st = window.__nookStore.getState();
  const id = st.createPage(null, { title: "Página a proteger" });
  st.setBlocks(id, [
    { id: "bl1", type: "paragraph", html: "Texto original del documento", indent: 0 },
  ]);
  st.selectPage(id);
  return id;
});
await page.waitForTimeout(700);

const estado = () =>
  page.evaluate((id) => {
    const p = window.__nookStore.getState().pages[id];
    return { locked: !!p.locked, title: p.title, html: p.blocks[0]?.html };
  }, idPagina);

// ------------------------------------------------- 1. el atajo bloquea
await page.locator("main").click({ position: { x: 600, y: 620 } });
await page.keyboard.press("Control+Shift+b");
await page.waitForTimeout(400);
(await estado()).locked
  ? ok("Control+Shift+B bloquea la página")
  : mal("Control+Shift+B bloquea la página");
(await page.locator("[data-lock-badge]").count()) === 1
  ? ok("aparece el aviso de página bloqueada")
  : mal("aparece el aviso de página bloqueada");

// ------------------------------------- 2. el árbol muestra el candado
const candado = await page.evaluate(
  (id) => document.querySelector(`[data-page-row="${id}"] [data-page-locked]`) !== null,
  idPagina,
);
candado ? ok("la fila del árbol muestra el candado") : mal("la fila del árbol muestra el candado");

// ------------------------------------- 3. el contenido no se puede editar
const antes = await estado();
await page.locator("[data-block-id]").first().click({ force: true });
await page.keyboard.type("ESTO NO DEBE ENTRAR");
await page.waitForTimeout(400);
const trasEscribir = await estado();
trasEscribir.html === antes.html
  ? ok("escribir sobre un bloque bloqueado no cambia el contenido")
  : mal("escribir sobre un bloque bloqueado no cambia el contenido", trasEscribir.html);

// ------------------------------------------ 4. el título tampoco
await page.locator("textarea").first().click({ force: true });
await page.keyboard.type("otro título");
await page.waitForTimeout(400);
(await estado()).title === antes.title
  ? ok("el título no se puede cambiar mientras está bloqueada")
  : mal("el título no se puede cambiar mientras está bloqueada", (await estado()).title);

// ------------------------------------------ 5. sobrevive a la recarga
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("[data-page-row]", { timeout: 20000 });
await page.evaluate((id) => window.__nookStore.getState().selectPage(id), idPagina);
await page.waitForTimeout(700);
(await estado()).locked && (await page.locator("[data-lock-badge]").count()) === 1
  ? ok("el bloqueo sobrevive a la recarga")
  : mal("el bloqueo sobrevive a la recarga");

// ------------------------------------------ 6. desbloquear devuelve la edición
await page.locator("[data-lock-toggle]").click();
await page.waitForTimeout(400);
!(await estado()).locked
  ? ok("el botón del aviso desbloquea la página")
  : mal("el botón del aviso desbloquea la página");

await page.locator("[data-block-id]").first().click();
await page.keyboard.press("End");
await page.keyboard.type(" editado");
await page.waitForTimeout(600);
(await estado()).html.includes("editado")
  ? ok("al desbloquear se puede volver a escribir", (await estado()).html)
  : mal("al desbloquear se puede volver a escribir", (await estado()).html);

// ------------------------------------------ 7. el menú de la fila lo ofrece
await page.locator(`[data-page-row="${idPagina}"]`).hover();
await page.locator(`[data-page-row="${idPagina}"]`).locator('button[aria-label="Más opciones"]').click();
await page.waitForTimeout(300);
const menu = await page.evaluate(() => document.body.innerText);
/Bloquear página/.test(menu)
  ? ok("el menú ••• de la fila ofrece bloquear")
  : mal("el menú ••• de la fila ofrece bloquear", menu.slice(0, 120));
await page.keyboard.press("Escape");

// ------------------------------------------ 8. consola limpia
errores.length === 0 ? ok("consola sin errores") : mal("consola sin errores", errores.slice(0, 3).join(" | "));

await browser.close();

const total = res.length;
const bien = res.filter((r) => r.ok).length;
console.log("");
for (const r of res) console.log(`  ${r.ok ? "✔" : "✘"}  ${r.n}${r.d ? `  — ${r.d}` : ""}`);
console.log(`\n  ${bien}/${total} verificaciones OK\n`);
process.exit(bien === total ? 0 : 1);
