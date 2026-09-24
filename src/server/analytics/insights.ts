import type { InsightSeverity, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/format";
import { addDays, addMonths, endOfMonth, makePeriod, monthKey, monthPeriod, shiftMonths, startOfMonth } from "@/lib/periods";
import { pctChange, round } from "@/lib/utils";
import { dreTotals } from "./dre";
import { cashflowProjection, expenseTrends, receivablesDashboard } from "./finance";
import { customerAnalysis, productAnalysis, salesSummary } from "./sales";
import type { AnalyticsCtx } from "./types";

export interface InsightCandidate {
  fingerprint: string;
  periodKey: string;
  type: string;
  severity: InsightSeverity;
  title: string;
  description: string;
  metric?: string;
  value?: number;
  evidence: Prisma.InputJsonValue;
}

const SEVERITY_ORDER: Record<InsightSeverity, number> = { CRITICAL: 0, ATTENTION: 1, OPPORTUNITY: 2, INFO: 3 };

/**
 * Regras objetivas de detecção. Cada insight exige limiar de materialidade e carrega a evidência
 * numérica que o originou — nada é emitido sem base nos dados.
 */
export async function detectInsights(ctx: AnalyticsCtx): Promise<InsightCandidate[]> {
  const out: InsightCandidate[] = [];
  const currentStart = startOfMonth(ctx.today);
  const lastMonthStart = addMonths(currentStart, -1);
  const lastMonth = monthPeriod(lastMonthStart.getUTCFullYear(), lastMonthStart.getUTCMonth());
  const prevMonth = shiftMonths(lastMonth, -1);
  const lmKey = monthKey(lastMonth.start);

  const [lm, pm] = await Promise.all([dreTotals(ctx, lastMonth), dreTotals(ctx, prevMonth)]);

  // 1. Receita mês fechado vs anterior
  if (lm.hasData && pm.hasData && pm.totals.netRevenue > 0) {
    const ch = pctChange(lm.totals.netRevenue, pm.totals.netRevenue) ?? 0;
    if (Math.abs(ch) >= 5) {
      const severity: InsightSeverity = ch >= 10 ? "OPPORTUNITY" : ch <= -25 ? "CRITICAL" : ch <= -10 ? "ATTENTION" : "INFO";
      out.push({
        fingerprint: `revenue_mom:${lmKey}`,
        periodKey: lmKey,
        type: "revenue_change",
        severity,
        title: `Receita líquida ${ch > 0 ? "aumentou" : "caiu"} ${fmt.pct(Math.abs(ch))} em ${lastMonth.label}`,
        description: `A receita líquida foi de ${fmt.money(lm.totals.netRevenue)} em ${lastMonth.label}, contra ${fmt.money(pm.totals.netRevenue)} em ${prevMonth.label}.`,
        metric: "netRevenue",
        value: ch,
        evidence: { current: lm.totals.netRevenue, previous: pm.totals.netRevenue, changePct: ch, period: lastMonth.label, comparison: prevMonth.label },
      });
    }
  }

  // 2. Margem bruta (p.p.)
  if (lm.totals.grossMarginPct !== null && pm.totals.grossMarginPct !== null) {
    const pp = round(lm.totals.grossMarginPct - pm.totals.grossMarginPct, 2);
    if (Math.abs(pp) >= 1) {
      const severity: InsightSeverity = pp <= -5 ? "CRITICAL" : pp <= -2 ? "ATTENTION" : pp > 0 ? "OPPORTUNITY" : "INFO";
      out.push({
        fingerprint: `gross_margin:${lmKey}`,
        periodKey: lmKey,
        type: "margin_change",
        severity,
        title: `Margem bruta ${pp > 0 ? "subiu" : "caiu"} ${fmt.number(Math.abs(pp))} pontos percentuais`,
        description: `Margem bruta de ${fmt.pct(lm.totals.grossMarginPct)} em ${lastMonth.label}, contra ${fmt.pct(pm.totals.grossMarginPct)} em ${prevMonth.label}.`,
        metric: "grossMarginPct",
        value: pp,
        evidence: { current: lm.totals.grossMarginPct, previous: pm.totals.grossMarginPct, deltaPp: pp },
      });
    }
  }

  // 3. Mês corrente até hoje vs mesmo intervalo do mês anterior
  const mtd = makePeriod(currentStart, ctx.today);
  const mtdSales = await salesSummary(ctx, mtd, shiftMonths(mtd, -1));
  const mtdVar = mtdSales.data.variation.grossRevenue;
  if (mtdSales.sufficient && mtdVar !== null && Math.abs(mtdVar) >= 10) {
    out.push({
      fingerprint: `mtd_sales:${monthKey(currentStart)}:${ctx.today.getUTCDate()}`,
      periodKey: monthKey(currentStart),
      type: "mtd_sales",
      severity: mtdVar > 0 ? "OPPORTUNITY" : mtdVar <= -20 ? "ATTENTION" : "INFO",
      title: `Faturamento do mês está ${fmt.pct(Math.abs(mtdVar))} ${mtdVar > 0 ? "acima" : "abaixo"} do mesmo intervalo do mês passado`,
      description: `Até hoje: ${fmt.money(mtdSales.data.current.grossRevenue)}; mesmo intervalo do mês anterior: ${fmt.money(mtdSales.data.previous?.grossRevenue ?? 0)}.`,
      metric: "grossRevenue",
      value: mtdVar,
      evidence: { current: mtdSales.data.current.grossRevenue, previous: mtdSales.data.previous?.grossRevenue ?? null },
    });
  }

  // 4. Despesas que cresceram (3 meses vs 3 anteriores) com materialidade
  const trends = await expenseTrends(ctx, 3);
  const monthlyRevenue = lm.totals.netRevenue || 1;
  for (const r of trends.data.increases.slice(0, 5)) {
    if ((r.changePct ?? 0) >= 15 && (r.change ?? 0) / 3 >= monthlyRevenue * 0.005) {
      out.push({
        fingerprint: `expense_growth:${lmKey}:${r.category}`,
        periodKey: lmKey,
        type: "expense_growth",
        severity: (r.changePct ?? 0) >= 40 ? "ATTENTION" : "INFO",
        title: `Despesas com "${r.category}" cresceram ${fmt.pct(r.changePct)}`,
        description: `${fmt.money(r.amount)} nos ${trends.data.recent.label}, contra ${fmt.money(r.previous)} nos ${trends.data.previous.label}.`,
        metric: "expense",
        value: r.changePct ?? 0,
        evidence: { category: r.category, current: r.amount, previous: r.previous, change: r.change },
      });
    }
  }

  // 5/6. Clientes: redução/aumento de compras e concentração (últimos 90 dias vs 90 anteriores)
  const window90 = makePeriod(addDays(ctx.today, -89), ctx.today, "últimos 90 dias");
  const customers = await customerAnalysis(ctx, window90);
  if (customers.sufficient) {
    const total = customers.data.total || 1;
    for (const c of customers.data.decreased.slice(0, 5)) {
      if (c.previous >= total * 0.02 && (c.changePct ?? 0) <= -30) {
        out.push({
          fingerprint: `customer_drop:${monthKey(ctx.today)}:${c.id}`,
          periodKey: monthKey(ctx.today),
          type: "customer_drop",
          severity: "ATTENTION",
          title: `Cliente ${c.name} reduziu compras em ${fmt.pct(Math.abs(c.changePct ?? 0))}`,
          description: `${fmt.money(c.current)} nos últimos 90 dias, contra ${fmt.money(c.previous)} nos 90 dias anteriores.`,
          metric: "customerRevenue",
          value: c.changePct ?? 0,
          evidence: { customerId: c.id, current: c.current, previous: c.previous },
        });
      }
    }
    for (const c of customers.data.increased.slice(0, 3)) {
      if (c.previous >= total * 0.01 && (c.changePct ?? 0) >= 30) {
        out.push({
          fingerprint: `customer_growth:${monthKey(ctx.today)}:${c.id}`,
          periodKey: monthKey(ctx.today),
          type: "customer_growth",
          severity: "OPPORTUNITY",
          title: `Cliente ${c.name} aumentou compras em ${fmt.pct(c.changePct)}`,
          description: `${fmt.money(c.current)} nos últimos 90 dias, contra ${fmt.money(c.previous)} nos 90 dias anteriores.`,
          metric: "customerRevenue",
          value: c.changePct ?? 0,
          evidence: { customerId: c.id, current: c.current, previous: c.previous },
        });
      }
    }
    const top5 = customers.data.concentration.top5;
    if (top5 !== null && top5 >= 40) {
      out.push({
        fingerprint: `concentration:${monthKey(ctx.today)}`,
        periodKey: monthKey(ctx.today),
        type: "concentration",
        severity: top5 >= 60 ? "CRITICAL" : "ATTENTION",
        title: `Os cinco maiores clientes representam ${fmt.pct(top5)} da receita`,
        description: `Concentração nos últimos 90 dias: ${customers.data.concentration.top5Names.join(", ")}.`,
        metric: "concentrationTop5",
        value: top5,
        evidence: { top5, names: customers.data.concentration.top5Names },
      });
    }
    if (customers.data.inactive.length >= 3) {
      const potential = round(customers.data.inactive.reduce((a, c) => a + c.revenue12m, 0));
      out.push({
        fingerprint: `inactive:${monthKey(ctx.today)}`,
        periodKey: monthKey(ctx.today),
        type: "inactive_customers",
        severity: "OPPORTUNITY",
        title: `${customers.data.inactive.length} clientes sem comprar há mais de 60 dias`,
        description: `Esses clientes somaram ${fmt.money(potential)} em compras nos últimos 12 meses. Avalie ações de reativação.`,
        metric: "inactiveCustomers",
        value: customers.data.inactive.length,
        evidence: { customers: customers.data.inactive.slice(0, 10).map((c) => ({ name: c.name, daysSince: c.daysSince })) },
      });
    }
  }

  // 7. Caixa projetado (30 dias)
  const cash = await cashflowProjection(ctx, 30);
  if (cash.sufficient && cash.data.minBalance) {
    const min = cash.data.minBalance;
    const limit = ctx.minCashBalance;
    if (min.value < 0) {
      out.push({
        fingerprint: `cash_negative:${min.date}`,
        periodKey: monthKey(ctx.today),
        type: "cash_risk",
        severity: "CRITICAL",
        title: `Caixa projetado fica negativo em ${fmt.date(min.date)}`,
        description: `Saldo projetado mínimo de ${fmt.money(min.value)} considerando títulos em aberto por vencimento.`,
        metric: "minBalance",
        value: min.value,
        evidence: { minBalance: min, openingBalance: cash.data.openingBalance },
      });
    } else if (limit !== null && min.value < limit) {
      out.push({
        fingerprint: `cash_below_min:${min.date}`,
        periodKey: monthKey(ctx.today),
        type: "cash_risk",
        severity: "ATTENTION",
        title: `Em ${fmt.weekday(min.date).toLowerCase()} (${fmt.date(min.date)}) o caixa projetado fica abaixo do mínimo definido`,
        description: `Saldo projetado de ${fmt.money(min.value)} contra caixa mínimo desejado de ${fmt.money(limit)}.`,
        metric: "minBalance",
        value: min.value,
        evidence: { minBalance: min, minCashBalance: limit },
      });
    }
  }

  // 8. Inadimplência
  const recv = await receivablesDashboard(ctx);
  if (recv.sufficient && recv.data.total > 0) {
    const ratio = round((recv.data.overdue / recv.data.total) * 100, 2);
    if (ratio >= 10) {
      out.push({
        fingerprint: `overdue:${monthKey(ctx.today)}`,
        periodKey: monthKey(ctx.today),
        type: "overdue_receivables",
        severity: ratio >= 25 ? "CRITICAL" : "ATTENTION",
        title: `${fmt.pct(ratio)} das contas a receber estão vencidas`,
        description: `${fmt.money(recv.data.overdue)} vencidos de um total de ${fmt.money(recv.data.total)} em aberto, em ${recv.data.delinquentCustomers.length} clientes.`,
        metric: "overdueRatio",
        value: ratio,
        evidence: { overdue: recv.data.overdue, total: recv.data.total },
      });
    }
  }

  // 9. Produtos com margem baixa e relevância
  const products = await productAnalysis(ctx, lastMonth);
  for (const p of products.data.lowMargin.slice(0, 3)) {
    if (p.share >= 3) {
      out.push({
        fingerprint: `low_margin:${lmKey}:${p.id ?? p.name}`,
        periodKey: lmKey,
        type: "low_margin_product",
        severity: "ATTENTION",
        title: `${p.name} tem margem de ${fmt.pct(p.marginPct)} com ${fmt.pct(p.share)} da receita`,
        description: `Receita de ${fmt.money(p.revenue)} e custo de ${fmt.money(p.cost)} em ${lastMonth.label}.`,
        metric: "productMargin",
        value: p.marginPct ?? 0,
        evidence: { product: p.name, revenue: p.revenue, cost: p.cost, share: p.share },
      });
    }
  }

  // 10. Meta de faturamento
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { revenueGoalMonthly: true } });
  const goal = tenant?.revenueGoalMonthly ? Number(tenant.revenueGoalMonthly) : null;
  if (goal && mtdSales.sufficient) {
    const daysInMonth = endOfMonth(ctx.today).getUTCDate();
    const expected = goal * (ctx.today.getUTCDate() / daysInMonth);
    const ratio = round((mtdSales.data.current.grossRevenue / expected) * 100, 1);
    out.push({
      fingerprint: `goal:${monthKey(ctx.today)}:${ctx.today.getUTCDate()}`,
      periodKey: monthKey(ctx.today),
      type: "goal_tracking",
      severity: ratio < 85 ? "ATTENTION" : ratio >= 105 ? "OPPORTUNITY" : "INFO",
      title: `Faturamento em ${fmt.pct(ratio)} da meta proporcional do mês`,
      description: `Realizado ${fmt.money(mtdSales.data.current.grossRevenue)} contra ${fmt.money(round(expected))} esperados até hoje (meta mensal ${fmt.money(goal)}).`,
      metric: "goalRatio",
      value: ratio,
      evidence: { realized: mtdSales.data.current.grossRevenue, expected: round(expected), goal },
    });
  }

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** Persiste insights de forma idempotente (fingerprint único por tenant). */
export async function refreshInsights(ctx: AnalyticsCtx): Promise<{ detected: number }> {
  const candidates = await detectInsights(ctx);
  for (const c of candidates) {
    await prisma.insight.upsert({
      where: { tenantId_fingerprint: { tenantId: ctx.tenantId, fingerprint: c.fingerprint } },
      create: { tenantId: ctx.tenantId, ...c, value: c.value ?? null },
      update: { severity: c.severity, title: c.title, description: c.description, value: c.value ?? null, evidence: c.evidence },
    });
  }
  return { detected: candidates.length };
}

export function severityRank(s: InsightSeverity) {
  return SEVERITY_ORDER[s];
}
