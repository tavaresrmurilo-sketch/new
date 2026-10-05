import "server-only";
import { AIProviderError, type AIProvider, type AIRequest, type AIResult } from "./types";

/** Remove palavras-chave de JSON Schema que a API do Gemini não aceita. */
function geminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(geminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (k === "additionalProperties" || k === "$schema") continue;
    out[k] = geminiSchema(v);
  }
  return out;
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const;
  constructor(private apiKey: string, readonly model: string) {}

  async generate(req: AIRequest): Promise<AIResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
          generationConfig: {
            maxOutputTokens: req.maxTokens ?? 4000,
            ...(req.json ? { responseMimeType: "application/json", responseSchema: geminiSchema(req.json.schema) } : {}),
          },
        }),
        signal: AbortSignal.timeout(req.timeoutMs ?? 120_000),
      });
    } catch {
      throw new AIProviderError("Falha ao contatar o provedor de IA.", "unavailable");
    }
    if (res.status === 429) throw new AIProviderError("Limite de requisições do provedor de IA atingido.", "rate_limit");
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      const detail = await res.text().catch(() => "");
      throw new AIProviderError(detail.includes("API key") ? "Credencial do provedor de IA inválida." : `Falha no provedor de IA (${res.status}).`, detail.includes("API key") ? "auth" : "unavailable");
    }
    if (!res.ok) throw new AIProviderError(`Falha no provedor de IA (${res.status}).`, "unavailable");
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      promptFeedback?: { blockReason?: string };
    };
    if (data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason === "SAFETY") throw new AIProviderError("O modelo recusou esta solicitação.", "refusal");
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    if (!text) throw new AIProviderError("Resposta vazia do provedor de IA.", "bad_response");
    return { text, inputTokens: data.usageMetadata?.promptTokenCount ?? 0, outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0, provider: this.name, model: this.model };
  }
}
