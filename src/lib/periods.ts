/**
 * Utilitários de período. Todas as datas de negócio são "date-only" em UTC (meia-noite UTC),
 * compatíveis com colunas @db.Date. "Hoje" é calculado no fuso do tenant.
 */
export interface Period {
  start: Date;
  end: Date; // inclusivo
  label: string;
}

export type PeriodPreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_semester"
  | "this_year"
  | "last_year"
  | "last_3_months"
  | "last_6_months"
  | "last_12_months";

export const MONTHS_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

export function todayInTz(timezone = "America/Sao_Paulo", now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = parts.split("-").map(Number);
  return utcDate(y, m - 1, d);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

export function startOfMonth(d: Date): Date {
  return utcDate(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return utcDate(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
}

export function addMonths(d: Date, n: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const last = utcDate(y, m + 1, 0).getUTCDate();
  return utcDate(y, m, Math.min(d.getUTCDate(), last));
}

export function startOfWeek(d: Date): Date {
  const dow = d.getUTCDay(); // 0 = domingo
  const diff = dow === 0 ? -6 : 1 - dow; // semana começa na segunda
  return addDays(d, diff);
}

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseIsoDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return utcDate(y, m - 1, d);
}

export function formatPeriodLabel(start: Date, end: Date): string {
  const f = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  return start.getTime() === end.getTime() ? f(start) : `${f(start)} até ${f(end)}`;
}

export function makePeriod(start: Date, end: Date, label?: string): Period {
  return { start, end, label: label ?? formatPeriodLabel(start, end) };
}

export function monthPeriod(year: number, monthIndex: number): Period {
  const start = utcDate(year, monthIndex, 1);
  return makePeriod(start, endOfMonth(start), `${MONTHS_PT[monthIndex]} de ${year}`);
}

export function isFullMonth(p: Period): boolean {
  return p.start.getUTCDate() === 1 && p.end.getTime() === endOfMonth(p.start).getTime() && monthKey(p.start) === monthKey(p.end);
}

export function isMonthAligned(p: Period): boolean {
  return p.start.getUTCDate() === 1 && p.end.getTime() === endOfMonth(p.end).getTime();
}

export function resolvePreset(preset: PeriodPreset, today: Date): Period {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  switch (preset) {
    case "today":
      return makePeriod(today, today, "hoje");
    case "yesterday": {
      const d = addDays(today, -1);
      return makePeriod(d, d, "ontem");
    }
    case "this_week":
      return makePeriod(startOfWeek(today), today, "esta semana");
    case "last_week": {
      const s = addDays(startOfWeek(today), -7);
      return makePeriod(s, addDays(s, 6), "semana passada");
    }
    case "this_month":
      return makePeriod(utcDate(y, m, 1), today, `${MONTHS_PT[m]} de ${y} (até hoje)`);
    case "last_month":
      return monthPeriod(m === 0 ? y - 1 : y, (m + 11) % 12);
    case "this_quarter": {
      const q = Math.floor(m / 3);
      return makePeriod(utcDate(y, q * 3, 1), today, `${q + 1}º trimestre de ${y}`);
    }
    case "last_quarter": {
      const q = Math.floor(m / 3) - 1;
      const qy = q < 0 ? y - 1 : y;
      const qi = (q + 4) % 4;
      const s = utcDate(qy, qi * 3, 1);
      return makePeriod(s, endOfMonth(utcDate(qy, qi * 3 + 2, 1)), `${qi + 1}º trimestre de ${qy}`);
    }
    case "this_semester": {
      const s = m < 6 ? 0 : 6;
      return makePeriod(utcDate(y, s, 1), today, `${s === 0 ? 1 : 2}º semestre de ${y}`);
    }
    case "this_year":
      return makePeriod(utcDate(y, 0, 1), today, `${y} (até hoje)`);
    case "last_year":
      return makePeriod(utcDate(y - 1, 0, 1), utcDate(y - 1, 11, 31), `${y - 1}`);
    case "last_3_months":
      return makePeriod(utcDate(y, m - 3, 1), endOfMonth(utcDate(y, m - 1, 1)), "últimos 3 meses fechados");
    case "last_6_months":
      return makePeriod(utcDate(y, m - 6, 1), endOfMonth(utcDate(y, m - 1, 1)), "últimos 6 meses fechados");
    case "last_12_months":
      return makePeriod(utcDate(y, m - 12, 1), endOfMonth(utcDate(y, m - 1, 1)), "últimos 12 meses fechados");
  }
}

/** "Em setembro de 2026" / "Ontem" — prefixo natural para frases. */
export function inPeriod(label: string): string {
  if (["hoje", "ontem", "esta semana", "semana passada"].includes(label)) return label.charAt(0).toUpperCase() + label.slice(1);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(label)) return `Em ${label}`;
  if (/^(últimos|próximos)/.test(label)) return `Nos ${label}`;
  return `Em ${label}`;
}

/** Desloca um período em N meses preservando o alinhamento (mês cheio → mês cheio). */
export function shiftMonths(p: Period, n: number): Period {
  const start = addMonths(p.start, n);
  const end = isMonthAligned(p) ? endOfMonth(addMonths(p.end, n)) : addMonths(p.end, n);
  return makePeriod(start, end);
}

/** Período anterior equivalente. Meses são comparados com meses; demais períodos com a mesma duração. */
export function previousPeriod(p: Period): Period {
  const sameMonth = monthKey(p.start) === monthKey(p.end);
  if (p.start.getUTCDate() === 1 && (sameMonth || isMonthAligned(p))) {
    const months =
      (p.end.getUTCFullYear() - p.start.getUTCFullYear()) * 12 + (p.end.getUTCMonth() - p.start.getUTCMonth()) + 1;
    return shiftMonths(p, -months);
  }
  const len = diffDays(p.end, p.start) + 1;
  return makePeriod(addDays(p.start, -len), addDays(p.start, -1));
}

export function samePeriodLastYear(p: Period): Period {
  return shiftMonths(p, -12);
}

export function monthsBetween(start: Date, end: Date): string[] {
  const keys: string[] = [];
  let cur = startOfMonth(start);
  while (cur.getTime() <= end.getTime()) {
    keys.push(monthKey(cur));
    cur = utcDate(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1);
  }
  return keys;
}

export function eachDay(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  for (let d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) days.push(d);
  return days;
}
