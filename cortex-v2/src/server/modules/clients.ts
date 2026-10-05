import "server-only";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { addDaysToKey, dayKeyInTz, daysSince, diffKeys, DAY_MS, dateOnlyKey, keyToDate, parseLocalDateTime } from "@/lib/dates";
import type { ListParams } from "@/lib/list-params";
import { CHANNEL_LABELS } from "@/lib/labels";
import { toNumber } from "@/lib/utils";
import type { clientSchema, contactSchema, interactionSchema } from "@/features/clients/schemas";
import { logActivity } from "@/server/activity";
import { audit } from "@/server/audit";
import type { Ctx } from "@/server/auth/context";
import { assertMember, assertOwned } from "@/server/db/ownership";
import { AppError, notFound } from "@/server/errors";
import { emitEvent } from "@/server/events/bus";
import { clientHealth, type HealthResult } from "@/server/intelligence/client-health";
import { nextBestActionForClient } from "@/server/intelligence/next-best-action";
import { findDuplicates, recordDuplicateDecisions } from "@/server/modules/duplicates";
import { entityIdsWithTag, setTags, tagsFor } from "@/server/modules/tags";
import { scopeOf } from "@/server/scope";
import { domainFromWebsite, emailDomain, onlyDigits } from "@/server/security/sanitize";

type ClientData = z.output<typeof clientSchema>;

function clientColumns(data: ClientData) {
  return {
    name: data.name,
    kind: data.kind,
    legalName: data.legalName,
    document: onlyDigits(data.document),
    email: data.email,
    phone: data.phone,
    website: data.website,
    domain: domainFromWebsite(data.website) ?? emailDomain(data.email),
    industry: data.industry,
    city: data.city,
    state: data.state,
    status: data.status,
    isKeyAccount: data.isKeyAccount,
    source: data.source,
    ownerId: data.ownerId,
    notes: data.notes,
  };
}

export async function createClient(ctx: Ctx, data: ClientData) {
  await assertMember(ctx, data.ownerId);
  const columns = clientColumns(data);
  const duplicates = await findDuplicates(ctx, columns);
  const client = await ctx.db.client.create({
    data: { ...columns, organizationId: ctx.org.id, ownerId: data.ownerId ?? ctx.user.id, createdById: ctx.user.id },
  });
  if (data.tags.length) await setTags(ctx.db, ctx.org.id, "client", client.id, data.tags);
  await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
    action: "client.created",
    title: `Cliente ${client.name} cadastrado`,
    entityType: "client",
    entityId: client.id,
    clientId: client.id,
  });
  await recordDuplicateDecisions(ctx, { entity: "client", id: client.id, name: client.name }, duplicates);
  await emitEvent(scopeOf(ctx), "client.created", {
    entityType: "client",
    entityId: client.id,
    label: client.name,
    link: `/app/clients/${client.id}`,
    ownerId: client.ownerId,
    clientId: client.id,
    fields: { isKeyAccount: String(client.isKeyAccount), source: client.source },
  });
  return { id: client.id, duplicates };
}

export async function updateClient(ctx: Ctx, id: string, data: ClientData) {
  const before = await ctx.db.client.findUnique({ where: { id } });
  if (!before) throw notFound("Cliente");
  await assertMember(ctx, data.ownerId);
  const columns = clientColumns(data);
  await ctx.db.client.update({ where: { id }, data: columns });
  await setTags(ctx.db, ctx.org.id, "client", id, data.tags);
  const changed = (Object.keys(columns) as (keyof typeof columns)[]).filter((k) => String(before[k] ?? "") !== String(columns[k] ?? ""));
  if (changed.length) {
    await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
      action: before.status !== columns.status ? "client.status_changed" : "client.updated",
      title: before.status !== columns.status ? `Status do cliente alterado para ${columns.status}` : `Dados do cliente atualizados`,
      entityType: "client",
      entityId: id,
      clientId: id,
      metadata: { fields: changed },
    });
  }
  return { id };
}

export async function deleteClient(ctx: Ctx, id: string) {
  const client = await ctx.db.client.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!client) throw notFound("Cliente");
  await ctx.db.client.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "client.deleted", { entityType: "client", entityId: id, metadata: { name: client.name } });
  return { id };
}

