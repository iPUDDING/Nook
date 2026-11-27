"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DatabaseView from "./Database";
import FolderView from "./FolderView";
import Editor from "./Editor";
import FindBar from "./FindBar";
import Icon from "./Icon";
import IconPicker from "./IconPicker";
import PageIcon from "./PageIcon";
import { MenuItem, MenuSeparator, Popover } from "./ui";
import { clampZoom, requestBlockFocus, useStore } from "@/lib/store";
import { countChars, countWords, estimateMinutes, htmlToText } from "@/lib/speech";
import type { Page } from "@/lib/types";
import { COVERS, COVER_BY_ID, cx, relativeTime, visibleBlocks } from "@/lib/utils";

function CoverPicker({
  open,
  onClose,
  onPick,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (id: string) => void;
  onRemove: () => void;
}) {
  return (
    <Popover open={open} onClose={onClose} width={288} className="left-0 top-[calc(100%+6px)] p-2">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg/40">Galería</div>
      <div className="grid max-h-[200px] grid-cols-3 gap-1.5 overflow-y-auto">
        {COVERS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              onPick(c.id);
              onClose();
            }}
            className="h-[44px] rounded-[4px] ring-1 ring-inset ring-black/5 transition-transform hover:scale-[1.03]"
            style={{ background: c.css }}
            title={c.name}
          />
        ))}
      </div>
      <MenuSeparator />
      <MenuItem icon={<Icon name="x" size={14} />} onClick={() => { onRemove(); onClose(); }}>
        Quitar portada
      </MenuItem>
    </Popover>
  );
}

