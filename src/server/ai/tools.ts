import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/format";
import { addMonths, endOfMonth, inPeriod, previousPeriod, startOfMonth } from "@/lib/periods";
import { normalizeText, round } from "@/lib/utils";
import type { PermissionKey } from "@/server/auth/permissions";
import { comparePeriods } from "@/server/analytics/compare";
import { buildDre } from "@/server/analytics/dre";
import { analyzeDre } from "@/server/analytics/dre-analysis";
import {
  cashMovementsMonthly, cashPosition, cashflowProjection, expenseTrends, expensesByCategory, payablesDashboard, receivablesDashboard,
} from "@/server/analytics/finance";
import { forecast } from "@/server/analytics/forecast";
import { detectInsights } from "@/server/analytics/insights";
import { executiveOverview } from "@/server/analytics/overview";
import { customerAnalysis, productAnalysis, salesDailySeries, salesMonthlySeries, salesRanking, salesSummary } from "@/server/analytics/sales";
import { monthlyResults } from "@/server/analytics/series";
import type { AnalyticsCtx } from "@/server/analytics/types";
import { toNum } from "@/server/tenant";
import { PRESETS, resolvePeriodInput, type PeriodInput } from "./period-parse";
import type { Block, ToolOutput, ToolSpecForLLM } from "./types";

export const NO_DATA = "Não existem dados suficientes para responder essa pergunta.";

// ───────── esquemas ─────────

const periodSchema = z
  .object({
    preset: z.enum([...PRESETS, "custom", "month"]).optional(),
    month: z.number().int().min(1).max(12).optional(),
    year: z.number().int().min(2000).max(2100).optional(),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    lastMonths: z.number().int().min(1).max(36).optional(),
  })
  .partial();

const periodJson = {
  type: "object",
  description: "Período analisado. Use preset OU month/year OU start/end (AAAA-MM-DD) OU lastMonths.",
  properties: {
    preset: { type: "string", enum: PRESETS },
    month: { type: "integer", minimum: 1, maximum: 12 },
    year: { type: "integer" },
    start: { type: "string", description: "AAAA-MM-DD" },
    end: { type: "string", description: "AAAA-MM-DD" },
    lastMonths: { type: "integer", minimum: 1, maximum: 36 },
  },
};

interface ToolDef<S extends z.ZodTypeAny> {
  name: string;
  description: string;
  permission: PermissionKey;
  schema: S;
  jsonSchema: Record<string, unknown>;
  run: (ctx: AnalyticsCtx, input: z.infer<S>) => Promise<ToolOutput>;
}

function def<S extends z.ZodTypeAny>(d: ToolDef<S>): ToolDef<S> {
  return d;
}

const withPeriod = <T extends z.ZodRawShape>(shape: T) => z.object({ period: periodSchema.optional(), ...shape });
const obj = (props: Record<string, unknown>) => ({ type: "object", properties: { period: periodJson, ...props } });

const P = (ctx: AnalyticsCtx, p?: PeriodInput) => resolvePeriodInput(p, ctx.today);

function insufficient(tool: string, title: string, reason = NO_DATA): ToolOutput {
  return { tool, title, sufficient: false, narrative: reason, facts: { sufficient: false }, blocks: [], meta: null };
}

const monthChart = (title: string, data: Record<string, string | number | null>[], series: { key: string; label: string; kind?: "bar" | "line" }[], chart: "bar" | "line" | "area" | "composed" = "bar"): Block => ({
  type: "chart", title, chart, xKey: "month", xFormat: "month", series, data, valueFormat: "money",
});

// ───────── ferramentas ─────────

const getCompanyOverview = def({
  name: "getCompanyOverview",
  description: "Visão geral da empresa: resultado, vendas, caixa, margens, clientes, despesas, tendências, pontos de atenção e oportunidades. Use para 'como está minha empresa?' ou pedidos de dashboard.",
  permission: "dashboard:view",
  schema: z.object({}),
  jsonSchema: { type: "object", properties: {} },
  async run(ctx) {
    const [ov, insights] = await Promise.all([executiveOverview(ctx), detectInsights(ctx)]);
    if (!ov.hasData) return insufficient("getCompanyOverview", "Visão geral");
    const c = ov.cards;
    const canFin = ctx.permissions.has("dre:view");
    const canCash = ctx.permissions.has("cashflow:view");
    const parts: string[] = [];
    parts.push(`**Comercial** — Faturamento de ${fmt.money(c.grossRevenue.month)} no mês (${fmt.signedPct(c.grossRevenue.monthVar)} vs. mesmo intervalo do mês anterior) e ${fmt.money(c.grossRevenue.year)} no ano. ${fmt.int(c.sales.countMonth)} vendas, ticket médio de ${fmt.money(c.sales.ticketMonth)} e ${fmt.int(c.sales.activeCustomers)} clientes ativos.`);
    if (canFin) {
      parts.push(`**Resultado** — Receita líquida de ${fmt.money(c.netRevenue.month)} no mês, EBITDA de ${fmt.money(c.ebitda.month)} e lucro líquido de ${fmt.money(c.netIncome.month)} (margem líquida de ${fmt.pct(c.netMargin.month)}${c.netMargin.monthPp !== null ? `, ${fmt.pp(c.netMargin.monthPp)}` : ""}). No ano: lucro de ${fmt.money(c.netIncome.year)}.`);
    }
    if (canCash) {
      parts.push(`**Caixa** — Saldo atual de ${fmt.money(c.cash.balance)}; saldo projetado em 30 dias de ${fmt.money(c.cash.projected30)}${c.cash.minProjected ? `, com menor saldo de ${fmt.money(c.cash.minProjected.value)} em ${fmt.date(c.cash.minProjected.date)}` : ""}. A receber: ${fmt.money(c.receivables.total)} (vencidos ${fmt.money(c.receivables.overdue)}); a pagar: ${fmt.money(c.payables.total)} (vencidos ${fmt.money(c.payables.overdue)}).`);
    }
    const attention = insights.filter((i) => i.severity === "CRITICAL" || i.severity === "ATTENTION").slice(0, 5);
    const opps = insights.filter((i) => i.severity === "OPPORTUNITY").slice(0, 4);
    if (attention.length) parts.push(`**Pontos de atenção**\n${attention.map((i) => `- ${i.title}`).join("\n")}`);
    if (opps.length) parts.push(`**Oportunidades**\n${opps.map((i) => `- ${i.title}`).join("\n")}`);
    const kpis: Block = {
      type: "kpis",
      items: [
        { label: "Faturamento (mês)", value: c.grossRevenue.month, format: "money", delta: c.grossRevenue.monthVar, deltaFormat: "pct" },
        ...(canFin
          ? [
              { label: "Receita líquida (mês)", value: c.netRevenue.month, format: "money" as const, delta: c.netRevenue.monthVar, deltaFormat: "pct" as const },
              { label: "Lucro líquido (mês)", value: c.netIncome.month, format: "money" as const, delta: c.netIncome.monthVar, deltaFormat: "pct" as const },
              { label: "Margem líquida", value: c.netMargin.month, format: "pct" as const, delta: c.netMargin.monthPp, deltaFormat: "pp" as const },
              { label: "EBITDA (mês)", value: c.ebitda.month, format: "money" as const, delta: c.ebitda.monthVar, deltaFormat: "pct" as const },
            ]
          : []),
        ...(canCash ? [{ label: "Caixa atual", value: c.cash.balance, format: "money" as const }, { label: "A receber", value: c.receivables.total, format: "money" as const }, { label: "A pagar", value: c.payables.total, format: "money" as const }] : []),
      ],
    };
    const blocks: Block[] = [kpis];
    if (canFin) blocks.push(monthChart("Receita e lucro por mês", ov.charts.monthly, [{ key: "receita", label: "Receita líquida", kind: "bar" }, { key: "lucro", label: "Lucro líquido", kind: "line" }], "composed"));
    if (canCash) blocks.push({ type: "chart", title: "Saldo projetado (30 dias)", chart: "area", xKey: "date", xFormat: "date", series: [{ key: "saldo", label: "Saldo" }], data: ov.charts.cashflow, valueFormat: "money" });
    blocks.push({ type: "table", title: "Maiores clientes do mês", columns: [{ key: "name", label: "Cliente" }, { key: "value", label: "Faturamento", format: "money", align: "right" }], rows: ov.charts.byCustomer });
    if (attention.length || opps.length) blocks.push({ type: "list", title: "Destaques do Cortex", items: [...attention, ...opps].map((i) => ({ title: i.title, description: i.description, severity: i.severity })) });
    return {
      tool: "getCompanyOverview",
      title: "Como está sua empresa",
      sufficient: true,
      narrative: parts.join("\n\n"),
      facts: { cards: canFin ? c : { grossRevenue: c.grossRevenue, sales: c.sales }, attention: attention.map((i) => i.title), opportunities: opps.map((i) => i.title) },
      blocks,
      meta: {
        period: { start: ov.periods.mtd.start.toISOString().slice(0, 10), end: ov.periods.mtd.end.toISOString().slice(0, 10), label: ov.periods.mtd.label },
        sources: ov.sources,
        lastUpdated: ov.lastUpdated,
        filters: { mês: "mês corrente até hoje", ano: "ano corrente até hoje" },
        calculation: [
          { label: "Faturamento", formula: "Σ vendas concluídas (bruto)" },
          { label: "Lucro/EBITDA/Margens", formula: "regras do DRE (competência)" },
          { label: "Caixa projetado", formula: "saldo atual + títulos a receber − títulos a pagar por vencimento" },
          { label: "Pontos de atenção", formula: "regras objetivas da Central de Insights" },
        ],
      },
    };
  },
});

