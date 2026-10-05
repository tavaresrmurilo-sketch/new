import Link from "next/link";
import { ArrowRight, Building2, CalendarClock, FileSpreadsheet, History, Kanban, Sparkles, Target } from "lucide-react";
import { BarSeriesChart } from "@/components/charts/charts";
import { AIInsightCard } from "@/components/common/ai-insight-card";
import { ScoreRing } from "@/components/common/badges";
import { EmptyState } from "@/components/common/empty-state";
import { MetricCard, percentChange } from "@/components/common/metric-card";
import { PageHeader, Section } from "@/components/common/page-header";
import { PeriodSelect } from "@/components/common/period-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { isPeriodKey, type PeriodKey } from "@/lib/dates";
import { formatCurrency, formatDateTime, formatNumber, formatPercent, formatRelativeTime } from "@/lib/format";
import { first, type SearchParams } from "@/lib/list-params";
import { cn } from "@/lib/utils";
import { can, requireCtx } from "@/server/auth/context";
import { comparableWindows, forecastFor, monthlySeries, periodFlow, pipelineMetrics, resolvePeriod, stateCounts } from "@/server/modules/analytics";
import { ensureTodaySnapshot, getInsights, getMorningBrief, getPulse, getWhatChanged } from "@/server/modules/intelligence";

export const metadata = { title: "Dashboard" };

