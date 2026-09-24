import { Package } from "lucide-react";
import { DataTable } from "@/components/cortex/blocks";
import { KpiCard } from "@/components/cortex/kpi";
import { TraceDialog, TraceFooter } from "@/components/cortex/trace";
import { Chart } from "@/components/charts/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { fmt } from "@/lib/format";
import { analyticsCtx } from "@/server/analytics/base";
import { productAnalysis, type ProductRow } from "@/server/analytics/sales";
import { requirePage } from "@/server/auth/guard";
import { resolvePagePeriod, type SearchParams } from "@/server/page-period";

export const metadata = { title: "Produtos" };

const cols = [
  { key: "name", label: "Item" },
  { key: "quantity", label: "Qtd.", format: "number" as const, align: "right" as const },
  { key: "revenue", label: "Receita", format: "money" as const, align: "right" as const },
  { key: "averagePrice", label: "Ticket", format: "money" as const, align: "right" as const },
  { key: "marginPct", label: "Margem", format: "pct" as const, align: "right" as const },
  { key: "growthPct", label: "Var.", format: "pct" as const, align: "right" as const },
];
const rows = (list: ProductRow[]) => list.map((p) => ({ name: p.name, quantity: p.quantity, revenue: p.revenue, averagePrice: p.averagePrice, marginPct: p.marginPct, growthPct: p.growthPct }));

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePage("products:view");
  const actx = await analyticsCtx(ctx);
  const period = resolvePagePeriod(await searchParams, actx.today);
  const r = await productAnalysis(actx, period);
  const d = r.data;
  const top = d.rows[0];
  const bestMargin = [...d.rows].filter((x) => x.share >= 1).sort((a, b) => (b.marginPct ?? 0) - (a.marginPct ?? 0))[0];
  return (
    <>
      <PageHeader title="Produtos e serviços" description={`Receita, volume, margem e crescimento · ${period.label}`} actions={<TraceDialog meta={r.meta} />} />
      {!r.sufficient ? (
        <EmptyState icon={Package} title="Não encontrei itens vendidos no período." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Receita de itens" value={d.total} />
            <KpiCard label="Itens vendidos" value={d.rows.length} format="int" />
            <KpiCard label="Mais vendido" value={top?.name ?? "—"} format="text" hint={top ? fmt.money(top.revenue) : undefined} />
            <KpiCard label="Mais rentável" value={bestMargin?.name ?? "—"} format="text" hint={bestMargin ? `Margem ${fmt.pct(bestMargin.marginPct)}` : undefined} />
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Receita por produto</CardTitle>
              </CardHeader>
              <CardContent>
                <Chart chart="bar" horizontal xKey="name" xFormat="text" series={[{ key: "revenue", label: "Receita" }]} data={d.rows.slice(0, 10).map((p) => ({ name: p.name, revenue: p.revenue }))} height={340} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Todos os itens</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[380px] overflow-y-auto px-0 scrollbar-thin">
                <DataTable columns={cols} rows={rows(d.rows)} maxRows={200} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Produtos mais rentáveis</CardTitle>
                <CardDescription>Maior margem bruta em valor</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <DataTable columns={cols} rows={rows(d.topMargin)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Produtos com margem baixa</CardTitle>
                <CardDescription>Margem abaixo de 20% e participação ≥ 1%</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <DataTable columns={cols} rows={rows(d.lowMargin)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Crescimento</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <DataTable columns={cols} rows={rows(d.growing)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Queda</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <DataTable columns={cols} rows={rows(d.declining)} />
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
