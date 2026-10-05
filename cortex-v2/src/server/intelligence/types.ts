/** Fator explicável de um score: impacto positivo ou negativo em pontos. */
export interface ScoreFactor {
  label: string;
  impact: number;
}

export type Tone = "success" | "warning" | "danger" | "neutral";

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function splitFactors(factors: ScoreFactor[]) {
  return {
    positives: factors.filter((f) => f.impact > 0).sort((a, b) => b.impact - a.impact),
    negatives: factors.filter((f) => f.impact < 0).sort((a, b) => a.impact - b.impact),
  };
}
