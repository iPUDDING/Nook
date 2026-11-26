import type { Block, Database, Page, Person, Property } from "./types";
import { uid } from "./utils";

/** Fechas fijas: si usáramos Date.now() el HTML del server y del cliente no
 *  coincidirían y React tiraría un hydration mismatch en los "hace X min". */
const T0 = new Date("2026-11-24T13:05:00Z").getTime();
const M = 60_000;

export const PEOPLE: Person[] = [
  { id: "p1", name: "Ana Duarte", initials: "AD", color: "blue" },
  { id: "p2", name: "Bruno Sosa", initials: "BS", color: "green" },
  { id: "p3", name: "Caro Ferreyra", initials: "CF", color: "purple" },
  { id: "p4", name: "Diego Paz", initials: "DP", color: "orange" },
  { id: "p5", name: "Vos", initials: "YO", color: "gray" },
];

export const personById = (id: string) => PEOPLE.find((p) => p.id === id);

const b = (type: Block["type"], html = "", extra: Partial<Block> = {}): Block => ({
  id: uid("blk"),
  type,
  html,
  indent: 0,
  ...extra,
});

/* ------------------------------- propiedades ------------------------------- */

const statusProp: Property = {
  id: "status",
  name: "Estado",
  type: "status",
  options: [
    { id: "todo", name: "Sin empezar", color: "gray" },
    { id: "doing", name: "En curso", color: "blue" },
    { id: "review", name: "En revisión", color: "yellow" },
    { id: "done", name: "Listo", color: "green" },
  ],
};

const priorityProp: Property = {
  id: "priority",
  name: "Prioridad",
  type: "select",
  options: [
    { id: "p-low", name: "Baja", color: "gray" },
    { id: "p-mid", name: "Media", color: "orange" },
    { id: "p-high", name: "Alta", color: "red" },
  ],
};

const areaProp: Property = {
  id: "area",
  name: "Área",
  type: "select",
  options: [
    { id: "a-editor", name: "Editor", color: "purple" },
    { id: "a-sync", name: "Sincronización", color: "blue" },
    { id: "a-ui", name: "Interfaz", color: "pink" },
    { id: "a-infra", name: "Infra", color: "green" },
  ],
};

const roadmapProps: Property[] = [
  { id: "title", name: "Tarea", type: "title" },
  statusProp,
  priorityProp,
  areaProp,
  { id: "owner", name: "Responsable", type: "person" },
  { id: "due", name: "Vence", type: "date" },
  { id: "est", name: "Estimación", type: "number" },
  { id: "blocked", name: "Bloqueada", type: "checkbox" },
];

const row = (cells: Database["rows"][number]["cells"], i: number) => ({
  id: uid("row"),
  cells,
  createdAt: T0 + i * M,
});

const roadmapDb: Database = {
  properties: roadmapProps,
  rows: [
    row({ title: "Editor de bloques con menú “/”", status: "done", priority: "p-high", area: "a-editor", owner: "p1", due: "2026-11-18", est: 5, blocked: false }, 0),
    row({ title: "Drag & drop de bloques", status: "doing", priority: "p-high", area: "a-editor", owner: "p2", due: "2026-11-29", est: 3, blocked: false }, 1),
    row({ title: "Vista board agrupada por estado", status: "doing", priority: "p-mid", area: "a-ui", owner: "p3", due: "2026-12-02", est: 4, blocked: false }, 2),
    row({ title: "Persistencia local del workspace", status: "done", priority: "p-mid", area: "a-infra", owner: "p4", due: "2026-11-20", est: 2, blocked: false }, 3),
    row({ title: "Sincronización en tiempo real", status: "todo", priority: "p-high", area: "a-sync", owner: "p2", due: "2026-12-15", est: 13, blocked: true }, 4),
    row({ title: "Comentarios inline por bloque", status: "review", priority: "p-mid", area: "a-editor", owner: "p3", due: "2026-12-05", est: 8, blocked: false }, 5),
    row({ title: "Modo oscuro completo", status: "todo", priority: "p-low", area: "a-ui", owner: "p1", due: "2026-12-20", est: 3, blocked: false }, 6),
    row({ title: "Búsqueda global (⌘K)", status: "todo", priority: "p-mid", area: "a-ui", owner: "p5", due: "2026-12-10", est: 5, blocked: false }, 7),
  ],
  view: "table",
  groupBy: "status",
  sorts: [{ propertyId: "due", dir: "asc" }],
  filter: null,
};

/* --------------------------------- páginas -------------------------------- */

const ID = {
  home: "pg_home",
  roadmap: "pg_roadmap",
  notes: "pg_notes",
  docs: "pg_docs",
  eng: "pg_eng",
  design: "pg_design",
  reading: "pg_reading",
  ideas: "pg_ideas",
  trash: "pg_trash",
  team: "pg_team",
};

