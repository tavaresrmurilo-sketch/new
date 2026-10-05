import "server-only";
import { z } from "zod";
import { dayKeyInTz } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import type { Ctx } from "@/server/auth/context";
import { assertOwned } from "@/server/db/ownership";
import { AppError } from "@/server/errors";
import { parseJsonResponse, runAI } from "./run";

// ───────────── Gerador de propostas ─────────────

const proposalDraftSchema = z.object({
  title: z.string().min(3).max(200),
  scope: z.string().min(10).max(20000),
  items: z.array(z.object({ description: z.string().min(2).max(500), unit: z.string().max(20), quantity: z.number().positive(), unitPrice: z.number().min(0) })).min(1).max(30),
  notes: z.string().max(10000),
  validityDays: z.number().int().min(1).max(365),
});
export type ProposalDraft = z.infer<typeof proposalDraftSchema>;

const PROPOSAL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "scope", "items", "notes", "validityDays"],
  properties: {
    title: { type: "string" },
    scope: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "unit", "quantity", "unitPrice"],
        properties: { description: { type: "string" }, unit: { type: "string" }, quantity: { type: "number" }, unitPrice: { type: "number" } },
      },
    },
    notes: { type: "string" },
    validityDays: { type: "integer" },
  },
};

export async function generateProposalDraft(ctx: Ctx, input: { clientId: string; service: string; objective: string; estimatedValue?: number; deadline?: string }) {
  await assertOwned(ctx, "client", input.clientId);
  const [client, memory] = await Promise.all([
    ctx.db.client.findUnique({ where: { id: input.clientId }, select: { name: true, industry: true, city: true, state: true } }),
    ctx.db.memoryFact.findMany({ where: { clientId: input.clientId }, select: { content: true }, take: 10, orderBy: { createdAt: "desc" } }),
  ]);
  const system = [
    "Você é um consultor comercial sênior de uma empresa brasileira de serviços B2B (engenharia, manutenção, inspeções, consultoria).",
    "Escreva uma estrutura de proposta comercial profissional em português do Brasil, objetiva e sem exageros de marketing.",
    "Regras: use somente as informações fornecidas; não invente nomes, normas, certificações, dados do cliente ou resultados garantidos.",
    "Quando faltar informação, escreva premissas explícitas no escopo (ex.: “Premissa: acesso às instalações em horário comercial”).",
    "Itens: decomponha o serviço em etapas/entregáveis faturáveis com quantidade, unidade e valor unitário em reais.",
    "Se houver valor estimado, a soma (quantidade × valor unitário) deve ficar próxima dele. Sem valor estimado, use valores 0 para o usuário preencher.",
    "O escopo deve ter: contexto e objetivo, entregáveis, metodologia/etapas, premissas e exclusões.",
    "Notas: condições de pagamento sugeridas, prazo de execução e validade — marque como sugestões a revisar.",
    "Responda apenas com o JSON solicitado.",
  ].join("\n");
  const user = [
    `Cliente: ${client?.name}${client?.industry ? ` (segmento: ${client.industry})` : ""}${client?.city ? `, ${client.city}/${client.state ?? ""}` : ""}`,
    `Serviço: ${input.service}`,
    `Objetivo do cliente: ${input.objective}`,
    input.estimatedValue ? `Valor estimado: ${formatCurrency(input.estimatedValue, ctx.org.currency)}` : "Valor estimado: não informado",
    input.deadline ? `Prazo desejado: ${input.deadline}` : "Prazo desejado: não informado",
    memory.length ? `Fatos confirmados sobre o cliente (Córtex Memory):\n${memory.map((m) => `- ${m.content}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");
  const result = await runAI(ctx, "proposal_generator", { system, messages: [{ role: "user", content: user }], json: { name: "proposal_draft", schema: PROPOSAL_JSON_SCHEMA }, maxTokens: 8000, effort: "medium" });
  return { draft: parseJsonResponse(result.text, proposalDraftSchema), clientName: client?.name ?? "" };
}

// ───────────── Resumo de reunião a partir da transcrição ─────────────

const meetingAnalysisSchema = z.object({
  summary: z.string().max(5000),
  topics: z.array(z.string().max(300)).max(20),
  decisions: z.array(z.string().max(500)).max(30),
  tasks: z.array(z.object({ title: z.string().min(2).max(200), assignee: z.string().max(120).nullable(), dueDate: z.string().max(20).nullable() })).max(30),
});

const MEETING_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "topics", "decisions", "tasks"],
  properties: {
    summary: { type: "string" },
    topics: { type: "array", items: { type: "string" } },
    decisions: { type: "array", items: { type: "string" } },
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "assignee", "dueDate"],
        properties: { title: { type: "string" }, assignee: { type: ["string", "null"] }, dueDate: { type: ["string", "null"] } },
      },
    },
  },
};

