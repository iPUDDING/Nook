/**
 * Modelo de datos del workspace.
 *
 * Del análisis (ver ANALISIS.md) salen tres decisiones estructurales que imitan
 * el modelo real de la app:
 *
 *  1. El documento NO es un árbol de HTML: es una **lista plana de bloques**
 *     con un nivel de indentación. Eso es lo que permite reordenar con drag &
 *     drop, aplicar transformaciones por bloque y hacer el "handle" lateral.
 *  2. Una página puede tener cuerpo de bloques **o** ser una base de datos.
 *  3. Toda frase con formato inline se guarda como HTML parcial dentro del
 *     bloque (bold/italic/underline/strike/code/links), no como texto plano.
 */

export type ColorKey =
  | "gray"
  | "brown"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "red";

export type BlockType =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "bulleted"
  | "numbered"
  | "todo"
  | "toggle"
  | "quote"
  | "callout"
  | "divider"
  | "code"
  | "table";

/**
 * Datos de un bloque `table`.
 *
 * Las celdas guardan **HTML inline** (lo mismo que el resto de los bloques), así
 * una tabla importada de Markdown conserva negritas, código y enlaces.
 * `align` refleja la fila de alineación de GFM (`:---`, `:---:`, `---:`).
 */
export interface TableData {
  header: string[];
  rows: string[][];
  align?: ("left" | "center" | "right")[];
}

export interface Block {
  id: string;
  type: BlockType;
  /** HTML inline del bloque ("" = vacío → se muestra el placeholder) */
  html: string;
  /** sólo para type === "todo" */
  checked?: boolean;
  /** sólo para type === "toggle": si está cerrado, se ocultan los hijos */
  collapsed?: boolean;
  /** 0..3 — un bloque con indent mayor que un toggle es su hijo */
  indent?: number;
  /** color de fondo, usado por callout */
  color?: ColorKey;
  /** sólo para type === "table" */
  table?: TableData;
}

export type PropType =
  | "title"
  | "text"
  | "select"
  | "status"
  | "date"
  | "checkbox"
  | "person"
  | "number";

export interface SelectOption {
  id: string;
  name: string;
  color: ColorKey;
}

export interface Property {
  id: string;
  name: string;
  type: PropType;
  options?: SelectOption[];
}

export type CellValue = string | number | boolean | null;

/** Cada cuánto vuelve una fila que se repite. */
export interface Repeticion {
  cada: number;
  unidad: "dia" | "semana" | "mes" | "anio";
}

export interface DbRow {
  id: string;
  cells: Record<string, CellValue>;
  createdAt: number;
  /**
   * Repetición de la fila. La fila **es** la tarea: no se duplica en plantillas
   * como en la app de referencia, se mueve a la próxima fecha al completarla, y
   * el calendario dibuja sus próximas apariciones por adelantado.
   */
  repeat?: Repeticion;
}

/**
 * Vistas de una base de datos. Las de Notion que tienen sentido local:
 * tabla, board, lista, **galería** y **línea de tiempo**.
 * (Cronograma con dependencias y gráficos quedan fuera: exigen modelo de rangos
 * y un motor de cálculo que no aporta a una app de notas.)
 */
export type DbView = "table" | "board" | "list" | "gallery" | "timeline" | "calendar";

/** Filtro, orden y agrupación de una vista concreta. */
export interface ViewConfig {
  groupBy: string;
  sorts: { propertyId: string; dir: "asc" | "desc" }[];
  filter: { propertyId: string; optionId: string } | null;
  /** propiedades ocultas en esta vista */
  ocultas: string[];
  /** ancho de cada columna de la tabla, por id de propiedad */
  anchos: Record<string, number>;
}

export interface Database {
  properties: Property[];
  rows: DbRow[];
  view: DbView;
  /** id de la propiedad por la que agrupa la vista board */
  groupBy: string;
  sorts: { propertyId: string; dir: "asc" | "desc" }[];
  filter: { propertyId: string; optionId: string } | null;
  /**
   * Configuración guardada de cada vista.
   *
   * En la app de referencia cada vista tiene su propio filtro, orden y
   * agrupación: filtrar la tabla no cambia el board. Como en Nook las vistas son
   * seis pestañas fijas y no vistas con nombre, al cambiar de pestaña se guarda
   * la configuración de la que se deja y se restaura la de la que se abre.
   */
  viewConfig?: Partial<Record<DbView, ViewConfig>>;
  /** propiedades ocultas en la vista actual (se guarda por vista) */
  ocultas?: string[];
  /** ancho de las columnas de la tabla en la vista actual (se guarda por vista) */
  anchos?: Record<string, number>;
}

