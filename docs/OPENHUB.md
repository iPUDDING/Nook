# OpenHub dentro de Nook — informe de integración

Este documento responde una pregunta concreta: **de todo el spec de OpenHub
1.4.6, qué quedó implementado dentro de Nook, qué se adaptó y qué no entró**, con
el motivo técnico de cada decisión.

Leyenda: **✅ integrado** · **⚠️ adaptado** (misma función, otra forma por el
contexto de Nook) · **⛔ fuera de esta fase** (con la alternativa ofrecida).

---

## 1. La decisión de arquitectura

OpenHub es una app de **escritorio** (Tauri v2 + Rust) cuyo shell es un conjunto
de herramientas independientes: visor, estudio de voz, mapas, Pomodoro.

Nook es un **workspace de documentos** (Next.js, client-side). Pediste que las
funciones vivan **dentro de Nook**, no en un proyecto aparte. Eso cambia una
pieza central: en OpenHub la unidad es *el archivo que abrís*; en Nook la unidad
es *la página del workspace*. Todo lo demás se puede conservar casi intacto.

Consecuencia práctica: **no hay un visor aparte**. Las funciones de lectura se
aplican sobre la página que ya estás editando. Es más útil que tener dos
ventanas y evita duplicar el modelo de documentos.

---

## 2. Qué se integró, sección por sección

