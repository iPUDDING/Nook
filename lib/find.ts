/**
 * Buscar y reemplazar dentro de una página.
 *
 * Las quejas sobre la app de referencia son constantes en dos puntos: no hay
 * forma de buscar dentro de una página larga y **no existe** buscar y
 * reemplazar (sólo el buscar del navegador, que no puede reemplazar nada).
 *
 * Los bloques guardan HTML inline (`hola <strong>mundo</strong>`), así que la
 * búsqueda no puede ser un `indexOf` sobre el HTML: encontraría `mundo` pero
 * también `m` en `<em>`. Todo se resuelve sobre los **nodos de texto**, y los
 * desplazamientos que devuelve la búsqueda son los mismos que se usan para
 * seleccionar el resultado en pantalla y para reemplazar.
 *
 * Los rangos que cruzan etiquetas (`<b>mun</b>do`) también se encuentran y se
 * reemplazan: se recorre el texto concatenado de los nodos y se corta cada nodo
 * por el pedazo que cae dentro del rango.
 */

export interface Coincidencia {
  blockId: string;
  /** desplazamiento en el texto concatenado del bloque */
  desde: number;
  hasta: number;
}

/** nodos de texto de un fragmento de HTML, en orden */
function nodosDe(html: string): Text[] {
  const host = document.createElement("div");
  host.innerHTML = html;
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  const nodos: Text[] = [];
  let n = walker.nextNode();
  while (n) {
    nodos.push(n as Text);
    n = walker.nextNode();
  }
  return nodos;
}

function textoDe(nodos: Text[]): string {
  return nodos.map((n) => n.data).join("");
}

/** todo el texto visible de un bloque, sin etiquetas */
export function textoDeHtml(html: string): string {
  return textoDe(nodosDe(html));
}

/**
 * Todas las apariciones de `consulta` en un HTML, por desplazamiento en el texto.
 * La comparación ignora mayúsculas.
 */
export function buscarEnHtml(html: string, consulta: string): { desde: number; hasta: number }[] {
  const q = consulta.trim();
  if (!q) return [];
  const texto = textoDe(nodosDe(html)).toLowerCase();
  const aguja = q.toLowerCase();
  const salida: { desde: number; hasta: number }[] = [];
  let desde = texto.indexOf(aguja);
  while (desde !== -1) {
    salida.push({ desde, hasta: desde + aguja.length });
    desde = texto.indexOf(aguja, desde + aguja.length);
  }
  return salida;
}

/** Todas las coincidencias de la página, bloque por bloque y en orden. */
export function buscarEnBloques(
  bloques: { id: string; html: string }[],
  consulta: string,
): Coincidencia[] {
  const salida: Coincidencia[] = [];
  for (const b of bloques) {
    for (const r of buscarEnHtml(b.html, consulta)) {
      salida.push({ blockId: b.id, desde: r.desde, hasta: r.hasta });
    }
  }
  return salida;
}

/**
 * Reemplaza las apariciones de `consulta` en un HTML.
 *
 * `todas = false` cambia sólo la indicada. El reemplazo se escribe en nodos de
 * texto, así que escribir `<b>` en el campo de reemplazo no inyecta etiquetas.
 */
export function reemplazarEnHtml(
  html: string,
  consulta: string,
  reemplazo: string,
  opciones: { todas?: boolean; cual?: number } = {},
): { html: string; cambios: number } {
  const todas = opciones.todas ?? false;
  const cual = opciones.cual ?? 0;
  const q = consulta.trim();
  if (!q) return { html, cambios: 0 };
  const host = document.createElement("div");
  host.innerHTML = html;
  const nodos: Text[] = [];
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let n = walker.nextNode();
  while (n) {
    nodos.push(n as Text);
    n = walker.nextNode();
  }

  const texto = nodos.map((x) => x.data).join("").toLowerCase();
  const aguja = q.toLowerCase();
  const rangos: { desde: number; hasta: number }[] = [];
  let desde = texto.indexOf(aguja);
  while (desde !== -1) {
    rangos.push({ desde, hasta: desde + aguja.length });
    desde = texto.indexOf(aguja, desde + aguja.length);
  }
  if (rangos.length === 0) return { html, cambios: 0 };

  const usados = todas ? rangos : rangos.slice(cual, cual + 1);
  // se escribe en nodos de texto, así que el navegador ya lo escapa solo: si se
  // escapara acá también, un `<` quedaría como `&amp;lt;`
  const limpio = reemplazo;

  // de derecha a izquierda: los desplazamientos de la izquierda no se mueven
  for (let i = usados.length - 1; i >= 0; i--) {
    const { desde: s, hasta: e } = usados[i];
    let cursor = 0;
    let puesto = false;
    for (const nodo of nodos) {
      const inicio = cursor;
      const fin = cursor + nodo.data.length;
      cursor = fin;
      if (fin <= s || inicio >= e) continue;
      const corteInicio = Math.max(0, s - inicio);
      const corteFin = Math.min(nodo.data.length, e - inicio);
      nodo.data =
        nodo.data.slice(0, corteInicio) + (puesto ? "" : limpio) + nodo.data.slice(corteFin);
      puesto = true;
    }
  }

  return { html: host.innerHTML, cambios: usados.length };
}

