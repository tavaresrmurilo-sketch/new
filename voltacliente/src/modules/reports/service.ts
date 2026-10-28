import "server-only";
import {
  addDays,
  addMonths,
  diffInDays,
  formatDateShort,
  formatMonthLabel,
  fromDbDate,
  periodRange,
  startOfDayInZone,
  startOfMonth,
  startOfWeek,
  todayIn,
  toDbDate,
  type ISODate,
  type PeriodKey,
} from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { db } from "@/server/db";
import type { TenantContext } from "@/server/session";

type Granularity = "day" | "week" | "month";

export type SeriesPoint = { key: ISODate; label: string; returns: number; contacts: number; revenueCents: number };

function granularityFor(from: ISODate, to: ISODate): Granularity {
  const days = diffInDays(to, from) + 1;
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  return "month";
}

function bucketKey(date: ISODate, granularity: Granularity): ISODate {
  if (granularity === "day") return date;
  if (granularity === "week") return startOfWeek(date);
  return startOfMonth(date);
}

function emptySeries(from: ISODate, to: ISODate, granularity: Granularity): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  let cursor = bucketKey(from, granularity);
  while (cursor <= to) {
    const label = granularity === "month" ? formatMonthLabel(cursor) : formatDateShort(cursor < from ? from : cursor, false);
    points.push({ key: cursor, label, returns: 0, contacts: 0, revenueCents: 0 });
    cursor = granularity === "day" ? addDays(cursor, 1) : granularity === "week" ? addDays(cursor, 7) : addMonths(cursor, 1);
  }
  return points;
}

/** Intervalo de instantes [início, fim) para datas no fuso da empresa. */
function instantRange(from: ISODate, to: ISODate, timezone: string) {
  return { gte: startOfDayInZone(from, timezone), lt: startOfDayInZone(addDays(to, 1), timezone) };
}

async function dailyReturns(ctx: TenantContext, from: ISODate, to: ISODate) {
  return db.$queryRaw<{ day: string; n: number; revenue: bigint }[]>`
    SELECT to_char("date", 'YYYY-MM-DD') AS day, count(*)::int AS n, coalesce(sum("amountCents"), 0)::bigint AS revenue
    FROM "appointments"
    WHERE "companyId" = ${ctx.companyId}
      AND "returnOfReminderId" IS NOT NULL
      AND "date" >= ${toDbDate(from)}::date AND "date" <= ${toDbDate(to)}::date
    GROUP BY 1`;
}

async function dailyContacts(ctx: TenantContext, from: ISODate, to: ISODate) {
  const range = instantRange(from, to, ctx.timezone);
  return db.$queryRaw<{ day: string; n: number }[]>`
    SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${ctx.timezone}, 'YYYY-MM-DD') AS day, count(*)::int AS n
    FROM "contact_logs"
    WHERE "companyId" = ${ctx.companyId} AND "createdAt" >= ${range.gte} AND "createdAt" < ${range.lt}
    GROUP BY 1`;
}

async function buildSeries(ctx: TenantContext, from: ISODate, to: ISODate): Promise<SeriesPoint[]> {
  const granularity = granularityFor(from, to);
  const [returns, contacts] = await Promise.all([dailyReturns(ctx, from, to), dailyContacts(ctx, from, to)]);
  const series = emptySeries(from, to, granularity);
  const index = new Map(series.map((p) => [p.key, p]));
  for (const row of returns) {
    const point = index.get(bucketKey(row.day, granularity));
    if (point) {
      point.returns += row.n;
      point.revenueCents += Number(row.revenue);
    }
  }
  for (const row of contacts) {
    const point = index.get(bucketKey(row.day, granularity));
    if (point) point.contacts += row.n;
  }
  return series;
}

async function returnTotals(ctx: TenantContext, from: ISODate, to: ISODate) {
  const where = {
    companyId: ctx.companyId,
    returnOfReminderId: { not: null },
    date: { gte: toDbDate(from), lte: toDbDate(to) },
  };
  const [aggregate, customers] = await Promise.all([
    db.appointment.aggregate({ where, _count: { _all: true }, _sum: { amountCents: true } }),
    db.appointment.findMany({ where, distinct: ["customerId"], select: { customerId: true } }),
  ]);
  return {
    returnAppointments: aggregate._count._all,
    returnRevenueCents: aggregate._sum.amountCents ?? 0,
    returnedCustomers: customers.length,
  };
}

