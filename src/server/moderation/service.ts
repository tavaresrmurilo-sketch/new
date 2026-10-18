import "server-only";
import type { Prisma, ReportStatus } from "@prisma/client";
import { audit } from "@/server/audit";
import { AdminError, assertAdminActor, paged, paging, type AdminActor, type Paged } from "@/server/admin/common";
import { suspendOrganization } from "@/server/admin/organizations";
import { prisma } from "@/server/db";
import { genericMessage } from "@/server/email/templates";
import { onEventPublished } from "@/server/events/lifecycle";
import { notify } from "@/server/notifications";

export const QUEUE_PAGE_SIZE = 10;
export const REPORT_PAGE_SIZE = 20;
export const REASON_MIN = 10;
export const REASON_MAX = 600;

// ─────────────────────────────────────────────────────────────
// Fila de análise
// ─────────────────────────────────────────────────────────────

const QUEUE_SELECT = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  description: true,
  coverUrl: true,
  coverThumbUrl: true,
  coverColor: true,
  startsAt: true,
  endsAt: true,
  timezone: true,
  venueName: true,
  address: true,
  neighborhood: true,
  city: true,
  state: true,
  lat: true,
  lng: true,
  isFree: true,
  priceMinCents: true,
  priceMaxCents: true,
  ticketUrl: true,
  ticketProvider: true,
  ageRating: true,
  accessibility: true,
  tags: true,
  submittedAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { name: true, color: true, icon: true } },
  createdBy: { select: { name: true } },
  organization: {
    select: { id: true, name: true, slug: true, logoUrl: true, verified: true, trustedPublisher: true, createdAt: true, status: true, plan: true },
  },
} satisfies Prisma.EventSelect;

export type QueueEvent = Prisma.EventGetPayload<{ select: typeof QUEUE_SELECT }> & {
  orgHistory: { published: number; rejected: number; openReports: number; isNew: boolean };
};

/** Eventos em análise, os mais antigos primeiro (por data de envio). */
export async function moderationQueue(page = 1): Promise<Paged<QueueEvent>> {
  const p = paging(page, QUEUE_PAGE_SIZE);
  const where: Prisma.EventWhereInput = { status: "PENDING_REVIEW" };
  const [rows, total] = await Promise.all([
    prisma.event.findMany({ where, select: QUEUE_SELECT, orderBy: [{ submittedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }], skip: p.skip, take: p.take }),
    prisma.event.count({ where }),
  ]);
  const orgIds = [...new Set(rows.map((r) => r.organization.id))];
  const [published, rejected, reports] = orgIds.length
    ? await Promise.all([
        prisma.event.groupBy({ by: ["organizationId"], where: { organizationId: { in: orgIds }, publishedAt: { not: null } }, _count: { _all: true } }),
        prisma.event.groupBy({ by: ["organizationId"], where: { organizationId: { in: orgIds }, status: "REJECTED" }, _count: { _all: true } }),
        prisma.report.groupBy({ by: ["organizationId"], where: { organizationId: { in: orgIds }, status: "OPEN" }, _count: { _all: true } }),
      ])
    : [[], [], []];
  const count = (list: { organizationId: string | null; _count: { _all: number } }[], id: string) => list.find((x) => x.organizationId === id)?._count._all ?? 0;
  const items = rows.map((r) => {
    const pub = count(published, r.organization.id);
    return {
      ...r,
      orgHistory: { published: pub, rejected: count(rejected, r.organization.id), openReports: count(reports, r.organization.id), isNew: pub === 0 },
    };
  });
  return paged(items, total, p.page, QUEUE_PAGE_SIZE);
}

async function loadEvent(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, slug: true, title: true, status: true, organizationId: true, organization: { select: { name: true, status: true, trustedPublisher: true } } },
  });
  if (!event) throw new AdminError("Evento não encontrado.", "NOT_FOUND");
  return event;
}

async function notifyMembers(
  organizationId: string,
  input: { type: "EVENT_APPROVED" | "EVENT_REJECTED"; title: string; body: string; url: string; template: string; paragraphs: string[]; cta: { label: string; path: string } },
) {
  const members = await prisma.membership.findMany({ where: { organizationId }, select: { userId: true } });
  for (const m of members) {
    await notify(
      m.userId,
      { type: input.type, title: input.title, body: input.body, url: input.url },
      { email: genericMessage({ template: input.template, subject: input.title, heading: input.title, paragraphs: input.paragraphs, cta: input.cta }) },
    ).catch((err) => console.error("[moderation] aviso à equipe", err));
  }
  return members.length;
}

