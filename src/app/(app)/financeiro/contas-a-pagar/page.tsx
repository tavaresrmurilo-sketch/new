import { ArrowUpFromLine } from "lucide-react";
import { DataTable } from "@/components/cortex/blocks";
import { KpiCard } from "@/components/cortex/kpi";
import { QueryTabs } from "@/components/cortex/query-tabs";
import { TraceDialog, TraceFooter } from "@/components/cortex/trace";
import { Chart } from "@/components/charts/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { analyticsCtx } from "@/server/analytics/base";
import { payablesDashboard, type PayableGroup } from "@/server/analytics/finance";
import { requirePage } from "@/server/auth/guard";
import { sp, type SearchParams } from "@/server/page-period";

export const metadata = { title: "Contas a Pagar" };
const GROUPS: { value: PayableGroup; label: string }[] = [
  { value: "supplier", label: "Fornecedor" },
  { value: "category", label: "Categoria" },
  { value: "costCenter", label: "Centro de custo" },
  { value: "companyUnit", label: "Empresa" },
  { value: "department", label: "Departamento" },
];

export default async function PayablesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePage("payables:view");
  const params = await searchParams;
  const group = (GROUPS.find((g) => g.value === sp(params, "agrupar"))?.value ?? "supplier") as PayableGroup;
  const actx = await analyticsCtx(ctx);
  const r = await payablesDashboard(actx, group);
  const d = r.data;
  return (
    <>
      <PageHeader title="Contas a Pagar" description="Títulos em aberto, vencimentos e agrupamentos." actions={<TraceDialog meta={r.meta} />} />
      {!r.sufficient ? (
        <EmptyState icon={ArrowUpFromLine} title="Nenhuma conta a pagar em aberto." description="Importe títulos a pagar ou conecte o sistema financeiro." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <KpiCard label="Total a pagar" value={d.total} hint={`${d.openCount} títulos`} />
            <KpiCard label="Vencendo hoje" value={d.dueToday} />
            <KpiCard label="Vencendo esta semana" value={d.dueThisWeek} />
            <KpiCard label="Vencendo este mês" value={d.dueThisMonth} />
            <KpiCard label="Vencidas" value={d.overdue} hint={`${d.overdueCount} títulos`} />
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                <div>
                  <CardTitle>Em aberto por agrupamento</CardTitle>
                  <CardDescription>Maiores saldos</CardDescription>
                </div>
                <QueryTabs param="agrupar" value={group} options={GROUPS} />
              </CardHeader>
              <CardContent>
                <Chart chart="bar" horizontal xKey="name" xFormat="text" series={[{ key: "total", label: "Em aberto" }, { key: "overdue", label: "Vencido" }]} data={d.grouped.slice(0, 10)} height={320} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Próximos vencimentos (30 dias) e vencidos</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[400px] overflow-y-auto px-0 scrollbar-thin">
                <DataTable
                  maxRows={50}
                  columns={[{ key: "dueDate", label: "Vencimento", format: "date" }, { key: "description", label: "Descrição" }, { key: "supplier", label: "Fornecedor" }, { key: "status", label: "Situação" }, { key: "open", label: "Valor", format: "money", align: "right" }]}
                  rows={d.upcoming.map(({ overdue, ...u }) => ({ ...u, status: overdue ? "Vencida" : u.daysToDue === 0 ? "Vence hoje" : `Em ${u.daysToDue} dias` }))}
                />
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
