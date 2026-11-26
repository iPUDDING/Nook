"use client";

/**
 * Motor de lectura en voz alta (Web Speech API).
 *
 * Se implementa como contexto React y no como store Zustand por una razón:
 * `SpeechSynthesisUtterance` es un recurso imperativo con callbacks que no se
 * puede serializar ni persistir. El store guarda las **preferencias**; el motor
 * vive acá y se comparte con `useSpeech()`.
 *
 * Decisiones que evitan los problemas clásicos de la API:
 *  - **Cola por frases**: cada `speak()` es corto (<180 caracteres). Chrome
 *    deja de emitir `onend` en utterances muy largas; trocear lo evita y además
 *    da granularidad de resaltado.
 *  - **Token de generación**: cada arranque incrementa un contador y los
 *    callbacks viejos se descartan. Sin esto, un `cancel()` deja `onend`
 *    pendientes que avanzan la lectura dos veces.
 *  - **Perro guardián**: si `onend` no llega (voz rota, WebView sin eventos),
 *    un temporizador avanza igual. Nunca se queda colgado.
 *  - **Calibración**: la velocidad real (caracteres/segundo) se mide con los
 *    fragmentos ya pronunciados, así el tiempo restante no es una constante.
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
import {
  applyRules,
  estimateRemaining,
  pickDefaultVoice,
  speakableMath,
  spokenChars,
  totalChars,
  type SpeechSegment,
} from "@/lib/speech";
import { useStore } from "@/lib/store";

export type SpeechStatus = "idle" | "playing" | "paused";

interface SpeechValue {
  supported: boolean;
  voices: SpeechSynthesisVoice[];
  status: SpeechStatus;
  segments: SpeechSegment[];
  index: number;
  label: string;
  activeBlockId: string | null;
  error: string | null;
  /** caracteres totales y ya pronunciados */
  chars: { total: number; spoken: number };
  elapsed: number;
  remaining: number;
  start: (segments: SpeechSegment[], label: string, from?: number) => void;
  toggle: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  repeat: () => void;
  seek: (index: number) => void;
}

const Ctx = createContext<SpeechValue | null>(null);