const getSales = def({
  name: "getSales",
  description: "Vendas/faturamento de um período: faturamento, receita líquida, número de vendas, ticket médio, margem, clientes ativos, novos e recorrentes, com comparação ao período anterior.",
  permission: "sales:view",
  schema: withPeriod({}),
  jsonSchema: obj({}),
  async run(ctx, input) {
    const period = P(ctx, input.period);
    const r = await salesSummary(ctx, period);
    if (!r.sufficient) return { ...insufficient("getSales", "Vendas"), meta: r.meta, narrative: `Não encontrei vendas registradas em ${period.label}.` };
    const c = r.data.current;
    const v = r.data.variation;
    const cmp = r.meta.comparison?.label ?? "período anterior";
    const narrative = `${inPeriod(period.label)} foram ${fmt.int(c.salesCount)} vendas, com faturamento de ${fmt.money(c.grossRevenue)} e receita líquida de ${fmt.money(c.netRevenue)}.` +
      (v.grossRevenue !== null ? ` Em relação a ${cmp}, o faturamento variou ${fmt.signedPct(v.grossRevenue)}.` : "") +
      ` Ticket médio de ${fmt.money(c.averageTicket)}, margem bruta de vendas de ${fmt.pct(c.grossMarginPct)} e ${fmt.int(c.activeCustomers)} clientes ativos (${fmt.int(c.newCustomers)} novos).`;
    const days = Math.round((period.end.getTime() - period.start.getTime()) / 86_400_000) + 1;
    const blocks: Block[] = [
      {
        type: "kpis",
        items: [
          { label: "Faturamento", value: c.grossRevenue, format: "money", delta: v.grossRevenue, deltaFormat: "pct" },
          { label: "Receita líquida", value: c.netRevenue, format: "money", delta: v.netRevenue, deltaFormat: "pct" },
          { label: "Vendas", value: c.salesCount, format: "int", delta: v.salesCount, deltaFormat: "pct" },
          { label: "Ticket médio", value: c.averageTicket, format: "money", delta: v.averageTicket, deltaFormat: "pct" },
          { label: "Margem bruta", value: c.grossMarginPct, format: "pct", delta: v.grossMarginPp, deltaFormat: "pp" },
          { label: "Clientes ativos", value: c.activeCustomers, format: "int", delta: v.activeCustomers, deltaFormat: "pct" },
        ],
      },
    ];
    if (days > 1 && days <= 62) {
      const daily = await salesDailySeries(ctx, period);
      blocks.push({ type: "chart", title: "Faturamento diário", chart: "bar", xKey: "date", xFormat: "date", series: [{ key: "grossRevenue", label: "Faturamento" }], data: daily, valueFormat: "money" });
    } else if (days > 62) {
      const monthly = await salesMonthlySeries(ctx, period.start, period.end);
      blocks.push(monthChart("Faturamento mensal", monthly.map((m) => ({ month: m.month, faturamento: m.grossRevenue })), [{ key: "faturamento", label: "Faturamento" }]));
    }
    return { tool: "getSales", title: "Vendas", sufficient: true, narrative, facts: { period: period.label, comparison: cmp, current: c, variation: v }, blocks, meta: r.meta };
  },
});

const getDRE = def({
  name: "getDRE",
  description: "Monta o DRE (Demonstração do Resultado) do período, com % da receita e comparação com o período anterior.",
  permission: "dre:view",
  schema: withPeriod({}),
  jsonSchema: obj({}),
  async run(ctx, input) {
    const period = P(ctx, input.period);
    const r = await buildDre(ctx, period);
    if (!r.sufficient) return { ...insufficient("getDRE", "DRE"), meta: r.meta };
    const t = r.data.totals;
    const narrative = `DRE de ${period.label}: receita bruta de ${fmt.money(t.grossRevenue)}, receita líquida de ${fmt.money(t.netRevenue)}, lucro bruto de ${fmt.money(t.grossProfit)} (${fmt.pct(t.grossMarginPct)}), EBITDA de ${fmt.money(t.ebitda)} (${fmt.pct(t.ebitdaMarginPct)}) e lucro líquido de ${fmt.money(t.netIncome)} (margem líquida de ${fmt.pct(t.netMarginPct)}).`;
    return {
      tool: "getDRE",
      title: `DRE — ${period.label}`,
      sufficient: true,
      narrative,
      facts: { period: period.label, totals: t, previous: r.data.previousTotals },
      blocks: [{ type: "dre", lines: r.data.lines.map(({ children: _c, absVar: _a, ...l }) => l) }],
      meta: r.meta,
    };
  },
});

const getRevenue = def({
  name: "getRevenue",
  description: "Receita bruta e líquida do período (vendas + outras receitas operacionais), com comparação.",
  permission: "dre:view",
  schema: withPeriod({}),
  jsonSchema: obj({}),
  async run(ctx, input) {
    const period = P(ctx, input.period);
    const r = await buildDre(ctx, period);
    if (!r.sufficient) return { ...insufficient("getRevenue", "Receita"), meta: r.meta };
    const t = r.data.totals;
    const p = r.data.previousTotals;
    const gross = r.data.lines.find((l) => l.key === "gross_revenue");
    return {
      tool: "getRevenue",
      title: "Receita",
      sufficient: true,
      narrative: `${inPeriod(period.label)}, a receita bruta foi de ${fmt.money(t.grossRevenue)} e a receita líquida de ${fmt.money(t.netRevenue)}${p ? ` (${fmt.signedPct(gross?.pctVar ?? null)} na receita bruta vs. ${r.meta.comparison?.label})` : ""}.`,
      facts: { period: period.label, grossRevenue: t.grossRevenue, netRevenue: t.netRevenue, previousGross: p?.grossRevenue ?? null, previousNet: p?.netRevenue ?? null },
      blocks: [
        { type: "kpis", items: [{ label: "Receita bruta", value: t.grossRevenue, format: "money", delta: gross?.pctVar ?? null, deltaFormat: "pct" }, { label: "Deduções", value: t.deductions, format: "money" }, { label: "Receita líquida", value: t.netRevenue, format: "money" }] },
        { type: "table", title: "Composição da receita bruta", columns: [{ key: "label", label: "Origem" }, { key: "value", label: "Valor", format: "money", align: "right" }, { key: "pctVar", label: "Var. %", format: "pct", align: "right" }], rows: (gross?.children ?? []).map((c) => ({ label: c.label, value: c.value, pctVar: c.pctVar })) },
      ],
      meta: r.meta,
    };
  },
});

