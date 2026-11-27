/**
 * Verificación de seguridad del HTML que se persiste.
 *
 * Cubre los tres caminos por los que entra HTML no confiable al documento:
 *  1. pegar con formato (el navegador inserta el HTML del portapapeles);
 *  2. restaurar un respaldo `.json` que te pasó otra persona;
 *  3. editar una celda de tabla.
 *
 * Y comprueba que el formato legítimo sobreviva (no queremos romper negritas).
 *
 * Uso: node scripts/verificar-seguridad.mjs http://127.0.0.1:4321
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4321';
const res = [];
const ok = (n, d = '') => res.push({ n, ok: true, d });
const mal = (n, d = '') => res.push({ n, ok: false, d });

/** Payload que se ejecutaría al reabrir el documento si quedara guardado. */
const XSS =
  '<img src="data:image/gif;base64,R0lGOD" onerror="window.__pwned=\'img\'">' +
  '<script>window.__pwned=\'script\'</script>hola';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errores = [];
page.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
page.on('pageerror', (e) => errores.push(String(e)));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

/* ------------------- 1. pegar HTML con formato (vía input) ------------------ */
const pegado = await page.evaluate(async (payload) => {
  const ed = document.querySelector('[data-block-id] [contenteditable]');
  if (!ed) return { error: 'sin bloque editable' };
  const blockId = ed.closest('[data-block-id]').getAttribute('data-block-id');

  // el navegador inserta el HTML del portapapeles en el contentEditable:
  // replicamos exactamente eso y disparamos el `input` que React escucha
  ed.focus();
  ed.innerHTML = payload;
  ed.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));

  const store = window.__nookStore.getState();
  const page0 = store.pages[store.selectedId];
  const block = page0.blocks.find((b) => b.id === blockId);
  return {
    html: block?.html ?? '',
    ejecutado: window.__pwned ?? null,
    texto: ed.textContent ?? '',
  };
}, XSS);

if (pegado.html && !/onerror|<script|<img/i.test(pegado.html)) {
  ok('pegar HTML: se guarda sólo el texto', `guardado: "${pegado.html}"`);
} else {
  mal('pegar HTML: se elimina el payload', JSON.stringify(pegado));
}

/* --------------------- 2. respaldo con HTML malicioso --------------------- */
const respaldo = await page.evaluate(async (payload) => {
  window.__pwned = null; // el paso anterior ensució el DOM del test
  const store = window.__nookStore.getState();
  const backup = {
    version: 2,
    exportedAt: new Date().toISOString(),
    selectedId: 'pg-malo',
    pages: {
      'pg-malo': {
        id: 'pg-malo',
        title: 'Respaldo de terceros',
        icon: null,
        cover: null,
        parentId: null,
        order: 0,
        favorite: false,
        trashed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        database: null,
        blocks: [
          { id: 'b1', type: 'paragraph', html: payload, indent: 0 },
          {
            id: 'b2',
            type: 'table',
            html: '',
            indent: 0,
            table: { header: [payload], rows: [[payload]], align: ['left'] },
          },
        ],
      },
    },
  };
  const aceptado = store.restoreBackup(backup);
  await new Promise((r) => setTimeout(r, 150));
  const st = window.__nookStore.getState();
  const pagina = st.pages['pg-malo'];
  return {
    aceptado,
    bloque: pagina?.blocks[0]?.html ?? '',
    encabezado: pagina?.blocks[1]?.table?.header?.[0] ?? '',
    celda: pagina?.blocks[1]?.table?.rows?.[0]?.[0] ?? '',
    ejecutado: window.__pwned ?? null,
  };
}, XSS);

if (
  respaldo.aceptado &&
  !/onerror|<script|<img/i.test(respaldo.bloque) &&
  !/onerror|<script|<img/i.test(respaldo.encabezado) &&
  !/onerror|<script|<img/i.test(respaldo.celda) &&
  respaldo.ejecutado === null
) {
  ok('respaldo: bloque y celdas saneados', `bloque: "${respaldo.bloque}"`);
} else {
  mal('respaldo: bloque y celdas saneados', JSON.stringify(respaldo));
}

