"use client";

/**
 * Vista de una carpeta: subcarpetas, páginas y archivos.
 *
 * Tres decisiones que se notan al usarla:
 *
 *  1. **Arrastrar y soltar desde el escritorio**: se aceptan archivos soltados
 *     sobre la vista; cada uno pasa por `addFile`, que valida el tope del plan
 *     antes de tocar IndexedDB.
 *  2. **Miniaturas de verdad** para las imágenes (blob URL revocada al salir),
 *     para que una carpeta de fotos no sea una lista de nombres.
 *  3. **El error se ve**: si el plan no permite el tamaño, o el navegador no da
 *     almacenamiento, el mensaje aparece en la carpeta y no en la consola.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import PageIcon from "./PageIcon";
import FilePreview from "./FilePreview";
import { useStore } from "@/lib/store";
import { fileExt, fileKind, formatBytes, readBlob } from "@/lib/files";
import { childrenOf, cx, relativeTime } from "@/lib/utils";
import { fileLimitMb } from "@/lib/plan";
import type { FileMeta, Page } from "@/lib/types";

/** Miniatura de una imagen: lee el blob y lo revoca al desmontar. */
function Thumb({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let revocar: string | null = null;
    let vivo = true;
    void (async () => {
      const leido = await readBlob(id);
      if (!vivo || !leido.ok || !leido.value) return;
      revocar = URL.createObjectURL(leido.value);
      setUrl(revocar);
    })();
    return () => {
      vivo = false;
      if (revocar) URL.revokeObjectURL(revocar);
    };
  }, [id]);

  if (!url) return <Icon name="image" size={22} className="text-fg/35" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-full w-full object-cover" />
  );
}

