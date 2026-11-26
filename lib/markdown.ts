/**
 * Puente Markdown ⇄ bloques.
 *
 * Sirve para tres cosas concretas del producto:
 *  1. **Importar** un `.md` / `.txt` del disco y convertirlo en una página con
 *     bloques reales (no un `<pre>` gigante).
 *  2. **Exportar** cualquier página a Markdown, que es el formato de
 *     intercambio que no encierra al usuario.
 *  3. Alimentar el **editor de contornos** del mapa mental.
 *
 * El parser es deliberadamente pequeño y sin dependencias: cubre lo que el
 * editor puede representar. Lo que no entiende, lo convierte en párrafo en vez
 * de perderlo.
 */

import { decodeEntities, htmlToText } from "./speech";
import type { Block, BlockType } from "./types";

/* ========================================================================== */
/*                                  Exportar                                  */
/* ========================================================================== */

/** HTML inline del editor → Markdown inline. */
export function inlineToMarkdown(html: string): string {
  const s = html
    .replace(/<(strong|b)>/gi, "**")
    .replace(/<\/(strong|b)>/gi, "**")
    .replace(/<(em|i)>/gi, "*")
    .replace(/<\/(em|i)>/gi, "*")
    .replace(/<(s|strike|del)>/gi, "~~")
    .replace(/<\/(s|strike|del)>/gi, "~~")
    .replace(/<code>/gi, "`")
    .replace(/<\/code>/gi, "`")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(s).replace(/\s+/g, " ").trim();
}

const BULLET: Record<string, string> = { bulleted: "- ", numbered: "1. ", toggle: "- " };

/** Página completa → Markdown. */
export function pageToMarkdown(title: string, blocks: Block[]): string {
  const out: string[] = [];
  if (title.trim()) out.push(`# ${title.trim()}`, "");

  for (const block of blocks) {
    const indent = "  ".repeat(Math.min(4, block.indent ?? 0));
    const text = inlineToMarkdown(block.html);

    switch (block.type) {
      case "divider":
        out.push(`${indent}---`);
        break;
      case "code":
        out.push(`${indent}\`\`\``, `${indent}${htmlToText(block.html)}`, `${indent}\`\`\``);
        break;
      case "h1":
        out.push(`## ${text}`);
        break;
      case "h2":
        out.push(`### ${text}`);
        break;
      case "h3":
        out.push(`#### ${text}`);
        break;
      case "todo":
        out.push(`${indent}- [${block.checked ? "x" : " "}] ${text}`);
        break;
      case "quote":
        out.push(`${indent}> ${text}`);
        break;
      case "callout":
        out.push(`${indent}> 💡 ${text}`);
        break;
      default:
        out.push(`${indent}${BULLET[block.type] ?? ""}${text}`);
    }
    // separa bloques de texto para que el Markdown respire
    if (["h1", "h2", "h3", "paragraph", "quote", "callout", "divider"].includes(block.type)) {
      out.push("");
    }
  }

  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

/** Página → HTML autónomo (para imprimir o guardar). */
export function pageToHtml(title: string, blocks: Block[]): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows = blocks
    .map((b) => {
      const inner = b.html || "";
      switch (b.type) {
        case "divider":
          return "<hr />";
        case "code":
          return `<pre><code>${escape(htmlToText(b.html))}</code></pre>`;
        case "h1":
          return `<h2>${inner}</h2>`;
        case "h2":
          return `<h3>${inner}</h3>`;
        case "h3":
          return `<h4>${inner}</h4>`;
        case "bulleted":
          return `<li>${inner}</li>`;
        case "numbered":
          return `<li>${inner}</li>`;
        case "todo":
          return `<li>${b.checked ? "☑" : "☐"} ${inner}</li>`;
        case "quote":
          return `<blockquote>${inner}</blockquote>`;
        case "callout":
          return `<div class="callout">${inner}</div>`;
        default:
          return `<p>${inner}</p>`;
      }
    })
    .join("\n");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escape(title || "Sin título")}</title>
