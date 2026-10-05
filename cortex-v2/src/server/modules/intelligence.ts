import "server-only";
import type { Prisma } from "@prisma/client";
import { addDaysToKey, DAY_MS, dateOnlyKey, dayKeyInTz, diffKeys, keyToDate, zonedParts, zonedToUtc } from "@/lib/dates";
import { formatCurrency, formatTime } from "@/lib/format";
import { toNumber } from "@/lib/utils";
import { can, type Ctx } from "@/server/auth/context";
import type { TenantDb } from "@/server/db/tenant";
import { detectAnomalies, detectInsights, type Insight } from "@/server/intelligence/insights";
import { computePulse, type PulseResult } from "@/server/intelligence/pulse";
import { clientHealthBatch } from "@/server/modules/clients";
import { monthlyEquivalent } from "@/server/modules/contracts";
import { overloadedUserIds, projectHealthBatch } from "@/server/modules/projects";

/** Gestores enxergam o workspace inteiro no Brief; demais perfis veem o que é seu. */
export function isTeamWide(ctx: Ctx) {
  return ["OWNER", "ADMIN", "MANAGER"].includes(ctx.member?.roleKey ?? "") || ctx.user.isSuperAdmin;
}

const todayOf = (ctx: Ctx) => dayKeyInTz(new Date(), ctx.org.timezone);

// ───────────── Snapshots diários (base para tendências e anomalias) ─────────────

export const SNAPSHOT_METRICS = ["pipeline.open", "pipeline.weighted", "opportunities.open", "projects.delayed", "tasks.open", "tasks.overdue", "clients.active"] as const;
export type SnapshotMetric = (typeof SNAPSHOT_METRICS)[number];

/** Registra (idempotente por dia) os indicadores de estado do workspace. Chamado pelo job diário e no primeiro acesso do dia. */
export async function captureMetricSnapshots(db: TenantDb, org: { id: string; timezone: string }) {
  const todayKey = dayKeyInTz(new Date(), org.timezone);
  const today = keyToDate(todayKey);
  const [opps, delayed, openTasks, overdue, activeClients] = await Promise.all([
    db.opportunity.findMany({ where: { status: "OPEN" }, select: { value: true, probability: true, stage: { select: { probability: true } } } }),
    db.project.count({ where: { OR: [{ status: "DELAYED" }, { status: "ACTIVE", dueDate: { lt: today } }] } }),
    db.task.count({ where: { status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] }, parentId: null } }),
    db.task.count({ where: { status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] }, parentId: null, dueDate: { lt: today } } }),
    db.client.count({ where: { status: "ACTIVE" } }),
  ]);
  const values: Record<SnapshotMetric, number> = {
    "pipeline.open": opps.reduce((s, o) => s + toNumber(o.value), 0),
    "pipeline.weighted": opps.reduce((s, o) => s + (toNumber(o.value) * (o.probability ?? o.stage.probability)) / 100, 0),
    "opportunities.open": opps.length,
    "projects.delayed": delayed,
    "tasks.open": openTasks,
    "tasks.overdue": overdue,
    "clients.active": activeClients,
  };
  const date = new Date(`${todayKey}T00:00:00.000Z`);
  for (const metric of SNAPSHOT_METRICS) {
    await db.metricSnapshot.upsert({
      where: { organizationId_metric_date: { organizationId: org.id, metric, date } },
      create: { organizationId: org.id, metric, date, value: Math.round(values[metric] * 100) / 100 },
      update: { value: Math.round(values[metric] * 100) / 100 },
    });
  }
  return values;
}

/** Garante o snapshot de hoje sem custo repetido (um registro por dia). */
export async function ensureTodaySnapshot(ctx: Ctx) {
  const date = new Date(`${todayOf(ctx)}T00:00:00.000Z`);
  const exists = await ctx.db.metricSnapshot.findFirst({ where: { metric: "pipeline.open", date }, select: { id: true } });
  if (!exists) await captureMetricSnapshots(ctx.db, ctx.org);
}

