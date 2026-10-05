import "server-only";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { addDaysToKey, dateOnlyKey, dayKeyInTz, keyToDate, parseDateOnly } from "@/lib/dates";
import type { ListParams } from "@/lib/list-params";
import { PROJECT_STATUS } from "@/lib/labels";
import { riskLevel } from "@/lib/risk";
import { toNumber } from "@/lib/utils";
import type { projectSchema, riskSchema } from "@/features/projects/schemas";
import { logActivity } from "@/server/activity";
import { audit } from "@/server/audit";
import type { Ctx } from "@/server/auth/context";
import { assertMember, assertMembers, assertOwned } from "@/server/db/ownership";
import { AppError, notFound } from "@/server/errors";
import { emitEvent } from "@/server/events/bus";
import { projectHealth, type ProjectHealth } from "@/server/intelligence/project-health";
import { computeWorkload } from "@/server/intelligence/workload";
import { notifyMany } from "@/server/modules/notifications";
import { entityIdsWithTag, setTags, tagsFor } from "@/server/modules/tags";
import { scopeOf } from "@/server/scope";

type ProjectData = z.output<typeof projectSchema>;

async function validate(ctx: Ctx, data: ProjectData) {
  await Promise.all([
    assertOwned(ctx, "client", data.clientId),
    assertOwned(ctx, "opportunity", data.opportunityId),
    assertMember(ctx, data.managerId),
    assertMembers(ctx, data.memberIds),
  ]);
}

function columns(data: ProjectData) {
  return {
    name: data.name,
    code: data.code,
    clientId: data.clientId,
    opportunityId: data.opportunityId,
    managerId: data.managerId,
    description: data.description,
    priority: data.priority,
    status: data.status,
    startDate: parseDateOnly(data.startDate),
    dueDate: parseDateOnly(data.dueDate),
    progress: data.progress,
    budget: data.budget,
    actualCost: data.actualCost,
    sharedWithClient: data.sharedWithClient,
  };
}

async function syncMembers(ctx: Ctx, projectId: string, memberIds: string[], managerId: string | null) {
  const ids = [...new Set([...memberIds, ...(managerId ? [managerId] : [])])];
  await ctx.db.projectMember.deleteMany({ where: { projectId, ...(ids.length ? { userId: { notIn: ids } } : {}) } });
  const existing = new Set((await ctx.db.projectMember.findMany({ where: { projectId }, select: { userId: true } })).map((m) => m.userId));
  const added = ids.filter((id) => !existing.has(id));
  if (added.length) await ctx.db.projectMember.createMany({ data: added.map((userId) => ({ organizationId: ctx.org.id, projectId, userId })) });
  return added;
}

export async function createProject(ctx: Ctx, data: ProjectData) {
  await validate(ctx, data);
  const project = await ctx.db.project.create({
    data: { ...columns(data), organizationId: ctx.org.id, managerId: data.managerId ?? ctx.user.id, createdById: ctx.user.id },
  });
  const added = await syncMembers(ctx, project.id, data.memberIds, project.managerId);
  if (data.tags.length) await setTags(ctx.db, ctx.org.id, "project", project.id, data.tags);
  await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
    action: "project.created",
    title: `Projeto “${project.name}” criado`,
    entityType: "project",
    entityId: project.id,
    projectId: project.id,
    clientId: project.clientId,
    opportunityId: project.opportunityId,
  });
  await notifyMany(added.filter((u) => u !== ctx.user.id), {
    organizationId: ctx.org.id,
    type: "project.member_added",
    title: `Você foi adicionado ao projeto ${project.name}`,
    link: `/app/projects/${project.id}`,
    entityType: "project",
    entityId: project.id,
  });
  await emitEvent(scopeOf(ctx), "project.created", {
    entityType: "project",
    entityId: project.id,
    label: project.name,
    link: `/app/projects/${project.id}`,
    ownerId: project.managerId,
    clientId: project.clientId,
    projectId: project.id,
    fields: { priority: project.priority, status: project.status },
  }, { id: project.id, name: project.name, clientId: project.clientId, status: project.status, dueDate: data.dueDate });
  return { id: project.id };
}