const ASK_SUGGESTIONS = [
  "Quais oportunidades estão em risco?",
  "Quais clientes estão sem contato há mais de 30 dias?",
  "Qual a receita prevista para este mês?",
  "Quais projetos estão atrasados?",
];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const periodKey: PeriodKey = isPeriodKey(first(sp.period)) ? (first(sp.period) as PeriodKey) : "month";
  const range = resolvePeriod(ctx, periodKey, { from: first(sp.from), to: first(sp.to) });
  const win = comparableWindows(range);
  const finance = can(ctx, "finance.read");
  const sales = can(ctx, "opportunities.read");
  const money = (v: number, compact = true) => (finance ? formatCurrency(v, ctx.org.currency, { compact }) : "•••");

  await ensureTodaySnapshot(ctx).catch(() => undefined);
  const [cur, prev, state, pipeline, brief, changes, pulse, forecast, series, insights] = await Promise.all([
    periodFlow(ctx, win.cur.start, win.cur.end),
    periodFlow(ctx, win.prev.start, win.prev.end),
    stateCounts(ctx),
    sales ? pipelineMetrics(ctx) : null,
    getMorningBrief(ctx),
    getWhatChanged(ctx),
    getPulse(ctx),
    sales ? forecastFor(ctx, range) : null,
    sales ? monthlySeries(ctx, 6) : null,
    getInsights(ctx),
  ]);

  const isEmpty = state.activeClients + state.openLeads + state.openOpps + state.activeProjects === 0 && cur.newLeads + prev.newLeads === 0;
  const cmpLabel = win.partial ? "vs. mesmo intervalo do período anterior" : "vs. período anterior";
  const delta = (a: number, b: number, higherIsBetter = true) => (a === 0 && b === 0 ? undefined : { percent: percentChange(a, b), higherIsBetter, label: cmpLabel });
  const seriesEmpty = !series || series.every((s) => s.won === 0 && s.received === 0 && s.newOpps === 0 && s.lost === 0);
  const topInsights = [...insights.anomalies, ...insights.insights].slice(0, 3);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={formatDateTime(new Date(), ctx.org.timezone, { weekday: "long", day: "numeric", month: "long", hour: undefined, minute: undefined })}
        title={brief.greeting}
        description={brief.headline}
        actions={<PeriodSelect pathname="/app/dashboard" searchParams={sp} active={periodKey} from={first(sp.from)} to={first(sp.to)} />}
      />

      {can(ctx, "ai.use") ? (
        <form action="/app/ai" method="get" className="rounded-lg border bg-card p-3">
          <label htmlFor="ask" className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" aria-hidden /> Pergunte ao seu negócio
          </label>
          <div className="flex gap-2">
            <Input id="ask" name="q" placeholder="Ex.: Quais clientes estão sem contato há mais de 30 dias?" autoComplete="off" maxLength={500} />
            <button type="submit" className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Perguntar <ArrowRight className="size-3.5" aria-hidden />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ASK_SUGGESTIONS.map((q) => (
              <Link key={q} href={`/app/ai?q=${encodeURIComponent(q)}`} className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                {q}
              </Link>
            ))}
          </div>
        </form>
      ) : null}

      {isEmpty ? (
        <EmptyState
          icon={Sparkles}
          title="Seu Córtex está pronto para receber dados"
          description="Os indicadores aparecem conforme você registra clientes, oportunidades, projetos e tarefas. Nada aqui é estimado sem dados reais."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/app/clients" className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-accent">
                <Building2 className="size-3.5" /> Cadastrar cliente
              </Link>
              <Link href="/app/pipeline" className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-accent">
                <Kanban className="size-3.5" /> Abrir pipeline
              </Link>
              <Link href="/app/settings/import" className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-accent">
                <FileSpreadsheet className="size-3.5" /> Importar CSV
              </Link>
            </div>
          }
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {finance && sales ? (
          <>
            <MetricCard label={`Receita ganha · ${range.label.toLowerCase()}`} value={money(cur.wonValue)} hint={`${cur.wonCount} negócio(s) ganho(s)`} delta={delta(cur.wonValue, prev.wonValue)} href="/app/opportunities?status=WON" />
            <MetricCard label="Recebido no período" value={money(cur.received)} hint="Recebimentos confirmados" delta={delta(cur.received, prev.received)} href="/app/finance" />
            <MetricCard label="Pipeline ponderado" value={money(pipeline?.weighted ?? 0)} hint={`${pipeline?.count ?? 0} oportunidades · bruto ${money(pipeline?.gross ?? 0)}`} href="/app/pipeline" />
            <MetricCard
              label="Ticket médio"
              value={cur.ticket === null ? "—" : money(cur.ticket)}
              hint={cur.ticket === null ? "Sem negócios ganhos no período" : "Valor médio dos negócios ganhos"}
              delta={cur.ticket !== null && prev.ticket !== null ? delta(cur.ticket, prev.ticket) : undefined}
            />
          </>
        ) : null}
        {sales ? (
          <>
            <MetricCard label="Novos leads" value={formatNumber(cur.newLeads)} delta={delta(cur.newLeads, prev.newLeads)} href="/app/leads" hint={`${state.openLeads} leads em aberto`} />
            <MetricCard label="Novas oportunidades" value={formatNumber(cur.newOpps)} delta={delta(cur.newOpps, prev.newOpps)} href="/app/opportunities" hint={`${state.openOpps} em aberto`} />
            <MetricCard
              label="Taxa de conversão"
              value={cur.conversionRate === null ? "—" : formatPercent(cur.conversionRate)}
              hint={cur.wonCount + cur.lostCount ? `${cur.wonCount} ganhas · ${cur.lostCount} perdidas` : "Nenhum negócio fechado no período"}
              delta={cur.conversionRate !== null && prev.conversionRate !== null ? { percent: cur.conversionRate - prev.conversionRate, label: "variação em pontos percentuais" } : undefined}
              href="/app/reports/win-loss"
            />
          </>
        ) : null}
        <MetricCard label="Clientes ativos" value={formatNumber(state.activeClients)} hint={`${cur.newClients} novo(s) no período`} href="/app/clients?status=ACTIVE" />
        <MetricCard label="Projetos em andamento" value={formatNumber(state.activeProjects)} href="/app/projects?status=OPEN" />
        <MetricCard label="Tarefas concluídas" value={formatNumber(cur.tasksCompleted)} delta={delta(cur.tasksCompleted, prev.tasksCompleted)} href="/app/tasks?status=DONE" />
        <MetricCard label="Tarefas atrasadas" value={formatNumber(state.overdueTasks)} tone={state.overdueTasks ? "danger" : "default"} hint="Abertas com prazo vencido" href="/app/tasks?due=overdue" />
        {can(ctx, "proposals.read") ? (
          <MetricCard label="Propostas em aberto" value={formatNumber(state.openProposals)} hint={finance ? `${money(state.openProposalsValue)} em negociação` : "Enviadas ou em negociação"} href="/app/proposals?status=SENT" />
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarClock className="size-4 text-primary" aria-hidden /> Morning Brief
            </CardTitle>
            <span className="text-xs text-muted-foreground">{brief.teamWide ? "Visão do workspace" : "Somente seus itens"}</span>
          </CardHeader>
          <CardContent>
            {brief.sections.length ? (
              <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
                {brief.sections.map((s) => (
                  <div key={s.key} className="min-w-0">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {s.title} <span className="tabular">({s.total})</span>
                      </h3>
                      {s.href && s.total > s.items.length ? (
                        <Link href={s.href} className="text-xs text-primary hover:underline">
                          Ver todos
                        </Link>
                      ) : null}
                    </div>
                    <ul className="space-y-1">
                      {s.items.map((it) => (
                        <li key={`${s.key}-${it.id}`}>
                          <Link href={it.href} className="group flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-accent">
                            <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", it.urgency === "high" ? "bg-destructive" : it.urgency === "medium" ? "bg-warning" : "bg-muted-foreground/50")} aria-hidden />
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-medium group-hover:underline">{it.title}</span>
                              {it.detail ? <span className="block truncate text-xs text-muted-foreground">{it.detail}</span> : null}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState compact icon={CalendarClock} title="Nada pendente para hoje" description="Sem reuniões, tarefas vencidas, follow-ups, contratos ou projetos atrasados que precisem de você." />
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Córtex Pulse</CardTitle>
              <Link href="/app/insights?tab=pulse" className="text-xs text-primary hover:underline">
                Metodologia
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <ScoreRing score={pulse.score} size={60} />
                <div>
                  <p className="text-sm font-semibold">{pulse.label}</p>
                  <p className="text-xs text-muted-foreground">Saúde geral da operação (0–100)</p>
                </div>
              </div>
              <ul className="space-y-1.5">
                {pulse.components.map((c) => (
                  <li key={c.key} className="text-xs" title={c.explanation}>
                    <div className="flex items-center justify-between">
                      <span>{c.label}</span>
                      <span className="tabular font-medium">{c.score === null ? "sem dados" : c.score}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full rounded-full", c.score === null ? "" : c.score >= 65 ? "bg-success" : c.score >= 50 ? "bg-warning" : "bg-destructive")} style={{ width: `${c.score ?? 0}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <History className="size-4 text-primary" aria-hidden /> O que mudou?
              </CardTitle>
              <p className="text-xs text-muted-foreground">{changes.since ? `Desde sua última visita (${formatRelativeTime(changes.since)})` : "Nas últimas 24 horas"}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {changes.counts.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {changes.counts.map((c) => (
                    <Link key={c.key} href={c.href} className="rounded-md border px-2 py-1 text-xs hover:bg-accent">
                      <span className="tabular font-semibold">{c.value}</span> {c.label}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhuma mudança relevante no período.</p>
              )}
              {changes.recent.length ? (
                <ul className="space-y-1.5 border-t pt-2">
                  {changes.recent.slice(0, 5).map((a) => (
                    <li key={a.id} className="text-xs">
                      {a.href ? (
                        <Link href={a.href} className="font-medium hover:underline">
                          {a.title}
                        </Link>
                      ) : (
                        <span className="font-medium">{a.title}</span>
                      )}
                      <span className="text-muted-foreground"> · {a.actorName ?? "Sistema"} · {formatRelativeTime(a.occurredAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Link href="/app/activity" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                Feed de atividades <ArrowRight className="size-3" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      {sales && series && pipeline ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{finance ? "Receita ganha × recebida (6 meses)" : "Novas oportunidades e perdas (6 meses)"}</CardTitle>
            </CardHeader>
            <CardContent>
              {seriesEmpty ? (
                <EmptyState compact title="Sem movimentação nos últimos 6 meses" description="O gráfico aparece quando houver negócios ganhos, recebimentos ou oportunidades registradas." />
              ) : finance ? (
                <BarSeriesChart
                  data={series.map((s) => ({ label: s.label, won: s.won, received: s.received }))}
                  xKey="label"
                  series={[
                    { key: "won", label: "Ganha", color: 1 },
                    { key: "received", label: "Recebida", color: 2 },
                  ]}
                  format="currency"
                  currency={ctx.org.currency}
                />
              ) : (
                <BarSeriesChart
                  data={series.map((s) => ({ label: s.label, newOpps: s.newOpps, lost: s.lost }))}
                  xKey="label"
                  series={[
                    { key: "newOpps", label: "Novas", color: 1 },
                    { key: "lost", label: "Perdidas", color: 4 },
                  ]}
                />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Target className="size-4 text-primary" aria-hidden /> Pipeline por etapa
              </CardTitle>
              <Link href="/app/pipeline" className="text-xs text-primary hover:underline">
                Abrir
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {pipeline.byStage.length ? (
                <ul className="space-y-2">
                  {pipeline.byStage.map((s) => {
                    const max = Math.max(...pipeline.byStage.map((x) => x.value), 1);
                    return (
                      <li key={s.stageId} className="text-xs">
                        <div className="flex justify-between gap-2">
                          <span className="truncate">{s.name}</span>
                          <span className="tabular shrink-0 text-muted-foreground">
                            {s.count} · {money(s.value)}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary/80" style={{ width: `${finance ? Math.max(3, (s.value / max) * 100) : Math.max(3, (s.count / Math.max(...pipeline.byStage.map((x) => x.count), 1)) * 100)}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhuma oportunidade em aberto.</p>
              )}
              {forecast && finance ? (
                <div className="space-y-1 border-t pt-3 text-xs">
                  <p className="font-semibold">Previsão · {range.label.toLowerCase()}</p>
                  <div className="flex justify-between"><span className="text-muted-foreground">Já ganho</span><span className="tabular">{money(forecast.won)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Ponderado (ganho + pipeline)</span><span className="tabular font-medium">{money(forecast.weighted)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Conservador · otimista</span><span className="tabular">{money(forecast.conservative)} · {money(forecast.optimistic)}</span></div>
                  <p className="pt-1 text-[11px] text-muted-foreground">Estimativa, não garantia. Confiança {forecast.confidence}.</p>
                  <Link href="/app/forecast" className="inline-flex items-center gap-1 text-primary hover:underline">Forecast completo <ArrowRight className="size-3" /></Link>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Section
        title="Córtex Insights"
        description="Gerados por regras sobre seus dados, com amostra mínima. Variações não indicam causa."
        actions={
          <Link href="/app/insights" className="text-xs text-primary hover:underline">
            Ver todos
          </Link>
        }
      >
        {topInsights.length ? (
          <div className="grid gap-3 lg:grid-cols-3">
            {topInsights.map((i) => (
              <AIInsightCard key={i.id} tone={i.tone} title={i.title} body={i.body} evidence={i.evidence} href={i.href} />
            ))}
          </div>
        ) : (
          <EmptyState compact icon={Sparkles} title="Ainda não há dados suficientes para insights" description="O Córtex só apresenta conclusões quando existe amostra mínima (por exemplo, 15 negócios fechados para comparar origens)." />
        )}
      </Section>
    </div>
  );
}
