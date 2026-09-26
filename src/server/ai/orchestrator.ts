import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { errorMessage, logger } from "@/lib/logger";
import { isoDate } from "@/lib/periods";
import type { AnalyticsCtx } from "@/server/analytics/types";
import { mergeSources } from "@/server/analytics/base";
import { verifyNumbers } from "./guard";
import { planFromRules } from "./intent";
import { getConfiguredProvider } from "./providers";
import { NO_DATA, runTool, searchKnowledge, toolSpecs } from "./tools";
import type { AIProvider, Block, ToolCall, ToolOutput } from "./types";

export interface CortexAnswer {
  content: string;
  blocks: Block[];
  trace: CortexTrace;
  provider: string;
}

export interface CortexTrace {
  question: string;
  planner: "rules" | string;
  plannerFallback?: string;
  tools: { name: string; input: Record<string, unknown>; sufficient: boolean; title: string }[];
  narrator: "deterministic" | string;
  narratorRejected?: { reason: string; unverified?: number[] };
  meta: {
    periods: { label: string; start: string; end: string }[];
    comparisons: { label: string; start: string; end: string }[];
    sources: { id: string; name: string; kind: string; lastUpdatedAt: string }[];
    lastUpdated: string | null;
    filters: Record<string, string>;
    calculation: { tool: string; steps: { label: string; formula?: string; value?: number | string | null; detail?: string }[] }[];
    notes: string[];
  };
  durationMs: number;
}

const HELP = `Não consegui identificar qual informação você procura. Exemplos do que posso responder:
- "Quanto vendemos ontem?"
- "Monte o DRE de setembro."
- "Compare este mês com o anterior."
- "Qual será meu caixa na próxima semana?"
- "Quais clientes reduziram as compras?"
- "Quais despesas mais aumentaram?"`;

/** Motivo amigável para falhas do provedor externo (sem detalhes técnicos nem chaves). */
function aiFailureReason(err: unknown): string {
  const e = err as { status?: number; name?: string; message?: string };
  const msg = `${e?.name ?? ""} ${e?.message ?? ""}`.toLowerCase();
  if (e?.status === 401 || e?.status === 403) return "chave de API inválida ou sem permissão";
  if (e?.status === 429) return "limite de uso atingido";
  if (/timeout|timed out|abort/.test(msg)) return "tempo de resposta esgotado";
  if (typeof e?.status === "number" && e.status >= 500) return "instabilidade no provedor";
  return "falha de comunicação";
}

async function recordUsage(tenantId: string, provider: AIProvider, feature: string, usage: { inputTokens: number; outputTokens: number; model?: string } | null) {
  if (!usage) return;
  await prisma.aIUsage
    .create({ data: { tenantId, provider: provider.name, model: usage.model ?? provider.model, feature, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } })
    .catch(() => undefined);
}

/**
 * Pipeline seguro do "Pergunte ao Cortex":
 * pergunta → intenção → ferramentas internas (consultas parametrizadas, com tenant e permissões)
 * → resultados estruturados → (opcional) LLM redige a partir de fatos mínimos → verificação numérica.
 * O modelo nunca recebe a base bruta nem gera SQL.
 */
