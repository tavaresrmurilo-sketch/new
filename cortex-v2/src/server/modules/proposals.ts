import "server-only";
import type { Prisma, ProposalStatus } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/db";
import { addDaysToKey, DAY_MS, dateOnlyKey, dayKeyInTz, parseDateOnly } from "@/lib/dates";
import type { ListParams } from "@/lib/list-params";
import { PROPOSAL_STATUS } from "@/lib/labels";
import { calculateProposal } from "@/lib/proposal-math";
import { toNumber } from "@/lib/utils";
import type { proposalSchema, proposalStatusSchema } from "@/features/proposals/schemas";
import { logActivity } from "@/server/activity";
import { audit } from "@/server/audit";
import { can, type Ctx } from "@/server/auth/context";
import { assertMember, assertOwned } from "@/server/db/ownership";
import { AppError, notFound } from "@/server/errors";
import { emitEvent } from "@/server/events/bus";
import { moveOpportunityStage } from "@/server/modules/opportunities";
import { notify, orgManagers } from "@/server/modules/notifications";
import { scopeOf } from "@/server/scope";
import { randomToken } from "@/server/security/crypto";

type ProposalData = z.output<typeof proposalSchema>;

async function validate(ctx: Ctx, data: ProposalData) {
  await Promise.all([assertOwned(ctx, "client", data.clientId), assertOwned(ctx, "opportunity", data.opportunityId), assertMember(ctx, data.ownerId)]);
  if (data.contactId) {
    const contact = await ctx.db.contact.findUnique({ where: { id: data.contactId }, select: { clientId: true } });
    if (!contact || contact.clientId !== data.clientId) throw new AppError("VALIDATION", "O contato deve pertencer ao cliente.", { contactId: ["Contato inválido"] });
  }
  if (data.opportunityId) {
    const opp = await ctx.db.opportunity.findUnique({ where: { id: data.opportunityId }, select: { clientId: true } });
    if (opp && opp.clientId !== data.clientId) throw new AppError("VALIDATION", "A oportunidade pertence a outro cliente.", { opportunityId: ["Oportunidade inválida"] });
  }
}

function totalsOf(data: ProposalData) {
  return calculateProposal(data.items, { type: data.discountType, value: data.discountValue }, data.taxes);
}

export async function createProposal(ctx: Ctx, data: ProposalData) {
  await validate(ctx, data);
  const t = totalsOf(data);
  const seq = await prisma.organization.update({ where: { id: ctx.org.id }, data: { proposalSeq: { increment: 1 } }, select: { proposalSeq: true } });
  const validUntil = parseDateOnly(data.validUntil) ?? parseDateOnly(addDaysToKey(dayKeyInTz(new Date(), ctx.org.timezone), ctx.org.settings.proposalValidityDays));
  const proposal = await ctx.db.proposal.create({
    data: {
      organizationId: ctx.org.id,
      number: seq.proposalSeq,
      title: data.title,
      clientId: data.clientId,
      opportunityId: data.opportunityId,
      contactId: data.contactId,
      ownerId: data.ownerId ?? ctx.user.id,
      scope: data.scope,
      notes: data.notes,
      validUntil,
      currency: ctx.org.currency,
      discountType: data.discountType,
      discountValue: data.discountValue,
      taxes: data.taxes as Prisma.InputJsonValue,
      subtotal: t.subtotal,
      taxTotal: t.taxTotal,
      total: t.total,
      aiGenerated: data.aiGenerated,
      createdById: ctx.user.id,
      items: {
        create: data.items.map((i, idx) => ({ organizationId: ctx.org.id, description: i.description, unit: i.unit, quantity: i.quantity, unitPrice: i.unitPrice, total: t.lines[idx]!, sortOrder: idx })),
      },
    },
  });
  await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
    action: "proposal.created",
    title: `Proposta #${proposal.number} criada (${proposal.title})`,
    entityType: "proposal",
    entityId: proposal.id,
    clientId: proposal.clientId,
    opportunityId: proposal.opportunityId,
  });
  await emitEvent(scopeOf(ctx), "proposal.created", {
    entityType: "proposal",
    entityId: proposal.id,
    label: `Proposta #${proposal.number}`,
    link: `/app/proposals/${proposal.id}`,
    ownerId: proposal.ownerId,
    clientId: proposal.clientId,
    opportunityId: proposal.opportunityId,
    fields: { total: t.total },
  }, { id: proposal.id, number: proposal.number, title: proposal.title, total: t.total, clientId: proposal.clientId, status: proposal.status });
  return { id: proposal.id };
}

