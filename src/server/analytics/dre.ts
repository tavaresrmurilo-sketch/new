import type { DreGroup } from "@prisma/client";
import { prisma } from "@/lib/db";
import { previousPeriod, type Period } from "@/lib/periods";
import { pctChange, round, safeDiv } from "@/lib/utils";
import { toNum } from "@/server/tenant";
import { buildMeta, sourcesUsed } from "./base";
import { loadClassifier } from "./classification";
import type { Analysis, AnalyticsCtx, CalcStep } from "./types";

export interface DreLine {
  key: string;
  label: string;
  kind: "group" | "subtotal" | "result";
  /** linha de custo/despesa (valor negativo no DRE): variação exibida sobre o valor absoluto */
  isCost: boolean;
  value: number;
  pctOfNetRevenue: number | null;
  previous: number | null;
  absVar: number | null;
  pctVar: number | null;
  children: { label: string; value: number; previous: number | null; pctVar: number | null; note?: string }[];
}

export interface DreTotals {
  grossRevenue: number;
  deductions: number;
  netRevenue: number;
  costs: number;
  grossProfit: number;
  operatingExpenses: number;
  ebitda: number;
  depreciation: number;
  operatingResult: number;
  financialResult: number;
  nonOperating: number;
  resultBeforeTaxes: number;
  incomeTaxes: number;
  netIncome: number;
  grossMarginPct: number | null;
  ebitdaMarginPct: number | null;
  netMarginPct: number | null;
}

interface RawDre {
  totals: DreTotals;
  details: Record<string, Map<string, number>>;
  unclassified: string[];
  classifiedByHeuristic: string[];
  hasData: boolean;
  salesCount: number;
}

const RESTRICTED_LABEL = "Pessoal (detalhe restrito)";
const COST_LINES = new Set(["deductions", "costs", "operating_expenses", "depreciation", "income_taxes"]);

async function computeRaw(ctx: AnalyticsCtx, period: Period): Promise<RawDre> {
  const classifier = await loadClassifier(ctx.tenantId);
  const canPayroll = ctx.permissions.has("payroll:view");
  const range = { gte: period.start, lte: period.end };

  const [sales, revenues, expenses] = await Promise.all([
    prisma.sale.aggregate({
      where: { tenantId: ctx.tenantId, status: "COMPLETED", date: range },
      _sum: { grossAmount: true, discountAmount: true, taxAmount: true, costAmount: true },
      _count: true,
    }),
    prisma.revenue.groupBy({
      by: ["category"],
      where: { tenantId: ctx.tenantId, date: range },
      _sum: { amount: true },
    }),
    prisma.expense.groupBy({
      by: ["category"],
      where: { tenantId: ctx.tenantId, date: range },
      _sum: { amount: true },
    }),
  ]);

  const details: Record<string, Map<string, number>> = {
    GROSS_REVENUE: new Map(),
    DEDUCTIONS: new Map(),
    COGS: new Map(),
    OPERATING_EXPENSES: new Map(),
    DEPRECIATION: new Map(),
    FINANCIAL_INCOME: new Map(),
    FINANCIAL_EXPENSES: new Map(),
    NON_OPERATING: new Map(),
    INCOME_TAXES: new Map(),
  };
  const add = (group: DreGroup | string, label: string, value: number) => {
    const m = details[group];
    m.set(label, round((m.get(label) ?? 0) + value));
  };

  const salesGross = toNum(sales._sum.grossAmount);
  if (salesGross) add("GROSS_REVENUE", "Vendas de produtos e serviços", salesGross);
  const discounts = toNum(sales._sum.discountAmount);
  if (discounts) add("DEDUCTIONS", "Descontos concedidos", discounts);
  const salesTax = toNum(sales._sum.taxAmount);
  if (salesTax) add("DEDUCTIONS", "Impostos sobre vendas", salesTax);
  const cmv = toNum(sales._sum.costAmount);
  if (cmv) add("COGS", "CMV/CPV das vendas", cmv);

  const unclassified: string[] = [];
  const heuristic: string[] = [];
  for (const r of revenues) {
    const c = classifier.classifyRevenue(r.category);
    if (c.method === "heuristica") heuristic.push(r.category);
    add(c.group, r.category, toNum(r._sum.amount));
  }
  for (const e of expenses) {
    const c = classifier.classifyExpense(e.category);
    if (c.method === "heuristica") {
      heuristic.push(e.category);
      if (c.group === "OPERATING_EXPENSES") unclassified.push(e.category);
    }
    const label = !canPayroll && classifier.isSensitive(e.category) ? RESTRICTED_LABEL : e.category;
    add(c.group, label, toNum(e._sum.amount));
  }

  const total = (g: string) => round([...details[g].values()].reduce((a, b) => a + b, 0));
  const grossRevenue = total("GROSS_REVENUE");
  const deductions = total("DEDUCTIONS");
  const netRevenue = round(grossRevenue - deductions);
  const costs = total("COGS");
  const grossProfit = round(netRevenue - costs);
  const operatingExpenses = total("OPERATING_EXPENSES");
  const ebitda = round(grossProfit - operatingExpenses);
  const depreciation = total("DEPRECIATION");
  const operatingResult = round(ebitda - depreciation);
  const financialResult = round(total("FINANCIAL_INCOME") - total("FINANCIAL_EXPENSES"));
  const nonOperating = total("NON_OPERATING");
  const resultBeforeTaxes = round(operatingResult + financialResult + nonOperating);
  const incomeTaxes = total("INCOME_TAXES");
  const netIncome = round(resultBeforeTaxes - incomeTaxes);
  const margin = (v: number) => {
    const r = safeDiv(v, netRevenue);
    return r === null ? null : round(r * 100, 2);
  };

  return {
    totals: {
      grossRevenue, deductions, netRevenue, costs, grossProfit, operatingExpenses, ebitda, depreciation,
      operatingResult, financialResult, nonOperating, resultBeforeTaxes, incomeTaxes, netIncome,
      grossMarginPct: margin(grossProfit), ebitdaMarginPct: margin(ebitda), netMarginPct: margin(netIncome),
    },
    details,
    unclassified,
    classifiedByHeuristic: heuristic,
    hasData: sales._count > 0 || revenues.length > 0 || expenses.length > 0,
    salesCount: sales._count,
  };
}

