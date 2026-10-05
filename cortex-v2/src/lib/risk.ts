export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** Matriz de riscos 4×4: severidade = impacto × probabilidade (1–16). */
export function riskLevel(impact: number, probability: number): RiskLevel {
  const s = impact * probability;
  if (s >= 12) return "CRITICAL";
  if (s >= 8) return "HIGH";
  if (s >= 4) return "MEDIUM";
  return "LOW";
}

export const RISK_LEVEL_LABELS: Record<RiskLevel, { label: string; tone: "neutral" | "info" | "warning" | "danger" }> = {
  LOW: { label: "Baixo", tone: "neutral" },
  MEDIUM: { label: "Médio", tone: "info" },
  HIGH: { label: "Alto", tone: "warning" },
  CRITICAL: { label: "Crítico", tone: "danger" },
};