export async function updateProposal(ctx: Ctx, id: string, data: ProposalData) {
  const before = await ctx.db.proposal.findUnique({ where: { id } });
  if (!before) throw notFound("Proposta");
  if (before.status === "ACCEPTED" || before.status === "REJECTED") throw new AppError("VALIDATION", "Propostas aceitas ou recusadas não podem ser editadas. Duplique para criar uma nova versão.");
  await validate(ctx, data);
  const t = totalsOf(data);
  await ctx.db.$transaction(async (tx) => {
    await tx.proposalItem.deleteMany({ where: { proposalId: id } });
    await tx.proposal.update({
      where: { id },
      data: {
        title: data.title,
        clientId: data.clientId,
        opportunityId: data.opportunityId,
        contactId: data.contactId,
        ownerId: data.ownerId,
        scope: data.scope,
        notes: data.notes,
        validUntil: parseDateOnly(data.validUntil),
        discountType: data.discountType,
        discountValue: data.discountValue,
        taxes: data.taxes as Prisma.InputJsonValue,
        subtotal: t.subtotal,
        taxTotal: t.taxTotal,
        total: t.total,
        items: { create: data.items.map((i, idx) => ({ organizationId: ctx.org.id, description: i.description, unit: i.unit, quantity: i.quantity, unitPrice: i.unitPrice, total: t.lines[idx]!, sortOrder: idx })) },
      },
    });
  });
  if (toNumber(before.total) !== t.total) await audit(ctx, "proposal.value_changed", { entityType: "proposal", entityId: id, metadata: { from: toNumber(before.total), to: t.total } });
  return { id };
}

/** Propostas acima do limite de “negócio grande” exigem aprovação de quem tem proposals.approve antes do envio. */
async function needsApproval(ctx: Ctx, total: number) {
  return total >= ctx.org.settings.largeDealThreshold && !can(ctx, "proposals.approve");
}

export async function setProposalStatus(ctx: Ctx, input: z.output<typeof proposalStatusSchema>, opts: { approvedViaDecision?: boolean } = {}) {
  const p = await ctx.db.proposal.findUnique({ where: { id: input.id } });
  if (!p) throw notFound("Proposta");
  if (p.status === input.status) return { id: p.id, status: p.status, pendingApproval: false };
  const now = new Date();
  if (input.status === "SENT" && !opts.approvedViaDecision && (await needsApproval(ctx, toNumber(p.total)))) {
    const managers = await orgManagers(ctx.org.id);
    await ctx.db.decision.upsert({
      where: { organizationId_dedupeKey: { organizationId: ctx.org.id, dedupeKey: `approve-proposal:${p.id}` } },
      create: {
        organizationId: ctx.org.id,
        type: "APPROVE_PROPOSAL",
        title: `Aprovar envio da proposta #${p.number} (${p.title})`,
        description: `Valor acima do limite de aprovação. Solicitado por ${ctx.user.name}.`,
        payload: { proposalId: p.id, total: toNumber(p.total), requestedBy: ctx.user.id },
        entityType: "proposal",
        entityId: p.id,
        source: "USER",
        dedupeKey: `approve-proposal:${p.id}`,
        createdById: ctx.user.id,
      },
      update: { status: "PENDING", resolvedAt: null, resolvedById: null },
    });
    for (const m of managers.filter((u) => u !== ctx.user.id)) {
      await notify({ organizationId: ctx.org.id, userId: m, type: "decision.approval", title: `Aprovação pendente: proposta #${p.number}`, link: "/app/decisions", entityType: "proposal", entityId: p.id, dedupeKey: `approve-proposal:${p.id}:${p.updatedAt.getTime()}` });
    }
    return { id: p.id, status: p.status, pendingApproval: true };
  }
  const data: Prisma.ProposalUpdateInput = { status: input.status, statusChangedAt: now };
  if (input.status === "SENT") {
    data.sentAt = p.sentAt ?? now;
    data.publicToken = p.publicToken ?? randomToken(24);
  }
  if (input.status === "ACCEPTED") data.acceptedAt = now;
  if (input.status === "REJECTED") {
    data.rejectedAt = now;
    data.rejectionReason = input.reason ?? null;
  }
  const updated = await ctx.db.proposal.update({ where: { id: p.id }, data });
  await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
    action: `proposal.${input.status.toLowerCase()}`,
    title: input.status === "SENT" ? `Proposta #${p.number} enviada` : `Proposta #${p.number}: ${PROPOSAL_STATUS[input.status]?.label}`,
    body: input.reason ?? null,
    entityType: "proposal",
    entityId: p.id,
    clientId: p.clientId,
    opportunityId: p.opportunityId,
  });
  if (p.opportunityId) await ctx.db.opportunity.updateMany({ where: { id: p.opportunityId }, data: { lastActivityAt: now } });
  const scope = scopeOf(ctx);
  const payload = { entityType: "proposal" as const, entityId: p.id, label: `Proposta #${p.number}`, link: `/app/proposals/${p.id}`, ownerId: p.ownerId, clientId: p.clientId, opportunityId: p.opportunityId, fields: { total: toNumber(p.total) } };
  const publicData = { id: p.id, number: p.number, title: p.title, total: toNumber(p.total), status: input.status, clientId: p.clientId };
  if (input.status === "SENT") await emitEvent(scope, "proposal.sent", payload, publicData);
  if (input.status === "ACCEPTED") {
    await emitEvent(scope, "proposal.accepted", payload, publicData);
    if (input.markOpportunityWon && p.opportunityId) {
      const opp = await ctx.db.opportunity.findUnique({ where: { id: p.opportunityId }, include: { pipeline: { include: { stages: true } } } });
      const won = opp?.pipeline.stages.find((s) => s.kind === "WON");
      if (opp && won && opp.status === "OPEN") await moveOpportunityStage(ctx, { id: opp.id, stageId: won.id, closeReason: "OTHER", closeNotes: `Proposta #${p.number} aceita.` });
    }
  }
  if (input.status === "REJECTED") await emitEvent(scope, "proposal.rejected", payload, publicData);
  return { id: updated.id, status: updated.status, pendingApproval: false };
}

