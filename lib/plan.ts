/**
 * Suscripción de Nook — lógica pura.
 *
 * Sin backend no hay cobro posible, así que esto **no** es un DRM: es la capa
 * de producto (planes, capacidades y activación por licencia offline) que
 * cualquiera puede auditar y que funciona sin conexión.
 *
 * Regla de oro del proyecto: la app arranca con la suscripción **activa** y
 * todos los límites desactivados. La tabla comparativa existe para que se vea
 * qué incluiría cada plan, no para bloquear el trabajo.
 */

export type PlanTier = "free" | "pro" | "business" | "enterprise";

export interface PlanInfo {
  tier: PlanTier;
  name: string;
  /** precio de referencia, por mes y por miembro */
  price: string;
  tagline: string;
  /** asientos incluidos; `null` = ilimitados */
  seats: number | null;
  /** días de historial de Pomodoro; `null` = ilimitado */
  historyDays: number | null;
  /** tamaño máximo por archivo adjunto, en MB (5 en Gratis, 5 GB desde Pro) */
  maxFileMb: number;
  /** almacenamiento total de adjuntos, en MB; `null` = sin tope */
  storageMb: number | null;
}

export const PLANS: Record<PlanTier, PlanInfo> = {
  free: {
    tier: "free",
    name: "Gratis",
    price: "USD 0",
    tagline: "Para probar el editor y las tablas.",
    seats: 10,
    historyDays: 7,
    maxFileMb: 5,
    storageMb: 512,
  },
  pro: {
    tier: "pro",
    name: "Pro",
    price: "USD 8",
    tagline: "Todo el flujo de lectura y foco, con 30 días de historial.",
    seats: null,
    historyDays: 30,
    maxFileMb: 5000,
    storageMb: null,
  },
  business: {
    tier: "business",
    name: "Business",
    price: "USD 15",
    tagline: "Para equipos: miembros sin techo y 90 días de historial.",
    seats: null,
    historyDays: 90,
    maxFileMb: 5000,
    storageMb: null,
  },
  enterprise: {
    tier: "enterprise",
    name: "Enterprise",
    price: "A medida",
    tagline: "Despliegue propio, auditoría y soporte.",
    seats: null,
    historyDays: null,
    maxFileMb: 5000,
    storageMb: null,
  },
};

/** Plan que habilita la suscripción de este binario. */
export const UNLOCKED_TIER: PlanTier = "business";

export interface PlanState {
  tier: PlanTier;
  /** suscripción vigente: es el interruptor de todo */
  active: boolean;
  since: string;
  /** clave con la que se activó, si se activó con una */
  license: string | null;
}

export const DEFAULT_PLAN: PlanState = {
  tier: UNLOCKED_TIER,
  active: true,
  since: "2026-11-26T00:00:00.000Z",
  license: null,
};

/* ========================================================================== */
/*                          Capacidades del producto                          */
/* ========================================================================== */

export interface PlanFeature {
  id: string;
  label: string;
  hint: string;
  /** cómo se ve cuando está desbloqueada */
  unlocked: string;
  /** mínimo plan que la incluye (con la suscripción activa) */
  minTier: PlanTier;
}

export const PLAN_FEATURES: PlanFeature[] = [
  {
    id: "members",
    label: "Miembros del workspace",
    hint: "Invitá a todo tu equipo, con rol propio para cada persona.",
    unlocked: "Ilimitados",
    minTier: "pro",
  },
  {
    id: "tables",
    label: "Tablas en documentos",
    hint: "Tablas editables dentro de una página y tablas de Markdown importadas.",
    unlocked: "Ilimitadas",
    minTier: "pro",
  },
  {
    id: "markdown",
    label: "Markdown de ida y vuelta",
    hint: "Importar archivos, pegar Markdown y exportar la página o el workspace.",
    unlocked: "Sin límite",
    minTier: "pro",
  },
  {
    id: "tts",
    label: "Lectura en voz alta",
    hint: "Voz del sistema, resaltado frase por frase y barra acoplable.",
    unlocked: "Todas las voces",
    minTier: "pro",
  },
  {
    id: "history",
    label: "Historial de Pomodoro",
    hint: "Sesiones y minutos de foco por día, para ver tendencia.",
    unlocked: "Ilimitado",
    minTier: "pro",
  },
  {
    id: "mindmap",
    label: "Mapas mentales",
    hint: "Contorno de la página con layout automático y edición.",
    unlocked: "Ilimitados",
    minTier: "pro",
  },
  {
    id: "reading",
    label: "Modo lectura y papeles",
    hint: "Cuatro papeles, ancho completo y posición recordada por página.",
    unlocked: "Todos",
    minTier: "pro",
  },
  {
    id: "exportAll",
    label: "Exportación completa del workspace",
    hint: "Todas las páginas en un solo HTML con índice, listo para imprimir a PDF.",
    unlocked: "Incluida",
    minTier: "business",
  },
  {
    id: "versions",
    label: "Historial de versiones",
    hint: "7 días en Gratis, 30 en Pro, 90 en Business y sin límite en Enterprise.",
    unlocked: "Según el plan",
    minTier: "free",
  },
  {
    id: "backup",
    label: "Respaldo y restauración",
    hint: "Exportar el workspace a JSON y volver a cargarlo.",
    unlocked: "Sin límite",
    minTier: "pro",
  },
];