const getExpenses = def({
  name: "getExpenses",
  description: "Despesas por categoria no período (mode=category) ou despesas que mais aumentaram nos últimos 3 meses vs. 3 anteriores (mode=trend).",
  permission: "dre:view",
  schema: withPeriod({ mode: z.enum(["category", "trend"]).default("category") }),
  jsonSchema: obj({ mode: { type: "string", enum: ["category", "trend"] } }),
  async run(ctx, input) {
    if (input.mode === "trend") {
      const r = await expenseTrends(ctx, 3);
      if (!r.sufficient) return { ...insufficient("getExpenses", "Despesas"), meta: r.meta };
      const top = r.data.increases.slice(0, 5);
      const narrative = top.length
        ? `Comparando os ${r.data.recent.label} com os ${r.data.previous.label}, as despesas que mais aumentaram foram: ${top.map((x) => `${x.category} (+${fmt.money(x.change)}${x.changePct !== null ? `, ${fmt.signedPct(x.changePct)}` : ""})`).join("; ")}.`
        : `Nenhuma categoria de despesa aumentou nos ${r.data.recent.label} em relação aos ${r.data.previous.label}.`;
      return {
        tool: "getExpenses",
        title: "Despesas que mais aumentaram",
        sufficient: true,
        narrative,
        facts: { recent: r.data.recent.label, previous: r.data.previous.label, increases: top, total: r.data.total, previousTotal: r.data.previousTotal },
        blocks: [{ type: "table", title: "Variação por categoria (3 meses vs. 3 anteriores)", columns: [{ key: "category", label: "Categoria" }, { key: "amount", label: "Últimos 3 meses", format: "money", align: "right" }, { key: "previous", label: "3 meses anteriores", format: "money", align: "right" }, { key: "change", label: "Variação", format: "money", align: "right" }, { key: "changePct", label: "Var. %", format: "pct", align: "right" }], rows: r.data.rows.slice(0, 15).map((x) => ({ ...x })) }],
        meta: r.meta,
      };
    }
    const period = P(ctx, input.period);
    const cmp = previousPeriod(period);
    const r = await expensesByCategory(ctx, period, cmp);
    if (!r.sufficient) return { ...insufficient("getExpenses", "Despesas"), meta: r.meta };
    const top = r.data.rows.slice(0, 5);
    return {
      tool: "getExpenses",
      title: "Despesas por categoria",
      sufficient: true,
      narrative: `${inPeriod(period.label)}, as despesas somaram ${fmt.money(r.data.total)}. As maiores categorias foram: ${top.map((x) => `${x.category} (${fmt.money(x.amount)}, ${fmt.pct(x.share)})`).join("; ")}.`,
      facts: { period: period.label, total: r.data.total, previousTotal: r.data.previousTotal, top },
      blocks: [
        { type: "chart", title: "Despesas por categoria", chart: "bar", xKey: "category", xFormat: "text", series: [{ key: "amount", label: "Valor" }], data: r.data.rows.slice(0, 10).map((x) => ({ category: x.category, amount: x.amount })), valueFormat: "money" },
        { type: "table", columns: [{ key: "category", label: "Categoria" }, { key: "amount", label: "Valor", format: "money", align: "right" }, { key: "share", label: "% total", format: "pct", align: "right" }, { key: "changePct", label: "Var. %", format: "pct", align: "right" }], rows: r.data.rows.slice(0, 20).map((x) => ({ ...x })) },
      ],
      meta: r.meta,
    };
  },
});

const getExpensesByCategory = def({ ...getExpenses, name: "getExpensesByCategory", description: "Despesas agrupadas por categoria no período." });

const getCashFlow = def({
  name: "getCashFlow",
  description: "Situação do caixa: saldo atual por conta, entradas x saídas realizadas nos últimos meses e projeção resumida de 30 dias.",
  permission: "cashflow:view",
  schema: z.object({}),
  jsonSchema: { type: "object", properties: {} },
  async run(ctx) {
    const start = startOfMonth(addMonths(ctx.today, -5));
    const [pos, proj, mov] = await Promise.all([cashPosition(ctx), cashflowProjection(ctx, 30), cashMovementsMonthly(ctx, start, endOfMonth(ctx.today))]);
    if (pos.balance === null && !proj.sufficient) return insufficient("getCashFlow", "Fluxo de caixa");
    const d = proj.data;
    return {
      tool: "getCashFlow",
      title: "Fluxo de caixa",
      sufficient: true,
      narrative: `O saldo de caixa atual é de ${fmt.money(pos.balance)}. Nos próximos 30 dias estão previstas entradas de ${fmt.money(d.totalInflows)} e saídas de ${fmt.money(d.totalOutflows)}, resultando em saldo projetado de ${fmt.money(d.finalBalance)}.` +
        (d.minBalance ? ` O menor saldo previsto é ${fmt.money(d.minBalance.value)} em ${fmt.date(d.minBalance.date)}.` : ""),
      facts: { balance: pos.balance, accounts: pos.accounts, next30: { inflows: d.totalInflows, outflows: d.totalOutflows, final: d.finalBalance, minBalance: d.minBalance } },
      blocks: [
        { type: "kpis", items: [{ label: "Saldo atual", value: pos.balance, format: "money" }, { label: "Entradas previstas (30d)", value: d.totalInflows, format: "money" }, { label: "Saídas previstas (30d)", value: d.totalOutflows, format: "money" }, { label: "Saldo projetado (30d)", value: d.finalBalance, format: "money" }] },
        monthChart("Entradas x saídas realizadas", mov.map((m) => ({ month: m.month, entradas: m.inflows, saidas: m.outflows })), [{ key: "entradas", label: "Entradas" }, { key: "saidas", label: "Saídas" }]),
        { type: "table", title: "Saldo por conta", columns: [{ key: "name", label: "Conta" }, { key: "bank", label: "Banco" }, { key: "balance", label: "Saldo", format: "money", align: "right" }], rows: pos.accounts.map((a) => ({ name: a.name, bank: a.bank, balance: a.balance })) },
      ],
      meta: proj.meta,
    };
  },
});