/* ------------------- 3. el formato legítimo no se rompe ------------------- */
const legitimo = await page.evaluate(async () => {
  const html =
    '<strong>negrita</strong> <em>cursiva</em> <u>sub</u> <s>tachado</s> <code>código</code> ' +
    '<a href="https://ejemplo.com">enlace</a> <span style="color: rgb(235, 87, 87)">rojo</span>';
  const ed = document.querySelector('[data-block-id] [contenteditable]');
  if (!ed) return { error: 'sin bloque editable' };
  const blockId = ed.closest('[data-block-id]').getAttribute('data-block-id');
  ed.focus();
  ed.innerHTML = html;
  ed.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));

  const st = window.__nookStore.getState();
  const block = st.pages[st.selectedId].blocks.find((b) => b.id === blockId);
  const guardado = block?.html ?? '';
  return {
    guardado,
    strong: /<strong>/.test(guardado),
    em: /<em>/.test(guardado),
    u: /<u>/.test(guardado),
    code: /<code>/.test(guardado),
    enlace: /href="https:\/\/ejemplo\.com"/.test(guardado),
    color: /color:/.test(guardado),
  };
});

if (legitimo.strong && legitimo.em && legitimo.u && legitimo.code && legitimo.enlace && legitimo.color) {
  ok('formato legítimo preservado');
} else {
  mal('formato legítimo preservado', JSON.stringify(legitimo));
}

/* ---------------------- 4. enlaces javascript: fuera ---------------------- */
const enlaceMalo = await page.evaluate(async () => {
  const ed = document.querySelector('[data-block-id] [contenteditable]');
  const blockId = ed.closest('[data-block-id]').getAttribute('data-block-id');
  ed.focus();
  ed.innerHTML = '<a href="javascript:alert(1)">clic</a> y <a href="JaVaScRiPt:alert(2)">otro</a>';
  ed.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  const st = window.__nookStore.getState();
  const html = st.pages[st.selectedId].blocks.find((b) => b.id === blockId)?.html ?? '';
  return { html, limpio: !/javascript:/i.test(html) };
});

if (enlaceMalo.limpio) ok('javascript: en href eliminado', `guardado: "${enlaceMalo.html}"`);
else mal('javascript: en href eliminado', JSON.stringify(enlaceMalo));


/* ------------- 6. datos ya guardados (localStorage viejo) ------------- */
/**
 * Simula un documento envenenado guardado por una versión anterior: se escribe
 * directo en localStorage con version 2 y se recarga. La migración a la versión 3
 * debe limpiarlo **antes** de que React lo renderice.
 */
await page.evaluate((payload) => {
  const raw = JSON.parse(localStorage.getItem('nook-workspace-v2') ?? '{}');
  const pages = structuredClone(raw.state?.pages ?? {});
  const firstId = Object.keys(pages)[0];
  if (firstId) {
    pages[firstId].blocks = [
      { id: 'b-legacy', type: 'paragraph', html: payload, indent: 0 },
      ...(pages[firstId].blocks ?? []).slice(1),
    ];
  }
  localStorage.setItem(
    'nook-workspace-v2',
    JSON.stringify({ state: { ...raw.state, pages }, version: 2 }),
  );
}, XSS);

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(700);

const legado = await page.evaluate(() => {
  const st = window.__nookStore.getState();
  const pages = st.pages;
  const first = pages[Object.keys(pages)[0]];
  const bloque = first?.blocks?.[0]?.html ?? '';
  return {
    ejecutado: window.__pwned ?? null,
    bloque,
    enDom: /onerror/i.test(document.body.innerHTML),
    version: JSON.parse(localStorage.getItem('nook-workspace-v2') ?? '{}').version,
  };
});

if (legado.ejecutado === null && !/onerror|<script|<img/i.test(legado.bloque) && !legado.enDom) {
  ok('datos viejos saneados al cargar', `bloque: "${legado.bloque}"`);
} else {
  mal('datos viejos saneados al cargar', JSON.stringify(legado));
}


/* --------------------------- 5. la UI sigue viva --------------------------- */
const vivo = await page.evaluate(() => ({
  bloques: document.querySelectorAll('[data-block-id]').length,
  titulo: document.title,
}));

