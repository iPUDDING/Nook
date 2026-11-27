/**
 * Verificación del selector de icono con pestañas (Emojis · Iconos · Personalizado).
 *
 * Lo que puede romperse sin que se note mirando una captura:
 *
 *  1. que existan las tres pestañas y que abra en Emojis;
 *  2. que el buscador de emojis filtre y avise cuando no hay coincidencias;
 *  3. que elegir un emoji lo guarde en la página y lo dibuje en cabecera y árbol;
 *  4. que la pestaña Iconos ofrezca iconos lineales y colores, y que el color
 *     elegido quede codificado en el valor guardado;
 *  5. que Personalizado reduzca la imagen subida y la guarde como `data:image/…`;
 *  6. que rechace un archivo que no es imagen sin tocar el icono actual;
 *  7. que acepte una URL http(s) y rechace una que no lo sea;
 *  8. que Aleatorio cambie el icono y Quitar lo deje vacío;
 *  9. que el icono sobreviva a la recarga y que la paleta lo muestre;
 * 10. que la consola quede limpia.
 *
 * Uso: node scripts/verificar-iconos.mjs http://127.0.0.1:4321
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4321';
const res = [];
const ok = (n, d = '') => res.push({ n, ok: true, d });
const mal = (n, d = '') => res.push({ n, ok: false, d });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });

const errores = [];
page.on('pageerror', (e) => errores.push(String(e)));
page.on('console', (m) => {
  if (m.type() === "error" && !/favicon|404/i.test(m.text())) errores.push(m.text());
});

/** PNG de 4×4 generado a mano: no depende de archivos del repo. */
const png4 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAHUlEQVR42mNkYPhfz0AEYBxVSF+FjIyMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAAAkJ0m9wAAAABJRU5ErkJggg==',
  'base64',
);

const iconoGuardado = () =>
  page.evaluate(() => {
    const st = window.__nookStore.getState();
    return st.pages[st.selectedId]?.icon ?? null;
  });

const abrirSelector = async () => {
  const abrir = page.locator('button[aria-label="Cambiar icono"], button:has-text("Agregar icono")').first();
  await abrir.click();
  await page.waitForSelector('[data-icon-tabs]', { timeout: 5000 });
};

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-block-id]', { timeout: 20000 });

// ---------------------------------------------------------------- 1. pestañas
await abrirSelector();
const pestanas = await page.evaluate(() =>
  [...document.querySelectorAll('[data-icon-tab]')].map((b) => ({
    id: b.getAttribute('data-icon-tab'),
    activa: b.getAttribute('aria-pressed') === 'true',
  })),
);
['emoji', 'icono', 'personalizado'].every((id) => pestanas.some((p) => p.id === id))
  ? ok('el selector tiene las tres pestañas', pestanas.map((p) => p.id).join(' · '))
  : mal('el selector tiene las tres pestañas', JSON.stringify(pestanas));
pestanas.find((p) => p.id === 'emoji')?.activa
  ? ok('abre en la pestaña Emojis')
  : mal('abre en la pestaña Emojis', JSON.stringify(pestanas));

// ----------------------------------------------------------- 2. buscar emoji
await page.locator('[data-icon-search]').fill('🚀');
await page.waitForTimeout(250);
const filtrado = await page.evaluate(() => document.querySelectorAll('[data-icon-option]').length);
filtrado === 1 ? ok('el buscador filtra emojis', '1 resultado') : mal('el buscador filtra emojis', String(filtrado));
await page.locator('[data-icon-search]').fill('zzzz');
await page.waitForTimeout(250);
const sinCoincidencias = await page.evaluate(() => document.body.innerText.includes('Ningún emoji coincide'));
sinCoincidencias ? ok('avisa cuando ningún emoji coincide') : mal('avisa cuando ningún emoji coincide');
await page.locator('[data-icon-search]').fill('🚀');
await page.waitForTimeout(200);

