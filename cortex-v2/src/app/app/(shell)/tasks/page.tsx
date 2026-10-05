import type React from "react";
import Link from "next/link";
import { CalendarDays, CheckSquare, KanbanSquare, List, Plus } from "lucide-react";
import { BulkSelectProvider, RowCheckbox, SelectAllCheckbox } from "@/components/common/bulk-select";
import { DataTable, Pagination, type Column } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { FilterBar } from "@/components/common/filter-bar";
import { MonthCalendar, monthBounds } from "@/components/common/month-calendar";
import { PageHeader } from "@/components/common/page-header";
import { PriorityBadge, StatusBadge } from "@/components/common/badges";
import { TagList } from "@/components/common/tag-list";
import { UserChip } from "@/components/common/user-avatar";
import { CreateButton } from "@/components/shell/shell-context";
import { buttonVariants } from "@/components/ui/button";
import { SavedViews } from "@/features/preferences/components/saved-views";
import { TaskBoard } from "@/features/tasks/components/task-board";
import { TaskBulkActions } from "@/features/tasks/components/task-bulk-actions";
import { dateOnlyKey, dayKeyInTz, keyToDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { PRIORITY, TASK_STATUS } from "@/lib/labels";
import { buildHref, first, parseListParams, type SearchParams } from "@/lib/list-params";
import { cn } from "@/lib/utils";
import { requireCtx } from "@/server/auth/context";
import { savedViewsFor } from "@/server/modules/preferences";
import { boardTasks, listTasks } from "@/server/modules/tasks";

export const metadata = { title: "Tarefas" };

type Row = Awaited<ReturnType<typeof listTasks>>["rows"][number];

export default async function TasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("tasks.read");
  const sp = await searchParams;
  const view = first(sp.view) ?? "list";
  const params = parseListParams(sp, { sortable: ["dueDate", "priority", "title", "createdAt"], defaultSort: "dueDate", defaultDir: "asc", pageSize: 50 });
  const todayKey = dayKeyInTz(new Date(), ctx.org.timezone);
  const canWrite = ctx.permissions.has("tasks.write") && ctx.access.level === "FULL";
  const [members, projects, views] = await Promise.all([
    ctx.db.organizationMember.findMany({ where: { status: "ACTIVE" }, select: { userId: true, user: { select: { name: true } } } }),
    ctx.db.project.findMany({ where: { status: { notIn: ["COMPLETED", "CANCELED"] } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
    savedViewsFor(ctx, "tasks"),
  ]);
  const viewLink = (v: string) => buildHref("/app/tasks", sp, { view: v === "list" ? null : v, page: null });
  const contextOf = (t: { project: { name: string } | null; client: { name: string } | null; opportunity: { title: string } | null }) => t.project?.name ?? t.opportunity?.title ?? t.client?.name ?? null;

  let content: React.ReactNode;
  if (view === "kanban") {
    const status = first(sp.status);
    const rows = await boardTasks(ctx, parseListParams({ ...sp, status: status ?? "ALL", top: "0" }, { sortable: [], defaultSort: "dueDate" }));
    const visible = rows.filter((r) => r.status !== "CANCELED" && (r.status !== "DONE" || (r.completedAt && Date.now() - r.completedAt.getTime() < 14 * 86_400_000)));
    content = (
      <>
        <p className="mb-2 text-xs text-muted-foreground">Concluídas aparecem por 14 dias. Arraste entre colunas para mudar o status.</p>
        <TaskBoard todayKey={todayKey} canWrite={canWrite} initial={visible.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate ? dateOnlyKey(t.dueDate) : null, assigneeName: t.assignee?.name ?? null, context: contextOf(t) }))} />
      </>
    );
  } else if (view === "calendar") {
    const month = /^\d{4}-\d{2}$/.test(first(sp.month) ?? "") ? first(sp.month)! : todayKey.slice(0, 7);
    const { gridStart, gridEnd } = monthBounds(month);
    const rows = await boardTasks(ctx, parseListParams({ ...sp, status: first(sp.status) ?? "ALL", top: "0" }, { sortable: [], defaultSort: "dueDate" }), { from: keyToDate(gridStart), to: keyToDate(gridEnd) });
    content = (
      <MonthCalendar
        month={month}
        todayKey={todayKey}
        pathname="/app/tasks"
        searchParams={sp}
        events={rows
          .filter((t) => t.dueDate && t.status !== "CANCELED")
          .map((t) => {
            const k = dateOnlyKey(t.dueDate!);
            return { id: t.id, dateKey: k, title: t.title, href: `/app/tasks/${t.id}`, tone: t.status === "DONE" ? "task-done" : k < todayKey ? "task-overdue" : "task" } as const;
          })}
      />
    );
  } else {
    const { rows, total } = await listTasks(ctx, params);
    const columns: Column<Row>[] = [
      ...(canWrite ? [{ key: "select", header: <SelectAllCheckbox />, cell: (r: Row) => <RowCheckbox id={r.id} label={r.title} />, className: "w-8" }] : []),
      {
        key: "title",
        header: "Tarefa",
        sortable: true,
        cell: (r) => (
          <Link href={`/app/tasks/${r.id}`} className="block min-w-[240px]">
            <span className={cn("font-medium hover:underline", r.status === "DONE" && "text-muted-foreground line-through")}>{r.title}</span>
            {contextOf(r) ? <span className="block text-xs text-muted-foreground">{contextOf(r)}</span> : null}
          </Link>
        ),
      },
      { key: "status", header: "Status", cell: (r) => <StatusBadge map={TASK_STATUS} value={r.status} /> },
      { key: "priority", header: "Prioridade", sortable: true, cell: (r) => <span title={r.priorityIsManual ? "Definida manualmente" : `Recomendada: ${r.priorityReasons.join(" · ")}`}><PriorityBadge priority={r.priority} /></span> },
      {
        key: "dueDate",
        header: "Prazo",
        sortable: true,
        cell: (r) => (r.dueDate ? <span className={r.status !== "DONE" && dateOnlyKey(r.dueDate) < todayKey ? "font-medium text-destructive" : ""}>{formatDate(r.dueDate)}</span> : <span className="text-muted-foreground">—</span>),
      },
      { key: "assignee", header: "Responsável", cell: (r) => <UserChip name={r.assignee?.name} /> },
      { key: "tags", header: "Tags", cell: (r) => <TagList tags={r.tags} /> },
    ];
    content = (
      <BulkSelectProvider ids={rows.map((r) => r.id)}>
        <DataTable
          columns={columns}
          rows={rows}
          pathname="/app/tasks"
          searchParams={sp}
          sort={params.sort}
          dir={params.dir}
          empty={<EmptyState icon={CheckSquare} title="Nenhuma tarefa encontrada" description="Crie tarefas para organizar o dia a dia — o Córtex recomenda a prioridade e explica o motivo." action={canWrite ? <CreateButton kind="task" className={buttonVariants({ size: "sm" })}><Plus /> Criar tarefa</CreateButton> : null} />}
        />
        <TaskBulkActions />
        <Pagination pathname="/app/tasks" searchParams={sp} page={params.page} pageSize={params.pageSize} total={total} />
      </BulkSelectProvider>
    );
  }

  return (
    <div>
      <PageHeader
        title="Tarefas"
        description="Prioridade recomendada pelo Smart Priority Engine (prazo, cliente estratégico, oportunidade, bloqueio de projeto). Você pode sobrescrever a qualquer momento."
        actions={canWrite ? <CreateButton kind="task" className={buttonVariants({ size: "sm" })}><Plus /> Nova tarefa</CreateButton> : null}
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SavedViews entity="tasks" views={views} />
        <div className="inline-flex rounded-md border p-0.5" role="tablist" aria-label="Visualização">
          {[
            { v: "list", label: "Lista", icon: List },
            { v: "kanban", label: "Kanban", icon: KanbanSquare },
            { v: "calendar", label: "Calendário", icon: CalendarDays },
          ].map(({ v, label, icon: Icon }) => (
            <Link key={v} href={viewLink(v)} role="tab" aria-selected={view === v} className={cn("inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[13px]", view === v ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground")}>
              <Icon className="size-3.5" /> {label}
            </Link>
          ))}
        </div>
      </div>
      <FilterBar
        searchPlaceholder="Buscar tarefa"
        filters={[
          ...(view === "list" ? [{ key: "status", label: "Status", options: [{ value: "ALL", label: "Todas" }, ...Object.entries(TASK_STATUS).map(([v, l]) => ({ value: v, label: l.label }))] }] : []),
          { key: "assignee", label: "Responsável", options: [{ value: "me", label: "Minhas tarefas" }, { value: "none", label: "Sem responsável" }, ...members.map((m) => ({ value: m.userId, label: m.user.name }))] },
          { key: "priority", label: "Prioridade", options: Object.entries(PRIORITY).map(([v, l]) => ({ value: v, label: l.label })) },
          { key: "project", label: "Projeto", options: projects.map((p) => ({ value: p.id, label: p.name })) },
          ...(view === "list" ? [{ key: "due", label: "Prazo", options: [{ value: "overdue", label: "Atrasadas" }, { value: "today", label: "Vencem hoje" }, { value: "week", label: "Próximos 7 dias" }] }] : []),
        ]}
      />
      {content}
    </div>
  );
}