/** Valor do snapshot mais próximo de N dias atrás (tolerância de 3 dias). null quando não há histórico. */
export async function snapshotAgo(ctx: Ctx, metric: SnapshotMetric, daysAgo: number): Promise<number | null> {
  const target = addDaysToKey(todayOf(ctx), -daysAgo);
  const rows = await ctx.db.metricSnapshot.findMany({
    where: { metric, date: { gte: new Date(`${addDaysToKey(target, -3)}T00:00:00.000Z`), lte: new Date(`${addDaysToKey(target, 3)}T00:00:00.000Z`) } },
    select: { date: true, value: true },
  });
  if (!rows.length) return null;
  const best = rows.sort((a, b) => Math.abs(diffKeys(target, dateOnlyKey(a.date))) - Math.abs(diffKeys(target, dateOnlyKey(b.date))))[0]!;
  return toNumber(best.value);
}

export async function snapshotSeries(ctx: Ctx, metric: SnapshotMetric, days: number) {
  const from = addDaysToKey(todayOf(ctx), -days);
  const rows = await ctx.db.metricSnapshot.findMany({
    where: { metric, date: { gte: new Date(`${from}T00:00:00.000Z`) } },
    orderBy: { date: "asc" },
    select: { date: true, value: true },
  });
  return rows.map((r) => ({ key: dateOnlyKey(r.date), value: toNumber(r.value) }));
}

// ───────────── Córtex Pulse ─────────────

export async function getPulse(ctx: Ctx): Promise<PulseResult & { pipelineNow: number; pipeline30dAgo: number | null }> {
  const now = new Date();
  const todayKey = todayOf(ctx);
  const today = keyToDate(todayKey);
  const since14 = new Date(now.getTime() - 14 * DAY_MS);
  const since90 = new Date(now.getTime() - 90 * DAY_MS);
  const [opps, won90, lost90, projects, clients, openTasks, overdueTasks, members] = await Promise.all([
    ctx.db.opportunity.findMany({ where: { status: "OPEN" }, select: { value: true, lastActivityAt: true } }),
    ctx.db.opportunity.count({ where: { status: "WON", wonAt: { gte: since90 } } }),
    ctx.db.opportunity.count({ where: { status: "LOST", lostAt: { gte: since90 } } }),
    ctx.db.project.findMany({
      where: { status: { in: ["ACTIVE", "DELAYED"] } },
      select: { id: true, status: true, progress: true, startDate: true, dueDate: true, budget: true, actualCost: true },
      take: 500,
    }),
    ctx.db.client.findMany({ where: { status: "ACTIVE" }, select: { id: true, status: true, lastInteractionAt: true }, take: 1000 }),
    ctx.db.task.count({ where: { status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] }, parentId: null } }),
    ctx.db.task.count({ where: { status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] }, parentId: null, dueDate: { lt: today } } }),
    ctx.db.organizationMember.findMany({ where: { status: "ACTIVE" }, select: { userId: true } }),
  ]);
  const [ph, ch, overloaded, pipeline30dAgo] = await Promise.all([
    projectHealthBatch(ctx, projects),
    clientHealthBatch(ctx, clients),
    overloadedUserIds(ctx, members.map((m) => m.userId)),
    snapshotAgo(ctx, "pipeline.open", 30),
  ]);
  const pipelineNow = opps.reduce((s, o) => s + toNumber(o.value), 0);
  const closed = won90 + lost90;
  const pulse = computePulse({
    commercial: {
      openOpportunities: opps.length,
      activeLast14d: opps.filter((o) => o.lastActivityAt >= since14).length,
      winRate90d: closed >= 5 ? (won90 / closed) * 100 : null,
      pipelineNow,
      pipeline30dAgo,
    },
    projects: { healthScores: [...ph.values()].map((h) => h.score).filter((x): x is number => x !== null) },
    clients: { healthScores: [...ch.values()].map((h) => h.score) },
    operations: { openTasks, overdueTasks, members: members.length, overloadedMembers: overloaded.size },
  });
  return { ...pulse, pipelineNow, pipeline30dAgo };
}