function FileCard({
  file,
  onOpen,
  onRename,
  onMove,
  onDelete,
}: {
  file: FileMeta;
  onOpen: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const kind = fileKind(file.mime, file.name);

  return (
    <li
      data-file-id={file.id}
      className="group relative flex flex-col overflow-hidden rounded-[8px] border border-line bg-surface transition-shadow hover:shadow-[0_2px_10px_rgba(15,15,15,0.08)]"
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex h-[92px] w-full items-center justify-center overflow-hidden bg-surface-hover"
        aria-label={`Abrir ${file.name}`}
      >
        {kind === "image" ? (
          <Thumb id={file.id} />
        ) : (
          <span className="text-[13px] font-semibold uppercase tracking-wide text-fg/40">
            {fileExt(file.name)}
          </span>
        )}
      </button>

      <div className="min-w-0 px-2.5 py-2">
        <button
          type="button"
          onClick={onOpen}
          className="block w-full truncate text-left text-[12.5px] font-medium text-fg hover:underline"
          title={file.name}
        >
          {file.name}
        </button>
        <p className="truncate text-[11.5px] text-fg/45">
          {formatBytes(file.size)} · {relativeTime(file.createdAt)}
        </p>
      </div>

      <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          onClick={onRename}
          aria-label={`Renombrar ${file.name}`}
          className="flex h-[22px] w-[22px] items-center justify-center rounded-[4px] bg-surface-pop/90 text-fg/60 hover:text-fg"
        >
          <Icon name="type" size={13} />
        </button>
        <button
          type="button"
          onClick={onMove}
          aria-label={`Mover ${file.name}`}
          className="flex h-[22px] w-[22px] items-center justify-center rounded-[4px] bg-surface-pop/90 text-fg/60 hover:text-fg"
        >
          <Icon name="folder" size={13} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Eliminar ${file.name}`}
          className="flex h-[22px] w-[22px] items-center justify-center rounded-[4px] bg-surface-pop/90 text-fg/60 hover:text-[#eb5757]"
        >
          <Icon name="trash" size={13} />
        </button>
      </div>
    </li>
  );
}

export default function FolderView({ page }: { page: Page }) {
  const pages = useStore((s) => s.pages);
  const files = useStore((s) => s.files);
  const plan = useStore((s) => s.plan);
  const addFile = useStore((s) => s.addFile);
  const renameFile = useStore((s) => s.renameFile);
  const moveFile = useStore((s) => s.moveFile);
  const deleteFile = useStore((s) => s.deleteFile);
  const createFolder = useStore((s) => s.createFolder);
  const createPage = useStore((s) => s.createPage);
  const selectPage = useStore((s) => s.selectPage);
  const updatePage = useStore((s) => s.updatePage);

  const inputRef = useRef<HTMLInputElement>(null);
  const [aviso, setAviso] = useState<{ kind: "ok" | "error"; texto: string } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [moviendo, setMoviendo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const hijos = childrenOf(pages, page.id);
  const subcarpetas = hijos.filter((p) => p.isFolder);
  const subpaginas = hijos.filter((p) => !p.isFolder);
  const propios = useMemo(() => files.filter((f) => f.folderId === page.id), [files, page.id]);
  const total = propios.reduce((n, f) => n + f.size, 0);
  const carpetas = useMemo(() => Object.values(pages).filter((p) => p.isFolder && !p.trashed), [pages]);

  const subir = async (lista: FileList | File[]) => {
    const archivos = Array.from(lista);
    if (!archivos.length) return;
    setOcupado(true);
    let subidos = 0;
    let primerError: string | null = null;

    for (const archivo of archivos) {
      const resultado = await addFile(archivo, page.id);
      if (resultado.ok) subidos += 1;
      else primerError ??= `${archivo.name}: ${resultado.error ?? "no se pudo guardar"}`;
    }

    setOcupado(false);
    if (subidos && !primerError) {
      setAviso({ kind: "ok", texto: `${subidos} archivo(s) guardado(s).` });
    } else if (subidos && primerError) {
      setAviso({ kind: "error", texto: `${subidos} guardado(s). ${primerError}` });
    } else if (primerError) {
      setAviso({ kind: "error", texto: primerError });
    }
  };

  const renombrar = (file: FileMeta) => {
    const nuevo = window.prompt("Nuevo nombre del archivo", file.name);
    if (nuevo === null) return;
    renameFile(file.id, nuevo);
  };

  const eliminar = (file: FileMeta) => {
    if (!window.confirm(`¿Eliminar «${file.name}»? No se puede deshacer.`)) return;
    void deleteFile(file.id);
    setAviso({ kind: "ok", texto: `«${file.name}» eliminado.` });
  };

  return (
    <div
      className={cx(
        "mt-2 rounded-[8px] border border-dashed p-3 transition-colors",
        arrastrando ? "border-accent bg-accent-soft/40" : "border-transparent",
      )}
      onDragOver={(e) => {
        // sólo archivos del sistema, no bloques arrastrados dentro de la app
        if (!Array.from(e.dataTransfer.types ?? []).includes("Files")) return;
        e.preventDefault();
        setArrastrando(true);
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={(e) => {
        const soltados = e.dataTransfer.files;
        if (!soltados || !soltados.length) return;
        e.preventDefault();
        setArrastrando(false);
        void subir(soltados);
      }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={ocupado}
          className="flex h-[30px] items-center gap-1.5 rounded-[5px] bg-accent px-2.5 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Icon name="paperclip" size={14} />
          {ocupado ? "Subiendo…" : "Añadir archivo"}
        </button>
        <button
          type="button"
          onClick={() => {
            const id = createFolder(page.id);
            selectPage(id);
          }}
          className="flex h-[30px] items-center gap-1.5 rounded-[5px] border border-line px-2.5 text-[12.5px] text-fg/80 hover:bg-surface-hover"
        >
          <Icon name="folder" size={14} />
          Subcarpeta
        </button>
        <button
          type="button"
          onClick={() => {
            const id = createPage(page.id, { title: "Sin título" });
            selectPage(id);
          }}
          className="flex h-[30px] items-center gap-1.5 rounded-[5px] border border-line px-2.5 text-[12.5px] text-fg/80 hover:bg-surface-hover"
        >
          <Icon name="plus" size={14} />
          Página
        </button>
        <span className="ml-auto text-[11.5px] tabular-nums text-fg/40">
          {propios.length} archivo(s) · {formatBytes(total)} · hasta {fileLimitMb(plan)} MB por archivo
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        data-testid="input-archivos"
        onChange={(e) => {
          const lista = e.target.files;
          if (lista?.length) void subir(lista);
          e.target.value = "";
        }}
      />

      {aviso ? (
        <p
          role="status"
          className={cx(
            "mb-3 rounded-[5px] px-2.5 py-1.5 text-[12px]",
            aviso.kind === "ok" ? "bg-[#448361]/12 text-[#448361]" : "bg-[#eb5757]/10 text-[#eb5757]",
          )}
        >
          {aviso.texto}
        </p>
      ) : null}

      {/* ------------------------------ subcarpetas ----------------------------- */}
      {subcarpetas.length > 0 && (
        <ul className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {subcarpetas.map((sub) => {
            const dentro = files.filter((f) => f.folderId === sub.id).length;
            const paginasDentro = childrenOf(pages, sub.id).length;
            return (
              <li key={sub.id}>
                <button
                  type="button"
                  onClick={() => selectPage(sub.id)}
                  onDoubleClick={() => {
                    const nombre = window.prompt("Nombre de la carpeta", sub.title);
                    if (nombre !== null) updatePage(sub.id, { title: nombre });
                  }}
                  className="flex w-full items-center gap-2.5 rounded-[7px] border border-line px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
                >
                  <Icon name="folder" size={18} className="shrink-0 text-fg/55" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-fg">
                      {sub.title || "Carpeta sin nombre"}
                    </span>
                    <span className="block text-[11.5px] text-fg/45">
                      {dentro} archivo(s) · {paginasDentro} elemento(s)
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* -------------------------------- archivos ------------------------------ */}
      {propios.length === 0 ? (
        <p className="rounded-[6px] bg-surface-hover px-3 py-6 text-center text-[13px] text-fg/50">
          Esta carpeta está vacía. Arrastrá archivos acá o usá «Añadir archivo».
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {propios.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              onOpen={() => setPreviewId(file.id)}
              onRename={() => renombrar(file)}
              onMove={() => setMoviendo(file.id)}
              onDelete={() => eliminar(file)}
            />
          ))}
        </ul>
      )}

      {/* ---------------------------- páginas dentro ---------------------------- */}
      {subpaginas.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg/40">Páginas</p>
          <ul className="divide-y divide-line rounded-[7px] border border-line">
            {subpaginas.map((sub) => (
              <li key={sub.id}>
                <button
                  type="button"
                  onClick={() => selectPage(sub.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-fg/85 hover:bg-surface-hover"
                >
                  <span className="flex shrink-0 items-center text-[13px]">
                    {sub.icon ? <PageIcon icon={sub.icon} size={14} /> : "📄"}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{sub.title || "Sin título"}</span>
                  <span className="shrink-0 text-[11.5px] text-fg/35">{relativeTime(sub.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* --------------------------- mover archivo ------------------------------ */}
      {moviendo ? (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-black/30" onClick={() => setMoviendo(null)} />
          <div className="pop-in relative w-full max-w-[380px] rounded-[10px] border border-line bg-surface-pop p-4 shadow-menu">
            <h3 className="mb-2 text-[14px] font-semibold text-fg">Mover a otra carpeta</h3>
            <ul className="max-h-[46vh] space-y-1 overflow-y-auto">
              {carpetas
                .filter((c) => c.id !== page.id)
                .map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        const file = files.find((f) => f.id === moviendo);
                        moveFile(moviendo, c.id);
                        setMoviendo(null);
                        if (file) setAviso({ kind: "ok", texto: `«${file.name}» movido a «${c.title}».` });
                      }}
                      className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-[13px] text-fg/85 hover:bg-surface-hover"
                    >
                      <Icon name="folder" size={15} className="text-fg/50" />
                      <span className="truncate">{c.title || "Carpeta sin nombre"}</span>
                    </button>
                  </li>
                ))}
              {carpetas.filter((c) => c.id !== page.id).length === 0 && (
                <li className="px-2 py-1.5 text-[12.5px] text-fg/45">No hay otras carpetas todavía.</li>
              )}
            </ul>
            <button
              type="button"
              onClick={() => setMoviendo(null)}
              className="mt-3 h-[28px] w-full rounded-[5px] border border-line text-[12.5px] text-fg/70 hover:bg-surface-hover"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <FilePreview fileId={previewId} onClose={() => setPreviewId(null)} />
    </div>
  );
}