export async function getDashboard(ctx: TenantContext, period: PeriodKey) {
  const today = todayIn(ctx.timezone);
  const { from, to } = periodRange(period, today);
  const todayDate = toDbDate(today);

  const [totalCustomers, newCustomers, dueToday, overdue, next7, contacts, totals, series, upcoming, recent, services] = await Promise.all([
    db.customer.count({ where: { companyId: ctx.companyId } }),
    db.customer.count({ where: { companyId: ctx.companyId, createdAt: instantRange(from, to, ctx.timezone) } }),
    db.returnReminder.count({ where: { companyId: ctx.companyId, status: "PENDING", remindAt: todayDate } }),
    db.returnReminder.count({ where: { companyId: ctx.companyId, status: "PENDING", remindAt: { lt: todayDate } } }),
    db.returnReminder.count({
      where: { companyId: ctx.companyId, status: "PENDING", remindAt: { gt: todayDate, lte: toDbDate(addDays(today, 7)) } },
    }),
    db.contactLog.count({ where: { companyId: ctx.companyId, createdAt: instantRange(from, to, ctx.timezone) } }),
    returnTotals(ctx, from, to),
    buildSeries(ctx, from, to),
    db.returnReminder.findMany({
      where: { companyId: ctx.companyId, status: "PENDING", remindAt: { lte: toDbDate(addDays(today, 7)) } },
      orderBy: [{ remindAt: "asc" }, { id: "asc" }],
      take: 6,
      select: {
        id: true,
        remindAt: true,
        customer: { select: { id: true, name: true, phoneNormalized: true } },
        service: { select: { name: true } },
      },
    }),
    db.appointment.findMany({
      where: { companyId: ctx.companyId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 6,
      select: {
        id: true,
        date: true,
        amountCents: true,
        returnOfReminderId: true,
        customer: { select: { id: true, name: true } },
        service: { select: { name: true } },
      },
    }),
    db.service.count({ where: { companyId: ctx.companyId } }),
  ]);

  return {
    today,
    from,
    to,
    period,
    kpis: { totalCustomers, newCustomers, dueToday, overdue, next7, contacts, ...totals },
    series,
    upcoming: upcoming.map((r) => ({
      id: r.id,
      remindAt: fromDbDate(r.remindAt),
      customer: { id: r.customer.id, name: r.customer.name, phone: formatPhone(r.customer.phoneNormalized) },
      serviceName: r.service.name,
    })),
    recent: recent.map((a) => ({
      id: a.id,
      date: fromDbDate(a.date),
      amountCents: a.amountCents,
      isReturn: a.returnOfReminderId !== null,
      customer: a.customer,
      serviceName: a.service.name,
    })),
    hasServices: services > 0,
  };
}

export async function getReport(ctx: TenantContext, range: { from: ISODate; to: ISODate }, advanced: boolean) {
  const { from, to } = range;
  const instants = instantRange(from, to, ctx.timezone);
  const [totals, allAppointments, contacts, contactedReminders, convertedAfterContact, overdue] = await Promise.all([
    returnTotals(ctx, from, to),
    db.appointment.aggregate({
      where: { companyId: ctx.companyId, date: { gte: toDbDate(from), lte: toDbDate(to) } },
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
    db.contactLog.count({ where: { companyId: ctx.companyId, createdAt: instants } }),
    db.returnReminder.count({ where: { companyId: ctx.companyId, contactedAt: instants } }),
    db.returnReminder.count({ where: { companyId: ctx.companyId, contactedAt: instants, status: "CONVERTED" } }),
    db.returnReminder.count({ where: { companyId: ctx.companyId, status: "PENDING", remindAt: { lt: toDbDate(todayIn(ctx.timezone)) } } }),
  ]);

  let topServices: { serviceId: string; name: string; returns: number; revenueCents: number }[] = [];
  let series: SeriesPoint[] = [];
  if (advanced) {
    const grouped = await db.appointment.groupBy({
      by: ["serviceId"],
      where: { companyId: ctx.companyId, returnOfReminderId: { not: null }, date: { gte: toDbDate(from), lte: toDbDate(to) } },
      _count: { _all: true },
      _sum: { amountCents: true },
    });
    const names = new Map(
      (
        await db.service.findMany({
          where: { companyId: ctx.companyId, id: { in: grouped.map((g) => g.serviceId) } },
          select: { id: true, name: true },
        })
      ).map((s) => [s.id, s.name]),
    );
    topServices = grouped
      .map((g) => ({
        serviceId: g.serviceId,
        name: names.get(g.serviceId) ?? "Serviço",
        returns: g._count._all,
        revenueCents: g._sum.amountCents ?? 0,
      }))
      .sort((a, b) => b.returns - a.returns || b.revenueCents - a.revenueCents)
      .slice(0, 8);
    series = await buildSeries(ctx, from, to);
  }

  return {
    from,
    to,
    ...totals,
    totalAppointments: allAppointments._count._all,
    totalRevenueCents: allAppointments._sum.amountCents ?? 0,
    contacts,
    contactedReminders,
    convertedAfterContact,
    conversionRate: contactedReminders > 0 ? convertedAfterContact / contactedReminders : null,
    overdue,
    topServices,
    series,
  };
}
