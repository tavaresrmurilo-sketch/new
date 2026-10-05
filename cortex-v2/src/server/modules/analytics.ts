import "server-only";
import type { Prisma } from "@prisma/client";
import { addDaysToKey, DAY_MS, dateOnlyKey, dayKeyInTz, keyToDate, periodRange, type PeriodKey, type PeriodRange } from "@/lib/dates";
import { toNumber } from "@/lib/utils";
import type { Ctx } from "@/server/auth/context";
import { forecastPeriod, weightedPipeline, type PeriodForecast } from "@/server/intelligence/forecast";
import { monthlyEquivalent } from "@/server/modules/contracts";

export interface Filters {
  clientId?: string;
  projectId?: string;
  ownerId?: string;
}

export function resolvePeriod(ctx: Ctx, key: PeriodKey, custom?: { from?: string; to?: string }): PeriodRange {
  return periodRange(key, ctx.org.timezone, new Date(), custom);
}

const oppScope = (f: Filters): Prisma.OpportunityWhereInput => ({
  ...(f.clientId ? { clientId: f.clientId } : {}),
  ...(f.ownerId ? { ownerId: f.ownerId } : {}),
  ...(f.projectId ? { projects: { some: { id: f.projectId } } } : {}),
});

/** Pipeline aberto: bruto, ponderado (valor × probabilidade) e por etapa. */
export async function pipelineMetrics(ctx: Ctx, f: Filters = {}) {
  const opps = await ctx.db.opportunity.findMany({
    where: { status: "OPEN", ...oppScope(f) },
    select: { id: true, value: true, probability: true, stageId: true, expectedCloseDate: true, lastActivityAt: true, stage: { select: { name: true, order: true, probability: true } } },
  });
  const rows = opps.map((o) => ({ ...o, v: toNumber(o.value), p: o.probability ?? o.stage.probability }));
  const wp = weightedPipeline(rows.map((r) => ({ value: r.v, probability: r.p })));
  const byStage = new Map<string, { stageId: string; name: string; order: number; count: number; value: number; weighted: number }>();
  for (const r of rows) {
    const s = byStage.get(r.stageId) ?? { stageId: r.stageId, name: r.stage.name, order: r.stage.order, count: 0, value: 0, weighted: 0 };
    s.count++;
    s.value += r.v;
    s.weighted += (r.v * r.p) / 100;
    byStage.set(r.stageId, s);
  }
  return { ...wp, byStage: [...byStage.values()].sort((a, b) => a.order - b.order), rows };
}

/** Indicadores de fluxo de um período (para comparação com o período anterior). */
export async function periodFlow(ctx: Ctx, start: Date, end: Date, f: Filters = {}) {
  const range = { gte: start, lt: end };
  const scope = oppScope(f);
  const [newLeads, newOpps, won, lost, received, newClients, tasksCompleted] = await Promise.all([
    ctx.db.lead.count({ where: { createdAt: range, ...(f.ownerId ? { ownerId: f.ownerId } : {}) } }),
    ctx.db.opportunity.count({ where: { createdAt: range, ...scope } }),
    ctx.db.opportunity.aggregate({ where: { status: "WON", wonAt: range, ...scope }, _sum: { value: true }, _count: { _all: true } }),
    ctx.db.opportunity.count({ where: { status: "LOST", lostAt: range, ...scope } }),
    ctx.db.receivable.aggregate({
      where: { status: "RECEIVED", receivedAt: range, ...(f.clientId ? { clientId: f.clientId } : {}), ...(f.projectId ? { projectId: f.projectId } : {}) },
      _sum: { amount: true },
    }),
    ctx.db.client.count({ where: { createdAt: range } }),
    ctx.db.task.count({ where: { status: "DONE", completedAt: range, ...(f.ownerId ? { assigneeId: f.ownerId } : {}), ...(f.projectId ? { projectId: f.projectId } : {}) } }),
  ]);
  const wonValue = toNumber(won._sum.value);
  const wonCount = won._count._all;
  const closed = wonCount + lost;
  return {
    newLeads,
    newOpps,
    wonValue,
    wonCount,
    lostCount: lost,
    conversionRate: closed ? (wonCount / closed) * 100 : null,
    ticket: wonCount ? wonValue / wonCount : null,
    received: toNumber(received._sum.amount),
    newClients,
    tasksCompleted,
  };
}

