/**
 * Verificación de carpetas y archivos adjuntos.
 *
 * Lo que puede fallar de verdad y no se ve en una captura:
 *
 *  1. que la carpeta se comporte como carpeta (sin editor de bloques) y que el
 *     árbol la muestre con su icono;
 *  2. que subir un archivo deje **metadato en el workspace** y **bytes en
 *     IndexedDB**, que es donde tienen que estar;
 *  3. que el visor muestre el contenido y que Escape lo cierre (era el bug
 *     clásico de los overlays con estado local);
 *  4. que renombrar, mover y eliminar hagan lo que dicen, sin dejar blobs
 *     huérfanos ni metadatos colgando;
 *  5. que el tope del plan Gratis (5 MB por archivo) corte con mensaje;
 *  6. que todo sobreviva a una recarga;
 *  7. que vaciar la papelera se lleve los archivos de la carpeta borrada;
 *  8. que el respaldo incluya fichas y contenido, y que restaurarlo devuelva los
 *     archivos a IndexedDB.
 *
 * Uso: node scripts/verificar-carpetas.mjs http://127.0.0.1:4321
 */

import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4321';
const res = [];
const ok = (n, d = '') => res.push({ n, ok: true, d });
const mal = (n, d = '') => res.push({ n, ok: false, d });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 950 } });

const errores = [];
page.on('pageerror', (e) => errores.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errores.push(m.text());
});
// los confirm/prompt nativos se aceptan solos: la suite no puede quedarse colgada
page.on('dialog', (d) => void d.accept('renombrado.txt'));

const estado = () =>
  page.evaluate(() => {
    const st = window.__nookStore.getState();
    return {
      selectedId: st.selectedId,
      carpetas: Object.values(st.pages).filter((p) => p.isFolder && !p.trashed).map((p) => ({ id: p.id, titulo: p.title })),
      archivos: st.files.map((f) => ({ id: f.id, name: f.name, size: f.size, folderId: f.folderId })),
    };
  });

/** Lee una clave de IndexedDB (para comprobar que los bytes están de verdad). */
const blobs = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('nook-files');
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('blobs')) return resolve([]);
          const get = db.transaction('blobs', 'readonly').objectStore('blobs').getAllKeys();
          get.onsuccess = () => resolve(get.result.map(String));
          get.onerror = () => resolve([]);
        };
        req.onerror = () => resolve([]);
      }),
  );

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-block-id]');

/* ---------------------------------------------------------------------- */
/* 1. crear una carpeta desde la paleta                                    */
/* ---------------------------------------------------------------------- */
await page.keyboard.press('Control+k');
await page.waitForTimeout(250);
await page.keyboard.type('Nueva carpeta');
await page.waitForTimeout(250);
await page.keyboard.press('Enter');
await page.waitForTimeout(600);

const trasCrear = await page.evaluate(() => {
  const st = window.__nookStore.getState();
  const pg = st.pages[st.selectedId];
  const aside = document.querySelector('aside')?.innerText ?? '';
  return {
    carpetas: st.pages[st.selectedId]?.isFolder === true,
    titulo: pg?.title,
    // sin editor de bloques: una carpeta no tiene cuerpo
    bloques: document.querySelectorAll('[data-block-id]').length,
    enArbol: aside.includes(pg?.title ?? "∅"),
    boton: document.querySelector('[data-testid="input-archivos"]') !== null,
  };
});

if (trasCrear.carpetas && trasCrear.bloques === 0 && trasCrear.enArbol && trasCrear.boton) {
  ok('crear carpeta desde la paleta', `«${trasCrear.titulo}» sin editor y con zona de archivos`);
} else {
  mal('crear carpeta desde la paleta', JSON.stringify(trasCrear));
}

/* ---------------------------------------------------------------------- */
/* 2. subir archivos: metadato en el workspace, bytes en IndexedDB         */
/* ---------------------------------------------------------------------- */
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

await page.setInputFiles('[data-testid="input-archivos"]', [
  { name: 'acta.txt', mimeType: 'text/plain', buffer: Buffer.from('Acta de la reunión\nacuerdo uno') },
  { name: 'pixel.png', mimeType: 'image/png', buffer: png },
]);
await page.waitForTimeout(1200);

const trasSubir = await estado();
const claves = await blobs();
const carpetaId = trasSubir.selectedId;
const todosEnCarpeta = trasSubir.archivos.every((f) => f.folderId === carpetaId);
const blobsOk = trasSubir.archivos.every((f) => claves.includes(f.id));

if (trasSubir.archivos.length >= 2 && todosEnCarpeta && blobsOk) {
  ok('subir archivos', `${trasSubir.archivos.length} archivos · metadato en workspace y ${claves.length} blob(s) en IndexedDB`);
} else {
  mal('subir archivos', JSON.stringify({ archivos: trasSubir.archivos, claves, todosEnCarpeta }));
}

