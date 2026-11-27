/**
 * Verificación de los cuatro cambios de la 0.3.0 sobre el build estático.
 *
 *  1. miembros sin límite (invitar 6 seguidos y que la lista crezca)
 *  2. tablas de Markdown importadas como tabla real, no como párrafos con barras
 *  3. pegar Markdown dentro del editor (⌘V) → bloques reales
 *  4. resaltado de la lectura: bloque activo + frase activa
 *
 * El punto 4 necesita `speechSynthesis`: en Chromium headless no hay voces del
 * sistema, así que se inyecta un mock que "pronuncia" cada frase en ~40 ms.
 * Eso ejercita el código real del motor (cola, callbacks, resaltado).
 *
 * Uso: node scripts/verificar-030.mjs http://127.0.0.1:4321
 */

import fs from 'node:fs';
import { chromium } from 'playwright';
import { capturar } from './_captura.mjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4321';
const resultados = [];
const ok = (nombre, detalle = '') => resultados.push({ nombre, ok: true, detalle });
const mal = (nombre, detalle = '') => resultados.push({ nombre, ok: false, detalle });

const browser = await chromium.launch();

const mockSpeech = () => {
  // mock mínimo de Web Speech: guarda lo pronunciado y dispara onend enseguida
  const listeners = new Set();
  const synth = {
    speaking: false,
    paused: false,
    pending: false,
    getVoices: () => [
      { name: 'Voz de prueba', lang: 'es-AR', localService: true, voiceURI: 'mock-es-ar' },
    ],
    addEventListener: (type, fn) => {
      if (type === 'voiceschanged') listeners.add(fn);
    },
    removeEventListener: (_type, fn) => listeners.delete(fn),
    speak: (utterance) => {
      synth.speaking = true;
      setTimeout(() => utterance.onstart?.(), 5);
      setTimeout(() => {
        synth.speaking = false;
        utterance.onend?.();
      }, 40);
    },
    cancel: () => {
      synth.speaking = false;
    },
    pause: () => {
      synth.paused = true;
    },
    resume: () => {
      synth.paused = false;
    },
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  // eslint-disable-next-line no-undef
  window.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
};

const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript(mockSpeech);
const page = await context.newPage();

const errores = [];
page.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
page.on('pageerror', (e) => errores.push(String(e)));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

/* ----------------------------- 2. tabla del seed ---------------------------- */
const tablaSeed = await page.evaluate(() => {
  const tabla = document.querySelector('[role="table"]');
  const parrafosConBarras = [...document.querySelectorAll('[data-block-id]')].filter((el) =>
    /\|\s*-{3,}/.test(el.textContent ?? ''),
  ).length;
  return {
    existe: !!tabla,
    columnas: tabla ? tabla.querySelectorAll('[role="columnheader"]').length : 0,
    filas: tabla ? tabla.querySelectorAll('[role="row"]').length : 1,
    parrafosConBarras,
  };
});
if (tablaSeed.existe && tablaSeed.columnas === 3 && tablaSeed.filas === 4 && tablaSeed.parrafosConBarras === 0) {
  ok('tabla del seed renderizada', `${tablaSeed.filas} filas × ${tablaSeed.columnas} columnas`);
} else {
  mal('tabla del seed renderizada', JSON.stringify(tablaSeed));
}

/* -------------------- 3. pegar Markdown dentro del editor ------------------- */
const md = [
  '## Pegado en caliente',
  '',
  '- primer ítem',
  '- segundo ítem',
  '',
  '| Nombre | Rol |',
  '| :--- | ---: |',
  '| Ana | Admin |',
  '| Bruno | Editor |',
].join('\n');

const pegado = await page.evaluate(async (markdown) => {
  // nos paramos en el último bloque de párrafo del documento
  const bloques = [...document.querySelectorAll('[data-block-id] [contenteditable]')];
  const target = bloques[bloques.length - 1];
  if (!target) return { error: 'sin bloques editables' };
  target.focus();

  const antes = document.querySelectorAll('[data-block-id]').length;

  const dt = new DataTransfer();
  dt.setData('text/plain', markdown);
  const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  target.dispatchEvent(event);

  await new Promise((r) => setTimeout(r, 300));

  const despues = document.querySelectorAll('[data-block-id]').length;
  const tablas = document.querySelectorAll('[role="table"]').length;
  const texto = document.body.innerText;

  return {
    antes,
    despues,
    tablas,
    tituloPegado: texto.includes('Pegado en caliente'),
    items: texto.includes('primer ítem') && texto.includes('segundo ítem'),
    celdas: texto.includes('Ana') && texto.includes('Admin'),
    barras: /\|\s*-{3,}/.test(texto),
  };
}, md);

if (pegado.despues > pegado.antes && pegado.tituloPegado && pegado.items && pegado.tablas >= 2 && pegado.celdas && !pegado.barras) {
  ok('pegar Markdown (⌘V)', `${pegado.antes} → ${pegado.despues} bloques, ${pegado.tablas} tablas`);
} else {
  mal('pegar Markdown (⌘V)', JSON.stringify(pegado));
}


/* ------------- pegar Markdown dentro de una celda de tabla ------------- */
const enCelda = await page.evaluate(async (markdown) => {
  const celda = document.querySelector('[role="table"] [data-cell]');
  if (!celda) return { error: 'sin celdas de tabla' };

  const antes = {
    bloques: document.querySelectorAll('[data-block-id]').length,
    tablas: document.querySelectorAll('[role="table"]').length,
  };

  celda.focus();
  const dt = new DataTransfer();
  dt.setData('text/plain', markdown);
  celda.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 300));

  return {
    antes,
    despues: {
      bloques: document.querySelectorAll('[data-block-id]').length,
      tablas: document.querySelectorAll('[role="table"]').length,
    },
  };
}, '## No debería crear bloques\n\n- ni listas');

