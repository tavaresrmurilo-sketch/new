import "server-only";
import { Prisma, type EventStatus, type RsvpStatus } from "@prisma/client";
import { prisma } from "@/server/db";
import { EVENT_CARD_SELECT, toEventCard } from "@/server/events/dto";
import { listedEventWhere } from "@/server/events/visibility";
import type { EventCardData } from "@/lib/events";
import { groupByDay, type DayGroup } from "./helpers";

/**
 * Agenda do explorador: "Vou" (presenças), "Salvos", "Seguindo" e "Histórico".
 * Sempre restrita ao próprio usuário (userId vem da sessão, nunca do cliente).
 */

export const AGENDA_TABS = ["vou", "salvos", "seguindo", "historico"] as const;
export type AgendaTab = (typeof AGENDA_TABS)[number];

export function parseAgendaTab(v: unknown): AgendaTab {
  const s = Array.isArray(v) ? v[0] : v;
  return AGENDA_TABS.includes(s as AgendaTab) ? (s as AgendaTab) : "vou";
}

/** Limite de itens futuros por lista (agenda pessoal raramente passa disso). */
export const UPCOMING_LIMIT = 200;
export const HISTORY_STEP = 30;
export const HISTORY_MAX = 300;

const AGENDA_EVENT_SELECT = {
  ...EVENT_CARD_SELECT,
  status: true,
  canceledAt: true,
  organization: { select: { ...EVENT_CARD_SELECT.organization.select, status: true } },
} satisfies Prisma.EventSelect;

type AgendaEventRow = Prisma.EventGetPayload<{ select: typeof AGENDA_EVENT_SELECT }>;

export type AgendaAvailability = "ok" | "canceled" | "unavailable";

export interface AgendaItem {
  event: EventCardData;
  status: EventStatus;
  availability: AgendaAvailability;
  rsvp: RsvpStatus | null;
  saved: boolean;
}

/** Cancelado continua com página pública (com aviso); rascunho/recusado/organização suspensa somem do público. */
export function availabilityOf(e: { status: EventStatus; organization: { status: string } }): AgendaAvailability {
  if (e.organization.status !== "ACTIVE") return "unavailable";
  if (e.status === "CANCELED") return "canceled";
  if (e.status === "PUBLISHED" || e.status === "ARCHIVED") return "ok";
  return "unavailable";
}

function toItem(e: AgendaEventRow, extra: { rsvp: RsvpStatus | null; saved: boolean }, now: Date): AgendaItem {
  const { status, organization, ...rest } = e;
  const card = toEventCard({ ...rest, organization }, null, now);
  return { event: card, status, availability: availabilityOf(e), ...extra };
}

export interface AgendaCounts {
  going: number;
  saved: number;
  following: number;
}

export async function agendaCounts(userId: string, now: Date = new Date()): Promise<AgendaCounts> {
  const [going, saved, following] = await Promise.all([
    prisma.eventRsvp.count({ where: { userId, event: { endsAt: { gte: now } } } }),
    prisma.eventSave.count({ where: { userId, event: { endsAt: { gte: now } } } }),
    prisma.follow.count({ where: { userId } }),
  ]);
  return { going, saved, following };
}

/** "Vou": presenças (GOING e INTERESTED) em eventos que ainda não terminaram, por data, agrupadas por dia. */
export async function upcomingRsvps(userId: string, now: Date = new Date()): Promise<DayGroup<AgendaItem>[]> {
  const rows = await prisma.eventRsvp.findMany({
    where: { userId, event: { endsAt: { gte: now } } },
    orderBy: [{ event: { startsAt: "asc" } }, { eventId: "asc" }],
    take: UPCOMING_LIMIT,
    select: { status: true, event: { select: AGENDA_EVENT_SELECT } },
  });
  const savedIds = await savedSet(
    userId,
    rows.map((r) => r.event.id),
  );
  const items = rows.map((r) => toItem(r.event, { rsvp: r.status, saved: savedIds.has(r.event.id) }, now));
  return groupItems(items, now);
}

/** "Salvos": eventos salvos que ainda não terminaram, por data, agrupados por dia. */
export async function upcomingSaves(userId: string, now: Date = new Date()): Promise<DayGroup<AgendaItem>[]> {
  const rows = await prisma.eventSave.findMany({
    where: { userId, event: { endsAt: { gte: now } } },
    orderBy: [{ event: { startsAt: "asc" } }, { eventId: "asc" }],
    take: UPCOMING_LIMIT,
    select: { event: { select: AGENDA_EVENT_SELECT } },
  });
  const ids = rows.map((r) => r.event.id);
  const rsvps = ids.length
    ? await prisma.eventRsvp.findMany({ where: { userId, eventId: { in: ids } }, select: { eventId: true, status: true } })
    : [];
  const rsvpMap = new Map(rsvps.map((r) => [r.eventId, r.status]));
  const items = rows.map((r) => toItem(r.event, { rsvp: rsvpMap.get(r.event.id) ?? null, saved: true }, now));
  return groupItems(items, now);
}