/** Aprova um evento em análise: publica, avisa a equipe do organizador e os seguidores. */
export async function approveEvent(actor: AdminActor, eventId: string, opts: { trustOrganization?: boolean } = {}, now: Date = new Date()) {
  await assertAdminActor(actor);
  const event = await loadEvent(eventId);
  if (event.status !== "PENDING_REVIEW") throw new AdminError("Este evento não está mais em análise. Atualize a fila.");
  if (event.organization.status !== "ACTIVE") throw new AdminError("A organização deste evento está suspensa. Reative-a antes de aprovar.");

  const res = await prisma.event.updateMany({
    where: { id: event.id, status: "PENDING_REVIEW" },
    data: { status: "PUBLISHED", publishedAt: now, reviewedById: actor.id, reviewedAt: now, rejectionReason: null },
  });
  if (!res.count) throw new AdminError("Outra pessoa da equipe já analisou este evento. Atualize a fila.");

  const trusted = Boolean(opts.trustOrganization) && !event.organization.trustedPublisher;
  if (trusted) {
    await prisma.organization.update({ where: { id: event.organizationId }, data: { trustedPublisher: true } });
    await audit({ actorId: actor.id, action: "admin.org.trust", targetType: "Organization", targetId: event.organizationId, metadata: { via: "moderation", eventId: event.id }, ip: actor.ip });
  }

  const { notified: followersNotified } = await onEventPublished(event.id);
  const url = `/evento/${event.slug}`;
  const teamNotified = await notifyMembers(event.organizationId, {
    type: "EVENT_APPROVED",
    title: `Evento aprovado: ${event.title}`,
    body: "Seu evento já está no mapa e nas buscas do Mixtour.",
    url,
    template: "event-approved",
    paragraphs: [`“${event.title}” foi aprovado pela equipe Mixtour e já aparece no mapa e nas buscas.`, "Compartilhe o link com o seu público para começar a receber visitas."],
    cta: { label: "Ver evento", path: url },
  });
  await audit({
    actorId: actor.id,
    action: "moderation.approve",
    targetType: "Event",
    targetId: event.id,
    metadata: { organizationId: event.organizationId, title: event.title, trustedOrganization: trusted, followersNotified, teamNotified },
    ip: actor.ip,
  });
  return { followersNotified, teamNotified, trusted };
}

function checkReason(reason: string) {
  const r = reason.trim();
  if (r.length < REASON_MIN) throw new AdminError(`Explique o motivo com pelo menos ${REASON_MIN} caracteres.`, "INVALID", { reason: `Use pelo menos ${REASON_MIN} caracteres.` });
  return r.slice(0, REASON_MAX);
}

/** Recusa um evento em análise com motivo (enviado ao organizador). */
export async function rejectEvent(actor: AdminActor, eventId: string, reason: string, now: Date = new Date()) {
  await assertAdminActor(actor);
  const why = checkReason(reason);
  const event = await loadEvent(eventId);
  if (event.status !== "PENDING_REVIEW") throw new AdminError("Este evento não está mais em análise. Atualize a fila.");
  const res = await prisma.event.updateMany({
    where: { id: event.id, status: "PENDING_REVIEW" },
    data: { status: "REJECTED", rejectionReason: why, reviewedById: actor.id, reviewedAt: now },
  });
  if (!res.count) throw new AdminError("Outra pessoa da equipe já analisou este evento. Atualize a fila.");
  const editUrl = `/painel/eventos/${event.id}`;
  const teamNotified = await notifyMembers(event.organizationId, {
    type: "EVENT_REJECTED",
    title: `Evento não aprovado: ${event.title}`,
    body: why,
    url: editUrl,
    template: "event-rejected",
    paragraphs: [`“${event.title}” não foi aprovado pela equipe Mixtour.`, `Motivo: ${why}`, "Você pode ajustar o evento e enviá-lo de novo para análise."],
    cta: { label: "Editar evento", path: editUrl },
  });
  await audit({ actorId: actor.id, action: "moderation.reject", targetType: "Event", targetId: event.id, metadata: { organizationId: event.organizationId, title: event.title, reason: why, teamNotified }, ip: actor.ip });
  return { teamNotified };
}