if (
  !enCelda.error &&
  enCelda.despues.bloques === enCelda.antes.bloques &&
  enCelda.despues.tablas === enCelda.antes.tablas
) {
  ok('pegar en una celda no inserta bloques', `${enCelda.antes.bloques} bloques intactos`);
} else {
  mal('pegar en una celda no inserta bloques', JSON.stringify(enCelda));
}


/* ---------- la búsqueda de la paleta ignora los acentos ---------- */
const paletaAcentos = await page.evaluate(async () => {
  const store = window.__nookStore.getState();
  store.setUI({ paletteOpen: true });
  await new Promise((r) => setTimeout(r, 250));

  const input = document.querySelector('[role="dialog"] input');
  if (!input) return { error: 'paleta sin input' };
  const escribir = (txt) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, txt);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  // el conmutador de alcance (todo / esta rama) son botones de la barra, no
  // resultados: se excluyen para seguir midiendo sólo lo que devuelve la búsqueda
  const leer = () => [...document.querySelectorAll('[role="dialog"] button')]
    .filter((b) => !b.hasAttribute('data-alcance'))
    .map((b) => b.textContent.trim())
    .filter(Boolean);

  escribir('configuracion');
  await new Promise((r) => setTimeout(r, 250));
  const conAcento = leer();
  escribir('nueva pagina');
  await new Promise((r) => setTimeout(r, 250));
  const otra = leer();
  escribir('zzzz');
  await new Promise((r) => setTimeout(r, 250));
  const vacio = leer();

  window.__nookStore.getState().setUI({ paletteOpen: false });
  return { conAcento, otra, vacio };
});

const encuentra = (lista, txt) => lista.some((t) => t.toLowerCase().includes(txt));
if (
  !paletaAcentos.error &&
  encuentra(paletaAcentos.conAcento, 'configuración') &&
  encuentra(paletaAcentos.otra, 'nueva página') &&
  paletaAcentos.vacio.length === 0
) {
  ok('paleta: busca sin acentos', '“configuracion” → Configuración, “nueva pagina” → Nueva página');
} else {
  mal('paleta: busca sin acentos', JSON.stringify(paletaAcentos));
}


