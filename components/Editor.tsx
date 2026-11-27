"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon, { type IconName } from "./Icon";
import { emptyBlock, requestBlockFocus, takeBlockFocus, useStore } from "@/lib/store";
import { sanitizeInlineHtml } from "@/lib/sanitize";
import { useReadAloud } from "@/components/tts/useReadAloud";
import { htmlToText } from "@/lib/speech";
import { looksLikeMarkdown, markdownToBlocks } from "@/lib/markdown";
import {
  addColumn,
  addRow,
  newTable,
  getCell,
  normalizeTable,
  removeColumn,
  removeRow,
  setCell,
  tableColumns,
} from "@/lib/table";
import type { Block, BlockType, Page, TableData } from "@/lib/types";
import { PILL, cx, uid } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Utilidades de selección / caret                                            */
/* -------------------------------------------------------------------------- */
function placeCaret(el: HTMLElement, at: "start" | "end") {
  const range = document.createRange();
  const sel = window.getSelection();
  if (at === "start") {
    range.setStart(el, 0);
    range.collapse(true);
  } else {
    range.selectNodeContents(el);
    range.collapse(false);
  }
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function caretAtStart(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const live = sel.getRangeAt(0);
  const probe = document.createRange();
  probe.selectNodeContents(el);
  probe.setEnd(live.startContainer, live.startOffset);
  return probe.toString().length === 0;
}

function caretAtEnd(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const live = sel.getRangeAt(0);
  const probe = document.createRange();
  probe.selectNodeContents(el);
  probe.setStart(live.endContainer, live.endOffset);
  return probe.toString().length === 0;
}

/** Parte el contenido del bloque en el caret. Devuelve [izquierda, derecha]. */
function splitAtCaret(el: HTMLElement): [string, string] {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return [el.innerHTML, ""];
  const live = sel.getRangeAt(0);
  const after = live.cloneRange();
  after.selectNodeContents(el);
  try {
    after.setStart(live.endContainer, live.endOffset);
  } catch {
    return [el.innerHTML, ""];
  }
  const frag = after.extractContents();
  const holder = document.createElement("div");
  holder.appendChild(frag);
  return [el.innerHTML, holder.innerHTML];
}

/* -------------------------------------------------------------------------- */
/*  Bloque de tabla                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Celda editable.
 *
 * Repite el patrón de `Editable`: escribimos `innerHTML` sólo cuando difiere de
 * lo que hay en el DOM. Sin eso, cada tecla re-renderiza y el caret salta.
 */
function Cell({
  html,
  row,
  col,
  header,
  align,
  onCommit,
  onKey,
}: {
  html: string;
  row: number;
  col: number;
  header: boolean;
  align: "left" | "center" | "right";
  onCommit: (value: string) => void;
  onKey: (e: React.KeyboardEvent<HTMLDivElement>, row: number, col: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== html) el.innerHTML = html;
  }, [html]);

  return (
    <div
      ref={ref}
      data-cell={`${row}:${col}`}
      role="textbox"
      tabIndex={0}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onInput={(e) => onCommit(e.currentTarget.innerHTML)}
      onKeyDown={(e) => onKey(e, row, col)}
      className={cx(
        "min-h-[30px] w-full whitespace-pre-wrap px-2 py-[5px] text-[13.5px] leading-[1.5] outline-none",
        "focus:bg-accent/[0.06]",
        header && "font-medium text-fg",
        align === "center" && "text-center",
        align === "right" && "text-right",
      )}
    />
  );
}

/**
 * Tabla con celdas editables.
 *
 * `Enter` baja a la celda de abajo (y crea la fila si hace falta); `Tab` y
 * `Shift+Tab` navegan de forma nativa porque cada celda es un elemento
 * enfocable. La barra de acciones aparece al pasar el mouse.
 */