/** Tira do ar um evento publicado (volta a "Recusado" com motivo, avisando a equipe do organizador). */
export async function unpublishEvent(actor: AdminActor, eventId: string, reason: string, now: Date = new Date()) {
  await assertAdminActor(actor);
  const why = checkReason(reason);
  const event = await loadEvent(eventId);
  if (event.status !== "PUBLISHED") throw new AdminError("Só eventos publicados podem ser retirados do ar.");
  const res = await prisma.event.updateMany({
    where: { id: event.id, status: "PUBLISHED" },
    data: { status: "REJECTED", rejectionReason: why, reviewedById: actor.id, reviewedAt: now, featuredUntil: null },
  });
  if (!res.count) throw new AdminError("O evento mudou enquanto você analisava. Atualize a página.");
  const editUrl = `/painel/eventos/${event.id}`;
  const teamNotified = await notifyMembers(event.organizationId, {
    type: "EVENT_REJECTED",
    title: `Evento retirado do ar: ${event.title}`,
    body: why,
    url: editUrl,
    template: "event-unpublished",
    paragraphs: [`“${event.title}” foi retirado do ar pela equipe Mixtour.`, `Motivo: ${why}`, "Ajuste as informações e envie o evento de novo para análise."],
    cta: { label: "Editar evento", path: editUrl },
  });
  await audit({ actorId: actor.id, action: "moderation.unpublish", targetType: "Event", targetId: event.id, metadata: { organizationId: event.organizationId, title: event.title, reason: why, teamNotified }, ip: actor.ip });
  return { teamNotified };
}

// ─────────────────────────────────────────────────────────────
// Denúncias
// ─────────────────────────────────────────────────────────────

export type ReportFilter = ReportStatus | "all";

const REPORT_SELECT = {
  id: true,
  reason: true,
  details: true,
  status: true,
  resolution: true,
  resolvedAt: true,
  createdAt: true,
  eventId: true,
  organizationId: true,
  reporter: { select: { name: true } },
  resolvedBy: { select: { name: true } },
  event: { select: { id: true, slug: true, title: true, status: true, startsAt: true, timezone: true, coverThumbUrl: true, coverColor: true, city: true } },
  organization: { select: { id: true, name: true, slug: true, status: true, verified: true, logoUrl: true } },
} satisfies Prisma.ReportSelect;

export type AdminReport = Prisma.ReportGetPayload<{ select: typeof REPORT_SELECT }> & { sameTargetOpen: number; sameTargetTotal: number };

export async function listReports(filter: ReportFilter = "OPEN", page = 1): Promise<Paged<AdminReport> & { counts: Record<ReportStatus, number> }> {
  const p = paging(page, REPORT_PAGE_SIZE);
  const where: Prisma.ReportWhereInput = filter === "all" ? {} : { status: filter };
  const orderBy: Prisma.ReportOrderByWithRelationInput[] =
    filter === "OPEN" ? [{ createdAt: "asc" }] : filter === "all" ? [{ status: "asc" }, { createdAt: "desc" }] : [{ resolvedAt: "desc" }, { createdAt: "desc" }];
  const [rows, total, byStatus] = await Promise.all([
    prisma.report.findMany({ where, select: REPORT_SELECT, orderBy, skip: p.skip, take: p.take }),
    prisma.report.count({ where }),
    prisma.report.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const eventIds = [...new Set(rows.map((r) => r.eventId).filter((v): v is string => Boolean(v)))];
  const orgOnly = [...new Set(rows.filter((r) => !r.eventId && r.organizationId).map((r) => r.organizationId as string))];
  const [byEvent, byOrg] = await Promise.all([
    eventIds.length ? prisma.report.groupBy({ by: ["eventId", "status"], where: { eventId: { in: eventIds } }, _count: { _all: true } }) : Promise.resolve([]),
    orgOnly.length
      ? prisma.report.groupBy({ by: ["organizationId", "status"], where: { organizationId: { in: orgOnly }, eventId: null }, _count: { _all: true } })
      : Promise.resolve([]),
  ]);
  const items = rows.map((r) => {
    const group = r.eventId
      ? byEvent.filter((g) => g.eventId === r.eventId)
      : byOrg.filter((g) => g.organizationId === r.organizationId);
    return {
      ...r,
      sameTargetOpen: group.filter((g) => g.status === "OPEN").reduce((n, g) => n + g._count._all, 0),
      sameTargetTotal: group.reduce((n, g) => n + g._count._all, 0),
    };
  });
  const counts = { OPEN: 0, RESOLVED: 0, DISMISSED: 0 } as Record<ReportStatus, number>;
  for (const s of byStatus) counts[s.status] = s._count._all;
  return { ...paged(items, total, p.page, REPORT_PAGE_SIZE), counts };
}

export type ReportAction = "none" | "unpublish" | "suspend_org";

async function loadOpenReport(reportId: string) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: { id: true, status: true, eventId: true, organizationId: true, event: { select: { status: true, organizationId: true } } },
  });
  if (!report) throw new AdminError("Denúncia não encontrada.", "NOT_FOUND");
  if (report.status !== "OPEN") throw new AdminError("Esta denúncia já foi tratada. Atualize a lista.");
  return report;
}

