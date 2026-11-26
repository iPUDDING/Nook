import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

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
