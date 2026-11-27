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
import { normalizeTable, tableColumns, tableFirstText, tableToText } from "./table";
import type { Block, BlockType, Page, TableData } from "./types";

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

/** Celda → texto de una celda GFM (los `|` hay que escaparlos o rompen la tabla). */
const cellToMarkdown = (html: string): string =>
  inlineToMarkdown(html).replace(/\|/g, "\\|").replace(/\n+/g, " ") || " ";

/** Tabla → GFM, con la fila de alineación que corresponde. */
export function tableToMarkdown(table: TableData): string {
  const t = normalizeTable(table);
  const cols = tableColumns(t);
  const line = (cells: string[]) =>
    `| ${Array.from({ length: cols }, (_, c) => cellToMarkdown(cells[c] ?? "")).join(" | ")} |`;

  const align = Array.from({ length: cols }, (_, c) => {
    const a = t.align?.[c] ?? "left";
    if (a === "center") return ":---:";
    if (a === "right") return "---:";
    return "---";
  });

  return [line(t.header), `| ${align.join(" | ")} |`, ...t.rows.map(line)].join("\n");
}

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
      case "table": {
        const table = block.table ?? { header: [], rows: [] };
        out.push(
          ...tableToMarkdown(table)
            .split("\n")
            .map((row) => `${indent}${row}`),
          "",
        );
        break;
      }
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

const alignAttr = (a?: "left" | "center" | "right") =>
  a && a !== "left" ? ` style="text-align:${a}"` : "";

/** Página → HTML autónomo (para imprimir o guardar). */
export function pageToHtml(title: string, blocks: Block[]): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  /** Un bloque → HTML del cuerpo. */
  const renderBlock = (b: Block): string => {
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
      case "quote":
        return `<blockquote>${inner}</blockquote>`;
      case "callout":
        return `<div class="callout">${inner}</div>`;
      case "table": {
        const table = normalizeTable(b.table ?? { header: [], rows: [] });
        const cols = tableColumns(table);
        const th = table.header
          .slice(0, cols)
          .map((c, i) => `<th${alignAttr(table.align?.[i])}>${c}</th>`)
          .join("");
        const trs = table.rows
          .map(
            (row) =>
              `<tr>${Array.from({ length: cols }, (_, i) => `<td${alignAttr(table.align?.[i])}>${row[i] ?? ""}</td>`).join("")}</tr>`,
          )
          .join("");
        return `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
      }
      default:
        return `<p>${inner}</p>`;
    }
  };

  /**
   * Los ítems de lista van dentro de su `<ul>`/`<ol>`: un `<li>` suelto es HTML
   * inválido y el navegador lo dibuja sin viñeta ni sangría. Se agrupan los
   * consecutivos del mismo tipo, y la sangría del bloque se conserva.
   */
  const listOf = (type: Block["type"]): "ul" | "ol" | null =>
    type === "bulleted" || type === "todo" ? "ul" : type === "numbered" ? "ol" : null;

  const parts: string[] = [];
  let abierta: "ul" | "ol" | null = null;

  const cerrar = () => {
    if (abierta) {
      parts.push(`</${abierta}>`);
      abierta = null;
    }
  };

  for (const block of blocks) {
    const lista = listOf(block.type);
    if (!lista) {
      cerrar();
      parts.push(renderBlock(block));
      continue;
    }

    if (abierta !== lista) {
      cerrar();
      abierta = lista;
      parts.push(`<${lista}>`);
    }

    const sangria = block.indent ? ` style="margin-left:${block.indent * 18}px"` : "";
    const marca = block.type === "todo" ? `${block.checked ? "☑" : "☐"} ` : "";
    parts.push(`<li${sangria}>${marca}${block.html || ""}</li>`);
  }
  cerrar();

  const rows = parts.join("\n");

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
  ul, ol { padding-left: 1.4em; margin: 8px 0; }
  li { margin: 2px 0; }
  table { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 14px; }
  th, td { border: 1px solid #e9e9e7; padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: #f7f7f5; font-weight: 600; }
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

/* --------------------------- ¿es Markdown pegado? -------------------------- */

/**
 * Heurística para decidir si lo que se pegó es Markdown y hay que convertirlo.
 *
 * Es conservadora a propósito: si alguien pega una frase con un asterisco, debe
 * quedar como texto. Sólo se convierte cuando hay señales **estructurales**
 * (varias líneas con marcadores) o un marcador de bloque inequívoco.
 */
export function looksLikeMarkdown(text: string): boolean {
  const value = text.replace(/\r\n?/g, "\n").trim();
  if (!value) return false;

  const lines = value.split("\n");
  const structural = lines.filter((line) =>
    /^(\s*)(#{1,6}\s|>\s?|[-*+]\s|\d+[.)]\s|```)/.test(line),
  ).length;

  // tabla: fila con pipes + separación
  const hasTable = lines.some(
    (line, i) => line.includes("|") && i + 1 < lines.length && isTableDelimiter(lines[i + 1]),
  );
  if (hasTable) return true;

  // varias líneas con marcadores → es un documento pegado
  if (structural >= 2) return true;

  // una sola línea: sólo si es encabezado o ítem de lista
  if (lines.length === 1) return /^\s*(#{1,6}\s|>\s?|[-*+]\s|\d+[.)]\s)/.test(value);

  // varias líneas sin marcadores: pegar texto plano debe seguir siendo texto
  return false;
}

