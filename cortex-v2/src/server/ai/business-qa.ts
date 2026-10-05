import "server-only";
import { addDaysToKey, DAY_MS, dateOnlyKey, dayKeyInTz, diffKeys, keyToDate } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { toNumber } from "@/lib/utils";
import { can, type Ctx } from "@/server/auth/context";
import { forecastFor, pipelineMetrics, resolvePeriod, stateCounts } from "@/server/modules/analytics";
import { getOpportunityRadar } from "@/server/modules/opportunities";
import { aiAvailability } from "./availability";
import { runAI } from "./run";

export const INSUFFICIENT = "Não existem dados suficientes para responder com segurança.";

export interface AnswerItem {
  title: string;
  detail?: string;
  href: string;
}
export interface BusinessAnswer {
  question: string;
  answer: string;
  items: AnswerItem[];
  source: "rules" | "ai" | "none";
  intent: string | null;
  basis?: string;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

type Intent = { key: string; test: (q: string) => boolean; run: (ctx: Ctx, q: string) => Promise<Omit<BusinessAnswer, "question" | "source" | "intent">> };

const INTENTS: Intent[] = [
  {
    key: "opportunities_at_risk",
    test: (q) => /oportunidade|negocio|deal/.test(q) && /risco|parad|esfriand|perder/.test(q),
    async run(ctx) {
      if (!can(ctx, "opportunities.read")) return { answer: "Você não tem permissão para ver oportunidades.", items: [] };
      const radar = (await getOpportunityRadar(ctx)).filter((o) => o.scored.category === "AT_RISK" || o.scored.category === "COLD");
      const money = (v: number) => (can(ctx, "finance.read") ? formatCurrency(v, ctx.org.currency) : "");
      const total = radar.reduce((s, o) => s + toNumber(o.value), 0);
      return {
        answer: radar.length ? `${radar.length} oportunidade(s) em risco ou esfriando${can(ctx, "finance.read") ? `, somando ${money(total)}` : ""}.` : "Nenhuma oportunidade aberta está classificada como em risco ou fria no momento.",
        items: radar.slice(0, 10).map((o) => ({ title: o.title, detail: `${o.client.name} · score ${o.scored.score} · sem atividade há ${o.scored.daysSinceActivity} dias${o.scored.recommendations[0] ? ` · próxima ação: ${o.scored.recommendations[0].action}` : ""}`, href: `/app/opportunities/${o.id}` })),
        basis: "Opportunity Radar (score por regras transparentes).",
      };
    },
  },
  {
    key: "inactive_clients",
    test: (q) => /cliente/.test(q) && /sem contato|sem interac|inativ|esquecid|nao falamos|ha mais de/.test(q),
    async run(ctx, q) {
      if (!can(ctx, "clients.read")) return { answer: "Você não tem permissão para ver clientes.", items: [] };
      const days = Number(q.match(/(\d{1,3})\s*dias?/)?.[1] ?? ctx.org.settings.inactiveClientDays);
      const cutoff = new Date(Date.now() - days * DAY_MS);
      const rows = await ctx.db.client.findMany({
        where: { status: "ACTIVE", OR: [{ lastInteractionAt: { lt: cutoff } }, { lastInteractionAt: null, createdAt: { lt: cutoff } }] },
        orderBy: [{ isKeyAccount: "desc" }, { lastInteractionAt: "asc" }],
        take: 50,
        select: { id: true, name: true, lastInteractionAt: true, owner: { select: { name: true } } },
      });
      return {
        answer: rows.length ? `${rows.length} cliente(s) ativo(s) sem interação registrada há mais de ${days} dias.` : `Todos os clientes ativos tiveram interação registrada nos últimos ${days} dias.`,
        items: rows.slice(0, 15).map((c) => ({ title: c.name, detail: `${c.lastInteractionAt ? `última interação em ${formatDate(c.lastInteractionAt)}` : "nenhuma interação registrada"} · ${c.owner?.name ?? "sem responsável"}`, href: `/app/clients/${c.id}` })),
        basis: "Data da última interação registrada (ligação, e-mail, WhatsApp, reunião ou visita).",
      };
    },
  },
  {
    key: "forecast",
    test: (q) => /receita|faturamento|forecast|previs|vamos fechar/.test(q),
    async run(ctx, q) {
      if (!can(ctx, "finance.read")) return { answer: "Você não tem permissão para ver valores financeiros.", items: [] };
      const period = /trimestre/.test(q) ? "quarter" : /ano/.test(q) ? "year" : "month";
      const r = resolvePeriod(ctx, period);
      const fc = await forecastFor(ctx, r);
      const m = (v: number) => formatCurrency(v, ctx.org.currency);
      return {
        answer: `Para ${r.label.toLowerCase()}: já ganho ${m(fc.won)}; previsão ponderada ${m(fc.weighted)} (conservador ${m(fc.conservative)}, otimista ${m(fc.optimistic)}${fc.historical !== null ? `, pelo histórico ${m(fc.historical)}` : ""}). Confiança ${fc.confidence}. É uma estimativa, não garantia.`,
        items: [{ title: "Abrir forecast completo", href: `/app/forecast?period=${period}` }],
        basis: fc.notes.join(" "),
      };
    },
  },
  {
    key: "delayed_projects",
    test: (q) => /projeto/.test(q) && /atras|risco|vencid|problema/.test(q),
    async run(ctx) {
      if (!can(ctx, "projects.read")) return { answer: "Você não tem permissão para ver projetos.", items: [] };
      const todayKey = dayKeyInTz(new Date(), ctx.org.timezone);
      const rows = await ctx.db.project.findMany({
        where: { OR: [{ status: "DELAYED" }, { status: "ACTIVE", dueDate: { lt: keyToDate(todayKey) } }] },
        select: { id: true, name: true, dueDate: true, status: true, client: { select: { name: true } }, manager: { select: { name: true } } },
        take: 50,
      });
      return {
        answer: rows.length ? `${rows.length} projeto(s) atrasado(s).` : "Nenhum projeto atrasado.",
        items: rows.map((p) => ({ title: p.name, detail: `${p.client?.name ?? "sem cliente"} · ${p.manager?.name ?? "sem gerente"}${p.dueDate ? ` · prazo ${formatDate(p.dueDate)} (${diffKeys(dateOnlyKey(p.dueDate), todayKey)} dia(s) de atraso)` : ""}`, href: `/app/projects/${p.id}` })),
        basis: "Projetos com status Atrasado ou com prazo vencido.",
      };
    },
  },
  {
    key: "overdue_tasks",
    test: (q) => /tarefa/.test(q) && /atras|vencid|pendent|hoje/.test(q),
    async run(ctx, q) {
      if (!can(ctx, "tasks.read")) return { answer: "Você não tem permissão para ver tarefas.", items: [] };
      const today = keyToDate(dayKeyInTz(new Date(), ctx.org.timezone));
      const mine = /minha|meu|eu /.test(q) || !["OWNER", "ADMIN", "MANAGER"].includes(ctx.member?.roleKey ?? "");
      const rows = await ctx.db.task.findMany({
        where: { status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] }, dueDate: { lte: today }, ...(mine ? { assigneeId: ctx.user.id } : {}) },
        orderBy: { dueDate: "asc" },
        take: 50,
        select: { id: true, title: true, dueDate: true, assignee: { select: { name: true } } },
      });
      return {
        answer: rows.length ? `${rows.length} tarefa(s) vencendo hoje ou atrasada(s)${mine ? " atribuídas a você" : " no workspace"}.` : "Nenhuma tarefa atrasada ou vencendo hoje.",
        items: rows.slice(0, 15).map((t) => ({ title: t.title, detail: `${t.dueDate ? formatDate(t.dueDate) : ""} · ${t.assignee?.name ?? "sem responsável"}`, href: `/app/tasks/${t.id}` })),
      };
    },
  },
  {
    key: "expiring_contracts",
    test: (q) => /contrato/.test(q) && /venc|renov|expir/.test(q),
    async run(ctx, q) {
      if (!can(ctx, "contracts.read")) return { answer: "Você não tem permissão para ver contratos.", items: [] };
      const days = Number(q.match(/(\d{1,3})\s*dias?/)?.[1] ?? 90);
      const todayKey = dayKeyInTz(new Date(), ctx.org.timezone);
      const rows = await ctx.db.contract.findMany({ where: { status: "ACTIVE", endDate: { gte: keyToDate(todayKey), lte: keyToDate(addDaysToKey(todayKey, days)) } }, orderBy: { endDate: "asc" }, take: 50, select: { id: true, number: true, title: true, endDate: true, value: true, client: { select: { name: true } } } });
      return {
        answer: rows.length ? `${rows.length} contrato(s) ativo(s) vencem nos próximos ${days} dias.` : `Nenhum contrato ativo vence nos próximos ${days} dias.`,
        items: rows.map((c) => ({ title: `${c.number} — ${c.client.name}`, detail: `${c.title} · vence em ${formatDate(c.endDate)}`, href: `/app/contracts/${c.id}` })),
      };
    },
  },
  {
    key: "pipeline",
    test: (q) => /pipeline|funil/.test(q),
    async run(ctx) {
      if (!can(ctx, "opportunities.read")) return { answer: "Você não tem permissão para ver o pipeline.", items: [] };
      const p = await pipelineMetrics(ctx);
      const fin = can(ctx, "finance.read");
      const m = (v: number) => formatCurrency(v, ctx.org.currency);
      return {
        answer: p.count ? `${p.count} oportunidade(s) abertas${fin ? `: ${m(p.gross)} bruto e ${m(p.weighted)} ponderado` : ""}.` : "Não há oportunidades abertas no pipeline.",
        items: p.byStage.map((s) => ({ title: s.name, detail: `${s.count} oportunidade(s)${fin ? ` · ${m(s.value)}` : ""}`, href: `/app/pipeline` })),
      };
    },
  },
];

