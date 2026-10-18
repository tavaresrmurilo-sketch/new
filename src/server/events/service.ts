import "server-only";
import type { Event, EventStatus, Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { assertOrgRole } from "@/server/auth/guards";
import { assertCanActivateEvent, boostsUsedThisMonth, getPlan, PlanLimitError } from "@/server/billing/plans";
import { onEventChanged, onEventPublished } from "@/server/events/lifecycle";
import { resolveOrgUpload } from "@/server/organizations/service";
import { getSetting } from "@/server/settings";
import { formatDateTime } from "@/lib/format";
import { BOOST_DURATION_DAYS } from "@/lib/plans";
import { eventSlug } from "@/lib/slug";
import { isUnsetDate, publishProblems, TITLE_MAX, UNSET_DATE, type EventData } from "@/lib/validation/event";

/**
 * Ciclo de vida dos eventos do organizador (regras de negócio testáveis).
 * Toda função recebe o ator explicitamente e confere o papel na organização
 * DONA do evento — nunca confia no organizationId vindo do cliente.
 */

export type EventErrorCode = "NOT_FOUND" | "INVALID" | "STATE" | "EMAIL_UNVERIFIED" | "INCOMPLETE";

export class EventError extends Error {
  constructor(
    message: string,
    public code: EventErrorCode = "INVALID",
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export interface ActorMeta {
  ip?: string | null;
}

const EDITABLE: EventStatus[] = ["DRAFT", "PENDING_REVIEW", "PUBLISHED", "REJECTED"];
const PUBLISHABLE: EventStatus[] = ["DRAFT", "REJECTED"];

/** Evento + checagem de papel na organização dona. */
async function loadOwned(userId: string, eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new EventError("Evento não encontrado.", "NOT_FOUND");
  try {
    await assertOrgRole(userId, event.organizationId, "EDITOR");
  } catch (err) {
    // Não revela a existência do evento a quem é de outra organização.
    if ((err as { code?: string }).code === "NOT_FOUND") throw new EventError("Evento não encontrado.", "NOT_FOUND");
    throw err;
  }
  return event;
}

/** Linha do banco → dados normalizados (para checar completude antes de publicar). */
export function eventRowToData(e: Event): EventData {
  const hasLocation = Boolean(e.venueName || e.address) || e.lat !== 0 || e.lng !== 0;
  return {
    title: e.title,
    categoryId: e.categoryId,
    summary: e.summary,
    description: e.description,
    startsAt: isUnsetDate(e.startsAt) ? null : e.startsAt,
    endsAt: isUnsetDate(e.endsAt) ? null : e.endsAt,
    timezone: e.timezone,
    venueId: e.venueId,
    venueName: e.venueName || null,
    address: e.address || null,
    neighborhood: e.neighborhood,
    city: e.city || null,
    state: e.state,
    postalCode: e.postalCode,
    lat: hasLocation ? e.lat : null,
    lng: hasLocation ? e.lng : null,
    isFree: e.isFree,
    priceMinCents: e.priceMinCents,
    priceMaxCents: e.priceMaxCents,
    ticketUrl: e.ticketUrl,
    ticketProvider: e.ticketProvider,
    ageRating: e.ageRating,
    accessibility: e.accessibility,
    tags: e.tags,
    coverUrl: e.coverUrl,
    coverThumbUrl: e.coverThumbUrl,
    coverColor: e.coverColor,
  };
}

function problemsToFields(problems: { field: string; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of problems) out[p.field] ??= p.message;
  return out;
}

/** Valida referências (categoria, local salvo, capa) e monta os campos do banco. */
async function toDbFields(organizationId: string, d: EventData, current?: Event) {
  const category = await prisma.category.findUnique({ where: { id: d.categoryId }, select: { id: true, active: true } });
  if (!category || (!category.active && current?.categoryId !== category.id)) {
    throw new EventError("Escolha uma categoria válida.", "INVALID", { categoryId: "Escolha uma categoria" });
  }

  let venueId: string | null = null;
  if (d.venueId) {
    const venue = await prisma.venue.findFirst({ where: { id: d.venueId, organizationId }, select: { id: true } });
    venueId = venue?.id ?? null;
  }

  let cover: { url: string; thumbUrl: string | null; dominantColor: string | null } | null = null;
  if (d.coverUrl) {
    if (current?.coverUrl && d.coverUrl === current.coverUrl) {
      cover = { url: current.coverUrl, thumbUrl: current.coverThumbUrl, dominantColor: current.coverColor };
    } else {
      try {
        cover = await resolveOrgUpload(organizationId, d.coverUrl, ["event-cover"]);
      } catch {
        throw new EventError("Envie a imagem de capa novamente.", "INVALID", { coverUrl: "Imagem não encontrada. Envie de novo." });
      }
    }
  }

  return {
    title: d.title.slice(0, TITLE_MAX),
    categoryId: category.id,
    summary: d.summary,
    description: d.description,
    startsAt: d.startsAt ?? UNSET_DATE,
    endsAt: d.endsAt ?? UNSET_DATE,
    timezone: d.timezone,
    venueId,
    venueName: d.venueName ?? "",
    address: d.address ?? "",
    neighborhood: d.neighborhood,
    city: d.city ?? "",
    state: d.state,
    postalCode: d.postalCode,
    lat: d.lat ?? 0,
    lng: d.lng ?? 0,
    isFree: d.isFree,
    priceMinCents: d.isFree ? null : d.priceMinCents,
    priceMaxCents: d.isFree ? null : d.priceMaxCents,
    ticketUrl: d.ticketUrl,
    ticketProvider: d.ticketProvider,
    ageRating: d.ageRating,
    accessibility: d.accessibility,
    tags: d.tags,
    coverUrl: cover?.url ?? null,
    coverThumbUrl: cover?.thumbUrl ?? null,
    coverColor: cover?.dominantColor ?? null,
  } satisfies Omit<Prisma.EventUncheckedCreateInput, "slug" | "organizationId">;
}

/** Cria um rascunho na organização (o slug é definitivo). */
export async function createEvent(userId: string, organizationId: string, data: EventData): Promise<Event> {
  await assertOrgRole(userId, organizationId, "EDITOR");
  const fields = await toDbFields(organizationId, data);
  return prisma.event.create({
    data: { ...fields, organizationId, createdById: userId, slug: eventSlug(data.title), status: "DRAFT" },
  });
}

function locationChanged(a: Event, b: { venueName: string; address: string; lat: number; lng: number; city: string }) {
  return a.venueName !== b.venueName || a.address !== b.address || a.city !== b.city || Math.abs(a.lat - b.lat) > 1e-6 || Math.abs(a.lng - b.lng) > 1e-6;
}

/**
 * Atualiza o evento. Publicado continua publicado; mudança de data/horário ou
 * de local avisa quem marcou presença. Recusado pode ser editado e reenviado.
 */
export async function updateEvent(userId: string, eventId: string, data: EventData, now: Date = new Date()): Promise<{ event: Event; notified: number }> {
  const current = await loadOwned(userId, eventId);
  if (!EDITABLE.includes(current.status)) {
    throw new EventError(
      current.status === "CANCELED" ? "Eventos cancelados não podem ser editados." : "Eventos encerrados não podem ser editados.",
      "STATE",
    );
  }

  // Evento no ar (ou em análise) não pode ficar incompleto.
  if (current.status === "PUBLISHED" || current.status === "PENDING_REVIEW") {
    const startUnchanged = data.startsAt && current.startsAt.getTime() === data.startsAt.getTime();
    const problems = publishProblems(data, now).filter((p) => !(startUnchanged && p.code === "start_past"));
    if (problems.length) throw new EventError("Complete as informações obrigatórias para manter o evento no ar.", "INCOMPLETE", problemsToFields(problems));
  }

  const fields = await toDbFields(current.organizationId, data, current);
  const event = await prisma.event.update({ where: { id: eventId }, data: fields });

  let notified = 0;
  if (current.status === "PUBLISHED") {
    const timeChanged = current.startsAt.getTime() !== event.startsAt.getTime() || current.endsAt.getTime() !== event.endsAt.getTime();
    const placeChanged = locationChanged(current, event);
    if (timeChanged || placeChanged) {
      const detail = [
        timeChanged ? `Nova data: ${formatDateTime(event.startsAt, event.timezone)}` : null,
        placeChanged ? `Novo local: ${event.venueName}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      notified = (await onEventChanged(eventId, "updated", detail)).notified;
      await audit({ actorId: userId, action: "event.update_published", targetType: "Event", targetId: eventId, metadata: { timeChanged, placeChanged, notified } });
    }
  }
  return { event, notified };
}

/**
 * Publica (ou envia para análise) um rascunho/recusado.
 * Ordem: e-mail verificado → completude → limite do plano → modo de moderação.
 */
export async function publishEvent(
  userId: string,
  eventId: string,
  now: Date = new Date(),
  meta: ActorMeta = {},
): Promise<{ status: "PUBLISHED" | "PENDING_REVIEW"; notified: number }> {
  const event = await loadOwned(userId, eventId);
  if (event.status === "PUBLISHED") throw new EventError("Este evento já está publicado.", "STATE");
  if (event.status === "PENDING_REVIEW") throw new EventError("Este evento já está em análise pela equipe Mixtour.", "STATE");
  if (!PUBLISHABLE.includes(event.status)) throw new EventError("Este evento não pode mais ser publicado.", "STATE");

  if (await getSetting("publishing.requireVerifiedEmail")) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } });
    if (!user?.emailVerifiedAt) {
      throw new EventError("Confirme seu e-mail para publicar. Enviamos um link quando você criou a conta — você pode pedir outro no painel.", "EMAIL_UNVERIFIED");
    }
  }

  const problems = publishProblems(eventRowToData(event), now);
  if (problems.length) throw new EventError("Faltam algumas informações para publicar.", "INCOMPLETE", problemsToFields(problems));

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: event.organizationId }, select: { trustedPublisher: true } });
  const mode = await getSetting("moderation.mode");
  const status: "PUBLISHED" | "PENDING_REVIEW" = mode === "none" || (mode === "new_orgs" && org.trustedPublisher) ? "PUBLISHED" : "PENDING_REVIEW";

  await prisma.$transaction(async (tx) => {
    // Serializa publicações da mesma organização para o limite do plano valer em corridas.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${event.organizationId}))`;
    await assertCanActivateEvent(event.organizationId, event.id);
    const res = await tx.event.updateMany({
      where: { id: event.id, status: { in: PUBLISHABLE } },
      data: {
        status,
        submittedAt: now,
        publishedAt: status === "PUBLISHED" ? now : null,
        rejectionReason: null,
        reviewedAt: null,
        reviewedById: null,
      },
    });
    if (!res.count) throw new EventError("O evento mudou enquanto você publicava. Atualize a página.", "STATE");
  });

  const notified = status === "PUBLISHED" ? (await onEventPublished(event.id)).notified : 0;
  await audit({
    actorId: userId,
    action: status === "PUBLISHED" ? "event.publish" : "event.submit_review",
    targetType: "Event",
    targetId: event.id,
    metadata: { organizationId: event.organizationId, moderation: mode, resubmission: event.status === "REJECTED" },
    ip: meta.ip,
  });
  return { status, notified };
}

/** Retira da fila de análise e volta para rascunho. */
export async function withdrawEvent(userId: string, eventId: string): Promise<void> {
  const event = await loadOwned(userId, eventId);
  if (event.status !== "PENDING_REVIEW") throw new EventError("Só eventos em análise podem ser retirados.", "STATE");
  await prisma.event.updateMany({ where: { id: eventId, status: "PENDING_REVIEW" }, data: { status: "DRAFT", submittedAt: null } });
}

/** Cancela um evento publicado e avisa quem marcou presença ou salvou. */
export async function cancelEvent(
  userId: string,
  eventId: string,
  reason: string | null,
  now: Date = new Date(),
  meta: ActorMeta = {},
): Promise<{ notified: number }> {
  const event = await loadOwned(userId, eventId);
  if (event.status !== "PUBLISHED") throw new EventError("Só eventos publicados podem ser cancelados.", "STATE");
  if (event.endsAt < now) throw new EventError("Este evento já terminou.", "STATE");
  const res = await prisma.event.updateMany({
    where: { id: eventId, status: "PUBLISHED" },
    data: { status: "CANCELED", canceledAt: now, featuredUntil: null },
  });
  if (!res.count) throw new EventError("O evento mudou enquanto você cancelava. Atualize a página.", "STATE");
  const { notified } = await onEventChanged(eventId, "canceled", reason ?? undefined);
  await audit({
    actorId: userId,
    action: "event.cancel",
    targetType: "Event",
    targetId: eventId,
    metadata: { organizationId: event.organizationId, reason, notified },
    ip: meta.ip,
  });
  return { notified };
}

/** Exclui definitivamente — só rascunhos e recusados (eventos que nunca foram ao ar). */
export async function deleteEvent(userId: string, eventId: string, meta: ActorMeta = {}): Promise<void> {
  const event = await loadOwned(userId, eventId);
  if (event.status !== "DRAFT" && event.status !== "REJECTED") {
    throw new EventError("Só rascunhos e eventos recusados podem ser excluídos. Para tirar do ar, cancele o evento.", "STATE");
  }
  const res = await prisma.event.deleteMany({ where: { id: eventId, status: { in: ["DRAFT", "REJECTED"] } } });
  if (!res.count) throw new EventError("O evento mudou enquanto você excluía. Atualize a página.", "STATE");
  await audit({
    actorId: userId,
    action: "event.delete",
    targetType: "Event",
    targetId: eventId,
    metadata: { organizationId: event.organizationId, title: event.title, status: event.status },
    ip: meta.ip,
  });
}

/** Cópia como novo rascunho, sem datas (a pessoa define as novas). */
export async function duplicateEvent(userId: string, eventId: string): Promise<Event> {
  const e = await loadOwned(userId, eventId);
  const suffix = " (cópia)";
  const title = e.title.length + suffix.length > TITLE_MAX ? e.title.slice(0, TITLE_MAX - suffix.length) + suffix : e.title + suffix;
  return prisma.event.create({
    data: {
      organizationId: e.organizationId,
      createdById: userId,
      categoryId: e.categoryId,
      slug: eventSlug(e.title),
      status: "DRAFT",
      title,
      summary: e.summary,
      description: e.description,
      coverUrl: e.coverUrl,
      coverThumbUrl: e.coverThumbUrl,
      coverColor: e.coverColor,
      startsAt: UNSET_DATE,
      endsAt: UNSET_DATE,
      timezone: e.timezone,
      venueId: e.venueId,
      venueName: e.venueName,
      address: e.address,
      neighborhood: e.neighborhood,
      city: e.city,
      state: e.state,
      postalCode: e.postalCode,
      lat: e.lat,
      lng: e.lng,
      isFree: e.isFree,
      priceMinCents: e.priceMinCents,
      priceMaxCents: e.priceMaxCents,
      currency: e.currency,
      ticketUrl: e.ticketUrl,
      ticketProvider: e.ticketProvider,
      ageRating: e.ageRating,
      accessibility: e.accessibility,
      tags: e.tags,
    },
  });
}

/**
 * Destaque no mapa/listas: só planos com destaques, dentro da cota do mês,
 * para evento publicado que ainda não terminou. Dura BOOST_DURATION_DAYS
 * (ou até o fim do evento, o que vier antes).
 */
export async function boostEvent(
  userId: string,
  eventId: string,
  now: Date = new Date(),
  meta: ActorMeta = {},
): Promise<{ featuredUntil: Date; used: number; limit: number }> {
  const event = await loadOwned(userId, eventId);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: event.organizationId }, select: { plan: true } });
  const plan = await getPlan(org.plan);
  if (plan.boostsPerMonth <= 0) {
    throw new PlanLimitError(`O plano ${plan.name} não inclui destaques. Faça upgrade para colocar eventos em evidência no mapa.`, "PRO");
  }
  if (event.status !== "PUBLISHED") throw new EventError("Só eventos publicados podem ser destacados.", "STATE");
  if (event.endsAt <= now) throw new EventError("Este evento já terminou.", "STATE");
  if (event.featuredUntil && event.featuredUntil > now) {
    throw new EventError(`Este evento já está em destaque até ${formatDateTime(event.featuredUntil, event.timezone)}.`, "STATE");
  }

  const endsAt = new Date(Math.min(now.getTime() + BOOST_DURATION_DAYS * 86_400_000, event.endsAt.getTime()));
  const used = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"boost:" + event.organizationId}))`;
    const count = await boostsUsedThisMonth(event.organizationId);
    if (count >= plan.boostsPerMonth) {
      throw new PlanLimitError(
        `Você já usou os ${plan.boostsPerMonth} destaques do plano ${plan.name} neste mês. A cota renova no dia 1º.`,
        org.plan === "BUSINESS" ? null : "BUSINESS",
      );
    }
    await tx.eventBoost.create({ data: { eventId, organizationId: event.organizationId, startsAt: now, endsAt, createdById: userId } });
    await tx.event.update({ where: { id: eventId }, data: { featuredUntil: endsAt } });
    return count + 1;
  });

  await audit({
    actorId: userId,
    action: "event.boost",
    targetType: "Event",
    targetId: eventId,
    metadata: { organizationId: event.organizationId, until: endsAt.toISOString(), used, limit: plan.boostsPerMonth },
    ip: meta.ip,
  });
  return { featuredUntil: endsAt, used, limit: plan.boostsPerMonth };
}