/** Mescla `mergeId` em `keepId` (somente após confirmação explícita do usuário). */
export async function mergeClients(ctx: Ctx, keepId: string, mergeId: string) {
  if (keepId === mergeId) throw new AppError("VALIDATION", "Selecione clientes diferentes.");
  const [keep, merge] = await Promise.all([ctx.db.client.findUnique({ where: { id: keepId } }), ctx.db.client.findUnique({ where: { id: mergeId } })]);
  if (!keep || !merge) throw notFound("Cliente");
  await ctx.db.$transaction(async (tx) => {
    const move = { where: { clientId: mergeId }, data: { clientId: keepId } };
    await tx.contact.updateMany(move);
    await tx.opportunity.updateMany(move);
    await tx.project.updateMany(move);
    await tx.task.updateMany(move);
    await tx.meeting.updateMany(move);
    await tx.proposal.updateMany(move);
    await tx.contract.updateMany(move);
    await tx.document.updateMany(move);
    await tx.receivable.updateMany(move);
    await tx.memoryFact.updateMany(move);
    await tx.activity.updateMany(move);
    await tx.portalAccess.updateMany(move);
    const fill: Prisma.ClientUpdateInput = {};
    for (const key of ["legalName", "document", "email", "phone", "website", "domain", "industry", "city", "state", "notes"] as const) {
      if (!keep[key] && merge[key]) (fill as Record<string, unknown>)[key] = merge[key];
    }
    if (merge.lastInteractionAt && (!keep.lastInteractionAt || merge.lastInteractionAt > keep.lastInteractionAt)) fill.lastInteractionAt = merge.lastInteractionAt;
    if (merge.isKeyAccount) fill.isKeyAccount = true;
    await tx.client.update({ where: { id: keepId }, data: fill });
    await tx.client.update({ where: { id: mergeId }, data: { deletedAt: new Date(), notes: `${merge.notes ?? ""}\n[Mesclado em ${keep.name}]`.trim() } });
  });
  const mergeTags = await tagsFor(ctx.db, "client", [keepId, mergeId]);
  const names = [...new Set([...(mergeTags.get(keepId) ?? []), ...(mergeTags.get(mergeId) ?? [])].map((t) => t.name))];
  await setTags(ctx.db, ctx.org.id, "client", keepId, names);
  await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
    action: "client.merged",
    title: `Cliente ${merge.name} mesclado em ${keep.name}`,
    entityType: "client",
    entityId: keepId,
    clientId: keepId,
  });
  await audit(ctx, "client.merged", { entityType: "client", entityId: keepId, metadata: { mergedId: mergeId, mergedName: merge.name } });
  return { id: keepId };
}

const CONTACT_CHANNELS = new Set(["CALL", "EMAIL", "WHATSAPP", "MEETING", "VISIT"]);

/** Registra uma interação e atualiza "último contato" do cliente/lead e "última atividade" da oportunidade. */
export async function logInteraction(ctx: Ctx, input: z.output<typeof interactionSchema>) {
  await Promise.all([
    assertOwned(ctx, "client", input.clientId),
    assertOwned(ctx, "lead", input.leadId),
    assertOwned(ctx, "opportunity", input.opportunityId),
    assertOwned(ctx, "project", input.projectId),
  ]);
  let clientId = input.clientId;
  if (!clientId && input.opportunityId) {
    clientId = (await ctx.db.opportunity.findUnique({ where: { id: input.opportunityId }, select: { clientId: true } }))?.clientId ?? null;
  }
  if (!clientId && input.projectId) {
    clientId = (await ctx.db.project.findUnique({ where: { id: input.projectId }, select: { clientId: true } }))?.clientId ?? null;
  }
  const occurredAt = parseLocalDateTime(input.occurredAt, ctx.org.timezone) ?? new Date();
  if (occurredAt.getTime() > Date.now() + 5 * 60_000) throw new AppError("VALIDATION", "A data da interação não pode estar no futuro.");
  const isInteraction = CONTACT_CHANNELS.has(input.channel);
  const activity = await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
    action: input.channel === "ISSUE" ? "issue.logged" : input.channel === "NOTE" ? "note.added" : "interaction.logged",
    title: `${CHANNEL_LABELS[input.channel]} registrada`,
    body: input.body,
    channel: input.channel,
    isInteraction,
    entityType: input.opportunityId ? "opportunity" : input.leadId ? "lead" : input.projectId ? "project" : "client",
    entityId: (input.opportunityId ?? input.leadId ?? input.projectId ?? clientId)!,
    clientId,
    leadId: input.leadId,
    opportunityId: input.opportunityId,
    projectId: input.projectId,
    occurredAt,
  });
  if (isInteraction && clientId) {
    await ctx.db.client.updateMany({
      where: { id: clientId, OR: [{ lastInteractionAt: null }, { lastInteractionAt: { lt: occurredAt } }] },
      data: { lastInteractionAt: occurredAt },
    });
  }
  if (isInteraction && input.leadId) {
    await ctx.db.lead.updateMany({ where: { id: input.leadId, OR: [{ lastContactAt: null }, { lastContactAt: { lt: occurredAt } }] }, data: { lastContactAt: occurredAt } });
    await ctx.db.lead.updateMany({ where: { id: input.leadId, status: "NEW" }, data: { status: "CONTACTED" } });
  }
  if (input.opportunityId) {
    await ctx.db.opportunity.updateMany({ where: { id: input.opportunityId, lastActivityAt: { lt: occurredAt } }, data: { lastActivityAt: occurredAt } });
  } else if (clientId && isInteraction) {
    await ctx.db.opportunity.updateMany({ where: { clientId, status: "OPEN", lastActivityAt: { lt: occurredAt } }, data: { lastActivityAt: occurredAt } });
  }
  return { id: activity.id };
}

