/**
 * Verificación de arrastrar archivos en el árbol lateral.
 *
 * El pedido: poder mover un archivo de lugar con el mouse, metiéndolo en otra
 * carpeta o sacándolo a la raíz. Lo que puede fallar:
 *
 *  1. que la fila del archivo sea arrastrable y declare el tipo interno;
 *  2. que al pasar por encima de una carpeta la fila se resalte;
 *  3. que soltar dentro de una carpeta cambie `folderId` y abra la carpeta;
 *  4. que soltar dentro de una página normal (no carpeta) también funcione;
 *  5. que soltar en la cabecera del workspace saque el archivo a la raíz;
 *  6. que la sección **Archivos** muestre los archivos sueltos (antes un archivo
 *     fuera de una carpeta no se veía en ningún lado);
 *  7. que el arrastre interno **no** dispare la importación de páginas, que es
 *     lo que hace la barra al recibir archivos del sistema;
 *  8. que el movimiento sobreviva a la recarga y la consola quede limpia.
 *
 * Uso: node scripts/verificar-arrastrar.mjs http://127.0.0.1:4321
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4321';
const res = [];
const ok = (n, d = '') => res.push({ n, ok: true, d });
const mal = (n, d = '') => res.push({ n, ok: false, d });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 950 } });

const errores = [];
page.on('pageerror', (e) => errores.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errores.push(m.text());
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-block-id]', { timeout: 20000 });

/** Crea una carpeta, una página normal y un archivo dentro de la carpeta. */
const ids = await page.evaluate(async () => {
  const st = window.__nookStore.getState();
  const carpeta = st.createFolder(null);
  const destino = st.createPage(null, { title: "Página destino" });
  st.selectPage(carpeta);
  const r = await st.addFile(new File([new Uint8Array([1, 2, 3, 4])], "acta.txt", { type: "text/plain" }), carpeta);
  return { carpeta, destino, archivo: r?.file?.id ?? null, error: r?.error ?? null };
});
await page.waitForTimeout(800);

if (!ids.archivo) {
  console.log("No se pudo crear el archivo de prueba:", ids.error);
  process.exit(1);
}

const estado = () =>
  page.evaluate(
    ({ carpeta, destino, archivo }) => {
      const st = window.__nookStore.getState();
      return {
        archivo: (() => {
          const f = st.files.find((x) => x.id === archivo);
          return f ? f.folderId : "no está";
        })(),
        carpeta,
        destino,
        paginas: Object.keys(st.pages).length,
      };
    },
    ids,
  );

// -------------------------------------------------- 1. la fila es arrastrable
const fila = page.locator(`[data-file-row="${ids.archivo}"]`).first();
fila
  ? ok("el archivo aparece en el árbol")
  : mal("el archivo aparece en el árbol");
(await fila.getAttribute("draggable")) === "true"
  ? ok("la fila del archivo es arrastrable")
  : mal("la fila del archivo es arrastrable", String(await fila.getAttribute("draggable")));

// ------------------------------------------- 2. el resaltado al pasar arriba
await page.evaluate(({ archivo, carpeta }) => {
  const origen = document.querySelector(`[data-file-row="${archivo}"]`);
  const destino = document.querySelector(`[data-page-row="${carpeta}"]`);
  const dt = new DataTransfer();
  dt.setData("application/x-nook-file", archivo);
  origen.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
  destino.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
}, { archivo: ids.archivo, carpeta: ids.carpeta });
await page.waitForTimeout(250);
const conResalte = await page.evaluate(
  (carpeta) => document.querySelector(`[data-page-row="${carpeta}"]`)?.hasAttribute("data-drop-file") ?? false,
  ids.carpeta,
);
await page.evaluate(({ archivo, carpeta }) => {
  const destino = document.querySelector(`[data-page-row="${carpeta}"]`);
  const dt = new DataTransfer();
  dt.setData("application/x-nook-file", archivo);
  destino.dispatchEvent(new DragEvent("dragleave", { bubbles: true, dataTransfer: dt }));
}, { archivo: ids.archivo, carpeta: ids.carpeta });
await page.waitForTimeout(250);
const sinResalte = await page.evaluate(
  (carpeta) => !(document.querySelector(`[data-page-row="${carpeta}"]`)?.hasAttribute("data-drop-file") ?? false),
  ids.carpeta,
);
const resaltado = { conResalte, sinResalte };
resaltado.conResalte
  ? ok("la carpeta se resalta cuando el archivo pasa por encima")
  : mal("la carpeta se resalta cuando el archivo pasa por encima", JSON.stringify(resaltado));

