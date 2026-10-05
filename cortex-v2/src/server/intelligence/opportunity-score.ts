import { clampScore, splitFactors, type ScoreFactor } from "./types";

export type RadarCategory = "HOT" | "WARM" | "COLD" | "AT_RISK";

export interface OpportunityScoreInput {
  /** probabilidade efetiva (da oportunidade ou da etapa), 0–100 */
  probability: number;
  daysSinceActivity: number;
  daysInStage: number;
  /** dias até a data prevista de fechamento (negativo = vencida); null = sem data */
  daysToClose: number | null;
  proposal: { status: string; daysSinceSent: number | null; daysSinceUpdate: number } | null;
  hasDecisionMaker: boolean;
  hasChampion: boolean;
  hasBlocker: boolean;
  meetingsLast30d: number;
  upcomingMeeting: boolean;
  overdueTasks: number;
}

export interface OpportunityScore {
  score: number;
  category: RadarCategory;
  positives: ScoreFactor[];
  negatives: ScoreFactor[];
}

export const RADAR_LABELS: Record<RadarCategory, { label: string; description: string }> = {
  HOT: { label: "Hot", description: "Grande probabilidade de fechamento" },
  WARM: { label: "Warm", description: "Precisa de acompanhamento" },
  COLD: { label: "Cold", description: "Baixo engajamento" },
  AT_RISK: { label: "Em risco", description: "Negócio em risco" },
};

/**
 * Opportunity Score (0–100), regras transparentes:
 * base 50 + (probabilidade − 50) × 0,4 + recência de atividade + prazo + proposta + mapa de decisão + reuniões − pendências.
 */
export function scoreOpportunity(input: OpportunityScoreInput): OpportunityScore {
  const factors: ScoreFactor[] = [];
  const add = (label: string, impact: number) => impact !== 0 && factors.push({ label, impact: Math.round(impact) });

  add(`Etapa com probabilidade de ${input.probability}%`, (input.probability - 50) * 0.4);

  const a = input.daysSinceActivity;
  if (a <= 3) add("Atividade nos últimos 3 dias", 10);
  else if (a <= 7) add("Atividade na última semana", 5);
  else if (a <= 14) add(`Sem atividade há ${a} dias`, -5);
  else if (a <= 30) add(`Sem atividade há ${a} dias`, -15);
  else add(`Sem atividade há ${a} dias`, -25);

  if (input.daysToClose === null) add("Sem data prevista de fechamento", -5);
  else if (input.daysToClose < 0) add(`Data prevista de fechamento vencida há ${-input.daysToClose} dia(s)`, -15);
  else if (input.daysToClose <= 30 && a <= 14) add(`Fechamento previsto em ${input.daysToClose} dia(s)`, 5);

  const p = input.proposal;
  if (p) {
    if (p.status === "NEGOTIATION") add("Proposta em negociação", 10);
    else if (p.status === "VIEWED") add("Proposta visualizada pelo cliente", 6);
    else if (p.status === "SENT" && (p.daysSinceSent ?? 0) <= 7) add("Proposta enviada recentemente", 5);
    else if (p.status === "SENT" && (p.daysSinceSent ?? 0) > 14) add(`Proposta enviada há ${p.daysSinceSent} dias sem retorno`, -10);
    else if (p.status === "REJECTED") add("Proposta recusada", -20);
    else if (p.status === "EXPIRED") add("Proposta expirada", -10);
  }

  if (input.hasDecisionMaker && input.meetingsLast30d > 0) add("Decisor identificado e reunião recente", 10);
  else if (input.hasDecisionMaker) add("Decisor identificado", 4);
  else add("Nenhum decisor identificado", -5);
  if (input.hasChampion) add("Possui champion no cliente", 5);
  if (input.hasBlocker) add("Há um bloqueador mapeado", -5);
  if (input.upcomingMeeting) add("Reunião agendada", 8);
  if (input.daysInStage > 30) add(`Parada na mesma etapa há ${input.daysInStage} dias`, -10);
  if (input.overdueTasks > 0) add(`${input.overdueTasks} tarefa(s) atrasada(s)`, -Math.min(10, input.overdueTasks * 5));

  const score = clampScore(50 + factors.reduce((s, f) => s + f.impact, 0));
  const atRiskSignal =
    a > 21 || (input.daysToClose !== null && input.daysToClose < 0) || p?.status === "REJECTED" || (p?.status === "SENT" && (p.daysSinceSent ?? 0) > 14);
  let category: RadarCategory;
  if (atRiskSignal && score < 55) category = "AT_RISK";
  else if (score >= 70) category = "HOT";
  else if (score >= 45) category = "WARM";
  else category = "COLD";
  return { score, category, ...splitFactors(factors) };
}
