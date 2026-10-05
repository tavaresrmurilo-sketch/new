import "server-only";
import type { Prisma, Priority } from "@prisma/client";
import type { z } from "zod";
import { dateOnlyKey, dayKeyInTz, keyToDate, parseDateOnly } from "@/lib/dates";
import type { ListParams } from "@/lib/list-params";
import { TASK_STATUS } from "@/lib/labels";
import { toNumber } from "@/lib/utils";
import type { commentSchema, taskSchema } from "@/features/tasks/schemas";
import { logActivity } from "@/server/activity";
import { audit } from "@/server/audit";
import type { Ctx } from "@/server/auth/context";
import { assertMember, assertOwned } from "@/server/db/ownership";
import type { TenantDb } from "@/server/db/tenant";
import { AppError, notFound } from "@/server/errors";
import { emitEvent } from "@/server/events/bus";
import { recommendTaskPriority, type TaskPriorityResult } from "@/server/intelligence/task-priority";
import { notify } from "@/server/modules/notifications";
import { projectHealthBatch } from "@/server/modules/projects";
import { entityIdsWithTag, setTags, tagsFor } from "@/server/modules/tags";
import { scopeOf } from "@/server/scope";

type TaskData = z.output<typeof taskSchema>;

const VIP_TAGS = ["vip", "estratégico", "estrategico", "key account"];

/** Contexto para o Smart Priority Engine de uma tarefa. */
async function priorityFor(
  db: TenantDb,
  org: { timezone: string; settings: { largeDealThreshold: number } },
  t: { dueDate: Date | null; clientId: string | null; opportunityId: string | null; projectId: string | null; blocksProject: boolean },
  projectHealthScore?: number | null,
): Promise<TaskPriorityResult> {
  const [client, opp, project, vipTag] = await Promise.all([
    t.clientId ? db.client.findUnique({ where: { id: t.clientId }, select: { isKeyAccount: true } }) : null,
    t.opportunityId ? db.opportunity.findUnique({ where: { id: t.opportunityId }, select: { value: true, clientId: true } }) : null,
    t.projectId ? db.project.findUnique({ where: { id: t.projectId }, select: { priority: true, clientId: true } }) : null,
    t.clientId ? db.tagAssignment.count({ where: { entityType: "client", entityId: t.clientId, tag: { name: { in: VIP_TAGS, mode: "insensitive" } } } }) : 0,
  ]);
  return recommendTaskPriority({
    dueKey: t.dueDate ? dateOnlyKey(t.dueDate) : null,
    todayKey: dayKeyInTz(new Date(), org.timezone),
    keyAccountClient: Boolean(client?.isKeyAccount) || vipTag > 0,
    opportunityValue: opp ? toNumber(opp.value) : null,
    largeDealThreshold: org.settings.largeDealThreshold,
    blocksProject: t.blocksProject,
    projectPriority: project?.priority ?? null,
    projectHealthScore: projectHealthScore ?? null,
  });
}

async function validate(ctx: Ctx, data: TaskData, selfId?: string) {
  await Promise.all([
    assertOwned(ctx, "project", data.projectId),
    assertOwned(ctx, "client", data.clientId),
    assertOwned(ctx, "opportunity", data.opportunityId),
    assertOwned(ctx, "task", data.parentId),
    assertMember(ctx, data.assigneeId),
  ]);
  if (data.parentId && data.parentId === selfId) throw new AppError("VALIDATION", "Uma tarefa não pode ser subtarefa de si mesma.");
}

/** Herda o cliente do projeto/oportunidade quando não informado (mantém Cliente 360° completo). */
async function inferClient(ctx: Ctx, data: TaskData) {
  if (data.clientId) return data.clientId;
  if (data.opportunityId) return (await ctx.db.opportunity.findUnique({ where: { id: data.opportunityId }, select: { clientId: true } }))?.clientId ?? null;
  if (data.projectId) return (await ctx.db.project.findUnique({ where: { id: data.projectId }, select: { clientId: true } }))?.clientId ?? null;
  return null;
}

