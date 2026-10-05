import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AIProviderError, type AIProvider, type AIRequest, type AIResult } from "./types";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

/** Provedor Claude via SDK oficial da Anthropic (Messages API). */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic" as const;
  private client: Anthropic;
  constructor(apiKey: string, readonly model: string = DEFAULT_ANTHROPIC_MODEL) {
    this.client = new Anthropic({ apiKey, maxRetries: 2 });
  }

  async generate(req: AIRequest): Promise<AIResult> {
    try {
      const response = await this.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: req.maxTokens ?? 16000,
          // em caso de recusa por classificadores de segurança, o servidor reexecuta no modelo de fallback recomendado
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: req.system,
          messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
          output_config: {
            effort: req.effort ?? "medium",
            ...(req.json ? { format: { type: "json_schema" as const, schema: req.json.schema } } : {}),
          },
        },
        { timeout: req.timeoutMs ?? 120_000 },
      );
      if (response.stop_reason === "refusal") {
        throw new AIProviderError("O modelo recusou esta solicitação.", "refusal");
      }
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      if (!text) throw new AIProviderError("Resposta vazia do provedor de IA.", "bad_response");
      return {
        text,
        inputTokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0),
        outputTokens: response.usage.output_tokens,
        provider: this.name,
        model: response.model,
      };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      if (error instanceof Anthropic.RateLimitError) throw new AIProviderError("Limite de requisições do provedor de IA atingido. Tente novamente em instantes.", "rate_limit");
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) throw new AIProviderError("Credencial do provedor de IA inválida.", "auth");
      if (error instanceof Anthropic.APIConnectionTimeoutError) throw new AIProviderError("O provedor de IA demorou demais para responder.", "timeout");
      if (error instanceof Anthropic.APIError) throw new AIProviderError(`Falha no provedor de IA (${error.status ?? "rede"}).`, "unavailable");
      throw new AIProviderError("Falha ao contatar o provedor de IA.", "unavailable");
    }
  }
}
