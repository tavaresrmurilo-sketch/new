import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addDays, addMonths, endOfMonth, startOfMonth } from "@/lib/periods";
import { round } from "@/lib/utils";
import type { Baseline } from "@/lib/scenario-sim";
export { assumptionsSchema, presetAssumptions, simulate, type Assumptions, type Baseline, type ScenarioResult } from "@/lib/scenario-sim";
import { toNum } from "@/server/tenant";
import { cashPosition } from "./finance";
import { monthlyResults } from "./series";
import type { AnalyticsCtx } from "./types";

export async function scenarioBaseline(ctx: AnalyticsCtx): Promise<Baseline> {
  const currentStart = startOfMonth(ctx.today);
  const lastClosed = endOfMonth(addMonths(currentStart, -1));
  const series = (await monthlyResults(ctx, startOfMonth(addMonths(currentStart, -6)), lastClosed)).filter((m) => m.hasData);
  const recent = series.slice(-3);
  const cash = await cashPosition(ctx);

  const recvStats = await prisma.$queryRaw<{ dso: number | null; total: Prisma.Decimal | null; defaulted: Prisma.Decimal | null }[]>`
    SELECT AVG("receivedAt" - "issueDate")::float AS dso,
           SUM("amount") AS total,
           SUM(CASE WHEN "status" IN ('OPEN','PARTIAL') AND "dueDate" < ${addDays(ctx.today, -60)}::date THEN "amount" - "receivedAmount" ELSE 0 END) AS defaulted
    FROM "AccountReceivable" WHERE "tenantId" = ${ctx.tenantId} AND "issueDate" >= ${startOfMonth(addMonths(currentStart, -6))}::date`;

  if (recent.length < 1) {
    return { months: 0, avgNetRevenue: 0, costRatio: 0, avgOperatingExpenses: 0, otherResultRatio: 0, historicalGrowthPct: 0, dsoDays: 30, defaultRatePct: 0, openingCash: cash.balance ?? 0, sufficient: false };
  }
  const avg = (f: (m: (typeof recent)[number]) => number) => recent.reduce((a, m) => a + f(m), 0) / recent.length;
  const avgNetRevenue = avg((m) => m.netRevenue);
  const avgCosts = avg((m) => m.costs);
  const avgOpex = avg((m) => m.operatingExpenses);
  const avgOther = avg((m) => m.ebitda - m.netIncome);
  let growth = 0;
  if (series.length >= 4) {
    const first = series[0].netRevenue;
    const last = series[series.length - 1].netRevenue;
    if (first > 0 && last > 0) growth = (Math.pow(last / first, 1 / (series.length - 1)) - 1) * 100;
  }
  const total = toNum(recvStats[0]?.total);
  const defaulted = toNum(recvStats[0]?.defaulted);
  return {
    months: recent.length,
    avgNetRevenue: round(avgNetRevenue),
    costRatio: avgNetRevenue ? avgCosts / avgNetRevenue : 0,
    avgOperatingExpenses: round(avgOpex),
    otherResultRatio: avgNetRevenue ? avgOther / avgNetRevenue : 0,
    historicalGrowthPct: round(Math.max(-5, Math.min(5, growth)), 2),
    dsoDays: round(recvStats[0]?.dso ?? 30, 0),
    defaultRatePct: total ? round((defaulted / total) * 100, 2) : 0,
    openingCash: cash.balance ?? 0,
    sufficient: true,
  };
}

export function scenarioStartMonth(ctx: AnalyticsCtx): Date {
  return startOfMonth(addMonths(startOfMonth(ctx.today), 1));
}

