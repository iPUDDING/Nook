/**
 * Genera el export estático de Next (carpeta `out/`) que Electron empaqueta.
 *
 * ¿Por qué un wrapper en vez de `cd .. && npm run build:static`?
 *   - `cd .. && …` no existe de la misma forma en cmd.exe / PowerShell.
 *   - Delegamos en `scripts/export-static.mjs`, que ya fija BUILD_TARGET=static
 *     de forma multiplataforma y produce `out/`.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Este archivo es un módulo ES (`.mjs` viene con "type": "module" del paquete):
// no hay `require` ni `__dirname`, y usarlos rompía el build con
// "ReferenceError: require is not defined in ES module scope".
const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..', '..');
const script = path.join(webRoot, 'scripts', 'export-static.mjs');

if (!fs.existsSync(script)) {
  console.error(`[nook] No encuentro ${script}. ¿Está la carpeta desktop/ dentro del repo?`);
  process.exit(1);
}

const res = spawnSync(process.execPath, [script], {
  cwd: webRoot,
  stdio: 'inherit',
  env: { ...process.env, BUILD_TARGET: 'static' },
});

if (res.status !== 0) {
  console.error('[nook] Falló el export estático de la web.');
  process.exit(res.status ?? 1);
}

const outIndex = path.join(webRoot, 'out', 'index.html');
if (!fs.existsSync(outIndex)) {
  console.error(`[nook] El export terminó pero no existe ${outIndex}.`);
  process.exit(1);
}

console.log('[nook] Web estática lista en out/');
