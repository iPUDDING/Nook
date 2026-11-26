"use client";

/**
 * Barra flotante de lectura.
 *
 * Tres modos: flotante (libre), acoplada a la izquierda o a la derecha. En los
 * modos acoplados la barra pasa a vertical pero **Anterior / Reproducir /
 * Siguiente / Detener se quedan en una fila horizontal** — en una columna
 * apilada esos cuatro controles se vuelven inalcanzables con el pulgar.
 *
 * La posición se guarda en el store (persistida) y también se puede mover con
 * las flechas cuando el asa tiene el foco, para no depender del puntero.
 */

import { useCallback, useEffect, useRef } from "react";
import Icon from "../Icon";
import { useSpeech } from "./Speech";
import { useStore } from "@/lib/store";
import { formatClock } from "@/lib/speech";
import { cx } from "@/lib/utils";
import type { DockSide } from "@/lib/types";

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

const SPEEDS = [0.8, 1, 1.25, 1.5, 2];

export default function ReadingBar() {
  const speech = useSpeech();
  const bar = useStore((s) => s.bar);
  const setBar = useStore((s) => s.setBar);
  const rate = useStore((s) => s.tts.rate);
  const setTts = useStore((s) => s.setTts);
  const supported = speech.supported;
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const { status, chars, elapsed, remaining, label } = speech;
  const visible = status !== "idle";

  /* ------------------------- posición inicial válida ------------------------ */
  useEffect(() => {
    if (!visible) return;
    if (bar.x >= 0 && bar.y >= 0) return;
    const width = cardRef.current?.offsetWidth ?? 340;
    setBar({
      x: Math.max(12, Math.round(window.innerWidth / 2 - width / 2)),
      y: Math.max(12, window.innerHeight - 220),
    });
  }, [visible, bar.x, bar.y, setBar]);

  /* -------------------------------- arrastre ------------------------------- */
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (bar.dock !== "float") return;
      const rect = cardRef.current?.getBoundingClientRect();
      if (!rect) return;
      dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [bar.dock],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      const rect = cardRef.current?.getBoundingClientRect();
      if (!drag || !rect) return;
      // dejamos siempre 8 px visibles dentro del viewport
      const x = clamp(e.clientX - drag.dx, 8 - rect.width + 48, window.innerWidth - 48);
      const y = clamp(e.clientY - drag.dy, 8, window.innerHeight - 44);
      setBar({ x: Math.round(x), y: Math.round(y) });
    },
    [setBar],
  );

  const endDrag = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* el puntero ya se liberó */
    }
  }, []);

  const nudge = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (bar.dock !== "float") return;
      const step = e.shiftKey ? 48 : 12;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const move = moves[e.key];
      if (!move) return;
      e.preventDefault();
      setBar({
        x: clamp((bar.x < 0 ? 40 : bar.x) + move[0], 8, window.innerWidth - 60),
        y: clamp((bar.y < 0 ? 40 : bar.y) + move[1], 8, window.innerHeight - 60),
      });
    },
    [bar.dock, bar.x, bar.y, setBar],
  );

  if (!visible) return null;

  const progress = chars.total ? clamp(chars.spoken / chars.total, 0, 1) : 0;
  const wordsLeft = Math.max(0, Math.round((chars.total - chars.spoken) / 6));
  const docked = bar.dock !== "float";
  const playing = status === "playing";

  const cycleSpeed = () => {
    const idx = SPEEDS.findIndex((s) => s >= rate - 0.001);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    setTts({ rate: next });
  };

  /* -------------------------------- botones -------------------------------- */
  const PlayButton = ({ size = 30 }: { size?: number }) => (
    <button
      type="button"
      onClick={() => speech.toggle()}
      aria-label={playing ? "Pausar lectura" : "Reanudar lectura"}
      title={playing ? "Pausar (Espacio)" : "Reanudar (Espacio)"}
      className="flex items-center justify-center rounded-full bg-fg text-surface transition-transform hover:scale-105 active:scale-95"
      style={{ width: size, height: size }}
    >
      <Icon name={playing ? "pause" : "play"} size={size * 0.5} strokeWidth={0} />
    </button>
  );

  const Grip = () => (
    <button
      type="button"
      aria-label="Mover barra de lectura (usá las flechas para ajustar)"
      title="Arrastrar — o flechas cuando tiene el foco"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={nudge}
      className={cx(
        "drag-handle flex touch-none items-center justify-center rounded-[4px] text-fg/30 hover:text-fg/60",
        docked ? "h-[18px] w-[34px] cursor-default" : "h-[18px] w-[26px]",
      )}
    >
      <Icon name="grip" size={13} />
    </button>
  );

  const DockButton = () => (
    <button
      type="button"
      onClick={() =>
        setBar({
          dock: (bar.dock === "float" ? "right" : bar.dock === "right" ? "left" : "float") as DockSide,
        })
      }
      aria-label="Acoplar o desacoplar la barra"
      title={docked ? "Volver a barra flotante" : "Acoplar al lateral"}
      className="icon-btn h-[26px] w-[26px]"
    >
      <Icon name="dock" size={15} />
    </button>
  );

  /* ------------------------------ modo acoplado ---------------------------- */
  if (docked) {
    return (
      <div
        className={cx(
          "fixed top-1/2 z-[55] -translate-y-1/2 select-none",
          bar.dock === "right" ? "right-2" : "left-2",
        )}
      >
        <div className="glass flex w-[56px] flex-col items-center gap-2 rounded-[14px] px-1.5 py-2.5">
          <Grip />
          <PlayButton size={32} />

          {/* progreso vertical */}
          <div className="relative h-[76px] w-[4px] overflow-hidden rounded-full bg-fg/12">
            <div
              className="absolute inset-x-0 top-0 rounded-full bg-accent transition-[height] duration-300"
              style={{ height: `${progress * 100}%` }}
            />
          </div>

          <div className="text-center text-[10px] font-medium leading-tight text-fg/55 tabular-nums">
            {formatClock(remaining)}
          </div>

          <button
            type="button"
            onClick={cycleSpeed}
            aria-label={`Velocidad ${rate}×`}
            className="rounded-[4px] px-1 py-0.5 text-[10.5px] font-semibold tabular-nums text-fg/60 hover:bg-fg/[0.07]"
          >
            {rate.toFixed(rate % 1 === 0 ? 0 : 2).replace(/0$/, "")}×
          </button>

          <DockButton />

          {/* Anterior / Siguiente / Detener: fila horizontal, como en el original */}
          <div className="mt-0.5 flex items-center gap-0.5 rounded-full bg-fg/[0.06] p-0.5">
            <button type="button" onClick={speech.prev} aria-label="Fragmento anterior" className="icon-btn h-[22px] w-[22px]">
              <Icon name="skip-back" size={13} />
            </button>
            <button type="button" onClick={speech.next} aria-label="Fragmento siguiente" className="icon-btn h-[22px] w-[22px]">
              <Icon name="skip-forward" size={13} />
            </button>
            <button
              type="button"
              onClick={speech.stop}
              aria-label="Detener lectura"
              className="icon-btn h-[22px] w-[22px] text-[#eb5757] hover:text-[#eb5757]"
            >
              <Icon name="stop" size={12} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------ modo flotante ---------------------------- */
  return (
    <div
      ref={cardRef}
      className="glass fixed z-[55] w-[340px] select-none rounded-[14px] px-3 pb-2.5 pt-2"
      style={{ left: bar.x < 0 ? undefined : bar.x, top: bar.y < 0 ? undefined : bar.y }}
      role="region"
      aria-label="Controles de lectura en voz alta"
    >
      {/* cabecera */}
      <div className="flex items-center gap-1">
        <Grip />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-fg/80">
            {label || "Lectura"}
          </div>
          <div className="text-[10.5px] text-fg/45 tabular-nums">
            {supported && speech.voices.length === 0
              ? "Cargando voces del sistema…"
              : `${Math.round(progress * 100)}% · ${wordsLeft} palabras restantes`}
          </div>
        </div>
        <button type="button" onClick={speech.repeat} aria-label="Repetir fragmento" title="Repetir" className="icon-btn h-[26px] w-[26px]">
          <Icon name="repeat" size={14} />
        </button>
        <DockButton />
        <button
          type="button"
          onClick={speech.stop}
          aria-label="Detener lectura"
          title="Detener"
          className="icon-btn h-[26px] w-[26px] text-fg/50 hover:text-[#eb5757]"
        >
          <Icon name="x" size={15} />
        </button>
      </div>

      {/* barra de progreso */}
      <div className="mt-1.5 flex items-center gap-2">
        <span className="w-[34px] shrink-0 text-right text-[10.5px] tabular-nums text-fg/45">
          {formatClock(elapsed)}
        </span>
        <div className="relative h-[4px] flex-1 overflow-hidden rounded-full bg-fg/12">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="w-[34px] shrink-0 text-[10.5px] tabular-nums text-fg/45">
          -{formatClock(remaining)}
        </span>
      </div>

      {/* controles */}
      <div className="mt-1.5 flex items-center justify-between">
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={speech.prev} aria-label="Fragmento anterior" title="Anterior" className="icon-btn">
            <Icon name="skip-back" size={16} />
          </button>
          <PlayButton />
          <button type="button" onClick={speech.next} aria-label="Fragmento siguiente" title="Siguiente" className="icon-btn">
            <Icon name="skip-forward" size={16} />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={cycleSpeed}
            className="flex h-[24px] items-center gap-1 rounded-[4px] px-1.5 text-[11.5px] font-semibold tabular-nums text-fg/60 hover:bg-fg/[0.07]"
            aria-label={`Velocidad ${rate}×`}
            title="Cambiar velocidad"
          >
            <Icon name="timer" size={12} />
            {rate}×
          </button>
          <span className="text-[10.5px] tabular-nums text-fg/40">
            {speech.index + 1}/{speech.segments.length}
          </span>
        </div>
      </div>

      {speech.error ? (
        <div className="mt-1.5 rounded-[5px] bg-[#eb5757]/10 px-2 py-1 text-[11px] leading-snug text-[#eb5757]">
          {speech.error}
        </div>
      ) : null}
    </div>
  );
}