export async function updateProject(ctx: Ctx, id: string, data: ProjectData) {
  const before = await ctx.db.project.findUnique({ where: { id } });
  if (!before) throw notFound("Projeto");
  await validate(ctx, data);
  const cols = columns(data);
  const project = await ctx.db.project.update({
    where: { id },
    data: { ...cols, completedAt: data.status === "COMPLETED" ? (before.completedAt ?? new Date()) : null },
  });
  const added = await syncMembers(ctx, id, data.memberIds, project.managerId);
  await setTags(ctx.db, ctx.org.id, "project", id, data.tags);
  await notifyMany(added.filter((u) => u !== ctx.user.id), {
    organizationId: ctx.org.id,
    type: "project.member_added",
    title: `Você foi adicionado ao projeto ${project.name}`,
    link: `/app/projects/${project.id}`,
  });
  if (toNumber(before.budget) !== toNumber(project.budget) || toNumber(before.actualCost) !== toNumber(project.actualCost)) {
    await audit(ctx, "project.financials_changed", {
      entityType: "project",
      entityId: id,
      metadata: { budget: [toNumber(before.budget), toNumber(project.budget)], actualCost: [toNumber(before.actualCost), toNumber(project.actualCost)] },
    });
  }
  if (before.status !== project.status) {
    await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
      action: project.status === "COMPLETED" ? "project.completed" : "project.status_changed",
      title: `Projeto “${project.name}”: ${PROJECT_STATUS[before.status]?.label} → ${PROJECT_STATUS[project.status]?.label}`,
      entityType: "project",
      entityId: id,
      projectId: id,
      clientId: project.clientId,
    });
    await emitEvent(scopeOf(ctx), "project.status_changed", {
      entityType: "project",
      entityId: id,
      label: project.name,
      link: `/app/projects/${id}`,
      ownerId: project.managerId,
      clientId: project.clientId,
      projectId: id,
      fields: { status: project.status, priority: project.priority },
    });
  }
  return { id };
}

export async function deleteProject(ctx: Ctx, id: string) {
  const p = await ctx.db.project.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!p) throw notFound("Projeto");
  await ctx.db.project.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "project.deleted", { entityType: "project", entityId: id, metadata: { name: p.name } });
  return { id };
}

// ───────────── Riscos ─────────────

type RiskData = z.output<typeof riskSchema>;

export async function saveRisk(ctx: Ctx, data: RiskData, id?: string) {
  await Promise.all([assertOwned(ctx, "project", data.projectId), assertOwned(ctx, "opportunity", data.opportunityId), assertMember(ctx, data.ownerId)]);
  if (id) {
    const exists = await ctx.db.risk.count({ where: { id } });
    if (!exists) throw notFound("Risco");
    await ctx.db.risk.update({ where: { id }, data });
    return { id };
  }
  const risk = await ctx.db.risk.create({ data: { ...data, organizationId: ctx.org.id, createdById: ctx.user.id } });
  const level = riskLevel(risk.impact, risk.probability);
  await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
    action: "risk.created",
    title: `Risco registrado: ${risk.title}`,
    entityType: "risk",
    entityId: risk.id,
    projectId: risk.projectId,
    opportunityId: risk.opportunityId,
    metadata: { level },
  });
  if (level === "CRITICAL" && risk.projectId) {
    const project = await ctx.db.project.findUnique({ where: { id: risk.projectId }, select: { name: true, managerId: true } });
    await ctx.db.decision.create({
      data: {
        organizationId: ctx.org.id,
        type: "REVIEW_PROJECT_RISK",
        title: `Risco crítico em ${project?.name ?? "projeto"}: ${risk.title}`,
        description: risk.mitigation ? `Mitigação proposta: ${risk.mitigation}` : "Nenhum plano de mitigação informado.",
        payload: { projectId: risk.projectId, riskId: risk.id },
        entityType: "project",
        entityId: risk.projectId,
        assigneeId: project?.managerId ?? null,
        source: "SYSTEM",
        createdById: ctx.user.id,
      },
    });
  }
  return { id: risk.id };
}

export async function deleteRisk(ctx: Ctx, id: string) {
  const r = await ctx.db.risk.findUnique({ where: { id }, select: { id: true } });
  if (!r) throw notFound("Risco");
  await ctx.db.risk.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id };
}

// ───────────── Saúde em lote ─────────────

