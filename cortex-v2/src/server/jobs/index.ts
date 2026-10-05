import "server-only";
import { prisma } from "@/lib/db";
import { addDaysToKey, DAY_MS, dateOnlyKey, dayKeyInTz, diffKeys, keyToDate } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { toNumber } from "@/lib/utils";
import { emitEvent } from "@/server/events/bus";
import { captureMetricSnapshots } from "@/server/modules/intelligence";
import { notify, notifyMany, orgManagers } from "@/server/modules/notifications";
import { purgeDocumentFile } from "@/server/modules/documents";
import { purgeExpiredTrash } from "@/server/modules/trash";
import { recomputeAutoPriorities } from "@/server/modules/tasks";
import { getPlatformSetting } from "@/server/platform";
import { systemScope } from "@/server/scope";
import { retryPendingWebhooks } from "@/server/webhooks/dispatch";

/**
 * Jobs agendados. São idempotentes (notificações com dedupeKey) e podem ser chamados por qualquer
 * agendador externo: Vercel Cron, GitHub Actions, cron do servidor ou `npm run jobs:run`.
 */
export const JOBS = {
  "contracts-expiring": contractsExpiring,
  "follow-ups": followUps,
  "projects-at-risk": projectsAtRisk,
  "overdue-tasks": overdueTasks,
  "morning-brief": morningBrief,
  "metric-snapshots": metricSnapshots,
  "priority-recompute": priorityRecompute,
  "webhook-retries": webhookRetries,
  retention,
} as const;
export type JobName = keyof typeof JOBS;
export const isJobName = (v: string): v is JobName => v in JOBS;

async function activeOrgs() {
  return prisma.organization.findMany({ where: { blockedAt: null, deletionRequestedAt: null }, select: { id: true } });
}

async function forEachOrg(fn: (orgId: string) => Promise<number>) {
  let total = 0;
  for (const o of await activeOrgs()) {
    try {
      total += await fn(o.id);
    } catch (error) {
      logger.error("job.org_failed", { organizationId: o.id, error });
    }
  }
  return total;
}

export async function runJob(name: JobName) {
  const run = await prisma.jobRun.create({ data: { job: name, status: "RUNNING" } });
  try {
    const result = await JOBS[name]();
    await prisma.jobRun.update({ where: { id: run.id }, data: { status: "SUCCESS", finishedAt: new Date(), result: result as object } });
    return { job: name, ok: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.jobRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), error: message.slice(0, 1000) } });
    logger.error("job.failed", { job: name, error });
    return { job: name, ok: false, error: message };
  }
}

/** Alertas de vencimento nos marcos configurados (padrão 90/60/30/7) + evento contract.expiring; contratos vencidos passam a EXPIRED. */
async function contractsExpiring() {
  const notified = await forEachOrg(async (orgId) => {
    const scope = await systemScope(orgId);
    if (!scope) return 0;
    const todayKey = dayKeyInTz(new Date(), scope.org.timezone);
    const thresholds = [...scope.org.settings.contractAlertDays].sort((a, b) => b - a);
    const max = thresholds[0] ?? 90;
    const contracts = await scope.db.contract.findMany({ where: { status: "ACTIVE", endDate: { not: null, lte: keyToDate(addDaysToKey(todayKey, max)) } }, include: { client: { select: { name: true } } } });
    const managers = await orgManagers(orgId);
    let n = 0;
    for (const c of contracts) {
      const left = diffKeys(todayKey, dateOnlyKey(c.endDate!));
      if (left < 0) {
        if (c.renewalType !== "AUTOMATIC") await scope.db.contract.update({ where: { id: c.id }, data: { status: "EXPIRED" } });
        continue;
      }
      const hit = thresholds.filter((t) => left <= t).pop();
      if (hit === undefined || (c.lastAlertThreshold !== null && c.lastAlertThreshold <= hit)) continue;
      await scope.db.contract.update({ where: { id: c.id }, data: { lastAlertThreshold: hit } });
      await notifyMany([c.ownerId, ...managers], { organizationId: orgId, type: "contract.expiring", title: `Contrato ${c.number} (${c.client.name}) vence em ${left} dia(s)`, link: `/app/contracts/${c.id}`, entityType: "contract", entityId: c.id, dedupeKey: `contract-expiring:${c.id}:${hit}` });
      await emitEvent(scope, "contract.expiring", { entityType: "contract", entityId: c.id, label: `${c.number} — ${c.title}`, link: `/app/contracts/${c.id}`, ownerId: c.ownerId, clientId: c.clientId, fields: { daysLeft: left, value: toNumber(c.value) } }, { id: c.id, number: c.number, title: c.title, clientId: c.clientId, endDate: dateOnlyKey(c.endDate!), daysLeft: left, threshold: hit });
      n++;
    }
    return n;
  });
  return { notified };
}

