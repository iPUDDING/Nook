"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import {
  buscarEnBloques,
  limpiarResaltados,
  pintarResaltados,
  rangosDeBloque,
  reemplazarEnHtml,
  seleccionarRango,
} from "@/lib/find";
import { useStore } from "@/lib/store";
import type { Page } from "@/lib/types";

/**
 * Barra de buscar y reemplazar de la página (⌘F / Ctrl+F).
 *
 * Existe porque en la app de referencia buscar dentro de una página larga se
 * resuelve con el buscar del navegador, que no puede reemplazar nada: hay que ir
 * a mano, coincidencia por coincidencia. Acá el recorrido selecciona el texto en
 * el bloque (así se ve dónde está) y el reemplazo escribe en el documento, que
 * queda guardado como cualquier otra edición.
 */
export default function FindBar({ page, onClose }: { page: Page; onClose: () => void }) {
  const setBlocks = useStore((s) => s.setBlocks);
  const [q, setQ] = useState("");
  const [rep, setRep] = useState("");
  const [repOpen, setRepOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  /** las tablas guardan sus celdas aparte del HTML: quedan fuera de la búsqueda */
  const buscables = useMemo(
    () => page.blocks.filter((b) => b.type !== "table").map((b) => ({ id: b.id, html: b.html })),
    [page.blocks],
  );
  const hits = useMemo(() => buscarEnBloques(buscables, q), [buscables, q]);
  const actual = hits.length ? Math.min(idx, hits.length - 1) : -1;

  const ir = (destino: number) => {
    if (!hits.length) return;
    const n = ((destino % hits.length) + hits.length) % hits.length;
    setIdx(n);
    const hit = hits[n];
    const caja = document.querySelector(`[data-block-id="${hit.blockId}"]`);
    const host =
      (caja?.querySelector("[contenteditable]") as HTMLElement | null) ??
      (caja as HTMLElement | null);
    if (host) seleccionarRango(host, hit.desde, hit.hasta);
  };

  // al cambiar la consulta se salta a la primera coincidencia
  useEffect(() => {
    setIdx(0);
    setAviso(null);
    if (!q.trim()) return;
    const primero = hits[0];
    if (!primero) return;
    const caja = document.querySelector(`[data-block-id="${primero.blockId}"]`);
    const host =
      (caja?.querySelector("[contenteditable]") as HTMLElement | null) ??
      (caja as HTMLElement | null);
    if (host) seleccionarRango(host, primero.desde, primero.hasta);
    // sólo cuando cambia la consulta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  /**
   * Resaltado de todas las coincidencias.
   *
   * Sin esto el único rastro de la búsqueda era la selección del documento, que
   * se pierde apenas el foco pasa al campo de reemplazo. La API de resaltados
   * pinta sobre el DOM sin escribir nada en el documento guardado.
   */
  useEffect(() => {
    const hostDe = (blockId: string): HTMLElement | null => {
      const caja = document.querySelector(`[data-block-id="${blockId}"]`);
      return (
        (caja?.querySelector("[contenteditable]") as HTMLElement | null) ??
        (caja as HTMLElement | null)
      );
    };

    const todos: Range[] = [];
    for (const h of hits) {
      const host = hostDe(h.blockId);
      if (!host) continue;
      todos.push(...rangosDeBloque(host, [{ desde: h.desde, hasta: h.hasta }]));
    }

    const actuales: Range[] = [];
    const hit = hits[actual];
    if (hit) {
      const host = hostDe(hit.blockId);
      if (host) actuales.push(...rangosDeBloque(host, [{ desde: hit.desde, hasta: hit.hasta }]));
    }

    pintarResaltados(todos, actuales);
    return limpiarResaltados;
  }, [hits, actual]);

  // Escape cierra aunque el foco esté en el documento
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const reemplazar = (todas: boolean) => {
    if (!hits.length) return;
    const hit = hits[actual];
    // cuántas coincidencias de este bloque van antes que la actual
    let enElBloque = 0;
    for (let i = 0; i < actual; i++) if (hits[i].blockId === hit.blockId) enElBloque++;

    let cambios = 0;
    const nuevas = page.blocks.map((b) => {
      if (todas ? !hits.some((h) => h.blockId === b.id) : b.id !== hit.blockId) return b;
      const r = reemplazarEnHtml(b.html, q, rep, { todas, cual: todas ? 0 : enElBloque });
      cambios += r.cambios;
      return r.cambios ? { ...b, html: r.html } : b;
    });
    if (!cambios) {
      setAviso("No se reemplazó nada");
      return;
    }
    setBlocks(page.id, nuevas);
    setIdx(0);
    setAviso(todas ? `${cambios} reemplazo(s)` : "Reemplazado");
  };

  return (
    <div
      data-find-bar
      className="fixed right-6 top-[52px] z-40 w-[340px] rounded-[8px] border border-line bg-surface p-2 text-[13px] shadow-[0_10px_38px_rgba(15,15,15,0.18)]"
    >
      <div className="flex items-center gap-1.5">
        <div className="flex h-[30px] flex-1 items-center gap-1.5 rounded-[5px] border border-line px-2 focus-within:border-accent/60">
          <Icon name="search" size={13} className="shrink-0 text-fg/40" />
          <input
            ref={inputRef}
            data-find-input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                ir(e.shiftKey ? actual - 1 : actual + 1);
              }
            }}
            placeholder="Buscar en la página"
            className="w-full bg-transparent text-[13px] text-fg outline-none placeholder:text-fg/35"
          />
          <span data-find-count className="shrink-0 tabular-nums text-[11.5px] text-fg/45">
            {q.trim() ? (hits.length ? `${actual + 1} de ${hits.length}` : "Sin resultados") : ""}
          </span>
        </div>
        <button
          type="button"
          data-find-prev
          aria-label="Coincidencia anterior"
          onClick={() => ir(actual - 1)}
          disabled={!hits.length}
          className="flex h-[28px] w-[26px] items-center justify-center rounded-[4px] text-fg/55 hover:bg-surface-hover disabled:opacity-35"
        >
          <Icon name="chevron-right" size={13} className="rotate-180" />
        </button>
        <button
          type="button"
          data-find-next
          aria-label="Coincidencia siguiente"
          onClick={() => ir(actual + 1)}
          disabled={!hits.length}
          className="flex h-[28px] w-[26px] items-center justify-center rounded-[4px] text-fg/55 hover:bg-surface-hover disabled:opacity-35"
        >
          <Icon name="chevron-right" size={13} />
        </button>
        <button
          type="button"
          data-find-close
          aria-label="Cerrar la búsqueda"
          onClick={onClose}
          className="flex h-[28px] w-[26px] items-center justify-center rounded-[4px] text-fg/55 hover:bg-surface-hover"
        >
          <Icon name="x" size={13} />
        </button>
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          data-find-toggle-replace
          onClick={() => setRepOpen((v) => !v)}
          className="text-[12px] text-fg/50 hover:text-fg/80"
        >
          {repOpen ? "Ocultar reemplazo" : "Reemplazar…"}
        </button>
        {aviso && (
          <span data-find-note className="text-[11.5px] text-fg/45">
            {aviso}
          </span>
        )}
      </div>

      {repOpen && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            data-find-replace
            value={rep}
            onChange={(e) => setRep(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                reemplazar(false);
              }
            }}
            placeholder="Reemplazar por"
            className="h-[30px] flex-1 rounded-[5px] border border-line bg-transparent px-2 text-[13px] text-fg outline-none placeholder:text-fg/35 focus:border-accent/60"
          />
          <button
            type="button"
            data-find-replace-one
            onClick={() => reemplazar(false)}
            disabled={!hits.length}
            className="h-[30px] rounded-[5px] border border-line px-2 text-[12.5px] text-fg/80 hover:bg-surface-hover disabled:opacity-35"
          >
            Reemplazar
          </button>
          <button
            type="button"
            data-find-replace-all
            onClick={() => reemplazar(true)}
            disabled={!hits.length}
            className="h-[30px] rounded-[5px] bg-accent px-2 text-[12.5px] font-medium text-white hover:opacity-90 disabled:opacity-35"
          >
            Todo
          </button>
        </div>
      )}
    </div>
  );
}
