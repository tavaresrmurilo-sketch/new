import { Scale } from "lucide-react";
import { BarSeriesChart } from "@/components/charts/charts";
import { EmptyState } from "@/components/common/empty-state";
import { MetricCard } from "@/components/common/metric-card";
import { PageHeader, Section } from "@/components/common/page-header";
import { PeriodSelect } from "@/components/common/period-select";
import { BreadcrumbLabel } from "@/components/shell/shell-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isPeriodKey, type PeriodKey } from "@/lib/dates";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { CLOSE_REASON, SOURCE_LABELS } from "@/lib/labels";
import { first, type SearchParams } from "@/lib/list-params";
import { can, requireCtx } from "@/server/auth/context";
import { resolvePeriod, winLossAnalysis } from "@/server/modules/analytics";

export const metadata = { title: "Win/Loss Intelligence" };

export default async function WinLossPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("opportunities.read");
  const sp = await searchParams;
  const periodKey: PeriodKey = isPeriodKey(first(sp.period)) ? (first(sp.period) as PeriodKey) : "year";
  const range = resolvePeriod(ctx, periodKey, { from: first(sp.from), to: first(sp.to) });
  const w = await winLossAnalysis(ctx, range.start, range.end);
  const finance = can(ctx, "finance.read");
  const money = (v: number) => (finance ? formatCurrency(v, ctx.org.currency, { compact: true }) : "•••");
  const small = w.total < 10;
  return (
    <div className="space-y-5">
      <BreadcrumbLabel segment="win-loss" label="Win/Loss" />
      <PageHeader title="Win/Loss Intelligence" description="Por que você ganha e por que perde. Baseado nos motivos registrados ao fechar cada oportunidade." actions={<PeriodSelect pathname="/app/reports/win-loss" searchParams={sp} active={periodKey} from={first(sp.from)} to={first(sp.to)} />} />
      {small && w.total > 0 ? <p className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs">Amostra pequena ({w.total} negócios fechados): interprete as proporções com cautela.</p> : null}
      {w.total ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Fechados" value={w.total} />
            <MetricCard label="Taxa de ganho" value={w.winRate === null ? "—" : formatPercent(w.winRate)} />
            <MetricCard label="Valor ganho" value={money(w.wonValue)} tone="success" />
            <MetricCard label="Valor perdido" value={money(w.lostValue)} tone="danger" />
            <MetricCard label="Ciclo médio (ganhos)" value={w.avgCycleDays === null ? "—" : `${formatNumber(w.avgCycleDays)} dias`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Motivos de perda ({w.lost})</CardTitle></CardHeader>
              <CardContent>{w.lossReasons.length ? <BarSeriesChart data={w.lossReasons.map((r) => ({ motivo: CLOSE_REASON[r.key] ?? "Não informado", qtd: r.count }))} xKey="motivo" series={[{ key: "qtd", label: "Perdas", color: 4 }]} height={220} /> : <p className="text-xs text-muted-foreground">Sem perdas no período.</p>}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Motivos de ganho ({w.won})</CardTitle></CardHeader>
              <CardContent>{w.winReasons.length ? <BarSeriesChart data={w.winReasons.map((r) => ({ motivo: CLOSE_REASON[r.key] ?? "Não informado", qtd: r.count }))} xKey="motivo" series={[{ key: "qtd", label: "Ganhos", color: 2 }]} height={220} /> : <p className="text-xs text-muted-foreground">Sem ganhos no período.</p>}</CardContent>
            </Card>
          </div>
          <Section title="Por origem">
            <div className="overflow-hidden rounded-lg border bg-card">
              <ul className="divide-y text-sm">
                {w.bySource.map((s) => (
                  <li key={s.source} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="flex-1">{SOURCE_LABELS[s.source] ?? s.source}</span>
                    <span className="tabular text-xs text-muted-foreground">{s.won} ganhos · {s.lost} perdas</span>
                    <span className="tabular w-16 text-right font-medium">{s.won + s.lost >= 5 ? formatPercent((s.won / (s.won + s.lost)) * 100) : "amostra pequena"}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Section>
          {w.competitors.length ? (
            <Section title="Concorrentes em negócios perdidos">
              <div className="flex flex-wrap gap-2">{w.competitors.map((c) => <span key={c.key} className="rounded-md border px-2 py-1 text-xs">{c.key} <b>{c.count}</b></span>)}</div>
            </Section>
          ) : null}
        </>
      ) : (
        <EmptyState icon={Scale} title="Nenhum negócio fechado no período" description="Ao marcar oportunidades como ganhas ou perdidas, o motivo é obrigatório e alimenta esta análise." />
      )}
    </div>
  );
}
