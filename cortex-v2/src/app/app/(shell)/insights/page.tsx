import { Lightbulb, TrendingDown } from "lucide-react";
import { LineSeriesChart } from "@/components/charts/charts";
import { AIInsightCard } from "@/components/common/ai-insight-card";
import { ScoreRing } from "@/components/common/badges";
import { EmptyState } from "@/components/common/empty-state";
import { LinkTabs } from "@/components/common/link-tabs";
import { PageHeader, Section } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatShortDate } from "@/lib/format";
import { first, type SearchParams } from "@/lib/list-params";
import { cn } from "@/lib/utils";
import { can, requireCtx } from "@/server/auth/context";
import { MIN_SAMPLE } from "@/server/intelligence/insights";
import { getInsights, getPulse, snapshotSeries } from "@/server/modules/intelligence";

export const metadata = { title: "Córtex Insights" };

export default async function InsightsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("reports.read");
  const sp = await searchParams;
  const tab = first(sp.tab) ?? "insights";
  const finance = can(ctx, "finance.read");
  const [{ insights, anomalies, snapshotsDays }, pulse, pipeline, delayed, overdue] = await Promise.all([
    getInsights(ctx),
    getPulse(ctx),
    finance ? snapshotSeries(ctx, "pipeline.open", 90) : Promise.resolve([]),
    snapshotSeries(ctx, "projects.delayed", 90),
    snapshotSeries(ctx, "tasks.overdue", 90),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader title="Córtex Insights" description="Padrões encontrados nos seus dados por regras transparentes, com amostra mínima e a base de cada conclusão. Correlação não é causalidade: o Córtex aponta, você interpreta." />
      <LinkTabs
        pathname="/app/insights"
        searchParams={sp}
        active={tab}
        tabs={[
          { key: "insights", label: "Insights", count: insights.length },
          { key: "anomalies", label: "Anomalias", count: anomalies.length },
          { key: "trends", label: "Tendências" },
          { key: "pulse", label: "Córtex Pulse" },
        ]}
      />

      {tab === "insights" ? (
        insights.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {insights.map((i) => <AIInsightCard key={i.id} tone={i.tone} title={i.title} body={i.body} evidence={i.evidence} href={i.href} />)}
          </div>
        ) : (
          <EmptyState icon={Lightbulb} title="Ainda não há dados suficientes" description={`Amostras mínimas: ${MIN_SAMPLE.totalClosed} negócios fechados para comparar origens, ${MIN_SAMPLE.lossReasons} perdas com motivo, ${MIN_SAMPLE.wonForCycle} ganhos para ciclo de venda, ${MIN_SAMPLE.decidedProposals} propostas decididas e ${MIN_SAMPLE.segmentProjects} projetos concluídos por segmento.`} />
        )
      ) : null}

      {tab === "anomalies" ? (
        <div className="space-y-3">
          <p className="text-[13px] text-muted-foreground">Variações incomuns em relação ao histórico do próprio workspace. Uma anomalia indica que algo mudou — não a causa. Base histórica disponível: {snapshotsDays} dia(s) de snapshots.</p>
          {anomalies.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {anomalies.map((i) => <AIInsightCard key={i.id} tone={i.tone} title={i.title} body={i.body} evidence={i.evidence} href={i.href} />)}
            </div>
          ) : (
            <EmptyState icon={TrendingDown} title="Nenhuma anomalia detectada" description="As regras comparam as últimas 4 semanas com as 8 anteriores (novas oportunidades), pipeline vs. 30 dias atrás, projetos atrasados vs. 4 semanas atrás e conversão dos últimos 90 dias vs. 90 dias anteriores." />
          )}
        </div>
      ) : null}

      {tab === "trends" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {finance ? <TrendCard title="Pipeline aberto (90 dias)" data={pipeline} format="currency" currency={ctx.org.currency} /> : null}
          <TrendCard title="Projetos atrasados (90 dias)" data={delayed} />
          <TrendCard title="Tarefas atrasadas (90 dias)" data={overdue} />
        </div>
      ) : null}

      {tab === "pulse" ? (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-6">
              <ScoreRing score={pulse.score} size={96} stroke={8} />
              <p className="text-lg font-semibold">{pulse.label}</p>
              <p className="text-center text-xs text-muted-foreground">Índice de saúde geral da operação, de 0 a 100. Calculado a cada acesso a partir dos dados atuais.</p>
            </CardContent>
          </Card>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {pulse.components.map((c) => (
                <div key={c.key} className="rounded-lg border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{c.label} <span className="text-xs font-normal text-muted-foreground">· peso {c.weight}%</span></p>
                    <span className={cn("tabular text-lg font-semibold", c.score === null ? "text-muted-foreground" : c.score >= 65 ? "text-success" : c.score >= 50 ? "text-warning" : "text-destructive")}>{c.score ?? "—"}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{c.explanation}</p>
                </div>
              ))}
            </div>
            <Section title="Metodologia">
              <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-muted-foreground">
                <li><b className="text-foreground">Comercial (30%)</b>: 40% engajamento (oportunidades abertas com atividade nos últimos 14 dias), 30% taxa de ganho em 90 dias (50% de ganho = 100 pontos; requer 5 negócios fechados) e 30% tendência do pipeline em relação a 30 dias atrás (estável = 70 pontos; requer snapshot). Exige ao menos 3 oportunidades abertas.</li>
                <li><b className="text-foreground">Projetos (25%)</b>: média do Project Health Score dos projetos ativos (prazo, progresso, tarefas atrasadas e bloqueadas, orçamento, riscos e sobrecarga da equipe).</li>
                <li><b className="text-foreground">Clientes (25%)</b>: média da saúde do relacionamento dos clientes ativos (recência e frequência de interações, projetos, pendências, problemas, contratos e negócios recentes).</li>
                <li><b className="text-foreground">Operações (20%)</b>: 70% tarefas em dia + 30% equipe dentro da capacidade. Exige ao menos 5 tarefas abertas.</li>
                <li>Componentes sem dados suficientes são excluídos e os pesos são redistribuídos. O índice geral só é exibido quando ao menos 2 componentes têm dados.</li>
                <li>Faixas: 80+ excelente · 65–79 saudável · 50–64 atenção · abaixo de 50 crítico.</li>
              </ul>
            </Section>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TrendCard({ title, data, format = "number", currency }: { title: string; data: { key: string; value: number }[]; format?: "number" | "currency"; currency?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        {data.length >= 2 ? (
          <LineSeriesChart data={data.map((d) => ({ dia: formatShortDate(d.key), valor: d.value }))} xKey="dia" series={[{ key: "valor", label: title }]} format={format} currency={currency} height={200} />
        ) : (
          <p className="py-8 text-center text-xs text-muted-foreground">Histórico insuficiente. Os snapshots são registrados diariamente; a tendência aparece a partir do segundo dia.</p>
        )}
      </CardContent>
    </Card>
  );
}