| Spec § | Función de OpenHub | Estado en Nook | Dónde |
|---|---|---|---|
| 3.1 | Visor de Markdown con editor + vista previa | ⚠️ Nook *es* un editor de bloques: no necesita vista previa porque lo que ves es el resultado | `Editor.tsx` |
| 3.1 | Índice navegable y estadísticas (palabras, caracteres, minutos) | ⚠️ Estadísticas en el pie de página; el índice se reemplaza por el árbol del sidebar | `PageView.tsx` |
| 3.1 | Posición de lectura guardada por documento | ✅ | `AppShell.tsx` + `reading.positions` |
| 3.1 | Barra de progreso de lectura | ✅ barra fina superior | `AppShell.tsx` |
| 3.1 | Papeles blanco / sepia / gris / negro | ✅ | `globals.css` (`[data-paper]`) |
| 3.1 | Zoom de documento (Ctrl+rueda, Ctrl+0) | ⚠️ tamaño de texto por preferencia (0,85×–1,4×) en vez de zoom de lienzo | Configuración → Lectura |
| 3.1 | Exportar a HTML e imprimir | ⚠️ exporta HTML autónomo con estilos; la impresión usa la del navegador sobre ese archivo | `lib/markdown.ts` |
| 3.1 | Renombrar sólo el nombre visible | ✅ es el comportamiento natural del título de página | `PageView.tsx` |
| 3.1 | Buscar palabras del documento desde la paleta (Ctrl+K), resaltar y navegar con Ctrl+G | ⛔ el ⌘K de Nook busca páginas y comandos. **Alternativa:** el mapa mental sí tiene búsqueda con salto; la búsqueda dentro del documento queda en el roadmap | — |
| 3.2 | PDF.js local, capa de texto, búsqueda, lectura | ⛔ ver §4 | — |
| 3.3 | Motor de voz con voces del sistema | ✅ | `components/tts/Speech.tsx` |
| 3.3 | Voz, velocidad, tono y volumen | ✅ | Configuración → Voz |
| 3.3 | Lectura de párrafos o de una selección | ✅ ambos (⌘⇧R usa la selección si hay una) | `useReadAloud.ts` |
| 3.3 | Pausa, reanudación, repetición, navegación entre párrafos | ✅ | `ReadingBar.tsx` |
| 3.3 | Tiempo estimado/restante y palabras que faltan, con velocidad **calibrada** | ✅ calibración por caracteres/segundo medidos | `Speech.tsx` |
| 3.3 | Mapa de texto que conecta la pronunciación con los nodos del DOM | ✅ equivalente: resaltado por bloque + scroll automático (no hay mapa por palabra) | `SpeechHighlight` |
| 3.3 | Fórmulas a lenguaje hablado | ⚠️ no hay KaTeX en Nook; se traducción símbolos (≈ ≤ ≥ ≠ ∑ ÷ × π ∞ √, potencias) | `speakableMath()` |
| 3.3 | Reglas de pronunciación que no alteran el texto | ✅ se aplican sólo a la cadena que se pronuncia | Configuración → Pronunciación |
| 3.3 | `Espacio` pausa sin interferir al escribir | ✅ ignora `input`, `textarea`, `select`, `contentEditable` y botones | `AppShell.tsx` |
| 3.4 | Barra flotante de cristal esmerilado | ✅ | `glass` en `globals.css` |
| 3.4 | Arrastrable y acoplable en un lateral, en vertical | ✅ 3 modos: flotante / izquierda / derecha | `ReadingBar.tsx` |
| 3.4 | Anterior/Siguiente/Detener en fila horizontal dentro de la barra vertical | ✅ deliberado: apilados serían inalcanzables | `ReadingBar.tsx` |
| 3.4 | Posición guardada localmente y movible con flechas | ✅ ambas | `bar` en el store |
| 3.5 | Estudio TTS separado (pegar texto, escuchar párrafos) | ⚠️ **no hay segunda herramienta**: se lee cualquier página o selección, que cubre el caso de uso sin duplicar la UI de voz | — |
| 3.6 | Markdown jerárquico → mapa interactivo | ✅ desde los bloques de la página | `MindMap.tsx` |
| 3.6 | Zoom, paneo, colapso de ramas | ✅ | idem |
| 3.6 | Búsqueda y centrado de coincidencias | ✅ con contador y `Enter` | idem |
| 3.6 | Modo foco | ✅ | idem |
| 3.6 | Ocultar/recuperar el editor sin cerrar el mapa | ✅ | idem |
| 3.6 | Exportar Markdown / SVG / PNG | ✅ (PNG a 2×) | idem |
| 3.6 | Exportar HTML interactivo / PDF por impresión | ⛔ requeriría embeber un visor de mapa; **alternativa:** SVG + PNG cubren compartir e imprimir | — |
| 3.7 | Pomodoro con duración de trabajo y descanso | ✅ + descanso largo y ciclo configurable | `pomodoro/Pomodoro.tsx` |
| 3.7 | Iniciar, pausar, reiniciar, saltar, estadísticas | ✅ con histograma de 7 días | idem |
| 3.7 | Alarmas locales diferenciadas | ✅ sintetizadas con WebAudio (sin archivos) | idem |
| 3.7 | Capa flotante por encima de las herramientas | ✅ | idem |
| 3.7 | Paleta de comandos Ctrl+K | ✅ extendida con los comandos nuevos | `CommandPalette.tsx` |
| 3.7 | Abrir archivo Ctrl+O | ⚠️ botón/drag sobre el sidebar (en el navegador `Ctrl+O` es del navegador) | `Sidebar.tsx` |
| 3.7 | Ocultar barra superior (Ctrl+Shift+H), pantalla completa F11 | ⛔ `F11` y la ocultación de chrome son del sistema operativo en el navegador. **Alternativa:** modo lectura (⌘⇧E) + ancho completo | — |
| 3.7 | Recientes, borradores y su recuperación | ⚠️ sustituido por el árbol de páginas y la persistencia automática (siempre guardado, sin borradores) | — |
| 3.7 | Respaldos JSON versionados | ✅ exportar/importar con validación de forma | `Settings.tsx` + `restoreBackup()` |
| 4 | Tauri v2 + Rust para la envoltura | ⛔ no compila en este entorno (sin Rust/WebView2/Windows). **Entregado:** guía completa en [EMPAQUETADO.md](./EMPAQUETADO.md) | — |
| 4 | Zustand con `persist` | ✅ mismo patrón, con `partialize` explícito | `lib/store.ts` |
| 4 | CodeMirror / Markmap para los mapas | ⚠️ reemplazados por un editor propio + SVG propio: cero dependencias y exportación fiel | `lib/mindmap.ts` |
| 5 | Todo local, sin cuenta ni backend | ✅ | — |
| 5 | Advertencia de que localStorage no es cifrado | ✅ en Configuración → Datos y en el README | `Settings.tsx` |
| 5 | Límite de tamaño del fallback web (150 MB) | ✅ 4 MB por archivo de texto, con aviso | `Sidebar.tsx` |
| 6 | Carga diferida del visor y las herramientas | ⚠️ Nook es una sola ruta client-side; el bundle pasó de 130 a 150 kB gzip, sin librerías nuevas | `next build` |
| 6 | Progreso por transformación en el handler de scroll, sin re-render | ✅ un listener con `requestAnimationFrame` alimenta la barra y la posición | `AppShell.tsx` |
| 6 | Concurrencia acotada y cancelable en PDF | ⛔ no aplica (no hay PDF). El perro guardián y el token de generación del motor de voz cumplen el mismo rol de "cancelar trabajo pendiente" | `Speech.tsx` |
| 8 | CI de Windows + instaladores firmados | ⛔ fuera de alcance acá; esquema del workflow en la guía de empaquetado | — |

---

## 3. Decisiones técnicas que conviene conocer

