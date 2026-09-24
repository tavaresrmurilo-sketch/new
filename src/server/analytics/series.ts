import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { monthsBetween } from "@/lib/periods";
import { round } from "@/lib/utils";
import { toNum } from "@/server/tenant";
import { loadClassifier } from "./classification";
import type { AnalyticsCtx } from "./types";

export interface MonthlyResult {
  month: string;
  grossRevenue: number;
  netRevenue: number;
  costs: number;
  grossProfit: number;
  operatingExpenses: number;
  ebitda: number;
  netIncome: number;
  totalOutflowsAccrual: number;
  grossMarginPct: number | null;
  netMarginPct: number | null;
  hasData: boolean;
}

/** Resultado mensal (competência) calculado com as mesmas regras do DRE, em 3 consultas agregadas. */
export async function monthlyResults(ctx: AnalyticsCtx, start: Date, end: Date): Promise<MonthlyResult[]> {
  const [sales, revenues, expenses, classifier] = await Promise.all([
    prisma.$queryRaw<{ month: string; gross: Prisma.Decimal; disc: Prisma.Decimal; tax: Prisma.Decimal; cost: Prisma.Decimal }[]>`
      SELECT to_char(date_trunc('month', "date"), 'YYYY-MM') AS month, SUM("grossAmount") AS gross,
             SUM("discountAmount") AS disc, SUM("taxAmount") AS tax, SUM("costAmount") AS cost
      FROM "Sale" WHERE "tenantId" = ${ctx.tenantId} AND "status" = 'COMPLETED' AND "date" BETWEEN ${start}::date AND ${end}::date
      GROUP BY 1`,
    prisma.$queryRaw<{ month: string; category: string; total: Prisma.Decimal }[]>`
      SELECT to_char(date_trunc('month', "date"), 'YYYY-MM') AS month, "category", SUM("amount") AS total
      FROM "Revenue" WHERE "tenantId" = ${ctx.tenantId} AND "date" BETWEEN ${start}::date AND ${end}::date GROUP BY 1, 2`,
    prisma.$queryRaw<{ month: string; category: string; total: Prisma.Decimal }[]>`
      SELECT to_char(date_trunc('month', "date"), 'YYYY-MM') AS month, "category", SUM("amount") AS total
      FROM "Expense" WHERE "tenantId" = ${ctx.tenantId} AND "date" BETWEEN ${start}::date AND ${end}::date GROUP BY 1, 2`,
    loadClassifier(ctx.tenantId),
  ]);

  const acc = new Map<string, Record<string, number>>();
  const bucket = (m: string) => {
    let b = acc.get(m);
    if (!b) {
      b = { GROSS_REVENUE: 0, DEDUCTIONS: 0, COGS: 0, OPERATING_EXPENSES: 0, DEPRECIATION: 0, FINANCIAL_INCOME: 0, FINANCIAL_EXPENSES: 0, NON_OPERATING: 0, INCOME_TAXES: 0 };
      acc.set(m, b);
    }
    return b;
  };
  for (const s of sales) {
    const b = bucket(s.month);
    b.GROSS_REVENUE += toNum(s.gross);
    b.DEDUCTIONS += toNum(s.disc) + toNum(s.tax);
    b.COGS += toNum(s.cost);
  }
  for (const r of revenues) bucket(r.month)[classifier.classifyRevenue(r.category).group] += toNum(r.total);
  for (const e of expenses) bucket(e.month)[classifier.classifyExpense(e.category).group] += toNum(e.total);

  return monthsBetween(start, end).map((month) => {
    const b = acc.get(month);
    if (!b) {
      return { month, grossRevenue: 0, netRevenue: 0, costs: 0, grossProfit: 0, operatingExpenses: 0, ebitda: 0, netIncome: 0, totalOutflowsAccrual: 0, grossMarginPct: null, netMarginPct: null, hasData: false };
    }
    const netRevenue = round(b.GROSS_REVENUE - b.DEDUCTIONS);
    const grossProfit = round(netRevenue - b.COGS);
    const ebitda = round(grossProfit - b.OPERATING_EXPENSES);
    const netIncome = round(ebitda - b.DEPRECIATION + b.FINANCIAL_INCOME - b.FINANCIAL_EXPENSES + b.NON_OPERATING - b.INCOME_TAXES);
    return {
      month,
      grossRevenue: round(b.GROSS_REVENUE),
      netRevenue,
      costs: round(b.COGS),
      grossProfit,
      operatingExpenses: round(b.OPERATING_EXPENSES),
      ebitda,
      netIncome,
      totalOutflowsAccrual: round(b.COGS + b.OPERATING_EXPENSES + b.DEPRECIATION + b.FINANCIAL_EXPENSES + b.INCOME_TAXES - b.FINANCIAL_INCOME - b.NON_OPERATING),
      grossMarginPct: netRevenue ? round((grossProfit / netRevenue) * 100, 2) : null,
      netMarginPct: netRevenue ? round((netIncome / netRevenue) * 100, 2) : null,
      hasData: true,
    };
  });
}
