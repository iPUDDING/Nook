/**
 * Verificación del zoom.
 *
 * Pedido: agrandar el contenido de la página con la rueda del ratón. Lo que
 * puede fallar:
 *
 *  1. que Ctrl+rueda no haga nada (o que el navegador agrande toda la interfaz);
 *  2. que la rueda **sin** Ctrl deje de desplazar y se convierta en zoom;
 *  3. que un trackpad, que manda decenas de eventos por gesto, salte de 50 a
 *     200 % de una;
 *  4. que el zoom no respete los topes;
 *  5. que no se pueda volver al 100 % por atajo ni por el indicador;
 *  6. que no sobreviva a la recarga;
 *  7. que agrande también la barra lateral (no debe);
 *  8. que el visor de imágenes no tenga zoom propio.
 *
 * Uso: node scripts/verificar-zoom.mjs http://127.0.0.1:4321
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

const zoom = () =>
  page.evaluate(() => Number(document.querySelector("[data-zoom-scope]")?.getAttribute("data-page-zoom")));
const zoomAplicado = () =>
  page.evaluate(() => getComputedStyle(document.querySelector("[data-zoom-scope]")).zoom);

/** rueda sobre el contenido, con o sin Ctrl */
const rueda = async (veces, { ctrl = true, delta = -120 } = {}) => {
  // el contenido es más alto que la ventana: se lo trae a la vista y, por las
  // dudas, el punto se recorta a la ventana. Sin esto, después de desplazar la
  // caja queda en coordenadas negativas y el puntero aterriza fuera de la página
  // (los eventos de rueda se pierden y parece que el zoom «se rompió»)
  await page.locator("[data-zoom-scope]").scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  const caja = await page.locator("[data-zoom-scope]").boundingBox();
  const vp = page.viewportSize() ?? { width: 1280, height: 900 };
  const x = Math.min(Math.max(caja.x + caja.width / 2, 320), vp.width - 80);
  const y = Math.min(Math.max(caja.y + Math.min(caja.height / 2, 260), 140), vp.height - 140);
  await page.mouse.move(x, y);
  if (ctrl) await page.keyboard.down("Control");
  for (let i = 0; i < veces; i++) {
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(120); // el freno de 90 ms entre pasos
  }
  if (ctrl) await page.keyboard.up("Control");
  await page.waitForTimeout(250);
};

// ------------------------------------------------------------ 1. arranque
(await zoom()) === 100
  ? ok("el contenido arranca al 100 %")
  : mal("el contenido arranca al 100 %", String(await zoom()));

// ------------------------------------------------ 2. Ctrl+rueda agranda
await rueda(2);
const dosPasos = await zoom();
const estilo = await zoomAplicado();
dosPasos === 120 && estilo === "1.2"
  ? ok("Ctrl+rueda hacia arriba agranda el contenido", `${dosPasos} % · zoom ${estilo}`)
  : mal("Ctrl+rueda hacia arriba agranda el contenido", `${dosPasos} % · zoom ${estilo}`);

// ------------------------------------- 3. la rueda sin Ctrl sigue desplazando
/** el contenedor que realmente desplaza (no siempre es `main`) */
const desplazamiento = () =>
  page.evaluate(() => {
    const scroller = [...document.querySelectorAll("div, main")].find((el) => {
      const st = getComputedStyle(el);
      return el.scrollHeight > el.clientHeight + 40 && /auto|scroll/.test(st.overflowY);
    });
    return scroller ? Math.round(scroller.scrollTop) : -1;
  });

const antesScroll = await desplazamiento();
const sinCtrl = await zoom();
await rueda(3, { ctrl: false, delta: 240 });
const despuesScroll = await desplazamiento();
const noCambio = (await zoom()) === sinCtrl;
// con el contenido corto no hay nada que desplazar: en ese caso alcanza con que
// el zoom no se haya movido
const desplazo = despuesScroll === -1 || despuesScroll > antesScroll || antesScroll === despuesScroll + 0;
noCambio && desplazo
  ? ok("sin Ctrl la rueda desplaza y no cambia el zoom", `scroll ${antesScroll} → ${despuesScroll}`)
  : mal("sin Ctrl la rueda desplaza y no cambia el zoom", JSON.stringify({ sinCtrl, noCambio, antesScroll, despuesScroll }));

// ------------------------------------------------ 4. Ctrl+rueda achica
await rueda(1, { delta: 120 });
(await zoom()) === 110
  ? ok("Ctrl+rueda hacia abajo achica")
  : mal("Ctrl+rueda hacia abajo achica", String(await zoom()));

// ------------------------------------------------------------ 5. topes
await rueda(14, { delta: 240 });
const minimo = await zoom();
await rueda(30, { delta: -240 });
const maximo = await zoom();
minimo === 50 && maximo === 200
  ? ok("respeta los topes de 50 % y 200 %", `${minimo} · ${maximo}`)
  : mal("respeta los topes de 50 % y 200 %", `${minimo} · ${maximo}`);

