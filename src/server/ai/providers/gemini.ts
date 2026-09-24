import { NARRATE_SYSTEM, PLAN_SYSTEM } from "../prompts";
import type { AIProvider, ToolCall } from "../types";

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string,
    readonly model: string = "gemini-2.5-flash",
  ) {}

  private async call(body: Record<string, unknown>): Promise<GeminiResponse> {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`gemini: HTTP ${res.status}`);
    return (await res.json()) as GeminiResponse;
  }

  private usage(d: GeminiResponse) {
    return { inputTokens: d.usageMetadata?.promptTokenCount ?? 0, outputTokens: d.usageMetadata?.candidatesTokenCount ?? 0, model: this.model };
  }

  async planTools({ question, history, tools, today }: Parameters<AIProvider["planTools"]>[0]) {
    const data = await this.call({
      systemInstruction: { parts: [{ text: PLAN_SYSTEM(today) }] },
      contents: [...history.slice(-6).map((h) => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] })), { role: "user", parts: [{ text: question }] }],
      tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }],
    });
    const calls: ToolCall[] = (data.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => p.functionCall)
      .map((p) => ({ name: p.functionCall!.name, input: p.functionCall!.args ?? {} }));
    return { calls, usage: this.usage(data) };
  }

  async narrate({ question, facts, knowledge }: Parameters<AIProvider["narrate"]>[0]) {
    const data = await this.call({
      systemInstruction: { parts: [{ text: NARRATE_SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: `PERGUNTA: ${question}\n\nFATOS:\n${facts}${knowledge ? `\n\nCONTEXTO DA EMPRESA:\n${knowledge}` : ""}` }] }],
      generationConfig: { temperature: 0.2 },
    });
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    return { text, usage: this.usage(data) };
  }
}
