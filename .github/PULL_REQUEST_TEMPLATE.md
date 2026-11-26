## Qué cambia

<!-- Una o dos frases. Si arregla un issue: "Closes #12" -->

## Por qué

<!-- El problema, no la solución. Si hay trade-offs, decilos acá. -->

## Cómo probarlo

```bash
npx tsc --noEmit
npm run build:static
```

<!-- Pasos manuales si hacen falta. Captura antes/después si tocaste UI. -->

## Checklist

- [ ] `npx tsc --noEmit` pasa
- [ ] `npm run build:static` pasa
- [ ] No agregué dependencias de UI ni assets externos
- [ ] Usé los tokens de diseño existentes (no inventé colores ni tamaños)
- [ ] Si agregué estado al store, decidí si se persiste o es efímero
- [ ] Actualicé README/CHANGELOG si el cambio es visible para quien usa la app
