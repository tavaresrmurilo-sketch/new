import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isoDate, todayInTz, type Period } from "@/lib/periods";
import type { TenantContext } from "@/server/auth/session";
import type { AnalysisMeta, AnalyticsCtx, CalcStep, SourceInfo } from "./types";

export async function analyticsCtx(ctx: Pick<TenantContext, "tenantId" | "timezone" | "permissions">): Promise<AnalyticsCtx> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: ctx.tenantId },
    select: { minCashBalance: true, timezone: true },
  });
  return {
    tenantId: ctx.tenantId,
    timezone: tenant.timezone,
    today: todayInTz(tenant.timezone),
    permissions: ctx.permissions,
    minCashBalance: tenant.minCashBalance === null ? null : Number(tenant.minCashBalance),
  };
}

/** Tabelas permitidas para rastreamento de fontes (whitelist — nunca interpolar entrada do usuário). */
const SOURCE_TABLES = {
  sales: { table: Prisma.sql`"Sale"`, date: Prisma.sql`"date"` },
  expenses: { table: Prisma.sql`"Expense"`, date: Prisma.sql`"date"` },
  revenues: { table: Prisma.sql`"Revenue"`, date: Prisma.sql`"date"` },
  payables: { table: Prisma.sql`"AccountPayable"`, date: Prisma.sql`"dueDate"` },
  receivables: { table: Prisma.sql`"AccountReceivable"`, date: Prisma.sql`"dueDate"` },
  payments: { table: Prisma.sql`"Payment"`, date: Prisma.sql`"date"` },
} as const;

export type SourceTable = keyof typeof SOURCE_TABLES;

export async function sourcesUsed(ctx: AnalyticsCtx, tables: SourceTable[], period?: Period): Promise<SourceInfo[]> {
  const ids = new Set<string>();
  for (const t of tables) {
    const { table, date } = SOURCE_TABLES[t];
    const where = period
      ? Prisma.sql`WHERE "tenantId" = ${ctx.tenantId} AND ${date} BETWEEN ${period.start}::date AND ${period.end}::date`
      : Prisma.sql`WHERE "tenantId" = ${ctx.tenantId}`;
    const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT DISTINCT "dataSourceId" AS id FROM ${table} ${where}`;
    rows.forEach((r) => ids.add(r.id));
  }
  if (!ids.size) return [];
  const sources = await prisma.dataSource.findMany({
    where: { tenantId: ctx.tenantId, id: { in: [...ids] } },
    select: { id: true, name: true, kind: true, lastUpdatedAt: true },
  });
  return sources.map((s) => ({ id: s.id, name: s.name, kind: s.kind, lastUpdatedAt: s.lastUpdatedAt.toISOString() }));
}

export function periodMeta(p: Period) {
  return { start: isoDate(p.start), end: isoDate(p.end), label: p.label };
}

export function buildMeta(args: {
  period?: Period;
  comparison?: Period;
  sources: SourceInfo[];
  filters?: Record<string, string>;
  calculation?: CalcStep[];
  notes?: string[];
}): AnalysisMeta {
  const last = args.sources.map((s) => s.lastUpdatedAt).sort().pop() ?? null;
  return {
    period: args.period ? periodMeta(args.period) : undefined,
    comparison: args.comparison ? periodMeta(args.comparison) : undefined,
    sources: args.sources,
    lastUpdated: last,
    filters: args.filters ?? {},
    calculation: args.calculation ?? [],
    notes: args.notes,
  };
}

export function mergeSources(...lists: SourceInfo[][]): SourceInfo[] {
  const map = new Map<string, SourceInfo>();
  lists.flat().forEach((s) => map.set(s.id, s));
  return [...map.values()];
}