export function SpeechProvider({ children }: { children: ReactNode }) {
  const [supported, setSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [segments, setSegments] = useState<SpeechSegment[]>([]);
  const [index, setIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  /* ------------------------------ refs de control ------------------------- */
  const segsRef = useRef<SpeechSegment[]>([]);
  const idxRef = useRef(0);
  const tokenRef = useRef(0);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const cpsRef = useRef(14); // caracteres/segundo medidos
  const segStartRef = useRef<number | null>(null);
  const elapsedBaseRef = useRef(0);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakAtRef = useRef<(i: number) => void>(() => {});
  const statusRef = useRef<SpeechStatus>("idle");

  const setStatusBoth = useCallback((next: SpeechStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  /* --------------------------- carga de voces ---------------------------- */
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSupported(false);
      return;
    }
    setSupported(true);
    const load = () => {
      const list = window.speechSynthesis.getVoices();
      voicesRef.current = list;
      setVoices(list);
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, []);

  const clearWatchdog = () => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  };

  /* ------------------------------ cronómetro ----------------------------- */
  useEffect(() => {
    if (status !== "playing") return;
    const id = setInterval(() => {
      const started = segStartRef.current;
      if (started === null) return;
      setElapsed(elapsedBaseRef.current + (performance.now() - started) / 1000);
    }, 400);
    return () => clearInterval(id);
  }, [status]);

  /* ------------------------------- parada -------------------------------- */
  const stop = useCallback(() => {
    tokenRef.current += 1;
    clearWatchdog();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    segStartRef.current = null;
    setStatusBoth("idle");
    setCharIndex(0);
  }, [setStatusBoth]);

  /* --------------------------- leer un fragmento -------------------------- */
  const speakAt = useCallback(
    (i: number) => {
      const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
      const segs = segsRef.current;
      const seg = segs[i];

      clearWatchdog();

      if (!synth || !seg) {
        segStartRef.current = null;
        setStatusBoth("idle");
        return;
      }

      const token = (tokenRef.current += 1);
      synth.cancel();

      const { tts, rules } = useStore.getState();
      const text = applyRules(speakableMath(seg.text), rules);
      const voice = tts.voiceURI
        ? voicesRef.current.find((v) => v.voiceURI === tts.voiceURI) ?? pickDefaultVoice(voicesRef.current)
        : pickDefaultVoice(voicesRef.current);

      const utterance = new SpeechSynthesisUtterance(text);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? "es-AR";
      utterance.rate = Math.min(2, Math.max(0.5, tts.rate));
      utterance.pitch = Math.min(2, Math.max(0, tts.pitch));
      utterance.volume = Math.min(1, Math.max(0, tts.volume));

      // Chrome necesita un tick después de cancel() antes de aceptar speak()
      setTimeout(() => {
        if (tokenRef.current !== token) return;
        synth.speak(utterance);
        segStartRef.current = performance.now();
        setStatusBoth("playing");

        // perro guardián: si no llega onend, seguimos igual
        const estimate = (text.length / Math.max(4, cpsRef.current)) * 1000;
        clearWatchdog();
        watchdogRef.current = setTimeout(() => {
          if (tokenRef.current !== token) return;
          const finished = idxRef.current;
          if (finished + 1 < segsRef.current.length) {
            idxRef.current = finished + 1;
            setIndex(finished + 1);
            speakAtRef.current(finished + 1);
          } else {
            segStartRef.current = null;
            setStatusBoth("idle");
          }
        }, Math.min(120000, estimate * 2 + 6000));
      }, 0);

      utterance.onstart = () => {
        if (tokenRef.current !== token) return;
        segStartRef.current = performance.now();
      };

      utterance.onboundary = (event) => {
        if (tokenRef.current !== token) return;
        setCharIndex(typeof event.charIndex === "number" ? event.charIndex : 0);
      };

      utterance.onend = () => {
        if (tokenRef.current !== token) return;
        clearWatchdog();

        // calibración con el tiempo real del fragmento
        const started = segStartRef.current;
        if (started !== null) {
          const dt = (performance.now() - started) / 1000;
          if (dt > 0.35) {
            const cps = text.length / dt;
            if (Number.isFinite(cps) && cps > 1) cpsRef.current = cpsRef.current * 0.55 + cps * 0.45;
            elapsedBaseRef.current += dt;
          }
        }
        segStartRef.current = null;
        setCharIndex(0);

        if (i + 1 < segsRef.current.length) {
          idxRef.current = i + 1;
          setIndex(i + 1);
          speakAtRef.current(i + 1);
        } else {
          setStatusBoth("idle");
        }
      };

      utterance.onerror = (event) => {
        if (tokenRef.current !== token) return;
        // "interrupted"/"canceled" son consecuencia de cancel(): no son errores
        if (event.error === "interrupted" || event.error === "canceled") return;
        clearWatchdog();
        setError(
          event.error === "not-allowed"
            ? "El navegador bloqueó la voz. Hacé clic en la página y volvé a intentar."
            : `La voz falló (${event.error}).`,
        );
        setStatusBoth("idle");
      };
    },
    [setStatusBoth],
  );

  useEffect(() => {
    speakAtRef.current = speakAt;
  }, [speakAt]);

  /* -------------------------------- acciones ------------------------------ */
  const start = useCallback(
    (next: SpeechSegment[], nextLabel: string, from = 0) => {
      if (!next.length) return;
      setError(null);
      segsRef.current = next;
      setSegments(next);
      const at = Math.max(0, Math.min(next.length - 1, from));
      idxRef.current = at;
      setIndex(at);
      setCharIndex(0);
      setLabel(nextLabel);
      elapsedBaseRef.current = 0;
      setElapsed(0);
      setStatusBoth("playing");
      speakAt(at);
    },
    [speakAt, setStatusBoth],
  );

  const pause = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.pause();
    const started = segStartRef.current;
    if (started !== null) {
      elapsedBaseRef.current += (performance.now() - started) / 1000;
      segStartRef.current = null;
      setElapsed(elapsedBaseRef.current);
    }
    clearWatchdog();
    setStatusBoth("paused");
  }, [setStatusBoth]);

  const resume = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.resume();
    segStartRef.current = performance.now();
    setStatusBoth("playing");
    // rearmamos el perro guardián con lo que queda del fragmento actual
    const seg = segsRef.current[idxRef.current];
    if (seg) {
      const rest = seg.text.length / Math.max(4, cpsRef.current);
      clearWatchdog();
      watchdogRef.current = setTimeout(() => {
        const current = idxRef.current;
        if (current + 1 < segsRef.current.length) {
          idxRef.current = current + 1;
          setIndex(current + 1);
          speakAtRef.current(current + 1);
        } else {
          setStatusBoth("idle");
        }
      }, Math.min(120000, rest * 2000 + 6000));
    }
  }, [setStatusBoth]);

  const seek = useCallback(
    (i: number) => {
      const segs = segsRef.current;
      if (!segs.length) return;
      const at = Math.max(0, Math.min(segs.length - 1, i));
      idxRef.current = at;
      setIndex(at);
      setCharIndex(0);
      setStatusBoth("playing");
      speakAt(at);
    },
    [speakAt, setStatusBoth],
  );

  const next = useCallback(() => seek(idxRef.current + 1), [seek]);
  const prev = useCallback(() => seek(idxRef.current - 1), [seek]);
  const repeat = useCallback(() => seek(idxRef.current), [seek]);

  const toggle = useCallback(() => {
    if (statusRef.current === "playing") pause();
    else if (statusRef.current === "paused") resume();
  }, [pause, resume]);

  /* -------------------------------- derivados ----------------------------- */
  const total = useMemo(() => totalChars(segments), [segments]);
  const spoken = useMemo(
    () => (segments.length ? spokenChars(segments, index, charIndex) : 0),
    [segments, index, charIndex],
  );
  const remaining = status === "idle" ? 0 : estimateRemaining(total - spoken, cpsRef.current);
  const activeBlockId = status === "idle" ? null : segments[index]?.blockId ?? null;

  const value = useMemo<SpeechValue>(
    () => ({
      supported,
      voices,
      status,
      segments,
      index,
      label,
      activeBlockId,
      error,
      chars: { total, spoken },
      elapsed,
      remaining,
      start,
      toggle,
      pause,
      resume,
      stop,
      next,
      prev,
      repeat,
      seek,
    }),
    [
      supported, voices, status, segments, index, label, activeBlockId, error,
      total, spoken, elapsed, remaining, start, toggle, pause, resume, stop, next, prev, repeat, seek,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSpeech(): SpeechValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSpeech debe usarse dentro de <SpeechProvider>");
  return ctx;
}

/**
 * Sincroniza el resaltado con el DOM sin re-renderizar el editor.
 *
 * El editor tiene cientos de nodos; alternar una clase es infinitamente más
 * barato que pasar el bloque activo por props y volver a pintar la lista entera.
 */
export function SpeechHighlighter() {
  const { activeBlockId } = useSpeech();
  const autoScroll = useStore((s) => s.tts.autoScroll);

  useEffect(() => {
    document.querySelectorAll(".tts-active").forEach((el) => el.classList.remove("tts-active"));
    if (!activeBlockId) return;

    const selector =
      activeBlockId === "__title" ? "[data-tts-title]" : `[data-block-id="${activeBlockId}"]`;
    const el = document.querySelector(selector);
    if (!el) return;

    el.classList.add("tts-active");
    if (autoScroll) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [activeBlockId, autoScroll]);

  // al terminar la lectura no debe quedar ningún bloque marcado
  useEffect(
    () => () => {
      document.querySelectorAll(".tts-active").forEach((el) => el.classList.remove("tts-active"));
    },
    [],
  );

  return null;
}

export default SpeechProvider;
