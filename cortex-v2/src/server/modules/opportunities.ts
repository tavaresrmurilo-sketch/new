import "server-only";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { DAY_MS, dateOnlyKey, dayKeyInTz, diffKeys, keyToDate, parseDateOnly } from "@/lib/dates";
import { CLOSE_REASON } from "@/lib/labels";
import type { ListParams } from "@/lib/list-params";
import { toNumber } from "@/lib/utils";
import type { moveStageSchema, opportunitySchema } from "@/features/opportunities/schemas";
import { logActivity } from "@/server/activity";
import { audit } from "@/server/audit";
import type { Ctx } from "@/server/auth/context";
import { assertMember, assertOwned } from "@/server/db/ownership";
import { AppError, notFound } from "@/server/errors";
import { emitEvent } from "@/server/events/bus";
import { nextBestActionForOpportunity, type Recommendation } from "@/server/intelligence/next-best-action";
import { scoreOpportunity, type OpportunityScore } from "@/server/intelligence/opportunity-score";
import { notify } from "@/server/modules/notifications";
import { entityIdsWithTag, setTags, tagsFor } from "@/server/modules/tags";
import { scopeOf } from "@/server/scope";

type OppData = z.output<typeof opportunitySchema>;

async function validateRelations(ctx: Ctx, data: OppData) {
  await Promise.all([assertOwned(ctx, "client", data.clientId), assertMember(ctx, data.ownerId)]);
  const stage = await ctx.db.pipelineStage.findUnique({ where: { id: data.stageId } });
  if (!stage) throw new AppError("NOT_FOUND", "Etapa não encontrada neste workspace.");
  if (data.contactId) {
    const contact = await ctx.db.contact.findUnique({ where: { id: data.contactId }, select: { clientId: true } });
    if (!contact || contact.clientId !== data.clientId) throw new AppError("VALIDATION", "O contato deve pertencer ao cliente selecionado.", { contactId: ["Contato inválido"] });
  }
  return stage;
}

function oppPayload(o: { id: string; title: string; value: Prisma.Decimal | number; ownerId: string | null; clientId: string; source: string }, fields: Record<string, string | number | null>) {
  return {
    entityType: "opportunity" as const,
    entityId: o.id,
    label: o.title,
    link: `/app/opportunities/${o.id}`,
    ownerId: o.ownerId,
    clientId: o.clientId,
    opportunityId: o.id,
    fields: { value: toNumber(o.value), source: o.source, ...fields },
  };
}

export async function createOpportunity(ctx: Ctx, data: OppData, extra: { leadId?: string } = {}) {
  const stage = await validateRelations(ctx, data);
  const { tags, ...columns } = data;
  const status = stage.kind === "WON" ? "WON" : stage.kind === "LOST" ? "LOST" : "OPEN";
  const opp = await ctx.db.opportunity.create({
    data: {
      ...columns,
      organizationId: ctx.org.id,
      pipelineId: stage.pipelineId,
      ownerId: data.ownerId ?? ctx.user.id,
      expectedCloseDate: parseDateOnly(data.expectedCloseDate),
      nextStepDate: parseDateOnly(data.nextStepDate),
      status,
      wonAt: status === "WON" ? new Date() : null,
      lostAt: status === "LOST" ? new Date() : null,
      leadId: extra.leadId ?? null,
      createdById: ctx.user.id,
    },
  });
  if (tags.length) await setTags(ctx.db, ctx.org.id, "opportunity", opp.id, tags);
  await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
    action: "opportunity.created",
    title: `Oportunidade “${opp.title}” criada em ${stage.name}`,
    entityType: "opportunity",
    entityId: opp.id,
    opportunityId: opp.id,
    clientId: opp.clientId,
    leadId: extra.leadId ?? null,
  });
  if (opp.ownerId && opp.ownerId !== ctx.user.id) {
    await notify({ organizationId: ctx.org.id, userId: opp.ownerId, type: "opportunity.assigned", title: `Nova oportunidade sob sua responsabilidade: ${opp.title}`, link: `/app/opportunities/${opp.id}`, entityType: "opportunity", entityId: opp.id });
  }
  await emitEvent(scopeOf(ctx), "opportunity.created", oppPayload(opp, { stageName: stage.name }), {
    id: opp.id,
    title: opp.title,
    value: toNumber(opp.value),
    stage: stage.name,
    clientId: opp.clientId,
    expectedCloseDate: data.expectedCloseDate,
  });
  return { id: opp.id };
}

