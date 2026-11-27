/**
 * Capturas de evidencia, a prueba de rutas que no existen.
 *
 * Antes cada suite escribía la captura en una ruta fija (`/home/user/…`). En el
 * runner de GitHub ese directorio no existe, Playwright lanzaba `ENOENT` y la
 * excepción cortaba la suite **antes** del resumen: el job quedaba en rojo y el
 * log no decía si las verificaciones anteriores habían pasado.
 *
 * Ahora la captura va a `test-results/` (relativo al repo, se crea si falta) y
 * si aun así falla, se avisa y la suite sigue. Una captura nunca debería decidir
 * si una prueba pasa.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const raizRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const dirResultados = path.join(raizRepo, "test-results");

/** @returns {Promise<string|null>} ruta guardada, o null si no se pudo. */
export async function capturar(page, nombre) {
  try {
    fs.mkdirSync(dirResultados, { recursive: true });
    const archivo = path.join(dirResultados, nombre);
    await page.screenshot({ path: archivo });
    console.log(`  · captura: test-results/${nombre}`);
    return archivo;
  } catch (e) {
    console.log(`  · sin captura ${nombre}: ${e?.message ?? e}`);
    return null;
  }
}
