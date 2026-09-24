import { z } from "zod";
import { addMonths, endOfMonth, monthsBetween } from "./periods";
import { round } from "./utils";

/** Simulador de cenários — funções puras (rodam no servidor e no navegador). */
export const assumptionsSchema = z.object({
  revenueGrowthPct: z.number().min(-50).max(50), // crescimento mensal composto (%)
  marginDeltaPp: z.number().min(-50).max(50), // variação da margem bruta (p.p.)
  expenseChangePct: z.number().min(-80).max(200), // variação das despesas operacionais (%)
  costChangePct: z.number().min(-80).max(200), // variação dos custos (%)
  defaultRatePct: z.number().min(0).max(100), // inadimplência (% da receita não recebida)
  dsoDays: z.number().min(0).max(365), // prazo médio de recebimento (dias)
  horizonMonths: z.number().int().min(1).max(24),
});

export type Assumptions = z.infer<typeof assumptionsSchema>;

export interface Baseline {
  months: number;
  avgNetRevenue: number;
  costRatio: number;
  avgOperatingExpenses: number;
  otherResultRatio: number;
  historicalGrowthPct: number;
  dsoDays: number;
  defaultRatePct: number;
  openingCash: number;
  sufficient: boolean;
}

export function presetAssumptions(b: Baseline, horizonMonths = 12): Record<"CONSERVATIVE" | "BASE" | "OPTIMISTIC", Assumptions> {
  return {
    CONSERVATIVE: {
      revenueGrowthPct: round(b.historicalGrowthPct - 2, 2), marginDeltaPp: -2, expenseChangePct: 5, costChangePct: 3,
      defaultRatePct: round(b.defaultRatePct + 3, 2), dsoDays: b.dsoDays + 15, horizonMonths,
    },
    BASE: {
      revenueGrowthPct: b.historicalGrowthPct, marginDeltaPp: 0, expenseChangePct: 0, costChangePct: 0,
      defaultRatePct: b.defaultRatePct, dsoDays: b.dsoDays, horizonMonths,
    },
    OPTIMISTIC: {
      revenueGrowthPct: round(b.historicalGrowthPct + 2, 2), marginDeltaPp: 1.5, expenseChangePct: -3, costChangePct: -2,
      defaultRatePct: round(Math.max(0, b.defaultRatePct - 1), 2), dsoDays: Math.max(0, b.dsoDays - 5), horizonMonths,
    },
  };
}

export interface ScenarioMonth {
  month: string;
  netRevenue: number;
  costs: number;
  operatingExpenses: number;
  profit: number;
  marginPct: number | null;
  collections: number;
  outflows: number;
  cash: number;
}

export interface ScenarioResult {
  months: ScenarioMonth[];
  totals: { netRevenue: number; profit: number; marginPct: number | null; finalCash: number; minCash: number; minCashMonth: string | null };
}

/** Simulação determinística e transparente — todas as premissas são explícitas. */
export function simulate(b: Baseline, a: Assumptions, startMonth: Date): ScenarioResult {
  const months = monthsBetween(startMonth, endOfMonth(addMonths(startMonth, a.horizonMonths - 1)));
  const g = a.revenueGrowthPct / 100;
  const costRatio = Math.max(0, b.costRatio * (1 + a.costChangePct / 100) - a.marginDeltaPp / 100);
  const opex = b.avgOperatingExpenses * (1 + a.expenseChangePct / 100);
  const collectRate = 1 - a.defaultRatePct / 100;
  const lagMonths = a.dsoDays / 30;
  const revenues: number[] = [];
  let cash = b.openingCash;
  let minCash = Number.POSITIVE_INFINITY;
  let minCashMonth: string | null = null;

  const rows = months.map((m, i) => {
    const netRevenue = round(b.avgNetRevenue * Math.pow(1 + g, i + 1));
    revenues.push(netRevenue);
    const costs = round(netRevenue * costRatio);
    const other = netRevenue * b.otherResultRatio;
    const profit = round(netRevenue - costs - opex - other);
    // recebimentos defasados pelo prazo médio (interpolação linear entre meses)
    const lo = Math.floor(lagMonths);
    const frac = lagMonths - lo;
    const revAt = (k: number) => (k < 0 ? b.avgNetRevenue : revenues[k] ?? b.avgNetRevenue);
    const collections = round((revAt(i - lo) * (1 - frac) + revAt(i - lo - 1) * frac) * collectRate);
    const outflows = round(costs + opex + other);
    cash = round(cash + collections - outflows);
    if (cash < minCash) {
      minCash = cash;
      minCashMonth = m;
    }
    return { month: m, netRevenue, costs, operatingExpenses: round(opex), profit, marginPct: netRevenue ? round((profit / netRevenue) * 100, 2) : null, collections, outflows, cash };
  });

  const totalRevenue = round(rows.reduce((s, r) => s + r.netRevenue, 0));
  const totalProfit = round(rows.reduce((s, r) => s + r.profit, 0));
  return {
    months: rows,
    totals: {
      netRevenue: totalRevenue,
      profit: totalProfit,
      marginPct: totalRevenue ? round((totalProfit / totalRevenue) * 100, 2) : null,
      finalCash: cash,
      minCash: minCash === Number.POSITIVE_INFINITY ? cash : minCash,
      minCashMonth,
    },
  };
}

