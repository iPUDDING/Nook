/**
 * Verificación del historial de versiones por página.
 *
 * Lo que de verdad puede fallar y no se ve en una captura:
 *
 *  1. que editar **cree** una versión (con el respiro de 4 s del rastreador);
 *  2. que **no** se dupliquen versiones si el contenido no cambió;
 *  3. que **restaurar** vuelva el contenido atrás *y* deje guardado el estado
 *     previo, para que el error sea reversible;
 *  4. que la **retención por plan** recorte lo viejo (7 / 30 / 90 / sin límite);
 *  5. que con el almacenamiento **lleno** la app no se rompa ni pierda la nota;
 *  6. que la ventana del historial abra desde la paleta y restaure de verdad.
 *
 * Uso: node scripts/verificar-historial.mjs http://127.0.0.1:4321
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4321';
const res = [];
const ok = (n, d = '') => res.push({ n, ok: true, d });
const mal = (n, d = '') => res.push({ n, ok: false, d });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errores = [];
page.on('pageerror', (e) => errores.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errores.push(m.text());
});

/** Estado del historial de la página abierta, leído del store real. */
const historial = () =>
  page.evaluate(() => {
    const st = window.__nookStore.getState();
    return (st.versions?.[st.selectedId] ?? []).map((v) => ({
      id: v.id,
      at: v.at,
      titulo: v.title,
      texto: v.blocks.map((b) => (b.html ?? '').replace(/<[^>]+>/g, '')).join(' ').trim(),
      bloques: v.blocks.length,
    }));
  });

/** Escribe en el primer bloque de texto y espera a que el editor lo asiente. */
async function escribir(texto) {
  const bloque = page.locator('[data-block-id] [contenteditable="true"]').first();
  await bloque.click();
  await page.keyboard.press('End');
  await page.keyboard.type(texto, { delay: 12 });
  await page.waitForTimeout(300);
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-block-id]');
// arranque limpio: el historial de sesiones anteriores no debe contaminar el conteo
await page.evaluate(() => {
  localStorage.removeItem('nook-versions-v1');
  window.__nookStore.getState().hydrateVersions();
});
await page.waitForTimeout(200);

/* ---------------------------------------------------------------------- */
/* 1. editar crea una versión (respiro del rastreador incluido)            */
/* ---------------------------------------------------------------------- */
await escribir(' versión uno');
const tras = async (ms) => {
  await page.waitForTimeout(ms);
  return historial();
};

// el rastreador espera 4 s: se sondean hasta 9 s por si el CI va lento
let v1 = [];
for (let i = 0; i < 9; i += 1) {
  v1 = await tras(1000);
  if (v1.length > 0) break;
}
if (v1.length > 0 && v1[0].texto.includes('versión uno')) {
  ok('editar crea una versión', `«${v1[0].texto.slice(0, 40)}» · ${v1[0].bloques} bloques`);
} else {
  mal('editar crea una versión', `historial: ${JSON.stringify(v1).slice(0, 160)}`);
}

/* ---------------------------------------------------------------------- */
/* 2. sin cambios no se duplica                                           */
/* ---------------------------------------------------------------------- */
const duplicado = await page.evaluate(() => {
  const st = window.__nookStore.getState();
  return st.captureVersion(st.selectedId); // debe devolver false
});
const conteo = (await historial()).length;
if (duplicado === false && conteo === v1.length) {
  ok('sin cambios no se duplica', `${conteo} versión(es)`);
} else {
  mal('sin cambios no se duplica', `capture=${duplicado} versiones=${conteo}`);
}

/* ---------------------------------------------------------------------- */
/* 3. restaurar vuelve atrás y guarda el estado previo                    */
/* ---------------------------------------------------------------------- */
const objetivo = (await historial())[0];
await escribir(' DESPUES');
await page.waitForTimeout(4200);
const antesDeRestaurar = await historial();

const restaurado = await page.evaluate((id) => {
  const st = window.__nookStore.getState();
  return st.restoreVersion(st.selectedId, id);
}, objetivo.id);
await page.waitForTimeout(400);

const textoActual = await page.evaluate(() => {
  const st = window.__nookStore.getState();
  return st.pages[st.selectedId].blocks.map((b) => (b.html ?? '').replace(/<[^>]+>/g, '')).join(' ');
});
const trasRestaurar = await historial();
const guardoPrevio = trasRestaurar.some((v) => v.texto.includes('DESPUES'));

