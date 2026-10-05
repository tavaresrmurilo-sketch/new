import "server-only";
import { DAY_MS, dateOnlyKey, dayKeyInTz, diffKeys, keyToDate, type PeriodRange } from "@/lib/dates";
import { CLOSE_REASON, labelOf, PROJECT_STATUS, PROPOSAL_STATUS, CONTRACT_STATUS, RECURRENCE_LABELS, SOURCE_LABELS, CLIENT_STATUS } from "@/lib/labels";
import type { Permission } from "@/lib/permissions";
import { toNumber } from "@/lib/utils";
import { can, type Ctx } from "@/server/auth/context";
import { clientHealthBatch } from "@/server/modules/clients";
import { monthlyEquivalent } from "@/server/modules/contracts";
import { projectHealthBatch } from "@/server/modules/projects";
import { getWorkloadMap } from "@/server/modules/workload";

export type CellType = "text" | "money" | "number" | "percent" | "date";
export interface ReportColumn {
  key: string;
  label: string;
  type: CellType;
}
export type ReportRow = Record<string, string | number | null> & { _href?: string | null };
export interface ReportKpi {
  label: string;
  value: number | null;
  type: CellType;
}
export interface ReportData {
  columns: ReportColumn[];
  rows: ReportRow[];
  kpis: ReportKpi[];
  chart?: { type: "bar"; xKey: string; series: { key: string; label: string }[]; format: "currency" | "number"; data: Record<string, string | number>[] };
  note?: string;
}

export interface ReportDefinition {
  key: string;
  title: string;
  description: string;
  permission: Permission;
  /** relatório usa período (senão é uma fotografia do estado atual) */
  usesPeriod: boolean;
  /** contém valores monetários (exige finance.read) */
  financial?: boolean;
  load: (ctx: Ctx, range: PeriodRange) => Promise<ReportData>;
}

const MAX_ROWS = 5000;
const inRange = (r: PeriodRange) => ({ gte: r.start, lt: r.end });
const labelText = (map: Parameters<typeof labelOf>[0], v: string | null | undefined) => labelOf(map, v).label;

