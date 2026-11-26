# Nook — workspace tipo Notion

Clon funcional de la app de Notion (no de su web): **editor de bloques, bases de
datos con tres vistas, páginas anidadas, favoritos, papelera, ⌘K y modo oscuro**
— y, desde la versión 0.2, una capa completa de **lectura y foco**:
lectura en voz alta con resaltado, barra flotante acoplable, modo lectura con
papel, mapas mentales, Pomodoro compartido e importación/exportación de archivos.

Next.js 15 (App Router) + React 19 + TypeScript + Tailwind + Zustand.
**Cero dependencias de UI, cero assets externos, cero tipografías de terceros.**

> Análisis de la interfaz, evidencia y qué se replicó exactamente: **[ANALISIS.md](./ANALISIS.md)**
> Mapa de qué funciones de OpenHub se integraron y cuáles no: **[docs/OPENHUB.md](./docs/OPENHUB.md)**
> Cómo empaquetarlo como app de escritorio: **[docs/EMPAQUETADO.md](./docs/EMPAQUETADO.md)**
> Subirlo a GitHub sin sorpresas: **[docs/GITHUB.md](./docs/GITHUB.md)**
> Capturas reales generadas con Chromium headless: **[docs/capturas](./docs/capturas)**

---

## Arrancar

```bash
npm install
npm run dev          # http://localhost:3000
npm run verificar    # antes de subir: tsc --noEmit + next build
```

Producción:

```bash
npm run build && npm start
```

Requisitos: Node 18.18+ (probado con Node 22). No necesita base de datos ni
variables de entorno: el estado se guarda en `localStorage`.

> ⚠️ No corras `npm run build` con `npm run dev` en marcha: los dos escriben en
> `.next/` y el dev server empieza a devolver 404 en los assets. Si pasa:
> `rm -rf .next && npm run dev`.

---

## Qué hace

### Editor de bloques
Texto · Título 1/2/3 · lista con viñetas · lista numerada · lista de tareas ·
desplegable (toggle) · cita · bloque destacado (callout) · divisor · código.

