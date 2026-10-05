/**
 * Datas no Córtex:
 * - Campos "somente data" (prazo, vencimento, previsão de fechamento) são gravados às 12:00 UTC do dia escolhido
 *   e exibidos em UTC — o dia nunca "escorrega" por fuso horário.
 * - Campos de data e hora (reuniões) são instantes reais exibidos no fuso do workspace.
 * - "Hoje" é sempre calculado no fuso do workspace.
 */

export const DAY_MS = 86_400_000;

interface ZonedParts {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  weekday: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(date: Date, tz: string): ZonedParts {
  const parts = Object.fromEntries(partsFormatter(tz).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour) % 24,
    mi: Number(parts.minute),
    s: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday as string] ?? 0,
  };
}

function tzOffsetMs(date: Date, tz: string) {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Converte uma data/hora "de parede" no fuso informado para o instante UTC. */
export function zonedToUtc(y: number, m: number, d: number, h = 0, mi = 0, tz = "America/Sao_Paulo"): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const first = guess - tzOffsetMs(new Date(guess), tz);
  const second = guess - tzOffsetMs(new Date(first), tz);
  return new Date(second);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** AAAA-MM-DD do instante no fuso informado. */
export function dayKeyInTz(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** AAAA-MM-DD de um campo "somente data". */
export function dateOnlyKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`);
}

export function keyToDate(key: string): Date {
  return new Date(`${key}T12:00:00.000Z`);
}

export function addDaysToKey(key: string, days: number): string {
  return dateOnlyKey(new Date(keyToDate(key).getTime() + days * DAY_MS));
}

/** Diferença em dias entre dois AAAA-MM-DD (b - a). */
export function diffKeys(a: string, b: string): number {
  return Math.round((keyToDate(b).getTime() - keyToDate(a).getTime()) / DAY_MS);
}

/** Dias inteiros decorridos entre dois instantes. */
export function daysSince(date: Date | null | undefined, now: Date = new Date()): number | null {
  if (!date) return null;
  return Math.floor((now.getTime() - date.getTime()) / DAY_MS);
}

/** "datetime-local" (AAAA-MM-DDTHH:mm) interpretado no fuso do workspace. */
export function parseLocalDateTime(value: string | null | undefined, tz: string): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  return zonedToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), tz);
}

export function toLocalDateTimeInput(date: Date | null | undefined, tz: string): string {
  if (!date) return "";
  const p = zonedParts(date, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

export type PeriodKey = "today" | "week" | "month" | "quarter" | "year" | "custom";

export interface PeriodRange {
  key: PeriodKey;
  label: string;
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  startKey: string;
  endKey: string;
}

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Hoje",
  week: "Esta semana",
  month: "Este mês",
  quarter: "Este trimestre",
  year: "Este ano",
  custom: "Personalizado",
};

/** Intervalo [start, end) no fuso do workspace e o período anterior equivalente, para comparação. */
export function periodRange(key: PeriodKey, tz: string, now = new Date(), custom?: { from?: string; to?: string }): PeriodRange {
  const p = zonedParts(now, tz);
  let startKey: string;
  let endKey: string; // exclusivo
  let prevStartKey: string;
  switch (key) {
    case "today":
      startKey = `${p.y}-${pad(p.m)}-${pad(p.d)}`;
      endKey = addDaysToKey(startKey, 1);
      prevStartKey = addDaysToKey(startKey, -1);
      break;
    case "week": {
      const today = `${p.y}-${pad(p.m)}-${pad(p.d)}`;
      const offset = (p.weekday + 6) % 7; // segunda-feira
      startKey = addDaysToKey(today, -offset);
      endKey = addDaysToKey(startKey, 7);
      prevStartKey = addDaysToKey(startKey, -7);
      break;
    }
    case "quarter": {
      const qm = Math.floor((p.m - 1) / 3) * 3 + 1;
      startKey = `${p.y}-${pad(qm)}-01`;
      const endM = qm + 3;
      endKey = endM > 12 ? `${p.y + 1}-01-01` : `${p.y}-${pad(endM)}-01`;
      const pm = qm - 3;
      prevStartKey = pm < 1 ? `${p.y - 1}-${pad(pm + 12)}-01` : `${p.y}-${pad(pm)}-01`;
      break;
    }
    case "year":
      startKey = `${p.y}-01-01`;
      endKey = `${p.y + 1}-01-01`;
      prevStartKey = `${p.y - 1}-01-01`;
      break;
    case "custom": {
      const from = custom?.from && /^\d{4}-\d{2}-\d{2}$/.test(custom.from) ? custom.from : `${p.y}-${pad(p.m)}-01`;
      const toIncl = custom?.to && /^\d{4}-\d{2}-\d{2}$/.test(custom.to) ? custom.to : `${p.y}-${pad(p.m)}-${pad(p.d)}`;
      startKey = from <= toIncl ? from : toIncl;
      endKey = addDaysToKey(from <= toIncl ? toIncl : from, 1);
      const length = diffKeys(startKey, endKey);
      prevStartKey = addDaysToKey(startKey, -length);
      break;
    }
    case "month":
    default: {
      startKey = `${p.y}-${pad(p.m)}-01`;
      endKey = p.m === 12 ? `${p.y + 1}-01-01` : `${p.y}-${pad(p.m + 1)}-01`;
      prevStartKey = p.m === 1 ? `${p.y - 1}-12-01` : `${p.y}-${pad(p.m - 1)}-01`;
      break;
    }
  }
  const toInstant = (k: string) => {
    const [y, m, d] = k.split("-").map(Number) as [number, number, number];
    return zonedToUtc(y, m, d, 0, 0, tz);
  };
  return {
    key,
    label: PERIOD_LABELS[key],
    start: toInstant(startKey),
    end: toInstant(endKey),
    prevStart: toInstant(prevStartKey),
    prevEnd: toInstant(startKey),
    startKey,
    endKey: addDaysToKey(endKey, -1),
  };
}

export function isPeriodKey(v: unknown): v is PeriodKey {
  return typeof v === "string" && v in PERIOD_LABELS;
}
