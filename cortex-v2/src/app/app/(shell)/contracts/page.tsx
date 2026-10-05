import Link from "next/link";
import { FileSignature, Plus, Radar } from "lucide-react";
import { DataTable, Pagination, type Column } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/badges";
import { CreateButton } from "@/components/shell/shell-context";
import { buttonVariants } from "@/components/ui/button";
import { SavedViews } from "@/features/preferences/components/saved-views";
import { dateOnlyKey, dayKeyInTz, diffKeys } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { CONTRACT_STATUS, RECURRENCE_LABELS } from "@/lib/labels";
import { parseListParams, type SearchParams } from "@/lib/list-params";
import { requireCtx } from "@/server/auth/context";
import { listContracts } from "@/server/modules/contracts";
import { savedViewsFor } from "@/server/modules/preferences";

export const metadata = { title: "Contratos" };

type Row = Awaited<ReturnType<typeof listContracts>>["rows"][number];

export default async function ContractsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("contracts.read");
  const sp = await searchParams;
  const params = parseListParams(sp, { sortable: ["value", "startDate", "endDate", "createdAt"], defaultSort: "endDate", defaultDir: "asc" });
  const [{ rows, total }, views] = await Promise.all([listContracts(ctx, params), savedViewsFor(ctx, "contracts")]);
  const todayKey = dayKeyInTz(new Date(), ctx.org.timezone);
  const finance = ctx.permissions.has("finance.read");
  const canWrite = ctx.permissions.has("contracts.write") && ctx.access.level === "FULL";
  const columns: Column<Row>[] = [
    {
      key: "title",
      header: "Contrato",
      cell: (r) => (
        <Link href={`/app/contracts/${r.id}`} className="block min-w-[220px]">
          <span className="font-medium hover:underline">{r.number} · {r.title}</span>
          <span className="block text-xs text-muted-foreground">{r.client.name}</span>
        </Link>
      ),
    },
    { key: "status", header: "Status", cell: (r) => <StatusBadge map={CONTRACT_STATUS} value={r.status} /> },
    { key: "value", header: "Valor", sortable: true, align: "right", cell: (r) => (finance ? formatCurrency(r.value, ctx.org.currency) : "•••") },
    { key: "recurrence", header: "Recorrência", cell: (r) => RECURRENCE_LABELS[r.recurrence] },
    { key: "startDate", header: "Início", sortable: true, cell: (r) => formatDate(r.startDate) },
    {
      key: "endDate",
      header: "Vencimento",
      sortable: true,
      cell: (r) => {
        if (!r.endDate) return <span className="text-muted-foreground">Indeterminado</span>;
        const d = diffKeys(todayKey, dateOnlyKey(r.endDate));
        return (
          <span className={r.status === "ACTIVE" && d <= 30 ? (d < 0 ? "font-medium text-destructive" : "font-medium text-warning") : ""}>
            {formatDate(r.endDate)}
            {r.status === "ACTIVE" && d <= 90 ? <span className="ml-1 text-xs">({d < 0 ? `vencido há ${-d}d` : `${d}d`})</span> : null}
          </span>
        );
      },
    },
    { key: "owner", header: "Responsável", cell: (r) => r.owner?.name ?? "—" },
  ];
  return (
    <div>
      <PageHeader
        title="Contratos"
        description="Vigência, renovação e alertas automáticos em 90, 60, 30 e 7 dias do vencimento."
        actions={
          <>
            <Link href="/app/contracts/radar" className={buttonVariants({ variant: "outline", size: "sm" })}><Radar /> Contract Radar</Link>
            {canWrite ? <CreateButton kind="contract" className={buttonVariants({ size: "sm" })}><Plus /> Novo contrato</CreateButton> : null}
          </>
        }
      />
      <div className="mb-3"><SavedViews entity="contracts" views={views} /></div>
      <FilterBar
        searchPlaceholder="Buscar por número, título ou cliente"
        filters={[
          { key: "status", label: "Status", options: Object.entries(CONTRACT_STATUS).map(([v, l]) => ({ value: v, label: l.label })) },
          { key: "expiring", label: "Vencimento", options: [{ value: "30", label: "Próximos 30 dias" }, { value: "60", label: "Próximos 60 dias" }, { value: "90", label: "Próximos 90 dias" }] },
        ]}
      />
      <DataTable columns={columns} rows={rows} pathname="/app/contracts" searchParams={sp} sort={params.sort} dir={params.dir} empty={<EmptyState icon={FileSignature} title="Nenhum contrato encontrado" description="Registre contratos para acompanhar receita contratada, vencimentos e renovações." action={canWrite ? <CreateButton kind="contract" className={buttonVariants({ size: "sm" })}><Plus /> Registrar contrato</CreateButton> : null} />} />
      <Pagination pathname="/app/contracts" searchParams={sp} page={params.page} pageSize={params.pageSize} total={total} />
    </div>
  );
}
