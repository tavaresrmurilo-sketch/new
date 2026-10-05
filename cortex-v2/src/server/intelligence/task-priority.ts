import { diffKeys } from "@/lib/dates";

export type PriorityLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface TaskPriorityInput {
  dueKey: string | null;
  todayKey: string;
  keyAccountClient: boolean;
  opportunityValue: number | null;
  largeDealThreshold: number;
  blocksProject: boolean;
  projectPriority: PriorityLevel | null;
  projectHealthScore: number | null;
}

export interface TaskPriorityResult {
  priority: PriorityLevel;
  points: number;
  reasons: string[];
}

/**
 * Smart Priority Engine. Pontuação: atraso (+40), vence hoje (+30), em até 3 dias (+20), em até 7 dias (+10),
 * cliente estratégico (+15), oportunidade grande (+15), bloqueia o projeto (+20), projeto prioritário ou em risco (+10).
 * Faixas: ≥60 crítica · ≥35 alta · ≥15 média · <15 baixa.
 */
export function recommendTaskPriority(input: TaskPriorityInput): TaskPriorityResult {
  let points = 0;
  const reasons: string[] = [];
  if (input.dueKey) {
    const days = diffKeys(input.todayKey, input.dueKey);
    if (days < 0) {
      points += 40;
      reasons.push(`Atrasada há ${-days} dia(s)`);
    } else if (days === 0) {
      points += 30;
      reasons.push("Vence hoje");
    } else if (days <= 3) {
      points += 20;
      reasons.push(`Vence em ${days} dia(s)`);
    } else if (days <= 7) {
      points += 10;
      reasons.push(`Vence em ${days} dias`);
    }
  }
  if (input.keyAccountClient) {
    points += 15;
    reasons.push("Relacionada a cliente estratégico");
  }
  if (input.opportunityValue !== null && input.largeDealThreshold > 0 && input.opportunityValue >= input.largeDealThreshold) {
    points += 15;
    reasons.push("Ligada a uma oportunidade de alto valor");
  }
  if (input.blocksProject) {
    points += 20;
    reasons.push("Bloqueia o andamento do projeto");
  }
  if (input.projectPriority === "CRITICAL" || input.projectPriority === "HIGH") {
    points += 10;
    reasons.push("Projeto de prioridade alta");
  } else if (input.projectHealthScore !== null && input.projectHealthScore < 60) {
    points += 10;
    reasons.push("Projeto com saúde em risco");
  }
  const priority: PriorityLevel = points >= 60 ? "CRITICAL" : points >= 35 ? "HIGH" : points >= 15 ? "MEDIUM" : "LOW";
  if (!reasons.length) reasons.push("Sem prazo próximo nem vínculos críticos");
  return { priority, points, reasons };
}