export async function updateOpportunity(ctx: Ctx, id: string, data: OppData) {
  const before = await ctx.db.opportunity.findUnique({ where: { id } });
  if (!before) throw notFound("Oportunidade");
  if (before.stageId !== data.stageId) {
    await moveOpportunityStage(ctx, { id, stageId: data.stageId, closeReason: before.closeReason, closeNotes: before.closeNotes });
  }
  await validateRelations(ctx, data);
  const { tags, stageId: _stageId, ...columns } = data;
  await ctx.db.opportunity.update({
    where: { id },
    data: {
      ...columns,
      expectedCloseDate: parseDateOnly(data.expectedCloseDate),
      nextStepDate: parseDateOnly(data.nextStepDate),
      lastActivityAt: new Date(),
    },
  });
  await setTags(ctx.db, ctx.org.id, "opportunity", id, tags);
  if (toNumber(before.value) !== data.value) {
    await audit(ctx, "opportunity.value_changed", { entityType: "opportunity", entityId: id, metadata: { from: toNumber(before.value), to: data.value } });
  }
  return { id };
}

/** Move a oportunidade no pipeline. Fechamentos (ganho/perdido) exigem motivo — base do Win/Loss Intelligence. */
export async function moveOpportunityStage(ctx: Ctx, input: z.output<typeof moveStageSchema>) {
  const opp = await ctx.db.opportunity.findUnique({ where: { id: input.id }, include: { stage: true } });
  if (!opp) throw notFound("Oportunidade");
  const stage = await ctx.db.pipelineStage.findUnique({ where: { id: input.stageId } });
  if (!stage || stage.pipelineId !== opp.pipelineId) throw new AppError("NOT_FOUND", "Etapa inválida para este pipeline.");
  if (stage.id === opp.stageId) return { id: opp.id, status: opp.status };
  if (stage.kind !== "OPEN" && !input.closeReason) {
    throw new AppError("VALIDATION", stage.kind === "WON" ? "Informe o motivo do ganho." : "Informe o motivo da perda.", { closeReason: ["Obrigatório"] });
  }
  const now = new Date();
  const status = stage.kind === "WON" ? "WON" : stage.kind === "LOST" ? "LOST" : "OPEN";
  const updated = await ctx.db.opportunity.update({
    where: { id: opp.id },
    data: {
      stageId: stage.id,
      status,
      stageChangedAt: now,
      lastActivityAt: now,
      wonAt: status === "WON" ? now : null,
      lostAt: status === "LOST" ? now : null,
      closeReason: status === "OPEN" ? null : input.closeReason ?? null,
      closeNotes: status === "OPEN" ? null : input.closeNotes ?? null,
    },
  });
  const title =
    status === "WON"
      ? `Oportunidade “${opp.title}” ganha (${CLOSE_REASON[input.closeReason!] ?? ""})`
      : status === "LOST"
        ? `Oportunidade “${opp.title}” perdida (${CLOSE_REASON[input.closeReason!] ?? ""})`
        : `${ctx.user.name} moveu “${opp.title}” de ${opp.stage.name} para ${stage.name}`;
  await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
    action: status === "WON" ? "opportunity.won" : status === "LOST" ? "opportunity.lost" : "opportunity.stage_changed",
    title,
    body: input.closeNotes ?? null,
    entityType: "opportunity",
    entityId: opp.id,
    opportunityId: opp.id,
    clientId: opp.clientId,
    metadata: { fromStage: opp.stage.name, toStage: stage.name },
  });
  if (status === "WON") {
    await ctx.db.client.updateMany({ where: { id: opp.clientId, status: "PROSPECT" }, data: { status: "ACTIVE" } });
  }
  const scope = scopeOf(ctx);
  const payload = oppPayload(updated, { stageName: stage.name, previousStageName: opp.stage.name, closeReason: input.closeReason ?? null });
  const publicData = { id: opp.id, title: opp.title, value: toNumber(opp.value), fromStage: opp.stage.name, toStage: stage.name, status, closeReason: input.closeReason ?? null };
  await emitEvent(scope, "opportunity.stage_changed", payload, publicData);
  if (status === "WON") await emitEvent(scope, "opportunity.won", payload, publicData);
  if (status === "LOST") await emitEvent(scope, "opportunity.lost", payload, publicData);
  return { id: opp.id, status };
}

