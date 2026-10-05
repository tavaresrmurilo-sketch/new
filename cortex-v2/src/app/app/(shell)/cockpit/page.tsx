import Link from "next/link";
import { FileText } from "lucide-react";
import { ScoreRing } from "@/components/common/badges";
import { MetricCard, percentChange } from "@/components/common/metric-card";
import { PageHeader, Section } from "@/components/common/page-header";
import { RadarBadge } from "@/components/common/radar-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/format";
import { toNumber } from "@/lib/utils";
import { can, requireCtx } from "@/server/auth/context";
import { hasFeature } from "@/server/billing/feature-gate";
import { comparableWindows, forecastFor, periodFlow, pipelineMetrics, resolvePeriod } from "@/server/modules/analytics";
import { financeSummary } from "@/server/modules/finance";
import { getPulse } from "@/server/modules/intelligence";
import { getOpportunityRadar } from "@/server/modules/opportunities";
import { projectHealthBatch } from "@/server/modules/projects";
import { getWorkloadMap } from "@/server/modules/workload";

export const metadata = { title: "Executive Cockpit" };

export default async function CockpitPage() {
  const ctx = await requireCtx("reports.read");
  const finance = can(ctx, "finance.read");
  const money = (v: number) => (finance ? formatCurrency(v, ctx.org.currency, { compact: true }) : "•••");
  const ytd = resolvePeriod(ctx, "year");
  const q = resolvePeriod(ctx, "quarter");
  const wy = comparableWindows(ytd);
  const [pulse, cur, prev, pipeline, fcQ, fin, radar, projects, team] = await Promise.all([
    getPulse(ctx),
    periodFlow(ctx, wy.cur.start, wy.cur.end),
    periodFlow(ctx, wy.prev.start, wy.prev.end),
    pipelineMetrics(ctx),
    forecastFor(ctx, q),
    finance ? financeSummary(ctx, ytd) : null,
    can(ctx, "opportunities.read") ? getOpportunityRadar(ctx) : [],
    ctx.db.project.findMany({ where: { status: { in: ["ACTIVE", "DELAYED"] } }, select: { id: true, name: true, status: true, progress: true, startDate: true, dueDate: true, budget: true, actualCost: true, client: { select: { name: true } } }, take: 300 }),
    can(ctx, "team.read") ? getWorkloadMap(ctx) : null,
  ]);
  const health = await projectHealthBatch(ctx, projects);
  const atRiskProjects = projects.map((p) => ({ ...p, h: health.get(p.id) })).filter((p) => p.h?.score !== null && (p.h?.score ?? 100) < 60).sort((a, b) => (a.h?.score ?? 0) - (b.h?.score ?? 0)).slice(0, 5);
  const topOpps = radar.slice(0, 5);
  const atRiskValue = radar.filter((o) => o.scored.category === "AT_RISK").reduce((s, o) => s + toNumber(o.value), 0);
  const util = team && team.members.length ? Math.round(team.members.reduce((s, m) => s + m.workload.utilization, 0) / team.members.length) : null;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Executive Cockpit"
        description="A visão da diretoria em uma tela: resultado do ano, previsão do trimestre, riscos e capacidade."
        actions={finance && hasFeature(ctx, "executive_report") ? <a href="/api/reports/executive" target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] hover:bg-accent"><FileText className="size-3.5" /> Relatório Executivo (PDF)</a> : null}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
          <ScoreRing score={pulse.score} size={52} />
          <div><p className="text-xs text-muted-foreground">Córtex Pulse</p><p className="font-semibold">{pulse.label}</p></div>
        </div>
        <MetricCard label="Receita ganha no ano" value={money(cur.wonValue)} delta={{ percent: percentChange(cur.wonValue, prev.wonValue), label: "vs. mesmo intervalo do ano anterior" }} />
        <MetricCard label="Forecast do trimestre (ponderado)" value={money(fcQ.weighted)} hint={`Conservador ${money(fcQ.conservative)} · confiança ${fcQ.confidence}`} href="/app/forecast?period=quarter" />
        {fin ? <MetricCard label="MRR / ARR contratado" value={money(fin.mrr)} hint={`ARR ${money(fin.arr)}`} /> : <MetricCard label="Pipeline aberto" value={pipeline.count} />}
        <MetricCard label="Pipeline ponderado" value={money(pipeline.weighted)} hint={`${pipeline.count} oportunidades`} href="/app/pipeline" />
        <MetricCard label="Valor em risco no pipeline" value={money(atRiskValue)} tone={atRiskValue ? "danger" : "default"} href="/app/opportunities/radar?category=AT_RISK" />
        <MetricCard label="Taxa de conversão no ano" value={cur.conversionRate === null ? "—" : formatPercent(cur.conversionRate)} href="/app/reports/win-loss" />
        <MetricCard label="Ocupação média da equipe" value={util === null ? "—" : `${util}%`} href="/app/team" tone={util !== null && util > 100 ? "danger" : "default"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Maiores oportunidades por score</CardTitle></CardHeader>
          <CardContent>
            {topOpps.length ? (
              <ul className="space-y-2">{topOpps.map((o) => (
                <li key={o.id} className="flex items-center gap-2 text-sm">
                  <RadarBadge category={o.scored.category} score={o.scored.score} />
                  <Link href={`/app/opportunities/${o.id}`} className="min-w-0 flex-1 truncate hover:underline">{o.title}</Link>
                  <span className="tabular text-xs text-muted-foreground">{money(toNumber(o.value))}</span>
                </li>
              ))}</ul>
            ) : <p className="text-xs text-muted-foreground">Nenhuma oportunidade aberta.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Projetos que exigem atenção (saúde &lt; 60)</CardTitle></CardHeader>
          <CardContent>
            {atRiskProjects.length ? (
              <ul className="space-y-2">{atRiskProjects.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="tabular w-8 font-semibold text-destructive">{p.h?.score}</span>
                  <Link href={`/app/projects/${p.id}`} className="min-w-0 flex-1 truncate hover:underline">{p.name}</Link>
                  <span className="text-xs text-muted-foreground">{p.client?.name}</span>
                </li>
              ))}</ul>
            ) : <p className="text-xs text-muted-foreground">Nenhum projeto ativo com saúde abaixo de 60.</p>}
          </CardContent>
        </Card>
      </div>
      <Section title="Componentes do Pulse">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {pulse.components.map((c) => <MetricCard key={c.key} label={`${c.label} · peso ${c.weight}%`} value={c.score ?? "—"} hint={c.explanation} />)}
        </div>
      </Section>
    </div>
  );
}
