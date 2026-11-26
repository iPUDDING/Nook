"use client";

/**
 * Mapa mental de la página actual.
 *
 * Sin librerías: el árbol se calcula en `lib/mindmap.ts` y acá sólo se pinta
 * SVG. Eso da tres cosas que Markmap no daba gratis: cero dependencias, control
 * total del zoom/paneo y exportación fiel (el mismo SVG que ves es el que se
 * descarga).
 *
 * Todos los atributos visuales del SVG van inline (`fill`, `stroke`,
 * `font-family`) y no por clase Tailwind, porque el SVG serializado para
 * exportar a PNG se rasteriza **fuera** del documento: las clases no viajan.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import { MenuItem, MenuSeparator, Popover } from "../ui";
import { useStore } from "@/lib/store";
import { buildSegments } from "@/lib/speech";
import { pageToOutline } from "@/lib/markdown";
import { branchIds, layoutTree, norm, treeFromOutline, treeToMarkdown, type LaidNode } from "@/lib/mindmap";
import { downloadFile, safeFileName } from "@/lib/utils";
import { visibleBlocks } from "@/lib/utils";
import type { Page } from "@/lib/types";

const SVG_NS = "http://www.w3.org/2000/svg";
const NODE_W = 176;
const NODE_H = 28;

const PALETTE = {
  light: {
    bg: "#ffffff",
    text: "#37352f",
    muted: "#787774",
    line: "#d9d8d6",
    nodeFill: "#ffffff",
    nodeStroke: "#e3e2e0",
    rootFill: "#37352f",
    rootText: "#ffffff",
    accent: "#2383e2",
    match: "#f5b400",
  },
  dark: {
    bg: "#191919",
    text: "#ffffff",
    muted: "#9b9b9b",
    line: "#3a3a3a",
    nodeFill: "#232323",
    nodeStroke: "#3a3a3a",
    rootFill: "#e8e8e8",
    rootText: "#191919",
    accent: "#5aa9e6",
    match: "#f5b400",
  },
};

export default function MindMap({ open, onClose, page }: { open: boolean; onClose: () => void; page: Page }) {
  const theme = useStore((s) => s.theme);
  const colors = theme === "dark" ? PALETTE.dark : PALETTE.light;

  const [outline, setOutline] = useState("");
  const [tree, setTree] = useState(() => treeFromOutline("", () => "n"));
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [zoom, setZoom] = useState(0.9);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [showEditor, setShowEditor] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  /* ------------------------- fuente: la página --------------------------- */
  const pageOutline = useMemo(
    () => pageToOutline(page.title, visibleBlocks(page.blocks)),
    [page.title, page.blocks],
  );

  // ids estables por contenido: el mismo contorno produce el mismo id, así el
  // estado de colapso no se pierde al reabrir el mapa
  const makeId = useCallback((salt: number) => `mm-${salt}`, []);
  const buildTree = useCallback(
    (text: string) => {
      let i = 0;
      return treeFromOutline(text, () => makeId((i += 1)));
    },
    [makeId],
  );

  useEffect(() => {
    if (!open) return;
    setOutline(pageOutline);
    setTree(buildTree(pageOutline));
    setCollapsed(new Set());
    setQuery("");
    setZoom(0.9);
  }, [open, pageOutline, buildTree]);

  const layout = useMemo(
    () => layoutTree(tree, { collapsed, colWidth: 210, rowHeight: 36 }),
    [tree, collapsed],
  );

  const byId = useMemo(() => {
    const map = new Map<string, LaidNode>();
    for (const node of layout.nodes) map.set(node.id, node);
    return map;
  }, [layout]);

  const matches = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return [];
    return layout.nodes.filter((n) => norm(n.text).includes(q));
  }, [layout, query]);

  /* ------------------------------ encuadre -------------------------------- */
  const viewportSize = () => ({
    w: viewportRef.current?.clientWidth ?? 900,
    h: viewportRef.current?.clientHeight ?? 600,
  });

  const centerOn = useCallback((node: LaidNode) => {
    const { w, h } = viewportSize();
    setPan({ x: w / 2 - (node.x + NODE_W / 2) * zoom, y: h / 2 - node.y * zoom });
  }, [zoom]);

  const fit = useCallback(() => {
    const { w, h } = viewportSize();
    const scale = Math.min(1.1, Math.max(0.3, Math.min(w / (layout.width + 60), h / (layout.height + 60))));
    setZoom(scale);
    setPan({ x: 24, y: h / 2 - (layout.height / 2) * scale });
  }, [layout.width, layout.height]);

  // primer encuadre al abrir
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => fit());
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tree]);

  // Enter cicla coincidencias
  useEffect(() => {
    if (!matches.length) return;
    const node = matches[matchIndex % matches.length];
    if (node) centerOn(node);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchIndex, matches]);

  /* ------------------------------ interacción ----------------------------- */
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    setZoom((z) => Math.min(2.4, Math.max(0.2, z * factor)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.target !== viewportRef.current && !(e.target as Element).closest("[data-canvas]")) return;
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    setPan({ x: drag.panX + (e.clientX - drag.x), y: drag.panY + (e.clientY - drag.y) });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* ------------------------------- exportar ------------------------------- */
  const exportMarkdown = () => {
    downloadFile(
      safeFileName(`${page.title || "mapa"}-mapa`, "md"),
      new Blob([treeToMarkdown(tree)], { type: "text/markdown;charset=utf-8" }),
    );
  };

  const exportSvg = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", SVG_NS);
    clone.setAttribute("width", String(layout.width + 80));
    clone.setAttribute("height", String(layout.height + 80));
    clone.setAttribute("viewBox", `-40 -40 ${layout.width + 80} ${layout.height + 80}`);
    // limpiamos el transform de paneo/zoom: el exportado va encuadrado
    const group = clone.querySelector("g[data-content]");
    group?.setAttribute("transform", "translate(0 0) scale(1)");

    downloadFile(
      safeFileName(`${page.title || "mapa"}-mapa`, "svg"),
      new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" }),
    );
  };

  const exportPng = async () => {
    const svg = svgRef.current;
    if (!svg) return;
    const width = layout.width + 80;
    const height = layout.height + 80;

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", SVG_NS);
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    clone.setAttribute("viewBox", `-40 -40 ${width} ${height}`);
    const group = clone.querySelector("g[data-content]");
    group?.setAttribute("transform", "translate(0 0) scale(1)");

    const source = new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(source);

    try {
      const image = new Image();
      image.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("No se pudo rasterizar el mapa"));
        image.src = url;
      });

      const scale = 2; // 2× para que no se vea borroso en pantallas retina
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (blob) downloadFile(safeFileName(`${page.title || "mapa"}-mapa`, "png"), blob);
      }, "image/png");
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  if (!open) return null;

  const q = norm(query.trim());

  return (
    <div className="fixed inset-0 z-[58] flex flex-col bg-surface" role="dialog" aria-modal aria-label="Mapa mental">
      {/* ------------------------------- toolbar ------------------------------ */}
      <header className="flex h-[46px] shrink-0 items-center gap-2 border-b border-line px-3">
        <Icon name="mindmap" size={17} className="shrink-0 text-fg/50" />
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold text-fg">
            {page.icon ? `${page.icon} ` : ""}
            {page.title || "Sin título"}
          </div>
          <div className="text-[11px] text-fg/40">
            {layout.nodes.length} nodos · profundidad {Math.max(...layout.nodes.map((n) => n.depth))}
          </div>
        </div>

        <div className="ml-3 flex items-center gap-1">
          <div className="relative">
            <Icon name="search" size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg/35" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setMatchIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") setMatchIndex((i) => i + 1);
                if (e.key === "Escape") setQuery("");
              }}
              placeholder="Buscar en el mapa…"
              className="h-[28px] w-[190px] rounded-[5px] border border-line bg-surface-side pl-7 pr-14 text-[12.5px] text-fg outline-none placeholder:text-fg/35 focus:border-accent/50"
            />
            {q ? (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] tabular-nums text-fg/40">
                {matches.length ? `${(matchIndex % matches.length) + 1}/${matches.length}` : "0"}
              </span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => {
              setCollapsed(new Set(branchIds(tree)));
              setQuery("");
            }}
            title="Colapsar todas las ramas"
            aria-label="Colapsar todas las ramas"
            className="icon-btn"
          >
            <Icon name="chevron-right" size={15} />
          </button>
          <button type="button" onClick={() => setCollapsed(new Set())} title="Expandir todo" aria-label="Expandir todo" className="icon-btn">
            <Icon name="chevron-down" size={15} />
          </button>
          <button type="button" onClick={fit} title="Encuadrar" aria-label="Encuadrar mapa" className="icon-btn">
            <Icon name="target" size={15} />
          </button>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowEditor((v) => !v)}
            className="toolbar-btn text-[12.5px]"
            title="Ocultar o recuperar el editor de contornos"
          >
            <Icon name="sliders" size={14} />
            {showEditor ? "Ocultar editor" : "Mostrar editor"}
          </button>
          <button
            type="button"
            onClick={() => setFocusMode((v) => !v)}
            className="toolbar-btn text-[12.5px]"
            title="Modo foco: oculta todo lo que no sea el mapa"
          >
            <Icon name="target" size={14} />
            {focusMode ? "Salir del foco" : "Modo foco"}
          </button>

          <div className="relative">
            <button type="button" onClick={() => setExportOpen((v) => !v)} className="toolbar-btn text-[12.5px]">
              <Icon name="download" size={14} />
              Exportar
            </button>
            <Popover open={exportOpen} onClose={() => setExportOpen(false)} align="end" width={214}>
              <MenuItem icon={<Icon name="code" size={14} />} onClick={() => { exportMarkdown(); setExportOpen(false); }}>
                Markdown (.md)
              </MenuItem>
              <MenuItem icon={<Icon name="image" size={14} />} onClick={() => { exportPng(); setExportOpen(false); }}>
                Imagen (.png)
              </MenuItem>
              <MenuItem icon={<Icon name="download" size={14} />} onClick={() => { exportSvg(); setExportOpen(false); }}>
                Vector (.svg)
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon={<Icon name="copy" size={14} />}
                onClick={() => {
                  void navigator.clipboard?.writeText(treeToMarkdown(tree));
                  setExportOpen(false);
                }}
              >
                Copiar contorno
              </MenuItem>
            </Popover>
          </div>

          <button type="button" onClick={onClose} aria-label="Cerrar mapa" className="icon-btn ml-1">
            <Icon name="x" size={17} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ------------------------------ editor ------------------------------ */}
        {showEditor && !focusMode && (
          <aside className="flex w-[300px] shrink-0 flex-col border-r border-line bg-surface-side">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-fg/40">Contorno</span>
              <button
                type="button"
                onClick={() => {
                  setTree(buildTree(outline));
                  setCollapsed(new Set());
                }}
                className="rounded-[4px] bg-fg px-2 py-1 text-[11.5px] font-semibold text-surface hover:opacity-90"
              >
                Aplicar
              </button>
            </div>
            <textarea
              value={outline}
              onChange={(e) => setOutline(e.target.value)}
              spellCheck={false}
              className="min-h-0 flex-1 resize-none bg-transparent px-3 pb-3 font-mono text-[12.5px] leading-[1.6] text-fg/85 outline-none"
            />
            <p className="border-t border-line px-3 py-2 text-[11px] leading-snug text-fg/40">
              Usá <code className="inline-code">#</code> para niveles y <code className="inline-code">-</code> para
              ideas. Editar acá cambia el mapa, no la página.
            </p>
          </aside>
        )}

        {/* ------------------------------ canvas ----------------------------- */}
        <div
          ref={viewportRef}
          data-canvas
          className="relative min-w-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <svg
            ref={svgRef}
            className="h-full w-full select-none"
            style={{ background: colors.bg }}
            role="img"
            aria-label={`Mapa mental de ${page.title || "la página"}`}
          >
            <rect x="0" y="0" width="100%" height="100%" fill={colors.bg} />
            <g data-content transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              {/* enlaces */}
              {layout.links.map((link) => {
                const from = byId.get(link.from);
                const to = byId.get(link.to);
                if (!from || !to) return null;
                const x1 = from.x + NODE_W;
                const y1 = from.y;
                const x2 = to.x;
                const y2 = to.y;
                const mid = (x1 + x2) / 2;
                return (
                  <path
                    key={`${link.from}-${link.to}`}
                    d={`M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`}
                    fill="none"
                    stroke={colors.line}
                    strokeWidth={1.6}
                  />
                );
              })}

              {/* nodos */}
              {layout.nodes.map((node) => {
                const isRoot = node.depth === 0;
                const isMatch = q ? norm(node.text).includes(q) : false;
                const width = NODE_W;
                const text = node.text.length > 26 ? `${node.text.slice(0, 25)}…` : node.text;
                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x} ${node.y - NODE_H / 2})`}
                    style={{ cursor: node.hasChildren ? "pointer" : "default" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (node.hasChildren) toggleCollapse(node.id);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      centerOn(node);
                    }}
                  >
                    <rect
                      width={width}
                      height={NODE_H}
                      rx={7}
                      fill={isRoot ? colors.rootFill : colors.nodeFill}
                      stroke={isMatch ? colors.match : colors.nodeStroke}
                      strokeWidth={isMatch ? 2 : 1}
                    />
                    <text
                      x={10}
                      y={NODE_H / 2 + 4}
                      fontSize={isRoot ? 12.5 : 11.5}
                      fontWeight={isRoot ? 700 : node.depth === 1 ? 600 : 400}
                      fontFamily="ui-sans-serif, -apple-system, system-ui, Segoe UI, sans-serif"
                      fill={isRoot ? colors.rootText : colors.text}
                    >
                      {text}
                    </text>
                    {node.hasChildren && (
                      <g transform={`translate(${width - 16} ${NODE_H / 2})`}>
                        <circle r={6.5} fill={isRoot ? colors.bg : colors.accent} opacity={isRoot ? 0.18 : 0.14} />
                        <path
                          d={node.collapsed ? "M-2.2 -1 1 2 2.2 -1" : "M-2.2 1 1 -2 2.2 1"}
                          transform="translate(-1 1)"
                          fill="none"
                          stroke={isRoot ? colors.rootText : colors.accent}
                          strokeWidth={1.4}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </g>
                    )}
                    {node.collapsed && (
                      <text
                        x={width + 6}
                        y={NODE_H / 2 + 4}
                        fontSize={10}
                        fill={colors.muted}
                        fontFamily="ui-sans-serif, system-ui, sans-serif"
                      >
                        +
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* controles de zoom */}
          {!focusMode && (
            <div className="glass absolute bottom-4 right-4 flex items-center gap-0.5 rounded-full px-1 py-1">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.2, z / 1.2))}
                aria-label="Alejar"
                className="icon-btn h-[26px] w-[26px]"
              >
                <span className="text-[15px] leading-none">−</span>
              </button>
              <span className="w-[38px] text-center text-[11.5px] tabular-nums text-fg/60">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.4, z * 1.2))}
                aria-label="Acercar"
                className="icon-btn h-[26px] w-[26px]"
              >
                <span className="text-[15px] leading-none">+</span>
              </button>
            </div>
          )}

          {!layout.nodes.length && (
            <div className="absolute inset-0 flex items-center justify-center text-[13px] text-fg/40">
              La página no tiene contenido para mapear.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Texto plano de la página, usado por el botón "leer" del mapa (reservado). */
export function pageSpeechText(page: Page) {
  return buildSegments(page.title, page.blocks).map((s) => s.text).join(" ");
}
