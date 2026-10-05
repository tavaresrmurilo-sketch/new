import Link from "next/link";
import { Plus, Star, Upload, Users } from "lucide-react";
import { DataTable, Pagination, type Column } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/page-header";
import { ScoreBadge, StatusBadge } from "@/components/common/badges";
import { TagList } from "@/components/common/tag-list";
import { UserChip } from "@/components/common/user-avatar";
import { CreateButton } from "@/components/shell/shell-context";
import { buttonVariants } from "@/components/ui/button";
import { SavedViews } from "@/features/preferences/components/saved-views";
import { formatRelativeTime } from "@/lib/format";
import { CLIENT_STATUS } from "@/lib/labels";
import { parseListParams, type SearchParams } from "@/lib/list-params";
import { requireCtx } from "@/server/auth/context";
import { listClients } from "@/server/modules/clients";
import { savedViewsFor } from "@/server/modules/preferences";

export const metadata = { title: "Clientes" };

type Row = Awaited<ReturnType<typeof listClients>>["rows"][number];

export default async function ClientsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("clients.read");
  const sp = await searchParams;
  const params = parseListParams(sp, { sortable: ["name", "createdAt", "lastInteractionAt"], defaultSort: "name", defaultDir: "asc" });
  const [{ rows, total }, members, views, tags] = await Promise.all([
    listClients(ctx, params),
    ctx.db.organizationMember.findMany({ where: { status: "ACTIVE" }, select: { userId: true, user: { select: { name: true } } } }),
    savedViewsFor(ctx, "clients"),
    ctx.db.tag.findMany({ where: { assignments: { some: { entityType: "client" } } }, select: { name: true }, orderBy: { name: "asc" } }),
  ]);
  const canWrite = ctx.permissions.has("clients.write") && ctx.access.level === "FULL";
  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Cliente",
      sortable: true,
      cell: (r) => (
        <Link href={`/app/clients/${r.id}`} className="flex min-w-[200px] items-center gap-1.5">
          <span>
            <span className="font-medium hover:underline">{r.name}</span>
            <span className="block text-xs text-muted-foreground">{[r.industry, r.city].filter(Boolean).join(" · ") || "—"}</span>
          </span>
          {r.isKeyAccount ? <Star className="size-3.5 fill-amber-400 text-amber-500" aria-label="Cliente estratégico" /> : null}
        </Link>
      ),
    },
    { key: "status", header: "Status", cell: (r) => <StatusBadge map={CLIENT_STATUS} value={r.status} /> },
    { key: "health", header: "Saúde", cell: (r) => <ScoreBadge score={r.health.score} label={r.health.label} /> },
    { key: "opps", header: "Oport. abertas", align: "right", cell: (r) => r._count.opportunities || "—" },
    { key: "projects", header: "Projetos ativos", align: "right", cell: (r) => r._count.projects || "—" },
    { key: "lastInteractionAt", header: "Último contato", sortable: true, cell: (r) => <span className="text-muted-foreground">{r.lastInteractionAt ? formatRelativeTime(r.lastInteractionAt) : "Nunca"}</span> },
    { key: "owner", header: "Responsável", cell: (r) => <UserChip name={r.owner?.name} /> },
    { key: "tags", header: "Tags", cell: (r) => <TagList tags={r.tags} /> },
  ];
  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Empresas e pessoas atendidas, com saúde do relacionamento calculada por regras transparentes."
        actions={
          <>
            {ctx.permissions.has("data.import") ? (
              <Link href="/app/settings/import?entity=clients" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Upload /> Importar CSV
              </Link>
            ) : null}
            {canWrite ? (
              <CreateButton kind="client" className={buttonVariants({ size: "sm" })}>
                <Plus /> Novo cliente
              </CreateButton>
            ) : null}
          </>
        }
      />
      <div className="mb-3">
        <SavedViews entity="clients" views={views} />
      </div>
      <FilterBar
        searchPlaceholder="Buscar por nome, e-mail ou CNPJ"
        filters={[
          { key: "status", label: "Status", options: Object.entries(CLIENT_STATUS).map(([v, l]) => ({ value: v, label: l.label })) },
          { key: "industry", label: "Segmento", options: ctx.org.settings.industries.map((i) => ({ value: i, label: i })) },
          { key: "owner", label: "Responsável", options: [{ value: "me", label: "Meus clientes" }, ...members.map((m) => ({ value: m.userId, label: m.user.name }))] },
          { key: "key", label: "Estratégicos", options: [{ value: "1", label: "Somente estratégicos" }] },
          { key: "inactive", label: "Sem contato", options: [{ value: "10", label: "há 10+ dias" }, { value: "30", label: "há 30+ dias" }, { value: "60", label: "há 60+ dias" }] },
          ...(tags.length ? [{ key: "tag", label: "Tag", options: tags.map((t) => ({ value: t.name, label: t.name })) }] : []),
        ]}
      />
      <DataTable
        columns={columns}
        rows={rows}
        pathname="/app/clients"
        searchParams={sp}
        sort={params.sort}
        dir={params.dir}
        empty={
          <EmptyState
            icon={Users}
            title={params.q || Object.keys(sp).length ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
            description="Cadastre seus clientes ou importe uma planilha para começar a acompanhar relacionamento, oportunidades e projetos."
            action={
              canWrite ? (
                <CreateButton kind="client" className={buttonVariants({ size: "sm" })}>
                  <Plus /> Cadastrar cliente
                </CreateButton>
              ) : null
            }
          />
        }
      />
      <Pagination pathname="/app/clients" searchParams={sp} page={params.page} pageSize={params.pageSize} total={total} />
    </div>
  );
}
