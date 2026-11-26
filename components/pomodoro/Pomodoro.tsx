"use client";

/**
 * Pomodoro compartido + capa flotante.
 *
 * "Compartido" es literal: el temporizador vive en un contexto por encima del
 * árbol, así que cerrar el panel no lo detiene y el botón de la barra superior
 * siempre puede volver a mostrarlo.
 *
 * El conteo se hace contra `endsAt` (timestamp), no restando 1 por tick: si la
 * pestaña se suspende o el equipo se duerme, el reloj sigue siendo correcto.
 * Ese es el mismo motivo por el que no se guarda `remaining` en el store.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Icon from "../Icon";
import { useStore } from "@/lib/store";
import { formatClock } from "@/lib/speech";
import { cx, dayKey } from "@/lib/utils";
import type { PomodoroPrefs } from "@/lib/types";

export type Phase = "work" | "rest" | "longRest";

interface PomodoroValue {
  phase: Phase;
  remaining: number;
  running: boolean;
  total: number;
  /** sesiones completadas en la ronda actual (0..sessionsBeforeLong) */
  cycleCount: number;
  start: () => void;
  pause: () => void;
  reset: () => void;
  skip: () => void;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
}

const Ctx = createContext<PomodoroValue | null>(null);

/* ========================================================================== */
/*                                  Alarmas                                   */
/* ========================================================================== */

/**
 * Alarmas sintetizadas con WebAudio: sin archivos de audio, sin licencias y
 * con dos timbres distintos para distinguir fin de trabajo de fin de descanso.
 */
function playAlarm(kind: Phase) {
  if (typeof window === "undefined") return;
  const AudioCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return;

  try {
    const ctx = new AudioCtor();
    const notes = kind === "work" ? [523.25, 659.25, 783.99] : [783.99, 587.33];
    const spacing = 0.22;

    notes.forEach((frequency, i) => {
      const at = ctx.currentTime + i * spacing;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(0.2, at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.55);
    });

    // cerrar el contexto cuando terminó de sonar, si no el navegador se queja
    setTimeout(() => void ctx.close().catch(() => undefined), notes.length * spacing * 1000 + 800);
  } catch {
    // sin audio disponible: el aviso visual sigue funcionando
  }
}

/* ========================================================================== */
/*                                  Provider                                  */
/* ========================================================================== */

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const config = useStore((s) => s.pomodoro);
  const logPomodoro = useStore((s) => s.logPomodoro);

  const [phase, setPhase] = useState<Phase>("work");
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(config.work * 60);
  const [cycleCount, setCycleCount] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const endsAtRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>("work");
  const configRef = useRef<PomodoroPrefs>(config);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const durationOf = useCallback((p: Phase, pref: PomodoroPrefs) => {
    const minutes = p === "work" ? pref.work : p === "rest" ? pref.rest : pref.longRest;
    return Math.max(1, Math.round(minutes * 60));
  }, []);

  /** avanza de fase y dispara la alarma; `complete` = terminó sola */
  const advance = useCallback(
    (complete: boolean) => {
      const pref = configRef.current;
      const current = phaseRef.current;
      let nextPhase: Phase;
      let nextCycle = cycleCount;

      if (current === "work") {
        if (complete) logPomodoro("work", durationOf("work", pref));
        nextCycle = cycleCount + 1;
        nextPhase = nextCycle >= pref.sessionsBeforeLong ? "longRest" : "rest";
      } else {
        nextPhase = "work";
        if (nextCycle >= pref.sessionsBeforeLong) nextCycle = 0;
      }

      if (complete && pref.sound) playAlarm(current);

      phaseRef.current = nextPhase;
      setPhase(nextPhase);
      setCycleCount(nextCycle);

      const seconds = durationOf(nextPhase, pref);
      setRemaining(seconds);

      if (complete && pref.autoStart) {
        endsAtRef.current = Date.now() + seconds * 1000;
        setRunning(true);
      } else {
        endsAtRef.current = null;
        setRunning(false);
      }
    },
    [cycleCount, durationOf, logPomodoro],
  );

  /* ------------------------------- tick ---------------------------------- */
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const endsAt = endsAtRef.current;
      if (endsAt === null) return;
      const left = Math.round((endsAt - Date.now()) / 1000);
      if (left <= 0) {
        setRemaining(0);
        setRunning(false);
        endsAtRef.current = null;
        advance(true);
      } else {
        setRemaining(left);
      }
    };
    const id = setInterval(tick, 250);
    tick();
    return () => clearInterval(id);
  }, [running, advance]);

  const start = useCallback(() => {
    if (remaining <= 0) {
      const seconds = durationOf(phaseRef.current, configRef.current);
      setRemaining(seconds);
      endsAtRef.current = Date.now() + seconds * 1000;
    } else {
      endsAtRef.current = Date.now() + remaining * 1000;
    }
    setRunning(true);
  }, [remaining, durationOf]);

  const pause = useCallback(() => {
    const endsAt = endsAtRef.current;
    if (endsAt !== null) setRemaining(Math.max(0, Math.round((endsAt - Date.now()) / 1000)));
    endsAtRef.current = null;
    setRunning(false);
  }, []);

  const reset = useCallback(() => {
    endsAtRef.current = null;
    setRunning(false);
    setRemaining(durationOf(phaseRef.current, configRef.current));
  }, [durationOf]);

  const skip = useCallback(() => {
    endsAtRef.current = null;
    setRunning(false);
    advance(false);
  }, [advance]);

  /* --------------------- mantener la duración sincronizada ---------------- */
  useEffect(() => {
    if (running) return;
    setRemaining(durationOf(phaseRef.current, config));
  }, [config, running, durationOf]);

  const total = durationOf(phase, config);

  const value = useMemo<PomodoroValue>(
    () => ({ phase, remaining, running, total, cycleCount, start, pause, reset, skip, panelOpen, setPanelOpen }),
    [phase, remaining, running, total, cycleCount, start, pause, reset, skip, panelOpen],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePomodoro(): PomodoroValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePomodoro debe usarse dentro de <PomodoroProvider>");
  return ctx;
}

