import { CLOSE_REASON, SOURCE_LABELS } from "@/lib/labels";
import type { InsightTone } from "@/components/common/ai-insight-card";

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  body?: string;
  evidence: string;
  href?: string;
}

export interface InsightsInput {
  winBySource: { source: string; won: number; lost: number }[];
  lossReasons: { reason: string; count: number }[];
  lossReasonsPeriodLabel: string;
  staleOpportunities: { count: number; value: number; days: number };
  projectOverrunBySegment: { segment: string; projects: number; avgOverrunPct: number }[];
  salesCycle: { won: number; avgDays: number };
  proposals: { decided: number; accepted: number };
  concentration: { topClientName: string | null; topShare: number; clientsWithRevenue: number };
  formatMoney: (v: number) => string;
}

/** Amostras mínimas: nenhuma conclusão é exibida abaixo destes limites. */
export const MIN_SAMPLE = {
  perSource: 5,
  totalClosed: 15,
  lossReasons: 5,
  segmentProjects: 3,
  wonForCycle: 5,
  decidedProposals: 5,
  clientsForConcentration: 3,
};

const pct = (n: number) => Math.round(n * 100);

export function detectInsights(i: InsightsInput): Insight[] {
  const out: Insight[] = [];

  // Conversão por origem
  const totalClosed = i.winBySource.reduce((s, x) => s + x.won + x.lost, 0);
  const eligible = i.winBySource.filter((x) => x.won + x.lost >= MIN_SAMPLE.perSource);
  if (totalClosed >= MIN_SAMPLE.totalClosed && eligible.length >= 2) {
    const overall = i.winBySource.reduce((s, x) => s + x.won, 0) / totalClosed;
    const best = [...eligible].sort((a, b) => b.won / (b.won + b.lost) - a.won / (a.won + a.lost))[0]!;
    const rate = best.won / (best.won + best.lost);
    if (rate - overall >= 0.1) {
      out.push({
        id: "win-by-source",
        tone: "opportunity",
        title: `Oportunidades vindas de ${SOURCE_LABELS[best.source] ?? best.source} têm taxa de fechamento de ${pct(rate)}%`,
        body: `A média geral é ${pct(overall)}%. Vale priorizar e estimular esse canal.`,
        evidence: `${best.won + best.lost} negócios fechados dessa origem; ${totalClosed} no total.`,
        href: "/app/reports/win-loss",
      });
    }
  }

  // Principal motivo de perda
  const lostTotal = i.lossReasons.reduce((s, x) => s + x.count, 0);
  if (lostTotal >= MIN_SAMPLE.lossReasons) {
    const top = [...i.lossReasons].sort((a, b) => b.count - a.count)[0]!;
    const share = top.count / lostTotal;
    if (share >= 0.3) {
      out.push({
        id: "loss-reason",
        tone: "warning",
        title: `${pct(share)}% das oportunidades perdidas tiveram ${CLOSE_REASON[top.reason] ?? top.reason} registrado como motivo`,
        body: `Principal motivo de perda ${i.lossReasonsPeriodLabel}.`,
        evidence: `${top.count} de ${lostTotal} perdas com motivo registrado.`,
        href: "/app/reports/win-loss",
      });
    }
  }

  // Valor parado no pipeline (fato direto, sem amostragem)
  if (i.staleOpportunities.count > 0) {
    out.push({
      id: "stale-pipeline",
      tone: i.staleOpportunities.count >= 5 ? "critical" : "warning",
      title: `Você possui ${i.formatMoney(i.staleOpportunities.value)} em oportunidades sem atividade recente`,
      body: `${i.staleOpportunities.count} oportunidade(s) abertas sem nenhuma atividade há ${i.staleOpportunities.days} dias ou mais.`,
      evidence: "Data da última atividade registrada em cada oportunidade aberta.",
      href: "/app/opportunities/radar?category=AT_RISK",
    });
  }

  // Prazo de projetos por segmento
  const segs = i.projectOverrunBySegment.filter((s) => s.projects >= MIN_SAMPLE.segmentProjects);
  if (segs.length >= 2) {
    const allProjects = segs.reduce((s, x) => s + x.projects, 0);
    const avgAll = segs.reduce((s, x) => s + x.avgOverrunPct * x.projects, 0) / allProjects;
    const worst = [...segs].sort((a, b) => b.avgOverrunPct - a.avgOverrunPct)[0]!;
    const diff = worst.avgOverrunPct - avgAll;
    if (diff >= 10) {
      out.push({
        id: "segment-overrun",
        tone: "info",
        title: `Projetos do segmento ${worst.segment} apresentam prazo médio ${Math.round(diff)}% maior`,
        body: "Considere revisar estimativas de prazo para novos projetos desse segmento.",
        evidence: `${worst.projects} projetos concluídos do segmento; comparação com ${allProjects} projetos concluídos em segmentos com amostra suficiente.`,
        href: "/app/reports/projects",
      });
    }
  }

  if (i.salesCycle.won >= MIN_SAMPLE.wonForCycle) {
    out.push({
      id: "sales-cycle",
      tone: "info",
      title: `Seu ciclo médio de venda é de ${Math.round(i.salesCycle.avgDays)} dias`,
      body: "Da criação da oportunidade até o fechamento como ganha.",
      evidence: `${i.salesCycle.won} oportunidades ganhas nos últimos 12 meses.`,
      href: "/app/reports/sales",
    });
  }

  if (i.proposals.decided >= MIN_SAMPLE.decidedProposals) {
    const rate = i.proposals.accepted / i.proposals.decided;
    out.push({
      id: "proposal-acceptance",
      tone: rate >= 0.4 ? "opportunity" : "warning",
      title: `${pct(rate)}% das propostas decididas foram aceitas`,
      evidence: `${i.proposals.accepted} aceitas de ${i.proposals.decided} propostas aceitas ou recusadas.`,
      href: "/app/reports/proposals",
    });
  }

  if (i.concentration.clientsWithRevenue >= MIN_SAMPLE.clientsForConcentration && i.concentration.topShare >= 0.3 && i.concentration.topClientName) {
    out.push({
      id: "revenue-concentration",
      tone: "warning",
      title: `${pct(i.concentration.topShare)}% da receita contratada está concentrada em ${i.concentration.topClientName}`,
      body: "Alta dependência de um único cliente aumenta o risco do negócio.",
      evidence: `Contratos ativos de ${i.concentration.clientsWithRevenue} clientes.`,
      href: "/app/reports/clients",
    });
  }
  return out;
}