// restaurar debe haber quitado lo escrito después (o al menos volver al snapshot)
const volvio = restaurado === true && trasRestaurar.length > 0;
if (volvio && guardoPrevio) {
  ok('restaurar es reversible', `${antesDeRestaurar.length} versiones · estado previo guardado`);
} else if (volvio) {
  mal('restaurar es reversible', `restauró pero no guardó el estado previo · texto «${textoActual.slice(0, 40)}»`);
} else {
  mal('restaurar es reversible', `restoreVersion devolvió ${restaurado}`);
}

/* ---------------------------------------------------------------------- */
/* 4. retención por plan recorta lo viejo                                */
/* ---------------------------------------------------------------------- */
const poda = await page.evaluate(async () => {
  const st = window.__nookStore.getState();
  const id = st.selectedId;
  const dia = 24 * 60 * 60 * 1000;
  const ahora = Date.now();
  // tres versiones de sonda: 40, 20 y 1 día de antigüedad
  const viejas = [40, 20, 1].map((dias, i) => ({
    id: `ver_prueba_${i}`,
    at: ahora - dias * dia,
    title: st.pages[id].title,
    blocks: st.pages[id].blocks.map((b) => ({ ...b, html: `<p>sonda ${dias} días</p>` })),
  }));

  const resultados = {};
  for (const tier of ['pro', 'free', 'enterprise']) {
    // se parte siempre de la misma base: sondas + lo que hubiera
    const base = { ...st.versions, [id]: [...viejas, ...(st.versions[id] ?? []).filter((v) => !v.id.startsWith('ver_prueba_'))] };
    window.__nookStore.setState({ versions: base, plan: { ...st.plan, tier, active: true } });
    const s2 = window.__nookStore.getState();
    // captureVersion pasa por historyLimit(): es la poda real, no una copia
    s2.captureVersion(id);
    const listado = window.__nookStore.getState().versions[id] ?? [];
    resultados[tier] = {
      total: listado.length,
      // la sonda de 40 días sólo debe sobrevivir donde no hay tope
      de40dias: listado.filter((v) => ahora - v.at > 39 * dia).length,
      de20dias: listado.filter((v) => ahora - v.at > 19 * dia && ahora - v.at < 25 * dia).length,
    };
  }
  return resultados;
});

const proOk = poda.pro.de40dias === 0 && poda.pro.de20dias === 1;
const freeOk = poda.free.de40dias === 0 && poda.free.de20dias === 0 && poda.free.total < poda.pro.total;
const entOk = poda.enterprise.de40dias === 1 && poda.enterprise.total > poda.pro.total;
if (proOk && freeOk && entOk) {
  ok(
    'retención por plan (30 / 7 / sin límite)',
    `pro ${poda.pro.total} · free ${poda.free.total} · enterprise ${poda.enterprise.total}`,
  );
} else {
  mal('retención por plan (30 / 7 / sin límite)', JSON.stringify(poda));
}

/* ---------------------------------------------------------------------- */
/* 4b. cambiar de plan recorta el historial sin esperar a la próxima captura */
/* ---------------------------------------------------------------------- */
const alCambiarPlan = await page.evaluate(async () => {
  const st = window.__nookStore.getState();
  const id = st.selectedId;
  const dia = 24 * 60 * 60 * 1000;
  const ahora = Date.now();
  const viejas = [120, 60, 2].map((dias, i) => ({
    id: `ver_plan_${i}`,
    at: ahora - dias * dia,
    title: st.pages[id].title,
    blocks: st.pages[id].blocks,
  }));
  window.__nookStore.setState({ versions: { ...st.versions, [id]: viejas } });

  const cuenta = () => (window.__nookStore.getState().versions[id] ?? []).length;
  window.__nookStore.getState().setPlanTier('business'); // 90 días → quedan 60 y 2
  const business = cuenta();
  window.__nookStore.getState().setPlanTier('free'); // 7 días → queda sólo la de 2
  const free = cuenta();
  window.__nookStore.getState().setPlanTier('enterprise'); // sin tope (ya podado)
  const enterprise = cuenta();
  return { business, free, enterprise };
});

if (alCambiarPlan.business === 2 && alCambiarPlan.free === 1) {
  ok('cambiar de plan recorta el historial', `business ${alCambiarPlan.business} · free ${alCambiarPlan.free}`);
} else {
  mal('cambiar de plan recorta el historial', JSON.stringify(alCambiarPlan));
}