if (vivo.bloques >= 2 && vivo.titulo) ok('la app sigue renderizando', `${vivo.bloques} bloques`);
else mal('la app sigue renderizando', JSON.stringify(vivo));

/* ------------- 8. parentId cíclico en un respaldo (no colgarse) ------------- */
/**
 * Un respaldo corrupto puede traer dos páginas que se apuntan como padre entre
 * sí. Cualquier recorrido del árbol (vaciar la papelera) no debe colgarse ni
 * desbordar la pila.
 */
const ciclo = await page.evaluate(() => {
  const sello = new Date().toISOString();
  const pagina = (id, parentId) => ({
    id,
    title: `Ciclo ${id}`,
    icon: null,
    cover: null,
    parentId,
    order: 0,
    favorite: false,
    trashed: false,
    createdAt: sello,
    updatedAt: sello,
    blocks: [{ id: `b-${id}`, type: 'paragraph', html: `contenido ${id}`, indent: 0 }],
  });

  const restaurado = window.__nookStore.getState().restoreBackup({
    version: 3,
    exportedAt: sello,
    selectedId: 'ciclo-a',
    pages: {
      'ciclo-a': pagina('ciclo-a', 'ciclo-b'),
      'ciclo-b': pagina('ciclo-b', 'ciclo-a'),
    },
  });

  const t0 = performance.now();
  let error = null;
  try {
    window.__nookStore.getState().trashPage('ciclo-a');
  } catch (e) {
    error = String(e).slice(0, 80);
  }
  const ms = Math.round(performance.now() - t0);

  const st = window.__nookStore.getState();
  return {
    restaurado,
    error,
    ms,
    a: st.pages['ciclo-a']?.trashed ?? null,
    b: st.pages['ciclo-b']?.trashed ?? null,
  };
});

if (ciclo.restaurado && !ciclo.error && ciclo.ms < 1000 && ciclo.a === true && ciclo.b === true) {
  ok('parentId cíclico: no cuelga la app', `papelera en ${ciclo.ms} ms`);
} else {
  mal('parentId cíclico: no cuelga la app', JSON.stringify(ciclo));
}

const ruido = errores.filter((e) => !/Failed to load resource/i.test(e));
/* ---------------------------------------------------------------------------
 * 9. historial de versiones manipulado: se sanea al cargar
 *
 * `nook-versions-v1` es otra clave de localStorage, editable a mano y viajable
 * por chat igual que un respaldo. Si restaurar una versión inyectara su HTML
 * sin sanear, un `<img onerror>` guardado ahí se ejecutaría al restaurar.
 * ------------------------------------------------------------------------- */
const versionMala = await page.evaluate(async () => {
  const st = window.__nookStore.getState();
  const id = st.selectedId;
  const base = st.pages[id].blocks[0];
  const payload = '<img src=x onerror="window.__pwned=(window.__pwned||0)+1">texto';
  localStorage.setItem(
    'nook-versions-v1',
    JSON.stringify({
      [id]: [
        {
          id: 'ver_mala',
          at: Date.now(),
          title: st.pages[id].title,
          blocks: [
            { ...base, html: payload },
            { ...base, id: `${base.id}-t`, type: 'table', html: '', table: { header: [payload], rows: [[payload]] } },
          ],
        },
      ],
    }),
  );

  window.__nookStore.getState().hydrateVersions();
  const cargada = (window.__nookStore.getState().versions?.[id] ?? [])[0];
  window.__nookStore.getState().restoreVersion(id, 'ver_mala');
  await new Promise((r) => setTimeout(r, 400));

  const sig = window.__nookStore.getState();
  const bloques = sig.pages[id].blocks.slice(0, 2);
  return {
    cargada: cargada?.blocks?.[0]?.html ?? null,
    guardado: bloques[0]?.html ?? null,
    celda: bloques[1]?.table?.header?.[0] ?? null,
    enDom: document.querySelectorAll('[data-block-id] img').length,
    ejecutado: window.__pwned ?? 0,
  };
});

