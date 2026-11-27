# Análisis previo: cómo se estudió la app y qué se replicó

Documento de trazabilidad. Todo lo que dice "medido" viene de archivos que bajé y
procesé en este workspace; lo que dice "de conocimiento" es criterio de diseño, no
una medición.

---

## 1. Método y límites reales del entorno

El pedido fue *"analizá la app de Notion con Craft Anything / REA / Ghidra y
replicá su interfaz"*. Esto es lo que efectivamente se pudo hacer con cada
herramienta, sin maquillaje:

| Herramienta | Qué intenté | Resultado |
|---|---|---|
| **REA** `analyze-web-bundle https://www.notion.com` | Capturar y analizar estáticamente el bundle de la página | ❌ **Rechazado por diseño**: la operación exige un `targetId` ya capturado por un navegador (`{"code":"VALIDATION_ERROR", "path":"targetId"}`). En este entorno no hay Chromium en el PATH, así que no hay target que analizar. |
| **Craft Anything** `triage --deep` sobre el HTML descargado | Primer vistazo del artefacto | ✅ Devuelve `kind: script`, `summary: "page_0992d5.html is a script or web page"`, `confidence: inferred`. Confirma el tipo de artefacto, no aporta estructura. |
| **Descarga directa + parseo de CSS** (con `curl` y `grep`) | Extraer los design tokens reales | ✅ **Esto es lo que aportó el dato duro**: 329 KB de HTML + 10 hojas de estilo (224 KB) con el sistema de tokens de Notion. Detalle en §2. |
| **Ghidra** | Analizar el binario de la app de escritorio (Electron) | ❌ **No aplica**: no hay binario local. La app de escritorio no está instalada, su `.asar` no es código nativo (Ghidra brilla en código compilado: ELF/PE/Mach-O), y descargar el instalador propietario para descompilarlo excede lo razonable para un clon de UI. Ghidra queda listo y verificado para cuando haya un binario real: `rea analyze /ruta/app --provider ghidra`. |
| **Acceso a la app real** (`notion.so`) | Ver la UI de la app | ❌ `301 → Cloudflare`. La UI real vive detrás de login. No hay cuenta ni la voy a pedir. |

**Conclusión honesta:** la interfaz se replicó a partir de (a) los tokens de
diseño medidos del sitio, (b) la estructura funcional documentada públicamente de
la app, y (c) criterio de diseño de producto. No hay una captura pixel-perfect de
la app real porque el entorno no permite obtenerla — y decirlo es parte del
trabajo.

---

## 2. Lo que sí se midió (evidencia)

El sitio público de Notion corre sobre su propio sistema de diseño. Del CSS
descargado salieron estas familias de tokens:

```
--tatami-color-gray-*             escala de grises
--tatami-color-alpha-black-100..900   negros con alfa (bordes, hovers, sombras)
--tatami-color-blue-100..700      acento
--tatami-border-radius-0/500/700/round
--radius-4, --radius-full
font-family: -apple-system, BlinkMacSystemFont, sans-serif
font-family: SF Pro, system-ui, sans-serif
font-weight: 500 | 600 | 650
border-radius: 12px | 50% | 9999px
```

De ahí se derivaron las decisiones de este proyecto:

| Token medido | Cómo se usa en Nook |
|---|---|
| `alpha-black-100/200/300` | `--surface-hover`, `--surface-active`, bordes `--line` |
| `--tatami-border-radius-*` (0 / 500 / 700 / round) | `rounded-[3px]` (pills), `rounded-[4px]` (botones), `rounded-pop` 8px (popovers), `rounded-full` (avatares) |
| `SF Pro` / `-apple-system` | `font-sans`: `ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica…` — sin descargar tipografías |
| pesos 500 / 600 / 650 | UI en 500, títulos en 600/700 |
| `12px` / `50%` | avatares e iconos redondos, tarjetas de board |

Lo que **no** se copió: ningún asset, logo, nombre de marca, tipografía con
licencia ni código de la app. La paleta de texto de 9 colores y los grises de la
superficie son los de la familia de producto (valores estándar), reimplementados
desde cero en variables CSS propias.

---

## 3. Modelo mental de la aplicación

