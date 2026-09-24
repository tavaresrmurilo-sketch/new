import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addDays, addMonths, diffDays, endOfMonth, isoDate, makePeriod, monthsBetween, previousPeriod, startOfMonth, type Period } from "@/lib/periods";
import { pctChange, round } from "@/lib/utils";
import { toNum } from "@/server/tenant";
import { buildMeta, sourcesUsed } from "./base";
import type { Analysis, AnalyticsCtx } from "./types";

export interface SalesSummary {
  grossRevenue: number;
  netRevenue: number;
  discounts: number;
  taxes: number;
  cost: number;
  grossMargin: number;
  grossMarginPct: number | null;
  salesCount: number;
  averageTicket: number | null;
  activeCustomers: number;
  newCustomers: number;
  recurringCustomers: number;
}

async function summaryRaw(ctx: AnalyticsCtx, period: Period): Promise<SalesSummary> {
  const where = { tenantId: ctx.tenantId, status: "COMPLETED" as const, date: { gte: period.start, lte: period.end } };
  const [agg, customers] = await Promise.all([
    prisma.sale.aggregate({
      where,
      _sum: { grossAmount: true, netAmount: true, discountAmount: true, taxAmount: true, costAmount: true },
      _count: true,
    }),
    prisma.$queryRaw<{ active: bigint; new_customers: bigint }[]>`
      WITH buyers AS (
        SELECT DISTINCT "customerId" FROM "Sale"
        WHERE "tenantId" = ${ctx.tenantId} AND "status" = 'COMPLETED' AND "customerId" IS NOT NULL
          AND "date" BETWEEN ${period.start}::date AND ${period.end}::date
      ), firsts AS (
        SELECT s."customerId", MIN(s."date") AS first_date FROM "Sale" s
        JOIN buyers b ON b."customerId" = s."customerId"
        WHERE s."tenantId" = ${ctx.tenantId} AND s."status" = 'COMPLETED'
        GROUP BY s."customerId"
      )
      SELECT (SELECT COUNT(*) FROM buyers) AS active,
             (SELECT COUNT(*) FROM firsts WHERE first_date >= ${period.start}::date) AS new_customers`,
  ]);
  const net = toNum(agg._sum.netAmount);
  const cost = toNum(agg._sum.costAmount);
  const active = Number(customers[0]?.active ?? 0);
  const newCustomers = Number(customers[0]?.new_customers ?? 0);
  const margin = round(net - cost);
  return {
    grossRevenue: toNum(agg._sum.grossAmount),
    netRevenue: net,
    discounts: toNum(agg._sum.discountAmount),
    taxes: toNum(agg._sum.taxAmount),
    cost,
    grossMargin: margin,
    grossMarginPct: net ? round((margin / net) * 100, 2) : null,
    salesCount: agg._count,
    averageTicket: agg._count ? round(toNum(agg._sum.grossAmount) / agg._count) : null,
    activeCustomers: active,
    newCustomers,
    recurringCustomers: active - newCustomers,
  };
}