type ProjectForHealth = {
  id: string;
  status: "PLANNING" | "ACTIVE" | "PAUSED" | "DELAYED" | "COMPLETED" | "CANCELED";
  progress: number;
  startDate: Date | null;
  dueDate: Date | null;
  budget: Prisma.Decimal | null;
  actualCost: Prisma.Decimal | null;
};

export type ProjectHealthEx = ProjectHealth & { effectiveProgress: number; taskCount: number; doneCount: number; overdueTasks: number };

export async function projectHealthBatch(ctx: Ctx, projects: ProjectForHealth[]): Promise<Map<string, ProjectHealthEx>> {
  const out = new Map<string, ProjectHealthEx>();
  if (!projects.length) return out;
  const ids = projects.map((p) => p.id);
  const todayKey = dayKeyInTz(new Date(), ctx.org.timezone);
  const today = keyToDate(todayKey);
  const weekAhead = keyToDate(addDaysToKey(todayKey, 7));
  const [tasks, risks, members] = await Promise.all([
    ctx.db.task.findMany({
      where: { projectId: { in: ids }, status: { not: "CANCELED" }, parentId: null },
      select: { projectId: true, status: true, dueDate: true, priority: true },
    }),
    ctx.db.risk.findMany({ where: { projectId: { in: ids }, status: { in: ["OPEN", "MITIGATING"] } }, select: { projectId: true, impact: true, probability: true } }),
    ctx.db.projectMember.findMany({ where: { projectId: { in: ids } }, select: { projectId: true, userId: true } }),
  ]);
  const overloaded = await overloadedUserIds(ctx, [...new Set(members.map((m) => m.userId))]);
  for (const p of projects) {
    const pt = tasks.filter((t) => t.projectId === p.id);
    const done = pt.filter((t) => t.status === "DONE").length;
    const effectiveProgress = pt.length ? Math.round((done / pt.length) * 100) : p.progress;
    const open = pt.filter((t) => t.status !== "DONE");
    const overdue = open.filter((t) => t.dueDate && t.dueDate < today && dateOnlyKey(t.dueDate) < todayKey).length;
    const importantDueSoon = open.filter((t) => (t.priority === "HIGH" || t.priority === "CRITICAL") && t.dueDate && dateOnlyKey(t.dueDate) >= todayKey && t.dueDate <= weekAhead).length;
    const pr = risks.filter((r) => r.projectId === p.id).map((r) => riskLevel(r.impact, r.probability));
    const health = projectHealth({
      status: p.status,
      progress: effectiveProgress,
      startKey: p.startDate ? dateOnlyKey(p.startDate) : null,
      dueKey: p.dueDate ? dateOnlyKey(p.dueDate) : null,
      todayKey,
      overdueTasks: overdue,
      importantDueSoon,
      blockedTasks: open.filter((t) => t.status === "BLOCKED").length,
      budget: p.budget ? toNumber(p.budget) : null,
      actualCost: p.actualCost ? toNumber(p.actualCost) : null,
      openRisks: { critical: pr.filter((l) => l === "CRITICAL").length, high: pr.filter((l) => l === "HIGH").length },
      overloadedMembers: members.filter((m) => m.projectId === p.id && overloaded.has(m.userId)).length,
    });
    out.set(p.id, { ...health, effectiveProgress, taskCount: pt.length, doneCount: done, overdueTasks: overdue });
  }
  return out;
}

/** Usuários acima de 100% da capacidade (mesmo critério do Mapa de Capacidade). */
export async function overloadedUserIds(ctx: Ctx, userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const todayKey = dayKeyInTz(new Date(), ctx.org.timezone);
  const [members, tasks, managed] = await Promise.all([
    ctx.db.organizationMember.findMany({ where: { userId: { in: userIds }, status: "ACTIVE" }, select: { userId: true, weeklyCapacityHours: true } }),
    ctx.db.task.findMany({ where: { assigneeId: { in: userIds }, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } }, select: { assigneeId: true, estimateHours: true, dueDate: true, projectId: true } }),
    ctx.db.project.groupBy({ by: ["managerId"], where: { managerId: { in: userIds }, status: { in: ["ACTIVE", "DELAYED"] } }, _count: { _all: true } }),
  ]);
  const set = new Set<string>();
  for (const m of members) {
    const w = computeWorkload(
      {
        userId: m.userId,
        name: "",
        weeklyCapacityHours: m.weeklyCapacityHours,
        tasks: tasks.filter((t) => t.assigneeId === m.userId).map((t) => ({ estimateHours: t.estimateHours ? toNumber(t.estimateHours) : null, dueKey: t.dueDate ? dateOnlyKey(t.dueDate) : null, projectId: t.projectId })),
        managedActiveProjects: managed.find((x) => x.managerId === m.userId)?._count._all ?? 0,
      },
      todayKey,
    );
    if (w.status === "OVERLOADED") set.add(m.userId);
  }
  return set;
}

