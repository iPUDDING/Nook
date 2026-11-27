"use client";

/**
 * Visor de un archivo adjunto.
 *
 * El contenido se lee de IndexedDB al abrir (no se guarda en el estado) y se
 * envuelve en un `blob:` URL que se **revoca al cerrar**: sin eso, abrir y cerrar
 * cincuenta imágenes deja cincuenta blobs retenidos en memoria y el `.exe`
 * empieza a engordar sin motivo visible.
 *
 * Los tipos que el navegador no sabe dibujar (un `.zip`, un `.dwg`) no se
 * muestran a medias: se ofrece descargarlos, que es lo honesto.
 */

import { useEffect, useState } from "react";
import Icon from "./Icon";
import { Shell } from "./Modals";
import { useStore } from "@/lib/store";
import { fileKind, formatBytes, readBlob } from "@/lib/files";
import { cx, downloadFile } from "@/lib/utils";
import type { FileMeta } from "@/lib/types";

export default function FilePreview({
  fileId,
  onClose,
}: {
  fileId: string | null;
  onClose: () => void;
}) {
  const file = useStore((s) => (fileId ? s.files.find((f) => f.id === fileId) ?? null : null));
  const deleteFile = useStore((s) => s.deleteFile);

  const [url, setUrl] = useState<string | null>(null);
  /** zoom del visor de imágenes, en porcentaje (imágenes nomás: el PDF trae el suyo) */
  const [zoom, setZoom] = useState(100);
  const [texto, setTexto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Escape cierra el visor.
   *
   * Los overlays del store los cierra `AppShell`, pero este vive en estado local
   * de cada componente y se quedaba abierto tapando la carpeta: el mismo tipo de
   * bug que ya se había corregido en los modales.
   */
  useEffect(() => {
    if (!fileId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fileId, onClose]);

  const kind = file ? fileKind(file.mime, file.name) : "other";

  // cada archivo arranca al 100 %
  useEffect(() => {
    setZoom(100);
  }, [fileId]);

  /**
   * Ctrl/⌘ + rueda agranda la imagen. El listener es nativo y no pasivo para
   * poder frenar el zoom de la ventana; sin modificador, la rueda desplaza.
   */
  useEffect(() => {
    if (kind !== "image") return;
    let ultimo = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const destino = e.target as HTMLElement | null;
      if (!destino?.closest?.("[data-zoom-scope]")) return;
      e.preventDefault();
      const ahora = Date.now();
      if (ahora - ultimo < 90) return;
      ultimo = ahora;
      setZoom((z) => Math.min(400, Math.max(25, z + (e.deltaY < 0 ? 25 : -25))));
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [kind]);

  useEffect(() => {
    let revocar: string | null = null;
    let vivo = true;

    setUrl(null);
    setTexto(null);
    setError(null);
    if (!file) return;

    void (async () => {
      const leido = await readBlob(file.id);
      if (!vivo) return;
      if (!leido.ok || !leido.value) {
        setError("El contenido de este archivo no está disponible en este equipo.");
        return;
      }

      const blob = leido.value;
      const tipo = fileKind(file.mime, file.name);
      if (tipo === "text") {
        // 1 MB de texto en pantalla ya es ilegible; el límite evita colgar el visor
        const recorte = blob.slice(0, 1024 * 1024);
        setTexto(await recorte.text());
        return;
      }
      if (tipo === "image" || tipo === "pdf" || tipo === "video" || tipo === "audio") {
        revocar = URL.createObjectURL(blob);
        setUrl(revocar);
      }
    })();

    return () => {
      vivo = false;
      if (revocar) URL.revokeObjectURL(revocar);
    };
  }, [file]);

  if (!fileId || !file) return null;

  const descargar = async () => {
    const leido = await readBlob(file.id);
    if (!leido.ok || !leido.value) {
      setError("No se pudo leer el archivo desde el almacenamiento.");
      return;
    }
    downloadFile(file.name, leido.value);
  };

  return (
    <Shell
      title={file.name}
      subtitle={`${formatBytes(file.size)} · ${file.mime || "tipo desconocido"}`}
      onClose={onClose}
      width={kind === "image" || kind === "pdf" ? 860 : 640}
    >
      <div className="flex flex-wrap items-center gap-2 pb-3">
        {kind === "image" && (
          <div
            data-img-zoom
            data-img-zoom-value={zoom}
            className="flex h-[30px] items-center rounded-[5px] border border-line text-[12.5px]"
          >
            <button
              type="button"
              data-img-zoom-out
              aria-label="Alejar la imagen"
              onClick={() => setZoom((z) => Math.max(25, z - 25))}
              className="flex h-full w-[26px] items-center justify-center text-fg/60 hover:bg-surface-hover"
            >
              <Icon name="minus" size={13} />
            </button>
            <span className="w-[46px] text-center tabular-nums text-fg/70">{zoom}%</span>
            <button
              type="button"
              data-img-zoom-in
              aria-label="Acercar la imagen"
              onClick={() => setZoom((z) => Math.min(400, z + 25))}
              className="flex h-full w-[26px] items-center justify-center text-fg/60 hover:bg-surface-hover"
            >
              <Icon name="plus" size={13} />
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => void descargar()}
          className="flex h-[30px] items-center gap-1.5 rounded-[5px] border border-line px-2.5 text-[12.5px] text-fg/80 hover:bg-surface-hover"
        >
          <Icon name="download" size={14} />
          Descargar
        </button>
        <button
          type="button"
          onClick={() => {
            if (!window.confirm(`¿Eliminar «${file.name}»? No se puede deshacer.`)) return;
            void deleteFile(file.id);
            onClose();
          }}
          className="flex h-[30px] items-center gap-1.5 rounded-[5px] px-2.5 text-[12.5px] text-fg/60 hover:bg-surface-hover hover:text-[#eb5757]"
        >
          <Icon name="trash" size={14} />
          Eliminar
        </button>
      </div>

      {error ? (
        <p className="rounded-[6px] bg-[#eb5757]/10 px-3 py-4 text-[13px] text-[#eb5757]">{error}</p>
      ) : kind === "image" && url ? (
        <div
          data-zoom-scope
          className="max-h-[62vh] overflow-auto rounded-[6px] bg-surface-hover/40 p-1"
        >
          {/* la imagen crece por ancho: así el contenedor desplaza en las dos direcciones */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={file.name}
            style={{ width: `${zoom}%`, maxWidth: "none" }}
            className="rounded-[6px]"
          />
        </div>
      ) : kind === "pdf" && url ? (
        <iframe src={url} title={file.name} className="h-[62vh] w-full rounded-[6px] border border-line" />
      ) : kind === "video" && url ? (
        <video src={url} controls className="max-h-[62vh] w-full rounded-[6px]" />
      ) : kind === "audio" && url ? (
        <audio src={url} controls className="w-full" />
      ) : kind === "text" && texto !== null ? (
        <pre className="max-h-[58vh] overflow-auto whitespace-pre-wrap rounded-[6px] bg-surface-hover p-3 text-[12.5px] leading-relaxed text-fg/80">
          {texto}
        </pre>
      ) : (
        <p className={cx("rounded-[6px] bg-surface-hover px-3 py-6 text-center text-[13px] text-fg/55")}>
          Este tipo de archivo no se puede mostrar acá. Descargalo para abrirlo con tu programa.
        </p>
      )}
    </Shell>
  );
}

export type { FileMeta };