La app no es "una página con texto". Es un motor documental con cuatro capas
independientes:

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. WORKSPACE  (sidebar)                                              │
│    workspace switcher · búsqueda · inbox · favoritos · teamspaces    │
│    árbol de páginas con jerarquía ilimitada · papelera               │
├──────────────────────────────────────────────────────────────────────┤
│ 2. PÁGINA                                                            │
│    portada (cover) · icono (emoji) · título · breadcrumb · share     │
│    → cuerpo = BLOQUES  ó  BASE DE DATOS                              │
├──────────────────────────────────────────────────────────────────────┤
│ 3. BLOQUES  (lista plana + nivel de indentación)                     │
│    paragraph · h1/h2/h3 · bulleted · numbered · todo · toggle        │
│    quote · callout · divider · code                                  │
│    cada bloque: contenido inline (HTML) + metadatos                  │
├──────────────────────────────────────────────────────────────────────┤
│ 4. BASE DE DATOS                                                     │
│    propiedades tipadas · filas · vistas (tabla/board/lista)          │
│    filtros · orden · agrupación · panel de fila (peek)               │
└──────────────────────────────────────────────────────────────────────┘
```

**Las tres decisiones estructurales que definen la réplica:**

1. **El documento es una lista plana de bloques, no un árbol.** Cada bloque
   guarda `{ id, type, html, indent, checked?, collapsed? }`. Con eso, mover un
   bloque es un `splice`, indentar es `indent ± 1`, y un toggle "contiene" a los
   bloques siguientes que tienen `indent` mayor. Un árbol DOM habría hecho todo
   esto mucho más frágil.
2. **Una página es o cuerpo de bloques o base de datos.** Misma ruta, mismo
   breadcrumb, misma barra superior. La base de datos no es "otra pantalla".
3. **El formato inline vive en HTML dentro del bloque.** Eso permite `⌘B/I/U`,
   código inline, marcas y links sin inventar un lenguaje de marcado propio.

---

## 4. Inventario: qué se replicó

| Módulo | Funcionalidad de la app original | Estado en Nook |
|---|---|---|
| Sidebar | Workspace switcher, búsqueda, home, inbox, settings | ✅ |
| Sidebar | Árbol de páginas anidadas con expandir/contraer | ✅ |
| Sidebar | Crear subpágina desde el hover, menú contextual (renombrar, duplicar, favorito, copiar link, papelera) | ✅ |
| Sidebar | Favoritos, teamspaces (Privado / Equipo), papelera con contador, colapsar barra | ✅ |
| Sidebar | Drag & drop para reordenar páginas | ⛔ pendiente |
| Barra superior | Breadcrumb navegable, "editado hace…", compartir, comentarios, favorito, menú ⋯ | ✅ |
| Barra superior | Presencia / avatares en vivo, comentarios reales | ⛔ pendiente |
| Página | Portada con galería de gradientes, icono emoji, título autoexpandible | ✅ |
| Página | Ancho completo / pequeño, historial de versiones, exportar | ⚠️ ancho completo sí; el resto pendiente |
| Editor | 13 tipos de bloque | ✅ |
| Editor | Menú `/` con búsqueda y navegación por teclado | ✅ |
| Editor | Atajos markdown (`# `, `- `, `[] `, `> `, ```` ``` ````, `1. `, `---`) | ✅ |
| Editor | Formato inline ⌘B/I/U/E | ✅ |
| Editor | Enter parte el bloque · Backspace une · Tab indenta · flechas navegan | ✅ |
| Editor | Handle lateral: `+` inserta, `⠿` arrastra para reordenar | ✅ |
| Editor | Selección múltiple de bloques, `/` con IA, bloques de imagen/video/archivo | ⛔ pendiente |
| Base de datos | Propiedades: título, texto, selección, estado, persona, fecha, número, checkbox | ✅ |
| Base de datos | Vistas tabla / board / lista con cambio en caliente | ✅ |
| Base de datos | Filtro y orden por propiedad, buscador, crear opción de selección al vuelo | ✅ |
| Base de datos | Panel de fila (peek) con título y propiedades | ✅ |
| Base de datos | Drag & drop entre columnas del board | ✅ |
| Base de datos | Cuerpo de la fila (la fila como página con bloques), fórmulas, relaciones | ⛔ pendiente |
| Global | ⌘K con páginas + acciones, modo oscuro, atajos, persistencia local | ✅ |
| Global | Multiusuario real, tiempo real (CRDT), permisos, API | ⛔ fuera de alcance (es local) |

---

## 5. Decisiones técnicas y por qué

| Decisión | Alternativa descartada | Motivo |
|---|---|---|
| **Editor propio sobre `contentEditable`** | TipTap / ProseMirror / Slate | Un clon de Notion necesita **bloques como unidad de primera clase** (mover, indentar, plegar, handle lateral). Con un editor de texto enriquecido tradicional terminás peleando contra su modelo de documento. Con `contentEditable` por bloque, el modelo es mío y el navegador sólo aporta el caret. |
| **`dangerouslySetInnerHTML` nunca; sincronización manual `innerHTML`** | Re-render de React dentro del bloque | React no debe tocar el DOM de un bloque mientras escribís: el caret salta. El componente `Editable` escribe `innerHTML` **sólo si difiere** del store. |
| **Zustand + `persist` en `localStorage`** | Context + useReducer / Redux | Selectores finos (el sidebar no re-renderiza cuando escribís), y persistencia en 3 líneas. |
| **Tokens en variables CSS + Tailwind** | Clases `dark:` duplicadas en cada componente | El modo oscuro cambia ~12 variables y toda la app cambia. Cero duplicación. |
| **Iconos SVG inline propios** | `lucide-react` / fuentes de iconos | 46 iconos con el mismo trazo que el original, sin dependencia, sin request, sin parpadeo. |
| **Portadas = gradientes CSS** | Imágenes de stock | Cero licencias, cero peso, mismo efecto visual. |
| **`allowedDevOrigins` en `next.config.ts`** | — | El sandbox sirve la app detrás de un proxy; sin esto Next devuelve 403 a `/_next/*` y la página queda sin estilos. |

---

## 6. Cómo verificar que no es una maqueta

`npm run capturas` levanta Chromium headless, recorre la app (inicio, menú `/`,
modo oscuro, tabla, board, panel de fila, ⌘K, compartir) y **falla si hay un error
de consola o de página**. Las 10 capturas de `docs/capturas/` son el resultado de
esa corrida, no un mockup.

Verificado en la última corrida: `✔ sin errores de consola ni de página`.

> **Nota de alcance (v0.2).** Este documento analiza la **interfaz de Notion**.
> La capa de lectura y foco (voz, modo lectura, mapas mentales, Pomodoro,
> importación) proviene de un spec de producto distinto y su trazabilidad —
> qué se integró, qué se adaptó y qué quedó afuera con su motivo— está en
> **[docs/OPENHUB.md](./docs/OPENHUB.md)**, para no mezclar dos análisis con
> criterios distintos.
