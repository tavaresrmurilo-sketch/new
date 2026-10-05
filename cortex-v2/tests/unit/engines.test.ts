import { describe, expect, it } from "vitest";
import { calculateProposal } from "@/lib/proposal-math";
import { calculateRoi } from "@/lib/roi";
import { riskLevel } from "@/lib/risk";
import { evaluateConditions } from "@/server/automations/conditions";
import { clientHealth } from "@/server/intelligence/client-health";
import { forecastPeriod, weightedPipeline } from "@/server/intelligence/forecast";
import { detectAnomalies, detectInsights } from "@/server/intelligence/insights";
import { scoreOpportunity } from "@/server/intelligence/opportunity-score";
import { computePulse } from "@/server/intelligence/pulse";
import { recommendTaskPriority } from "@/server/intelligence/task-priority";
import { computeWorkload, detectBottlenecks } from "@/server/intelligence/workload";

describe("cálculo de propostas", () => {
  it("aplica desconto percentual e impostos sobre a base", () => {
    const t = calculateProposal([{ description: "A", quantity: 2, unitPrice: 500 }, { description: "B", quantity: 1, unitPrice: 1000 }] as never, { type: "PERCENT", value: 10 }, [{ name: "ISS", rate: 5 }]);
    expect(t.subtotal).toBe(2000);
    expect(t.discountAmount).toBe(200);
    expect(t.taxBase).toBe(1800);
    expect(t.taxTotal).toBe(90);
    expect(t.total).toBe(1890);
  });
  it("desconto em valor nunca excede o subtotal", () => {
    const t = calculateProposal([{ description: "A", quantity: 1, unitPrice: 100 }] as never, { type: "AMOUNT", value: 500 }, []);
    expect(t.discountAmount).toBe(100);
    expect(t.total).toBe(0);
  });
});

describe("pipeline e forecast", () => {
  it("pondera valor × probabilidade", () => {
    expect(weightedPipeline([{ value: 1000, probability: 50 }, { value: 2000, probability: 10 }])).toEqual({ gross: 3000, weighted: 700, count: 2 });
  });
  it("forecast sem histórico mínimo não calcula cenário histórico", () => {
    const f = forecastPeriod({ wonInPeriod: 100, openInPeriod: [{ value: 1000, probability: 80 }, { value: 1000, probability: 40 }, { value: 1000, probability: 10 }], history: { won: 2, lost: 3 } });
    expect(f.historical).toBeNull();
    expect(f.weighted).toBe(100 + 800 + 400 + 100);
    expect(f.conservative).toBe(1100);
    expect(f.optimistic).toBe(2100);
    expect(f.confidence).toBe("baixa");
  });
  it("forecast com histórico usa a taxa real de ganho", () => {
    const f = forecastPeriod({ wonInPeriod: 0, openInPeriod: [{ value: 1000, probability: 50 }], history: { won: 4, lost: 6 } });
    expect(f.historicalWinRate).toBe(40);
    expect(f.historical).toBe(400);
  });
});

describe("Opportunity Radar", () => {
  const base = { probability: 60, daysSinceActivity: 2, daysInStage: 5, daysToClose: 10, proposal: null, hasDecisionMaker: true, hasChampion: true, hasBlocker: false, meetingsLast30d: 2, upcomingMeeting: true, overdueTasks: 0 };
  it("oportunidade ativa e bem mapeada é quente", () => {
    const s = scoreOpportunity(base);
    expect(s.score).toBeGreaterThanOrEqual(70);
    expect(s.category).toBe("HOT");
  });
  it("oportunidade parada perde pontos e explica por quê", () => {
    const s = scoreOpportunity({ ...base, daysSinceActivity: 45, daysToClose: -10, hasDecisionMaker: false, upcomingMeeting: false, meetingsLast30d: 0 });
    expect(s.score).toBeLessThan(scoreOpportunity(base).score);
    expect(s.negatives.some((f) => f.label.includes("Sem atividade"))).toBe(true);
    expect(s.score).toBeGreaterThanOrEqual(0);
  });
});

describe("Smart Priority Engine", () => {
  const base = { todayKey: "2026-10-05", keyAccountClient: false, opportunityValue: null, largeDealThreshold: 50000, blocksProject: false, projectPriority: null, projectHealthScore: null };
  it("tarefa atrasada que bloqueia o projeto é crítica", () => {
    const r = recommendTaskPriority({ ...base, dueKey: "2026-10-01", blocksProject: true });
    expect(r.priority).toBe("CRITICAL");
    expect(r.reasons.length).toBeGreaterThan(0);
  });
  it("tarefa sem prazo e sem contexto é baixa", () => {
    expect(recommendTaskPriority({ ...base, dueKey: null }).priority).toBe("LOW");
  });
});