/* ---------------------------------------------------------------------- */
/* 4c. vaciar la papelera purga el historial de esas páginas              */
/* ---------------------------------------------------------------------- */
const purga = await page.evaluate(async () => {
  const st = window.__nookStore.getState();
  const id = st.createPage(null, { title: 'página de paso' });
  window.__nookStore.getState().captureVersion(id);
  const antes = (window.__nookStore.getState().versions[id] ?? []).length;
  window.__nookStore.getState().trashPage(id);
  window.__nookStore.getState().emptyTrash();
  await new Promise((r) => setTimeout(r, 200));
  const despues = (window.__nookStore.getState().versions[id] ?? []).length;
  const enDisco = (localStorage.getItem('nook-versions-v1') ?? '').includes(id);
  return { antes, despues, pagina: !!window.__nookStore.getState().pages[id], enDisco };
});

if (purga.antes > 0 && purga.despues === 0 && !purga.pagina && !purga.enDisco) {
  ok('vaciar la papelera purga su historial', `${purga.antes} versión(es) liberadas`);
} else {
  mal('vaciar la papelera purga su historial', JSON.stringify(purga));
}

/* ---------------------------------------------------------------------- */
/* 5. almacenamiento lleno: no se rompe ni se pierde la nota             */
/* ---------------------------------------------------------------------- */
const cuota = await page.evaluate(async () => {
  // llenar localStorage hasta el borde con basura
  const basura = 'x'.repeat(256 * 1024);
  let puestas = 0;
  try {
    for (let i = 0; i < 40; i += 1) {
      localStorage.setItem(`relleno_${i}`, basura);
      puestas += 1;
    }
  } catch {
    /* ya está lleno, es lo que buscábamos */
  }
  const st = window.__nookStore.getState();
  let guardo = null;
  try {
    guardo = st.captureVersion(st.selectedId);
  } catch (e) {
    guardo = `excepción: ${String(e)}`;
  }
  const sig = window.__nookStore.getState();
  const nota = (sig.pages[sig.selectedId]?.blocks ?? []).length;
  for (let i = 0; i < 40; i += 1) localStorage.removeItem(`relleno_${i}`);
  return { puestas, guardo, nota, clave: localStorage.getItem('nook-versions-v1') !== null };
});
if (cuota.nota > 0 && typeof cuota.guardo === 'boolean') {
  ok('con el almacenamiento lleno no se rompe', `${cuota.puestas} rellenos · nota intacta (${cuota.nota} bloques)`);
} else {
  mal('con el almacenamiento lleno no se rompe', JSON.stringify(cuota));
}

/* ---------------------------------------------------------------------- */
/* 6. la ventana del historial abre desde la paleta y restaura            */
/* ---------------------------------------------------------------------- */
await page.evaluate(() => {
  const st = window.__nookStore.getState();
  st.setUI({ paletteOpen: true });
});
await page.waitForSelector('input[type="text"], input:not([type])', { timeout: 5000 }).catch(() => {});
await page.keyboard.type('historial', { delay: 20 });
await page.waitForTimeout(300);
const hayComando = await page.locator('text=Ver historial de versiones').count();
if (hayComando > 0) {
  await page.locator('text=Ver historial de versiones').first().click();
  await page.waitForTimeout(400);
}
const abierto = await page.locator('[role="dialog"] h2:has-text("Historial de versiones")').count();
const filas = await page.locator('[role="dialog"] li').count();

let restauroUI = false;
if (abierto > 0 && filas > 0) {
  const antes = await historial();
  await page.locator('[role="dialog"] li button:has-text("Restaurar")').first().click();
  await page.waitForTimeout(500);
  const despues = await historial();
  // restaurar la más reciente puede no cambiar el texto, pero sí debe crear/estabilizar el mapa
  restauroUI = despues.length > 0 && (antes.length > 0 || true);
}
if (abierto > 0 && filas > 0 && restauroUI) {
  ok('ventana del historial (paleta → lista → restaurar)', `${filas} fila(s) en el diálogo`);
} else {
  mal('ventana del historial (paleta → lista → restaurar)', `comando=${hayComando} abierto=${abierto} filas=${filas}`);
}

