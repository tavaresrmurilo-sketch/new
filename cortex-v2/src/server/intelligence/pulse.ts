import { clampScore } from "./types";

export interface PulseInput {
  commercial: { openOpportunities: number; activeLast14d: number; winRate90d: number | null; pipelineNow: number; pipeline30dAgo: number | null };
  projects: { healthScores: number[] };
  clients: { healthScores: number[] };
  operations: { openTasks: number; overdueTasks: number; members: number; overloadedMembers: number };
}

export interface PulseComponent {
  key: "commercial" | "projects" | "clients" | "operations";
  label: string;
  score: number | null;
  weight: number;
  explanation: string;
}

export interface PulseResult {
  score: number | null;
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
  components: PulseComponent[];
}

export function pulseLabel(score: number | null): { label: string; tone: PulseResult["tone"] } {
  if (score === null) return { label: "Dados insuficientes", tone: "neutral" };
  if (score >= 80) return { label: "Excelente", tone: "success" };
  if (score >= 65) return { label: "Saudável", tone: "success" };
  if (score >= 50) return { label: "Atenção", tone: "warning" };
  return { label: "Crítico", tone: "danger" };
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Córtex Pulse — metodologia documentada:
 * - Comercial (30%): 40% engajamento (oportunidades com atividade em 14 dias), 30% taxa de ganho em 90 dias
 *   (50% de ganho = 100 pts) e 30% tendência do pipeline vs. 30 dias atrás (estável = 70 pts). Requer ≥ 3 oportunidades abertas.
 * - Projetos (25%): média do Project Health Score dos projetos ativos.
 * - Clientes (25%): média da saúde do relacionamento dos clientes ativos.
 * - Operações (20%): 70% tarefas em dia + 30% equipe dentro da capacidade. Requer ≥ 5 tarefas abertas.
 * Componentes sem dados suficientes são excluídos e os pesos redistribuídos.
 * O índice geral só é calculado com ao menos 2 componentes com dados (evita um “Pulse” baseado em um único sinal).
 */
export function computePulse(input: PulseInput): PulseResult {
  const c = input.commercial;
  let commercial: number | null = null;
  let commercialWhy = "Menos de 3 oportunidades abertas — dados insuficientes.";
  if (c.openOpportunities >= 3) {
    const parts: { v: number; w: number }[] = [{ v: (c.activeLast14d / c.openOpportunities) * 100, w: 0.4 }];
    if (c.winRate90d !== null) parts.push({ v: Math.min(100, c.winRate90d * 2), w: 0.3 });
    if (c.pipeline30dAgo !== null && c.pipeline30dAgo > 0) parts.push({ v: Math.max(0, Math.min(100, 70 + (c.pipelineNow / c.pipeline30dAgo - 1) * 100)), w: 0.3 });
    const wsum = parts.reduce((s, p) => s + p.w, 0);
    commercial = clampScore(parts.reduce((s, p) => s + p.v * p.w, 0) / wsum);
    commercialWhy = `${c.activeLast14d} de ${c.openOpportunities} oportunidades com atividade em 14 dias${c.winRate90d !== null ? `; taxa de ganho de ${Math.round(c.winRate90d)}% em 90 dias` : ""}.`;
  }
  const projAvg = avg(input.projects.healthScores);
  const cliAvg = avg(input.clients.healthScores);
  const o = input.operations;
  let operations: number | null = null;
  let opsWhy = "Menos de 5 tarefas abertas — dados insuficientes.";
  if (o.openTasks >= 5) {
    const onTime = 1 - o.overdueTasks / o.openTasks;
    const capacity = o.members > 0 ? 1 - o.overloadedMembers / o.members : 1;
    operations = clampScore(onTime * 70 + capacity * 30);
    opsWhy = `${o.overdueTasks} de ${o.openTasks} tarefas abertas atrasadas; ${o.overloadedMembers} pessoa(s) acima da capacidade.`;
  }
  const components: PulseComponent[] = [
    { key: "commercial", label: "Comercial", score: commercial, weight: 30, explanation: commercialWhy },
    {
      key: "projects",
      label: "Projetos",
      score: projAvg === null ? null : clampScore(projAvg),
      weight: 25,
      explanation: projAvg === null ? "Nenhum projeto ativo." : `Média da saúde de ${input.projects.healthScores.length} projeto(s) ativo(s).`,
    },
    {
      key: "clients",
      label: "Clientes",
      score: cliAvg === null ? null : clampScore(cliAvg),
      weight: 25,
      explanation: cliAvg === null ? "Nenhum cliente ativo." : `Média da saúde de ${input.clients.healthScores.length} cliente(s) ativo(s).`,
    },
    { key: "operations", label: "Operações", score: operations, weight: 20, explanation: opsWhy },
  ];
  const available = components.filter((x) => x.score !== null);
  const totalW = available.reduce((s, x) => s + x.weight, 0);
  const score = available.length >= 2 && totalW ? clampScore(available.reduce((s, x) => s + (x.score as number) * x.weight, 0) / totalW) : null;
  return { score, ...pulseLabel(score), components };
}
