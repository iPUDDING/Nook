/**
 * Historial de versiones por página.
 *
 * Es el diferenciador central de los planes de Notion (7 / 30 / 90 días /
 * ilimitado), así que acá se implementa de verdad y no como una etiqueta.
 *
 * Tres decisiones que importan:
 *
 *  1. **Fuera del workspace principal.** Las versiones viven en su propia clave
 *     de `localStorage` (`nook-versions-v1`). Si se guardaran dentro del
 *     workspace, un historial grande podría llenar la cuota y dejar la app sin
 *     poder guardar *nada*. Perder el historial es molesto; perder la nota no.
 *  2. **Con presupuesto.** Se poda por antigüedad (según el plan), por cantidad
 *     por página y por tamaño total. Nunca crece sin control.
 *  3. **A prueba de cuota.** Toda escritura va en `try/catch`: si el navegador
 *     rechaza el guardado, se descarta lo más viejo y, si aun así falla, la app
 *     sigue funcionando sin historial en lugar de romperse.
 */

import { sanitizeBlocks } from "./sanitize";
import type { Block } from "./types";

export interface Version {
  id: string;
  /** marca de tiempo en ms */
  at: number;
  title: string;
  blocks: Block[];
}

export type VersionMap = Record<string, Version[]>;

export const VERSIONS_KEY = "nook-versions-v1";

/** Tope duro por página, independiente del plan. */
export const MAX_PER_PAGE = 30;

/** Presupuesto aproximado para todo el historial (el workspace tiene su propia cuota). */
export const MAX_TOTAL_BYTES = 1_400_000;

const uid = () => `ver_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Huella del contenido: título + bloques, sin `updatedAt` (cambia siempre). */
export function contentSignature(title: string, blocks: Block[]): string {
  return JSON.stringify([title, blocks.map((b) => [b.id, b.type, b.html, b.checked, b.indent, b.table])]);
}

/** ¿Esta versión ya representa ese contenido? Evita snapshots repetidos. */
export function sameContent(version: Version, title: string, blocks: Block[]): boolean {
  return contentSignature(version.title, version.blocks) === contentSignature(title, blocks);
}

export function makeVersion(title: string, blocks: Block[], at = Date.now()): Version {
  return {
    id: uid(),
    at,
    title,
    // copia profunda: los bloques del store se reemplazan, no se mutan, pero el
    // snapshot no debe compartir referencias con el documento vivo
    blocks: structuredClone(blocks),
  };
}

/** Días de retención → recorte por antigüedad. `null` = sin recorte. */
export function pruneByDays(all: VersionMap, days: number | null, now = Date.now()): VersionMap {
  const out: VersionMap = {};
  const limite = days === null ? null : now - days * 24 * 60 * 60 * 1000;

  for (const [pageId, list] of Object.entries(all)) {
    const vigentes = (limite === null ? list : list.filter((v) => v.at >= limite))
      .slice()
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_PER_PAGE);
    if (vigentes.length) out[pageId] = vigentes;
  }
  return out;
}

/** Suma de bytes de una entrada, para administrar el presupuesto. */
const bytesOf = (list: Version[]): number => {
  try {
    return new Blob([JSON.stringify(list)]).size;
  } catch {
    return JSON.stringify(list).length;
  }
};

export function totalBytes(all: VersionMap): number {
  return Object.values(all).reduce((acc, list) => acc + bytesOf(list), 0);
}

/** Descarta las versiones más viejas (de todo el historial) hasta entrar en el presupuesto. */
export function pruneBySize(all: VersionMap, budget = MAX_TOTAL_BYTES): VersionMap {
  let out: VersionMap = Object.fromEntries(
    Object.entries(all).map(([id, list]) => [id, list.slice().sort((a, b) => b.at - a.at)]),
  );
  if (totalBytes(out) <= budget) return out;

  // aplanar, ordenar por antigüedad y volver a armar dejando fuera lo más viejo
  const planas: { pageId: string; version: Version }[] = [];
  for (const [pageId, list] of Object.entries(out)) {
    for (const version of list) planas.push({ pageId, version });
  }
  planas.sort((a, b) => a.version.at - b.version.at); // más viejo primero

  while (planas.length && totalBytes(out) > budget) {
    const { pageId, version } = planas.shift()!;
    const resto = (out[pageId] ?? []).filter((v) => v.id !== version.id);
    if (resto.length) out[pageId] = resto;
    else delete out[pageId];
    out = { ...out };
  }
  return out;
}

/* ========================================================================== */
/*                              Persistencia                                  */
/* ========================================================================== */

const storage = (): Storage | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

export function loadVersions(): VersionMap {
  const store = storage();
  if (!store) return {};
  try {
    const raw = store.getItem(VERSIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as VersionMap;
    if (!parsed || typeof parsed !== "object") return {};

    // validación mínima: una entrada rota no debe arrastrar el resto
    const out: VersionMap = {};
    for (const [pageId, list] of Object.entries(parsed)) {
      if (!Array.isArray(list)) continue;
      const buenas = list
        .filter(
          (v) => v && typeof v.id === "string" && typeof v.at === "number" && Array.isArray(v.blocks),
        )
        // el historial vive en su propia clave de `localStorage`, igual de
        // editable a mano que un respaldo: se sanea al cargar o restaurar una
        // versión inyectaría HTML en el documento
        .map((v) => ({ ...v, blocks: sanitizeBlocks(v.blocks) as Block[] }));
      if (buenas.length) out[pageId] = buenas;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Guarda el historial. Devuelve `false` si no se pudo (cuota llena), en cuyo caso
 * ya se descartó lo más viejo: el llamador puede seguir sin hacer nada especial.
 */
export function saveVersions(all: VersionMap): boolean {
  const store = storage();
  if (!store) return false;

  let candidate = pruneBySize(all);
  for (let intento = 0; intento < 3; intento += 1) {
    try {
      store.setItem(VERSIONS_KEY, JSON.stringify(candidate));
      return true;
    } catch {
      // cuota: soltar la mitad de lo más viejo y reintentar
      candidate = pruneBySize(candidate, Math.floor(MAX_TOTAL_BYTES / (2 + intento)));
      if (!Object.keys(candidate).length) {
        try {
          store.removeItem(VERSIONS_KEY);
        } catch {
          /* nada más que hacer */
        }
        return false;
      }
    }
  }
  return false;
}

/** Añade una versión a una página y devuelve el mapa nuevo (sin persistir). */
export function addVersion(
  all: VersionMap,
  pageId: string,
  version: Version,
  retentionDays: number | null,
  now = Date.now(),
): VersionMap {
  const list = [version, ...(all[pageId] ?? [])];
  const next = { ...all, [pageId]: list };
  return pruneByDays(next, retentionDays, now);
}