export async function createTask(ctx: Ctx, data: TaskData, opts: { source?: "MANUAL" | "AI" | "MEETING" | "COMMAND" } = {}) {
  await validate(ctx, data);
  const clientId = await inferClient(ctx, data);
  const dueDate = parseDateOnly(data.dueDate);
  const auto = data.priority === "AUTO";
  const rec = await priorityFor(ctx.db, ctx.org, { dueDate, clientId, opportunityId: data.opportunityId, projectId: data.projectId, blocksProject: data.blocksProject });
  const task = await ctx.db.task.create({
    data: {
      organizationId: ctx.org.id,
      title: data.title,
      description: data.description,
      projectId: data.projectId,
      clientId,
      opportunityId: data.opportunityId,
      parentId: data.parentId,
      assigneeId: data.assigneeId ?? ctx.user.id,
      priority: auto ? rec.priority : (data.priority as Priority),
      priorityIsManual: !auto,
      priorityReasons: rec.reasons,
      blocksProject: data.blocksProject,
      status: data.status,
      completedAt: data.status === "DONE" ? new Date() : null,
      dueDate,
      estimateHours: data.estimateHours,
      source: opts.source ?? "MANUAL",
      createdById: ctx.user.id,
    },
  });
  if (data.tags.length) await setTags(ctx.db, ctx.org.id, "task", task.id, data.tags);
  await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
    action: "task.created",
    title: `Tarefa “${task.title}” criada`,
    entityType: "task",
    entityId: task.id,
    taskId: task.id,
    projectId: task.projectId,
    clientId: task.clientId,
    opportunityId: task.opportunityId,
  });
  if (task.assigneeId && task.assigneeId !== ctx.user.id) {
    await notify({
      organizationId: ctx.org.id,
      userId: task.assigneeId,
      type: "task.assigned",
      title: `${ctx.user.name} atribuiu uma tarefa a você: ${task.title}`,
      link: `/app/tasks/${task.id}`,
      entityType: "task",
      entityId: task.id,
    });
  }
  return { id: task.id, priority: task.priority, reasons: rec.reasons };
}

export async function updateTask(ctx: Ctx, id: string, data: TaskData) {
  const before = await ctx.db.task.findUnique({ where: { id } });
  if (!before) throw notFound("Tarefa");
  await validate(ctx, data, id);
  const clientId = await inferClient(ctx, data);
  const dueDate = parseDateOnly(data.dueDate);
  const auto = data.priority === "AUTO";
  const rec = await priorityFor(ctx.db, ctx.org, { dueDate, clientId, opportunityId: data.opportunityId, projectId: data.projectId, blocksProject: data.blocksProject });
  const task = await ctx.db.task.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description,
      projectId: data.projectId,
      clientId,
      opportunityId: data.opportunityId,
      parentId: data.parentId,
      assigneeId: data.assigneeId,
      priority: auto ? rec.priority : (data.priority as Priority),
      priorityIsManual: !auto,
      priorityReasons: rec.reasons,
      blocksProject: data.blocksProject,
      dueDate,
      estimateHours: data.estimateHours,
    },
  });
  await setTags(ctx.db, ctx.org.id, "task", id, data.tags);
  if (before.status !== data.status) await setTaskStatus(ctx, id, data.status);
  if (task.assigneeId && task.assigneeId !== before.assigneeId && task.assigneeId !== ctx.user.id) {
    await notify({
      organizationId: ctx.org.id,
      userId: task.assigneeId,
      type: "task.assigned",
      title: `${ctx.user.name} atribuiu uma tarefa a você: ${task.title}`,
      link: `/app/tasks/${task.id}`,
      entityType: "task",
      entityId: task.id,
    });
  }
  return { id };
}

export async function setTaskStatus(ctx: Ctx, id: string, status: z.output<typeof taskSchema>["status"]) {
  const task = await ctx.db.task.findUnique({ where: { id }, include: { project: { select: { name: true } } } });
  if (!task) throw notFound("Tarefa");
  if (task.status === status) return { id, status };
  await ctx.db.task.update({ where: { id }, data: { status, completedAt: status === "DONE" ? new Date() : null } });
  const done = status === "DONE";
  await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
    action: done ? "task.completed" : "task.status_changed",
    title: done ? `${ctx.user.name} concluiu a tarefa “${task.title}”` : `Tarefa “${task.title}” → ${TASK_STATUS[status]?.label}`,
    entityType: "task",
    entityId: id,
    taskId: id,
    projectId: task.projectId,
    clientId: task.clientId,
    opportunityId: task.opportunityId,
  });
  if (task.opportunityId) await ctx.db.opportunity.updateMany({ where: { id: task.opportunityId }, data: { lastActivityAt: new Date() } });
  if (done) {
    if (task.createdById && task.createdById !== ctx.user.id && task.createdById !== task.assigneeId) {
      await notify({ organizationId: ctx.org.id, userId: task.createdById, type: "task.completed", title: `Tarefa concluída: ${task.title}`, link: `/app/tasks/${id}`, entityType: "task", entityId: id });
    }
    await emitEvent(scopeOf(ctx), "task.completed", {
      entityType: "task",
      entityId: id,
      label: task.title,
      link: `/app/tasks/${id}`,
      ownerId: task.assigneeId,
      clientId: task.clientId,
      projectId: task.projectId,
      opportunityId: task.opportunityId,
      fields: { priority: task.priority },
    }, { id, title: task.title, projectId: task.projectId, project: task.project?.name ?? null, completedAt: new Date().toISOString() });
  }
  return { id, status };
}

