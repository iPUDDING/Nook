# Cómo contribuir a Nook

Gracias por querer aportar. Este documento explica cómo está armado el proyecto,
qué convenciones respetamos y cómo mandar un cambio que podamos mergear sin
vueltas.

## Reglas de oro

1. **Cero dependencias de UI.** Nada de `lucide-react`, `radix`, `shadcn`, MUI ni
   similares: los íconos son SVG inline y los componentes se escriben a mano. Es
   lo que mantiene el bundle chico y el render idéntico en el `.exe`.
2. **Cero assets externos.** Sin fuentes de Google, sin imágenes remotas, sin CDN.
   La app tiene que funcionar sin internet.
3. **Los tokens de diseño no se tocan por capricho.** Colores, radios y escala
   tipográfica están documentados en [ANALISIS.md](./ANALISIS.md).
4. **TypeScript estricto.** `npx tsc --noEmit` tiene que pasar: es el gate real
   (el `lint` de Next no está configurado).

## Poner el proyecto a andar

```bash
git clone https://github.com/OWNER/REPO.git
cd REPO
npm install
npm run dev          # http://localhost:3000
```

Para probar la app de escritorio:

```bash
npm run build:static           # genera out/
cd desktop
npm install
npm start                      # abre la ventana de Electron
```

## Mapa del código

| Ruta | Contenido |
|---|---|
| `app/` | layout y página raíz (App Router) |
| `components/` | UI: `AppShell`, `Sidebar`, `Topbar`, `Editor`, `Block`, bases de datos, `MindMap`, `TtsBar`, `Pomodoro`, `Settings`, paleta de comandos |
| `lib/store.ts` | estado global (Zustand) + persistencia |
| `lib/blocks.ts` | modelo de bloques, árbol de páginas, tipos |
| `lib/speech.ts` | texto→voz: troceado, reglas, métricas (**puro**, sin DOM) |
| `lib/markdown.ts` | Markdown ⇄ bloques, exportación |
| `lib/mindmap.ts` | árbol + layout tidy (**puro**) |
| `scripts/capturas.mjs` | 17 capturas + verificación de runtime |
| `desktop/main.cjs` | proceso principal de Electron |

La lógica pura vive en `lib/` y no importa React: así se puede razonar y probar
sin montar la UI.

## Contrato del store (no romperlo)

Clave de persistencia: **`nook-workspace-v2`**.

- Se persiste: `pages, selectedId, expanded, theme, sidebarOpen, fullWidth, tts,
  reading, pomodoro, pomHistory, bar, rules`.
- Es efímero (nunca se guarda): `paletteOpen, shareOpen, shortcutsOpen,
  settingsOpen, trashOpen, peekRowId, mindmapOpen`.

Si agregás estado, decidí explícitamente en cuál de las dos listas va y
documentalo en el PR.

## Recetas

### Agregar un tipo de bloque

1. Sumá el tipo a la unión `BlockType` en `lib/blocks.ts` (con su valor por
   defecto).
2. Creá el render en `components/Block.tsx` siguiendo los tokens existentes.
3. Agregalo al menú `/` y a la paleta de comandos.
4. Si necesita estilo propio, usá variables de `app/globals.css`; no inventes
   colores nuevos.

### Agregar un atajo de teclado

Los atajos viven en un único listener global (dentro de `AppShell`). Agregá el
caso ahí, mostralo en el diálogo de atajos (`?`) y en el README.

## Commits y PRs

- Un commit = un cambio con sentido. Mensajes en imperativo y en español:
  `feat(tts): resaltar el segmento activo`.
- Prefijos: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`.
- Antes de abrir el PR:

  ```bash
  npx tsc --noEmit
  npm run build:static      # el export estático es el que se empaqueta
  ```

- Si tocaste la UI, adjuntá una captura. Podés generarlas todas con
  `npm run capturas`.
- Si tocaste `desktop/`, aclaralo: el `.exe` se compila en Windows y no se puede
  verificar desde Linux/macOS.

## Qué buscamos y qué no

**Bienvenido:** accesibilidad, atajos, rendimiento del editor, tipos nuevos de
bloque, correcciones de la lectura en voz alta, traducciones, tests de `lib/`.

**Mejor consultar antes:** cambiar el stack, agregar un backend o sincronización,
meter una librería de UI, cambiar el formato de persistencia (rompe los datos de
quien ya usa la app).

## Licencia

Al contribuir aceptás que tu aporte se publique bajo la licencia [MIT](./LICENSE).
