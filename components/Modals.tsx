"use client";

import { useState } from "react";
import Icon from "./Icon";
import { Avatar, MenuItem, Popover } from "./ui";
import { useStore } from "@/lib/store";
import { PEOPLE } from "@/lib/seed";
import { cx, relativeTime } from "@/lib/utils";

export function Shell({
  title,
  subtitle,
  onClose,
  children,
  width = 520,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/30 fade-in" onClick={onClose} />
      <div
        className="pop-in relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-[10px] border border-line bg-surface-pop shadow-menu"
        style={{ maxWidth: width }}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-4">
          <div>
            <h2 className="text-[17px] font-semibold text-fg">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-fg/50">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="icon-btn" aria-label="Cerrar">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-5 pt-3">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------- Compartir -------------------------------- */
export function ShareModal() {
  const open = useStore((s) => s.shareOpen);
  const setUI = useStore((s) => s.setUI);
  const page = useStore((s) => s.pages[s.selectedId]);
  const [invited, setInvited] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [permOpen, setPermOpen] = useState(false);
  const [perm, setPerm] = useState("Puede editar");
  const [published, setPublished] = useState(false);

  if (!open || !page) return null;

  return (
    <Shell
      title="Compartir"
      subtitle={page.title || "Sin título"}
      onClose={() => setUI({ shareOpen: false })}
      width={560}
    >
      <div className="mb-3 flex items-center gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && email.trim()) {
              setInvited((v) => [...v, email.trim()]);
              setEmail("");
            }
          }}
          placeholder="Invitá por correo…"
          className="h-[36px] flex-1 rounded-[4px] border border-line bg-surface px-2.5 text-[14px] outline-none placeholder:text-fg/35 focus:border-accent/60"
        />
        <div className="relative">
          <button
            type="button"
            onClick={() => setPermOpen((v) => !v)}
            className="flex h-[36px] items-center gap-1 rounded-[4px] border border-line px-2.5 text-[13px] text-fg/75 hover:bg-surface-hover"
          >
            {perm}
            <Icon name="chevron-down" size={12} />
          </button>
          <Popover open={permOpen} onClose={() => setPermOpen(false)} align="end" width={200}>
            {["Puede ver", "Puede comentar", "Puede editar", "Control total"].map((p) => (
              <MenuItem key={p} active={p === perm} onClick={() => { setPerm(p); setPermOpen(false); }}>
                {p}
              </MenuItem>
            ))}
          </Popover>
        </div>
        <button
          type="button"
          onClick={() => {
            if (email.trim()) {
              setInvited((v) => [...v, email.trim()]);
              setEmail("");
            }
          }}
          className="h-[36px] rounded-[4px] bg-accent px-3 text-[13px] font-medium text-white hover:opacity-90"
        >
          Invitar
        </button>
      </div>

      <div className="mb-4 space-y-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-fg/40">Con acceso</div>
        {PEOPLE.slice(0, 3).map((p) => (
          <div key={p.id} className="flex items-center gap-2 py-0.5">
            <Avatar person={p} size={22} />
            <span className="text-[14px] text-fg/85">{p.name}</span>
            <span className="ml-auto text-[12px] text-fg/40">Puede editar</span>
          </div>
        ))}
        {invited.map((mail) => (
          <div key={mail} className="flex items-center gap-2 py-0.5">
            <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-surface-hover text-[10px] text-fg/60">
              @
            </span>
            <span className="text-[14px] text-fg/85">{mail}</span>
            <span className="ml-auto text-[12px] text-fg/40">{perm}</span>
          </div>
        ))}
      </div>

      <div className="rounded-[6px] border border-line p-3">
        <div className="flex items-center gap-2">
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[4px] bg-surface-hover text-[13px]">🌐</span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-medium text-fg">Publicar en la web</div>
            <div className="text-[12px] text-fg/45">Cualquiera con el enlace puede ver esta página.</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={published}
            onClick={() => setPublished((v) => !v)}
            className={cx(
              "relative h-[20px] w-[34px] rounded-full transition-colors",
              published ? "bg-accent" : "bg-fg/20",
            )}
          >
            <span
              className={cx(
                "absolute top-[2px] h-[16px] w-[16px] rounded-full bg-white transition-all",
                published ? "left-[16px]" : "left-[2px]",
              )}
            />
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(`${location.origin}/?p=${page.id}`)}
          className="flex h-[32px] items-center gap-1.5 rounded-[4px] border border-line px-2.5 text-[13px] text-fg/75 hover:bg-surface-hover"
        >
          <Icon name="link" size={14} /> Copiar enlace
        </button>
        <span className="text-[12px] text-fg/35">Demo local: no se envía ningún correo.</span>
      </div>
    </Shell>
  );
}

