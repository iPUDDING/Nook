/**
 * Compila el sitio estático en `out/` (lo que consumen Tauri y el artifact de CI).
 *
 * Existe porque `BUILD_TARGET=static npm run build` no funciona en PowerShell:
 * ahí `VAR=valor comando` no es válido. Este wrapper fija la variable desde
 * Node, así que el mismo comando sirve en Windows, macOS, Linux y en Actions.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Se llama al CLI de Next con `node` directamente, no con `npx`.
 *
 * En Windows `npx` es `npx.cmd` (un archivo por lotes), y `spawnSync` no puede
 * ejecutar un `.cmd` con `shell: false`: devuelve `EINVAL` sin arrancar nada. Eso
 * es lo que tumbaba el workflow de escritorio en el runner de Windows:
 *
 *     Error: spawnSync npx.cmd EINVAL
 *
 * Lanzar `node node_modules/next/dist/bin/next` funciona igual en Windows, macOS,
 * Linux y en Actions, sin depender de cómo se llame el ejecutable en cada shell.
 */
const cliNext = path.join(raiz, "node_modules", "next", "dist", "bin", "next");
if (!fs.existsSync(cliNext)) {
  console.error(
    `No encuentro el CLI de Next en ${cliNext}.\nCorré "npm ci" en la raíz del proyecto antes de compilar.`,
  );
  process.exit(1);
}

const result = spawnSync(process.execPath, [cliNext, "build"], {
  cwd: raiz,
  stdio: "inherit",
  env: { ...process.env, BUILD_TARGET: "static" },
  shell: false,
});

if (result.error) {
  console.error(`No se pudo ejecutar next build: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`El build estático falló (código ${result.status}).`);
  process.exit(result.status ?? 1);
}

console.log("\n✔ Sitio estático generado en ./out");
