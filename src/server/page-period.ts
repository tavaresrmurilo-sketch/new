import { makePeriod, parseIsoDate, resolvePreset, type Period, type PeriodPreset } from "@/lib/periods";
import { PRESETS } from "@/server/ai/period-parse";

export type SearchParams = Record<string, string | string[] | undefined>;

export function sp(params: SearchParams, key: string): string | undefined {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

/** Período global (?period=preset ou ?start=AAAA-MM-DD&end=AAAA-MM-DD). */
export function resolvePagePeriod(params: SearchParams, today: Date, fallback: PeriodPreset = "this_month"): Period {
  const start = sp(params, "start");
  const end = sp(params, "end");
  if (start && end && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
    const s = parseIsoDate(start);
    const e = parseIsoDate(end);
    if (s <= e) return makePeriod(s, e);
  }
  const preset = sp(params, "period");
  if (preset && (PRESETS as readonly string[]).includes(preset)) return resolvePreset(preset as PeriodPreset, today);
  return resolvePreset(fallback, today);
}