export async function askCortex(args: {
  ctx: AnalyticsCtx;
  question: string;
  history: { role: "user" | "assistant"; content: string }[];
  allowExternalAI: boolean;
}): Promise<CortexAnswer> {
  const started = Date.now();
  const { ctx, question } = args;
  const provider = args.allowExternalAI ? getConfiguredProvider() : null;
  const today = isoDate(ctx.today);

  // 1-2. intenção e ferramentas
  let calls: ToolCall[] = [];
  let planner = "rules";
  let plannerFallback: string | undefined;
  if (provider) {
    try {
      const plan = await provider.planTools({ question, history: args.history, tools: toolSpecs(ctx.permissions), today });
      await recordUsage(ctx.tenantId, provider, "chat.plan", plan.usage);
      calls = plan.calls.slice(0, 4);
      planner = provider.name;
    } catch (err) {
      plannerFallback = `Provedor de IA (${provider.name}) indisponível no momento — ${aiFailureReason(err)}. A resposta foi calculada pelo motor interno do Cortex.`;
      logger.warn("ai.plan_failed", { tenantId: ctx.tenantId, provider: provider.name, err: errorMessage(err) });
    }
  }
  if (!calls.length) {
    calls = planFromRules(question, ctx.today);
    if (planner !== "rules" && calls.length) plannerFallback = plannerFallback ?? "Provedor não selecionou ferramentas; usado planejador interno.";
    if (planner !== "rules") planner = `${planner}+rules`;
  }

  if (!calls.length) {
    return {
      content: HELP,
      blocks: [],
      provider: "rules",
      trace: { question, planner, plannerFallback, tools: [], narrator: "deterministic", meta: emptyMeta(), durationMs: Date.now() - started },
    };
  }

  // 3-5. execução das consultas internas
  const outputs: ToolOutput[] = [];
  for (const call of calls) {
    try {
      outputs.push(await runTool(ctx, call.name, call.input));
    } catch (err) {
      logger.error("ai.tool_failed", { tool: call.name, err: errorMessage(err) });
      outputs.push({ tool: call.name, title: call.name, sufficient: false, narrative: "Não foi possível executar esta consulta.", facts: {}, blocks: [], meta: null });
    }
  }
  const useful = outputs.filter((o) => o.sufficient);
  const deterministic = useful.length
    ? useful.map((o) => (useful.length > 1 ? `### ${o.title}\n${o.narrative}` : o.narrative)).join("\n\n")
    : outputs.map((o) => o.narrative).find((n) => n && n !== NO_DATA) ?? NO_DATA;

  // 6-8. redação pelo LLM (opcional) apenas com fatos mínimos + verificação
  let content = deterministic;
  let narrator = "deterministic";
  let narratorRejected: CortexTrace["narratorRejected"];
  if (provider && useful.length) {
    const facts = JSON.stringify(
      { hoje: today, resultados: useful.map((o) => ({ consulta: o.title, periodo: o.meta?.period?.label, fatos: o.facts })), RESUMOS_CALCULADOS: useful.map((o) => o.narrative) },
      (_k, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v),
    ).slice(0, 24_000);
    try {
      const knowledge = (await searchKnowledge(ctx.tenantId, question, 2)).map((k) => `${k.title}: ${k.content}`).join("\n");
      const res = await provider.narrate({ question, facts, knowledge, today });
      await recordUsage(ctx.tenantId, provider, "chat.narrate", res.usage);
      const check = verifyNumbers(res.text, { useful: useful.map((o) => o.facts), narratives: useful.map((o) => o.narrative), knowledge });
      if (res.text && check.ok) {
        content = res.text;
        narrator = provider.name;
      } else {
        narratorRejected = { reason: res.text ? "A resposta do modelo continha números não rastreáveis aos dados; exibida a resposta calculada." : "Resposta vazia do modelo.", unverified: check.unverified.slice(0, 10) };
      }
    } catch (err) {
      logger.warn("ai.narrate_failed", { tenantId: ctx.tenantId, provider: provider.name, err: errorMessage(err) });
      narratorRejected = { reason: `Provedor de IA indisponível (${aiFailureReason(err)}); exibida a resposta calculada pelo Cortex.` };
    }
  }

  const blocks = useful.flatMap((o) => o.blocks);
  const denied = outputs.filter((o) => (o.facts as { denied?: boolean }).denied);
  if (denied.length) blocks.unshift({ type: "notice", tone: "warning", text: "Parte da resposta foi omitida porque você não tem permissão para acessar esses dados." });

  const metas = outputs.map((o) => o.meta).filter((m): m is NonNullable<ToolOutput["meta"]> => Boolean(m));
  const sources = mergeSources(...metas.map((m) => m.sources));
  const trace: CortexTrace = {
    question,
    planner,
    plannerFallback,
    tools: outputs.map((o, i) => ({ name: o.tool, input: calls[i]?.input ?? {}, sufficient: o.sufficient, title: o.title })),
    narrator,
    narratorRejected,
    meta: {
      periods: dedupe(metas.map((m) => m.period).filter((p): p is NonNullable<typeof p> => Boolean(p))),
      comparisons: dedupe(metas.map((m) => m.comparison).filter((p): p is NonNullable<typeof p> => Boolean(p))),
      sources,
      lastUpdated: sources.map((s) => s.lastUpdatedAt).sort().pop() ?? null,
      filters: Object.assign({}, ...metas.map((m) => m.filters)),
      calculation: outputs.filter((o) => o.meta?.calculation.length).map((o) => ({ tool: o.title, steps: o.meta!.calculation })),
      notes: metas.flatMap((m) => m.notes ?? []),
    },
    durationMs: Date.now() - started,
  };
  return { content, blocks, trace, provider: narrator === "deterministic" ? "rules" : narrator };
}

function dedupe<T extends { start: string; end: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((p) => {
    const k = `${p.start}|${p.end}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function emptyMeta(): CortexTrace["meta"] {
  return { periods: [], comparisons: [], sources: [], lastUpdated: null, filters: {}, calculation: [], notes: [] };
}

export function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