- **Menú `/`** en cualquier bloque vacío, con búsqueda y navegación por teclado.
- **Atajos markdown** al empezar la línea: `# `, `## `, `### `, `- `, `1. `,
  `[] `, `> `, ` ``` `, `---`.
- **Handle lateral** al pasar el mouse: `+` inserta un bloque, `⠿` arrastra para
  reordenar (con línea azul de inserción).
- **Enter** parte el bloque donde está el caret · **Backspace** al inicio une con
  el anterior · **Tab / Shift+Tab** indenta · **↑ ↓** navegan entre bloques.
- Inline: **⌘B** negrita, **⌘I** itálica, **⌘U** subrayado, **⌘E** código.
- Toggles que pliegan a sus hijos por indentación.

### Páginas
Portada (galería de 12 gradientes), icono emoji, título autoexpandible,
breadcrumb navegable, favoritos, duplicar, papelera con restaurar, "ancho
completo", páginas dentro de páginas sin límite de profundidad.

### Bases de datos
Propiedades tipadas: **título, texto, selección, estado, persona, fecha, número,
checkbox**. Tres vistas en caliente:

- **Tabla** — edición inline, crear fila, borrar fila, ordenar columnas.
- **Board** — agrupado por estado, arrastrar tarjetas entre columnas.
- **Lista** — compacta, con pills de propiedades.

Filtro por estado, orden por cualquier propiedad, buscador, y creación de
opciones nuevas de selección escribiendo en la celda. Click en una fila abre el
**panel de fila** (peek) con título y todas las propiedades editables.

### Lectura en voz alta (Web Speech API)
Motor propio sobre `speechSynthesis`, con las voces **que ya tenga el sistema**
—no incluye ni descarga voces—.

- **Botón ▶ de la barra superior o `⌘⇧R`**: lee el título y todos los bloques
  visibles. Si hay texto seleccionado, lee **la selección**.
- **Resaltado sincronizado**: el párrafo que suena se marca en el documento y,
  opcionalmente, la vista se desplaza sola. También resalta el título.
- **Barra flotante de cristal esmerilado** con progreso, tiempo transcurrido y
  restante, palabras que faltan, fragmento actual, velocidad rápida y control de
  fragmento (anterior / repetir / siguiente / detener).
- **Tres posiciones**: flotante y arrastrable, o acoplada al lateral izquierdo o
  derecho en vertical. En vertical, anterior/siguiente/detener se quedan en una
  fila horizontal. La posición se guarda y también se mueve con las flechas
  cuando el asa tiene el foco.
- **`Espacio`** pausa o reanuda sin robarle la tecla al editor ni a los botones.
- Los bloques de código y los divisores no se leen, y lo que cuelga de un toggle
  cerrado tampoco.

Detalles de implementación que evitan los problemas clásicos de la API: la cola
se trocea **por frases de menos de 180 caracteres** (Chrome deja de emitir
`onend` en utterances largas), cada arranque invalida los callbacks viejos con un
token de generación, y hay un perro guardián que avanza si `onend` nunca llega.
La velocidad real (caracteres/segundo) se **calibra** con lo ya pronunciado, así
el tiempo restante no es una constante.

### Modo lectura
`⌘⇧E` o el icono de libro. Oculta el chrome de edición (botones de portada,
icono, handles) y aplica un **papel**: blanco, sepia, gris o negro. El tamaño del
texto es ajustable y hay una **barra fina de progreso** en el borde superior.

La **posición de lectura se guarda por página**: volvés a una nota de hace tres
días y retoma exactamente donde estabas. El pie de página muestra palabras y
minutos de lectura del documento.

### Mapa mental
`⌘⇧M` convierte la página en un mapa interactivo, sin librerías (SVG propio).

- Jerarquía desde los encabezados y las listas de la página.
- **Zoom** con rueda o botones, **paneo** arrastrando, **colapsar ramas** con
  click en el nodo, **encuadrar** y **expandir/colapsar todo**.
- **Búsqueda** con contador de coincidencias y salto a la siguiente (`Enter`).
- **Editor de contornos** lateral (ocultable) para reordenar el mapa sin tocar la
  página, y **modo foco**.
- **Exportación**: Markdown, SVG, PNG 2× y copiar contorno.

### Pomodoro compartido
`⌘⇧P` o el icono de reloj. Vive por encima del árbol de componentes, así que
cerrar el panel no lo detiene.

- Duraciones configurables de enfoque, descanso y descanso largo, con ciclo de N
  sesiones.
- Anillo de progreso, pausar, reiniciar, saltar fase.
- **Alarmas sintetizadas con WebAudio**: tres notas ascendentes al terminar el
  enfoque, dos descendentes al terminar el descanso. Sin archivos de audio.
- Histograma de los últimos 7 días y contador de hoy, persistido.

### Archivos
- **Importar** `.md` / `.markdown` / `.txt` desde el botón del sidebar o
  arrastrándolos sobre la barra lateral: se convierten en **bloques reales**
  (títulos, listas, tareas, citas, código, divisores), no en un `<pre>`.
- **Exportar** cualquier página a **Markdown** o a **HTML autónomo** desde el menú
  `⋯`, y **respaldo JSON** completo desde Configuración.

### Configuración
`⌘,` — seis pestañas: **Apariencia** (tema, ancho, papel), **Voz** (voz del
sistema, velocidad, tono, volumen, seguir la lectura, probar), **Lectura**
(tamaño, progreso, recordar posición), **Pomodoro**, **Pronunciación** (reglas
que cambian sólo lo que se pronuncia, nunca el documento) y **Datos** (métricas,
exportar/importar respaldo, restablecer).

---

## Atajos

| Atajo | Acción |
|---|---|
| `⌘K` | Buscar páginas / ejecutar comandos |
| `⌘\` | Mostrar u ocultar la barra lateral |
| `⌘⇧L` | Modo oscuro / claro |
| `⌘⇧R` | Leer la página en voz alta |
| `Espacio` | Pausar / reanudar la voz |
| `⌘⇧E` | Modo lectura (papel) |
| `⌘⇧M` | Mapa mental |
| `⌘⇧P` | Pomodoro |
| `⌘,` | Configuración |
| `?` | Ayuda de atajos |
| `/` | Menú de bloques |
| `⌘B` `⌘I` `⌘U` `⌘E` | Negrita · itálica · subrayado · código |
| `⌘⇧7` `⌘⇧8` `⌘⇧9` | Lista numerada · viñetas · tareas |
| `Tab` / `⇧Tab` | Indentar / desindentar |
| `Esc` | Cerrar menú o diálogo |

En Windows/Linux usá `Ctrl` donde dice `⌘`.

---

## Estructura

```
mi-app/
├── app/
│   ├── layout.tsx            metadata, fuentes del sistema, <html>
│   ├── page.tsx              monta <AppShell/>
│   └── globals.css           tokens (light/dark), papeles de lectura, cristal
├── components/
│   ├── AppShell.tsx          layout, tema, atajos globales, posición de lectura
│   ├── Sidebar.tsx           árbol, utilidades, importar Markdown (picker + drop)
│   ├── TopBar.tsx            breadcrumb + lectura/mapa/pomodoro + menú ⋯
│   ├── PageView.tsx          portada, icono, título, editor o base de datos
│   ├── Editor.tsx            bloques, caret, menú "/", drag & drop, markdown
│   ├── Database.tsx          tabla, board, lista, celdas tipadas, panel de fila
│   ├── CommandPalette.tsx    ⌘K (páginas + comandos, incluidos los nuevos)
│   ├── Settings.tsx          configuración en 6 pestañas
│   ├── Modals.tsx            compartir, atajos, papelera (+ `Shell` exportado)
│   ├── mindmap/MindMap.tsx   mapa mental: SVG, zoom, búsqueda, exportar
│   ├── pomodoro/Pomodoro.tsx provider + capa flotante + alarmas WebAudio
│   ├── tts/Speech.tsx        motor de voz (cola, token, perro guardián, calibración)
│   ├── tts/ReadingBar.tsx    barra flotante / acoplada
│   ├── tts/useReadAloud.ts   "leer página" o "leer selección"
│   ├── Icon.tsx              60 iconos SVG inline
│   └── ui.tsx                Popover, MenuItem, Pill, Avatar, Skeleton
├── lib/
│   ├── types.ts              modelo de datos + preferencias (voz, lectura, pomodoro)
│   ├── store.ts              Zustand + persist + todas las acciones + respaldos
│   ├── seed.ts               workspace de ejemplo (8 páginas, 2 bases de datos)
│   ├── speech.ts             texto→voz, troceado, reglas, métricas (puro)
│   ├── markdown.ts           Markdown ⇄ bloques, contornos, exportar HTML/MD
│   ├── mindmap.ts            árbol + layout tidy (puro)
│   └── utils.ts              árbol de páginas, fechas, paleta, descargas
├── scripts/capturas.mjs      17 capturas + verificación de runtime
└── docs/
    ├── capturas/             PNGs generados por ese script
    ├── OPENHUB.md            qué se integró del spec y qué no, con motivos
    └── EMPAQUETADO.md        guía para envolverlo en Tauri v2 (escritorio)
