import "server-only";
import { db } from "@/lib/db";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Janela fixa guardada no PostgreSQL — funciona entre várias instâncias serverless.
 * O INSERT ... ON CONFLICT é atômico: não há condição de corrida entre requisições.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const rows = await db.$queryRaw<Array<{ count: number; resetAt: Date }>>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt")
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."resetAt" <= now() THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" <= now() THEN now() + make_interval(secs => ${windowSeconds}) ELSE "RateLimit"."resetAt" END
    RETURNING "count", "resetAt"
  `;
  const row = rows[0];

  // Limpeza oportunista de janelas antigas (≈1% das chamadas).
  if (Math.random() < 0.01) {
    await db.rateLimit.deleteMany({ where: { resetAt: { lt: new Date(Date.now() - 86_400_000) } } }).catch(() => undefined);
  }

  const retryAfterSeconds = Math.max(0, Math.ceil((row.resetAt.getTime() - Date.now()) / 1000));
  return { allowed: row.count <= limit, remaining: Math.max(0, limit - row.count), retryAfterSeconds };
}

export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Muitas tentativas. Tente novamente em ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} min.`);
  }
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const result = await rateLimit(key, limit, windowSeconds);
  if (!result.allowed) throw new RateLimitError(result.retryAfterSeconds);
}
