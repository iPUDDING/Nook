# Subir Nook a GitHub (y que compile sin sorpresas)

Tres caminos, del más simple al más manual. Elegí **uno**.

Antes de cualquiera, comprobá en tu máquina que compila:

```bash
npm install
npm run verificar     # tsc --noEmit + next build. Tiene que terminar sin errores.
```

Si eso pasa en tu máquina y falla en GitHub, el problema **no es el código**: es
lo que se subió.

---

## Camino A — repositorio nuevo (recomendado, a prueba de balas)

Es el único camino que garantiza que no arrastrás restos de intentos anteriores.

1. En GitHub, borrá el repo que falla: **Settings → Danger Zone → Delete this
   repository**. (O dejalo archivado y seguí con otro nombre.)
2. Descomprimí el zip. Vas a tener una carpeta **`nook`**.
3. Abrí **GitHub Desktop → File → Add Local Repository…** → elegí `nook`.
4. Te ofrece crear el repo: **create a repository** → nombre `nook` → **Create
   Repository**.
5. **Commit to main** → **Publish repository**.
6. GitHub corre solo el workflow `build` (`.github/workflows/ci.yml`). En ~1–2
   minutos tenés la tilde verde en **Actions**.

---

## Camino B — reemplazar el contenido de un repo existente

Útil si ya publicaste y no querés cambiar la URL.

1. GitHub Desktop → elegí el repo → menú **Repository → Show in Explorer**
   (Windows) o **Show in Finder** (macOS).
2. **Borrá todo** lo que hay dentro de esa carpeta **menos la carpeta `.git`**
   (está oculta; activá "ver archivos ocultos"). Esto es lo que elimina los
   archivos del intento anterior, que son los que rompen el build.
3. Copiá **el contenido** de la carpeta `nook` (no la carpeta, su contenido)
   dentro de la carpeta del repo.
4. GitHub Desktop va a mostrar decenas de cambios, incluidos borrados: eso está
   bien. Ponele al commit `reemplazo completo por Nook 0.2.0` → **Commit to main**
   → **Push origin**.
5. Mirá **Actions**: el workflow tiene que terminar en verde.

---

## Camino C — por terminal (si preferís no usar la interfaz)

```bash
cd nook
git init
git add -A
git commit -m "Nook 0.2.0"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/nook.git
git push -u origin main
```

Si el remoto ya tenía contenido y querés pisarlo por completo:

```bash
git push --force origin main
```

`--force` es destructivo: usalo sólo si estás seguro de que no te importa lo que
había en el repo.

---

## Si el build falla en GitHub

El workflow corre tres pasos. Según cuál falle, el problema es distinto:

| Paso que falla | Qué significa | Cómo lo arreglás |
|---|---|---|
| `npm ci` | `package-lock.json` no coincide con `package.json`, o hay un `package.json` que no es el del proyecto | Subí el `package-lock.json` del zip sin tocarlo |
| `npx tsc --noEmit` | hay archivos TypeScript en el repo que no son parte del proyecto (restos de otra versión: `src/`, `Topbar.tsx`, etc.) | Camino A, o borrar esos archivos (Camino B paso 2) |
| `npm run build` | error real de compilación de Next; el log dice archivo y línea | Pegame el bloque de error y lo miro |

### Errores que **son** señal de repo mezclado

Si ves cualquiera de estos, el repo no es (sólo) Nook:

- rutas que empiezan con `src/` (Nook no usa `src/`: es `app/`, `components/`, `lib/`)
- `@/types/notion`, `@/lib/initial-data`, `Topbar.tsx` con b minúscula
- `lucide-react`, `@radix-ui/*`, `@tiptap/*`, `react-markdown` en el log
- nombres como `parseMarkdownToBlocks` o `exportPageToMarkdown` (los reales son
  `markdownToBlocks` y `pageToMarkdown`)

Nook tiene **cuatro** dependencias de producción: `next`, `react`, `react-dom`,
`zustand`. Cualquier otra que aparezca en un error viene de otro proyecto.

### Cómo se ve una corrida sana

```
✓ npm ci                     111 packages
✓ npx tsc --noEmit           (sin salida = sin errores)
✓ npm run build              Route (app) / 46.9 kB   150 kB First Load JS
```

---

## Después de publicar

- **Ver la app online sin configurar nada:** importá el repo en Vercel →
  detecta Next solo → build `npm run build` → sin variables de entorno.
- **Instalador de escritorio:** ver [EMPAQUETADO.md](./EMPAQUETADO.md).