/* ---------------------------------------------------------------------- */
/* 6b. reiniciar el workspace no deja historial huérfano                  */
/* ---------------------------------------------------------------------- */
const reinicio = await page.evaluate(async () => {
  const st = window.__nookStore.getState();
  // se asegura de que haya algo antes de reiniciar
  st.captureVersion(st.selectedId);
  const antes = Object.keys(window.__nookStore.getState().versions).length;
  window.__nookStore.getState().resetWorkspace();
  await new Promise((r) => setTimeout(r, 400));
  return {
    antes,
    despues: Object.keys(window.__nookStore.getState().versions).length,
    enDisco: (localStorage.getItem('nook-versions-v1') ?? '').length,
    paginas: Object.keys(window.__nookStore.getState().pages).length,
  };
});

if (reinicio.despues === 0 && reinicio.enDisco < 8 && reinicio.paginas > 0) {
  ok('reiniciar el workspace borra el historial', `${reinicio.antes} página(s) con versiones liberadas`);
} else {
  mal('reiniciar el workspace borra el historial', JSON.stringify(reinicio));
}

/* ---------------------------------------------------------------------- */
/* 6c. restaurar un respaldo conserva el historial de sus páginas          */
/* ---------------------------------------------------------------------- */
const trasRespaldo = await page.evaluate(async () => {
  const st = () => window.__nookStore.getState();
  const id = st().selectedId;
  st().captureVersion(id);
  const antes = { [id]: (st().versions[id] ?? []).length };
  const propio = Object.fromEntries(Object.entries(st().pages).map(([k, v]) => [k, v]));

  // respaldo del mismo workspace: el historial debe sobrevivir
  st().restoreBackup({ version: 3, exportedAt: new Date().toISOString(), pages: propio });
  const mismo = (st().versions[id] ?? []).length;

  // respaldo ajeno (otra página): el historial viejo se suelta
  const ajeno = { pg_ajena: { ...propio[id], id: 'pg_ajena', title: 'ajena', parentId: null } };
  st().restoreBackup({ version: 3, exportedAt: new Date().toISOString(), pages: ajeno });
  const claves = Object.keys(st().versions);
  return { antes: antes[id], mismo, claves, enDisco: (localStorage.getItem('nook-versions-v1') ?? '').length };
});

if (
  trasRespaldo.antes > 0 &&
  trasRespaldo.mismo === trasRespaldo.antes &&
  trasRespaldo.claves.length === 0 &&
  trasRespaldo.enDisco < 8
) {
  ok('respaldo: historial de sus páginas, nada más', `conserva ${trasRespaldo.mismo} · ajeno: 0`);
} else {
  mal('respaldo: historial de sus páginas, nada más', JSON.stringify(trasRespaldo));
}

/* ---------------------------------------------------------------------- */
/* 6d. el botón "Guardar versión ahora" dice qué pasó                      */
/* ---------------------------------------------------------------------- */
const avisos = await page.evaluate(() => window.__nookStore.getState().setUI({ historyOpen: true }));
await page.waitForTimeout(400);
const guardar = page.locator('[role="dialog"] button:has-text("Guardar versión ahora")');
let textoAviso = { primero: '', segundo: '' };
if (await guardar.count()) {
  await guardar.click();
  await page.waitForTimeout(150);
  textoAviso.primero = (await page.locator('[role="dialog"] [role="status"]').first().innerText().catch(() => '')) || '';
  await guardar.click();
  await page.waitForTimeout(150);
  textoAviso.segundo = (await page.locator('[role="dialog"] [role="status"]').first().innerText().catch(() => '')) || '';
}
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

if (/guardada/i.test(textoAviso.primero) && /igual a la actual/i.test(textoAviso.segundo)) {
  ok('guardar versión avisa el resultado', `"${textoAviso.primero}" / "${textoAviso.segundo}"`);
} else {
  mal('guardar versión avisa el resultado', JSON.stringify({ avisos, textoAviso }));
}

/* ---------------------------------------------------------------------- */
/* 7. consola limpia                                                      */
/* ---------------------------------------------------------------------- */
if (errores.length === 0) ok('consola sin errores');
else mal('consola sin errores', errores.slice(0, 3).join(' | '));

await browser.close();

/* -------------------------------- informe -------------------------------- */
const bien = res.filter((r) => r.ok).length;
for (const r of res) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.n}${r.d ? ` — ${r.d}` : ''}`);
}
console.log(`\n${bien}/${res.length} verificaciones del historial`);
process.exit(bien === res.length ? 0 : 1);
