/**
 * Datas com fuso horário (sem dependências): cálculo de "hoje", "fim de semana"
 * etc. no fuso do evento/usuário, e conversão de horário local ↔ UTC.
 */
import { DEFAULT_TIMEZONE } from "./constants";

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = domingo
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(date: Date, tz: string = DEFAULT_TIMEZONE): ZonedParts {
  const parts: Record<string, string> = {};
  for (const p of dtf(tz).formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday] ?? 0,
  };
}

/** Diferença (minutos) entre o horário local do fuso e UTC naquele instante. Ex.: São Paulo = -180. */
export function tzOffsetMinutes(date: Date, tz: string = DEFAULT_TIMEZONE): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** Converte um horário de parede (no fuso `tz`) para o instante UTC correspondente. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  tz: string = DEFAULT_TIMEZONE,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const off1 = tzOffsetMinutes(new Date(guess), tz);
  const candidate = guess - off1 * 60000;
  const off2 = tzOffsetMinutes(new Date(candidate), tz);
  return new Date(off1 === off2 ? candidate : guess - off2 * 60000);
}

/** "2026-10-18" + "21:30" no fuso → Date UTC. */
export function parseLocalDateTime(date: string, time: string, tz: string = DEFAULT_TIMEZONE): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return null;
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi] = [Number(tm[1]), Number(tm[2])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const result = zonedTimeToUtc(y, mo, d, h, mi, tz);
  const back = zonedParts(result, tz);
  if (back.day !== d || back.month !== mo) return null; // ex.: 31/02
  return result;
}

/** Date UTC → { date: "2026-10-18", time: "21:30" } no fuso. */
export function toLocalInputs(date: Date, tz: string = DEFAULT_TIMEZONE): { date: string; time: string } {
  const p = zonedParts(date, tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

export function localDayKey(date: Date, tz: string = DEFAULT_TIMEZONE): string {
  return toLocalInputs(date, tz).date;
}

function startOfLocalDay(date: Date, tz: string, addDays = 0): Date {
  const p = zonedParts(date, tz);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + addDays));
  return zonedTimeToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 0, 0, tz);
}

export type DatePreset = "upcoming" | "now" | "today" | "tomorrow" | "weekend" | "week" | "month";

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "upcoming", label: "Em breve" },
  { value: "now", label: "Agora" },
  { value: "today", label: "Hoje" },
  { value: "tomorrow", label: "Amanhã" },
  { value: "weekend", label: "Fim de semana" },
  { value: "week", label: "Esta semana" },
  { value: "month", label: "Próximos 30 dias" },
];

export interface DateRange {
  from: Date;
  to: Date;
}

/** Janela máxima de busca para "Em breve". */
export const UPCOMING_WINDOW_DAYS = 180;

/**
 * Intervalo de datas de um filtro. Um evento entra no filtro se o seu
 * período [início, fim] se sobrepõe ao intervalo e ele ainda não terminou.
 * Aceita também "YYYY-MM-DD" (um dia) ou "YYYY-MM-DD..YYYY-MM-DD".
 */
export function resolveDateRange(value: string | null | undefined, now: Date = new Date(), tz: string = DEFAULT_TIMEZONE): DateRange {
  const v = (value ?? "upcoming") as DatePreset | string;
  const endOf = (d: Date) => new Date(d.getTime() - 1);
  switch (v) {
    case "now":
      return { from: now, to: now };
    case "today":
      return { from: now, to: endOf(startOfLocalDay(now, tz, 1)) };
    case "tomorrow":
      return { from: startOfLocalDay(now, tz, 1), to: endOf(startOfLocalDay(now, tz, 2)) };
    case "weekend": {
      const wd = zonedParts(now, tz).weekday;
      // Sexta 18h até domingo 23h59; se já for fim de semana, de agora até domingo.
      const daysToSunday = (7 - wd) % 7;
      const sundayEnd = endOf(startOfLocalDay(now, tz, daysToSunday + 1));
      if (wd === 6 || wd === 0) return { from: now, to: sundayEnd };
      if (wd === 5) {
        const p = zonedParts(now, tz);
        const fri18 = zonedTimeToUtc(p.year, p.month, p.day, 18, 0, tz);
        return { from: now > fri18 ? now : fri18, to: sundayEnd };
      }
      const friday = startOfLocalDay(now, tz, 5 - wd);
      const fp = zonedParts(friday, tz);
      return { from: zonedTimeToUtc(fp.year, fp.month, fp.day, 18, 0, tz), to: sundayEnd };
    }
    case "week": {
      const wd = zonedParts(now, tz).weekday;
      const daysToSunday = (7 - wd) % 7;
      return { from: now, to: endOf(startOfLocalDay(now, tz, daysToSunday + 1)) };
    }
    case "month":
      return { from: now, to: new Date(now.getTime() + 30 * 86_400_000) };
    case "upcoming":
      return { from: now, to: new Date(now.getTime() + UPCOMING_WINDOW_DAYS * 86_400_000) };
    default: {
      const m = /^(\d{4}-\d{2}-\d{2})(?:\.\.(\d{4}-\d{2}-\d{2}))?$/.exec(v);
      if (m) {
        const a = parseLocalDateTime(m[1], "00:00", tz);
        const b = parseLocalDateTime(m[2] ?? m[1], "00:00", tz);
        if (a && b && b >= a) {
          const to = endOf(startOfLocalDay(b, tz, 1));
          return { from: a < now ? now : a, to };
        }
      }
      return { from: now, to: new Date(now.getTime() + UPCOMING_WINDOW_DAYS * 86_400_000) };
    }
  }
}

export function isDatePreset(v: string): v is DatePreset {
  return DATE_PRESETS.some((p) => p.value === v);
}