// ───────────── Morning Brief ─────────────

export interface BriefItem {
  id: string;
  title: string;
  detail?: string;
  href: string;
  urgency: "high" | "medium" | "low";
}
export interface BriefSection {
  key: string;
  title: string;
  items: BriefItem[];
  total: number;
  href?: string;
}
export interface MorningBrief {
  greeting: string;
  headline: string;
  sections: BriefSection[];
  teamWide: boolean;
}

function greetingFor(ctx: Ctx) {
  const h = zonedParts(new Date(), ctx.org.timezone).h;
  const first = ctx.user.name.split(" ")[0];
  return `${h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"}, ${first}`;
}

/**
 * Morning Brief: resumo determinístico do que exige atenção hoje.
 * Cada item vem de um registro real e leva ao registro de origem.
 */
export async function getMorningBrief(ctx: Ctx): Promise<MorningBrief> {
  const now = new Date();
  const s = ctx.org.settings;
  const todayKey = todayOf(ctx);
  const today = keyToDate(todayKey);
  const teamWide = isTeamWide(ctx);
  const me = ctx.user.id;
  // limites do dia no fuso da organização
  const [y, m, d] = todayKey.split("-").map(Number) as [number, number, number];
  const startOfDay = zonedToUtc(y, m, d, 0, 0, ctx.org.timezone);
  const endOfDay = new Date(startOfDay.getTime() + DAY_MS);
  const followUpCutoff = new Date(now.getTime() - s.followUpDays * DAY_MS);
  const inactiveCutoff = new Date(now.getTime() - s.briefInactiveClientDays * DAY_MS);
  const in30 = keyToDate(addDaysToKey(todayKey, 30));
  const mine = <T extends object>(field: string, w: T): T => (teamWide ? w : ({ ...w, [field]: me } as T));
  const canFinance = can(ctx, "finance.read");

  const [meetings, tasks, proposals, nextSteps, clients, contracts, projects, decisions, receivables, stale] = await Promise.all([
    can(ctx, "meetings.read")
      ? ctx.db.meeting.findMany({
          where: { status: "SCHEDULED", startsAt: { gte: startOfDay, lt: endOfDay }, OR: [{ createdById: me }, { participants: { some: { userId: me } } }] },
          orderBy: { startsAt: "asc" },
          select: { id: true, title: true, startsAt: true, client: { select: { name: true } } },
          take: 10,
        })
      : [],
    can(ctx, "tasks.read")
      ? ctx.db.task.findMany({
          where: { assigneeId: me, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] }, dueDate: { lte: today } },
          orderBy: [{ dueDate: "asc" }],
          select: { id: true, title: true, dueDate: true, priority: true, status: true, project: { select: { name: true } } },
          take: 50,
        })
      : [],
    can(ctx, "proposals.read")
      ? ctx.db.proposal.findMany({
          where: mine("ownerId", {
            status: { in: ["SENT", "VIEWED", "NEGOTIATION"] },
            OR: [{ lastFollowUpAt: { lt: followUpCutoff } }, { lastFollowUpAt: null, sentAt: { lt: followUpCutoff } }],
          } as Prisma.ProposalWhereInput),
          orderBy: { sentAt: "asc" },
          select: { id: true, number: true, title: true, sentAt: true, lastFollowUpAt: true, viewedAt: true, client: { select: { name: true } } },
          take: 30,
        })
      : [],
    can(ctx, "opportunities.read")
      ? ctx.db.opportunity.findMany({
          where: mine("ownerId", { status: "OPEN", nextStepDate: { lte: today } } as Prisma.OpportunityWhereInput),
          orderBy: { nextStepDate: "asc" },
          select: { id: true, title: true, nextStep: true, nextStepDate: true, client: { select: { name: true } } },
          take: 30,
        })
      : [],
    can(ctx, "clients.read")
      ? ctx.db.client.findMany({
          where: mine("ownerId", { status: "ACTIVE", OR: [{ lastInteractionAt: { lt: inactiveCutoff } }, { lastInteractionAt: null, createdAt: { lt: inactiveCutoff } }] } as Prisma.ClientWhereInput),
          orderBy: [{ isKeyAccount: "desc" }, { lastInteractionAt: "asc" }],
          select: { id: true, name: true, lastInteractionAt: true, isKeyAccount: true },
          take: 30,
        })
      : [],
    can(ctx, "contracts.read")
      ? ctx.db.contract.findMany({
          where: mine("ownerId", { status: "ACTIVE", endDate: { gte: today, lte: in30 } } as Prisma.ContractWhereInput),
          orderBy: { endDate: "asc" },
          select: { id: true, number: true, title: true, endDate: true, renewalType: true, client: { select: { name: true } } },
          take: 20,
        })
      : [],
    can(ctx, "projects.read")
      ? ctx.db.project.findMany({
          where: mine("managerId", { OR: [{ status: "DELAYED" }, { status: "ACTIVE", dueDate: { lt: today } }] } as Prisma.ProjectWhereInput),
          select: { id: true, name: true, dueDate: true, status: true },
          take: 20,
        })
      : [],
    can(ctx, "decisions.resolve")
      ? ctx.db.decision.findMany({
          where: { status: "PENDING", ...(teamWide ? {} : { OR: [{ assigneeId: me }, { assigneeId: null, createdById: me }] }) },
          orderBy: { createdAt: "asc" },
          select: { id: true, title: true, type: true },
          take: 20,
        })
      : [],
    canFinance && teamWide
      ? ctx.db.receivable.findMany({
          where: { status: "PENDING", dueDate: { lt: today } },
          orderBy: { dueDate: "asc" },
          select: { id: true, description: true, amount: true, dueDate: true, client: { select: { name: true } } },
          take: 20,
        })
      : [],
    can(ctx, "opportunities.read")
      ? ctx.db.opportunity.findMany({
          where: mine("ownerId", { status: "OPEN", lastActivityAt: { lt: new Date(now.getTime() - 2 * s.followUpDays * DAY_MS) } } as Prisma.OpportunityWhereInput),
          orderBy: { value: "desc" },
          select: { id: true, title: true, value: true, lastActivityAt: true, client: { select: { name: true } } },
          take: 20,
        })
      : [],
  ]);

  const days = (from: Date | null) => (from ? Math.floor((now.getTime() - from.getTime()) / DAY_MS) : null);
  const money = (v: number) => (canFinance ? formatCurrency(v, ctx.org.currency) : null);
  const prioOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sortedTasks = [...tasks].sort((a, b) => (prioOrder[a.priority] ?? 9) - (prioOrder[b.priority] ?? 9) || (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0));

  const sections: BriefSection[] = [
    {
      key: "agenda",
      title: "Agenda de hoje",
      href: "/app/calendar",
      total: meetings.length,
      items: meetings.map((mt) => ({
        id: mt.id,
        title: `${formatTime(mt.startsAt, ctx.org.timezone)} · ${mt.title}`,
        detail: mt.client?.name,
        href: `/app/meetings/${mt.id}`,
        urgency: "medium" as const,
      })),
    },
    {
      key: "tasks",
      title: "Suas tarefas para hoje e atrasadas",
      href: "/app/tasks?assignee=me&due=overdue",
      total: tasks.length,
      items: sortedTasks.slice(0, 6).map((t) => {
        const late = t.dueDate ? diffKeys(dateOnlyKey(t.dueDate), todayKey) : 0;
        return {
          id: t.id,
          title: t.title,
          detail: [late > 0 ? `atrasada há ${late} dia(s)` : "vence hoje", t.project?.name].filter(Boolean).join(" · "),
          href: `/app/tasks/${t.id}`,
          urgency: late > 0 || t.priority === "CRITICAL" ? ("high" as const) : ("medium" as const),
        };
      }),
    },
    {
      key: "followups",
      title: "Follow-ups pendentes",
      href: "/app/proposals?status=SENT",
      total: proposals.length + nextSteps.length,
      items: [
        ...proposals.slice(0, 4).map((p) => ({
          id: p.id,
          title: `Proposta #${p.number} — ${p.client.name}`,
          detail: `enviada há ${days(p.sentAt) ?? "?"} dia(s)${p.lastFollowUpAt ? ` · último follow-up há ${days(p.lastFollowUpAt)} dia(s)` : " · sem follow-up registrado"}${p.viewedAt ? " · visualizada" : ""}`,
          href: `/app/proposals/${p.id}`,
          urgency: "high" as const,
        })),
        ...nextSteps.slice(0, 4).map((o) => ({
          id: o.id,
          title: `${o.nextStep ?? "Próximo passo"} — ${o.title}`,
          detail: `${o.client.name} · ${o.nextStepDate && dateOnlyKey(o.nextStepDate) < todayKey ? "próximo passo vencido" : "previsto para hoje"}`,
          href: `/app/opportunities/${o.id}`,
          urgency: "medium" as const,
        })),
      ],
    },
    {
      key: "stale",
      title: "Oportunidades paradas",
      href: "/app/opportunities/radar?category=AT_RISK",
      total: stale.length,
      items: stale.slice(0, 4).map((o) => ({
        id: o.id,
        title: o.title,
        detail: [o.client.name, money(toNumber(o.value)), `sem atividade há ${days(o.lastActivityAt)} dias`].filter(Boolean).join(" · "),
        href: `/app/opportunities/${o.id}`,
        urgency: "high" as const,
      })),
    },
    {
      key: "clients",
      title: "Clientes sem contato recente",
      href: `/app/clients?inactive=${s.briefInactiveClientDays}`,
      total: clients.length,
      items: clients.slice(0, 4).map((c) => ({
        id: c.id,
        title: c.name,
        detail: `${c.lastInteractionAt ? `sem interação há ${days(c.lastInteractionAt)} dias` : "nenhuma interação registrada"}${c.isKeyAccount ? " · conta estratégica" : ""}`,
        href: `/app/clients/${c.id}`,
        urgency: c.isKeyAccount ? ("high" as const) : ("low" as const),
      })),
    },
    {
      key: "contracts",
      title: "Contratos vencendo em 30 dias",
      href: "/app/contracts/radar",
      total: contracts.length,
      items: contracts.slice(0, 4).map((c) => {
        const left = c.endDate ? diffKeys(todayKey, dateOnlyKey(c.endDate)) : 0;
        return { id: c.id, title: `${c.number} — ${c.client.name}`, detail: `vence em ${left} dia(s)`, href: `/app/contracts/${c.id}`, urgency: left <= 7 ? ("high" as const) : ("medium" as const) };
      }),
    },
    {
      key: "projects",
      title: "Projetos atrasados",
      href: "/app/projects?overdue=1",
      total: projects.length,
      items: projects.slice(0, 4).map((p) => ({
        id: p.id,
        title: p.name,
        detail: p.dueDate && dateOnlyKey(p.dueDate) < todayKey ? `prazo vencido há ${diffKeys(dateOnlyKey(p.dueDate), todayKey)} dia(s)` : "marcado como atrasado",
        href: `/app/projects/${p.id}`,
        urgency: "high" as const,
      })),
    },
    {
      key: "receivables",
      title: "Recebimentos vencidos",
      href: "/app/finance?status=OVERDUE",
      total: receivables.length,
      items: receivables.slice(0, 4).map((r) => ({
        id: r.id,
        title: r.description,
        detail: [r.client?.name, money(toNumber(r.amount)), `venceu há ${diffKeys(dateOnlyKey(r.dueDate), todayKey)} dia(s)`].filter(Boolean).join(" · "),
        href: `/app/finance?status=OVERDUE`,
        urgency: "high" as const,
      })),
    },
    {
      key: "decisions",
      title: "Decisões aguardando você",
      href: "/app/decisions",
      total: decisions.length,
      items: decisions.slice(0, 4).map((d) => ({ id: d.id, title: d.title, href: "/app/decisions", urgency: "medium" as const })),
    },
  ].filter((sct) => sct.total > 0);

  const parts: string[] = [];
  if (meetings.length) parts.push(`${meetings.length} reunião(ões) hoje`);
  if (tasks.length) parts.push(`${tasks.length} tarefa(s) para hoje ou atrasadas`);
  if (proposals.length) parts.push(`${proposals.length} proposta(s) aguardando follow-up`);
  if (contracts.length) parts.push(`${contracts.length} contrato(s) vencendo em 30 dias`);
  if (projects.length) parts.push(`${projects.length} projeto(s) atrasado(s)`);
  const headline = parts.length ? `Hoje você tem ${parts.join(", ")}.` : "Nada urgente para hoje. Bom momento para trabalhar no pipeline e nos relacionamentos.";
  return { greeting: greetingFor(ctx), headline, sections, teamWide };
}