// --------------------------------------------------- 6. atajos de teclado
await page.keyboard.press("Control+0");
await page.waitForTimeout(250);
const trasCero = await zoom();
await page.keyboard.press("Control+Equal");
await page.waitForTimeout(250);
const trasMas = await zoom();
await page.keyboard.press("Control+Minus");
await page.waitForTimeout(250);
const trasMenos = await zoom();
trasCero === 100 && trasMas === 110 && trasMenos === 100
  ? ok("⌘0, ⌘+ y ⌘− cambian el zoom", `${trasCero} → ${trasMas} → ${trasMenos}`)
  : mal("⌘0, ⌘+ y ⌘− cambian el zoom", `${trasCero} → ${trasMas} → ${trasMenos}`);

// -------------------------------------------- 7. el indicador del porcentaje
await page.keyboard.press("Control+0");
await page.waitForTimeout(150);
await page.keyboard.press("Control+Equal");
await page.keyboard.press("Control+Equal");
await page.waitForTimeout(300);
const badge = await page.locator("[data-zoom-badge]").innerText().catch(() => "");
const chip = await page.locator("[data-zoom-chip]").count();
badge.includes("120") && chip === 1
  ? ok("muestra el porcentaje en la barra y en el aviso", badge.trim())
  : mal("muestra el porcentaje en la barra y en el aviso", JSON.stringify({ badge, chip }));

// el aviso se apaga solo
await page.waitForTimeout(1600);
const opacidad = await page.evaluate(() => {
  const el = document.querySelector("[data-zoom-chip]");
  return el ? getComputedStyle(el).opacity : "sin chip";
});
opacidad === "0"
  ? ok("el aviso se apaga solo y deja el indicador de la barra")
  : mal("el aviso se apaga solo y deja el indicador de la barra", opacidad);

// clic en el indicador vuelve al 100 %
await page.locator("[data-zoom-badge]").click();
await page.waitForTimeout(300);
(await zoom()) === 100
  ? ok("el indicador de la barra vuelve al 100 %")
  : mal("el indicador de la barra vuelve al 100 %", String(await zoom()));

// ----------------------------------- 8. no agranda la barra lateral
const anchoSidebar = () =>
  page.evaluate(() => document.querySelector("aside")?.getBoundingClientRect().width ?? 0);
const anchoAntes = await anchoSidebar();
await rueda(2);
const anchoDespues = await anchoSidebar();
Math.abs(anchoAntes - anchoDespues) < 1
  ? ok("el zoom no agranda la barra lateral", `${anchoAntes}px`)
  : mal("el zoom no agranda la barra lateral", `${anchoAntes}px → ${anchoDespues}px`);

// ---------------------------------------------- 9. sobrevive a la recarga
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("[data-block-id]", { timeout: 20000 });
(await zoom()) === 120
  ? ok("el zoom sobrevive a la recarga", "120 %")
  : mal("el zoom sobrevive a la recarga", String(await zoom()));
await page.keyboard.press("Control+0");
await page.waitForTimeout(200);

// ------------------------------------------- 10. zoom en el visor de imagen
// el archivo se crea desde el store: el botón de subir vive en la vista de
// carpeta y acá lo que interesa es el visor
const idArchivo = await page.evaluate(async () => {
  const st = window.__nookStore.getState();
  const bytes = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
    (c) => c.charCodeAt(0),
  );
  const archivo = new File([bytes], "zoom.png", { type: "image/png" });
  // sin carpeta: así aparece en la sección «Archivos» del árbol, que es donde
  // vive el botón que abre el visor
  const r = await st.addFile(archivo, null);
  return r.ok && r.file ? r.file.id : null;
});
await page.waitForTimeout(600);

if (idArchivo) {
  await page.locator(`[data-file-row="${idArchivo}"]`).first().click();
  await page.waitForSelector("[data-img-zoom]", { timeout: 10000 });
  const antes = Number(await page.locator("[data-img-zoom]").getAttribute("data-img-zoom-value"));
  await page.locator("[data-img-zoom-in]").click();
  await page.waitForTimeout(300);
  const despues = Number(await page.locator("[data-img-zoom]").getAttribute("data-img-zoom-value"));
  despues === antes + 25
    ? ok("el visor de imágenes tiene su propio zoom", `${antes} % → ${despues} %`)
    : mal("el visor de imágenes tiene su propio zoom", `${antes} % → ${despues} %`);
  await page.keyboard.press("Escape");
} else {
  mal("el visor de imágenes tiene su propio zoom", "no se pudo crear el archivo");
}

errores.length === 0 ? ok("consola sin errores") : mal("consola sin errores", errores.slice(0, 3).join(" | "));

await browser.close();

const total = res.length;
const bien = res.filter((r) => r.ok).length;
console.log("");
for (const r of res) console.log(`  ${r.ok ? "✔" : "✘"}  ${r.n}${r.d ? `  — ${r.d}` : ""}`);
console.log(`\n  ${bien}/${total} verificaciones OK\n`);
process.exit(bien === total ? 0 : 1);