/** "Histórico": eventos já encerrados em que a pessoa marcou presença ou salvou (mais recentes primeiro). */
export async function pastEvents(userId: string, opts: { take?: number; now?: Date } = {}): Promise<{ items: AgendaItem[]; hasMore: boolean }> {
  const now = opts.now ?? new Date();
  const take = Math.min(HISTORY_MAX, Math.max(1, opts.take ?? HISTORY_STEP));
  const rows = await prisma.event.findMany({
    where: { endsAt: { lt: now }, OR: [{ rsvps: { some: { userId } } }, { saves: { some: { userId } } }] },
    orderBy: [{ startsAt: "desc" }, { id: "asc" }],
    take: take + 1,
    select: {
      ...AGENDA_EVENT_SELECT,
      rsvps: { where: { userId }, select: { status: true } },
      saves: { where: { userId }, select: { userId: true } },
    },
  });
  const hasMore = rows.length > take;
  const items = rows.slice(0, take).map(({ rsvps, saves, ...e }) => toItem(e, { rsvp: rsvps[0]?.status ?? null, saved: saves.length > 0 }, now));
  return { items, hasMore };
}

export interface FollowedOrganizer {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  verified: boolean;
  city: string | null;
  state: string | null;
  active: boolean;
  followedAt: Date;
  upcomingCount: number;
  nextEvent: EventCardData | null;
}

/** "Seguindo": organizadores seguidos com o próximo evento de cada um (sem N+1: 3 consultas no total). */
export async function followedOrganizers(userId: string, now: Date = new Date()): Promise<FollowedOrganizer[]> {
  const follows = await prisma.follow.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { organizationId: "asc" }],
    take: UPCOMING_LIMIT,
    select: {
      createdAt: true,
      organization: { select: { id: true, slug: true, name: true, logoUrl: true, verified: true, city: true, state: true, status: true } },
    },
  });
  const orgIds = follows.map((f) => f.organization.id);
  if (!orgIds.length) return [];

  const listed = listedEventWhere(now);
  const [nextIds, counts] = await Promise.all([
    prisma.$queryRaw<{ id: string; organizationId: string }[]>`
      SELECT DISTINCT ON (e."organizationId") e."id", e."organizationId"
      FROM "Event" e
      WHERE e."organizationId" IN (${Prisma.join(orgIds)})
        AND e."status" = 'PUBLISHED'
        AND e."endsAt" >= ${now}
      ORDER BY e."organizationId", e."startsAt" ASC, e."id" ASC`,
    prisma.event.groupBy({ by: ["organizationId"], where: { ...listed, organizationId: { in: orgIds } }, _count: { _all: true } }),
  ]);
  const cards = nextIds.length
    ? await prisma.event.findMany({ where: { id: { in: nextIds.map((n) => n.id) } }, select: EVENT_CARD_SELECT })
    : [];
  const cardById = new Map(cards.map((c) => [c.id, toEventCard(c, null, now)]));
  const nextByOrg = new Map(nextIds.map((n) => [n.organizationId, cardById.get(n.id) ?? null]));
  const countByOrg = new Map(counts.map((c) => [c.organizationId, c._count._all]));

  return follows.map(({ organization: o, createdAt }) => {
    const active = o.status === "ACTIVE";
    return {
      id: o.id,
      slug: o.slug,
      name: o.name,
      logoUrl: o.logoUrl,
      verified: o.verified,
      city: o.city,
      state: o.state,
      active,
      followedAt: createdAt,
      upcomingCount: active ? (countByOrg.get(o.id) ?? 0) : 0,
      nextEvent: active ? (nextByOrg.get(o.id) ?? null) : null,
    };
  });
}

async function savedSet(userId: string, eventIds: string[]): Promise<Set<string>> {
  if (!eventIds.length) return new Set();
  const rows = await prisma.eventSave.findMany({ where: { userId, eventId: { in: eventIds } }, select: { eventId: true } });
  return new Set(rows.map((r) => r.eventId));
}

function groupItems(items: AgendaItem[], now: Date) {
  return groupByDay(
    items,
    (i) => ({ startsAt: new Date(i.event.startsAt), endsAt: new Date(i.event.endsAt), timezone: i.event.timezone }),
    now,
  );
}
