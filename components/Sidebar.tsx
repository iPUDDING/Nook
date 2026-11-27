"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon, { type IconName } from "./Icon";
import PageIcon from "./PageIcon";
import { MenuItem, MenuSeparator, Popover } from "./ui";
import { inferTitle, markdownToBlocks } from "@/lib/markdown";
import FilePreview from "./FilePreview";
import { planInfo, planLabel } from "@/lib/plan";
import { formatBytes } from "@/lib/files";
import { useStore } from "@/lib/store";
import type { Page } from "@/lib/types";
import { childrenOf, cx, uid } from "@/lib/utils";

/**
 * Tipo propio para arrastrar un archivo del árbol.
 * Se usa un MIME propio y no `text/plain` para no confundir el arrastre interno
 * con soltar archivos del sistema (que la barra lateral importa como páginas).
 */
const MIME_ARCHIVO = "application/x-nook-file";
/** tipo propio para arrastrar una página dentro del árbol */
const MIME_PAGINA = "application/x-nook-page";

/**
 * Página que se está arrastrando ahora mismo.
 * Durante `dragover` el navegador no deja leer `dataTransfer.getData`, así que el
 * id se guarda acá en el `dragstart` y se limpia en `dragend`.
 */
let paginaArrastrada: string | null = null;

/**
 * Fila que está mostrando el indicador de destino.
 * Chromium manda `dragleave` con coordenadas 0 en mitad de un arrastre nativo, y
 * mirar sólo `relatedTarget` dejaba el indicador apagándose en cada frame. Con
 * un único dueño del resaltado, pasar a otra fila apaga la anterior sin
 * depender de esos eventos.
 */
let zonaVisible: HTMLElement | null = null;

/** pinta el indicador de destino sin pasar por el estado de React */
function pintarZona(el: HTMLElement, z: Exclude<Zona, null> | "archivo") {
  if (zonaVisible && zonaVisible !== el) limpiarZona();
  zonaVisible = el;
  if (z === "archivo") {
    el.dataset.dropFile = "1";
    delete el.dataset.dropZone;
  } else {
    el.dataset.dropZone = z;
    delete el.dataset.dropFile;
  }
}

function limpiarZona() {
  if (zonaVisible) {
    delete zonaVisible.dataset.dropZone;
    delete zonaVisible.dataset.dropFile;
  }
  zonaVisible = null;
}

/** el indicador de la zona está puesto en esta fila */
const conZona = (el: HTMLElement | null) => !!el && !!el.dataset.dropZone;

/** dónde caería la página soltada según la altura del puntero sobre la fila */
type Zona = "antes" | "dentro" | "despues" | null;

function zonaEnPunto(fila: HTMLElement, clientY: number): Exclude<Zona, null> {
  const r = fila.getBoundingClientRect();
  const y = (clientY - r.top) / Math.max(1, r.height);
  if (y < 0.28) return "antes";
  if (y > 0.72) return "despues";
  return "dentro";
}

function arrastraPagina(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types).includes(MIME_PAGINA);
}

/** ¿el arrastre que está en curso lleva un archivo del árbol? */
function arrastraArchivo(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types).includes(MIME_ARCHIVO);
}

/**
 * Ids de la página y de todo lo que cuelga de ella.
 * Sirve para que "Mover a…" no ofrezca el propio subárbol como destino: mover
 * una página dentro de su hijo la dejaría huérfana en el árbol, fuera de la raíz.
 */