export async function salesSummary(
  ctx: AnalyticsCtx,
  period: Period,
  comparison?: Period,
): Promise<Analysis<{ current: SalesSummary; previous: SalesSummary | null; variation: Record<string, number | null> }>> {
  const cmp = comparison ?? previousPeriod(period);
  const [current, previous, sources] = await Promise.all([
    summaryRaw(ctx, period),
    summaryRaw(ctx, cmp),
    sourcesUsed(ctx, ["sales"], period),
  ]);
  const hasPrev = previous.salesCount > 0;
  const variation: Record<string, number | null> = {
    grossRevenue: hasPrev ? pctChange(current.grossRevenue, previous.grossRevenue) : null,
    netRevenue: hasPrev ? pctChange(current.netRevenue, previous.netRevenue) : null,
    salesCount: hasPrev ? pctChange(current.salesCount, previous.salesCount) : null,
    averageTicket: hasPrev && previous.averageTicket && current.averageTicket ? pctChange(current.averageTicket, previous.averageTicket) : null,
    grossMarginPp:
      hasPrev && current.grossMarginPct !== null && previous.grossMarginPct !== null
        ? round(current.grossMarginPct - previous.grossMarginPct, 2)
        : null,
    activeCustomers: hasPrev ? pctChange(current.activeCustomers, previous.activeCustomers) : null,
  };
  return {
    data: { current, previous: hasPrev ? previous : null, variation },
    meta: buildMeta({
      period,
      comparison: cmp,
      sources,
      filters: { status: "vendas concluídas" },
      calculation: [
        { label: "Faturamento (bruto)", formula: "Σ valor bruto das vendas concluídas", value: current.grossRevenue },
        { label: "Receita líquida de vendas", formula: "Σ (bruto − descontos − impostos)", value: current.netRevenue },
        { label: "Número de vendas", formula: "contagem de vendas concluídas", value: current.salesCount },
        { label: "Ticket médio", formula: "Faturamento ÷ Número de vendas", value: current.averageTicket },
        { label: "Margem bruta de vendas", formula: "Receita líquida − custo das vendas", value: current.grossMargin },
        { label: "Clientes ativos", formula: "clientes distintos com compra no período", value: current.activeCustomers },
        { label: "Novos clientes", formula: "clientes cuja primeira compra ocorreu no período", value: current.newCustomers },
      ],
    }),
    sufficient: current.salesCount > 0,
  };
}

export interface MonthlyPoint {
  month: string;
  grossRevenue: number;
  netRevenue: number;
  cost: number;
  salesCount: number;
}

export async function salesMonthlySeries(ctx: AnalyticsCtx, start: Date, end: Date): Promise<MonthlyPoint[]> {
  const rows = await prisma.$queryRaw<{ month: string; gross: Prisma.Decimal; net: Prisma.Decimal; cost: Prisma.Decimal; cnt: number }[]>`
    SELECT to_char(date_trunc('month', "date"), 'YYYY-MM') AS month,
           SUM("grossAmount") AS gross, SUM("netAmount") AS net, SUM("costAmount") AS cost, COUNT(*)::int AS cnt
    FROM "Sale"
    WHERE "tenantId" = ${ctx.tenantId} AND "status" = 'COMPLETED' AND "date" BETWEEN ${start}::date AND ${end}::date
    GROUP BY 1 ORDER BY 1`;
  const map = new Map(rows.map((r) => [r.month, r]));
  return monthsBetween(start, end).map((m) => {
    const r = map.get(m);
    return { month: m, grossRevenue: toNum(r?.gross), netRevenue: toNum(r?.net), cost: toNum(r?.cost), salesCount: r?.cnt ?? 0 };
  });
}

export async function salesDailySeries(ctx: AnalyticsCtx, period: Period) {
  const rows = await prisma.$queryRaw<{ day: Date; gross: Prisma.Decimal; cnt: number }[]>`
    SELECT "date" AS day, SUM("grossAmount") AS gross, COUNT(*)::int AS cnt FROM "Sale"
    WHERE "tenantId" = ${ctx.tenantId} AND "status" = 'COMPLETED' AND "date" BETWEEN ${period.start}::date AND ${period.end}::date
    GROUP BY 1 ORDER BY 1`;
  return rows.map((r) => ({ date: isoDate(r.day), grossRevenue: toNum(r.gross), salesCount: r.cnt }));
}

// ─────────────── Rankings ───────────────

export type Dimension = "customer" | "seller" | "region" | "category" | "channel";

export interface RankingRow {
  id: string | null;
  name: string;
  revenue: number;
  netRevenue: number;
  cost: number;
  margin: number;
  marginPct: number | null;
  salesCount: number;
  share: number;
  previousRevenue: number | null;
  growthPct: number | null;
}

