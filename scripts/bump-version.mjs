/**
 * Sube la versión de la app sin romper los lockfiles.
 *
 * Los bumps anteriores hacían `sed s/0.9.0/0.10.0/` sobre todo el archivo, y eso
 * también cambiaba versiones de dependencias: `@malept/flatpak-bundler` quedó
 * declarado como `0.9.0` cuando su tarball es `0.4.3`. Este script sólo toca la
 * versión de la app en:
 *   - package.json / desktop/package.json (`version`)
 *   - package-lock.json / desktop/package-lock.json (raíz y `packages[""]`)
 *
 * Uso: node scripts/bump-version.mjs 0.11.0
 */
import fs from "node:fs";
import path from "node:path";

const nueva = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(nueva ?? "")) {
  console.error("Uso: node scripts/bump-version.mjs <x.y.z>");
  process.exit(1);
}

const raiz = path.resolve(import.meta.dirname, "..");

for (const archivo of ["package.json", "desktop/package.json"]) {
  const ruta = path.join(raiz, archivo);
  const json = JSON.parse(fs.readFileSync(ruta, "utf8"));
  const antes = json.version;
  json.version = nueva;
  fs.writeFileSync(ruta, JSON.stringify(json, null, 2) + "\n");
  console.log(`${archivo}: ${antes} → ${nueva}`);
}

for (const archivo of ["package-lock.json", "desktop/package-lock.json"]) {
  const ruta = path.join(raiz, archivo);
  const lock = JSON.parse(fs.readFileSync(ruta, "utf8"));
  const antes = lock.version;
  lock.version = nueva;
  if (lock.packages?.[""]) lock.packages[""].version = nueva;

  // Comprobación de coherencia: la versión declarada de cada dependencia tiene
  // que ser la del tarball que figura en `resolved`. Es la comprobación que
  // detecta un reemplazo accidental (una dependencia real puede llamarse 0.11.0
  // —@pkgjs/parseargs— y eso no es un error; que diga 0.11.0 con el tarball de
  // 0.4.3 sí lo es).
  const incoherentes = Object.entries(lock.packages ?? {})
    .filter(([clave, valor]) => clave && valor?.version && valor?.resolved)
    .filter(([, valor]) => {
      const m = String(valor.resolved).match(/-(\d+\.\d+\.\d+(?:-[a-z0-9.]+)?)\.tgz/);
      return m && m[1] !== valor.version;
    })
    .map(([clave, valor]) => `${clave} (dice ${valor.version}, el tarball es otro)`);
  if (incoherentes.length) {
    console.error(`${archivo}: entradas incoherentes:\n  ${incoherentes.join("\n  ")}`);
    process.exit(1);
  }
  fs.writeFileSync(ruta, JSON.stringify(lock, null, 2) + "\n");
  console.log(`${archivo}: ${antes} → ${nueva}`);
}
