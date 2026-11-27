/**
 * Diagnóstico de compilación.
 *
 * Cuando el build falla en la máquina de otra persona, el mensaje de error solo
 * no alcanza: hay que saber con qué Node, con qué npm y con qué estado de
 * `node_modules` se está compilando. Este script junta todo eso y deja el
 * resultado en `diagnostico.txt`, listo para pegar en un issue.
 *
 * Uso:
 *   node scripts/diagnostico.mjs            # revisa y compila
 *   node scripts/diagnostico.mjs --rapido   # sólo el entorno, sin compilar
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lineas = [];
const escribir = (txt = "") => {
  lineas.push(txt);
  console.log(txt);
};

const correr = (cmd, args, opciones = {}) => {
  const res = spawnSync(cmd, args, {
    cwd: opciones.cwd ?? raiz,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: process.env,
  });
  const salida = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
  return { ok: res.status === 0, status: res.status, salida };
};

const existe = (rel) => fs.existsSync(path.join(raiz, rel));

escribir("=== Diagnóstico de Nook ===");
escribir(`Fecha       : ${new Date().toISOString()}`);
escribir(`Sistema     : ${os.type()} ${os.release()} · ${process.platform} ${process.arch}`);
escribir(`Node        : ${process.version}`);
escribir(`Raíz        : ${raiz}`);

const bin = (rel) => path.join(raiz, "node_modules", rel);
const npm = correr(process.execPath, ["--version"]);
escribir(`npm         : ${npm.ok ? npm.salida : "no encontrado"}`);

// ---------------------------------------------------------------- requisitos
const mayor = Number(process.versions.node.split(".")[0]);
const menor = Number(process.versions.node.split(".")[1]);
const nodeOk = mayor > 18 || (mayor === 18 && menor >= 18);
escribir(`Node ≥ 18.18: ${nodeOk ? "sí" : "NO — Next 15 no compila con esta versión"}`);

for (const [etiqueta, rel] of [
  ["dependencias web", "node_modules/next"],
  ["dependencias escritorio", "desktop/node_modules/electron"],
  ["package-lock.json", "package-lock.json"],
  ["next-env.d.ts", "next-env.d.ts"],
  ["out/ (export previo)", "out/index.html"],
]) {
  escribir(`${etiqueta.padEnd(12)}: ${existe(rel) ? "presente" : "falta"}`);
}

if (!existe("node_modules/next")) {
  escribir("");
  escribir("Falta node_modules: corré `npm ci` en la raíz antes de compilar.");
}

if (!process.argv.includes("--rapido")) {
  escribir("");
  escribir("=== tsc --noEmit ===");
  const tipos = correr(process.execPath, [bin("typescript/bin/tsc"), "--noEmit"]);
  escribir(tipos.ok ? "sin errores de tipos" : tipos.salida.slice(0, 8000));

  escribir("");
  escribir("=== next build ===");
  const build = correr(process.execPath, [bin("next/dist/bin/next"), "build"]);
  escribir(build.salida.slice(0, 12000));

  const archivo = path.join(raiz, "diagnostico.txt");
  fs.writeFileSync(archivo, `${lineas.join("\n")}\n`, "utf8");
  escribir("");
  escribir(`Todo esto quedó en ${archivo}`);
  process.exit(build.ok && tipos.ok ? 0 : 1);
}

const archivo = path.join(raiz, "diagnostico.txt");
fs.writeFileSync(archivo, `${lineas.join("\n")}\n`, "utf8");
escribir("");
escribir(`Todo esto quedó en ${archivo}`);
