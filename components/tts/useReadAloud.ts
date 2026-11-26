"use client";

/**
 * Punto único de entrada a la lectura en voz alta.
 *
 * La barra superior, los atajos globales y el menú contextual necesitan la
 * misma lógica ("leer esto"), así que vive acá y no duplicada en cada uno.
 *
 * Si hay una selección de texto, se lee **la selección**; si no, la página
 * completa. En el primer caso se resuelve el bloque contenedor para que el
 * resaltado siga funcionando igual.
 */

import { useCallback } from "react";
import { useSpeech } from "@/components/tts/Speech";
import { buildSegments, splitSentences } from "@/lib/speech";
import { useStore } from "@/lib/store";
import { visibleBlocks } from "@/lib/utils";

export function useReadAloud() {
  const speech = useSpeech();
  const pages = useStore((s) => s.pages);
  const selectedId = useStore((s) => s.selectedId);

  /** lee la página indicada (por defecto la seleccionada) */
  const readPage = useCallback(
    (pageId: string = selectedId) => {
      const page = pages[pageId];
      if (!page) return;
      const blocks = visibleBlocks(page.blocks);
      const segments = buildSegments(page.title, blocks);
      if (!segments.length) return;
      speech.start(segments, page.title || "Sin título");
    },
    [pages, selectedId, speech],
  );

  /** lee la selección actual; devuelve false si no había nada seleccionado */
  const readSelection = useCallback(() => {
    if (typeof window === "undefined") return false;
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text) return false;

    const anchor = selection?.anchorNode;
    const element = anchor instanceof Element ? anchor : anchor?.parentElement ?? null;
    const blockId = element?.closest("[data-block-id]")?.getAttribute("data-block-id") ?? "";

    const segments = splitSentences(text, 180).map((sentence) => ({ blockId, text: sentence }));
    if (!segments.length) return false;
    speech.start(segments, "Selección");
    return true;
  }, [speech]);

  /** alterna: si hay algo sonando, pausa; si no, arranca la página */
  const toggleRead = useCallback(() => {
    if (speech.status === "playing") speech.pause();
    else if (speech.status === "paused") speech.resume();
    else readPage();
  }, [speech, readPage]);

  return { speech, readPage, readSelection, toggleRead };
}
