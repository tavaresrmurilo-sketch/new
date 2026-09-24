import { env } from "@/lib/env";
import type { AIProvider } from "../types";
import { ClaudeProvider } from "./claude";
import { GeminiProvider } from "./gemini";
import { OpenAICompatibleProvider } from "./openai";

/**
 * Seleciona o provedor configurado. Retorna null quando o motor determinístico interno ("rules")
 * deve ser usado — por configuração, ausência de chave ou falta de consentimento do tenant.
 */
export function getConfiguredProvider(): AIProvider | null {
  const e = env();
  switch (e.AI_PROVIDER) {
    case "claude":
      return e.ANTHROPIC_API_KEY ? new ClaudeProvider(e.ANTHROPIC_API_KEY, e.AI_MODEL || "claude-opus-5") : null;
    case "openai":
      return e.OPENAI_API_KEY ? new OpenAICompatibleProvider("openai", "https://api.openai.com/v1", e.OPENAI_API_KEY, e.AI_MODEL || "gpt-4.1") : null;
    case "gemini":
      return e.GOOGLE_AI_API_KEY ? new GeminiProvider(e.GOOGLE_AI_API_KEY, e.AI_MODEL || "gemini-2.5-flash") : null;
    case "local":
      return e.LOCAL_LLM_URL ? new OpenAICompatibleProvider("local", e.LOCAL_LLM_URL, undefined, e.AI_MODEL || "llama3.1") : null;
    default:
      return null;
  }
}

export function providerStatus() {
  const e = env();
  const provider = getConfiguredProvider();
  return {
    configured: e.AI_PROVIDER,
    active: provider?.name ?? "rules",
    model: provider?.model ?? null,
    missingKey: e.AI_PROVIDER !== "rules" && !provider,
  };
}