/** Plan mínimo que satisface la suscripción de este build. */
const TIER_ORDER: PlanTier[] = ["free", "pro", "business", "enterprise"];

export const tierRank = (tier: PlanTier): number => TIER_ORDER.indexOf(tier);

/** ¿Este valor es un plan conocido? Se usa para no aceptar cualquier cosa. */
export const isPlanTier = (value: unknown): value is PlanTier =>
  typeof value === "string" && (TIER_ORDER as string[]).includes(value);

/**
 * ¿Está disponible esta capacidad?
 *
 * Con la suscripción activa y el plan desbloqueado (`UNLOCKED_TIER`) responde
 * `true` para **todas**: es el estado con el que se entrega la app.
 */
/**
 * Ficha del plan con red de seguridad.
 *
 * `PLANS[plan.tier]` explotaba si el tier guardado no era uno de los cuatro
 * (un `plan.tier: null` colado por un respaldo ajeno, o un valor de una versión
 * futura): `PLANS[null].name` lanzaba y la ventana quedaba en blanco. Con esto
 * un plan desconocido se lee como Gratis, que es el estado seguro.
 */
export function planInfo(tier: string | null | undefined): PlanInfo {
  return (tier && (PLANS as Record<string, PlanInfo | undefined>)[tier]) || PLANS.free;
}

export function hasFeature(plan: PlanState, feature: PlanFeature["id"]): boolean {
  if (!plan.active) return false;
  // `business` y `enterprise` incluyen todo
  if (tierRank(plan.tier) >= tierRank("business")) return true;

  const spec = PLAN_FEATURES.find((f) => f.id === feature);
  if (!spec) return true;
  return tierRank(plan.tier) >= tierRank(spec.minTier);
}

/** Asientos disponibles. `null` = sin límite. */
export function seatLimit(plan: PlanState): number | null {
  if (!plan.active) return PLANS.free.seats;
  return planInfo(plan.tier).seats;
}

/** Días de historial que se conservan. `null` = sin límite. */
/** Tamaño máximo por archivo adjunto, en MB. */
export function fileLimitMb(plan: PlanState): number {
  if (!plan.active) return PLANS.free.maxFileMb;
  return planInfo(plan.tier).maxFileMb;
}

/** Almacenamiento total de adjuntos, en MB. `null` = sin tope. */
export function storageLimitMb(plan: PlanState): number | null {
  if (!plan.active) return PLANS.free.storageMb;
  return planInfo(plan.tier).storageMb;
}

export function historyLimit(plan: PlanState): number | null {
  if (!plan.active) return PLANS.free.historyDays;
  return planInfo(plan.tier).historyDays;
}

/** Texto corto para la UI: "Pro activo" / "Suscripción inactiva". */
export const planLabel = (plan: PlanState): string =>
  plan.active ? `${planInfo(plan.tier).name} · activo` : "Sin suscripción";

/* ========================================================================== */
/*                        Licencias (activación offline)                      */
/* ========================================================================== */

/**
 * Alfabeto sin caracteres ambiguos: nada de `0/O` ni `1/I`, que es justo lo que
 * se transcribe mal cuando alguien copia una clave a mano.
 */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const checksumOf = (body: string): string => {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) sum = (sum * 31 + body.charCodeAt(i)) % 33_554_432;
  return ALPHABET[sum % ALPHABET.length];
};

/** `nook pro1 demo` → `NOOK-PRO1-DEMO` (sin checksum todavía). */
export function normalizeLicenseKey(input: string): string {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = clean.startsWith("NOOK") ? clean.slice(4) : clean;
  return body.slice(0, 11);
}

/** Clave completa y válida para un cuerpo dado (lo que entregaría la tienda). */
export function completeLicenseKey(body: string): string {
  const normalized = normalizeLicenseKey(body).padEnd(11, "2");
  const full = `${normalized}${checksumOf(normalized)}`;
  return `NOOK-${full.slice(0, 4)}-${full.slice(4, 8)}-${full.slice(8, 12)}`;
}

/** Valida formato y checksum. Una clave inválida no activa nada. */
export function isValidLicenseKey(input: string): boolean {
  const groups = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = groups.startsWith("NOOK") ? groups.slice(4) : groups;
  if (body.length !== 12) return false;
  if (![...body].every((c) => ALPHABET.includes(c))) return false;
  const payload = body.slice(0, 11);
  return checksumOf(payload) === body[11];
}

/**
 * Clave de ejemplo, válida, para documentación y pruebas.
 *
 * Ojo con el alfabeto: no incluye `O` ni `0` (ni `1`/`I`) justamente porque se
 * confunden al transcribirlas. Una clave con esas letras es inválida por diseño.
 */
export const DEMO_LICENSE = completeLicenseKey("DEMAKPR2X6Q");
