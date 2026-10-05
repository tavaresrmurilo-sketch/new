import "server-only";
import { prisma } from "@/lib/db";
import { AppError } from "@/server/errors";

/**
 * Rate limiting em janela fixa persistido no PostgreSQL — funciona em ambientes serverless
 * (várias instâncias) sem depender de Redis.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const rows = await prisma.$queryRaw<{ count: number; expiresAt: Date }[]>`
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count", "expiresAt")
    VALUES (${key}, now(), 1, now() + make_interval(secs => ${windowSeconds}))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."expiresAt" < now() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimitBucket"."expiresAt" < now() THEN now() ELSE "RateLimitBucket"."windowStart" END,
      "expiresAt" = CASE WHEN "RateLimitBucket"."expiresAt" < now() THEN now() + make_interval(secs => ${windowSeconds}) ELSE "RateLimitBucket"."expiresAt" END
    RETURNING "count", "expiresAt"`;
  const row = rows[0];
  const count = Number(row?.count ?? 0);
  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: row ? Math.max(1, Math.ceil((row.expiresAt.getTime() - Date.now()) / 1000)) : windowSeconds,
  };
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  const result = await rateLimit(key, limit, windowSeconds);
  if (!result.ok) {
    throw new AppError(
      "RATE_LIMITED",
      `Muitas tentativas. Aguarde ${Math.ceil(result.retryAfterSeconds / 60)} minuto(s) e tente novamente.`,
    );
  }
  return result;
}
