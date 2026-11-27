/**
 * Búsqueda global de contenido.
 *
 * Es la queja número dos del ecosistema, después de la lentitud: la búsqueda de
 * la app de referencia "sólo sirve para títulos". Si la palabra que recordás está
 * dentro de un párrafo, dentro de una celda de la base o dentro de una página
 * hija, no aparece. Y no hay forma de acotar: con cientos de páginas, los
 * resultados irrelevantes tapan lo que buscás.
 *
 * Acá se busca en el **texto de los bloques** y en **los valores de las filas**,
 * se muestra el pedazo donde está la coincidencia, y se puede acotar a la rama de
 * la página en la que estás (la página y todas sus hijas).
 */

import type { Database, Page } from "./types";

export type Alcance = "todo" | "rama";

export interface CoincidenciaGlobal {
  pageId: string;
  /** bloque donde está la coincidencia (para saltar y marcarlo) */
  blockId?: string;
  /** fila de la base donde está la coincidencia */
  rowId?: string;
  titulo: string;
  /** ruta de la página en el árbol, para desambiguar títulos repetidos */
  camino: string;
  extracto: string;
  tipo: "bloque" | "fila" | "titulo";
}

/** minúsculas y sin tildes: «configuración» tiene que encontrarse escribiendo «configuracion» */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** texto plano de un fragmento de HTML, sin pasar por el DOM */
export function textoPlano(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** el pedazo de texto alrededor de la coincidencia, sin cortar palabras de más */
export function extractoDe(texto: string, desde: number, hasta: number, margen = 32): string {
  const ini = Math.max(0, desde - margen);
  const fin = Math.min(texto.length, hasta + margen);
  return `${ini > 0 ? "…" : ""}${texto.slice(ini, fin).trim()}${fin < texto.length ? "…" : ""}`;
}

function caminoDe(pages: Record<string, Page>, id: string): string {
  const partes: string[] = [];
  let actual: Page | undefined = pages[id];
  let vueltas = 0;
  while (actual && vueltas < 20) {
    partes.unshift(actual.title || "Sin título");
    actual = actual.parentId ? pages[actual.parentId] : undefined;
    vueltas += 1;
  }
  partes.pop(); // sin el título de la propia página
  return partes.join(" / ");
}

function ramaDe(pages: Record<string, Page>, raiz: string): Set<string> {
  const dentro = new Set<string>([raiz]);
  let agrego = true;
  while (agrego) {
    agrego = false;
    for (const p of Object.values(pages)) {
      if (p.parentId && dentro.has(p.parentId) && !dentro.has(p.id)) {
        dentro.add(p.id);
        agrego = true;
      }
    }
  }
  return dentro;
}

export function buscarGlobal({
  pages,
  consulta,
  alcance = "todo",
  raizId,
  limite = 12,
}: {
  pages: Record<string, Page>;
  consulta: string;
  alcance?: Alcance;
  raizId?: string;
  limite?: number;
}): CoincidenciaGlobal[] {
  const aguja = normalizar(consulta.trim());
  if (aguja.length < 2) return [];

  const dentro = alcance === "rama" && raizId ? ramaDe(pages, raizId) : null;
  const salida: CoincidenciaGlobal[] = [];

  for (const page of Object.values(pages)) {
    if (page.trashed) continue;
    if (dentro && !dentro.has(page.id)) continue;

    const titulo = page.title || "Sin título";
    const camino = caminoDe(pages, page.id);

    // 1. el título (lo único que ya andaba, pero suma para desambiguar)
    if (normalizar(titulo).includes(aguja)) {
      salida.push({
        pageId: page.id,
        titulo,
        camino,
        extracto: `en el título: ${titulo}`,
        tipo: "titulo",
      });
    }

    // 2. el texto de los bloques
    for (const block of page.blocks) {
      if (!block.html) continue;
      const texto = textoPlano(block.html);
      if (!texto) continue;
      const pos = normalizar(texto).indexOf(aguja);
      if (pos === -1) continue;
      salida.push({
        pageId: page.id,
        blockId: block.id,
        titulo,
        camino,
        extracto: extractoDe(texto, pos, pos + aguja.length),
        tipo: "bloque",
      });
      if (salida.length >= limite * 3) break;
    }

    // 3. las celdas de la base de datos
    const db: Database | null = page.database ?? null;
    if (db) {
      for (const row of db.rows) {
        const valores = Object.entries(row.cells)
          .map(([propId, valor]) => {
            const prop = db.properties.find((p) => p.id === propId);
            const texto = String(valor ?? "");
            if (!texto) return "";
            return prop && prop.type !== "title" ? `${prop.name}: ${texto}` : texto;
          })
          .filter(Boolean)
          .join(" · ");
        if (!valores) continue;
        const pos = normalizar(valores).indexOf(aguja);
        if (pos === -1) continue;
        salida.push({
          pageId: page.id,
          rowId: row.id,
          titulo,
          camino,
          extracto: extractoDe(valores, pos, pos + aguja.length),
          tipo: "fila",
        });
        if (salida.length >= limite * 3) break;
      }
    }
  }

  // primero donde la coincidencia está en el contenido, después los títulos
  const orden = { bloque: 0, fila: 1, titulo: 2 } as const;
  return salida.sort((a, b) => orden[a.tipo] - orden[b.tipo]).slice(0, limite);
}
