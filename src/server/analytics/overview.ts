import { addMonths, endOfMonth, makePeriod, resolvePreset, shiftMonths, startOfMonth } from "@/lib/periods";
import { pctChange } from "@/lib/utils";
import { mergeSources } from "./base";
import { dreTotals } from "./dre";
import { cashMovementsMonthly, cashPosition, cashflowProjection, payablesDashboard, receivablesDashboard } from "./finance";
import { salesRanking, salesSummary } from "./sales";
import { monthlyResults } from "./series";
import type { AnalyticsCtx } from "./types";

export async function executiveOverview(ctx: AnalyticsCtx) {
  const today = ctx.today;
  const mtd = resolvePreset("this_month", today);
  const ytd = resolvePreset("this_year", today);
  const todayP = resolvePreset("today", today);
  const lastYearYtd = shiftMonths(ytd, -12);
  const seriesStart = startOfMonth(addMonths(startOfMonth(today), -11));

  const [dMtd, dPrevMtd, dYtd, dPrevYtd, sToday, sMtd, sYtd, cash, recv, pay, series, movements, projection, byCustomer, byCategory] =
    await Promise.all([
      dreTotals(ctx, mtd),
      dreTotals(ctx, shiftMonths(mtd, -1)),
      dreTotals(ctx, ytd),
      dreTotals(ctx, lastYearYtd),
      salesSummary(ctx, todayP),
      salesSummary(ctx, mtd),
      salesSummary(ctx, ytd, lastYearYtd),
      cashPosition(ctx),
      receivablesDashboard(ctx),
      payablesDashboard(ctx),
      monthlyResults(ctx, seriesStart, endOfMonth(today)),
      cashMovementsMonthly(ctx, seriesStart, endOfMonth(today)),
      cashflowProjection(ctx, 30),
      salesRanking(ctx, "customer", mtd, { limit: 8 }),
      salesRanking(ctx, "category", mtd, { limit: 8 }),
    ]);

  const v = (a: number | null, b: number | null, has: boolean) => (has && a !== null && b !== null ? pctChange(a, b) : null);
  const pp = (a: number | null, b: number | null, has: boolean) => (has && a !== null && b !== null ? Math.round((a - b) * 100) / 100 : null);

  const sources = mergeSources(sMtd.meta.sources, sYtd.meta.sources, projection.meta.sources, recv.meta.sources, pay.meta.sources);
  const lastUpdated = sources.map((s) => s.lastUpdatedAt).sort().pop() ?? null;

  return {
    hasData: dYtd.hasData || sYtd.sufficient || cash.balance !== null,
    periods: { mtd, ytd, today: todayP, previousMtd: shiftMonths(mtd, -1), lastYearYtd },
    sources,
    lastUpdated,
    cards: {
      grossRevenue: {
        today: sToday.data.current.grossRevenue,
        month: sMtd.data.current.grossRevenue,
        year: sYtd.data.current.grossRevenue,
        monthVar: sMtd.data.variation.grossRevenue,
        yearVar: sYtd.data.variation.grossRevenue,
      },
      netRevenue: { month: dMtd.totals.netRevenue, year: dYtd.totals.netRevenue, monthVar: v(dMtd.totals.netRevenue, dPrevMtd.totals.netRevenue, dPrevMtd.hasData), yearVar: v(dYtd.totals.netRevenue, dPrevYtd.totals.netRevenue, dPrevYtd.hasData) },
      netIncome: { month: dMtd.totals.netIncome, year: dYtd.totals.netIncome, monthVar: v(dMtd.totals.netIncome, dPrevMtd.totals.netIncome, dPrevMtd.hasData), yearVar: v(dYtd.totals.netIncome, dPrevYtd.totals.netIncome, dPrevYtd.hasData) },
      netMargin: { month: dMtd.totals.netMarginPct, year: dYtd.totals.netMarginPct, monthPp: pp(dMtd.totals.netMarginPct, dPrevMtd.totals.netMarginPct, dPrevMtd.hasData), yearPp: pp(dYtd.totals.netMarginPct, dPrevYtd.totals.netMarginPct, dPrevYtd.hasData) },
      ebitda: { month: dMtd.totals.ebitda, year: dYtd.totals.ebitda, monthVar: v(dMtd.totals.ebitda, dPrevMtd.totals.ebitda, dPrevMtd.hasData), yearVar: v(dYtd.totals.ebitda, dPrevYtd.totals.ebitda, dPrevYtd.hasData) },
      cash: { balance: cash.balance, projected30: projection.data.finalBalance, minProjected: projection.data.minBalance },
      receivables: { total: recv.data.total, overdue: recv.data.overdue, week: recv.data.dueThisWeek },
      payables: { total: pay.data.total, overdue: pay.data.overdue, week: pay.data.dueThisWeek },
      sales: { countMonth: sMtd.data.current.salesCount, ticketMonth: sMtd.data.current.averageTicket, activeCustomers: sMtd.data.current.activeCustomers },
    },
    charts: {
      monthly: series.map((m) => ({ month: m.month, receita: m.netRevenue, lucro: m.netIncome, margem: m.netMarginPct, ebitda: m.ebitda })),
      movements: movements.map((m) => ({ month: m.month, entradas: m.inflows, saidas: m.outflows })),
      cashflow: projection.data.days.map((d) => ({ date: d.date, saldo: d.balance, entradas: d.inflows, saidas: d.outflows })),
      byCustomer: byCustomer.data.rows.map((r) => ({ name: r.name, value: r.revenue })),
      byCategory: byCategory.data.rows.map((r) => ({ name: r.name, value: r.revenue })),
    },
  };
}

export type ExecutiveOverview = Awaited<ReturnType<typeof executiveOverview>>;

export function mtdPeriod(ctx: AnalyticsCtx) {
  return makePeriod(startOfMonth(ctx.today), ctx.today);
}
