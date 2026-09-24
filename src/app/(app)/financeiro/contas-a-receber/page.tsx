import { ArrowDownToLine } from "lucide-react";
import { DataTable } from "@/components/cortex/blocks";
import { KpiCard } from "@/components/cortex/kpi";
import { TraceDialog, TraceFooter } from "@/components/cortex/trace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { fmt } from "@/lib/format";
import { analyticsCtx } from "@/server/analytics/base";
import { receivablesDashboard } from "@/server/analytics/finance";
import { requirePage } from "@/server/auth/guard";

export const metadata = { title: "Contas a Receber" };

export default async function ReceivablesPage() {
  const ctx = await requirePage("receivables:view");
  const actx = await analyticsCtx(ctx);
  const r = await receivablesDashboard(actx);
  const d = r.data;
  return (
    <>
      <PageHeader title="Contas a Receber" description="Recebimentos previstos, vencidos e inadimplência." actions={<TraceDialog meta={r.meta} />} />
      {!r.sufficient ? (
        <EmptyState icon={ArrowDownToLine} title="Nenhuma conta a receber em aberto." description="Importe títulos a receber ou conecte o sistema financeiro." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <KpiCard label="Total a receber" value={d.total} hint={`${d.openCount} títulos`} />
            <KpiCard label="Recebimentos previstos" value={d.expected} />
            <KpiCard label="Vencidos" value={d.overdue} hint={d.total ? `${fmt.pct((d.overdue / d.total) * 100)} do total` : undefined} />
            <KpiCard label="Clientes inadimplentes" value={d.delinquentCustomers.length} format="int" />
            <KpiCard label="Recebimentos da semana" value={d.dueThisWeek} />
            <KpiCard label="Recebimentos do mês" value={d.dueThisMonth} />
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Clientes inadimplentes</CardTitle>
                <CardDescription>Títulos vencidos em aberto · vencidos há mais de 30 dias: {fmt.money(d.overdueOver30)}</CardDescription>
              </CardHeader>
              <CardContent className="max-h-[420px] overflow-y-auto px-0 scrollbar-thin">
                <DataTable columns={[{ key: "name", label: "Cliente" }, { key: "overdue", label: "Vencido", format: "money", align: "right" }, { key: "daysOverdue", label: "Dias de atraso", format: "int", align: "right" }, { key: "titles", label: "Títulos", format: "int", align: "right" }]} rows={d.delinquentCustomers.map((x) => ({ ...x }))} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Próximos recebimentos (30 dias)</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[420px] overflow-y-auto px-0 scrollbar-thin">
                <DataTable maxRows={50} columns={[{ key: "dueDate", label: "Vencimento", format: "date" }, { key: "customer", label: "Cliente" }, { key: "description", label: "Descrição" }, { key: "open", label: "Valor", format: "money", align: "right" }]} rows={d.upcoming.map((x) => ({ ...x }))} />
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