```

---

## Integración continua

`.github/workflows/ci.yml` compila en **cada push a `main` y en cada pull
request**: `npm ci` → `tsc --noEmit` → `next build`, y deja el `.next` como
artefacto descargable. Si algo se rompe, GitHub te lo marca en el commit antes de
que lo descubras en producción. No necesita ningún secreto ni variable de
entorno.

---

## Verificación automática

```bash
npm run capturas     # requiere: npx playwright install chromium
```

Recorre la app en Chromium headless, guarda **17 capturas** en `docs/capturas/` y
**sale con código 1 si hubo cualquier error de consola o de página**. Última
corrida: `✔ sin errores de consola ni de página`.

Como el contenedor de CI no tiene voces instaladas, el script inyecta un
`speechSynthesis` de prueba que emite `onstart`/`onboundary`/`onend` con
temporizadores. No reproduce audio: sirve para ejercitar la máquina de estados
del motor (cola, progreso, resaltado, avance entre fragmentos) y poder capturar
la barra. En una máquina con voces reales el motor usa las del sistema.

---

## Llevarlo a GitHub con GitHub Desktop

Guía completa con los tres caminos y diagnóstico de fallos: **[docs/GITHUB.md](./docs/GITHUB.md)**.

1. GitHub Desktop → **File → Add Local Repository…** → elegí la carpeta `nook`.
2. Como todavía no es un repo, te va a ofrecer **"create a repository"** →
   aceptá. (El `.gitignore` ya excluye `node_modules`, `.next`, etc.)
3. Poné un nombre (`nook`), dejá la ruta, **Create Repository**.
4. **Commit to main** con el mensaje que quieras → **Publish repository**.
5. Si lo vas a desplegar: importá el repo en Vercel/Netlify. Es un proyecto Next
   estándar — build `npm run build`, output `.next`, sin variables de entorno.

Para empaquetarlo como aplicación de escritorio (Tauri v2), seguí
**[docs/EMPAQUETADO.md](./docs/EMPAQUETADO.md)**.

> Si arrancás desde el `.zip`: descomprimí, abrí la carpeta `nook` en GitHub
> Desktop y seguí los pasos de arriba. El zip **no** incluye `node_modules`, ni
> `.next`, ni `.git`: `npm install` los regenera y el repo lo crea GitHub
> Desktop.

---

## Privacidad

Todo vive en el `localStorage` de tu navegador. **No es almacenamiento
cifrado**: quien tenga acceso al perfil del sistema puede inspeccionarlo. No hay
cuenta, backend, analítica ni envío de documentos a terceros.

---

## Pendientes (roadmap)

Ordenados por impacto, no por dificultad:

1. **Deshacer/rehacer global** (⌘Z) con historial de snapshots del store.
2. **Selección múltiple de bloques** (Shift+click / arrastre) y acciones en lote.
3. **Drag & drop de páginas** en el sidebar (mover ya funciona por código).
4. **Cuerpo de la fila**: que cada fila de la base de datos sea una página con
   bloques propios (hoy el peek muestra sólo propiedades).
5. **Bloques de imagen, video y archivo** con upload a `IndexedDB`.
6. **PDF y Office en el visor** (`pdfjs-dist` + `mammoth`/SheetJS): requiere
   guardar binarios fuera de `localStorage`, por eso quedó fuera de esta fase —
   ver el razonamiento en [docs/OPENHUB.md](./docs/OPENHUB.md).
7. **Búsqueda con ranking** (hoy es `includes`) y resultados por contenido.
8. **Backend**: el camino corto es Supabase (Postgres + Realtime) reemplazando
   `lib/store.ts`; el modelo ya está serializado en JSON, así que migra sin
   fricción.

---

## Nota legal

Proyecto educativo de replicación de **patrones de interfaz**. No incluye
código, assets, logos, nombres de marca ni tipografías de Notion, ni código de
OpenHub, y no está afiliado a Notion Labs ni a SrMaxi. Todos los nombres de
producto del seed son ficticios. Si lo publicás, evitá presentarlo como el
producto original o usar su marca: eso sí trae problemas.