export async function logProposalFollowUp(ctx: Ctx, id: string, note: string) {
  const p = await ctx.db.proposal.findUnique({ where: { id } });
  if (!p) throw notFound("Proposta");
  const now = new Date();
  await ctx.db.proposal.update({ where: { id }, data: { lastFollowUpAt: now } });
  await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
    action: "interaction.logged",
    title: `Follow-up da proposta #${p.number}`,
    body: note,
    channel: "EMAIL",
    isInteraction: true,
    entityType: "proposal",
    entityId: id,
    clientId: p.clientId,
    opportunityId: p.opportunityId,
  });
  await ctx.db.client.updateMany({ where: { id: p.clientId }, data: { lastInteractionAt: now } });
  if (p.opportunityId) await ctx.db.opportunity.updateMany({ where: { id: p.opportunityId }, data: { lastActivityAt: now } });
  return { id };
}

export async function duplicateProposal(ctx: Ctx, id: string) {
  const p = await ctx.db.proposal.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  if (!p) throw notFound("Proposta");
  return createProposal(ctx, {
    title: `${p.title} (cópia)`,
    clientId: p.clientId,
    opportunityId: p.opportunityId,
    contactId: p.contactId,
    ownerId: p.ownerId,
    scope: p.scope,
    notes: p.notes,
    validUntil: null,
    discountType: p.discountType,
    discountValue: toNumber(p.discountValue),
    taxes: (p.taxes as { name: string; rate: number }[]) ?? [],
    items: p.items.map((i) => ({ description: i.description, unit: i.unit, quantity: toNumber(i.quantity), unitPrice: toNumber(i.unitPrice) })),
    aiGenerated: false,
  });
}

export async function deleteProposal(ctx: Ctx, id: string) {
  const p = await ctx.db.proposal.findUnique({ where: { id }, select: { id: true, number: true, total: true } });
  if (!p) throw notFound("Proposta");
  await ctx.db.proposal.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "proposal.deleted", { entityType: "proposal", entityId: id, metadata: { number: p.number, total: toNumber(p.total) } });
  return { id };
}