export async function listProjects(ctx: Ctx, params: ListParams) {
  const where: Prisma.ProjectWhereInput = {};
  if (params.q) where.OR = [{ name: { contains: params.q, mode: "insensitive" } }, { code: { contains: params.q, mode: "insensitive" } }, { client: { name: { contains: params.q, mode: "insensitive" } } }];
  const status = params.get("status");
  if (status === "OPEN") where.status = { notIn: ["COMPLETED", "CANCELED"] };
  else if (status) where.status = status as Prisma.EnumProjectStatusFilter["equals"];
  const manager = params.get("manager");
  if (manager) where.managerId = manager === "me" ? ctx.user.id : manager;
  const client = params.get("client");
  if (client) where.clientId = client;
  if (params.get("overdue") === "1") {
    where.dueDate = { lt: keyToDate(dayKeyInTz(new Date(), ctx.org.timezone)) };
    where.status = { notIn: ["COMPLETED", "CANCELED"] };
  }
  const tag = params.get("tag");
  if (tag) where.id = { in: await entityIdsWithTag(ctx.db, "project", tag) };
  const orderBy: Prisma.ProjectOrderByWithRelationInput =
    params.sort === "name" ? { name: params.dir } : params.sort === "dueDate" ? { dueDate: { sort: params.dir, nulls: "last" } } : params.sort === "priority" ? { priority: params.dir } : { createdAt: params.dir };
  const [rows, total] = await Promise.all([
    ctx.db.project.findMany({
      where,
      orderBy,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: { client: { select: { id: true, name: true } }, manager: { select: { id: true, name: true } } },
    }),
    ctx.db.project.count({ where }),
  ]);
  const [health, tags] = await Promise.all([projectHealthBatch(ctx, rows), tagsFor(ctx.db, "project", rows.map((r) => r.id))]);
  let enriched = rows.map((r) => ({ ...r, health: health.get(r.id)!, tags: tags.get(r.id) ?? [] }));
  if (params.get("risk") === "1") enriched = enriched.filter((r) => r.health.score !== null && r.health.score < 60);
  return { rows: enriched, total };
}

export async function getProjectDetail(ctx: Ctx, id: string) {
  const project = await ctx.db.project.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      opportunity: { select: { id: true, title: true } },
      manager: { select: { id: true, name: true } },
      members: { include: { user: { select: { id: true, name: true } } } },
    },
  });
  if (!project) return null;
  const [tasks, risks, documents, meetings, activities, receivables, tags, health, memory] = await Promise.all([
    ctx.db.task.findMany({
      where: { projectId: id },
      include: { assignee: { select: { id: true, name: true } }, _count: { select: { subtasks: { where: { deletedAt: null } } } } },
      orderBy: [{ sortOrder: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }],
    }),
    ctx.db.risk.findMany({ where: { projectId: id }, include: { owner: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    ctx.db.document.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" } }),
    ctx.db.meeting.findMany({ where: { projectId: id }, orderBy: { startsAt: "desc" } }),
    ctx.db.activity.findMany({ where: { projectId: id }, include: { actor: { select: { name: true } } }, orderBy: { occurredAt: "desc" }, take: 50 }),
    ctx.db.receivable.findMany({ where: { projectId: id }, orderBy: { dueDate: "asc" } }),
    tagsFor(ctx.db, "project", [id]),
    projectHealthBatch(ctx, [project]),
    ctx.db.memoryFact.findMany({ where: { projectId: id }, include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  return { project, tasks, risks, documents, meetings, activities, receivables, tags: tags.get(id) ?? [], health: health.get(id)!, memory };
}

export function assertProjectWritable(status: string) {
  if (status === "CANCELED") throw new AppError("VALIDATION", "Projeto cancelado não aceita alterações.");
}