function subarbol(pages: Record<string, Page>, id: string): Set<string> {
  const out = new Set<string>([id]);
  const cola = [id];
  let guardia = 0;
  while (cola.length && guardia < 5000) {
    const actual = cola.shift()!;
    for (const p of Object.values(pages)) {
      if (p.parentId === actual && !out.has(p.id)) {
        out.add(p.id);
        cola.push(p.id);
      }
    }
    guardia += 1;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Un nodo del árbol (recursivo)                                              */
/* -------------------------------------------------------------------------- */
function PageNode({
  page,
  depth,
  renamingId,
  setRenamingId,
  onPreviewFile,
}: {
  page: Page;
  depth: number;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  onPreviewFile: (id: string) => void;
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
  const toggleLock = useStore((s) => s.toggleLock);
  const createFolder = useStore((s) => s.createFolder);
  const movePage = useStore((s) => s.movePage);
  const moveFile = useStore((s) => s.moveFile);
  const files = useStore((s) => s.files);


  const [menuOpen, setMenuOpen] = useState(false);
  /** panel de "Mover a…" dentro del mismo menú, como el submenú del original */
  const [moverOpen, setMoverOpen] = useState(false);
  const [moverQ, setMoverQ] = useState("");
  const kids = useMemo(() => childrenOf(pages, page.id), [pages, page.id]);
  const propios = useMemo(
    () => files.filter((f) => f.folderId === page.id).sort((a, b) => a.name.localeCompare(b.name)),
    [files, page.id],
  );
  /** destinos posibles: toda página fuera del propio subárbol, con su nivel */
  const destinos = useMemo(() => {
    if (!menuOpen || !moverOpen) return [];
    const excluir = subarbol(pages, page.id);
    const q = moverQ.trim().toLowerCase();
    return Object.values(pages)
      .filter((p) => !p.trashed && !excluir.has(p.id))
      .map((p) => {
        let nivel = 0;
        let actual = p;
        while (actual.parentId && pages[actual.parentId] && nivel < 20) {
          actual = pages[actual.parentId];
          nivel += 1;
        }
        return { page: p, nivel };
      })
      .filter((d) => !q || d.page.title.toLowerCase().includes(q))
      .sort((a, b) => a.page.title.localeCompare(b.page.title, "es"));
  }, [menuOpen, moverOpen, pages, page.id, moverQ]);

  const isOpen = expanded[page.id] ?? false;
  const active = selectedId === page.id;
  const hasKids = kids.length > 0;

  return (
    <div>
      <div
        data-page-row={page.id}
        draggable
        onDragStart={(e) => {
          // arrastrar desde un control (favoritos, menú) no debe mover la página
          if ((e.target as HTMLElement).closest("button,input")) {
            e.preventDefault();
            return;
          }
          paginaArrastrada = page.id;
          e.dataTransfer.setData(MIME_PAGINA, page.id);
          e.dataTransfer.setData("text/plain", page.title || "Sin título");
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          paginaArrastrada = null;
          limpiarZona();
        }}
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
          onClick={() => {
            selectPage(page.id);
            // en una carpeta, entrar es también desplegarla: como en un
            // explorador, no tiene sentido tener que abrirla dos veces
            if (page.isFolder && !isOpen) toggleExpanded(page.id);
          }}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-[13px] leading-none">
            {page.icon ? (
              <PageIcon icon={page.icon} size={14} />
            ) : page.isFolder ? (
              <Icon name="folder" size={14} className="text-fg/45" />
            ) : (
              <span className="text-fg/40">·</span>
            )}
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
            <>
              <span className={cx("truncate text-[14px]", active ? "font-medium text-fg" : "text-fg/80")}>
                {page.title || "Sin título"}
              </span>
              {page.locked && (
                <span data-page-locked className="ml-1 flex shrink-0 items-center text-fg/35">
                  <Icon name="lock" size={11} />
                </span>
              )}
            </>
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
                setMoverOpen(false);
                setMoverQ("");
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
              {moverOpen ? (
                <div data-move-panel className="p-1">
                  <button
                    type="button"
                    onClick={() => setMoverOpen(false)}
                    className="mb-1 flex items-center gap-1 rounded-[3px] px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-fg/45 hover:bg-surface-hover"
                  >
                    <Icon name="chevron-left" size={12} /> Mover a…
                  </button>
                  <input
                    autoFocus
                    value={moverQ}
                    onChange={(e) => setMoverQ(e.target.value)}
                    placeholder="Buscar destino…"
                    data-move-search
                    className="mb-1 w-full rounded-[4px] border border-line bg-surface px-2 py-1 text-[12.5px] outline-none placeholder:text-fg/35 focus:border-accent/50"
                  />
                  <div className="max-h-[220px] overflow-y-auto">
                    <button
                      type="button"
                      data-move-target="raiz"
                      onClick={() => {
                        movePage(page.id, null);
                        setMenuOpen(false);
                        setMoverOpen(false);
                      }}
                      className="flex w-full items-center gap-1.5 rounded-[3px] px-1.5 py-[5px] text-left text-[13px] text-fg/75 hover:bg-surface-hover"
                    >
                      <Icon name="home" size={13} className="shrink-0 text-fg/40" /> Sin página (raíz)
                    </button>
                    {destinos.map((d) => (
                      <button
                        key={d.page.id}
                        type="button"
                        data-move-target={d.page.id}
                        onClick={() => {
                          movePage(page.id, d.page.id);
                          setMenuOpen(false);
                          setMoverOpen(false);
                        }}
                        className="flex w-full items-center gap-1.5 rounded-[3px] py-[5px] pr-1.5 text-left text-[13px] text-fg/75 hover:bg-surface-hover"
                        style={{ paddingLeft: 6 + d.nivel * 12 }}
                      >
                        {d.page.icon ? (
                          <PageIcon icon={d.page.icon} size={13} />
                        ) : (
                          <Icon name={d.page.isFolder ? "folder" : "file"} size={13} className="shrink-0 text-fg/40" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{d.page.title || "Sin título"}</span>
                      </button>
                    ))}
                    {destinos.length === 0 && (
                      <p className="px-1.5 py-2 text-[12px] text-fg/45">Ningún destino coincide.</p>
                    )}
                  </div>
                </div>
              ) : null}
              {moverOpen ? null : (
                <>
              <MenuItem icon={<Icon name="trash" size={15} />} danger onClick={() => { trashPage(page.id); setMenuOpen(false); }}>
                Mover a la papelera
              </MenuItem>
              <MenuItem
                icon={<Icon name="lock" size={15} />}
                onClick={() => { toggleLock(page.id); setMenuOpen(false); }}
              >
                {page.locked ? "Desbloquear página" : "Bloquear página"}
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
              <MenuSeparator />
              <MenuItem icon={<Icon name="dock" size={15} />} onClick={() => setMoverOpen(true)}>
                Mover a…
              </MenuItem>
              <MenuItem
                icon={<Icon name="folder" size={15} />}
                onClick={() => {
                  const id = createFolder(page.id);
                  if (!isOpen) toggleExpanded(page.id);
                  selectPage(id);
                  setMenuOpen(false);
                }}
              >
                Agregar subcarpeta
              </MenuItem>
                </>
              )}
            </Popover>
          </div>
        </div>
      </div>

      {hasKids && isOpen ? (
        <div>
          {kids.map((k) => (
            <PageNode
              key={k.id}
              page={k}
              depth={depth + 1}
              renamingId={renamingId}
              setRenamingId={setRenamingId}
              onPreviewFile={onPreviewFile}
            />
          ))}
        </div>
      ) : null}

      {/* archivos de la carpeta, listados dentro del árbol para no tener que
          entrar a la carpeta a buscarlos */}
      {isOpen && propios.length > 0 ? (
        <div>
          {propios.map((file) => (
            <button
              key={file.id}
              type="button"
              data-file-row={file.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(MIME_ARCHIVO, file.id);
                // text/plain hace que el arrastre funcione también en Firefox
                e.dataTransfer.setData("text/plain", file.name);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => onPreviewFile(file.id)}
              title={`${file.name} · ${formatBytes(file.size)} — arrastralo a otra carpeta para moverlo`}
              className="flex h-[25px] w-full items-center gap-1.5 rounded-[4px] pr-1 text-[13px] text-fg/70 transition-colors hover:bg-surface-hover active:cursor-grabbing"
              style={{ paddingLeft: 6 + (depth + 1) * 14 + 20 }}
            >
              <Icon name="file" size={13} className="shrink-0 text-fg/40" />
              <span className="min-w-0 flex-1 truncate text-left">{file.name}</span>
            </button>
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
  const members = useStore((s) => s.members);
  const plan = useStore((s) => s.plan);
  const resetWorkspace = useStore((s) => s.resetWorkspace);

  const [wsOpen, setWsOpen] = useState(false);
  const planName = planInfo(plan.tier).name;
  const createFolder = useStore((s) => s.createFolder);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  /** archivo abierto en el visor (se abre desde el árbol o desde una carpeta) */
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [collapsedTeams, setCollapsedTeams] = useState<Record<string, boolean>>({});
  const [dropActive, setDropActive] = useState(false);


  const moveFile = useStore((s) => s.moveFile);
  const files = useStore((s) => s.files);
  const fileRef = useRef<HTMLInputElement>(null);
  const asideRef = useRef<HTMLElement>(null);

  /**
   * Arrastre interno del árbol, manejado con **listeners nativos**.
   *
   * Con los handlers de React en cada fila, los `dragover` que llegaban a la
   * fila destino no se despachaban (sólo los de la fila de origen), así que el
   * indicador de destino nunca aparecía. Un único listener sobre la barra,
   * buscando la fila bajo el puntero, evita el problema y deja el código en un
   * solo lugar: qué fila, qué zona y qué hacer al soltar.
   */
  useEffect(() => {
    const barra = asideRef.current;
    if (!barra) return;

    const filaDe = (t: EventTarget | null) =>
      ((t as HTMLElement | null)?.closest?.("[data-page-row]") as HTMLElement | null) ?? null;
    const seccionDe = (t: EventTarget | null) =>
      ((t as HTMLElement | null)?.closest?.("[data-section-drop]") as HTMLElement | null) ?? null;
    const raizDe = (t: EventTarget | null) =>
      ((t as HTMLElement | null)?.closest?.("[data-root-drop]") as HTMLElement | null) ?? null;

    const alArrastrar = (e: DragEvent) => {
      const dt = e.dataTransfer;
      if (!dt) return;
      const tipos = Array.from(dt.types);
      const esArchivo = tipos.includes(MIME_ARCHIVO);
      const esPagina = tipos.includes(MIME_PAGINA);
      if (!esArchivo && !esPagina) return; // los archivos del sistema van por React
      e.preventDefault();
      dt.dropEffect = "move";

      const fila = filaDe(e.target);
      if (fila) {
        if (esArchivo) return pintarZona(fila, "archivo");
        if (paginaArrastrada === fila.dataset.pageRow) return limpiarZona();
        return pintarZona(fila, zonaEnPunto(fila, e.clientY));
      }
      const marco = seccionDe(e.target) ?? raizDe(e.target);
      if (marco) return pintarZona(marco, "dentro");
      limpiarZona();
    };

    const alSalir = (e: DragEvent) => {
      // los eventos de arrastre nativo llegan con 0,0: no dicen nada
      if (e.clientX === 0 && e.clientY === 0) return;
      const r = barra.getBoundingClientRect();
      const dentro = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!dentro) limpiarZona();
    };

    const alSoltar = (e: DragEvent) => {
      const dt = e.dataTransfer;
      if (!dt) return;
      const tipos = Array.from(dt.types);
      const esArchivo = tipos.includes(MIME_ARCHIVO);
      const esPagina = tipos.includes(MIME_PAGINA);
      if (!esArchivo && !esPagina) return; // soltar archivos del sistema: lo hace React
      e.preventDefault();
      e.stopPropagation();
      limpiarZona();

      const st = useStore.getState();
      const fila = filaDe(e.target);

      if (fila) {
        const destino = fila.dataset.pageRow ?? "";
        if (esArchivo) {
          const fileId = dt.getData(MIME_ARCHIVO);
          if (!fileId) return;
          st.moveFile(fileId, destino);
          if (!st.expanded[destino]) st.toggleExpanded(destino);
          return;
        }
        const pageId = dt.getData(MIME_PAGINA) || paginaArrastrada;
        paginaArrastrada = null;
        if (!pageId || pageId === destino) return;
        const zona = zonaEnPunto(fila, e.clientY);
        if (zona === "dentro") {
          st.movePageTo(pageId, destino, 0);
          if (!st.expanded[destino]) st.toggleExpanded(destino);
          return;
        }
        // antes / después: se inserta entre los hermanos de la fila destino
        const padreId = st.pages[destino]?.parentId ?? null;
        const hermanos = Object.values(st.pages)
          .filter((p) => p.parentId === padreId && !p.trashed)
          .sort((a, b) => a.order - b.order);
        const indice = hermanos.findIndex((p) => p.id === destino);
        st.movePageTo(pageId, padreId, zona === "antes" ? Math.max(0, indice) : indice + 1);
        return;
      }

      if (esArchivo) {
        const fileId = dt.getData(MIME_ARCHIVO);
        if (fileId) st.moveFile(fileId, null);
        return;
      }
      const pageId = dt.getData(MIME_PAGINA) || paginaArrastrada;
      paginaArrastrada = null;
      if (!pageId) return;
      const espacio = seccionDe(e.target)?.dataset.sectionDrop as "private" | "team" | undefined;
      st.movePageTo(pageId, null, Number.MAX_SAFE_INTEGER, espacio);
    };

    const alTerminar = () => {
      paginaArrastrada = null;
      limpiarZona();
    };

    barra.addEventListener("dragover", alArrastrar);
    barra.addEventListener("dragleave", alSalir);
    // en captura: resuelve el soltado interno antes de que React lo vea
    barra.addEventListener("drop", alSoltar, true);
    document.addEventListener("dragend", alTerminar);
    return () => {
      barra.removeEventListener("dragover", alArrastrar);
      barra.removeEventListener("dragleave", alSalir);
      barra.removeEventListener("drop", alSoltar, true);
      document.removeEventListener("dragend", alTerminar);
    };
  }, []);

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
  /** archivos que no están dentro de ninguna carpeta: antes no se veían en
   *  ningún lado, así que sacarlos de una carpeta los hacía desaparecer */
  const sueltos = files.filter((f) => f.folderId === null).sort((a, b) => a.name.localeCompare(b.name));
  const trashedCount = Object.values(pages).filter((p) => p.trashed).length;
  const roots = {
    private: childrenOf(pages, null).filter((p) => p.space === "private"),
    team: childrenOf(pages, null).filter((p) => p.space === "team"),
  };

  return (
    <aside
      ref={asideRef}
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
          data-root-drop
          onClick={() => setWsOpen((v) => !v)}
          title="Arrastrá un archivo acá para sacarlo de su carpeta"
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
              <div className="text-[12px] text-fg/45">
                {planLabel(plan)} · {members.length} {members.length === 1 ? "miembro" : "miembros"}
              </div>
            </div>
          </div>
          <MenuSeparator />
          <MenuItem
            icon={<Icon name="user" size={15} />}
            onClick={() => {
              setUI({ shareOpen: true });
              setWsOpen(false);
            }}
          >
            Invitar a miembros
          </MenuItem>
          <MenuItem
            icon={<Icon name="star" size={15} />}
            onClick={() => {
              setUI({ settingsOpen: true, settingsTab: "Plan" });
              setWsOpen(false);
            }}
          >
            Suscripción · {planName}
          </MenuItem>
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

      <FilePreview fileId={previewFile} onClose={() => setPreviewFile(null)} />

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
                <span className="flex h-[18px] w-[18px] items-center justify-center text-[13px]">
                  {p.icon ? <PageIcon icon={p.icon} size={14} /> : "📄"}
                </span>
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
            <section
              key={space}
              data-section-drop={space}
              className="mb-2"
            >
              <div className="group flex h-[24px] items-center justify-between px-[2px]">
                <button
                  type="button"
                  onClick={() => setCollapsedTeams((c) => ({ ...c, [space]: !c[space] }))}
                  className="flex min-w-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-fg/40 hover:text-fg/60"
                >
                  <Icon name="chevron-right" size={11} className={cx("transition-transform", !collapsed && "rotate-90")} />
                  <span className="truncate">{label}</span>
                </button>
                <span className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    aria-label={`Nueva carpeta en ${label}`}
                    title="Nueva carpeta"
                    onClick={() => {
                      const id = createFolder(null);
                      selectPage(id);
                    }}
                    className="flex h-[18px] w-[18px] items-center justify-center rounded-[3px] text-fg/40 hover:bg-fg/[0.08] hover:text-fg/70"
                  >
                    <Icon name="folder" size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Nueva página en ${label}`}
                    onClick={() => createPage(null, { space })}
                    className="flex h-[18px] w-[18px] items-center justify-center rounded-[3px] text-fg/40 hover:bg-fg/[0.08] hover:text-fg/70"
                  >
                    <Icon name="plus" size={13} />
                  </button>
                </span>
              </div>

              {!collapsed &&
                items.map((p) => (
                  <PageNode
                    key={p.id}
                    page={p}
                    depth={0}
                    renamingId={renamingId}
                    setRenamingId={setRenamingId}
                    onPreviewFile={setPreviewFile}
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

        {/* Archivos sin carpeta: destino de "arrastrar a la cabecera" */}
        {sueltos.length > 0 && (
          <section className="mb-2">
            <div className="flex h-[24px] items-center px-[6px] text-[11px] font-semibold uppercase tracking-wide text-fg/40">
              Archivos · {sueltos.length}
            </div>
            {sueltos.map((file) => (
              <button
                key={file.id}
                type="button"
                data-file-row={file.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(MIME_ARCHIVO, file.id);
                  e.dataTransfer.setData("text/plain", file.name);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => setPreviewFile(file.id)}
                title={`${file.name} · ${formatBytes(file.size)} — arrastralo a una carpeta para moverlo`}
                className="flex h-[26px] w-full items-center gap-1.5 rounded-[4px] px-[6px] text-[13px] text-fg/70 transition-colors hover:bg-surface-hover active:cursor-grabbing"
              >
                <Icon name="file" size={13} className="shrink-0 text-fg/40" />
                <span className="min-w-0 flex-1 truncate text-left">{file.name}</span>
              </button>
            ))}
          </section>
        )}
      </div>

      {/* ------------------------------ footer ------------------------------ */}
      <div className="space-y-px border-t border-line px-2 py-2">
        <UtilRow icon="plus" label="Nueva página" onClick={() => createPage(null)} />
        <UtilRow icon="template" label="Plantillas" onClick={() => setUI({ paletteOpen: true })} />
        <UtilRow icon="upload" label="Importar Markdown" onClick={() => fileRef.current?.click()} />
        <UtilRow icon="copy" label="Pegar Markdown" onClick={() => setUI({ pasteOpen: true })} />
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