export async function deleteOpportunity(ctx: Ctx, id: string) {
  const opp = await ctx.db.opportunity.findUnique({ where: { id }, select: { id: true, title: true, value: true } });
  if (!opp) throw notFound("Oportunidade");
  await ctx.db.opportunity.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "opportunity.deleted", { entityType: "opportunity", entityId: id, metadata: { title: opp.title, value: toNumber(opp.value) } });
  return { id };
}

// ───────────── Score em lote (Radar, Pipeline, Dashboard) ─────────────

export interface ScoredOpportunity extends OpportunityScore {
  recommendations: Recommendation[];
  daysSinceActivity: number;
  daysToClose: number | null;
}

type OppForScore = {
  id: string;
  clientId: string;
  probability: number | null;
  stage: { probability: number; name: string };
  lastActivityAt: Date;
  stageChangedAt: Date;
  expectedCloseDate: Date | null;
  nextStep: string | null;
  nextStepDate: Date | null;
};

export async function scoreOpportunities(ctx: Ctx, opps: OppForScore[]): Promise<Map<string, ScoredOpportunity>> {
  const out = new Map<string, ScoredOpportunity>();
  if (!opps.length) return out;
  const ids = opps.map((o) => o.id);
  const clientIds = [...new Set(opps.map((o) => o.clientId))];
  const now = new Date();
  const todayKey = dayKeyInTz(now, ctx.org.timezone);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const [proposals, contacts, meetings, overdueTasks] = await Promise.all([
    ctx.db.proposal.findMany({
      where: { opportunityId: { in: ids } },
      orderBy: { createdAt: "desc" },
      select: { opportunityId: true, number: true, status: true, sentAt: true, statusChangedAt: true },
    }),
    ctx.db.contact.findMany({ where: { clientId: { in: clientIds } }, select: { clientId: true, decisionRole: true } }),
    ctx.db.meeting.findMany({
      where: { OR: [{ opportunityId: { in: ids } }, { clientId: { in: clientIds } }], status: { not: "CANCELED" }, startsAt: { gte: since30 } },
      select: { opportunityId: true, clientId: true, startsAt: true },
    }),
    ctx.db.task.groupBy({
      by: ["opportunityId"],
      where: { opportunityId: { in: ids }, status: { notIn: ["DONE", "CANCELED"] }, dueDate: { lt: keyToDate(todayKey) } },
      _count: { _all: true },
    }),
  ]);
  const latestProposal = new Map<string, (typeof proposals)[number]>();
  for (const p of proposals) if (p.opportunityId && !latestProposal.has(p.opportunityId)) latestProposal.set(p.opportunityId, p);
  const overdue = new Map(overdueTasks.map((t) => [t.opportunityId, t._count._all]));
  for (const o of opps) {
    const roles = contacts.filter((c) => c.clientId === o.clientId).map((c) => c.decisionRole);
    const related = meetings.filter((m) => m.opportunityId === o.id || (m.clientId === o.clientId && !m.opportunityId));
    const past = related.filter((m) => m.startsAt <= now).length;
    const upcoming = related.some((m) => m.startsAt > now);
    const p = latestProposal.get(o.id);
    const proposal = p
      ? {
          number: p.number,
          status: p.status,
          daysSinceSent: p.sentAt ? Math.floor((now.getTime() - p.sentAt.getTime()) / DAY_MS) : null,
          daysSinceUpdate: Math.floor((now.getTime() - p.statusChangedAt.getTime()) / DAY_MS),
        }
      : null;
    const probability = o.probability ?? o.stage.probability;
    const daysSinceActivity = Math.max(0, Math.floor((now.getTime() - o.lastActivityAt.getTime()) / DAY_MS));
    const daysToClose = o.expectedCloseDate ? diffKeys(todayKey, dateOnlyKey(o.expectedCloseDate)) : null;
    const score = scoreOpportunity({
      probability,
      daysSinceActivity,
      daysInStage: Math.floor((now.getTime() - o.stageChangedAt.getTime()) / DAY_MS),
      daysToClose,
      proposal,
      hasDecisionMaker: roles.includes("DECISION_MAKER"),
      hasChampion: roles.includes("CHAMPION"),
      hasBlocker: roles.includes("BLOCKER"),
      meetingsLast30d: past,
      upcomingMeeting: upcoming,
      overdueTasks: overdue.get(o.id) ?? 0,
    });
    const recommendations = nextBestActionForOpportunity({
      stageName: o.stage.name,
      probability,
      daysSinceActivity,
      daysToClose,
      nextStep: o.nextStep,
      daysToNextStep: o.nextStepDate ? diffKeys(todayKey, dateOnlyKey(o.nextStepDate)) : null,
      proposal,
      hasDecisionMaker: roles.includes("DECISION_MAKER"),
      meetingsLast30d: past,
      upcomingMeeting: upcoming,
      overdueTasks: overdue.get(o.id) ?? 0,
      followUpDays: ctx.org.settings.followUpDays,
    });
    out.set(o.id, { ...score, recommendations, daysSinceActivity, daysToClose });
  }
  return out;
}

