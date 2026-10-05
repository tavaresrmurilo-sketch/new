import { clampScore, type ScoreFactor, type Tone } from "./types";

export interface ClientHealthInput {
  status: "PROSPECT" | "ACTIVE" | "INACTIVE" | "CHURNED";
  /** dias desde a última interação registrada (null = nunca houve) */
  daysSinceInteraction: number | null;
  interactions90d: number;
  activeProjects: number;
  overdueTasks: number;
  atRiskProjects: number;
  /** problemas registrados (interações do tipo ISSUE) nos últimos 60 dias */
  issues60d: number;
  /** dias até o vencimento do contrato ativo mais próximo (null = sem contrato com data) */
  contractExpiringDays: number | null;
  wonLast90d: number;
}

export interface HealthResult {
  score: number;
  label: string;
  tone: Tone;
  factors: ScoreFactor[];
}

export function healthLabel(score: number): { label: string; tone: Tone } {
  if (score >= 80) return { label: "Excelente", tone: "success" };
  if (score >= 60) return { label: "Boa", tone: "success" };
  if (score >= 40) return { label: "Atenção", tone: "warning" };
  return { label: "Crítica", tone: "danger" };
}

/**
 * Saúde do relacionamento (0–100). Metodologia: base 70, ajustada por regras transparentes.
 * Cada regra aplicada vira um fator explicável exibido no Cliente 360°.
 */
export function clientHealth(input: ClientHealthInput): HealthResult {
  const factors: ScoreFactor[] = [];
  const add = (label: string, impact: number) => impact !== 0 && factors.push({ label, impact });

  const d = input.daysSinceInteraction;
  if (d === null) add("Nenhuma interação registrada", -25);
  else if (d <= 14) add(`Contato recente (há ${d} dia${d === 1 ? "" : "s"})`, 10);
  else if (d <= 30) add(`Último contato há ${d} dias`, 0);
  else if (d <= 60) add(`Sem contato há ${d} dias`, -15);
  else add(`Sem contato há ${d} dias`, -30);

  if (input.interactions90d >= 6) add(`${input.interactions90d} interações em 90 dias`, 10);
  else if (input.interactions90d >= 3) add(`${input.interactions90d} interações em 90 dias`, 5);
  else if (input.interactions90d === 0 && d !== null) add("Nenhuma interação nos últimos 90 dias", -10);

  if (input.activeProjects > 0) add(`${input.activeProjects} projeto(s) ativo(s)`, 5);
  if (input.overdueTasks > 0) add(`${input.overdueTasks} tarefa(s) atrasada(s)`, -Math.min(20, input.overdueTasks * 5));
  if (input.atRiskProjects > 0) add(`${input.atRiskProjects} projeto(s) em risco`, -Math.min(20, input.atRiskProjects * 10));
  if (input.issues60d > 0) add(`${input.issues60d} problema(s) registrado(s) em 60 dias`, -Math.min(16, input.issues60d * 8));

  const c = input.contractExpiringDays;
  if (c !== null && c >= 0 && c <= 30) add(`Contrato vence em ${c} dia(s)`, -10);
  else if (c !== null && c > 30 && c <= 90) add(`Contrato vence em ${c} dias`, -5);

  if (input.wonLast90d > 0) add(`${input.wonLast90d} negócio(s) ganho(s) em 90 dias`, 5);
  if (input.status === "CHURNED") add("Cliente marcado como perdido", -20);
  if (input.status === "INACTIVE") add("Cliente marcado como inativo", -10);

  const score = clampScore(70 + factors.reduce((s, f) => s + f.impact, 0));
  return { score, ...healthLabel(score), factors };
}
