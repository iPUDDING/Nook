"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon, { type IconName } from "./Icon";
import { usePomodoro } from "./pomodoro/Pomodoro";
import { useReadAloud } from "./tts/useReadAloud";
import { pageToMarkdown } from "@/lib/markdown";
import { useStore } from "@/lib/store";
import { ancestorsOf, cx, downloadFile, safeFileName, visibleBlocks } from "@/lib/utils";

type Item = {
  id: string;
  label: string;
  sub?: string;
  icon?: IconName;
  emoji?: string;
  run: () => void;
};

export default function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const setUI = useStore((s) => s.setUI);
  const pages = useStore((s) => s.pages);
  const selectPage = useStore((s) => s.selectPage);
  const createPage = useStore((s) => s.createPage);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const toggleFullWidth = useStore((s) => s.toggleFullWidth);
  const duplicatePage = useStore((s) => s.duplicatePage);
  const selectedId = useStore((s) => s.selectedId);
  const reading = useStore((s) => s.reading);
  const setReading = useStore((s) => s.setReading);
  const { readPage } = useReadAloud();
  const pomodoro = usePomodoro();

  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const close = () => setUI({ paletteOpen: false });

    const pageItems: Item[] = Object.values(pages)
      .filter((p) => !p.trashed)
      .map((p) => ({
        id: `page-${p.id}`,
        label: p.title || "Sin título",
        sub: ancestorsOf(pages, p.id).map((a) => a.title).join(" / ") || "Raíz",
        emoji: p.icon ?? "📄",
        run: () => {
          selectPage(p.id);
          close();
        },
      }));

    const actions: Item[] = [
      {
        id: "new-page",
        label: "Nueva página",
        sub: "Crear una página en la raíz",
        icon: "plus",
        run: () => {
          createPage(null);
          close();
        },
      },
      {
        id: "theme",
        label: theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro",
        sub: "Apariencia",
        icon: theme === "dark" ? "sun" : "moon",
        run: () => {
          setTheme(theme === "dark" ? "light" : "dark");
          close();
        },
      },
      {
        id: "fullwidth",
        label: "Alternar ancho completo",
        sub: "Vista de la página",
        icon: "panel",
        run: () => {
          toggleFullWidth();
          close();
        },
      },
      {
        id: "duplicate",
        label: "Duplicar página actual",
        icon: "copy",
        run: () => {
          duplicatePage(selectedId);
          close();
        },
      },
      {
        id: "trash",
        label: "Abrir papelera",
        icon: "trash",
        run: () => {
          setUI({ trashOpen: true });
          close();
        },
      },
      {
        id: "share",
        label: "Compartir página",
        icon: "share",
        run: () => {
          setUI({ shareOpen: true });
          close();
        },
      },
      {
        id: "shortcuts",
        label: "Ver atajos de teclado",
        icon: "template",
        run: () => {
          setUI({ shortcutsOpen: true });
          close();
        },
      },
      {
        id: "settings",
        label: "Configuración",
        icon: "settings",
        run: () => {
          setUI({ settingsOpen: true });
          close();
        },
      },
      {
        id: "read-page",
        label: "Leer la página en voz alta",
        sub: "Lectura · ⌘⇧R",
        icon: "volume",
        run: () => {
          readPage(selectedId);
          close();
        },
      },
      {
        id: "read-mode",
        label: reading.mode ? "Salir del modo lectura" : "Modo lectura",
        sub: `Papel ${reading.paper} · ⌘⇧E`,
        icon: "book",
        run: () => {
          setReading({ mode: !reading.mode });
          close();
        },
      },
      {
        id: "mindmap",
        label: "Abrir mapa mental",
        sub: "Convertir la página en mapa · ⌘⇧M",
        icon: "mindmap",
        run: () => {
          setUI({ mindmapOpen: true });
          close();
        },
      },
      {
        id: "pomodoro",
        label: pomodoro.running ? "Pausar Pomodoro" : "Abrir Pomodoro",
        sub: `${pomodoro.running ? "En marcha" : "Enfocado"} · ⌘⇧P`,
        icon: "timer",
        run: () => {
          pomodoro.setPanelOpen(true);
          if (pomodoro.running) pomodoro.pause();
          else pomodoro.start();
          close();
        },
      },
      {
        id: "export-md",
        label: "Exportar la página a Markdown",
        icon: "download",
        run: () => {
          const page = pages[selectedId];
          if (page) {
            downloadFile(
              safeFileName(page.title || "pagina", "md"),
              new Blob([pageToMarkdown(page.title, visibleBlocks(page.blocks))], {
                type: "text/markdown;charset=utf-8",
              }),
            );
          }
          close();
        },
      },
    ];

    return [...pageItems, ...actions];
  }, [
    pages, theme, selectedId, selectPage, createPage, setTheme, toggleFullWidth, duplicatePage,
    setUI, reading.mode, reading.paper, setReading, readPage, pomodoro,
  ]);

  const results = useMemo(() => {
    const term = q.toLowerCase().trim();
    if (!term) {
      // sin búsqueda: acciones primero, después páginas recientes
      return [...items.filter((i) => !i.id.startsWith("page-"))].slice(0, 6).concat(
        items.filter((i) => i.id.startsWith("page-")).slice(0, 8),
      );
    }
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(term) ||
        (i.sub ?? "").toLowerCase().includes(term) ||
        (i.emoji ?? "").includes(term),
    );
  }, [items, q]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center" role="dialog" aria-modal aria-label="Buscar">
      <div className="absolute inset-0 bg-black/25 fade-in" onClick={() => setUI({ paletteOpen: false })} />
      <div className="pop-in relative mt-[12vh] w-[min(640px,92vw)] overflow-hidden rounded-[10px] border border-line bg-surface-pop shadow-menu">
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Icon name="search" size={17} className="text-fg/40" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setUI({ paletteOpen: false });
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => (i + 1) % Math.max(results.length, 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => (i - 1 + results.length) % Math.max(results.length, 1));
              }
              if (e.key === "Enter") {
                e.preventDefault();
                results[index]?.run();
              }
            }}
            placeholder="Buscar páginas o escribir un comando…"
            className="h-[46px] flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg/35"
          />
          <kbd className="rounded-[3px] border border-line px-1.5 py-0.5 text-[11px] text-fg/40">esc</kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {results.length === 0 && (
            <div className="px-3 py-6 text-center text-[13px] text-fg/40">Sin resultados para “{q}”</div>
          )}
          {results.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onMouseEnter={() => setIndex(i)}
              onClick={item.run}
              className={cx(
                "flex w-full items-center gap-2.5 rounded-[5px] px-2 py-[7px] text-left",
                i === index ? "bg-surface-hover" : "hover:bg-surface-hover/60",
              )}
            >
              <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[4px] border border-line text-[13px]">
                {item.emoji ?? <Icon name={item.icon ?? "search"} size={14} className="text-fg/60" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-fg">{item.label}</span>
                {item.sub && <span className="block truncate text-[12px] text-fg/40">{item.sub}</span>}
              </span>
              {i === index && <kbd className="shrink-0 text-[11px] text-fg/35">↵</kbd>}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-line bg-surface-side px-3 py-1.5 text-[11px] text-fg/40">
          <span>↑↓ navegar</span>
          <span>↵ abrir</span>
          <span className="ml-auto">⌘K para cerrar</span>
        </div>
      </div>
    </div>
  );
}
