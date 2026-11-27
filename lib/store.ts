"use client";

import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import {
  DEFAULT_PLAN,
  fileLimitMb,
  historyLimit,
  isPlanTier,
  isValidLicenseKey,
  normalizeLicenseKey,
  seatLimit,
  storageLimitMb,
  type PlanState,
  type PlanTier,
} from "./plan";
import { proximaDesdeHoy, repeticionValida } from "./repeat";
import { buildSeedPages, SEED_EXPANDED, SEED_MEMBERS, SEED_SELECTED } from "./seed";
import type { PronRule } from "./speech";
import {
  DEFAULT_BAR,
  DEFAULT_POMODORO,
  DEFAULT_READING,
  DEFAULT_TTS,
  type BarPos,
  type Block,
  type CellValue,
  type DbRow,
  type DbView,
  type Database,
  initialsOf,
  type Member,
  type MemberRole,
  type Page,
  type PomodoroDay,
  type PomodoroPrefs,
  type ReadingPrefs,
  type FileMeta,
  type TableData,
  type Theme,
  type TtsPrefs,
  type Repeticion,
} from "./types";
import { base64ToBlob, removeBlob, saveBlob, sanitizeFileMeta } from "./files";
import { sanitizePages } from "./sanitize";
import {
  addVersion,
  loadVersions,
  makeVersion,
  pruneByDays,
  saveVersions,
  sameContent,
  type VersionMap,
} from "./versions";
import { dayKey, descendantsOf, uid } from "./utils";

/** Pedidos de foco entre componentes sin pasar por estado global persistido. */
let focusRequest: { blockId: string; at: "start" | "end" } | null = null;
export const requestBlockFocus = (blockId: string, at: "start" | "end" = "end") => {
  focusRequest = { blockId, at };
};
export const takeBlockFocus = () => {
  const req = focusRequest;
  focusRequest = null;
  return req;
};

export const emptyBlock = (): Block => ({ id: uid("blk"), type: "paragraph", html: "", indent: 0 });

interface State {
  pages: Record<string, Page>;
  selectedId: string;
  /**
   * Miembros del workspace. **Sin tope** con la suscripción activa (que es el
   * estado por defecto): la lista crece tanto como quieras.
   */
  members: Member[];

  /**
   * Suscripción. Arranca activa en el plan desbloqueado, con todos los límites
   * desactivados. Se persiste: si la activás con una licencia, queda guardada.
   */
  plan: PlanState;
  expanded: Record<string, boolean>;
  sidebarOpen: boolean;
  theme: Theme;
  fullWidth: boolean;
  /**
   * Zoom del contenido de la página, en porcentaje (50–200).
   *
   * Se aplica sólo al cuerpo de la página, no a la barra lateral ni a la barra
   * superior: agrandar la letra no tiene por qué agrandar los menús.
   */
  zoom: number;

  /* ---- lectura, voz y productividad (se persisten) ---- */
  tts: TtsPrefs;
  reading: ReadingPrefs;
  pomodoro: PomodoroPrefs;
  /** historial de versiones por página (se persiste aparte: ver `lib/versions.ts`) */
  versions: VersionMap;
  /** metadatos de archivos adjuntos; los bytes viven en IndexedDB (`lib/files.ts`) */
  files: FileMeta[];
  /** historial de sesiones, una entrada por día */
  pomHistory: PomodoroDay[];
  bar: BarPos;
  rules: PronRule[];

  // UI efímera (no se persiste)
  paletteOpen: boolean;
  shareOpen: boolean;
  shortcutsOpen: boolean;
  settingsOpen: boolean;
  trashOpen: boolean;
  peekRowId: string | null;
  historyOpen: boolean;
  mindmapOpen: boolean;
  pasteOpen: boolean;
  /** pestaña con la que abre Configuración (efímero) */
  settingsTab: string | null;

  // ---- navegación / UI
  selectPage: (id: string) => void;
  toggleExpanded: (id: string) => void;
  toggleSidebar: () => void;
  setTheme: (t: Theme) => void;
  toggleFullWidth: () => void;
  /** fija el zoom del contenido (se recorta a 50–200 %) */
  setZoom: (valor: number) => void;
  setUI: (
    patch: Partial<
      Pick<
        State,
        | "paletteOpen"
        | "shareOpen"
        | "shortcutsOpen"
        | "settingsOpen"
        | "trashOpen"
        | "peekRowId"
        | "mindmapOpen"
        | "pasteOpen"
        | "historyOpen"
        | "settingsTab"
      >
    >,
  ) => void;

  // ---- páginas
  createPage: (parentId?: string | null, patch?: Partial<Page>) => string;
  updatePage: (id: string, patch: Partial<Page>) => void;
  /** bloquea o desbloquea una página (protege de ediciones por accidente) */
  toggleLock: (id: string) => void;
  trashPage: (id: string) => void;
  restorePage: (id: string) => void;
  deletePermanently: (id: string) => void;
  emptyTrash: () => void;
  duplicatePage: (id: string) => string;
  toggleFavorite: (id: string) => void;
  movePage: (id: string, newParentId: string | null) => void;
  /**
   * Mueve una página a `parentId` y la deja en la posición `index` entre sus
   * hermanos, renumerando el orden de todos. Es lo que necesita el arrastre del
   * árbol: sin renumerar, dos páginas pueden quedar con el mismo `order` y el
   * orden visual se vuelve impredecible.
   */
  movePageTo: (id: string, parentId: string | null, index: number, space?: "private" | "team") => void;

  // ---- bloques
  setBlocks: (pageId: string, blocks: Block[]) => void;
  patchBlock: (pageId: string, blockId: string, patch: Partial<Block>) => void;
  insertBlock: (pageId: string, afterBlockId: string | null, block: Block) => void;
  /**
   * Inserta varios bloques de una vez (importar o pegar Markdown).
   * Si `replaceId` apunta a un bloque, ése se reemplaza en el lugar: es lo que
   * hace que pegar sobre un bloque vacío se sienta natural.
   */
  insertBlocks: (pageId: string, afterBlockId: string | null, blocks: Block[], replaceId?: string | null) => void;
  /** reemplaza los datos de una tabla */
  setBlockTable: (pageId: string, blockId: string, table: TableData) => void;
  removeBlock: (pageId: string, blockId: string) => void;
  moveBlock: (pageId: string, from: number, to: number) => void;
  indentBlock: (pageId: string, blockId: string, delta: number) => void;