export interface AnomalyInput {
  /** novas oportunidades por semana, da mais antiga para a mais recente (12 semanas) */
  weeklyNewOpportunities: number[];
  delayedProjectsNow: number;
  delayedProjects4wAgo: number | null;
  pipelineNow: number;
  pipeline30dAgo: number | null;
  conversion: { recentWon: number; recentLost: number; prevWon: number; prevLost: number };
  formatMoney: (v: number) => string;
}

/** Regras de anomalia. Sinalizam variações incomuns — nunca afirmam causa. */
export function detectAnomalies(i: AnomalyInput): Insight[] {
  const out: Insight[] = [];
  const weeks = i.weeklyNewOpportunities;
  if (weeks.length >= 12) {
    const baseline = weeks.slice(0, 8).reduce((a, b) => a + b, 0) / 8;
    const recent = weeks.slice(8).reduce((a, b) => a + b, 0) / 4;
    if (baseline >= 3 && recent < baseline * 0.6) {
      out.push({
        id: "anomaly-new-opps",
        tone: "anomaly",
        title: `Possível anomalia detectada: queda de ${Math.round((1 - recent / baseline) * 100)}% em novas oportunidades`,
        body: "A variação foi detectada nos dados; não indica, por si só, a causa.",
        evidence: `Média de ${recent.toFixed(1)}/semana nas últimas 4 semanas vs. ${baseline.toFixed(1)}/semana nas 8 anteriores.`,
        href: "/app/reports/pipeline",
      });
    }
  }
  if (i.delayedProjects4wAgo !== null && i.delayedProjectsNow - i.delayedProjects4wAgo >= 2 && i.delayedProjectsNow >= i.delayedProjects4wAgo * 1.5) {
    out.push({
      id: "anomaly-delayed-projects",
      tone: "anomaly",
      title: "Possível anomalia detectada: aumento de projetos atrasados",
      body: "A variação foi detectada nos dados; não indica, por si só, a causa.",
      evidence: `${i.delayedProjectsNow} projetos atrasados hoje vs. ${i.delayedProjects4wAgo} há 4 semanas.`,
      href: "/app/projects?status=DELAYED",
    });
  }
  if (i.pipeline30dAgo !== null && i.pipeline30dAgo > 0 && i.pipelineNow < i.pipeline30dAgo * 0.75) {
    out.push({
      id: "anomaly-pipeline",
      tone: "anomaly",
      title: `Possível anomalia detectada: pipeline ${Math.round((1 - i.pipelineNow / i.pipeline30dAgo) * 100)}% menor que há 30 dias`,
      body: "A variação foi detectada nos dados; não indica, por si só, a causa.",
      evidence: `${i.formatMoney(i.pipelineNow)} hoje vs. ${i.formatMoney(i.pipeline30dAgo)} há 30 dias (snapshots diários).`,
      href: "/app/pipeline",
    });
  }
  const c = i.conversion;
  const recentN = c.recentWon + c.recentLost;
  const prevN = c.prevWon + c.prevLost;
  if (recentN >= 10 && prevN >= 10) {
    const recent = c.recentWon / recentN;
    const prev = c.prevWon / prevN;
    if (prev - recent >= 0.15) {
      out.push({
        id: "anomaly-conversion",
        tone: "anomaly",
        title: `Possível anomalia detectada: taxa de conversão caiu de ${pct(prev)}% para ${pct(recent)}%`,
        body: "A variação foi detectada nos dados; não indica, por si só, a causa.",
        evidence: `Últimos 90 dias (${recentN} fechados) vs. 90 dias anteriores (${prevN} fechados).`,
        href: "/app/reports/win-loss",
      });
    }
  }
  return out;
}
