# Seguridad

## Modelo de amenaza

Nook es una app **local**: no tiene servidor, no tiene cuentas y **no envía datos
a ninguna parte**. Tus notas viven en `localStorage` (versión web) o en el perfil
de la app (`%APPDATA%\Nook` en Windows).

Lo que eso implica:

- no hay superficie de ataque del lado servidor;
- no hay telemetría ni servicios de terceros;
- en la versión de escritorio, el renderer corre con `contextIsolation: true`,
  `nodeIntegration: false` y `sandbox: true`: la UI no tiene acceso a Node ni al
  sistema de archivos;
- las rutas que sirve el proceso principal (`nook://`) están confinadas a la
  carpeta de la app: se rechaza cualquier intento de salir con `../`.

## Reportar una vulnerabilidad

Abrí un [aviso privado de seguridad](https://docs.github.com/es/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
en la pestaña **Security → Report a vulnerability** del repositorio.

Incluí: versión, sistema operativo, pasos para reproducir y, si podés, una prueba
de concepto mínima. Respondemos en menos de 7 días.

## Falsa alarma frecuente: SmartScreen

El `.exe` no está firmado con un certificado de código (cuesta ~USD 300/año). Por
eso Windows SmartScreen advierte la primera vez que se ejecuta. **No es un
indicador de malware**: es un binario compilado por el propio proyecto. Si querés
verificarlo, compilalo vos mismo con `cd desktop && npm run build:win`.