/* ---------- restaurar una subpágina revive a su padre ---------- */
const subpagina = await page.evaluate(async () => {
  const store = window.__nookStore;
  const st = store.getState();
  const padreId = st.createPage(null, { title: 'Padre de prueba' });
  const hijaId = store.getState().createPage(padreId, { title: 'Hija de prueba' });

  store.getState().trashPage(padreId);
  const trasBorrar = {
    padre: store.getState().pages[padreId].trashed,
    hija: store.getState().pages[hijaId].trashed,
  };

  // el usuario restaura SÓLO la hija desde la papelera
  store.getState().restorePage(hijaId);
  await new Promise((r) => setTimeout(r, 250));

  const despues = store.getState();
  return {
    trasBorrar,
    padre: despues.pages[padreId].trashed,
    hija: despues.pages[hijaId].trashed,
    desplegado: despues.expanded[padreId] === true,
    enBarra: document.body.textContent.includes('Hija de prueba'),
  };
});

if (
  subpagina.trasBorrar.padre &&
  subpagina.trasBorrar.hija &&
  subpagina.padre === false &&
  subpagina.hija === false &&
  subpagina.desplegado &&
  subpagina.enBarra
) {
  ok('restaurar una subpágina revive el padre', 'visible en la barra');
} else {
  mal('restaurar una subpágina revive el padre', JSON.stringify(subpagina));
}


/* ---------------- Tab: sangra, y deja salir el foco cuando no ---------------- */
const tab = await page.evaluate(async () => {
  const eds = [...document.querySelectorAll('[data-block-id] [contenteditable]')];
  if (eds.length < 3) return { error: 'pocos bloques' };

  const indentDe = (i) => {
    const id = eds[i].closest('[data-block-id]').getAttribute('data-block-id');
    const st = window.__nookStore.getState();
    return st.pages[st.selectedId].blocks.find((b) => b.id === id)?.indent ?? 0;
  };

  // primer bloque: Tab no debe quedar atrapado
  eds[0].focus();
  return { primero: 0, indent0: indentDe(0), listo: true, eds: eds.length };
});

if (tab.error) {
  mal('Tab: sangría y salida con teclado', tab.error);
} else {
  // 1) Tab en el primer bloque: el foco sale del editor
  await page.evaluate(() => document.querySelectorAll('[data-block-id] [contenteditable]')[0].focus());
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
  const salio = await page.evaluate(() =>
    !document.activeElement?.closest?.('[data-block-id] [contenteditable]'),
  );

  // 2) Tab en un bloque intermedio: sangra y el foco se queda
  await page.evaluate(() => document.querySelectorAll('[data-block-id] [contenteditable]')[1].focus());
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  const sangrado = await page.evaluate(() => {
    const ed = document.querySelectorAll('[data-block-id] [contenteditable]')[1];
    const id = ed.closest('[data-block-id]').getAttribute('data-block-id');
    const st = window.__nookStore.getState();
    return {
      indent: st.pages[st.selectedId].blocks.find((b) => b.id === id)?.indent ?? 0,
      sigueDentro: !!document.activeElement?.closest?.('[data-block-id] [contenteditable]'),
    };
  });

  // 3) Shift+Tab vuelve a 0 y, desde 0, deja salir
  await page.keyboard.press('Shift+Tab');
  await page.waitForTimeout(200);
  await page.keyboard.press('Shift+Tab');
  await page.waitForTimeout(150);
  const volvio = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[data-block-id]')].map((e) => e.getAttribute('data-block-id'));
    const st = window.__nookStore.getState();
    const bloque = st.pages[st.selectedId].blocks.find((b) => b.id === ids[1]);
    return bloque?.indent ?? -1;
  });

  if (salio && sangrado.indent === 1 && sangrado.sigueDentro && volvio === 0) {
    ok('Tab: sangra y el foco puede salir', '1 bloque con sangría, salida con el primer bloque');
  } else {
    mal('Tab: sangra y el foco puede salir', JSON.stringify({ salio, sangrado, volvio }));
  }
}


