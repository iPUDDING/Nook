"use client";

import { useState } from "react";
import Icon from "./Icon";
import { usePomodoro } from "./pomodoro/Pomodoro";
import { useReadAloud } from "./tts/useReadAloud";
import { MenuItem, MenuSeparator, Popover } from "./ui";
import { pageToHtml, pageToMarkdown } from "@/lib/markdown";
import { useStore } from "@/lib/store";
import { ancestorsOf, cx, downloadFile, relativeTime, safeFileName, visibleBlocks } from "@/lib/utils";

export default function TopBar() {
  const pages = useStore((s) => s.pages);
  const page = useStore((s) => s.pages[s.selectedId]);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const setUI = useStore((s) => s.setUI);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const fullWidth = useStore((s) => s.fullWidth);
  const toggleFullWidth = useStore((s) => s.toggleFullWidth);
  const selectPage = useStore((s) => s.selectPage);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const trashPage = useStore((s) => s.trashPage);
  const duplicatePage = useStore((s) => s.duplicatePage);
  const reading = useStore((s) => s.reading);
  const setReading = useStore((s) => s.setReading);

  const { speech, readPage, readSelection, toggleRead } = useReadAloud();
  const pomodoro = usePomodoro();

  const [moreOpen, setMoreOpen] = useState(false);

  if (!page) return null;
  const trail = ancestorsOf(pages, page.id);

  return (
    <header
      className={cx(
        "sticky top-0 z-30 flex h-[45px] shrink-0 items-center gap-1 bg-surface/85 px-3 backdrop-blur-md",
        "supports-[backdrop-filter]:bg-surface/70",
      )}
    >
      {/* toggle de sidebar cuando está colapsada */}
      {!sidebarOpen && (
        <button type="button" aria-label="Abrir barra lateral" onClick={toggleSidebar} className="icon-btn">
          <Icon name="panel" size={17} />
        </button>
      )}

      {/* breadcrumbs */}
      <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden text-[14px]">
        {trail.map((a) => (
          <span key={a.id} className="flex min-w-0 items-center">
            <button
              type="button"
              onClick={() => selectPage(a.id)}
              className="max-w-[160px] truncate rounded-[3px] px-1.5 py-1 text-fg/60 transition-colors hover:bg-surface-hover hover:text-fg"
            >
              {a.icon ? <span className="mr-1">{a.icon}</span> : null}
              {a.title || "Sin título"}
            </button>
            <span className="px-0.5 text-fg/25">/</span>
          </span>
        ))}
        <button
          type="button"
          className="max-w-[220px] truncate rounded-[3px] px-1.5 py-1 text-fg/90 transition-colors hover:bg-surface-hover"
        >
          {page.icon ? <span className="mr-1">{page.icon}</span> : null}
          {page.title || "Sin título"}
        </button>
      </nav>

      {/* acciones */}
      <div className="flex shrink-0 items-center gap-0.5">
        <span className="mr-1 hidden text-[13px] text-fg/40 sm:inline">{relativeTime(page.updatedAt)}</span>

        {/* lectura, foco y productividad */}
        <div className="mr-1 flex items-center gap-0.5 rounded-[6px] bg-fg/[0.035] p-0.5">
          <button
            type="button"
            onClick={toggleRead}
            title={speech.status === "idle" ? "Leer la página en voz alta (⌘⇧R)" : "Pausar o reanudar (Espacio)"}
            aria-label={speech.status === "idle" ? "Leer la página en voz alta" : "Pausar o reanudar la lectura"}
            className={cx(
              "icon-btn",
              speech.status !== "idle" && "bg-accent/12 text-accent hover:text-accent",
            )}
          >
            <Icon name={speech.status === "playing" ? "pause" : "play"} size={15} strokeWidth={0} />
          </button>
          <button
            type="button"
            onClick={() => setReading({ mode: !reading.mode })}
            title="Modo lectura (⌘⇧E)"
            aria-label="Alternar modo lectura"
            className={cx("icon-btn", reading.mode && "bg-accent/12 text-accent hover:text-accent")}
          >
            <Icon name="book" size={16} />
          </button>
          <button
            type="button"
            onClick={() => setUI({ mindmapOpen: true })}
            title="Mapa mental de la página (⌘⇧M)"
            aria-label="Abrir mapa mental"
            className="icon-btn"
          >
            <Icon name="mindmap" size={16} />
          </button>
          <button
            type="button"
            onClick={() => pomodoro.setPanelOpen(!pomodoro.panelOpen)}
            title="Pomodoro (⌘⇧P)"
            aria-label="Abrir Pomodoro"
            className={cx(
              "icon-btn tabular-nums",
              pomodoro.running && "bg-[#eb5757]/12 text-[#eb5757] hover:text-[#eb5757]",
            )}
          >
            <Icon name="timer" size={16} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setUI({ shareOpen: true })}
          className="mr-1 hidden h-[28px] items-center rounded-[4px] px-2 text-[14px] font-medium text-fg/75 transition-colors hover:bg-surface-hover hover:text-fg sm:inline-flex"
        >
          Compartir
        </button>

        <button type="button" aria-label="Comentarios" onClick={() => setUI({ shareOpen: true })} className="icon-btn">
          <Icon name="comment" size={17} />
        </button>

        <button
          type="button"
          aria-label={page.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
          onClick={() => toggleFavorite(page.id)}
          className={cx("icon-btn", page.favorite && "text-[#f5b400] hover:text-[#f5b400]")}
        >
          <Icon name={page.favorite ? "star-filled" : "star"} size={17} />
        </button>

        <div className="relative">
          <button
            type="button"
            aria-label="Más"
            onClick={() => setMoreOpen((v) => !v)}
            className="icon-btn"
          >
            <Icon name="dots" size={18} />
          </button>
          <Popover open={moreOpen} onClose={() => setMoreOpen(false)} align="end" width={252}>
            <MenuItem icon={<Icon name={page.favorite ? "star-filled" : "star"} size={15} />} onClick={() => { toggleFavorite(page.id); setMoreOpen(false); }}>
              {page.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
            </MenuItem>
            <MenuItem icon={<Icon name="link" size={15} />} onClick={() => { navigator.clipboard?.writeText(`${location.origin}/?p=${page.id}`); setMoreOpen(false); }}>
              Copiar enlace
            </MenuItem>
            <MenuItem icon={<Icon name="copy" size={15} />} onClick={() => { duplicatePage(page.id); setMoreOpen(false); }}>
              Duplicar
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Icon name="play" size={15} />} onClick={() => { readPage(page.id); setMoreOpen(false); }}>
              Leer en voz alta
            </MenuItem>
            <MenuItem
              icon={<Icon name="volume" size={15} />}
              disabled={!(typeof window !== "undefined" && window.getSelection()?.toString().trim())}
              onClick={() => {
                if (!readSelection()) readPage(page.id);
                setMoreOpen(false);
              }}
            >
              Leer la selección
            </MenuItem>
            <MenuItem icon={<Icon name="mindmap" size={15} />} onClick={() => { setUI({ mindmapOpen: true }); setMoreOpen(false); }}>
              Mapa mental
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<Icon name="download" size={15} />}
              onClick={() => {
                downloadFile(
                  safeFileName(page.title || "pagina", "md"),
                  new Blob([pageToMarkdown(page.title, visibleBlocks(page.blocks))], { type: "text/markdown;charset=utf-8" }),
                );
                setMoreOpen(false);
              }}
            >
              Exportar Markdown
            </MenuItem>
            <MenuItem
              icon={<Icon name="download" size={15} />}
              onClick={() => {
                downloadFile(
                  safeFileName(page.title || "pagina", "html"),
                  new Blob([pageToHtml(page.title, visibleBlocks(page.blocks))], { type: "text/html;charset=utf-8" }),
                );
                setMoreOpen(false);
              }}
            >
              Exportar HTML
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Icon name="type" size={15} />} onClick={() => { toggleFullWidth(); setMoreOpen(false); }}>
              {fullWidth ? "Ancho normal" : "Ancho completo"}
            </MenuItem>
            <MenuItem
              icon={<Icon name={theme === "dark" ? "sun" : "moon"} size={15} />}
              onClick={() => { setTheme(theme === "dark" ? "light" : "dark"); setMoreOpen(false); }}
            >
              {theme === "dark" ? "Modo claro" : "Modo oscuro"}
            </MenuItem>
            <MenuItem icon={<Icon name="template" size={15} />} onClick={() => { setUI({ shortcutsOpen: true }); setMoreOpen(false); }}>
              Atajos de teclado
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Icon name="trash" size={15} />} danger onClick={() => { trashPage(page.id); setMoreOpen(false); }}>
              Mover a la papelera
            </MenuItem>
          </Popover>
        </div>
      </div>
    </header>
  );
}
