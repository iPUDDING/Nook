import type { NextConfig } from "next";

/**
 * `BUILD_TARGET=static` produce un sitio 100 % estático en `out/`.
 *
 * Hace falta porque de eso dependen tres cosas: el .exe de Electron (sirve
 * archivos, no un servidor Node), el artifact descargable de CI y la demo en
 * GitHub Pages. En el uso normal —dev y `npm run build` para Vercel— la app
 * sigue funcionando igual que siempre.
 */
const isStatic = process.env.BUILD_TARGET === "static";

/**
 * `BASE_PATH=/nook` prefija todas las rutas (`/nook/_next/...`).
 *
 * Sólo hace falta para GitHub Pages de proyecto (`usuario.github.io/nook/`),
 * donde el sitio NO vive en la raíz del dominio. En el `.exe`, en `next dev` y
 * en un hosting en la raíz del dominio va vacío.
 */
const rawBasePath = (process.env.BASE_PATH ?? "").trim();
const basePath =
  rawBasePath && rawBasePath !== "/"
    ? `/${rawBasePath.replace(/^\/+|\/+$/g, "")}`
    : "";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  ...(isStatic
    ? {
        output: "export" as const,
        // el export estático no tiene el optimizador de imágenes de Next
        images: { unoptimized: true },
        ...(basePath ? { basePath, assetPrefix: basePath } : {}),
      }
    : {}),

  // El sandbox sirve la app detrás de un proxy con otro Host. Sin esto Next
  // responde 403 a los assets de desarrollo (/_next/*) y la página queda pelada.
  // En producción (`next build && next start`) no tiene efecto.
  // Deben ser HOSTNAMES (sin esquema ni puerto) o wildcards de subdominio.
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "*.e2b.app",
    "*.arena.ai",
  ],

  // El badge flotante de Next en desarrollo tapa el pie del sidebar.
  devIndicators: false,

  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
