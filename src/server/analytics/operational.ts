import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addMonths, monthKey, startOfMonth, type Period } from "@/lib/periods";
import { pctChange } from "@/lib/utils";
import type { AnalyticsCtx } from "./types";

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/**
 * Indicadores operacionais calculados SOMENTE a partir de dados normalizados reais do tenant
 * (vendas, pedidos, clientes). Nada é estimado: sem dados, o bloco correspondente não aparece.
 */
export async function operationalOverview(ctx: AnalyticsCtx, mtd: Period, prevMtd: Period) {
  const t = ctx.tenantId;
  const from12 = startOfMonth(addMonths(mtd.start, -11));
  const [cur, prev, customers, ordersCur, ordersAny, monthly, byProduct, bySeller] = await Promise.all([
    prisma.$queryRaw<{ c: bigint; s: unknown; k: bigint }[]>`SELECT COUNT(*) c, SUM("grossAmount") s, COUNT(DISTINCT "customerId") k FROM "Sale" WHERE "tenantId" = ${t} AND status = 'COMPLETED' AND date BETWEEN ${mtd.start}::date AND ${mtd.end}::date`,
    prisma.$queryRaw<{ c: bigint; s: unknown }[]>`SELECT COUNT(*) c, SUM("grossAmount") s FROM "Sale" WHERE "tenantId" = ${t} AND status = 'COMPLETED' AND date BETWEEN ${prevMtd.start}::date AND ${prevMtd.end}::date`,
    prisma.customer.count({ where: { tenantId: t } }),
    prisma.$queryRaw<{ c: bigint; s: unknown }[]>`SELECT COUNT(*) c, SUM(amount) s FROM "Order" WHERE "tenantId" = ${t} AND date BETWEEN ${mtd.start}::date AND ${mtd.end}::date`,
    prisma.order.count({ where: { tenantId: t } }),
    prisma.$queryRaw<{ m: Date; s: unknown; c: bigint }[]>`SELECT date_trunc('month', date)::date m, SUM("grossAmount") s, COUNT(*) c FROM "Sale" WHERE "tenantId" = ${t} AND status = 'COMPLETED' AND date BETWEEN ${from12}::date AND ${mtd.end}::date GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ name: string; s: unknown }[]>(Prisma.sql`
      SELECT COALESCE(p.name, 'Sem produto') name, SUM(i.total) s FROM "SaleItem" i
      JOIN "Sale" v ON v.id = i."saleId" LEFT JOIN "Product" p ON p.id = i."productId"
      WHERE i."tenantId" = ${t} AND v.status = 'COMPLETED' AND v.date BETWEEN ${from12}::date AND ${mtd.end}::date
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10`),
    prisma.$queryRaw<{ name: string; s: unknown }[]>(Prisma.sql`
      SELECT s.name, SUM(v."grossAmount") s FROM "Sale" v JOIN "Seller" s ON s.id = v."sellerId"
      WHERE v."tenantId" = ${t} AND v.status = 'COMPLETED' AND v.date BETWEEN ${from12}::date AND ${mtd.end}::date
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10`),
  ]);
  const revenue = n(cur[0]?.s);
  const count = n(cur[0]?.c);
  const prevRevenue = n(prev[0]?.s);
  return {
    hasSales: monthly.length > 0,
    hasOrders: ordersAny > 0,
    cards: {
      revenue,
      salesCount: count,
      customers,
      activeCustomers: n(cur[0]?.k),
      averageTicket: count ? revenue / count : null,
      orders: n(ordersCur[0]?.c),
      ordersAmount: n(ordersCur[0]?.s),
      // crescimento só é exibido quando há base de comparação real
      growth: prevRevenue > 0 ? pctChange(revenue, prevRevenue) : null,
    },
    charts: {
      revenueOverTime: monthly.map((r) => ({ month: monthKey(r.m), receita: n(r.s), vendas: n(r.c) })),
      byProduct: byProduct.map((r) => ({ name: r.name, value: n(r.s) })),
      bySeller: bySeller.map((r) => ({ name: r.name, value: n(r.s) })),
    },
  };
}