const sinPayload = (v) => typeof v === 'string' && !/onerror|<img/i.test(v);
if (
  sinPayload(versionMala.cargada) &&
  sinPayload(versionMala.guardado) &&
  sinPayload(versionMala.celda) &&
  versionMala.enDom === 0 &&
  versionMala.ejecutado === 0
) {
  ok('historial manipulado: se sanea al cargar', `bloque: "${String(versionMala.guardado).slice(0, 24)}"`);
} else {
  mal('historial manipulado: se sanea al cargar', JSON.stringify(versionMala));
}

/* ---------------------------------------------------------------------------
 * 10. setUI con argumento inválido no tumba la app
 *
 * `setUI(null)` dejaba el estado del store en `null`: React reventaba y la
 * ventana quedaba en blanco hasta recargar. Cualquier acción pública tiene que
 * tolerar basura.
 * ------------------------------------------------------------------------- */
const setUICiego = await page.evaluate(async () => {
  const antes = Object.keys(window.__nookStore.getState().pages).length;
  const intentos = [];
  for (const v of [null, undefined, 0, '', 'texto', [], NaN, true]) {
    try {
      window.__nookStore.getState().setUI(v);
    } catch {
      /* lo que importa es el estado, no la excepción */
    }
    const st = window.__nookStore.getState();
    intentos.push({ valor: String(v), vivo: !!st && !!st.pages });
  }
  await new Promise((r) => setTimeout(r, 300));
  const st = window.__nookStore.getState();
  return {
    todosVivos: intentos.every((i) => i.vivo),
    paginas: Object.keys(st.pages).length,
    antes,
    bloques: document.querySelectorAll('[data-block-id]').length,
    rotos: intentos.filter((i) => !i.vivo).map((i) => i.valor),
  };
});

if (setUICiego.todosVivos && setUICiego.paginas === setUICiego.antes && setUICiego.bloques > 0) {
  ok('setUI con basura no tumba la app', `${setUICiego.paginas} páginas intactas`);
} else {
  mal('setUI con basura no tumba la app', JSON.stringify(setUICiego));
}

/* ---------------------------------------------------------------------------
 * 11. seleccionar una página inexistente no deja la vista en blanco
 * ------------------------------------------------------------------------- */
const seleccionFantasma = await page.evaluate(async () => {
  const st = () => window.__nookStore.getState();
  const antes = st().selectedId;
  const bloquesAntes = document.querySelectorAll('[data-block-id]').length;
  st().selectPage('pg_que_no_existe');
  await new Promise((r) => setTimeout(r, 300));
  return {
    antes,
    despues: st().selectedId,
    bloquesAntes,
    bloquesDespues: document.querySelectorAll('[data-block-id]').length,
  };
});

if (
  seleccionFantasma.despues === seleccionFantasma.antes &&
  seleccionFantasma.bloquesDespues === seleccionFantasma.bloquesAntes &&
  seleccionFantasma.bloquesDespues > 0
) {
  ok('página inexistente: se ignora la selección', `sigue en ${seleccionFantasma.despues}`);
} else {
  mal('página inexistente: se ignora la selección', JSON.stringify(seleccionFantasma));
}

/* ---------------------------------------------------------------------------
 * 12. un plan con tier desconocido no deja la ventana en blanco
 *
 * `PLANS[plan.tier].name` lanzaba con un tier que no fuera uno de los cuatro
 * (respaldo ajeno o versión futura) y se llevaba toda la interfaz. La ficha se
 * lee ahora con `planInfo`, que cae en Gratis.
 * ------------------------------------------------------------------------- */
const planRoto = await page.evaluate(async () => {
  const st = () => window.__nookStore.getState();
  const original = st().plan;
  const salida = {};

  for (const tier of [null, 'platino', 42, undefined]) {
    window.__nookStore.setState({ plan: { ...original, tier } });
    await new Promise((r) => setTimeout(r, 200));
    salida[String(tier)] = {
      bloques: document.querySelectorAll('[data-block-id]').length,
      // el sidebar muestra el nombre del plan: si `PLANS[tier]` fuera undefined
      // esta lectura reventaba y quedaba la pantalla de error de React
      plan: document.body.innerText.includes('Plan ') || document.body.innerText.includes('Business'),
      seVe: !/Application error/i.test(document.body.innerText || ''),
    };
  }

  // y el setter del plan acepta sólo planes conocidos
  window.__nookStore.setState({ plan: original });
  st().setPlanTier(null);
  const trasBasura = st().plan.tier;
  st().setPlanTier('platino');
  const trasInventado = st().plan.tier;
  st().setPlanTier('pro');
  const trasValido = st().plan.tier;
  window.__nookStore.setState({ plan: original });

  return {
    salida,
    todosSeVen: Object.values(salida).every((v) => v.seVe && v.bloques > 0),
    trasBasura,
    trasInventado,
    trasValido,
  };
});