const OPP_INCLUDE = {
  stage: { select: { id: true, name: true, probability: true, kind: true, order: true } },
  client: { select: { id: true, name: true, isKeyAccount: true } },
  owner: { select: { id: true, name: true } },
} satisfies Prisma.OpportunityInclude;

export async function listOpportunities(ctx: Ctx, params: ListParams) {
  const where: Prisma.OpportunityWhereInput = {};
  if (params.q) where.OR = [{ title: { contains: params.q, mode: "insensitive" } }, { client: { name: { contains: params.q, mode: "insensitive" } } }];
  const status = params.get("status") ?? "OPEN";
  if (status !== "ALL") where.status = status as Prisma.EnumOpportunityStatusFilter["equals"];
  const stage = params.get("stage");
  if (stage) where.stageId = stage;
  const owner = params.get("owner");
  if (owner) where.ownerId = owner === "me" ? ctx.user.id : owner;
  const client = params.get("client");
  if (client) where.clientId = client;
  const min = Number(params.get("min"));
  if (min > 0) where.value = { gte: min };
  const inactive = Number(params.get("inactive"));
  if (inactive > 0) where.lastActivityAt = { lt: new Date(Date.now() - inactive * DAY_MS) };
  const tag = params.get("tag");
  if (tag) where.id = { in: await entityIdsWithTag(ctx.db, "opportunity", tag) };
  const orderBy: Prisma.OpportunityOrderByWithRelationInput =
    params.sort === "value"
      ? { value: params.dir }
      : params.sort === "expectedCloseDate"
        ? { expectedCloseDate: { sort: params.dir, nulls: "last" } }
        : params.sort === "lastActivityAt"
          ? { lastActivityAt: params.dir }
          : params.sort === "title"
            ? { title: params.dir }
            : { createdAt: params.dir };
  const [rows, total, sum] = await Promise.all([
    ctx.db.opportunity.findMany({ where, orderBy, skip: (params.page - 1) * params.pageSize, take: params.pageSize, include: OPP_INCLUDE }),
    ctx.db.opportunity.count({ where }),
    ctx.db.opportunity.aggregate({ where, _sum: { value: true } }),
  ]);
  const scores = await scoreOpportunities(ctx, rows.filter((r) => r.status === "OPEN"));
  return { rows: rows.map((r) => ({ ...r, scored: scores.get(r.id) ?? null })), total, totalValue: toNumber(sum._sum.value) };
}

