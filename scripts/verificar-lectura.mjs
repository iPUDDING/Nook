/**
 * Verificación de la lectura en voz alta y del seguimiento visual.
 *
 * Cubre las tres cosas que se rompen de verdad en producción y no se ven en una
 * captura:
 *
 *  1. **el subrayado avanza** aunque la voz no emita `boundary` (las SAPI de
 *     Windows dentro de Electron no lo hacen);
 *  2. **clic derecho → "Empezar a leer desde aquí"** arranca en el bloque —y en
 *     la frase— que está debajo del puntero;
 *  3. **F11** entra y sale de pantalla completa.
 *
 * La voz se simula: en un contenedor sin voces instaladas `speechSynthesis`
 * existe pero no dice nada, así que el motor nunca avanzaría.
 *
 * Uso: node scripts/verificar-lectura.mjs http://127.0.0.1:4321
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4321';
const res = [];
const ok = (n, d = '') => res.push({ n, ok: true, d });
const mal = (n, d = '') => res.push({ n, ok: false, d });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

/* voz simulada: la primera locución (título) termina rápido; el resto dura y
   NO emite boundary, que es exactamente el caso que dejaba el subrayado clavado */
await page.addInitScript(() => {
  let n = 0;
  const fake = {
    speaking: false,
    paused: false,
    pending: false,
    onvoiceschanged: null,
    __dichos: [],
    getVoices: () => [],
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
    cancel() {
      this.speaking = false;
    },
    pause() {},
    resume() {},
    speak(u) {
      n += 1;
      this.speaking = true;
      this.__dichos.push((u.text ?? "").slice(0, 40));
      setTimeout(() => u.onstart?.({}), 20);
      const dur = n === 1 ? 150 : 12000;
      setTimeout(() => {
        this.speaking = false;
        u.onend?.({});
      }, dur);
    },
  };
  Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
});

const errores = [];
page.on("pageerror", (e) => errores.push(String(e).slice(0, 160)));
page.on("console", (m) => m.type() === "error" && errores.push(m.text().slice(0, 160)));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(700);

const estado = () =>
  page.evaluate(() => {
    const texto = (nombre) => {
      const h = CSS.highlights?.get(nombre);
      return h ? ([...h][0]?.toString?.() ?? "") : "";
    };
    const activo = document.querySelector(".tts-active");
    return {
      bloque: activo?.getAttribute("data-block-id") ?? null,
      esTitulo: !!activo?.hasAttribute("data-tts-title"),
      frase: texto("nook-tts"),
      yaLeido: texto("nook-tts-now").length,
    };
  });

/* ------------------ 1. el subrayado avanza sin boundary ------------------ */
await page.locator('button[aria-label="Leer la página en voz alta"]').click();
await page.waitForTimeout(900); // el título ya pasó, empieza el primer bloque
const m1 = await estado();
await page.waitForTimeout(2600);
const m2 = await estado();

if (m1.frase.length > 0 && m2.yaLeido > m1.yaLeido && m2.yaLeido > 0) {
  ok("el subrayado avanza sin eventos del motor", `${m1.yaLeido} → ${m2.yaLeido} caracteres`);
} else {
  mal("el subrayado avanza sin eventos del motor", JSON.stringify({ m1, m2 }));
}

/* ---------------- 2. dos capas: frase y lo ya pronunciado --------------- */
const dosCapas = await page.evaluate(() => {
  const frase = CSS.highlights?.get("nook-tts");
  const ahora = CSS.highlights?.get("nook-tts-now");
  const a = frase ? [...frase][0]?.toString?.() ?? "" : "";
  const b = ahora ? [...ahora][0]?.toString?.() ?? "" : "";
  return { frase: a.length, ahora: b.length, prefijo: b.length > 0 && a.startsWith(b) };
});

if (dosCapas.frase > 0 && dosCapas.ahora > 0 && dosCapas.prefijo) {
  ok("dos capas de resaltado (frase + pronunciado)", `${dosCapas.ahora}/${dosCapas.frase} caracteres`);
} else {
  mal("dos capas de resaltado (frase + pronunciado)", JSON.stringify(dosCapas));
}

