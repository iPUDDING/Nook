"use client";

import { tomarCopia } from "@/lib/backups";
import { useCallback, useEffect, useRef, useState } from "react";
import CommandPalette from "./CommandPalette";
import HistoryModal from "./HistoryModal";
import MindMap from "./mindmap/MindMap";
import { PasteMarkdownModal, ShareModal, ShortcutsModal, TrashModal } from "./Modals";
import PageView from "./PageView";
import { PomodoroLayer, PomodoroProvider, usePomodoro } from "./pomodoro/Pomodoro";
import SettingsModal from "./Settings";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { SpeechHighlighter, SpeechProvider } from "./tts/Speech";
import ReadingBar from "./tts/ReadingBar";
import { useReadAloud } from "./tts/useReadAloud";
import { Skeleton } from "./ui";
import { useStore } from "@/lib/store";
import { cx, toggleFullscreen } from "@/lib/utils";

export default function AppShell() {
  return (
    <SpeechProvider>
      <PomodoroProvider>
        <Workspace />
      </PomodoroProvider>
    </SpeechProvider>
  );
}

function Workspace() {
  const theme = useStore((s) => s.theme);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const selectedId = useStore((s) => s.selectedId);
  const page = useStore((s) => s.pages[s.selectedId]);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const setTheme = useStore((s) => s.setTheme);
  const setUI = useStore((s) => s.setUI);
  const mindmapOpen = useStore((s) => s.mindmapOpen);

  const reading = useStore((s) => s.reading);
  const setReading = useStore((s) => s.setReading);
  const savePosition = useStore((s) => s.savePosition);

  const { speech, readPage } = useReadAloud();
  const pomodoro = usePomodoro();

  // Evita el mismatch de hidratación: el store persiste en localStorage y el
  // servidor no puede saber qué había guardado el navegador.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  /**
   * En pantallas angostas la barra lateral fija se come la página: con 390 px de
   * ancho el editor quedaba en 84 px. Se arranca con la barra cerrada (el botón
   * para abrirla sigue estando) en lugar de empujar el contenido a una columna
   * inservible.
   */
  useEffect(() => {
    if (window.innerWidth < 768 && useStore.getState().sidebarOpen) toggleSidebar();
  }, [toggleSidebar]);

  /* ------------------------------- tema / UI ------------------------------- */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }, [theme]);

  /* --------------------------- posición de lectura ------------------------- */
  // Restaurar: sólo al cambiar de página, y después del primer pintado.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const saved = useStore.getState().reading;
    const y = saved.remember ? saved.positions[selectedId] ?? 0 : 0;
    el.scrollTop = y;
    setProgress(y > 0 ? Math.min(1, y / Math.max(1, el.scrollHeight - el.clientHeight)) : 0);
  }, [selectedId]);

  // Guardar: un solo listener con rAF, sin re-render por cada píxel.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const max = el.scrollHeight - el.clientHeight;
        setProgress(max > 8 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0);
        savePosition(selectedId, el.scrollTop);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [selectedId, savePosition]);

  /* ------------------------ copias automáticas ---------------------------- */
  // Una foto del workspace al arrancar y cada cinco minutos; `tomarCopia` no
  // guarda nada si el contenido no cambió, así que no llena el espacio de copias
  // repetidas. Es lo que en la app de referencia hay que hacer a mano con un ZIP.
  useEffect(() => {
    tomarCopia();
    const tic = window.setInterval(() => tomarCopia(), 5 * 60 * 1000);
    return () => window.clearInterval(tic);
  }, []);

  /* ---------------------------- atajos globales ---------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

      // F11: pantalla completa (funciona en el navegador y en el .exe)
      if (e.key === "F11") {
        e.preventDefault();
        void toggleFullscreen();
        return;
      }
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setUI({ paletteOpen: true });
        return;
      }
      if (mod && e.key === "\\") {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setTheme(useStore.getState().theme === "dark" ? "light" : "dark");
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        readPage();
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setReading({ mode: !useStore.getState().reading.mode });
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        setUI({ mindmapOpen: !useStore.getState().mindmapOpen });
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        pomodoro.setPanelOpen(!pomodoro.panelOpen);
        return;
      }
      // Zoom del contenido: ⌘+ / ⌘- / ⌘0, como en un navegador
      if (mod && (e.key === "+" || e.key === "=" || e.key === "Add")) {
        e.preventDefault();
        const st = useStore.getState();
        st.setZoom(st.zoom + 10);
        return;
      }
      if (mod && (e.key === "-" || e.key === "Subtract")) {
        e.preventDefault();
        const st = useStore.getState();
        st.setZoom(st.zoom - 10);
        return;
      }
      if (mod && e.key === "0") {
        e.preventDefault();
        useStore.getState().setZoom(100);
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "b") {
        // el atajo que la app de referencia nunca agregó: bloquear / desbloquear
        e.preventDefault();
        const id = useStore.getState().selectedId;
        if (id) useStore.getState().toggleLock(id);
        return;
      }
      if (mod && e.key === ",") {
        e.preventDefault();
        setUI({ settingsOpen: true });
        return;
      }
      // Espacio: pausa/reanuda la voz sin robarle la tecla al editor ni a los
      // botones (un botón enfocado se activa con Espacio).
      if (
        e.key === " " &&
        !typing &&
        !mod &&
        target?.tagName !== "BUTTON" &&
        speech.status !== "idle"
      ) {
        e.preventDefault();
        speech.toggle();
        return;
      }
      if (!typing && e.key === "?") {
        e.preventDefault();
        setUI({ shortcutsOpen: true });
        return;
      }
      if (e.key === "Escape") {
        // Todo modal que se abre con una acción entra en esta lista: el que
        // faltaba (pegar Markdown) quedaba abierto tapando el editor.
        setUI({
          paletteOpen: false,
          shareOpen: false,
          settingsOpen: false,
          shortcutsOpen: false,
          trashOpen: false,
          peekRowId: null,
          mindmapOpen: false,
          pasteOpen: false,
          historyOpen: false,
        });
        // el panel de Pomodoro no vive en el store de la UI: se cierra por su
        // propio contexto, y sin esto era el único overlay que ignoraba Escape
        pomodoro.setPanelOpen(false);
        // en Electron Escape no sale de la pantalla completa por sí solo
        if (typeof document !== "undefined" && document.fullscreenElement) {
          void document.exitFullscreen();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTheme, toggleSidebar, setUI, readPage, setReading, speech, pomodoro]);

  // Historial de versiones: se carga una vez y luego se toma una foto de cada
  // página que cambia, con un respiro de 4 s para no crear una versión por tecla.
  useEffect(() => {
    useStore.getState().hydrateVersions();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const unsub = useStore.subscribe((state, prev) => {
      if (state.pages === prev.pages) return;
      for (const id of Object.keys(state.pages)) {
        const antes = prev.pages[id];
        const ahora = state.pages[id];
        if (!ahora || antes === ahora || antes?.updatedAt === ahora.updatedAt) continue;
        const pendiente = timers.get(id);
        if (pendiente) clearTimeout(pendiente);
        timers.set(
          id,
          setTimeout(() => {
            timers.delete(id);
            useStore.getState().captureVersion(id);
          }, 4000),
        );
      }
    });
    return () => {
      unsub();
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  if (!mounted) return <Skeleton />;

  const paper = reading.mode ? reading.paper : undefined;


  return (
    <div className="flex h-screen w-full overflow-hidden bg-surface">
      {/* ------------------------------- sidebar ------------------------------- */}
      <div
        className="shrink-0 overflow-hidden transition-[width] duration-200 ease-out"
        style={{ width: sidebarOpen ? 240 : 0 }}
      >
        <Sidebar />
      </div>

      {/* -------------------------------- main -------------------------------- */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        <TopBar />

        {/* progreso de lectura del documento */}
        {reading.showProgress && progress > 0.005 && (
          <div className="absolute left-0 right-0 top-[45px] z-20 h-[2px] bg-transparent" aria-hidden>
            <div
              className="h-full bg-accent/70 transition-[width] duration-150"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        )}

        <div
          id="page-scroll"
          ref={scrollRef}
          data-paper={paper}
          data-reading={reading.mode ? "true" : undefined}
          className={cx("flex-1 overflow-y-auto bg-surface text-fg", reading.mode && "paper-mode")}
          style={{ ["--reading-scale" as string]: String(reading.fontScale) }}
        >
          {page ? (
            <PageView key={page.id} page={page} />
          ) : (
            <div className="flex h-full items-center justify-center text-[14px] text-fg/40">
              No hay ninguna página seleccionada.
            </div>
          )}
        </div>
      </main>

      {/* ------------------------------- overlays ------------------------------ */}
      <SpeechHighlighter />
      <ReadingBar />
      <PomodoroLayer />
      <MindMap open={mindmapOpen} onClose={() => setUI({ mindmapOpen: false })} page={page ?? PLACEHOLDER} />
      <CommandPalette />
      <ShareModal />
      <PasteMarkdownModal />
      <SettingsModal />
      <ShortcutsModal />
      <TrashModal />
      <HistoryModal />
    </div>
  );
}

/** Página vacía para que el mapa mental pueda montarse antes de tener datos. */
const PLACEHOLDER = {
  id: "placeholder",
  title: "",
  icon: null,
  cover: null,
  parentId: null,
  order: 0,
  space: "private" as const,
  blocks: [],
  database: null,
  favorite: false,
  trashed: false,
  createdAt: 0,
  updatedAt: 0,
};
