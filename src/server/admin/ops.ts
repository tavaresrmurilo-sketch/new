import "server-only";
import type { EmailStatus, Prisma } from "@prisma/client";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { sendEmail } from "@/server/email";
import { JOB_NAMES, type JobName } from "@/server/jobs/catalog";
import { AdminError, assertAdminActor, paged, paging, type AdminActor, type Paged } from "./common";

// ─────────────────────────────── E-mails (outbox)

export const EMAIL_PAGE_SIZE = 30;

export interface EmailFilters {
  status?: EmailStatus;
  template?: string;
  q?: string;
  page?: number;
}

const EMAIL_LIST_SELECT = {
  id: true,
  to: true,
  subject: true,
  template: true,
  status: true,
  provider: true,
  error: true,
  attempts: true,
  createdAt: true,
  sentAt: true,
} satisfies Prisma.EmailOutboxSelect;

export type AdminEmailRow = Prisma.EmailOutboxGetPayload<{ select: typeof EMAIL_LIST_SELECT }>;

export async function listEmails(f: EmailFilters = {}): Promise<Paged<AdminEmailRow> & { counts: Record<EmailStatus, number>; templates: string[] }> {
  const { page, skip, take } = paging(f.page ?? 1, EMAIL_PAGE_SIZE);
  const where: Prisma.EmailOutboxWhereInput = {
    ...(f.status ? { status: f.status } : {}),
    ...(f.template ? { template: f.template } : {}),
    ...(f.q ? { OR: [{ to: { contains: f.q, mode: "insensitive" } }, { subject: { contains: f.q, mode: "insensitive" } }] } : {}),
  };
  const [items, total, byStatus, templates] = await Promise.all([
    prisma.emailOutbox.findMany({ where, select: EMAIL_LIST_SELECT, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip, take }),
    prisma.emailOutbox.count({ where }),
    prisma.emailOutbox.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.emailOutbox.groupBy({ by: ["template"], orderBy: { template: "asc" } }),
  ]);
  const counts = { PENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 } as Record<EmailStatus, number>;
  for (const s of byStatus) counts[s.status] = s._count._all;
  return { ...paged(items, total, page, EMAIL_PAGE_SIZE), counts, templates: templates.map((t) => t.template) };
}

export async function getEmail(id: string) {
  return prisma.emailOutbox.findUnique({ where: { id } });
}

/** Reenvia uma mensagem que falhou ou não foi enviada. Cria um novo registro no outbox (o original fica como histórico). */
export async function resendEmail(actor: AdminActor, id: string) {
  await assertAdminActor(actor);
  const email = await prisma.emailOutbox.findUnique({ where: { id } });
  if (!email) throw new AdminError("E-mail não encontrado.", "NOT_FOUND");
  if (email.status !== "FAILED" && email.status !== "SKIPPED") throw new AdminError("Só e-mails com falha ou não enviados podem ser reenviados.");
  const res = await sendEmail(email.to, { template: email.template, subject: email.subject, html: email.html, text: email.text });
  await audit({ actorId: actor.id, action: "admin.email.resend", targetType: "EmailOutbox", targetId: email.id, metadata: { newId: res.id, status: res.status, template: email.template }, ip: actor.ip });
  return res;
}

// ─────────────────────────────── Auditoria

export const AUDIT_PAGE_SIZE = 40;

export interface AuditFilters {
  action?: string;
  actor?: string; // e-mail ou nome (parcial)
  targetType?: string;
  targetId?: string;
  from?: Date;
  to?: Date;
  page?: number;
}

export async function listAudit(f: AuditFilters = {}) {
  const { page, skip, take } = paging(f.page ?? 1, AUDIT_PAGE_SIZE);
  const where: Prisma.AuditLogWhereInput = {
    ...(f.action ? { action: f.action.endsWith("*") ? { startsWith: f.action.slice(0, -1) } : f.action } : {}),
    ...(f.actor
      ? { actor: { OR: [{ email: { contains: f.actor, mode: "insensitive" } }, { name: { contains: f.actor, mode: "insensitive" } }] } }
      : {}),
    ...(f.targetType ? { targetType: f.targetType } : {}),
    ...(f.targetId ? { targetId: f.targetId } : {}),
    ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
  };
  const [items, total, actions, targetTypes] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip,
      take,
      include: { actor: { select: { id: true, name: true, email: true, role: true } } },
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ["action"], orderBy: { action: "asc" } }),
    prisma.auditLog.groupBy({ by: ["targetType"], where: { targetType: { not: null } }, orderBy: { targetType: "asc" } }),
  ]);
  return {
    ...paged(items, total, page, AUDIT_PAGE_SIZE),
    actions: actions.map((a) => a.action),
    targetTypes: targetTypes.map((t) => t.targetType).filter((t): t is string => Boolean(t)),
  };
}

// ─────────────────────────────── Rotinas

export const JOB_PAGE_SIZE = 30;

export async function listJobRuns(job?: JobName, page = 1) {
  const p = paging(page, JOB_PAGE_SIZE);
  const where: Prisma.JobRunWhereInput = job ? { job } : {};
  const [items, total, latest] = await Promise.all([
    prisma.jobRun.findMany({ where, orderBy: { startedAt: "desc" }, skip: p.skip, take: p.take }),
    prisma.jobRun.count({ where }),
    Promise.all(JOB_NAMES.map((name) => prisma.jobRun.findFirst({ where: { job: name }, orderBy: { startedAt: "desc" } }))),
  ]);
  return { ...paged(items, total, p.page, JOB_PAGE_SIZE), latest: Object.fromEntries(JOB_NAMES.map((n, i) => [n, latest[i]])) };
}
