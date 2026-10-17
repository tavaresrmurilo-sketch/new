import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** HMAC do token com AUTH_SECRET: o banco nunca guarda tokens utilizáveis. */
export function hashToken(token: string): string {
  return createHmac("sha256", env().AUTH_SECRET).update(token).digest("hex");
}

export function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Identificador anônimo e rotativo por dia (métricas sem guardar IP). */
export function dailyVisitorHash(ip: string | null, userAgent: string | null, day: string): string {
  return createHmac("sha256", env().AUTH_SECRET)
    .update(`visitor:${day}:${ip ?? "-"}:${userAgent ?? "-"}`)
    .digest("hex")
    .slice(0, 32);
}

export function ipHash(ip: string | null): string | null {
  if (!ip) return null;
  return createHmac("sha256", env().AUTH_SECRET).update(`ip:${ip}`).digest("hex").slice(0, 32);
}
