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
  | "code";

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

export interface DbRow {
  id: string;
  cells: Record<string, CellValue>;
  createdAt: number;
}

export type DbView = "table" | "board" | "list";

export interface Database {
  properties: Property[];
  rows: DbRow[];
  view: DbView;
  /** id de la propiedad por la que agrupa la vista board */
  groupBy: string;
  sorts: { propertyId: string; dir: "asc" | "desc" }[];
  filter: { propertyId: string; optionId: string } | null;
}

export interface Page {
  id: string;
  title: string;
  icon: string | null;
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