async function rankingRaw(ctx: AnalyticsCtx, dim: Dimension, period: Period) {
  const base = Prisma.sql`WHERE s."tenantId" = ${ctx.tenantId} AND s."status" = 'COMPLETED' AND s."date" BETWEEN ${period.start}::date AND ${period.end}::date`;
  let query: Prisma.Sql;
  switch (dim) {
    case "customer":
      query = Prisma.sql`SELECT c."id" AS id, COALESCE(c."name", 'Sem cliente identificado') AS name,
        SUM(s."grossAmount") AS gross, SUM(s."netAmount") AS net, SUM(s."costAmount") AS cost, COUNT(*)::int AS cnt
        FROM "Sale" s LEFT JOIN "Customer" c ON c."id" = s."customerId" ${base} GROUP BY c."id", c."name"`;
      break;
    case "seller":
      query = Prisma.sql`SELECT v."id" AS id, COALESCE(v."name", 'Sem vendedor') AS name,
        SUM(s."grossAmount") AS gross, SUM(s."netAmount") AS net, SUM(s."costAmount") AS cost, COUNT(*)::int AS cnt
        FROM "Sale" s LEFT JOIN "Seller" v ON v."id" = s."sellerId" ${base} GROUP BY v."id", v."name"`;
      break;
    case "region":
      query = Prisma.sql`SELECT COALESCE(s."region", 'Não informada') AS id, COALESCE(s."region", 'Não informada') AS name,
        SUM(s."grossAmount") AS gross, SUM(s."netAmount") AS net, SUM(s."costAmount") AS cost, COUNT(*)::int AS cnt
        FROM "Sale" s ${base} GROUP BY 1, 2`;
      break;
    case "category":
      query = Prisma.sql`SELECT COALESCE(s."category", 'Não informada') AS id, COALESCE(s."category", 'Não informada') AS name,
        SUM(s."grossAmount") AS gross, SUM(s."netAmount") AS net, SUM(s."costAmount") AS cost, COUNT(*)::int AS cnt
        FROM "Sale" s ${base} GROUP BY 1, 2`;
      break;
    case "channel":
      query = Prisma.sql`SELECT COALESCE(s."channel", 'Não informado') AS id, COALESCE(s."channel", 'Não informado') AS name,
        SUM(s."grossAmount") AS gross, SUM(s."netAmount") AS net, SUM(s."costAmount") AS cost, COUNT(*)::int AS cnt
        FROM "Sale" s ${base} GROUP BY 1, 2`;
      break;
  }
  return prisma.$queryRaw<{ id: string | null; name: string; gross: Prisma.Decimal; net: Prisma.Decimal; cost: Prisma.Decimal; cnt: number }[]>(query);
}

export async function salesRanking(
  ctx: AnalyticsCtx,
  dim: Dimension,
  period: Period,
  opts: { limit?: number; order?: "desc" | "asc" } = {},
): Promise<Analysis<{ rows: RankingRow[]; total: number; concentrationTop5: number | null; totalRows: number }>> {
  const cmp = previousPeriod(period);
  const [cur, prev, sources] = await Promise.all([rankingRaw(ctx, dim, period), rankingRaw(ctx, dim, cmp), sourcesUsed(ctx, ["sales"], period)]);
  const total = round(cur.reduce((a, r) => a + toNum(r.gross), 0));
  const prevMap = new Map(prev.map((r) => [r.id ?? r.name, toNum(r.gross)]));
  const hasPrev = prev.length > 0;
  let rows: RankingRow[] = cur.map((r) => {
    const revenue = toNum(r.gross);
    const net = toNum(r.net);
    const cost = toNum(r.cost);
    const previousRevenue = hasPrev ? prevMap.get(r.id ?? r.name) ?? 0 : null;
    return {
      id: r.id,
      name: r.name,
      revenue,
      netRevenue: net,
      cost,
      margin: round(net - cost),
      marginPct: net ? round(((net - cost) / net) * 100, 2) : null,
      salesCount: r.cnt,
      share: total ? round((revenue / total) * 100, 2) : 0,
      previousRevenue,
      growthPct: previousRevenue ? pctChange(revenue, previousRevenue) : null,
    };
  });
  rows.sort((a, b) => (opts.order === "asc" ? a.revenue - b.revenue : b.revenue - a.revenue));
  const sortedDesc = [...rows].sort((a, b) => b.revenue - a.revenue);
  const top5 = sortedDesc.slice(0, 5).reduce((a, r) => a + r.revenue, 0);
  const totalRows = rows.length;
  if (opts.limit) rows = rows.slice(0, opts.limit);
  const labels: Record<Dimension, string> = { customer: "cliente", seller: "vendedor", region: "região", category: "categoria", channel: "canal" };
  return {
    data: { rows, total, concentrationTop5: total ? round((top5 / total) * 100, 2) : null, totalRows },
    meta: buildMeta({
      period,
      comparison: cmp,
      sources,
      filters: { agrupamento: labels[dim], status: "vendas concluídas" },
      calculation: [
        { label: "Receita por " + labels[dim], formula: "Σ valor bruto das vendas concluídas agrupado por " + labels[dim] },
        { label: "Participação", formula: "receita do item ÷ receita total × 100", value: total },
        { label: "Crescimento", formula: "(receita no período − receita no período anterior) ÷ receita anterior × 100" },
        { label: "Concentração top 5", formula: "Σ receita dos 5 maiores ÷ receita total × 100" },
      ],
    }),
    sufficient: rows.length > 0,
  };
}