/* ------------- el HTML exportado arma listas válidas ------------- */
const [descargaHtml] = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }),
  (async () => {
    await page.click('button[aria-label="Más"]');
    await page.waitForTimeout(350);
    await page.click('text=Exportar HTML');
  })(),
]);
const rutaHtml = await descargaHtml.path();
const htmlExportado = fs.readFileSync(rutaHtml, 'utf8');

const listas = await page.evaluate((html) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const items = [...doc.body.querySelectorAll('li')];
  return {
    items: items.length,
    sueltos: items.filter((li) => !['UL', 'OL'].includes(li.parentElement?.tagName ?? '')).length,
    listas: doc.body.querySelectorAll('ul, ol').length,
    primerItem: items[0]?.textContent?.trim().slice(0, 40) ?? null,
    titulo: doc.querySelector('h1')?.textContent?.trim() ?? null,
    parrafos: doc.body.querySelectorAll('p').length,
  };
}, htmlExportado);

if (listas.items > 0 && listas.sueltos === 0 && listas.listas > 0 && listas.titulo) {
  ok('exportar HTML: los <li> van dentro de su lista', `${listas.items} ítems en ${listas.listas} listas`);
} else {
  mal('exportar HTML: los <li> van dentro de su lista', JSON.stringify(listas));
}


/* ------------- el mapa mental respeta la sangría de los bloques ------------- */
const mapa = await page.evaluate(async () => {
  const store = window.__nookStore;
  const anterior = store.getState().selectedId; // se restaura al final: los casos
  const id = store.getState().createPage(null, { title: 'Jerarquía de prueba' }); // siguientes dependen de la página
  const bloques = [
    { id: 'j0', type: 'paragraph', html: 'Nivel cero', indent: 0 },
    { id: 'j1', type: 'paragraph', html: 'Nivel uno', indent: 1 },
    { id: 'j2', type: 'paragraph', html: 'Nivel dos', indent: 2 },
  ];
  store.setState((s) => ({ pages: { ...s.pages, [id]: { ...s.pages[id], blocks: bloques } } }));
  store.getState().selectPage(id);
  store.getState().setUI({ mindmapOpen: true });
  await new Promise((r) => setTimeout(r, 800));

  const etiqueta = document.querySelector('[role="dialog"]')?.textContent ?? '';
  const m = etiqueta.match(/(\d+)\s*nodos\s*·\s*profundidad\s*(\d+)/i);
  store.getState().setUI({ mindmapOpen: false });
  store.getState().selectPage(anterior);
  await new Promise((r) => setTimeout(r, 250));
  return { nodos: m ? Number(m[1]) : null, profundidad: m ? Number(m[2]) : null };
});

// raíz (profundidad 0) + tres niveles de sangría (0, 1, 2) → profundidad 3.
// Antes del arreglo el contorno salía plano y la etiqueta decía 1.
if (mapa.nodos === 4 && mapa.profundidad === 3) {
  ok('mapa mental: respeta la sangría', `${mapa.nodos} nodos, profundidad ${mapa.profundidad}`);
} else {
  mal('mapa mental: respeta la sangría', JSON.stringify(mapa));
}


/* ------------- arrastrar un bloque lo reordena (arrastre HTML5) ------------- */
const arrastre = await page.evaluate(async () => {
  const store = window.__nookStore;
  const anterior = store.getState().selectedId;
  const id = store.getState().createPage(null, { title: 'Orden de prueba' });
  const bloques = ['A', 'B', 'C'].map((t, i) => ({
    id: `orden-${t}`, type: 'paragraph', html: t, indent: 0,
  }));
  store.setState((s) => ({ pages: { ...s.pages, [id]: { ...s.pages[id], blocks: bloques } } }));
  store.getState().selectPage(id);
  await new Promise((r) => setTimeout(r, 400));

  const orden = () => {
    const s = window.__nookStore.getState();
    return s.pages[s.selectedId].blocks.map((b) => b.html);
  };
  const antes = orden();

  const conts = [...document.querySelectorAll('[data-block-id]')];
  const grips = [...document.querySelectorAll('button[aria-label="Arrastrar bloque"]')];
  if (conts.length < 3 || grips.length < 3) return { error: 'faltan bloques o grips' };

  // el bloque C (índice 2) se suelta sobre el A (índice 0)
  grips[2].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  const dt = new DataTransfer();
  conts[2].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  await new Promise((r) => setTimeout(r, 80));
  conts[0].dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt, cancelable: true }));
  await new Promise((r) => setTimeout(r, 120));
  conts[0].dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt, cancelable: true }));
  await new Promise((r) => setTimeout(r, 350));

  const despues = orden();
  store.getState().selectPage(anterior);
  await new Promise((r) => setTimeout(r, 200));
  return { antes, despues };
});