/* ---------------------------------------------------------------------- */
/* 3. el árbol lateral muestra los archivos de la carpeta                  */
/* ---------------------------------------------------------------------- */
const arbol = await page.evaluate(() => {
  const textos = [...document.querySelectorAll('aside button')].map((b) => b.innerText.trim());
  return { acta: textos.includes('acta.txt'), pixel: textos.includes('pixel.png') };
});

if (arbol.acta && arbol.pixel) {
  ok('los archivos aparecen en el árbol');
} else {
  mal('los archivos aparecen en el árbol', JSON.stringify(arbol));
}

/* ---------------------------------------------------------------------- */
/* 4. visor: contenido real y Escape para cerrar                           */
/* ---------------------------------------------------------------------- */
await page.locator('button[aria-label="Abrir acta.txt"]').first().click();
await page.waitForTimeout(600);
const visor = await page.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"]');
  return {
    abierto: !!dlg,
    titulo: dlg?.querySelector('h2')?.textContent ?? '',
    contenido: dlg?.querySelector('pre')?.textContent ?? '',
  };
});

await page.keyboard.press('Escape');
await page.waitForTimeout(400);
const trasEscape = await page.locator('[role="dialog"]:has-text("acta.txt")').count();

if (visor.abierto && /acta\.txt/.test(visor.titulo) && /Acta de la reunión/.test(visor.contenido) && trasEscape === 0) {
  ok('visor del archivo (contenido y Escape)', `texto leído: "${visor.contenido.slice(0, 24).replace(/\n/g, " ")}"`);
} else {
  mal('visor del archivo (contenido y Escape)', JSON.stringify({ visor, trasEscape }));
}

/* ---------------------------------------------------------------------- */
/* 5. renombrar                                                           */
/* ---------------------------------------------------------------------- */
await page.locator('button[aria-label="Renombrar acta.txt"]').first().click({ force: true });
await page.waitForTimeout(500);
const renombrado = await estado();
const nombreNuevo = renombrado.archivos.find((f) => f.id === trasSubir.archivos[0].id)?.name;

if (/renombrado\.txt/.test(nombreNuevo ?? '')) {
  ok('renombrar archivo', `${trasSubir.archivos[0].name} → ${nombreNuevo}`);
} else {
  mal('renombrar archivo', JSON.stringify({ nombreNuevo, archivos: renombrado.archivos }));
}

/* ---------------------------------------------------------------------- */
/* 6. mover a otra carpeta                                                */
/* ---------------------------------------------------------------------- */
const trasMover = await page.evaluate(async () => {
  const st = () => window.__nookStore.getState();
  const destino = st().createFolder(null, 'Archivo muerto');
  const file = st().files[0];
  st().moveFile(file.id, destino);
  return {
    carpeta: st().files.find((f) => f.id === file.id)?.folderId === destino,
    destino,
  };
});

if (trasMover.carpeta) {
  ok('mover archivo a otra carpeta');
} else {
  mal('mover archivo a otra carpeta', JSON.stringify(trasMover));
}

/* ---------------------------------------------------------------------- */
/* 7. tope del plan Gratis: 5 MB por archivo                              */
/* ---------------------------------------------------------------------- */
const tope = await page.evaluate(async () => {
  const st = () => window.__nookStore.getState();
  const original = st().plan;
  st().deactivatePlan(); // sin suscripción = Gratis (5 MB por archivo)

  const grande = new File([new Uint8Array(6 * 1024 * 1024)], 'pesado.bin', { type: 'application/octet-stream' });
  const rechazado = await st().addFile(grande, st().selectedId);

  const chico = new File([new Uint8Array(1024)], 'chico.bin', { type: 'application/octet-stream' });
  const aceptado = await st().addFile(chico, st().selectedId);

  window.__nookStore.setState({ plan: original });
  return {
    rechazado: { ok: rechazado.ok, error: rechazado.error ?? '' },
    aceptado: aceptado.ok,
    archivos: st().files.length,
  };
});

if (tope.rechazado.ok === false && /5 MB/.test(tope.rechazado.error) && tope.aceptado === true) {
  ok('tope de 5 MB por archivo sin suscripción', tope.rechazado.error);
} else {
  mal('tope de 5 MB por archivo sin suscripción', JSON.stringify(tope));
}

/* ---------------------------------------------------------------------- */
/* 8. persistencia tras recargar                                          */
/* ---------------------------------------------------------------------- */
const antesRecarga = await estado();
await page.waitForTimeout(400);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('aside');
await page.waitForTimeout(900);

