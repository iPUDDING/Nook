# Llevar Nook al escritorio (Tauri v2)

Guía para envolver esta app como aplicación de escritorio **después** de
publicarla en GitHub. Es el camino que pediste: web funcionando hoy, binario
después.

> ⚠️ **Nada de esta guía se ejecutó en este entorno.** No hay Rust, ni WebView2,
> ni Windows. Los archivos y comandos están escritos para que se compilen en tu
> máquina, pero la primera compilación real tenés que hacerla vos. Todo lo que sí
> está verificado es la app web (`npm run build`, `npm run capturas`).

---

## 1. Qué cambia y qué no

| | Hoy (web) | En Tauri |
|---|---|---|
| Interfaz, editor, bases de datos | igual | **igual** |
| Voz | Web Speech API del navegador | Web Speech API de **WebView2** → voces SAPI de Windows |
| Archivos | picker del navegador + descarga | diálogos nativos + escritura directa en disco |
| Persistencia | `localStorage` | `localStorage` dentro del perfil de WebView2 |
| Distribución | Vercel/Netlify | instalador `.msi` / `.exe` (NSIS) |
| Actualizaciones | automáticas | updater firmado (opcional, fase posterior) |

La app es **100 % client-side**: no hay rutas API, ni `getServerSideProps`, ni
middleware. Eso es justo lo que la vuelve empaquetable sin reescribir nada.

---

## 2. Requisitos

- **Rust** 1.77+ (`rustup`, toolchain `stable-msvc` en Windows)
- **Node** 20+
- **Windows:** Visual Studio Build Tools con "Desarrollo para el escritorio con C++"
  y WebView2 (viene con Windows 10/11 actualizado)
- **macOS:** Xcode Command Line Tools · **Linux:** `libwebkit2gtk-4.1-dev`, `build-essential`

---

## 3. Pasos

### 3.1 Export estático

Tauri sirve archivos estáticos, así que Next tiene que generar HTML plano. Como
la app no usa features de servidor, es un cambio de tres líneas:

```ts
// next.config.ts
const nextConfig: NextConfig = {
  output: "export",        // genera out/ en vez de .next/
  images: { unoptimized: true }, // no hay optimizador de imágenes en estático
  devIndicators: false,
};
```

```bash
npm run build   # ahora produce ./out
```

> El `output: "export"` **no se aplicó** al proyecto para no romper `npm run dev`
> ni `npm run capturas` mientras se trabaja en web. Aplicá el cambio en la rama
> de escritorio, no en `main`.

### 3.2 Inicializar Tauri

```bash
npm i -D @tauri-apps/cli
npx tauri init
```

Respuestas del asistente:

```
App name .................. Nook
Window title .............. Nook
Frontend dist ............. ../out
Dev server URL ............ http://localhost:3000
Dev command ............... npm run dev
Build command ............. npm run build
```

### 3.3 `src-tauri/tauri.conf.json`

```json
{
  "productName": "Nook",
  "version": "0.2.0",
  "identifier": "com.tu-usuario.nook",
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:3000",
    "frontendDist": "../out"
  },
  "app": {
    "windows": [
      {
        "title": "Nook",
        "width": 1280,
        "height": 820,
        "minWidth": 900,
        "minHeight": 600,
        "resizable": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["msi", "nsis"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.ico"]
  }
}
```

Notas de seguridad:

- La **CSP** no permite orígenes externos: la app no hace red, y así queda
  demostrado.
- `style-src 'unsafe-inline'` es necesario porque React y Tailwind escriben
  estilos inline (incluido el posicionamiento de la barra de lectura).
- `media-src blob:` no hace falta para la voz (que no usa `<audio>`), pero sí si
  más adelante se agrega reproducción de audio propio.

### 3.4 Permisos mínimos

En Tauri v2 los permisos van por capacidad. Para leer archivos elegidos por el
usuario, `src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Ventana principal: sólo diálogos y lectura de lo que el usuario elige",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:allow-open",
    "fs:allow-read-text-file",
    {
      "identifier": "fs:scope",
      "allow": [{ "path": "$HOME/Documents/**" }, { "path": "$HOME/Desktop/**" }]
    }
  ]
}
```

Con eso, `importFiles()` del sidebar se cambia por un `open()` del plugin
`@tauri-apps/plugin-dialog` y la lectura por `readTextFile()`. La app ya importa
Markdown por texto, así que el cambio es de 10 líneas en `Sidebar.tsx`.

### 3.5 Compilar

```bash
npm run tauri dev      # desarrollo con recarga
npm run tauri build    # instaladores en src-tauri/target/release/bundle/
```

---

## 4. GitHub Actions (esbozo, no verificado)

`.github/workflows/build.yml`:

```yaml
name: build
on:
  push:
    tags: ["v*"]
  workflow_dispatch:

jobs:
  windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - uses: dtolnay/rust-toolchain@stable
      - name: Instalar dependencias
        run: npm ci
      - name: Verificar
        run: |
          npx tsc --noEmit
          npm run build
      - name: Compilar instaladores
        run: npm run tauri build
      - uses: actions/upload-artifact@v4
        with:
          name: nook-windows
          path: src-tauri/target/release/bundle/**/*.msi
```

Para **firmar** el ejecutable hacen falta secretos (`TAURI_SIGNING_PRIVATE_KEY`
y su contraseña) que nunca van al repositorio. La clave privada se genera una vez
con `npx tauri signer generate` y se guarda sólo en los secretos del repo.

---

## 5. Alternativas si no querés Rust

| Camino | Cuándo conviene | Costo |
|---|---|---|
| **PWA instalable** | querés "app de escritorio" ya, sin toolchain | 1 manifest + iconos; se instala desde Chrome/Edge |
| **Tauri v2** | querés instalador liviano (~10 MB) y acceso nativo | Rust + WebView2 |
| **Electron** | necesitás APIs de Node en el renderer o ecosystem viejo | ~100 MB de binario por app |

Para Nook, **PWA es el 80 % del beneficio con el 5 % del trabajo**: `manifest.json`
+ service worker cacheando `out/` y queda instalable y offline. Tauri tiene
sentido si querés diálogos nativos de archivo y un `.exe` que puedas repartir.

---

## 6. Checklist antes de publicar el binario

- [ ] `npx tsc --noEmit` limpio
- [ ] `npm run build` genera `out/` sin errores
- [ ] `npm run tauri dev` abre la ventana y el editor responde
- [ ] La voz funciona con las voces SAPI de Windows (probar `Escuchar muestra`)
- [ ] `Espacio` pausa la voz y **no** rompe el tipeo en los bloques
- [ ] El modo lectura y los cuatro papeles se ven bien en la ventana chica
- [ ] Importar un `.md` con el diálogo nativo crea la página
- [ ] El Pomodoro sigue contando con el panel cerrado y con la ventana minimizada
- [ ] Cerrar y reabrir conserva páginas, preferencias y posiciones de lectura
- [ ] El instalador se instala en una máquina limpia sin WebView2 preinstalado
