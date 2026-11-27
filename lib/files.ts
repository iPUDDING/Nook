/**
 * Archivos adjuntos: metadatos en el workspace, bytes en IndexedDB.
 *
 * Por qué así
 * -----------
 * Un PDF de 3 MB no entra en la cuota de `localStorage` (unos 5 MB **en total**,
 * compartidos con las notas). Si los archivos fueran ahí, subir dos adjuntos
 * dejaría al usuario sin poder guardar ni una línea.
 *
 * IndexedDB guarda binarios sin ese problema y sin dependencias: es API del
 * navegador, también en el `.exe`. Los **metadatos** (nombre, tipo, tamaño,
 * carpeta) sí viven en el workspace, porque son texto pequeño y así el árbol, el
 * respaldo y la papelera los tratan como cualquier otro dato.
 *
 * La regla que se sostiene en todo el archivo: si IndexedDB no está disponible
 * (modo privado, cuota llena, navegador viejo), se devuelve un error explícito y
 * la app sigue funcionando sin adjuntos. Nunca se pierde una nota por un archivo.
 */

import type { FileMeta } from "./types";

const DB_NAME = "nook-files";
const DB_VERSION = 1;
const STORE = "blobs";

export type FileKind = "image" | "pdf" | "text" | "audio" | "video" | "other";

/* ========================================================================== */
/*                              IndexedDB                                     */
/* ========================================================================== */

let dbPromise: Promise<IDBDatabase | null> | null = null;

/** Abre (una vez) la base de datos de blobs. `null` si el navegador no la da. */
function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

/** Envuelve una transacción en una promesa: IndexedDB es todo callbacks. */
function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) {
          resolve({ ok: false, error: "Este navegador no ofrece almacenamiento para archivos." });
          return;
        }
        let tx: IDBTransaction;
        try {
          tx = db.transaction(STORE, mode);
        } catch {
          resolve({ ok: false, error: "No se pudo abrir el almacén de archivos." });
          return;
        }
        const request = fn(tx.objectStore(STORE));
        request.onsuccess = () => resolve({ ok: true, value: request.result });
        request.onerror = () => resolve({ ok: false, error: "El navegador rechazó la operación." });
        tx.onabort = () => resolve({ ok: false, error: "La operación se canceló (¿espacio lleno?)." });
      }),
  );
}

/**
 * Las tres operaciones validan el id: IndexedDB lanza
 * (`The parameter is not a valid key`) con `null` o `undefined`, y ese throw
 * sincrónico se llevaba por delante la acción que lo llamaba.
 */
const idValido = (id: unknown): id is string => typeof id === "string" && id.length > 0;

export const saveBlob = (id: string, blob: Blob) =>
  idValido(id) && blob instanceof Blob
    ? run("readwrite", (store) => store.put(blob, id))
    : Promise.resolve({ ok: false as const, error: "Archivo inválido." });

export const readBlob = (id: string) =>
  idValido(id)
    ? run<Blob | undefined>("readonly", (store) => store.get(id))
    : Promise.resolve({ ok: false as const, error: "Archivo inválido." });

export const removeBlob = (id: string) =>
  idValido(id)
    ? run("readwrite", (store) => store.delete(id))
    : Promise.resolve({ ok: false as const, error: "Archivo inválido." });

/* ========================================================================== */
/*                          Presentación y tipos                              */
/* ========================================================================== */

/** Tipo de archivo según el MIME y, si falta, la extensión del nombre. */
export function fileKind(mime: string, name = ""): FileKind {
  const tipo = (mime || "").toLowerCase();
  const ext = name.toLowerCase().split(".").pop() ?? "";

  if (tipo.startsWith("image/") || /^(png|jpe?g|gif|webp|avif|svg|bmp)$/.test(ext)) return "image";
  if (tipo === "application/pdf" || ext === "pdf") return "pdf";
  if (tipo.startsWith("audio/") || /^(mp3|wav|ogg|m4a|flac)$/.test(ext)) return "audio";
  if (tipo.startsWith("video/") || /^(mp4|webm|mov|mkv)$/.test(ext)) return "video";
  if (
    tipo.startsWith("text/") ||
    /^(json|md|markdown|txt|csv|tsv|log|yml|yaml|xml|html?|css|js|ts|tsx|jsx|py|sh)$/.test(ext)
  ) {
    return "text";
  }
  return "other";
}

