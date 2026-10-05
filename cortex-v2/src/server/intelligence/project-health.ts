import { diffKeys } from "@/lib/dates";
import { clampScore, type ScoreFactor, type Tone } from "./types";

export interface ProjectHealthInput {
  status: "PLANNING" | "ACTIVE" | "PAUSED" | "DELAYED" | "COMPLETED" | "CANCELED";
  /** progresso efetivo 0–100 */
  progress: number;
  startKey: string | null;
  dueKey: string | null;
  todayKey: string;
  overdueTasks: number;
  /** tarefas de prioridade alta/crítica que vencem nos próximos 7 dias e não estão concluídas */
  importantDueSoon: number;
  blockedTasks: number;
  budget: number | null;
  actualCost: number | null;
  openRisks: { critical: number; high: number };
  overloadedMembers: number;
}

export interface ProjectHealth {
  score: number | null;
  label: string;
  tone: Tone;
  factors: ScoreFactor[];
  /** mensagens de risco em linguagem natural (ex.: “2 tarefas importantes vencem nesta semana.”) */
  risks: string[];
  /** progresso esperado pelo tempo decorrido (0–100) */
  expectedProgress: number | null;
}

export function projectHealthLabel(score: number): { label: string; tone: Tone } {
  if (score >= 80) return { label: "Boa", tone: "success" };
  if (score >= 60) return { label: "Atenção", tone: "warning" };
  if (score >= 40) return { label: "Em risco", tone: "danger" };
  return { label: "Crítica", tone: "danger" };
}

/**
 * Project Health Score (0–100): parte de 100 e subtrai penalidades de prazo, tarefas atrasadas,
 * entregas importantes próximas, bloqueios, orçamento, riscos abertos e sobrecarga da equipe.
 */
export function projectHealth(input: ProjectHealthInput): ProjectHealth {
  if (input.status === "COMPLETED") return { score: 100, label: "Concluído", tone: "success", factors: [], risks: [], expectedProgress: 100 };
  if (input.status === "CANCELED") return { score: null, label: "Cancelado", tone: "neutral", factors: [], risks: [], expectedProgress: null };

  const factors: ScoreFactor[] = [];
  const risks: string[] = [];
  const add = (label: string, impact: number) => impact !== 0 && factors.push({ label, impact });

  let expectedProgress: number | null = null;
  if (input.dueKey) {
    const daysLeft = diffKeys(input.todayKey, input.dueKey);
    if (daysLeft < 0) {
      add(`Prazo final vencido há ${-daysLeft} dia(s)`, -30);
      risks.push(`O prazo final venceu há ${-daysLeft} dia(s) e o projeto ainda não foi concluído.`);
    } else if (input.startKey) {
      const total = Math.max(1, diffKeys(input.startKey, input.dueKey));
      const elapsed = Math.min(total, Math.max(0, diffKeys(input.startKey, input.todayKey)));
      expectedProgress = Math.round((elapsed / total) * 100);
      const gap = expectedProgress - input.progress;
      if (gap > 25) {
        add(`Progresso ${gap} p.p. abaixo do esperado para a data`, -20);
        risks.push(`Pelo tempo decorrido, o esperado seria ~${expectedProgress}% de progresso; o projeto está em ${input.progress}%.`);
      } else if (gap > 10) add(`Progresso ${gap} p.p. abaixo do esperado`, -10);
      if (daysLeft <= 7 && input.progress < 80) risks.push(`Faltam ${daysLeft} dia(s) para o prazo e o progresso está em ${input.progress}%.`);
    }
  }

  if (input.overdueTasks > 0) {
    add(`${input.overdueTasks} tarefa(s) atrasada(s)`, -Math.min(25, input.overdueTasks * 5));
    risks.push(`${input.overdueTasks} tarefa(s) atrasada(s).`);
  }
  if (input.importantDueSoon > 0) {
    add(`${input.importantDueSoon} tarefa(s) importante(s) vencem nesta semana`, -Math.min(9, input.importantDueSoon * 3));
    risks.push(`${input.importantDueSoon} tarefa${input.importantDueSoon > 1 ? "s importantes vencem" : " importante vence"} nesta semana.`);
  }
  if (input.blockedTasks > 0) {
    add(`${input.blockedTasks} tarefa(s) bloqueada(s)`, -Math.min(10, input.blockedTasks * 5));
    risks.push(`${input.blockedTasks} tarefa(s) bloqueada(s) aguardando resolução.`);
  }
  if (input.budget && input.budget > 0 && input.actualCost !== null) {
    const ratio = input.actualCost / input.budget;
    if (ratio > 1) {
      add(`Custo ${Math.round((ratio - 1) * 100)}% acima do orçamento`, -20);
      risks.push(`O custo realizado ultrapassou o orçamento em ${Math.round((ratio - 1) * 100)}%.`);
    } else if (ratio > 0.9 && input.progress < 80) {
      add("Mais de 90% do orçamento consumido com progresso abaixo de 80%", -10);
      risks.push("Mais de 90% do orçamento já foi consumido e o progresso está abaixo de 80%.");
    }
  }
  const riskPenalty = Math.min(20, input.openRisks.critical * 10 + input.openRisks.high * 5);
  if (riskPenalty > 0) {
    add(`${input.openRisks.critical} risco(s) crítico(s) e ${input.openRisks.high} alto(s) em aberto`, -riskPenalty);
    risks.push(`Há ${input.openRisks.critical + input.openRisks.high} risco(s) de nível alto ou crítico no registro de riscos.`);
  }
  if (input.overloadedMembers > 0) {
    add(`${input.overloadedMembers} pessoa(s) da equipe acima da capacidade`, -5);
    risks.push(`${input.overloadedMembers} pessoa(s) da equipe do projeto estão acima da capacidade estimada.`);
  }
  if (input.status === "PAUSED") add("Projeto pausado", -5);
  if (input.status === "DELAYED") add("Status marcado como atrasado", -10);

  const score = clampScore(100 + factors.reduce((s, f) => s + f.impact, 0));
  return { score, ...projectHealthLabel(score), factors, risks, expectedProgress };
}
