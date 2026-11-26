/**
 * Utilidades de voz — lógica pura, sin React y sin `window`.
 *
 * Todo lo que el motor de lectura necesita para convertir los bloques del
 * documento en una cola de frases pronunciables: limpiar el HTML inline,
 * trocear por frases (para tener granularidad de resaltado), aplicar las
 * reglas de pronunciación del usuario y estimar tiempos.
 *
 * Mantener esto fuera del componente es lo que permite testear el motor sin
 * un navegador: acá no hay `speechSynthesis` ni DOM.
 */

import type { Block } from "./types";

export interface SpeechSegment {
  /** id del bloque de origen ("" = título del documento) */
  blockId: string;
  text: string;
}

export interface PronRule {
  id: string;
  from: string;
  to: string;
}

/* ========================================================================== */
/*                            HTML inline → texto                             */
/* ========================================================================== */

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  laquo: "«",
  raquo: "»",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  uuml: "ü",
  ntilde: "ñ",
  Aacute: "Á",
  Eacute: "É",
  Iacute: "Í",
  Oacute: "Ó",
  Uacute: "Ú",
  Uuml: "Ü",
  Ntilde: "Ñ",
  iexcl: "¡",
  iquest: "¿",
  deg: "°",
  middot: "·",
  bull: "•",
  times: "×",
  copy: "©",
};

/** Decodifica entidades HTML nombradas y numéricas sin tocar el DOM. */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      // fuera de rango → dejamos la entidad tal cual en vez de romper
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return NAMED[body] ?? match;
  });
}

/**
 * HTML parcial (el que guarda el editor) → texto plano pronunciable.
 * Los saltos de bloque se conservan como "\n" para que el troceado por frases
 * no pegue dos párrafos distintos.
 */
export function htmlToText(html: string): string {
  if (!html) return "";
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr|td|th)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(withBreaks)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/* ========================================================================== */
/*                          Métricas del documento                            */
/* ========================================================================== */

export const countWords = (text: string): number => {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
};

export const countChars = (text: string): number => text.replace(/\s+/g, "").length;

/** 190 ppm ≈ lecturasilenciosa cómoda en español. */
export const estimateMinutes = (words: number, wpm = 190): number =>
  words === 0 ? 0 : Math.max(1, Math.round(words / wpm));

