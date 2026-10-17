import "server-only";
import type { Prisma, RsvpStatus } from "@prisma/client";
import { prisma } from "@/server/db";
import { localDayKey } from "@/lib/dates";
import { DEFAULT_TIMEZONE } from "@/lib/constants";

/**
 * Engajamento do explorador (salvar, "vou"/"tenho interesse", seguir organizador)
 * com contadores desnormalizados e métricas diárias sempre consistentes.
 * Usado pela página do evento, pela agenda e por quaisquer outras telas.
 */

export class EngagementError extends Error {}

export type MetricField = "views" | "uniqueViews" | "saves" | "going" | "ticketClicks" | "shares";

/** Dia (calendário de São Paulo) usado nas métricas diárias. */
export function metricDay(now: Date = new Date()): Date {
  return new Date(`${localDayKey(now, DEFAULT_TIMEZONE)}T00:00:00.000Z`);
}

export async function bumpMetric(eventId: string, field: MetricField, delta = 1, tx: Prisma.TransactionClient = prisma) {
  const day = metricDay();
  await tx.eventMetricDaily.upsert({
    where: { eventId_day: { eventId, day } },
    create: { eventId, day, [field]: Math.max(0, delta) },
    update: { [field]: { increment: delta } },
  });
}

async function engageableEvent(eventId: string, requireUpcoming: boolean) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, status: true, endsAt: true, organization: { select: { status: true } } },
  });
  if (!event || event.status !== "PUBLISHED" || event.organization.status !== "ACTIVE") {
    throw new EngagementError("Este evento não está disponível.");
  }
  if (requireUpcoming && event.endsAt < new Date()) throw new EngagementError("Este evento já terminou.");
  return event;
}

export async function setSaved(userId: string, eventId: string, saved: boolean): Promise<{ saved: boolean; savesCount: number }> {
  if (saved) await engageableEvent(eventId, false);
  return prisma.$transaction(async (tx) => {
    if (saved) {
      // ON CONFLICT DO NOTHING: toques duplos/concorrentes não duplicam nem abortam a transação.
      const created = await tx.eventSave.createMany({ data: [{ userId, eventId }], skipDuplicates: true });
      if (created.count) {
        await tx.event.update({ where: { id: eventId }, data: { savesCount: { increment: 1 } } });
        await bumpMetric(eventId, "saves", 1, tx);
      }
    } else {
      const del = await tx.eventSave.deleteMany({ where: { userId, eventId } });
      if (del.count) {
        await tx.$executeRaw`UPDATE "Event" SET "savesCount" = GREATEST("savesCount" - 1, 0) WHERE "id" = ${eventId}`;
      }
    }
    const e = await tx.event.findUniqueOrThrow({ where: { id: eventId }, select: { savesCount: true } });
    return { saved, savesCount: e.savesCount };
  });
}

/** Define (ou remove, com null) a presença. Só GOING conta em goingCount. */
export async function setRsvp(userId: string, eventId: string, status: RsvpStatus | null): Promise<{ status: RsvpStatus | null; goingCount: number }> {
  if (status) await engageableEvent(eventId, true);
  return prisma.$transaction(async (tx) => {
    const prev = await tx.eventRsvp.findUnique({ where: { userId_eventId: { userId, eventId } } });
    const wasGoing = prev?.status === "GOING";
    const isGoing = status === "GOING";

    if (status === null) {
      if (prev) await tx.eventRsvp.delete({ where: { userId_eventId: { userId, eventId } } });
    } else if (!prev) {
      await tx.eventRsvp.createMany({ data: [{ userId, eventId, status }], skipDuplicates: true });
    } else if (prev.status !== status) {
      await tx.eventRsvp.update({ where: { userId_eventId: { userId, eventId } }, data: { status } });
    }

    if (isGoing && !wasGoing) {
      await tx.event.update({ where: { id: eventId }, data: { goingCount: { increment: 1 } } });
      await bumpMetric(eventId, "going", 1, tx);
    } else if (!isGoing && wasGoing) {
      await tx.$executeRaw`UPDATE "Event" SET "goingCount" = GREATEST("goingCount" - 1, 0) WHERE "id" = ${eventId}`;
    }
    const e = await tx.event.findUniqueOrThrow({ where: { id: eventId }, select: { goingCount: true } });
    return { status, goingCount: e.goingCount };
  });
}

export async function setFollow(userId: string, organizationId: string, follow: boolean): Promise<{ following: boolean; followers: number }> {
  if (follow) {
    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { status: true } });
    if (!org || org.status !== "ACTIVE") throw new EngagementError("Organizador indisponível.");
    await prisma.follow.upsert({
      where: { userId_organizationId: { userId, organizationId } },
      create: { userId, organizationId },
      update: {},
    });
  } else {
    await prisma.follow.deleteMany({ where: { userId, organizationId } });
  }
  const followers = await prisma.follow.count({ where: { organizationId } });
  return { following: follow, followers };
}

/** Estado de engajamento do usuário para uma lista de eventos (para pintar botões). */
export async function engagementFor(userId: string | null | undefined, eventIds: string[]) {
  if (!userId || !eventIds.length) return { saved: new Set<string>(), rsvp: new Map<string, RsvpStatus>() };
  const [saves, rsvps] = await Promise.all([
    prisma.eventSave.findMany({ where: { userId, eventId: { in: eventIds } }, select: { eventId: true } }),
    prisma.eventRsvp.findMany({ where: { userId, eventId: { in: eventIds } }, select: { eventId: true, status: true } }),
  ]);
  return { saved: new Set(saves.map((s) => s.eventId)), rsvp: new Map(rsvps.map((r) => [r.eventId, r.status])) };
}
