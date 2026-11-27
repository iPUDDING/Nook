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
  /** avance dentro del fragmento actual, 0 → 1 (no depende de eventos del motor) */
  progress: number;
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
  const [progress, setProgress] = useState(0);
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
  /** longitud del texto que se está pronunciando (ya con reglas y símbolos) */
  const uttLenRef = useRef(1);
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

  /**
   * Limpieza al desmontar.
   *
   * `tokenRef` es el mecanismo que invalida callbacks en vuelo: incrementarlo
   * hace que todo `onend` / `onerror` / temporizador pendiente se descarte. Sin
   * esto, el perro guardián armado antes del desmontaje podía dispararse después
   * y llamar a `speak()` otra vez, dejando una voz hablando sin interfaz.
   */
  useEffect(
    () => () => {
      tokenRef.current += 1;
      clearWatchdog();
      segStartRef.current = null;
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    },
    [],
  );

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

  /**
   * Avance del subrayado.
   *
   * `onboundary` es la fuente exacta, pero **no todas las voces lo emiten**
   * (las SAPI de Windows dentro de Electron, sin ir más lejos): sin esto el
   * resaltado se quedaba clavado en la primera frase mientras la voz seguía.
   * El estimador avanza con la velocidad medida (`cps`) y los eventos, cuando
   * llegan, lo corrigen hacia adelante.
   */
  useEffect(() => {
    if (status !== "playing") return;
    const id = setInterval(() => {
      const started = segStartRef.current;
      if (started === null) return;
      const chars = ((performance.now() - started) / 1000) * cpsRef.current;
      const next = Math.min(1, Math.max(0, chars / Math.max(1, uttLenRef.current)));
      setProgress((prev) => (next > prev ? next : prev));
    }, 200);
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
    setProgress(0);
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

      uttLenRef.current = Math.max(1, text.length);
      setProgress(0);

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
        const at = typeof event.charIndex === "number" ? event.charIndex : 0;
        setCharIndex(at);
        // un evento real manda: se adopta como piso del avance
        setProgress((prev) => Math.max(prev, Math.min(1, at / Math.max(1, uttLenRef.current))));
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
        setProgress(0);

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
      setProgress(0);
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
      setProgress(0);
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
      progress,
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
      supported, voices, status, segments, index, label, activeBlockId, progress, error,
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
 * Resaltado de la lectura.
 *
 * Tres capas, de más gruesa a más fina:
 *  1. **bloque activo** → clase `.tts-active` (barra lateral + fondo suave);
 *  2. **frase activa** → CSS Custom Highlight API: se busca el texto del
 *     segmento dentro del bloque y se pinta ese rango. Sin envolver nodos, así
 *     no rompe el `contentEditable` ni el estado de React;
 *  3. **seguimiento** → si la frase queda fuera de la ventana, se desplaza.
 *
 * Se hace por DOM y no por props a propósito: el editor tiene cientos de nodos
 * y re-renderizarlo en cada cambio de frase haría saltar el caret.
 */

interface TextEntry {
  node: Text;
  start: number;
}

function collectText(root: HTMLElement): { entries: TextEntry[]; full: string } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const entries: TextEntry[] = [];
  let full = "";
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    entries.push({ node: text, start: full.length });
    full += text.data ?? "";
    node = walker.nextNode();
  }
  return { entries, full };
}

function locate(entries: TextEntry[], position: number): { node: Text; offset: number } | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i].start <= position) {
      return { node: entries[i].node, offset: position - entries[i].start };
    }
  }
  return null;
}

/** Rango del texto `sentence` dentro de `root`, tolerando diferencias de espacios. */
function sentenceRange(root: HTMLElement, sentence: string): Range | null {
  const needle = sentence.replace(/\s+/g, " ").trim();
  if (!needle) return null;

  const { entries, full } = collectText(root);
  if (!full) return null;

  const flat = full.replace(/\s+/g, " ");
  let at = full.indexOf(needle);
  let length = needle.length;

  if (at < 0) {
    // el DOM puede tener saltos o espacios distintos: probamos con el inicio
    at = flat.indexOf(needle.slice(0, Math.min(28, needle.length)));
    if (at < 0) return null;
    length = Math.min(needle.length, flat.length - at);
  }

  const startEntry = locate(entries, at);
  const endEntry = locate(entries, Math.min(full.length, at + length));
  if (!startEntry || !endEntry) return null;

  try {
    const range = document.createRange();
    range.setStart(startEntry.node, Math.min(startEntry.offset, startEntry.node.length));
    range.setEnd(endEntry.node, Math.min(endEntry.offset, endEntry.node.length));
    return range;
  } catch {
    return null;
  }
}

/**
 * CSS Custom Highlight API.
 *
 * Ojo con el detalle que costó un bug: el registro vive en `CSS.highlights`,
 * pero el **constructor es el global `Highlight`** (`window.Highlight`), no
 * `CSS.Highlight`. Ninguno de los dos está tipado en el lib DOM todavía.
 */
