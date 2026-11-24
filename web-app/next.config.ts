import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Sin la optimización de Vercel (Tarea 6.17: el cupo del plan Hobby se agota y responde 402):
    // las fotos se piden a la CDN en el tamaño justo y los escudos salen de public/logos
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
  },
  async headers() {
    return [
      {
        // Seguridad básica en todas las rutas. Sin CSP completa: Next.js mete scripts en línea y habría que usar nonces.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Nadie puede incrustar la web en otra página (la app nativa la carga directamente, no en un iframe)
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
      {
        // Escudos de los 30 equipos (`npm run logos`): caché larga y, abiertos sueltos, sin poder ejecutar nada
        source: "/logos/:file*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=2592000" },
          { key: "Content-Security-Policy", value: "default-src 'none'; style-src 'unsafe-inline'" },
        ],
      },
      {
        // Patrones de las fichas 3D (`npm run cards`)
        source: "/cards/:file*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=2592000" },
          { key: "Content-Security-Policy", value: "default-src 'none'; style-src 'unsafe-inline'" },
        ],
      },
      {
        // Sin caché: el navegador debe ver siempre la última versión del service worker
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
