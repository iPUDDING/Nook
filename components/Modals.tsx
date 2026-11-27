"use client";

import { useState } from "react";
import Icon from "./Icon";
import PageIcon from "./PageIcon";
import { Avatar, MenuItem, MenuSeparator, Popover } from "./ui";
import { useStore } from "@/lib/store";
import { inferTitle, markdownToBlocks } from "@/lib/markdown";
import { MEMBER_ROLE_LABEL, MEMBER_ROLES, type MemberRole } from "@/lib/types";
import { cx, relativeTime, uid } from "@/lib/utils";

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

/**
 * Miembros del workspace y compartir la página.
 *
 * **No hay límite de miembros**: la lista es abierta y se guarda en el estado
 * persistido. El propietario no se puede quitar (quedaría un workspace sin
 * dueño); el resto se puede invitar, cambiar de rol o sacar en cualquier momento.
 */
export function ShareModal() {
  const open = useStore((s) => s.shareOpen);
  const setUI = useStore((s) => s.setUI);
  const page = useStore((s) => s.pages[s.selectedId]);
  const members = useStore((s) => s.members);
  const inviteMember = useStore((s) => s.inviteMember);
  const setMemberRole = useStore((s) => s.setMemberRole);
  const removeMember = useStore((s) => s.removeMember);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("editor");
  const [roleOpen, setRoleOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [whoOpen, setWhoOpen] = useState<string | null>(null);
  const [published, setPublished] = useState(false);

  if (!open || !page) return null;

  const invite = () => {
    if (!email.trim()) return;
    const res = inviteMember({ email, role });
    if (!res.ok) {
      setError(res.error ?? "No se pudo invitar.");
      return;
    }
    setError(null);
    setEmail("");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard?.writeText(`https://nook.local/?p=${page.id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Shell
      title="Compartir"
      subtitle={page.title || "Sin título"}
      onClose={() => setUI({ shareOpen: false })}
      width={580}
    >
      {/* ------------------------------ invitar ------------------------------ */}
      <div className="flex items-start gap-2">
        <input
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              invite();
            }
          }}
          placeholder="Invitá por correo…"
          aria-label="Correo del nuevo miembro"
          className="h-[36px] flex-1 rounded-[4px] border border-line bg-surface px-2.5 text-[14px] outline-none placeholder:text-fg/35 focus:border-accent/60"
        />
        <div className="relative">
          <button
            type="button"
            onClick={() => setRoleOpen((v) => !v)}
            className="flex h-[36px] items-center gap-1 rounded-[4px] border border-line px-2.5 text-[13px] text-fg/75 hover:bg-surface-hover"
          >
            {MEMBER_ROLE_LABEL[role]}
            <Icon name="chevron-down" size={12} />
          </button>
          <Popover open={roleOpen} onClose={() => setRoleOpen(false)} align="end" width={200}>
            {MEMBER_ROLES.filter((r) => r !== "owner").map((r) => (
              <MenuItem
                key={r}
                active={r === role}
                onClick={() => {
                  setRole(r);
                  setRoleOpen(false);
                }}
              >
                {MEMBER_ROLE_LABEL[r]}
              </MenuItem>
            ))}
          </Popover>
        </div>
        <button
          type="button"
          onClick={invite}
          className="h-[36px] rounded-[4px] bg-accent px-3 text-[13px] font-medium text-white hover:opacity-90"
        >
          Invitar
        </button>
      </div>
      {error && <div className="mt-1.5 text-[12px] text-[#eb5757]">{error}</div>}

      {/* ---------------------------- con acceso ---------------------------- */}
      <div className="mb-4 mt-4 space-y-0.5">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-fg/40">
            Con acceso
          </span>
          <span className="text-[11px] text-fg/35">
            {members.length} {members.length === 1 ? "miembro" : "miembros"} · sin límite
          </span>
        </div>

        <div className="max-h-[260px] overflow-y-auto pr-1">
          {members.map((m) => (
            <div key={m.id} className="group flex items-center gap-2 rounded-[4px] py-1 hover:bg-surface-hover/60">
              <Avatar person={m} size={24} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-fg/90">
                  {m.name}
                  {m.pending && <span className="ml-1.5 text-[11px] text-fg/35">invitado</span>}
                </span>
                <span className="block truncate text-[11.5px] text-fg/40">{m.email}</span>
              </span>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setWhoOpen((v) => (v === m.id ? null : m.id))}
                  className="flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[12.5px] text-fg/55 hover:bg-surface-hover hover:text-fg/80"
                >
                  {MEMBER_ROLE_LABEL[m.role]}
                  {m.role !== "owner" && <Icon name="chevron-down" size={11} />}
                </button>
                {m.role !== "owner" && (
                  <Popover open={whoOpen === m.id} onClose={() => setWhoOpen(null)} align="end" width={190}>
                    {MEMBER_ROLES.filter((r) => r !== "owner").map((r) => (
                      <MenuItem
                        key={r}
                        active={r === m.role}
                        onClick={() => {
                          setMemberRole(m.id, r);
                          setWhoOpen(null);
                        }}
                      >
                        {MEMBER_ROLE_LABEL[r]}
                      </MenuItem>
                    ))}
                    <MenuSeparator />
                    <MenuItem
                      onClick={() => {
                        removeMember(m.id);
                        setWhoOpen(null);
                      }}
                    >
                      Quitar del workspace
                    </MenuItem>
                  </Popover>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* --------------------------- publicar en web ------------------------ */}
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
          onClick={copyLink}
          className="flex h-[32px] items-center gap-1.5 rounded-[4px] border border-line px-2.5 text-[13px] text-fg/75 hover:bg-surface-hover"
        >
          <Icon name={copied ? "check" : "link"} size={14} />
          {copied ? "Enlace copiado" : "Copiar enlace"}
        </button>
        <span className="text-[12px] text-fg/35">Demo local: no se envía ningún correo.</span>
      </div>
    </Shell>
  );
}

/* ----------------------------- Pegar Markdown ------------------------------ */

/**
 * Pegar Markdown como texto, sin pasar por un archivo.
 *
 * Ruta rápida: el editor ya convierte el portapapeles al pegar (⌘V). Este modal
 * existe para cuando el texto lo tenés en otro lado (un chat, un ticket) y
 * querés revisarlo antes de insertarlo, o directamente crear una página nueva.
 */
export function PasteMarkdownModal() {
  const open = useStore((s) => s.pasteOpen);
  const setUI = useStore((s) => s.setUI);
  const page = useStore((s) => s.pages[s.selectedId]);
  const selectedId = useStore((s) => s.selectedId);
  const insertBlocks = useStore((s) => s.insertBlocks);
  const createPage = useStore((s) => s.createPage);
  const selectPage = useStore((s) => s.selectPage);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const parsed = () => {
    if (!text.trim()) return [];
    return markdownToBlocks(text, () => uid("blk"));
  };

  const preview = text.trim() ? parsed() : [];
  const tables = preview.filter((b) => b.type === "table").length;

  const insertHere = () => {
    if (!page) return;
    const blocks = parsed();
    if (!blocks.length) {
      setError("Pegá algo de Markdown primero.");
      return;
    }
    insertBlocks(page.id, page.blocks[page.blocks.length - 1]?.id ?? null, blocks);
    setUI({ pasteOpen: false });
    setText("");
  };

  const createNewPage = () => {
    const blocks = parsed();
    if (!blocks.length) {
      setError("Pegá algo de Markdown primero.");
      return;
    }
    const id = createPage(null, { title: inferTitle(blocks, "Markdown pegado"), blocks });
    selectPage(id);
    setUI({ pasteOpen: false });
    setText("");
  };

  return (
    <Shell
      title="Pegar Markdown"
      subtitle="Se convierte en bloques reales: títulos, listas, citas, código y tablas."
      onClose={() => setUI({ pasteOpen: false })}
      width={640}
    >
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            insertHere();
          }
        }}
        placeholder={"# Título\n\nTexto con **negrita**.\n\n| Columna | Otra |\n| --- | --- |\n| a | b |"}
        aria-label="Markdown a convertir"
        className="h-[260px] w-full resize-none rounded-[6px] border border-line bg-surface px-3 py-2 font-mono text-[12.5px] leading-[1.6] text-fg outline-none placeholder:text-fg/25 focus:border-accent/60"
      />

      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[12px] text-fg/45">
          {preview.length
            ? `${preview.length} bloque${preview.length === 1 ? "" : "s"}${tables ? ` · ${tables} tabla${tables === 1 ? "" : "s"}` : ""}`
            : error ?? "Nada para convertir todavía."}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={createNewPage}
            className="h-[32px] rounded-[4px] border border-line px-2.5 text-[13px] text-fg/75 hover:bg-surface-hover"
          >
            Crear página
          </button>
          <button
            type="button"
            onClick={insertHere}
            className="h-[32px] rounded-[4px] bg-accent px-3 text-[13px] font-medium text-white hover:opacity-90"
          >
            Insertar acá
          </button>
        </div>
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-fg/40">
        También podés pegar directo en el editor con ⌘V / Ctrl+V: si el texto parece Markdown, se
        convierte solo. Este panel es para revisarlo antes o crear una página nueva
        ({selectedId.slice(0, 6)}…).
      </p>
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
        ["⌘ V", "Pegar Markdown: se convierte en bloques (y tablas) solo"],
        ["F11", "Pantalla completa"],
        ["Esc", "Cerrar menú o diálogo"],
      ],
    },
    {
      title: "Lectura y foco",
      rows: [
        ["⌘ ⇧ R", "Leer la página en voz alta"],
        ["Clic derecho", "Empezar a leer desde ese párrafo"],
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
                <span className="flex items-center text-[14px]">
                  {p.icon ? <PageIcon icon={p.icon} size={15} /> : "📄"}
                </span>
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
