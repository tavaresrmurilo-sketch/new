import "server-only";
import { prisma } from "@/server/db";
import { metricDay } from "@/server/engagement/service";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface MaintenanceResult {
  archivedEvents: number;
  expiredSessions: number;
  oldTokens: number;
  viewMarks: number;
  rateLimitBuckets: number;
  geocodeCache: number;
  expiredInvites: number;
}

/**
 * Faxina diária: arquiva eventos encerrados e remove dados temporários
 * (sessões vencidas, tokens antigos, marcas de visualização, contadores de
 * limite de taxa, cache de geocodificação e convites expirados).
 */
export async function runMaintenance(now: Date = new Date()): Promise<MaintenanceResult> {
  const t = now.getTime();
  const today = metricDay(now);

  const archived = await prisma.event.updateMany({
    where: { status: "PUBLISHED", endsAt: { lt: new Date(t - DAY) } },
    data: { status: "ARCHIVED" },
  });
  const sessions = await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  const tokens = await prisma.verificationToken.deleteMany({
    where: { OR: [{ usedAt: { lt: new Date(t - 7 * DAY) } }, { expiresAt: { lt: new Date(t - 7 * DAY) } }] },
  });
  const viewMarks = await prisma.eventViewMark.deleteMany({ where: { day: { lt: new Date(today.getTime() - 3 * DAY) } } });
  const buckets = await prisma.rateLimitBucket.deleteMany({ where: { resetAt: { lt: new Date(t - HOUR) } } });
  const geocode = await prisma.geocodeCache.deleteMany({ where: { createdAt: { lt: new Date(t - 90 * DAY) } } });
  const invites = await prisma.orgInvite.deleteMany({ where: { acceptedAt: null, expiresAt: { lt: new Date(t - 30 * DAY) } } });

  return {
    archivedEvents: archived.count,
    expiredSessions: sessions.count,
    oldTokens: tokens.count,
    viewMarks: viewMarks.count,
    rateLimitBuckets: buckets.count,
    geocodeCache: geocode.count,
    expiredInvites: invites.count,
  };
}
