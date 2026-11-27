/**
 * Verificación de la capa de suscripción (0.4.0).
 *
 *  1. la app arranca con la suscripción activa y todas las capacidades habilitadas
 *  2. una clave inválida no activa nada y se avisa
 *  3. una clave válida activa la suscripción y queda guardada
 *  4. cancelar baja al plan Gratis: aparecen los topes (10 miembros)
 *  5. reactivar devuelve los límites ilimitados y la invitación vuelve a andar
 *
 * Uso: node scripts/verificar-040.mjs http://127.0.0.1:4321
 */

import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4321';
const DEMO = 'NOOK-DEMA-KPR2-X6QT';
const INVALIDA = 'NOOK-AAAA-BBBB-CCCC';

const res = [];
const ok = (n, d = '') => res.push({ n, ok: true, d });
const mal = (n, d = '') => res.push({ n, ok: false, d });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errores = [];
page.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
page.on('pageerror', (e) => errores.push(String(e)));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

await page.keyboard.press('Control+k');
await page.waitForTimeout(300);
await page.keyboard.type('Plan y suscripción');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(400);

const estadoInicial = await page.evaluate(() => {
  const texto = document.body.innerText;
  const registro = /(\d+)\/(\d+) habilitadas/.exec(texto);
  return {
    titulo: /Nook Business/.test(texto),
    activo: /\bactivo\b/i.test(texto),
    habilitadas: registro ? Number(registro[1]) : null,
    total: registro ? Number(registro[2]) : null,
    ilimitados: (texto.match(/Ilimitad[oa]s?/g) ?? []).length,
    tieneLicencia: /activar con una licencia/i.test(texto),
  };
});

if (estadoInicial.titulo && estadoInicial.activo && estadoInicial.habilitadas === estadoInicial.total && estadoInicial.total > 0) {
  ok('suscripción activa de fábrica', `${estadoInicial.habilitadas}/${estadoInicial.total} capacidades, ${estadoInicial.ilimitados} "ilimitado"`);
} else {
  mal('suscripción activa de fábrica', JSON.stringify(estadoInicial));
}

await page.screenshot({ path: '/home/user/nook-040-plan.png' });

/* ----------------------------- clave inválida ----------------------------- */
const escribirClave = async (clave) => {
  await page.evaluate(async (k) => {
    const input = document.querySelector('input[aria-label="Clave de licencia"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, k);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, clave);
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Activar')?.click();
  });
  await page.waitForTimeout(250);
  return page.evaluate(() => document.body.innerText);
};

const trasInvalida = await escribirClave(INVALIDA);
if (/no es válida/i.test(trasInvalida)) ok('clave inválida rechazada');
else mal('clave inválida rechazada', trasInvalida.slice(0, 120));

/* ------------------------------ clave válida ------------------------------ */
const trasValida = await escribirClave(DEMO);
const activada = /suscripción activada/i.test(trasValida) && /licencia DEMAKPR2X6Q/i.test(trasValida);
if (activada) ok('licencia válida activa la suscripción');
else mal('licencia válida activa la suscripción', trasValida.slice(0, 160));

const persistida = await page.evaluate(() => {
  const raw = localStorage.getItem('nook-workspace-v2');
  const data = JSON.parse(raw ?? '{}');
  return { active: data?.state?.plan?.active, license: data?.state?.plan?.license, tier: data?.state?.plan?.tier };
});
if (persistida.active === true && persistida.license === 'DEMAKPR2X6Q' && persistida.tier === 'business') {
  ok('suscripción persistida', JSON.stringify(persistida));
} else {
  mal('suscripción persistida', JSON.stringify(persistida));
}

/* ------------------------------- cancelar -------------------------------- */
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => /Cancelar suscripción/.test(b.textContent ?? ''))?.click();
});
await page.waitForTimeout(350);

const cancelada = await page.evaluate(() => {
  const texto = document.body.innerText;
  const registro = /(\d+)\/(\d+) habilitadas/.exec(texto);
  return {
    inactivo: /inactivo/i.test(texto),
    habilitadas: registro ? Number(registro[1]) : null,
    total: registro ? Number(registro[2]) : null,
    topeMiembros: /El plan actual permite 10 miembros/.test(texto) || /Plan Gratis/.test(texto),
  };
});
if (cancelada.inactivo && cancelada.habilitadas === 0) {
  ok('cancelar baja al plan Gratis', `${cancelada.habilitadas}/${cancelada.total} capacidades`);
} else {
  mal('cancelar baja al plan Gratis', JSON.stringify(cancelada));
}

/* --------------- con el plan Gratis, el tope de 10 se respeta -------------- */
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
const tope = await page.evaluate(async () => {
  const store = window.__nookStore;
  if (!store) return { error: 'sin store expuesto' };
  const { inviteMember, members } = store.getState();
  let ultimo = null;
  let agregados = 0;
  for (let i = 0; i < 12; i += 1) {
    const r = inviteMember({ email: `tope${i}@x.dev` });
    if (!r.ok) { ultimo = r.error; break; }
    agregados += 1;
  }
  return { miembros: store.getState().members.length, agregados, ultimo, previos: members.length };
});
if (tope.ultimo && /permite 10 miembros/.test(tope.ultimo)) {
  ok('tope del plan Gratis aplicado', `${tope.agregados} invitados y después corta`);
} else {
  mal('tope del plan Gratis aplicado', JSON.stringify(tope));
}

