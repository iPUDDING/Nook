"use client";

import { useRef, useState } from "react";
import Icon from "./Icon";
import { ICON_COLORS, LINE_ICONS, lineIcon } from "./PageIcon";
import { MenuSeparator, Popover } from "./ui";
import { EMOJIS, cx } from "@/lib/utils";

/**
 * Selector de icono con las tres pestañas de la app de referencia:
 * **Emojis**, **Iconos** (lineales, con color) y **Personalizado** (subir imagen
 * o pegar una URL). Abajo, *Aleatorio* y *Quitar*.
 *
 * La imagen subida se reduce en el navegador a 160×160 antes de guardarse: el
 * icono vive dentro del workspace en `localStorage` (~5 MB compartidos) y una
 * foto de 3 MB dejaría al usuario sin poder guardar ni una nota.
 */

const LADO = 160;
const MAX_ENTRADA = 4 * 1024 * 1024;

/** Recorta la imagen al cuadrado central y la devuelve como data URL PNG. */
async function reducir(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("No se pudo leer la imagen."));
    });
    const lado = Math.min(img.width, img.height);
    const lienzo = document.createElement("canvas");
    lienzo.width = LADO;
    lienzo.height = LADO;
    const ctx = lienzo.getContext("2d");
    if (!ctx) throw new Error("El navegador no permite dibujar la imagen.");
    ctx.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, LADO, LADO);
    return lienzo.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Pestana = "emoji" | "icono" | "personalizado";

