import Link from "next/link";
import { Plus, Upload, UserPlus } from "lucide-react";
import { BulkSelectProvider, RowCheckbox, SelectAllCheckbox } from "@/components/common/bulk-select";
import { DataTable, Pagination, type Column } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/badges";
import { TagList } from "@/components/common/tag-list";
import { UserChip } from "@/components/common/user-avatar";
import { CreateButton } from "@/components/shell/shell-context";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { LeadBulkActions } from "@/features/leads/components/lead-bulk-actions";
import { SavedViews } from "@/features/preferences/components/saved-views";
import { formatCurrency, formatRelativeTime } from "@/lib/format";
import { LEAD_STATUS, SOURCE_LABELS } from "@/lib/labels";
import { parseListParams, type SearchParams } from "@/lib/list-params";
import { requireCtx } from "@/server/auth/context";
import { listLeads } from "@/server/modules/leads";
import { savedViewsFor } from "@/server/modules/preferences";

export const metadata = { title: "Leads" };

type Row = Awaited<ReturnType<typeof listLeads>>["rows"][number];

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("leads.read");
  const sp = await searchParams;
  const params = parseListParams(sp, { sortable: ["name", "createdAt", "potentialValue", "lastContactAt"], defaultSort: "createdAt" });
  const [{ rows, total }, members, views] = await Promise.all([
    listLeads(ctx, params),
    ctx.db.organizationMember.findMany({ where: { status: "ACTIVE" }, select: { userId: true, user: { select: { name: true } } } }),
    savedViewsFor(ctx, "leads"),
  ]);
  const canWrite = ctx.permissions.has("leads.write") && ctx.access.level === "FULL";
  const columns: Column<Row>[] = [
    ...(ctx.permissions.has("leads.delete") ? [{ key: "select", header: <SelectAllCheckbox />, cell: (r: Row) => <RowCheckbox id={r.id} label={r.name} />, className: "w-8" }] : []),
    {
      key: "name",
      header: "Lead",
      sortable: true,
      cell: (r) => (
        <Link href={`/app/leads/${r.id}`} className="block min-w-[180px]">
          <span className="font-medium hover:underline">{r.name}</span>
          {r.companyName ? <span className="block text-xs text-muted-foreground">{r.companyName}</span> : null}
        </Link>
      ),
    },
    { key: "status", header: "Status", cell: (r) => <StatusBadge map={LEAD_STATUS} value={r.status} /> },
    { key: "source", header: "Origem", cell: (r) => <span className="text-muted-foreground">{SOURCE_LABELS[r.source]}</span> },
    { key: "potentialValue", header: "Valor potencial", sortable: true, align: "right", cell: (r) => (r.potentialValue ? formatCurrency(r.potentialValue, ctx.org.currency) : "—") },
    { key: "owner", header: "Responsável", cell: (r) => <UserChip name={r.owner?.name} /> },
    { key: "lastContactAt", header: "Último contato", sortable: true, cell: (r) => <span className="text-muted-foreground">{r.lastContactAt ? formatRelativeTime(r.lastContactAt) : "Nunca"}</span> },
    {
      key: "next",
      header: "Próxima ação",
      cell: (r) =>
        r.recommendation ? (
          <span className="block max-w-[220px] truncate text-xs" title={r.recommendation.reason}>
            {r.recommendation.urgency === "high" ? <Badge tone="warning" className="mr-1">!</Badge> : null}
            {r.recommendation.action}
          </span>
        ) : (
          "—"
        ),
    },
    { key: "tags", header: "Tags", cell: (r) => <TagList tags={r.tags} /> },
  ];
  return (
    <div>
      <PageHeader
        title="Leads"
        description="Contatos em qualificação. Converta em cliente e oportunidade quando houver interesse real."
        actions={
          <>
            {ctx.permissions.has("data.import") ? (
              <Link href="/app/settings/import?entity=leads" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Upload /> Importar CSV
              </Link>
            ) : null}
            {canWrite ? (
              <CreateButton kind="lead" className={buttonVariants({ size: "sm" })}>
                <Plus /> Novo lead
              </CreateButton>
            ) : null}
          </>
        }
      />
      <div className="mb-3">
        <SavedViews entity="leads" views={views} />
      </div>
      <FilterBar
        searchPlaceholder="Buscar por nome, empresa ou e-mail"
        filters={[
          { key: "status", label: "Status", options: Object.entries(LEAD_STATUS).map(([v, l]) => ({ value: v, label: l.label })) },
          { key: "source", label: "Origem", options: Object.entries(SOURCE_LABELS).map(([v, l]) => ({ value: v, label: l })) },
          { key: "owner", label: "Responsável", options: [{ value: "me", label: "Meus leads" }, ...members.map((m) => ({ value: m.userId, label: m.user.name }))] },
          { key: "uncontacted", label: "Contato", options: [{ value: "1", label: "Sem contato" }] },
        ]}
      />
      <BulkSelectProvider ids={rows.map((r) => r.id)}>
        <DataTable
          columns={columns}
          rows={rows}
          pathname="/app/leads"
          searchParams={sp}
          sort={params.sort}
          dir={params.dir}
          empty={
            <EmptyState
              icon={UserPlus}
              title={params.q || params.get("status") ? "Nenhum lead encontrado com esses filtros" : "Nenhum lead ainda"}
              description="Registre contatos interessados para acompanhar a qualificação e não perder oportunidades."
              action={
                canWrite ? (
                  <CreateButton kind="lead" className={buttonVariants({ size: "sm" })}>
                    <Plus /> Criar lead
                  </CreateButton>
                ) : null
              }
            />
          }
        />
        <LeadBulkActions canDelete={ctx.permissions.has("leads.delete")} />
      </BulkSelectProvider>
      <Pagination pathname="/app/leads" searchParams={sp} page={params.page} pageSize={params.pageSize} total={total} />
    </div>
  );
}