/** Lembretes internos de follow-up de propostas (nunca envia mensagens ao cliente). */
async function followUps() {
  const created = await forEachOrg(async (orgId) => {
    const scope = await systemScope(orgId);
    if (!scope) return 0;
    const cutoff = new Date(Date.now() - scope.org.settings.followUpDays * DAY_MS);
    const day = dayKeyInTz(new Date(), scope.org.timezone);
    const rows = await scope.db.proposal.findMany({ where: { status: { in: ["SENT", "VIEWED", "NEGOTIATION"] }, OR: [{ lastFollowUpAt: { lt: cutoff } }, { lastFollowUpAt: null, sentAt: { lt: cutoff } }] }, select: { id: true, number: true, ownerId: true, client: { select: { name: true } } } });
    let n = 0;
    for (const p of rows) {
      if (!p.ownerId) continue;
      await notify({ organizationId: orgId, userId: p.ownerId, type: "proposal.follow_up", title: `Follow-up pendente: proposta #${p.number} (${p.client.name})`, link: `/app/proposals/${p.id}`, entityType: "proposal", entityId: p.id, dedupeKey: `follow-up:${p.id}:${day}` });
      n++;
    }
    return n;
  });
  return { created };
}

async function projectsAtRisk() {
  const created = await forEachOrg(async (orgId) => {
    const scope = await systemScope(orgId);
    if (!scope) return 0;
    const todayKey = dayKeyInTz(new Date(), scope.org.timezone);
    const week = todayKey.slice(0, 8) + String(Math.ceil(Number(todayKey.slice(8)) / 7));
    const rows = await scope.db.project.findMany({ where: { OR: [{ status: "DELAYED" }, { status: "ACTIVE", dueDate: { lt: keyToDate(todayKey) } }] }, select: { id: true, name: true, managerId: true } });
    const managers = await orgManagers(orgId);
    for (const p of rows) await notifyMany([p.managerId, ...managers], { organizationId: orgId, type: "project.at_risk", title: `Projeto atrasado: ${p.name}`, link: `/app/projects/${p.id}`, entityType: "project", entityId: p.id, dedupeKey: `project-risk:${p.id}:${week}` });
    return rows.length;
  });
  return { created };
}

async function overdueTasks() {
  const created = await forEachOrg(async (orgId) => {
    const scope = await systemScope(orgId);
    if (!scope) return 0;
    const todayKey = dayKeyInTz(new Date(), scope.org.timezone);
    const groups = await scope.db.task.groupBy({ by: ["assigneeId"], where: { status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] }, dueDate: { lt: keyToDate(todayKey) }, assigneeId: { not: null } }, _count: { _all: true } });
    for (const g of groups) await notify({ organizationId: orgId, userId: g.assigneeId!, type: "task.overdue", title: `Você tem ${g._count._all} tarefa(s) atrasada(s)`, link: "/app/tasks?assignee=me&due=overdue", dedupeKey: `overdue:${todayKey}` });
    return groups.length;
  });
  return { created };
}

/** Aviso diário do Morning Brief (o conteúdo é calculado ao abrir o dashboard). */
async function morningBrief() {
  const created = await forEachOrg(async (orgId) => {
    const scope = await systemScope(orgId);
    if (!scope) return 0;
    const todayKey = dayKeyInTz(new Date(), scope.org.timezone);
    const members = await prisma.organizationMember.findMany({ where: { organizationId: orgId, status: "ACTIVE", user: { isDemoGuest: false } }, select: { userId: true } });
    let n = 0;
    for (const m of members) {
      const [tasks, meetings] = await Promise.all([
        scope.db.task.count({ where: { assigneeId: m.userId, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] }, dueDate: { lte: keyToDate(todayKey) } } }),
        scope.db.meeting.count({ where: { status: "SCHEDULED", startsAt: { gte: new Date(), lt: new Date(Date.now() + DAY_MS) }, OR: [{ createdById: m.userId }, { participants: { some: { userId: m.userId } } }] } }),
      ]);
      if (!tasks && !meetings) continue;
      await notify({ organizationId: orgId, userId: m.userId, type: "morning_brief", title: "Seu Morning Brief está pronto", body: `${meetings} reunião(ões) nas próximas 24 h · ${tasks} tarefa(s) para hoje ou atrasadas`, link: "/app/dashboard", dedupeKey: `brief:${todayKey}` });
      n++;
    }
    return n;
  });
  return { created };
}

