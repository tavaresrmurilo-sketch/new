import "server-only";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { DAY_MS, parseDateOnly, parseLocalDateTime } from "@/lib/dates";
import type { ListParams } from "@/lib/list-params";
import type { confirmMeetingTasksSchema, meetingSchema } from "@/features/meetings/schemas";
import { logActivity } from "@/server/activity";
import { audit } from "@/server/audit";
import type { Ctx } from "@/server/auth/context";
import { assertMembers, assertOwned } from "@/server/db/ownership";
import { AppError, notFound } from "@/server/errors";
import { emitEvent } from "@/server/events/bus";
import { notifyMany } from "@/server/modules/notifications";
import { createTask } from "@/server/modules/tasks";
import { scopeOf } from "@/server/scope";

type MeetingData = z.output<typeof meetingSchema>;

async function validate(ctx: Ctx, data: MeetingData) {
  await Promise.all([
    assertOwned(ctx, "client", data.clientId),
    assertOwned(ctx, "opportunity", data.opportunityId),
    assertOwned(ctx, "project", data.projectId),
    assertMembers(ctx, data.participantUserIds),
  ]);
  if (data.participantContactIds.length) {
    const n = await ctx.db.contact.count({ where: { id: { in: data.participantContactIds } } });
    if (n !== new Set(data.participantContactIds).size) throw new AppError("NOT_FOUND", "Contato participante inválido.");
  }
  const startsAt = parseLocalDateTime(data.startsAt, ctx.org.timezone)!;
  const endsAt = parseLocalDateTime(data.endsAt, ctx.org.timezone);
  if (endsAt && endsAt <= startsAt) throw new AppError("VALIDATION", "O término deve ser após o início.", { endsAt: ["Horário inválido"] });
  return { startsAt, endsAt };
}

function participantRows(data: MeetingData) {
  const rows: Prisma.MeetingParticipantCreateManyMeetingInput[] = [
    ...data.participantUserIds.map((userId) => ({ userId })),
    ...data.participantContactIds.map((contactId) => ({ contactId })),
  ];
  for (const raw of (data.externalParticipants ?? "").split(/[\n,;]/)) {
    const v = raw.trim();
    if (!v) continue;
    rows.push(v.includes("@") ? { email: v.toLowerCase(), name: null } : { name: v });
  }
  return rows;
}

async function inferClient(ctx: Ctx, data: MeetingData) {
  if (data.clientId) return data.clientId;
  if (data.opportunityId) return (await ctx.db.opportunity.findUnique({ where: { id: data.opportunityId }, select: { clientId: true } }))?.clientId ?? null;
  if (data.projectId) return (await ctx.db.project.findUnique({ where: { id: data.projectId }, select: { clientId: true } }))?.clientId ?? null;
  return null;
}

export async function createMeeting(ctx: Ctx, data: MeetingData) {
  const { startsAt, endsAt } = await validate(ctx, data);
  const clientId = await inferClient(ctx, data);
  const meeting = await ctx.db.meeting.create({
    data: {
      organizationId: ctx.org.id,
      title: data.title,
      clientId,
      opportunityId: data.opportunityId,
      projectId: data.projectId,
      startsAt,
      endsAt,
      location: data.location,
      description: data.description,
      status: data.status,
      minutes: data.minutes,
      decisions: data.decisions,
      nextActions: data.nextActions,
      createdById: ctx.user.id,
      participants: { createMany: { data: participantRows(data) } },
    },
  });
  await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
    action: "meeting.scheduled",
    title: `Reunião agendada: ${meeting.title}`,
    entityType: "meeting",
    entityId: meeting.id,
    clientId,
    opportunityId: meeting.opportunityId,
    projectId: meeting.projectId,
  });
  await notifyMany(data.participantUserIds.filter((u) => u !== ctx.user.id), {
    organizationId: ctx.org.id,
    type: "meeting.invited",
    title: `Reunião: ${meeting.title}`,
    body: `${ctx.user.name} adicionou você como participante.`,
    link: `/app/meetings/${meeting.id}`,
    entityType: "meeting",
    entityId: meeting.id,
  });
  if (data.status === "DONE") await markMeetingDone(ctx, meeting.id);
  return { id: meeting.id };
}

export async function updateMeeting(ctx: Ctx, id: string, data: MeetingData) {
  const before = await ctx.db.meeting.findUnique({ where: { id } });
  if (!before) throw notFound("Reunião");
  const { startsAt, endsAt } = await validate(ctx, data);
  const clientId = await inferClient(ctx, data);
  await ctx.db.$transaction(async (tx) => {
    await tx.meetingParticipant.deleteMany({ where: { meetingId: id } });
    await tx.meeting.update({
      where: { id },
      data: {
        title: data.title,
        clientId,
        opportunityId: data.opportunityId,
        projectId: data.projectId,
        startsAt,
        endsAt,
        location: data.location,
        description: data.description,
        status: data.status,
        minutes: data.minutes,
        decisions: data.decisions,
        nextActions: data.nextActions,
        participants: { createMany: { data: participantRows(data) } },
      },
    });
  });
  if (before.status !== "DONE" && data.status === "DONE") await markMeetingDone(ctx, id);
  return { id };
}

