import "server-only";
import sharp from "sharp";
import { iconSvg } from "@/components/map/icon-svg";
import { env } from "@/server/env";
import { readLocalObject } from "@/server/storage";

/**
 * Peças das imagens de compartilhamento (Open Graph) geradas com next/og.
 * Sem fontes externas: usa a fonte embutida do next/og.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_BG = "#08080d";

const MAX_REMOTE_BYTES = 8 * 1024 * 1024;

async function readImageBytes(url: string): Promise<Buffer | null> {
  if (url.startsWith("/media/")) return readLocalObject(decodeURIComponent(url.slice("/media/".length)));
  const base = env().S3_PUBLIC_URL?.replace(/\/$/, "");
  // Só busca imagens do próprio bucket (nada de URLs arbitrárias: evita SSRF).
  if (!base || !url.startsWith(`${base}/`)) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) return null;
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_REMOTE_BYTES) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length > MAX_REMOTE_BYTES ? null : buf;
}

/** Imagem enviada (WebP) → JPEG recortado em data URI, pronto para o ImageResponse. Falhas → null. */
export async function imageDataUri(url: string | null | undefined, width: number, height: number): Promise<string | null> {
  if (!url) return null;
  try {
    const bytes = await readImageBytes(url);
    if (!bytes) return null;
    const jpeg = await sharp(bytes, { limitInputPixels: 50_000_000 })
      .resize({ width, height, fit: "cover", position: "attention" })
      .jpeg({ quality: 80 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** Ícone de categoria (lucide) como imagem, na cor pedida. */
export function categoryIconUri(icon: string, color = "#ffffff", size = 48, stroke = 2): string {
  return svgDataUri(iconSvg(icon, size, stroke).replace(/currentColor/g, color));
}

/** Ícones de apoio (calendário e pino) desenhados à mão, sem depender de bibliotecas. */
export function glyphUri(kind: "calendar" | "pin" | "ticket" | "users", color: string, size = 30): string {
  const paths: Record<typeof kind, string> = {
    calendar: '<rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>',
    pin: '<path d="M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    ticket: '<path d="M3 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a3 3 0 0 0 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  };
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[kind]}</svg>`,
  );
}

/** Símbolo do Mixtour (pino com equalizador) com o gradiente da marca. */
export function logoMarkUri(size = 64): string {
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48"><defs><linearGradient id="g" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7C5CFF"/><stop offset="0.45" stop-color="#B04DFF"/><stop offset="0.75" stop-color="#FF4D8D"/><stop offset="1" stop-color="#FF8A3D"/></linearGradient></defs><path d="M24 3C14.6 3 7 10.4 7 19.6c0 11.4 13.6 23.3 15.6 25a2.2 2.2 0 0 0 2.8 0C27.4 42.9 41 31 41 19.6 41 10.4 33.4 3 24 3Z" fill="url(#g)"/><g fill="#fff"><rect x="15.5" y="16" width="3.2" height="7" rx="1.6"/><rect x="20.1" y="13" width="3.2" height="13" rx="1.6"/><rect x="24.7" y="14.5" width="3.2" height="10" rx="1.6"/><rect x="29.3" y="17" width="3.2" height="5" rx="1.6"/></g></svg>`,
  );
}

/** Domínio exibido no rodapé das imagens. */
export function siteHost(): string {
  try {
    // Sem env(): a imagem padrão é gerada no build, antes de todas as variáveis existirem.
    return new URL(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://mixtour.app").host;
  } catch {
    return "mixtour.app";
  }
}

export function truncateText(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Rodapé com a marca. */
export function BrandFooter({ dark = true }: { dark?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <img src={logoMarkUri(52)} width={52} height={52} alt="" />
      <div style={{ display: "flex", fontSize: 34, letterSpacing: -1.2, color: dark ? "#ffffff" : "#12121a" }}>
        <span>mix</span>
        <span style={{ color: "#ff4d8d", marginLeft: -8 }}>tour</span>
      </div>
      <div style={{ display: "flex", marginLeft: 10, fontSize: 22, color: dark ? "rgba(255,255,255,0.5)" : "#5f5f76" }}>{siteHost()}</div>
    </div>
  );
}

/** Imagem padrão da marca (página inicial e páginas sem imagem própria). */
export function BrandCard({ headline, subline }: { headline: string; subline: string }) {
  const dots = ["#7C5CFF", "#FF4D8D", "#FF7A30", "#00A3C4", "#0FA88E", "#E8A100", "#1C8CE3"];
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: OG_BG,
        color: "#fff",
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", top: -260, left: -200, width: 720, height: 720, borderRadius: 9999, background: "rgba(124,92,255,0.35)", filter: "blur(120px)" }} />
      <div style={{ position: "absolute", bottom: -300, right: -160, width: 760, height: 760, borderRadius: 9999, background: "rgba(255,77,141,0.28)", filter: "blur(130px)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <img src={logoMarkUri(88)} width={88} height={88} alt="" />
        <div style={{ display: "flex", fontSize: 64, letterSpacing: -2.5 }}>
          <span>mix</span>
          <span style={{ color: "#ff4d8d", marginLeft: -14 }}>tour</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 940 }}>
        <div style={{ fontSize: 68, lineHeight: 1.08, letterSpacing: -2.4 }}>{headline}</div>
        <div style={{ marginTop: 22, fontSize: 30, lineHeight: 1.4, color: "rgba(255,255,255,0.68)" }}>{subline}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 14 }}>
          {dots.map((c) => (
            <div key={c} style={{ width: 22, height: 22, borderRadius: 9999, background: c, border: "4px solid rgba(255,255,255,0.15)" }} />
          ))}
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "rgba(255,255,255,0.5)" }}>{siteHost()}</div>
      </div>
    </div>
  );
}