**Por qué el motor de voz no está en Zustand.** `SpeechSynthesisUtterance` es un
recurso imperativo con callbacks que no se puede serializar. El store guarda
preferencias; el motor vive en un contexto React. Intentar persistir el estado de
reproducción habría roto el `persist` con objetos no serializables.

**Por qué la cola se trocea en frases.** Chrome corta la síntesis en utterances
largas y deja de disparar `onend`; además, con fragmentos cortos el progreso y el
resaltado tienen granularidad real. 180 caracteres ≈ 13 s a velocidad normal.

**Por qué hay un token de generación.** Cada `cancel()` deja `onend` pendientes.
Sin invalidarlos, al saltar de fragmento la lectura avanza dos veces. Es el bug
más común de esta API y acá está cubierto con un contador por arranque.

**Por qué el progreso "restante" es creíble.** Se mide la velocidad real
(caracteres/segundo) con cada fragmento completado y se suaviza

```
cps = cps · 0,55 + real · 0,45
```

en lugar de asumir una constante. Con voces lentas el cálculo se corrige solo.

**Por qué el mapa mental es propio.** Markmap trae d3 completo (~120 kB) para
algo que acá son 400 líneas: árbol + layout tidy horizontal. Y como el SVG usa
atributos inline en vez de clases, el mismo nodo que ves es el que se descarga
como SVG y el que se rasteriza a PNG.

**Por qué el Pomodoro cuenta contra un timestamp.** Si la pestaña se suspende o
el equipo se duerme, restar 1 por tick acumula deriva. `endsAt - Date.now()` es
correcto aunque el intervalo se pierda.

**Por qué el papel de lectura se aplica al contenedor y no a `<html>`.** Los
colores son variables CSS; redefinirlas en el contenedor con scroll cambia el
documento sin tocar el chrome de la app. Es lo que permite leer en negro con el
sidebar claro.

---

## 4. Lo que quedó fuera y por qué (con alternativa)

**PDF y Office (PDF.js, DOCX/PPTX/XLSX).** No es un problema de dificultad sino
de **dónde vive el archivo**. En OpenHub los binarios están en el disco y Tauri
los pasa al frontend. En Nook todo el estado es un JSON en `localStorage`
(~5 MB en la mayoría de navegadores): meter PDFs ahí es imposible, y leerlos
desde un `File` en memoria obliga a un modelo de documentos paralelo al de
páginas.

*La alternativa que sí recomiendo:* almacenar los binarios en **IndexedDB** (sin
límite práctico de 5 MB, soporta `Blob`) y añadir `pdfjs-dist` con su worker
servido desde `/public`. Son unas 300 líneas de servicio + un bloque `file`
nuevo. Pero es una fase aparte: cambia el modelo de datos y debe entrar con su
propia verificación. Hoy lo que hace falta para "leer un documento" ya está: se
importan `.md` y `.txt` a bloques y se leen en voz alta.

**Actualizador firmado / CI de releases.** Depende de tener el binario Tauri. La
guía de empaquetado deja el workflow esbozado, marcado como *no verificado*,
porque no hay Windows ni Rust en este entorno.

**Estudio TTS como herramienta separada.** Duplicaría la selección de voz, la
lista de precios de pronunciación y la barra de lectura. Leer una selección de
cualquier página cubre el caso de uso.

---

## 5. Cómo se verificó

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | sin errores |
| `npx next build` | exit 0 · `/` = 46,9 kB (150 kB First Load) |
| `npm run capturas` | **17 capturas**, `✔ sin errores de consola ni de página` |
| Máquina de estados de la voz | ejercitada en Chromium con un `speechSynthesis` de prueba que emite `onstart`/`onboundary`/`onend`: la captura 12 muestra la lectura en 2/10 y la 17 en 9/10, con el resaltado siguiendo el fragmento correcto |
| Resaltado | verificado en 12, 13 y 17 (el bloque marcado cambia con el fragmento) |
| Barra acoplada | captura 13 (vertical, con anterior/siguiente/detener en fila) |
| Modo lectura + papel sepia | captura 11 |
| Mapa mental | captura 15 (10 nodos, profundidad 2, editor de contornos) |
| Configuración → Voz | captura 16 (voces del sistema, sliders, interruptor) |

**Lo que no se pudo verificar acá:** audio real. El contenedor no tiene voces
instaladas y Chromium headless no emite sonido. La primera prueba en una máquina
con Windows/macOS debe ser: elegir voz, `Escuchar muestra` en Configuración y
⌘⇧R sobre una página larga, comprobando pausa con `Espacio` y el salto entre
párrafos.