async function metricSnapshots() {
  const orgs = await forEachOrg(async (orgId) => {
    const scope = await systemScope(orgId);
    if (!scope) return 0;
    await captureMetricSnapshots(scope.db, scope.org);
    return 1;
  });
  return { orgs };
}

async function priorityRecompute() {
  const changed = await forEachOrg(async (orgId) => {
    const scope = await systemScope(orgId);
    if (!scope) return 0;
    return (await recomputeAutoPriorities(scope.db, scope.org)).changed;
  });
  return { changed };
}

async function webhookRetries() {
  return { retried: await retryPendingWebhooks(200) };
}

/** Ordem de remoção (dependentes primeiro) dos dados de uma organização. */
const PURGE_ORDER = [
  "aIMessage", "aIConversation", "aIUsage", "automationExecution", "webhookDelivery", "webhook", "apiKey", "taskComment", "tagAssignment", "tag",
  "memoryFact", "decision", "notification", "savedView", "favorite", "metricSnapshot", "roiScenario", "importJob", "portalAccess", "document",
  "receivable", "contract", "proposalItem", "proposal", "meeting", "task", "risk", "projectMember", "project", "activity", "opportunity",
  "pipelineStage", "pipeline", "contact", "client", "lead", "playbookStep", "playbook", "playbookRun", "automation", "invitation", "usageRecord", "invoiceReference",
] as const;

export async function purgeOrganization(organizationId: string) {
  await prisma.meetingParticipant.deleteMany({ where: { meeting: { organizationId } } });
  const docs = await prisma.document.findMany({ where: { organizationId }, select: { storageProvider: true, storageKey: true } });
  for (const doc of docs) await purgeDocumentFile(doc);
  const d = prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>;
  for (const model of PURGE_ORDER) {
    await d[model]!.deleteMany({ where: { organizationId } });
  }
  const guests = await prisma.organizationMember.findMany({ where: { organizationId, user: { isDemoGuest: true } }, select: { userId: true } });
  await prisma.organization.delete({ where: { id: organizationId } });
  if (guests.length) await prisma.user.deleteMany({ where: { id: { in: guests.map((g) => g.userId) }, isDemoGuest: true, memberships: { none: {} } } });
}

/** Retenção: lixeira, demos expirados, exclusões solicitadas (após carência), auditoria antiga, buckets de rate limit. */
async function retention() {
  const now = new Date();
  const [trashDays, auditDays] = await Promise.all([getPlatformSetting("retention.trashDays"), getPlatformSetting("retention.auditLogDays")]);
  const trashCutoff = new Date(now.getTime() - Number(trashDays) * DAY_MS);
  let trash = 0;
  for (const o of await activeOrgs()) {
    const scope = await systemScope(o.id);
    if (scope) trash += await purgeExpiredTrash(scope.db, trashCutoff);
  }
  const expired = await prisma.organization.findMany({ where: { OR: [{ isDemo: true, demoExpiresAt: { lt: now } }, { deletionScheduledFor: { lt: now } }] }, select: { id: true, isDemo: true } });
  let purged = 0;
  for (const o of expired) {
    try {
      await purgeOrganization(o.id);
      purged++;
    } catch (error) {
      logger.error("retention.purge_failed", { organizationId: o.id, error });
    }
  }
  const audit = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - Number(auditDays) * DAY_MS) } } });
  const buckets = await prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } }).catch(() => ({ count: 0 }));
  const sessions = await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  return { trash, organizationsPurged: purged, auditLogsRemoved: audit.count, rateLimitBuckets: buckets.count, sessionsRemoved: sessions.count };
}
