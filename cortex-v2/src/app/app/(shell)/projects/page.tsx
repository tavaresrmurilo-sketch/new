import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { DataTable, Pagination, type Column } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/page-header";
import { PriorityBadge, ScoreBadge, StatusBadge } from "@/components/common/badges";
import { UserChip } from "@/components/common/user-avatar";
import { CreateButton } from "@/components/shell/shell-context";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { SavedViews } from "@/features/preferences/components/saved-views";
import { dateOnlyKey, dayKeyInTz } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { PROJECT_STATUS } from "@/lib/labels";
import { parseListParams, type SearchParams } from "@/lib/list-params";
import { requireCtx } from "@/server/auth/context";
import { savedViewsFor } from "@/server/modules/preferences";
import { listProjects } from "@/server/modules/projects";

export const metadata = { title: "Projetos" };

type Row = Awaited<ReturnType<typeof listProjects>>["rows"][number];

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("projects.read");
  const sp = await searchParams;
  const params = parseListParams(sp, { sortable: ["name", "dueDate", "priority", "createdAt"], defaultSort: "dueDate", defaultDir: "asc" });
  if (!sp.status) (sp as Record<string, string>).status = "OPEN";
  const effective = parseListParams(sp, { sortable: ["name", "dueDate", "priority", "createdAt"], defaultSort: "dueDate", defaultDir: "asc" });
  const [{ rows, total }, members, views] = await Promise.all([
    listProjects(ctx, effective),
    ctx.db.organizationMember.findMany({ where: { status: "ACTIVE" }, select: { userId: true, user: { select: { name: true } } } }),
    savedViewsFor(ctx, "projects"),
  ]);
  const todayKey = dayKeyInTz(new Date(), ctx.org.timezone);
  const canWrite = ctx.permissions.has("projects.write") && ctx.access.level === "FULL";
  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Projeto",
      sortable: true,
      cell: (r) => (
        <Link href={`/app/projects/${r.id}`} className="block min-w-[220px]">
          <span className="font-medium hover:underline">{r.name}</span>
          <span className="block text-xs text-muted-foreground">{r.client?.name ?? "Projeto interno"}</span>
        </Link>
      ),
    },
    { key: "status", header: "Status", cell: (r) => <StatusBadge map={PROJECT_STATUS} value={r.status} /> },
    { key: "health", header: "Saúde", cell: (r) => <ScoreBadge score={r.health.score} label={r.health.label} /> },
    {
      key: "progress",
      header: "Progresso",
      cell: (r) => (
        <div className="flex w-32 items-center gap-2">
          <Progress value={r.health.effectiveProgress} />
          <span className="tabular text-xs text-muted-foreground">{r.health.effectiveProgress}%</span>
        </div>
      ),
    },
    {
      key: "dueDate",
      header: "Prazo",
      sortable: true,
      cell: (r) =>
        r.dueDate ? <span className={r.status !== "COMPLETED" && dateOnlyKey(r.dueDate) < todayKey ? "font-medium text-destructive" : ""}>{formatDate(r.dueDate)}</span> : "—",
    },
    { key: "priority", header: "Prioridade", sortable: true, cell: (r) => <PriorityBadge priority={r.priority} /> },
    { key: "manager", header: "Gerente", cell: (r) => <UserChip name={r.manager?.name} /> },
  ];
  return (
    <div>
      <PageHeader
        title="Projetos"
        description="Cada projeto tem um Project Health Score (0–100) calculado por prazo, tarefas, orçamento, riscos e carga da equipe."
        actions={canWrite ? <CreateButton kind="project" className={buttonVariants({ size: "sm" })}><Plus /> Novo projeto</CreateButton> : null}
      />
      <div className="mb-3">
        <SavedViews entity="projects" views={views} />
      </div>
      <FilterBar
        searchPlaceholder="Buscar projeto, código ou cliente"
        filters={[
          { key: "status", label: "Status", options: [{ value: "OPEN", label: "Em aberto" }, ...Object.entries(PROJECT_STATUS).map(([v, l]) => ({ value: v, label: l.label }))] },
          { key: "manager", label: "Gerente", options: [{ value: "me", label: "Meus projetos" }, ...members.map((m) => ({ value: m.userId, label: m.user.name }))] },
          { key: "risk", label: "Saúde", options: [{ value: "1", label: "Em risco (< 60)" }] },
          { key: "overdue", label: "Prazo", options: [{ value: "1", label: "Prazo vencido" }] },
        ]}
      />
      <DataTable
        columns={columns}
        rows={rows}
        pathname="/app/projects"
        searchParams={sp}
        sort={params.sort}
        dir={params.dir}
        empty={<EmptyState icon={FolderKanban} title="Nenhum projeto encontrado" description="Crie um projeto para planejar entregas, prazos, equipe e riscos." action={canWrite ? <CreateButton kind="project" className={buttonVariants({ size: "sm" })}><Plus /> Criar projeto</CreateButton> : null} />}
      />
      <Pagination pathname="/app/projects" searchParams={sp} page={effective.page} pageSize={effective.pageSize} total={total} />
    </div>
  );
}