function sameTargetWhere(report: { id: string; eventId: string | null; organizationId: string | null }, includeSiblings: boolean): Prisma.ReportWhereInput {
  if (!includeSiblings) return { id: report.id, status: "OPEN" };
  if (report.eventId) return { eventId: report.eventId, status: "OPEN" };
  if (report.organizationId) return { organizationId: report.organizationId, eventId: null, status: "OPEN" };
  return { id: report.id, status: "OPEN" };
}

/**
 * Resolve a denúncia (e, se pedido, as outras abertas do mesmo alvo), com a
 * providência opcional: tirar o evento do ar ou suspender a organização.
 */
export async function resolveReport(
  actor: AdminActor,
  reportId: string,
  input: { resolution: string; action: ReportAction; applyToSameTarget?: boolean },
  now: Date = new Date(),
) {
  await assertAdminActor(actor);
  const resolution = input.resolution.trim().slice(0, REASON_MAX);
  if (resolution.length < 3) throw new AdminError("Descreva a resolução.", "INVALID", { resolution: "Descreva o que foi feito." });
  const report = await loadOpenReport(reportId);
  const orgId = report.organizationId ?? report.event?.organizationId ?? null;

  if (input.action === "unpublish") {
    if (!report.eventId) throw new AdminError("Esta denúncia não está ligada a um evento.");
    if (report.event?.status !== "PUBLISHED") throw new AdminError("O evento não está publicado — escolha outra providência.");
    await unpublishEvent(actor, report.eventId, resolution.length >= REASON_MIN ? resolution : `Retirado após denúncia: ${resolution}`, now);
  } else if (input.action === "suspend_org") {
    if (!orgId) throw new AdminError("Esta denúncia não está ligada a uma organização.");
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { status: true } });
    if (org?.status !== "SUSPENDED") await suspendOrganization(actor, orgId, resolution);
  }

  const updated = await prisma.report.updateMany({
    where: sameTargetWhere(report, Boolean(input.applyToSameTarget)),
    data: { status: "RESOLVED", resolution, resolvedById: actor.id, resolvedAt: now },
  });
  await audit({
    actorId: actor.id,
    action: "moderation.report_resolve",
    targetType: "Report",
    targetId: report.id,
    metadata: { eventId: report.eventId, organizationId: orgId, action: input.action, resolution, reportsClosed: updated.count },
    ip: actor.ip,
  });
  return { reportsClosed: updated.count };
}

export async function dismissReport(actor: AdminActor, reportId: string, input: { note?: string; applyToSameTarget?: boolean } = {}, now: Date = new Date()) {
  await assertAdminActor(actor);
  const report = await loadOpenReport(reportId);
  const note = input.note?.trim().slice(0, REASON_MAX) || "Descartada: sem violação das regras.";
  const updated = await prisma.report.updateMany({
    where: sameTargetWhere(report, Boolean(input.applyToSameTarget)),
    data: { status: "DISMISSED", resolution: note, resolvedById: actor.id, resolvedAt: now },
  });
  await audit({
    actorId: actor.id,
    action: "moderation.report_dismiss",
    targetType: "Report",
    targetId: report.id,
    metadata: { eventId: report.eventId, organizationId: report.organizationId, note, reportsClosed: updated.count },
    ip: actor.ip,
  });
  return { reportsClosed: updated.count };
}