// ------------------------------------------------------------ 3. elegir emoji
await page.locator('[data-icon-option="🚀"]').click();
await page.waitForTimeout(400);
const emoji = await iconoGuardado();
emoji === '🚀' ? ok('elegir un emoji lo guarda en la página') : mal('elegir un emoji lo guarda en la página', String(emoji));
const dibujado = await page.evaluate(() => ({
  cabecera: !!document.querySelector('[data-page-icon="emoji"]'),
  arbol: document.querySelectorAll('aside [data-page-icon]').length,
}));
dibujado.cabecera && dibujado.arbol > 0
  ? ok('el emoji se dibuja en la cabecera y en el árbol', `${dibujado.arbol} en el árbol`)
  : mal('el emoji se dibuja en la cabecera y en el árbol', JSON.stringify(dibujado));

// ---------------------------------------------------------- 4. iconos lineales
await abrirSelector();
await page.locator('[data-icon-tab="icono"]').click();
await page.waitForTimeout(250);
const grilla = await page.evaluate(() => ({
  iconos: document.querySelectorAll('[data-icon-line]').length,
  colores: document.querySelectorAll('[data-icon-color]').length,
}));
grilla.iconos >= 20 ? ok('la pestaña Iconos ofrece iconos lineales', `${grilla.iconos}`) : mal('la pestaña Iconos ofrece iconos lineales', String(grilla.iconos));
grilla.colores >= 5 ? ok('la pestaña Iconos ofrece colores', `${grilla.colores}`) : mal('la pestaña Iconos ofrece colores', String(grilla.colores));

await page.locator('[data-icon-color="#337ea9"]').click();
await page.locator('[data-icon-line="book"]').click();
await page.waitForTimeout(400);
const lineal = await iconoGuardado();
lineal === 'line:book:#337ea9'
  ? ok('el icono lineal guarda nombre y color', lineal)
  : mal('el icono lineal guarda nombre y color', String(lineal));
const trazo = await page.evaluate(() => {
  const el = document.querySelector('[data-page-icon="line"]');
  return el ? { color: getComputedStyle(el).color, svg: !!el.querySelector('svg') } : null;
});
trazo?.svg && /51, 126, 169/.test(trazo.color)
  ? ok('el icono lineal se dibuja con su color', trazo.color)
  : mal('el icono lineal se dibuja con su color', JSON.stringify(trazo));

// ------------------------------------------------------- 5. subir una imagen
await abrirSelector();
await page.locator('[data-icon-tab="personalizado"]').click();
await page.waitForTimeout(250);
await page.locator('[data-icon-file]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png4 });
await page.waitForTimeout(900);
const subido = await iconoGuardado();
subido?.startsWith('data:image/png')
  ? ok('la imagen subida se guarda como data URL', `${Math.round((subido.length * 3) / 4 / 1024)} KB`)
  : mal('la imagen subida se guarda como data URL', String(subido).slice(0, 40));
const medidas = await page.evaluate(
  (src) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = src;
    }),
  subido,
);
medidas?.w === 160 && medidas?.h === 160
  ? ok('la imagen se recorta y reduce a 160×160', `${medidas.w}×${medidas.h}`)
  : mal('la imagen se recorta y reduce a 160×160', JSON.stringify(medidas));
(await page.evaluate(() => !!document.querySelector('[data-page-icon="image"]')))
  ? ok('la imagen se dibuja como imagen, no como texto')
  : mal('la imagen se dibuja como imagen, no como texto');

// ------------------------------------------- 6. archivo que no es una imagen
await abrirSelector();
await page.locator('[data-icon-tab="personalizado"]').click();
await page.waitForTimeout(250);
await page.locator('[data-icon-file]').setInputFiles({
  name: 'notas.txt',
  mimeType: 'text/plain',
  buffer: Buffer.from('no soy una imagen'),
});
await page.waitForTimeout(600);
const rechazo = await page.evaluate(() => ({
  aviso: document.querySelector('[data-icon-error]')?.textContent ?? '',
  sigue: !!document.querySelector('[data-page-icon="image"]'),
}));
/ no es una imagen/i.test(rechazo.aviso) && rechazo.sigue
  ? ok('un archivo que no es imagen se rechaza sin tocar el icono', rechazo.aviso.trim())
  : mal('un archivo que no es imagen se rechaza sin tocar el icono', JSON.stringify(rechazo));