/* ------------------------------- tablas GFM ------------------------------- */

/** Fila de separación de una tabla: `| --- | :--: | --: |` */
const TABLE_DELIM = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

const isTableDelimiter = (line: string): boolean =>
  line.includes("|") && line.includes("-") && TABLE_DELIM.test(line);

/**
 * Corta una fila de tabla en celdas.
 *
 * Respeta el escape `\|` y no corta dentro de un `code` inline, que son los dos
 * casos donde un `split("|")` ingenuo rompe la tabla (y es exactamente lo que
 * pasaba antes: la tabla terminaba como párrafos llenos de barras).
 */
export function splitTableCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);

  const cells: string[] = [];
  let buf = "";
  let inCode = false;

  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === "\\" && s[i + 1] === "|") {
      buf += "|";
      i += 1;
      continue;
    }
    if (ch === "`") {
      inCode = !inCode;
      buf += ch;
      continue;
    }
    if (ch === "|" && !inCode) {
      cells.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  cells.push(buf);

  return cells.map((c) => c.trim());
}

const alignOf = (cell: string): "left" | "center" | "right" => {
  const left = cell.trim().startsWith(":");
  const right = cell.trim().endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  return "left";
};

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

  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li];
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

    /* --------------------------- tabla GFM ---------------------------- */
    if (
      line.includes("|") &&
      li + 1 < lines.length &&
      isTableDelimiter(lines[li + 1]) &&
      splitTableCells(line).length === splitTableCells(lines[li + 1]).length
    ) {
      const header = splitTableCells(line).map((c) => inlineToHtml(c));
      const align = splitTableCells(lines[li + 1]).map(alignOf);
      const rows: string[][] = [];

      let cursor = li + 2;
      while (cursor < lines.length) {
        const row = lines[cursor];
        // la tabla termina en la primera línea que no es fila
        if (!row.trim() || !row.includes("|")) break;
        if (HEADING.test(row) || FENCE.test(row) || DIVIDER.test(row)) break;
        rows.push(splitTableCells(row).map((c) => inlineToHtml(c)));
        cursor += 1;
      }

      blocks.push({
        id: makeId(),
        type: "table",
        html: "",
        indent: 0,
        table: normalizeTable({ header, rows, align }),
      });
      li = cursor - 1; // el `for` continúa donde terminó la tabla
      continue;
    }

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
  const firstText = (b: Block): string =>
    htmlToText(b.html) || (b.type === "table" ? tableFirstText(b.table ?? { header: [], rows: [] }) : "");
  const first = blocks.find((b) => firstText(b));
  if (first) return firstText(first).slice(0, 60);
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
    const text =
      block.type === "table"
        ? tableToText(block.table ?? { header: [], rows: [] }, { headers: false })
        : htmlToText(block.html);
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
    } else {
      /**
       * La sangría del bloque **es** la jerarquía del documento: sin sumarla, el
       * contorno salía plano y el mapa mental perdía los niveles (sólo los
       * encabezados aportaban profundidad). El tope de 4 es el mismo que aplica
       * el editor al sangrar.
       */
      const nivel = heading + 1 + Math.min(4, block.indent ?? 0);
      lines.push(`${"  ".repeat(nivel)}- ${text}`);
    }
  }

  return lines.join("\n");
}

/* ========================================================================== */
/*                     Exportación de todo el workspace                       */
/* ========================================================================== */