export interface Page {
  id: string;
  title: string;
  icon: string | null;
  /**
   * Una carpeta es una página sin cuerpo: agrupa páginas hijas y archivos.
   *
   * Se modela como una página y no como una entidad aparte porque el árbol, el
   * arrastre, la papelera, el historial y el respaldo ya funcionan con páginas:
   * inventar un segundo tipo de nodo obligaba a duplicar todo eso. Lo único que
   * cambia es qué se dibuja a la derecha del título.
   */
  isFolder?: boolean;
  /**
   * Página bloqueada: se ve igual pero no se puede editar hasta desbloquearla.
   *
   * Es la protección contra el «toqué algo sin querer» que en la app de
   * referencia no tiene atajo de teclado (una queja de años): acá se activa y se
   * saca con ⌘⇧B.
   */
  locked?: boolean;
  cover: string | null;
  parentId: string | null;
  order: number;
  space: "private" | "team";
  blocks: Block[];
  database: Database | null;
  favorite: boolean;
  trashed: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Metadatos de un archivo adjunto.
 *
 * Los metadatos viajan en el workspace (y en el respaldo JSON, que es texto); el
 * contenido binario vive en **IndexedDB**, porque un PDF de 3 MB no entra en la
 * cuota de `localStorage` y meterlo ahí dejaría al usuario sin poder guardar ni
 * una nota.
 */
export interface FileMeta {
  id: string;
  /** nombre original, con extensión */
  name: string;
  /** tipo MIME tal como lo reporta el sistema ("" si no lo sabe) */
  mime: string;
  /** tamaño en bytes */
  size: number;
  /** carpeta que lo contiene; `null` = suelto en la raíz */
  folderId: string | null;
  createdAt: number;
}

export interface Person {
  id: string;
  name: string;
  initials: string;
  color: ColorKey;
}

export type Theme = "light" | "dark";

/* ========================================================================== */
/*                     Preferencias de lectura, voz y Pomodoro                */
/* ========================================================================== */

/** Papel de lectura: los cuatro que ofrece el visor original. */
export type PaperKey = "white" | "sepia" | "gray" | "black";

export interface TtsPrefs {
  /** `voiceURI` de la voz elegida (null = la mejor automática) */
  voiceURI: string | null;
  rate: number; // 0.5 – 2
  pitch: number; // 0 – 2
  volume: number; // 0 – 1
  /** sigue la lectura con scroll automático */
  autoScroll: boolean;
}

export interface ReadingPrefs {
  /** modo lectura: oculta el chrome de edición */
  mode: boolean;
  paper: PaperKey;
  /** 0.9 – 1.4 */
  fontScale: number;
  /** barra fina de progreso arriba del documento */
  showProgress: boolean;
  /** recordar la posición de scroll por página */
  remember: boolean;
  /** pageId → scrollTop en px */
  positions: Record<string, number>;
}

export interface PomodoroPrefs {
  /** minutos */
  work: number;
  rest: number;
  longRest: number;
  /** cada cuántas sesiones toca descanso largo */
  sessionsBeforeLong: number;
  autoStart: boolean;
  sound: boolean;
}

/** Un día de historial del Pomodoro. */
export interface PomodoroDay {
  /** YYYY-MM-DD */
  date: string;
  sessions: number;
  focusSeconds: number;
}

/** Posición y acople de la barra flotante de lectura. */
export type DockSide = "float" | "left" | "right";

export interface BarPos {
  dock: DockSide;
  /** coordenadas en px dentro del viewport (sólo si dock === "float") */
  x: number;
  y: number;
}

export const DEFAULT_TTS: TtsPrefs = {
  voiceURI: null,
  rate: 1,
  pitch: 1,
  volume: 1,
  autoScroll: true,
};

export const DEFAULT_READING: ReadingPrefs = {
  mode: false,
  paper: "white",
  fontScale: 1,
  showProgress: true,
  remember: true,
  positions: {},
};

export const DEFAULT_POMODORO: PomodoroPrefs = {
  work: 25,
  rest: 5,
  longRest: 15,
  sessionsBeforeLong: 4,
  autoStart: false,
  sound: true,
};

export const DEFAULT_BAR: BarPos = { dock: "float", x: -1, y: -1 };

/* ========================================================================== */
/*                          Miembros del workspace                            */
/* ========================================================================== */

/**
 * Roles de un miembro. El workspace **no tiene límite de miembros**: la lista
 * crece sin tope y vive en el estado persistido.
 */
export type MemberRole = "owner" | "admin" | "editor" | "commenter" | "viewer";

export const MEMBER_ROLES: MemberRole[] = ["owner", "admin", "editor", "commenter", "viewer"];

export const MEMBER_ROLE_LABEL: Record<MemberRole, string> = {
  owner: "Propietario",
  admin: "Administrador",
  editor: "Puede editar",
  commenter: "Puede comentar",
  viewer: "Puede ver",
};

export interface Member {
  id: string;
  name: string;
  email: string;
  /** iniciales para el avatar (máx. 2 letras) */
  initials: string;
  color: ColorKey;
  role: MemberRole;
  /** ISO date de alta */
  joinedAt: string;
  /** invitación enviada, todavía no aceptó */
  pending?: boolean;
}

/** Iniciales a partir de un nombre o de un correo. */
export function initialsOf(name: string): string {
  const clean = name.trim();
  if (!clean) return "?";
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}
