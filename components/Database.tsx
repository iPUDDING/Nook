"use client";

import { useMemo, useState } from "react";
import Icon, { type IconName } from "./Icon";
import { Avatar, MenuItem, MenuSeparator, Pill, Popover } from "./ui";
import { useStore } from "@/lib/store";
import type { CellValue, ColorKey, DbRow, Page, Property } from "@/lib/types";
import { REPETICIONES, ocurrencias, repeticionValida, textoRepeticion } from "@/lib/repeat";
import { COLOR_KEYS, DARK_PILL, PILL, cx, formatDate } from "@/lib/utils";
import { PEOPLE, personById } from "@/lib/seed";

const DARK = false;

/** Icono por tipo de propiedad (se usa en cabecera de tabla y en el peek) */
function propIcon(type: Property["type"]): IconName {
  switch (type) {
    case "select":
    case "status":
      return "list";
    case "person":
      return "user";
    case "date":
      return "calendar";
    case "checkbox":
      return "check";
    case "number":
      return "type";
    default:
      return "type";
  }
}

/* -------------------------------------------------------------------------- */
/*  Celda genérica                                                             */
/* -------------------------------------------------------------------------- */
function optionOf(prop: Property, value: CellValue) {
  return prop.options?.find((o) => o.id === value) ?? null;
}

function SelectCell({
  page,
  prop,
  row,
  open,
  setOpen,
}: {
  page: Page;
  prop: Property;
  row: DbRow;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const updateCell = useStore((s) => s.updateCell);
  const addSelectOption = useStore((s) => s.addSelectOption);
  const [query, setQuery] = useState("");
  const value = row.cells[prop.id] ?? null;
  const current = optionOf(prop, value);
  const theme = useStore((s) => s.theme);

  const create = () => {
    const name = query.trim();
    if (!name) return;
    const id = addSelectOption(page.id, prop.id, name);
    updateCell(page.id, row.id, prop.id, id);
    setQuery("");
    setOpen(false);
  };

  const options = (prop.options ?? []).filter((o) => o.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="flex h-[26px] w-full items-center rounded-[3px] px-1 text-left hover:bg-fg/[0.04]"
      >
        {current ? (
          <Pill color={current.color} dark={theme === "dark"}>
            {current.name}
          </Pill>
        ) : (
          <span className="text-fg/25">—</span>
        )}
      </button>

      <Popover open={open} onClose={() => setOpen(false)} width={230} className="left-0 top-[calc(100%+2px)]">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") create();
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder={prop.type === "status" ? "Cambiar estado…" : "Buscar o crear…"}
          className="mb-1 w-full rounded-[4px] border border-line bg-surface px-2 py-1 text-[13px] outline-none placeholder:text-fg/35 focus:border-accent/60"
        />
        <div className="max-h-[220px] overflow-y-auto">
          {query.trim() && !options.some((o) => o.name.toLowerCase() === query.trim().toLowerCase()) && (
            <MenuItem onClick={create}>Crear «{query.trim()}»</MenuItem>
          )}
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                updateCell(page.id, row.id, prop.id, value === o.id ? null : o.id);
                setOpen(false);
              }}
              className="menu-item"
            >
              <Pill color={o.color} dark={theme === "dark"}>
                {o.name}
              </Pill>
              {value === o.id && <Icon name="check" size={13} className="ml-auto text-fg/50" />}
            </button>
          ))}
          {value !== null && (
            <>
              <MenuSeparator />
              <MenuItem
                icon={<Icon name="x" size={14} />}
                onClick={() => {
                  updateCell(page.id, row.id, prop.id, null);
                  setOpen(false);
                }}
              >
                Vaciar
              </MenuItem>
            </>
          )}
        </div>
      </Popover>
    </div>
  );
}

function PersonCell({ page, prop, row }: { page: Page; prop: Property; row: DbRow }) {
  const updateCell = useStore((s) => s.updateCell);
  const [open, setOpen] = useState(false);
  const value = row.cells[prop.id] as string | null;
  const person = value ? personById(value) : undefined;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="flex h-[26px] w-full items-center gap-1.5 rounded-[3px] px-1 text-left hover:bg-fg/[0.04]"
      >
        <Avatar person={person} size={18} />
        {person ? <span className="truncate text-[13px] text-fg/80">{person.name}</span> : <span className="text-fg/25">—</span>}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} width={220}>
        {PEOPLE.map((p) => (
          <MenuItem
            key={p.id}
            icon={<Avatar person={p} size={18} />}
            onClick={() => {
              updateCell(page.id, row.id, prop.id, value === p.id ? null : p.id);
              setOpen(false);
            }}
          >
            {p.name}
            {value === p.id && <Icon name="check" size={13} className="ml-auto text-fg/50" />}
          </MenuItem>
        ))}
      </Popover>
    </div>
  );
}

