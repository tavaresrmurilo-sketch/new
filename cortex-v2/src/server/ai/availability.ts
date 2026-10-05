import "server-only";
import type { Ctx } from "@/server/auth/context";
import { checkLimit, hasFeature } from "@/server/billing/feature-gate";
import { resolveAIProvider } from "@/services/ai";

export const AI_NOT_CONFIGURED_MESSAGE = "Configure um provedor de IA para utilizar o Córtex AI.";

export interface AIAvailability {
  enabled: boolean;
  reason?: string;
  provider?: string | null;
  model?: string | null;
  usage?: { used: number; max: number | null };
}

/** Diz se o Córtex AI (recursos generativos) pode ser usado agora — sem nunca quebrar o restante do app. */
export async function aiAvailability(ctx: Ctx): Promise<AIAvailability> {
  const { provider, status } = resolveAIProvider();
  if (!provider) return { enabled: false, reason: AI_NOT_CONFIGURED_MESSAGE, provider: status.provider };
  if (!ctx.org.settings.aiEnabled) return { enabled: false, reason: "O Córtex AI está desativado nas configurações da empresa.", provider: provider.name, model: provider.model };
  if (!hasFeature(ctx, "ai_assistant")) return { enabled: false, reason: "O Córtex AI não está incluído no plano atual.", provider: provider.name, model: provider.model };
  if (!ctx.permissions.has("ai.use")) return { enabled: false, reason: "Seu papel não permite usar o Córtex AI." };
  const limit = await checkLimit(ctx, "ai_requests");
  if (!limit.allowed) return { enabled: false, reason: `Limite mensal de IA do plano atingido (${limit.used}/${limit.max}).`, provider: provider.name, model: provider.model, usage: { used: limit.used, max: limit.max } };
  return { enabled: true, provider: provider.name, model: provider.model, usage: { used: limit.used, max: limit.max } };
}
