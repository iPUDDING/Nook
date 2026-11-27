"use client";

import Icon, { type IconName } from "./Icon";
import { cx } from "@/lib/utils";

/**
 * Icono de página con tres formas posibles, igual que en la app de referencia:
 *
 *  - **emoji**: el string tal cual (`📚`);
 *  - **imagen**: `data:image/…` (subida) o `https://…` (pegada como URL);
 *  - **icono lineal**: `line:<nombre>:#RRGGBB`, que se dibuja con el set inline
 *    de `Icon.tsx`.
 *
 * Se guarda todo en `Page.icon` —un solo campo de texto— en lugar de agregar
 * campos nuevos: el respaldo JSON, la búsqueda y el árbol ya leen ese campo y
 * así no hay que migrar workspaces existentes.
 */
export type IconSpec =
  | { kind: "emoji"; value: string }
  | { kind: "image"; src: string }
  | { kind: "line"; name: IconName; color: string };

/** Paleta de los iconos lineales (los colores de Notion, sin inventar). */
export const ICON_COLORS = [
  "#37352f",
  "#787774",
  "#9b9a97",
  "#d9730d",
  "#cb912f",
  "#448361",
  "#337ea9",
  "#9065b0",
  "#c14c8a",
  "#d44c47",
];

/** Iconos lineales disponibles para páginas (subset legible a 20 px). */
export const LINE_ICONS: IconName[] = [
  "home",
  "book",
  "file",
  "folder",
  "template",
  "star",
  "target",
  "clock",
  "calendar",
  "check",
  "list-bulleted",
  "todo",
  "database",
  "table",
  "board",
  "timeline",
  "mindmap",
  "code",
  "type",
  "quote",
  "callout",
  "sun",
  "moon",
  "user",
  "settings",
  "sliders",
  "search",
  "link",
  "lock",
  "inbox",
  "upload",
  "volume",
  "play",
  "image",
];

export function lineIcon(name: IconName, color: string): string {
  return `line:${name}:${color}`;
}

export function parseIcon(raw: string | null | undefined): IconSpec | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  if (/^(data:image\/|https?:\/\/)/i.test(value)) return { kind: "image", src: value };
  if (value.startsWith("line:")) {
    const resto = value.slice(5);
    const corte = resto.lastIndexOf(":");
    if (corte > 0) {
      return { kind: "line", name: resto.slice(0, corte) as IconName, color: resto.slice(corte + 1) || ICON_COLORS[0] };
    }
  }
  return { kind: "emoji", value };
}

export default function PageIcon({
  icon,
  size = 14,
  className,
}: {
  icon: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const spec = parseIcon(icon);
  if (!spec) return null;

  if (spec.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={spec.src}
        alt=""
        data-page-icon="image"
        width={size}
        height={size}
        className={cx("inline-block shrink-0 rounded-[3px] object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  if (spec.kind === "line") {
    return (
      <span
        data-page-icon="line"
        className={cx("inline-flex shrink-0 items-center justify-center", className)}
        style={{ color: spec.color, width: size, height: size }}
      >
        <Icon name={spec.name} size={size} />
      </span>
    );
  }

  return (
    <span
      data-page-icon="emoji"
      className={cx("inline-flex shrink-0 items-center justify-center leading-none", className)}
      style={{ fontSize: size, lineHeight: 1 }}
    >
      {spec.value}
    </span>
  );
}
