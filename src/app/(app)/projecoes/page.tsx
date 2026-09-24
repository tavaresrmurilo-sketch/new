import { LineChart } from "lucide-react";
import { DataTable } from "@/components/cortex/blocks";
import { KpiCard } from "@/components/cortex/kpi";
import { QueryTabs } from "@/components/cortex/query-tabs";
import { TraceDialog } from "@/components/cortex/trace";
import { Chart } from "@/components/charts/chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { fmt } from "@/lib/format";
import { analyticsCtx } from "@/server/analytics/base";
import { cashForecastMonthly, forecast, type ForecastTarget } from "@/server/analytics/forecast";
import { requirePage } from "@/server/auth/guard";
import { sp, type SearchParams } from "@/server/page-period";

export const metadata = { title: "Projeções" };
const TARGETS: { value: ForecastTarget; label: string }[] = [
  { value: "revenue", label: "Receita" },
  { value: "expenses", label: "Despesas" },
  { value: "result", label: "Resultado" },
];

export default async function ForecastPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePage("forecasts:view");
  const params = await searchParams;
  const target = (TARGETS.find((t) => t.value === sp(params, "indicador"))?.value ?? "revenue") as ForecastTarget;
  const actx = await analyticsCtx(ctx);
  const year = actx.today.getUTCFullYear();
  const until = sp(params, "ate") === "12m" ? undefined : `${year}-12`;
  const [fc, cash] = await Promise.all([forecast(actx, target, until ?? undefined), ctx.permissions.has("cashflow:view") ? cashForecastMonthly(actx, 6) : Promise.resolve(null)]);
  const label = TARGETS.find((t) => t.value === target)!.label;

  return (
    <>
      <PageHeader
        title="Projeções"
        description="Estimativas baseadas em histórico, tendência e sazonalidade (quando há 24+ meses), valores programados e títulos em aberto."
        actions={
          <>
            <QueryTabs param="indicador" value={target} options={TARGETS} />
            <QueryTabs param="ate" value={sp(params, "ate") === "12m" ? "12m" : "dez"} options={[{ value: "dez", label: "Até dezembro" }, { value: "12m", label: "6 meses" }]} />
            <TraceDialog meta={fc.meta} />
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <Badge variant="secondary">REALIZADO = registrado</Badge>
        <Badge variant="info">PREVISTO = títulos agendados</Badge>
        <Badge variant="warning">PROJETADO = estimativa estatística</Badge>
      </div>
      {!fc.sufficient ? (
        <EmptyState icon={LineChart} title="Histórico insuficiente para projetar" description="São necessários ao menos 6 meses fechados com dados." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Realizado no ano" value={fc.data.totalRealizedYtd} hint={`${label} · até o mês anterior`} />
            <KpiCard label="Projetado no horizonte" value={fc.data.totalProjected} hint={`${label} · inclui mês corrente`} />
            <KpiCard label="Tendência mensal" value={fc.data.slope} hint="série dessazonalizada" />
            <KpiCard label="Histórico utilizado" value={fc.data.historyMonths} format="int" hint={fc.data.seasonal ? "com sazonalidade" : "sem sazonalidade"} />
          </div>
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>{label}: realizado x projetado</CardTitle>
              <CardDescription>Método: {fc.data.method}</CardDescription>
            </CardHeader>
            <CardContent>
              <Chart
                chart="bar"
                xKey="month"
                xFormat="month"
                series={[{ key: "realizado", label: "Realizado" }, { key: "projetado", label: "Projetado" }]}
                data={fc.data.points.map((p) => ({ month: p.month, realizado: p.status === "REALIZADO" ? p.value : p.status === "PARCIAL" ? p.realized : null, projetado: p.status === "REALIZADO" ? null : p.value }))}
                height={300}
              />
              <div className="mt-3">
                <DataTable
                  columns={[{ key: "month", label: "Mês" }, { key: "status", label: "Tipo" }, { key: "realized", label: "Realizado", format: "money", align: "right" }, { key: "projected", label: "Projetado", format: "money", align: "right" }]}
                  rows={fc.data.points.filter((p) => p.status !== "REALIZADO").map((p) => ({ month: fmt.month(p.month), status: p.status, realized: p.realized, projected: p.projected }))}
                />
              </div>
            </CardContent>
          </Card>
        </>
      )}
      {cash ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Fluxo de caixa futuro (mensal)</CardTitle>
            <CardDescription>Saldo PREVISTO (títulos em aberto) e saldo PROJETADO (saldo atual + resultado projetado)</CardDescription>
          </CardHeader>
          <CardContent>
            {!cash.resultSufficient ? <Notice className="mb-3">Resultado projetado indisponível por falta de histórico; exibindo apenas valores PREVISTOS.</Notice> : null}
            <Chart
              chart="line"
              xKey="month"
              xFormat="month"
              series={[{ key: "previsto", label: "Saldo previsto" }, ...(cash.resultSufficient ? [{ key: "projetado", label: "Saldo projetado" }] : [])]}
              data={cash.rows.map((r) => ({ month: r.month, previsto: r.balanceScheduled, projetado: r.balanceProjected }))}
            />
            <div className="mt-3">
              <DataTable
                columns={[{ key: "month", label: "Mês" }, { key: "in", label: "Entradas previstas", format: "money", align: "right" }, { key: "out", label: "Saídas previstas", format: "money", align: "right" }, { key: "bal", label: "Saldo previsto", format: "money", align: "right" }, { key: "res", label: "Resultado projetado", format: "money", align: "right" }]}
                rows={cash.rows.map((r) => ({ month: fmt.month(r.month), in: r.scheduledInflows, out: r.scheduledOutflows, bal: r.balanceScheduled, res: r.projectedResult }))}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
