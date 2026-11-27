# Qué le piden los usuarios a la app de referencia

Investigación hecha el 26-27 de noviembre de 2026 sobre foros, reseñas y
comparativas públicas. El objetivo no era copiar funciones nuevas sino escuchar:
casi todo lo que la gente pide a gritos es *lo que falta*, no *lo que sobra*.

Fuentes principales: hilos de r/Notion («What do you hate about Notion with all
your heart?», «What are some of your biggest frustrations with Notion?», «Most
Wanted Features», «Product Feedback for Notion», «Notion's Import/Export is an
absolute disaster», «I'm done with Notion. App is now too slow after AI»),
reseñas agregadas de G2/Capterra reproducidas en Fibery Openion, comparativas
2026 (ToolWorthy, SaaSCompared, findbetter) y el hilo de Hacker News «Notion is
withholding my company data».

## Lo que más se repite

| # | Queja | Cuánto aparece | ¿Nos toca? |
|---|---|---|---|
| 1 | **Lentitud**: 5-30 s para abrir una página, lag al tipear, bases de datos que se arrastran | La queja nº1, en todas las fuentes, con hilos de 2020 a 2026 | **No por diseño**: Nook es local, sin red ni IA en la nube. Sí hay trabajo real detrás (escrituras agrupadas en 0.6.0) |
| 2 | **Sin modo offline / sin datos locales**: «un cuaderno tiene que abrirse sin wifi» | La más pedida de la historia; Notion la lanzó recién en 2026 | **No aplica**: Nook guarda todo en el equipo |
| 3 | **Sin respaldo automático**: «no quiero un ZIP, quiero que se guarde solo» | Muy repetida, incluso por empresas de backup | **Implementado en 0.12.0** (copias automáticas cada 5 min) |
| 4 | **Exportación que rompe todo**: relaciones, vistas y estructura se pierden | Decenas de hilos, incluida una queja de HN | Ya cubierto: respaldo JSON propio con estructura + export HTML |
| 5 | **No hay buscar dentro de la página** y **no existe buscar y reemplazar** | Recurrente («es increíble que una app de notas no tenga esto») | **Implementado en 0.12.0** (⌘F con reemplazo) |
| 6 | **Bloquear página sin atajo**: cinco años de hilos pidiéndolo | Persistente desde 2020 hasta enero de 2026 | **Implementado en 0.12.0** (⌘⇧B) |
| 7 | Búsqueda global pobre: **sólo busca títulos**, no el texto de dentro, y no se puede acotar | Muy repetida, con hilos de 2024 a 2026 | **Implementado en 0.14.0** (busca en bloques y celdas, con alcance y salto al término) |
| 8 | Tareas recurrentes y recordatorios: no hay repetición por fila y el calendario no muestra el futuro | Muy repetida desde 2021 | **Implementado en 0.14.0** (repetición por fila + apariciones futuras en el calendario) |
| 9 | Recortar/rotar imágenes, contar palabras de una selección | Frecuente | Pendiente |
| 10 | Sin cifrado ni contraseña por página | Frecuente en perfiles de privacidad | Parcial: es local, falta bloqueo con clave |
| 11 | Columnas de base de datos: anchos incómodos, sin forma de ocultar propiedades por vista ni de volver al ancho original | Recurrente | **Implementado en 0.14.0** (anchos arrastrables, propiedades ocultas por vista, restablecer) |
| 12 | Precio, cobros sorpresa y bloqueo de cuentas | Muy repetida | No aplica: Nook no cobra ni tiene cuentas |

## Qué se hizo con esto en la 0.12.0

Tres de los huecos que más se repiten y que además se pueden resolver **bien** en
una app local, sin prometer lo que no hay:

1. **Buscar y reemplazar dentro de la página** (⌘F). Busca sobre el texto y no
   sobre el HTML: encuentra `casa` dentro de `<strong>casa</strong>` pero no
   confunde la `m` de `<em>`. Recorre las coincidencias seleccionando el texto en
   el documento, y reemplaza una o todas. El texto de reemplazo se escribe como
   texto, así que pegar `<b>` no inyecta etiquetas.
2. **Bloquear la página** (⌘⇧B, menú ••• y aviso con botón). El contenido queda
   inerte —ni teclado, ni clic, ni foco—, el título no acepta cambios y la fila
   del árbol muestra un candado. Es la petición con más años sin respuesta.
3. **Copias automáticas**: una foto del workspace al abrir y cada cinco minutos
   si hubo cambios, las últimas cinco, restaurables o borrables desde
   *Configuración → Datos*. Viven en su propia clave de almacenamiento, así que
   si el espacio se llena lo que se pierde son las copias, nunca las notas.

## Lo que se decidió **no** hacer

- **Modo offline**: no existe porque no hay nube. Mostrar un interruptor de
  «offline» sería mentir.
- **IA**: no hay backend ni créditos; prometer un asistente sería una función que
  no funciona.
- **Cifrado de extremo a extremo**: los datos ya no salen del equipo; un cifrado
  con clave olvidable sólo agrega riesgo sin cambiar el modelo de amenaza real.
- **Cuotas y planes**: Nook no cobra ni limita por plan por encima de lo ya
  descrito en `docs/SUSCRIPCION.md`.

## Qué se hizo con esto en la 0.14.0

La ronda salió de leer, en paralelo, los hilos donde la gente se queja de tres
cosas concretas: la búsqueda, las tareas que se repiten y las columnas.

### 1. La búsqueda que «sólo encuentra títulos»

Lo que dicen los hilos de r/Notion *«NOTION SEARCH IS TERRIBLE»* y *«Does search
really still suck?»*: la búsqueda ignora lo que está dentro de la página; con
miles de páginas el nombre exacto no aparece; el orden no mira frecuencia ni uso
reciente; y el propio soporte lo reconoce sin dar fecha. En *«Search within a page
only in notion mobile app»* además se quejan de que el resultado **no salta al
término**: abre la página y hay que buscar a mano entre el texto.

Lo implementado:

- La paleta (⌘K) busca también **dentro de los bloques** y en los **valores de las
  filas** de todas las bases, no sólo en los títulos.
- Cada resultado muestra un **extracto** con la palabra resaltada, para saber
  dónde está antes de abrir.
- Un conmutador de **alcance**: todo el workspace, o sólo la página abierta y sus
  hijas. Es el «buscar sólo en estas N páginas» que se pide en los hilos de
  *Product Feedback* y de backlinks.
- Al abrir el resultado, **salta al bloque y lo marca** un instante.
- Busca sin tildes y sin distinguir mayúsculas; no intenta nada con menos de dos
  letras (evita listar medio workspace por una `a`).

### 2. Tareas que se repiten

Los hilos *«Why do Recurring Tasks suck»*, *«When will Notion allow recurring
tasks?»*, *«How do you handle recurring tasks & daily-reset reminders?»* y
*«Recurring tasks with automations?»* coinciden: no hay repetición por tarea; la
plantilla repetida aparece **sólo el día que toca**; y al completar no se genera
la siguiente. Todos los workarounds son fórmulas con automatizaciones de pago.

En Nook la fila **es** la tarea y se repite: cada día, cada semana, cada mes o
cada año. El calendario **dibuja las apariciones futuras** antes de que lleguen,
como chips punteados que abren la misma fila. *Completar y pasar a la próxima* la
mueve a la fecha siguiente en vez de duplicarla, así el historial de la tarea
queda en una sola fila.

El detalle que se rompe fácil: una mensual del 31. Si se suma un mes a la fecha
ya recortada, el 31 de enero cae el 28 de febrero y **se queda en 28 para
siempre**. Acá cada aparición se calcula desde la fecha original por índice, así
que febrero cae el 28 y marzo vuelve al 31. Está en la suite.

### 3. Propiedades y anchos, por vista

De *17 tips for building your perfect Notion aesthetic*, de r/Notion
(*/comments/gptqwn/*, */comments/109im9f/*) y del issue #398 de
`arcforgelabs/flow`: los anchos se guardan por vista, no hay forma de volver al
ancho por defecto y no se pueden ocultar propiedades sin tocar la base entera.

Lo implementado: cada vista guarda **qué propiedades se ven** y **cuánto mide
cada columna**. El título no se puede ocultar (la fila quedaría sin nombre), y
«Restablecer anchos» devuelve la tabla a como venía. La configuración viaja con
la vista: cambiar de tabla a calendario y volver no pierde nada.

### Lo que sigue pendiente

- Recortar y rotar imágenes, contar palabras de una selección.
- Bloqueo con contraseña por página (hoy está el bloqueo de edición, sin clave).
- Igualar anchos de columna de un saque y congelar la primera columna al
  desplazar de costado: se pide en los hilos de columnas, pero necesita que la
  tabla deje de ser un `<table>` con `position: sticky` a medias.
