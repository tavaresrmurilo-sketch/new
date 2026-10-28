/**
 * Utilitários de data de calendário.
 *
 * Datas de atendimento e de retorno são "datas de calendário" (sem hora) e
 * trafegam como strings ISO `YYYY-MM-DD`. No banco usam colunas `DATE`, que o
 * Prisma representa como `Date` à meia-noite UTC. "Hoje" depende do fuso
 * horário da empresa, nunca do fuso do servidor.
 */

export type ISODate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string") return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > 2200) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function toUTC(date: ISODate): number {
  const m = ISO_RE.exec(date);
  if (!m) throw new RangeError(`Data inválida: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Data de hoje (YYYY-MM-DD) no fuso informado. */
export function todayIn(timeZone: string, now: Date = new Date()): ISODate {
  const p = zonedParts(now, timeZone);
  return fromUTC(Date.UTC(p.year, p.month - 1, p.day));
}

/** Diferença (em ms) entre o horário local do fuso e UTC naquele instante. */
function offsetMs(instant: number, timeZone: string): number {
  const p = zonedParts(new Date(instant), timeZone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUTC - Math.floor(instant / 1000) * 1000;
}

/** Instante (UTC) correspondente à meia-noite da data no fuso informado. */
export function startOfDayInZone(date: ISODate, timeZone: string): Date {
  const guess = toUTC(date);
  let result = guess - offsetMs(guess, timeZone);
  // Reajuste para transições de horário de verão.
  const corrected = guess - offsetMs(result, timeZone);
  if (corrected !== result) result = corrected;
  return new Date(result);
}

/** Data de calendário (no fuso) de um instante. */
export function dateInZone(instant: Date, timeZone: string): ISODate {
  return todayIn(timeZone, instant);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + days * DAY_MS);
}

export function addMonths(date: ISODate, months: number): ISODate {
  const d = new Date(toUTC(date));
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return fromUTC(d.getTime());
}

/** Número de dias de `from` até `to` (positivo se `to` for posterior). */
export function diffInDays(to: ISODate, from: ISODate): number {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS);
}

export function startOfMonth(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

/** Segunda-feira da semana da data. */
export function startOfWeek(date: ISODate): ISODate {
  const weekday = new Date(toUTC(date)).getUTCDay(); // 0 = domingo
  const delta = weekday === 0 ? -6 : 1 - weekday;
  return addDays(date, delta);
}

export function toDbDate(date: ISODate): Date {
  return new Date(toUTC(date));
}

export function fromDbDate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

/** Calcula a próxima data de retorno sugerida. */
export function computeNextReturnDate(serviceDate: ISODate, intervalDays: number): ISODate {
  if (!Number.isInteger(intervalDays) || intervalDays < 1) {
    throw new RangeError("O intervalo de retorno deve ser um número inteiro de dias maior que zero.");
  }
  return addDays(serviceDate, intervalDays);
}

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** 28/10/2026 */
export function formatDate(date: ISODate): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

/** 28 out 2026 */
export function formatDateShort(date: ISODate, withYear = true): string {
  const [y, m, d] = date.split("-");
  const base = `${Number(d)} ${MONTHS_SHORT[Number(m) - 1]}`;
  return withYear ? `${base} ${y}` : base;
}

export function formatMonthLabel(date: ISODate): string {
  const [y, m] = date.split("-");
  return `${MONTHS_SHORT[Number(m) - 1]}/${y.slice(2)}`;
}

/** Converte DD/MM/AAAA ou AAAA-MM-DD em ISODate. */
export function parseFlexibleDate(input: string): ISODate | null {
  const value = input.trim();
  if (isISODate(value)) return value;
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (br) {
    const iso = `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
    return isISODate(iso) ? iso : null;
  }
  return null;
}

/** "Hoje", "Amanhã", "Ontem", "em 5 dias", "há 3 dias". */
export function relativeDayLabel(target: ISODate, today: ISODate): string {
  const diff = diffInDays(target, today);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  if (diff === -1) return "Ontem";
  if (diff > 1) return `em ${diff} dias`;
  return `há ${Math.abs(diff)} dias`;
}

/** Meses de calendário completos entre duas datas. */
export function fullMonthsBetween(from: ISODate, to: ISODate): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

/** Tempo decorrido em linguagem natural: "45 dias", "6 meses", "1 ano e 2 meses". */
export function humanizeElapsed(from: ISODate, to: ISODate): string {
  const days = diffInDays(to, from);
  if (days < 0) return "0 dias";
  if (days < 60) return days === 1 ? "1 dia" : `${days} dias`;
  const months = fullMonthsBetween(from, to);
  if (months < 12) return months === 1 ? "1 mês" : `${months} meses`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years === 1 ? "1 ano" : `${years} anos`;
  if (rest === 0) return y;
  return `${y} e ${rest === 1 ? "1 mês" : `${rest} meses`}`;
}

export type PeriodKey = "7d" | "30d" | "90d" | "12m" | "ytd";

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
  { key: "12m", label: "12 meses" },
  { key: "ytd", label: "Este ano" },
];

export function isPeriodKey(value: unknown): value is PeriodKey {
  return PERIOD_OPTIONS.some((p) => p.key === value);
}

/** Intervalo fechado [from, to] de datas para o período, terminando hoje. */
export function periodRange(period: PeriodKey, today: ISODate): { from: ISODate; to: ISODate } {
  switch (period) {
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "90d":
      return { from: addDays(today, -89), to: today };
    case "12m":
      return { from: startOfMonth(addMonths(today, -11)), to: today };
    case "ytd":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}
