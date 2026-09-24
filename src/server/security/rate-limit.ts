/**
 * Rate limiter de janela deslizante em memória. Adequado para instância única;
 * em produção com múltiplas instâncias substitua o store por Redis (ver SECURITY.md).
 */
interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    for (const [k, b] of buckets) if (!b.hits.length || now - b.hits[b.hits.length - 1] > windowMs * 2) buckets.delete(k);
    lastSweep = now;
  }
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((windowMs - (now - bucket.hits[0])) / 1000) };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { allowed: true, remaining: limit - bucket.hits.length, retryAfterSeconds: 0 };
}

export const LIMITS = {
  login: { limit: 10, windowMs: 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000 },
  chat: { limit: 30, windowMs: 60_000 },
  import: { limit: 20, windowMs: 60_000 },
  export: { limit: 30, windowMs: 60_000 },
  api: { limit: 240, windowMs: 60_000 },
} as const;