// ─────────────── Produtos ───────────────

export interface ProductRow {
  id: string | null;
  name: string;
  category: string | null;
  type: string | null;
  quantity: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number | null;
  averagePrice: number | null;
  share: number;
  previousRevenue: number | null;
  growthPct: number | null;
}

async function productsRaw(ctx: AnalyticsCtx, period: Period) {
  return prisma.$queryRaw<{ id: string | null; name: string; category: string | null; type: string | null; qty: Prisma.Decimal; revenue: Prisma.Decimal; cost: Prisma.Decimal }[]>`
    SELECT p."id" AS id, COALESCE(p."name", 'Item sem produto') AS name, p."category" AS category, p."type"::text AS type,
           SUM(i."quantity") AS qty, SUM(i."total") AS revenue, SUM(i."totalCost") AS cost
    FROM "SaleItem" i
    JOIN "Sale" s ON s."id" = i."saleId"
    LEFT JOIN "Product" p ON p."id" = i."productId"
    WHERE i."tenantId" = ${ctx.tenantId} AND s."tenantId" = ${ctx.tenantId} AND s."status" = 'COMPLETED'
      AND s."date" BETWEEN ${period.start}::date AND ${period.end}::date
    GROUP BY p."id", p."name", p."category", p."type"`;
}

export async function productAnalysis(
  ctx: AnalyticsCtx,
  period: Period,
  opts: { type?: "PRODUCT" | "SERVICE" } = {},
): Promise<Analysis<{ rows: ProductRow[]; total: number; lowMargin: ProductRow[]; topMargin: ProductRow[]; growing: ProductRow[]; declining: ProductRow[] }>> {
  const cmp = previousPeriod(period);
  const [cur, prev, sources] = await Promise.all([productsRaw(ctx, period), productsRaw(ctx, cmp), sourcesUsed(ctx, ["sales"], period)]);
  const filtered = opts.type ? cur.filter((r) => r.type === opts.type) : cur;
  const total = round(filtered.reduce((a, r) => a + toNum(r.revenue), 0));
  const prevMap = new Map(prev.map((r) => [r.id ?? r.name, toNum(r.revenue)]));
  const hasPrev = prev.length > 0;
  const rows: ProductRow[] = filtered
    .map((r) => {
      const revenue = toNum(r.revenue);
      const cost = toNum(r.cost);
      const qty = toNum(r.qty);
      const previousRevenue = hasPrev ? prevMap.get(r.id ?? r.name) ?? 0 : null;
      return {
        id: r.id,
        name: r.name,
        category: r.category,
        type: r.type,
        quantity: qty,
        revenue,
        cost,
        margin: round(revenue - cost),
        marginPct: revenue ? round(((revenue - cost) / revenue) * 100, 2) : null,
        averagePrice: qty ? round(revenue / qty) : null,
        share: total ? round((revenue / total) * 100, 2) : 0,
        previousRevenue,
        growthPct: previousRevenue ? pctChange(revenue, previousRevenue) : null,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
  const material = rows.filter((r) => r.share >= 1);
  return {
    data: {
      rows,
      total,
      lowMargin: material.filter((r) => r.marginPct !== null && r.marginPct < 20).sort((a, b) => (a.marginPct ?? 0) - (b.marginPct ?? 0)).slice(0, 10),
      topMargin: [...rows].sort((a, b) => b.margin - a.margin).slice(0, 10),
      growing: material.filter((r) => (r.growthPct ?? 0) > 0).sort((a, b) => (b.growthPct ?? 0) - (a.growthPct ?? 0)).slice(0, 10),
      declining: material.filter((r) => (r.growthPct ?? 0) < 0).sort((a, b) => (a.growthPct ?? 0) - (b.growthPct ?? 0)).slice(0, 10),
    },
    meta: buildMeta({
      period,
      comparison: cmp,
      sources,
      filters: { status: "vendas concluídas", ...(opts.type ? { tipo: opts.type === "SERVICE" ? "serviços" : "produtos" } : {}) },
      calculation: [
        { label: "Receita por produto", formula: "Σ total dos itens de venda", value: total },
        { label: "Margem", formula: "receita dos itens − custo dos itens" },
        { label: "Margem %", formula: "margem ÷ receita × 100" },
        { label: "Preço médio", formula: "receita ÷ quantidade" },
        { label: "Margem baixa", formula: "margem < 20% e participação ≥ 1% da receita" },
      ],
    }),
    sufficient: rows.length > 0,
  };
}

// ─────────────── Clientes ───────────────

export interface CustomerChange {
  id: string;
  name: string;
  current: number;
  previous: number;
  change: number;
  changePct: number | null;
}

export interface InactiveCustomer {
  id: string;
  name: string;
  lastPurchase: string;
  daysSince: number;
  revenue12m: number;
}

export async function customerAnalysis(
  ctx: AnalyticsCtx,
  period: Period,
  opts: { inactiveDays?: number } = {},
): Promise<
  Analysis<{
    ranking: RankingRow[];
    total: number;
    top: RankingRow | null;
    bottom: RankingRow | null;
    increased: CustomerChange[];
    decreased: CustomerChange[];
    inactive: InactiveCustomer[];
    concentration: { top5: number | null; top10: number | null; top5Names: string[] };
    byMargin: RankingRow[];
    newCustomers: number;
    activeCustomers: number;
  }>
> {
  const inactiveDays = opts.inactiveDays ?? 60;
  const [ranking, summary] = await Promise.all([
    salesRanking(ctx, "customer", period),
    summaryRaw(ctx, period),
  ]);
  const rows = ranking.data.rows.filter((r) => r.id);
  const total = ranking.data.total;

  const changes: CustomerChange[] = ranking.data.rows
    .filter((r) => r.id && r.previousRevenue !== null)
    .map((r) => ({
      id: r.id as string,
      name: r.name,
      current: r.revenue,
      previous: r.previousRevenue ?? 0,
      change: round(r.revenue - (r.previousRevenue ?? 0)),
      changePct: r.previousRevenue ? pctChange(r.revenue, r.previousRevenue) : null,
    }));

  // clientes que compraram no período anterior mas não neste também reduziram
  const cmp = previousPeriod(period);
  const prevOnly = await prisma.$queryRaw<{ id: string; name: string; gross: Prisma.Decimal }[]>`
    SELECT c."id", c."name", SUM(s."grossAmount") AS gross FROM "Sale" s JOIN "Customer" c ON c."id" = s."customerId"
    WHERE s."tenantId" = ${ctx.tenantId} AND s."status" = 'COMPLETED' AND s."date" BETWEEN ${cmp.start}::date AND ${cmp.end}::date
      AND NOT EXISTS (SELECT 1 FROM "Sale" s2 WHERE s2."tenantId" = ${ctx.tenantId} AND s2."customerId" = c."id" AND s2."status" = 'COMPLETED'
                      AND s2."date" BETWEEN ${period.start}::date AND ${period.end}::date)
    GROUP BY c."id", c."name"`;
  prevOnly.forEach((r) =>
    changes.push({ id: r.id, name: r.name, current: 0, previous: toNum(r.gross), change: -toNum(r.gross), changePct: -100 }),
  );

  const materiality = Math.max(total * 0.005, 1);
  const increased = changes.filter((c) => c.change > 0 && c.previous > 0 && c.change >= materiality).sort((a, b) => b.change - a.change).slice(0, 10);
  const decreased = changes.filter((c) => c.change < 0 && Math.abs(c.change) >= materiality).sort((a, b) => a.change - b.change).slice(0, 10);

  const cutoff = addDays(ctx.today, -inactiveDays);
  const yearAgo = addDays(ctx.today, -365);
  const inactiveRaw = await prisma.$queryRaw<{ id: string; name: string; last: Date; rev: Prisma.Decimal }[]>`
    SELECT c."id", c."name", MAX(s."date") AS last, SUM(CASE WHEN s."date" >= ${yearAgo}::date THEN s."grossAmount" ELSE 0 END) AS rev
    FROM "Customer" c JOIN "Sale" s ON s."customerId" = c."id" AND s."status" = 'COMPLETED' AND s."tenantId" = ${ctx.tenantId}
    WHERE c."tenantId" = ${ctx.tenantId}
    GROUP BY c."id", c."name"
    HAVING MAX(s."date") < ${cutoff}::date AND MAX(s."date") >= ${yearAgo}::date
    ORDER BY rev DESC LIMIT 20`;
  const inactive = inactiveRaw.map((r) => ({
    id: r.id,
    name: r.name,
    lastPurchase: isoDate(r.last),
    daysSince: diffDays(ctx.today, r.last),
    revenue12m: toNum(r.rev),
  }));

  const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
  const top10 = sorted.slice(0, 10).reduce((a, r) => a + r.revenue, 0);
  return {
    data: {
      ranking: sorted,
      total,
      top: sorted[0] ?? null,
      bottom: sorted[sorted.length - 1] ?? null,
      increased,
      decreased,
      inactive,
      concentration: {
        top5: ranking.data.concentrationTop5,
        top10: total ? round((top10 / total) * 100, 2) : null,
        top5Names: sorted.slice(0, 5).map((r) => r.name),
      },
      byMargin: [...rows].sort((a, b) => b.margin - a.margin).slice(0, 10),
      newCustomers: summary.newCustomers,
      activeCustomers: summary.activeCustomers,
    },
    meta: {
      ...ranking.meta,
      calculation: [
        ...ranking.meta.calculation,
        { label: "Aumento/redução", formula: "receita no período − receita no período anterior (materialidade ≥ 0,5% da receita)" },
        { label: "Sem comprar recentemente", formula: `última compra há mais de ${inactiveDays} dias, com compras nos últimos 12 meses` },
      ],
    },
    sufficient: rows.length > 0,
  };
}

/** Totais mensais de clientes ativos (para gráficos). */
export async function activeCustomersByMonth(ctx: AnalyticsCtx, months: number) {
  const end = endOfMonth(ctx.today);
  const start = startOfMonth(addMonths(ctx.today, -(months - 1)));
  const rows = await prisma.$queryRaw<{ month: string; cnt: number }[]>`
    SELECT to_char(date_trunc('month', "date"), 'YYYY-MM') AS month, COUNT(DISTINCT "customerId")::int AS cnt
    FROM "Sale" WHERE "tenantId" = ${ctx.tenantId} AND "status" = 'COMPLETED' AND "date" BETWEEN ${start}::date AND ${end}::date
    GROUP BY 1 ORDER BY 1`;
  const map = new Map(rows.map((r) => [r.month, r.cnt]));
  return monthsBetween(start, end).map((m) => ({ month: m, customers: map.get(m) ?? 0 }));
}

export function periodForDays(today: Date, days: number): Period {
  return makePeriod(addDays(today, -(days - 1)), today, `últimos ${days} dias`);
}

