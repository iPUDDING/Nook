# Changelog

Todas las versiones notables del proyecto. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y
[versionado semántico](https://semver.org/lang/es/).

## [0.14.2] — 2026-11-27

Los tres bloqueos que quedaban en GitHub Actions, arreglados donde estaban: dos
eran del código de build y uno de configuración del repo. Sin funciones nuevas.

### Corregido

- **Windows no podía arrancar el build** (`Error: spawnSync npx.cmd EINVAL`).
  `scripts/export-static.mjs` llamaba a `npx` con `shell: false`; en Windows `npx`
  es un archivo por lotes y `spawnSync` no puede ejecutarlo así. Ahora se llama al
  CLI de Next con `node` directamente (`node node_modules/next/dist/bin/next build`),
  que funciona igual en Windows, macOS, Linux y en Actions. Ese fallo tumbaba el
  workflow `desktop`, o sea el `.exe`.
- **Las capturas de las suites escribían en `/home/user/…`**. En el runner ese
  directorio no existe: Playwright lanzaba `ENOENT` y la excepción cortaba la
  suite **antes** del resumen, así que el job quedaba en rojo sin decir qué
  verificaciones habían pasado. Nuevo `scripts/_captura.mjs`: guarda en
  `test-results/` (relativo al repo, se crea si falta), avisa si no puede y la
  suite sigue. Una captura ya no puede decidir si una prueba pasa.
- **`pages` fallaba con `Get Pages site failed / Not Found`** cuando el sitio de
  Pages nunca se habilitó. `actions/configure-pages@v5` ahora corre con
  `enablement: true` y lo crea por API.

### Cambiado

- El job `e2e` del CI **ya no se detiene en la primera suite que falla**: las corre
  todas y al final informa «suites corridas / con problemas». Antes, con `set -e`,
  cada push descubría un problema nuevo en lugar de todos.
- `scripts/diagnostico.mjs` invoca `tsc` y `next` con `node` en vez de `npx`, por el
  mismo motivo que el punto anterior.

### Verificación

`tsc` limpio, build de producción, export estático, las **265 verificaciones de
las veintidós suites** corridas con el mismo bucle que usa el CI, y el `.exe`
recompilado. Todo en verde.

## [0.14.1] — 2026-11-27

Arreglo de compilación: **el zip no se podía instalar en una máquina limpia**.
Sin funciones nuevas.

### Corregido

- **`package-lock.json` apuntaba a `autoprefixer@10.9.0`, una versión que no
  existe en npm** (la última es la 10.7.0). En la máquina donde se generó el
  lockfile funcionaba porque el tarball estaba en caché; en GitHub Actions, que
  instala en frío, `npm ci` moría con `404 Not Found` y tumbaba los tres
  workflows (`build`, `desktop` y `pages`) antes de compilar nada.
- **`desktop/package-lock.json` tenía cuatro versiones fantasma `0.4.3`**
  (`asynckit`, `json-schema-traverse`, `pe-library`, `@malept/flatpak-bundler`).
  Se regeneró contra el registro real: 0.4.0, 0.4.1, 0.4.1 y 0.4.0.
- Los dos lockfiles se regeneraron desde cero con `npm install --package-lock-only`,
  así que fijan versiones que existen.

### Añadido

- **`scripts/verificar-lockfile.mjs`**: pide con `HEAD` las 535 URLs de tarball
  de los dos lockfiles y falla si alguna no devuelve 200. Enganchado como primer
  paso de `ci.yml` y de `desktop.yml`, antes de instalar: si vuelve a entrar una
  versión inexistente, el error dice qué paquete y qué versión, no «npm ci falló».
- **`scripts/diagnostico.mjs`**: junta sistema, versión de Node y npm, presencia de
  `node_modules` y el log de `tsc` y del build en `diagnostico.txt`, para poder
  reportar un fallo de compilación ajeno con datos en vez de con «no compila».

### Verificación

`npm ci` en frío (caché vacía) en la raíz y en `desktop/`, `tsc` limpio, build de
producción, export estático, las **265 verificaciones de las veintidós suites** y
el `.exe` compilado de nuevo. Todo en verde.

## [0.14.0] — 2026-11-27

Lo que los usuarios le piden a la app de referencia, cuarta tanda:
**recurrencia de verdad, búsqueda dentro del contenido y columnas por vista**.
**265 comprobaciones** en veintidós suites. La investigación de esta ronda está al
final de [`docs/INVESTIGACION-QUEJAS.md`](./docs/INVESTIGACION-QUEJAS.md).

### Añadido

- **Tareas que se repiten**: cualquier fila de una base puede repetirse cada día,
  cada semana, cada mes o cada año desde el panel de la fila.
  - El **calendario dibuja las apariciones futuras** antes de que lleguen, como
    chips punteados; al tocarlas se abre la misma fila.
  - *Completar y pasar a la próxima* mueve la fila a la fecha siguiente en vez de
    duplicarla: una tarea, un historial.
  - Las apariciones se calculan **desde la fecha original por índice**, así que
    una mensual del 31 cae el 28 de febrero y **vuelve al 31** en marzo.
  - Tope de 500 apariciones por fila y saneo de respaldos con datos raros: no hay
    forma de colgar la app con una repetición mal escrita.
- **Búsqueda global de contenido** (⌘K): además de los títulos, busca dentro de
  los bloques y de los valores de las bases.
  - Cada resultado trae un **extracto** con la coincidencia.
  - Conmutador de **alcance**: todo el workspace, o sólo la página abierta y sus
    hijas.
  - Al abrir un resultado **salta al bloque y lo marca**.
  - Ignora tildes y mayúsculas; no busca con menos de dos letras.
- **Propiedades y anchos por vista**: cada vista guarda qué propiedades se ven y
  cuánto mide cada columna.
  - Botón *Propiedades* en la barra de la base para ocultar y mostrar columnas;
    el título no se puede ocultar.
  - Columnas **redimensionables** arrastrando el borde del encabezado, con tope
    de 80 a 560 px.
  - *Restablecer anchos* devuelve la tabla a como venía.
  - Todo viaja con la vista: pasar a calendario y volver no pierde nada.

### Verificación

Suites nuevas: `verificar-repeticion` (9), `verificar-propiedades` (9) y
`verificar-busqueda-global` (9). Total: **265 verificaciones en veintidós
suites**, más la suite de escritorio.

## [0.13.0] — 2026-11-27

Zoom sobre el contenido. **229 comprobaciones** en diecinueve suites.

### Añadido

- **Zoom con la rueda del ratón**: Ctrl/⌘ + rueda sobre la página agranda o
  achica el contenido en pasos de 10 % entre **50 % y 200 %**. Sin el modificador
  la rueda sigue desplazando, como siempre.
  - El listener es nativo y **no pasivo**: con `onWheel` de React (pasivo) no se
    puede frenar el zoom propio del navegador, que agranda toda la interfaz
    incluidos los menús.
  - Un freno de 90 ms entre pasos evita que un trackpad, que manda decenas de
    eventos por gesto, salte de 50 a 200 % de un pellizco.
- **Atajos** ⌘+ / ⌘− / ⌘0 y entradas *Acercar / Alejar / Tamaño normal* en el
  menú ••• de la barra superior.
- **Indicador del porcentaje** en la barra superior (sólo cuando no es 100 %) y un
  aviso flotante que aparece al cambiarlo y se apaga solo.
- **El zoom se recuerda**: se guarda con el resto de las preferencias y sobrevive
  a la recarga. Se aplica **sólo al cuerpo de la página**: la barra lateral y la
  superior no se agrandan.
- **Zoom en el visor de imágenes** (25–400 %), con botones y Ctrl+rueda: el PDF y
  el vídeo ya traen su propio zoom en los controles del sistema.

### Verificación

Suite nueva: `verificar-zoom` (13 verificaciones). Total: **229 verificaciones en
diecinueve suites**.

## [0.12.0] — 2026-11-27

Lo que los usuarios le piden a la app de referencia, hecho. **216 comprobaciones**
en dieciocho suites. La investigación está en
[`docs/INVESTIGACION-QUEJAS.md`](./docs/INVESTIGACION-QUEJAS.md).

### Añadido

- **Buscar y reemplazar dentro de la página** (⌘F / Ctrl+F). La queja de fondo:
  en la app de referencia sólo existe el buscar del navegador, que no reemplaza
  nada, y hay que ir coincidencia por coincidencia a mano.
  - Busca sobre los **nodos de texto**, no sobre el HTML: encuentra `casa` dentro
    de `<strong>casa</strong>` y no confunde la `m` de `<em>`.
  - Recorre las coincidencias con Enter / Shift+Enter y las **selecciona en el
    documento**, además de pintarlas: todas en color de acento y la activa en
    amarillo, con la API de resaltados del navegador (no escribe `<mark>` en los
    bloques).
  - Reemplaza de a una o todas. El reemplazo se escribe como texto: pegar `<b>`
    no inyecta etiquetas.
- **Bloquear página** con **⌘⇧B**, desde el menú ••• de la fila o desde el aviso
  de la propia página. El contenido queda inerte (ni teclado, ni clic, ni foco),
  el título no acepta cambios y el árbol muestra un candado. Es una de las
  peticiones más viejas sin respuesta: la app de referencia nunca le puso atajo.
- **Copias de seguridad automáticas**: una foto del workspace al abrir la app y
  cada cinco minutos si hubo cambios, sin repetir copias idénticas. Se guardan
  las últimas cinco, se restauran o se borran desde *Configuración → Datos* y
  viven en su propia clave de almacenamiento: si el espacio se llena se pierden
  copias, nunca notas. No se llevan el contenido binario de los adjuntos.

### Verificación

Suites nuevas: `verificar-busqueda` (11), `verificar-bloqueo` (10) y
`verificar-copias` (8). Total: **216 verificaciones en dieciocho suites**.

## [0.11.0] — 2026-11-27

Organizar con el mouse y vistas con memoria propia. **187 comprobaciones** en
quince suites.

### Añadido

- **Arrastrar páginas en el árbol**, como la app de referencia:
  - soltar en el **centro** de otra fila anida la página dentro de ella;
  - soltar **arriba o abajo** la reordena entre hermanos, con una línea azul que
    marca dónde va a caer;
  - soltar sobre la **cabecera del workspace** la devuelve a la raíz;
  - soltar sobre el encabezado de una sección la pasa a **Privado** o **Equipo**.
  - `movePageTo(id, parentId, index, space)` mueve y **renumera** el orden de los
    hermanos: sin eso dos páginas podían quedar con el mismo `order` y el árbol
    se ordenaba de forma impredecible.
  - El indicador de destino se pinta con atributos y CSS, no con estado de React:
    durante un arrastre nativo el navegador no entrega los eventos al ritmo del
    render y el resaltado llegaba tarde o no llegaba.
  - Todo el arrastre interno pasa por **un único listener nativo** sobre la
    barra: con handlers por fila, los `dragover` de la fila destino no se
    despachaban y el indicador no aparecía nunca.
- **Configuración por vista**: cada una de las seis pestañas guarda su propio
  filtro, orden y agrupación. Filtrar la tabla ya no cambia el board; al volver
  a una vista se recupera lo que tenía. El buscador de la vista sigue siendo
  efímero y no toca esa configuración.

### Corregido

- `scripts/bump-version.mjs`: la versión se sube sólo en `package.json`,
  `desktop/package.json` y las entradas de la raíz de los lockfiles, y el script
  falla si alguna dependencia queda con la versión de la app.

### Verificación

Suites nuevas: `verificar-arrastrar-paginas` (11) y `verificar-vistas-config`
(10). Total: **187 verificaciones en quince suites**.

## [0.10.0] — 2026-11-27

Arrastrar archivos en el árbol lateral. **166 comprobaciones** en trece suites.

### Añadido

- **Arrastrar y soltar archivos en el árbol**: la fila de un archivo se puede
  agarrar con el mouse y soltar sobre cualquier página o carpeta, que la recibe
  y se despliega para mostrarla dentro. Mientras el archivo pasa por encima, la
  fila de destino se resalta.
  - Se usa un **tipo de arrastre propio** (`application/x-nook-file`, con
    `text/plain` de respaldo para Firefox) en lugar de arrastrar texto: así el
    gesto interno no se confunde con soltar archivos del sistema, que la barra
    lateral importa como páginas nuevas.
  - Soltar sobre la **cabecera del workspace** devuelve el archivo a la raíz.
- **Sección Archivos** al final del árbol, con los archivos que no están dentro
  de ninguna carpeta. Antes no se veían en ningún lado: sacar un archivo de su
  carpeta lo hacía desaparecer de la interfaz hasta el próximo respaldo.

### Corregido

- **Lockfiles**: los incrementos de versión anteriores reemplazaban el número de
  versión **en todo el archivo**, así que `desktop/package-lock.json` había
  quedado con `@malept/flatpak-bundler` declarado como `0.9.0` cuando su tarball
  es `0.4.3`. Se restauró el valor real y ahora sólo se tocan las dos entradas de
  la raíz.

### Verificación

Suite nueva `verificar-arrastrar` (11 verificaciones): arrastre declarado, realce
del destino, soltar en carpeta, soltar en página normal, soltar en la cabecera
para volver a la raíz, sección de archivos sueltos, que el arrastre interno no
importe páginas, persistencia tras recargar y consola limpia. Total:
**166 verificaciones en trece suites**.

## [0.9.0] — 2026-11-27

Cierre de la brecha con la app de referencia: selector de icono con pestañas,
**Mover a…** en el árbol y la sexta vista, **calendario**. **155 comprobaciones**
en doce suites.

### Añadido

- **Selector de icono con pestañas** (`components/IconPicker.tsx`,
  `components/PageIcon.tsx`), como el de Notion:
  - **Emojis**, con buscador y aviso cuando nada coincide.
  - **Iconos**: 34 iconos lineales × 10 colores; el color elegido queda dentro
    del valor guardado (`line:book:#337ea9`).
  - **Personalizado**: subir una imagen o pegar una URL. La imagen se recorta al
    centro y se reduce a **160×160** en el navegador antes de guardarse, porque
    el icono vive en `localStorage`; una foto de 3 MB dejaría el workspace sin
    espacio. Se rechazan los archivos que no son imagen y las URL inválidas.
  - **Aleatorio** y **Quitar** en el pie.
  - `Page.icon` sigue siendo un solo campo de texto, así que el respaldo, la
    búsqueda y el árbol funcionan sin migrar nada. El icono se dibuja igual en
    cabecera, árbol, carpetas, migas y papelera.
- **Mover a…** en el menú ••• de cada página del árbol, con buscador de destinos
  y sangría por nivel. Los destinos excluyen la propia página y todo su
  subárbol, porque mover una página dentro de su hijo la deja fuera de la raíz.
- **Vista calendario** (sexta vista): rejilla mensual de seis semanas con la
  semana empezando el lunes, hoy marcado en rojo, días de los meses vecinos
  atenuados, navegación ‹ Hoy › con mes y año, cada entrada en la celda de su
  fecha, el **+** de cada día creando la entrada con esa fecha ya puesta y una
  lista aparte para las entradas sin fecha. Si falta la propiedad de tipo fecha,
  la vista lo avisa en vez de quedar vacía.

### Verificación

Tres suites nuevas — `verificar-iconos` (22), `verificar-mover` (11) y
`verificar-calendario` (18) — sumadas al CI. Total: **155 verificaciones en doce
suites**, consola limpia y `.exe` verificado dentro de Electron.

## [0.8.0] — 2026-11-27

Vistas de base de datos al estilo Notion: **galería** y **cronología**.
**104 comprobaciones** en nueve suites.

### Añadido

- **Vista galería**: una tarjeta por fila, con portada degradada derivada del
  `id` (Nook todavía no tiene portada por fila), inicial como marca, pills de
  *select*/*status*, avatares de personas, fecha compacta y una tarjeta final
  punteada **Nueva entrada**. Al pulsar una tarjeta se abre el panel lateral de
  la fila, igual que en la tabla.
- **Vista cronología**: eje de meses (`nov 26`, `dic 26`…) con la **línea de
  hoy** marcada, un hito por fila sobre su fecha, sección **Sin fecha · N** para
  las entradas sin fecha y un aviso claro cuando la base no tiene ninguna
  propiedad de tipo fecha. El rango del eje se calcula solo entre la fecha más
  vieja, la más nueva y hoy.
  - Nook guarda **una fecha** por fila, no un rango: por eso se dibujan hitos y
    no barras de Gantt. Cuando la propiedad tenga rango, la vista pasa a barras
    sin tocar el resto.
- **Fechas legibles**: `18 nov 2026` en tarjetas e hitos, en lugar del ISO crudo.
- Suite `scripts/verificar-vistas.mjs` (**20 verificaciones**): barra de las cinco
  vistas y vista activa marcada, tarjeta por fila, peek desde la tarjeta y cierre
  con Escape, aviso de cronología sin fecha, hitos y cabecera de meses, línea de
  hoy, agrupación de las entradas sin fecha, formato legible, persistencia de la
  vista tras recargar, filtro y buscador recortando filas, consola limpia.

### Notas

- Se descartan por ahora **calendario** (necesita rango de fechas y una rejilla
  mensual completa) y **cronograma con dependencias** (necesita relaciones entre
  filas): sin esos datos serían maquetas que no funcionan, y el criterio del
  proyecto es no mostrar lo que no hace.

## [0.7.0] — 2026-11-27

Carpetas con páginas y archivos adjuntos. **84 comprobaciones** en ocho suites.

### Añadido

- **Carpetas** (`Page.isFolder`): una carpeta es una página sin cuerpo que
  agrupa páginas hijas y archivos. Se modela como página —y no como una entidad
  aparte— porque el árbol, el arrastre, la papelera, el historial y el respaldo
  ya funcionan con páginas; inventar un segundo tipo de nodo obligaba a
  duplicar todo eso.
  - Se crean desde la paleta (⌘K → *Nueva carpeta*), desde el botón junto a
    **PRIVADO** / **EQUIPO**, desde el menú de cualquier página (*Agregar
    subcarpeta*) y desde la propia carpeta (*Subcarpeta*).
  - Al crearlas —y al entrar en ellas— quedan desplegadas: sus archivos se ven
    en el árbol sin tener que abrir la carpeta dos veces.
- **Archivos adjuntos** (`lib/files.ts`): metadatos en el workspace, contenido
  binario en **IndexedDB**. Un PDF de 3 MB no entra en la cuota de
  `localStorage` y meterlo ahí dejaría al usuario sin poder guardar ni una nota.
  - Subida por botón o **arrastrando y soltando** archivos sobre la carpeta.
  - **Visor** para imágenes, PDF, audio, vídeo y texto (los tipos que el
    navegador no dibuja se ofrecen para descargar). Las miniaturas de imagen usan
    `blob:` URL **revocadas al desmontar**: sin eso, abrir y cerrar cincuenta
    fotos retenía cincuenta blobs en memoria.
  - Renombrar, mover a otra carpeta, descargar y eliminar; Escape cierra el visor.
  - Los archivos de una carpeta se listan también dentro del árbol lateral.
- **Topes por plan**, los mismos ejes que Notion: **5 MB por archivo** y 512 MB
  totales en Gratis; **5 GB por archivo** y sin tope total desde Pro. El mensaje
  dice qué tope se pasó, antes de tocar el disco.
- **Respaldo con adjuntos**: las fichas viajan siempre; el contenido entra en
  base64 hasta **10 MB** por respaldo (los más chicos primero) y los que quedan
  afuera se **nombran en el aviso**, para no dar por respaldado lo que no lo está.
- Configuración → Datos: cuántos adjuntos hay y cuánto ocupan, y dónde viven.

### Corregido en el camino

- **`addFile(null)`, `renameFile(id, null)` y `removeBlob(invalid)`** lanzaban y
  tumbaban la app entera (la batería de basura de `verificar-seguridad` los
  encontró). Ahora validan y devuelven mensaje.
- **Título no textual** en una página o carpeta rompía la lectura en voz alta y
  las exportaciones, que hacen `title.trim()`. `createPage`, `createFolder` y
  `updatePage` lo normalizan.
- **`moveFile` a una carpeta inexistente** dejaba el archivo sin lugar donde
  aparecer: se ignora el destino.
- **Escape no cerraba el visor** de archivos (estado local, fuera del alcance de
  `AppShell`): el mismo tipo de bug que ya se había corregido en los modales.
- Vaciar la papelera y reiniciar el workspace ahora **borran también los blobs**
  de los archivos que se van, no sólo sus fichas.

### Verificación

- Suite nueva `verificar-carpetas.mjs` (**11**): crear carpeta, subir (ficha +
  blob en IndexedDB), listado en el árbol, visor y Escape, renombrar, mover,
  tope de 5 MB sin suscripción, persistencia tras recarga, papelera con blobs,
  respaldo y restauración con contenido, consola limpia.
- `verificar-desktop.mjs` ahora sube un archivo dentro del `.exe` y comprueba que
  IndexedDB funciona con el protocolo propio: era el punto de riesgo real al
  empaquetar.

## [0.6.0] — 2026-11-27

Ronda de auditoría sobre 0.5.0: siete fallos corregidos, una mejora de
rendimiento medida y la exportación completa del workspace. **73 comprobaciones**
en siete suites.

### Corregido

- **Seguridad — historial de versiones sin sanear.** `nook-versions-v1` es otra
  clave de `localStorage`, editable a mano y viajable por chat igual que un
  respaldo. Restaurar una versión inyectaba su HTML tal cual en el documento
  (`<img onerror>` se ejecutaba). Ahora se sanea al cargar con `sanitizeBlocks`.
- **`setUI(null)` tumbaba la app.** El estado del store quedaba en `null` y React
  moría sin mensaje útil. Las acciones públicas ignoran lo que no sea objeto.
- **`selectPage` con un id inexistente** dejaba el área de la página en blanco y
  el siguiente render leía propiedades de `undefined`.
- **`PLANS[plan.tier]` sin red**: un tier desconocido (respaldo ajeno, versión
  futura) lanzaba al leer `.name` y se llevaba la interfaz. Nuevo `planInfo()`
  que cae en Gratis, y `setPlanTier` valida con `isPlanTier`.
- **`activateLicense`, `inviteMember` y `addRule` lanzaban** con `null` u objetos
  en lugar de texto.
- **Historial huérfano**: vaciar la papelera, reiniciar el workspace y restaurar
  un respaldo dejaban versiones de páginas inexistentes ocupando presupuesto.
- **Punteros muertos tras vaciar la papelera**: quedaban claves en `expanded` y
  en las posiciones de lectura apuntando a páginas borradas.
- **La retención no se aplicaba al cambiar de plan**: bajar de Business a Gratis
  seguía mostrando versiones de hace tres meses.

### Rendimiento

- **Escrituras agrupadas en `localStorage`.** `persist` reescribía el workspace
  completo en cada cambio de estado. Medido con 279 KB y 70 páginas: teclear 20
  letras producía **40 escrituras (11 MB serializados, 126 ms de hilo
  principal)**; ahora es **1 escritura y 4 ms**, con vaciado al cerrar, recargar
  o pasar la pestaña a segundo plano.

### Añadido

- **Exportación completa del workspace** (`workspaceToHtml`): un solo `.html`
  autocontenido con índice jerárquico, todas las páginas y el mismo render que la
  exportación individual; se imprime a PDF desde el navegador. Capacidad
  `exportAll` en la tabla de planes (Business) y botón en Configuración → Datos.
- Configuración → Plan muestra también la fila de **historial de versiones**.
- El botón "Guardar versión ahora" avisa si guardó o si ya había una igual.

### Verificación

- `verificar-030`: 15 (nuevas: escrituras agrupadas, punteros huérfanos).
- `verificar-040`: 12 (nueva: exportación completa con descarga real).
- `verificar-seguridad`: 13 (nuevas: historial manipulado, `setUI` con basura,
  página inexistente, plan desconocido, 52 acciones × 12 valores basura).
- `verificar-historial`: 12 (nuevas: retención al cambiar de plan, papelera,
  reinicio, respaldo, avisos del botón).

## [0.5.0] — 2026-11-26

Historial de versiones por página, con la retención de cada plan de Notion.
**60 comprobaciones** en siete suites.

### Añadido

- **Historial de versiones por página** (`lib/versions.ts`, `components/HistoryModal.tsx`).
  Se guarda una foto del documento 4 s después de cada cambio, sin duplicados:
  si el contenido no cambió desde la última versión, no se crea otra.
- **Retención por plan**, tal como la escala Notion: Gratis **7 días**, Pro
  **30**, Business **90**, Enterprise **sin límite**
  (`historyLimit()` en `lib/plan.ts`; antes Pro y Business eran ilimitados).
- **Restaurar es reversible**: antes de pisar el documento se guarda cómo
  estaba, así que un clic equivocado se deshace con otro clic.
- Ventana de historial (menú «⋯» y paleta ⌘K → *Ver historial de versiones*):
  hora relativa, vista previa del texto, cantidad de bloques, restaurar y
  borrar por versión.
- Configuración → Datos: cuántas versiones hay y cuánto ocupan, retención
  vigente y botón para borrar el historial.

### Decisiones de implementación

- El historial vive en **su propia clave** (`nook-versions-v1`), fuera del
  workspace. Perder el historial es molesto; perder la nota no: si el
  almacenamiento se llena, se descarta historial y la app sigue guardando.
- Presupuesto propio (~1,4 MB) y tope de **30 versiones por página**; la poda
  por antigüedad, cantidad y tamaño corre en cada captura.
- Toda escritura va en `try/catch`: con la cuota llena la app no se rompe ni
  pierde el documento (verificado en la suite).

### Alcance honesto frente a Notion

Nook es local, sin servidor ni cuentas. De la tabla de planes de Notion se
puede implementar de verdad: historial de versiones, invitados y sus topes,
espacios privados, gráficos, automatizaciones, analítica, auditoría y
exportación masiva. **No** se puede: SSO SAML, SCIM, DLP/SIEM ni la IA incluida
—requieren identidad y servidores externos—. No se simulan con maquetas; ver
`docs/SUSCRIPCION.md`.

### Verificación

Suite nueva `scripts/verificar-historial.mjs` (7 comprobaciones): editar crea
versión, sin cambios no duplica, restaurar reversible, retención 30/7/sin
límite, cuota llena sin romper, ventana del historial de punta a punta y
consola limpia. Las seis suites anteriores siguen en verde.

## [0.4.3] — 2026-11-26

Lectura en voz alta: seguimiento real del subrayado y arranque desde cualquier
párrafo. Más pantalla completa con F11. **53 comprobaciones** en seis suites.

### Corregido

- **El subrayado no seguía la lectura.** El CSS pintaba bien; el problema era
  que el avance dependía sólo de los eventos del motor de voz y muchas voces del
  sistema no emiten `onboundary` ni `onend` (las SAPI de Windows dentro de
  Electron). Ahora el progreso se estima con la velocidad de lectura calibrada y
  cada evento real, si llega, lo corrige.
- **Resaltado en dos capas**: la frase actual en tono suave y **lo ya
  pronunciado** más marcado, así se ve el avance palabra por palabra.

### Añadido

- **Clic derecho sobre un párrafo → “Empezar a leer desde aquí”**: la lectura
  arranca en la frase que está bajo el puntero. Incluye “Leer este bloque”.
- **`F11`**: pantalla completa (entra y sale). Funciona igual en el navegador y
  en el `.exe`, porque usa la Fullscreen API; `Esc` también sale. Documentado en
  la ayuda de atajos y en ⌘K.

### Verificación

- Nueva suite `verificar-lectura.mjs` (7 comprobaciones) con una voz simulada que
  **no** emite `boundary`: comprueba que el subrayado avanza (4 → 44
  caracteres), las dos capas, “leer desde aquí”, F11 y la limpieza al detener.

## [0.4.2] — 2026-11-26

Segunda ronda de auditoría (iteraciones 13–19). Siete correcciones más, con
**46 comprobaciones** automatizadas en cinco suites.

### Seguridad y robustez de datos

- **`parentId` cíclico**: un respaldo corrupto con dos páginas que se apuntan
  como padre entre sí desbordaba la pila en `descendantsOf` y colgaba la app al
  vaciar la papelera. Ahora la recorrida lleva registro de visitados.
- **HTML exportado**: los bloques de lista se emitían como `<li>` sueltos, sin
  `<ul>`/`<ol>` alrededor — HTML inválido, listas sin viñeta al abrir o imprimir
  el archivo. Se agrupan por tipo y se conserva la sangría.

### Corregido

- **Mapa mental plano**: el contorno ignoraba `block.indent`, así que la
  jerarquía sólo aparecía con encabezados. Ahora la sangría del bloque se refleja
  en el mapa (mismo tope de 4 niveles que el editor).
- **Escape no cerraba dos overlays**: *Pegar Markdown* y el panel de
  **Pomodoro**. Eran los únicos que ignoraban la tecla.

### Verificación

- Nueva suite `verificar-modales.mjs`: cada modal y el panel de Pomodoro se
  abren, se miden y se cierran (11 comprobaciones).
- Cobertura del **arrastre de bloques** (`ABC → CAB`) y del **mapa mental** con
  sangrías. Total: 46 comprobaciones, todas en CI.

## [0.4.1] — 2026-11-26

Ronda de auditoría sobre 0.4.0: seguridad del HTML, integridad de datos y
accesibilidad. Ocho correcciones, cada una con su verificación automatizada
(**31 comprobaciones** en total, ahora también en CI).

### Seguridad

- **XSS almacenado**: el editor guardaba el `innerHTML` del bloque tal cual. Un
  pegado con formato desde otra app o un respaldo `.json` de terceros podía
  dejar `<img onerror>` / `<script>` dentro de la nota, que se ejecutaba al
  reabrirla (en el `.exe` no hay CSP: permitía exfiltrar las notas).
  - `lib/sanitize.ts`: saneador por **lista blanca** (etiquetas, atributos,
    `href` sólo `http/https/mailto/#`, `style` reducido a `color`), con
    desenvuelto de lo desconocido e idempotente.
  - Se aplica al escribir, al pegar, en las celdas de tabla y al restaurar un
    respaldo.
- **Datos ya guardados**: `persist` sube a `version: 3` con `migrate`, que sanea
  el workspace existente una sola vez al cargar (un documento envenenado de una
  versión anterior dejaba de ejecutarse al abrirlo).

### Corregido

- **El respaldo no incluía los miembros**: exportar y restaurar borraba el
  equipo en silencio. Ahora viaja en el archivo (`version: 3`) y un respaldo
  viejo conserva los miembros actuales en vez de vaciarlos. La suscripción no
  viaja a propósito: la licencia es de este equipo.
- **Pegar Markdown en una celda de tabla** insertaba los bloques después de la
  tabla, lejos del caret. Ahora la celda recibe el pegado normal.
- **Tab atrapaba el foco**: el editor hacía `preventDefault()` incluso en el
  primer bloque, donde no hay nada que sangrar (WCAG 2.1.2). Ahora sangra sólo
  cuando corresponde y, si no, deja pasar el foco.
- **Restaurar una subpágina** cuyo padre seguía en la papelera la dejaba
  restaurada pero invisible; se reviven y despliegan los ancestros.
- **En pantallas angostas** la barra lateral fija dejaba el editor en 84 px (a
  390 px de viewport). Arranca cerrada por debajo de 768 px: 324 px de editor.
- **El motor de voz** no cancelaba su perro guardián al desmontarse: podía
  reanudar la lectura sin interfaz.
- **La búsqueda de la paleta** no ignoraba acentos: escribir `configuracion`
  devolvía cero resultados.

### Infraestructura

- Las suites de verificación (`030`, `040`, `seguridad`, `móvil`) corren en cada
  push en el job `e2e` de GitHub Actions.

## [0.4.0] — 2026-11-26

### Añadido

- **Suscripción activa de fábrica**: la app se entrega en el plan `Business` con
  todas las capacidades habilitadas y sin topes. Se ve y se administra en
  *Configuración → Plan*.
- `lib/plan.ts`: catálogo de planes (`free`, `pro`, `business`, `enterprise`),
  8 capacidades con su mínimo de plan, `hasFeature`, `seatLimit` e
  `historyLimit`.
- **Activación por licencia offline** (`NOOK-XXXX-XXXX-XXXX`, alfabeto sin
  `0/O/1/I` y checksum). `activateLicense`, `deactivatePlan` y `setPlanTier` en
  el store; la licencia queda persistida.
- Pestaña **Plan** en Configuración: plan actual, asientos, historial, lista de
  capacidades con su estado, activación y cancelación.
- Entradas en el menú del workspace (*Suscripción · Business*) y en ⌘K
  (*Plan y suscripción*).
- `docs/SUSCRIPCION.md`: qué es esta capa, qué no es, y el camino completo si
  algún día hay cobro real.
- `window.__nookStore`: hook de depuración que usan las pruebas automatizadas.
- `scripts/verificar-040.mjs`: 8 verificaciones de la suscripción.

### Cambiado

- El historial de Pomodoro deja de recortarse a 60 días fijos: ahora depende del
  plan (ilimitado con suscripción, 7 días sin ella).
- El gating de miembros y de historial vive en el store y consulta el plan, en
  lugar de estar repartido en la UI.

### Notas

- **No hay cobro**: sin backend no se puede procesar un pago. La validación es
  local y el binario es auditable (MIT). Ver `docs/SUSCRIPCION.md`.

## [0.3.0] — 2026-11-26

### Añadido

- **Miembros sin límite.** El workspace mantiene una lista abierta de miembros
  (persistida): invitar, cambiar de rol (`Propietario`, `Administrador`,
  `Puede editar`, `Puede comentar`, `Puede ver`) y quitar. Se fue el tope
  decorativo de "5 miembros" y el recorte a tres personas en el panel.
- **Bloque de tabla** (`/tabla`): celdas editables, `Enter` baja de celda, `Tab`
  navega, botones para agregar/quitar filas y columnas, alineación por columna.
- **Pegar Markdown dentro de la app**: ⌘V en el editor detecta Markdown (títulos,
  listas, citas, tablas, código) y lo convierte en bloques reales; además hay un
  panel *Pegar Markdown* para revisar el texto antes, insertarlo acá o crear una
  página nueva con él.
- **Resaltado de la lectura**: bloque activo con barra lateral pulsante, **frase
  exacta** resaltada (CSS Custom Highlight API, sin tocar el `contentEditable`),
  desplazamiento automático sólo cuando la frase sale de pantalla, y la frase
  actual a la vista en la barra flotante.

### Corregido

- **Tablas de Markdown importadas**: se leían como párrafos llenos de `|` y
  `---`. Ahora hay un parser GFM real (respeta `\|` escapado y no corta dentro
  de `code`), con alineaciones (`:--`, `:-:`, `--:`) y exportación de vuelta a
  Markdown y a HTML.
- El constructor del resaltado es el global `Highlight`, no `CSS.Highlight`.
- En lectura en voz alta, una tabla se lee "columna: valor" por fila en lugar de
  saltearse.

## [0.2.2] — 2026-11-26

### Añadido

- **App de escritorio real con Electron**: `.exe` portable de 78 MB que corre sin
  instalar, con Chromium embebido. Funciona sin conexión y guarda los datos en el
  perfil del usuario.
- Protocolo propio `nook://` para servir el export estático: las rutas absolutas
  de Next (`/_next/...`) rompen bajo `file://` y dejan la ventana en blanco.
- `desktop/`: proceso principal (ventana 1280×820, instancia única, enlaces
  externos al navegador, sandbox) y configuración de `electron-builder` con
  targets **portable** y **NSIS** (x64).
- Verificación automatizada del empaquetado: `scripts/verificar-desktop.mjs`
  arranca Xvfb, se conecta por CDP y comprueba título, bloques, `localStorage` y
  errores de consola sobre el binario ya empaquetado.
- Workflows: `ci.yml` (build web), `desktop.yml` (`.exe` en cada cambio),
  `pages.yml` (demo web) y `release.yml` (publica el `.exe` en Releases al taggear).
- Documentación para la comunidad: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, plantillas de issues y de pull request.

### Cambiado

- `next.config.ts`: soporte de `BASE_PATH` para servir la demo bajo un
  subdirectorio (`usuario.github.io/nook/`).

### Eliminado

- Andamiaje de Tauri v2 (`src-tauri/`): no era compilable ni verificable en el
  entorno de desarrollo. Un solo camino de escritorio, el que está probado.

## [0.2.0] — 2026-11-20

### Añadido

- Lectura en voz alta con resaltado por segmento, barra flotante acoplable y
  ajustes de voz (velocidad, tono, volumen).
- Modo lectura con cuatro papeles (`white`, `sepia`, `gray`, `black`).
- Mapas mentales con layout tidy generados desde los títulos de la página.
- Pomodoro compartido: temporizador global con historial.
- Importación de Markdown y exportación a Markdown/HTML.
- Atajos de teclado documentados y paleta de comandos ampliada.

## [0.1.0] — 2026-11-14

### Añadido

- Editor de bloques con 12 tipos, formato inline y arrastre para reordenar.
- Bases de datos con vistas tabla, board y lista; propiedades de estado,
  selección, persona y fecha.
- Páginas anidadas, favoritos, papelera con restauración, ⌘K.
- Tema claro/oscuro y sidebar colapsable.

[0.2.2]: https://github.com/OWNER/REPO/releases/tag/v0.2.2