// ───────────── O que mudou desde a última visita? ─────────────

export interface ChangeSummary {
  since: Date | null;
  counts: { key: string; label: string; value: number; href: string }[];
  recent: { id: string; title: string; actorName: string | null; occurredAt: Date; href: string | null; action: string; channel: string | null }[];
}

const ENTITY_HREF: Record<string, (id: string) => string> = {
  client: (id) => `/app/clients/${id}`,
  lead: (id) => `/app/leads/${id}`,
  opportunity: (id) => `/app/opportunities/${id}`,
  project: (id) => `/app/projects/${id}`,
  task: (id) => `/app/tasks/${id}`,
  meeting: (id) => `/app/meetings/${id}`,
  proposal: (id) => `/app/proposals/${id}`,
  contract: (id) => `/app/contracts/${id}`,
};

export function hrefFor(entityType: string | null | undefined, id: string | null | undefined) {
  if (!entityType || !id) return null;
  return ENTITY_HREF[entityType]?.(id) ?? null;
}

export async function getWhatChanged(ctx: Ctx): Promise<ChangeSummary> {
  const since = ctx.member?.previousVisitAt ?? null;
  const from = since ?? new Date(Date.now() - DAY_MS);
  const range = { gte: from };
  const [leads, won, lost, moved, accepted, viewed, done, newClients, signed, recent] = await Promise.all([
    ctx.db.lead.count({ where: { createdAt: range } }),
    ctx.db.opportunity.count({ where: { status: "WON", wonAt: range } }),
    ctx.db.opportunity.count({ where: { status: "LOST", lostAt: range } }),
    ctx.db.activity.count({ where: { action: "opportunity.stage_changed", occurredAt: range } }),
    ctx.db.proposal.count({ where: { status: "ACCEPTED", acceptedAt: range } }),
    ctx.db.proposal.count({ where: { viewedAt: range } }),
    ctx.db.task.count({ where: { status: "DONE", completedAt: range } }),
    ctx.db.client.count({ where: { createdAt: range } }),
    ctx.db.contract.count({ where: { createdAt: range, status: { in: ["ACTIVE", "RENEWED"] } } }),
    ctx.db.activity.findMany({
      where: { occurredAt: range, NOT: { actorId: ctx.user.id } },
      orderBy: { occurredAt: "desc" },
      take: 8,
      select: { id: true, title: true, action: true, channel: true, entityType: true, entityId: true, occurredAt: true, actor: { select: { name: true } } },
    }),
  ]);
  const counts = [
    { key: "leads", label: ["novo lead", "novos leads"], value: leads, href: "/app/leads" },
    { key: "won", label: ["negócio ganho", "negócios ganhos"], value: won, href: "/app/opportunities?status=WON" },
    { key: "lost", label: ["negócio perdido", "negócios perdidos"], value: lost, href: "/app/opportunities?status=LOST" },
    { key: "moved", label: ["mudança de etapa", "mudanças de etapa"], value: moved, href: "/app/pipeline" },
    { key: "accepted", label: ["proposta aceita", "propostas aceitas"], value: accepted, href: "/app/proposals?status=ACCEPTED" },
    { key: "viewed", label: ["proposta visualizada", "propostas visualizadas"], value: viewed, href: "/app/proposals" },
    { key: "done", label: ["tarefa concluída", "tarefas concluídas"], value: done, href: "/app/tasks?status=DONE" },
    { key: "clients", label: ["novo cliente", "novos clientes"], value: newClients, href: "/app/clients" },
    { key: "contracts", label: ["contrato registrado", "contratos registrados"], value: signed, href: "/app/contracts" },
  ]
    .filter((c) => c.value > 0)
    .map((c) => ({ ...c, label: c.value === 1 ? c.label[0]! : c.label[1]! }));
  return {
    since,
    counts,
    recent: recent.map((a) => ({ id: a.id, title: a.title, action: a.action, channel: a.channel, actorName: a.actor?.name ?? null, occurredAt: a.occurredAt, href: hrefFor(a.entityType, a.entityId) })),
  };
}