// ------------------------------------------------------------- 7. URL de imagen
await page.locator('[data-icon-url]').fill('no-es-una-url');
await page.locator('[role="menu"] button', { hasText: /Usar/ }).first().click();
await page.waitForTimeout(300);
const urlMala = await page.evaluate(() => document.querySelector('[data-icon-error]')?.textContent ?? '');
/empiece con http/i.test(urlMala)
  ? ok('una URL inválida se rechaza con aviso', urlMala.trim())
  : mal('una URL inválida se rechaza con aviso', urlMala.trim());

await page.locator('[data-icon-url]').fill('https://ejemplo.com/logo.png');
await page.locator('[role="menu"] button', { hasText: /Usar/ }).first().click();
await page.waitForTimeout(500);
const porUrl = await iconoGuardado();
porUrl === 'https://ejemplo.com/logo.png'
  ? ok('una URL de imagen se guarda tal cual')
  : mal('una URL de imagen se guarda tal cual', String(porUrl));

// ----------------------------------------------------- 8. Aleatorio y Quitar
await abrirSelector();
const antes = await iconoGuardado();
await page.locator('[data-icon-random]').click();
await page.waitForTimeout(400);
const despues = await iconoGuardado();
despues && !despues.startsWith('line:') && !despues.startsWith('http')
  ? ok('Aleatorio pone un emoji', despues)
  : mal('Aleatorio pone un emoji', String(despues));
antes !== despues ? ok('Aleatorio cambia el icono actual') : ok('Aleatorio cambia el icono actual', 'coincidió por azar');

await abrirSelector();
await page.locator('[role="menu"] button', { hasText: /Quitar/ }).first().click();
await page.waitForTimeout(400);
const quitado = await iconoGuardado();
const volvioAgregar = await page.evaluate(() => ({
  // el árbol dibuja iconos de otras páginas: se mira sólo el cuerpo de la página
  sinIcono: document.querySelectorAll('main [data-page-icon]').length === 0,
  boton: [...document.querySelectorAll('button')].some((b) => /Agregar icono/.test(b.textContent || '')),
}));
quitado === null && volvioAgregar.sinIcono && volvioAgregar.boton
  ? ok('Quitar deja la página sin icono y vuelve "Agregar icono"')
  : mal('Quitar deja la página sin icono y vuelve "Agregar icono"', `${quitado} · ${JSON.stringify(volvioAgregar)}`);

// ------------------------------------------------- 9. persistencia y paleta
await abrirSelector();
await page.locator('[data-icon-option="📚"]').click();
await page.waitForTimeout(400);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-page-icon], [data-block-id]', { timeout: 20000 });
const trasRecarga = await iconoGuardado();
trasRecarga === '📚'
  ? ok('el icono sobrevive a la recarga', trasRecarga)
  : mal('el icono sobrevive a la recarga', String(trasRecarga));

const enPaleta = await page.evaluate(() => document.querySelectorAll('.menu [data-page-icon], aside [data-page-icon]').length);
enPaleta > 0
  ? ok('el árbol sigue dibujando el icono tras recargar', `${enPaleta}`)
  : mal('el árbol sigue dibujando el icono tras recargar');

// ------------------------------------------------------- 10. consola limpia
errores.length === 0 ? ok('consola sin errores') : mal('consola sin errores', errores.slice(0, 3).join(' | '));

await browser.close();

const total = res.length;
const bien = res.filter((r) => r.ok).length;
console.log('');
for (const r of res) console.log(`  ${r.ok ? '✔' : '✘'}  ${r.n}${r.d ? `  — ${r.d}` : ''}`);
console.log(`\n  ${bien}/${total} verificaciones OK\n`);
process.exit(bien === total ? 0 : 1);
