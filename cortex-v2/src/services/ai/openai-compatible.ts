import "server-only";
import { AIProviderError, type AIProvider, type AIRequest, type AIResult } from "./types";

/**
 * Provedor compatível com a API de Chat Completions (OpenAI e servidores locais compatíveis,
 * como Ollama, LM Studio e vLLM).
 */
export class OpenAICompatibleProvider implements AIProvider {
  constructor(
    readonly name: "openai" | "local",
    readonly model: string,
    private baseUrl: string,
    private apiKey: string | null,
  ) {}

  async generate(req: AIRequest): Promise<AIResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: req.maxTokens ?? 4000,
      messages: [{ role: "system", content: req.system }, ...req.messages],
    };
    if (req.json) {
      body.response_format =
        this.name === "openai"
          ? { type: "json_schema", json_schema: { name: req.json.name, schema: req.json.schema, strict: true } }
          : { type: "json_object" };
    }
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(req.timeoutMs ?? 120_000),
      });
    } catch (e) {
      throw new AIProviderError(e instanceof Error && e.name === "TimeoutError" ? "O provedor de IA demorou demais para responder." : "Falha ao contatar o provedor de IA.", e instanceof Error && e.name === "TimeoutError" ? "timeout" : "unavailable");
    }
    if (res.status === 429) throw new AIProviderError("Limite de requisições do provedor de IA atingido.", "rate_limit");
    if (res.status === 401 || res.status === 403) throw new AIProviderError("Credencial do provedor de IA inválida.", "auth");
    if (!res.ok) throw new AIProviderError(`Falha no provedor de IA (${res.status}).`, "unavailable");
    const data = (await res.json()) as {
      model?: string;
      choices?: { message?: { content?: string | null; refusal?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const msg = data.choices?.[0]?.message;
    if (msg?.refusal) throw new AIProviderError("O modelo recusou esta solicitação.", "refusal");
    const text = msg?.content?.trim();
    if (!text) throw new AIProviderError("Resposta vazia do provedor de IA.", "bad_response");
    return { text, inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0, provider: this.name, model: data.model ?? this.model };
  }
}
