/**
 * Copias de seguridad automáticas.
 *
 * La queja más repetida sobre la app de referencia, después de la lentitud, es
 * que no hay respaldo: lo que hay es «exportá un ZIP y acordate de hacerlo». Acá
 * la app guarda sola una foto del workspace cada pocos minutos, sólo si algo
 * cambió, y las cinco últimas se pueden restaurar o descargar desde
 * Configuración.
 *
 * Viven en su propia clave de `localStorage`, no en la del workspace, por la
 * misma razón que el historial de versiones: si el espacio se llena, lo que se
 * pierde son las copias, nunca las notas.
 */

import { useStore, type BackupPayload } from "./store";

const CLAVE = "nook.copias.v1";

/** cuántas copias se guardan */
export const MAX_COPIAS = 5;
/** presupuesto total: por encima, se descarta la más vieja */
export const MAX_BYTES = 3_500_000;

export interface Copia {
  id: string;
  /** epoch en ms */
  at: number;
  bytes: number;
  /** huella del contenido: sirve para no guardar dos copias iguales */
  firma: string;
  /** el respaldo serializado, con la misma forma que el que se descarga */
  data: string;
}

function firmaDe(texto: string): string {
  // FNV-1a de 32 bits: alcanza para saber si el workspace cambió
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export function leerCopias(): Copia[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return [];
    const lista = JSON.parse(crudo) as unknown;
    if (!Array.isArray(lista)) return [];
    return lista.filter(
      (c): c is Copia =>
        !!c &&
        typeof (c as Copia).id === "string" &&
        typeof (c as Copia).at === "number" &&
        typeof (c as Copia).data === "string",
    );
  } catch {
    return [];
  }
}

function guardar(lista: Copia[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(lista));
  } catch {
    // sin espacio: se intenta de nuevo sin las dos más viejas
    try {
      localStorage.setItem(CLAVE, JSON.stringify(lista.slice(0, 2)));
    } catch {
      /* nada que hacer: las notas están en otra clave */
    }
  }
}

/** el workspace tal como viaja en un respaldo (sin las posiciones de scroll) */
export function payloadActual(): BackupPayload {
  const s = useStore.getState();
  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    pages: s.pages,
    members: s.members,
    selectedId: s.selectedId,
    expanded: s.expanded,
    theme: s.theme,
    tts: s.tts,
    reading: { ...s.reading, positions: {} },
    pomodoro: s.pomodoro,
    pomHistory: s.pomHistory,
    bar: s.bar,
    rules: s.rules,
  };
}

/**
 * Toma una copia si el workspace cambió desde la última.
 * Devuelve la copia nueva, o `null` si no había nada que guardar.
 */
export function tomarCopia(forzar = false): Copia | null {
  const payload = payloadActual();
  const data = JSON.stringify(payload);
  const firma = firmaDe(data);
  const copias = leerCopias();
  if (!forzar && copias[0]?.firma === firma) return null;

  const copia: Copia = {
    id: `copia_${Date.now().toString(36)}`,
    at: Date.now(),
    bytes: new Blob([data]).size,
    firma,
    data,
  };

  let lista = [copia, ...copias].slice(0, MAX_COPIAS);
  // presupuesto: fuera la más vieja hasta entrar
  while (lista.length > 1 && lista.reduce((n, c) => n + c.bytes, 0) > MAX_BYTES) {
    lista = lista.slice(0, -1);
  }
  guardar(lista);
  return copia;
}

export function borrarCopia(id: string) {
  guardar(leerCopias().filter((c) => c.id !== id));
}

export function limpiarCopias() {
  guardar([]);
}

/** restaura una copia; devuelve `false` si el contenido no es válido */
export function restaurarCopia(id: string): boolean {
  const copia = leerCopias().find((c) => c.id === id);
  if (!copia) return false;
  try {
    const data = JSON.parse(copia.data) as BackupPayload;
    return useStore.getState().restoreBackup(data);
  } catch {
    return false;
  }
}
