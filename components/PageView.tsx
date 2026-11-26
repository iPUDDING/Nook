"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DatabaseView from "./Database";
import Editor from "./Editor";
import Icon from "./Icon";
import { MenuItem, MenuSeparator, Popover } from "./ui";
import { requestBlockFocus, useStore } from "@/lib/store";
import { countChars, countWords, estimateMinutes, htmlToText } from "@/lib/speech";
import type { Page } from "@/lib/types";
import { COVERS, COVER_BY_ID, EMOJIS, cx, relativeTime, visibleBlocks } from "@/lib/utils";

function EmojiPicker({
  open,
  onClose,
  onPick,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
  onRemove: () => void;
}) {
  const [q, setQ] = useState("");
  const list = EMOJIS.filter((e) => e.includes(q.trim()));
  return (
    <Popover open={open} onClose={onClose} width={264} className="left-0 top-[calc(100%+6px)] p-2">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar emoji…"
        className="mb-2 w-full rounded-[4px] border border-line bg-surface px-2 py-1 text-[13px] outline-none placeholder:text-fg/35 focus:border-accent/50"
      />
      <div className="grid max-h-[176px] grid-cols-8 gap-0.5 overflow-y-auto">
        {list.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => {
              onPick(e);
              onClose();
            }}
            className="flex h-[28px] w-[28px] items-center justify-center rounded-[4px] text-[17px] hover:bg-surface-hover"
          >
            {e}
          </button>
        ))}
      </div>
      <MenuSeparator />
      <MenuItem icon={<Icon name="x" size={14} />} onClick={() => { onRemove(); onClose(); }}>
        Quitar icono
      </MenuItem>
    </Popover>
  );
}

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

  return (
    <div className="relative min-h-full">
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
                className="rounded-[6px] px-1 text-[64px] leading-[1.1] transition-colors hover:bg-surface-hover"
                aria-label="Cambiar icono"
              >
                {page.icon}
              </button>
              <EmojiPicker
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
                <EmojiPicker
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

        {/* ------------------------------- contenido ---------------------------- */}
        <div className="mt-1">
          {page.database ? <DatabaseView page={page} /> : <Editor key={page.id} page={page} />}
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
  );
}