const trasRecarga = await estado();
const clavesTras = await blobs();
const siguen = trasRecarga.archivos.length === antesRecarga.archivos.length;
const carpetaSigue = trasRecarga.carpetas.some((c) => c.id === antesRecarga.selectedId);
const blobsSiguen = trasRecarga.archivos.every((f) => clavesTras.includes(f.id));

if (siguen && carpetaSigue && blobsSiguen) {
  ok('carpetas y archivos sobreviven la recarga', `${trasRecarga.archivos.length} archivos · ${trasRecarga.carpetas.length} carpetas`);
} else {
  mal('carpetas y archivos sobreviven la recarga', JSON.stringify({ antes: antesRecarga.archivos.length, despues: trasRecarga.archivos.length, carpetaSigue, blobsSiguen }));
}

/* ---------------------------------------------------------------------- */
/* 9. vaciar la papelera se lleva los archivos de la carpeta              */
/* ---------------------------------------------------------------------- */
const papelera = await page.evaluate(async () => {
  const st = () => window.__nookStore.getState();
  const carpeta = st().createFolder(null, 'Para borrar');
  const file = new File([new Uint8Array(64)], 'efimero.bin', { type: 'application/octet-stream' });
  const resultado = await st().addFile(file, carpeta);
  const antes = st().files.length;
  st().trashPage(carpeta);
  st().emptyTrash();
  await new Promise((r) => setTimeout(r, 500));
  return { id: resultado.file?.id ?? '', antes, despues: st().files.length, existeCarpeta: !!st().pages[carpeta] };
});

const clavesFinal = await blobs();
const blobHuerfano = papelera.id ? clavesFinal.includes(papelera.id) : true;

if (papelera.antes === papelera.despues + 1 && !papelera.existeCarpeta && !blobHuerfano) {
  ok('papelera: se lleva el archivo y su blob', `${papelera.antes} → ${papelera.despues}`);
} else {
  mal('papelera: se lleva el archivo y su blob', JSON.stringify({ ...papelera, blobHuerfano }));
}

/* ---------------------------------------------------------------------- */
/* 10. respaldo: fichas + contenido, y restauración                       */
/* ---------------------------------------------------------------------- */
await page.evaluate(() => window.__nookStore.getState().setUI({ settingsOpen: true, settingsTab: 'Datos' }));
await page.waitForTimeout(400);

const [descarga] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('button:has-text("Exportar respaldo")').click(),
]);
const respaldo = JSON.parse(await fs.readFile(await descarga.path(), 'utf8'));

const trasRestaurar = await page.evaluate(async (datos) => {
  const st = () => window.__nookStore.getState();
  st().resetWorkspace();
  await new Promise((r) => setTimeout(r, 300));
  const aplicado = st().restoreBackup(datos);
  await new Promise((r) => setTimeout(r, 900)); // los blobs se escriben en segundo plano
  const claves = await new Promise((resolve) => {
    const req = indexedDB.open('nook-files');
    req.onsuccess = () => {
      const get = req.result.transaction('blobs', 'readonly').objectStore('blobs').getAllKeys();
      get.onsuccess = () => resolve(get.result.map(String));
    };
    req.onerror = () => resolve([]);
  });
  return {
    aplicado,
    archivos: st().files.length,
    conBlob: st().files.filter((f) => claves.includes(f.id)).length,
  };
}, respaldo);

const respaldoOk =
  Array.isArray(respaldo.files) &&
  respaldo.files.length > 0 &&
  Array.isArray(respaldo.fileBlobs) &&
  respaldo.fileBlobs.length > 0 &&
  trasRestaurar.aplicado === true &&
  trasRestaurar.archivos === respaldo.files.length &&
  trasRestaurar.conBlob === trasRestaurar.archivos;

if (respaldoOk) {
  ok(
    'respaldo con adjuntos y restauración',
    `${respaldo.files.length} ficha(s), ${respaldo.fileBlobs.length} con contenido · restaurados ${trasRestaurar.conBlob}`,
  );
} else {
  mal('respaldo con adjuntos y restauración', JSON.stringify({ fichas: respaldo.files?.length, blobs: respaldo.fileBlobs?.length, trasRestaurar }));
}

await page.keyboard.press('Escape');
await page.waitForTimeout(200);

/* ---------------------------------------------------------------------- */
/* 11. consola limpia                                                     */
/* ---------------------------------------------------------------------- */
if (errores.length === 0) ok('consola sin errores');
else mal('consola sin errores', errores.slice(0, 3).join(' | '));

await browser.close();

/* -------------------------------- informe -------------------------------- */
const bien = res.filter((r) => r.ok).length;
for (const r of res) console.log(`${r.ok ? '✓' : '✗'} ${r.n}${r.d ? ` — ${r.d}` : ''}`);
console.log(`\n${bien}/${res.length} verificaciones de carpetas`);
process.exit(bien === res.length ? 0 : 1);
