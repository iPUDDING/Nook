/**
 * Guardia del lockfile.
 *
 * Por qué existe: `npm ci` puede pasar en una máquina y fallar en otra sin que
 * el proyecto haya cambiado. El lockfile fija la URL exacta de cada tarball; si
 * una de esas versiones no existe en el registro, la instalación local funciona
 * igual (npm la tiene en caché) y en CI —donde la caché está vacía— termina en
 *
 *     npm error 404 Not Found - GET https://registry.npmjs.org/autoprefixer/-/autoprefixer-10.9.0.tgz
 *     npm error 404 'autoprefixer@…' is not in this registry.
 *
 * Eso fue exactamente lo que pasó con el zip de la 0.14.0: `autoprefixer@10.9.0`
 * no existe en npm (la última es 10.7.0), y el lockfile del escritorio apuntaba a
 * cuatro paquetes en la versión fantasma `0.4.3`.
 *
 * Este script pide cada URL con HEAD y exige 200. Se corre sin instalar nada.
 *
 *   node scripts/verificar-lockfile.mjs
 *
 * Sale con código 0 si todo el lockfile existe en el registro.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lockfiles = ["package-lock.json", "desktop/package-lock.json"].filter((rel) =>
  fs.existsSync(path.join(raiz, rel)),
);

const enParalelo = async (tareas, limite = 16) => {
  const salida = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limite, tareas.length) }, async () => {
      while (i < tareas.length) {
        const actual = i++;
        salida[actual] = await tareas[actual]();
      }
    }),
  );
  return salida;
};

const existe = async (url) => {
  for (let intento = 0; intento < 3; intento++) {
    try {
      const res = await fetch(url, { method: "HEAD", redirect: "follow" });
      if (res.status === 200) return { ok: true };
      if (res.status === 404) return { ok: false, status: 404 };
      // 5xx o límite de peticiones: reintentar
      await new Promise((r) => setTimeout(r, 600 * (intento + 1)));
    } catch (e) {
      await new Promise((r) => setTimeout(r, 600 * (intento + 1)));
    }
  }
  return { ok: false, status: "sin respuesta" };
};

let rotas = 0;
let revisadas = 0;

for (const rel of lockfiles) {
  const lock = JSON.parse(fs.readFileSync(path.join(raiz, rel), "utf8"));
  const entradas = Object.entries(lock.packages ?? {}).filter(
    ([, v]) => typeof v?.resolved === "string" && v.resolved.startsWith("http"),
  );

  const tareas = entradas.map(([nombre, v]) => async () => ({
    nombre,
    version: v.version,
    ...(await existe(v.resolved)),
  }));

  const resultados = await enParalelo(tareas);
  const malas = resultados.filter((r) => !r.ok);
  revisadas += resultados.length;
  rotas += malas.length;

  if (malas.length === 0) {
    console.log(`  ✔  ${rel} — ${resultados.length} tarballs, todos existen en el registro`);
  } else {
    for (const m of malas) {
      console.log(`  ✘  ${rel} — ${m.nombre.replace("node_modules/", "")}@${m.version}: ${m.status}`);
    }
  }
}

console.log("");
if (rotas === 0) {
  console.log(`  ${revisadas} tarballs verificados: el lockfile se puede instalar en frío.`);
  process.exit(0);
}

console.log(`  ${rotas} de ${revisadas} tarballs no existen en el registro.`);
console.log("  Arreglo: borrar el lockfile afectado y volver a generarlo con");
console.log("  `npm install --package-lock-only --no-audit --no-fund`.");
process.exit(1);
