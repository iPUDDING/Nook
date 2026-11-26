/**
 * Capturas + verificación de runtime con Chromium headless.
 *
 *   node scripts/capturas.mjs            (con `next dev` o `next start` corriendo)
 *
 * Genera docs/capturas/*.png y falla si hubo errores de consola o de página.
 *
 * El contenedor no tiene voces de sistema, así que antes de cargar la app se
 * instala un `speechSynthesis` de prueba que emite `onstart`, `onboundary` y
 * `onend` con temporizadores. No reproduce audio: sirve para ejercitar la
 * máquina de estados del motor de lectura (cola, progreso, resaltado) y para
 * poder capturar la barra flotante.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const OUT = new URL("../docs/capturas/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const errores = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  locale: "es-AR",
});
const page = await ctx.newPage();

// ------------------------------------------------- speechSynthesis de prueba
await page.addInitScript(() => {
  const voices = [
    { voiceURI: "stub-es-ar", name: "Voz de prueba (es-AR)", lang: "es-AR", localService: true, default: true },
    { voiceURI: "stub-es-es", name: "Voz de prueba (es-ES)", lang: "es-ES", localService: false, default: false },
  ];

  class StubUtterance {
    constructor(text) {
      this.text = text;
      this.rate = 1;
      this.pitch = 1;
      this.volume = 1;
      this.lang = "es-AR";
      this.voice = null;
      this.onstart = null;
      this.onend = null;
      this.onboundary = null;
      this.onerror = null;
    }
  }

  const synth = {
    token: 0,
    paused: false,
    speaking: false,
    speak(utterance) {
      this.speaking = true;
      const token = (this.token += 1);
      utterance.onstart?.();
      const total = Math.max(1, utterance.text.length);
      const step = Math.max(1, Math.ceil(total / 4));
      let at = 0;
      const timer = setInterval(() => {
        if (this.token !== token) {
          clearInterval(timer);
          return;
        }
        at = Math.min(total, at + step);
        utterance.onboundary?.({ charIndex: at, name: "word" });
        if (at >= total) {
          clearInterval(timer);
          this.speaking = false;
          utterance.onend?.();
        }
      }, 220);
    },
    cancel() {
      this.token += 1;
      this.speaking = false;
    },
    pause() {
      this.paused = true;
    },
    resume() {
      this.paused = false;
    },
    getVoices() {
      return voices;
    },
    addEventListener() {},
    removeEventListener() {},
  };

  window.SpeechSynthesisUtterance = StubUtterance;
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synth });
});

const RUIDO = [/webpack-hmr/i, /Download the React DevTools/i, /favicon/i];
page.on("console", (m) => {
  const txt = m.text();
  if (m.type() === "error" && !RUIDO.some((r) => r.test(txt))) errores.push(`console: ${txt}`);
});
page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log(`  ✔ ${name}.png`);
};

// ---------------------------------------------------------------- 1. inicio
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector('aside[aria-label="Barra lateral"]', { timeout: 20000 });
await page.waitForTimeout(600);
await shot("01-inicio-claro");

// --------------------------------------------------------- 2. menú de bloques
const bloques = page.locator('[contenteditable="true"]');
await bloques.nth(2).click();
await page.keyboard.press("End");
await page.keyboard.press("Enter");
await page.keyboard.type("/");
await page.waitForTimeout(350);
await shot("02-menu-slash");
await page.keyboard.press("Escape");

// ------------------------------------------------------------- 3. modo oscuro
await page.keyboard.press("Control+Shift+L");
await page.waitForTimeout(500);
await shot("03-modo-oscuro");
await page.keyboard.press("Control+Shift+L");
await page.waitForTimeout(400);

// ------------------------------------------------------- 4. base de datos (tabla)
await page.getByRole("button", { name: /Roadmap de producto/ }).first().click();
await page.waitForTimeout(700);
await shot("04-base-de-datos-tabla");

// --------------------------------------------------------------- 5. vista board
await page.getByRole("button", { name: "Board", exact: true }).click();
await page.waitForTimeout(600);
await shot("05-base-de-datos-board");

// --------------------------------------------------------- 6. click en una fila
await page.locator("text=Editor de bloques con menú").first().click();
await page.waitForTimeout(600);
await shot("06-panel-de-fila");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// ------------------------------------------------------ 7. paleta de comandos
await page.keyboard.press("Control+K");
await page.waitForTimeout(400);
await page.keyboard.type("wiki");
await page.waitForTimeout(400);
await shot("07-paleta-comandos");
await page.keyboard.press("Escape");

// ------------------------------------------------------------- 8. compartir
await page.getByRole("button", { name: "Compartir", exact: true }).click();
await page.waitForTimeout(500);
await shot("08-compartir");
await page.keyboard.press("Escape");

// ------------------------------------------------ 9. nota de reunión (bloques)
await page.getByRole("button", { name: /Notas de reunión/ }).first().click();
await page.waitForTimeout(700);
await shot("09-bloques-varios");

// ------------------------------------------------------ 10. sidebar colapsada
await page.keyboard.press("Control+\\");
await page.waitForTimeout(500);
await shot("10-sidebar-colapsada");

// ==========================================================================
//                    Lectura, voz, foco y productividad
// ==========================================================================

// volvemos a mostrar la barra lateral y a una página de texto
await page.keyboard.press("Control+\\");
await page.waitForTimeout(400);
await page.getByRole("button", { name: /Notas de reunión/ }).first().click();
await page.waitForTimeout(600);

// ------------------------------------------- 11. modo lectura con papel sepia
await page.keyboard.press("Control+Shift+E");
await page.waitForTimeout(300);
await page.keyboard.press("Control+,");
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Sepia", exact: true }).click();
await page.waitForTimeout(200);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.mouse.wheel(0, 240);
await page.waitForTimeout(500);
await shot("11-modo-lectura-sepia");

// salimos del modo lectura y volvemos al tope
await page.keyboard.press("Control+Shift+E");
await page.waitForTimeout(200);
await page.evaluate(() => document.getElementById("page-scroll")?.scrollTo({ top: 0 }));
await page.waitForTimeout(300);

// ------------------------------------------ 12. lectura en voz alta (barra)
await page.keyboard.press("Control+Shift+R");
await page.waitForTimeout(1400);
await shot("12-barra-lectura-voz");

// --------------------------------------- 13. barra acoplada al lateral
await page.locator('button[aria-label="Acoplar o desacoplar la barra"]').first().click();
await page.waitForTimeout(700);
await shot("13-barra-acoplada");
await page.locator('button[aria-label="Acoplar o desacoplar la barra"]').first().click();
await page.waitForTimeout(500);

// ------------------------------------------------ 14. pomodoro en marcha
await page.locator('button[title^="Pomodoro"]').first().click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Iniciar", exact: true }).click();
await page.waitForTimeout(900);
await shot("14-pomodoro");
// dejamos el pomodoro y la voz apagados para la siguiente captura
await page.getByRole("button", { name: "Pausar", exact: true }).click();
await page.waitForTimeout(200);
await page.keyboard.press("Space");
await page.waitForTimeout(300);

// ------------------------------------------------- 14. mapa mental
await page.keyboard.press("Control+Shift+M");
await page.waitForTimeout(900);
await shot("15-mapa-mental");

// ------------------------------------------------- 15. ajustes · voz
await page.keyboard.press("Control+Shift+M");
await page.waitForTimeout(300);
await page.keyboard.press("Control+,");
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Voz", exact: true }).click();
await page.waitForTimeout(400);
await shot("16-ajustes-voz");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// --------------------------------------------- 16. paleta con los comandos
await page.keyboard.press("Control+K");
await page.waitForTimeout(400);
await page.keyboard.type("lectura");
await page.waitForTimeout(400);
await shot("17-paleta-nuevos-comandos");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

await browser.close();

console.log("");
if (errores.length) {
  console.log(`✘ ${errores.length} error(es) de runtime:`);
  for (const e of [...new Set(errores)].slice(0, 20)) console.log("   -", e);
  process.exit(1);
}
console.log("✔ sin errores de consola ni de página");