/* ------------------------------- reactivar -------------------------------- */
const reactivado = await page.evaluate(() => {
  const store = window.__nookStore;
  const r = store.getState().activateLicense('NOOK-DEMA-KPR2-X6QT');
  const { inviteMember } = store.getState();
  const antes = store.getState().members.length;
  const inv = inviteMember({ email: 'despues@x.dev' });
  return {
    ok: r.ok,
    invito: inv.ok,
    antes,
    despues: store.getState().members.length,
    ilimitado: store.getState().members.some((m) => m.email === 'despues@x.dev'),
  };
});
if (reactivado.ok && reactivado.invito && reactivado.ilimitado) {
  ok('reactivar devuelve los miembros sin límite', `${reactivado.antes} → ${reactivado.despues}`);
} else {
  mal('reactivar devuelve los miembros sin límite', JSON.stringify(reactivado));
}


/* ---------------- respaldo: los miembros viajan y vuelven ---------------- */
await page.evaluate(() => {
  window.__nookStore.getState().inviteMember({ email: 'respaldo@equipo.dev', role: 'editor' });
  window.__nookStore.getState().setUI({ settingsOpen: true, settingsTab: 'Datos' });
});
await page.waitForTimeout(400);

const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }),
  page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => /Exportar respaldo/i.test(b.textContent ?? ''))?.click();
  }),
]);
const archivo = await download.path();
const respaldoJson = JSON.parse(fs.readFileSync(archivo, 'utf8'));

const traeMiembros =
  respaldoJson.version === 3 &&
  Array.isArray(respaldoJson.members) &&
  respaldoJson.members.some((m) => m.email === 'respaldo@equipo.dev');

if (traeMiembros) {
  ok('el respaldo incluye los miembros', `${respaldoJson.members.length} miembros, version ${respaldoJson.version}`);
} else {
  mal('el respaldo incluye los miembros', JSON.stringify({ v: respaldoJson.version, members: respaldoJson.members?.length }));
}

const idaYVuelta = await page.evaluate((backup) => {
  const store = window.__nookStore;
  // borramos el equipo como si fuera un workspace nuevo
  store.setState({ members: [] });
  const restaurado = store.getState().restoreBackup(backup);
  return {
    restaurado,
    vuelve: store.getState().members.some((m) => m.email === 'respaldo@equipo.dev'),
    total: store.getState().members.length,
  };
}, respaldoJson);

if (idaYVuelta.restaurado && idaYVuelta.vuelve) {
  ok('restaurar devuelve los miembros', `${idaYVuelta.total} miembros`);
} else {
  mal('restaurar devuelve los miembros', JSON.stringify(idaYVuelta));
}

/* un respaldo viejo (sin members) no debe vaciar el equipo */
const sinMiembros = await page.evaluate((backup) => {
  const store = window.__nookStore;
  const antes = store.getState().members.length;
  const legacy = { ...backup };
  delete legacy.members;
  store.getState().restoreBackup(legacy);
  return { antes, despues: store.getState().members.length };
}, respaldoJson);

if (sinMiembros.despues === sinMiembros.antes && sinMiembros.antes > 0) {
  ok('respaldo sin miembros conserva el equipo', `${sinMiembros.despues} miembros`);
} else {
  mal('respaldo sin miembros conserva el equipo', JSON.stringify(sinMiembros));
}

await page.keyboard.press('Escape');
await page.waitForTimeout(200);

/* ---------------------------------------------------------------------------
 * exportación completa del workspace (Business)
 *
 * Se genera un solo HTML con índice y todas las páginas. Se comprueba que el
 * archivo sale de verdad, que no anida documentos y que sin suscripción el
 * botón queda deshabilitado.
 * ------------------------------------------------------------------------- */
await page.evaluate(() => {
  window.__nookStore.getState().activateLicense('NOOK-DEMA-KPR2-X6QT');
  window.__nookStore.getState().setUI({ settingsOpen: true, settingsTab: 'Datos' });
});
await page.waitForTimeout(400);

const botonTodo = page.locator('button:has-text("Exportar todo (HTML)")');
const habilitado = await botonTodo.first().isEnabled().catch(() => false);
let exportacion = null;
if (habilitado) {
  const [descarga] = await Promise.all([page.waitForEvent('download'), botonTodo.first().click()]);
  const fs = await import('node:fs/promises');
  const html = await fs.readFile(await descarga.path(), 'utf8');
  exportacion = {
    nombre: descarga.suggestedFilename(),
    secciones: (html.match(/<section id=/g) || []).length,
    indice: /class="indice"/.test(html),
    // un solo <html>: las páginas no deben venir como documentos anidados
    htmls: (html.match(/<html/gi) || []).length,
    titulos: (html.match(/<h2>/g) || []).length,
  };
}

const sinLicencia = await page.evaluate(() => {
  window.__nookStore.getState().deactivatePlan();
  return window.__nookStore.getState().plan.active;
});
await page.waitForTimeout(300);
const bloqueadoSinPlan = !(await botonTodo.first().isEnabled().catch(() => false));

if (
  habilitado &&
  exportacion &&
  exportacion.secciones >= 8 &&
  exportacion.indice &&
  exportacion.htmls === 1 &&
  exportacion.titulos === exportacion.secciones &&
  sinLicencia === false &&
  bloqueadoSinPlan
) {
  ok(
    'exportación completa del workspace',
    `${exportacion.secciones} páginas en ${exportacion.nombre}`,
  );
} else {
  mal('exportación completa del workspace', JSON.stringify({ habilitado, exportacion, bloqueadoSinPlan }));
}

/* --------------------------------- cierre -------------------------------- */
if (!errores.length) ok('consola sin errores');
else mal('consola sin errores', errores.slice(0, 3).join(' | '));

await browser.close();

console.log('');
for (const r of res) console.log(`${r.ok ? '✅' : '❌'} ${r.n}${r.d ? ` — ${r.d}` : ''}`);
const fallos = res.filter((r) => !r.ok).length;
console.log(`\n${res.length - fallos}/${res.length} verificaciones OK`);
process.exit(fallos ? 1 : 0);
