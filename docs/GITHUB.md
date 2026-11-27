# Publicar Nook en GitHub y compartirlo

Guía completa: desde la carpeta en tu disco hasta un repositorio público con
`Releases` que cualquiera puede descargar.

Tiempo estimado: **15 minutos** (más lo que tarde el primer build, ~8 min).

---

## 1. Crear el repositorio

**Nombre sugerido:** `nook` · **Visibilidad:** Public · **Sin** README, sin
`.gitignore`, sin licencia (ya vienen en el proyecto).

> Si el proyecto ya tiene `.git` local con commits, no inicialices nada desde la
> web: creá el repo **vacío** y después hacé el push.

### Opción A — con GitHub Desktop (sin terminal)

1. GitHub Desktop → **File → Add Local Repository…** → elegí la carpeta `nook`.
2. **Publish repository** → desmarcá *Keep this code private* → **Publish**.

### Opción B — con git

```bash
cd nook
git remote add origin https://github.com/OWNER/REPO.git
git branch -M main
git push -u origin main
```

---

## 2. Activar la demo web (GitHub Pages)

1. **Settings → Pages → Build and deployment → Source: `GitHub Actions`**.
2. Andá a **Actions** y esperá el workflow **pages** (se dispara solo con el push).
3. La demo queda en `https://OWNER.github.io/REPO/`.

El workflow detecta el nombre del repo y arma el `basePath` solo. Única excepción:
si el repo se llama `OWNER.github.io`, definí la variable de repositorio
`BASE_PATH` con el valor `.` (Settings → Secrets and variables → Actions →
Variables) para servir desde la raíz del dominio.

---

## 3. Publicar la versión descargable (Releases)

Este es el paso que hace que la comunidad pueda **bajar el `.exe` sin GitHub
Actions de por medio**. Los artifacts de Actions requieren cuenta y expiran a los
30 días; un Release es una página pública y permanente.

```bash
git tag v0.10.0
git push origin v0.10.0
```

Eso dispara el workflow **release**, que:

1. compila el `.exe` portable y el instalador en `windows-latest`;
2. comprime la web estática;
3. crea un **Release** en `https://github.com/OWNER/REPO/releases/tag/v0.10.0`
   con los tres archivos adjuntos y las notas generadas automáticamente.

Al terminar, el enlace para compartir es:

```
https://github.com/OWNER/REPO/releases/latest
```

---

## 4. Antes de invitar gente: checklist

- [ ] El README se ve bien en GitHub (tiene capturas y badges).
- [ ] `LICENSE` tiene tu nombre o el de la organización en el copyright.
- [ ] Reemplazaste los `OWNER/REPO` de las plantillas por tu usuario y repo:
      `.github/ISSUE_TEMPLATE/config.yml`, `CHANGELOG.md` y este archivo.
- [ ] **Settings → General → Features**: Issues y Discussions activados.
- [ ] El workflow **ci** está en verde en la pestaña Actions.
- [ ] La demo de Pages carga y se puede escribir.
- [ ] El Release `latest` tiene el `.exe` adjunto y se descarga.
- [ ] En **Settings → Code security**: activá *Private vulnerability reporting*
      (lo usa `SECURITY.md`).

---

## 5. Texto listo para compartir

**Para un post / README de presentación:**

> **Nook** — un workspace tipo Notion, local y sin cuentas.
> Editor de bloques, bases de datos con vistas tabla/board/lista, lectura en voz
> alta con resaltado, mapas mentales y Pomodoro. Corre en el navegador o como
> `.exe` portable de 78 MB en Windows. Sin telemetría: tus notas no salen de tu
> máquina.
>
> Demo: `https://OWNER.github.io/REPO/` · Descarga: `https://github.com/OWNER/REPO/releases/latest`
> Stack: Next.js 15 + React 19 + TypeScript + Zustand. Cero dependencias de UI.

**Para Reddit / Hacker News / foros:** contá **qué problema resuelve** y **cómo
probarlo en 30 segundos** (la demo). Aclará de entrada que es un clon de la
interfaz de Notion hecho por gusto técnico, y que el `.exe` no está firmado
(SmartScreen avisa): la transparencia evita el 80 % de los comentarios hostiles.

---

## 6. Mantenimiento

| Cambio | Qué hacer |
|---|---|
| subir la versión | tocar 4 archivos: `package.json`, `package-lock.json` (2 lugares) y `desktop/package.json`; después tag nuevo |
| cambiar la UI | nada extra: `ci`, `pages` y `desktop` se disparan solos |
| cambiar el empaquetado | commit en `desktop/**` → workflow `desktop` |
| dependencias | `npm install` y commitear `package-lock.json` (si no, `npm ci` falla en CI) |

---

## 7. Diagnóstico

| Síntoma | Causa | Solución |
|---|---|---|
| Actions falla con `npm ci … lock file does not satisfy` | se editó `package.json` sin actualizar el lockfile | `npm install` local y commitear el lockfile |
| Pages muestra 404 en `/REPO/` | Pages no está en "GitHub Actions", o `BASE_PATH` no coincide con el nombre del repo | revisar Settings → Pages y la sección *Generar out/* del run |
| Pages carga sin estilos | faltó `BASE_PATH` en repos de proyecto | definir la variable o dejar que el workflow la calcule |
| El Release sale sin archivos | el build falló o el patrón no matcheó | mirar el job `windows`; `fail_on_unmatched_files: true` corta el run a propósito |
| Release "desactualizado" | se taggeó dos veces el mismo nombre | borrar el tag (`git tag -d v0.10.0 && git push --delete origin v0.10.0`) y volver a crearlo |
| El `.exe` no abre en otra PC | es x64 | pedir Windows 10/11 de 64 bits; no hay build para ARM |