/** Apenas os totais (usado por comparações, séries e insights). */
export async function dreTotals(ctx: AnalyticsCtx, period: Period): Promise<{ totals: DreTotals; hasData: boolean; salesCount: number }> {
  const raw = await computeRaw(ctx, period);
  return { totals: raw.totals, hasData: raw.hasData, salesCount: raw.salesCount };
}

export interface DreResult {
  lines: DreLine[];
  totals: DreTotals;
  previousTotals: DreTotals | null;
}

export async function buildDre(ctx: AnalyticsCtx, period: Period, comparison?: Period | null): Promise<Analysis<DreResult>> {
  const compare = comparison === undefined ? previousPeriod(period) : comparison;
  const [cur, prev, sources] = await Promise.all([
    computeRaw(ctx, period),
    compare ? computeRaw(ctx, compare) : Promise.resolve(null),
    sourcesUsed(ctx, ["sales", "revenues", "expenses"], period),
  ]);
  const t = cur.totals;
  const p = prev?.hasData ? prev.totals : null;

  const children = (groups: string[], sign: 1 | -1) => {
    const labels = new Set<string>();
    groups.forEach((g) => {
      cur.details[g].forEach((_, k) => labels.add(`${g}|${k}`));
      prev?.details[g].forEach((_, k) => labels.add(`${g}|${k}`));
    });
    return [...labels]
      .map((key) => {
        const [g, label] = key.split("|");
        const s = g === "FINANCIAL_EXPENSES" ? -1 : sign;
        const value = round((cur.details[g].get(label) ?? 0) * s);
        const previous = p ? round((prev?.details[g].get(label) ?? 0) * s) : null;
        return {
          label,
          value,
          previous,
          pctVar: previous === null ? null : sign === -1 && s === -1 ? pctChange(Math.abs(value), Math.abs(previous)) : pctChange(value, previous),
          note: cur.unclassified.includes(label) ? "Categoria sem conta no plano de contas (classificada como despesa operacional)" : undefined,
        };
      })
      .filter((c) => c.value !== 0 || (c.previous ?? 0) !== 0)
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  };

  const line = (
    key: string,
    label: string,
    kind: DreLine["kind"],
    value: number,
    previous: number | null,
    kids: DreLine["children"] = [],
  ): DreLine => {
    const isCost = COST_LINES.has(key);
    return {
      key,
      label,
      kind,
      isCost,
      value,
      pctOfNetRevenue: t.netRevenue ? round((value / t.netRevenue) * 100, 2) : null,
      previous,
      absVar: previous === null ? null : round(value - previous),
      pctVar: previous === null ? null : isCost ? pctChange(Math.abs(value), Math.abs(previous)) : pctChange(value, previous),
      children: kids,
    };
  };

  const lines: DreLine[] = [
    line("gross_revenue", "Receita bruta", "group", t.grossRevenue, p?.grossRevenue ?? null, children(["GROSS_REVENUE"], 1)),
    line("deductions", "(-) Deduções", "group", -t.deductions, p ? -p.deductions : null, children(["DEDUCTIONS"], -1)),
    line("net_revenue", "Receita líquida", "subtotal", t.netRevenue, p?.netRevenue ?? null),
    line("costs", "(-) Custos", "group", -t.costs, p ? -p.costs : null, children(["COGS"], -1)),
    line("gross_profit", "Lucro bruto", "subtotal", t.grossProfit, p?.grossProfit ?? null),
    line("operating_expenses", "(-) Despesas operacionais", "group", -t.operatingExpenses, p ? -p.operatingExpenses : null, children(["OPERATING_EXPENSES"], -1)),
    line("ebitda", "EBITDA", "subtotal", t.ebitda, p?.ebitda ?? null),
    line("depreciation", "(-) Depreciação e amortização", "group", -t.depreciation, p ? -p.depreciation : null, children(["DEPRECIATION"], -1)),
    line("operating_result", "Resultado operacional", "subtotal", t.operatingResult, p?.operatingResult ?? null),
    line("financial_result", "(+/-) Resultado financeiro", "group", t.financialResult, p?.financialResult ?? null, children(["FINANCIAL_INCOME", "FINANCIAL_EXPENSES"], 1)),
    ...(t.nonOperating || p?.nonOperating
      ? [line("non_operating", "(+/-) Resultado não operacional", "group", t.nonOperating, p?.nonOperating ?? null, children(["NON_OPERATING"], 1))]
      : []),
    line("result_before_taxes", "Resultado antes dos impostos", "subtotal", t.resultBeforeTaxes, p?.resultBeforeTaxes ?? null),
    line("income_taxes", "(-) IR/CSLL", "group", -t.incomeTaxes, p ? -p.incomeTaxes : null, children(["INCOME_TAXES"], -1)),
    line("net_income", "Lucro líquido", "result", t.netIncome, p?.netIncome ?? null),
  ];

  const calculation: CalcStep[] = [
    { label: "Receita bruta", formula: "Σ vendas concluídas (valor bruto) + receitas classificadas como operacionais", value: t.grossRevenue },
    { label: "Deduções", formula: "descontos + impostos sobre vendas + despesas do grupo Deduções", value: t.deductions },
    { label: "Receita líquida", formula: "Receita bruta − Deduções", value: t.netRevenue },
    { label: "Custos", formula: "CMV/CPV das vendas + despesas do grupo Custos", value: t.costs },
    { label: "Lucro bruto", formula: "Receita líquida − Custos", value: t.grossProfit },
    { label: "Despesas operacionais", formula: "Σ despesas do grupo Despesas Operacionais", value: t.operatingExpenses },
    { label: "EBITDA", formula: "Lucro bruto − Despesas operacionais", value: t.ebitda },
    { label: "Resultado operacional", formula: "EBITDA − Depreciação/Amortização", value: t.operatingResult },
    { label: "Resultado financeiro", formula: "Receitas financeiras − Despesas financeiras", value: t.financialResult },
    { label: "Resultado antes dos impostos", formula: "Resultado operacional + financeiro + não operacional", value: t.resultBeforeTaxes },
    { label: "Lucro líquido", formula: "Resultado antes dos impostos − IR/CSLL", value: t.netIncome },
    { label: "% da receita", formula: "valor da linha ÷ Receita líquida × 100" },
  ];
  const notes: string[] = [];
  if (cur.classifiedByHeuristic.length) {
    notes.push(`Categorias classificadas por regra padrão (sem conta no plano de contas): ${[...new Set(cur.classifiedByHeuristic)].slice(0, 10).join(", ")}.`);
  }
  if (!ctx.permissions.has("payroll:view")) notes.push("Despesas de pessoal agregadas por restrição de permissão.");

  return {
    data: { lines, totals: t, previousTotals: p },
    meta: buildMeta({
      period,
      comparison: compare ?? undefined,
      sources,
      filters: { regime: "competência", status_vendas: "concluídas" },
      calculation,
      notes,
    }),
    sufficient: cur.hasData,
  };
}