const homeBlocks: Block[] = [
  b("callout", "<strong>Este workspace es un clon funcional</strong> hecho en Next.js + Tailwind, con editor de bloques, bases de datos y páginas anidadas. Todo lo que escribas se guarda en tu navegador.", { color: "blue" }),
  b("paragraph", "Escribí <code>/</code> en cualquier bloque vacío para abrir el menú de comandos. Probá también <code># </code>, <code>- </code>, <code>[] </code> o <code>&gt; </code> al inicio de la línea."),
  b("h2", "Qué está implementado"),
  b("bulleted", "Editor de bloques con <strong>12 tipos</strong>: texto, títulos, listas, to-do, toggle, cita, callout, divisor y código.", { indent: 0 }),
  b("bulleted", "Formato inline con <strong>⌘B</strong>, <em>⌘I</em>, <u>⌘U</u> y <code>⌘E</code> para código.", { indent: 0 }),
  b("bulleted", "Reordenar arrastrando el handle <strong>⠿</strong> que aparece al pasar el mouse por la izquierda del bloque.", { indent: 0 }),
  b("bulleted", "Bases de datos con vistas <strong>tabla</strong>, <strong>board</strong> y <strong>lista</strong>, propiedades de estado, selección, persona, fecha y checkbox.", { indent: 0 }),
  b("bulleted", "Páginas anidadas, favoritos, papelera y restauración.", { indent: 0 }),
  b("h2", "Atajos que conviene memorizar"),
  b("toggle", "Guía rápida de teclado", { collapsed: false }),
  b("paragraph", "<strong>⌘K</strong> — buscar páginas y ejecutar comandos", { indent: 1 }),
  b("paragraph", "<strong>⌘\\</strong> — mostrar u ocultar la barra lateral", { indent: 1 }),
  b("paragraph", "<strong>Tab</strong> / <strong>Shift+Tab</strong> — indentar y desindentar", { indent: 1 }),
  b("paragraph", "<strong>Enter</strong> al inicio de un bloque vacío — convertir a texto plano", { indent: 1 }),
  b("paragraph", "<strong>Backspace</strong> al inicio — unir con el bloque anterior", { indent: 1 }),
  b("paragraph", "<strong>⌘⇧7</strong> / <strong>⌘⇧8</strong> / <strong>⌘⇧9</strong> — listas", { indent: 1 }),
  b("h2", "Pendientes del equipo"),
  b("todo", "Terminar el drag & drop entre columnas del board", { checked: true }),
  b("todo", "Diseñar el panel de comentarios", { checked: false }),
  b("todo", "Evaluar sincronización con un backend", { checked: false }),
  b("quote", "La mejor documentación es la que se escribe mientras se construye. — alguien, en algún retro"),
  b("h2", "Bloque de código"),
  b("code", "<span>// el modelo es una lista plana de bloques con indentación</span><br/><span>type Block = { id: string; type: BlockType; html: string; indent: number }</span>"),
  b("divider"),
  b("paragraph", "<span style=\"color: rgb(120,119,116)\">Creado en el análisis con REA + Craft Anything + Ghidra. Ver ANALISIS.md.</span>"),
];

const notesBlocks: Block[] = [
  b("paragraph", "<strong>Asistentes:</strong> Ana, Bruno, Caro, Diego. <strong>Duración:</strong> 45 min."),
  b("h3", "Decisiones"),
  b("numbered", "Adoptamos una lista plana de bloques con <code>indent</code> en vez de un árbol: menos casos borde en el reordenamiento."),
  b("numbered", "El estado global va con Zustand + persistencia en <code>localStorage</code>, no en el servidor."),
  b("numbered", "La base de datos es una página más: mismo sidebar, mismo breadcrumb."),
  b("h3", "Temas abiertos"),
  b("toggle", "¿Cómo resolvemos la concurrencia?", { collapsed: true }),
  b("paragraph", "Opción A: CRDT por bloque. Opción B: locks optimistas con revisión. Pendiente de spike.", { indent: 1 }),
  b("toggle", "¿Comentarios a nivel bloque o a nivel texto?", { collapsed: true }),
  b("paragraph", "A nivel bloque primero: cubre el 80% de los casos con 20% del costo.", { indent: 1 }),
  b("callout", "La próxima reunión es el <strong>martes 2 de diciembre</strong>.", { color: "yellow" }),
];

const engBlocks: Block[] = [
  b("h2", "Stack"),
  b("bulleted", "Next.js 15 (App Router) + React 19 + TypeScript."),
  b("bulleted", "Tailwind CSS con tokens en variables CSS (dark mode sin duplicar clases)."),
  b("bulleted", "Zustand con middleware <code>persist</code>."),
  b("h2", "Convenciones"),
  b("quote", "Ningún componente importa el store de forma indirecta: se usan selectores."),
  b("paragraph", "Los ids de bloque se generan en el cliente. El seed usa fechas fijas para no romper la hidratación."),
];

