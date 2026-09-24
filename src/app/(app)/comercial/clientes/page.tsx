import { Users } from "lucide-react";
import { DataTable } from "@/components/cortex/blocks";
import { KpiCard } from "@/components/cortex/kpi";
import { TraceDialog, TraceFooter } from "@/components/cortex/trace";
import { Chart } from "@/components/charts/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { fmt } from "@/lib/format";
import { analyticsCtx } from "@/server/analytics/base";
import { activeCustomersByMonth, customerAnalysis } from "@/server/analytics/sales";
import { audit } from "@/server/audit";
import { requirePage } from "@/server/auth/guard";
import { resolvePagePeriod, type SearchParams } from "@/server/page-period";

export const metadata = { title: "Clientes" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePage("customers:view");
  const actx = await analyticsCtx(ctx);
  const period = resolvePagePeriod(await searchParams, actx.today);
  const [r, active] = await Promise.all([customerAnalysis(actx, period), activeCustomersByMonth(actx, 12)]);
  await audit(ctx, { action: "customers.viewed", resource: "customer" });
  const d = r.data;
  const changeCols = [
    { key: "name", label: "Cliente" },
    { key: "previous", label: "Anterior", format: "money" as const, align: "right" as const },
    { key: "current", label: "Atual", format: "money" as const, align: "right" as const },
    { key: "changePct", label: "Var.", format: "pct" as const, align: "right" as const },
  ];
  return (
    <>
      <PageHeader title="Clientes" description={`Análise de clientes · ${period.label}`} actions={<TraceDialog meta={r.meta} />} />
      {!r.sufficient ? (
        <EmptyState icon={Users} title="Não encontrei vendas a clientes no período." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <KpiCard label="Clientes ativos" value={d.activeCustomers} format="int" />
            <KpiCard label="Novos clientes" value={d.newCustomers} format="int" />
            <KpiCard label="Maior cliente" value={d.top?.name ?? "—"} format="text" hint={d.top ? `${fmt.money(d.top.revenue)} · ${fmt.pct(d.top.share)}` : undefined} />
            <KpiCard label="Concentração top 5" value={d.concentration.top5} format="pct" hint={`Top 10: ${fmt.pct(d.concentration.top10)}`} />
            <KpiCard label="Sem comprar há 60+ dias" value={d.inactive.length} format="int" />
          </div>
          {d.concentration.top5 !== null ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Os cinco maiores clientes representam <strong className="text-foreground">{fmt.pct(d.concentration.top5)}</strong> da receita no período ({d.concentration.top5Names.join(", ")}).
            </p>
          ) : null}
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Ranking de clientes</CardTitle>
                <CardDescription>Faturamento, participação, margem e variação</CardDescription>
              </CardHeader>
              <CardContent className="max-h-[420px] overflow-y-auto px-0 scrollbar-thin">
                <DataTable
                  maxRows={100}
                  columns={[{ key: "name", label: "Cliente" }, { key: "revenue", label: "Faturamento", format: "money", align: "right" }, { key: "share", label: "%", format: "pct", align: "right" }, { key: "marginPct", label: "Margem", format: "pct", align: "right" }, { key: "growthPct", label: "Var.", format: "pct", align: "right" }]}
                  rows={d.ranking.map((x) => ({ name: x.name, revenue: x.revenue, share: x.share, marginPct: x.marginPct, growthPct: x.growthPct }))}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Clientes ativos por mês</CardTitle>
              </CardHeader>
              <CardContent>
                <Chart chart="line" xKey="month" xFormat="month" series={[{ key: "customers", label: "Clientes ativos" }]} data={active} valueFormat="int" height={300} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Clientes que aumentaram compras</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <DataTable columns={changeCols} rows={d.increased.map((x) => ({ ...x }))} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Clientes que reduziram compras</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <DataTable columns={changeCols} rows={d.decreased.map((x) => ({ ...x }))} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Clientes sem comprar recentemente</CardTitle>
                <CardDescription>Última compra há mais de 60 dias, com compras nos últimos 12 meses</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <DataTable columns={[{ key: "name", label: "Cliente" }, { key: "lastPurchase", label: "Última compra", format: "date" }, { key: "daysSince", label: "Dias", format: "int", align: "right" }, { key: "revenue12m", label: "Compras 12m", format: "money", align: "right" }]} rows={d.inactive.map((x) => ({ ...x }))} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Clientes responsáveis por maior margem</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <DataTable columns={[{ key: "name", label: "Cliente" }, { key: "margin", label: "Margem", format: "money", align: "right" }, { key: "marginPct", label: "Margem %", format: "pct", align: "right" }]} rows={d.byMargin.map((x) => ({ name: x.name, margin: x.margin, marginPct: x.marginPct }))} />
              </CardContent>
            </Card>
          </div>
          <div className="mt-4">
            <TraceFooter meta={r.meta} />
          </div>
        </>
      )}
    </>
  );
}
