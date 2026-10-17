import { DEFAULT_LOCALE, DEFAULT_TIMEZONE } from "./constants";
import { localDayKey, zonedParts } from "./dates";

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = tz + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(DEFAULT_LOCALE, { timeZone: tz, ...opts });
    cache.set(key, f);
  }
  return f;
}

const clean = (s: string) => s.replace(/\./g, "").replace(/\s+de\s+/g, " ");

export function formatTime(d: Date, tz = DEFAULT_TIMEZONE) {
  return fmt(tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

/** "sáb, 18 out" */
export function formatShortDate(d: Date, tz = DEFAULT_TIMEZONE) {
  return clean(fmt(tz, { weekday: "short", day: "numeric", month: "short" }).format(d));
}

/** "sábado, 18 de outubro de 2026" */
export function formatLongDate(d: Date, tz = DEFAULT_TIMEZONE) {
  return fmt(tz, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
}

export function formatDateTime(d: Date, tz = DEFAULT_TIMEZONE) {
  return `${formatShortDate(d, tz)} · ${formatTime(d, tz)}`;
}

/** Selo de calendário: { day: "18", month: "OUT", weekday: "SÁB" } */
export function dateBadge(d: Date, tz = DEFAULT_TIMEZONE) {
  const p = zonedParts(d, tz);
  const month = clean(fmt(tz, { month: "short" }).format(d)).toUpperCase();
  const weekday = clean(fmt(tz, { weekday: "short" }).format(d)).toUpperCase();
  return { day: String(p.day), month, weekday };
}

/**
 * Rótulo humano do período do evento, relativo a "agora":
 * "Acontecendo agora", "Hoje · 22:00", "Amanhã · 20:00", "sáb, 18 out · 21:00",
 * "18 – 20 out" (vários dias).
 */
export function eventWhenLabel(startsAt: Date, endsAt: Date, now: Date = new Date(), tz = DEFAULT_TIMEZONE): string {
  if (startsAt <= now && endsAt >= now) return "Acontecendo agora";
  const startKey = localDayKey(startsAt, tz);
  const endKey = localDayKey(endsAt, tz);
  const todayKey = localDayKey(now, tz);
  const tomorrowKey = localDayKey(new Date(now.getTime() + 86_400_000), tz);
  const multiDay = endsAt.getTime() - startsAt.getTime() > 24 * 3_600_000 && startKey !== endKey;
  if (multiDay) {
    const s = zonedParts(startsAt, tz);
    const e = zonedParts(endsAt, tz);
    const monthS = clean(fmt(tz, { month: "short" }).format(startsAt));
    const monthE = clean(fmt(tz, { month: "short" }).format(endsAt));
    return s.month === e.month && s.year === e.year ? `${s.day} – ${e.day} ${monthE}` : `${s.day} ${monthS} – ${e.day} ${monthE}`;
  }
  const time = formatTime(startsAt, tz);
  if (startKey === todayKey) return `Hoje · ${time}`;
  if (startKey === tomorrowKey) return `Amanhã · ${time}`;
  return `${formatShortDate(startsAt, tz)} · ${time}`;
}

const brlWhole = new Intl.NumberFormat(DEFAULT_LOCALE, { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brlCents = new Intl.NumberFormat(DEFAULT_LOCALE, { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** R$ 40 (valor inteiro) ou R$ 120,50 (com centavos). Espaços não separáveis viram espaço comum. */
export function formatMoney(cents: number) {
  const f = cents % 100 === 0 ? brlWhole : brlCents;
  return f.format(cents / 100).replace(/[\u00a0\u202f]/g, " ");
}

export function priceLabel(isFree: boolean, minCents: number | null | undefined, maxCents: number | null | undefined): string {
  if (isFree) return "Grátis";
  if (minCents == null && maxCents == null) return "Pago";
  if (minCents != null && maxCents != null && maxCents > minCents) return `${formatMoney(minCents)} – ${formatMoney(maxCents)}`;
  return formatMoney((minCents ?? maxCents) as number);
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  if (km < 10) return `${km.toFixed(1).replace(".", ",")} km`;
  return `${Math.round(km)} km`;
}

const compact = new Intl.NumberFormat(DEFAULT_LOCALE, { notation: "compact", maximumFractionDigits: 1 });
export function formatCompact(n: number) {
  return compact.format(n);
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat(DEFAULT_LOCALE).format(n);
}

const rtf = new Intl.RelativeTimeFormat(DEFAULT_LOCALE, { numeric: "auto" });
export function timeAgo(d: Date, now: Date = new Date()): string {
  const s = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return "agora";
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(Math.round(s / (86400 * 30)), "month");
  return rtf.format(Math.round(s / (86400 * 365)), "year");
}
