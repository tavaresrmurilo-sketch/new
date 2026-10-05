import "server-only";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { DAY_MS, daysSince, parseDateOnly } from "@/lib/dates";
import type { ListParams } from "@/lib/list-params";
import type { convertLeadSchema, leadSchema } from "@/features/leads/schemas";
import { logActivity } from "@/server/activity";
import { audit } from "@/server/audit";
import type { Ctx } from "@/server/auth/context";
import { assertMember, assertOwned } from "@/server/db/ownership";
import { AppError, notFound } from "@/server/errors";
import { emitEvent } from "@/server/events/bus";
import { nextBestActionForLead } from "@/server/intelligence/next-best-action";
import { findDuplicates } from "@/server/modules/duplicates";
import { createOpportunity } from "@/server/modules/opportunities";
import { entityIdsWithTag, setTags, tagsFor } from "@/server/modules/tags";
import { scopeOf } from "@/server/scope";
import { emailDomain } from "@/server/security/sanitize";
import { toNumber } from "@/lib/utils";

type LeadData = z.output<typeof leadSchema>;

function leadPayload(lead: { id: string; name: string; companyName: string | null; email: string | null; source: string; status: string; ownerId: string | null; potentialValue: Prisma.Decimal | null }) {
  return {
    entityType: "lead" as const,
    entityId: lead.id,
    label: lead.companyName ? `${lead.name} (${lead.companyName})` : lead.name,
    link: `/app/leads/${lead.id}`,
    ownerId: lead.ownerId,
    fields: { source: lead.source, status: lead.status, potentialValue: lead.potentialValue ? toNumber(lead.potentialValue) : null },
  };
}

function publicLead(lead: { id: string; name: string; companyName: string | null; email: string | null; phone: string | null; source: string; status: string; potentialValue: Prisma.Decimal | null; createdAt: Date }) {
  return {
    id: lead.id,
    name: lead.name,
    companyName: lead.companyName,
    email: lead.email,
    phone: lead.phone,
    source: lead.source,
    status: lead.status,
    potentialValue: lead.potentialValue ? toNumber(lead.potentialValue) : null,
    createdAt: lead.createdAt.toISOString(),
  };
}

export async function createLead(ctx: Ctx, data: LeadData) {
  await assertMember(ctx, data.ownerId);
  const { tags, ...columns } = data;
  const duplicates = await findDuplicates(ctx, { name: data.companyName ?? data.name, email: data.email, phone: data.phone ?? data.whatsapp, domain: emailDomain(data.email) }, { includeLeads: true });
  const lead = await ctx.db.lead.create({ data: { ...columns, organizationId: ctx.org.id, ownerId: data.ownerId ?? ctx.user.id, createdById: ctx.user.id } });
  if (tags.length) await setTags(ctx.db, ctx.org.id, "lead", lead.id, tags);
  await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
    action: "lead.created",
    title: `Lead ${lead.name} criado`,
    entityType: "lead",
    entityId: lead.id,
    leadId: lead.id,
  });
  await emitEvent(scopeOf(ctx), "lead.created", leadPayload(lead), publicLead(lead));
  return { id: lead.id, duplicates };
}

export async function updateLead(ctx: Ctx, id: string, data: LeadData) {
  const before = await ctx.db.lead.findUnique({ where: { id } });
  if (!before) throw notFound("Lead");
  if (before.status === "CONVERTED") throw new AppError("VALIDATION", "Leads convertidos não podem ser editados.");
  await assertMember(ctx, data.ownerId);
  const { tags, ...columns } = data;
  const lead = await ctx.db.lead.update({ where: { id }, data: columns });
  await setTags(ctx.db, ctx.org.id, "lead", id, tags);
  if (before.status !== lead.status) {
    await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
      action: "lead.status_changed",
      title: `Status do lead alterado`,
      entityType: "lead",
      entityId: id,
      leadId: id,
      metadata: { from: before.status, to: lead.status },
    });
  }
  await emitEvent(scopeOf(ctx), "lead.updated", leadPayload(lead), publicLead(lead));
  return { id };
}

export async function deleteLead(ctx: Ctx, id: string) {
  const lead = await ctx.db.lead.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!lead) throw notFound("Lead");
  await ctx.db.lead.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "lead.deleted", { entityType: "lead", entityId: id, metadata: { name: lead.name } });
  return { id };
}