  // ---- base de datos
  patchDatabase: (pageId: string, patch: Partial<Database>) => void;
  setView: (pageId: string, view: DbView) => void;
  addRow: (pageId: string, cells?: Record<string, CellValue>) => string;
  deleteRow: (pageId: string, rowId: string) => void;
  updateCell: (pageId: string, rowId: string, propId: string, value: CellValue) => void;
  /** guarda o quita la repetición de una fila */
  setRowRepeat: (pageId: string, rowId: string, rep: Repeticion | null) => void;
  /** muestra u oculta una propiedad en la vista actual */
  togglePropiedad: (pageId: string, propId: string) => void;
  /** guarda el ancho de una columna de la tabla en la vista actual */
  setAnchoColumna: (pageId: string, propId: string, ancho: number) => void;
  /** devuelve los anchos de la vista actual a los de fábrica */
  resetAnchos: (pageId: string) => void;
  /** completa una fila que se repite: la mueve a su próxima fecha futura */
  avanzarRepeticion: (pageId: string, rowId: string) => void;
  addSelectOption: (pageId: string, propId: string, name: string) => string;
  moveRowToGroup: (pageId: string, rowId: string, groupBy: string, optionId: string) => void;

  // ---- suscripción
  /** activa la suscripción con una clave offline; devuelve el error si no sirve */
  activateLicense: (key: string) => { ok: boolean; error?: string };
  /** cancela la suscripción: baja todo a las capacidades del plan Gratis */
  deactivatePlan: () => void;
  /** cambia el plan mientras la suscripción está activa */
  setPlanTier: (tier: PlanTier) => void;

  // ---- miembros
  /** agrega un miembro; devuelve el error si el correo es inválido o repetido */
  inviteMember: (input: { email: string; name?: string; role?: MemberRole }) => { ok: boolean; error?: string };
  setMemberRole: (id: string, role: MemberRole) => void;
  removeMember: (id: string) => void;

  // ---- lectura / voz / productividad
  setTts: (patch: Partial<TtsPrefs>) => void;
  setReading: (patch: Partial<ReadingPrefs>) => void;
  savePosition: (pageId: string, y: number) => void;
  setPomodoro: (patch: Partial<PomodoroPrefs>) => void;

  /* ---------------------------- carpetas y archivos ---------------------- */
  /** crea una carpeta (página sin cuerpo) dentro de `parentId` */
  createFolder: (parentId?: string | null, title?: string) => string;
  /** guarda un archivo en IndexedDB y sus metadatos en el workspace */
  addFile: (file: File, folderId: string | null) => Promise<AddFileResult>;
  renameFile: (id: string, name: string) => void;
  moveFile: (id: string, folderId: string | null) => void;
  deleteFile: (id: string) => Promise<void>;

  /* --------------------------- historial de versiones --------------------- */
  /** guarda una foto de la página si cambió desde la última; devuelve si guardó */
  captureVersion: (pageId: string) => boolean;
  /** vuelve a una versión anterior, dejando antes una copia del estado actual */
  restoreVersion: (pageId: string, versionId: string) => boolean;
  deleteVersion: (pageId: string, versionId: string) => void;
  clearVersions: (pageId?: string) => void;
  /** carga el historial guardado (se llama una vez, al montar la app) */
  hydrateVersions: () => void;
  logPomodoro: (kind: "work" | "rest", seconds: number) => void;
  resetPomodoroStats: () => void;
  setBar: (patch: Partial<BarPos>) => void;
  addRule: (from: string, to: string) => void;
  removeRule: (id: string) => void;

  /** reemplaza el workspace por un respaldo validado */
  restoreBackup: (data: BackupPayload) => boolean;
  resetWorkspace: () => void;
}

export interface AddFileResult {
  ok: boolean;
  error?: string;
  file?: FileMeta;
}

/** Forma del respaldo JSON que se exporta/importa desde Configuración. */
export interface BackupPayload {
  version: number;
  exportedAt: string;
  pages?: Record<string, Page>;
  /**
   * Miembros del workspace. Viajan en el respaldo para que restaurarlo no te
   * borre el equipo. La suscripción **no** viaja a propósito: la licencia es de
   * este equipo, no del archivo.
   */
  members?: Member[];
  selectedId?: string;
  expanded?: Record<string, boolean>;
  theme?: Theme;
  tts?: TtsPrefs;
  reading?: ReadingPrefs;
  pomodoro?: PomodoroPrefs;
  pomHistory?: PomodoroDay[];
  /** metadatos de archivos adjuntos */
  files?: FileMeta[];
  /**
   * Contenido de los adjuntos en base64, sólo para los que entran en el
   * presupuesto de exportación (`FILE_EMBED_BUDGET`). El resto viaja como
   * metadato y se avisa al usuario: un PDF de 300 MB no puede ir en un JSON.
   */
  fileBlobs?: { id: string; mime: string; data: string }[];
  bar?: BarPos;
  rules?: PronRule[];
}

const now = () => Date.now();

const withPage = (state: State, id: string, fn: (p: Page) => Page): Partial<State> => {
  const page = state.pages[id];
  if (!page) return {};
  return { pages: { ...state.pages, [id]: { ...fn(page), updatedAt: now() } } };
};

/**
 * Aplica la retención del plan **vigente** al historial en memoria.
 *
 * Sin esto, un cambio de plan se quedaba en el cartel: al bajar de Business (90
 * días) a Gratis (7) la ventana del historial seguía mostrando versiones de
 * hace tres meses, contradiciendo su propio encabezado, hasta que la siguiente
 * captura las podara de rebote.
 */
function retentionFor(versions: VersionMap, plan: PlanState): VersionMap {
  const map = pruneByDays(versions, historyLimit(plan));
  saveVersions(map);
  return map;
}