/* ---------------------------- 3. detener limpia ------------------------- */
// Escape no detiene la lectura (cierra overlays): se usa el botón de la barra
await page.locator('button[aria-label="Detener lectura"]').first().click().catch(() => {});
await page.waitForTimeout(500);
const trasParar = await page.evaluate(() => ({
  activos: document.querySelectorAll(".tts-active").length,
  frase: CSS.highlights?.get("nook-tts") ? [...CSS.highlights.get("nook-tts")].length : 0,
}));

/* ------------------- 4. clic derecho: leer desde aquí ------------------- */
const objetivo = await page.evaluate(() => {
  const bloques = [...document.querySelectorAll("[data-block-id]")];
  const el = bloques[4];
  el.scrollIntoView({ block: "center" });
  const id = el.getAttribute("data-block-id");
  const caja = (el.querySelector("[contenteditable]") ?? el).getBoundingClientRect();
  const texto = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  return { id, texto: texto.slice(0, 40), x: Math.round(caja.x + 40), y: Math.round(caja.y + 8) };
});
await page.waitForTimeout(300);

await page.mouse.click(objetivo.x, objetivo.y, { button: "right" });
await page.waitForTimeout(350);
const menu = await page.evaluate(() => {
  const m = document.querySelector('[role="menu"][aria-label="Leer desde aquí"]');
  return m ? [...m.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent.trim()) : null;
});

await page.locator('[role="menuitem"]:has-text("Empezar a leer desde aquí")').click();
await page.waitForTimeout(800);
const desde = await estado();
const dicho = await page.evaluate(() => window.speechSynthesis.__dichos.slice(-1)[0] ?? null);

if (
  menu &&
  menu.some((t) => /Empezar a leer desde aquí/i.test(t)) &&
  desde.bloque === objetivo.id &&
  dicho &&
  objetivo.texto.slice(0, 18).includes(dicho.slice(0, 18))
) {
  ok("clic derecho: lee desde el bloque del puntero", `“${dicho?.slice(0, 30)}…”`);
} else {
  mal("clic derecho: lee desde el bloque del puntero", JSON.stringify({ menu, desde, dicho, objetivo }));
}

const cerroMenu = await page.evaluate(
  () => !document.querySelector('[role="menu"][aria-label="Leer desde aquí"]'),
);
if (cerroMenu) ok("el menú contextual se cierra al elegir");
else mal("el menú contextual se cierra al elegir");

/* --------------------------- 5. F11 pantalla completa ------------------ */
await page.locator('button[aria-label="Detener lectura"]').first().click().catch(() => {});
await page.keyboard.press("F11");
await page.waitForTimeout(600);
const entro = await page.evaluate(() => !!document.fullscreenElement);
await page.keyboard.press("F11");
await page.waitForTimeout(600);
const salio = await page.evaluate(() => !document.fullscreenElement);

if (entro && salio) ok("F11 entra y sale de pantalla completa");
else mal("F11 entra y sale de pantalla completa", JSON.stringify({ entro, salio }));

/* ------------------------ 6. la app sigue sana ------------------------- */
if (trasParar.activos === 0 && trasParar.frase === 0) ok("detener la lectura limpia el resaltado");
else mal("detener la lectura limpia el resaltado", JSON.stringify(trasParar));

const ruido = errores.filter((e) => !/Failed to load resource/i.test(e));
if (!ruido.length) ok("consola sin errores");
else mal("consola sin errores", ruido.slice(0, 3).join(" | "));

await browser.close();

console.log("");
for (const r of res) console.log(`${r.ok ? "✅" : "❌"} ${r.n}${r.d ? ` — ${r.d}` : ""}`);
const fallos = res.filter((r) => !r.ok).length;
console.log(`\n${res.length - fallos}/${res.length} verificaciones OK`);
process.exit(fallos ? 1 : 0);