/** Converte um lead em cliente (+ contato) e, opcionalmente, em oportunidade no pipeline. */
export async function convertLead(ctx: Ctx, input: z.output<typeof convertLeadSchema>) {
  const lead = await ctx.db.lead.findUnique({ where: { id: input.leadId } });
  if (!lead) throw notFound("Lead");
  if (lead.status === "CONVERTED") throw new AppError("CONFLICT", "Este lead já foi convertido.");
  let clientId: string;
  if (input.clientMode === "existing") {
    await assertOwned(ctx, "client", input.existingClientId);
    clientId = input.existingClientId!;
  } else {
    const name = input.clientName ?? lead.companyName ?? lead.name;
    const client = await ctx.db.client.create({
      data: {
        organizationId: ctx.org.id,
        name,
        kind: lead.companyName ? "COMPANY" : "INDIVIDUAL",
        email: lead.companyName ? null : lead.email,
        phone: lead.companyName ? null : lead.phone,
        domain: emailDomain(lead.email),
        status: "PROSPECT",
        source: lead.source,
        ownerId: lead.ownerId ?? ctx.user.id,
        lastInteractionAt: lead.lastContactAt,
        createdById: ctx.user.id,
      },
    });
    clientId = client.id;
    await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
      action: "client.created",
      title: `Cliente ${client.name} criado a partir do lead`,
      entityType: "client",
      entityId: client.id,
      clientId: client.id,
      leadId: lead.id,
    });
  }
  const contact = await ctx.db.contact.create({
    data: {
      organizationId: ctx.org.id,
      clientId,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      whatsapp: lead.whatsapp,
      jobTitle: lead.jobTitle,
      isPrimary: input.clientMode === "new",
      createdById: ctx.user.id,
    },
  });
  // histórico do lead passa a aparecer na timeline do cliente
  await ctx.db.activity.updateMany({ where: { leadId: lead.id, clientId: null }, data: { clientId } });

  let opportunityId: string | null = null;
  if (input.createOpportunity) {
    const pipeline = await ctx.db.pipeline.findFirst({ where: { isDefault: true }, include: { stages: { orderBy: { order: "asc" } } } });
    const stageId = input.stageId ?? pipeline?.stages.find((s) => s.kind === "OPEN")?.id;
    if (!stageId) throw new AppError("VALIDATION", "Configure uma etapa de pipeline antes de converter.");
    const opp = await createOpportunity(ctx, {
      title: input.opportunityTitle ?? `${lead.companyName ?? lead.name} — nova oportunidade`,
      clientId,
      contactId: contact.id,
      stageId,
      value: input.value ?? toNumber(lead.potentialValue),
      probability: null,
      expectedCloseDate: input.expectedCloseDate,
      ownerId: lead.ownerId,
      source: lead.source,
      description: lead.notes,
      nextStep: null,
      nextStepDate: null,
      competitors: [],
      tags: [],
    }, { leadId: lead.id });
    opportunityId = opp.id;
  }
  await ctx.db.lead.update({
    where: { id: lead.id },
    data: { status: "CONVERTED", convertedAt: new Date(), convertedClientId: clientId, convertedOpportunityId: opportunityId },
  });
  await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
    action: "lead.converted",
    title: `Lead ${lead.name} convertido`,
    entityType: "lead",
    entityId: lead.id,
    leadId: lead.id,
    clientId,
    opportunityId,
  });
  return { clientId, opportunityId };
}

export async function listLeads(ctx: Ctx, params: ListParams) {
  const where: Prisma.LeadWhereInput = {};
  if (params.q) {
    where.OR = [
      { name: { contains: params.q, mode: "insensitive" } },
      { companyName: { contains: params.q, mode: "insensitive" } },
      { email: { contains: params.q, mode: "insensitive" } },
    ];
  }
  const status = params.get("status");
  if (status) where.status = status as Prisma.EnumLeadStatusFilter["equals"];
  else where.status = { not: "CONVERTED" };
  const source = params.get("source");
  if (source) where.source = source as Prisma.EnumAcquisitionSourceFilter["equals"];
  const owner = params.get("owner");
  if (owner) where.ownerId = owner === "me" ? ctx.user.id : owner;
  const tag = params.get("tag");
  if (tag) where.id = { in: await entityIdsWithTag(ctx.db, "lead", tag) };
  if (params.get("uncontacted") === "1") where.lastContactAt = null;
  const orderBy: Prisma.LeadOrderByWithRelationInput =
    params.sort === "name" ? { name: params.dir } : params.sort === "potentialValue" ? { potentialValue: { sort: params.dir, nulls: "last" } } : params.sort === "lastContactAt" ? { lastContactAt: { sort: params.dir, nulls: "first" } } : { createdAt: params.dir };
  const [rows, total] = await Promise.all([
    ctx.db.lead.findMany({ where, orderBy, skip: (params.page - 1) * params.pageSize, take: params.pageSize, include: { owner: { select: { id: true, name: true } } } }),
    ctx.db.lead.count({ where }),
  ]);
  const tags = await tagsFor(ctx.db, "lead", rows.map((r) => r.id));
  const now = new Date();
  return {
    rows: rows.map((r) => ({
      ...r,
      tags: tags.get(r.id) ?? [],
      recommendation: nextBestActionForLead({
        status: r.status,
        daysSinceCreated: Math.floor((now.getTime() - r.createdAt.getTime()) / DAY_MS),
        daysSinceContact: daysSince(r.lastContactAt, now),
      })[0] ?? null,
    })),
    total,
  };
}

export function leadExpectedClose(value: string | null) {
  return parseDateOnly(value);
}