export async function listProposals(ctx: Ctx, params: ListParams) {
  const where: Prisma.ProposalWhereInput = {};
  if (params.q) {
    const n = Number(params.q.replace("#", ""));
    where.OR = [{ title: { contains: params.q, mode: "insensitive" } }, { client: { name: { contains: params.q, mode: "insensitive" } } }, ...(Number.isInteger(n) && n > 0 ? [{ number: n }] : [])];
  }
  const status = params.get("status");
  if (status === "OPEN") where.status = { in: ["SENT", "VIEWED", "NEGOTIATION"] };
  else if (status) where.status = status as ProposalStatus;
  const owner = params.get("owner");
  if (owner) where.ownerId = owner === "me" ? ctx.user.id : owner;
  const min = Number(params.get("min"));
  if (min > 0) where.total = { gte: min };
  const client = params.get("client");
  if (client) where.clientId = client;
  const orderBy: Prisma.ProposalOrderByWithRelationInput =
    params.sort === "total" ? { total: params.dir } : params.sort === "number" ? { number: params.dir } : params.sort === "validUntil" ? { validUntil: { sort: params.dir, nulls: "last" } } : { createdAt: params.dir };
  const [rows, total, open] = await Promise.all([
    ctx.db.proposal.findMany({ where, orderBy, skip: (params.page - 1) * params.pageSize, take: params.pageSize, include: { client: { select: { id: true, name: true } }, owner: { select: { name: true } } } }),
    ctx.db.proposal.count({ where }),
    ctx.db.proposal.aggregate({ where: { status: { in: ["SENT", "VIEWED", "NEGOTIATION"] } }, _sum: { total: true }, _count: { _all: true } }),
  ]);
  return { rows, total, awaiting: { count: open._count._all, value: toNumber(open._sum.total) } };
}

export interface ProposalSignal {
  tone: "warning" | "info" | "danger";
  text: string;
}

/** Proposal Intelligence: sinais calculados a partir de datas reais (visualização só aparece com rastreamento ativo). */
export function proposalSignals(p: { status: string; sentAt: Date | null; viewedAt: Date | null; viewCount: number; lastFollowUpAt: Date | null; statusChangedAt: Date; validUntil: Date | null }, todayKey: string, followUpDays: number): ProposalSignal[] {
  const out: ProposalSignal[] = [];
  const now = Date.now();
  const days = (d: Date) => Math.floor((now - d.getTime()) / DAY_MS);
  const open = ["SENT", "VIEWED", "NEGOTIATION"].includes(p.status);
  if (!open) return out;
  const stalled = days(p.statusChangedAt);
  if (stalled >= followUpDays) out.push({ tone: "warning", text: `Esta proposta está parada há ${stalled} dias.` });
  if (p.viewedAt && (!p.lastFollowUpAt || p.lastFollowUpAt < p.viewedAt)) {
    out.push({ tone: "info", text: `O cliente abriu a proposta (${p.viewCount}× ), mas não houve follow-up desde então.` });
  } else if (p.sentAt && !p.lastFollowUpAt && days(p.sentAt) >= 5) {
    out.push({ tone: "warning", text: `Proposta enviada há ${days(p.sentAt)} dias sem follow-up registrado.` });
  }
  if (p.validUntil) {
    const k = dateOnlyKey(p.validUntil);
    if (k < todayKey) out.push({ tone: "danger", text: "A validade desta proposta já expirou." });
    else {
      const left = Math.round((p.validUntil.getTime() - now) / DAY_MS);
      if (left <= 3) out.push({ tone: "warning", text: `A validade expira em ${Math.max(0, left)} dia(s).` });
    }
  }
  return out;
}

export async function getProposalDetail(ctx: Ctx, id: string) {
  return ctx.db.proposal.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      client: { select: { id: true, name: true, legalName: true, document: true, email: true, city: true, state: true } },
      opportunity: { select: { id: true, title: true, status: true } },
      owner: { select: { id: true, name: true, email: true } },
      documents: { where: { deletedAt: null } },
    },
  });
}

/** Visualização pública (link enviado ao cliente): registra a visualização real e notifica o responsável. */
export async function trackPublicView(token: string) {
  const p = await prisma.proposal.findUnique({ where: { publicToken: token } });
  if (!p || p.deletedAt || p.status === "DRAFT") return null;
  const first = !p.viewedAt;
  const updated = await prisma.proposal.update({
    where: { id: p.id },
    data: { viewedAt: p.viewedAt ?? new Date(), viewCount: { increment: 1 }, ...(p.status === "SENT" ? { status: "VIEWED", statusChangedAt: new Date() } : {}) },
  });
  if (first) {
    await prisma.activity.create({
      data: { organizationId: p.organizationId, action: "proposal.viewed", title: `Cliente visualizou a proposta #${p.number}`, entityType: "proposal", entityId: p.id, clientId: p.clientId, opportunityId: p.opportunityId },
    });
    if (p.ownerId) await notify({ organizationId: p.organizationId, userId: p.ownerId, type: "proposal.viewed", title: `O cliente abriu a proposta #${p.number}`, body: "Bom momento para um follow-up.", link: `/app/proposals/${p.id}`, entityType: "proposal", entityId: p.id });
  }
  return updated;
}