/**
 * Almacenamiento con escritura diferida.
 *
 * `persist` escribe el workspace completo en `localStorage` en **cada** cambio de
 * estado, y `localStorage` es síncrono. Medido con un workspace de 279 KB:
 * teclear 20 letras producía 40 escrituras (11 MB serializados, 126 ms de hilo
 * principal bloqueado). Con un workspace realista el editor se siente pegajoso y
 * en el `.exe` es peor.
 *
 * Esto agrupa las escrituras en una sola cada `delay` ms. El riesgo de perder lo
 * último que se escribió se acota vaciando la cola al cerrar, recargar o pasar
 * la pestaña a segundo plano, que son los tres momentos en que el usuario puede
 * abandonar la app.
 */
function deferredStorage(delay = 250): StateStorage {
  let pendiente: { key: string; value: string } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const vaciar = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!pendiente) return;
    const { key, value } = pendiente;
    pendiente = null;
    try {
      localStorage.setItem(key, value);
    } catch {
      // cuota llena: no hay nada que hacer desde acá, y romper el guardado
      // entero por eso sería peor
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", vaciar);
    window.addEventListener("beforeunload", vaciar);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") vaciar();
    });
  }

  return {
    getItem: (key) => {
      // una lectura siempre ve lo último: si hay cola, primero se asienta
      vaciar();
      return localStorage.getItem(key);
    },
    setItem: (key, value) => {
      pendiente = { key, value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(vaciar, delay);
    },
    removeItem: (key) => {
      pendiente = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      localStorage.removeItem(key);
    },
  };
}