export const REPORTS: ReportDefinition[] = [
  {
    key: "sales",
    title: "Vendas",
    description: "Negócios ganhos no período, por responsável e origem.",
    permission: "opportunities.read",
    usesPeriod: true,
    financial: true,
    async load(ctx, range) {
      const won = await ctx.db.opportunity.findMany({
        where: { status: "WON", wonAt: inRange(range) },
        orderBy: { wonAt: "desc" },
        take: MAX_ROWS,
        select: { id: true, title: true, value: true, wonAt: true, createdAt: true, source: true, closeReason: true, client: { select: { name: true } }, owner: { select: { name: true } } },
      });
      const total = won.reduce((s, o) => s + toNumber(o.value), 0);
      const cycles = won.map((o) => (o.wonAt!.getTime() - o.createdAt.getTime()) / DAY_MS);
      const byOwner = new Map<string, number>();
      for (const o of won) byOwner.set(o.owner?.name ?? "Sem responsável", (byOwner.get(o.owner?.name ?? "Sem responsável") ?? 0) + toNumber(o.value));
      return {
        kpis: [
          { label: "Receita ganha", value: total, type: "money" },
          { label: "Negócios ganhos", value: won.length, type: "number" },
          { label: "Ticket médio", value: won.length ? total / won.length : null, type: "money" },
          { label: "Ciclo médio (dias)", value: cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null, type: "number" },
        ],
        columns: [
          { key: "title", label: "Oportunidade", type: "text" },
          { key: "client", label: "Cliente", type: "text" },
          { key: "owner", label: "Responsável", type: "text" },
          { key: "source", label: "Origem", type: "text" },
          { key: "reason", label: "Motivo do ganho", type: "text" },
          { key: "value", label: "Valor", type: "money" },
          { key: "wonAt", label: "Ganho em", type: "date" },
          { key: "cycle", label: "Ciclo (dias)", type: "number" },
        ],
        rows: won.map((o) => ({
          _href: `/app/opportunities/${o.id}`,
          title: o.title,
          client: o.client.name,
          owner: o.owner?.name ?? "—",
          source: SOURCE_LABELS[o.source] ?? o.source,
          reason: o.closeReason ? (CLOSE_REASON[o.closeReason] ?? o.closeReason) : "—",
          value: toNumber(o.value),
          wonAt: dateOnlyKey(o.wonAt!),
          cycle: Math.round((o.wonAt!.getTime() - o.createdAt.getTime()) / DAY_MS),
        })),
        chart: { type: "bar", xKey: "owner", series: [{ key: "value", label: "Receita ganha" }], format: "currency", data: [...byOwner.entries()].map(([owner, value]) => ({ owner, value })) },
      };
    },
  },
  {
    key: "pipeline",
    title: "Pipeline",
    description: "Oportunidades em aberto por etapa, com valor ponderado e dias sem atividade.",
    permission: "opportunities.read",
    usesPeriod: false,
    financial: true,
    async load(ctx) {
      const opps = await ctx.db.opportunity.findMany({
        where: { status: "OPEN" },
        orderBy: [{ stage: { order: "asc" } }, { value: "desc" }],
        take: MAX_ROWS,
        select: { id: true, title: true, value: true, probability: true, expectedCloseDate: true, lastActivityAt: true, stage: { select: { name: true, probability: true, order: true } }, client: { select: { name: true } }, owner: { select: { name: true } } },
      });
      const now = Date.now();
      const rows = opps.map((o) => {
        const p = o.probability ?? o.stage.probability;
        const v = toNumber(o.value);
        return { o, p, v, w: (v * p) / 100 };
      });
      const byStage = new Map<string, { stage: string; value: number; weighted: number; order: number }>();
      for (const r of rows) {
        const s = byStage.get(r.o.stage.name) ?? { stage: r.o.stage.name, value: 0, weighted: 0, order: r.o.stage.order };
        s.value += r.v;
        s.weighted += r.w;
        byStage.set(r.o.stage.name, s);
      }
      return {
        kpis: [
          { label: "Pipeline bruto", value: rows.reduce((s, r) => s + r.v, 0), type: "money" },
          { label: "Pipeline ponderado", value: rows.reduce((s, r) => s + r.w, 0), type: "money" },
          { label: "Oportunidades abertas", value: rows.length, type: "number" },
          { label: "Sem atividade há 14+ dias", value: rows.filter((r) => now - r.o.lastActivityAt.getTime() > 14 * DAY_MS).length, type: "number" },
        ],
        columns: [
          { key: "title", label: "Oportunidade", type: "text" },
          { key: "client", label: "Cliente", type: "text" },
          { key: "stage", label: "Etapa", type: "text" },
          { key: "owner", label: "Responsável", type: "text" },
          { key: "value", label: "Valor", type: "money" },
          { key: "probability", label: "Probabilidade", type: "percent" },
          { key: "weighted", label: "Ponderado", type: "money" },
          { key: "expected", label: "Previsão", type: "date" },
          { key: "idle", label: "Dias sem atividade", type: "number" },
        ],
        rows: rows.map((r) => ({
          _href: `/app/opportunities/${r.o.id}`,
          title: r.o.title,
          client: r.o.client.name,
          stage: r.o.stage.name,
          owner: r.o.owner?.name ?? "—",
          value: r.v,
          probability: r.p,
          weighted: Math.round(r.w * 100) / 100,
          expected: r.o.expectedCloseDate ? dateOnlyKey(r.o.expectedCloseDate) : null,
          idle: Math.floor((now - r.o.lastActivityAt.getTime()) / DAY_MS),
        })),
        chart: { type: "bar", xKey: "stage", series: [{ key: "value", label: "Bruto" }, { key: "weighted", label: "Ponderado" }], format: "currency", data: [...byStage.values()].sort((a, b) => a.order - b.order).map((s) => ({ stage: s.stage, value: Math.round(s.value), weighted: Math.round(s.weighted) })) },
      };
    },
  },
  {
    key: "conversion",
    title: "Conversão",
    description: "Funil do período: leads, oportunidades criadas, ganhas e perdidas por origem.",
    permission: "opportunities.read",
    usesPeriod: true,
    async load(ctx, range) {
      const [leads, opps, won, lost] = await Promise.all([
        ctx.db.lead.groupBy({ by: ["source"], where: { createdAt: inRange(range) }, _count: { _all: true } }),
        ctx.db.opportunity.groupBy({ by: ["source"], where: { createdAt: inRange(range) }, _count: { _all: true } }),
        ctx.db.opportunity.groupBy({ by: ["source"], where: { status: "WON", wonAt: inRange(range) }, _count: { _all: true } }),
        ctx.db.opportunity.groupBy({ by: ["source"], where: { status: "LOST", lostAt: inRange(range) }, _count: { _all: true } }),
      ]);
      const sources = new Set([...leads, ...opps, ...won, ...lost].map((r) => r.source));
      const get = (rows: { source: string; _count: { _all: number } }[], s: string) => rows.find((r) => r.source === s)?._count._all ?? 0;
      const rows = [...sources].map((s) => {
        const w = get(won, s);
        const l = get(lost, s);
        return { source: SOURCE_LABELS[s] ?? s, leads: get(leads, s), opps: get(opps, s), won: w, lost: l, rate: w + l ? Math.round((w / (w + l)) * 1000) / 10 : null };
      });
      const tw = rows.reduce((a, r) => a + r.won, 0);
      const tl = rows.reduce((a, r) => a + r.lost, 0);
      return {
        kpis: [
          { label: "Leads criados", value: rows.reduce((a, r) => a + r.leads, 0), type: "number" },
          { label: "Oportunidades criadas", value: rows.reduce((a, r) => a + r.opps, 0), type: "number" },
          { label: "Ganhas", value: tw, type: "number" },
          { label: "Taxa de ganho", value: tw + tl ? (tw / (tw + tl)) * 100 : null, type: "percent" },
        ],
        columns: [
          { key: "source", label: "Origem", type: "text" },
          { key: "leads", label: "Leads", type: "number" },
          { key: "opps", label: "Oportunidades", type: "number" },
          { key: "won", label: "Ganhas", type: "number" },
          { key: "lost", label: "Perdidas", type: "number" },
          { key: "rate", label: "Taxa de ganho", type: "percent" },
        ],
        rows,
        chart: { type: "bar", xKey: "source", series: [{ key: "opps", label: "Oportunidades" }, { key: "won", label: "Ganhas" }], format: "number", data: rows.map((r) => ({ source: r.source, opps: r.opps, won: r.won })) },
        note: "Taxa de ganho = ganhas ÷ (ganhas + perdidas) no período. Origens com poucos negócios fechados devem ser interpretadas com cautela.",
      };
    },
  },
  {
    key: "clients",
    title: "Clientes",
    description: "Carteira de clientes com saúde do relacionamento, receita recorrente e pendências.",
    permission: "clients.read",
    usesPeriod: false,
    async load(ctx) {
      const clients = await ctx.db.client.findMany({
        where: { status: { in: ["ACTIVE", "PROSPECT", "INACTIVE"] } },
        orderBy: { name: "asc" },
        take: MAX_ROWS,
        select: { id: true, name: true, status: true, industry: true, isKeyAccount: true, lastInteractionAt: true, owner: { select: { name: true } } },
      });
      const [health, contracts] = await Promise.all([
        clientHealthBatch(ctx, clients),
        ctx.db.contract.findMany({ where: { status: "ACTIVE", clientId: { in: clients.map((c) => c.id) } }, select: { clientId: true, value: true, recurrence: true } }),
      ]);
      const mrr = new Map<string, number>();
      for (const c of contracts) mrr.set(c.clientId, (mrr.get(c.clientId) ?? 0) + monthlyEquivalent(toNumber(c.value), c.recurrence));
      const finance = can(ctx, "finance.read");
      const scores = [...health.values()].map((h) => h.score);
      return {
        kpis: [
          { label: "Clientes", value: clients.length, type: "number" },
          { label: "Saúde média", value: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null, type: "number" },
          { label: "Em risco (saúde < 50)", value: scores.filter((s) => s < 50).length, type: "number" },
          ...(finance ? [{ label: "MRR contratado", value: [...mrr.values()].reduce((a, b) => a + b, 0), type: "money" as const }] : []),
        ],
        columns: [
          { key: "name", label: "Cliente", type: "text" },
          { key: "status", label: "Status", type: "text" },
          { key: "industry", label: "Segmento", type: "text" },
          { key: "owner", label: "Responsável", type: "text" },
          { key: "health", label: "Saúde", type: "number" },
          { key: "lastInteraction", label: "Última interação", type: "date" },
          { key: "overdue", label: "Tarefas atrasadas", type: "number" },
          ...(finance ? [{ key: "mrr", label: "MRR", type: "money" as const }] : []),
        ],
        rows: clients.map((c) => {
          const h = health.get(c.id);
          return {
            _href: `/app/clients/${c.id}`,
            name: c.isKeyAccount ? `${c.name} ★` : c.name,
            status: labelText(CLIENT_STATUS, c.status),
            industry: c.industry ?? "—",
            owner: c.owner?.name ?? "—",
            health: h?.score ?? null,
            lastInteraction: c.lastInteractionAt ? dateOnlyKey(c.lastInteractionAt) : null,
            overdue: h?.overdueTasks ?? 0,
            ...(finance ? { mrr: Math.round((mrr.get(c.id) ?? 0) * 100) / 100 } : {}),
          };
        }),
      };
    },
  },
  {
    key: "projects",
    title: "Projetos",
    description: "Projetos em andamento com Project Health Score, progresso, prazo e orçamento.",
    permission: "projects.read",
    usesPeriod: false,
    async load(ctx) {
      const projects = await ctx.db.project.findMany({
        where: { status: { in: ["PLANNING", "ACTIVE", "PAUSED", "DELAYED"] } },
        orderBy: { dueDate: "asc" },
        take: MAX_ROWS,
        select: { id: true, name: true, status: true, progress: true, startDate: true, dueDate: true, budget: true, actualCost: true, client: { select: { name: true } }, manager: { select: { name: true } } },
      });
      const health = await projectHealthBatch(ctx, projects);
      const todayKey = dayKeyInTz(new Date(), ctx.org.timezone);
      const finance = can(ctx, "finance.read");
      const hs = [...health.values()].map((h) => h.score).filter((x): x is number => x !== null);
      return {
        kpis: [
          { label: "Projetos em andamento", value: projects.length, type: "number" },
          { label: "Saúde média", value: hs.length ? hs.reduce((a, b) => a + b, 0) / hs.length : null, type: "number" },
          { label: "Com prazo vencido", value: projects.filter((p) => p.dueDate && dateOnlyKey(p.dueDate) < todayKey).length, type: "number" },
          { label: "Saúde abaixo de 50", value: hs.filter((s) => s < 50).length, type: "number" },
        ],
        columns: [
          { key: "name", label: "Projeto", type: "text" },
          { key: "client", label: "Cliente", type: "text" },
          { key: "manager", label: "Gerente", type: "text" },
          { key: "status", label: "Status", type: "text" },
          { key: "health", label: "Saúde", type: "number" },
          { key: "progress", label: "Progresso", type: "percent" },
          { key: "due", label: "Prazo", type: "date" },
          { key: "overdueTasks", label: "Tarefas atrasadas", type: "number" },
          ...(finance ? [{ key: "budget", label: "Orçamento", type: "money" as const }, { key: "cost", label: "Custo real", type: "money" as const }] : []),
        ],
        rows: projects.map((p) => {
          const h = health.get(p.id);
          return {
            _href: `/app/projects/${p.id}`,
            name: p.name,
            client: p.client?.name ?? "—",
            manager: p.manager?.name ?? "—",
            status: labelText(PROJECT_STATUS, p.status),
            health: h?.score ?? null,
            progress: h?.effectiveProgress ?? p.progress,
            due: p.dueDate ? dateOnlyKey(p.dueDate) : null,
            overdueTasks: h?.overdueTasks ?? 0,
            ...(finance ? { budget: p.budget ? toNumber(p.budget) : null, cost: p.actualCost ? toNumber(p.actualCost) : null } : {}),
          };
        }),
      };
    },
  },
  {
    key: "productivity",
    title: "Produtividade",
    description: "Tarefas concluídas no período, atrasos e ocupação por pessoa.",
    permission: "team.read",
    usesPeriod: true,
    async load(ctx, range) {
      const [map, done, doneLate] = await Promise.all([
        getWorkloadMap(ctx),
        ctx.db.task.groupBy({ by: ["assigneeId"], where: { status: "DONE", completedAt: inRange(range) }, _count: { _all: true } }),
        ctx.db.task.findMany({ where: { status: "DONE", completedAt: inRange(range), dueDate: { not: null } }, select: { assigneeId: true, dueDate: true, completedAt: true } }),
      ]);
      const late = new Map<string, number>();
      const onTime = new Map<string, number>();
      for (const t of doneLate) {
        if (!t.assigneeId) continue;
        const isLate = dateOnlyKey(t.completedAt!) > dateOnlyKey(t.dueDate!);
        (isLate ? late : onTime).set(t.assigneeId, ((isLate ? late : onTime).get(t.assigneeId) ?? 0) + 1);
      }
      const rows = map.members.map((m) => {
        const d = done.find((x) => x.assigneeId === m.userId)?._count._all ?? 0;
        const l = late.get(m.userId) ?? 0;
        const o = onTime.get(m.userId) ?? 0;
        return {
          name: m.user.name,
          done: d,
          onTimeRate: l + o ? Math.round((o / (l + o)) * 1000) / 10 : null,
          open: m.workload.openTasks,
          overdue: m.workload.overdueTasks,
          utilization: m.workload.utilization,
        };
      });
      return {
        kpis: [
          { label: "Tarefas concluídas", value: rows.reduce((a, r) => a + r.done, 0), type: "number" },
          { label: "Abertas", value: rows.reduce((a, r) => a + r.open, 0), type: "number" },
          { label: "Atrasadas", value: rows.reduce((a, r) => a + r.overdue, 0), type: "number" },
          { label: "Ocupação média", value: rows.length ? rows.reduce((a, r) => a + r.utilization, 0) / rows.length : null, type: "percent" },
        ],
        columns: [
          { key: "name", label: "Pessoa", type: "text" },
          { key: "done", label: "Concluídas no período", type: "number" },
          { key: "onTimeRate", label: "Entregues no prazo", type: "percent" },
          { key: "open", label: "Abertas", type: "number" },
          { key: "overdue", label: "Atrasadas", type: "number" },
          { key: "utilization", label: "Ocupação (14 dias)", type: "percent" },
        ],
        rows,
        chart: { type: "bar", xKey: "name", series: [{ key: "done", label: "Concluídas" }], format: "number", data: rows.map((r) => ({ name: r.name.split(" ")[0]!, done: r.done })) },
        note: "Produtividade não é medida apenas por quantidade de tarefas. Use estes números para equilibrar a carga, não para ranquear pessoas.",
      };
    },
  },
  {
    key: "proposals",
    title: "Propostas",
    description: "Propostas criadas no período, status, valor e taxa de aceite.",
    permission: "proposals.read",
    usesPeriod: true,
    financial: true,
    async load(ctx, range) {
      const rows = await ctx.db.proposal.findMany({
        where: { createdAt: inRange(range) },
        orderBy: { createdAt: "desc" },
        take: MAX_ROWS,
        select: { id: true, number: true, title: true, status: true, total: true, sentAt: true, viewedAt: true, viewCount: true, acceptedAt: true, createdAt: true, client: { select: { name: true } }, owner: { select: { name: true } } },
      });
      const decided = rows.filter((r) => r.status === "ACCEPTED" || r.status === "REJECTED");
      const accepted = rows.filter((r) => r.status === "ACCEPTED");
      return {
        kpis: [
          { label: "Propostas criadas", value: rows.length, type: "number" },
          { label: "Valor total", value: rows.reduce((s, r) => s + toNumber(r.total), 0), type: "money" },
          { label: "Aceitas", value: accepted.length, type: "number" },
          { label: "Taxa de aceite (decididas)", value: decided.length ? (accepted.length / decided.length) * 100 : null, type: "percent" },
        ],
        columns: [
          { key: "number", label: "Nº", type: "number" },
          { key: "title", label: "Proposta", type: "text" },
          { key: "client", label: "Cliente", type: "text" },
          { key: "owner", label: "Responsável", type: "text" },
          { key: "status", label: "Status", type: "text" },
          { key: "total", label: "Valor", type: "money" },
          { key: "sentAt", label: "Enviada em", type: "date" },
          { key: "views", label: "Visualizações", type: "number" },
        ],
        rows: rows.map((r) => ({
          _href: `/app/proposals/${r.id}`,
          number: r.number,
          title: r.title,
          client: r.client.name,
          owner: r.owner?.name ?? "—",
          status: labelText(PROPOSAL_STATUS, r.status),
          total: toNumber(r.total),
          sentAt: r.sentAt ? dateOnlyKey(r.sentAt) : null,
          views: r.viewCount,
        })),
        note: "Visualizações contam somente aberturas reais do link público da proposta.",
      };
    },
  },
  {
    key: "contracts",
    title: "Contratos",
    description: "Contratos ativos, receita recorrente equivalente e vencimentos.",
    permission: "contracts.read",
    usesPeriod: false,
    financial: true,
    async load(ctx) {
      const todayKey = dayKeyInTz(new Date(), ctx.org.timezone);
      const contracts = await ctx.db.contract.findMany({
        where: { status: { in: ["ACTIVE", "DRAFT"] } },
        orderBy: { endDate: "asc" },
        take: MAX_ROWS,
        select: { id: true, number: true, title: true, status: true, value: true, recurrence: true, startDate: true, endDate: true, renewalType: true, client: { select: { name: true } } },
      });
      const active = contracts.filter((c) => c.status === "ACTIVE");
      const expiring = active.filter((c) => c.endDate && diffKeys(todayKey, dateOnlyKey(c.endDate)) <= 90);
      return {
        kpis: [
          { label: "Contratos ativos", value: active.length, type: "number" },
          { label: "MRR equivalente", value: active.reduce((s, c) => s + monthlyEquivalent(toNumber(c.value), c.recurrence), 0), type: "money" },
          { label: "Vencendo em 90 dias", value: expiring.length, type: "number" },
          { label: "Valor vencendo em 90 dias", value: expiring.reduce((s, c) => s + toNumber(c.value), 0), type: "money" },
        ],
        columns: [
          { key: "number", label: "Número", type: "text" },
          { key: "title", label: "Contrato", type: "text" },
          { key: "client", label: "Cliente", type: "text" },
          { key: "status", label: "Status", type: "text" },
          { key: "value", label: "Valor por ciclo", type: "money" },
          { key: "recurrence", label: "Recorrência", type: "text" },
          { key: "mrr", label: "MRR equivalente", type: "money" },
          { key: "end", label: "Vencimento", type: "date" },
          { key: "daysLeft", label: "Dias para vencer", type: "number" },
        ],
        rows: contracts.map((c) => ({
          _href: `/app/contracts/${c.id}`,
          number: c.number,
          title: c.title,
          client: c.client.name,
          status: labelText(CONTRACT_STATUS, c.status),
          value: toNumber(c.value),
          recurrence: RECURRENCE_LABELS[c.recurrence] ?? c.recurrence,
          mrr: Math.round(monthlyEquivalent(toNumber(c.value), c.recurrence) * 100) / 100,
          end: c.endDate ? dateOnlyKey(c.endDate) : null,
          daysLeft: c.endDate ? diffKeys(todayKey, dateOnlyKey(c.endDate)) : null,
        })),
      };
    },
  },
  {
    key: "revenue",
    title: "Receita",
    description: "Recebimentos confirmados no período e pendências por cliente.",
    permission: "finance.read",
    usesPeriod: true,
    financial: true,
    async load(ctx, range) {
      const today = keyToDate(dayKeyInTz(new Date(), ctx.org.timezone));
      const [received, pending] = await Promise.all([
        ctx.db.receivable.findMany({ where: { status: "RECEIVED", receivedAt: inRange(range) }, select: { clientId: true, amount: true, client: { select: { name: true } } } }),
        ctx.db.receivable.findMany({ where: { status: "PENDING" }, select: { clientId: true, amount: true, dueDate: true, client: { select: { name: true } } } }),
      ]);
      const map = new Map<string, { client: string; received: number; pending: number; overdue: number; href: string | null }>();
      const key = (r: { clientId: string | null; client: { name: string } | null }) => r.clientId ?? "none";
      const entry = (r: { clientId: string | null; client: { name: string } | null }) => {
        const k = key(r);
        const e = map.get(k) ?? { client: r.client?.name ?? "Sem cliente", received: 0, pending: 0, overdue: 0, href: r.clientId ? `/app/clients/${r.clientId}` : null };
        map.set(k, e);
        return e;
      };
      for (const r of received) entry(r).received += toNumber(r.amount);
      for (const r of pending) {
        const e = entry(r);
        e.pending += toNumber(r.amount);
        if (r.dueDate < today) e.overdue += toNumber(r.amount);
      }
      const rows = [...map.values()].sort((a, b) => b.received - a.received);
      return {
        kpis: [
          { label: "Recebido no período", value: rows.reduce((s, r) => s + r.received, 0), type: "money" },
          { label: "A receber (total)", value: rows.reduce((s, r) => s + r.pending, 0), type: "money" },
          { label: "Vencido", value: rows.reduce((s, r) => s + r.overdue, 0), type: "money" },
          { label: "Clientes pagantes no período", value: rows.filter((r) => r.received > 0).length, type: "number" },
        ],
        columns: [
          { key: "client", label: "Cliente", type: "text" },
          { key: "received", label: "Recebido no período", type: "money" },
          { key: "pending", label: "A receber", type: "money" },
          { key: "overdue", label: "Vencido", type: "money" },
        ],
        rows: rows.map((r) => ({ _href: r.href, client: r.client, received: Math.round(r.received * 100) / 100, pending: Math.round(r.pending * 100) / 100, overdue: Math.round(r.overdue * 100) / 100 })),
        note: "Visão gerencial baseada nos recebimentos registrados no Córtex. Não substitui a contabilidade.",
      };
    },
  },
];

export function reportByKey(key: string) {
  return REPORTS.find((r) => r.key === key) ?? null;
}

export function canSeeReport(ctx: Ctx, r: ReportDefinition) {
  return can(ctx, r.permission) && can(ctx, "reports.read") && (!r.financial || can(ctx, "finance.read"));
}

