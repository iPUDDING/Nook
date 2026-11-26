/**
 * Compila el sitio estático en `out/` (lo que consumen Tauri y el artifact de CI).
 *
 * Existe porque `BUILD_TARGET=static npm run build` no funciona en PowerShell:
 * ahí `VAR=valor comando` no es válido. Este wrapper fija la variable desde
 * Node, así que el mismo comando sirve en Windows, macOS, Linux y en Actions.
 */
import { spawnSync } from "node:child_process";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

const result = spawnSync(npx, ["next", "build"], {
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