/** Tamaño legible en español: `1,2 MB`, `340 KB`, `12 B`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const unidades = ["B", "KB", "MB", "GB"];
  let valor = bytes;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i += 1;
  }
  const redondeado = valor >= 10 || i === 0 ? Math.round(valor) : Math.round(valor * 10) / 10;
  return `${redondeado.toLocaleString("es-AR")} ${unidades[i]}`;
}

/** Extensión en mayúsculas para el icono de las tarjetas: `PDF`, `MD`, `PNG`. */
export function fileExt(name: string): string {
  const ext = name.includes(".") ? name.split(".").pop() ?? "" : "";
  return (ext || "archivo").slice(0, 4).toUpperCase();
}

/** Nombre de archivo seguro para descargar (sin rutas ni caracteres raros). */
export function safeFileName(name: string): string {
  const limpio = name
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return limpio || "archivo";
}

/** Presupuesto de bytes de adjuntos que viajan dentro del respaldo JSON. */
export const FILE_EMBED_BUDGET = 10 * 1024 * 1024;

/**
 * Decide qué adjuntos entran en el respaldo.
 *
 * Se meten los más chicos primero para maximizar la cantidad de archivos que
 * sobreviven y se devuelve la lista de los que quedan afuera, que la interfaz
 * nombra en el aviso. El respaldo es un JSON en memoria, no un ZIP: meter 2 GB
 * de PDFs lo haría imposible de generar y de abrir.
 */
export function pickEmbeddable(
  files: FileMeta[],
  budget = FILE_EMBED_BUDGET,
): { dentro: FileMeta[]; fuera: FileMeta[] } {
  const ordenados = [...files].sort((a, b) => a.size - b.size);
  const dentro: FileMeta[] = [];
  const fuera: FileMeta[] = [];
  let usado = 0;
  for (const file of ordenados) {
    // base64 ocupa ~4/3 del original
    const costo = Math.ceil(file.size * 1.34);
    if (usado + costo <= budget) {
      dentro.push(file);
      usado += costo;
    } else {
      fuera.push(file);
    }
  }
  return { dentro, fuera };
}

/* ========================================================================== */
/*                        Respaldo (base64 ⇄ Blob)                            */
/* ========================================================================== */

/** Blob → base64 sin `data:` (para el respaldo JSON). */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binario = "";
  const trozo = 0x8000; // por bloques: `String.fromCharCode(...bytes)` revienta con archivos grandes
  for (let i = 0; i < bytes.length; i += trozo) {
    binario += String.fromCharCode(...bytes.subarray(i, i + trozo));
  }
  return btoa(binario);
}

/** base64 → Blob, respetando el tipo MIME guardado en los metadatos. */
export function base64ToBlob(base64: string, mime: string): Blob {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: mime || "application/octet-stream" });
}

/** Metadatos válidos a partir de algo que viene de un respaldo. */
export function sanitizeFileMeta(raw: unknown, folderIds: Set<string>): FileMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Partial<FileMeta>;
  if (typeof f.id !== "string" || typeof f.name !== "string" || !f.name.trim()) return null;

  const size = typeof f.size === "number" && Number.isFinite(f.size) && f.size >= 0 ? f.size : 0;
  return {
    id: f.id,
    name: f.name.slice(0, 200),
    mime: typeof f.mime === "string" ? f.mime.slice(0, 120) : "",
    size,
    // una carpeta que no existe en este workspace no debe dejar el archivo invisible
    folderId: typeof f.folderId === "string" && folderIds.has(f.folderId) ? f.folderId : null,
    createdAt: typeof f.createdAt === "number" ? f.createdAt : Date.now(),
  };
}
