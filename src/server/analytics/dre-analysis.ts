import { fmt } from "@/lib/format";
import { addMonths, diffDays, endOfMonth, isFullMonth, makePeriod, previousPeriod, startOfMonth, type Period } from "@/lib/periods";
import { pctChange, round } from "@/lib/utils";
import { buildDre, type DreResult } from "./dre";
import { expensesByCategory } from "./finance";
import { customerAnalysis, salesSummary } from "./sales";
import type { Analysis, AnalyticsCtx } from "./types";

export interface VarianceItem {
  label: string;
  current: number;
  previous: number;
  change: number;
  changePct: number | null;
}

export interface DreAnalysis {
  summary: string;
  increases: VarianceItem[];
  decreases: VarianceItem[];
  outliers: { category: string; current: number; expected: number; deviationPct: number }[];
  marginChange: { grossPp: number | null; ebitdaPp: number | null; netPp: number | null };
  hypotheses: string[];
  trends: string[];
  attention: string[];
}

/**
 * Análise do Cortex sobre o DRE. Tudo é derivado de números calculados; relações de causa só são
 * apresentadas como hipóteses ("Uma possível explicação é...") e sempre com a evidência numérica.
 */
export async function analyzeDre(ctx: AnalyticsCtx, period: Period): Promise<Analysis<{ dre: DreResult; analysis: DreAnalysis }>> {
  const comparison = previousPeriod(period);
  const [dre, salesCur, salesPrev, expenses, customers] = await Promise.all([
    buildDre(ctx, period, comparison),
    salesSummary(ctx, period, comparison),
    salesSummary(ctx, comparison, comparison),
    expensesByCategory(ctx, period, comparison),
    customerAnalysis(ctx, period),
  ]);
  const t = dre.data.totals;
  const p = dre.data.previousTotals;

  // aumentos/reduções medidos sobre o valor absoluto de cada conta (ex.: custo que sobe = aumento)
  const items: VarianceItem[] = [];
  for (const line of dre.data.lines) {
    for (const c of line.children) {
      if (c.previous === null) continue;
      const cur = Math.abs(c.value);
      const prev = Math.abs(c.previous);
      items.push({ label: `${line.label.replace(/^\(.*?\)\s*/, "")} · ${c.label}`, current: cur, previous: prev, change: round(cur - prev), changePct: pctChange(cur, prev) });
    }
  }
  const material = Math.max(Math.abs(t.netRevenue) * 0.005, 1);
  const increases = items.filter((i) => i.change > material).sort((a, b) => b.change - a.change).slice(0, 5);
  const decreases = items.filter((i) => i.change < -material).sort((a, b) => a.change - b.change).slice(0, 5);

  // despesas fora do padrão: categoria acima de 125% da média dos 3 meses anteriores (proporcional ao período)
  const outliers: DreAnalysis["outliers"] = [];
  const baseStart = startOfMonth(addMonths(startOfMonth(period.start), -3));
  const baseEnd = endOfMonth(addMonths(startOfMonth(period.start), -1));
  const base = await expensesByCategory(ctx, makePeriod(baseStart, baseEnd), makePeriod(baseStart, baseEnd));
  const days = diffDays(period.end, period.start) + 1;
  const factor = isFullMonth(period) ? 1 : days / 30.44;
  const baseMap = new Map(base.data.rows.map((r) => [r.category, r.amount / 3]));
  for (const r of expenses.data.rows) {
    const avg = baseMap.get(r.category);
    if (!avg) continue;
    const expected = round(avg * factor);
    if (expected > 0 && r.amount > expected * 1.25 && r.amount - expected >= material) {
      outliers.push({ category: r.category, current: r.amount, expected, deviationPct: round(((r.amount - expected) / expected) * 100, 1) });
    }
  }
  outliers.sort((a, b) => b.current - b.expected - (a.current - a.expected));

  const pp = (a: number | null, b: number | null | undefined) => (a !== null && b !== null && b !== undefined ? round(a - b, 2) : null);
  const marginChange = { grossPp: pp(t.grossMarginPct, p?.grossMarginPct), ebitdaPp: pp(t.ebitdaMarginPct, p?.ebitdaMarginPct), netPp: pp(t.netMarginPct, p?.netMarginPct) };

  const hypotheses: string[] = [];
  const attention: string[] = [];
  const trends: string[] = [];
  const sc = salesCur.data.current;
  const sp = salesPrev.data.current;
  const revVar = p ? pctChange(t.netRevenue, p.netRevenue) : null;

  if (p && revVar !== null && revVar < -3) {
    if (sp.activeCustomers && sc.activeCustomers < sp.activeCustomers) {
      hypotheses.push(`Uma possível explicação para a queda de receita é a redução de clientes ativos (${sp.activeCustomers} → ${sc.activeCustomers}).`);
    }
    if (sp.averageTicket && sc.averageTicket && sc.averageTicket < sp.averageTicket * 0.97) {
      hypotheses.push(`Uma possível explicação é a redução do ticket médio (${fmt.money(sp.averageTicket)} → ${fmt.money(sc.averageTicket)}).`);
    }
    const drop = customers.data.decreased[0];
    if (drop && Math.abs(drop.change) >= Math.abs(t.netRevenue - p.netRevenue) * 0.25) {
      hypotheses.push(`Uma possível explicação é a redução de compras do cliente ${drop.name} (${fmt.money(drop.previous)} → ${fmt.money(drop.current)}).`);
    }
  }
  if (p && marginChange.grossPp !== null && marginChange.grossPp < -1) {
    const costVar = pctChange(t.costs, p.costs);
    if (costVar !== null && revVar !== null && costVar > revVar) {
      hypotheses.push(`Uma possível explicação para a queda da margem bruta é o crescimento dos custos (${fmt.signedPct(costVar)}) acima da receita líquida (${fmt.signedPct(revVar)}).`);
    }
    if (sp.grossRevenue && sc.grossRevenue && sc.discounts / sc.grossRevenue > (sp.discounts / sp.grossRevenue) * 1.1 && sc.discounts > 0) {
      hypotheses.push(`Uma possível explicação é o aumento dos descontos concedidos (${fmt.pct((sp.discounts / sp.grossRevenue) * 100)} → ${fmt.pct((sc.discounts / sc.grossRevenue) * 100)} do faturamento).`);
    }
    attention.push(`Margem bruta caiu ${fmt.number(Math.abs(marginChange.grossPp))} p.p. em relação ao período anterior.`);
  }
  if (p && marginChange.netPp !== null && marginChange.netPp < -1) {
    const opexVar = pctChange(t.operatingExpenses, p.operatingExpenses);
    const topExp = expenses.data.rows.filter((r) => (r.change ?? 0) > 0).sort((a, b) => (b.change ?? 0) - (a.change ?? 0))[0];
    if (opexVar !== null && opexVar > 0 && topExp) {
      hypotheses.push(`Uma possível explicação para a queda da margem líquida é o aumento das despesas operacionais (${fmt.signedPct(opexVar)}), principalmente "${topExp.category}" (+${fmt.money(topExp.change)}).`);
    }
  }
  for (const o of outliers.slice(0, 3)) {
    attention.push(`"${o.category}" está ${fmt.pct(o.deviationPct)} acima da média dos 3 meses anteriores (${fmt.money(o.current)} vs. ${fmt.money(o.expected)} esperados).`);
  }
  if (t.netIncome < 0) attention.push(`O período apresenta prejuízo de ${fmt.money(Math.abs(t.netIncome))}.`);

  if (p) {
    if (revVar !== null) trends.push(`Receita líquida ${revVar >= 0 ? "cresceu" : "caiu"} ${fmt.pct(Math.abs(revVar))} (${fmt.money(p.netRevenue)} → ${fmt.money(t.netRevenue)}).`);
    const niVar = pctChange(t.netIncome, p.netIncome);
    if (niVar !== null) trends.push(`Lucro líquido ${t.netIncome >= p.netIncome ? "aumentou" : "diminuiu"} ${fmt.money(Math.abs(t.netIncome - p.netIncome))} (${fmt.signedPct(niVar)}).`);
    if (marginChange.netPp !== null) trends.push(`Margem líquida: ${fmt.pct(p.netMarginPct)} → ${fmt.pct(t.netMarginPct)} (${fmt.pp(marginChange.netPp)}).`);
  }

  const summary = !dre.sufficient
    ? "Não encontrei dados suficientes para analisar o resultado deste período."
    : `No período ${period.label}, a receita líquida foi de ${fmt.money(t.netRevenue)}, o EBITDA de ${fmt.money(t.ebitda)} (${fmt.pct(t.ebitdaMarginPct)}) e o lucro líquido de ${fmt.money(t.netIncome)} (margem de ${fmt.pct(t.netMarginPct)}).` +
      (p ? ` Em comparação com ${comparison.label}, a receita variou ${fmt.signedPct(revVar)} e a margem líquida ${fmt.pp(marginChange.netPp)}.` : " Não há dados no período anterior para comparação.");

  return {
    data: { dre: dre.data, analysis: { summary: summary.replace(/p\.p\.\./g, "p.p."), increases, decreases, outliers: outliers.slice(0, 5), marginChange, hypotheses, trends, attention } },
    meta: {
      ...dre.meta,
      calculation: [
        ...dre.meta.calculation,
        { label: "Principais variações", formula: "linhas do DRE com variação acima de 0,5% da receita líquida" },
        { label: "Despesa fora do padrão", formula: "valor > 125% da média mensal dos 3 meses anteriores (proporcional aos dias do período)" },
        { label: "Hipóteses", formula: "regras objetivas; apresentadas como possibilidade, nunca como causa comprovada" },
      ],
    },
    sufficient: dre.sufficient,
  };
}
