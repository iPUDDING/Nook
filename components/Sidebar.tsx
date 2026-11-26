"use client";

import { useMemo, useRef, useState } from "react";
import Icon, { type IconName } from "./Icon";
import { MenuItem, MenuSeparator, Popover } from "./ui";
import { inferTitle, markdownToBlocks } from "@/lib/markdown";
import { useStore } from "@/lib/store";
import type { Page } from "@/lib/types";
import { childrenOf, cx, uid } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Un nodo del árbol (recursivo)                                              */
/* -------------------------------------------------------------------------- */
function PageNode({
  page,
  depth,
  renamingId,
  setRenamingId,
}: {
  page: Page;
  depth: number;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
}) {
  const pages = useStore((s) => s.pages);
  const selectedId = useStore((s) => s.selectedId);
  const expanded = useStore((s) => s.expanded);
  const selectPage = useStore((s) => s.selectPage);
  const toggleExpanded = useStore((s) => s.toggleExpanded);
  const createPage = useStore((s) => s.createPage);
  const updatePage = useStore((s) => s.updatePage);
  const duplicatePage = useStore((s) => s.duplicatePage);
  const trashPage = useStore((s) => s.trashPage);
  const toggleFavorite = useStore((s) => s.toggleFavorite);

  const [menuOpen, setMenuOpen] = useState(false);
  const kids = useMemo(() => childrenOf(pages, page.id), [pages, page.id]);
  const isOpen = expanded[page.id] ?? false;
  const active = selectedId === page.id;
  const hasKids = kids.length > 0;

  return (
    <div>
      <div
        className={cx(
          "group relative flex h-[27px] items-center rounded-[4px] pr-1 transition-colors",
          active ? "bg-surface-active" : "hover:bg-surface-hover",
        )}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        {/* chevron de expansión */}
        <button
          type="button"
          aria-label={isOpen ? "Contraer" : "Expandir"}
          onClick={(e) => {
            e.stopPropagation();
            toggleExpanded(page.id);
          }}
          className={cx(
            "mr-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] text-fg/45 transition-opacity hover:bg-fg/[0.06] hover:text-fg/70",
            hasKids ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          <Icon name="chevron-right" size={12} className={cx("transition-transform", isOpen && "rotate-90")} />
        </button>

        <button
          type="button"
          onClick={() => selectPage(page.id)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-[13px] leading-none">
            {page.icon ?? <span className="text-fg/40">·</span>}
          </span>
          {renamingId === page.id ? (
            <input
              autoFocus
              defaultValue={page.title}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                updatePage(page.id, { title: e.target.value.trim() });
                setRenamingId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setRenamingId(null);
              }}
              className="min-w-0 flex-1 rounded-[3px] bg-transparent text-[14px] text-fg outline-none ring-1 ring-accent/60"
            />
          ) : (
            <span className={cx("truncate text-[14px]", active ? "font-medium text-fg" : "text-fg/80")}>
              {page.title || "Sin título"}
            </span>
          )}
        </button>

        {/* acciones al hover */}
        <div className="ml-1 flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            aria-label="Agregar subpágina"
            onClick={(e) => {
              e.stopPropagation();
              createPage(page.id);
              if (!isOpen) toggleExpanded(page.id);
            }}
            className="flex h-[20px] w-[20px] items-center justify-center rounded-[3px] text-fg/45 hover:bg-fg/[0.08] hover:text-fg/80"
          >
            <Icon name="plus" size={14} />
          </button>
          <div className="relative">
            <button
              type="button"
              aria-label="Más opciones"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              className="flex h-[20px] w-[20px] items-center justify-center rounded-[3px] text-fg/45 hover:bg-fg/[0.08] hover:text-fg/80"
            >
              <Icon name="dots" size={14} />
            </button>
            <Popover
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              align="start"
              width={228}
              className="left-0"
            >
              <MenuItem icon={<Icon name="trash" size={15} />} danger onClick={() => { trashPage(page.id); setMenuOpen(false); }}>
                Mover a la papelera
              </MenuItem>
              <MenuItem icon={<Icon name="copy" size={15} />} onClick={() => { duplicatePage(page.id); setMenuOpen(false); }}>
                Duplicar
              </MenuItem>
              <MenuItem icon={<Icon name="type" size={15} />} onClick={() => { setRenamingId(page.id); setMenuOpen(false); }}>
                Renombrar
              </MenuItem>
              <MenuItem
                icon={<Icon name={page.favorite ? "star-filled" : "star"} size={15} />}
                onClick={() => { toggleFavorite(page.id); setMenuOpen(false); }}
              >
                {page.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Icon name="link" size={15} />} onClick={() => { navigator.clipboard?.writeText(`${location.origin}/?p=${page.id}`); setMenuOpen(false); }}>
                Copiar enlace
              </MenuItem>
              <MenuItem icon={<Icon name="plus" size={15} />} onClick={() => { createPage(page.id); setMenuOpen(false); }}>
                Agregar subpágina
              </MenuItem>
            </Popover>
          </div>
        </div>
      </div>

      {hasKids && isOpen ? (
        <div>
          {kids.map((k) => (
            <PageNode key={k.id} page={k} depth={depth + 1} renamingId={renamingId} setRenamingId={setRenamingId} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Fila de utilidad (Search / Home / Inbox / Settings)                        */
/* -------------------------------------------------------------------------- */
function UtilRow({
  icon,
  label,
  onClick,
  right,
  active,
}: {
  icon: IconName;
  label: string;
  onClick?: () => void;
  right?: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex h-[27px] w-full items-center gap-2 rounded-[4px] px-[6px] text-left text-[14px] transition-colors",
        active ? "bg-surface-active text-fg" : "text-fg/80 hover:bg-surface-hover",
      )}
    >
      <span className="flex h-[18px] w-[18px] items-center justify-center text-fg/55">
        <Icon name={icon} size={16} />
      </span>
      <span className="flex-1 truncate">{label}</span>
      {right}
    </button>
  );
}

export default function Sidebar() {
  const pages = useStore((s) => s.pages);
  const selectedId = useStore((s) => s.selectedId);
  const expanded = useStore((s) => s.expanded);
  const selectPage = useStore((s) => s.selectPage);
  const toggleExpanded = useStore((s) => s.toggleExpanded);
  const createPage = useStore((s) => s.createPage);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const setUI = useStore((s) => s.setUI);
  const resetWorkspace = useStore((s) => s.resetWorkspace);

  const [wsOpen, setWsOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [collapsedTeams, setCollapsedTeams] = useState<Record<string, boolean>>({});
  const [dropActive, setDropActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /** importa .md / .txt como página nueva con bloques reales */
  const importFiles = async (files: FileList | File[]) => {
    const MAX = 4 * 1024 * 1024; // más que esto no es un documento de notas
    let count = 0;
    for (const file of Array.from(files)) {
      if (file.size > MAX) {
        alert(`"${file.name}" supera los 4 MB. Abrí archivos de texto o Markdown.`);
        continue;
      }
      try {
        const text = await file.text();
        const blocks = markdownToBlocks(text, () => uid("blk"));
        const title = inferTitle(blocks, file.name.replace(/\.[^.]+$/, ""));
        createPage(null, { title, icon: "📄", blocks });
        count += 1;
      } catch {
        alert(`No se pudo importar "${file.name}".`);
      }
    }
    if (count > 1) setUI({ paletteOpen: false });
  };

  const favorites = Object.values(pages).filter((p) => p.favorite && !p.trashed);
  const trashedCount = Object.values(pages).filter((p) => p.trashed).length;
  const roots = {
    private: childrenOf(pages, null).filter((p) => p.space === "private"),
    team: childrenOf(pages, null).filter((p) => p.space === "team"),
  };

  return (
    <aside
      className={cx(
        "flex h-full w-[240px] shrink-0 flex-col border-r border-line bg-surface-side text-fg/80 select-none",
        dropActive && "ring-2 ring-inset ring-accent/50",
      )}
      aria-label="Barra lateral"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files?.length) return;
        e.preventDefault();
        setDropActive(false);
        void importFiles(e.dataTransfer.files);
      }}
    >
      {/* ---------------------------- workspace ---------------------------- */}
      <div className="relative px-2 pt-2">
        <button
          type="button"
          onClick={() => setWsOpen((v) => !v)}
          className="flex h-[40px] w-full items-center gap-2 rounded-[4px] px-2 transition-colors hover:bg-surface-hover"
        >
          <span className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[4px] bg-[#37352f] text-[11px] font-bold text-white">
            N
          </span>
          <span className="min-w-0 flex-1 truncate text-left text-[14px] font-medium text-fg">Acme Inc</span>
          <Icon name="chevron-down" size={13} className="shrink-0 text-fg/45" />
        </button>

        <Popover open={wsOpen} onClose={() => setWsOpen(false)} width={260} className="-left-1">
          <div className="flex items-center gap-2 px-2 py-2">
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[5px] bg-[#37352f] text-[12px] font-bold text-white">
              N
            </span>
            <div className="min-w-0">
              <div className="truncate text-[14px] font-medium text-fg">Acme Inc</div>
              <div className="text-[12px] text-fg/45">Plan gratuito · 5 miembros</div>
            </div>
          </div>
          <MenuSeparator />
          <MenuItem icon={<Icon name="user" size={15} />}>Invitar a miembros</MenuItem>
          <MenuItem icon={<Icon name="settings" size={15} />} onClick={() => { setUI({ settingsOpen: true }); setWsOpen(false); }}>
            Configuración
          </MenuItem>
          <MenuItem icon={<Icon name="template" size={15} />}>Plantillas</MenuItem>
          <MenuSeparator />
          <MenuItem
            icon={<Icon name="arrow-down" size={15} />}
            onClick={() => {
              if (confirm("¿Restablecer el workspace a los datos de ejemplo? Se pierden tus cambios.")) resetWorkspace();
              setWsOpen(false);
            }}
          >
            Restablecer datos de ejemplo
          </MenuItem>
        </Popover>
      </div>

      {/* ---------------------------- utilidades ---------------------------- */}
      <div className="mt-1 space-y-px px-2">
        <UtilRow icon="search" label="Buscar" onClick={() => setUI({ paletteOpen: true })} right={<span className="text-[12px] text-fg/35">⌘K</span>} />
        <UtilRow icon="home" label="Inicio" onClick={() => {
          const home = Object.values(pages).find((p) => !p.trashed && p.parentId === null && p.favorite) ?? childrenOf(pages, null)[0];
          if (home) selectPage(home.id);
        }} />
        <UtilRow icon="inbox" label="Bandeja de entrada" onClick={() => setUI({ paletteOpen: true })} right={
          <span className="flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#eb5757] px-1 text-[10px] font-semibold text-white">3</span>
        } />
        <UtilRow icon="settings" label="Configuración" onClick={() => setUI({ settingsOpen: true })} />
      </div>

      <div className="mx-2 my-2 h-px bg-line" />

      {/* ------------------------------ scroll ------------------------------ */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {/* Favoritos */}
        {favorites.length > 0 && (
          <section className="mb-3">
            <div className="flex h-[24px] items-center justify-between px-[6px] text-[11px] font-semibold uppercase tracking-wide text-fg/40">
              Favoritos
            </div>
            {favorites.map((p) => (
              <div
                key={p.id}
                className={cx(
                  "group flex h-[27px] items-center gap-1.5 rounded-[4px] px-[6px] text-[14px] transition-colors",
                  selectedId === p.id ? "bg-surface-active text-fg" : "hover:bg-surface-hover",
                )}
              >
                <span className="flex h-[18px] w-[18px] items-center justify-center text-[13px]">{p.icon ?? "📄"}</span>
                <button type="button" onClick={() => selectPage(p.id)} className="min-w-0 flex-1 truncate text-left">
                  {p.title || "Sin título"}
                </button>
              </div>
            ))}
          </section>
        )}

        {/* Teamspaces */}
        {(["private", "team"] as const).map((space) => {
          const label = space === "private" ? "Privado" : "Equipo";
          const items = roots[space];
          const collapsed = collapsedTeams[space];
          return (
            <section key={space} className="mb-2">
              <div className="group flex h-[24px] items-center justify-between px-[2px]">
                <button
                  type="button"
                  onClick={() => setCollapsedTeams((c) => ({ ...c, [space]: !c[space] }))}
                  className="flex min-w-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-fg/40 hover:text-fg/60"
                >
                  <Icon name="chevron-right" size={11} className={cx("transition-transform", !collapsed && "rotate-90")} />
                  <span className="truncate">{label}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Nueva página en ${label}`}
                  onClick={() => createPage(null, { space })}
                  className="flex h-[18px] w-[18px] items-center justify-center rounded-[3px] text-fg/40 opacity-0 transition-opacity hover:bg-fg/[0.08] hover:text-fg/70 group-hover:opacity-100"
                >
                  <Icon name="plus" size={13} />
                </button>
              </div>

              {!collapsed &&
                items.map((p) => (
                  <PageNode
                    key={p.id}
                    page={p}
                    depth={0}
                    renamingId={renamingId}
                    setRenamingId={setRenamingId}
                  />
                ))}
              {!collapsed && items.length === 0 && (
                <button
                  type="button"
                  onClick={() => createPage(null, { space })}
                  className="flex h-[27px] w-full items-center gap-1.5 rounded-[4px] px-[6px] text-[13px] text-fg/45 hover:bg-surface-hover"
                >
                  <Icon name="plus" size={13} /> Nueva página
                </button>
              )}
            </section>
          );
        })}
      </div>

      {/* ------------------------------ footer ------------------------------ */}
      <div className="space-y-px border-t border-line px-2 py-2">
        <UtilRow icon="plus" label="Nueva página" onClick={() => createPage(null)} />
        <UtilRow icon="template" label="Plantillas" onClick={() => setUI({ paletteOpen: true })} />
        <UtilRow icon="upload" label="Importar Markdown" onClick={() => fileRef.current?.click()} />
        <input
          ref={fileRef}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void importFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <UtilRow
          icon="trash"
          label="Papelera"
          onClick={() => setUI({ trashOpen: true })}
          right={trashedCount > 0 ? <span className="text-[12px] text-fg/40">{trashedCount}</span> : undefined}
        />
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex h-[27px] w-full items-center gap-2 rounded-[4px] px-[6px] text-left text-[14px] text-fg/60 transition-colors hover:bg-surface-hover"
        >
          <span className="flex h-[18px] w-[18px] items-center justify-center">
            <Icon name="panel" size={16} />
          </span>
          <span className="flex-1">Contraer barra</span>
          <span className="text-[12px] text-fg/35">⌘\</span>
        </button>
      </div>

      {/* mantiene el árbol expandido al cambiar de página */}
      <span className="hidden">{Object.keys(expanded).length}</span>
    </aside>
  );
}
