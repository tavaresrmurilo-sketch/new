import "server-only";
import { headers } from "next/headers";
import { env } from "@/server/env";

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

function pickIp(h: Headers): string | null {
  // Na Vercel x-forwarded-for é definido pela plataforma; atrás de outro proxy, ative TRUST_PROXY.
  if (process.env.VERCEL || env().TRUST_PROXY) {
    const fwd = h.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0].trim() || null;
    const real = h.get("x-real-ip");
    if (real) return real.trim();
  }
  return h.get("x-real-ip") ?? (env().NODE_ENV !== "production" ? "127.0.0.1" : null);
}

export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  return { ip: pickIp(h), userAgent: h.get("user-agent")?.slice(0, 400) ?? null };
}

/** Requisição vinda do app nativo (o WebView acrescenta "MixtourApp" ao user-agent). */
export async function isNativeAppRequest(): Promise<boolean> {
  const h = await headers();
  return /\bMixtourApp\b/.test(h.get("user-agent") ?? "");
}

export function requestMetaFrom(req: Request): RequestMeta {
  return { ip: pickIp(req.headers), userAgent: req.headers.get("user-agent")?.slice(0, 400) ?? null };
}

/**
 * Proteção CSRF para Route Handlers que alteram estado (Server Actions já
 * verificam Origin nativamente). Aceita apenas a mesma origem.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") === "same-origin";
  try {
    const o = new URL(origin);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return o.host === host || o.origin === new URL(env().APP_URL).origin;
  } catch {
    return false;
  }
}