/** 50 % a 200 %, en pasos de 5: por debajo no se lee y por encima no entra nada */
export function clampZoom(valor: number): number {
  if (!Number.isFinite(valor)) return 100;
  return Math.min(200, Math.max(50, Math.round(valor / 5) * 5));
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      pages: buildSeedPages(),
      selectedId: SEED_SELECTED,
      members: SEED_MEMBERS,
      plan: DEFAULT_PLAN,
      expanded: { ...SEED_EXPANDED },
      sidebarOpen: true,
      theme: "light",
      fullWidth: false,
      zoom: 100,

      tts: { ...DEFAULT_TTS },
      reading: { ...DEFAULT_READING, positions: {} },
      pomodoro: { ...DEFAULT_POMODORO },
      versions: {},
      files: [],
      pomHistory: [],
      bar: { ...DEFAULT_BAR },
      rules: [],

      paletteOpen: false,
      shareOpen: false,
      shortcutsOpen: false,
      settingsOpen: false,
      trashOpen: false,
      peekRowId: null,
      historyOpen: false,
      mindmapOpen: false,
      pasteOpen: false,
      settingsTab: null,

      /* ----------------------------- navegación ----------------------------- */
      selectPage: (id) => {
        // Un id que ya no existe (página borrada, `selectedId` de un respaldo
        // ajeno) dejaba `selectedId` apuntando al vacío: el área de la página en
        // blanco y cualquier render posterior leyendo propiedades de `undefined`.
        if (!get().pages[id]) return;
        set({ selectedId: id, peekRowId: null });
      },
      toggleExpanded: (id) =>
        set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } })),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setTheme: (theme) => set({ theme }),
      toggleFullWidth: () => set((s) => ({ fullWidth: !s.fullWidth })),
      setZoom: (valor) => set(() => ({ zoom: clampZoom(valor) })),
      setUI: (patch) => {
        /**
         * Un `null` colado dejaba el estado del store en `null` y con él caía
         * toda la app (error de React sin mensaje útil). Ningún overlay necesita
         * "cerrar todo" con null: se ignora cualquier cosa que no sea objeto.
         */
        if (!patch || typeof patch !== "object") return;
        set(patch as Partial<State>);
      },

      /* ------------------------------ páginas ------------------------------- */
      createPage: (parentId = null, patch = {}) => {
        const s = get();
        const siblings = Object.values(s.pages).filter((p) => p.parentId === parentId && !p.trashed);
        const id = uid("pg");
        const first = emptyBlock();
        const page: Page = {
          id,
          title: "",
          icon: null,
          cover: null,
          parentId,
          order: siblings.length,
          space: parentId ? s.pages[parentId]?.space ?? "private" : "private",
          blocks: [first],
          database: null,
          favorite: false,
          trashed: false,
          createdAt: now(),
          updatedAt: now(),
          ...patch,
        };
        // el patch puede traer basura (respaldo ajeno, llamada equivocada)
        if (typeof page.title !== "string") page.title = "";
        if (typeof page.icon !== "string" && page.icon !== null) page.icon = null;
        if (page.isFolder !== undefined && typeof page.isFolder !== "boolean") delete page.isFolder;
        set({
          pages: { ...s.pages, [id]: page },
          selectedId: id,
          expanded: parentId ? { ...s.expanded, [parentId]: true } : s.expanded,
        });
        requestBlockFocus(first.id, "end");
        return id;
      },

      toggleLock: (id) =>
        set((s) => {
          const page = s.pages[id];
          if (!page) return {};
          return withPage(s, id, (p) => ({ ...p, locked: !p.locked }));
        }),

      updatePage: (id, patch) =>
        set((s) =>
          withPage(s, id, (p) => {
            const next = { ...p, ...patch } as Page;
            // un título que no sea texto (basura, respaldo ajeno) rompía la
            // lectura en voz alta y las exportaciones, que hacen `title.trim()`
            if (typeof next.title !== "string") next.title = p.title ?? "";
            if (typeof next.icon !== "string" && next.icon !== null) next.icon = p.icon ?? null;
            if (next.isFolder !== undefined && typeof next.isFolder !== "boolean") {
              next.isFolder = p.isFolder;
            }
            return next;
          }),
        ),

      trashPage: (id) =>
        set((s) => {
          const ids = [id, ...descendantsOf(s.pages, id)];
          const pages = { ...s.pages };
          for (const pid of ids) if (pages[pid]) pages[pid] = { ...pages[pid], trashed: true, updatedAt: now() };
          // si la página seleccionada se fue a la papelera, navegamos al inicio
          const selectedId = ids.includes(s.selectedId)
            ? Object.values(pages).find((p) => !p.trashed && p.parentId === null)?.id ?? s.selectedId
            : s.selectedId;
          return { pages, selectedId };
        }),

      restorePage: (id) =>
        set((s) => {
          const pages = { ...s.pages };
          const ids = new Set([id, ...descendantsOf(s.pages, id)]);

          /**
           * Subir por la cadena de padres.
           *
           * La papelera lista cada página por separado, así que se puede
           * restaurar una subpágina cuyo padre sigue eliminado: quedaría
           * restaurada pero invisible en la barra. Se reviven los ancestros y se
           * despliegan para que la página aparezca donde corresponde.
           */
          const expanded = { ...s.expanded };
          let parentId = pages[id]?.parentId ?? null;
          const visto = new Set<string>();
          while (parentId && pages[parentId] && !visto.has(parentId)) {
            visto.add(parentId);
            ids.add(parentId);
            expanded[parentId] = true;
            parentId = pages[parentId].parentId;
          }

          for (const pid of ids) if (pages[pid]) pages[pid] = { ...pages[pid], trashed: false, updatedAt: now() };
          return { pages, expanded };
        }),

      deletePermanently: (id) =>
        set((s) => {
          const ids = [id, ...descendantsOf(s.pages, id)];
          const pages = { ...s.pages };
          for (const pid of ids) delete pages[pid];
          const selectedId = ids.includes(s.selectedId)
            ? Object.values(pages).find((p) => !p.trashed && p.parentId === null)?.id ?? Object.keys(pages)[0]
            : s.selectedId;
          return { pages, selectedId };
        }),

      emptyTrash: () =>
        set((s) => {
          const pages = { ...s.pages };
          const borradas: string[] = [];
          for (const [pid, p] of Object.entries(pages)) {
            if (!p.trashed) continue;
            delete pages[pid];
            borradas.push(pid);
          }
          if (!borradas.length) return { pages };

          // el historial de una página que ya no existe no se puede alcanzar:
          // ocupaba presupuesto del historial sin que nadie pudiera verlo
          const versions = { ...s.versions };
          for (const pid of borradas) delete versions[pid];
          saveVersions(versions);

          // los punteros a páginas muertas también se van: sin esto quedaban
          // claves en `expanded` y en las posiciones de lectura que crecían con
          // cada página borrada y se guardaban para siempre
          const expanded = { ...s.expanded };
          for (const pid of borradas) delete expanded[pid];

          const positions = { ...s.reading.positions };
          for (const pid of borradas) delete positions[pid];

          // los archivos de una carpeta borrada no quedan colgando: se sueltan
          // sus metadatos y, detrás, sus bytes de IndexedDB
          const huerfanos = s.files.filter((f) => f.folderId && borradas.includes(f.folderId));
          for (const f of huerfanos) void removeBlob(f.id);
          const files = huerfanos.length
            ? s.files.filter((f) => !borradas.includes(f.folderId ?? ""))
            : s.files;

          return { pages, versions, expanded, files, reading: { ...s.reading, positions } };
        }),

      duplicatePage: (id) => {
        const s = get();
        const src = s.pages[id];
        if (!src) return id;
        const newId = uid("pg");
        const copy: Page = {
          ...structuredClone(src),
          id: newId,
          title: src.title ? `${src.title} (copia)` : "",
          order: Object.values(s.pages).filter((p) => p.parentId === src.parentId).length,
          favorite: false,
          trashed: false,
          createdAt: now(),
          updatedAt: now(),
        };
        // re-identificamos bloques y filas para no compartir ids con el original
        copy.blocks = copy.blocks.map((blk) => ({ ...blk, id: uid("blk") }));
        if (copy.database) {
          copy.database.rows = copy.database.rows.map((r) => ({ ...r, id: uid("row") }));
        }
        set({ pages: { ...s.pages, [newId]: copy }, selectedId: newId });
        return newId;
      },

      toggleFavorite: (id) => set((s) => withPage(s, id, (p) => ({ ...p, favorite: !p.favorite }))),

      movePage: (id, newParentId) =>
        set((s) => {
          if (id === newParentId) return {};
          // no podés mover una página dentro de su propio descendiente
          if (newParentId && descendantsOf(s.pages, id).includes(newParentId)) return {};
          return withPage(s, id, (p) => ({
            ...p,
            parentId: newParentId,
            order: Object.values(s.pages).filter((x) => x.parentId === newParentId).length,
          }));
        }),

      movePageTo: (id, parentId, index, space) =>
        set((s) => {
          if (id === parentId) return {};
          const page = s.pages[id];
          if (!page) return {};
          // mover una página dentro de su propio subárbol la deja inalcanzable
          if (parentId && (parentId === id || descendantsOf(s.pages, id).includes(parentId))) return {};

          const hermanos = Object.values(s.pages)
            .filter((p) => p.parentId === parentId && p.id !== id && !p.trashed)
            .sort((a, b) => a.order - b.order)
            .map((p) => p.id);
          const corte = Math.max(0, Math.min(Number.isFinite(index) ? index : hermanos.length, hermanos.length));
          const orden = [...hermanos.slice(0, corte), id, ...hermanos.slice(corte)];

          const espacio = parentId ? s.pages[parentId]?.space ?? page.space : space ?? page.space;
          const pages = { ...s.pages };
          orden.forEach((pid, i) => {
            const actual = pages[pid];
            if (!actual) return;
            pages[pid] =
              pid === id
                ? { ...actual, parentId, order: i, space: espacio, updatedAt: Date.now() }
                : { ...actual, order: i };
          });
          // las páginas hijas acompañan a la que se mueve (su parentId no cambia)
          return { pages };
        }),

      /* ------------------------------ bloques ------------------------------- */
      setBlocks: (pageId, blocks) => set((s) => withPage(s, pageId, (p) => ({ ...p, blocks }))),

      patchBlock: (pageId, blockId, patch) =>
        set((s) =>
          withPage(s, pageId, (p) => ({
            ...p,
            blocks: p.blocks.map((blk) => (blk.id === blockId ? { ...blk, ...patch } : blk)),
          })),
        ),

      insertBlock: (pageId, afterBlockId, block) =>
        set((s) =>
          withPage(s, pageId, (p) => {
            const idx = afterBlockId ? p.blocks.findIndex((x) => x.id === afterBlockId) : p.blocks.length - 1;
            const at = idx < 0 ? p.blocks.length : idx + 1;
            const blocks = [...p.blocks];
            blocks.splice(at, 0, block);
            return { ...p, blocks };
          }),
        ),

      insertBlocks: (pageId, afterBlockId, incoming, replaceId = null) =>
        set((s) =>
          withPage(s, pageId, (p) => {
            if (!incoming.length) return p;
            const blocks = [...p.blocks];

            // reemplazo en el lugar: pegar sobre un bloque vacío no deja un hueco
            if (replaceId) {
              const at = blocks.findIndex((x) => x.id === replaceId);
              if (at >= 0) {
                blocks.splice(at, 1, ...incoming);
                return { ...p, blocks };
              }
            }

            const idx = afterBlockId ? blocks.findIndex((x) => x.id === afterBlockId) : blocks.length - 1;
            const at = idx < 0 ? blocks.length : idx + 1;
            blocks.splice(at, 0, ...incoming);
            return { ...p, blocks };
          }),
        ),

      setBlockTable: (pageId, blockId, table) =>
        set((s) =>
          withPage(s, pageId, (p) => ({
            ...p,
            blocks: p.blocks.map((b) => (b.id === blockId ? { ...b, type: "table", table } : b)),
          })),
        ),

      /* ---------------------------- suscripción ---------------------------- */
      activateLicense: (key) => {
        // un `null` llegaba hasta `normalizeLicenseKey` y reventaba con
        // "Cannot read properties of null (reading 'toUpperCase')"
        if (typeof key !== "string") {
          return { ok: false, error: "Pegá la clave de licencia completa." };
        }
        if (!isValidLicenseKey(key)) {
          return { ok: false, error: "La clave no es válida. Revisá que esté completa." };
        }
        const plan: PlanState = {
          tier: "business",
          active: true,
          since: new Date().toISOString(),
          license: normalizeLicenseKey(key),
        };
        set((s) => ({ plan, versions: retentionFor(s.versions, plan) }));
        return { ok: true };
      },

      deactivatePlan: () =>
        set((s) => {
          const plan: PlanState = { ...s.plan, active: false, license: null };
          return { plan, versions: retentionFor(s.versions, plan) };
        }),

      setPlanTier: (tier) =>
        set((s) => {
          if (!isPlanTier(tier)) return {};
          const plan: PlanState = { ...s.plan, tier };
          return { plan, versions: retentionFor(s.versions, plan) };
        }),

      /* ------------------------------ miembros ------------------------------ */
      inviteMember: (input) => {
        const { email, name, role = "editor" } = input ?? {};
        if (typeof email !== "string") {
          return { ok: false, error: "Escribí un correo para invitar." };
        }
        const clean = email.trim().toLowerCase();

        // Validación deliberadamente laxa: el workspace es local, no envía correos.
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) {
          return { ok: false, error: "Ese correo no parece válido." };
        }

        const current = get().members;
        if (current.some((m) => m.email.toLowerCase() === clean)) {
          return { ok: false, error: "Ese correo ya está en el workspace." };
        }

        // Con la suscripción activa `seatLimit` es null → no hay techo.
        const limit = seatLimit(get().plan);
        if (limit !== null && current.length >= limit) {
          return {
            ok: false,
            error: `El plan actual permite ${limit} miembros. Activá la suscripción para invitar sin límite.`,
          };
        }

        const display = (name ?? "").trim() || clean.split("@")[0].replace(/[._-]+/g, " ");
        const colors: Member["color"][] = ["blue", "green", "purple", "orange", "pink", "yellow", "red", "brown"];
        const member: Member = {
          id: uid("mem"),
          name: display.replace(/\b\w/g, (c) => c.toUpperCase()),
          email: clean,
          initials: initialsOf(display),
          color: colors[current.length % colors.length],
          role,
          joinedAt: new Date().toISOString(),
          pending: true,
        };

        set({ members: [...current, member] });
        return { ok: true };
      },

      setMemberRole: (id, role) =>
        set((s) => ({
          members: s.members.map((m) => (m.id === id ? { ...m, role } : m)),
        })),

      removeMember: (id) =>
        set((s) => {
          const target = s.members.find((m) => m.id === id);
          // el propietario no se puede sacar: quedaría un workspace sin dueño
          if (!target || target.role === "owner") return {};
          return { members: s.members.filter((m) => m.id !== id) };
        }),

      removeBlock: (pageId, blockId) =>
        set((s) =>
          withPage(s, pageId, (p) => {
            const blocks = p.blocks.filter((x) => x.id !== blockId);
            return { ...p, blocks: blocks.length ? blocks : [emptyBlock()] };
          }),
        ),

      moveBlock: (pageId, from, to) =>
        set((s) =>
          withPage(s, pageId, (p) => {
            if (from === to || from < 0 || to < 0 || from >= p.blocks.length) return p;
            const blocks = [...p.blocks];
            const [moved] = blocks.splice(from, 1);
            blocks.splice(to > from ? to - 1 : to, 0, moved);
            return { ...p, blocks };
          }),
        ),

      indentBlock: (pageId, blockId, delta) =>
        set((s) =>
          withPage(s, pageId, (p) => ({
            ...p,
            blocks: p.blocks.map((blk) =>
              blk.id === blockId
                ? { ...blk, indent: Math.max(0, Math.min(4, (blk.indent ?? 0) + delta)) }
                : blk,
            ),
          })),
        ),

      /* --------------------------- base de datos ---------------------------- */
      patchDatabase: (pageId, patch) =>
        set((s) =>
          withPage(s, pageId, (p) => (p.database ? { ...p, database: { ...p.database, ...patch } } : p)),
        ),

      setView: (pageId, view) =>
        set((s) =>
          withPage(s, pageId, (p) => {
            const db = p.database;
            if (!db || db.view === view) return p;
            // se guarda la configuración de la vista que se deja y se restaura la
            // de la que se abre: así filtrar la tabla no toca el board
            const guardadas: Database["viewConfig"] = {
              ...(db.viewConfig ?? {}),
              [db.view]: {
                filter: db.filter ?? null,
                sorts: db.sorts,
                groupBy: db.groupBy,
                ocultas: db.ocultas ?? [],
                anchos: db.anchos ?? {},
              },
            };
            const destino = guardadas[view];
            return {
              ...p,
              database: {
                ...db,
                view,
                filter: destino?.filter ?? null,
                sorts: destino?.sorts ?? [],
                groupBy: destino?.groupBy ?? db.groupBy,
                ocultas: destino?.ocultas ?? [],
                anchos: destino?.anchos ?? {},
                viewConfig: guardadas,
              },
            };
          }),
        ),

      togglePropiedad: (pageId, propId) =>
        set((s) =>
          withPage(s, pageId, (p) => {
            const db = p.database;
            if (!db) return p;
            const ocultas = db.ocultas ?? [];
            // el título no se puede ocultar: una tabla sin título no se entiende
            const prop = db.properties.find((x) => x.id === propId);
            if (!prop || prop.type === "title") return p;
            const siguiente = ocultas.includes(propId)
              ? ocultas.filter((id) => id !== propId)
              : [...ocultas, propId];
            return { ...p, database: { ...db, ocultas: siguiente } };
          }),
        ),

      setAnchoColumna: (pageId, propId, ancho) =>
        set((s) =>
          withPage(s, pageId, (p) => {
            const db = p.database;
            if (!db) return p;
            const limpio = Math.min(560, Math.max(80, Math.round(ancho)));
            return { ...p, database: { ...db, anchos: { ...(db.anchos ?? {}), [propId]: limpio } } };
          }),
        ),

      resetAnchos: (pageId) =>
        set((s) =>
          withPage(s, pageId, (p) => (p.database ? { ...p, database: { ...p.database, anchos: {} } } : p)),
        ),

      setRowRepeat: (pageId, rowId, rep) =>
        set((s) =>
          withPage(s, pageId, (p) => {
            if (!p.database) return p;
            return {
              ...p,
              database: {
                ...p.database,
                rows: p.database.rows.map((r) =>
                  r.id === rowId ? { ...r, repeat: rep ? repeticionValida(rep) ?? undefined : undefined } : r,
                ),
              },
            };
          }),
        ),

      avanzarRepeticion: (pageId, rowId) =>
        set((s) =>
          withPage(s, pageId, (p) => {
            const db = p.database;
            const row = db?.rows.find((r) => r.id === rowId);
            if (!db || !row?.repeat) return p;
            const rep = repeticionValida(row.repeat);
            if (!rep) return p;
            // la fecha de la fila puede estar en cualquier propiedad de tipo fecha
            const prop = db.properties.find((x) => x.type === "date" && row.cells[x.id]);
            const actual = prop ? Date.parse(String(row.cells[prop.id])) : NaN;
            if (!prop || !Number.isFinite(actual)) return p;
            const proxima = proximaDesdeHoy(actual, rep, Date.now());
            const clave = new Date(proxima).toISOString().slice(0, 10);
            return {
              ...p,
              database: {
                ...db,
                rows: db.rows.map((r) =>
                  r.id === rowId ? { ...r, cells: { ...r.cells, [prop.id]: clave } } : r,
                ),
              },
            };
          }),
        ),

      addRow: (pageId, cells = {}) => {
        const s = get();
        const page = s.pages[pageId];
        if (!page?.database) return "";
        const row: DbRow = { id: uid("row"), cells, createdAt: now() };
        set(
          withPage(s, pageId, (p) => ({
            ...p,
            database: { ...p.database!, rows: [...p.database!.rows, row] },
          })),
        );
        return row.id;
      },

      deleteRow: (pageId, rowId) =>
        set((s) =>
          withPage(s, pageId, (p) =>
            p.database
              ? { ...p, database: { ...p.database, rows: p.database.rows.filter((r) => r.id !== rowId) } }
              : p,
          ),
        ),

      updateCell: (pageId, rowId, propId, value) =>
        set((s) =>
          withPage(s, pageId, (p) =>
            p.database
              ? {
                  ...p,
                  database: {
                    ...p.database,
                    rows: p.database.rows.map((r) =>
                      r.id === rowId ? { ...r, cells: { ...r.cells, [propId]: value } } : r,
                    ),
                  },
                }
              : p,
          ),
        ),

      addSelectOption: (pageId, propId, name) => {
        const s = get();
        const page = s.pages[pageId];
        const prop = page?.database?.properties.find((x) => x.id === propId);
        const palette = ["blue", "green", "orange", "purple", "pink", "yellow", "red", "brown", "gray"] as const;
        const id = uid("opt");
        const color = palette[(prop?.options?.length ?? 0) % palette.length];
        if (page?.database) {
          set(
            withPage(s, pageId, (p) => ({
              ...p,
              database: {
                ...p.database!,
                properties: p.database!.properties.map((pr) =>
                  pr.id === propId
                    ? { ...pr, options: [...(pr.options ?? []), { id, name, color }] }
                    : pr,
                ),
              },
            })),
          );
        }
        return id;
      },

      moveRowToGroup: (pageId, rowId, groupBy, optionId) =>
        set((s) => {
          const page = s.pages[pageId];
          if (!page?.database) return {};
          return withPage(s, pageId, (p) => ({
            ...p,
            database: {
              ...p.database!,
              rows: p.database!.rows.map((r) =>
                r.id === rowId ? { ...r, cells: { ...r.cells, [groupBy]: optionId } } : r,
              ),
            },
          }));
        }),

      setTts: (patch) => set((s) => ({ tts: { ...s.tts, ...patch } })),

      setReading: (patch) => set((s) => ({ reading: { ...s.reading, ...patch } })),

      savePosition: (pageId, y) =>
        set((s) => {
          if (!s.reading.remember) return {};
          const rounded = Math.max(0, Math.round(y));
          // evitar escrituras (y renders) cuando el scroll no cambió de verdad
          if (s.reading.positions[pageId] === rounded) return {};
          return { reading: { ...s.reading, positions: { ...s.reading.positions, [pageId]: rounded } } };
        }),

      setPomodoro: (patch) => set((s) => ({ pomodoro: { ...s.pomodoro, ...patch } })),

      /* ---------------------------- carpetas y archivos -------------------- */
      createFolder: (parentId = null, title = "Carpeta") => {
        const id = get().createPage(parentId, {
          // un `null` explícito no lo cubre el valor por defecto y dejaba una
          // carpeta sin título, que rompía la lectura en voz alta (title.trim())
          title: typeof title === "string" && title.trim() ? title : "Carpeta",
          icon: "📁",
          isFolder: true,
          // una carpeta no tiene cuerpo: sus hijos viven en el árbol
          blocks: [],
        });
        // la carpeta nueva y su padre quedan abiertos: si no, sus archivos
        // existen pero no se ven en el árbol hasta expandir a mano
        set((s) => ({
          expanded: {
            ...s.expanded,
            [id]: true,
            ...(parentId ? { [parentId]: true } : {}),
          },
        }));
        return id;
      },

      addFile: async (file, folderId) => {
        // la basura entra por acá desde un `<input type="file">` vacío, un
        // arrastre roto o el fuzz: sin esto, `file.size` tumbaba la app entera
        if (!file || typeof file.size !== "number") {
          return { ok: false, error: "No se recibió ningún archivo." };
        }
        const { plan, files } = get();

        // Topes por plan, los mismos ejes que Notion: 5 MB por archivo en Gratis,
        // 5 GB desde Pro. Se avisa antes de tocar IndexedDB.
        const porArchivo = fileLimitMb(plan);
        if (file.size > porArchivo * 1024 * 1024) {
          return {
            ok: false,
            error: `Ese archivo pasa el tope de ${porArchivo} MB por archivo de tu plan.`,
          };
        }
        const total = storageLimitMb(plan);
        const usado = files.reduce((n, f) => n + f.size, 0);
        if (total !== null && usado + file.size > total * 1024 * 1024) {
          return { ok: false, error: `Tu plan guarda hasta ${total} MB de archivos en total.` };
        }

        const meta: FileMeta = {
          id: uid("file"),
          name: (file.name || "archivo").slice(0, 200),
          mime: file.type || "",
          size: file.size,
          folderId,
          createdAt: now(),
        };

        const guardado = await saveBlob(meta.id, file);
        if (!guardado.ok) {
          // sin IndexedDB no hay adjuntos, pero el workspace sigue entero
          return { ok: false, error: guardado.error };
        }

        set((s) => ({ files: [...s.files, meta] }));
        return { ok: true, file: meta };
      },

      renameFile: (id, name) =>
        set((s) => ({
          files: s.files.map((f) => {
            if (f.id !== id) return f;
            const limpio = typeof name === "string" ? name.trim().slice(0, 200) : "";
            return limpio ? { ...f, name: limpio } : f;
          }),
        })),

      moveFile: (id, folderId) =>
        set((s) => {
          // mover a una carpeta que no existe dejaría el archivo sin lugar donde
          // aparecer: se ignora ese destino
          if (folderId && !s.pages[folderId]) return {};
          return { files: s.files.map((f) => (f.id === id ? { ...f, folderId } : f)) };
        }),

      deleteFile: async (id) => {
        set((s) => ({ files: s.files.filter((f) => f.id !== id) }));
        // el blob se va detrás; si falla, el metadato ya no está y el archivo es
        // inalcanzable, así que no hay nada peor que dejar
        await removeBlob(id);
      },

      /* --------------------------- historial de versiones ------------------- */
      hydrateVersions: () => set((s) => ({ versions: retentionFor(loadVersions(), s.plan) })),

      captureVersion: (pageId) => {
        const { pages, versions, plan } = get();
        const page = pages[pageId];
        if (!page || page.trashed) return false;

        // nada cambió desde la última foto: no se guardan duplicados
        const list = versions[pageId] ?? [];
        if (list.length && sameContent(list[0], page.title, page.blocks)) return false;

        const next = addVersion(
          versions,
          pageId,
          makeVersion(page.title, page.blocks),
          historyLimit(plan),
        );
        set({ versions: next });
        saveVersions(next);
        return true;
      },

      restoreVersion: (pageId, versionId) => {
        const { pages, versions, plan } = get();
        const page = pages[pageId];
        const version = (versions[pageId] ?? []).find((v) => v.id === versionId);
        if (!page || !version) return false;

        // restaurar también es reversible: primero se guarda cómo estaba
        let next = versions;
        if (!(versions[pageId] ?? []).some((v) => sameContent(v, page.title, page.blocks))) {
          next = addVersion(versions, pageId, makeVersion(page.title, page.blocks), historyLimit(plan));
        }

        const restaurada = {
          ...page,
          title: version.title,
          blocks: structuredClone(version.blocks),
          updatedAt: now(),
        };
        const map = pruneByDays(next, historyLimit(plan));
        set({ pages: { ...pages, [pageId]: restaurada }, versions: map });
        saveVersions(map);
        return true;
      },

      deleteVersion: (pageId, versionId) => {
        const { versions } = get();
        const resto = (versions[pageId] ?? []).filter((v) => v.id !== versionId);
        const map = { ...versions };
        if (resto.length) map[pageId] = resto;
        else delete map[pageId];
        set({ versions: map });
        saveVersions(map);
      },

      clearVersions: (pageId) => {
        const { versions } = get();
        const map = pageId ? { ...versions } : {};
        if (pageId) delete map[pageId];
        set({ versions: map });
        saveVersions(map);
      },

      logPomodoro: (kind, seconds) =>
        set((s) => {
          const key = dayKey();
          const history = [...s.pomHistory];
          const idx = history.findIndex((d) => d.date === key);
          const day: PomodoroDay =
            idx >= 0
              ? {
                  ...history[idx],
                  sessions: history[idx].sessions + (kind === "work" ? 1 : 0),
                  focusSeconds: history[idx].focusSeconds + (kind === "work" ? seconds : 0),
                }
              : { date: key, sessions: kind === "work" ? 1 : 0, focusSeconds: kind === "work" ? seconds : 0 };
          if (idx >= 0) history[idx] = day;
          else history.push(day);
          // Con la suscripción activa el historial es ilimitado; sin ella se
          // conservan los últimos días del plan Gratis. (Antes eran 60 fijos.)
          const limit = historyLimit(get().plan);
          return { pomHistory: limit === null ? history : history.slice(-limit) };
        }),

      resetPomodoroStats: () => set({ pomHistory: [] }),

      setBar: (patch) => set((s) => ({ bar: { ...s.bar, ...patch } })),

      addRule: (from, to) =>
        set((s) => {
          if (typeof from !== "string" || typeof to !== "string") return {};
          const clean = from.trim();
          if (!clean) return {};
          if (s.rules.some((r) => r.from.toLowerCase() === clean.toLowerCase())) return {};
          return { rules: [...s.rules, { id: uid("rule"), from: clean, to: to.trim() }] };
        }),

      removeRule: (id) => set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),

      restoreBackup: (data) => {
        // validación mínima: un respaldo roto no debe dejar el workspace vacío
        if (!data || typeof data !== "object") return false;
        if (!data.pages || typeof data.pages !== "object") return false;
        const pages = Object.values(data.pages);
        if (!pages.length) return false;
        if (!pages.every((p) => p && typeof p.id === "string" && Array.isArray(p.blocks))) return false;

        // Un respaldo es un archivo que puede venir de cualquier lado: se sanea
        // todo el HTML antes de guardarlo (ver `lib/sanitize.ts`).
        const safePages = sanitizePages(data.pages);

        /**
         * El historial de las páginas que no vienen en el respaldo deja de ser
         * alcanzable. Se conserva el de las páginas que sí están (restaurar un
         * respaldo del mismo workspace no debe costarte las versiones) y se
         * suelta el resto.
         */
        const vivas = new Set(Object.keys(safePages));

        // adjuntos: los metadatos entran al instante; los bytes se escriben en
        // IndexedDB en segundo plano (es asíncrono y el respaldo no debe esperar)
        const files = Array.isArray(data.files)
          ? data.files
              .map((f) => sanitizeFileMeta(f, vivas))
              .filter((f): f is FileMeta => !!f)
          : [];
        if (Array.isArray(data.fileBlobs)) {
          for (const trozo of data.fileBlobs) {
            if (!trozo || typeof trozo.data !== "string") continue;
            if (!files.some((f) => f.id === trozo.id)) continue;
            void saveBlob(trozo.id, base64ToBlob(trozo.data, trozo.mime ?? ""));
          }
        }
        const versions: VersionMap = {};
        for (const [pageId, lista] of Object.entries(get().versions)) {
          if (vivas.has(pageId)) versions[pageId] = lista;
        }
        saveVersions(versions);

        const selectedId =
          data.selectedId && data.pages[data.selectedId] ? data.selectedId : pages[0].id;
        set({
          pages: safePages,
          selectedId,
          expanded: data.expanded && typeof data.expanded === "object" ? data.expanded : {},
          theme: data.theme === "dark" ? "dark" : "light",
          tts: { ...DEFAULT_TTS, ...(data.tts ?? {}) },
          reading: { ...DEFAULT_READING, ...(data.reading ?? {}), positions: data.reading?.positions ?? {} },
          pomodoro: { ...DEFAULT_POMODORO, ...(data.pomodoro ?? {}) },
          pomHistory: Array.isArray(data.pomHistory) ? data.pomHistory : [],
          bar: { ...DEFAULT_BAR, ...(data.bar ?? {}) },
          rules: Array.isArray(data.rules) ? data.rules : [],
          // un respaldo viejo no trae miembros: en ese caso se conservan los
          // actuales en lugar de vaciar la lista
          members: Array.isArray(data.members)
            ? data.members.filter(
                (m): m is Member =>
                  !!m && typeof m.id === "string" && typeof m.name === "string",
              )
            : get().members,
          versions,
          files,
        });
        return true;
      },

      resetWorkspace: () => {
        // el historial de las páginas que se van no debe sobrevivir al reinicio:
        // quedaría ocupando sitio sin forma de verlo ni borrarlo
        saveVersions({});
        // y los archivos adjuntos tampoco: sus metadatos se van y los bytes de
        // IndexedDB se borran en segundo plano (son potencialmente grandes)
        for (const f of get().files) void removeBlob(f.id);
        set({
          files: [],
          pages: buildSeedPages(),
          selectedId: SEED_SELECTED,
          members: SEED_MEMBERS,
          plan: DEFAULT_PLAN,
          expanded: { ...SEED_EXPANDED },
          peekRowId: null,
          reading: { ...DEFAULT_READING, positions: {} },
          versions: {},
        });
      },
    }),
    {
      name: "nook-workspace-v2",

      /**
       * Versión del formato persistido.
       *
       * 3 = HTML inline saneado. Antes de esto, un documento podía tener
       * `<img onerror>` guardado y ejecutarse en cada apertura: `migrate` limpia
       * todo el workspace una sola vez, al cargar.
       */
      version: 3,

      migrate: (persisted, version) => {
        const state = persisted as { pages?: Record<string, { blocks?: unknown[] }> } | undefined;
        if (!state?.pages || version >= 3) return persisted as never;
        return { ...state, pages: sanitizePages(state.pages) } as never;
      },

      storage: createJSONStorage(() => deferredStorage()),
      // Sólo persistimos datos: los flags de UI arrancan limpios en cada visita.
      partialize: (s) => ({
        pages: s.pages,
        selectedId: s.selectedId,
        members: s.members,
        plan: s.plan,
        expanded: s.expanded,
        theme: s.theme,
        sidebarOpen: s.sidebarOpen,
        fullWidth: s.fullWidth,
        zoom: s.zoom,
        tts: s.tts,
        reading: s.reading,
        pomodoro: s.pomodoro,
        pomHistory: s.pomHistory,
        bar: s.bar,
        rules: s.rules,
        files: s.files,
      }),
    },
  ),
);

/* ------------------------------- selectores -------------------------------- */

export const useSelectedPage = () =>
  useStore((s) => s.pages[s.selectedId] ?? Object.values(s.pages)[0]);

/**
 * Hook de depuración: `window.__nookStore` expone el store para las pruebas
 * automatizadas (`scripts/verificar-*.mjs`) y para inspeccionar el estado desde
 * la consola. La app es local y no guarda secretos, así que no hay riesgo.
 */
if (typeof window !== "undefined") {
  (window as unknown as { __nookStore?: typeof useStore }).__nookStore = useStore;
}
