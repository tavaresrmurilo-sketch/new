import "server-only";
import { z } from "zod";
import { logger } from "@/lib/logger";
import type { Ctx } from "@/server/auth/context";
import { assertLimit, recordUsage } from "@/server/billing/feature-gate";
import { AppError } from "@/server/errors";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { AIProviderError, resolveAIProvider, type AIRequest, type AIResult } from "@/services/ai";
import { aiAvailability } from "./availability";

export type AIFeature = "chat" | "intent" | "meeting_summary" | "proposal_generator" | "command" | "insight_narrative";

/**
 * Executa uma chamada ao provedor de IA com: verificação de disponibilidade/plano, limite de uso mensal,
 * rate limit por usuário, timeout, registro de uso (AIUsage + UsageRecord) e erros amigáveis.
 */
export async function runAI(ctx: Ctx, feature: AIFeature, request: AIRequest): Promise<AIResult> {
  const availability = await aiAvailability(ctx);
  if (!availability.enabled) throw new AppError("AI_NOT_CONFIGURED", availability.reason ?? "Córtex AI indisponível.");
  await assertLimit(ctx, "ai_requests", 1);
  await enforceRateLimit(`ai:${ctx.user.id}`, 30, 60);
  const { provider } = resolveAIProvider();
  const started = Date.now();
  try {
    const result = await provider!.generate(request);
    await Promise.all([
      ctx.db.aIUsage.create({
        data: { organizationId: ctx.org.id, userId: ctx.member ? ctx.user.id : null, feature, provider: result.provider, model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, latencyMs: Date.now() - started },
      }),
      recordUsage(ctx.org.id, "AI_REQUESTS", 1),
    ]);
    return result;
  } catch (error) {
    const message = error instanceof AIProviderError ? error.message : "Falha ao contatar o provedor de IA.";
    logger.warn("ai.failed", { feature, error });
    await ctx.db.aIUsage
      .create({ data: { organizationId: ctx.org.id, userId: ctx.member ? ctx.user.id : null, feature, provider: provider!.name, model: provider!.model, success: false, error: message.slice(0, 300), latencyMs: Date.now() - started } })
      .catch(() => undefined);
    throw new AppError("INTERNAL", message);
  }
}

/** Extrai e valida JSON da resposta (tolerante a cercas ```json de modelos que não suportam schema). */
export function parseJsonResponse<T extends z.ZodTypeAny>(text: string, schema: T): z.output<T> {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = trimmed.search(/[[{]/);
  const candidate = start >= 0 ? trimmed.slice(start) : trimmed;
  let raw: unknown;
  try {
    raw = JSON.parse(candidate);
  } catch {
    throw new AppError("INTERNAL", "A IA retornou uma resposta em formato inesperado. Tente novamente.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new AppError("INTERNAL", "A IA retornou dados incompletos. Tente novamente.");
  return parsed.data;
}