/**
 * Selecciona en pantalla el rango indicado del texto de un elemento y lo deja a
 * la vista. Devuelve `false` si el elemento no tiene texto suficiente.
 */
export function seleccionarRango(host: HTMLElement, desde: number, hasta: number): boolean {
  const nodos: Text[] = [];
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let n = walker.nextNode();
  while (n) {
    nodos.push(n as Text);
    n = walker.nextNode();
  }
  const total = nodos.reduce((suma, x) => suma + x.data.length, 0);
  if (total === 0) return false;

  const punto = (objetivo: number): { nodo: Text; offset: number } | null => {
    let cursor = 0;
    for (const nodo of nodos) {
      const fin = cursor + nodo.data.length;
      if (objetivo <= fin) return { nodo, offset: Math.max(0, objetivo - cursor) };
      cursor = fin;
    }
    const ultimo = nodos[nodos.length - 1];
    return ultimo ? { nodo: ultimo, offset: ultimo.data.length } : null;
  };

  const ini = punto(desde);
  const fin = punto(Math.min(hasta, total));
  if (!ini || !fin) return false;

  const rango = document.createRange();
  rango.setStart(ini.nodo, Math.min(ini.offset, ini.nodo.data.length));
  rango.setEnd(fin.nodo, Math.min(fin.offset, fin.nodo.data.length));
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(rango);
  host.scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}

/**
 * Rangos del DOM para un conjunto de coincidencias de un mismo bloque.
 *
 * Se usan con la API de resaltados del navegador (`CSS.highlights`), que pinta
 * sin tocar el documento: si se marcara metiendo `<mark>` en el HTML habría que
 * limpiarlo después en cada bloque, y una edición en el medio dejaría etiquetas
 * sueltas guardadas.
 */
export function rangosDeBloque(
  host: HTMLElement,
  coincidencias: { desde: number; hasta: number }[],
): Range[] {
  const nodos: Text[] = [];
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let n = walker.nextNode();
  while (n) {
    nodos.push(n as Text);
    n = walker.nextNode();
  }
  if (nodos.length === 0) return [];

  const punto = (objetivo: number): { nodo: Text; offset: number } => {
    let cursor = 0;
    for (const nodo of nodos) {
      const fin = cursor + nodo.data.length;
      if (objetivo <= fin) return { nodo, offset: Math.max(0, Math.min(objetivo - cursor, nodo.data.length)) };
      cursor = fin;
    }
    const ultimo = nodos[nodos.length - 1];
    return { nodo: ultimo, offset: ultimo.data.length };
  };

  const salida: Range[] = [];
  for (const c of coincidencias) {
    const ini = punto(c.desde);
    const fin = punto(c.hasta);
    try {
      const r = document.createRange();
      r.setStart(ini.nodo, ini.offset);
      r.setEnd(fin.nodo, fin.offset);
      salida.push(r);
    } catch {
      /* una coincidencia que ya no existe no rompe el resto */
    }
  }
  return salida;
}

/** ¿el navegador soporta resaltados sin tocar el DOM? (Chromium 105+) */
export function hayResaltados(): boolean {
  return !!registro() && !!constructor();
}

type RegistroResaltados = {
  set: (nombre: string, valor: unknown) => void;
  delete: (nombre: string) => void;
};

function registro(): RegistroResaltados | null {
  const css = (globalThis as unknown as { CSS?: { highlights?: RegistroResaltados } }).CSS;
  return css?.highlights ?? null;
}

function constructor(): (new (...rangos: Range[]) => unknown) | null {
  const c = (globalThis as unknown as { Highlight?: new (...rangos: Range[]) => unknown }).Highlight;
  return typeof c === "function" ? c : null;
}

/** pinta las coincidencias y la activa; devuelve `false` si el navegador no puede */
export function pintarResaltados(todos: Range[], actuales: Range[]): boolean {
  const reg = registro();
  const Ctor = constructor();
  if (!reg || !Ctor) return false;
  try {
    if (todos.length) reg.set("nook-find", new Ctor(...todos));
    else reg.delete("nook-find");
    if (actuales.length) reg.set("nook-find-actual", new Ctor(...actuales));
    else reg.delete("nook-find-actual");
    return true;
  } catch {
    return false;
  }
}

export function limpiarResaltados() {
  const reg = registro();
  if (!reg) return;
  reg.delete("nook-find");
  reg.delete("nook-find-actual");
}
