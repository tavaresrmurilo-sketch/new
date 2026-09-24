import { previousPeriod, samePeriodLastYear, type Period } from "@/lib/periods";
import { pctChange, round } from "@/lib/utils";
import { buildMeta, sourcesUsed } from "./base";
import { dreTotals } from "./dre";
import { salesSummary } from "./sales";
import type { Analysis, AnalyticsCtx } from "./types";

export type CompareMode = "previous" | "last_year" | "custom";

export interface ComparisonMetric {
  key: string;
  label: string;
  unit: "money" | "pct" | "int";
  current: number | null;
  previous: number | null;
  absVar: number | null;
  pctVar: number | null;
}

export async function comparePeriods(
  ctx: AnalyticsCtx,
  period: Period,
  mode: CompareMode = "previous",
  custom?: Period,
): Promise<Analysis<{ metrics: ComparisonMetric[]; current: Period; comparison: Period }>> {
  const comparison = mode === "custom" && custom ? custom : mode === "last_year" ? samePeriodLastYear(period) : previousPeriod(period);
  const [a, b, sa, sb, sources] = await Promise.all([
    dreTotals(ctx, period),
    dreTotals(ctx, comparison),
    salesSummary(ctx, period, comparison),
    salesSummary(ctx, comparison, comparison),
    sourcesUsed(ctx, ["sales", "expenses", "revenues"], period),
  ]);
  const cur = a.totals;
  const prev = b.hasData ? b.totals : null;
  const sCur = sa.data.current;
  const sPrev = b.hasData ? sb.data.current : null;

  const m = (key: string, label: string, unit: ComparisonMetric["unit"], c: number | null, p: number | null): ComparisonMetric => ({
    key,
    label,
    unit,
    current: c,
    previous: p,
    absVar: c !== null && p !== null ? round(c - p, 2) : null,
    pctVar: c !== null && p !== null && unit !== "pct" ? pctChange(c, p) : null,
  });

  const metrics: ComparisonMetric[] = [
    m("grossRevenue", "Receita bruta", "money", cur.grossRevenue, prev?.grossRevenue ?? null),
    m("netRevenue", "Receita líquida", "money", cur.netRevenue, prev?.netRevenue ?? null),
    m("costs", "Custos", "money", cur.costs, prev?.costs ?? null),
    m("operatingExpenses", "Despesas operacionais", "money", cur.operatingExpenses, prev?.operatingExpenses ?? null),
    m("grossMarginPct", "Margem bruta", "pct", cur.grossMarginPct, prev?.grossMarginPct ?? null),
    m("ebitda", "EBITDA", "money", cur.ebitda, prev?.ebitda ?? null),
    m("netIncome", "Lucro líquido", "money", cur.netIncome, prev?.netIncome ?? null),
    m("netMarginPct", "Margem líquida", "pct", cur.netMarginPct, prev?.netMarginPct ?? null),
    m("customers", "Clientes ativos", "int", sCur.activeCustomers, sPrev?.activeCustomers ?? null),
    m("averageTicket", "Ticket médio", "money", sCur.averageTicket, sPrev?.averageTicket ?? null),
    m("salesCount", "Quantidade de vendas", "int", sCur.salesCount, sPrev?.salesCount ?? null),
  ];

  return {
    data: { metrics, current: period, comparison },
    meta: buildMeta({
      period,
      comparison,
      sources,
      filters: { comparacao: mode === "last_year" ? "mesmo período do ano anterior" : mode === "custom" ? "período personalizado" : "período anterior" },
      calculation: [
        { label: "Indicadores de resultado", formula: "mesmas regras do DRE aplicadas aos dois períodos" },
        { label: "Variação absoluta", formula: "valor atual − valor de comparação" },
        { label: "Variação %", formula: "(atual − comparação) ÷ |comparação| × 100" },
        { label: "Margens", formula: "variação apresentada em pontos percentuais (p.p.)" },
      ],
      notes: prev ? [] : ["O período de comparação não possui dados; variações não calculadas."],
    }),
    sufficient: a.hasData,
  };
}
