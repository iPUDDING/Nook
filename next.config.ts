import type { NextConfig } from "next";

/**
 * `BUILD_TARGET=static` produce un sitio 100 % estático en `out/`.
 *
 * Hace falta porque de eso dependen dos cosas: el .exe (Tauri sirve archivos,
 * no un servidor Node) y el artifact descargable de CI. En el uso normal —dev y
 * `npm run build` para Vercel— la app sigue funcionando igual que siempre.
 */
const isStatic = process.env.BUILD_TARGET === "static";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  ...(isStatic
    ? {
        output: "export" as const,
        // el export estático no tiene el optimizador de imágenes de Next
        images: { unoptimized: true },
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
