"use client";

/**
 * Historial de versiones de la página abierta.
 *
 * Nook guarda una foto del documento cuando cambias algo (con un respiro de unos
 * segundos, para no crear una versión por tecla) y la conserva según el plan:
 * 7 días en Gratis, 30 en Pro, 90 en Business, sin límite en Enterprise.
 *
 * Restaurar **no borra**: antes de pisar el documento se guarda cómo estaba, así
 * que un clic equivocado se deshace con otro clic en el historial.
 */

import { useMemo, useState } from "react";
import Icon from "./Icon";
import { Shell } from "./Modals";
import { useStore } from "@/lib/store";
import { htmlToText } from "@/lib/speech";
import { historyLimit, planLabel } from "@/lib/plan";
import { cx, relativeTime } from "@/lib/utils";
import { MAX_PER_PAGE } from "@/lib/versions";

function retencionTexto(dias: number | null): string {
  if (dias === null) return "sin límite de tiempo";
  return `${dias} días`;
}

export default function HistoryModal() {
  const open = useStore((s) => s.historyOpen);
  const setUI = useStore((s) => s.setUI);
  const pages = useStore((s) => s.pages);
  const selectedId = useStore((s) => s.selectedId);
  const versionMap = useStore((s) => s.versions);
  const page = selectedId ? pages[selectedId] ?? null : null;
  const versions = page ? versionMap[page.id] ?? [] : [];
  const plan = useStore((s) => s.plan);
  const captureVersion = useStore((s) => s.captureVersion);
  const restoreVersion = useStore((s) => s.restoreVersion);
  const deleteVersion = useStore((s) => s.deleteVersion);
  const clearVersions = useStore((s) => s.clearVersions);

  const dias = historyLimit(plan);
  /**
   * Botón "Guardar versión ahora": sin esto, pulsarlo cuando nada cambió no daba
   * ninguna señal y parecía roto. Ahora dice qué pasó.
   */
  const [aviso, setAviso] = useState<string | null>(null);

  const filas = useMemo(
    () =>
      versions
        .slice()
        .sort((a, b) => b.at - a.at)
        .map((v) => {
          const texto = v.blocks
            .map((b) => htmlToText(b.html ?? ""))
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
          return { ...v, preview: texto.slice(0, 96) || "Página vacía", bloques: v.blocks.length };
        }),
    [versions],
  );

  if (!open || !page) return null;

  return (
    <Shell
      title="Historial de versiones"
      subtitle={`${planLabel(plan)} · guardamos ${retencionTexto(dias)} · hasta ${MAX_PER_PAGE} versiones por página`}
      onClose={() => setUI({ historyOpen: false })}
      width={620}
    >
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const guardo = captureVersion(page.id);
            setAviso(guardo ? "Versión guardada." : "Ya hay una versión igual a la actual.");
            window.setTimeout(() => setAviso(null), 2600);
          }}
          className="h-[28px] rounded-[4px] bg-accent px-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
        >
          Guardar versión ahora
        </button>
        {aviso ? (
          <span role="status" className="text-[12px] text-fg/55">
            {aviso}
          </span>
        ) : null}
        {filas.length > 0 && (
          <button
            type="button"
            onClick={() => clearVersions(page.id)}
            className="h-[28px] rounded-[4px] px-2 text-[13px] text-fg/60 transition-colors hover:bg-surface-hover hover:text-[#eb5757]"
          >
            Borrar historial de esta página
          </button>
        )}
        <span className="ml-auto text-[12px] tabular-nums text-fg/40">
          {filas.length} {filas.length === 1 ? "versión" : "versiones"}
        </span>
      </div>

      {filas.length === 0 ? (
        <p className="rounded-[6px] bg-surface-hover px-3 py-6 text-center text-[13px] text-fg/50">
          Todavía no hay versiones de esta página. Se guardan solas mientras escribís, o podés
          crear una ahora.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {filas.map((v, i) => (
            <li
              key={v.id}
              className={cx(
                "group flex items-start gap-3 rounded-[6px] px-3 py-2 transition-colors hover:bg-surface-hover",
                i === 0 && "bg-surface-hover/60",
              )}
            >
              <Icon name="clock" size={15} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-[13.5px] font-medium text-fg">
                    {v.title || "Sin título"}
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-fg/40">{relativeTime(v.at)}</span>
                  {i === 0 && (
                    <span className="shrink-0 rounded-[3px] bg-accent/12 px-1.5 py-0.5 text-[11px] font-medium text-accent">
                      más reciente
                    </span>
                  )}
                </div>
                <p className="truncate text-[12.5px] text-fg/55">{v.preview}</p>
                <p className="text-[11.5px] text-fg/35">
                  {v.bloques} {v.bloques === 1 ? "bloque" : "bloques"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => restoreVersion(page.id, v.id)}
                  className="h-[26px] rounded-[4px] border border-line px-2 text-[12.5px] font-medium text-fg/75 transition-colors hover:bg-surface hover:text-fg"
                >
                  Restaurar
                </button>
                <button
                  type="button"
                  onClick={() => deleteVersion(page.id, v.id)}
                  aria-label="Eliminar esta versión"
                  className="icon-btn opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-fg/45">
        Antes de restaurar guardamos el estado actual, así que podés volver atrás. El historial se
        recorta solo: las versiones más viejas que tu plan dejan fuera se descartan.
      </p>
    </Shell>
  );
}