// ───────────── Contatos ─────────────

type ContactData = z.output<typeof contactSchema>;

async function validateContact(ctx: Ctx, data: ContactData, selfId?: string) {
  await assertOwned(ctx, "client", data.clientId);
  if (data.reportsToId) {
    if (data.reportsToId === selfId) throw new AppError("VALIDATION", "Um contato não pode reportar a si mesmo.", { reportsToId: ["Escolha outro contato"] });
    const manager = await ctx.db.contact.findUnique({ where: { id: data.reportsToId }, select: { clientId: true } });
    if (!manager || manager.clientId !== data.clientId) throw new AppError("VALIDATION", "O superior deve ser do mesmo cliente.", { reportsToId: ["Contato inválido"] });
    // evita ciclos na hierarquia
    let cursor: string | null = data.reportsToId;
    for (let i = 0; cursor && i < 20; i++) {
      if (cursor === selfId) throw new AppError("VALIDATION", "Essa hierarquia criaria um ciclo.", { reportsToId: ["Hierarquia circular"] });
      cursor = (await ctx.db.contact.findUnique({ where: { id: cursor }, select: { reportsToId: true } }))?.reportsToId ?? null;
    }
  }
}

export async function createContact(ctx: Ctx, data: ContactData) {
  await validateContact(ctx, data);
  const contact = await ctx.db.contact.create({ data: { ...data, organizationId: ctx.org.id, createdById: ctx.user.id } });
  if (data.clientId) {
    await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
      action: "contact.created",
      title: `Contato ${contact.name} adicionado`,
      entityType: "contact",
      entityId: contact.id,
      clientId: data.clientId,
    });
  }
  return { id: contact.id };
}

export async function updateContact(ctx: Ctx, id: string, data: ContactData) {
  const exists = await ctx.db.contact.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw notFound("Contato");
  await validateContact(ctx, data, id);
  await ctx.db.contact.update({ where: { id }, data });
  return { id };
}

export async function deleteContact(ctx: Ctx, id: string) {
  const c = await ctx.db.contact.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!c) throw notFound("Contato");
  await ctx.db.$transaction([
    ctx.db.contact.updateMany({ where: { reportsToId: id }, data: { reportsToId: null } }),
    ctx.db.contact.update({ where: { id }, data: { deletedAt: new Date(), reportsToId: null } }),
  ]);
  await audit(ctx, "contact.deleted", { entityType: "contact", entityId: id, metadata: { name: c.name } });
  return { id };
}

// ───────────── Saúde (lote) e consultas ─────────────

