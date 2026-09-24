import { prisma } from "@/lib/db";
import { fmt } from "@/lib/format";
import { addMonths, endOfMonth, inPeriod, previousPeriod, startOfMonth, type Period } from "@/lib/periods";
import { verifyNumbers } from "@/server/ai/guard";
import { getConfiguredProvider } from "@/server/ai/providers";
import { mergeSources } from "@/server/analytics/base";
import { comparePeriods } from "@/server/analytics/compare";
import { analyzeDre } from "@/server/analytics/dre-analysis";
import { cashflowProjection, payablesDashboard, receivablesDashboard } from "@/server/analytics/finance";
import { detectInsights, type InsightCandidate } from "@/server/analytics/insights";
import { customerAnalysis, productAnalysis, salesRanking, salesSummary } from "@/server/analytics/sales";
import { monthlyResults } from "@/server/analytics/series";
import type { AnalyticsCtx, SourceInfo } from "@/server/analytics/types";
import type { PermissionKey } from "@/server/auth/permissions";
import type { ValueFmt } from "@/lib/format-value";

export interface ReportTable {
  title?: string;
  columns: { key: string; label: string; format?: ValueFmt }[];
  rows: Record<string, string | number | null>[];
}

export interface ReportSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  kpis?: { label: string; value: string }[];
  table?: ReportTable;
  chart?: { title: string; data: { label: string; value: number }[] };
}

export interface ReportDoc {
  type: ReportType;
  title: string;
  tenantName: string;
  isDemo: boolean;
  period: Period;
  generatedAt: Date;
  sections: ReportSection[];
  sources: SourceInfo[];
  narrator: string;
}

export const REPORT_TYPES = {
  dre: { title: "DRE — Demonstração do Resultado", permission: "dre:view" },
  "fluxo-de-caixa": { title: "Fluxo de Caixa", permission: "cashflow:view" },
  vendas: { title: "Relatório de Vendas", permission: "sales:view" },
  clientes: { title: "Relatório de Clientes", permission: "customers:view" },
  produtos: { title: "Relatório de Produtos", permission: "products:view" },
  "contas-a-pagar": { title: "Contas a Pagar", permission: "payables:view" },
  "contas-a-receber": { title: "Contas a Receber", permission: "receivables:view" },
  "resultado-gerencial": { title: "Resultado Gerencial", permission: "dre:view" },
  executivo: { title: "Relatório Executivo", permission: "dre:view" },
  reuniao: { title: "Preparação de Reunião", permission: "dre:view" },
} as const satisfies Record<string, { title: string; permission: PermissionKey }>;

export type ReportType = keyof typeof REPORT_TYPES;

const money = (v: number | null | undefined) => fmt.money(v ?? null);

function dreSection(lines: { label: string; value: number; pctOfNetRevenue: number | null; previous: number | null; pctVar: number | null }[]): ReportSection {
  return {
    heading: "Resultado do período (DRE)",
    table: {
      columns: [
        { key: "label", label: "Linha" },
        { key: "value", label: "Valor", format: "money" },
        { key: "pct", label: "% receita", format: "pct" },
        { key: "previous", label: "Anterior", format: "money" },
        { key: "pctVar", label: "Var. %", format: "pct" },
      ],
      rows: lines.map((l) => ({ label: l.label, value: l.value, pct: l.pctOfNetRevenue, previous: l.previous, pctVar: l.pctVar })),
    },
  };
}

async function executiveNarrative(ctx: AnalyticsCtx, facts: Record<string, unknown>, fallback: string, allowExternalAI: boolean): Promise<{ text: string; narrator: string }> {
  const provider = allowExternalAI ? getConfiguredProvider() : null;
  if (!provider) return { text: fallback, narrator: "deterministic" };
  try {
    const res = await provider.narrate({
      question: "Escreva o resumo executivo do período em até 150 palavras, em um único parágrafo, para a diretoria.",
      facts: JSON.stringify({ ...facts, RESUMO_CALCULADO: fallback }).slice(0, 20_000),
      knowledge: "",
      today: ctx.today.toISOString().slice(0, 10),
    });
    const check = verifyNumbers(res.text, { facts, fallback });
    return check.ok && res.text ? { text: res.text.replace(/\*\*/g, ""), narrator: provider.name } : { text: fallback, narrator: "deterministic" };
  } catch {
    return { text: fallback, narrator: "deterministic" };
  }
}