export default function PageView({ page }: { page: Page }) {
  const updatePage = useStore((s) => s.updatePage);
  const zoom = useStore((s) => s.zoom);
  const setZoom = useStore((s) => s.setZoom);
  const toggleLock = useStore((s) => s.toggleLock);
  const fullWidth = useStore((s) => s.fullWidth);
  const readingMode = useStore((s) => s.reading.mode);

  /** estadísticas del documento: lo que el visor original muestra en el índice */
  const stats = useMemo(() => {
    const text = visibleBlocks(page.blocks)
      .map((b) => htmlToText(b.html))
      .join(" ");
    const words = countWords(text);
    return { words, chars: countChars(text), minutes: estimateMinutes(words) };
  }, [page.blocks]);
  const [iconOpen, setIconOpen] = useState(false);
  /** el aviso con el porcentaje aparece al cambiar el zoom y se va solo */
  const [avisoZoom, setAvisoZoom] = useState(false);
  /** buscar y reemplazar dentro de la página corta largo y no depende del navegador */
  const [findOpen, setFindOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // textarea que crece con el contenido, como el título del original
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [page.title, page.id, fullWidth]);

  const cover = COVER_BY_ID(page.cover);
  const locked = !!page.locked;

  /**
   * Zoom con la rueda: Ctrl/⌘ + rueda sobre el contenido, como en cualquier
   * navegador. Sin el modificador la rueda sigue desplazando, que es lo que hace
   * el 99 % de las veces.
   *
   * El listener es nativo y no pasivo porque hay que frenar el zoom propio del
   * navegador (`preventDefault`) — con `onWheel` de React, que es pasivo, el
   * navegador agranda toda la interfaz y no se puede evitar.
   */
  useEffect(() => {
    let ultimo = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const destino = e.target as HTMLElement | null;
      if (!destino?.closest?.("[data-zoom-scope]")) return;
      e.preventDefault();
      const ahora = Date.now();
      // un trackpad manda decenas de eventos por gesto: sin freno, un pellizco
      // salta del 50 al 200 %
      if (ahora - ultimo < 90) return;
      ultimo = ahora;
      const actual = useStore.getState().zoom;
      setZoom(clampZoom(actual + (e.deltaY < 0 ? 10 : -10)));
      setAvisoZoom(true);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [setZoom]);

  // el aviso se apaga solo
  useEffect(() => {
    if (!avisoZoom) return;
    const t = window.setTimeout(() => setAvisoZoom(false), 1200);
    return () => window.clearTimeout(t);
  }, [avisoZoom, zoom]);

  // ⌘F / Ctrl+F abre la búsqueda de la página en lugar del buscar del navegador
  const puedeBuscar = !page.database && !page.isFolder;
  useEffect(() => {
    if (!puedeBuscar) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFindOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [puedeBuscar]);

  // cambiar de página cierra la barra: buscaría en la anterior
  useEffect(() => {
    setFindOpen(false);
  }, [page.id]);

  return (
    <>
      {findOpen && puedeBuscar && <FindBar page={page} onClose={() => setFindOpen(false)} />}
      {(avisoZoom || zoom !== 100) && (
        <div
          data-zoom-chip
          data-zoom-value={zoom}
          className={cx(
            "fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full border border-line px-2.5 py-1 text-[12px] tabular-nums shadow-sm transition-opacity",
            avisoZoom ? "opacity-100" : "opacity-0",
            "bg-surface text-fg/70",
          )}
        >
          <span className="font-medium">{zoom}%</span>
          <button
            type="button"
            data-zoom-reset
            onClick={() => setZoom(100)}
            className="ml-2 text-fg/45 hover:text-fg/80"
          >
            restablecer
          </button>
        </div>
      )}
      <div
        className="relative min-h-full"
        data-zoom-scope
        data-page-zoom={zoom}
        style={{ zoom: zoom / 100 }}
      >
      {/* ------------------------------- portada ------------------------------ */}
      {cover ? (
        <div className="group/cover relative h-[180px] w-full" style={{ background: cover }}>
          <div className="reading-hide absolute bottom-2 right-3 flex gap-1 opacity-0 transition-opacity group-hover/cover:opacity-100">
            <div className="relative">
              <button
                type="button"
                onClick={() => setCoverOpen(true)}
                className="rounded-[4px] bg-black/35 px-2 py-1 text-[12px] font-medium text-white backdrop-blur hover:bg-black/50"
              >
                Cambiar portada
              </button>
              <CoverPicker
                open={coverOpen}
                onClose={() => setCoverOpen(false)}
                onPick={(id) => updatePage(page.id, { cover: id })}
                onRemove={() => updatePage(page.id, { cover: null })}
              />
            </div>
            <button
              type="button"
              onClick={() => updatePage(page.id, { cover: null })}
              className="rounded-[4px] bg-black/35 px-2 py-1 text-[12px] font-medium text-white backdrop-blur hover:bg-black/50"
            >
              Quitar
            </button>
          </div>
        </div>
      ) : null}

      <div
        className={cx(
          "mx-auto w-full px-6 sm:px-12",
          // Las páginas con base de datos necesitan más ancho: la tabla tiene 8
          // columnas y el board muestra 4 columnas fijas de 248px.
          fullWidth || page.database ? "max-w-full" : "max-w-[820px]",
          page.database && !fullWidth ? "lg:max-w-[1180px]" : "",
          cover ? "pt-0" : "pt-10",
        )}
      >
        {/* -------------------------------- icono ------------------------------- */}
        <div className={cx("relative", cover ? "-mt-[34px]" : "")}>
          {page.icon ? (
            <div className="group/icon relative inline-block">
              <button
                type="button"
                onClick={() => setIconOpen((v) => !v)}
                className="rounded-[6px] px-1 transition-colors hover:bg-surface-hover"
                aria-label="Cambiar icono"
              >
                <PageIcon icon={page.icon} size={62} />
              </button>
              <IconPicker
                open={iconOpen}
                onClose={() => setIconOpen(false)}
                onPick={(e) => updatePage(page.id, { icon: e })}
                onRemove={() => updatePage(page.id, { icon: null })}
              />
            </div>
          ) : (
            <div className="reading-hide mb-1 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/page:opacity-100 [div:hover>&]:opacity-100">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIconOpen((v) => !v)}
                  className="toolbar-btn text-[13px] text-fg/45"
                >
                  😀 Agregar icono
                </button>
                <IconPicker
                  open={iconOpen}
                  onClose={() => setIconOpen(false)}
                  onPick={(e) => updatePage(page.id, { icon: e })}
                  onRemove={() => updatePage(page.id, { icon: null })}
                />
              </div>
              {!page.cover && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setCoverOpen((v) => !v)}
                    className="toolbar-btn text-[13px] text-fg/45"
                  >
                    🖼️ Agregar portada
                  </button>
                  <CoverPicker
                    open={coverOpen}
                    onClose={() => setCoverOpen(false)}
                    onPick={(id) => updatePage(page.id, { cover: id })}
                    onRemove={() => updatePage(page.id, { cover: null })}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* -------------------------------- título ------------------------------ */}
        <textarea
          ref={titleRef}
          key={page.id}
          data-tts-title
          rows={1}
          readOnly={locked}
          defaultValue={page.title}
          placeholder="Sin título"
          spellCheck={false}
          onChange={(e) => updatePage(page.id, { title: e.target.value.replace(/\n/g, "") })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const first = page.blocks[0];
              if (first) requestBlockFocus(first.id, "end");
            }
          }}
          className="mt-1 w-full resize-none overflow-hidden bg-transparent text-[40px] font-bold leading-[1.15] tracking-[-0.02em] text-fg outline-none placeholder:text-fg/20"
        />

        {locked && (
          <div
            data-lock-badge
            className="mb-1 mt-1 flex items-center gap-2 rounded-[5px] border border-line bg-surface-hover/60 px-2.5 py-1.5 text-[12.5px] text-fg/65"
          >
            <Icon name="lock" size={13} className="shrink-0 text-fg/50" />
            <span>
              Página bloqueada. No se puede editar hasta desbloquearla.
            </span>
            <button
              type="button"
              data-lock-toggle
              onClick={() => toggleLock(page.id)}
              className="ml-auto shrink-0 rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium text-accent hover:bg-surface-hover"
            >
              Desbloquear <kbd className="ml-1 text-fg/35">⌘⇧B</kbd>
            </button>
          </div>
        )}

        {/* ------------------------------- contenido ---------------------------- */}
        {/* `inert` corta teclado, clic y foco de todo el contenido de una vez */}
        <div className="mt-1" inert={locked}>
          {page.isFolder ? (
            <FolderView key={page.id} page={page} />
          ) : page.database ? (
            <DatabaseView page={page} />
          ) : (
            <Editor key={page.id} page={page} />
          )}
        </div>

        {/* ------------------------------- footer ------------------------------- */}
        <div className="mb-24 mt-10 flex items-center gap-2 border-t border-line pt-3 text-[12px] text-fg/35">
          <Icon name="clock" size={13} />
          <span>Editado {relativeTime(page.updatedAt)}</span>
          <span>·</span>
          <span>{page.blocks.length} bloques</span>
          <span>·</span>
          <span>{page.database ? `${page.database.rows.length} filas` : `${stats.words} palabras`}</span>
          {!page.database && (
            <>
              <span>·</span>
              <span>{stats.minutes} min de lectura</span>
            </>
          )}
        </div>
      </div>
      </div>
    </>
  );
}