const forecastCashFlow = def({
  name: "forecastCashFlow",
  description: "Projeção de caixa dia a dia (PREVISTO a partir de contas a receber e a pagar em aberto) para os próximos N dias; responde 'qual será meu caixa na próxima semana' e 'existe risco de faltar caixa'.",
  permission: "cashflow:view",
  schema: z.object({ days: z.number().int().min(1).max(180).default(30) }),
  jsonSchema: { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 180 } } },
  async run(ctx, input) {
    const r = await cashflowProjection(ctx, input.days);
    if (!r.sufficient) return { ...insufficient("forecastCashFlow", "Projeção de caixa"), meta: r.meta };
    const d = r.data;
    const lines: string[] = [`**Saldo inicial:** ${fmt.money(d.openingBalance)}`];
    const shown = input.days <= 15 ? d.days : d.days.filter((x) => x.inflows || x.outflows).slice(0, 12);
    for (const day of shown) {
      lines.push(`**${day.weekday} (${fmt.date(day.date)})** — Entradas: ${fmt.money(day.inflows)} · Saídas: ${fmt.money(day.outflows)} · Saldo: ${fmt.money(day.balance)}${day.attention ? " ⚠️" : ""}`);
    }
    if (input.days > 15 && d.days.filter((x) => x.inflows || x.outflows).length > 12) lines.push("_(demais dias com movimentação na tabela abaixo)_");
    lines.push(`**Saldo projetado ao final:** ${fmt.money(d.finalBalance)}`);
    if (d.maxInflow) lines.push(`**Maior entrada:** ${fmt.money(d.maxInflow.value)} em ${fmt.date(d.maxInflow.date)}`);
    if (d.maxOutflow) lines.push(`**Maior saída:** ${fmt.money(d.maxOutflow.value)} em ${fmt.date(d.maxOutflow.date)}`);
    if (d.minBalance) lines.push(`**Menor saldo projetado:** ${fmt.money(d.minBalance.value)} em ${fmt.date(d.minBalance.date)}`);
    let risk: string;
    if (d.minBalance && d.minBalance.value < 0) risk = `Há risco de faltar caixa: o saldo fica negativo a partir de ${fmt.date(d.days.find((x) => x.balance < 0)?.date)}.`;
    else if (d.attentionDays.length && d.minCashBalance !== null) risk = `Atenção: em ${d.attentionDays.length} dia(s) o saldo fica abaixo do caixa mínimo definido (${fmt.money(d.minCashBalance)}): ${d.attentionDays.slice(0, 5).map((x) => fmt.date(x)).join(", ")}.`;
    else risk = "Não identifiquei risco de falta de caixa no horizonte, considerando apenas os títulos em aberto cadastrados.";
    lines.push(`**Dias de atenção:** ${d.attentionDays.length ? d.attentionDays.map((x) => fmt.date(x)).slice(0, 10).join(", ") : "nenhum"}`);
    lines.push(risk);
    if (d.overdueReceivables > 0) lines.push(`_Recebíveis vencidos (${fmt.money(d.overdueReceivables)}) não foram considerados como entrada. Pagamentos vencidos (${fmt.money(d.overduePayables)}) foram lançados no primeiro dia._`);
    return {
      tool: "forecastCashFlow",
      title: `Projeção de caixa — ${input.days} dias`,
      sufficient: true,
      narrative: lines.join("\n"),
      facts: { opening: d.openingBalance, final: d.finalBalance, totalInflows: d.totalInflows, totalOutflows: d.totalOutflows, maxInflow: d.maxInflow, maxOutflow: d.maxOutflow, minBalance: d.minBalance, attentionDays: d.attentionDays, minCashBalance: d.minCashBalance, days: d.days.map((x) => ({ date: x.date, in: x.inflows, out: x.outflows, balance: x.balance })) },
      blocks: [
        { type: "chart", title: "Saldo projetado (PREVISTO)", chart: "composed", xKey: "date", xFormat: "date", series: [{ key: "entradas", label: "Entradas", kind: "bar" }, { key: "saidas", label: "Saídas", kind: "bar" }, { key: "saldo", label: "Saldo", kind: "line" }], data: d.days.map((x) => ({ date: x.date, entradas: x.inflows, saidas: x.outflows, saldo: x.balance })), valueFormat: "money" },
        { type: "table", columns: [{ key: "weekday", label: "Dia" }, { key: "date", label: "Data", format: "date" }, { key: "inflows", label: "Entradas", format: "money", align: "right" }, { key: "outflows", label: "Saídas", format: "money", align: "right" }, { key: "balance", label: "Saldo", format: "money", align: "right" }], rows: d.days.filter((x, i) => i < 15 || x.inflows || x.outflows).map((x) => ({ weekday: x.weekday, date: x.date, inflows: x.inflows, outflows: x.outflows, balance: x.balance })) },
      ],
      meta: r.meta,
    };
  },
});

const getAccountsReceivable = def({
  name: "getAccountsReceivable",
  description: "Contas a receber: total, previstos, vencidos, clientes inadimplentes, recebimentos da semana e do mês.",
  permission: "receivables:view",
  schema: z.object({}),
  jsonSchema: { type: "object", properties: {} },
  async run(ctx) {
    const r = await receivablesDashboard(ctx);
    if (!r.sufficient) return { ...insufficient("getAccountsReceivable", "Contas a receber"), meta: r.meta };
    const d = r.data;
    return {
      tool: "getAccountsReceivable",
      title: "Contas a receber",
      sufficient: true,
      narrative: `Há ${fmt.money(d.total)} a receber em ${fmt.int(d.openCount)} títulos: ${fmt.money(d.expected)} a vencer e ${fmt.money(d.overdue)} vencidos. Recebimentos previstos para esta semana: ${fmt.money(d.dueThisWeek)}; até o fim do mês: ${fmt.money(d.dueThisMonth)}.` +
        (d.delinquentCustomers.length ? ` ${d.delinquentCustomers.length} clientes estão inadimplentes; o maior saldo vencido é de ${d.delinquentCustomers[0].name} (${fmt.money(d.delinquentCustomers[0].overdue)}).` : ""),
      facts: { total: d.total, expected: d.expected, overdue: d.overdue, week: d.dueThisWeek, month: d.dueThisMonth, delinquent: d.delinquentCustomers.slice(0, 10) },
      blocks: [
        { type: "kpis", items: [{ label: "Total a receber", value: d.total, format: "money" }, { label: "A vencer", value: d.expected, format: "money" }, { label: "Vencidos", value: d.overdue, format: "money" }, { label: "Esta semana", value: d.dueThisWeek, format: "money" }, { label: "Este mês", value: d.dueThisMonth, format: "money" }] },
        { type: "table", title: "Clientes inadimplentes", columns: [{ key: "name", label: "Cliente" }, { key: "overdue", label: "Vencido", format: "money", align: "right" }, { key: "daysOverdue", label: "Dias em atraso", format: "int", align: "right" }, { key: "titles", label: "Títulos", format: "int", align: "right" }], rows: d.delinquentCustomers.slice(0, 15).map((x) => ({ ...x })) },
      ],
      meta: r.meta,
    };
  },
});

const getAccountsPayable = def({
  name: "getAccountsPayable",
  description: "Contas a pagar: total, vencendo hoje/semana/mês, vencidas e títulos que vencem nos próximos N dias.",
  permission: "payables:view",
  schema: z.object({ days: z.number().int().min(1).max(120).default(7), groupBy: z.enum(["supplier", "category", "costCenter", "companyUnit", "department"]).default("supplier") }),
  jsonSchema: { type: "object", properties: { days: { type: "integer" }, groupBy: { type: "string", enum: ["supplier", "category", "costCenter", "companyUnit", "department"] } } },
  async run(ctx, input) {
    const r = await payablesDashboard(ctx, input.groupBy);
    if (!r.sufficient) return { ...insufficient("getAccountsPayable", "Contas a pagar"), meta: r.meta };
    const d = r.data;
    const upcoming = d.upcoming.filter((u) => !u.overdue && u.daysToDue <= input.days - 1);
    const upcomingTotal = round(upcoming.reduce((a, u) => a + u.open, 0));
    return {
      tool: "getAccountsPayable",
      title: "Contas a pagar",
      sufficient: true,
      narrative: `Nos próximos ${input.days} dias vencem ${upcoming.length} títulos, somando ${fmt.money(upcomingTotal)}${upcoming.length ? `: ${upcoming.slice(0, 6).map((u) => `${u.description}${u.supplier ? ` (${u.supplier})` : ""} — ${fmt.money(u.open)} em ${fmt.date(u.dueDate)}`).join("; ")}${upcoming.length > 6 ? "; entre outros" : ""}` : ""}.` +
        ` Total em aberto: ${fmt.money(d.total)}; vencidas: ${fmt.money(d.overdue)} (${fmt.int(d.overdueCount)} títulos).`,
      facts: { days: input.days, upcomingCount: upcoming.length, upcomingTotal, total: d.total, dueToday: d.dueToday, week: d.dueThisWeek, month: d.dueThisMonth, overdue: d.overdue, upcoming: upcoming.slice(0, 15) },
      blocks: [
        { type: "kpis", items: [{ label: "Total a pagar", value: d.total, format: "money" }, { label: "Vence hoje", value: d.dueToday, format: "money" }, { label: "Esta semana", value: d.dueThisWeek, format: "money" }, { label: "Este mês", value: d.dueThisMonth, format: "money" }, { label: "Vencidas", value: d.overdue, format: "money" }] },
        { type: "table", title: `Vencimentos nos próximos ${input.days} dias`, columns: [{ key: "dueDate", label: "Vencimento", format: "date" }, { key: "description", label: "Descrição" }, { key: "supplier", label: "Fornecedor" }, { key: "open", label: "Valor", format: "money", align: "right" }], rows: upcoming.map((u) => ({ dueDate: u.dueDate, description: u.description, supplier: u.supplier, open: u.open })) },
      ],
      meta: r.meta,
    };
  },
});