type HighlightCtor = new (...ranges: Range[]) => unknown;
type HighlightRegistry = {
  set: (name: string, value: unknown) => void;
  delete: (name: string) => void;
};

const HIGHLIGHT_NAME = "nook-tts";
/** lo que la voz ya pronunció dentro de la frase actual (subrayado fuerte) */
const HIGHLIGHT_NOW = "nook-tts-now";

const highlightCtor = (): HighlightCtor | undefined =>
  (globalThis as unknown as { Highlight?: HighlightCtor }).Highlight;

const highlightRegistry = (): HighlightRegistry | undefined =>
  (typeof CSS !== "undefined"
    ? (CSS as unknown as { highlights?: HighlightRegistry }).highlights
    : undefined);

function paintRange(name: string, range: Range | null) {
  const registry = highlightRegistry();
  const Ctor = highlightCtor();
  if (!registry || !Ctor) return;
  if (!range) {
    registry.delete(name);
    return;
  }
  registry.set(name, new Ctor(range));
}

function clearSentence() {
  const registry = highlightRegistry();
  registry?.delete(HIGHLIGHT_NAME);
  registry?.delete(HIGHLIGHT_NOW);
}

/**
 * Rango de los primeros `count` caracteres de la frase, partiendo del rango ya
 * resuelto. Se camina el texto en vez de volver a buscar la subcadena: repetir la
 * búsqueda podría encontrar la misma palabra en otra parte del bloque.
 */
function prefixRange(root: HTMLElement, full: Range | null, count: number): Range | null {
  if (!full || count <= 0) return null;
  const startNode = full.startContainer;
  if (!(startNode instanceof Text)) return null;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  let acc = 0;
  let started = false;

  const build = (endNode: Text, endOffset: number): Range | null => {
    try {
      const range = document.createRange();
      range.setStart(startNode, full.startOffset);
      range.setEnd(endNode, Math.min(endOffset, endNode.length));
      return range;
    } catch {
      return null;
    }
  };

  while (node) {
    const text = node.data ?? "";
    if (!started) {
      if (node !== startNode) {
        node = walker.nextNode() as Text | null;
        continue;
      }
      started = true;
      const available = text.length - full.startOffset;
      if (available >= count) return build(node, full.startOffset + count);
      acc = available;
    } else {
      if (acc + text.length >= count) return build(node, count - acc);
      acc += text.length;
    }
    node = walker.nextNode() as Text | null;
  }
  return null;
}

/** Recorta al final de la última palabra para no subrayar media palabra. */
function spokenPrefix(sentence: string, progress: number): number {
  if (progress <= 0) return 0;
  const at = Math.min(sentence.length, Math.round(progress * sentence.length));
  if (at >= sentence.length) return sentence.length;
  const cut = sentence.slice(0, at);
  const space = cut.lastIndexOf(" ");
  return space > 3 ? space : at;
}

export function SpeechHighlighter() {
  const { activeBlockId, segments, index, status, progress } = useSpeech();
  const autoScroll = useStore((s) => s.tts.autoScroll);

  const sentence = status === "idle" ? "" : segments[index]?.text ?? "";

  /** el elemento del bloque activo (el título es un <textarea>: no admite rangos) */
  const activeEl = useCallback((): HTMLElement | null => {
    if (!activeBlockId) return null;
    const selector =
      activeBlockId === "__title" ? "[data-tts-title]" : `[data-block-id="${activeBlockId}"]`;
    return document.querySelector<HTMLElement>(selector);
  }, [activeBlockId]);

  /* -------- capa 1: bloque activo + seguimiento de la ventana ------------ */
  useEffect(() => {
    document.querySelectorAll(".tts-active").forEach((el) => el.classList.remove("tts-active"));
    if (!activeBlockId || !sentence) return;

    const el = activeEl();
    if (!el) return;
    el.classList.add("tts-active");

    if (!autoScroll) return;
    const box = el.getBoundingClientRect();
    if (box.top < 90 || box.bottom > window.innerHeight - 120) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [activeBlockId, sentence, autoScroll, activeEl]);

  /* -------- capa 2 y 3: frase actual + lo ya pronunciado ----------------- */
  useEffect(() => {
    if (!activeBlockId || !sentence) {
      clearSentence();
      return;
    }
    const el = activeEl();
    if (!el) {
      clearSentence();
      return;
    }

    // El título es un <textarea>: los form controls no aceptan rangos de texto.
    if (activeBlockId === "__title") {
      clearSentence();
      return;
    }

    const full = sentenceRange(el, sentence);
    paintRange(HIGHLIGHT_NAME, full);

    const spoken = spokenPrefix(sentence, progress);
    paintRange(HIGHLIGHT_NOW, prefixRange(el, full, spoken));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBlockId, sentence, progress, activeEl]);

  // al terminar la lectura no debe quedar nada marcado
  useEffect(
    () => () => {
      document.querySelectorAll(".tts-active").forEach((el) => el.classList.remove("tts-active"));
      clearSentence();
    },
    [],
  );

  return null;
}

export default SpeechProvider;
