/**
 * Mapas mentales — construcción del árbol y cálculo del layout.
 *
 * No dibuja: calcula posiciones. El componente sólo pinta lo que esta función
 * devuelve, así el "tidy tree" horizontal es testeable sin canvas ni SVG.
 *
 * Algoritmo: recorrido post-orden. Cada hoja ocupa una fila y cada padre se
 * centra en la media de sus hijos. Consecuencia útil: una rama colapsada se
 * trata como hoja, así que colapsar no deja huecos.
 */

import { parseOutline, type OutlineEntry } from "./markdown";

export interface MapNode {
  id: string;
  text: string;
  children: MapNode[];
}

export interface LaidNode {
  id: string;
  text: string;
  depth: number;
  x: number;
  y: number;
  parentId: string | null;
  hasChildren: boolean;
  collapsed: boolean;
}

export interface LaidLink {
  from: string;
  to: string;
}

export interface MapLayout {
  nodes: LaidNode[];
  links: LaidLink[];
  width: number;
  height: number;
}

export interface LayoutOptions {
  colWidth?: number;
  rowHeight?: number;
  collapsed?: Set<string>;
  nodeHeight?: number;
}

/* ========================================================================== */
/*                              Árbol desde texto                             */
/* ========================================================================== */

/**
 * Entradas con profundidad → árbol. Una entrada con profundidad mayor que la
 * anterior es hija suya; si salta dos niveles, se cuelga del ancestro válido
 * más cercano (los Markdown reales tienen saltos de `#` a `###` todo el tiempo).
 */
export function treeFromEntries(entries: OutlineEntry[], makeId: () => string): MapNode {
  const root: MapNode = { id: makeId(), text: entries[0]?.text ?? "Sin título", children: [] };
  const stack: { node: MapNode; depth: number }[] = [{ node: root, depth: entries[0]?.depth ?? 0 }];

  for (let i = 1; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!entry.text) continue;

    const node: MapNode = { id: makeId(), text: entry.text, children: [] };

    while (stack.length > 1 && stack[stack.length - 1].depth >= entry.depth) stack.pop();
    stack[stack.length - 1].node.children.push(node);
    stack.push({ node, depth: entry.depth });
  }

  return root;
}

export const treeFromOutline = (outline: string, makeId: () => string): MapNode =>
  treeFromEntries(parseOutline(outline), makeId);

/* ========================================================================== */
/*                                  Layout                                    */
/* ========================================================================== */

export function layoutTree(root: MapNode, options: LayoutOptions = {}): MapLayout {
  const colWidth = options.colWidth ?? 216;
  const rowHeight = options.rowHeight ?? 38;
  const collapsed = options.collapsed ?? new Set<string>();

  const nodes: LaidNode[] = [];
  const links: LaidLink[] = [];
  let row = 0;

  const place = (node: MapNode, depth: number, parentId: string | null): number => {
    const isCollapsed = collapsed.has(node.id);
    const children = isCollapsed ? [] : node.children;

    let y: number;
    if (children.length === 0) {
      y = row * rowHeight;
      row += 1;
    } else {
      const ys = children.map((child) => place(child, depth + 1, node.id));
      y = (ys[0] + ys[ys.length - 1]) / 2;
    }

    nodes.push({
      id: node.id,
      text: node.text,
      depth,
      x: depth * colWidth,
      y,
      parentId,
      hasChildren: node.children.length > 0,
      collapsed: isCollapsed,
    });

    if (parentId) links.push({ from: parentId, to: node.id });
    return y;
  };

  place(root, 0, null);

  const width = Math.max(...nodes.map((n) => n.x), 0) + colWidth;
  const height = Math.max(row * rowHeight, rowHeight);

  return { nodes, links, width, height };
}

/* ========================================================================== */
/*                          Recorridos y utilidades                           */
/* ========================================================================== */

export function countNodes(root: MapNode): number {
  return 1 + root.children.reduce((n, child) => n + countNodes(child), 0);
}

export function maxDepth(root: MapNode, depth = 0): number {
  if (!root.children.length) return depth;
  return Math.max(...root.children.map((child) => maxDepth(child, depth + 1)));
}

/** ids de todas las ramas con hijos: lo que necesita "colapsar todo". */
export function branchIds(root: MapNode, out: string[] = []): string[] {
  if (root.children.length) {
    out.push(root.id);
    for (const child of root.children) branchIds(child, out);
  }
  return out;
}

export const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/* ========================================================================== */
/*                                Exportación                                 */
/* ========================================================================== */

/** Árbol → Markdown de contorno (lo que espera cualquier editor de mapas). */
export function treeToMarkdown(root: MapNode, level = 0): string {
  const head = level === 0 ? `# ${root.text}` : `${"  ".repeat(level - 1)}- ${root.text}`;
  const children = root.children.map((child) => treeToMarkdown(child, level + 1));
  return [head, ...children].filter(Boolean).join("\n");
}