// ───────────── Córtex Insights + detecção de anomalias ─────────────

export async function getInsights(ctx: Ctx): Promise<{ insights: Insight[]; anomalies: Insight[]; snapshotsDays: number }> {
  const now = new Date();
  const year = new Date(now.getTime() - 365 * DAY_MS);
  const since180 = new Date(now.getTime() - 180 * DAY_MS);
  const since90 = new Date(now.getTime() - 90 * DAY_MS);
  const staleDays = Math.max(14, ctx.org.settings.followUpDays * 2);
  const finance = can(ctx, "finance.read");
  const money = (v: number) => (finance ? formatCurrency(v, ctx.org.currency, { compact: true }) : "valor restrito");
  const [closed, stale, completedProjects, proposals, contracts, weekly, conv, snapshotsCount] = await Promise.all([
    ctx.db.opportunity.findMany({
      where: { OR: [{ status: "WON", wonAt: { gte: year } }, { status: "LOST", lostAt: { gte: year } }] },
      select: { status: true, source: true, closeReason: true, createdAt: true, wonAt: true, lostAt: true },
    }),
    ctx.db.opportunity.aggregate({ where: { status: "OPEN", lastActivityAt: { lt: new Date(now.getTime() - staleDays * DAY_MS) } }, _count: { _all: true }, _sum: { value: true } }),
    ctx.db.project.findMany({
      where: { status: "COMPLETED", completedAt: { gte: year }, startDate: { not: null }, dueDate: { not: null } },
      select: { startDate: true, dueDate: true, completedAt: true, client: { select: { industry: true } } },
    }),
    ctx.db.proposal.groupBy({ by: ["status"], where: { status: { in: ["ACCEPTED", "REJECTED"] }, statusChangedAt: { gte: year } }, _count: { _all: true } }),
    ctx.db.contract.findMany({ where: { status: "ACTIVE" }, select: { value: true, recurrence: true, clientId: true, client: { select: { name: true } } } }),
    ctx.db.opportunity.findMany({ where: { createdAt: { gte: new Date(now.getTime() - 84 * DAY_MS) } }, select: { createdAt: true } }),
    Promise.all([
      ctx.db.opportunity.count({ where: { status: "WON", wonAt: { gte: since90 } } }),
      ctx.db.opportunity.count({ where: { status: "LOST", lostAt: { gte: since90 } } }),
      ctx.db.opportunity.count({ where: { status: "WON", wonAt: { gte: since180, lt: since90 } } }),
      ctx.db.opportunity.count({ where: { status: "LOST", lostAt: { gte: since180, lt: since90 } } }),
    ]),
    ctx.db.metricSnapshot.count({ where: { metric: "pipeline.open" } }),
  ]);

  const sources = new Map<string, { source: string; won: number; lost: number }>();
  for (const c of closed) {
    const s = sources.get(c.source) ?? { source: c.source, won: 0, lost: 0 };
    if (c.status === "WON") s.won++;
    else s.lost++;
    sources.set(c.source, s);
  }
  const lossMap = new Map<string, number>();
  for (const c of closed.filter((x) => x.status === "LOST" && x.closeReason)) lossMap.set(c.closeReason!, (lossMap.get(c.closeReason!) ?? 0) + 1);
  const segMap = new Map<string, { projects: number; overrunSum: number }>();
  for (const p of completedProjects) {
    const seg = p.client?.industry;
    if (!seg || !p.startDate || !p.dueDate || !p.completedAt) continue;
    const planned = Math.max(1, (p.dueDate.getTime() - p.startDate.getTime()) / DAY_MS);
    const actual = Math.max(0, (p.completedAt.getTime() - p.startDate.getTime()) / DAY_MS);
    const s = segMap.get(seg) ?? { projects: 0, overrunSum: 0 };
    s.projects++;
    s.overrunSum += ((actual - planned) / planned) * 100;
    segMap.set(seg, s);
  }
  const wonDeals = closed.filter((c) => c.status === "WON" && c.wonAt);
  const byClient = new Map<string, { name: string; mrr: number }>();
  for (const c of contracts) {
    const e = byClient.get(c.clientId) ?? { name: c.client.name, mrr: 0 };
    e.mrr += monthlyEquivalent(toNumber(c.value), c.recurrence);
    byClient.set(c.clientId, e);
  }
  const totalMrr = [...byClient.values()].reduce((s, x) => s + x.mrr, 0);
  const top = [...byClient.values()].sort((a, b) => b.mrr - a.mrr)[0];
  const insights = detectInsights({
    winBySource: [...sources.values()],
    lossReasons: [...lossMap.entries()].map(([reason, count]) => ({ reason, count })),
    lossReasonsPeriodLabel: "nos últimos 12 meses",
    staleOpportunities: { count: stale._count._all, value: toNumber(stale._sum.value), days: staleDays },
    projectOverrunBySegment: [...segMap.entries()].map(([segment, v]) => ({ segment, projects: v.projects, avgOverrunPct: v.overrunSum / v.projects })),
    salesCycle: { won: wonDeals.length, avgDays: wonDeals.length ? wonDeals.reduce((s, w) => s + (w.wonAt!.getTime() - w.createdAt.getTime()) / DAY_MS, 0) / wonDeals.length : 0 },
    proposals: {
      decided: proposals.reduce((s, p) => s + p._count._all, 0),
      accepted: proposals.find((p) => p.status === "ACCEPTED")?._count._all ?? 0,
    },
    concentration: { topClientName: top?.name ?? null, topShare: totalMrr > 0 && top ? top.mrr / totalMrr : 0, clientsWithRevenue: byClient.size },
    formatMoney: money,
  });

  const weeks = Array.from({ length: 12 }, () => 0);
  for (const o of weekly) {
    const idx = 11 - Math.floor((now.getTime() - o.createdAt.getTime()) / (7 * DAY_MS));
    if (idx >= 0 && idx < 12) weeks[idx]!++;
  }
  const [pipelineNow, pipeline30, delayedNow, delayed28] = await Promise.all([
    ctx.db.opportunity.aggregate({ where: { status: "OPEN" }, _sum: { value: true } }).then((r) => toNumber(r._sum.value)),
    snapshotAgo(ctx, "pipeline.open", 30),
    ctx.db.project.count({ where: { OR: [{ status: "DELAYED" }, { status: "ACTIVE", dueDate: { lt: keyToDate(todayOf(ctx)) } }] } }),
    snapshotAgo(ctx, "projects.delayed", 28),
  ]);
  // Só considera a série semanal quando o workspace existe há 12 semanas (evita falsa “queda” em contas novas)
  const orgAgeWeeks = await ctx.db.opportunity.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  const oldEnough = orgAgeWeeks ? now.getTime() - orgAgeWeeks.createdAt.getTime() >= 84 * DAY_MS : false;
  const anomalies = detectAnomalies({
    weeklyNewOpportunities: oldEnough ? weeks : [],
    delayedProjectsNow: delayedNow,
    delayedProjects4wAgo: delayed28,
    pipelineNow,
    pipeline30dAgo: pipeline30,
    conversion: { recentWon: conv[0], recentLost: conv[1], prevWon: conv[2], prevLost: conv[3] },
    formatMoney: money,
  });
  return { insights, anomalies, snapshotsDays: snapshotsCount };
}
