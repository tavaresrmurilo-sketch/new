import { NARRATE_SYSTEM, PLAN_SYSTEM } from "../prompts";
import type { AIProvider, ToolCall } from "../types";

interface ChatResponse {
  model?: string;
  choices: { message: { content: string | null; tool_calls?: { function: { name: string; arguments: string } }[] } }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

/** Provider compatível com a API Chat Completions (OpenAI e servidores locais compatíveis, ex.: Ollama/vLLM). */
export class OpenAICompatibleProvider implements AIProvider {
  constructor(
    readonly name: string,
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
    readonly model: string,
  ) {}

  private async call(body: Record<string, unknown>): Promise<ChatResponse> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify({ model: this.model, ...body }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`${this.name}: HTTP ${res.status}`);
    return (await res.json()) as ChatResponse;
  }

  async planTools({ question, history, tools, today }: Parameters<AIProvider["planTools"]>[0]) {
    const data = await this.call({
      messages: [{ role: "system", content: PLAN_SYSTEM(today) }, ...history.slice(-6), { role: "user", content: question }],
      tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
      tool_choice: "auto",
    });
    const calls: ToolCall[] = (data.choices[0]?.message.tool_calls ?? []).map((c) => {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(c.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        input = {};
      }
      return { name: c.function.name, input };
    });
    return { calls, usage: data.usage ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens, model: data.model } : null };
  }

  async narrate({ question, facts, knowledge }: Parameters<AIProvider["narrate"]>[0]) {
    const data = await this.call({
      messages: [
        { role: "system", content: NARRATE_SYSTEM },
        { role: "user", content: `PERGUNTA: ${question}\n\nFATOS (calculados pelo sistema):\n${facts}${knowledge ? `\n\nCONTEXTO DA EMPRESA:\n${knowledge}` : ""}` },
      ],
      temperature: 0.2,
    });
    return {
      text: (data.choices[0]?.message.content ?? "").trim(),
      usage: data.usage ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens, model: data.model } : null,
    };
  }
}
