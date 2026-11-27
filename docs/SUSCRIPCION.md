# Suscripción

## Qué se entrega

La app arranca con la suscripción **activa** en el plan **Business**: todas las
capacidades habilitadas y sin límites prácticos. No hay que activar nada, no hay
pantalla de pago y no hay cuenta.

```
Configuración → Plan
```

ahí se ve el plan, las 8 capacidades incluidas, la cantidad de miembros, los
días de historial y la activación por licencia.

## Qué es y qué no es

| | |
|---|---|
| **Es** | una capa de producto: planes, capacidades por plan, activación por licencia **offline** y gating real en el store |
| **No es** | un cobro. No hay pasarela de pago, ni servidor, ni cuenta de usuario, ni telemetría |
| **No es** | DRM. El binario es auditable; cualquiera puede compilarlo con todo desbloqueado. Eso es intencional |

Por qué: Nook no tiene backend. Un cobro real necesita, como mínimo, un servidor
que cree la sesión de pago, reciba el webhook del proveedor y emita la licencia.
Sin eso, cualquier "compra" en la UI sería una simulación — y una simulación que
se ve como cobro es peor que no tener cobro.

## Modelo de licencias

Formato: `NOOK-XXXX-XXXX-XXXX` (12 caracteres después del prefijo).

- **Alfabeto sin ambigüedad**: `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`. Sin `0/O` ni
  `1/I`, que es lo que se transcribe mal a mano.
- **Checksum**: el último carácter se deriva de los 11 anteriores
  (`checksumOf` en `lib/plan.ts`). Detecta errores de tipeo; no es una firma
  criptográfica.
- **Validación local**: `isValidLicenseKey()` no hace red. Si la clave sirve, se
  guarda en el estado persistido (`plan.license`).

Clave de demostración (válida):

```
NOOK-DEMA-KPR2-X6QT
```

Generar más (para ventas o QA):

```js
import { completeLicenseKey } from "@/lib/plan";
completeLicenseKey("DEMAKPR2X6Q"); // NOOK-DEMA-KPR2-X6QT
```

> `completeLicenseKey` está en el bundle. Es inevitable en una app sin servidor:
> lo que protege es la licencia del código (MIT permite forkear igual), no el
> checksum.

## Qué desbloquea

| Capacidad | Gratis (sin suscripción) | Con suscripción |
|---|---|---|
| Miembros | 10 | **ilimitados** |
| Historial de Pomodoro | 7 días | **ilimitado** |
| Tablas en documentos | — | ilimitadas |
| Markdown (importar / pegar / exportar) | — | sin límite |
| Lectura en voz alta + resaltado | — | todas las voces |
| Mapas mentales | — | ilimitados |
| Modo lectura y papeles | — | los cuatro |
| Respaldo y restauración | — | sin límite |

El gating se aplica en el store, no en la UI: `seatLimit()` e `historyLimit()`
son la única fuente de verdad (`lib/plan.ts`) y `inviteMember` / `logPomodoro`
las consultan. Con la suscripción activa devuelven `null` = sin techo.

## Cómo activar, cancelar y reactivar

- **Activar**: Configuración → Plan → pegá la clave → *Activar*. Queda persistida.
- **Cancelar**: *Cancelar suscripción*. No se borra nada: el workspace pasa a las
  capacidades del plan Gratis (10 miembros, historial de 7 días). Lo que ya está
  escrito no se toca.
- **Reactivar**: *Reactivar suscripción* (usa la demo) o pegá otra clave.
- **Cambiar de plan**: el selector al lado de los botones. `Business` y
  `Enterprise` incluyen todo; `Pro` también, salvo lo que marque un plan futuro.

## Si algún día hay cobro real

El orden que funciona sin reescribir la app:

1. **Backend mínimo** (una función serverless alcanza) con Stripe Checkout.
2. **Webhook** `checkout.session.completed` → emitir licencia con
   `completeLicenseKey` y guardarla asociada al correo del comprador.
3. **Portal de cliente** de Stripe para cancelaciones (no construir facturación).
4. En la app: reemplazar `activateLicense` por una verificación contra el backend
   con caché local, para que siga funcionando sin conexión.
5. Nunca guardar claves de Stripe en el binario: el `.exe` es público.

Hasta entonces, la licencia offline es el mecanismo correcto: simple, auditable y
no engaña a nadie mostrando un checkout que no cobra.

---

## Qué capacidad de Notion hay detrás de cada plan

Los planes de Nook no son una tabla inventada: siguen la escala de Notion
(consultada en noviembre de 2026) en los ejes que una app **local y sin cuentas**
puede cumplir de verdad.

| Eje | Gratis | Pro | Business | Enterprise |
|---|---|---|---|---|
| Precio | USD 0 | USD 8 | USD 15 | A medida |
| Miembros | 10 | sin tope | sin tope | sin tope |
| **Historial de versiones** | **7 días** | **30 días** | **90 días** | **sin límite** |
| Adjuntos: por archivo | 5 MB | 5 GB | 5 GB | 5 GB |
| Adjuntos: total | 512 MB | sin tope | sin tope | sin tope |
| Versiones por página | 30 | 30 | 30 | 30 |

### Lo que sí es implementable (hoja de ruta)

| Función de Notion | Equivalente local honesto | Estado |
|---|---|---|
| Historial de páginas | fotos por página con retención por plan | **0.5.0** |
| Invitados (10/100/250/∞) | invitados con rol de sólo lectura, aparte de los miembros | pendiente |
| Espacios privados de equipo | páginas privadas por miembro | pendiente |
| Gráficos en bases de datos | gráfico de barras/líneas sobre las vistas existentes | pendiente |
| Automatizaciones | reglas «cuando… entonces…» ejecutadas en el cliente | pendiente |
| Analítica / auditoría | contadores locales y registro de cambios | pendiente |
| Exportación masiva | **un solo HTML** con índice y todas las páginas (imprimible a PDF) | **0.6.0** |
| Límite de subida (5 MB / 5 GB) | tope por archivo y total de adjuntos, con IndexedDB | **0.10.0** |

### Lo que no se puede y no se simula

| Función de Notion | Por qué no |
|---|---|
| SSO SAML (Business) | no hay servidor de identidad ni cuentas |
| SCIM (Enterprise) | idem: aprovisionamiento entre servidores |
| DLP / SIEM / retención cero | no hay proveedores LLM ni backend que auditar |
| Notion AI incluida | exige servidores ajenos; la vía honesta sería «traé tu clave» y rompería la promesa sin red |

Mostrar un interruptor de «SSO activado» que no hace nada sería mentir en la
pantalla que el usuario usa para decidir qué comprar. Por eso no está.
