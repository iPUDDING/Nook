# Empieza acá

## El ejecutable ya está construido

**`Nook-0.10.0-portable.exe`** (78 MB). Un solo archivo, no instala nada, no pide
permisos de administrador:

1. Copialo a tu PC con Windows 10/11 (64 bits).
2. Doble clic.
3. Windows va a mostrar *"Windows protegió tu PC"* porque el archivo **no está
   firmado con un certificado de código**. Es lo esperable en cualquier `.exe`
   autocopilado: **Más información → Ejecutar de todas formas**.

Adentro va Chromium + la app completa: funciona sin internet, guarda todo en tu
perfil de usuario (`%APPDATA%\Nook`).

> Si preferís un instalador con acceso directo en el menú Inicio y desinstalador,
> corré `npm run build:win` en `desktop/` sobre Windows: genera
> `Nook-0.10.0-setup.exe` además del portable.

---

## Qué es esta carpeta del proyecto

| Ruta | Qué es |
|---|---|
| `app/`, `components/`, `lib/` | la app (Next.js 15 + React 19 + Zustand) |
| `desktop/` | el empaquetado de escritorio: `main.cjs` (proceso principal de Electron), `package.json` con la config de `electron-builder` |
| `scripts/export-static.mjs` | genera `out/`: la web estática que se mete dentro del `.exe` |
| `docs/` | [empaquetado](./docs/EMPAQUETADO.md) · [publicar en GitHub](./docs/GITHUB.md) · [OpenHub](./docs/OPENHUB.md) |

### Cómo se arma el binario

```
npm run build:static        →  out/   (web estática)
npm run build:win           →  Nook-<version>-portable.exe  (desktop/)
```

En `desktop/`:

```
npm install                 # primera vez
npm run build:win           # en Windows no hace falta nada más
```

El `.exe` se puede generar en Windows, Linux o macOS; en Windows no hay
dependencias extra.

---

## Probarlo sin instalar nada

```bash
npm install
npm run dev          # http://localhost:3000
```

O abrir la app de escritorio en modo desarrollo (necesita `out/` ya generado):

```bash
cd desktop
npm install
npm start
```

---

## Publicar en GitHub y compartirlo con la comunidad

Guía completa: **[docs/GITHUB.md](./docs/GITHUB.md)**. Los dos pasos que importan:

1. **Demo pública** — Settings → Pages → Source: *GitHub Actions*. La web queda en
   `https://OWNER.github.io/REPO/`, sin que nadie tenga que descargar nada.
2. **Descarga del `.exe`** — taggeá una versión:

   ```bash
   git tag v0.10.0 && git push origin v0.10.0
   ```

   El workflow **release** compila el portable y el instalador, y los adjunta a
   `https://github.com/OWNER/REPO/releases/latest`. Ese es el enlace que se comparte.

Antes de invitar gente, pasá por la checklist de
[docs/GITHUB.md](./docs/GITHUB.md#4-antes-de-invitar-gente-checklist).

---

## Si algo no anda

| Síntoma | Causa | Solución |
|---|---|---|
| SmartScreen bloquea el `.exe` | binario sin firma digital | *Más información → Ejecutar de todas formas* |
| Ventana en blanco | `out/` no se generó antes de empaquetar | `npm run build:static`, después `npm run build:win` |
| `npm run build:win` falla con *"wine is required"* | estás compilando el `.exe` desde Linux/macOS | compilá en Windows, o usá el workflow de GitHub |
| La app abre sin mis notas | perfil de Windows distinto | las notas viven en `%APPDATA%\Nook` de cada usuario |