if (planRoto.todosSeVen && planRoto.trasBasura === 'business' && planRoto.trasInventado === 'business' && planRoto.trasValido === 'pro') {
  ok('plan desconocido: la interfaz no se cae', `tiers raros tolerados · válido → ${planRoto.trasValido}`);
} else {
  mal('plan desconocido: la interfaz no se cae', JSON.stringify(planRoto));
}

/* ---------------------------------------------------------------------------
 * 13. acciones públicas con argumentos basura: no lanzan
 *
 * Se recorre toda la superficie del store con valores absurdos. Lo que importa
 * no es que "hagan algo", sino que ninguna lance una excepción ni deje el estado
 * en un sitio imposible desde el que no se pueda volver.
 * ------------------------------------------------------------------------- */
const fuzz = await page.evaluate(async () => {
  const st = () => window.__nookStore.getState();
  const acciones = Object.keys(st()).filter((k) => typeof st()[k] === 'function');
  const basura = [null, undefined, '', 0, -1, 'no-existe', [], {}, NaN, true, () => {}];
  const prohibidas = new Set(['resetWorkspace', 'restoreBackup', 'emptyTrash']);
  const excepciones = [];

  const miembrosAntes = st().members.length;
  const reglasAntes = st().rules.length;

  for (const nombre of acciones) {
    if (prohibidas.has(nombre)) continue;
    for (const valor of basura) {
      try {
        st()[nombre](valor);
      } catch (e) {
        excepciones.push(`${nombre}(${String(valor).slice(0, 12)}): ${String(e).slice(0, 70)}`);
      }
    }
    try {
      st()[nombre](null, null);
    } catch (e) {
      excepciones.push(`${nombre}(null,null): ${String(e).slice(0, 70)}`);
    }
  }

  await new Promise((r) => setTimeout(r, 300));
  const fin = st();
  return {
    acciones: acciones.length,
    excepciones: excepciones.slice(0, 6),
    totalExcepciones: excepciones.length,
    // la basura no debe haber inventado miembros ni reglas
    miembros: fin.members.length,
    miembrosAntes,
    reglas: fin.rules.length,
    reglasAntes,
    estadoVivo: !!fin.pages,
    // el fuzz puede terminar dentro de una carpeta recién creada (sin bloques):
    // lo que se exige es que la interfaz siga dibujándose, no que haya editor
    interfaz: document.body.innerText.length > 100 && !/Application error/i.test(document.body.innerText),
    carpetas: Object.values(fin.pages ?? {}).filter((p) => p.isFolder).length,
  };
});

if (
  fuzz.totalExcepciones === 0 &&
  fuzz.estadoVivo &&
  fuzz.interfaz &&
  fuzz.miembros === fuzz.miembrosAntes &&
  fuzz.reglas === fuzz.reglasAntes
) {
  ok('acciones con basura: ninguna lanza', `${fuzz.acciones} acciones × 12 valores`);
} else {
  mal('acciones con basura: ninguna lanza', JSON.stringify(fuzz));
}

if (!ruido.length) ok('consola sin errores');
else mal('consola sin errores', ruido.slice(0, 3).join(' | '));

await browser.close();

console.log('');
for (const r of res) console.log(`${r.ok ? '✅' : '❌'} ${r.n}${r.d ? ` — ${r.d}` : ''}`);
const fallos = res.filter((r) => !r.ok).length;
console.log(`\n${res.length - fallos}/${res.length} verificaciones OK`);
process.exit(fallos ? 1 : 0);
