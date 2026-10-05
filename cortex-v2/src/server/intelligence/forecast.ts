export interface ForecastOpportunity {
  value: number;
  probability: number;
}

export function weightedPipeline(opps: ForecastOpportunity[]) {
  const gross = opps.reduce((s, o) => s + o.value, 0);
  const weighted = opps.reduce((s, o) => s + (o.value * Math.max(0, Math.min(100, o.probability))) / 100, 0);
  return { gross: round2(gross), weighted: round2(weighted), count: opps.length };
}

export interface PeriodForecastInput {
  /** já ganho no período */
  wonInPeriod: number;
  /** oportunidades abertas com fechamento previsto no período */
  openInPeriod: ForecastOpportunity[];
  /** histórico de 180 dias: negócios ganhos e perdidos */
  history: { won: number; lost: number };
}

export interface PeriodForecast {
  won: number;
  weighted: number;
  /** estimativa ajustada pela taxa histórica de ganho (null sem histórico mínimo de 10 negócios fechados) */
  historical: number | null;
  conservative: number;
  optimistic: number;
  historicalWinRate: number | null;
  confidence: "baixa" | "média" | "alta";
  notes: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Forecast do período (estimativa, nunca garantia):
 * - ponderado = ganho + Σ valor × probabilidade;
 * - histórico = ganho + Σ valor × taxa de ganho dos últimos 180 dias (requer ≥ 10 negócios fechados);
 * - conservador = ganho + Σ oportunidades com probabilidade ≥ 75%; otimista = ganho + Σ com probabilidade ≥ 35%.
 */
export function forecastPeriod(input: PeriodForecastInput): PeriodForecast {
  const notes: string[] = [];
  const { weighted } = weightedPipeline(input.openInPeriod);
  const closed = input.history.won + input.history.lost;
  const winRate = closed >= 10 ? input.history.won / closed : null;
  const gross = input.openInPeriod.reduce((s, o) => s + o.value, 0);
  const historical = winRate === null ? null : round2(input.wonInPeriod + gross * winRate);
  if (winRate === null) notes.push(`Histórico insuficiente para calibrar (${closed} negócio(s) fechado(s) em 180 dias; mínimo 10).`);
  const conservative = round2(input.wonInPeriod + input.openInPeriod.filter((o) => o.probability >= 75).reduce((s, o) => s + o.value, 0));
  const optimistic = round2(input.wonInPeriod + input.openInPeriod.filter((o) => o.probability >= 35).reduce((s, o) => s + o.value, 0));
  let confidence: PeriodForecast["confidence"] = "baixa";
  if (input.openInPeriod.length >= 5 && winRate !== null) confidence = closed >= 30 ? "alta" : "média";
  notes.push("Estimativa baseada nas probabilidades do pipeline. Não é garantia de receita.");
  return {
    won: round2(input.wonInPeriod),
    weighted: round2(input.wonInPeriod + weighted),
    historical,
    conservative,
    optimistic,
    historicalWinRate: winRate === null ? null : Math.round(winRate * 1000) / 10,
    confidence,
    notes,
  };
}