const getCustomers = def({
  name: "getCustomers",
  description: "Análise de clientes: top (maiores), bottom (menores), increased (aumentaram compras), decreased (reduziram), inactive (sem comprar recentemente), concentration (concentração de receita), margin (maior margem), attention (clientes que precisam de atenção).",
  permission: "customers:view",
  schema: withPeriod({ mode: z.enum(["top", "bottom", "increased", "decreased", "inactive", "concentration", "margin", "attention"]).default("top") }),
  jsonSchema: obj({ mode: { type: "string", enum: ["top", "bottom", "increased", "decreased", "inactive", "concentration", "margin", "attention"] } }),
  async run(ctx, input) {
    const period = P(ctx, input.period);
    const r = await customerAnalysis(ctx, period);
    if (!r.sufficient && input.mode !== "inactive") return { ...insufficient("getCustomers", "Clientes"), meta: r.meta };
    const d = r.data;
    const rankCols = [{ key: "name", label: "Cliente" }, { key: "revenue", label: "Faturamento", format: "money" as const, align: "right" as const }, { key: "share", label: "% receita", format: "pct" as const, align: "right" as const }, { key: "marginPct", label: "Margem", format: "pct" as const, align: "right" as const }, { key: "growthPct", label: "Var. %", format: "pct" as const, align: "right" as const }];
    const changeCols = [{ key: "name", label: "Cliente" }, { key: "previous", label: "Período anterior", format: "money" as const, align: "right" as const }, { key: "current", label: "Período atual", format: "money" as const, align: "right" as const }, { key: "changePct", label: "Var. %", format: "pct" as const, align: "right" as const }];
    const out = (title: string, narrative: string, blocks: Block[], facts: Record<string, unknown>): ToolOutput => ({ tool: "getCustomers", title, sufficient: true, narrative, blocks, facts: { period: period.label, ...facts }, meta: r.meta });
    switch (input.mode) {
      case "top":
        return out("Maiores clientes", d.top ? `O cliente que mais comprou em ${period.label} foi ${d.top.name}, com ${fmt.money(d.top.revenue)} (${fmt.pct(d.top.share)} do faturamento). Os cinco maiores clientes representam ${fmt.pct(d.concentration.top5)} da receita.` : NO_DATA, [{ type: "table", title: "Ranking de clientes", columns: rankCols, rows: d.ranking.slice(0, 15).map((x) => ({ ...x })) }], { top: d.ranking.slice(0, 10), concentrationTop5: d.concentration.top5 });
      case "bottom":
        return out("Menores clientes", d.bottom ? `O cliente com menor faturamento em ${period.label} foi ${d.bottom.name}, com ${fmt.money(d.bottom.revenue)}.` : NO_DATA, [{ type: "table", columns: rankCols, rows: [...d.ranking].reverse().slice(0, 10).map((x) => ({ ...x })) }], { bottom: [...d.ranking].reverse().slice(0, 10) });
      case "increased":
        return out("Clientes que aumentaram compras", d.increased.length ? `Clientes que mais aumentaram as compras em ${period.label} (vs. ${r.meta.comparison?.label}): ${d.increased.slice(0, 5).map((x) => `${x.name} (+${fmt.money(x.change)})`).join("; ")}.` : "Nenhum cliente aumentou as compras de forma relevante no período.", [{ type: "table", columns: changeCols, rows: d.increased.map((x) => ({ ...x })) }], { increased: d.increased });
      case "decreased":
        return out("Clientes que reduziram compras", d.decreased.length ? `Clientes que mais reduziram as compras em ${period.label} (vs. ${r.meta.comparison?.label}): ${d.decreased.slice(0, 5).map((x) => `${x.name} (${fmt.money(x.change)}${x.changePct !== null ? `, ${fmt.signedPct(x.changePct)}` : ""})`).join("; ")}.` : "Nenhum cliente reduziu as compras de forma relevante no período.", [{ type: "table", columns: changeCols, rows: d.decreased.map((x) => ({ ...x })) }], { decreased: d.decreased });
      case "inactive":
        return out("Clientes sem comprar recentemente", d.inactive.length ? `${d.inactive.length} clientes não compram há mais de 60 dias. Os mais relevantes: ${d.inactive.slice(0, 5).map((x) => `${x.name} (${x.daysSince} dias, ${fmt.money(x.revenue12m)} em 12 meses)`).join("; ")}.` : "Não há clientes relevantes sem comprar há mais de 60 dias.", [{ type: "table", columns: [{ key: "name", label: "Cliente" }, { key: "lastPurchase", label: "Última compra", format: "date" }, { key: "daysSince", label: "Dias", format: "int", align: "right" }, { key: "revenue12m", label: "Compras 12 meses", format: "money", align: "right" }], rows: d.inactive.map((x) => ({ ...x })) }], { inactive: d.inactive });
      case "concentration":
        return out("Concentração de receita", `Os cinco maiores clientes representam ${fmt.pct(d.concentration.top5)} da receita em ${period.label} (${d.concentration.top5Names.join(", ")}); os dez maiores, ${fmt.pct(d.concentration.top10)}.`, [{ type: "kpis", items: [{ label: "Top 5 clientes", value: d.concentration.top5, format: "pct" }, { label: "Top 10 clientes", value: d.concentration.top10, format: "pct" }, { label: "Clientes ativos", value: d.activeCustomers, format: "int" }] }, { type: "table", columns: rankCols, rows: d.ranking.slice(0, 10).map((x) => ({ ...x })) }], { concentration: d.concentration });
      case "margin":
        return out("Clientes com maior margem", d.byMargin.length ? `Clientes responsáveis pela maior margem bruta em ${period.label}: ${d.byMargin.slice(0, 5).map((x) => `${x.name} (${fmt.money(x.margin)}, ${fmt.pct(x.marginPct)})`).join("; ")}.` : NO_DATA, [{ type: "table", columns: [{ key: "name", label: "Cliente" }, { key: "margin", label: "Margem", format: "money", align: "right" }, { key: "marginPct", label: "Margem %", format: "pct", align: "right" }, { key: "revenue", label: "Faturamento", format: "money", align: "right" }], rows: d.byMargin.map((x) => ({ ...x })) }], { byMargin: d.byMargin });
      case "attention": {
        const recv = ctx.permissions.has("receivables:view") ? await receivablesDashboard(ctx) : null;
        const items = [
          ...d.decreased.slice(0, 5).map((x) => ({ title: `${x.name} reduziu compras (${fmt.signedPct(x.changePct)})`, description: `${fmt.money(x.previous)} → ${fmt.money(x.current)}`, severity: "ATTENTION" as const })),
          ...d.inactive.slice(0, 5).map((x) => ({ title: `${x.name} sem comprar há ${x.daysSince} dias`, description: `${fmt.money(x.revenue12m)} em compras nos últimos 12 meses`, severity: "OPPORTUNITY" as const })),
          ...(recv?.data.delinquentCustomers.slice(0, 5).map((x) => ({ title: `${x.name} com ${fmt.money(x.overdue)} vencidos`, description: `${x.daysOverdue} dias de atraso`, severity: "CRITICAL" as const })) ?? []),
        ];
        return out("Clientes que precisam de atenção", items.length ? `Identifiquei ${items.length} situações de clientes que merecem atenção: reduções de compra, clientes inativos${recv ? " e inadimplência" : ""}.` : "Nenhum cliente precisa de atenção especial pelos critérios objetivos do Cortex.", [{ type: "list", title: "Clientes que precisam de atenção", items }], { items });
      }
    }
  },
});

const getSalesByCustomer = def({ ...getCustomers, name: "getSalesByCustomer", description: "Ranking de vendas por cliente no período." });