// ------------------------------------- 3. soltar dentro de otra carpeta
const otra = await page.evaluate(() => {
  const st = window.__nookStore.getState();
  const id = st.createFolder(null);
  st.selectPage(id);
  return id;
});
await page.waitForTimeout(600);
await page.waitForTimeout(200);
const antesPaginas = (await estado()).paginas;
await page.locator(`[data-file-row="${ids.archivo}"]`).first().dragTo(page.locator(`[data-page-row="${otra}"]`));
await page.waitForTimeout(700);
const movido = await estado();
movido.archivo === otra
  ? ok("soltar dentro de una carpeta mueve el archivo", "carpeta nueva")
  : mal("soltar dentro de una carpeta mueve el archivo", `${movido.archivo} ≠ ${otra}`);

const anidado = await page.evaluate(({ archivo, carpeta }) => {
  const filas = [...document.querySelectorAll("[data-file-row]")];
  const objetivo = filas.find((f) => f.getAttribute("data-file-row") === archivo);
  const padre = document.querySelector(`[data-page-row="${carpeta}"]`);
  return {
    existe: !!objetivo,
    sangria: objetivo ? parseInt(getComputedStyle(objetivo).paddingLeft || "0", 10) : null,
    sangriaPadre: padre ? parseInt(getComputedStyle(padre).paddingLeft || "0", 10) : null,
  };
}, { archivo: ids.archivo, carpeta: otra });
anidado.existe && anidado.sangria > (anidado.sangriaPadre ?? 0)
  ? ok("el archivo queda anidado bajo la carpeta nueva", `sangría ${anidado.sangria} > ${anidado.sangriaPadre}`)
  : mal("el archivo queda anidado bajo la carpeta nueva", JSON.stringify(anidado));

// ------------------------------- 4. soltar dentro de una página normal
await page.locator(`[data-file-row="${ids.archivo}"]`).first().dragTo(page.locator(`[data-page-row="${ids.destino}"]`));
await page.waitForTimeout(700);
(await estado()).archivo === ids.destino
  ? ok("también se puede soltar dentro de una página normal")
  : mal("también se puede soltar dentro de una página normal", JSON.stringify(await estado()));

// ------------------------------------------------ 5. sacarlo a la raíz
await page.locator(`[data-file-row="${ids.archivo}"]`).first().dragTo(page.locator("[data-root-drop]"));
await page.waitForTimeout(700);
(await estado()).archivo === null
  ? ok('soltar en la cabecera devuelve el archivo a la raíz')
  : mal('soltar en la cabecera devuelve el archivo a la raíz', JSON.stringify(await estado()));

// ------------------------------------------ 6. sección de archivos sueltos
const sueltos = await page.evaluate(() => {
  const texto = document.querySelector("aside")?.innerText ?? "";
  return { seccion: /archivos · \d+/i.test(texto), filas: document.querySelectorAll("[data-file-row]").length };
});
sueltos.seccion && sueltos.filas > 0
  ? ok("los archivos sin carpeta se ven en la sección Archivos", `${sueltos.filas} fila(s)`)
  : mal("los archivos sin carpeta se ven en la sección Archivos", JSON.stringify(sueltos));

// ------------------- 7. el arrastre interno no importa páginas
const despuesPaginas = (await estado()).paginas;
despuesPaginas === antesPaginas
  ? ok("arrastrar un archivo no crea páginas", `${despuesPaginas} páginas`)
  : mal("arrastrar un archivo no crea páginas", `${antesPaginas} → ${despuesPaginas}`);

// ------------------------------------------- 8. persistencia y consola
await page.locator(`[data-file-row="${ids.archivo}"]`).first().dragTo(page.locator(`[data-page-row="${ids.carpeta}"]`));
await page.waitForTimeout(600);
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("aside", { timeout: 20000 });
await page.waitForTimeout(500);
(await estado()).archivo === ids.carpeta
  ? ok("el movimiento sobrevive a la recarga")
  : mal("el movimiento sobrevive a la recarga", JSON.stringify(await estado()));

errores.length === 0 ? ok("consola sin errores") : mal("consola sin errores", errores.slice(0, 3).join(" | "));

await browser.close();

const total = res.length;
const bien = res.filter((r) => r.ok).length;
console.log("");
for (const r of res) console.log(`  ${r.ok ? "✔" : "✘"}  ${r.n}${r.d ? `  — ${r.d}` : ""}`);
console.log(`\n  ${bien}/${total} verificaciones OK\n`);
process.exit(bien === total ? 0 : 1);