/** Calcula a saúde do relacionamento para vários clientes com consultas agregadas (sem N+1). */
export async function clientHealthBatch(
  ctx: Ctx,
  clients: { id: string; status: "PROSPECT" | "ACTIVE" | "INACTIVE" | "CHURNED"; lastInteractionAt: Date | null }[],
): Promise<Map<string, HealthResult & { contractExpiringDays: number | null; overdueTasks: number; atRiskProjects: number }>> {
  const ids = clients.map((c) => c.id);
  const out = new Map<string, HealthResult & { contractExpiringDays: number | null; overdueTasks: number; atRiskProjects: number }>();
  if (!ids.length) return out;
  const now = new Date();
  const todayKey = dayKeyInTz(now, ctx.org.timezone);
  const today = keyToDate(todayKey);
  const [interactions, issues, projects, overdue, contracts, won] = await Promise.all([
    ctx.db.activity.groupBy({ by: ["clientId"], where: { clientId: { in: ids }, isInteraction: true, occurredAt: { gte: new Date(now.getTime() - 90 * DAY_MS) } }, _count: { _all: true } }),
    ctx.db.activity.groupBy({ by: ["clientId"], where: { clientId: { in: ids }, channel: "ISSUE", occurredAt: { gte: new Date(now.getTime() - 60 * DAY_MS) } }, _count: { _all: true } }),
    ctx.db.project.findMany({ where: { clientId: { in: ids }, status: { in: ["ACTIVE", "DELAYED", "PLANNING", "PAUSED"] } }, select: { clientId: true, status: true, dueDate: true } }),
    ctx.db.task.groupBy({ by: ["clientId"], where: { clientId: { in: ids }, status: { notIn: ["DONE", "CANCELED"] }, dueDate: { lt: new Date(today.getTime() - 12 * 3_600_000) } }, _count: { _all: true } }),
    ctx.db.contract.groupBy({ by: ["clientId"], where: { clientId: { in: ids }, status: "ACTIVE", endDate: { gte: today } }, _min: { endDate: true } }),
    ctx.db.opportunity.groupBy({ by: ["clientId"], where: { clientId: { in: ids }, status: "WON", wonAt: { gte: new Date(now.getTime() - 90 * DAY_MS) } }, _count: { _all: true } }),
  ]);
  const count = (rows: { clientId: string | null; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.clientId, r._count._all]));
  const inter = count(interactions);
  const iss = count(issues);
  const ovd = count(overdue);
  const wn = new Map(won.map((r) => [r.clientId, r._count._all]));
  const contractMin = new Map(contracts.map((r) => [r.clientId, r._min.endDate]));
  for (const c of clients) {
    const ps = projects.filter((p) => p.clientId === c.id);
    const atRisk = ps.filter((p) => p.status === "DELAYED" || (p.dueDate && dateOnlyKey(p.dueDate) < todayKey)).length;
    const end = contractMin.get(c.id);
    const contractExpiringDays = end ? diffKeys(todayKey, dateOnlyKey(end)) : null;
    const health = clientHealth({
      status: c.status,
      daysSinceInteraction: daysSince(c.lastInteractionAt, now),
      interactions90d: inter.get(c.id) ?? 0,
      activeProjects: ps.filter((p) => p.status === "ACTIVE" || p.status === "DELAYED").length,
      overdueTasks: ovd.get(c.id) ?? 0,
      atRiskProjects: atRisk,
      issues60d: iss.get(c.id) ?? 0,
      contractExpiringDays,
      wonLast90d: wn.get(c.id) ?? 0,
    });
    out.set(c.id, { ...health, contractExpiringDays, overdueTasks: ovd.get(c.id) ?? 0, atRiskProjects: atRisk });
  }
  return out;
}

export async function listClients(ctx: Ctx, params: ListParams) {
  const where: Prisma.ClientWhereInput = {};
  if (params.q) {
    const digits = params.q.replace(/\D/g, "");
    where.OR = [
      { name: { contains: params.q, mode: "insensitive" } },
      { legalName: { contains: params.q, mode: "insensitive" } },
      { email: { contains: params.q, mode: "insensitive" } },
      ...(digits.length >= 5 ? [{ document: { contains: digits } }] : []),
    ];
  }
  const status = params.get("status");
  if (status) where.status = status as Prisma.EnumClientStatusFilter["equals"];
  const owner = params.get("owner");
  if (owner) where.ownerId = owner === "me" ? ctx.user.id : owner;
  const industry = params.get("industry");
  if (industry) where.industry = industry;
  if (params.get("key") === "1") where.isKeyAccount = true;
  const tag = params.get("tag");
  if (tag) where.id = { in: await entityIdsWithTag(ctx.db, "client", tag) };
  const inactive = Number(params.get("inactive"));
  if (inactive > 0) {
    const cutoff = new Date(Date.now() - inactive * DAY_MS);
    where.AND = [{ OR: [{ lastInteractionAt: null }, { lastInteractionAt: { lt: cutoff } }] }];
  }
  const orderBy: Prisma.ClientOrderByWithRelationInput =
    params.sort === "name" ? { name: params.dir } : params.sort === "lastInteractionAt" ? { lastInteractionAt: { sort: params.dir, nulls: "last" } } : { createdAt: params.dir };
  const [rows, total] = await Promise.all([
    ctx.db.client.findMany({
      where,
      orderBy,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: { owner: { select: { id: true, name: true } }, _count: { select: { opportunities: { where: { status: "OPEN", deletedAt: null } }, projects: { where: { deletedAt: null, status: { in: ["ACTIVE", "DELAYED"] } } } } } },
    }),
    ctx.db.client.count({ where }),
  ]);
  const [health, tags] = await Promise.all([clientHealthBatch(ctx, rows), tagsFor(ctx.db, "client", rows.map((r) => r.id))]);
  return { rows: rows.map((r) => ({ ...r, health: health.get(r.id)!, tags: tags.get(r.id) ?? [] })), total };
}

