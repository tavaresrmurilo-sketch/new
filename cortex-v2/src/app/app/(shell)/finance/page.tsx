import Link from "next/link";
import { Wallet } from "lucide-react";
import { LineSeriesChart } from "@/components/charts/charts";
import { StatusBadge } from "@/components/common/badges";
import { DataTable, Pagination, type Column } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { FilterBar } from "@/components/common/filter-bar";
import { MetricCard } from "@/components/common/metric-card";
import { PageHeader } from "@/components/common/page-header";
import { PeriodSelect } from "@/components/common/period-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewReceivableButton, ReceivableRowActions } from "@/features/finance/components/receivable-actions";
import { dateOnlyKey, dayKeyInTz, diffKeys, isPeriodKey, type PeriodKey } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { RECEIVABLE_STATUS } from "@/lib/labels";
import { first, parseListParams, type SearchParams } from "@/lib/list-params";
import { toNumber } from "@/lib/utils";
import { can, requireCtx } from "@/server/auth/context";
import { resolvePeriod } from "@/server/modules/analytics";
import { cashOutlook, financeSummary, listReceivables } from "@/server/modules/finance";

export const metadata = { title: "Financeiro" };

type Row = Awaited<ReturnType<typeof listReceivables>>["rows"][number];

export default async function FinancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("finance.read");
  const sp = await searchParams;
  const periodKey: PeriodKey = isPeriodKey(first(sp.period)) ? (first(sp.period) as PeriodKey) : "month";
  const range = resolvePeriod(ctx, periodKey, { from: first(sp.from), to: first(sp.to) });
  const params = parseListParams(sp, { sortable: ["dueDate", "amount", "receivedAt"], defaultSort: "dueDate", defaultDir: "asc" });
  const [summary, outlook, { rows, total, sum }] = await Promise.all([financeSummary(ctx, range), cashOutlook(ctx, 6), listReceivables(ctx, params)]);
  const canWrite = can(ctx, "finance.write") && ctx.access.level === "FULL";
  const money = (v: unknown, compact = false) => formatCurrency(v, ctx.org.currency, { compact });
  const todayKey = dayKeyInTz(new Date(), ctx.org.timezone);
  const columns: Column<Row>[] = [
    {
      key: "description",
      header: "Descrição",
      cell: (r) => (
        <div className="min-w-[220px]">
          <span className="font-medium">{r.description}</span>
          <span className="block text-xs text-muted-foreground">
            {[
              r.client ? <Link key="c" href={`/app/clients/${r.client.id}`} className="hover:underline">{r.client.name}</Link> : null,
              r.contract ? <Link key="k" href={`/app/contracts/${r.contract.id}`} className="hover:underline">{r.contract.number}</Link> : null,
              r.project ? <Link key="p" href={`/app/projects/${r.project.id}`} className="hover:underline">{r.project.name}</Link> : null,
            ]
              .filter(Boolean)
              .flatMap((el, i) => (i ? [" · ", el] : [el]))}
          </span>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (r) => (r.status === "PENDING" && dateOnlyKey(r.dueDate) < todayKey ? <span className="text-xs font-medium text-destructive">Vencido</span> : <StatusBadge map={RECEIVABLE_STATUS} value={r.status} />) },
    { key: "amount", header: "Valor", sortable: true, align: "right", cell: (r) => <span className="tabular">{money(r.amount)}</span> },
    {
      key: "dueDate",
      header: "Vencimento",
      sortable: true,
      cell: (r) => {
        const d = diffKeys(todayKey, dateOnlyKey(r.dueDate));
        return (
          <span className={r.status === "PENDING" && d < 0 ? "font-medium text-destructive" : ""}>
            {formatDate(r.dueDate)}
            {r.status === "PENDING" && d < 0 ? <span className="ml-1 text-xs">(há {-d}d)</span> : null}
          </span>
        );
      },
    },
    { key: "receivedAt", header: "Recebido em", sortable: true, cell: (r) => (r.receivedAt ? formatDate(r.receivedAt) : "—") },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: <span className="sr-only">Ações</span>,
            align: "right" as const,
            cell: (r: Row) => (
              <ReceivableRowActions
                id={r.id}
                status={r.status}
                values={{
                  description: r.description,
                  amount: String(toNumber(r.amount)),
                  dueDate: dateOnlyKey(r.dueDate),
                  status: r.status,
                  receivedAt: r.receivedAt ? dateOnlyKey(r.receivedAt) : undefined,
                  clientId: r.clientId ?? undefined,
                  contractId: r.contractId ?? undefined,
                  projectId: r.projectId ?? undefined,
                }}
                labels={{ client: r.client?.name, contract: r.contract?.number, project: r.project?.name }}
              />
            ),
          },
        ]
      : []),
  ];
  return (
    <div className="space-y-5">
      <PageHeader
        title="Financeiro"
        description="Visão gerencial de recebimentos, receita contratada e previsão de caixa. Não substitui o sistema contábil ou fiscal."
        actions={canWrite ? <NewReceivableButton /> : null}
      />
      <PeriodSelect pathname="/app/finance" searchParams={sp} active={periodKey} from={first(sp.from)} to={first(sp.to)} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label={`Recebido · ${range.label.toLowerCase()}`} value={money(summary.received, true)} hint={`${summary.receivedCount} recebimento(s)`} href="/app/finance?status=RECEIVED" />
        <MetricCard label="A receber em 30 dias" value={money(summary.next30, true)} hint={`${summary.next30Count} recebimento(s)`} href="/app/finance?due=30" />
        <MetricCard label="Vencido" value={money(summary.overdue, true)} hint={`${summary.overdueCount} em atraso`} tone={summary.overdue > 0 ? "danger" : "default"} href="/app/finance?status=OVERDUE" />
        <MetricCard label="Receita recorrente (MRR)" value={money(summary.mrr, true)} hint={`ARR ${money(summary.arr, true)} · ${summary.activeContracts} contrato(s) ativo(s)`} href="/app/contracts?status=ACTIVE" />
        <MetricCard label="Total a receber" value={money(summary.pending, true)} hint="Todos os recebimentos pendentes" />
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Previsão de entradas (6 meses)</CardTitle>
          <p className="text-xs text-muted-foreground">Recebimentos pendentes por vencimento (vencidos contam no mês atual) e pipeline ponderado pela data prevista de fechamento. Estimativa, não garantia.</p>
        </CardHeader>
        <CardContent>
          {outlook.some((b) => b.receivables || b.weightedPipeline) ? (
            <LineSeriesChart
              area
              data={outlook}
              xKey="label"
              series={[
                { key: "receivables", label: "A receber", color: 2 },
                { key: "weightedPipeline", label: "Pipeline ponderado", color: 1 },
              ]}
              format="currency"
              currency={ctx.org.currency}
            />
          ) : (
            <EmptyState compact title="Sem entradas previstas" description="Cadastre recebimentos ou gere parcelas a partir de um contrato. Oportunidades com data prevista de fechamento também entram na previsão." />
          )}
        </CardContent>
      </Card>
      <div>
        <FilterBar
          searchPlaceholder="Buscar por descrição ou cliente"
          filters={[
            { key: "status", label: "Situação", options: [{ value: "OVERDUE", label: "Vencidos" }, { value: "RECEIVED", label: "Recebidos" }, { value: "CANCELED", label: "Cancelados" }, { value: "ALL", label: "Todos" }] },
            { key: "due", label: "Vencimento", options: [{ value: "30", label: "Até 30 dias" }] },
          ]}
        />
        <DataTable
          columns={columns}
          rows={rows}
          pathname="/app/finance"
          searchParams={sp}
          sort={params.sort}
          dir={params.dir}
          empty={<EmptyState icon={Wallet} title="Nenhum recebimento encontrado" description="Registre recebimentos avulsos ou gere parcelas na página de um contrato." action={canWrite ? <NewReceivableButton label="Registrar recebimento" /> : null} />}
        />
        {rows.length ? <p className="mt-2 text-right text-xs text-muted-foreground">Total filtrado: <span className="tabular font-medium text-foreground">{money(sum)}</span></p> : null}
        <Pagination pathname="/app/finance" searchParams={sp} page={params.page} pageSize={params.pageSize} total={total} />
      </div>
    </div>
  );
}
