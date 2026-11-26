"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { buildSeedPages, SEED_EXPANDED, SEED_SELECTED } from "./seed";
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
  type Page,
  type PomodoroDay,
  type PomodoroPrefs,
  type ReadingPrefs,
  type Theme,
  type TtsPrefs,
} from "./types";
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
  expanded: Record<string, boolean>;
  sidebarOpen: boolean;
  theme: Theme;
  fullWidth: boolean;

  /* ---- lectura, voz y productividad (se persisten) ---- */
  tts: TtsPrefs;
  reading: ReadingPrefs;
  pomodoro: PomodoroPrefs;
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
  mindmapOpen: boolean;

  // ---- navegación / UI
  selectPage: (id: string) => void;
  toggleExpanded: (id: string) => void;
  toggleSidebar: () => void;
  setTheme: (t: Theme) => void;
  toggleFullWidth: () => void;
  setUI: (
    patch: Partial<
      Pick<State, "paletteOpen" | "shareOpen" | "shortcutsOpen" | "settingsOpen" | "trashOpen" | "peekRowId" | "mindmapOpen">
    >,
  ) => void;

  // ---- páginas
  createPage: (parentId?: string | null, patch?: Partial<Page>) => string;
  updatePage: (id: string, patch: Partial<Page>) => void;
  trashPage: (id: string) => void;
  restorePage: (id: string) => void;
  deletePermanently: (id: string) => void;
  emptyTrash: () => void;
  duplicatePage: (id: string) => string;
  toggleFavorite: (id: string) => void;
  movePage: (id: string, newParentId: string | null) => void;

  // ---- bloques
  setBlocks: (pageId: string, blocks: Block[]) => void;
  patchBlock: (pageId: string, blockId: string, patch: Partial<Block>) => void;
  insertBlock: (pageId: string, afterBlockId: string | null, block: Block) => void;
  removeBlock: (pageId: string, blockId: string) => void;
  moveBlock: (pageId: string, from: number, to: number) => void;
  indentBlock: (pageId: string, blockId: string, delta: number) => void;

  // ---- base de datos
  patchDatabase: (pageId: string, patch: Partial<Database>) => void;
  setView: (pageId: string, view: DbView) => void;
  addRow: (pageId: string, cells?: Record<string, CellValue>) => string;
  deleteRow: (pageId: string, rowId: string) => void;
  updateCell: (pageId: string, rowId: string, propId: string, value: CellValue) => void;
  addSelectOption: (pageId: string, propId: string, name: string) => string;
  moveRowToGroup: (pageId: string, rowId: string, groupBy: string, optionId: string) => void;

  // ---- lectura / voz / productividad
  setTts: (patch: Partial<TtsPrefs>) => void;
  setReading: (patch: Partial<ReadingPrefs>) => void;
  savePosition: (pageId: string, y: number) => void;
  setPomodoro: (patch: Partial<PomodoroPrefs>) => void;
  logPomodoro: (kind: "work" | "rest", seconds: number) => void;
  resetPomodoroStats: () => void;
  setBar: (patch: Partial<BarPos>) => void;
  addRule: (from: string, to: string) => void;
  removeRule: (id: string) => void;

  /** reemplaza el workspace por un respaldo validado */
  restoreBackup: (data: BackupPayload) => boolean;
  resetWorkspace: () => void;
}

/** Forma del respaldo JSON que se exporta/importa desde Configuración. */
export interface BackupPayload {
  version: number;
  exportedAt: string;
  pages?: Record<string, Page>;
  selectedId?: string;
  expanded?: Record<string, boolean>;
  theme?: Theme;
  tts?: TtsPrefs;
  reading?: ReadingPrefs;
  pomodoro?: PomodoroPrefs;
  pomHistory?: PomodoroDay[];
  bar?: BarPos;
  rules?: PronRule[];
}

const now = () => Date.now();