function recommendedQuestions(insights: InsightCandidate[], netMarginPp: number | null): string[] {
  const q: string[] = [];
  for (const i of insights) {
    if (i.type === "customer_drop") q.push(`O que mudou no relacionamento com ${(i.title.match(/Cliente (.+?) reduziu/) ?? [])[1] ?? "o cliente"}? Há risco de perda?`);
    if (i.type === "expense_growth") q.push(`O aumento em ${(i.title.match(/"(.+?)"/) ?? [])[1] ?? "despesas"} era planejado? Qual o retorno esperado?`);
    if (i.type === "cash_risk") q.push("Quais pagamentos podem ser renegociados ou quais recebimentos antecipados para cobrir o caixa?");
    if (i.type === "concentration") q.push("Qual o plano para reduzir a dependência dos maiores clientes?");
    if (i.type === "overdue_receivables") q.push("Quais ações de cobrança estão em andamento para os títulos vencidos?");
    if (i.type === "low_margin_product") q.push("Devemos revisar preço, custo ou mix dos itens com margem baixa?");
    if (i.type === "inactive_customers") q.push("Há uma ação comercial para reativar clientes sem compras recentes?");
  }
  if (netMarginPp !== null && netMarginPp < 0) q.push("Quais medidas podem recuperar a margem líquida no próximo período?");
  q.push("Quais metas e prioridades definimos para o próximo período?");
  return [...new Set(q)].slice(0, 6);
}