describe("saúde e capacidade", () => {
  it("cliente sem interação há muito tempo tem saúde menor", () => {
    const good = clientHealth({ status: "ACTIVE", daysSinceInteraction: 3, interactions90d: 8, activeProjects: 1, overdueTasks: 0, atRiskProjects: 0, issues60d: 0, contractExpiringDays: null, wonLast90d: 1 });
    const bad = clientHealth({ status: "ACTIVE", daysSinceInteraction: 90, interactions90d: 0, activeProjects: 0, overdueTasks: 4, atRiskProjects: 1, issues60d: 2, contractExpiringDays: 10, wonLast90d: 0 });
    expect(good.score).toBeGreaterThan(bad.score);
    expect(bad.score).toBeGreaterThanOrEqual(0);
  });
  it("mapa de capacidade classifica sobrecarga", () => {
    const tasks = Array.from({ length: 12 }, () => ({ estimateHours: 8, dueKey: "2026-10-08", projectId: "p1" }));
    const w = computeWorkload({ userId: "u", name: "U", weeklyCapacityHours: 40, tasks, managedActiveProjects: 0 }, "2026-10-05");
    expect(w.utilization).toBe(120);
    expect(w.status).toBe("OVERLOADED");
    expect(detectBottlenecks([{ userId: "u", name: "U", weeklyCapacityHours: 40, tasks, managedActiveProjects: 0 }])[0]?.share).toBe(100);
  });
});

describe("Córtex Pulse", () => {
  it("não calcula índice com um único componente", () => {
    const p = computePulse({ commercial: { openOpportunities: 0, activeLast14d: 0, winRate90d: null, pipelineNow: 0, pipeline30dAgo: null }, projects: { healthScores: [] }, clients: { healthScores: [80] }, operations: { openTasks: 1, overdueTasks: 0, members: 1, overloadedMembers: 0 } });
    expect(p.score).toBeNull();
    expect(p.label).toBe("Dados insuficientes");
  });
  it("redistribui pesos entre componentes disponíveis", () => {
    const p = computePulse({ commercial: { openOpportunities: 0, activeLast14d: 0, winRate90d: null, pipelineNow: 0, pipeline30dAgo: null }, projects: { healthScores: [60] }, clients: { healthScores: [80] }, operations: { openTasks: 0, overdueTasks: 0, members: 1, overloadedMembers: 0 } });
    expect(p.score).toBe(70);
  });
});

describe("insights e anomalias exigem amostra mínima", () => {
  const empty = { winBySource: [], lossReasons: [], lossReasonsPeriodLabel: "", staleOpportunities: { count: 0, value: 0, days: 14 }, projectOverrunBySegment: [], salesCycle: { won: 0, avgDays: 0 }, proposals: { decided: 0, accepted: 0 }, concentration: { topClientName: null, topShare: 0, clientsWithRevenue: 0 }, formatMoney: (v: number) => String(v) };
  it("sem dados não gera conclusões", () => {
    expect(detectInsights(empty)).toEqual([]);
  });
  it("amostra pequena de origens não gera insight de conversão", () => {
    expect(detectInsights({ ...empty, winBySource: [{ source: "REFERRAL", won: 3, lost: 0 }, { source: "ADS", won: 0, lost: 3 }] }).find((i) => i.id === "win-by-source")).toBeUndefined();
  });
  it("anomalia nunca afirma causa", () => {
    const a = detectAnomalies({ weeklyNewOpportunities: [5, 5, 5, 5, 5, 5, 5, 5, 1, 1, 1, 1], delayedProjectsNow: 0, delayedProjects4wAgo: null, pipelineNow: 0, pipeline30dAgo: null, conversion: { recentWon: 0, recentLost: 0, prevWon: 0, prevLost: 0 }, formatMoney: String });
    expect(a).toHaveLength(1);
    expect(a[0]!.title).toMatch(/^Possível anomalia detectada/);
    expect(a[0]!.body).toMatch(/não indica, por si só, a causa/);
  });
});

describe("automações, riscos e ROI", () => {
  it("avalia condições IF (todas verdadeiras)", () => {
    const f = { value: 60000, stageName: "Proposta", source: "REFERRAL" };
    expect(evaluateConditions([{ field: "value", operator: "gt", value: "50000" }, { field: "stageName", operator: "equals", value: "proposta" }], f)).toBe(true);
    expect(evaluateConditions([{ field: "value", operator: "lt", value: "1000" }], f)).toBe(false);
    expect(evaluateConditions([{ field: "inexistente", operator: "equals", value: "x" }], f)).toBe(false);
  });
  it("matriz de riscos", () => {
    expect(riskLevel(4, 4)).toBe("CRITICAL");
    expect(riskLevel(2, 4)).toBe("HIGH");
    expect(riskLevel(1, 1)).toBe("LOW");
  });
  it("ROI e payback determinísticos", () => {
    const r = calculateRoi({ investment: 12000, monthlyCost: 0, monthlySavings: 2000, monthlyRevenueGain: 0, revenueMarginPct: 0, months: 12 });
    expect(r.paybackMonths).toBe(6);
    expect(r.roiPct).toBe(100);
    expect(calculateRoi({ investment: 1000, monthlyCost: 500, monthlySavings: 100, monthlyRevenueGain: 0, revenueMarginPct: 0, months: 12 }).paybackMonths).toBeNull();
  });
});