if (
  !arrastre.error &&
  arrastre.antes.join('') === 'ABC' &&
  arrastre.despues.join('') === 'CAB'
) {
  ok('arrastrar bloque: se reordena', `${arrastre.antes.join('')} → ${arrastre.despues.join('')}`);
} else {
  mal('arrastrar bloque: se reordena', JSON.stringify(arrastre));
}

/* ------------------------------ 1. miembros -------------------------------- */
await page.evaluate(() => {
  const botones = [...document.querySelectorAll('button')].filter((b) => /Acme Inc/.test(b.textContent ?? ''));
  botones[0]?.click();
});
await page.waitForTimeout(200);
await page.evaluate(() => {
  const item = [...document.querySelectorAll('button, [role="menuitem"]')].find((b) =>
    /Invitar a miembros/.test(b.textContent ?? ''),
  );
  item?.click();
});
await page.waitForTimeout(300);

const invitados = [];
for (let i = 1; i <= 6; i += 1) {
  const email = `persona${i}@equipo.dev`;
  const puesto = await page.evaluate(async (mail) => {
    const input = document.querySelector('input[aria-label="Correo del nuevo miembro"]');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, mail);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));
    const boton = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Invitar');
    boton?.click();
    await new Promise((r) => setTimeout(r, 120));
    return true;
  }, email);
  if (puesto) invitados.push(email);
}

const miembros = await page.evaluate(() => {
  const texto = document.body.innerText;
  const registro = /(\d+)\s+miembros?\s+·\s+sin límite/.exec(texto);
  return {
    contador: registro ? Number(registro[1]) : null,
    sinLimite: /sin límite/.test(texto),
    pendientes: (texto.match(/invitado/g) ?? []).length,
  };
});

if (miembros.contador !== null && miembros.contador >= 11 && miembros.sinLimite) {
  ok('miembros ilimitados', `${miembros.contador} miembros tras invitar ${invitados.length}`);
} else {
  mal('miembros ilimitados', JSON.stringify(miembros));
}

const duplicado = await page.evaluate(async () => {
  const input = document.querySelector('input[aria-label="Correo del nuevo miembro"]');
  if (!input) return 'sin input';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'PERSONA1@equipo.dev');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 60));
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Invitar')?.click();
  await new Promise((r) => setTimeout(r, 150));
  return document.body.innerText.includes('ya está en el workspace') ? 'avisa' : 'no avisa';
});
if (duplicado === 'avisa') ok('invitación duplicada rechazada');
else mal('invitación duplicada rechazada', duplicado);

await page.keyboard.press('Escape');
await page.waitForTimeout(200);

/* --------------------------- 4. resaltado de voz --------------------------- */
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => /Leer|Lectura/i.test(b.getAttribute('aria-label') ?? ''));
  btn?.click();
});
// fallback: atajo ⌘⇧R
await page.keyboard.press('Control+Shift+R');
await page.waitForTimeout(900);

const resaltado = await page.evaluate(() => {
  const activo = document.querySelector('.tts-active');
  const registro = CSS.highlights;
  return {
    bloqueActivo: !!activo,
    clase: activo?.className ?? null,
    highlightApi: !!registro,
    frases: registro ? registro.size : 0,
    barra: !!document.querySelector('[aria-label="Controles de lectura en voz alta"]'),
  };
});