/** m:ss — con horas cuando hace falta. */
export function formatClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "--:--";
  const total = Math.round(totalSeconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ========================================================================== */
/*                            Troceado por frases                             */
/* ========================================================================== */

/**
 * Corta un texto en trozos de como mucho `max` caracteres respetando el final
 * de frase. Trocear mejora dos cosas: el resaltado (sabemos qué frase suena) y
 * la latencia de `onboundary` (más eventos, progreso más fino).
 */
export function splitSentences(text: string, max = 240): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const parts = clean.match(/[^.!?…]+[.!?…]+["»”)\]]?\s*|[^.!?…]+$/g) ?? [clean];
  const out: string[] = [];
  let buf = "";

  for (const raw of parts) {
    const piece = raw.trim();
    if (!piece) continue;

    if (!buf) buf = piece;
    else if ((buf + " " + piece).length <= max) buf = `${buf} ${piece}`;
    else {
      out.push(buf);
      buf = piece;
    }

    // una sola frase más larga que `max` se parte por palabras
    while (buf.length > max) {
      let cut = buf.lastIndexOf(" ", max);
      if (cut <= 0) cut = max;
      out.push(buf.slice(0, cut).trim());
      buf = buf.slice(cut).trim();
    }
  }

  if (buf) out.push(buf);
  return out;
}

/* ========================================================================== */
/*                       Reglas de pronunciación                              */
/* ========================================================================== */

export const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Aplica las reglas del usuario **sólo al texto que se va a pronunciar**.
 * El documento nunca se modifica: el resaltado y el contenido siguen intactos.
 */
export function applyRules(text: string, rules: PronRule[]): string {
  let out = text;
  for (const rule of rules) {
    if (!rule.from.trim()) continue;
    try {
      out = out.replace(new RegExp(escapeRegExp(rule.from), "gi"), rule.to);
    } catch {
      // una regla que no compila se ignora: no debe romper la lectura
    }
  }
  return out;
}

/**
 * Símbolos y expresiones → forma hablable en español.
 *
 * Deliberadamente conservador: sólo se sustituyen signos que una voz leería
 * mal o directamente omitiría. No se toca el signo `=` ni el punto medio de
 * separación, porque en prosa normal ("Hace 2 · 3 días") sonarían mal.
 */
export function speakableMath(text: string): string {
  return text
    .replace(/\^2\b/g, " al cuadrado")
    .replace(/\^3\b/g, " al cubo")
    .replace(/\^(\w+)/g, " elevado a $1")
    .replace(/\bπ\b/g, "pi")
    .replace(/\b∞\b/g, "infinito")
    .replace(/\b√/g, "raíz de ")
    .replace(/≈/g, "aproximadamente")
    .replace(/≤/g, "menor o igual que")
    .replace(/≥/g, "mayor o igual que")
    .replace(/≠/g, "distinto de")
    .replace(/∑/g, "sumatoria de ")
    .replace(/÷/g, " dividido ")
    .replace(/[×✕]/g, " por ");
}

/* ========================================================================== */
/*                       Documento → cola de segmentos                        */
/* ========================================================================== */

/** Tipos que no se leen: un divisor no suena, y el código en voz alta es ruido. */
const SILENT: Block["type"][] = ["divider", "code"];

/**
 * Construye la cola de lectura de una página: el título primero y después cada
 * bloque troceado en frases. Cada segmento conserva el id del bloque para que
 * el resaltado pueda seguir la voz sobre el documento.
 */
export function buildSegments(title: string, blocks: Block[]): SpeechSegment[] {
  const segments: SpeechSegment[] = [];

  const push = (blockId: string, raw: string) => {
    // 180 caracteres ≈ 13 s a velocidad normal: por debajo del corte de Chrome
  for (const sentence of splitSentences(raw, 180)) {
      const text = sentence.trim();
      if (text) segments.push({ blockId, text });
    }
  };

  if (title.trim()) push("__title", title.trim());

  for (const block of blocks) {
    if (SILENT.includes(block.type)) continue;
    const text = htmlToText(block.html);
    if (text) push(block.id, text);
  }

  return segments;
}

/** Caracteres totales de una cola (denominador del progreso). */
export const totalChars = (segments: SpeechSegment[]): number =>
  segments.reduce((n, s) => n + s.text.length, 0);

/** Caracteres ya pronunciados hasta el segmento/índice actual. */
export function spokenChars(segments: SpeechSegment[], index: number, charIndex: number): number {
  let n = 0;
  for (let i = 0; i < index && i < segments.length; i += 1) n += segments[i].text.length;
  return n + Math.max(0, Math.min(charIndex, segments[index]?.text.length ?? 0));
}

/**
 * Estimación de segundos restantes. `cps` es la velocidad real medida por el
 * motor (caracteres por segundo); 14/s es un arranque razonable para español.
 */
export function estimateRemaining(charsLeft: number, cps: number): number {
  const speed = cps > 2 ? cps : 14;
  return Math.max(0, charsLeft) / speed;
}

/* ========================================================================== */
/*                                  Voces                                     */
/* ========================================================================== */

export const isSpanish = (v: SpeechSynthesisVoice): boolean => /^es/i.test(v.lang);

/**
 * Elige la mejor voz por defecto: español local > español > local > primera.
 * Las voces locales ("localService") no dependen de la red y arrancan antes.
 */
export function pickDefaultVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  return (
    voices.find((v) => isSpanish(v) && v.localService) ??
    voices.find(isSpanish) ??
    voices.find((v) => v.localService) ??
    voices[0]
  );
}

export const voiceLabel = (v: SpeechSynthesisVoice): string =>
  `${v.name} · ${v.lang}${v.localService ? "" : " ☁"}`;
