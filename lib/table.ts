/**
 * Operaciones puras sobre bloques de tabla.
 *
 * Separadas del componente por la misma razón que `speech.ts` y `mindmap.ts`:
 * acá no hay React ni DOM, sólo datos → se pueden probar y reutilizar (importar,
 * exportar, dictar la tabla en voz alta, editar una celda).
 *
 * Convención: la **fila -1 es el encabezado**. Así una sola función de edición
 * sirve para encabezado y cuerpo.
 */

import { htmlToText } from "./speech";
import type { TableData } from "./types";

const sameLength = (row: string[], cols: number): string[] => {
  const out = row.slice(0, cols);
  while (out.length < cols) out.push("");
  return out;
};

/** Cantidad de columnas reales (máximo entre encabezado y filas). */
export const tableColumns = (table: TableData): number =>
  Math.max(1, table.header.length, ...table.rows.map((r) => r.length));

/** Cuadra una tabla irregular (filas con menos celdas que el encabezado). */
export function normalizeTable(table: TableData): TableData {
  const cols = tableColumns(table);
  return {
    header: sameLength(table.header, cols),
    rows: table.rows.map((row) => sameLength(row, cols)),
    align: table.align ? sameLength(table.align, cols) as TableData["align"] : undefined,
  };
}

export function newTable(rows = 2, cols = 2): TableData {
  return {
    header: Array.from({ length: cols }, () => ""),
    rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => "")),
    align: Array.from({ length: cols }, () => "left" as const),
  };
}

/** Lee una celda. `row = -1` es el encabezado. */
export const getCell = (table: TableData, row: number, col: number): string =>
  (row < 0 ? table.header[col] : table.rows[row]?.[col]) ?? "";

/** Escribe una celda y devuelve una tabla nueva (inmutable). */
export function setCell(table: TableData, row: number, col: number, html: string): TableData {
  const next = normalizeTable(table);
  if (row < 0) {
    next.header[col] = html;
    return next;
  }
  while (next.rows.length <= row) next.rows.push(Array.from({ length: tableColumns(next) }, () => ""));
  next.rows[row][col] = html;
  return next;
}

export function addRow(table: TableData, at?: number): TableData {
  const next = normalizeTable(table);
  const cols = tableColumns(next);
  const row = Array.from({ length: cols }, () => "");
  if (at === undefined || at >= next.rows.length) next.rows.push(row);
  else next.rows.splice(Math.max(0, at), 0, row);
  return next;
}

export function removeRow(table: TableData, at: number): TableData {
  const next = normalizeTable(table);
  if (next.rows.length <= 1) return next; // una tabla sin cuerpo no es tabla
  next.rows.splice(Math.max(0, Math.min(at, next.rows.length - 1)), 1);
  return next;
}

export function addColumn(table: TableData, at?: number): TableData {
  const next = normalizeTable(table);
  const pos = at === undefined ? tableColumns(next) : Math.max(0, Math.min(at, tableColumns(next)));
  next.header.splice(pos, 0, "");
  for (const row of next.rows) row.splice(pos, 0, "");
  if (next.align) next.align.splice(pos, 0, "left");
  return next;
}

export function removeColumn(table: TableData, at: number): TableData {
  const next = normalizeTable(table);
  const cols = tableColumns(next);
  if (cols <= 1) return next;
  const pos = Math.max(0, Math.min(at, cols - 1));
  next.header.splice(pos, 1);
  for (const row of next.rows) row.splice(pos, 1);
  if (next.align) next.align.splice(pos, 1);
  return next;
}

/**
 * Texto pronunciable / buscable de una tabla.
 *
 * Para la lectura en voz alta una tabla leída "como tabla" es ruido; se lee
 * `encabezado: valor` por fila, que es como lo diría una persona.
 */
export function tableToText(table: TableData, options: { headers?: boolean } = {}): string {
  const { headers = true } = options;
  const cols = tableColumns(table);
  const head = table.header.map((c) => htmlToText(c).trim());

  const lines: string[] = [];
  for (const row of table.rows) {
    const parts: string[] = [];
    for (let c = 0; c < cols; c += 1) {
      const value = htmlToText(row[c] ?? "").trim();
      if (!value) continue;
      const label = head[c];
      parts.push(headers && label ? `${label}: ${value}` : value);
    }
    if (parts.length) lines.push(parts.join(". "));
  }

  return lines.join(". ");
}

/** Primera fila con contenido, útil para títulos y búsquedas. */
export const tableFirstText = (table: TableData): string => {
  const fromHeader = table.header.map((c) => htmlToText(c).trim()).find(Boolean);
  if (fromHeader) return fromHeader;
  for (const row of table.rows) {
    const value = row.map((c) => htmlToText(c).trim()).find(Boolean);
    if (value) return value;
  }
  return "";
};
