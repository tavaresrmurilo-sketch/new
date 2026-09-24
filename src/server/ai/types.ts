import type { AnalysisMeta } from "@/server/analytics/types";

export type ValueFormat = "money" | "pct" | "pp" | "int" | "number" | "date" | "text";

export type Block =
  | { type: "kpis"; items: { label: string; value: number | string | null; format: ValueFormat; delta?: number | null; deltaFormat?: "pct" | "pp"; hint?: string }[] }
  | { type: "table"; title?: string; columns: { key: string; label: string; format?: ValueFormat; align?: "left" | "right" }[]; rows: Record<string, string | number | null>[] }
  | { type: "chart"; title?: string; chart: "bar" | "line" | "area" | "composed"; xKey: string; xFormat?: "month" | "date" | "text"; series: { key: string; label: string; kind?: "bar" | "line" }[]; data: Record<string, string | number | null>[]; valueFormat?: ValueFormat }
  | { type: "dre"; lines: { key: string; label: string; kind: string; value: number; pctOfNetRevenue: number | null; previous: number | null; pctVar: number | null }[] }
  | { type: "list"; title?: string; items: { title: string; description?: string; severity?: "INFO" | "OPPORTUNITY" | "ATTENTION" | "CRITICAL" }[] }
  | { type: "notice"; tone: "info" | "warning"; text: string };

export interface ToolOutput {
  tool: string;
  title: string;
  sufficient: boolean;
  /** resposta determinística (sempre calculada, usada como fallback e para verificação) */
  narrative: string;
  /** fatos numéricos rastreáveis enviados ao LLM (nunca a base bruta) */
  facts: Record<string, unknown>;
  blocks: Block[];
  meta: AnalysisMeta | null;
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface AIUsageInfo {
  inputTokens: number;
  outputTokens: number;
  model?: string;
}

export interface ToolSpecForLLM {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

/**
 * Contrato de provedor de IA. O provedor NUNCA acessa o banco: ele apenas (1) escolhe ferramentas
 * internas a partir da pergunta e (2) redige a resposta a partir de fatos já calculados.
 */
export interface AIProvider {
  readonly name: string;
  readonly model: string | null;
  planTools(args: { question: string; history: { role: "user" | "assistant"; content: string }[]; tools: ToolSpecForLLM[]; today: string }): Promise<{ calls: ToolCall[]; usage: AIUsageInfo | null }>;
  narrate(args: { question: string; facts: string; knowledge: string; today: string }): Promise<{ text: string; usage: AIUsageInfo | null }>;
}