export async function buildReport(type: ReportType, ctx: AnalyticsCtx, period: Period, opts: { tenantName: string; isDemo: boolean; allowExternalAI: boolean }): Promise<ReportDoc> {
  const can = (p: PermissionKey) => ctx.permissions.has(p);
  const base = { type, title: REPORT_TYPES[type].title, tenantName: opts.tenantName, isDemo: opts.isDemo, period, generatedAt: new Date() };
  const sections: ReportSection[] = [];
  let sources: SourceInfo[] = [];
  let narrator = "deterministic";

  switch (type) {
    case "dre": {
      const r = await analyzeDre(ctx, period);
      sources = r.meta.sources;
      const t = r.data.dre.totals;
      sections.push({
        heading: "Indicadores",
        kpis: [
          { label: "Receita líquida", value: money(t.netRevenue) },
          { label: "Lucro bruto", value: `${money(t.grossProfit)} (${fmt.pct(t.grossMarginPct)})` },
          { label: "EBITDA", value: `${money(t.ebitda)} (${fmt.pct(t.ebitdaMarginPct)})` },
          { label: "Lucro líquido", value: `${money(t.netIncome)} (${fmt.pct(t.netMarginPct)})` },
        ],
      });
      sections.push(dreSection(r.data.dre.lines));
      sections.push({ heading: "Análise do Cortex", paragraphs: [r.data.analysis.summary], bullets: [...r.data.analysis.trends, ...r.data.analysis.hypotheses, ...r.data.analysis.attention] });
      break;
    }
    case "fluxo-de-caixa": {
      const r = await cashflowProjection(ctx, 30);
      sources = r.meta.sources;
      const d = r.data;
      sections.push({
        heading: "Resumo (PREVISTO — próximos 30 dias)",
        kpis: [
          { label: "Saldo inicial", value: money(d.openingBalance) },
          { label: "Entradas previstas", value: money(d.totalInflows) },
          { label: "Saídas previstas", value: money(d.totalOutflows) },
          { label: "Saldo projetado", value: money(d.finalBalance) },
          { label: "Menor saldo", value: d.minBalance ? `${money(d.minBalance.value)} em ${fmt.date(d.minBalance.date)}` : "—" },
        ],
      });
      sections.push({
        heading: "Projeção diária",
        table: {
          columns: [{ key: "date", label: "Data", format: "date" }, { key: "weekday", label: "Dia" }, { key: "in", label: "Entradas", format: "money" }, { key: "out", label: "Saídas", format: "money" }, { key: "balance", label: "Saldo", format: "money" }],
          rows: d.days.map((x) => ({ date: x.date, weekday: x.weekday, in: x.inflows, out: x.outflows, balance: x.balance })),
        },
      });
      break;
    }
    case "vendas": {
      const [s, byCustomer, bySeller, byCategory] = await Promise.all([salesSummary(ctx, period), salesRanking(ctx, "customer", period, { limit: 15 }), salesRanking(ctx, "seller", period), salesRanking(ctx, "category", period)]);
      sources = s.meta.sources;
      const c = s.data.current;
      sections.push({
        heading: "Indicadores",
        kpis: [
          { label: "Faturamento", value: `${money(c.grossRevenue)} (${fmt.signedPct(s.data.variation.grossRevenue)})` },
          { label: "Receita líquida", value: money(c.netRevenue) },
          { label: "Vendas", value: fmt.int(c.salesCount) },
          { label: "Ticket médio", value: money(c.averageTicket) },
          { label: "Margem média", value: fmt.pct(c.grossMarginPct) },
          { label: "Clientes ativos / novos", value: `${fmt.int(c.activeCustomers)} / ${fmt.int(c.newCustomers)}` },
        ],
      });
      const rank = (title: string, rows: { name: string; revenue: number; share: number; growthPct: number | null }[]) => ({
        heading: title,
        table: { columns: [{ key: "name", label: "Nome" }, { key: "revenue", label: "Faturamento", format: "money" as const }, { key: "share", label: "%", format: "pct" as const }, { key: "growthPct", label: "Var. %", format: "pct" as const }], rows: rows.map((r) => ({ name: r.name, revenue: r.revenue, share: r.share, growthPct: r.growthPct })) },
      });
      if (can("customers:view")) sections.push(rank("Clientes", byCustomer.data.rows));
      if (can("sellers:view")) sections.push(rank("Vendedores", bySeller.data.rows));
      sections.push(rank("Categorias", byCategory.data.rows));
      break;
    }
    case "clientes": {
      const r = await customerAnalysis(ctx, period);
      sources = r.meta.sources;
      const d = r.data;
      sections.push({ heading: "Resumo", paragraphs: [`Os cinco maiores clientes representam ${fmt.pct(d.concentration.top5)} da receita. ${d.activeCustomers} clientes ativos, ${d.newCustomers} novos.`] });
      sections.push({ heading: "Ranking", table: { columns: [{ key: "name", label: "Cliente" }, { key: "revenue", label: "Faturamento", format: "money" }, { key: "share", label: "%", format: "pct" }, { key: "marginPct", label: "Margem", format: "pct" }, { key: "growthPct", label: "Var. %", format: "pct" }], rows: d.ranking.map((x) => ({ name: x.name, revenue: x.revenue, share: x.share, marginPct: x.marginPct, growthPct: x.growthPct })) } });
      sections.push({ heading: "Reduziram compras", table: { columns: [{ key: "name", label: "Cliente" }, { key: "previous", label: "Anterior", format: "money" }, { key: "current", label: "Atual", format: "money" }, { key: "changePct", label: "Var. %", format: "pct" }], rows: d.decreased.map((x) => ({ ...x })) } });
      sections.push({ heading: "Sem comprar recentemente", table: { columns: [{ key: "name", label: "Cliente" }, { key: "lastPurchase", label: "Última compra", format: "date" }, { key: "daysSince", label: "Dias", format: "int" }, { key: "revenue12m", label: "Compras 12m", format: "money" }], rows: d.inactive.map((x) => ({ ...x })) } });
      break;
    }
    case "produtos": {
      const r = await productAnalysis(ctx, period);
      sources = r.meta.sources;
      sections.push({ heading: "Produtos e serviços", table: { columns: [{ key: "name", label: "Item" }, { key: "quantity", label: "Qtd.", format: "number" }, { key: "revenue", label: "Receita", format: "money" }, { key: "marginPct", label: "Margem", format: "pct" }, { key: "share", label: "%", format: "pct" }, { key: "growthPct", label: "Var. %", format: "pct" }], rows: r.data.rows.map((x) => ({ name: x.name, quantity: x.quantity, revenue: x.revenue, marginPct: x.marginPct, share: x.share, growthPct: x.growthPct })) } });
      break;
    }
    case "contas-a-pagar": {
      const r = await payablesDashboard(ctx, "supplier");
      sources = r.meta.sources;
      const d = r.data;
      sections.push({ heading: "Resumo", kpis: [{ label: "Total a pagar", value: money(d.total) }, { label: "Vencendo hoje", value: money(d.dueToday) }, { label: "Esta semana", value: money(d.dueThisWeek) }, { label: "Este mês", value: money(d.dueThisMonth) }, { label: "Vencidas", value: money(d.overdue) }] });
      sections.push({ heading: "Por fornecedor", table: { columns: [{ key: "name", label: "Fornecedor" }, { key: "total", label: "Em aberto", format: "money" }, { key: "overdue", label: "Vencido", format: "money" }, { key: "count", label: "Títulos", format: "int" }], rows: d.grouped.map((x) => ({ ...x })) } });
      sections.push({ heading: "Próximos vencimentos", table: { columns: [{ key: "dueDate", label: "Vencimento", format: "date" }, { key: "description", label: "Descrição" }, { key: "supplier", label: "Fornecedor" }, { key: "open", label: "Valor", format: "money" }], rows: d.upcoming.map((x) => ({ dueDate: x.dueDate, description: x.description, supplier: x.supplier, open: x.open })) } });
      break;
    }
    case "contas-a-receber": {
      const r = await receivablesDashboard(ctx);
      sources = r.meta.sources;
      const d = r.data;
      sections.push({ heading: "Resumo", kpis: [{ label: "Total a receber", value: money(d.total) }, { label: "A vencer", value: money(d.expected) }, { label: "Vencidos", value: money(d.overdue) }, { label: "Esta semana", value: money(d.dueThisWeek) }, { label: "Este mês", value: money(d.dueThisMonth) }] });
      sections.push({ heading: "Clientes inadimplentes", table: { columns: [{ key: "name", label: "Cliente" }, { key: "overdue", label: "Vencido", format: "money" }, { key: "daysOverdue", label: "Dias", format: "int" }, { key: "titles", label: "Títulos", format: "int" }], rows: d.delinquentCustomers.map((x) => ({ ...x })) } });
      break;
    }
    case "resultado-gerencial": {
      const [r, cmp] = await Promise.all([analyzeDre(ctx, period), comparePeriods(ctx, period, "previous")]);
      sources = r.meta.sources;
      sections.push({ heading: "Comparação com o período anterior", table: { columns: [{ key: "label", label: "Indicador" }, { key: "previous", label: "Anterior" }, { key: "current", label: "Atual" }, { key: "var", label: "Variação" }], rows: cmp.data.metrics.map((m) => ({ label: m.label, previous: m.unit === "pct" ? fmt.pct(m.previous) : m.unit === "int" ? fmt.int(m.previous) : money(m.previous), current: m.unit === "pct" ? fmt.pct(m.current) : m.unit === "int" ? fmt.int(m.current) : money(m.current), var: m.unit === "pct" ? fmt.pp(m.absVar) : fmt.signedPct(m.pctVar) })) } });
      sections.push(dreSection(r.data.dre.lines));
      sections.push({ heading: "Análise", paragraphs: [r.data.analysis.summary], bullets: [...r.data.analysis.hypotheses, ...r.data.analysis.attention] });
      break;
    }
    case "executivo":
    case "reuniao": {
      const cmp = previousPeriod(period);
      const [dre, sales, recv, pay, cash, insights, customers, products, series] = await Promise.all([
        analyzeDre(ctx, period),
        salesSummary(ctx, period, cmp),
        receivablesDashboard(ctx),
        payablesDashboard(ctx),
        cashflowProjection(ctx, 30),
        detectInsights(ctx),
        customerAnalysis(ctx, period),
        productAnalysis(ctx, period),
        monthlyResults(ctx, startOfMonth(addMonths(startOfMonth(period.end), -11)), endOfMonth(period.end)),
      ]);
      sources = mergeSources(dre.meta.sources, sales.meta.sources, cash.meta.sources, recv.meta.sources);
      const t = dre.data.dre.totals;
      const a = dre.data.analysis;
      const s = sales.data.current;
      const attention = insights.filter((i) => i.severity === "CRITICAL" || i.severity === "ATTENTION");
      const opportunities = insights.filter((i) => i.severity === "OPPORTUNITY");
      const kpis = [
        { label: "Faturamento", value: `${money(s.grossRevenue)} (${fmt.signedPct(sales.data.variation.grossRevenue)})` },
        { label: "Receita líquida", value: money(t.netRevenue) },
        { label: "EBITDA", value: `${money(t.ebitda)} (${fmt.pct(t.ebitdaMarginPct)})` },
        { label: "Lucro líquido", value: `${money(t.netIncome)} (${fmt.pct(t.netMarginPct)})` },
        { label: "Ticket médio", value: money(s.averageTicket) },
        { label: "Clientes ativos", value: fmt.int(s.activeCustomers) },
        { label: "Caixa projetado (30d)", value: money(cash.data.finalBalance) },
        { label: "A receber / a pagar", value: `${money(recv.data.total)} / ${money(pay.data.total)}` },
      ];
      const chart = { title: "Receita líquida mensal (últimos 12 meses)", data: series.filter((m) => m.hasData).map((m) => ({ label: fmt.month(m.month), value: m.netRevenue })) };
      const summaryFallback = `${inPeriod(period.label)}, a empresa faturou ${money(s.grossRevenue)} (${fmt.signedPct(sales.data.variation.grossRevenue)} vs. período anterior), com receita líquida de ${money(t.netRevenue)}, EBITDA de ${money(t.ebitda)} e lucro líquido de ${money(t.netIncome)} (margem de ${fmt.pct(t.netMarginPct)}). O caixa projetado para os próximos 30 dias é de ${money(cash.data.finalBalance)}${cash.data.minBalance ? `, com menor saldo de ${money(cash.data.minBalance.value)} em ${fmt.date(cash.data.minBalance.date)}` : ""}. ${attention.length ? `Foram identificados ${attention.length} pontos de atenção` : "Não foram identificados pontos críticos"} e ${opportunities.length} oportunidades.`;

      if (type === "executivo") {
        const narrative = await executiveNarrative(ctx, { totals: t, sales: s, variation: sales.data.variation, cash: { final: cash.data.finalBalance, min: cash.data.minBalance }, attention: attention.map((i) => i.title) }, summaryFallback, opts.allowExternalAI);
        narrator = narrative.narrator;
        sections.push({ heading: "Resumo executivo", paragraphs: [narrative.text] });
        sections.push({ heading: "Principais indicadores", kpis });
        sections.push(dreSection(dre.data.dre.lines));
        sections.push({ heading: "Variações importantes", bullets: [...a.increases.slice(0, 4).map((i) => `${i.label}: ${money(i.previous)} -> ${money(i.current)} (${fmt.signedPct(i.changePct)})`), ...a.decreases.slice(0, 4).map((i) => `${i.label}: ${money(i.previous)} -> ${money(i.current)} (${fmt.signedPct(i.changePct)})`)] });
        sections.push({
          heading: "Desempenho comercial",
          paragraphs: [`${fmt.int(s.salesCount)} vendas, ticket médio de ${money(s.averageTicket)}, ${fmt.int(s.activeCustomers)} clientes ativos (${fmt.int(s.newCustomers)} novos). Os cinco maiores clientes representam ${fmt.pct(customers.data.concentration.top5)} da receita.`],
          table: { title: "Maiores clientes", columns: [{ key: "name", label: "Cliente" }, { key: "revenue", label: "Faturamento", format: "money" }, { key: "share", label: "%", format: "pct" }], rows: customers.data.ranking.slice(0, 8).map((x) => ({ name: x.name, revenue: x.revenue, share: x.share })) },
        });
        sections.push({ heading: "Situação financeira", kpis: [{ label: "Contas a receber", value: money(recv.data.total) }, { label: "Recebíveis vencidos", value: money(recv.data.overdue) }, { label: "Contas a pagar", value: money(pay.data.total) }, { label: "Pagamentos vencidos", value: money(pay.data.overdue) }] });
        sections.push({ heading: "Fluxo de caixa (PREVISTO, 30 dias)", kpis: [{ label: "Saldo inicial", value: money(cash.data.openingBalance) }, { label: "Entradas previstas", value: money(cash.data.totalInflows) }, { label: "Saídas previstas", value: money(cash.data.totalOutflows) }, { label: "Saldo final", value: money(cash.data.finalBalance) }] });
        sections.push({ heading: "Pontos de atenção", bullets: attention.length ? attention.map((i) => `${i.title}. ${i.description}`) : ["Nenhum ponto de atenção pelos critérios objetivos do Cortex."] });
        sections.push({ heading: "Oportunidades", bullets: opportunities.length ? opportunities.map((i) => `${i.title}. ${i.description}`) : ["Nenhuma oportunidade destacada no período."] });
        const conclusion =
          t.netIncome > 0
            ? `O período encerra com resultado positivo de ${money(t.netIncome)}. ${a.marginChange.netPp !== null ? `A margem líquida variou ${fmt.pp(a.marginChange.netPp)} em relação ao período anterior.` : ""} ${attention.length ? "Recomenda-se acompanhar os pontos de atenção listados." : ""}`
            : `O período apresenta resultado negativo de ${money(t.netIncome)}. Recomenda-se revisar custos, despesas e as hipóteses listadas na análise.`;
        sections.push({ heading: "Conclusão", paragraphs: [conclusion.trim()], chart });
      } else {
        const events = [
          ...a.trends.slice(0, 2),
          ...insights.slice(0, 5).map((i) => i.title),
        ].slice(0, 5);
        sections.push({ heading: "Resumo do período", paragraphs: [summaryFallback] });
        sections.push({ heading: "KPIs", kpis });
        sections.push({ heading: "5 principais acontecimentos", bullets: events.length ? events : ["Sem acontecimentos relevantes pelos critérios objetivos."] });
        sections.push({ heading: "Problemas encontrados", bullets: [...attention.map((i) => `${i.title}. ${i.description}`), ...a.attention].slice(0, 8).length ? [...attention.map((i) => `${i.title}. ${i.description}`), ...a.attention].slice(0, 8) : ["Nenhum problema relevante identificado."] });
        sections.push({ heading: "Oportunidades", bullets: opportunities.length ? opportunities.map((i) => `${i.title}. ${i.description}`) : ["Nenhuma oportunidade destacada."] });
        sections.push({ heading: "Perguntas recomendadas", bullets: recommendedQuestions(insights, a.marginChange.netPp) });
        sections.push({
          heading: "Gráficos importantes",
          chart,
          table: { title: "Produtos com maior receita", columns: [{ key: "name", label: "Item" }, { key: "revenue", label: "Receita", format: "money" }, { key: "marginPct", label: "Margem", format: "pct" }], rows: products.data.rows.slice(0, 8).map((x) => ({ name: x.name, revenue: x.revenue, marginPct: x.marginPct })) },
        });
      }
      break;
    }
  }
  return { ...base, sections, sources, narrator };
}

export async function recordReport(tenantId: string, userId: string, doc: ReportDoc, format: "PDF" | "XLSX" | "CSV" | "JSON") {
  await prisma.report.create({
    data: {
      tenantId,
      type: doc.type,
      title: doc.title,
      periodStart: doc.period.start,
      periodEnd: doc.period.end,
      format,
      createdById: userId,
      content: { sections: doc.sections.map((s) => s.heading), narrator: doc.narrator, sources: doc.sources.map((s) => s.name) },
    },
  });
}
