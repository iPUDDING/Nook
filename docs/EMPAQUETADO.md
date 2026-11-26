# Empaquetado de escritorio (Electron)

## Resumen

La app de escritorio es **Electron**: Chromium + Node embebidos en un `.exe`
único de ~78 MB. Se compila en cualquier sistema operativo y **no** necesita
Rust, MSVC ni WebView2.

```
app/ + components/ + lib/     UI (Next.js 15, App Router)
        │  npm run build:static
        ▼
      out/                     web estática (19 archivos, ~1,1 MB)
        │  electron-builder  (extraResources → resources/web)
        ▼
  Nook-<version>-portable.exe
```

## Cómo carga la web dentro del `.exe`

Next con `output: "export"` escribe rutas absolutas (`/_next/static/...`). Bajo
`file://` esas rutas apuntan a la raíz del disco y la ventana queda **en blanco**:
es el fallo clásico de empaquetar Next en Electron.

La solución, en `desktop/main.cjs`:

- se registra un esquema propio **`nook://`** (`registerSchemesAsPrivileged` +
  `protocol.handle`);
- cada request se resuelve contra `resources/web`, con protección contra
  `../` (path traversal) y fallback a `404.html`;
- la ventana carga `nook://nook/`.

Ventajas sobre `file://`: las rutas absolutas funcionan sin tocar el build, el
origen es estable (los datos de `localStorage` persisten entre sesiones) y el
sistema de archivos del usuario no queda expuesto al renderer.

## Seguridad

| Medida | Dónde |
|---|---|
| `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` | `desktop/main.cjs` |
| `window.open` y navegaciones externas → navegador del SO (`shell.openExternal`) | `desktop/main.cjs` |
| instancia única (dos ventanas no pelean por el mismo `localStorage`) | `requestSingleInstanceLock` |
| sin pedidos de red: todo es local | no hay `fetch` a servicios externos |

## Comandos

| Comando | Dónde | Qué hace |
|---|---|---|
| `npm run build:static` | raíz | genera `out/` |
| `npm install` | `desktop/` | instala electron + electron-builder (~400 paquetes) |
| `npm run build:win` | `desktop/` | **genera los `.exe`** en `desktop/release/` |
| `npm start` | `desktop/` | abre la app en modo desarrollo |
| `npm run build:linux` | `desktop/` | build para Linux (para probar) |

## Qué está verificado y qué no

| | Estado |
|---|---|
| `out/` generado y servido plano | ✅ 25 bloques, 0 errores de consola |
| `.exe` portable de Windows construido | ✅ 78 MB, `release/Nook-0.2.2-portable.exe` |
| La app empaquetada **abre y renderiza** | ✅ verificado sobre el mismo `app.asar` (build Linux, Xvfb + CDP): título, 25 bloques, `localStorage`, 0 errores |
| El `.exe` ejecutado en Windows real | ⚠️ no verificable desde Linux (no hay Windows en este entorno) — es el mismo código empaquetado |
| Instalador NSIS `setup.exe` | ⚠️ se genera en Windows o en CI; desde Linux requiere `wine32` |
| Firma digital | ❌ sin certificado: SmartScreen avisa la primera vez |

## Fallos típicos

| Error | Causa | Solución |
|---|---|---|
| Ventana en blanco | se empaquetó sin `out/` o se abrió con `file://` | `npm run build:static` antes de empaquetar; cargar por `nook://` |
| `wine is required` | compilar targets de Windows desde Linux/macOS | compilar en Windows o usar el workflow `desktop` |
| `ERR_ELECTRON_BUILDER_CANNOT_EXECUTE` + `rcedit` | falta wine32 al incrustar el ícono | ídem, o instalar `wine32:i386` |
| `npm ci` falla en CI | se agregó una dependencia y no se actualizó el lockfile | `npm install` local y commitear `package-lock.json` |
| El `.exe` no abre en otra PC | arquitectura distinta | el target es `x64` (Windows 10/11 64 bits) |

## Por qué Electron y no Tauri

| | Electron (implementado) | Tauri v2 (descartado) |
|---|---|---|
| Tamaño | ~78 MB | ~8 MB |
| Dependencias para compilar | ninguna (binarios precompilados) | Rust + MSVC + WebView2 en Windows |
| Motor de render | Chromium fijo → idéntico en todas las PCs | WebView2 del sistema → puede variar |
| Verificable desde Linux | sí (se compiló y se probó acá) | no (no se pudo compilar en este entorno) |

Para una app de notas que vive de la tipografía y del render exacto, un motor
fijo pesa más que 70 MB de diferencia.
