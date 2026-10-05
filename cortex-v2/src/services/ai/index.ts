import "server-only";
import { env } from "@/lib/env";
import { AnthropicProvider, DEFAULT_ANTHROPIC_MODEL } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { OpenAICompatibleProvider } from "./openai-compatible";
import type { AIProvider } from "./types";

export * from "./types";

export const PROVIDER_LABELS: Record<string, string> = { anthropic: "Anthropic (Claude)", openai: "OpenAI", gemini: "Google Gemini", local: "Modelo local (compatível com OpenAI)" };

export interface ProviderStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
  problem?: string;
}

let cached: { key: string; provider: AIProvider | null; status: ProviderStatus } | null = null;

/**
 * Resolve o provedor a partir das variáveis de ambiente.
 * AI_PROVIDER = anthropic | openai | gemini | local. Se vazio, usa o primeiro com chave configurada
 * (Anthropic → OpenAI → Gemini). Sem provedor, o restante do sistema continua funcionando normalmente.
 */
export function resolveAIProvider(): { provider: AIProvider | null; status: ProviderStatus } {
  const e = env();
  const key = [e.AI_PROVIDER, e.AI_MODEL, Boolean(e.ANTHROPIC_API_KEY), Boolean(e.OPENAI_API_KEY), Boolean(e.GOOGLE_GENERATIVE_AI_API_KEY), e.LOCAL_AI_URL, e.OPENAI_BASE_URL].join("|");
  if (cached?.key === key) return cached;
  let name = e.AI_PROVIDER?.toLowerCase() ?? null;
  if (name === "claude") name = "anthropic";
  if (!name) name = e.ANTHROPIC_API_KEY ? "anthropic" : e.OPENAI_API_KEY ? "openai" : e.GOOGLE_GENERATIVE_AI_API_KEY ? "gemini" : null;
  let provider: AIProvider | null = null;
  let problem: string | undefined;
  switch (name) {
    case "anthropic":
      if (e.ANTHROPIC_API_KEY) provider = new AnthropicProvider(e.ANTHROPIC_API_KEY, e.AI_MODEL ?? DEFAULT_ANTHROPIC_MODEL);
      else problem = "ANTHROPIC_API_KEY não configurada.";
      break;
    case "openai":
      if (e.OPENAI_API_KEY) provider = new OpenAICompatibleProvider("openai", e.AI_MODEL ?? "gpt-4.1-mini", e.OPENAI_BASE_URL ?? "https://api.openai.com/v1", e.OPENAI_API_KEY);
      else problem = "OPENAI_API_KEY não configurada.";
      break;
    case "gemini":
      if (e.GOOGLE_GENERATIVE_AI_API_KEY) provider = new GeminiProvider(e.GOOGLE_GENERATIVE_AI_API_KEY, e.AI_MODEL ?? "gemini-2.5-flash");
      else problem = "GOOGLE_GENERATIVE_AI_API_KEY não configurada.";
      break;
    case "local":
      if (e.LOCAL_AI_URL) provider = new OpenAICompatibleProvider("local", e.AI_MODEL ?? "llama3.1", e.LOCAL_AI_URL, null);
      else problem = "LOCAL_AI_URL não configurada (ex.: http://localhost:11434/v1).";
      break;
    case null:
      problem = "Nenhum provedor de IA configurado.";
      break;
    default:
      problem = `AI_PROVIDER inválido: ${name}.`;
  }
  const status: ProviderStatus = { configured: Boolean(provider), provider: provider?.name ?? name, model: provider?.model ?? null, problem };
  cached = { key, provider, status };
  return cached;
}
