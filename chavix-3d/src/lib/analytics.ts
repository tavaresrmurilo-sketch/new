import "server-only";
import { db } from "@/lib/db";
import type { OrderStatus } from "@/generated/prisma/enums";

/**
 * Métricas do painel, sempre calculadas a partir dos pedidos reais.
 * Receita confirmada = pedidos com pagamento confirmado (paidAt) e não cancelados.
 * Datas agrupadas no fuso de São Paulo.
 */

export const TZ = "America/Sao_Paulo";

export type Granularity = "day" | "week" | "month";

export const PERIODS = {
  "7d": { label: "7 dias", days: 7, granularity: "day" as Granularity },
  "30d": { label: "30 dias", days: 30, granularity: "day" as Granularity },
  "90d": { label: "90 dias", days: 90, granularity: "week" as Granularity },
  "12m": { label: "12 meses", days: 365, granularity: "month" as Granularity },
};
export type PeriodKey = keyof typeof PERIODS;

export function parsePeriod(value: string | undefined): PeriodKey {
  return value && value in PERIODS ? (value as PeriodKey) : "30d";
}

export function periodRange(key: PeriodKey): { from: Date; to: Date; granularity: Granularity } {
  const to = new Date();
  const from = new Date(to.getTime() - PERIODS[key].days * 86_400_000);
  return { from, to, granularity: PERIODS[key].granularity };
}

export interface SeriesPoint {
  bucket: string; // AAAA-MM-DD do início do período
  revenueCents: number;
  orders: number;
}

function bucketKey(date: Date, granularity: Granularity): string {
  // Data local de São Paulo em partes
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const [y, m, d] = parts.split("-").map(Number);
  if (granularity === "month") return `${y}-${String(m).padStart(2, "0")}-01`;
  if (granularity === "week") {
    const utc = new Date(Date.UTC(y, m - 1, d));
    const dow = (utc.getUTCDay() + 6) % 7; // segunda = 0 (igual ao date_trunc do Postgres)
    utc.setUTCDate(utc.getUTCDate() - dow);
    return utc.toISOString().slice(0, 10);
  }
  return parts;
}

function allBuckets(from: Date, to: Date, granularity: Granularity): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const step = 86_400_000; // anda de dia em dia e agrupa pela chave do período
  for (let t = from.getTime(); t <= to.getTime() + step; t += step) {
    const key = bucketKey(new Date(Math.min(t, to.getTime())), granularity);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

export async function revenueSeries(from: Date, to: Date, granularity: Granularity): Promise<SeriesPoint[]> {
  const rows = await db.$queryRaw<Array<{ bucket: Date; revenue: bigint | null; orders: bigint }>>`
    SELECT date_trunc(${granularity}, ("paidAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}) AS bucket,
           SUM("totalCents")::bigint AS revenue,
           COUNT(*)::bigint AS orders
    FROM "Order"
    WHERE "paidAt" IS NOT NULL AND "status" <> 'CANCELLED' AND "paidAt" >= ${from} AND "paidAt" <= ${to}
    GROUP BY 1 ORDER BY 1`;
  const byKey = new Map(rows.map((r) => [r.bucket.toISOString().slice(0, 10), r]));
  return allBuckets(from, to, granularity).map((key) => {
    const row = byKey.get(key);
    return { bucket: key, revenueCents: Number(row?.revenue ?? 0), orders: Number(row?.orders ?? 0) };
  });
}

export async function kpis(from: Date, to: Date) {
  const paidWhere = { paidAt: { gte: from, lte: to }, status: { not: "CANCELLED" as OrderStatus } };
  const [paid, created, cartsStarted, cartsConverted, pendingPayment, paymentReview, paidNow, inProduction, readyNow] = await Promise.all([
    db.order.aggregate({ where: paidWhere, _sum: { totalCents: true }, _count: true }),
    db.order.count({ where: { createdAt: { gte: from, lte: to } } }),
    db.cart.count({ where: { checkoutStartedAt: { gte: from, lte: to } } }),
    db.cart.count({ where: { checkoutStartedAt: { gte: from, lte: to }, convertedAt: { not: null } } }),
    db.order.count({ where: { status: "PENDING_PAYMENT" } }),
    db.order.count({ where: { status: "PAYMENT_REVIEW" } }),
    db.order.count({ where: { status: "PAID" } }),
    db.order.count({ where: { status: "IN_PRODUCTION" } }),
    db.order.count({ where: { status: "READY" } }),
  ]);
  const revenueCents = paid._sum.totalCents ?? 0;
  const paidCount = paid._count;
  return {
    revenueCents,
    paidCount,
    averageTicketCents: paidCount ? Math.round(revenueCents / paidCount) : 0,
    ordersCreated: created,
    checkoutsStarted: cartsStarted,
    checkoutConversion: cartsStarted ? cartsConverted / cartsStarted : null,
    paymentConversion: created ? paidCount / created : null,
    pendingPayment,
    paymentReview,
    paidNow,
    inProduction,
    readyNow,
  };
}

export async function topProducts(from: Date, to: Date, take = 8) {
  const rows = await db.$queryRaw<Array<{ name: string; quantity: bigint; revenue: bigint }>>`
    SELECT i."productName" AS name, SUM(i."quantity")::bigint AS quantity, SUM(i."totalCents")::bigint AS revenue
    FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId"
    WHERE o."paidAt" IS NOT NULL AND o."status" <> 'CANCELLED' AND o."paidAt" >= ${from} AND o."paidAt" <= ${to}
    GROUP BY i."productName" ORDER BY quantity DESC, revenue DESC LIMIT ${take}`;
  return rows.map((r) => ({ name: r.name, quantity: Number(r.quantity), revenueCents: Number(r.revenue) }));
}

export async function topCategories(from: Date, to: Date, take = 8) {
  const rows = await db.$queryRaw<Array<{ name: string | null; quantity: bigint; revenue: bigint }>>`
    SELECT COALESCE(i."categoryName", 'Sem categoria') AS name, SUM(i."quantity")::bigint AS quantity, SUM(i."totalCents")::bigint AS revenue
    FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId"
    WHERE o."paidAt" IS NOT NULL AND o."status" <> 'CANCELLED' AND o."paidAt" >= ${from} AND o."paidAt" <= ${to}
    GROUP BY 1 ORDER BY revenue DESC LIMIT ${take}`;
  return rows.map((r) => ({ name: r.name ?? "Sem categoria", quantity: Number(r.quantity), revenueCents: Number(r.revenue) }));
}

export async function ordersByStatus(from: Date, to: Date) {
  const rows = await db.order.groupBy({ by: ["status"], where: { createdAt: { gte: from, lte: to } }, _count: true });
  return rows.map((r) => ({ status: r.status, count: r._count }));
}