const getSalesByProduct = def({
  name: "getSalesByProduct",
  description: "Vendas por produto/serviço: ranking de receita (top), maior margem (margin), margem baixa (low_margin), crescimento (growth), queda (decline). type=SERVICE para serviços.",
  permission: "products:view",
  schema: withPeriod({ mode: z.enum(["top", "margin", "low_margin", "growth", "decline"]).default("top"), type: z.enum(["PRODUCT", "SERVICE"]).optional() }),
  jsonSchema: obj({ mode: { type: "string", enum: ["top", "margin", "low_margin", "growth", "decline"] }, type: { type: "string", enum: ["PRODUCT", "SERVICE"] } }),
  async run(ctx, input) {
    const period = P(ctx, input.period);
    const r = await productAnalysis(ctx, period, { type: input.type });
    if (!r.sufficient) return { ...insufficient("getSalesByProduct", "Produtos"), meta: r.meta };
    const d = r.data;
    const rows = input.mode === "margin" ? [...d.rows].sort((a, b) => (b.marginPct ?? -999) - (a.marginPct ?? -999)).filter((x) => x.share >= 1) : input.mode === "low_margin" ? d.lowMargin : input.mode === "growth" ? d.growing : input.mode === "decline" ? d.declining : d.rows;
    const first = rows[0];
    const label = input.type === "SERVICE" ? "serviço" : "produto";
    const narratives: Record<string, string> = {
      top: first ? `O ${label} que mais vendeu em ${period.label} foi ${first.name}, com ${fmt.money(first.revenue)} (${fmt.pct(first.share)} da receita) e ${fmt.number(first.quantity)} unidades.` : NO_DATA,
      margin: first ? `O ${label} com maior margem em ${period.label} foi ${first.name} (${fmt.pct(first.marginPct)}, margem de ${fmt.money(first.margin)}).` : NO_DATA,
      low_margin: rows.length ? `${label === "serviço" ? "Serviços" : "Produtos"} relevantes com margem abaixo de 20%: ${rows.slice(0, 5).map((x) => `${x.name} (${fmt.pct(x.marginPct)})`).join("; ")}.` : "Nenhum item relevante com margem abaixo de 20%.",
      growth: rows.length ? `Itens que mais cresceram: ${rows.slice(0, 5).map((x) => `${x.name} (${fmt.signedPct(x.growthPct)})`).join("; ")}.` : "Nenhum item relevante apresentou crescimento.",
      decline: rows.length ? `Itens com maior queda: ${rows.slice(0, 5).map((x) => `${x.name} (${fmt.signedPct(x.growthPct)})`).join("; ")}.` : "Nenhum item relevante apresentou queda.",
    };
    return {
      tool: "getSalesByProduct",
      title: "Produtos e serviços",
      sufficient: true,
      narrative: narratives[input.mode],
      facts: { period: period.label, mode: input.mode, total: d.total, rows: rows.slice(0, 10) },
      blocks: [{ type: "table", columns: [{ key: "name", label: "Item" }, { key: "quantity", label: "Qtd.", format: "number", align: "right" }, { key: "revenue", label: "Receita", format: "money", align: "right" }, { key: "marginPct", label: "Margem", format: "pct", align: "right" }, { key: "share", label: "% receita", format: "pct", align: "right" }, { key: "growthPct", label: "Var. %", format: "pct", align: "right" }], rows: rows.slice(0, 15).map((x) => ({ name: x.name, quantity: x.quantity, revenue: x.revenue, marginPct: x.marginPct, share: x.share, growthPct: x.growthPct })) }],
      meta: r.meta,
    };
  },
});

const getProducts = def({ ...getSalesByProduct, name: "getProducts", description: "Análise de produtos (alias de getSalesByProduct)." });

const getSalesBySeller = def({
  name: "getSalesBySeller",
  description: "Desempenho de vendedores no período: faturamento, número de vendas, margem e crescimento.",
  permission: "sellers:view",
  schema: withPeriod({}),
  jsonSchema: obj({}),
  async run(ctx, input) {
    const period = P(ctx, input.period);
    const r = await salesRanking(ctx, "seller", period);
    if (!r.sufficient) return { ...insufficient("getSalesBySeller", "Vendedores"), meta: r.meta };
    const rows = r.data.rows;
    const best = rows[0];
    return {
      tool: "getSalesBySeller",
      title: "Vendedores",
      sufficient: true,
      narrative: `O vendedor com melhor resultado em ${period.label} foi ${best.name}: ${fmt.money(best.revenue)} em ${fmt.int(best.salesCount)} vendas (${fmt.pct(best.share)} do total, margem de ${fmt.pct(best.marginPct)}).`,
      facts: { period: period.label, rows: rows.slice(0, 10) },
      blocks: [{ type: "table", columns: [{ key: "name", label: "Vendedor" }, { key: "revenue", label: "Faturamento", format: "money", align: "right" }, { key: "salesCount", label: "Vendas", format: "int", align: "right" }, { key: "marginPct", label: "Margem", format: "pct", align: "right" }, { key: "share", label: "% total", format: "pct", align: "right" }, { key: "growthPct", label: "Var. %", format: "pct", align: "right" }], rows: rows.map((x) => ({ ...x })) }],
      meta: r.meta,
    };
  },
});

const comparePeriodsTool = def({
  name: "comparePeriods",
  description: "Compara dois períodos (receita, custos, despesas, margem, EBITDA, lucro, clientes, ticket, vendas). compare=previous (período anterior), last_year (mesmo período do ano anterior) ou custom (com comparisonPeriod).",
  permission: "dre:view",
  schema: withPeriod({ compare: z.enum(["previous", "last_year", "custom"]).default("previous"), comparisonPeriod: periodSchema.optional() }),
  jsonSchema: obj({ compare: { type: "string", enum: ["previous", "last_year", "custom"] }, comparisonPeriod: periodJson }),
  async run(ctx, input) {
    const period = P(ctx, input.period);
    const custom = input.compare === "custom" && input.comparisonPeriod ? P(ctx, input.comparisonPeriod) : undefined;
    const r = await comparePeriods(ctx, period, input.compare, custom);
    if (!r.sufficient) return { ...insufficient("comparePeriods", "Comparação"), meta: r.meta };
    const m = Object.fromEntries(r.data.metrics.map((x) => [x.key, x]));
    const cmpLabel = r.meta.comparison?.label ?? "";
    const f = (k: string) => {
      const x = m[k];
      if (x.previous === null) return `${x.label}: ${x.unit === "pct" ? fmt.pct(x.current) : x.unit === "int" ? fmt.int(x.current) : fmt.money(x.current)}`;
      if (x.unit === "pct") return `${x.label}: ${fmt.pct(x.previous)} → ${fmt.pct(x.current)} (${fmt.pp(x.absVar)})`;
      return `${x.label}: ${x.unit === "int" ? fmt.int(x.previous) : fmt.money(x.previous)} → ${x.unit === "int" ? fmt.int(x.current) : fmt.money(x.current)} (${fmt.signedPct(x.pctVar)})`;
    };
    return {
      tool: "comparePeriods",
      title: "Comparação de períodos",
      sufficient: true,
      narrative: `Comparando ${period.label} com ${cmpLabel}:\n${["grossRevenue", "netRevenue", "grossMarginPct", "ebitda", "netIncome", "netMarginPct", "customers", "averageTicket", "salesCount"].map((k) => `- ${f(k)}`).join("\n")}`,
      facts: { period: period.label, comparison: cmpLabel, metrics: r.data.metrics },
      blocks: [{ type: "table", columns: [{ key: "label", label: "Indicador" }, { key: "previousF", label: cmpLabel }, { key: "currentF", label: period.label }, { key: "var", label: "Variação", align: "right" }], rows: r.data.metrics.map((x) => ({ label: x.label, previousF: fmtUnit(x.previous, x.unit), currentF: fmtUnit(x.current, x.unit), var: x.unit === "pct" ? fmt.pp(x.absVar) : fmt.signedPct(x.pctVar) })) }],
      meta: r.meta,
    };
  },
});

function fmtUnit(v: number | null, unit: "money" | "pct" | "int") {
  return unit === "pct" ? fmt.pct(v) : unit === "int" ? fmt.int(v) : fmt.money(v);
}