function TableBlock({ page, block }: { page: Page; block: Block }) {
  const setBlockTable = useStore((s) => s.setBlockTable);
  const [hover, setHover] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const table: TableData = normalizeTable(
    block.table ?? { header: ["Columna 1", "Columna 2"], rows: [["", ""]] },
  );
  const cols = tableColumns(table);

  const commit = (row: number, col: number, value: string) =>
    setBlockTable(page.id, block.id, setCell(table, row, col, sanitizeInlineHtml(value)));

  const focusCell = (row: number, col: number) => {
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-cell="${row}:${col}"]`);
    if (el) {
      el.focus();
      placeCaret(el, "end");
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>, row: number, col: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (row + 1 < table.rows.length) {
        focusCell(row + 1, col);
      } else {
        setBlockTable(page.id, block.id, addRow(table));
        // la fila nueva se monta en el próximo frame
        requestAnimationFrame(() => focusCell(table.rows.length, col));
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      (e.currentTarget as HTMLElement).blur();
    }
  };

  return (
    <div
      className="my-2 w-full"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        ref={gridRef}
        className="w-full overflow-x-auto rounded-[4px] border border-line"
        role="table"
      >
        <div className="min-w-full">
          {/* encabezado */}
          <div
            className="flex border-b border-line bg-surface-hover/70"
            role="row"
          >
            {Array.from({ length: cols }, (_, c) => (
              <div
                key={`h${c}`}
                role="columnheader"
                className={cx("min-w-0 flex-1", c > 0 && "border-l border-line")}
              >
                <Cell
                  html={getCell(table, -1, c)}
                  row={-1}
                  col={c}
                  header
                  align={table.align?.[c] ?? "left"}
                  onCommit={(value) => commit(-1, c, value)}
                  onKey={onKey}
                />
              </div>
            ))}
          </div>

          {/* cuerpo */}
          {table.rows.map((row, r) => (
            <div
              key={`r${r}`}
              role="row"
              className={cx("flex", r > 0 && "border-t border-line")}
            >
              {Array.from({ length: cols }, (_, c) => (
                <div
                  key={`c${c}`}
                  role="cell"
                  className={cx("min-w-0 flex-1", c > 0 && "border-l border-line")}
                >
                  <Cell
                    html={getCell(table, r, c)}
                    row={r}
                    col={c}
                    header={false}
                    align={table.align?.[c] ?? "left"}
                    onCommit={(value) => commit(r, c, value)}
                    onKey={onKey}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* acciones */}
      <div
        className={cx(
          "mt-1 flex items-center gap-1 text-[11px] text-fg/45 transition-opacity",
          hover ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <button
          type="button"
          onClick={() => setBlockTable(page.id, block.id, addRow(table))}
          className="rounded-[3px] px-1.5 py-0.5 hover:bg-surface-hover hover:text-fg/80"
        >
          + Fila
        </button>
        <button
          type="button"
          onClick={() => setBlockTable(page.id, block.id, addColumn(table))}
          className="rounded-[3px] px-1.5 py-0.5 hover:bg-surface-hover hover:text-fg/80"
        >
          + Columna
        </button>
        <span className="text-fg/20">·</span>
        <button
          type="button"
          onClick={() => setBlockTable(page.id, block.id, removeRow(table, table.rows.length - 1))}
          className="rounded-[3px] px-1.5 py-0.5 hover:bg-surface-hover hover:text-fg/80"
        >
          − Fila
        </button>
        <button
          type="button"
          onClick={() => setBlockTable(page.id, block.id, removeColumn(table, cols - 1))}
          className="rounded-[3px] px-1.5 py-0.5 hover:bg-surface-hover hover:text-fg/80"
        >
          − Columna
        </button>
        <span className="ml-auto tabular-nums text-fg/30">
          {table.rows.length} × {cols}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Un bloque editable                                                         */
/* -------------------------------------------------------------------------- */
function Editable({
  block,
  placeholder,
  className,
  style,
  registerRef,
  onInput,
  onKeyDown,
}: {
  block: Block;
  placeholder: string;
  className?: string;
  style?: React.CSSProperties;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
  onInput: (e: React.FormEvent<HTMLDivElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  /**
   * Sincronización DOM ← store.
   * Sólo escribimos innerHTML cuando difiere: si lo hiciéramos en cada render,
   * el caret saltaría al inicio en cada tecla.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.innerHTML !== block.html) el.innerHTML = block.html;
  }, [block.html, block.id]);

  useEffect(() => {
    registerRef(block.id, ref.current);
    return () => registerRef(block.id, null);
  }, [block.id, registerRef]);

  return (
    <div
      ref={ref}
      role="textbox"
      aria-multiline="true"
      tabIndex={0}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-placeholder={placeholder}
      onInput={onInput}
      onKeyDown={onKeyDown}
      className={cx("min-w-0 flex-1 caret-accent outline-none", className)}
      style={style}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Editor                                                                     */
/* -------------------------------------------------------------------------- */
export default function Editor({ page }: { page: Page }) {
  const patchBlock = useStore((s) => s.patchBlock);
  const insertBlock = useStore((s) => s.insertBlock);
  const insertBlocks = useStore((s) => s.insertBlocks);
  const removeBlock = useStore((s) => s.removeBlock);
  const moveBlock = useStore((s) => s.moveBlock);
  const indentBlock = useStore((s) => s.indentBlock);
  const theme = useStore((s) => s.theme);

  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const blocks = page.blocks;

  const registerRef = (id: string, el: HTMLDivElement | null) => {
    refs.current[id] = el;
  };

  const [slash, setSlash] = useState<{ blockId: string; query: string; index: number } | null>(null);
  const [dragArmed, setDragArmed] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  /* --------------------------- foco pedido afuera -------------------------- */
  useEffect(() => {
    const req = takeBlockFocus();
    if (!req) return;
    const el = refs.current[req.blockId];
    if (!el) return;
    el.focus();
    placeCaret(el, req.at);
  }, [blocks]);

  /* ------------------------------ comandos "/" ----------------------------- */
  const commands = useMemo(() => {
    const setType = (blockId: string, type: BlockType) => {
      patchBlock(page.id, blockId, { type, html: "", collapsed: false });
      requestBlockFocus(blockId, "end");
    };
    return [
      { id: "text", label: "Texto", hint: "Empezá a escribir", icon: "type" as IconName, keywords: "texto parrafo p", apply: (id: string) => setType(id, "paragraph") },
      { id: "h1", label: "Título 1", hint: "Encabezado grande", icon: "heading1" as IconName, keywords: "h1 titulo heading", apply: (id: string) => setType(id, "h1") },
      { id: "h2", label: "Título 2", hint: "Encabezado medio", icon: "heading2" as IconName, keywords: "h2 titulo heading", apply: (id: string) => setType(id, "h2") },
      { id: "h3", label: "Título 3", hint: "Encabezado chico", icon: "heading3" as IconName, keywords: "h3 titulo heading", apply: (id: string) => setType(id, "h3") },
      { id: "bulleted", label: "Lista con viñetas", hint: "Lista simple", icon: "list-bulleted" as IconName, keywords: "lista vineta bullet ul", apply: (id: string) => setType(id, "bulleted") },
      { id: "numbered", label: "Lista numerada", hint: "Lista ordenada", icon: "list-numbered" as IconName, keywords: "lista numerada orden ol", apply: (id: string) => setType(id, "numbered") },
      { id: "todo", label: "Lista de tareas", hint: "Seguimiento de pendientes", icon: "todo" as IconName, keywords: "tarea todo check", apply: (id: string) => setType(id, "todo") },
      { id: "toggle", label: "Desplegable", hint: "Contenido plegable", icon: "toggle" as IconName, keywords: "toggle desplegable acordeon", apply: (id: string) => setType(id, "toggle") },
      { id: "quote", label: "Cita", hint: "Capturá una frase", icon: "quote" as IconName, keywords: "cita quote blockquote", apply: (id: string) => setType(id, "quote") },
      { id: "callout", label: "Bloque destacado", hint: "Hacé que resalte", icon: "callout" as IconName, keywords: "callout destacado nota aviso", apply: (id: string) => setType(id, "callout") },
      { id: "code", label: "Código", hint: "Bloque monoespaciado", icon: "code" as IconName, keywords: "codigo code snippet", apply: (id: string) => setType(id, "code") },
      {
        id: "table",
        label: "Tabla",
        hint: "Filas y columnas editables",
        icon: "table" as IconName,
        keywords: "tabla table grilla filas columnas",
        apply: (id: string) => {
          patchBlock(page.id, id, { type: "table", html: "", table: newTable(2, 2) });
          const nb = emptyBlock();
          insertBlock(page.id, id, nb);
          requestBlockFocus(nb.id, "start");
        },
      },
      {
        id: "divider",
        label: "Divisor",
        hint: "Separá secciones",
        icon: "divider" as IconName,
        keywords: "divisor linea separador hr",
        apply: (id: string) => {
          patchBlock(page.id, id, { type: "divider", html: "" });
          const nb = emptyBlock();
          insertBlock(page.id, id, nb);
          requestBlockFocus(nb.id, "start");
        },
      },
    ];
  }, [page.id, patchBlock, insertBlock]);

  const filtered = useMemo(() => {
    const q = (slash?.query ?? "").toLowerCase().trim();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.keywords.includes(q) || c.id.includes(q),
    );
  }, [commands, slash?.query]);

  /* -------------------------------- handlers ------------------------------- */
  const focusBlock = (id: string, at: "start" | "end") => {
    const el = refs.current[id];
    if (!el) return;
    el.focus();
    placeCaret(el, at);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, block: Block, index: number) => {
    const el = e.currentTarget;
    const mod = e.metaKey || e.ctrlKey;

    /* ---------------- menú "/" abierto: capturamos el input ---------------- */
    if (slash && slash.blockId === block.id) {
      if (e.key === "Escape") {
        e.preventDefault();
        setSlash(null);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filtered[slash.index] ?? filtered[0];
        if (cmd) {
          cmd.apply(block.id);
          setSlash(null);
        }
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setSlash((s) =>
          s
            ? {
                ...s,
                index:
                  e.key === "ArrowDown"
                    ? (s.index + 1) % Math.max(filtered.length, 1)
                    : (s.index - 1 + filtered.length) % Math.max(filtered.length, 1),
              }
            : s,
        );
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        setSlash((s) => (s && s.query.length > 0 ? { ...s, query: s.query.slice(0, -1), index: 0 } : null));
        return;
      }
      if (e.key.length === 1 && !mod && !e.altKey) {
        e.preventDefault();
        setSlash((s) => (s ? { ...s, query: s.query + e.key, index: 0 } : s));
        return;
      }
    }

    /* ---------------------------- formato inline --------------------------- */
    if (mod && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === "b" || k === "i" || k === "u") {
        e.preventDefault();
        document.execCommand(k === "b" ? "bold" : k === "i" ? "italic" : "underline");
        patchBlock(page.id, block.id, { html: el.innerHTML });
        return;
      }
      if (k === "e") {
        e.preventDefault();
        const text = window.getSelection()?.toString() ?? "";
        document.execCommand("insertHTML", false, `<code>${text}</code>&nbsp;`);
        patchBlock(page.id, block.id, { html: el.innerHTML });
        return;
      }
    }

    /* --------------------------- atajos de bloque -------------------------- */
    if (mod && e.shiftKey) {
      const map: Record<string, BlockType> = { "7": "numbered", "8": "bulleted", "9": "todo" };
      if (map[e.key]) {
        e.preventDefault();
        patchBlock(page.id, block.id, { type: map[e.key] });
        return;
      }
    }

    /* --------------------------- divisor (no editable) --------------------- */
    if (block.type === "divider") return;

    /* ------------------------------ abre el menú --------------------------- */
    if (e.key === "/" && !mod) {
      e.preventDefault();
      setSlash({ blockId: block.id, query: "", index: 0 });
      return;
    }

    /* --------------------------- atajos markdown --------------------------- */
    if (e.key === " ") {
      const text = el.textContent ?? "";
      const t = text.trim();
      const md: Record<string, BlockType | "divider"> = {
        "#": "h1",
        "##": "h2",
        "###": "h3",
        "-": "bulleted",
        "*": "bulleted",
        "1.": "numbered",
        "[]": "todo",
        "[ ]": "todo",
        ">": "quote",
        "```": "code",
        "---": "divider",
      };
      if (md[t]) {
        e.preventDefault();
        if (md[t] === "divider") {
          patchBlock(page.id, block.id, { type: "divider", html: "" });
          const nb = emptyBlock();
          insertBlock(page.id, block.id, nb);
          requestBlockFocus(nb.id, "start");
        } else {
          patchBlock(page.id, block.id, { type: md[t] as BlockType, html: "" });
        }
        return;
      }
    }

    /* --------------------------------- Enter ------------------------------- */
    if (e.key === "Enter" && !e.shiftKey && block.type !== "code") {
      e.preventDefault();
      const isEmpty = (el.textContent ?? "").length === 0;
      if (isEmpty && block.type !== "paragraph") {
        patchBlock(page.id, block.id, { type: "paragraph", checked: undefined });
        return;
      }
      const [left, right] = splitAtCaret(el);
      patchBlock(page.id, block.id, { html: left });
      const keepType: BlockType = ["bulleted", "numbered", "todo", "toggle"].includes(block.type)
        ? block.type
        : "paragraph";
      const nb: Block = {
        id: uid("blk"),
        type: keepType,
        html: right,
        indent: block.indent ?? 0,
        checked: false,
        collapsed: false,
      };
      insertBlock(page.id, block.id, nb);
      requestBlockFocus(nb.id, "start");
      return;
    }

    /* -------------------------------- Backspace ---------------------------- */
    if (e.key === "Backspace" && !mod) {
      const empty = (el.textContent ?? "").length === 0;
      if (empty) {
        e.preventDefault();
        if (block.type !== "paragraph") {
          patchBlock(page.id, block.id, { type: "paragraph", checked: undefined });
          return;
        }
        if (blocks.length === 1) {
          patchBlock(page.id, block.id, { html: "" });
          return;
        }
        const prev = blocks[index - 1];
        removeBlock(page.id, block.id);
        if (prev) requestBlockFocus(prev.id, "end");
        return;
      }
      if (caretAtStart(el)) {
        const prev = blocks[index - 1];
        if (!prev || prev.type === "divider") return;
        e.preventDefault();
        patchBlock(page.id, prev.id, { html: prev.html + el.innerHTML });
        const target = prev.id;
        removeBlock(page.id, block.id);
        setTimeout(() => focusBlock(target, "end"), 0);
      }
      return;
    }

    /* -------------------------------- Tab ---------------------------------- */
    // Tab sangra sólo cuando hay algo que sangrar; si no, se deja pasar para
    // que el foco pueda salir del editor con el teclado (antes quedaba atrapado
    // en el primer bloque, que ya está al ras).
    if (e.key === "Tab") {
      const puedeSangrar = !e.shiftKey && index > 0;
      const puedeAlisar = e.shiftKey && (block.indent ?? 0) > 0;
      if (puedeSangrar || puedeAlisar) {
        e.preventDefault();
        indentBlock(page.id, block.id, e.shiftKey ? -1 : 1);
      }
      return;
    }

    /* ------------------------------ navegación ----------------------------- */
    if (e.key === "ArrowUp" && caretAtStart(el) && index > 0) {
      e.preventDefault();
      focusBlock(blocks[index - 1].id, "end");
      return;
    }
    if (e.key === "ArrowDown" && caretAtEnd(el) && index < blocks.length - 1) {
      e.preventDefault();
      focusBlock(blocks[index + 1].id, "start");
    }
  };

  /* -------------------------------- derivados ------------------------------ */
  const isDark = theme === "dark";

  const numbering = useMemo(() => {
    const out: Record<string, number> = {};
    let counters: number[] = [];
    for (const blk of blocks) {
      const ind = blk.indent ?? 0;
      if (blk.type !== "numbered") {
        if (ind === 0) counters = [];
        continue;
      }
      counters = counters.slice(0, ind + 1);
      counters[ind] = (counters[ind] ?? 0) + 1;
      out[blk.id] = counters[ind];
    }
    return out;
  }, [blocks]);

  /** bloques ocultos por un toggle cerrado */
  const hidden = useMemo(() => {
    const set = new Set<string>();
    let collapseIndent: number | null = null;
    for (const blk of blocks) {
      const ind = blk.indent ?? 0;
      if (collapseIndent !== null && ind > collapseIndent) {
        set.add(blk.id);
        continue;
      }
      collapseIndent = null;
      if (blk.type === "toggle" && blk.collapsed) collapseIndent = ind;
    }
    return set;
  }, [blocks]);

  const placeholderFor = (type: BlockType) =>
    ({
      paragraph: "Escribí “/” para ver los comandos",
      h1: "Título 1",
      h2: "Título 2",
      h3: "Título 3",
      bulleted: "Elemento de lista",
      numbered: "Elemento numerado",
      todo: "Tarea pendiente",
      toggle: "Desplegable",
      quote: "Cita",
      callout: "Escribí algo que valga la pena destacar",
      code: "Código",
      table: "",
      divider: "",
    })[type];

  /**
   * Pegar Markdown dentro de la app.
   *
   * Si el portapapeles parece Markdown (ver `looksLikeMarkdown`), se convierte
   * en bloques reales —tablas incluidas— en vez de dejar un párrafo con
   * símbolos. Si no, se deja el pegado normal del navegador.
   */
  /**
   * Menú contextual propio.
   *
   * El navegador no sabe qué bloque hay debajo del puntero; nosotros sí. Al
   * hacer clic derecho sobre un bloque se ofrece **empezar a leer desde ahí**,
   * con la frase calculada a partir de la posición exacta del cursor.
   */
  const [readMenu, setReadMenu] = useState<{ x: number; y: number; blockId: string; offset: number } | null>(
    null,
  );
  const { readFrom } = useReadAloud();

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const host = (e.target as HTMLElement).closest?.("[data-block-id]") as HTMLElement | null;
    if (!host) return;
    const blockId = host.getAttribute("data-block-id");
    if (!blockId) return;

    e.preventDefault();

    // caracteres del bloque que quedan antes del puntero
    let offset = 0;
    const caret =
      typeof document.caretRangeFromPoint === "function"
        ? document.caretRangeFromPoint(e.clientX, e.clientY)
        : null;
    if (caret && host.contains(caret.startContainer)) {
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      let acc = 0;
      let node = walker.nextNode();
      while (node) {
        if (node === caret.startContainer) {
          acc += caret.startOffset;
          break;
        }
        acc += (node as Text).data?.length ?? 0;
        node = walker.nextNode();
      }
      offset = acc;
    }

    setReadMenu({ x: e.clientX, y: e.clientY, blockId, offset });
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;

    /**
     * Dentro de una celda de tabla el pegado es de **texto**, no de documento:
     * convertir el Markdown metería los bloques después de la tabla, lejos de
     * donde está el caret. La celda se queda con el pegado normal (y su
     * contenido se sanea al guardarse).
     */
    if ((e.target as HTMLElement).closest?.("[data-cell]")) return;

    if (!looksLikeMarkdown(text)) return;

    e.preventDefault();

    const host = (e.target as HTMLElement).closest?.("[data-block-id]") as HTMLElement | null;
    const blockId = host?.getAttribute("data-block-id") ?? null;
    const current = blockId ? blocks.find((b) => b.id === blockId) ?? null : null;

    // si el bloque donde se pegó está vacío, lo ocupa el primer bloque pegado
    const isEmpty = !!current && current.type !== "table" && !htmlToText(current.html);
    const incoming = markdownToBlocks(text, () => uid("blk"));

    insertBlocks(page.id, blockId, incoming, isEmpty ? blockId : null);
    requestBlockFocus(incoming[0].id, "end");
  };

  return (
    <div
      className="editor-body relative pb-[28vh]"
      onPaste={handlePaste}
      onContextMenu={handleContextMenu}
    >
      {readMenu ? (
        <>
          {/* capa para cerrar con un clic en cualquier lado */}
          <div
            className="fixed inset-0 z-[70]"
            onClick={() => setReadMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setReadMenu(null);
            }}
          />
          <div
            role="menu"
            aria-label="Leer desde aquí"
            className="pop-in fixed z-[71] w-[236px] overflow-hidden rounded-[8px] border border-line bg-surface-pop py-1 shadow-menu"
            style={{
              left: Math.min(readMenu.x, window.innerWidth - 248),
              top: Math.min(readMenu.y, window.innerHeight - 108),
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                readFrom(readMenu.blockId, readMenu.offset);
                setReadMenu(null);
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] text-fg hover:bg-surface-hover"
            >
              <Icon name="play" size={14} className="text-fg/60" />
              Empezar a leer desde aquí
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                readFrom(readMenu.blockId, 0);
                setReadMenu(null);
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] text-fg hover:bg-surface-hover"
            >
              <Icon name="volume" size={14} className="text-fg/60" />
              Leer este bloque
            </button>
          </div>
        </>
      ) : null}
      {blocks.map((block, index) => {
        if (hidden.has(block.id)) return null;
        const indent = block.indent ?? 0;

        return (
          <div
            key={block.id}
            data-block-id={block.id}
            className="group relative"
            style={{ marginLeft: indent * 24 }}
            draggable={dragArmed === index}
            onDragStart={(e) => {
              setDragIndex(index);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(index));
            }}
            onDragOver={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
              setOverIndex(index);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null && overIndex !== null) moveBlock(page.id, dragIndex, overIndex);
              setDragIndex(null);
              setOverIndex(null);
              setDragArmed(null);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
              setDragArmed(null);
            }}
          >
            {overIndex === index && dragIndex !== null && (
              <div className="pointer-events-none absolute -top-px left-0 right-0 h-[2px] rounded-full bg-accent" />
            )}

            {/* gutter: + y handle de arrastre */}
            <div className="reading-hide absolute -left-[54px] top-[1px] flex items-center opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                aria-label="Insertar bloque debajo"
                onClick={() => {
                  const nb = emptyBlock();
                  insertBlock(page.id, block.id, nb);
                  requestBlockFocus(nb.id, "start");
                }}
                className="flex h-[22px] w-[22px] items-center justify-center rounded-[3px] text-fg/40 hover:bg-surface-hover hover:text-fg/80"
              >
                <Icon name="plus" size={15} />
              </button>
              <button
                type="button"
                aria-label="Arrastrar bloque"
                onMouseDown={() => setDragArmed(index)}
                onMouseUp={() => dragIndex === null && setDragArmed(null)}
                className="drag-arm flex h-[22px] w-[18px] cursor-grab items-center justify-center rounded-[3px] text-fg/35 hover:bg-surface-hover hover:text-fg/70 active:cursor-grabbing"
              >
                <Icon name="grip" size={14} />
              </button>
            </div>

            {/* -------------------------------- bloque ------------------------------- */}
            {block.type === "divider" ? (
              <div className="py-2">
                <div className="h-px w-full bg-fg/[0.14]" />
              </div>
            ) : block.type === "table" ? (
              <TableBlock page={page} block={block} />
            ) : (
              <div
                className={cx(
                  "flex items-start gap-1.5",
                  block.type === "paragraph" && "py-[3px]",
                  block.type === "h1" && "pb-1 pt-6",
                  block.type === "h2" && "pb-1 pt-4",
                  block.type === "h3" && "pb-1 pt-3",
                  ["bulleted", "numbered", "todo", "toggle"].includes(block.type) && "py-[2px]",
                  block.type === "quote" && "my-1",
                  block.type === "callout" && "my-1",
                  block.type === "code" && "my-1.5",
                )}
              >
                {block.type === "bulleted" && (
                  <span className="mt-[9px] flex h-[6px] w-[18px] shrink-0 items-center justify-center">
                    <span className="h-[5px] w-[5px] rounded-full bg-current" />
                  </span>
                )}
                {block.type === "numbered" && (
                  <span className="mt-[3px] w-[18px] shrink-0 text-right text-[15px] tabular-nums text-fg/80">
                    {numbering[block.id] ?? 1}.
                  </span>
                )}
                {block.type === "todo" && (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={!!block.checked}
                    onClick={() => patchBlock(page.id, block.id, { checked: !block.checked })}
                    className={cx(
                      "mt-[4px] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[3px] border transition-colors",
                      block.checked
                        ? "border-accent bg-accent text-white"
                        : "border-fg/35 hover:bg-fg/[0.05]",
                    )}
                  >
                    {block.checked && <Icon name="check" size={11} strokeWidth={2.5} />}
                  </button>
                )}
                {block.type === "toggle" && (
                  <button
                    type="button"
                    aria-label={block.collapsed ? "Desplegar" : "Plegar"}
                    onClick={() => patchBlock(page.id, block.id, { collapsed: !block.collapsed })}
                    className="mt-[1px] flex h-[22px] w-[18px] shrink-0 items-center justify-center rounded-[3px] text-fg/60 hover:bg-surface-hover"
                  >
                    <Icon
                      name="chevron-right"
                      size={13}
                      className={cx("transition-transform duration-150", !block.collapsed && "rotate-90")}
                    />
                  </button>
                )}
                {block.type === "quote" && (
                  <span className="mt-1 h-[calc(100%-8px)] w-[3px] shrink-0 rounded-full bg-current" />
                )}
                {block.type === "callout" && <span className="mt-[1px] shrink-0 text-[16px] leading-[1.4]">💡</span>}

                <Editable
                  block={block}
                  placeholder={placeholderFor(block.type)}
                  registerRef={registerRef}
                  onInput={(e) =>
                    patchBlock(page.id, block.id, {
                      // el HTML pegado con formato no es confiable: se sanea antes de persistir
                      html: sanitizeInlineHtml(e.currentTarget.innerHTML),
                    })
                  }
                  onKeyDown={(e) => handleKeyDown(e, block, index)}
                  className={cx(
                    block.type === "h1" && "block-h1",
                    block.type === "h2" && "block-h2",
                    block.type === "h3" && "block-h3",
                    block.type === "quote" && "italic text-fg/90",
                    block.type === "todo" && block.checked && "text-fg/40 line-through",
                    block.type === "code" &&
                      "whitespace-pre-wrap rounded-[4px] border border-line bg-surface-hover/60 px-3 py-2 font-mono text-[13.5px] leading-[1.55]",
                    block.type === "callout" && "rounded-[4px] px-2.5 py-2",
                  )}
                  style={
                    block.type === "callout"
                      ? {
                          background: isDark
                            ? `${PILL[block.color ?? "blue"].text}26`
                            : PILL[block.color ?? "blue"].bg,
                        }
                      : undefined
                  }
                />
              </div>
            )}

            {/* ------------------------------- menú "/" ------------------------------ */}
            {slash?.blockId === block.id && (
              <div
                className="menu pop-in absolute left-0 top-[calc(100%+4px)] z-40 w-[330px] p-1"
                onMouseDown={(e) => e.preventDefault()}
              >
                <div className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-fg/40">
                  Bloques básicos
                </div>
                <div className="max-h-[290px] overflow-y-auto">
                  {filtered.length === 0 && (
                    <div className="px-2 py-3 text-[13px] text-fg/50">
                      Sin resultados para “{slash.query}”
                    </div>
                  )}
                  {filtered.map((cmd, i) => (
                    <button
                      key={cmd.id}
                      type="button"
                      data-active={i === slash.index || undefined}
                      onMouseEnter={() => setSlash((s) => (s ? { ...s, index: i } : s))}
                      onClick={() => {
                        cmd.apply(block.id);
                        setSlash(null);
                      }}
                      className="menu-item gap-2.5"
                    >
                      <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[4px] border border-line bg-surface text-fg/70">
                        <Icon name={cmd.icon} size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] text-fg">{cmd.label}</span>
                        <span className="block truncate text-[12px] text-fg/45">{cmd.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* click al final del documento = bloque nuevo */}
      <div
        className="h-8 cursor-text"
        aria-hidden
        onClick={() => {
          const nb = emptyBlock();
          insertBlock(page.id, blocks[blocks.length - 1]?.id ?? null, nb);
          requestBlockFocus(nb.id, "start");
        }}
      />
    </div>
  );
}
