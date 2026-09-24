import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addMonths, endOfMonth, monthKey, monthsBetween, startOfMonth, utcDate } from "@/lib/periods";
import { round } from "@/lib/utils";
import { toNum } from "@/server/tenant";
import { buildMeta, sourcesUsed } from "./base";
import { cashPosition } from "./finance";
import { monthlyResults } from "./series";
import type { Analysis, AnalyticsCtx } from "./types";

export type PointStatus = "REALIZADO" | "PARCIAL" | "PROJETADO";

export interface ForecastPoint {
  month: string;
  status: PointStatus;
  realized: number | null;
  projected: number | null;
  value: number;
}

export interface ForecastSeries {
  method: string;
  points: ForecastPoint[];
  historyMonths: number;
  seasonal: boolean;
  slope: number;
}

/** Regressão linear simples (mínimos quadrados). */
export function linearRegression(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  if (n === 1) return { slope: 0, intercept: values[0] };
  const xs = values.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (values[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den ? num / den : 0;
  return { slope, intercept: my - slope * mx };
}

/** Índices sazonais por mês do ano; exige ao menos 24 meses de histórico. */
export function seasonalIndices(history: { month: string; value: number }[]): Map<number, number> | null {
  if (history.length < 24) return null;
  const avg = history.reduce((a, h) => a + h.value, 0) / history.length;
  if (!avg) return null;
  const byMonth = new Map<number, number[]>();
  history.forEach((h) => {
    const mi = Number(h.month.slice(5, 7));
    byMonth.set(mi, [...(byMonth.get(mi) ?? []), h.value]);
  });
  const idx = new Map<number, number>();
  byMonth.forEach((vals, mi) => idx.set(mi, vals.reduce((a, b) => a + b, 0) / vals.length / avg));
  return idx.size === 12 ? idx : null;
}

export function projectSeries(
  history: { month: string; value: number }[],
  futureMonths: string[],
): { projections: Map<string, number>; method: string; seasonal: boolean; slope: number } | null {
  const useful = history.slice(-36);
  if (useful.filter((h) => h.value !== 0).length < 6) return null;
  const season = seasonalIndices(useful);
  const deseason = useful.map((h) => (season ? h.value / (season.get(Number(h.month.slice(5, 7))) || 1) : h.value));
  const window = deseason.slice(-12);
  const { slope, intercept } = linearRegression(window);
  const projections = new Map<string, number>();
  futureMonths.forEach((m, i) => {
    const x = window.length + i;
    let v = intercept + slope * x;
    if (season) v *= season.get(Number(m.slice(5, 7))) || 1;
    projections.set(m, round(Math.max(0, v)));
  });
  return {
    projections,
    method: season ? "tendência linear (12 meses) com sazonalidade mensal (≥24 meses de histórico)" : "tendência linear dos últimos 12 meses",
    seasonal: Boolean(season),
    slope: round(slope),
  };
}

export type ForecastTarget = "revenue" | "expenses" | "result";

export async function forecast(
  ctx: AnalyticsCtx,
  target: ForecastTarget,
  untilMonth?: string,
): Promise<Analysis<ForecastSeries & { totalProjected: number; totalRealizedYtd: number }>> {
  const currentStart = startOfMonth(ctx.today);
  const lastClosedEnd = endOfMonth(addMonths(currentStart, -1));
  const historyStart = startOfMonth(addMonths(currentStart, -36));
  const horizonEnd = untilMonth
    ? endOfMonth(utcDate(Number(untilMonth.slice(0, 4)), Number(untilMonth.slice(5, 7)) - 1, 1))
    : endOfMonth(addMonths(currentStart, 5));

  const history = await monthlyResults(ctx, historyStart, endOfMonth(ctx.today));
  const firstWithData = history.findIndex((h) => h.hasData);
  const valid = firstWithData >= 0 ? history.slice(firstWithData) : [];
  const pick = (h: (typeof history)[number]) =>
    target === "revenue" ? h.netRevenue : target === "expenses" ? h.totalOutflowsAccrual : h.netIncome;

  const closed = valid.filter((h) => h.month <= monthKey(lastClosedEnd));
  const current = valid.find((h) => h.month === monthKey(currentStart));
  const future = monthsBetween(currentStart, horizonEnd);
  const sources = await sourcesUsed(ctx, ["sales", "expenses", "revenues"]);

  let proj: ReturnType<typeof projectSeries>;
  if (target === "result") {
    const rev = projectSeries(closed.map((h) => ({ month: h.month, value: h.netRevenue })), future);
    const exp = projectSeries(closed.map((h) => ({ month: h.month, value: h.totalOutflowsAccrual })), future);
    proj = rev && exp
      ? {
          projections: new Map(future.map((m) => [m, round((rev.projections.get(m) ?? 0) - (exp.projections.get(m) ?? 0))])),
          method: `receita projetada − custos/despesas projetados (${rev.method})`,
          seasonal: rev.seasonal,
          slope: round(rev.slope - exp.slope),
        }
      : null;
  } else {
    proj = projectSeries(closed.map((h) => ({ month: h.month, value: pick(h) })), future);
  }

  const labels: Record<ForecastTarget, string> = { revenue: "Receita líquida", expenses: "Custos e despesas", result: "Resultado líquido" };
  if (!proj) {
    return {
      data: { method: "insuficiente", points: [], historyMonths: closed.length, seasonal: false, slope: 0, totalProjected: 0, totalRealizedYtd: 0 },
      meta: buildMeta({ sources, calculation: [], notes: ["São necessários ao menos 6 meses fechados com dados para projetar."] }),
      sufficient: false,
    };
  }

  const points: ForecastPoint[] = closed.slice(-12).map((h) => ({
    month: h.month,
    status: "REALIZADO",
    realized: pick(h),
    projected: null,
    value: pick(h),
  }));
  future.forEach((m) => {
    const projected = proj.projections.get(m) ?? 0;
    if (m === monthKey(currentStart)) {
      const realized = current ? pick(current) : 0;
      // mês corrente: realizado até hoje + projeção do mês inteiro (nunca menor que o já realizado, exceto resultado)
      const value = target === "result" ? projected : Math.max(realized, projected);
      points.push({ month: m, status: "PARCIAL", realized, projected: value, value });
    } else {
      points.push({ month: m, status: "PROJETADO", realized: null, projected, value: projected });
    }
  });

  const year = String(ctx.today.getUTCFullYear());
  const totalRealizedYtd = round(valid.filter((h) => h.month.startsWith(year) && h.month < monthKey(currentStart)).reduce((a, h) => a + pick(h), 0));
  const totalProjected = round(points.filter((p) => p.status !== "REALIZADO").reduce((a, p) => a + p.value, 0));

  return {
    data: { method: proj.method, points, historyMonths: closed.length, seasonal: proj.seasonal, slope: proj.slope, totalProjected, totalRealizedYtd },
    meta: buildMeta({
      sources,
      filters: { indicador: labels[target], horizonte: `até ${future[future.length - 1]}` },
      calculation: [
        { label: "Histórico utilizado", value: closed.length, detail: "meses fechados com dados" },
        { label: "Método", formula: proj.method },
        { label: "Tendência mensal", value: proj.slope, detail: "variação média por mês na série dessazonalizada" },
        { label: "REALIZADO", formula: "valores efetivamente registrados em meses fechados" },
        { label: "PARCIAL", formula: "mês corrente: realizado até hoje + projeção do mês" },
        { label: "PROJETADO", formula: "estimativa estatística — não é fato" },
      ],
      notes: ["Projeções são estimativas baseadas no histórico e podem divergir do resultado real."],
    }),
    sufficient: true,
  };
}

/** Projeção mensal de caixa: PREVISTO (títulos agendados) + PROJETADO (resultado estimado). */
export async function cashForecastMonthly(ctx: AnalyticsCtx, months = 6) {
  const currentStart = startOfMonth(ctx.today);
  const end = endOfMonth(addMonths(currentStart, months - 1));
  const [position, scheduled, resultFc] = await Promise.all([
    cashPosition(ctx),
    prisma.$queryRaw<{ month: string; inflow: Prisma.Decimal; outflow: Prisma.Decimal }[]>`
      SELECT month, SUM(inflow) AS inflow, SUM(outflow) AS outflow FROM (
        SELECT to_char(date_trunc('month', "dueDate"), 'YYYY-MM') AS month, "amount" - "receivedAmount" AS inflow, 0::numeric AS outflow
        FROM "AccountReceivable" WHERE "tenantId" = ${ctx.tenantId} AND "status" IN ('OPEN','PARTIAL') AND "dueDate" > ${ctx.today}::date AND "dueDate" <= ${end}::date
        UNION ALL
        SELECT to_char(date_trunc('month', "dueDate"), 'YYYY-MM'), 0::numeric, "amount" - "paidAmount"
        FROM "AccountPayable" WHERE "tenantId" = ${ctx.tenantId} AND "status" IN ('OPEN','PARTIAL') AND "dueDate" > ${ctx.today}::date AND "dueDate" <= ${end}::date
      ) t GROUP BY month`,
    forecast(ctx, "result", monthKey(end)),
  ]);
  const map = new Map(scheduled.map((s) => [s.month, s]));
  let balanceScheduled = position.balance ?? 0;
  let balanceProjected = position.balance ?? 0;
  const resultMap = new Map(resultFc.data.points.map((p) => [p.month, p.value]));
  const rows = monthsBetween(currentStart, end).map((m) => {
    const inflow = toNum(map.get(m)?.inflow);
    const outflow = toNum(map.get(m)?.outflow);
    balanceScheduled = round(balanceScheduled + inflow - outflow);
    const projectedResult = resultFc.sufficient ? resultMap.get(m) ?? 0 : null;
    if (projectedResult !== null) balanceProjected = round(balanceProjected + projectedResult);
    return {
      month: m,
      scheduledInflows: inflow,
      scheduledOutflows: outflow,
      balanceScheduled,
      projectedResult,
      balanceProjected: projectedResult === null ? null : balanceProjected,
    };
  });
  return { openingBalance: position.balance, rows, resultSufficient: resultFc.sufficient };
}