const getMargins = def({
  name: "getMargins",
  description: "Margens do período (bruta, EBITDA, líquida) e evolução mensal da margem nos últimos 12 meses.",
  permission: "dre:view",
  schema: withPeriod({}),
  jsonSchema: obj({}),
  async run(ctx, input) {
    const period = P(ctx, input.period);
    const [r, series] = await Promise.all([buildDre(ctx, period), monthlyResults(ctx, startOfMonth(addMonths(ctx.today, -11)), endOfMonth(ctx.today))]);
    if (!r.sufficient) return { ...insufficient("getMargins", "Margens"), meta: r.meta };
    const t = r.data.totals;
    const p = r.data.previousTotals;
    return {
      tool: "getMargins",
      title: "Margens",
      sufficient: true,
      narrative: `${inPeriod(period.label)}: margem bruta de ${fmt.pct(t.grossMarginPct)}, margem EBITDA de ${fmt.pct(t.ebitdaMarginPct)} e margem líquida de ${fmt.pct(t.netMarginPct)}.` + (p ? ` No período anterior, a margem líquida foi de ${fmt.pct(p.netMarginPct)}.` : ""),
      facts: { period: period.label, grossMarginPct: t.grossMarginPct, ebitdaMarginPct: t.ebitdaMarginPct, netMarginPct: t.netMarginPct, previous: p ? { grossMarginPct: p.grossMarginPct, ebitdaMarginPct: p.ebitdaMarginPct, netMarginPct: p.netMarginPct } : null },
      blocks: [
        { type: "kpis", items: [{ label: "Margem bruta", value: t.grossMarginPct, format: "pct", delta: p && t.grossMarginPct !== null && p.grossMarginPct !== null ? round(t.grossMarginPct - p.grossMarginPct) : null, deltaFormat: "pp" }, { label: "Margem EBITDA", value: t.ebitdaMarginPct, format: "pct" }, { label: "Margem líquida", value: t.netMarginPct, format: "pct", delta: p && t.netMarginPct !== null && p.netMarginPct !== null ? round(t.netMarginPct - p.netMarginPct) : null, deltaFormat: "pp" }] },
        { type: "chart", title: "Margens mensais (%)", chart: "line", xKey: "month", xFormat: "month", series: [{ key: "bruta", label: "Margem bruta" }, { key: "liquida", label: "Margem líquida" }], data: series.filter((s) => s.hasData).map((s) => ({ month: s.month, bruta: s.grossMarginPct, liquida: s.netMarginPct })), valueFormat: "pct" },
      ],
      meta: r.meta,
    };
  },
});

const getFinancialIndicators = def({
  name: "getFinancialIndicators",
  description: "Principais indicadores financeiros do período: receita, lucro bruto, EBITDA, lucro líquido, margens, ticket médio, caixa, contas a receber/pagar e inadimplência.",
  permission: "dre:view",
  schema: withPeriod({}),
  jsonSchema: obj({}),
  async run(ctx, input) {
    const period = P(ctx, input.period);
    const [r, s, pos, recv, pay] = await Promise.all([buildDre(ctx, period), salesSummary(ctx, period), cashPosition(ctx), receivablesDashboard(ctx), payablesDashboard(ctx)]);
    if (!r.sufficient) return { ...insufficient("getFinancialIndicators", "Indicadores"), meta: r.meta };
    const t = r.data.totals;
    const overdueRatio = recv.data.total ? round((recv.data.overdue / recv.data.total) * 100, 2) : null;
    return {
      tool: "getFinancialIndicators",
      title: "Indicadores financeiros",
      sufficient: true,
      narrative: `Indicadores de ${period.label}: receita líquida ${fmt.money(t.netRevenue)}, lucro bruto ${fmt.money(t.grossProfit)}, EBITDA ${fmt.money(t.ebitda)}, lucro líquido ${fmt.money(t.netIncome)} (margem ${fmt.pct(t.netMarginPct)}), ticket médio ${fmt.money(s.data.current.averageTicket)}. Caixa atual ${fmt.money(pos.balance)}, a receber ${fmt.money(recv.data.total)} (inadimplência ${fmt.pct(overdueRatio)}), a pagar ${fmt.money(pay.data.total)}.`,
      facts: { period: period.label, totals: t, averageTicket: s.data.current.averageTicket, cash: pos.balance, receivables: recv.data.total, payables: pay.data.total, overdueRatio },
      blocks: [{ type: "kpis", items: [{ label: "Receita líquida", value: t.netRevenue, format: "money" }, { label: "Lucro bruto", value: t.grossProfit, format: "money" }, { label: "EBITDA", value: t.ebitda, format: "money" }, { label: "Lucro líquido", value: t.netIncome, format: "money" }, { label: "Margem líquida", value: t.netMarginPct, format: "pct" }, { label: "Ticket médio", value: s.data.current.averageTicket, format: "money" }, { label: "Caixa", value: pos.balance, format: "money" }, { label: "Inadimplência", value: overdueRatio, format: "pct" }] }],
      meta: r.meta,
    };
  },
});

const forecastRevenue = def({
  name: "forecastRevenue",
  description: "Projeção (PROJETADO, estimativa estatística) de receita, despesas ou resultado até um mês alvo (untilMonth AAAA-MM). target=revenue|expenses|result.",
  permission: "forecasts:view",
  schema: z.object({ target: z.enum(["revenue", "expenses", "result"]).default("revenue"), untilMonth: z.string().regex(/^\d{4}-\d{2}$/).optional() }),
  jsonSchema: { type: "object", properties: { target: { type: "string", enum: ["revenue", "expenses", "result"] }, untilMonth: { type: "string", description: "AAAA-MM" } } },
  async run(ctx, input) {
    const r = await forecast(ctx, input.target, input.untilMonth);
    const labels = { revenue: "receita líquida", expenses: "custos e despesas", result: "resultado líquido" };
    if (!r.sufficient) return { ...insufficient("forecastRevenue", "Projeção", `Não encontrei histórico suficiente para projetar ${labels[input.target]} (são necessários ao menos 6 meses fechados).`), meta: r.meta };
    const future = r.data.points.filter((p) => p.status !== "REALIZADO");
    return {
      tool: "forecastRevenue",
      title: `Projeção de ${labels[input.target]}`,
      sufficient: true,
      narrative: `Projeção de ${labels[input.target]} (PROJETADO — estimativa, não fato), método: ${r.data.method}.\n${future.map((p) => `- ${fmt.month(p.month)}: ${fmt.money(p.value)}${p.status === "PARCIAL" ? ` (realizado até hoje: ${fmt.money(p.realized)})` : ""}`).join("\n")}\nTotal projetado no horizonte: ${fmt.money(r.data.totalProjected)}. Realizado no ano até o mês anterior: ${fmt.money(r.data.totalRealizedYtd)}.`,
      facts: { target: input.target, method: r.data.method, points: r.data.points, totalProjected: r.data.totalProjected, totalRealizedYtd: r.data.totalRealizedYtd },
      blocks: [
        { type: "chart", title: "Realizado x Projetado", chart: "bar", xKey: "month", xFormat: "month", series: [{ key: "realizado", label: "Realizado" }, { key: "projetado", label: "Projetado" }], data: r.data.points.map((p) => ({ month: p.month, realizado: p.status === "REALIZADO" ? p.value : p.status === "PARCIAL" ? p.realized : null, projetado: p.status === "REALIZADO" ? null : p.value })), valueFormat: "money" },
        { type: "notice", tone: "info", text: "Valores PROJETADOS são estimativas estatísticas baseadas no histórico e não devem ser tratados como fatos." },
      ],
      meta: r.meta,
    };
  },
});