/**
 * Un solo `.html` autocontenido con **todas** las páginas del workspace.
 *
 * Es el equivalente local honesto de la exportación masiva de Notion: allí el
 * backend arma un PDF por página; acá no hay servidor, así que se genera un
 * archivo único con índice, jerarquía y el mismo render que la exportación de
 * una página. Se abre sin conexión, se imprime a PDF desde el navegador y no
 * depende de ninguna herramienta externa ni de un ZIP prestado.
 *
 * Sin `URL.createObjectURL` ni descargas múltiples: el navegador bloquearía
 * catorce descargas seguidas, y un ZIP obligaría a meter una dependencia.
 */
export function workspaceToHtml(pages: Page[], workspaceTitle = "Nook"): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const vivas = pages.filter((p) => !p.trashed);
  const porId = new Map(vivas.map((p) => [p.id, p]));

  /** Ruta de ancestros, para que el índice muestre dónde vive cada página. */
  const ruta = (page: Page): string[] => {
    const nombres: string[] = [];
    let actual: Page | undefined = page;
    let guardia = 0;
    while (actual && guardia < 32) {
      nombres.unshift(actual.title || "Sin título");
      actual = actual.parentId ? porId.get(actual.parentId) : undefined;
      guardia += 1;
    }
    return nombres;
  };

  const ancla = (id: string) => `pag-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const indice = vivas
    .map((p) => {
      const nombres = ruta(p);
      const sangria = Math.max(0, nombres.length - 1) * 16;
      const titulo = escape(nombres[nombres.length - 1] ?? "Sin título");
      return `<li style="margin-left:${sangria}px"><a href="#${ancla(p.id)}">${titulo}</a></li>`;
    })
    .join("\n");

  /**
   * Cuerpo de cada página: se reutiliza `pageToHtml` y se recorta el documento
   * completo que devuelve (su `<body>`), para no anidar `<html>` catorce veces.
   */
  const secciones = vivas
    .map((p) => {
      const doc = pageToHtml(p.title || "Sin título", p.blocks ?? []);
      const cuerpo = doc.slice(doc.indexOf("<body>") + "<body>".length, doc.lastIndexOf("</body>"));
      // `<h1>` repetido: el título de la página ya lo pone la sección
      const sinTitulo = cuerpo.replace(/^\s*<h1>[\s\S]*?<\/h1>/, "");
      return `<section id="${ancla(p.id)}">
<h2>${escape(p.title || "Sin título")}</h2>
${sinTitulo.trim()}
</section>`;
    })
    .join("\n<hr />\n");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escape(workspaceTitle)} — exportación completa</title>
<style>
  body { max-width: 760px; margin: 48px auto; padding: 0 20px;
         font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
         color: #37352f; }
  h1 { font-size: 32px; margin-bottom: 8px; }
  h2 { font-size: 22px; margin: 34px 0 10px; padding-top: 6px; border-top: 1px solid #e9e9e7; }
  a { color: #2383e2; }
  code { background: rgba(55,53,47,.06); border-radius: 3px; padding: .15em .35em; font-size: .88em; }
  pre { background: rgba(55,53,47,.06); padding: 12px 14px; border-radius: 6px; overflow: auto; }
  blockquote { border-left: 3px solid rgba(55,53,47,.25); margin: 12px 0; padding-left: 14px; }
  .callout { background: #f1f1ef; border-radius: 6px; padding: 10px 14px; margin: 12px 0; }
  hr { border: 0; border-top: 1px solid #e9e9e7; margin: 26px 0; }
  ul, ol { padding-left: 1.4em; margin: 8px 0; }
  table { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 14px; }
  th, td { border: 1px solid #e9e9e7; padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: #f7f7f5; font-weight: 600; }
  .indice { background: #f7f7f5; border-radius: 8px; padding: 14px 18px; }
  .indice ul { list-style: none; padding-left: 0; margin: 0; }
  .indice li { margin: 3px 0; }
  @media print { .indice { break-after: page; } section { break-inside: avoid-page; } }
</style>
</head>
<body>
<h1>${escape(workspaceTitle)}</h1>
<p>${vivas.length} ${vivas.length === 1 ? "página" : "páginas"} · exportado el ${new Date().toLocaleDateString("es-AR")}</p>
<nav class="indice">
<ul>
${indice}
</ul>
</nav>
${secciones}
</body>
</html>
`;
}