/** Receita contratada no período: contratos assinados no período + valor mensal equivalente dos recorrentes ativos. */
export async function contractedRevenue(ctx: Ctx, start: Date, end: Date, f: Filters = {}) {
  const where: Prisma.ContractWhereInput = { status: { in: ["ACTIVE", "RENEWED", "EXPIRED"] }, ...(f.clientId ? { clientId: f.clientId } : {}), ...(f.ownerId ? { ownerId: f.ownerId } : {}) };
  const [signed, active] = await Promise.all([
    ctx.db.contract.findMany({ where: { ...where, startDate: { gte: start, lt: end } }, select: { value: true, recurrence: true } }),
    ctx.db.contract.findMany({ where: { ...where, status: "ACTIVE" }, select: { value: true, recurrence: true } }),
  ]);
  const signedValue = signed.reduce((s, c) => s + toNumber(c.value), 0);
  const mrr = active.reduce((s, c) => s + monthlyEquivalent(toNumber(c.value), c.recurrence), 0);
  return { signedValue, signedCount: signed.length, activeCount: active.length, mrr, activeValue: active.reduce((s, c) => s + toNumber(c.value), 0) };
}

/** Receita prevista do período: pipeline ponderado com fechamento previsto no período + recebíveis a vencer no período. */
export async function forecastFor(ctx: Ctx, range: PeriodRange, f: Filters = {}): Promise<PeriodForecast & { pendingReceivables: number }> {
  const startD = keyToDate(range.startKey);
  const endD = keyToDate(addDaysToKey(range.endKey, 1));
  const now = new Date();
  const [open, won, history, pending] = await Promise.all([
    ctx.db.opportunity.findMany({
      where: { status: "OPEN", expectedCloseDate: { gte: startD, lt: endD }, ...oppScope(f) },
      select: { value: true, probability: true, stage: { select: { probability: true } } },
    }),
    ctx.db.opportunity.aggregate({ where: { status: "WON", wonAt: { gte: range.start, lt: range.end }, ...oppScope(f) }, _sum: { value: true } }),
    Promise.all([
      ctx.db.opportunity.count({ where: { status: "WON", wonAt: { gte: new Date(now.getTime() - 180 * DAY_MS) }, ...oppScope(f) } }),
      ctx.db.opportunity.count({ where: { status: "LOST", lostAt: { gte: new Date(now.getTime() - 180 * DAY_MS) }, ...oppScope(f) } }),
    ]),
    ctx.db.receivable.aggregate({
      where: { status: "PENDING", dueDate: { gte: startD, lt: endD }, ...(f.clientId ? { clientId: f.clientId } : {}), ...(f.projectId ? { projectId: f.projectId } : {}) },
      _sum: { amount: true },
    }),
  ]);
  const fc = forecastPeriod({
    wonInPeriod: toNumber(won._sum.value),
    openInPeriod: open.map((o) => ({ value: toNumber(o.value), probability: o.probability ?? o.stage.probability })),
    history: { won: history[0], lost: history[1] },
  });
  return { ...fc, pendingReceivables: toNumber(pending._sum.amount) };
}

/** Série mensal (últimos N meses): ganhos, recebido e novas oportunidades — para gráficos. */
export async function monthlySeries(ctx: Ctx, months = 6, f: Filters = {}) {
  const todayKey = dayKeyInTz(new Date(), ctx.org.timezone);
  const [y, m] = todayKey.split("-").map(Number) as [number, number];
  const out: { key: string; label: string; won: number; received: number; newOpps: number; lost: number }[] = [];
  const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const r = periodRange("custom", ctx.org.timezone, new Date(), { from: `${key}-01`, to: dateOnlyKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12))) });
    const flow = await periodFlow(ctx, r.start, r.end, f);
    out.push({ key, label: `${names[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`, won: flow.wonValue, received: flow.received, newOpps: flow.newOpps, lost: flow.lostCount });
  }
  return out;
}