function matchMember(name: string | null, members: { id: string; name: string }[]) {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  return (
    members.find((m) => m.name.toLowerCase() === n) ??
    members.find((m) => m.name.toLowerCase().startsWith(n) || n.startsWith(m.name.toLowerCase().split(" ")[0]!)) ??
    null
  );
}

/** Analisa a transcrição colada pelo usuário. Nada é gravado: o resultado volta para revisão e confirmação. */
export async function analyzeMeetingTranscript(ctx: Ctx, meetingId: string) {
  const meeting = await ctx.db.meeting.findUnique({
    where: { id: meetingId },
    include: { participants: { include: { user: { select: { id: true, name: true } }, contact: { select: { name: true } } } }, client: { select: { name: true } } },
  });
  if (!meeting?.transcript) throw new AppError("VALIDATION", "Salve a transcrição antes de analisar.");
  const members = (await ctx.db.organizationMember.findMany({ where: { status: "ACTIVE" }, select: { user: { select: { id: true, name: true } } } })).map((m) => m.user);
  const todayKey = dayKeyInTz(new Date(), ctx.org.timezone);
  const system = [
    "Você analisa transcrições de reuniões de negócios em português do Brasil.",
    "Extraia somente o que foi efetivamente dito. Não invente decisões, tarefas, responsáveis ou prazos.",
    "Responsável: use o nome de uma pessoa da equipe somente se a transcrição atribuir a tarefa a ela; caso contrário, null.",
    `Prazos: converta datas mencionadas para AAAA-MM-DD considerando que hoje é ${todayKey}; se nenhum prazo foi dito, null.`,
    "Resumo: 3 a 6 frases objetivas. Assuntos: tópicos curtos. Decisões: apenas o que foi decidido.",
    "Responda apenas com o JSON solicitado.",
  ].join("\n");
  const user = [
    `Reunião: ${meeting.title}${meeting.client ? ` (cliente: ${meeting.client.name})` : ""}`,
    `Equipe disponível: ${members.map((m) => m.name).join(", ")}`,
    `Participantes registrados: ${meeting.participants.map((p) => p.user?.name ?? p.contact?.name ?? p.name ?? p.email).filter(Boolean).join(", ") || "não informado"}`,
    "Transcrição:",
    meeting.transcript.slice(0, 150_000),
  ].join("\n");
  const result = await runAI(ctx, "meeting_summary", { system, messages: [{ role: "user", content: user }], json: { name: "meeting_analysis", schema: MEETING_JSON_SCHEMA }, maxTokens: 8000, effort: "medium" });
  const analysis = parseJsonResponse(result.text, meetingAnalysisSchema);
  return {
    ...analysis,
    tasks: analysis.tasks.map((t) => {
      const member = matchMember(t.assignee, members);
      const due = t.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate) ? t.dueDate : null;
      return { title: t.title, assigneeName: t.assignee, assigneeId: member?.id ?? null, dueDate: due };
    }),
    members,
  };
}