/** Reunião realizada conta como interação com o cliente (atualiza último contato e atividade da oportunidade). */
export async function markMeetingDone(ctx: Ctx, id: string) {
  const m = await ctx.db.meeting.update({ where: { id }, data: { status: "DONE" } });
  const when = m.startsAt < new Date() ? m.startsAt : new Date();
  await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
    action: "meeting.completed",
    title: `Reunião realizada: ${m.title}`,
    body: m.decisions ? `Decisões: ${m.decisions}` : null,
    channel: "MEETING",
    isInteraction: Boolean(m.clientId),
    entityType: "meeting",
    entityId: m.id,
    clientId: m.clientId,
    opportunityId: m.opportunityId,
    projectId: m.projectId,
    occurredAt: when,
  });
  if (m.clientId) await ctx.db.client.updateMany({ where: { id: m.clientId, OR: [{ lastInteractionAt: null }, { lastInteractionAt: { lt: when } }] }, data: { lastInteractionAt: when } });
  if (m.opportunityId) await ctx.db.opportunity.updateMany({ where: { id: m.opportunityId, lastActivityAt: { lt: when } }, data: { lastActivityAt: when } });
  await emitEvent(scopeOf(ctx), "meeting.completed", {
    entityType: "meeting",
    entityId: m.id,
    label: m.title,
    link: `/app/meetings/${m.id}`,
    ownerId: m.createdById,
    clientId: m.clientId,
    opportunityId: m.opportunityId,
    projectId: m.projectId,
    fields: {},
  });
  return { id };
}

export async function deleteMeeting(ctx: Ctx, id: string) {
  const m = await ctx.db.meeting.findUnique({ where: { id }, select: { id: true, title: true } });
  if (!m) throw notFound("Reunião");
  await ctx.db.meeting.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "meeting.deleted", { entityType: "meeting", entityId: id, metadata: { title: m.title } });
  return { id };
}

export async function saveTranscript(ctx: Ctx, meetingId: string, transcript: string) {
  const m = await ctx.db.meeting.count({ where: { id: meetingId } });
  if (!m) throw notFound("Reunião");
  await ctx.db.meeting.update({ where: { id: meetingId }, data: { transcript } });
  return { id: meetingId };
}

/** Confirmação humana do resultado da IA: grava resumo/decisões e cria apenas as tarefas marcadas. */
export async function confirmMeetingOutcome(ctx: Ctx, input: z.output<typeof confirmMeetingTasksSchema>) {
  const meeting = await ctx.db.meeting.findUnique({ where: { id: input.meetingId } });
  if (!meeting) throw notFound("Reunião");
  const selected = input.tasks.filter((t) => t.include);
  const created: string[] = [];
  for (const t of selected) {
    const r = await createTask(
      ctx,
      {
        title: t.title,
        description: `Ação definida na reunião “${meeting.title}”.`,
        projectId: meeting.projectId,
        clientId: meeting.clientId,
        opportunityId: meeting.opportunityId,
        parentId: null,
        assigneeId: t.assigneeId ?? null,
        priority: "AUTO",
        status: "TODO",
        dueDate: t.dueDate ?? null,
        estimateHours: null,
        blocksProject: false,
        tags: [],
      },
      { source: "MEETING" },
    );
    created.push(r.id);
  }
  await ctx.db.meeting.update({
    where: { id: meeting.id },
    data: {
      aiSummary: { summary: input.summary ?? null, topics: input.topics, decisions: input.decisions, confirmedAt: new Date().toISOString(), confirmedBy: ctx.user.id },
      minutes: meeting.minutes ?? input.summary ?? null,
      decisions: meeting.decisions ?? (input.decisions.length ? input.decisions.map((d) => `• ${d}`).join("\n") : null),
      nextActions: selected.length ? selected.map((t) => `• ${t.title}${t.dueDate ? ` (até ${parseDateOnly(t.dueDate)?.toLocaleDateString("pt-BR", { timeZone: "UTC" })})` : ""}`).join("\n") : meeting.nextActions,
    },
  });
  await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
    action: "meeting.summarized",
    title: `Resumo da reunião “${meeting.title}” confirmado (${created.length} tarefa(s) criada(s))`,
    entityType: "meeting",
    entityId: meeting.id,
    clientId: meeting.clientId,
    opportunityId: meeting.opportunityId,
    projectId: meeting.projectId,
  });
  return { tasks: created.length };
}

export async function listMeetings(ctx: Ctx, params: ListParams) {
  const where: Prisma.MeetingWhereInput = {};
  if (params.q) where.title = { contains: params.q, mode: "insensitive" };
  const when = params.get("when") ?? "upcoming";
  const now = new Date();
  if (when === "upcoming") where.startsAt = { gte: new Date(now.getTime() - 2 * 3_600_000) };
  if (when === "past") where.startsAt = { lt: now };
  const status = params.get("status");
  if (status) where.status = status as Prisma.EnumMeetingStatusFilter["equals"];
  const client = params.get("client");
  if (client) where.clientId = client;
  if (params.get("mine") === "1") where.participants = { some: { userId: ctx.user.id } };
  const [rows, total] = await Promise.all([
    ctx.db.meeting.findMany({
      where,
      orderBy: { startsAt: when === "upcoming" ? "asc" : "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: { client: { select: { id: true, name: true } }, participants: { include: { user: { select: { name: true } }, contact: { select: { name: true } } } } },
    }),
    ctx.db.meeting.count({ where }),
  ]);
  return { rows, total };
}

export async function getMeetingDetail(ctx: Ctx, id: string) {
  return ctx.db.meeting.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      opportunity: { select: { id: true, title: true } },
      project: { select: { id: true, name: true } },
      participants: { include: { user: { select: { id: true, name: true } }, contact: { select: { id: true, name: true, jobTitle: true } } } },
      documents: { where: { deletedAt: null } },
    },
  });
}

export function upcomingWindow() {
  return { from: new Date(), to: new Date(Date.now() + 7 * DAY_MS) };
}
