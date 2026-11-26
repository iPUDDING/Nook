# Changelog

Todas las versiones notables del proyecto. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y
[versionado semántico](https://semver.org/lang/es/).

## [0.2.2] — 2026-11-26

### Añadido

- **App de escritorio real con Electron**: `.exe` portable de 78 MB que corre sin
  instalar, con Chromium embebido. Funciona sin conexión y guarda los datos en el
  perfil del usuario.
- Protocolo propio `nook://` para servir el export estático: las rutas absolutas
  de Next (`/_next/...`) rompen bajo `file://` y dejan la ventana en blanco.
- `desktop/`: proceso principal (ventana 1280×820, instancia única, enlaces
  externos al navegador, sandbox) y configuración de `electron-builder` con
  targets **portable** y **NSIS** (x64).
- Verificación automatizada del empaquetado: `scripts/verificar-desktop.mjs`
  arranca Xvfb, se conecta por CDP y comprueba título, bloques, `localStorage` y
  errores de consola sobre el binario ya empaquetado.
- Workflows: `ci.yml` (build web), `desktop.yml` (`.exe` en cada cambio),
  `pages.yml` (demo web) y `release.yml` (publica el `.exe` en Releases al taggear).
- Documentación para la comunidad: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, plantillas de issues y de pull request.

### Cambiado

- `next.config.ts`: soporte de `BASE_PATH` para servir la demo bajo un
  subdirectorio (`usuario.github.io/nook/`).

### Eliminado

- Andamiaje de Tauri v2 (`src-tauri/`): no era compilable ni verificable en el
  entorno de desarrollo. Un solo camino de escritorio, el que está probado.

## [0.2.0] — 2026-11-20

### Añadido

- Lectura en voz alta con resaltado por segmento, barra flotante acoplable y
  ajustes de voz (velocidad, tono, volumen).
- Modo lectura con cuatro papeles (`white`, `sepia`, `gray`, `black`).
- Mapas mentales con layout tidy generados desde los títulos de la página.
- Pomodoro compartido: temporizador global con historial.
- Importación de Markdown y exportación a Markdown/HTML.
- Atajos de teclado documentados y paleta de comandos ampliada.

## [0.1.0] — 2026-11-14

### Añadido

- Editor de bloques con 12 tipos, formato inline y arrastre para reordenar.
- Bases de datos con vistas tabla, board y lista; propiedades de estado,
  selección, persona y fecha.
- Páginas anidadas, favoritos, papelera con restauración, ⌘K.
- Tema claro/oscuro y sidebar colapsable.

[0.2.2]: https://github.com/OWNER/REPO/releases/tag/v0.2.2