function TextCell({
  page,
  prop,
  row,
  numeric,
}: {
  page: Page;
  prop: Property;
  row: DbRow;
  numeric?: boolean;
}) {
  const updateCell = useStore((s) => s.updateCell);
  const initial = row.cells[prop.id];
  return (
    <input
      defaultValue={initial === null || initial === undefined ? "" : String(initial)}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => updateCell(page.id, row.id, prop.id, e.target.value || null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      placeholder={numeric ? "0" : "Vacío"}
      className={cx(
        "h-[26px] w-full rounded-[3px] bg-transparent px-1 text-[13px] text-fg/80 outline-none placeholder:text-fg/20 hover:bg-fg/[0.04] focus:bg-fg/[0.04]",
        numeric && "text-right tabular-nums",
      )}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Fila / tarjeta                                                             */
/* -------------------------------------------------------------------------- */
function rowTitle(row: DbRow) {
  return String(row.cells.title ?? "") || "Sin título";
}

/**
 * Tono estable a partir del id de la fila.
 *
 * La galería necesita una "portada" cuando la fila no tiene imagen propia. Un
 * color derivado del id da variedad sin azar: la misma tarjeta se ve igual en
 * cada visita y en cada equipo.
 */
function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

/** Fecha ISO (`YYYY-MM-DD`) → marca de tiempo local, sin sorpresas de zona. */
function parseDay(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getTime();
}

/**
 * Fecha compacta para tarjetas e hitos: `18 nov 2026`.
 * `toLocaleDateString("es-AR")` mete un "de" a cada lado y no entra en una
 * columna de 74 px, así que el formato se arma a mano.
 */
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function diaCorto(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Marca de tiempo local → `YYYY-MM-DD`, la clave de cada celda del calendario. */
function dayKeyDe(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Ticks de mes entre dos fechas, para la cabecera de la línea de tiempo. */
function monthTicks(desde: number, hasta: number): { at: number; label: string }[] {
  const out: { at: number; label: string }[] = [];
  const cursor = new Date(desde);
  cursor.setDate(1);
  const fin = new Date(hasta);
  let guardia = 0;
  while (cursor <= fin && guardia < 60) {
    out.push({
      at: cursor.getTime(),
      label: cursor.toLocaleDateString("es-AR", { month: "short", year: "2-digit" }),
    });
    cursor.setMonth(cursor.getMonth() + 1);
    guardia += 1;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Vista principal                                                            */
/* -------------------------------------------------------------------------- */
export default function DatabaseView({ page }: { page: Page }) {
  const db = page.database!;
  const theme = useStore((s) => s.theme);
  const setView = useStore((s) => s.setView);
  const addRow = useStore((s) => s.addRow);
  const deleteRow = useStore((s) => s.deleteRow);
  const updateCell = useStore((s) => s.updateCell);
  const patchDatabase = useStore((s) => s.patchDatabase);
  const setUI = useStore((s) => s.setUI);
  const peekRowId = useStore((s) => s.peekRowId);
  const moveRowToGroup = useStore((s) => s.moveRowToGroup);
  const setRowRepeat = useStore((s) => s.setRowRepeat);
  const togglePropiedad = useStore((s) => s.togglePropiedad);
  const setAnchoColumna = useStore((s) => s.setAnchoColumna);
  const resetAnchos = useStore((s) => s.resetAnchos);
  const avanzarRepeticion = useStore((s) => s.avanzarRepeticion);

  const [openCell, setOpenCell] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [propsOpen, setPropsOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [dragRow, setDragRow] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  /** primer día del mes que muestra la vista calendario */
  const [mes, setMes] = useState(() => {
    const h = new Date();
    return new Date(h.getFullYear(), h.getMonth(), 1).getTime();
  });

  const titleProp = db.properties.find((p) => p.type === "title") ?? db.properties[0];

  /**
   * Propiedades visibles de la vista y ancho de cada columna.
   *
   * La app de referencia guarda la visibilidad de propiedades por vista y deja
   * redimensionar las columnas; el ancho, en cambio, no se puede volver al de
   * fábrica nunca más. Acá ambas cosas se guardan **con la vista** y hay un
   * «restablecer» explícito.
   */
  const ocultas = db.ocultas ?? [];
  const visibles = db.properties.filter((p) => p.type === "title" || !ocultas.includes(p.id));
  const anchoDe = (prop: Property) =>
    db.anchos?.[prop.id] ?? (prop.type === "title" ? 320 : 150);

  /** arrastre del borde de la columna: guarda el ancho al soltar */
  const redimensionar = (prop: Property, e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const inicioX = e.clientX;
    const inicioAncho = anchoDe(prop);
    const mover = (ev: PointerEvent) =>
      setAnchoColumna(page.id, prop.id, inicioAncho + (ev.clientX - inicioX));
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  };
  const groupProp = db.properties.find((p) => p.id === db.groupBy) ?? db.properties.find((p) => p.type === "status");

  /* ------------------------------ filas derivadas ------------------------- */
  const rows = useMemo(() => {
    let out = [...db.rows];
    if (db.filter) {
      out = out.filter((r) => r.cells[db.filter!.propertyId] === db.filter!.optionId);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter((r) =>
        Object.values(r.cells).some((v) => String(v ?? "").toLowerCase().includes(q)),
      );
    }
    for (const s of db.sorts) {
      out.sort((a, b) => {
        const av = a.cells[s.propertyId];
        const bv = b.cells[s.propertyId];
        if (av === bv) return 0;
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        const cmp = String(av).localeCompare(String(bv), "es", { numeric: true });
        return s.dir === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [db.rows, db.filter, db.sorts, query]);

  const peekRow = db.rows.find((r) => r.id === peekRowId) ?? null;

  /* ------------------------------- celda --------------------------------- */
  const renderCell = (prop: Property, row: DbRow) => {
    const key = `${row.id}:${prop.id}`;
    switch (prop.type) {
      case "title":
        return (
          <button
            type="button"
            onClick={() => setUI({ peekRowId: row.id })}
            className="flex h-[26px] w-full items-center gap-1.5 rounded-[3px] px-1 text-left hover:bg-fg/[0.04]"
          >
            <span className="text-[13px]">📄</span>
            <span className="truncate text-[13.5px] text-fg">{rowTitle(row)}</span>
            {row.repeat && (
              <span
                data-row-repeat={row.id}
                title={textoRepeticion(repeticionValida(row.repeat))}
                className="ml-auto flex shrink-0 items-center gap-[2px] rounded-[3px] bg-accent/10 px-1 text-[10.5px] text-accent"
              >
                <Icon name="repeat" size={10} />
                {row.repeat.cada > 1 ? row.repeat.cada : ""}
              </span>
            )}
          </button>
        );
      case "select":
      case "status":
        return (
          <SelectCell
            page={page}
            prop={prop}
            row={row}
            open={openCell === key}
            setOpen={(v) => setOpenCell(v ? key : null)}
          />
        );
      case "person":
        return <PersonCell page={page} prop={prop} row={row} />;
      case "date": {
        const value = (row.cells[prop.id] as string) ?? "";
        return (
          // El <input type="date"> nativo se superpone invisible: muestra el
          // date-picker del sistema operativo sin arrastrar su formato feo.
          <div className="relative flex h-[26px] items-center rounded-[3px] px-1 hover:bg-fg/[0.04]">
            <span className={cx("truncate text-[13px]", value ? "text-fg/80" : "text-fg/25")}>
              {value ? formatDate(value) : "—"}
            </span>
            <input
              type="date"
              value={value}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => updateCell(page.id, row.id, prop.id, e.target.value || null)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              style={{ colorScheme: theme === "dark" ? "dark" : "light" }}
              aria-label={`${prop.name} de ${rowTitle(row)}`}
            />
          </div>
        );
      }
      case "checkbox":
        return (
          <button
            type="button"
            role="checkbox"
            aria-checked={!!row.cells[prop.id]}
            onClick={(e) => {
              e.stopPropagation();
              updateCell(page.id, row.id, prop.id, !row.cells[prop.id]);
            }}
            className={cx(
              "mt-[4px] flex h-[15px] w-[15px] items-center justify-center rounded-[3px] border transition-colors",
              row.cells[prop.id] ? "border-accent bg-accent text-white" : "border-fg/30 hover:bg-fg/[0.06]",
            )}
          >
            {!!row.cells[prop.id] && <Icon name="check" size={11} strokeWidth={2.5} />}
          </button>
        );
      case "number":
        return <TextCell page={page} prop={prop} row={row} numeric />;
      default:
        return <TextCell page={page} prop={prop} row={row} />;
    }
  };

  const groupOptions = groupProp?.options ?? [];
  const columns =
    groupOptions.length > 0
      ? groupOptions
      : [{ id: "none", name: "Sin agrupar", color: "gray" as ColorKey }];

  /* -------------------------------- render -------------------------------- */
  return (
    <div className="mt-1">
      {/* barra de vistas */}
      <div data-view-bar className="mb-2 flex items-center gap-1 border-b border-line pb-1">
        {(
          [
            { id: "table", label: "Tabla", icon: "table" },
            { id: "board", label: "Board", icon: "board" },
            { id: "list", label: "Lista", icon: "list" },
            { id: "gallery", label: "Galería", icon: "image" },
            { id: "timeline", label: "Cronología", icon: "timeline" },
            { id: "calendar", label: "Calendario", icon: "calendar" },
          ] as const
        ).map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(page.id, v.id)}
            aria-pressed={db.view === v.id}
            data-view={v.id}
            className={cx(
              "flex h-[28px] items-center gap-1.5 rounded-[4px] px-2 text-[13px] transition-colors",
              db.view === v.id
                ? "bg-surface-hover font-medium text-fg"
                : "text-fg/55 hover:bg-surface-hover hover:text-fg/80",
            )}
          >
            <Icon name={v.icon} size={14} />
            {v.label}
          </button>
        ))}

        <div className="mx-1 h-4 w-px bg-line" />

        {/* filtro */}
        <div className="relative">
          <button type="button" onClick={() => setFilterOpen((v) => !v)} className="toolbar-btn text-[13px]">
            <Icon name="filter" size={13} />
            Filtrar
            {db.filter ? <span className="ml-1 h-1.5 w-1.5 rounded-full bg-accent" /> : null}
          </button>
          <Popover open={filterOpen} onClose={() => setFilterOpen(false)} width={244}>
            <div className="menu-label">Filtrar por estado</div>
            {(groupProp?.options ?? []).map((o) => (
              <MenuItem
                key={o.id}
                icon={<span className="h-2.5 w-2.5 rounded-sm" style={{ background: PILL[o.color].text }} />}
                onClick={() => {
                  patchDatabase(page.id, {
                    filter: db.filter?.optionId === o.id ? null : { propertyId: groupProp!.id, optionId: o.id },
                  });
                  setFilterOpen(false);
                }}
              >
                {o.name}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem icon={<Icon name="x" size={14} />} onClick={() => { patchDatabase(page.id, { filter: null }); setFilterOpen(false); }}>
              Quitar filtro
            </MenuItem>
          </Popover>
        </div>

        {/* orden */}
        <div className="relative">
          <button type="button" onClick={() => setSortOpen((v) => !v)} className="toolbar-btn text-[13px]">
            <Icon name="sort" size={13} />
            Ordenar
            {db.sorts.length > 0 ? <span className="ml-1 h-1.5 w-1.5 rounded-full bg-accent" /> : null}
          </button>
          <Popover open={sortOpen} onClose={() => setSortOpen(false)} width={244}>
            <div className="menu-label">Ordenar por</div>
            {db.properties
              .filter((p) => ["text", "number", "date", "title"].includes(p.type))
              .map((p) => {
                const current = db.sorts.find((s) => s.propertyId === p.id);
                return (
                  <MenuItem
                    key={p.id}
                    active={!!current}
                    hint={current ? (current.dir === "asc" ? "A→Z" : "Z→A") : undefined}
                    onClick={() => {
                      const next = current
                        ? current.dir === "asc"
                          ? [{ propertyId: p.id, dir: "desc" as const }]
                          : []
                        : [{ propertyId: p.id, dir: "asc" as const }];
                      patchDatabase(page.id, { sorts: next });
                    }}
                  >
                    {p.name}
                  </MenuItem>
                );
              })}
            <MenuSeparator />
            <MenuItem icon={<Icon name="x" size={14} />} onClick={() => { patchDatabase(page.id, { sorts: [] }); setSortOpen(false); }}>
              Quitar orden
            </MenuItem>
          </Popover>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <div className="relative">
            <Icon name="search" size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg/35" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar…"
              className="h-[28px] w-[140px] rounded-[4px] border border-transparent bg-surface-hover/60 pl-7 pr-2 text-[13px] outline-none placeholder:text-fg/35 focus:border-accent/50"
            />
          </div>
          <div className="relative">
            <button
              type="button"
              data-props-btn
              onClick={() => setPropsOpen((v) => !v)}
              className={cx(
                "flex h-[28px] items-center gap-1 rounded-[4px] px-2 text-[13px] transition-colors hover:bg-surface-hover",
                ocultas.length ? "text-fg/80" : "text-fg/60",
              )}
              title="Propiedades visibles en esta vista"
            >
              <Icon name="sliders" size={14} />
              Propiedades
              {ocultas.length > 0 && (
                <span className="rounded-[3px] bg-accent/12 px-1 text-[11px] text-accent">
                  {visibles.length}/{db.properties.length}
                </span>
              )}
            </button>
            <Popover
              open={propsOpen}
              onClose={() => setPropsOpen(false)}
              width={248}
              className="right-0 top-[calc(100%+4px)] p-1"
            >
              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-fg/40">
                Columnas de esta vista
              </div>
              <div data-props-list className="max-h-[280px] overflow-y-auto">
                {db.properties.map((pr) => {
                  const esTitulo = pr.type === "title";
                  const visible = esTitulo || !ocultas.includes(pr.id);
                  return (
                    <button
                      key={pr.id}
                      type="button"
                      data-prop-toggle={pr.id}
                      disabled={esTitulo}
                      onClick={() => togglePropiedad(page.id, pr.id)}
                      className={cx(
                        "flex w-full items-center gap-2 rounded-[4px] px-2 py-[5px] text-left text-[13px]",
                        esTitulo ? "cursor-default text-fg/40" : "text-fg/80 hover:bg-surface-hover",
                      )}
                      title={esTitulo ? "El título siempre se ve" : visible ? "Ocultar" : "Mostrar"}
                    >
                      <Icon
                        name={visible ? "check" : "x"}
                        size={13}
                        className={visible ? "text-accent" : "text-fg/25"}
                      />
                      <Icon name={propIcon(pr.type)} size={12} className="text-fg/35" />
                      <span className="truncate">{pr.name}</span>
                    </button>
                  );
                })}
              </div>
              <MenuSeparator />
              <MenuItem icon={<Icon name="type" size={14} />} onClick={() => { resetAnchos(page.id); setPropsOpen(false); }}>
                Restablecer anchos
              </MenuItem>
            </Popover>
          </div>

          <button
            type="button"
            onClick={() => {
              const id = addRow(page.id, { [titleProp.id]: "" });
              if (id) setUI({ peekRowId: id });
            }}
            className="flex h-[28px] items-center gap-1 rounded-[4px] bg-accent px-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
          >
            <Icon name="plus" size={14} />
            Nueva
          </button>
        </div>
      </div>

      {/* ------------------------------- TABLA -------------------------------- */}
      {db.view === "table" && (
        <div className="overflow-x-auto rounded-[4px] border border-line">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-surface-hover/40">
                {visibles.map((p) => (
                  <th
                    key={p.id}
                    data-col={p.id}
                    className="relative h-[32px] px-2 text-[12px] font-medium text-fg/55"
                    style={{ width: anchoDe(p), minWidth: anchoDe(p) }}
                  >
                    <span className="flex items-center gap-1.5">
                      <Icon name={p.type === "title" ? "type" : propIcon(p.type)} size={12} className="text-fg/35" />
                      <span className="truncate">{p.name}</span>
                    </span>
                    <span
                      data-col-resize={p.id}
                      role="separator"
                      aria-label={`Ancho de ${p.name}`}
                      onPointerDown={(e) => redimensionar(p, e)}
                      className="absolute -right-[3px] top-0 z-10 h-full w-[7px] cursor-col-resize hover:bg-accent/25"
                    />
                  </th>
                ))}
                <th className="w-[36px]" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="group/row border-b border-line last:border-0 hover:bg-surface-hover/40">
                  {visibles.map((p) => (
                    <td
                      key={p.id}
                      className="px-1.5 py-[3px] align-middle"
                      style={{ width: anchoDe(p), minWidth: anchoDe(p) }}
                    >
                      {renderCell(p, row)}
                    </td>
                  ))}
                  <td className="px-1">
                    <button
                      type="button"
                      aria-label="Eliminar fila"
                      onClick={() => deleteRow(page.id, row.id)}
                      className="flex h-[24px] w-[24px] items-center justify-center rounded-[3px] text-fg/30 opacity-0 hover:bg-fg/[0.06] hover:text-[#eb5757] group-hover/row:opacity-100"
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={visibles.length + 1} className="px-3 py-6 text-center text-[13px] text-fg/40">
                    No hay filas que coincidan.
                  </td>
                </tr>
              )}

              <tr>
                <td colSpan={db.properties.length + 1}>
                  <button
                    type="button"
                    onClick={() => addRow(page.id, { [titleProp.id]: "" })}
                    className="flex h-[32px] w-full items-center gap-1.5 px-2 text-[13px] text-fg/40 hover:bg-surface-hover/40 hover:text-fg/70"
                  >
                    <Icon name="plus" size={14} />
                    Nueva fila
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* -------------------------------- BOARD ------------------------------- */}
      {db.view === "board" && groupProp && (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((opt) => {
            const colRows = rows.filter((r) => (r.cells[groupProp.id] ?? "none") === opt.id);
            const colored = theme === "dark" ? DARK_PILL[opt.color] : PILL[opt.color];
            return (
              <div
                key={opt.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragRow) moveRowToGroup(page.id, dragRow, groupProp.id, opt.id);
                  setDragRow(null);
                }}
                className="flex w-[248px] shrink-0 flex-col rounded-[6px] bg-surface-hover/50 p-2"
              >
                <div className="mb-2 flex items-center gap-1.5 px-1">
                  <span
                    className="rounded-[3px] px-1.5 py-[1px] text-[12px] font-medium"
                    style={{ background: colored.bg, color: colored.text }}
                  >
                    {opt.name}
                  </span>
                  <span className="text-[12px] text-fg/40">{colRows.length}</span>
                  <button
                    type="button"
                    aria-label="Nueva fila en esta columna"
                    onClick={() => addRow(page.id, { [titleProp.id]: "", [groupProp.id]: opt.id })}
                    className="ml-auto flex h-[20px] w-[20px] items-center justify-center rounded-[3px] text-fg/40 hover:bg-fg/[0.06] hover:text-fg/70"
                  >
                    <Icon name="plus" size={13} />
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  {colRows.map((row) => (
                    <div
                      key={row.id}
                      draggable
                      onDragStart={() => setDragRow(row.id)}
                      onDragEnd={() => setDragRow(null)}
                      onClick={() => setUI({ peekRowId: row.id })}
                      className={cx(
                        "cursor-pointer rounded-[4px] border border-line bg-surface p-2 shadow-[0_1px_2px_rgba(15,15,15,0.04)] transition-shadow hover:shadow-[0_1px_4px_rgba(15,15,15,0.12)]",
                        dragRow === row.id && "opacity-40",
                      )}
                    >
                      <div className="mb-1.5 flex items-start gap-1.5">
                        <span className="mt-[1px] text-[12px]">📄</span>
                        <span className="min-w-0 flex-1 text-[13.5px] leading-snug text-fg">{rowTitle(row)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {db.properties
                          .filter((p) => ["select", "status", "person", "date"].includes(p.type) && p.id !== groupProp.id)
                          .map((p) => {
                            if (p.type === "person") {
                              const person = personById(String(row.cells[p.id] ?? ""));
                              return person ? <Avatar key={p.id} person={person} size={16} /> : null;
                            }
                            if (p.type === "date") {
                              const d = row.cells[p.id] as string | null;
                              return d ? (
                                <span key={p.id} className="text-[11.5px] text-fg/45">
                                  {formatDate(d)}
                                </span>
                              ) : null;
                            }
                            const o = p.options?.find((x) => x.id === row.cells[p.id]);
                            return o ? (
                              <Pill key={p.id} color={o.color} dark={theme === "dark"}>
                                {o.name}
                              </Pill>
                            ) : null;
                          })}
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => addRow(page.id, { [titleProp.id]: "", [groupProp.id]: opt.id })}
                    className="flex h-[28px] w-full items-center gap-1 rounded-[4px] px-1.5 text-[12.5px] text-fg/40 hover:bg-fg/[0.05] hover:text-fg/70"
                  >
                    <Icon name="plus" size={13} />
                    Nueva
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* -------------------------------- LISTA ------------------------------- */}
      {db.view === "list" && (
        <div className="flex flex-col">
          {rows.map((row) => (
            <div
              key={row.id}
              className="group/row flex items-center gap-2 border-b border-line px-2 py-[6px] last:border-0 hover:bg-surface-hover/40"
            >
              <button
                type="button"
                onClick={() => setUI({ peekRowId: row.id })}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
              >
                <span className="text-[13px]">📄</span>
                <span className="truncate text-[14px] text-fg">{rowTitle(row)}</span>
              </button>
              <div className="flex shrink-0 items-center gap-1.5">
                {db.properties
                  .filter((p) => ["select", "status", "person", "date", "checkbox"].includes(p.type))
                  .map((p) => {
                    if (p.type === "person") {
                      const person = personById(String(row.cells[p.id] ?? ""));
                      return person ? <Avatar key={p.id} person={person} size={18} /> : null;
                    }
                    if (p.type === "date") {
                      const d = row.cells[p.id] as string | null;
                      return d ? (
                        <span key={p.id} className="text-[12px] text-fg/45">
                          {formatDate(d)}
                        </span>
                      ) : null;
                    }
                    if (p.type === "checkbox") {
                      return row.cells[p.id] ? <Icon key={p.id} name="check" size={13} className="text-[#448361]" /> : null;
                    }
                    const o = p.options?.find((x) => x.id === row.cells[p.id]);
                    return o ? (
                      <Pill key={p.id} color={o.color} dark={theme === "dark"}>
                        {o.name}
                      </Pill>
                    ) : null;
                  })}
                <button
                  type="button"
                  aria-label="Eliminar"
                  onClick={() => deleteRow(page.id, row.id)}
                  className="flex h-[22px] w-[22px] items-center justify-center rounded-[3px] text-fg/25 opacity-0 hover:bg-fg/[0.06] hover:text-[#eb5757] group-hover/row:opacity-100"
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => addRow(page.id, { [titleProp.id]: "" })}
            className="mt-1 flex h-[30px] items-center gap-1.5 rounded-[4px] px-2 text-[13px] text-fg/40 hover:bg-surface-hover/40 hover:text-fg/70"
          >
            <Icon name="plus" size={14} /> Nueva entrada
          </button>
        </div>
      )}

      {/* ------------------------------- CALENDARIO ---------------------------- */}
      {db.view === "calendar" &&
        (() => {
          const fechaProp = db.properties.find((p) => p.type === "date");
          if (!fechaProp) {
            return (
              <p className="rounded-[6px] bg-surface-hover px-3 py-6 text-center text-[13px] text-fg/55">
                El calendario necesita una propiedad de tipo fecha. Agregala desde{" "}
                <span className="font-medium">Propiedades</span>.
              </p>
            );
          }

          const primero = new Date(mes);
          const anio = primero.getFullYear();
          const mesIdx = primero.getMonth();
          const hoy = new Date();
          const hoyClave = dayKeyDe(hoy.getTime());

          // la semana arranca el lunes; 42 celdas cubren cualquier mes
          const desfase = (primero.getDay() + 6) % 7;
          const celdas: { clave: string; dia: number; delMes: boolean }[] = [];
          for (let i = 0; i < 42; i += 1) {
            const d = new Date(anio, mesIdx, i - desfase + 1);
            celdas.push({
              clave: dayKeyDe(d.getTime()),
              dia: d.getDate(),
              delMes: d.getMonth() === mesIdx,
            });
          }

          /**
           * Qué se dibuja cada día.
           *
           * Una fila que se repite aparece también en sus próximas apariciones
           * (en gris y con borde punteado): es justo lo que las plantillas de la
           * app de referencia no muestran hasta que llega el día, y de lo que
           * todos se quejan al planificar la semana.
           */
          const desdeGrid = parseDay(celdas[0]?.clave) ?? Date.now();
          const hastaGrid = parseDay(celdas[celdas.length - 1]?.clave) ?? Date.now();
          const porDia = new Map<string, { row: DbRow; fantasma: boolean }[]>();
          for (const row of rows) {
            const dia = parseDay(row.cells[fechaProp.id]);
            if (dia === null) continue;
            const rep = repeticionValida(row.repeat);
            const fechas = rep ? ocurrencias(dia, rep, desdeGrid, hastaGrid + 86_399_999) : [dia];
            for (const ts of fechas) {
              const clave = dayKeyDe(ts);
              porDia.set(clave, [...(porDia.get(clave) ?? []), { row, fantasma: ts !== dia }]);
            }
          }
          const sinFecha = rows.filter((row) => parseDay(row.cells[fechaProp.id]) === null);
          const moverMes = (delta: number) => setMes(new Date(anio, mesIdx + delta, 1).getTime());
          // "noviembre de 2026" → "Noviembre de 2026": la clase `capitalize` de
          // Tailwind pone mayúscula en cada palabra y deja "Noviembre De 2026".
          const crudo = primero.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
          const nombreMes = crudo.charAt(0).toUpperCase() + crudo.slice(1);

          return (
            <div className="rounded-[8px] border border-line">
              <div className="flex items-center gap-2 border-b border-line px-2 py-1.5">
                <button type="button" data-cal-prev aria-label="Mes anterior" onClick={() => moverMes(-1)} className="icon-btn">
                  <Icon name="chevron-left" size={14} />
                </button>
                <button
                  type="button"
                  data-cal-today
                  onClick={() => {
                    const h = new Date();
                    setMes(new Date(h.getFullYear(), h.getMonth(), 1).getTime());
                  }}
                  className="rounded-[4px] border border-line px-2 py-[3px] text-[12px] text-fg/70 hover:bg-surface-hover"
                >
                  Hoy
                </button>
                <button type="button" data-cal-next aria-label="Mes siguiente" onClick={() => moverMes(1)} className="icon-btn">
                  <Icon name="chevron-right" size={14} />
                </button>
                <span data-cal-label className="ml-1 text-[13px] font-medium text-fg">
                  {nombreMes}
                </span>
                <span className="ml-auto text-[11.5px] text-fg/40">{rows.length - sinFecha.length} con fecha</span>
              </div>

              <div className="grid grid-cols-7 border-b border-line bg-surface-hover/40">
                {["lun", "mar", "mié", "jue", "vie", "sáb", "dom"].map((d) => (
                  <div key={d} className="px-1.5 py-1 text-[11px] font-medium text-fg/45">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {celdas.map((c) => {
                  const delDia = porDia.get(c.clave) ?? [];
                  const esHoy = c.clave === hoyClave;
                  return (
                    <div
                      key={c.clave}
                      data-cal-day={c.clave}
                      data-today={esHoy ? "" : undefined}
                      className={cx(
                        "group/day relative min-h-[74px] border-b border-r border-line p-1 last:border-r-0",
                        c.delMes ? "bg-surface" : "bg-surface-hover/20",
                      )}
                    >
                      <div className="mb-0.5 flex items-center gap-1">
                        <span
                          className={cx(
                            "flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-[3px] text-[11px]",
                            esHoy ? "bg-[#eb5757] font-semibold text-white" : c.delMes ? "text-fg/55" : "text-fg/25",
                          )}
                        >
                          {c.dia}
                        </span>
                        <button
                          type="button"
                          data-add-day={c.clave}
                          aria-label={`Agregar entrada el ${c.clave}`}
                          onClick={() => addRow(page.id, { [titleProp.id]: "", [fechaProp.id]: c.clave })}
                          className="ml-auto flex h-[15px] w-[15px] items-center justify-center rounded-[3px] text-fg/35 opacity-0 transition-opacity hover:bg-fg/[0.08] hover:text-fg/70 group-hover/day:opacity-100"
                        >
                          <Icon name="plus" size={11} />
                        </button>
                      </div>
                      <div className="flex flex-col gap-[2px]">
                        {delDia.map(({ row, fantasma }) => (
                          <button
                            key={`${row.id}-${fantasma ? "rep" : "dia"}`}
                            type="button"
                            data-cal-chip={fantasma ? undefined : row.id}
                            data-cal-repeat={fantasma ? row.id : undefined}
                            title={fantasma ? `${rowTitle(row)} · se repite` : rowTitle(row)}
                            onClick={() => setUI({ peekRowId: row.id })}
                            className={cx(
                              "w-full truncate rounded-[3px] px-1 py-[1px] text-left text-[11.5px]",
                              fantasma
                                ? "border border-dashed border-accent/40 text-fg/55 hover:bg-accent/10"
                                : "bg-accent/[0.12] text-fg/80 hover:bg-accent/20",
                            )}
                          >
                            {fantasma ? "↻ " : ""}
                            {rowTitle(row) || "Sin título"}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {sinFecha.length > 0 && (
                <div className="border-t border-line px-2 py-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fg/40">
                    Sin fecha · {sinFecha.length}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {sinFecha.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => setUI({ peekRowId: row.id })}
                        className="rounded-[3px] border border-line px-1.5 py-[1px] text-[11.5px] text-fg/60 hover:bg-surface-hover"
                      >
                        {rowTitle(row)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      {/* -------------------------------- GALERÍA ------------------------------ */}
      {db.view === "gallery" && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((row) => {
            const hue = hashHue(row.id);
            const fecha = db.properties.find((p) => p.type === "date");
            const dia = fecha ? parseDay(row.cells[fecha.id]) : null;
            const etiquetas = db.properties.filter((p) => ["select", "status"].includes(p.type));
            return (
              <div
                key={row.id}
                data-gallery-card={row.id}
                className="group/card overflow-hidden rounded-[8px] border border-line bg-surface transition-shadow hover:shadow-[0_2px_12px_rgba(15,15,15,0.09)]"
              >
                <button
                  type="button"
                  onClick={() => setUI({ peekRowId: row.id })}
                  aria-label={`Abrir ${rowTitle(row)}`}
                  className="flex h-[86px] w-full items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, hsl(${hue} 68% 93%), hsl(${(hue + 46) % 360} 62% 85%))`,
                  }}
                >
                  <span
                    className="text-[24px] font-semibold"
                    style={{ color: `hsl(${hue} 42% 40%)` }}
                  >
                    {rowTitle(row).trim().charAt(0).toUpperCase() || "·"}
                  </span>
                </button>
                <div className="min-w-0 px-2.5 py-2">
                  <button
                    type="button"
                    onClick={() => setUI({ peekRowId: row.id })}
                    className="block w-full truncate text-left text-[13px] font-medium text-fg hover:underline"
                  >
                    {rowTitle(row)}
                  </button>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {etiquetas.map((p) => {
                      const o = p.options?.find((x) => x.id === row.cells[p.id]);
                      return o ? (
                        <Pill key={p.id} color={o.color} dark={theme === "dark"}>
                          {o.name}
                        </Pill>
                      ) : null;
                    })}
                    {db.properties
                      .filter((p) => p.type === "person")
                      .map((p) => {
                        const person = personById(String(row.cells[p.id] ?? ""));
                        return person ? <Avatar key={p.id} person={person} size={16} /> : null;
                      })}
                  </div>
                  {dia !== null ? (
                    <p className="mt-1 text-[11.5px] text-fg/45">{diaCorto(dia)}</p>
                  ) : null}
                </div>
              </div>
            );
          })}

          <button
            type="button"
            data-gallery-new
            onClick={() => addRow(page.id, { [titleProp.id]: "" })}
            className="flex h-full min-h-[150px] flex-col items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-line text-[12.5px] text-fg/40 transition-colors hover:bg-surface-hover hover:text-fg/70"
          >
            <Icon name="plus" size={16} />
            Nueva entrada
          </button>
        </div>
      )}

      {/* ------------------------------ CRONOLOGÍA ----------------------------- */}
      {db.view === "timeline" &&
        (() => {
          const fechaProp = db.properties.find((p) => p.type === "date");
          if (!fechaProp) {
            return (
              <p className="rounded-[6px] bg-surface-hover px-3 py-6 text-center text-[13px] text-fg/55">
                La cronología necesita una propiedad de tipo fecha. Agregala desde{" "}
                <span className="font-medium">Propiedades</span>.
              </p>
            );
          }

          /**
           * Nook guarda **una fecha**, no un rango: la cronología dibuja hitos
           * sobre un eje de meses. Cuando la propiedad tenga rango (Notion sí lo
           * tiene) esto pasa a barras sin cambiar el resto.
           */
          const conFecha = rows
            .map((row) => ({ row, dia: parseDay(row.cells[fechaProp.id]) }))
            .filter((x): x is { row: DbRow; dia: number } => x.dia !== null)
            .sort((a, b) => a.dia - b.dia);
          const sinFecha = rows.filter((row) => parseDay(row.cells[fechaProp.id]) === null);

          const hoy = new Date();
          hoy.setHours(0, 0, 0, 0);
          const marcas = [...conFecha.map((x) => x.dia), hoy.getTime()];
          const desde = new Date(Math.min(...marcas));
          const hasta = new Date(Math.max(...marcas));
          desde.setDate(1);
          hasta.setMonth(hasta.getMonth() + 1, 0);
          const inicio = desde.getTime();
          const span = Math.max(1, hasta.getTime() - inicio);
          const pct = (ms: number) => Math.min(100, Math.max(0, ((ms - inicio) / span) * 100));

          return (
            <div className="rounded-[8px] border border-line">
              <div className="relative h-[26px] border-b border-line bg-surface-hover/40">
                {monthTicks(inicio, hasta.getTime()).map((tick) => (
                  <span
                    key={tick.at}
                    data-timeline-tick={tick.label}
                    className="absolute top-1.5 whitespace-nowrap pl-1 text-[11px] text-fg/45"
                    style={{ left: `${pct(tick.at)}%` }}
                  >
                    {tick.label}
                  </span>
                ))}
              </div>

              <ul className="relative">
                {/* línea de hoy: la referencia que uno busca primero */}
                <div
                  data-timeline-today
                  className="pointer-events-none absolute top-0 h-full w-px bg-accent/40"
                  style={{ left: `calc(164px + (100% - 246px) * ${(pct(hoy.getTime()) / 100).toFixed(4)})` }}
                  aria-hidden
                />
                {conFecha.map(({ row, dia }) => (
                  <li
                    key={row.id}
                    data-timeline-row={row.id}
                    className="flex items-center gap-2 border-b border-line py-[5px] last:border-0 hover:bg-surface-hover/30"
                  >
                    <button
                      type="button"
                      onClick={() => setUI({ peekRowId: row.id })}
                      className="w-[156px] shrink-0 truncate pl-2 text-left text-[12.5px] text-fg/85 hover:underline"
                    >
                      {rowTitle(row)}
                    </button>
                    <div className="relative h-[20px] flex-1">
                      <span
                        className="absolute top-[3px] h-[14px] min-w-[8px] rounded-[3px] bg-accent/85"
                        style={{ left: `${pct(dia)}%` }}
                        title={diaCorto(dia)}
                      />
                    </div>
                    <span className="w-[74px] shrink-0 pr-2 text-right text-[11.5px] tabular-nums text-fg/40">
                      {diaCorto(dia)}
                    </span>
                  </li>
                ))}
                {conFecha.length === 0 && (
                  <li className="px-3 py-6 text-center text-[13px] text-fg/50">
                    Ningúna entrada tiene fecha todavía.
                  </li>
                )}
              </ul>

              {sinFecha.length > 0 && (
                <div className="border-t border-line px-2 py-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fg/40">
                    Sin fecha · {sinFecha.length}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {sinFecha.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => setUI({ peekRowId: row.id })}
                        className="rounded-[4px] bg-surface-hover px-2 py-[3px] text-[12px] text-fg/70 hover:text-fg"
                      >
                        {rowTitle(row)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      {/* -------------------------------- PEEK -------------------------------- */}
      {peekRow && (
        <div data-row-peek className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-black/20 fade-in" onClick={() => setUI({ peekRowId: null })} />
          <aside className="relative flex h-full w-full max-w-[560px] flex-col overflow-y-auto border-l border-line bg-surface shadow-2xl fade-in">
            <div className="flex items-center gap-1 px-3 py-2">
              <span className="text-[13px] text-fg/40">Fila</span>
              <div className="ml-auto flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    deleteRow(page.id, peekRow.id);
                    setUI({ peekRowId: null });
                  }}
                  className="icon-btn hover:text-[#eb5757]"
                  aria-label="Eliminar fila"
                >
                  <Icon name="trash" size={16} />
                </button>
                <button type="button" onClick={() => setUI({ peekRowId: null })} className="icon-btn" aria-label="Cerrar">
                  <Icon name="x" size={16} />
                </button>
              </div>
            </div>

            <div className="px-8 pb-10">
              <input
                key={peekRow.id}
                defaultValue={rowTitle(peekRow)}
                onBlur={(e) => updateCell(page.id, peekRow.id, titleProp.id, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                className="w-full bg-transparent text-[28px] font-bold leading-tight tracking-tight text-fg outline-none placeholder:text-fg/25"
                placeholder="Sin título"
              />

              <div className="mt-4 space-y-1">
                {db.properties
                  .filter((p) => p.type !== "title")
                  .map((p) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="flex w-[130px] shrink-0 items-center gap-1.5 text-[13px] text-fg/50">
                        <Icon name={propIcon(p.type)} size={12} className="opacity-50" />
                        {p.name}
                      </span>
                      <div className="min-w-0 flex-1">{renderCell(p, peekRow)}</div>
                    </div>
                  ))}
              </div>

              {/* ---------------------------- repetición --------------------------- */}
              <div data-repeat-panel className="mt-5 rounded-[6px] border border-line px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Icon name="repeat" size={14} className="shrink-0 text-fg/45" />
                  <span className="text-[13px] text-fg/60">Repetir</span>
                  <select
                    data-repeat-select
                    value={
                      REPETICIONES.find(
                        (r) =>
                          r.cada === peekRow.repeat?.cada && r.unidad === peekRow.repeat?.unidad,
                      )?.id ?? "no"
                    }
                    onChange={(e) => {
                      const elegida = REPETICIONES.find((r) => r.id === e.target.value);
                      setRowRepeat(
                        page.id,
                        peekRow.id,
                        elegida ? { cada: elegida.cada, unidad: elegida.unidad } : null,
                      );
                    }}
                    className="ml-auto rounded-[4px] border border-line bg-surface px-1.5 py-1 text-[12.5px] text-fg outline-none"
                  >
                    <option value="no">No se repite</option>
                    {REPETICIONES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.texto}
                      </option>
                    ))}
                  </select>
                </div>

                {peekRow.repeat && (
                  <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
                    <span data-repeat-estado className="text-[12px] text-fg/45">
                      {textoRepeticion(repeticionValida(peekRow.repeat))} · aparece en el
                      calendario por adelantado
                    </span>
                    <button
                      type="button"
                      data-repeat-avanzar
                      onClick={() => avanzarRepeticion(page.id, peekRow.id)}
                      className="ml-auto shrink-0 rounded-[4px] bg-accent px-2 py-1 text-[12px] font-medium text-white hover:opacity-90"
                    >
                      Completar y pasar a la próxima
                    </button>
                  </div>
                )}

                {!peekRow.repeat && (
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-fg/40">
                    Sin repetición, la fila es un evento único. Con repetición, el calendario
                    muestra sus próximas apariciones sin duplicar la fila.
                  </p>
                )}
              </div>

              <div className="mt-6 rounded-[4px] border border-dashed border-line px-3 py-4 text-[13px] text-fg/35">
                El cuerpo de la fila (bloques de contenido) queda como próximo paso — ver README.
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* contador de resultados */}
      <div className="mt-2 flex items-center gap-2 text-[12px] text-fg/40">
        <span>
          {rows.length} de {db.rows.length} filas
        </span>
        {db.filter && (
          <button
            type="button"
            onClick={() => patchDatabase(page.id, { filter: null })}
            className="rounded-[3px] bg-surface-hover px-1.5 py-[1px] hover:text-fg/70"
          >
            quitar filtro ✕
          </button>
        )}
        <span className="hidden">{COLOR_KEYS.length + (DARK ? 1 : 0)}</span>
      </div>
    </div>
  );
}