/* ========================================================================== */
/*                               Capa flotante                                */
/* ========================================================================== */

const PHASE_LABEL: Record<Phase, string> = {
  work: "Enfoque",
  rest: "Descanso",
  longRest: "Descanso largo",
};

export function PomodoroLayer() {
  const { phase, remaining, running, total, cycleCount, start, pause, reset, skip, panelOpen, setPanelOpen } =
    usePomodoro();
  const config = useStore((s) => s.pomodoro);
  const setPomodoro = useStore((s) => s.setPomodoro);
  const history = useStore((s) => s.pomHistory);

  const progress = total ? 1 - remaining / total : 0;
  const radius = 30;
  const circumference = 2 * Math.PI * radius;

  // últimos 7 días, rellenando con ceros los que no tienen sesiones
  const week = useMemo(() => {
    const days: { date: string; label: string; sessions: number }[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dayKey(d);
      const found = history.find((h) => h.date === key);
      days.push({
        date: key,
        label: "DLMXJVS"[d.getDay()] ?? "·",
        sessions: found?.sessions ?? 0,
      });
    }
    return days;
  }, [history]);

  const today = week[week.length - 1]?.sessions ?? 0;
  const maxWeek = Math.max(1, ...week.map((d) => d.sessions));

  if (!panelOpen) {
    // colapsado: una píldora que no molesta pero mantiene el reloj a la vista
    return (
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className={cx(
          "glass fixed bottom-4 right-4 z-[54] flex items-center gap-2 rounded-full py-1.5 pl-2 pr-3 text-[12.5px] font-medium tabular-nums transition-transform hover:scale-[1.03]",
          running ? "text-fg" : "text-fg/60",
        )}
        aria-label="Mostrar Pomodoro"
      >
        <span
          className={cx(
            "flex h-5 w-5 items-center justify-center rounded-full",
            phase === "work" ? "bg-[#eb5757]/15 text-[#eb5757]" : "bg-[#448361]/15 text-[#448361]",
          )}
        >
          <Icon name="timer" size={13} />
        </span>
        {formatClock(remaining)}
      </button>
    );
  }

  return (
    <div className="glass fixed bottom-4 right-4 z-[54] w-[286px] select-none rounded-[14px] p-3">
      <div className="mb-1 flex items-center gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-fg/40">
          Pomodoro · {PHASE_LABEL[phase]}
        </span>
        <button
          type="button"
          onClick={() => setPanelOpen(false)}
          aria-label="Ocultar Pomodoro"
          className="icon-btn ml-auto h-[22px] w-[22px]"
        >
          <Icon name="x" size={14} />
        </button>
      </div>

      <div className="flex items-center gap-3">
        {/* anillo de progreso */}
        <div className="relative h-[72px] w-[72px] shrink-0">
          <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
            <circle cx="36" cy="36" r={radius} fill="none" strokeWidth="5" className="stroke-fg/10" />
            <circle
              cx="36"
              cy="36"
              r={radius}
              fill="none"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
              className={phase === "work" ? "stroke-[#eb5757]" : "stroke-[#448361]"}
              style={{ transition: "stroke-dashoffset 300ms linear" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-[15px] font-semibold tabular-nums text-fg">
            {formatClock(remaining)}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={running ? pause : start}
              className="flex h-[30px] flex-1 items-center justify-center gap-1.5 rounded-[6px] bg-fg text-[12.5px] font-semibold text-surface transition-opacity hover:opacity-90"
            >
              <Icon name={running ? "pause" : "play"} size={12} strokeWidth={0} />
              {running ? "Pausar" : "Iniciar"}
            </button>
            <button type="button" onClick={reset} aria-label="Reiniciar" title="Reiniciar" className="icon-btn">
              <Icon name="repeat" size={14} />
            </button>
            <button type="button" onClick={skip} aria-label="Saltar sesión" title="Saltar" className="icon-btn">
              <Icon name="skip-forward" size={14} />
            </button>
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-fg/45">
            <span>{cycleCount}/{config.sessionsBeforeLong} sesiones</span>
            <span>·</span>
            <span>hoy {today}</span>
          </div>
        </div>
      </div>

      {/* historial de 7 días */}
      <div className="mt-2.5 flex h-[34px] items-end gap-1">
        {week.map((d) => (
          <div key={d.date} className="group flex flex-1 flex-col items-center gap-1" title={`${d.date}: ${d.sessions} sesiones`}>
            <div
              className={cx("w-full rounded-[2px]", d.sessions ? "bg-[#eb5757]/70" : "bg-fg/10")}
              style={{ height: `${Math.max(3, (d.sessions / maxWeek) * 28)}px` }}
            />
            <span className="text-[9px] text-fg/35">{d.label}</span>
          </div>
        ))}
      </div>

      {/* duraciones */}
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {(
          [
            ["work", "Enfoque"],
            ["rest", "Descanso"],
            ["longRest", "Largo"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block">
            <span className="block text-[9.5px] uppercase tracking-wide text-fg/35">{label}</span>
            <input
              type="number"
              min={1}
              max={180}
              value={config[key]}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isFinite(value)) setPomodoro({ [key]: Math.min(180, Math.max(1, Math.round(value))) });
              }}
              className="mt-0.5 w-full rounded-[4px] border border-line bg-surface px-1.5 py-0.5 text-[12px] tabular-nums text-fg outline-none focus:border-accent/60"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