const designBlocks: Block[] = [
  b("h2", "Sistema visual"),
  b("paragraph", "Paleta neutra de 9 colores + 4 escalas de gris para texto. Radios de 4/6/8 px y un solo tipo de sombra para popovers."),
  b("callout", "Regla: el contraste mínimo de texto secundario es 4.5:1.", { color: "green" }),
  b("h3", "Tipografía"),
  b("bulleted", "Cuerpo 16px / 1.5."),
  b("bulleted", "Título de página 40px, peso 700, tracking -0.02em."),
  b("bulleted", "UI (sidebar, menús) 14px, peso 500."),
];

const readingDb: Database = {
  properties: [
    { id: "title", name: "Título", type: "title" },
    { id: "author", name: "Autor", type: "text" },
    statusProp,
    { id: "done", name: "Leído", type: "checkbox" },
  ],
  rows: [
    row({ title: "Designing Data-Intensive Applications", author: "Martin Kleppmann", status: "doing", done: false }, 0),
    row({ title: "The Mythical Man-Month", author: "Fred Brooks", status: "done", done: true }, 1),
    row({ title: "Refactoring UI", author: "Wathan & Schoger", status: "review", done: false }, 2),
  ],
  view: "list",
  groupBy: "status",
  sorts: [],
  filter: null,
};

export function buildSeedPages(): Record<string, Page> {
  const pages: Record<string, Page> = {};

  const add = (p: Omit<Page, "order" | "space" | "favorite" | "trashed" | "createdAt" | "updatedAt"> & Partial<Page>) => {
    pages[p.id] = {
      order: p.order ?? 0,
      space: p.space ?? "private",
      favorite: p.favorite ?? false,
      trashed: p.trashed ?? false,
      createdAt: p.createdAt ?? T0,
      updatedAt: p.updatedAt ?? T0 + 12 * M,
      ...p,
    } as Page;
  };

  add({
    id: ID.home, title: "Inicio", icon: "🏠", cover: "sunset", parentId: null, order: 0,
    blocks: homeBlocks, database: null, favorite: true, updatedAt: T0 + 26 * M,
  });

  add({
    id: ID.roadmap, title: "Roadmap de producto", icon: "🚀", cover: "ocean", parentId: null, order: 1,
    blocks: [], database: roadmapDb, space: "team", updatedAt: T0 + 5 * M,
  });

  add({
    id: ID.notes, title: "Notas de reunión", icon: "📝", cover: null, parentId: null, order: 2,
    blocks: notesBlocks, database: null, space: "team", updatedAt: T0 + 90 * M,
  });

  add({
    id: ID.docs, title: "Docs", icon: "📚", cover: null, parentId: null, order: 3,
    blocks: [b("paragraph", "Documentación viva del proyecto. Cada carpeta es una página con hijos.")],
    database: null, space: "team",
  });

  add({
    id: ID.eng, title: "Ingeniería", icon: "⚙️", cover: null, parentId: ID.docs, order: 0,
    blocks: engBlocks, database: null, space: "team",
  });

  add({
    id: ID.design, title: "Diseño", icon: "🎨", cover: null, parentId: ID.docs, order: 1,
    blocks: designBlocks, database: null, space: "team",
  });

  add({
    id: ID.reading, title: "Lista de lectura", icon: "📖", cover: "mint", parentId: ID.docs, order: 2,
    blocks: [], database: readingDb,
  });

  add({
    id: ID.team, title: "Wiki del equipo", icon: "🧠", cover: "grape", parentId: null, order: 4,
    blocks: [
      b("h2", "Quiénes somos"),
      b("paragraph", "Cinco personas, tres husos horarios y una sola fuente de verdad."),
      b("h2", "Cómo trabajamos"),
      b("bulleted", "Todo lo que no está escrito no existe."),
      b("bulleted", "Las decisiones se registran con fecha y responsable."),
      b("todo", "Actualizar el onboarding antes de fin de mes", { checked: false }),
    ],
    database: null, space: "team", favorite: true,
  });

  add({
    id: ID.ideas, title: "Ideas sueltas", icon: "💡", cover: null, parentId: null, order: 5,
    blocks: [b("paragraph", "Un editor colaborativo para presentaciones con bloques reutilizables.")],
    database: null, trashed: true, updatedAt: T0 - 3 * 24 * 60 * M,
  });

  add({
    id: ID.trash, title: "Notas viejas", icon: "🗒️", cover: null, parentId: null, order: 6,
    blocks: [b("paragraph", "Notas importadas del sistema anterior.")],
    database: null, trashed: true, updatedAt: T0 - 9 * 24 * 60 * M,
  });

  return pages;
}

export const SEED_SELECTED = ID.home;
export const SEED_EXPANDED = { [ID.docs]: true };
