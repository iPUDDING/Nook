"use client";

/**
 * Configuración del workspace: apariencia, voz, lectura, Pomodoro,
 * pronunciación y datos.
 *
 * Todo lo que se configura acá se persiste en el store, salvo la prueba de voz,
 * que habla con una utterance suelta para no apropiarse de la barra de lectura.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { Shell } from "./Modals";
import { useSpeech } from "./tts/Speech";
import { borrarCopia, leerCopias, limpiarCopias, restaurarCopia, tomarCopia } from "@/lib/backups";
import { useStore, type BackupPayload } from "@/lib/store";
import {
  DEMO_LICENSE,
  PLANS,
  planInfo,
  PLAN_FEATURES,
  hasFeature,
  historyLimit,
  planLabel,
  seatLimit,
  type PlanTier,
} from "@/lib/plan";
import { applyRules, pickDefaultVoice, speakableMath, voiceLabel } from "@/lib/speech";
import { workspaceToHtml } from "@/lib/markdown";
import { cx, downloadFile } from "@/lib/utils";
import type { PaperKey } from "@/lib/types";
import { MAX_PER_PAGE, totalBytes } from "@/lib/versions";
import { blobToBase64, FILE_EMBED_BUDGET, formatBytes, pickEmbeddable, readBlob } from "@/lib/files";

const TABS = ["Plan", "Apariencia", "Voz", "Lectura", "Pomodoro", "Pronunciación", "Datos"] as const;
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[6px] bg-surface-hover/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-fg/40">{label}</div>
      <div className="truncate text-[12.5px] font-medium text-fg/85">{value}</div>
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
  const settingsTab = useStore((s) => s.settingsTab);
  const [tab, setTab] = useState<Tab>(() =>
    TABS.includes(settingsTab as Tab) ? (settingsTab as Tab) : "Apariencia",
  );
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
  const members = useStore((s) => s.members);
  const rules = useStore((s) => s.rules);
  const addRule = useStore((s) => s.addRule);
  const removeRule = useStore((s) => s.removeRule);
  const pages = useStore((s) => s.pages);
  const resetWorkspace = useStore((s) => s.resetWorkspace);
  const restoreBackup = useStore((s) => s.restoreBackup);
  const plan = useStore((s) => s.plan);
  const versionsMap = useStore((s) => s.versions);
  const adjuntos = useStore((s) => s.files);
  const clearVersions = useStore((s) => s.clearVersions);
  const versiones = useMemo(() => {
    const listas = Object.values(versionsMap);
    return {
      total: listas.reduce((n, l) => n + l.length, 0),
      bytes: totalBytes(versionsMap),
    };
  }, [versionsMap]);
  const activateLicense = useStore((s) => s.activateLicense);
  const deactivatePlan = useStore((s) => s.deactivatePlan);
  const setPlanTier = useStore((s) => s.setPlanTier);
  /** se releen al abrir la sección y después de cada acción */
  const [copias, setCopias] = useState<{ id: string; at: number; bytes: number }[]>([]);
  useEffect(() => {
    setCopias(leerCopias().map((c) => ({ id: c.id, at: c.at, bytes: c.bytes })));
  }, []);

  const [license, setLicense] = useState("");
  const [planFeedback, setPlanFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const { voices, supported } = useSpeech();
  const fileRef = useRef<HTMLInputElement>(null);

  /* --------------------------------- datos -------------------------------- */
  const payload = useMemo<BackupPayload>(() => {
    const s = useStore.getState();
    return {
      version: 3,
      exportedAt: new Date().toISOString(),
      pages: s.pages,
      members: s.members,
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
  }, [pages, theme, tts, reading, pomodoro, pomHistory, rules, members]);

  const sizeKb = Math.round(new Blob([JSON.stringify(payload)]).size / 1024);

  /**
   * Respaldo con adjuntos.
   *
   * Los metadatos viajan siempre; el contenido binario sólo para los archivos que
   * entran en el presupuesto (`FILE_EMBED_BUDGET`), porque un JSON con 2 GB de
   * PDFs no se puede generar ni abrir. Los que quedan afuera se nombran en el
   * aviso: el usuario tiene que saber qué no está respaldando.
   */
  const exportBackup = async () => {
    const { dentro, fuera } = pickEmbeddable(adjuntos);
    const fileBlobs: { id: string; mime: string; data: string }[] = [];

    for (const file of dentro) {
      const leido = await readBlob(file.id);
      if (!leido.ok || !leido.value) continue;
      try {
        fileBlobs.push({ id: file.id, mime: file.mime, data: await blobToBase64(leido.value) });
      } catch {
        fuera.push(file);
      }
    }

    const cuerpo = { ...payload, files: adjuntos, fileBlobs };
    downloadFile(
      `nook-respaldo-${new Date().toISOString().slice(0, 10)}.json`,
      new Blob([JSON.stringify(cuerpo, null, 2)], { type: "application/json;charset=utf-8" }),
    );

    if (!adjuntos.length) {
      setFeedback({ kind: "ok", text: "Respaldo descargado." });
    } else if (!fuera.length) {
      setFeedback({ kind: "ok", text: `Respaldo descargado con ${dentro.length} adjunto(s) incluidos.` });
    } else {
      setFeedback({
        kind: "error",
        text: `Respaldo descargado con ${dentro.length} de ${adjuntos.length} adjuntos (los que no entran en ${formatBytes(FILE_EMBED_BUDGET)} viajan sólo como ficha). Fuera: ${fuera
          .slice(0, 3)
          .map((f) => f.name)
          .join(", ")}${fuera.length > 3 ? "…" : ""}`,
      });
    }
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

      {/* -------------------------------- plan -------------------------------- */}
      {tab === "Plan" && (() => {
        const seats = seatLimit(plan);
        const days = historyLimit(plan);
        const enabled = PLAN_FEATURES.filter((f) => hasFeature(plan, f.id)).length;

        const submitLicense = () => {
          const res = activateLicense(license);
          if (!res.ok) {
            setPlanFeedback({ kind: "error", text: res.error ?? "No se pudo activar." });
            return;
          }
          setPlanFeedback({ kind: "ok", text: "Suscripción activada. Todos los límites quedaron desactivados." });
          setLicense("");
        };

        return (
          <div className="space-y-4">
            {/* ------------------------- plan actual ------------------------- */}
            <div className="rounded-[8px] border border-line p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-fg">
                      Nook {planInfo(plan.tier).name}
                    </span>
                    <span
                      className={cx(
                        "rounded-full px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide",
                        plan.active ? "bg-accent-soft text-accent" : "bg-fg/10 text-fg/45",
                      )}
                    >
                      {plan.active ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                  <div className="mt-1 text-[12.5px] leading-snug text-fg/50">
                    {planInfo(plan.tier).tagline}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[15px] font-semibold tabular-nums text-fg">{planInfo(plan.tier).price}</div>
                  <div className="text-[10.5px] text-fg/40">por miembro / mes</div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Miembros" value={seats === null ? "Ilimitados" : String(seats)} />
                <Stat label="Historial" value={days === null ? "Ilimitado" : `${days} días`} />
                <Stat label="Tablas" value={hasFeature(plan, "tables") ? "Ilimitadas" : "—"} />
                <Stat label="Desde" value={new Date(plan.since).toLocaleDateString("es-AR")} />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (plan.active) {
                      deactivatePlan();
                      setPlanFeedback({ kind: "ok", text: "Suscripción cancelada: quedan las capacidades del plan Gratis." });
                    } else {
                      const res = activateLicense(DEMO_LICENSE);
                      setPlanFeedback(
                        res.ok
                          ? { kind: "ok", text: "Suscripción reactivada con la licencia de demostración." }
                          : { kind: "error", text: res.error ?? "No se pudo reactivar." },
                      );
                    }
                  }}
                  className={cx(
                    "flex h-[30px] items-center gap-1.5 rounded-[5px] border px-2.5 text-[12.5px]",
                    plan.active
                      ? "border-line text-fg/75 hover:bg-surface-hover"
                      : "border-accent bg-accent text-white hover:opacity-90",
                  )}
                >
                  <Icon name={plan.active ? "x" : "check"} size={13} />
                  {plan.active ? "Cancelar suscripción" : "Reactivar suscripción"}
                </button>

                <select
                  value={plan.tier}
                  onChange={(e) => setPlanTier(e.target.value as PlanTier)}
                  aria-label="Plan"
                  className="h-[30px] rounded-[5px] border border-line bg-surface px-2 text-[12.5px] text-fg outline-none focus:border-accent/60"
                >
                  {(Object.keys(PLANS) as PlanTier[]).map((t) => (
                    <option key={t} value={t}>
                      {PLANS[t].name} · {PLANS[t].price}
                    </option>
                  ))}
                </select>

                <span className="text-[11px] text-fg/35">
                  {plan.license ? `Licencia ${plan.license}` : "Activada de fábrica"}
                </span>
              </div>
            </div>

            {/* ------------------------- capacidades ------------------------- */}
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-fg/40">
                  Qué incluye tu suscripción
                </span>
                <span className="text-[11px] tabular-nums text-fg/35">
                  {enabled}/{PLAN_FEATURES.length} habilitadas
                </span>
              </div>
              <div className="divide-y divide-line rounded-[8px] border border-line">
                {PLAN_FEATURES.map((f) => {
                  const on = hasFeature(plan, f.id);
                  return (
                    <div key={f.id} className="flex items-start gap-2.5 px-3 py-2">
                      <span
                        className={cx(
                          "mt-[2px] flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full text-white",
                          on ? "bg-[#448361]" : "bg-fg/20",
                        )}
                      >
                        <Icon name={on ? "check" : "x"} size={10} strokeWidth={3} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] text-fg">{f.label}</div>
                        <div className="text-[11.5px] leading-snug text-fg/45">{f.hint}</div>
                      </div>
                      <span
                        className={cx(
                          "shrink-0 pt-[1px] text-[11.5px]",
                          on ? "text-[#448361]" : "text-fg/35",
                        )}
                      >
                        {on ? f.unlocked : `Plan ${PLANS[f.minTier].name}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* --------------------------- licencia -------------------------- */}
            <div className="rounded-[8px] border border-line p-3.5">
              <div className="text-[13px] font-medium text-fg">Activar con una licencia</div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-fg/45">
                Pegá la clave que te entregaron. Se valida sin conexión y queda guardada en este equipo.
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={license}
                  onChange={(e) => {
                    setLicense(e.target.value);
                    setPlanFeedback(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitLicense();
                    }
                  }}
                  placeholder="NOOK-XXXX-XXXX-XXXX"
                  aria-label="Clave de licencia"
                  className="h-[32px] flex-1 rounded-[5px] border border-line bg-surface px-2.5 font-mono text-[12.5px] uppercase tracking-wide text-fg outline-none placeholder:text-fg/30 focus:border-accent/60"
                />
                <button
                  type="button"
                  onClick={submitLicense}
                  className="h-[32px] rounded-[5px] bg-accent px-3 text-[12.5px] font-medium text-white hover:opacity-90"
                >
                  Activar
                </button>
              </div>
              {planFeedback && (
                <div
                  className={cx(
                    "mt-2 text-[12px]",
                    planFeedback.kind === "ok" ? "text-[#448361]" : "text-[#eb5757]",
                  )}
                >
                  {planFeedback.text}
                </div>
              )}
              <div className="mt-2 text-[11px] leading-relaxed text-fg/35">
                Clave de demostración: <code className="font-mono">{DEMO_LICENSE}</code>. Nook no
                procesa pagos ni tiene servidor: la validación es local, así que esto es una capa de
                producto, no DRM.
              </div>
            </div>
          </div>
        );
      })()}

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
              <span>Historial de versiones</span>
              <span className="tabular-nums">
                {versiones.total} {versiones.total === 1 ? "versión" : "versiones"} ·{" "}
                {Math.max(1, Math.round(versiones.bytes / 1024))} KB
              </span>
            </div>
            <div className="flex justify-between py-0.5">
              <span>Archivos adjuntos</span>
              <span className="tabular-nums">
                {adjuntos.length} · {formatBytes(adjuntos.reduce((n, f) => n + f.size, 0))}
              </span>
            </div>
            <div className="flex justify-between py-0.5">
              <span>Retención del historial</span>
              <span>{historyLimit(plan) === null ? "sin límite" : `${historyLimit(plan)} días`}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span>Almacenamiento</span>
              <span>localStorage del navegador</span>
            </div>
          </div>

          <div data-copias className="mt-3 rounded-home border border-line px-3 py-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[12.5px] font-medium text-fg/70">Copias automáticas</span>
              <span className="text-[11.5px] text-fg/40">
                cada 5 min mientras haya cambios · se guardan las últimas {5}
              </span>
            </div>
            {copias.length === 0 ? (
              <p className="text-[12px] text-fg/45">
                Todavía no hay copias: la primera se toma sola al abrir la app.
              </p>
            ) : (
              <ul className="space-y-1">
                {copias.map((c) => (
                  <li
                    key={c.id}
                    data-copia={c.id}
                    className="flex items-center gap-2 rounded-[4px] px-1 py-1 text-[12px] hover:bg-surface-hover"
                  >
                    <Icon name="clock" size={12} className="shrink-0 text-fg/35" />
                    <span className="tabular-nums text-fg/70">
                      {new Date(c.at).toLocaleString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="text-fg/35">{formatBytes(c.bytes)}</span>
                    <span className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        data-copia-restaurar={c.id}
                        onClick={() => {
                          const ok = restaurarCopia(c.id);
                          setFeedback(
                            ok
                              ? { kind: "ok", text: "Workspace restaurado desde la copia." }
                              : { kind: "error", text: "La copia no tiene la forma de un respaldo." },
                          );
                        }}
                        className="rounded-[4px] px-1.5 py-0.5 text-[11.5px] text-accent hover:bg-surface-hover"
                      >
                        Restaurar
                      </button>
                      <button
                        type="button"
                        data-copia-borrar={c.id}
                        onClick={() => {
                          borrarCopia(c.id);
                          setCopias(leerCopias().map((x) => ({ id: x.id, at: x.at, bytes: x.bytes })));
                        }}
                        className="rounded-[4px] px-1.5 py-0.5 text-[11.5px] text-fg/45 hover:bg-surface-hover hover:text-fg/70"
                      >
                        Borrar
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {copias.length > 0 && (
              <button
                type="button"
                data-copias-limpiar
                onClick={() => {
                  limpiarCopias();
                  setCopias([]);
                  setFeedback({ kind: "ok", text: "Copias automáticas borradas." });
                }}
                className="mt-1.5 text-[11.5px] text-fg/40 hover:text-fg/70"
              >
                Borrar todas
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void exportBackup()}
              className="flex h-[32px] items-center gap-1.5 rounded-[5px] border border-line px-2.5 text-[12.5px] text-fg/80 hover:bg-surface-hover"
            >
              <Icon name="download" size={14} />
              Exportar respaldo
            </button>
            <button
              type="button"
              disabled={!hasFeature(plan, "exportAll")}
              title={
                hasFeature(plan, "exportAll")
                  ? "Todas las páginas en un solo HTML, con índice"
                  : "La exportación completa viene con Business"
              }
              onClick={() => {
                const lista = Object.values(pages).filter((p) => !p.trashed);
                downloadFile(
                  `nook-workspace-${new Date().toISOString().slice(0, 10)}.html`,
                  new Blob([workspaceToHtml(lista, "Nook")], { type: "text/html;charset=utf-8" }),
                );
                setFeedback({
                  kind: "ok",
                  text: `Exportadas ${lista.length} páginas en un HTML con índice.`,
                });
              }}
              className="flex h-[32px] items-center gap-1.5 rounded-[5px] border border-line px-2.5 text-[12.5px] text-fg/80 hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <Icon name="download" size={14} />
              Exportar todo (HTML)
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-[32px] items-center gap-1.5 rounded-[5px] border border-line px-2.5 text-[12.5px] text-fg/80 hover:bg-surface-hover"
            >
              <Icon name="upload" size={14} />
              Importar respaldo
            </button>
            <button
              type="button"
              data-copia-ahora
              onClick={() => {
                const nueva = tomarCopia(true);
                setCopias(leerCopias().map((c) => ({ id: c.id, at: c.at, bytes: c.bytes })));
                setFeedback({
                  kind: "ok",
                  text: nueva ? "Copia guardada en este equipo." : "No se pudo guardar la copia.",
                });
              }}
              className="flex h-[32px] items-center gap-1.5 rounded-[5px] border border-line px-2.5 text-[12.5px] text-fg/80 hover:bg-surface-hover"
            >
              <Icon name="clock" size={14} />
              Copiar ahora
            </button>
            <button
              type="button"
              onClick={() => {
                clearVersions();
                setFeedback({ kind: "ok", text: "Historial de versiones borrado." });
              }}
              className="flex h-[32px] items-center gap-1.5 rounded-[5px] border border-line px-2.5 text-[12.5px] text-fg/80 hover:bg-surface-hover"
            >
              <Icon name="trash" size={14} />
              Borrar historial
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

          <p className="text-[11.5px] leading-relaxed text-fg/45">
            Los adjuntos viven en IndexedDB, no en el workspace: así un PDF grande no te deja sin
            espacio para las notas. El respaldo incluye sus fichas siempre y su contenido hasta{" "}
            {formatBytes(FILE_EMBED_BUDGET)}.
          </p>

          <p className="text-[11.5px] leading-relaxed text-fg/45">
            El historial guarda hasta {MAX_PER_PAGE} versiones por página y se recorta según el plan.
            Vive en una clave aparte del respaldo: si se llena el espacio, se descarta el historial
            antes que tus notas.
          </p>

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
            Nook 0.10.0 · Next.js 15 + Tailwind + Zustand · Clon funcional con fines educativos. Sin assets, logos
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
