import type { Block, ColorKey, Page } from "./types";

/** id corto, sin dependencias externas (nanoid sería un dep más) */
export function uid(prefix = ""): string {
  const s = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  return prefix ? `${prefix}_${s}` : s;
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* -------------------------------------------------------------------------- */
/*  Colores de la paleta (misma familia que la app original)                   */
/* -------------------------------------------------------------------------- */

export const PILL: Record<ColorKey, { bg: string; text: string; name: string }> = {
  gray: { bg: "#F1F1EF", text: "#787774", name: "Gris" },
  brown: { bg: "#F4EEEE", text: "#9F6B53", name: "Marrón" },
  orange: { bg: "#FAEBDD", text: "#D9730D", name: "Naranja" },
  yellow: { bg: "#FBF3DB", text: "#CB912F", name: "Amarillo" },
  green: { bg: "#EDF3EC", text: "#448361", name: "Verde" },
  blue: { bg: "#E7F3F8", text: "#337EA9", name: "Azul" },
  purple: { bg: "#F6F3F9", text: "#9065B0", name: "Violeta" },
  pink: { bg: "#FAF1F5", text: "#C14C8A", name: "Rosa" },
  red: { bg: "#FDEBEC", text: "#D44C47", name: "Rojo" },
};

export const DARK_PILL: Record<ColorKey, { bg: string; text: string }> = {
  gray: { bg: "rgba(255,255,255,0.06)", text: "#9B9A97" },
  brown: { bg: "rgba(147,114,92,0.2)", text: "#BB8568" },
  orange: { bg: "rgba(217,115,13,0.2)", text: "#C77D48" },
  yellow: { bg: "rgba(203,145,47,0.2)", text: "#CB912F" },
  green: { bg: "rgba(68,131,97,0.2)", text: "#529E72" },
  blue: { bg: "rgba(51,126,169,0.2)", text: "#5E91B8" },
  purple: { bg: "rgba(144,101,176,0.2)", text: "#A47BC8" },
  pink: { bg: "rgba(193,76,138,0.2)", text: "#D157A0" },
  red: { bg: "rgba(212,76,71,0.2)", text: "#DF5452" },
};

export const COLOR_KEYS: ColorKey[] = [
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
];

/** Las portadas son gradientes CSS: cero imágenes externas, cero licencias. */
export const COVERS: { id: string; css: string; name: string }[] = [
  { id: "sunset", css: "linear-gradient(120deg,#ff9a9e 0%,#fad0c4 50%,#fbc2eb 100%)", name: "Atardecer" },
  { id: "ocean", css: "linear-gradient(120deg,#a1c4fd 0%,#c2e9fb 100%)", name: "Océano" },
  { id: "mint", css: "linear-gradient(120deg,#d4fc79 0%,#96e6a1 100%)", name: "Menta" },
  { id: "grape", css: "linear-gradient(120deg,#a18cd1 0%,#fbc2eb 100%)", name: "Uva" },
  { id: "ember", css: "linear-gradient(120deg,#f6d365 0%,#fda085 100%)", name: "Brasa" },
  { id: "steel", css: "linear-gradient(120deg,#cfd9df 0%,#e2ebf0 100%)", name: "Acero" },
  { id: "forest", css: "linear-gradient(120deg,#0f2027 0%,#203a43 50%,#2c5364 100%)", name: "Bosque" },
  { id: "rose", css: "linear-gradient(120deg,#fbc2eb 0%,#a6c1ee 100%)", name: "Rosa" },
  { id: "sand", css: "linear-gradient(120deg,#e6dada 0%,#274046 100%)", name: "Arena" },
  { id: "candy", css: "linear-gradient(120deg,#fddb92 0%,#d1fdff 100%)", name: "Caramelo" },
  { id: "ink", css: "linear-gradient(120deg,#232526 0%,#414345 100%)", name: "Tinta" },
  { id: "peach", css: "linear-gradient(120deg,#ffecd2 0%,#fcb69f 100%)", name: "Durazno" },
];

export const COVER_BY_ID = (id: string | null) => COVERS.find((c) => c.id === id)?.css ?? null;

/** Emojis para el selector de icono (sin dependencias de imágenes) */
export const EMOJIS = [
  "📄", "📝", "📚", "📌", "📎", "🗂️", "📁", "🗒️", "📊", "📈",
  "🚀", "🎯", "🔥", "💡", "⚡", "🧠", "🧩", "🛠️", "⚙️", "🔧",
  "✅", "☑️", "⏰", "📅", "🗓️", "🏁", "🎨", "🖌️", "🖼️", "🎬",
  "🌱", "🌊", "🌙", "⭐", "✨", "☀️", "🍀", "🌸", "🍁", "❄️",
  "🏠", "🏢", "🧪", "🔬", "🔍", "💻", "🖥️", "⌨️", "🐛", "🧭",
];

/* -------------------------------------------------------------------------- */
/*  Fechas                                                                     */
/* -------------------------------------------------------------------------- */

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "hace unos segundos";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} días`;
  return new Date(ts).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

/* -------------------------------------------------------------------------- */
/*  Árbol de páginas                                                           */
/* -------------------------------------------------------------------------- */

export function childrenOf(pages: Record<string, Page>, parentId: string | null): Page[] {
  return Object.values(pages)
    .filter((p) => p.parentId === parentId && !p.trashed)
    .sort((a, b) => a.order - b.order);
}

export function ancestorsOf(pages: Record<string, Page>, id: string): Page[] {
  const out: Page[] = [];
  let cur = pages[id];
  let guard = 0;
  while (cur?.parentId && guard++ < 32) {
    const parent = pages[cur.parentId];
    if (!parent) break;
    out.unshift(parent);
    cur = parent;
  }
  return out;
}

/** Todas las páginas descendientes (para borrar/mover en bloque) */
export function descendantsOf(pages: Record<string, Page>, id: string): string[] {
  const out: string[] = [];
  const walk = (pid: string) => {
    for (const p of Object.values(pages)) {
      if (p.parentId === pid) {
        out.push(p.id);
        walk(p.id);
      }
    }
  };
  walk(id);
  return out;
}

export function plainText(html: string): string {
  if (typeof document === "undefined") return html.replace(/<[^>]+>/g, "");
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.textContent ?? "";
}

export const EMPTY_BLOCK_HTML = "";

/* -------------------------------------------------------------------------- */
/*  Lectura                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Bloques realmente visibles: los que cuelgan de un toggle cerrado no se
 * muestran en el editor y tampoco deben leerse en voz alta. Replica la misma
 * regla que usa `Editor` para ocultarlos.
 */
export function visibleBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  let collapseIndent: number | null = null;
  for (const block of blocks) {
    const indent = block.indent ?? 0;
    if (collapseIndent !== null && indent > collapseIndent) continue;
    collapseIndent = null;
    out.push(block);
    if (block.type === "toggle" && block.collapsed) collapseIndent = indent;
  }
  return out;
}

/** `YYYY-MM-DD` en hora local — clave de los histogramas de productividad. */
export function dayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Descarga un Blob sin pasar por el servidor. */
export function downloadFile(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // damos un tick para que el navegador arranque la descarga antes de revocar
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Nombre de archivo seguro a partir de un título. */
export function safeFileName(title: string, extension: string): string {
  const base =
    title
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "sin-titulo";
  return `${base}.${extension}`;
}
