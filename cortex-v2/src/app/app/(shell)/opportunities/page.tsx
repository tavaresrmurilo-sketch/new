import Link from "next/link";
import { KanbanSquare, Plus, Radar, Target } from "lucide-react";
import { DataTable, Pagination, type Column } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/page-header";
import { RadarBadge } from "@/components/common/radar-badge";
import { StatusBadge } from "@/components/common/badges";
import { UserChip } from "@/components/common/user-avatar";
import { CreateButton } from "@/components/shell/shell-context";
import { buttonVariants } from "@/components/ui/button";
import { SavedViews } from "@/features/preferences/components/saved-views";
import { formatCurrency, formatDate, formatRelativeTime } from "@/lib/format";
import { OPPORTUNITY_STATUS } from "@/lib/labels";
import { parseListParams, type SearchParams } from "@/lib/list-params";
import { requireCtx } from "@/server/auth/context";
import { listOpportunities } from "@/server/modules/opportunities";
import { savedViewsFor } from "@/server/modules/preferences";

export const metadata = { title: "Oportunidades" };

type Row = Awaited<ReturnType<typeof listOpportunities>>["rows"][number];

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("opportunities.read");
  const sp = await searchParams;
  const params = parseListParams(sp, { sortable: ["title", "value", "expectedCloseDate", "lastActivityAt", "createdAt"], defaultSort: "value" });
  const [{ rows, total, totalValue }, members, stages, views] = await Promise.all([
    listOpportunities(ctx, params),
    ctx.db.organizationMember.findMany({ where: { status: "ACTIVE" }, select: { userId: true, user: { select: { name: true } } } }),
    ctx.db.pipelineStage.findMany({ orderBy: [{ pipelineId: "asc" }, { order: "asc" }], select: { id: true, name: true } }),
    savedViewsFor(ctx, "opportunities"),
  ]);
  const finance = ctx.permissions.has("finance.read");
  const canWrite = ctx.permissions.has("opportunities.write") && ctx.access.level === "FULL";
  const columns: Column<Row>[] = [
    {
      key: "title",
      header: "Oportunidade",
      sortable: true,
      cell: (r) => (
        <Link href={`/app/opportunities/${r.id}`} className="block min-w-[220px]">
          <span className="font-medium hover:underline">{r.title}</span>
          <span className="block text-xs text-muted-foreground">{r.client.name}</span>
        </Link>
      ),
    },
    { key: "stage", header: "Etapa", cell: (r) => <span className="whitespace-nowrap">{r.stage.name}</span> },
    { key: "score", header: "Radar", cell: (r) => (r.scored ? <RadarBadge category={r.scored.category} score={r.scored.score} /> : <StatusBadge map={OPPORTUNITY_STATUS} value={r.status} />) },
    { key: "value", header: "Valor", sortable: true, align: "right", cell: (r) => (finance ? formatCurrency(r.value, ctx.org.currency) : "•••") },
    { key: "prob", header: "Prob.", align: "right", cell: (r) => `${r.probability ?? r.stage.probability}%` },
    { key: "expectedCloseDate", header: "Previsão", sortable: true, cell: (r) => (r.expectedCloseDate ? formatDate(r.expectedCloseDate) : "—") },
    { key: "lastActivityAt", header: "Última atividade", sortable: true, cell: (r) => <span className="text-muted-foreground">{formatRelativeTime(r.lastActivityAt)}</span> },
    { key: "next", header: "Próxima ação", cell: (r) => (r.scored?.recommendations[0] ? <span className="block max-w-[220px] truncate text-xs" title={r.scored.recommendations[0].reason}>{r.scored.recommendations[0].action}</span> : "—") },
    { key: "owner", header: "Responsável", cell: (r) => <UserChip name={r.owner?.name} /> },
  ];
  return (
    <div>
      <PageHeader
        title="Oportunidades"
        description={finance ? `${total} oportunidade(s) · ${formatCurrency(totalValue, ctx.org.currency)} no filtro atual` : `${total} oportunidade(s)`}
        actions={
          <>
            <Link href="/app/opportunities/radar" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Radar /> Radar
            </Link>
            <Link href="/app/pipeline" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <KanbanSquare /> Pipeline
            </Link>
            {canWrite ? (
              <CreateButton kind="opportunity" className={buttonVariants({ size: "sm" })}>
                <Plus /> Nova oportunidade
              </CreateButton>
            ) : null}
          </>
        }
      />
      <div className="mb-3">
        <SavedViews entity="opportunities" views={views} />
      </div>
      <FilterBar
        searchPlaceholder="Buscar por título ou cliente"
        filters={[
          { key: "status", label: "Status", options: [{ value: "WON", label: "Ganhas" }, { value: "LOST", label: "Perdidas" }, { value: "ALL", label: "Todas" }] },
          { key: "stage", label: "Etapa", options: stages.map((s) => ({ value: s.id, label: s.name })) },
          { key: "owner", label: "Responsável", options: [{ value: "me", label: "Minhas" }, ...members.map((m) => ({ value: m.userId, label: m.user.name }))] },
          { key: "min", label: "Valor", options: [{ value: "10000", label: "≥ R$ 10 mil" }, { value: "20000", label: "≥ R$ 20 mil" }, { value: "50000", label: "≥ R$ 50 mil" }, { value: "100000", label: "≥ R$ 100 mil" }] },
          { key: "inactive", label: "Sem atividade", options: [{ value: "7", label: "há 7+ dias" }, { value: "14", label: "há 14+ dias" }, { value: "30", label: "há 30+ dias" }] },
        ]}
      />
      <DataTable
        columns={columns}
        rows={rows}
        pathname="/app/opportunities"
        searchParams={sp}
        sort={params.sort}
        dir={params.dir}
        empty={
          <EmptyState
            icon={Target}
            title="Nenhuma oportunidade encontrada."
            description="Crie sua primeira oportunidade para começar a acompanhar seu pipeline."
            action={canWrite ? <CreateButton kind="opportunity" className={buttonVariants({ size: "sm" })}><Plus /> Criar oportunidade</CreateButton> : null}
          />
        }
      />
      <Pagination pathname="/app/opportunities" searchParams={sp} page={params.page} pageSize={params.pageSize} total={total} />
    </div>
  );
}
