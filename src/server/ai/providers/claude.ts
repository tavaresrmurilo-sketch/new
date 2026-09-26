import Anthropic from "@anthropic-ai/sdk";
import { NARRATE_SYSTEM, PLAN_SYSTEM } from "../prompts";
import type { AIProvider, AIUsageInfo, ToolCall } from "../types";

const FALLBACK_MODELS = new Set(["claude-opus-5", "claude-fable-5-1"]);

export class ClaudeProvider implements AIProvider {
  readonly name = "claude";
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string = "claude-opus-5",
  ) {
    this.client = new Anthropic({ apiKey, timeout: 25_000, maxRetries: 1 });
  }

  private fallbackParams() {
    return FALLBACK_MODELS.has(this.model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {};
  }

  private usage(res: Anthropic.Beta.BetaMessage): AIUsageInfo {
    return { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, model: res.model };
  }

  async planTools({ question, history, tools, today }: Parameters<AIProvider["planTools"]>[0]) {
    const res = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 2048,
      ...this.fallbackParams(),
      output_config: { effort: "low" },
      system: PLAN_SYSTEM(today),
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Beta.BetaTool.InputSchema,
      })),
      tool_choice: { type: "auto" },
      messages: [...history.slice(-6).map((h) => ({ role: h.role, content: h.content })), { role: "user", content: question }],
    });
    if (res.stop_reason === "refusal") return { calls: [], usage: this.usage(res) };
    const calls: ToolCall[] = res.content
      .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
      .map((b) => ({ name: b.name, input: (b.input ?? {}) as Record<string, unknown> }));
    return { calls, usage: this.usage(res) };
  }

  async narrate({ question, facts, knowledge }: Parameters<AIProvider["narrate"]>[0]) {
    const res = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 4096,
      ...this.fallbackParams(),
      output_config: { effort: "medium" },
      system: NARRATE_SYSTEM,
      messages: [{ role: "user", content: `PERGUNTA: ${question}\n\nFATOS (calculados pelo sistema):\n${facts}${knowledge ? `\n\nCONTEXTO DA EMPRESA (Cortex Knowledge):\n${knowledge}` : ""}` }],
    });
    if (res.stop_reason === "refusal") return { text: "", usage: this.usage(res) };
    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return { text, usage: this.usage(res) };
  }
}