export async function deleteTask(ctx: Ctx, id: string) {
  const t = await ctx.db.task.findUnique({ where: { id }, select: { id: true, title: true } });
  if (!t) throw notFound("Tarefa");
  const now = new Date();
  await ctx.db.task.updateMany({ where: { OR: [{ id }, { parentId: id }] }, data: { deletedAt: now } });
  await audit(ctx, "task.deleted", { entityType: "task", entityId: id, metadata: { title: t.title } });
  return { id };
}

export async function addComment(ctx: Ctx, input: z.output<typeof commentSchema>) {
  const task = await ctx.db.task.findUnique({ where: { id: input.taskId }, select: { id: true, title: true, assigneeId: true, createdById: true } });
  if (!task) throw notFound("Tarefa");
  const comment = await ctx.db.taskComment.create({ data: { organizationId: ctx.org.id, taskId: task.id, authorId: ctx.user.id, body: input.body } });
  // menções: @Nome Sobrenome de membros do workspace
  const members = await ctx.db.organizationMember.findMany({ where: { status: "ACTIVE" }, select: { userId: true, user: { select: { name: true } } } });
  const mentioned = members.filter((m) => input.body.toLowerCase().includes(`@${m.user.name.toLowerCase()}`)).map((m) => m.userId);
  const recipients = new Set([...mentioned, task.assigneeId, task.createdById].filter((u): u is string => Boolean(u) && u !== ctx.user.id));
  for (const userId of recipients) {
    await notify({
      organizationId: ctx.org.id,
      userId,
      type: mentioned.includes(userId) ? "mention" : "task.comment",
      title: mentioned.includes(userId) ? `${ctx.user.name} mencionou você em “${task.title}”` : `Novo comentário em “${task.title}”`,
      body: input.body.slice(0, 200),
      link: `/app/tasks/${task.id}`,
      entityType: "task",
      entityId: task.id,
    });
  }
  return { id: comment.id };
}

export async function deleteComment(ctx: Ctx, id: string) {
  const c = await ctx.db.taskComment.findUnique({ where: { id } });
  if (!c) throw notFound("Comentário");
  if (c.authorId !== ctx.user.id && !ctx.permissions.has("tasks.delete")) throw new AppError("FORBIDDEN", "Você só pode excluir seus próprios comentários.");
  await ctx.db.taskComment.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id };
}

const TASK_INCLUDE = {
  assignee: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  client: { select: { id: true, name: true } },
  opportunity: { select: { id: true, title: true } },
  _count: { select: { subtasks: { where: { deletedAt: null } }, comments: { where: { deletedAt: null } } } },
} satisfies Prisma.TaskInclude;

export function taskWhere(ctx: Ctx, params: ListParams): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {};
  const todayKey = dayKeyInTz(new Date(), ctx.org.timezone);
  if (params.q) where.title = { contains: params.q, mode: "insensitive" };
  const status = params.get("status") ?? "OPEN";
  if (status === "OPEN") where.status = { in: ["TODO", "IN_PROGRESS", "BLOCKED"] };
  else if (status !== "ALL") where.status = status as Prisma.EnumTaskStatusFilter["equals"];
  const assignee = params.get("assignee");
  if (assignee) where.assigneeId = assignee === "me" ? ctx.user.id : assignee === "none" ? null : assignee;
  const project = params.get("project");
  if (project) where.projectId = project;
  const client = params.get("client");
  if (client) where.clientId = client;
  const priority = params.get("priority");
  if (priority) where.priority = priority as Priority;
  const due = params.get("due");
  if (due === "overdue") {
    where.dueDate = { lt: keyToDate(todayKey) };
    where.status = { in: ["TODO", "IN_PROGRESS", "BLOCKED"] };
  } else if (due === "today") where.dueDate = keyToDate(todayKey);
  else if (due === "week") where.dueDate = { gte: keyToDate(todayKey), lte: new Date(keyToDate(todayKey).getTime() + 7 * 86_400_000) };
  if (params.get("top") !== "0") where.parentId = null;
  return where;
}

