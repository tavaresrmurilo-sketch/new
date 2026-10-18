import "server-only";
import type { PlanTier } from "@prisma/client";
import { getPlans } from "@/server/billing/plans";
import { prisma } from "@/server/db";
import { listedEventWhere } from "@/server/events/visibility";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { localDayKey, parseLocalDateTime } from "@/lib/dates";
import { estimateMrr, fillDailySeries, MRR_STATUSES, type DailyPoint, type MrrEstimate } from "./metrics";

const DAY = 86_400_000;
export const SERIES_DAYS = 30;

export interface AdminOverview {
  users: { active: number; loggedIn30d: number; new7d: number; new30d: number; suspended: number };
  orgs: { byPlan: Record<PlanTier, number>; total: number; suspended: number; verified: number; trusted: number; new30d: number };
  events: { upcomingPublished: number; pendingReview: number; oldestPendingAt: Date | null };
  reports: { open: number };
  emails: { failed: number; failed7d: number; skipped7d: number };
  series: DailyPoint[];
  mrr: MrrEstimate;
  planNames: Record<PlanTier, string>;
}

/** Últimos N dias (calendário de Brasília), do mais antigo para hoje. */
export function lastDays(now: Date, n: number, tz = DEFAULT_TIMEZONE): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(localDayKey(new Date(now.getTime() - i * DAY), tz));
  return [...new Set(out)];
}

async function dailyCounts(table: "User" | "Event", since: Date): Promise<Map<string, number>> {
  // Nome de tabela vem de uma lista fixa (não de entrada do usuário).
  const rows = await prisma.$queryRawUnsafe<{ day: string; n: number }[]>(
    `SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE '${DEFAULT_TIMEZONE}', 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
       FROM "${table}" WHERE "createdAt" >= $1 GROUP BY 1`,
    since,
  );
  return new Map(rows.map((r) => [r.day, Number(r.n)]));
}

export async function getAdminOverview(now: Date = new Date()): Promise<AdminOverview> {
  const days = lastDays(now, SERIES_DAYS);
  const since = parseLocalDateTime(days[0], "00:00") ?? new Date(now.getTime() - SERIES_DAYS * DAY);
  const d7 = new Date(now.getTime() - 7 * DAY);
  const d30 = new Date(now.getTime() - 30 * DAY);

  const [
    active,
    loggedIn30d,
    new7d,
    new30d,
    suspended,
    orgGroups,
    orgSuspended,
    orgVerified,
    orgTrusted,
    orgNew30d,
    upcomingPublished,
    pendingReview,
    oldestPending,
    openReports,
    failed,
    failed7d,
    skipped7d,
    signups,
    events,
    subs,
    plans,
  ] = await Promise.all([
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { status: "ACTIVE", lastLoginAt: { gte: d30 } } }),
    prisma.user.count({ where: { createdAt: { gte: d7 }, status: { not: "DELETED" } } }),
    prisma.user.count({ where: { createdAt: { gte: d30 }, status: { not: "DELETED" } } }),
    prisma.user.count({ where: { status: "SUSPENDED" } }),
    prisma.organization.groupBy({ by: ["plan"], _count: { _all: true } }),
    prisma.organization.count({ where: { status: "SUSPENDED" } }),
    prisma.organization.count({ where: { verified: true } }),
    prisma.organization.count({ where: { trustedPublisher: true } }),
    prisma.organization.count({ where: { createdAt: { gte: d30 } } }),
    prisma.event.count({ where: listedEventWhere(now) }),
    prisma.event.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.event.findFirst({ where: { status: "PENDING_REVIEW" }, orderBy: [{ submittedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }], select: { submittedAt: true, createdAt: true } }),
    prisma.report.count({ where: { status: "OPEN" } }),
    prisma.emailOutbox.count({ where: { status: "FAILED" } }),
    prisma.emailOutbox.count({ where: { status: "FAILED", createdAt: { gte: d7 } } }),
    prisma.emailOutbox.count({ where: { status: "SKIPPED", createdAt: { gte: d7 } } }),
    dailyCounts("User", since),
    dailyCounts("Event", since),
    prisma.subscription.findMany({ where: { status: { in: [...MRR_STATUSES] } }, select: { tier: true, status: true, interval: true } }),
    getPlans(),
  ]);

  const byPlan: Record<PlanTier, number> = { FREE: 0, PRO: 0, BUSINESS: 0 };
  for (const g of orgGroups) byPlan[g.plan] = g._count._all;

  return {
    users: { active, loggedIn30d, new7d, new30d, suspended },
    orgs: { byPlan, total: byPlan.FREE + byPlan.PRO + byPlan.BUSINESS, suspended: orgSuspended, verified: orgVerified, trusted: orgTrusted, new30d: orgNew30d },
    events: { upcomingPublished, pendingReview, oldestPendingAt: oldestPending ? oldestPending.submittedAt ?? oldestPending.createdAt : null },
    reports: { open: openReports },
    emails: { failed, failed7d, skipped7d },
    series: fillDailySeries(days, signups, events),
    mrr: estimateMrr(subs, plans),
    planNames: Object.fromEntries(plans.map((p) => [p.tier, p.name])) as Record<PlanTier, string>,
  };
}

/** Contadores das filas para a navegação do /admin. */
export async function adminBadges() {
  const [pending, reports, failedEmails] = await Promise.all([
    prisma.event.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.report.count({ where: { status: "OPEN" } }),
    prisma.emailOutbox.count({ where: { status: "FAILED" } }),
  ]);
  return { pending, reports, failedEmails };
}