export default function IconPicker({
  open,
  onClose,
  onPick,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (icon: string) => void;
  onRemove: () => void;
}) {
  const [pestana, setPestana] = useState<Pestana>("emoji");
  const [q, setQ] = useState("");
  const [color, setColor] = useState(ICON_COLORS[0]);
  const [url, setUrl] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  const lista = q.trim() ? EMOJIS.filter((e) => e.includes(q.trim())) : EMOJIS;

  const elegir = (icon: string) => {
    onPick(icon);
    onClose();
  };

  const aleatorio = () => {
    // ciclo pseudoaleatorio pero reproducible en la suite: Math.random es suficiente
    elegir(EMOJIS[Math.floor(Math.random() * EMOJIS.length)]);
  };

  const subir = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAviso("Ese archivo no es una imagen.");
      return;
    }
    if (file.size > MAX_ENTRADA) {
      setAviso("La imagen pasa de 4 MB. Usá una más liviana.");
      return;
    }
    try {
      setAviso(null);
      elegir(await reducir(file));
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo procesar la imagen.");
    }
  };

  const pestanas: { id: Pestana; label: string }[] = [
    { id: "emoji", label: "Emojis" },
    { id: "icono", label: "Iconos" },
    { id: "personalizado", label: "Personalizado" },
  ];

  return (
    <Popover open={open} onClose={onClose} width={320} className="left-0 top-[calc(100%+6px)] p-2">
      <div data-icon-tabs className="mb-2 flex items-center gap-0.5 border-b border-line pb-1">
        {pestanas.map((p) => (
          <button
            key={p.id}
            type="button"
            data-icon-tab={p.id}
            aria-pressed={pestana === p.id}
            onClick={() => setPestana(p.id)}
            className={cx(
              "rounded-[4px] px-2 py-1 text-[12.5px] transition-colors",
              pestana === p.id ? "bg-surface-hover font-medium text-fg" : "text-fg/55 hover:bg-surface-hover hover:text-fg/80",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ------------------------------- emojis ------------------------------ */}
      {pestana === "emoji" && (
        <>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar emoji…"
            data-icon-search
            className="mb-2 w-full rounded-[4px] border border-line bg-surface px-2 py-1 text-[13px] outline-none placeholder:text-fg/35 focus:border-accent/50"
          />
          <div className="grid max-h-[180px] grid-cols-8 gap-0.5 overflow-y-auto">
            {lista.map((e) => (
              <button
                key={e}
                type="button"
                data-icon-option={e}
                onClick={() => elegir(e)}
                className="flex h-[30px] w-[30px] items-center justify-center rounded-[4px] text-[17px] hover:bg-surface-hover"
              >
                {e}
              </button>
            ))}
          </div>
          {lista.length === 0 && <p className="px-1 py-3 text-[12.5px] text-fg/45">Ningún emoji coincide.</p>}
        </>
      )}

      {/* ------------------------------- iconos ------------------------------ */}
      {pestana === "icono" && (
        <>
          <div className="mb-2 flex items-center gap-1">
            {ICON_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                data-icon-color={c}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={cx(
                  "h-[16px] w-[16px] rounded-full border transition-transform",
                  color === c ? "scale-110 border-fg/50" : "border-black/10",
                )}
                style={{ background: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
          <div className="grid max-h-[180px] grid-cols-8 gap-0.5 overflow-y-auto">
            {LINE_ICONS.map((name) => (
              <button
                key={name}
                type="button"
                data-icon-line={name}
                onClick={() => elegir(lineIcon(name, color))}
                className="flex h-[30px] w-[30px] items-center justify-center rounded-[4px] hover:bg-surface-hover"
                style={{ color }}
                aria-label={`Icono ${name}`}
              >
                <Icon name={name} size={17} />
              </button>
            ))}
          </div>
        </>
      )}

      {/* ---------------------------- personalizado -------------------------- */}
      {pestana === "personalizado" && (
        <div className="flex flex-col gap-2">
          <input
            ref={archivo}
            type="file"
            accept="image/*"
            data-icon-file
            className="hidden"
            onChange={(e) => void subir(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => archivo.current?.click()}
            className="flex items-center justify-center gap-1.5 rounded-[4px] border border-dashed border-line px-2 py-3 text-[12.5px] text-fg/60 hover:bg-surface-hover hover:text-fg"
          >
            <Icon name="upload" size={14} /> Subir imagen
          </button>
          <div className="flex items-center gap-1">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://… (URL de imagen)"
              data-icon-url
              className="min-w-0 flex-1 rounded-[4px] border border-line bg-surface px-2 py-1 text-[12.5px] outline-none placeholder:text-fg/35 focus:border-accent/50"
            />
            <button
              type="button"
              onClick={() => {
                const valor = url.trim();
                if (!/^https?:\/\/\S+$/i.test(valor)) {
                  setAviso("Pegá una URL que empiece con http:// o https://");
                  return;
                }
                setAviso(null);
                elegir(valor);
              }}
              className="rounded-[4px] bg-accent px-2 py-1 text-[12.5px] font-medium text-white hover:opacity-90"
            >
              Usar
            </button>
          </div>
          <p className="text-[11.5px] leading-snug text-fg/40">
            La imagen se recorta al centro y se guarda a 160×160 (la referencia pide 280×280) para no gastar el
            almacenamiento del workspace.
          </p>
          {aviso && (
            <p data-icon-error className="text-[11.5px] text-[#eb5757]">
              {aviso}
            </p>
          )}
        </div>
      )}

      <MenuSeparator />
      <div className="flex items-center gap-1">
        <button
          type="button"
          data-icon-random
          onClick={aleatorio}
          className="flex flex-1 items-center gap-1.5 rounded-[4px] px-2 py-1.5 text-left text-[12.5px] text-fg/70 hover:bg-surface-hover"
        >
          <Icon name="repeat" size={14} /> Aleatorio
        </button>
        <button
          type="button"
          onClick={() => {
            onRemove();
            onClose();
          }}
          className="flex flex-1 items-center gap-1.5 rounded-[4px] px-2 py-1.5 text-left text-[12.5px] text-fg/70 hover:bg-surface-hover"
        >
          <Icon name="x" size={14} /> Quitar
        </button>
      </div>
      {pestana !== "personalizado" && aviso && (
        <p data-icon-error className="px-2 pb-1 text-[11.5px] text-[#eb5757]">
          {aviso}
        </p>
      )}
    </Popover>
  );
}
