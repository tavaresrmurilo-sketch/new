import Link from "next/link";
import { AlertTriangle, LineChart } from "lucide-react";
import { BarSeriesChart } from "@/components/charts/charts";
import { AIInsightCard } from "@/components/common/ai-insight-card";
import { EmptyState } from "@/components/common/empty-state";
import { MetricCard } from "@/components/common/metric-card";
import { PageHeader, Section } from "@/components/common/page-header";
import { PeriodSelect } from "@/components/common/period-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { addDaysToKey, dateOnlyKey, dayKeyInTz, isPeriodKey, keyToDate, type PeriodKey } from "@/lib/dates";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { first, type SearchParams } from "@/lib/list-params";
import { toNumber } from "@/lib/utils";
import { requireCtx } from "@/server/auth/context";
import { forecastFor, resolvePeriod } from "@/server/modules/analytics";

export const metadata = { title: "Forecast" };

export default async function ForecastPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("finance.read");
  const sp = await searchParams;
  const periodKey: PeriodKey = isPeriodKey(first(sp.period)) ? (first(sp.period) as PeriodKey) : "month";
  const range = resolvePeriod(ctx, periodKey, { from: first(sp.from), to: first(sp.to) });
  const todayKey = dayKeyInTz(new Date(), ctx.org.timezone);
  const startD = keyToDate(range.startKey);
  const endD = keyToDate(addDaysToKey(range.endKey, 1));
  const money = (v: number, compact = false) => formatCurrency(v, ctx.org.currency, { compact });
  const [fc, opps, overdueClose] = await Promise.all([
    forecastFor(ctx, range),
    ctx.db.opportunity.findMany({
      where: { status: "OPEN", expectedCloseDate: { gte: startD, lt: endD } },
      include: { stage: { select: { name: true, probability: true } }, client: { select: { id: true, name: true } }, owner: { select: { id: true, name: true } } },
      take: 500,
    }),
    ctx.db.opportunity.findMany({
      where: { status: "OPEN", expectedCloseDate: { lt: keyToDate(todayKey) } },
      select: { id: true, title: true, value: true, expectedCloseDate: true, client: { select: { name: true } } },
      orderBy: { value: "desc" },
      take: 10,
    }),
  ]);
  const rows = opps
    .map((o) => {
      const p = o.probability ?? o.stage.probability;
      const v = toNumber(o.value);
      return { ...o, p, v, weighted: (v * p) / 100 };
    })
    .sort((a, b) => b.weighted - a.weighted);
  const totalWeighted = rows.reduce((s, r) => s + r.weighted, 0);
  const byOwner = new Map<string, { name: string; weighted: number; gross: number; count: number }>();
  for (const r of rows) {
    const k = r.owner?.id ?? "none";
    const e = byOwner.get(k) ?? { name: r.owner?.name ?? "Sem responsável", weighted: 0, gross: 0, count: 0 };
    e.weighted += r.weighted;
    e.gross += r.v;
    e.count++;
    byOwner.set(k, e);
  }
  // leitura determinística do forecast
  const notes: { title: string; body: string; tone: "info" | "warning" | "opportunity" }[] = [];
  if (rows.length >= 3 && totalWeighted > 0) {
    const top2 = rows.slice(0, 2).reduce((s, r) => s + r.weighted, 0);
    const share = top2 / totalWeighted;
    if (share >= 0.5) notes.push({ tone: "warning", title: `${formatPercent(share * 100)} do valor ponderado depende de 2 oportunidades`, body: `${rows[0]!.title} e ${rows[1]!.title}. Acompanhe de perto: o resultado do período é sensível a elas.` });
  }
  const lowProb = rows.filter((r) => r.p < 35);
  if (lowProb.length && rows.length) notes.push({ tone: "info", title: `${lowProb.length} oportunidade(s) com probabilidade abaixo de 35%`, body: "Elas entram no ponderado com peso baixo e ficam fora do cenário otimista." });
  if (overdueClose.length) notes.push({ tone: "warning", title: `${overdueClose.length} oportunidade(s) abertas com data de fechamento já vencida`, body: "Não entram em nenhum período futuro até que a data prevista seja atualizada." });
  if (fc.historical !== null && fc.historicalWinRate !== null) {
    const gap = fc.weighted - fc.historical;
    if (Math.abs(gap) > Math.max(1, fc.weighted * 0.15))
      notes.push({
        tone: gap > 0 ? "warning" : "opportunity",
        title: gap > 0 ? "As probabilidades do pipeline estão acima do seu histórico" : "Seu histórico de ganho supera as probabilidades do pipeline",
        body: `Ponderado ${money(fc.weighted, true)} vs. ${money(fc.historical, true)} pela taxa de ganho real de ${formatPercent(fc.historicalWinRate, 1)} (180 dias).`,
      });
  }
  return (
    <div className="space-y-5">
      <PageHeader
        title="Forecast de receita"
        description="Previsão por cenários a partir do pipeline e do histórico real de ganho. Estimativa — nunca garantia de receita."
        actions={<PeriodSelect pathname="/app/forecast" searchParams={sp} active={periodKey} from={first(sp.from)} to={first(sp.to)} />}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label={`Já ganho · ${range.label.toLowerCase()}`} value={money(fc.won, true)} />
        <MetricCard label="Conservador" value={money(fc.conservative, true)} hint="Ganho + oportunidades ≥ 75%" />
        <MetricCard label="Ponderado" value={money(fc.weighted, true)} hint="Ganho + Σ valor × probabilidade" tone="success" />
        <MetricCard label="Histórico" value={fc.historical === null ? "—" : money(fc.historical, true)} hint={fc.historicalWinRate === null ? "Histórico insuficiente" : `Taxa real de ganho ${formatPercent(fc.historicalWinRate, 1)}`} />
        <MetricCard label="Otimista" value={money(fc.optimistic, true)} hint="Ganho + oportunidades ≥ 35%" />
      </div>
      <p className="text-xs text-muted-foreground">
        Confiança <span className="font-medium text-foreground">{fc.confidence}</span>. {fc.notes.join(" ")} Recebimentos pendentes com vencimento no período: {money(fc.pendingReceivables)}.
      </p>

      {notes.length ? (
        <Section title="Leitura do forecast" description="Observações geradas por regras sobre os números acima.">
          <div className="grid gap-3 lg:grid-cols-2">
            {notes.map((n) => (
              <AIInsightCard key={n.title} tone={n.tone} title={n.title} body={n.body} />
            ))}
          </div>
        </Section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Oportunidades com fechamento previsto no período ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {rows.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR className="hover:bg-transparent">
                      <TH>Oportunidade</TH>
                      <TH>Etapa</TH>
                      <TH className="text-right">Valor</TH>
                      <TH className="text-right">Prob.</TH>
                      <TH className="text-right">Ponderado</TH>
                      <TH>Previsão</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {rows.map((r) => (
                      <TR key={r.id}>
                        <TD>
                          <Link href={`/app/opportunities/${r.id}`} className="font-medium hover:underline">{r.title}</Link>
                          <span className="block text-xs text-muted-foreground">{r.client.name} · {r.owner?.name ?? "sem responsável"}</span>
                        </TD>
                        <TD className="text-xs">{r.stage.name}</TD>
                        <TD className="tabular text-right">{money(r.v)}</TD>
                        <TD className="tabular text-right">{r.p}%</TD>
                        <TD className="tabular text-right font-medium">{money(r.weighted)}</TD>
                        <TD className="text-xs">{formatDate(r.expectedCloseDate)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            ) : (
              <EmptyState compact icon={LineChart} title="Nenhuma oportunidade com fechamento previsto neste período" description="Defina a data prevista de fechamento nas oportunidades para que entrem no forecast." />
            )}
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Ponderado por responsável</CardTitle></CardHeader>
            <CardContent>
              {byOwner.size ? (
                <BarSeriesChart data={[...byOwner.values()].sort((a, b) => b.weighted - a.weighted).map((o) => ({ name: o.name.split(" ")[0]!, weighted: Math.round(o.weighted) }))} xKey="name" series={[{ key: "weighted", label: "Ponderado" }]} format="currency" currency={ctx.org.currency} height={200} />
              ) : (
                <p className="text-xs text-muted-foreground">Sem dados no período.</p>
              )}
            </CardContent>
          </Card>
          {overdueClose.length ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm"><AlertTriangle className="size-4 text-warning" /> Datas de fechamento vencidas</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-xs">
                  {overdueClose.map((o) => (
                    <li key={o.id}>
                      <Link href={`/app/opportunities/${o.id}`} className="font-medium hover:underline">{o.title}</Link>
                      <span className="text-muted-foreground"> · {o.client.name} · {money(toNumber(o.value), true)} · previsto {formatDate(o.expectedCloseDate)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Metodologia: ponderado = ganho no período + Σ (valor × probabilidade da oportunidade ou da etapa); histórico = ganho + valor bruto × taxa real de ganho dos últimos 180 dias (requer ao menos 10 negócios fechados); conservador = ganho + oportunidades com probabilidade ≥ 75%; otimista = ganho + oportunidades com probabilidade ≥ 35%. Período: {formatDate(startD)} a {formatDate(keyToDate(range.endKey))}. {dateOnlyKey(startD) > todayKey ? "Período futuro." : ""}
      </p>
    </div>
  );
}
