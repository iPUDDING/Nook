"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { ColorKey, Person } from "@/lib/types";
import { DARK_PILL, PILL, cx } from "@/lib/utils";

/* ------------------------------ click afuera ------------------------------ */
export function useClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  handler: () => void,
  active = true,
) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) handler();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handler();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, handler, active]);
}

/* -------------------------------- popover -------------------------------- */
export function Popover({
  open,
  onClose,
  children,
  align = "start",
  className,
  width = 240,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose, open);
  if (!open) return null;
  return (
    <div
      ref={ref}
      style={{ width }}
      className={cx(
        "menu pop-in absolute z-50 max-h-[min(70vh,420px)] overflow-y-auto",
        align === "end" ? "right-0" : "left-0",
        "top-[calc(100%+4px)]",
        className,
      )}
      role="menu"
    >
      {children}
    </div>
  );
}

/* --------------------------------- items --------------------------------- */
export function MenuItem({
  icon,
  children,
  onClick,
  active,
  danger,
  hint,
  disabled,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-active={active || undefined}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "menu-item",
        danger && "text-[#eb5757] hover:text-[#eb5757]",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      {icon ? <span className="flex h-4 w-4 shrink-0 items-center justify-center opacity-70">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? <span className="ml-auto pl-3 text-[12px] text-fg/40">{hint}</span> : null}
    </button>
  );
}

export const MenuSeparator = () => <div className="my-1 h-px bg-line" />;

/* ---------------------------------- pill --------------------------------- */
export function Pill({
  color,
  children,
  dark,
  className,
}: {
  color: ColorKey;
  children: ReactNode;
  dark?: boolean;
  className?: string;
}) {
  const c = dark ? DARK_PILL[color] : PILL[color];
  return (
    <span className={cx("pill", className)} style={{ background: c.bg, color: c.text }}>
      {children}
    </span>
  );
}

/* --------------------------------- avatar -------------------------------- */
export function Avatar({ person, size = 20 }: { person?: Person; size?: number }) {
  if (!person) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full border border-dashed border-fg/25 text-fg/30"
        style={{ width: size, height: size, fontSize: size * 0.5 }}
      >
        +
      </span>
    );
  }
  const c = PILL[person.color];
  return (
    <span
      title={person.name}
      className="inline-flex select-none items-center justify-center rounded-full font-medium"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: c.bg,
        color: c.text,
      }}
    >
      {person.initials}
    </span>
  );
}

/* -------------------------------- spinner -------------------------------- */
export function Skeleton() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface">
      <div className="w-[240px] shrink-0 border-r border-line bg-surface-side" />
      <div className="flex-1 px-[max(56px,8vw)] py-16">
        <div className="mx-auto max-w-[720px] space-y-4">
          <div className="h-9 w-2/3 animate-pulse rounded bg-fg/[0.06]" />
          <div className="h-4 w-full animate-pulse rounded bg-fg/[0.04]" />
          <div className="h-4 w-11/12 animate-pulse rounded bg-fg/[0.04]" />
          <div className="h-4 w-9/12 animate-pulse rounded bg-fg/[0.04]" />
        </div>
      </div>
    </div>
  );
}