const analyzeVariance = def({
  name: "analyzeVariance",
  description: "Análise crítica do resultado do período versus o anterior: principais aumentos e reduções, despesas fora do padrão, mudança de margem, hipóteses (sempre como possibilidade), tendências e pontos de atenção.",
  permission: "dre:view",
  schema: withPeriod({}),
  jsonSchema: obj({}),
  async run(ctx, input) {
    const period = P(ctx, input.period);
    const r = await analyzeDre(ctx, period);
    if (!r.sufficient) return { ...insufficient("analyzeVariance", "Análise do resultado"), meta: r.meta };
    const a = r.data.analysis;
    const sections = [a.summary];
    if (a.increases.length) sections.push(`**Principais aumentos**\n${a.increases.map((i) => `- ${i.label}: ${fmt.money(i.previous)} → ${fmt.money(i.current)} (${fmt.signedPct(i.changePct)})`).join("\n")}`);
    if (a.decreases.length) sections.push(`**Principais reduções**\n${a.decreases.map((i) => `- ${i.label}: ${fmt.money(i.previous)} → ${fmt.money(i.current)} (${fmt.signedPct(i.changePct)})`).join("\n")}`);
    if (a.trends.length) sections.push(`**Tendências**\n${a.trends.map((t) => `- ${t}`).join("\n")}`);
    if (a.hypotheses.length) sections.push(`**Possíveis causas (hipóteses)**\n${a.hypotheses.map((h) => `- ${h}`).join("\n")}`);
    if (a.attention.length) sections.push(`**Pontos de atenção**\n${a.attention.map((h) => `- ${h}`).join("\n")}`);
    return {
      tool: "analyzeVariance",
      title: "Análise crítica do resultado",
      sufficient: true,
      narrative: sections.join("\n\n"),
      facts: { period: period.label, totals: r.data.dre.totals, previous: r.data.dre.previousTotals, ...a },
      blocks: [
        { type: "dre", lines: r.data.dre.lines.map(({ children: _c, absVar: _a, ...l }) => l) },
        ...(a.outliers.length ? [{ type: "table" as const, title: "Despesas fora do padrão", columns: [{ key: "category", label: "Categoria" }, { key: "current", label: "Valor", format: "money" as const, align: "right" as const }, { key: "expected", label: "Esperado (média 3m)", format: "money" as const, align: "right" as const }, { key: "deviationPct", label: "Desvio", format: "pct" as const, align: "right" as const }], rows: a.outliers.map((o) => ({ ...o })) }] : []),
      ],
      meta: r.meta,
    };
  },
});

const getInventory = def({
  name: "getInventory",
  description: "Posição de estoque por produto a partir das movimentações registradas (entradas, saídas, ajustes).",
  permission: "products:view",
  schema: z.object({}),
  jsonSchema: { type: "object", properties: {} },
  async run(ctx) {
    const rows = await prisma.$queryRaw<{ name: string; qty: Prisma.Decimal | null; value: Prisma.Decimal | null }[]>`
      SELECT p."name", SUM(CASE WHEN m."type" = 'OUT' THEN -m."quantity" ELSE m."quantity" END) AS qty,
             SUM(CASE WHEN m."type" = 'OUT' THEN -m."quantity" ELSE m."quantity" END * COALESCE(m."unitCost", p."unitCost", 0)) AS value
      FROM "InventoryMovement" m JOIN "Product" p ON p."id" = m."productId"
      WHERE m."tenantId" = ${ctx.tenantId} AND m."date" <= ${ctx.today}::date
      GROUP BY p."name" ORDER BY 3 DESC LIMIT 30`;
    if (!rows.length) return insufficient("getInventory", "Estoque", "Não existem movimentações de estoque registradas no Cortex para responder essa pergunta.");
    const items = rows.map((r) => ({ name: r.name, quantity: toNum(r.qty), value: round(toNum(r.value)) }));
    const total = round(items.reduce((a, i) => a + i.value, 0));
    return {
      tool: "getInventory",
      title: "Estoque",
      sufficient: true,
      narrative: `O estoque valorizado a custo soma ${fmt.money(total)} considerando ${items.length} produtos com movimentação. Maior valor: ${items[0].name} (${fmt.money(items[0].value)}).`,
      facts: { total, items: items.slice(0, 15) },
      blocks: [{ type: "table", columns: [{ key: "name", label: "Produto" }, { key: "quantity", label: "Quantidade", format: "number", align: "right" }, { key: "value", label: "Valor a custo", format: "money", align: "right" }], rows: items }],
      meta: { sources: [], lastUpdated: null, filters: { referencia: ctx.today.toISOString().slice(0, 10) }, calculation: [{ label: "Quantidade", formula: "Σ entradas + ajustes − saídas" }, { label: "Valor", formula: "quantidade × custo unitário" }] },
    };
  },
});

const getInsights = def({
  name: "getInsights",
  description: "Pontos de atenção, alertas e oportunidades detectados pelo Cortex a partir de regras objetivas.",
  permission: "insights:view",
  schema: z.object({}),
  jsonSchema: { type: "object", properties: {} },
  async run(ctx) {
    const list = await detectInsights(ctx);
    if (!list.length) return insufficient("getInsights", "Insights", "Não identifiquei pontos de atenção relevantes pelos critérios objetivos do Cortex (ou não há dados suficientes).");
    return {
      tool: "getInsights",
      title: "Pontos de atenção e oportunidades",
      sufficient: true,
      narrative: list.slice(0, 8).map((i) => `- **${i.title}** — ${i.description}`).join("\n"),
      facts: { insights: list.slice(0, 10).map((i) => ({ title: i.title, description: i.description, severity: i.severity, evidence: i.evidence })) },
      blocks: [{ type: "list", items: list.slice(0, 12).map((i) => ({ title: i.title, description: i.description, severity: i.severity })) }],
      meta: { sources: [], lastUpdated: null, filters: {}, calculation: [{ label: "Critérios", formula: "regras objetivas com limiares de materialidade (ver INSIGHTS no AI.md)" }] },
    };
  },
});

const getKnowledge = def({
  name: "getKnowledge",
  description: "Consulta o Cortex Knowledge (definições de indicadores, regras contábeis, políticas, metas e contexto da empresa).",
  permission: "chat:use",
  schema: z.object({ query: z.string().max(200) }),
  jsonSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  async run(ctx, input) {
    const items = await searchKnowledge(ctx.tenantId, input.query);
    if (!items.length) return insufficient("getKnowledge", "Cortex Knowledge", "Não encontrei essa definição no Cortex Knowledge da empresa.");
    return {
      tool: "getKnowledge",
      title: "Cortex Knowledge",
      sufficient: true,
      narrative: items.map((i) => `**${i.title}** — ${i.content}`).join("\n\n"),
      facts: { items: items.map((i) => ({ title: i.title, content: i.content })) },
      blocks: [],
      meta: { sources: [{ id: "knowledge", name: "Cortex Knowledge", kind: "KNOWLEDGE", lastUpdatedAt: items[0].updatedAt.toISOString() }], lastUpdated: items[0].updatedAt.toISOString(), filters: { busca: input.query }, calculation: [] },
    };
  },
});

export async function searchKnowledge(tenantId: string, query: string, limit = 3) {
  const words = normalizeText(query).split(" ").filter((w) => w.length > 3).slice(0, 6);
  if (!words.length) return [];
  const items = await prisma.knowledgeItem.findMany({ where: { tenantId, active: true }, take: 200 });
  return items
    .map((i) => {
      const hay = normalizeText(`${i.title} ${i.tags.join(" ")} ${i.content}`);
      const title = normalizeText(i.title);
      const score = words.reduce((s, w) => s + (title.includes(w) ? 3 : 0) + (hay.includes(w) ? 1 : 0), 0);
      return { i, score };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.i);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- registro heterogêneo; entradas são validadas por zod antes da execução
export const TOOLS: ToolDef<any>[] = [
  getCompanyOverview, getSales, getRevenue, getExpenses, getExpensesByCategory, getCashFlow, forecastCashFlow,
  getAccountsReceivable, getAccountsPayable, getCustomers, getSalesByCustomer, getProducts, getSalesByProduct,
  getSalesBySeller, getDRE, comparePeriodsTool, getMargins, getFinancialIndicators, forecastRevenue, analyzeVariance,
  getInventory, getInsights, getKnowledge,
];

export function toolSpecs(permissions: Set<PermissionKey>): ToolSpecForLLM[] {
  return TOOLS.filter((t) => permissions.has(t.permission)).map((t) => ({ name: t.name, description: t.description, parameters: t.jsonSchema }));
}

export async function runTool(ctx: AnalyticsCtx, name: string, rawInput: unknown): Promise<ToolOutput> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return insufficient(name, name, `Ferramenta desconhecida: ${name}.`);
  if (!ctx.permissions.has(tool.permission)) {
    return { ...insufficient(name, tool.name, "Você não tem permissão para consultar essas informações."), facts: { denied: true } };
  }
  const parsed = tool.schema.safeParse(rawInput ?? {});
  if (!parsed.success) return insufficient(name, tool.name, "Parâmetros inválidos para a consulta.");
  return tool.run(ctx, parsed.data);
}