/** Contexto factual compacto enviado à IA quando nenhuma regra cobre a pergunta. */
async function factSheet(ctx: Ctx) {
  const s = await stateCounts(ctx);
  return [
    `Empresa: ${ctx.org.name}. Data de hoje: ${dayKeyInTz(new Date(), ctx.org.timezone)}.`,
    `Clientes ativos: ${s.activeClients}. Leads em aberto: ${s.openLeads}. Oportunidades abertas: ${s.openOpps}.`,
    `Propostas em aberto: ${s.openProposals}${can(ctx, "finance.read") ? ` (${formatCurrency(s.openProposalsValue, ctx.org.currency)})` : ""}. Contratos ativos: ${s.activeContracts}.`,
    `Projetos em andamento: ${s.activeProjects}. Tarefas atrasadas: ${s.overdueTasks}.`,
  ].join("\n");
}

/**
 * “Pergunte ao seu negócio”: perguntas conhecidas são respondidas por consultas determinísticas,
 * com links para os registros. Perguntas fora do catálogo vão para a IA (se configurada) apenas
 * com fatos agregados — e a IA é instruída a não inventar.
 */
export async function answerQuestion(ctx: Ctx, question: string): Promise<BusinessAnswer> {
  const q = norm(question);
  const intent = INTENTS.find((i) => i.test(q));
  if (intent) {
    const r = await intent.run(ctx, q);
    return { question, ...r, source: "rules", intent: intent.key };
  }
  const availability = await aiAvailability(ctx);
  if (!availability.enabled) {
    return { question, answer: `${INSUFFICIENT} Esta pergunta não está no catálogo de consultas diretas${availability.reason ? ` e ${availability.reason.charAt(0).toLowerCase()}${availability.reason.slice(1)}` : ""}`, items: [], source: "none", intent: null };
  }
  const facts = await factSheet(ctx);
  const res = await runAI(ctx, "chat", {
    system: `Você é o Córtex AI, assistente de gestão de uma empresa B2B. Responda em português do Brasil, de forma objetiva.
Regras obrigatórias:
- Use SOMENTE os fatos fornecidos entre <fatos>. Nunca invente números, nomes, clientes ou eventos.
- Se os fatos não bastarem para responder com segurança, responda exatamente: "${INSUFFICIENT}" e sugira qual relatório ou tela do sistema consultar.
- Não afirme causalidade; não faça promessas de resultado.`,
    messages: [{ role: "user", content: `<fatos>\n${facts}\n</fatos>\n\nPergunta: ${question.slice(0, 500)}` }],
    maxTokens: 700,
    effort: "low",
  });
  return { question, answer: res.text.trim() || INSUFFICIENT, items: [], source: "ai", intent: null, basis: "Indicadores agregados do workspace (contagens atuais)." };
}

export const SUGGESTED_QUESTIONS = [
  "Quais oportunidades estão em risco?",
  "Quais clientes estão sem contato há mais de 30 dias?",
  "Qual a receita prevista para este mês?",
  "Quais projetos estão atrasados?",
  "Quais são minhas tarefas atrasadas?",
  "Quais contratos vencem nos próximos 60 dias?",
  "Como está o pipeline?",
];
