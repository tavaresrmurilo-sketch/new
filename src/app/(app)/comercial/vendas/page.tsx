import { TrendingUp } from "lucide-react";
import { DataTable } from "@/components/cortex/blocks";
import { KpiCard } from "@/components/cortex/kpi";
import { TraceDialog, TraceFooter } from "@/components/cortex/trace";
import { Chart } from "@/components/charts/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { addMonths, endOfMonth, startOfMonth } from "@/lib/periods";
import { analyticsCtx } from "@/server/analytics/base";
import { productAnalysis, salesMonthlySeries, salesRanking, salesSummary } from "@/server/analytics/sales";
import { requirePage } from "@/server/auth/guard";
import { resolvePagePeriod, type SearchParams } from "@/server/page-period";

export const metadata = { title: "Vendas" };

const rankCols = (label: string) => [
  { key: "name", label },
  { key: "revenue", label: "Faturamento", format: "money" as const, align: "right" as const },
  { key: "share", label: "%", format: "pct" as const, align: "right" as const },
  { key: "growthPct", label: "Var.", format: "pct" as const, align: "right" as const },
];

export default async function SalesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePage("sales:view");
  const actx = await analyticsCtx(ctx);
  const period = resolvePagePeriod(await searchParams, actx.today);
  const [summary, monthly, customers, sellers, regions, categories, products, services] = await Promise.all([
    salesSummary(actx, period),
    salesMonthlySeries(actx, startOfMonth(addMonths(actx.today, -11)), endOfMonth(actx.today)),
    salesRanking(actx, "customer", period, { limit: 10 }),
    salesRanking(actx, "seller", period, { limit: 10 }),
    salesRanking(actx, "region", period, { limit: 10 }),
    salesRanking(actx, "category", period, { limit: 10 }),
    productAnalysis(actx, period, { type: "PRODUCT" }),
    productAnalysis(actx, period, { type: "SERVICE" }),
  ]);
  const c = summary.data.current;
  const v = summary.data.variation;
  const can = (p: Parameters<typeof ctx.permissions.has>[0]) => ctx.permissions.has(p);
  const toRows = (rows: { name: string; revenue: number; share: number; growthPct: number | null }[]) => rows.map((r) => ({ name: r.name, revenue: r.revenue, share: r.share, growthPct: r.growthPct }));

  return (
    <>
      <PageHeader title="Vendas" description={`Desempenho comercial · ${period.label} · comparação com o período anterior equivalente`} actions={<TraceDialog meta={summary.meta} />} />
      {!summary.sufficient ? (
        <EmptyState icon={TrendingUp} title="Não encontrei vendas no período selecionado." description="Altere o período no filtro superior ou importe dados de vendas." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Faturamento" value={c.grossRevenue} delta={v.grossRevenue} />
            <KpiCard label="Receita líquida" value={c.netRevenue} delta={v.netRevenue} />
            <KpiCard label="Número de vendas" value={c.salesCount} format="int" delta={v.salesCount} />
            <KpiCard label="Ticket médio" value={c.averageTicket} delta={v.averageTicket} />
            <KpiCard label="Margem média" value={c.grossMarginPct} format="pct" delta={v.grossMarginPp} deltaFormat="pp" />
            <KpiCard label="Clientes ativos" value={c.activeCustomers} format="int" delta={v.activeCustomers} />
            <KpiCard label="Novos clientes" value={c.newCustomers} format="int" />
            <KpiCard label="Clientes recorrentes" value={c.recurringCustomers} format="int" />
          </div>
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Faturamento mensal</CardTitle>
              <CardDescription>Últimos 12 meses (mês corrente parcial)</CardDescription>
            </CardHeader>
            <CardContent>
              <Chart chart="bar" xKey="month" xFormat="month" series={[{ key: "grossRevenue", label: "Faturamento" }]} data={monthly.map((m) => ({ month: m.month, grossRevenue: m.grossRevenue }))} />
            </CardContent>
          </Card>
          <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {can("customers:view") ? <RankCard title="Clientes que mais compraram" rows={toRows(customers.data.rows)} label="Cliente" /> : null}
            {can("products:view") ? <RankCard title="Produtos que mais venderam" rows={toRows(products.data.rows.slice(0, 10))} label="Produto" /> : null}
            {can("products:view") ? <RankCard title="Serviços que mais faturaram" rows={toRows(services.data.rows.slice(0, 10))} label="Serviço" /> : null}
            {can("sellers:view") ? <RankCard title="Vendedores" rows={toRows(sellers.data.rows)} label="Vendedor" /> : null}
            <RankCard title="Regiões" rows={toRows(regions.data.rows)} label="Região" />
            <RankCard title="Categorias" rows={toRows(categories.data.rows)} label="Categoria" />
          </div>
          <div className="mt-4">
            <TraceFooter meta={summary.meta} />
          </div>
        </>
      )}
    </>
  );
}

function RankCard({ title, rows, label }: { title: string; rows: Record<string, string | number | null>[]; label: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <DataTable columns={rankCols(label)} rows={rows} maxRows={10} />
      </CardContent>
    </Card>
  );
}