/** Dados do Kanban: etapas + oportunidades abertas (fechadas apenas dos últimos 30 dias). */
export async function getPipelineBoard(ctx: Ctx, pipelineId?: string, filters: { ownerId?: string } = {}) {
  const pipelines = await ctx.db.pipeline.findMany({ orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], select: { id: true, name: true, isDefault: true } });
  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0];
  if (!pipeline) return null;
  const stages = await ctx.db.pipelineStage.findMany({ where: { pipelineId: pipeline.id }, orderBy: { order: "asc" } });
  const since = new Date(Date.now() - 30 * DAY_MS);
  const opps = await ctx.db.opportunity.findMany({
    where: {
      pipelineId: pipeline.id,
      ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
      OR: [{ status: "OPEN" }, { status: "WON", wonAt: { gte: since } }, { status: "LOST", lostAt: { gte: since } }],
    },
    include: OPP_INCLUDE,
    orderBy: [{ value: "desc" }],
    take: 1000,
  });
  const scores = await scoreOpportunities(ctx, opps.filter((o) => o.status === "OPEN"));
  const tags = await tagsFor(ctx.db, "opportunity", opps.map((o) => o.id));
  return {
    pipelines,
    pipeline,
    stages,
    opportunities: opps.map((o) => ({
      id: o.id,
      title: o.title,
      value: toNumber(o.value),
      stageId: o.stageId,
      status: o.status,
      probability: o.probability ?? o.stage.probability,
      clientName: o.client.name,
      clientId: o.client.id,
      keyAccount: o.client.isKeyAccount,
      ownerName: o.owner?.name ?? null,
      expectedCloseDate: o.expectedCloseDate ? dateOnlyKey(o.expectedCloseDate) : null,
      lastActivityAt: o.lastActivityAt.toISOString(),
      score: scores.get(o.id)?.score ?? null,
      category: scores.get(o.id)?.category ?? null,
      tags: (tags.get(o.id) ?? []).map((t) => t.name),
    })),
  };
}

export async function getOpportunityDetail(ctx: Ctx, id: string) {
  const opp = await ctx.db.opportunity.findUnique({
    where: { id },
    include: { ...OPP_INCLUDE, contact: true, pipeline: { include: { stages: { orderBy: { order: "asc" } } } } },
  });
  if (!opp) return null;
  const [contacts, proposals, tasks, meetings, documents, risks, activities, tags, memory, scores] = await Promise.all([
    ctx.db.contact.findMany({ where: { clientId: opp.clientId }, orderBy: [{ influence: "desc" }, { name: "asc" }] }),
    ctx.db.proposal.findMany({ where: { opportunityId: id }, orderBy: { createdAt: "desc" } }),
    ctx.db.task.findMany({ where: { opportunityId: id }, include: { assignee: { select: { name: true } } }, orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }] }),
    ctx.db.meeting.findMany({ where: { opportunityId: id }, orderBy: { startsAt: "desc" } }),
    ctx.db.document.findMany({ where: { opportunityId: id }, orderBy: { createdAt: "desc" } }),
    ctx.db.risk.findMany({ where: { opportunityId: id }, include: { owner: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    ctx.db.activity.findMany({ where: { opportunityId: id }, include: { actor: { select: { name: true } } }, orderBy: { occurredAt: "desc" }, take: 60 }),
    tagsFor(ctx.db, "opportunity", [id]),
    ctx.db.memoryFact.findMany({ where: { OR: [{ opportunityId: id }, { clientId: opp.clientId }] }, include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 20 }),
    scoreOpportunities(ctx, opp.status === "OPEN" ? [opp] : []),
  ]);
  return { opp, contacts, proposals, tasks, meetings, documents, risks, activities, tags: tags.get(id) ?? [], memory, scored: scores.get(id) ?? null };
}

/** Radar: todas as oportunidades abertas classificadas por score (HOT/WARM/COLD/AT RISK). */
export async function getOpportunityRadar(ctx: Ctx) {
  const opps = await ctx.db.opportunity.findMany({ where: { status: "OPEN" }, include: OPP_INCLUDE, take: 2000, orderBy: { value: "desc" } });
  const scores = await scoreOpportunities(ctx, opps);
  return opps
    .map((o) => ({ ...o, scored: scores.get(o.id)! }))
    .sort((a, b) => b.scored.score - a.scored.score || toNumber(b.value) - toNumber(a.value));
}

export function todayDate(ctx: Ctx) {
  return keyToDate(dayKeyInTz(new Date(), ctx.org.timezone));
}