export async function getClient360(ctx: Ctx, id: string) {
  const client = await ctx.db.client.findUnique({ where: { id }, include: { owner: { select: { id: true, name: true } } } });
  if (!client) return null;
  const now = new Date();
  const todayKey = dayKeyInTz(now, ctx.org.timezone);
  const notDeleted = { deletedAt: null };
  const [contacts, opportunities, projects, proposals, contracts, documents, meetings, tasks, memory, activities, receivables, tags, health] = await Promise.all([
    ctx.db.contact.findMany({ where: { clientId: id }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }] }),
    ctx.db.opportunity.findMany({ where: { clientId: id }, include: { stage: true, owner: { select: { name: true } } }, orderBy: { updatedAt: "desc" } }),
    ctx.db.project.findMany({ where: { clientId: id }, include: { manager: { select: { name: true } }, tasks: { where: notDeleted, select: { status: true } } }, orderBy: { updatedAt: "desc" } }),
    ctx.db.proposal.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, title: true, status: true, total: true, createdAt: true, sentAt: true, validUntil: true } }),
    ctx.db.contract.findMany({ where: { clientId: id }, orderBy: { startDate: "desc" } }),
    ctx.db.document.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
    ctx.db.meeting.findMany({ where: { clientId: id }, orderBy: { startsAt: "desc" }, take: 30 }),
    ctx.db.task.findMany({
      where: { clientId: id, status: { notIn: ["DONE", "CANCELED"] } },
      include: { assignee: { select: { name: true } } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
      take: 50,
    }),
    ctx.db.memoryFact.findMany({ where: { clientId: id }, include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    ctx.db.activity.findMany({ where: { clientId: id }, include: { actor: { select: { name: true } } }, orderBy: { occurredAt: "desc" }, take: 60 }),
    ctx.db.receivable.findMany({ where: { clientId: id }, orderBy: { dueDate: "desc" }, take: 30 }),
    tagsFor(ctx.db, "client", [id]),
    clientHealthBatch(ctx, [client]),
  ]);
  const h = health.get(id)!;
  const wonValue = opportunities.filter((o) => o.status === "WON").reduce((s, o) => s + toNumber(o.value), 0);
  const openPipeline = opportunities.filter((o) => o.status === "OPEN").reduce((s, o) => s + toNumber(o.value), 0);
  const activeContractValue = contracts.filter((c) => c.status === "ACTIVE").reduce((s, c) => s + toNumber(c.value), 0);
  const received = receivables.filter((r) => r.status === "RECEIVED").reduce((s, r) => s + toNumber(r.amount), 0);
  const recommendations = nextBestActionForClient({
    daysSinceInteraction: daysSince(client.lastInteractionAt, now),
    inactiveThreshold: ctx.org.settings.inactiveClientDays,
    contractExpiringDays: h.contractExpiringDays,
    openOpportunities: opportunities.filter((o) => o.status === "OPEN").length,
    overdueTasks: h.overdueTasks,
    atRiskProjects: h.atRiskProjects,
    status: client.status,
  });
  return {
    client,
    tags: tags.get(id) ?? [],
    health: h,
    recommendations,
    contacts,
    opportunities,
    projects,
    proposals,
    contracts,
    documents,
    meetings,
    tasks,
    memory,
    activities,
    receivables,
    kpis: { wonValue, openPipeline, activeContractValue, received, openTasks: tasks.length, overdueTasks: tasks.filter((t) => t.dueDate && dateOnlyKey(t.dueDate) < todayKey).length },
    todayKey,
    upcomingRenewalKey: h.contractExpiringDays !== null ? addDaysToKey(todayKey, h.contractExpiringDays) : null,
  };
}
