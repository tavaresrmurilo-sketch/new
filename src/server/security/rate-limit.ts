import "server-only";
import { prisma } from "@/server/db";

/**
 * Limitador de taxa em janela fixa, persistido no PostgreSQL — funciona com
 * várias instâncias (Vercel/serverless) sem depender de Redis.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export const LIMITS = {
  /** Por e-mail: a proteção principal contra força bruta. */
  login: { limit: 10, windowSec: 5 * 60 },
  /** Por IP: folgado porque redes móveis (CGNAT) e Wi-Fi de eventos compartilham IPs. */
  loginIp: { limit: 60, windowSec: 5 * 60 },
  register: { limit: 30, windowSec: 60 * 60 },
  passwordReset: { limit: 5, windowSec: 60 * 60 },
  verifyResend: { limit: 5, windowSec: 60 * 60 },
  geocode: { limit: 30, windowSec: 60 },
  upload: { limit: 30, windowSec: 10 * 60 },
  report: { limit: 10, windowSec: 60 * 60 },
  engagement: { limit: 120, windowSec: 60 },
  publicApi: { limit: 240, windowSec: 60 },
  mutation: { limit: 60, windowSec: 60 },
  invite: { limit: 20, windowSec: 60 * 60 },
  checkout: { limit: 10, windowSec: 10 * 60 },
  accountExport: { limit: 5, windowSec: 60 * 60 },
  accountDelete: { limit: 10, windowSec: 5 * 60 },
} as const;

export type LimitName = keyof typeof LIMITS;

export async function rateLimit(name: LimitName, subject: string): Promise<RateLimitResult> {
  const { limit, windowSec } = LIMITS[name];
  const key = `${name}:${subject}`;
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSec * 1000);

  // Upsert atômico: reinicia a janela vencida ou incrementa o contador.
  const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
    VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."resetAt" <= ${now} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= ${now} THEN ${resetAt} ELSE "RateLimitBucket"."resetAt" END
    RETURNING "count", "resetAt"`;

  const row = rows[0];
  const count = Number(row.count);
  const retryAfterSeconds = Math.max(0, Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000));
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterSeconds: count <= limit ? 0 : retryAfterSeconds };
}

export function retryMessage(seconds: number): string {
  if (seconds < 60) return `Muitas tentativas. Tente novamente em ${seconds} s.`;
  return `Muitas tentativas. Tente novamente em ${Math.ceil(seconds / 60)} min.`;
}
