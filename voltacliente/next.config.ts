import path from "node:path";
import type { NextConfig } from "next";

// Raiz explícita: o repositório contém outro projeto na pasta pai.
const projectRoot = path.resolve(__dirname);

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: projectRoot,
  // O app autenticado é inteiramente dinâmico por empresa; Cache Components
  // não traz ganho aqui e exigiria Suspense em cada leitura de sessão.
  cacheComponents: false,
  experimental: {
    serverActions: {
      // Importação de clientes via CSV envia o conteúdo do arquivo (até ~2 MB).
      bodySizeLimit: "3mb",
    },
  },
  turbopack: {
    root: projectRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
