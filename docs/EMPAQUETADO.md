# Nook de escritorio (.exe) con Tauri v2

El proyecto **ya trae el andamiaje de escritorio** en `src-tauri/` y el workflow
`.github/workflows/desktop.yml`. Esta guía explica cómo generar el `.exe`, qué se
verificó y qué no.

> ✅ **Verificado acá:** el sitio estático que consume el `.exe`
> (`npm run build:static` → `out/`) compila y **arranca**, servido desde un
> servidor estático plano: 25 bloques renderizados, mapa mental abriendo, cero
> errores de consola.
>
> ⚠️ **No verificado:** la compilación de Rust y el instalador. En el entorno
> donde se escribió esto no hay Rust, ni Windows, ni WebView2. Los archivos están
> completos y los JSON validados, pero la primera compilación real la hacés vos.

---

## 1. La forma corta: GitHub Actions

1. Pusheá el repo (el workflow tiene que estar en `main`).
2. **Actions → desktop → Run workflow**.
3. Esperá ~10-15 min (Rust compila lento la primera vez; después el cache lo baja a 3-4 min).
4. **Artifacts → `nook-windows`** → adentro el `.msi` y el `.exe` (NSIS).

Es el camino recomendado porque no necesitás instalar nada en tu máquina.

---

## 2. La forma local

Requisitos: **Rust** (`rustup`, toolchain estable), **Node 20+** y, en Windows,
**Visual Studio Build Tools** con "Desarrollo para el escritorio con C++" +
**WebView2** (viene con Windows 10/11 actualizado).

```bash
npm install
npm i -D @tauri-apps/cli@^2
npx tauri dev      # ventana nativa con recarga en caliente
npx tauri build    # instaladores en src-tauri/target/release/bundle/
```

`npx tauri build` corre solo `npm run build:static` (definido en
`tauri.conf.json` → `beforeBuildCommand`), así que no tenés que acordarte de
generar `out/` a mano.

---

## 3. Qué contiene el andamiaje

```
src-tauri/
├── Cargo.toml               tauri 2 + serde
├── build.rs                 tauri_build::build()
├── tauri.conf.json          ventana, CSP, bundle msi+nsis, íconos
├── capabilities/default.json  permisos mínimos: solo "core:default"
├── icons/                   32, 128, 128@2x, 512 e icon.ico multi-tamaño
└── src/main.rs              Builder::default().run(...)
```

Decisiones que importan:

**Sin plugins de FS ni de diálogo.** Nook importa archivos con el `<input
type="file">` del navegador, que en WebView2 abre el diálogo nativo igual. Menos
superficie de ataque y menos permisos que declarar.

**CSP sin red saliente.** La política es:

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'
```

`connect-src 'self'` es lo que garantiza que la app no pueda enviar nada a un
servidor externo. **`script-src` necesita `'unsafe-inline'`** porque Next inyecta
el payload de hidratación en scripts inline: sin eso, la ventana abre en blanco.
`style-src` lo necesita por los estilos inline de React y por el posicionamiento
de la barra de lectura. Si en algún momento querés endurecerlo, el camino es
nonces/hashes para esos scripts, no quitar la directiva.

**`npm run build:static`** pasa por `scripts/export-static.mjs`, que fija
`BUILD_TARGET=static` desde Node. Existe porque en PowerShell
`VAR=valor comando` no funciona: así el mismo comando sirve en Windows, macOS y
Linux.

---

## 4. Qué cambia y qué no respecto de la web

| | Web | Tauri |
|---|---|---|
| Interfaz, editor, bases de datos | igual | **igual** (mismo `out/`) |
| Voz | Web Speech API del navegador | Web Speech API de WebView2 → voces SAPI de Windows |
| Archivos | `<input type="file">` + descarga | el mismo input abre el diálogo nativo |
| Persistencia | `localStorage` | `localStorage` dentro del perfil de WebView2 |
| Ventana | pestaña | 1280×820, mínimo 900×600, centrada |

La app es 100 % client-side: no hay rutas API ni middleware. Por eso el mismo
build estático sirve para Tauri, para un hosting estático y para el artifact de
CI.

---

## 5. Si el job `desktop` falla

Los tres candidatos habituales, en orden:

| Síntoma en el log | Causa | Fix |
|---|---|---|
| `failed to decode icon` / `icon.ico is invalid` | el `.ico` no tiene el tamaño o el formato esperado | `npx tauri icon src-tauri/icons/icon-1024.png` regenera el set completo |
| `error: could not compile 'tauri'` por `glib`/`webkit2gtk` | corriste el build en Linux sin las libs | el workflow ya usa `windows-latest`; en local, instalá `libwebkit2gtk-4.1-dev` |
| La ventana abre en blanco | CSP bloqueando los scripts de Next | verificá que `script-src` incluya `'unsafe-inline'` |
| `frontendDist not found` | no se generó `out/` | revisá el paso `beforeBuildCommand` en `tauri.conf.json` |

---

## 6. Alternativas si el .exe no es imprescindible

| Camino | Cuándo conviene | Costo |
|---|---|---|
| **PWA instalable** | querés "app de escritorio" ya, sin toolchain | 1 manifest + service worker cacheando `out/` |
| **Tauri v2** | querés `.exe` liviano (~10 MB) con ventana propia | este documento |
| **Electron** | necesitás APIs de Node en el renderer | ~100 MB de binario por app |

Para el uso real de Nook (leer, escribir, escuchar), **PWA resuelve el 80 % con
el 5 % del trabajo**: queda instalable, offline y con ícono en el escritorio. El
`.exe` tiene sentido si lo querés repartir como instalador.
