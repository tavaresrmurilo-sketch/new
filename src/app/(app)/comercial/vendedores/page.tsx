import { BadgeCheck } from "lucide-react";
import { DataTable } from "@/components/cortex/blocks";
import { TraceDialog, TraceFooter } from "@/components/cortex/trace";
import { Chart } from "@/components/charts/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { analyticsCtx } from "@/server/analytics/base";
import { salesRanking } from "@/server/analytics/sales";
import { requirePage } from "@/server/auth/guard";
import { resolvePagePeriod, type SearchParams } from "@/server/page-period";

export const metadata = { title: "Vendedores" };

export default async function SellersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePage("sellers:view");
  const actx = await analyticsCtx(ctx);
  const period = resolvePagePeriod(await searchParams, actx.today);
  const r = await salesRanking(actx, "seller", period);
  return (
    <>
      <PageHeader title="Vendedores" description={`Resultado por vendedor · ${period.label}`} actions={<TraceDialog meta={r.meta} />} />
      {!r.sufficient ? (
        <EmptyState icon={BadgeCheck} title="Não encontrei vendas com vendedor identificado no período." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Faturamento por vendedor</CardTitle>
            </CardHeader>
            <CardContent>
              <Chart chart="bar" horizontal xKey="name" xFormat="text" series={[{ key: "revenue", label: "Faturamento" }]} data={r.data.rows.map((x) => ({ name: x.name, revenue: x.revenue }))} height={300} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Desempenho</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <DataTable
                columns={[{ key: "name", label: "Vendedor" }, { key: "revenue", label: "Faturamento", format: "money", align: "right" }, { key: "salesCount", label: "Vendas", format: "int", align: "right" }, { key: "ticket", label: "Ticket", format: "money", align: "right" }, { key: "marginPct", label: "Margem", format: "pct", align: "right" }, { key: "growthPct", label: "Var.", format: "pct", align: "right" }]}
                rows={r.data.rows.map((x) => ({ name: x.name, revenue: x.revenue, salesCount: x.salesCount, ticket: x.salesCount ? x.revenue / x.salesCount : null, marginPct: x.marginPct, growthPct: x.growthPct }))}
              />
            </CardContent>
          </Card>
        </div>
      )}
      <div className="mt-4">
        <TraceFooter meta={r.meta} />
      </div>
    </>
  );
}
