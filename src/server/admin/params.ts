import { parseLocalDateTime } from "@/lib/dates";

/**
 * Leitura segura dos filtros do /admin a partir da URL (searchParams).
 * Puro e isomórfico: valores inválidos viram "sem filtro".
 */
export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export function param(sp: SearchParamsRecord, key: string, max = 120): string | undefined {
  const raw = sp[key];
  const v = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return v ? v.slice(0, max) : undefined;
}

export function enumParam<T extends string>(sp: SearchParamsRecord, key: string, values: readonly T[]): T | undefined {
  const v = param(sp, key, 40);
  return v && (values as readonly string[]).includes(v) ? (v as T) : undefined;
}

export function pageParam(sp: SearchParamsRecord): number {
  const n = Number.parseInt(param(sp, "pagina", 6) ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 10_000) : 1;
}

/** "AAAA-MM-DD" → início do dia no fuso de Brasília. `endOfDay` devolve o último instante do dia. */
export function dateParam(sp: SearchParamsRecord, key: string, endOfDay = false): Date | undefined {
  const v = param(sp, key, 10);
  if (!v) return undefined;
  const d = parseLocalDateTime(v, endOfDay ? "23:59" : "00:00");
  return d ? new Date(d.getTime() + (endOfDay ? 59_999 : 0)) : undefined;
}

export function idParam(sp: SearchParamsRecord, key: string): string | undefined {
  const v = param(sp, key, 64);
  return v && /^[a-zA-Z0-9_-]+$/.test(v) ? v : undefined;
}
