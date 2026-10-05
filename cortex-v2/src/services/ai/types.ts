export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIRequest {
  system: string;
  messages: AIMessage[];
  maxTokens?: number;
  /** quando informado, o provedor deve devolver JSON aderente ao schema (JSON Schema) */
  json?: { name: string; schema: Record<string, unknown> };
  /** profundidade de raciocínio (provedores que suportam) */
  effort?: "low" | "medium" | "high";
  timeoutMs?: number;
}

export interface AIResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  provider: string;
  model: string;
}

/** Contrato único para qualquer provedor de IA (Anthropic, OpenAI, Gemini, modelos locais…). */
export interface AIProvider {
  readonly name: "anthropic" | "openai" | "gemini" | "local";
  readonly model: string;
  generate(request: AIRequest): Promise<AIResult>;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: "refusal" | "rate_limit" | "auth" | "timeout" | "bad_response" | "unavailable",
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}
