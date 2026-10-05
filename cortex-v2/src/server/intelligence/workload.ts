import { diffKeys } from "@/lib/dates";

export const DEFAULT_TASK_HOURS = 2;
export const WINDOW_DAYS = 14;
export const PM_HOURS_PER_WEEK = 2;

export interface WorkloadTask {
  estimateHours: number | null;
  dueKey: string | null;
  projectId: string | null;
}

export interface WorkloadMemberInput {
  userId: string;
  name: string;
  weeklyCapacityHours: number;
  tasks: WorkloadTask[];
  managedActiveProjects: number;
}

export type WorkloadStatus = "OVERLOADED" | "HIGH" | "BALANCED" | "AVAILABLE";

export interface WorkloadResult {
  userId: string;
  name: string;
  loadHours: number;
  capacityHours: number;
  utilization: number;
  status: WorkloadStatus;
  openTasks: number;
  overdueTasks: number;
  dueInWindow: number;
  undated: number;
}

export const WORKLOAD_LABELS: Record<WorkloadStatus, { label: string; tone: "danger" | "warning" | "success" | "info" }> = {
  OVERLOADED: { label: "Sobrecarregado", tone: "danger" },
  HIGH: { label: "Alta ocupação", tone: "warning" },
  BALANCED: { label: "Equilibrado", tone: "success" },
  AVAILABLE: { label: "Disponível", tone: "info" },
};

/**
 * Mapa de Capacidade. Critérios (exibidos na interface):
 * - janela de 14 dias; capacidade = horas semanais × 2;
 * - carga = estimativa das tarefas abertas que vencem na janela (inclui atrasadas) + 50% das tarefas sem prazo
 *   + 2 h/semana por projeto ativo gerenciado; tarefas sem estimativa contam 2 h;
 * - faixas: >100% sobrecarregado · 85–100% alta ocupação · 50–84% equilibrado · <50% disponível.
 */
export function computeWorkload(member: WorkloadMemberInput, todayKey: string): WorkloadResult {
  let load = 0;
  let overdue = 0;
  let inWindow = 0;
  let undated = 0;
  for (const t of member.tasks) {
    const hours = t.estimateHours && t.estimateHours > 0 ? t.estimateHours : DEFAULT_TASK_HOURS;
    if (!t.dueKey) {
      load += hours * 0.5;
      undated++;
      continue;
    }
    const days = diffKeys(todayKey, t.dueKey);
    if (days < 0) overdue++;
    if (days <= WINDOW_DAYS) {
      load += hours;
      inWindow++;
    }
  }
  load += member.managedActiveProjects * PM_HOURS_PER_WEEK * (WINDOW_DAYS / 7);
  const capacity = Math.max(1, member.weeklyCapacityHours) * (WINDOW_DAYS / 7);
  const utilization = Math.round((load / capacity) * 100);
  const status: WorkloadStatus = utilization > 100 ? "OVERLOADED" : utilization >= 85 ? "HIGH" : utilization >= 50 ? "BALANCED" : "AVAILABLE";
  return {
    userId: member.userId,
    name: member.name,
    loadHours: Math.round(load * 10) / 10,
    capacityHours: Math.round(capacity),
    utilization,
    status,
    openTasks: member.tasks.length,
    overdueTasks: overdue,
    dueInWindow: inWindow,
    undated,
  };
}

export interface Bottleneck {
  projectId: string;
  userId: string;
  share: number;
  tasks: number;
}

/** Gargalos: uma pessoa concentra ≥ 60% das tarefas abertas de um projeto com ao menos 5 tarefas. */
export function detectBottlenecks(members: WorkloadMemberInput[]): Bottleneck[] {
  const byProject = new Map<string, Map<string, number>>();
  for (const m of members) {
    for (const t of m.tasks) {
      if (!t.projectId) continue;
      const map = byProject.get(t.projectId) ?? new Map<string, number>();
      map.set(m.userId, (map.get(m.userId) ?? 0) + 1);
      byProject.set(t.projectId, map);
    }
  }
  const out: Bottleneck[] = [];
  for (const [projectId, counts] of byProject) {
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    if (total < 5) continue;
    for (const [userId, n] of counts) {
      const share = n / total;
      if (share >= 0.6) out.push({ projectId, userId, share: Math.round(share * 100), tasks: n });
    }
  }
  return out;
}
