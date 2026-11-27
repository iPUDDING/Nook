/**
 * Repetición de filas: tareas que vuelven solas.
 *
 * Es la carencia más famosa de la app de referencia: no hay tareas recurrentes
 * de verdad. Lo que hay son *plantillas* que se duplican el día que toca, así que
 * (a) no ves la tarea futura hasta que llega el día y (b) cada mes te quedan
 * copias sueltas por la base. Los usuarios arman fórmulas, bases auxiliares y
 * automatizaciones pagas para simular algo que acá es una propiedad.
 *
 * El modelo es el de un gestor de tareas: **la fila es la tarea**, guarda cada
 * cuánto se repite, y el calendario dibuja sus próximas apariciones por adelantado.
 */

import type { Repeticion } from "./types";

const DIA = 86_400_000;

/** tipos de repetición que ofrece la interfaz */
export const REPETICIONES: { id: string; texto: string; cada: number; unidad: Repeticion["unidad"] }[] = [
  { id: "dia", texto: "Todos los días", cada: 1, unidad: "dia" },
  { id: "semana", texto: "Todas las semanas", cada: 1, unidad: "semana" },
  { id: "mes", texto: "Todos los meses", cada: 1, unidad: "mes" },
  { id: "anio", texto: "Todos los años", cada: 1, unidad: "anio" },
  { id: "2semanas", texto: "Cada 2 semanas", cada: 2, unidad: "semana" },
];

export function textoRepeticion(rep: Repeticion | undefined | null): string {
  if (!rep) return "No se repite";
  const base = { dia: "día", semana: "semana", mes: "mes", anio: "año" }[rep.unidad];
  if (rep.cada === 1) return rep.unidad === "dia" ? "Todos los días" : `Cada ${base}`;
  return `Cada ${rep.cada} ${base}s`;
}

/** ¿la repetición es válida? (un respaldo ajeno puede traer cualquier cosa) */
export function repeticionValida(valor: unknown): Repeticion | null {
  if (!valor || typeof valor !== "object") return null;
  const r = valor as Repeticion;
  const unidades = ["dia", "semana", "mes", "anio"];
  if (!unidades.includes(r.unidad)) return null;
  const cada = Math.round(Number(r.cada));
  if (!Number.isFinite(cada) || cada < 1 || cada > 99) return null;
  return { cada, unidad: r.unidad };
}

/**
 * La fecha que está `veces` repeticiones después de `ts`.
 *
 * Se calcula **siempre desde la fecha original**, no sumando sobre la anterior.
 * Si se sumara sobre la anterior, una tarea mensual del 31 de enero quedaría en
 * el 28 de febrero y de ahí en adelante *todos* los meses en 28: el día se pierde
 * para siempre. Calculando por índice, el 31 vuelve en marzo, abril y mayo.
 *
 * Los meses se recortan al último día del mes destino (31 de enero + 1 mes es el
 * 28 o 29 de febrero, no el 3 de marzo).
 */
export function sumarVeces(ts: number, rep: Repeticion, veces: number): number {
  if (veces <= 0) return ts;
  const d = new Date(ts);
  const salto = rep.cada * veces;
  switch (rep.unidad) {
    case "dia":
      return ts + salto * DIA;
    case "semana":
      return ts + salto * 7 * DIA;
    case "mes": {
      const destino = new Date(d.getFullYear(), d.getMonth() + salto, 1);
      const ultimo = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
      destino.setDate(Math.min(d.getDate(), ultimo));
      return destino.getTime();
    }
    case "anio": {
      const destino = new Date(d.getFullYear() + salto, d.getMonth(), 1);
      const ultimo = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
      destino.setDate(Math.min(d.getDate(), ultimo));
      return destino.getTime();
    }
  }
}

/** la fecha que sigue, `cada` unidades después */
export function siguienteFecha(ts: number, rep: Repeticion): number {
  return sumarVeces(ts, rep, 1);
}

/**
 * Todas las apariciones de una fila que caen dentro de `[desde, hasta]`.
 *
 * La primera es la fecha guardada; después se suma la repetición hasta pasarse
 * del rango. Hay un tope de 500 vueltas para que una repetición diaria con una
 * fecha de hace diez años no cuelgue la vista.
 */
export function ocurrencias(
  inicio: number,
  rep: Repeticion,
  desde: number,
  hasta: number,
): number[] {
  const salida: number[] = [];
  if (inicio >= desde && inicio <= hasta) salida.push(inicio);
  for (let i = 1; i < 500; i++) {
    const ocurrencia = sumarVeces(inicio, rep, i);
    if (ocurrencia <= inicio) break; // una repetición que no avanza no puede colgar la vista
    if (ocurrencia > hasta) break;
    if (ocurrencia >= desde) salida.push(ocurrencia);
  }
  return salida;
}

/**
 * A dónde pasa la fila cuando se completa: la primera aparición **posterior a
 * hoy**. Así una tarea vencida hace tres semanas no «recupera» las vencidas una
 * por una: salta directo a la próxima que sirve.
 */
export function proximaDesdeHoy(actual: number, rep: Repeticion, hoy: number): number {
  const limite = new Date(hoy);
  limite.setHours(23, 59, 59, 999);
  for (let i = 1; i < 500; i++) {
    const ocurrencia = sumarVeces(actual, rep, i);
    if (ocurrencia <= actual) return ocurrencia;
    if (ocurrencia > limite.getTime()) return ocurrencia;
  }
  return sumarVeces(actual, rep, 500);
}
