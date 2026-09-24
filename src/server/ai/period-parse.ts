import {
  endOfMonth, makePeriod, MONTHS_PT, monthPeriod, parseIsoDate, resolvePreset, utcDate, type Period, type PeriodPreset,
} from "@/lib/periods";
import { normalizeText } from "@/lib/utils";

export interface PeriodInput {
  preset?: PeriodPreset | "custom" | "month";
  start?: string;
  end?: string;
  month?: number;
  year?: number;
  lastMonths?: number;
}

export const PRESETS = [
  "today", "yesterday", "this_week", "last_week", "this_month", "last_month", "this_quarter", "last_quarter",
  "this_semester", "this_year", "last_year", "last_3_months", "last_6_months", "last_12_months",
] as const satisfies readonly PeriodPreset[];

const MONTHS_NORM = MONTHS_PT.map((m) => normalizeText(m));
const NUMBER_WORDS: Record<string, number> = { um: 1, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, quinze: 15, trinta: 30, sessenta: 60, noventa: 90 };

export function resolvePeriodInput(input: PeriodInput | undefined, today: Date, fallback: PeriodPreset = "this_month"): Period {
  if (!input) return resolvePreset(fallback, today);
  if (input.start && input.end) {
    const s = parseIsoDate(input.start);
    const e = parseIsoDate(input.end);
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && s <= e) return makePeriod(s, e);
  }
  if (input.month && input.month >= 1 && input.month <= 12) {
    const year = input.year ?? (input.month - 1 > today.getUTCMonth() ? today.getUTCFullYear() - 1 : today.getUTCFullYear());
    const p = monthPeriod(year, input.month - 1);
    // mês corrente: limita a hoje
    if (p.end > today && p.start <= today) return makePeriod(p.start, today, `${p.label} (até hoje)`);
    return p;
  }
  if (input.year && !input.month) {
    const start = utcDate(input.year, 0, 1);
    const end = input.year === today.getUTCFullYear() ? today : utcDate(input.year, 11, 31);
    return makePeriod(start, end, input.year === today.getUTCFullYear() ? `${input.year} (até hoje)` : String(input.year));
  }
  if (input.lastMonths && input.lastMonths > 0) {
    const n = Math.min(36, input.lastMonths);
    const start = utcDate(today.getUTCFullYear(), today.getUTCMonth() - n, 1);
    return makePeriod(start, endOfMonth(utcDate(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)), `últimos ${n} meses fechados`);
  }
  if (input.preset && input.preset !== "custom" && input.preset !== "month") return resolvePreset(input.preset, today);
  return resolvePreset(fallback, today);
}

/** Extrai período de uma pergunta em linguagem natural (pt-BR). */
export function parsePeriodFromText(text: string, today: Date): { input: PeriodInput | undefined; compareLastYear: boolean } {
  const t = normalizeText(text);
  const compareLastYear = /(ano passado|ano anterior|mesmo mes do ano|mesmo periodo do ano)/.test(t) && /compar|versus| vs |x /.test(t);
  const yearMatch = t.match(/\b(20\d{2})\b/);
  const explicitYear = yearMatch ? Number(yearMatch[1]) : undefined;

  for (let i = 0; i < 12; i++) {
    const re = new RegExp(`\\b${MONTHS_NORM[i]}\\b`);
    if (re.test(t)) {
      let year = explicitYear;
      if (!year && /do ano passado|de ano passado/.test(t) && !compareLastYear) year = today.getUTCFullYear() - 1;
      if (!year && /deste ano|desse ano|este ano|esse ano/.test(t)) year = today.getUTCFullYear();
      return { input: { preset: "month", month: i + 1, year }, compareLastYear };
    }
  }
  const lastN = t.match(/ultimos? (\d+|um|dois|tres|quatro|seis|doze) mes/);
  if (lastN) return { input: { lastMonths: Number(lastN[1]) || NUMBER_WORDS[lastN[1]] || 3 }, compareLastYear };
  if (/\bhoje\b/.test(t)) return { input: { preset: "today" }, compareLastYear };
  if (/\bontem\b/.test(t)) return { input: { preset: "yesterday" }, compareLastYear };
  if (/semana passada|ultima semana/.test(t)) return { input: { preset: "last_week" }, compareLastYear };
  if (/(esta|essa|nesta|nessa) semana/.test(t)) return { input: { preset: "this_week" }, compareLastYear };
  if (/mes passado|mes anterior|ultimo mes/.test(t) && !/compar/.test(t)) return { input: { preset: "last_month" }, compareLastYear };
  if (/trimestre passado|ultimo trimestre/.test(t)) return { input: { preset: "last_quarter" }, compareLastYear };
  if (/trimestre/.test(t)) return { input: { preset: "this_quarter" }, compareLastYear };
  if (/semestre/.test(t)) return { input: { preset: "this_semester" }, compareLastYear };
  if (/ano passado|ano anterior/.test(t) && !compareLastYear) return { input: { preset: "last_year" }, compareLastYear };
  if (explicitYear) return { input: { year: explicitYear }, compareLastYear };
  if (/(este|esse|neste|nesse|no) ano|ano atual|acumulado do ano/.test(t)) return { input: { preset: "this_year" }, compareLastYear };
  if (/(este|esse|neste|nesse) mes|mes atual/.test(t)) return { input: { preset: "this_month" }, compareLastYear };
  return { input: undefined, compareLastYear };
}

/** Horizonte em dias ("próxima semana" → 7, "30 dias", "próximo mês" → 30). */
export function parseHorizonDays(text: string, fallback = 30): number {
  const t = normalizeText(text);
  const m = t.match(/(\d+|sete|quinze|trinta|sessenta|noventa) dias/);
  if (m) return Math.min(180, Math.max(1, Number(m[1]) || NUMBER_WORDS[m[1]] || fallback));
  if (/proxima semana|semana que vem|proximos sete|esta semana|essa semana/.test(t)) return 7;
  if (/quinzena/.test(t)) return 15;
  if (/proximo mes|mes que vem/.test(t)) return 30;
  if (/proximos (dois|2) meses/.test(t)) return 60;
  if (/proximos (tres|3) meses|trimestre/.test(t)) return 90;
  return fallback;
}

/** Mês-alvo para projeções ("até dezembro"). */
export function parseUntilMonth(text: string, today: Date): string | undefined {
  const t = normalizeText(text);
  for (let i = 0; i < 12; i++) {
    if (new RegExp(`ate ${MONTHS_NORM[i]}`).test(t) || new RegExp(`fim de ${MONTHS_NORM[i]}`).test(t)) {
      const year = i < today.getUTCMonth() ? today.getUTCFullYear() + 1 : today.getUTCFullYear();
      return `${year}-${String(i + 1).padStart(2, "0")}`;
    }
  }
  if (/fim do ano|final do ano|ate o fim do ano/.test(t)) return `${today.getUTCFullYear()}-12`;
  return undefined;
}

