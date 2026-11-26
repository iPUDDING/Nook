"use client";

/**
 * Configuración del workspace: apariencia, voz, lectura, Pomodoro,
 * pronunciación y datos.
 *
 * Todo lo que se configura acá se persiste en el store, salvo la prueba de voz,
 * que habla con una utterance suelta para no apropiarse de la barra de lectura.
 */

import { useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { Shell } from "./Modals";
import { useSpeech } from "./tts/Speech";
import { useStore, type BackupPayload } from "@/lib/store";
import { applyRules, pickDefaultVoice, speakableMath, voiceLabel } from "@/lib/speech";
import { cx, downloadFile } from "@/lib/utils";
import type { PaperKey } from "@/lib/types";

const TABS = ["Apariencia", "Voz", "Lectura", "Pomodoro", "Pronunciación", "Datos"] as const;
type Tab = (typeof TABS)[number];

const PAPERS: { key: PaperKey; label: string; swatch: string }[] = [
  { key: "white", label: "Blanco", swatch: "#ffffff" },
  { key: "sepia", label: "Sepia", swatch: "#fbf0dd" },
  { key: "gray", label: "Gris", swatch: "#e9e9e7" },
  { key: "black", label: "Negro", swatch: "#191919" },
];

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="text-[13.5px] text-fg">{label}</div>
        {hint ? <div className="mt-0.5 text-[11.5px] leading-snug text-fg/45">{hint}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Slider({
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div className="flex w-[168px] items-center gap-2">
      <input
        type="range"
        className="range flex-1"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="w-[38px] text-right text-[12px] tabular-nums text-fg/55">{format(value)}</span>
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-[20px] w-[34px] rounded-full transition-colors",
        checked ? "bg-accent" : "bg-fg/20",
      )}
    >
      <span
        className={cx(
          "absolute top-[2px] h-[16px] w-[16px] rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[16px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}

export function SettingsModeless({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("Apariencia");
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [ruleFrom, setRuleFrom] = useState("");
  const [ruleTo, setRuleTo] = useState("");

  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const fullWidth = useStore((s) => s.fullWidth);
  const toggleFullWidth = useStore((s) => s.toggleFullWidth);
  const tts = useStore((s) => s.tts);
  const setTts = useStore((s) => s.setTts);
  const reading = useStore((s) => s.reading);
  const setReading = useStore((s) => s.setReading);
  const pomodoro = useStore((s) => s.pomodoro);
  const setPomodoro = useStore((s) => s.setPomodoro);
  const resetPomodoroStats = useStore((s) => s.resetPomodoroStats);
  const pomHistory = useStore((s) => s.pomHistory);
  const rules = useStore((s) => s.rules);
  const addRule = useStore((s) => s.addRule);
  const removeRule = useStore((s) => s.removeRule);
  const pages = useStore((s) => s.pages);
  const resetWorkspace = useStore((s) => s.resetWorkspace);
  const restoreBackup = useStore((s) => s.restoreBackup);

  const { voices, supported } = useSpeech();
  const fileRef = useRef<HTMLInputElement>(null);

  /* --------------------------------- datos -------------------------------- */
  const payload = useMemo<BackupPayload>(() => {
    const s = useStore.getState();
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      pages: s.pages,
      selectedId: s.selectedId,
      expanded: s.expanded,
      theme: s.theme,
      tts: s.tts,
      // las posiciones de scroll no viajan: dependen del tamaño de ventana
      reading: { ...s.reading, positions: {} },
      pomodoro: s.pomodoro,
      pomHistory: s.pomHistory,
      bar: s.bar,
      rules: s.rules,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, theme, tts, reading, pomodoro, pomHistory, rules]);

  const sizeKb = Math.round(new Blob([JSON.stringify(payload)]).size / 1024);

  const exportBackup = () => {
    downloadFile(
      `nook-respaldo-${new Date().toISOString().slice(0, 10)}.json`,
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }),
    );
    setFeedback({ kind: "ok", text: "Respaldo descargado." });
  };

  const importBackup = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text) as BackupPayload;
      const ok = restoreBackup(data);
      setFeedback(
        ok
          ? { kind: "ok", text: `Respaldo restaurado: ${Object.keys(data.pages ?? {}).length} páginas.` }
          : { kind: "error", text: "El archivo no tiene la forma de un respaldo de Nook." },
      );
    } catch {
      setFeedback({ kind: "error", text: "No se pudo leer el archivo (JSON inválido)." });
    }
  };

  const testVoice = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const voice = tts.voiceURI
      ? voices.find((v) => v.voiceURI === tts.voiceURI) ?? pickDefaultVoice(voices)
      : pickDefaultVoice(voices);
    const sample =
      "Así se va a escuchar el documento. Las reglas de pronunciación se aplican sin tocar el texto original.";
    const utterance = new SpeechSynthesisUtterance(applyRules(speakableMath(sample), rules));
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? "es-AR";
    utterance.rate = tts.rate;
    utterance.pitch = tts.pitch;
    utterance.volume = tts.volume;
    synth.speak(utterance);
  };

  const words = useMemo(
    () => Object.values(pages).reduce((n, p) => n + p.blocks.reduce((m, b) => m + b.html.length, 0), 0),
    [pages],
  );

  return (
    <Shell title="Configuración" subtitle="Preferencias del workspace y de la lectura" onClose={onClose} width={620}>
      {/* pestañas */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-line pb-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setFeedback(null);
            }}
            className={cx(
              "rounded-[5px] px-2.5 py-1 text-[12.5px] transition-colors",
              tab === t ? "bg-surface-hover font-semibold text-fg" : "text-fg/55 hover:bg-surface-hover/60",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ------------------------------ apariencia ---------------------------- */}
      {tab === "Apariencia" && (
        <div className="divide-y divide-line">
          <Row label="Tema" hint="También con ⌘⇧L.">
            <div className="flex gap-1.5">
              {(["light", "dark"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={cx(
                    "flex h-[30px] items-center gap-1.5 rounded-[5px] border px-2.5 text-[12.5px]",
                    theme === t ? "border-accent bg-accent-soft text-fg" : "border-line text-fg/65 hover:bg-surface-hover",
                  )}
                >
                  <Icon name={t === "dark" ? "moon" : "sun"} size={14} />
                  {t === "dark" ? "Oscuro" : "Claro"}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Ancho del documento" hint="El ancho completo usa toda la ventana.">
            <Switch checked={fullWidth} onChange={() => toggleFullWidth()} />
          </Row>
          <Row label="Papel de lectura" hint="Se aplica al activar el modo lectura (⌘⇧E).">
            <div className="flex gap-1.5">
              {PAPERS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setReading({ paper: p.key })}
                  title={p.label}
                  aria-label={p.label}
                  className={cx(
                    "h-[26px] w-[26px] rounded-[5px] border-2 transition-transform hover:scale-105",
                    reading.paper === p.key ? "border-accent" : "border-line",
                  )}
                  style={{ background: p.swatch }}
                />
              ))}
            </div>
          </Row>
        </div>
      )}

      {/* --------------------------------- voz -------------------------------- */}
      {tab === "Voz" && (
        <div className="divide-y divide-line">
          {!supported && (
            <div className="rounded-[6px] bg-[#eb5757]/10 px-3 py-2 text-[12.5px] text-[#eb5757]">
              Este navegador no expone la Web Speech API. La lectura en voz alta no va a funcionar acá;
              probá en Chrome, Edge o Safari.
            </div>
          )}
          <Row label="Voz del sistema" hint={`${voices.length} voces disponibles${voices.some((v) => v.localService) ? " · hay locales (sin red)" : ""}.`}>
            <select
              value={tts.voiceURI ?? ""}
              onChange={(e) => setTts({ voiceURI: e.target.value || null })}
              className="h-[30px] max-w-[266px] rounded-[5px] border border-line bg-surface px-2 text-[12.5px] text-fg outline-none focus:border-accent/60"
            >
              <option value="">Automática (mejor voz en español)</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {voiceLabel(v)}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Velocidad" hint="Se aplica desde el fragmento siguiente.">
            <Slider value={tts.rate} min={0.5} max={2} step={0.05} onChange={(rate) => setTts({ rate })} format={(v) => `${v.toFixed(2)}×`} />
          </Row>
          <Row label="Tono">
            <Slider value={tts.pitch} min={0} max={2} step={0.05} onChange={(pitch) => setTts({ pitch })} format={(v) => v.toFixed(2)} />
          </Row>
          <Row label="Volumen">
            <Slider value={tts.volume} min={0} max={1} step={0.05} onChange={(volume) => setTts({ volume })} format={(v) => `${Math.round(v * 100)}%`} />
          </Row>
          <Row label="Seguir la lectura" hint="Desplaza el documento hasta el párrafo que suena.">
            <Switch checked={tts.autoScroll} onChange={(autoScroll) => setTts({ autoScroll })} />
          </Row>
          <Row label="Probar">
            <button type="button" onClick={testVoice} className="flex h-[30px] items-center gap-1.5 rounded-[5px] border border-line px-2.5 text-[12.5px] text-fg/80 hover:bg-surface-hover">
              <Icon name="volume" size={14} />
              Escuchar muestra
            </button>
          </Row>
        </div>
      )}

      {/* ------------------------------- lectura ------------------------------ */}
      {tab === "Lectura" && (
        <div className="divide-y divide-line">
          <Row label="Modo lectura" hint="Oculta el chrome de edición y deja sólo el documento. Atajo ⌘⇧E.">
            <Switch checked={reading.mode} onChange={(mode) => setReading({ mode })} />
          </Row>
          <Row label="Tamaño del texto">
            <Slider
              value={reading.fontScale}
              min={0.85}
              max={1.4}
              step={0.05}
              onChange={(fontScale) => setReading({ fontScale })}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </Row>
          <Row label="Barra de progreso" hint="Línea fina en el borde superior del documento.">
            <Switch checked={reading.showProgress} onChange={(showProgress) => setReading({ showProgress })} />
          </Row>
          <Row label="Recordar la posición" hint="Al volver a una página, retoma donde estabas.">
            <Switch checked={reading.remember} onChange={(remember) => setReading({ remember })} />
          </Row>
          <Row
            label="Posiciones guardadas"
            hint={`${Object.keys(reading.positions).length} páginas con posición.`}
          >
            <button
              type="button"
              onClick={() => setReading({ positions: {} })}
              className="rounded-[5px] border border-line px-2.5 py-1 text-[12.5px] text-fg/70 hover:bg-surface-hover"
            >
              Borrar
            </button>
          </Row>
        </div>
      )}

      {/* ------------------------------- pomodoro ----------------------------- */}
      {tab === "Pomodoro" && (
        <div className="divide-y divide-line">
          <Row label="Duración del enfoque" hint="Cambiar la duración reinicia la sesión actual.">
            <Slider value={pomodoro.work} min={5} max={90} step={5} onChange={(work) => setPomodoro({ work })} format={(v) => `${v} min`} />
          </Row>
          <Row label="Descanso corto">
            <Slider value={pomodoro.rest} min={1} max={30} step={1} onChange={(rest) => setPomodoro({ rest })} format={(v) => `${v} min`} />
          </Row>
          <Row label="Descanso largo">
            <Slider value={pomodoro.longRest} min={5} max={45} step={5} onChange={(longRest) => setPomodoro({ longRest })} format={(v) => `${v} min`} />
          </Row>
          <Row label="Descanso largo cada" hint="Ciclos de enfoque antes del descanso largo.">
            <Slider value={pomodoro.sessionsBeforeLong} min={2} max={8} step={1} onChange={(sessionsBeforeLong) => setPomodoro({ sessionsBeforeLong })} format={(v) => `${v}`} />
          </Row>
          <Row label="Alarma sonora" hint="Timbres sintetizados distintos para trabajo y descanso.">
            <Switch checked={pomodoro.sound} onChange={(sound) => setPomodoro({ sound })} />
          </Row>
          <Row label="Arrancar la siguiente fase sola">
            <Switch checked={pomodoro.autoStart} onChange={(autoStart) => setPomodoro({ autoStart })} />
          </Row>
          <Row
            label="Historial"
            hint={`${pomHistory.reduce((n, d) => n + d.sessions, 0)} sesiones en ${pomHistory.length} días.`}
          >
            <button
              type="button"
              onClick={() => {
                if (confirm("¿Borrar el historial de Pomodoro?")) resetPomodoroStats();
              }}
              className="rounded-[5px] border border-line px-2.5 py-1 text-[12.5px] text-[#eb5757] hover:bg-surface-hover"
            >
              Borrar historial
            </button>
          </Row>
        </div>
      )}

      {/* ---------------------------- pronunciación --------------------------- */}
      {tab === "Pronunciación" && (
        <div>
          <p className="mb-3 text-[12.5px] leading-relaxed text-fg/55">
            Reemplazos que se aplican <strong>sólo al texto que se pronuncia</strong>. El documento, el
            resaltado y las búsquedas no cambian. Útil para siglas, nombres propios y símbolos.
          </p>

          {rules.length === 0 ? (
            <div className="rounded-[6px] border border-dashed border-line py-6 text-center text-[12.5px] text-fg/40">
              Todavía no hay reglas.
            </div>
          ) : (
            <div className="mb-3 divide-y divide-line rounded-[6px] border border-line">
              {rules.map((rule) => (
                <div key={rule.id} className="flex items-center gap-2 px-2.5 py-1.5">
                  <code className="inline-code">{rule.from}</code>
                  <Icon name="chevron-right" size={12} className="text-fg/30" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg/75">{rule.to || "—"}</span>
                  <button type="button" onClick={() => removeRule(rule.id)} aria-label="Quitar regla" className="icon-btn h-[22px] w-[22px]">
                    <Icon name="x" size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form
            className="flex items-end gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!ruleFrom.trim()) return;
              addRule(ruleFrom, ruleTo);
              setRuleFrom("");
              setRuleTo("");
            }}
          >
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-[10.5px] uppercase tracking-wide text-fg/40">Escribir</span>
              <input
                value={ruleFrom}
                onChange={(e) => setRuleFrom(e.target.value)}
                placeholder="p. ej. TTS"
                className="h-[30px] w-full rounded-[5px] border border-line bg-surface px-2 text-[12.5px] outline-none focus:border-accent/60"
              />
            </label>
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-[10.5px] uppercase tracking-wide text-fg/40">Pronunciar como</span>
              <input
                value={ruleTo}
                onChange={(e) => setRuleTo(e.target.value)}
                placeholder="te te ese"
                className="h-[30px] w-full rounded-[5px] border border-line bg-surface px-2 text-[12.5px] outline-none focus:border-accent/60"
              />
            </label>
            <button
              type="submit"
              className="h-[30px] shrink-0 rounded-[5px] bg-fg px-3 text-[12.5px] font-semibold text-surface hover:opacity-90"
            >
              Agregar
            </button>
          </form>
        </div>
      )}

      {/* --------------------------------- datos ------------------------------ */}
      {tab === "Datos" && (
        <div className="space-y-4">
          <div className="rounded-[6px] border border-line p-3 text-[13px] text-fg/60">
            <div className="flex justify-between py-0.5">
              <span>Páginas</span>
              <span className="tabular-nums">{Object.keys(pages).length}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span>Bloques</span>
              <span className="tabular-nums">{Object.values(pages).reduce((n, p) => n + p.blocks.length, 0)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span>Caracteres de contenido</span>
              <span className="tabular-nums">{words.toLocaleString("es-AR")}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span>Respaldo</span>
              <span className="tabular-nums">{sizeKb} KB</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span>Almacenamiento</span>
              <span>localStorage del navegador</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportBackup}
              className="flex h-[32px] items-center gap-1.5 rounded-[5px] border border-line px-2.5 text-[12.5px] text-fg/80 hover:bg-surface-hover"
            >
              <Icon name="download" size={14} />
              Exportar respaldo
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-[32px] items-center gap-1.5 rounded-[5px] border border-line px-2.5 text-[12.5px] text-fg/80 hover:bg-surface-hover"
            >
              <Icon name="upload" size={14} />
              Importar respaldo
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importBackup(file);
                e.target.value = "";
              }}
            />
          </div>

          {feedback ? (
            <div
              className={cx(
                "rounded-[5px] px-2.5 py-1.5 text-[12px]",
                feedback.kind === "ok" ? "bg-[#448361]/12 text-[#448361]" : "bg-[#eb5757]/10 text-[#eb5757]",
              )}
            >
              {feedback.text}
            </div>
          ) : null}

          <div className="rounded-[6px] bg-[#cb912f]/10 px-3 py-2 text-[11.5px] leading-relaxed text-[#8a6516] dark:text-[#e0b64a]">
            <strong>Privacidad:</strong> los datos viven en el <code className="inline-code">localStorage</code> de
            este navegador. Eso <em>no</em> es almacenamiento cifrado: cualquiera con acceso al perfil del sistema
            puede inspeccionarlo. Nada se envía a un servidor.
          </div>

          <button
            type="button"
            onClick={() => {
              if (confirm("¿Restablecer el workspace a los datos de ejemplo? Se pierden tus páginas.")) {
                resetWorkspace();
                onClose();
              }
            }}
            className="flex h-[32px] items-center gap-1.5 rounded-[5px] border border-line px-2.5 text-[12.5px] text-[#eb5757] hover:bg-surface-hover"
          >
            <Icon name="trash" size={14} />
            Restablecer datos de ejemplo
          </button>

          <div className="text-[11.5px] leading-relaxed text-fg/35">
            Nook 0.2.0 · Next.js 15 + Tailwind + Zustand · Clon funcional con fines educativos. Sin assets, logos
            ni código de la app original a la que homenajea.
          </div>
        </div>
      )}
    </Shell>
  );
}

/** Envoltorio con el flag de UI: mismo contrato que el resto de los modales. */
export function SettingsModal() {
  const open = useStore((s) => s.settingsOpen);
  const setUI = useStore((s) => s.setUI);
  if (!open) return null;
  return <SettingsModeless onClose={() => setUI({ settingsOpen: false })} />;
}

export default SettingsModal;