export async function listTasks(ctx: Ctx, params: ListParams) {
  const where = taskWhere(ctx, params);
  const tag = params.get("tag");
  if (tag) where.id = { in: await entityIdsWithTag(ctx.db, "task", tag) };
  const PRIORITY_ORDER = params.dir === "asc" ? "asc" : "desc";
  const orderBy: Prisma.TaskOrderByWithRelationInput[] =
    params.sort === "priority"
      ? [{ priority: PRIORITY_ORDER }, { dueDate: { sort: "asc", nulls: "last" } }]
      : params.sort === "title"
        ? [{ title: params.dir }]
        : params.sort === "createdAt"
          ? [{ createdAt: params.dir }]
          : [{ dueDate: { sort: params.dir, nulls: "last" } }, { priority: "desc" }];
  const [rows, total] = await Promise.all([
    ctx.db.task.findMany({ where, orderBy, skip: (params.page - 1) * params.pageSize, take: params.pageSize, include: TASK_INCLUDE }),
    ctx.db.task.count({ where }),
  ]);
  const tags = await tagsFor(ctx.db, "task", rows.map((r) => r.id));
  return { rows: rows.map((r) => ({ ...r, tags: tags.get(r.id) ?? [] })), total };
}

/** Tarefas para kanban/calendário (limitadas para não carregar tabelas enormes). */
export async function boardTasks(ctx: Ctx, params: ListParams, range?: { from: Date; to: Date }) {
  const where = taskWhere(ctx, params);
  if (range) {
    where.dueDate = { gte: range.from, lt: range.to };
    if (!params.get("status")) delete where.status;
  }
  return ctx.db.task.findMany({ where, include: TASK_INCLUDE, orderBy: [{ priority: "desc" }, { dueDate: { sort: "asc", nulls: "last" } }], take: 500 });
}

export async function getTaskDetail(ctx: Ctx, id: string) {
  const task = await ctx.db.task.findUnique({
    where: { id },
    include: {
      ...TASK_INCLUDE,
      parent: { select: { id: true, title: true } },
      subtasks: { where: { deletedAt: null }, include: { assignee: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      comments: { where: { deletedAt: null }, include: { author: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!task) return null;
  const [tags, activities] = await Promise.all([
    tagsFor(ctx.db, "task", [id]),
    ctx.db.activity.findMany({ where: { taskId: id }, include: { actor: { select: { name: true } } }, orderBy: { occurredAt: "desc" }, take: 30 }),
  ]);
  let healthScore: number | null = null;
  if (task.projectId) {
    const p = await ctx.db.project.findUnique({ where: { id: task.projectId }, select: { id: true, status: true, progress: true, startDate: true, dueDate: true, budget: true, actualCost: true } });
    if (p) healthScore = (await projectHealthBatch(ctx, [p])).get(p.id)?.score ?? null;
  }
  const recommendation = await priorityFor(ctx.db, ctx.org, task, healthScore);
  return { task, tags: tags.get(id) ?? [], activities, recommendation };
}

/** Rotina: recalcula prioridades automáticas (prazos mudam com o passar dos dias). */
export async function recomputeAutoPriorities(db: TenantDb, org: { timezone: string; settings: { largeDealThreshold: number } }) {
  const tasks = await db.task.findMany({
    where: { priorityIsManual: false, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } },
    select: { id: true, priority: true, dueDate: true, clientId: true, opportunityId: true, projectId: true, blocksProject: true },
    take: 5000,
  });
  let changed = 0;
  for (const t of tasks) {
    const rec = await priorityFor(db, org, t);
    if (rec.priority !== t.priority) {
      await db.task.update({ where: { id: t.id }, data: { priority: rec.priority, priorityReasons: rec.reasons } });
      changed++;
    }
  }
  return { evaluated: tasks.length, changed };
}
