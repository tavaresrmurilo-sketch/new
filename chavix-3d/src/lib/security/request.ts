import "server-only";
import { headers } from "next/headers";

/** IP do cliente (Vercel/proxies preenchem x-forwarded-for; usamos o primeiro da lista). */
export function clientIpFrom(h: Headers): string {
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 64);
  return (h.get("x-real-ip") ?? "0.0.0.0").slice(0, 64);
}

export async function getClientIp(): Promise<string> {
  return clientIpFrom(await headers());
}

export async function getUserAgent(): Promise<string> {
  return ((await headers()).get("user-agent") ?? "").slice(0, 300);
}

/**
 * Proteção CSRF para Route Handlers que alteram dados: exige que a requisição venha
 * da própria origem. (Server Actions já têm essa verificação embutida no Next.js.)
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