if (resaltado.bloqueActivo && resaltado.frases > 0) {
  ok('resaltado de lectura', `bloque activo + ${resaltado.frases} frase resaltada`);
} else {
  mal('resaltado de lectura', JSON.stringify(resaltado));
}

/* ---------------------------------------------------------------------------
 * escrituras agrupadas: teclear no debe reescribir el workspace entero por tecla
 *
 * `persist` serializaba y escribía en localStorage en cada cambio de estado. Con
 * un workspace de 279 KB eran 40 escrituras (11 MB) y 126 ms de hilo principal
 * por 20 letras. Con la cola diferida tiene que quedar en una sola escritura.
 * ------------------------------------------------------------------------- */
const escrituras = await page.evaluate(async () => {
  const original = Storage.prototype.setItem;
  let veces = 0;
  let bytes = 0;
  Storage.prototype.setItem = function (k, v) {
    veces += 1;
    bytes += (v ?? '').length;
    return original.call(this, k, v);
  };

  const el = document.querySelector('[data-block-id] [contenteditable]');
  el.focus();
  for (let i = 0; i < 20; i += 1) {
    document.execCommand('insertText', false, 'z');
    await new Promise((r) => setTimeout(r, 25));
  }
  await new Promise((r) => setTimeout(r, 700));
  Storage.prototype.setItem = original;
  return { veces, kb: Math.round(bytes / 1024) };
});

// y lo escrito sigue guardado de verdad tras recargar
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-block-id]');
await page.waitForTimeout(400);
const sobrevive = await page.evaluate(() => {
  const st = window.__nookStore.getState();
  return st.pages[st.selectedId].blocks.some((b) => (b.html ?? '').includes('zzz'));
});

if (escrituras.veces <= 3 && escrituras.kb <= 400 && sobrevive) {
  ok('escrituras agrupadas al teclear', `${escrituras.veces} escritura(s) por 20 letras · ${escrituras.kb} KB`);
} else {
  mal('escrituras agrupadas al teclear', JSON.stringify({ ...escrituras, sobrevive }));
}

/* ---------------------------------------------------------------------------
 * vaciar la papelera no deja punteros a páginas muertas
 *
 * Quedaban claves en `expanded` y en las posiciones de lectura apuntando a
 * páginas que ya no existían: basura que se guardaba para siempre.
 * ------------------------------------------------------------------------- */
const punteros = await page.evaluate(async () => {
  const st = () => window.__nookStore.getState();
  const padre = st().createPage(null, { title: 'con hijos' });
  const hijo = st().createPage(padre, { title: 'hijo' });
  st().toggleExpanded(padre);
  st().savePosition(hijo, 321);
  st().trashPage(padre);
  st().emptyTrash();
  await new Promise((r) => setTimeout(r, 200));
  const s = st();
  const ids = new Set(Object.keys(s.pages));
  return {
    expanded: Object.keys(s.expanded ?? {}).filter((k) => !ids.has(k)).length,
    posiciones: Object.keys(s.reading.positions ?? {}).filter((k) => !ids.has(k)).length,
    huerfanos: Object.values(s.pages).filter((p) => p.parentId && !ids.has(p.parentId)).length,
  };
});

if (punteros.expanded === 0 && punteros.posiciones === 0 && punteros.huerfanos === 0) {
  ok('papelera vaciada sin punteros huérfanos');
} else {
  mal('papelera vaciada sin punteros huérfanos', JSON.stringify(punteros));
}

await capturar(page, 'nook-030-lectura.png');

/* -------------------------------- cierre ----------------------------------- */
const consolaLimpia = errores.length === 0;
if (consolaLimpia) ok('consola sin errores');
else mal('consola sin errores', errores.slice(0, 4).join(' | '));

await browser.close();

console.log('');
for (const r of resultados) {
  console.log(`${r.ok ? '✅' : '❌'} ${r.nombre}${r.detalle ? ` — ${r.detalle}` : ''}`);
}
const fallos = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - fallos}/${resultados.length} verificaciones OK`);
process.exit(fallos ? 1 : 0);