/* --------------------------------- Atajos --------------------------------- */
export function ShortcutsModal() {
  const open = useStore((s) => s.shortcutsOpen);
  const setUI = useStore((s) => s.setUI);

  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: "General",
      rows: [
        ["⌘ K", "Buscar o ejecutar un comando"],
        ["⌘ \\", "Mostrar u ocultar la barra lateral"],
        ["⌘ ⇧ L", "Modo oscuro"],
        ["Esc", "Cerrar menú o diálogo"],
      ],
    },
    {
      title: "Lectura y foco",
      rows: [
        ["⌘ ⇧ R", "Leer la página en voz alta"],
        ["Espacio", "Pausar o reanudar la voz"],
        ["⌘ ⇧ E", "Modo lectura (papel)"],
        ["⌘ ⇧ M", "Mapa mental de la página"],
        ["⌘ ⇧ P", "Abrir Pomodoro"],
      ],
    },
    {
      title: "Editor",
      rows: [
        ["/", "Abrir menú de bloques"],
        ["⌘ B / I / U", "Negrita, itálica, subrayado"],
        ["⌘ E", "Código inline"],
        ["⌘ ⇧ 7 / 8 / 9", "Lista numerada / viñetas / tareas"],
        ["Tab / ⇧ Tab", "Indentar / desindentar"],
        ["Enter", "Nuevo bloque"],
        ["⌫ al inicio", "Unir con el bloque anterior"],
        ["↑ / ↓", "Navegar entre bloques"],
      ],
    },
  ];

  if (!open) return null;

  return (
    <Shell title="Atajos de teclado" onClose={() => setUI({ shortcutsOpen: false })} width={560}>
      <div className="grid gap-6 sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg/40">{g.title}</div>
            <div className="space-y-1">
              {g.rows.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 py-0.5">
                  <span className="text-[13px] text-fg/70">{v}</span>
                  <kbd className="shrink-0 rounded-[3px] border border-line bg-surface-side px-1.5 py-0.5 text-[11px] text-fg/60">
                    {k}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

/* -------------------------------- Papelera -------------------------------- */
export function TrashModal() {
  const open = useStore((s) => s.trashOpen);
  const setUI = useStore((s) => s.setUI);
  const pages = useStore((s) => s.pages);
  const restorePage = useStore((s) => s.restorePage);
  const deletePermanently = useStore((s) => s.deletePermanently);
  const emptyTrash = useStore((s) => s.emptyTrash);

  if (!open) return null;
  const trashed = Object.values(pages).filter((p) => p.trashed);

  return (
    <Shell
      title="Papelera"
      subtitle="Las páginas eliminadas se pueden restaurar en cualquier momento."
      onClose={() => setUI({ trashOpen: false })}
      width={600}
    >
      {trashed.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-fg/40">La papelera está vacía.</div>
      ) : (
        <>
          <div className="divide-y divide-line rounded-[6px] border border-line">
            {trashed.map((p) => (
              <div key={p.id} className="flex items-center gap-2 px-2.5 py-2">
                <span className="text-[14px]">{p.icon ?? "📄"}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] text-fg">{p.title || "Sin título"}</div>
                  <div className="text-[11.5px] text-fg/40">Eliminada {relativeTime(p.updatedAt)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => restorePage(p.id)}
                  className="rounded-[4px] px-2 py-1 text-[12.5px] text-fg/70 hover:bg-surface-hover"
                >
                  Restaurar
                </button>
                <button
                  type="button"
                  onClick={() => deletePermanently(p.id)}
                  className="rounded-[4px] px-2 py-1 text-[12.5px] text-[#eb5757] hover:bg-surface-hover"
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              if (confirm("¿Vaciar la papelera? Esta acción no se puede deshacer.")) emptyTrash();
            }}
            className="mt-3 h-[32px] rounded-[4px] border border-line px-2.5 text-[13px] text-[#eb5757] hover:bg-surface-hover"
          >
            Vaciar papelera
          </button>
        </>
      )}
    </Shell>
  );
}
