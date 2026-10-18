import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Confere "Authorization: Bearer <CRON_SECRET>" em tempo constante (compara os
 * hashes, então nem o tamanho do segredo vaza). Sem segredo configurado, nega sempre.
 */
export function isAuthorizedCron(authorization: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret) return false;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? "");
  const given = createHash("sha256").update(match?.[1] ?? "").digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(given, expected) && Boolean(match);
}
