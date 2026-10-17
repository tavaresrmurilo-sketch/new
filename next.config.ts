import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

function origin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// Domínios de mapa (style.json, tiles, glyphs, sprites) e do bucket de imagens.
const mapHosts = (process.env.MAP_CSP_HOSTS ?? "https://tiles.openfreemap.org").split(/\s+/).filter(Boolean);
for (const s of [process.env.NEXT_PUBLIC_MAP_STYLE_DARK, process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT]) {
  const o = origin(s);
  if (o && !mapHosts.includes(o)) mapHosts.push(o);
}
const imageHosts = [origin(process.env.S3_PUBLIC_URL), "https://lh3.googleusercontent.com"].filter(Boolean) as string[];

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${[...mapHosts, ...imageHosts].join(" ")}`,
  "font-src 'self' data:",
  `connect-src 'self' ${mapHosts.join(" ")}${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "child-src blob:",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self' https://accounts.google.com https://checkout.stripe.com https://billing.stripe.com",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // Permite servidores de desenvolvimento paralelos (cada um com sua pasta de build).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["@prisma/client", "sharp", "bcryptjs", "nodemailer", "web-push", "@aws-sdk/client-s3"],
  images: { unoptimized: true },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

export default nextConfig;