/** Contagens de estado atuais (para KPIs do dashboard). */
export async function stateCounts(ctx: Ctx, f: Filters = {}) {
  const todayKey = dayKeyInTz(new Date(), ctx.org.timezone);
  const today = keyToDate(todayKey);
  const [activeClients, openLeads, openOpps, openProposals, activeContracts, activeProjects, overdueTasks] = await Promise.all([
    ctx.db.client.count({ where: { status: "ACTIVE", ...(f.ownerId ? { ownerId: f.ownerId } : {}) } }),
    ctx.db.lead.count({ where: { status: { in: ["NEW", "CONTACTED", "QUALIFIED"] }, ...(f.ownerId ? { ownerId: f.ownerId } : {}) } }),
    ctx.db.opportunity.count({ where: { status: "OPEN", ...oppScope(f) } }),
    ctx.db.proposal.aggregate({ where: { status: { in: ["SENT", "VIEWED", "NEGOTIATION"] }, ...(f.clientId ? { clientId: f.clientId } : {}), ...(f.ownerId ? { ownerId: f.ownerId } : {}) }, _count: { _all: true }, _sum: { total: true } }),
    ctx.db.contract.count({ where: { status: "ACTIVE", ...(f.clientId ? { clientId: f.clientId } : {}) } }),
    ctx.db.project.count({ where: { status: { in: ["ACTIVE", "DELAYED"] }, ...(f.clientId ? { clientId: f.clientId } : {}), ...(f.ownerId ? { managerId: f.ownerId } : {}) } }),
    ctx.db.task.count({ where: { status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] }, dueDate: { lt: today }, ...(f.ownerId ? { assigneeId: f.ownerId } : {}), ...(f.projectId ? { projectId: f.projectId } : {}) } }),
  ]);
  return {
    activeClients,
    openLeads,
    openOpps,
    openProposals: openProposals._count._all,
    openProposalsValue: toNumber(openProposals._sum.total),
    activeContracts,
    activeProjects,
    overdueTasks,
  };
}

/** Win/Loss: motivos, origem e etapa de perda no período. */
export async function winLossAnalysis(ctx: Ctx, start: Date, end: Date) {
  const closed = await ctx.db.opportunity.findMany({
    where: { OR: [{ status: "WON", wonAt: { gte: start, lt: end } }, { status: "LOST", lostAt: { gte: start, lt: end } }] },
    select: { status: true, closeReason: true, source: true, value: true, createdAt: true, wonAt: true, lostAt: true, competitors: true, ownerId: true, owner: { select: { name: true } } },
  });
  const won = closed.filter((c) => c.status === "WON");
  const lost = closed.filter((c) => c.status === "LOST");
  const tally = <T,>(list: T[], key: (t: T) => string | null) => {
    const m = new Map<string, number>();
    for (const x of list) {
      const k = key(x) ?? "OTHER";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count);
  };
  const sources = new Map<string, { source: string; won: number; lost: number }>();
  for (const c of closed) {
    const s = sources.get(c.source) ?? { source: c.source, won: 0, lost: 0 };
    if (c.status === "WON") s.won++;
    else s.lost++;
    sources.set(c.source, s);
  }
  const competitors = tally(lost.flatMap((l) => l.competitors), (c) => c);
  const cycleDays = won.map((w) => (w.wonAt!.getTime() - w.createdAt.getTime()) / DAY_MS);
  return {
    total: closed.length,
    won: won.length,
    lost: lost.length,
    winRate: closed.length ? (won.length / closed.length) * 100 : null,
    wonValue: won.reduce((s, w) => s + toNumber(w.value), 0),
    lostValue: lost.reduce((s, w) => s + toNumber(w.value), 0),
    lossReasons: tally(lost, (l) => l.closeReason),
    winReasons: tally(won, (w) => w.closeReason),
    bySource: [...sources.values()].sort((a, b) => b.won + b.lost - (a.won + a.lost)),
    competitors,
    avgCycleDays: cycleDays.length ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length : null,
  };
}