const withPage = (state: State, id: string, fn: (p: Page) => Page): Partial<State> => {
  const page = state.pages[id];
  if (!page) return {};
  return { pages: { ...state.pages, [id]: { ...fn(page), updatedAt: now() } } };
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      pages: buildSeedPages(),
      selectedId: SEED_SELECTED,
      expanded: { ...SEED_EXPANDED },
      sidebarOpen: true,
      theme: "light",
      fullWidth: false,

      tts: { ...DEFAULT_TTS },
      reading: { ...DEFAULT_READING, positions: {} },
      pomodoro: { ...DEFAULT_POMODORO },
      pomHistory: [],
      bar: { ...DEFAULT_BAR },
      rules: [],

      paletteOpen: false,
      shareOpen: false,
      shortcutsOpen: false,
      settingsOpen: false,
      trashOpen: false,
      peekRowId: null,
      mindmapOpen: false,

      /* ----------------------------- navegación ----------------------------- */
      selectPage: (id) => set({ selectedId: id, peekRowId: null }),
      toggleExpanded: (id) =>
        set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } })),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setTheme: (theme) => set({ theme }),
      toggleFullWidth: () => set((s) => ({ fullWidth: !s.fullWidth })),
      setUI: (patch) => set(patch as Partial<State>),

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
        set({
          pages: { ...s.pages, [id]: page },
          selectedId: id,
          expanded: parentId ? { ...s.expanded, [parentId]: true } : s.expanded,
        });
        requestBlockFocus(first.id, "end");
        return id;
      },

      updatePage: (id, patch) => set((s) => withPage(s, id, (p) => ({ ...p, ...patch }))),

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
          const ids = [id, ...descendantsOf(s.pages, id)];
          const pages = { ...s.pages };
          for (const pid of ids) if (pages[pid]) pages[pid] = { ...pages[pid], trashed: false, updatedAt: now() };
          return { pages };
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
          for (const [pid, p] of Object.entries(pages)) if (p.trashed) delete pages[pid];
          return { pages };
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
        set((s) => withPage(s, pageId, (p) => (p.database ? { ...p, database: { ...p.database, view } } : p))),

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

      /* ------------------- lectura, voz y productividad -------------------- */
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
          // 60 días de historial es suficiente y acota el localStorage
          return { pomHistory: history.slice(-60) };
        }),

      resetPomodoroStats: () => set({ pomHistory: [] }),

      setBar: (patch) => set((s) => ({ bar: { ...s.bar, ...patch } })),

      addRule: (from, to) =>
        set((s) => {
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
        const selectedId =
          data.selectedId && data.pages[data.selectedId] ? data.selectedId : pages[0].id;
        set({
          pages: data.pages,
          selectedId,
          expanded: data.expanded && typeof data.expanded === "object" ? data.expanded : {},
          theme: data.theme === "dark" ? "dark" : "light",
          tts: { ...DEFAULT_TTS, ...(data.tts ?? {}) },
          reading: { ...DEFAULT_READING, ...(data.reading ?? {}), positions: data.reading?.positions ?? {} },
          pomodoro: { ...DEFAULT_POMODORO, ...(data.pomodoro ?? {}) },
          pomHistory: Array.isArray(data.pomHistory) ? data.pomHistory.slice(-60) : [],
          bar: { ...DEFAULT_BAR, ...(data.bar ?? {}) },
          rules: Array.isArray(data.rules) ? data.rules : [],
        });
        return true;
      },

      resetWorkspace: () =>
        set({
          pages: buildSeedPages(),
          selectedId: SEED_SELECTED,
          expanded: { ...SEED_EXPANDED },
          peekRowId: null,
          reading: { ...DEFAULT_READING, positions: {} },
        }),
    }),
    {
      name: "nook-workspace-v2",
      storage: createJSONStorage(() => localStorage),
      // Sólo persistimos datos: los flags de UI arrancan limpios en cada visita.
      partialize: (s) => ({
        pages: s.pages,
        selectedId: s.selectedId,
        expanded: s.expanded,
        theme: s.theme,
        sidebarOpen: s.sidebarOpen,
        fullWidth: s.fullWidth,
        tts: s.tts,
        reading: s.reading,
        pomodoro: s.pomodoro,
        pomHistory: s.pomHistory,
        bar: s.bar,
        rules: s.rules,
      }),
    },
  ),
);

/* ------------------------------- selectores -------------------------------- */

export const useSelectedPage = () =>
  useStore((s) => s.pages[s.selectedId] ?? Object.values(s.pages)[0]);