<style>
  body { max-width: 720px; margin: 48px auto; padding: 0 20px;
         font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
         color: #37352f; }
  h1 { font-size: 34px; margin-bottom: 24px; }
  code { background: rgba(55,53,47,.06); border-radius: 3px; padding: .15em .35em; font-size: .88em; }
  pre { background: rgba(55,53,47,.06); padding: 12px 14px; border-radius: 6px; overflow: auto; }
  blockquote { border-left: 3px solid rgba(55,53,47,.25); margin: 12px 0; padding-left: 14px; }
  .callout { background: #f1f1ef; border-radius: 6px; padding: 10px 14px; margin: 12px 0; }
  hr { border: 0; border-top: 1px solid #e9e9e7; margin: 20px 0; }
</style>
</head>
<body>
<h1>${escape(title || "Sin título")}</h1>
${rows}
</body>
</html>
`;
}

/* ========================================================================== */
/*                                  Importar                                  */
/* ========================================================================== */

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Markdown inline → HTML inline (lo que entiende el editor). */
export function inlineToHtml(text: string): string {
  let s = escapeHtml(text);
  // código primero: dentro de un `code` no debe aplicarse el resto
  const codes: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => `<code>${codes[Number(i)]}</code>`);
  return s;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET_LINE = /^(\s*)[-*+]\s+(.*)$/;
const TODO = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/;
const NUMBERED = /^(\s*)(\d+)[.)]\s+(.*)$/;
const QUOTE = /^(\s*)>\s?(.*)$/;
const FENCE = /^(\s*)```/;
const DIVIDER = /^(\s*)(-{3,}|\*{3,}|_{3,})\s*$/;

/**
 * Markdown → bloques. `makeId` se inyecta para no importar el generador de ids
 * acá y poder testear con ids deterministas.
 */
export function markdownToBlocks(markdown: string, makeId: () => string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let fence: { indent: number; lines: string[] } | null = null;

  const indentOf = (spaces: string) => Math.max(0, Math.min(4, Math.floor(spaces.length / 2)));

  const push = (type: BlockType, html: string, extra: Partial<Block> = {}) => {
    blocks.push({ id: makeId(), type, html, indent: 0, ...extra });
  };

  for (const line of lines) {
    // dentro de un bloque de código no se interpreta nada
    if (fence) {
      if (FENCE.test(line)) {
        push("code", escapeHtml(fence.lines.join("\n")), { indent: fence.indent });
        fence = null;
      } else {
        fence.lines.push(line);
      }
      continue;
    }

    const openFence = line.match(FENCE);
    if (openFence) {
      fence = { indent: indentOf(openFence[1]), lines: [] };
      continue;
    }

    if (!line.trim()) continue;

    if (DIVIDER.test(line)) {
      push("divider", "");
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      const level = heading[1].length;
      const type: BlockType = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
      push(type, inlineToHtml(heading[2].trim()));
      continue;
    }

    const todo = line.match(TODO);
    if (todo) {
      push("todo", inlineToHtml(todo[3].trim()), {
        indent: indentOf(todo[1]),
        checked: todo[2].toLowerCase() === "x",
      });
      continue;
    }

    const bullet = line.match(BULLET_LINE);
    if (bullet) {
      push("bulleted", inlineToHtml(bullet[2].trim()), { indent: indentOf(bullet[1]) });
      continue;
    }

    const numbered = line.match(NUMBERED);
    if (numbered) {
      push("numbered", inlineToHtml(numbered[3].trim()), { indent: indentOf(numbered[1]) });
      continue;
    }

    const quote = line.match(QUOTE);
    if (quote) {
      push("quote", inlineToHtml(quote[2].trim()), { indent: indentOf(quote[1]) });
      continue;
    }

    push("paragraph", inlineToHtml(line.trim()));
  }

  // un fence sin cerrar no debe perder texto
  if (fence) push("code", escapeHtml(fence.lines.join("\n")), { indent: fence.indent });

  return blocks.length ? blocks : [{ id: makeId(), type: "paragraph", html: "", indent: 0 }];
}

/** Título razonable para una página importada: primer H1 o primer texto. */
export function inferTitle(blocks: Block[], fallback: string): string {
  const heading = blocks.find((b) => b.type === "h1" && htmlToText(b.html));
  if (heading) return htmlToText(heading.html).slice(0, 80);
  const first = blocks.find((b) => htmlToText(b.html));
  if (first) return htmlToText(first.html).slice(0, 60);
  return fallback;
}

/* ========================================================================== */
/*                          Contorno para el mapa mental                      */
/* ========================================================================== */

export interface OutlineEntry {
  /** 0 = raíz (título), 1..n = profundidad */
  depth: number;
  text: string;
}

/**
 * Texto de contorno (`#`, `##`, `-`) → entradas con profundidad.
 * Es el parser que alimenta tanto el mapa desde la página como el editor de
 * contornos del mapa.
 */
export function parseOutline(text: string): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  let headingDepth = 0;

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (!raw.trim()) continue;
    const line = raw.replace(/\t/g, "  ");

    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (heading) {
      headingDepth = heading[1].length;
      out.push({ depth: headingDepth, text: heading[2].trim() });
      continue;
    }

    const item = line.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (item) {
      const level = Math.floor(item[1].length / 2) + 1;
      out.push({ depth: Math.max(1, headingDepth) + level, text: item[2].trim() });
      continue;
    }

    // párrafo suelto: cuelga del último encabezado
    out.push({ depth: Math.max(1, headingDepth) + 1, text: line.trim() });
  }

  return out;
}

/** Contorno de la página: título + encabezados + listas + párrafos. */
export function pageToOutline(title: string, blocks: Block[]): string {
  const lines: string[] = [`# ${title.trim() || "Sin título"}`];
  let heading = 1;

  for (const block of blocks) {
    // texto plano a propósito: el mapa mental muestra contenido, no marcado
    const text = htmlToText(block.html);
    if (!text) continue;
    if (block.type === "h1") {
      heading = 1;
      lines.push(`## ${text}`);
    } else if (block.type === "h2") {
      heading = 2;
      lines.push(`### ${text}`);
    } else if (block.type === "h3") {
      heading = 3;
      lines.push(`#### ${text}`);
    } else if (["bulleted", "numbered", "toggle", "todo"].includes(block.type)) {
      lines.push(`${"  ".repeat(heading + 1)}- ${text}`);
    } else {
      lines.push(`${"  ".repeat(heading + 1)}- ${text}`);
    }
  }

  return lines.join("\n");
}
