import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Globe } from "lucide-react";
import { ActivityTimeline } from "@/components/common/activity-timeline";
import { LinkTabs } from "@/components/common/link-tabs";
import { MetricCard } from "@/components/common/metric-card";
import { PageHeader, Section } from "@/components/common/page-header";
import { HealthCard } from "@/components/common/score-cards";
import { PriorityBadge, StatusBadge } from "@/components/common/badges";
import { TagList } from "@/components/common/tag-list";
import { UserAvatar } from "@/components/common/user-avatar";
import { BreadcrumbLabel, CreateButton } from "@/components/shell/shell-context";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { InteractionComposer } from "@/features/clients/components/interaction-form";
import { DocumentList } from "@/features/documents/components/document-list";
import { DocumentUploadButton } from "@/features/documents/components/document-upload";
import { MemoryPanel } from "@/features/memory/components/memory-panel";
import { StartPlaybookButton } from "@/features/playbooks/components/start-playbook";
import { FavoriteButton } from "@/features/preferences/components/favorite-button";
import { ProjectActions } from "@/features/projects/components/project-actions";
import { RiskRegister } from "@/features/projects/components/risk-register";
import { TaskChecklist } from "@/features/tasks/components/task-checklist";
import { dateOnlyKey, dayKeyInTz } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { PROJECT_STATUS, RECEIVABLE_STATUS } from "@/lib/labels";
import { first, type SearchParams } from "@/lib/list-params";
import { toNumber } from "@/lib/utils";
import { requireCtx } from "@/server/auth/context";
import { isFavorite } from "@/server/modules/preferences";
import { getProjectDetail } from "@/server/modules/projects";
import { Plus } from "lucide-react";

export default async function ProjectDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("projects.read");
  const { id } = await params;
  const sp = await searchParams;
  const data = await getProjectDetail(ctx, id);
  if (!data) notFound();
  const { project, health } = data;
  const tab = first(sp.tab) ?? "overview";
  const tz = ctx.org.timezone;
  const todayKey = dayKeyInTz(new Date(), tz);
  const writable = ctx.access.level === "FULL";
  const canWrite = writable && ctx.permissions.has("projects.write");
  const canTasks = writable && ctx.permissions.has("tasks.write");
  const finance = ctx.permissions.has("finance.read");
  const fav = await isFavorite(ctx, "project", id);
  const budget = project.budget ? toNumber(project.budget) : null;
  const cost = project.actualCost ? toNumber(project.actualCost) : null;
  const topTasks = data.tasks.filter((t) => !t.parentId);
  const pathname = `/app/projects/${id}`;
  return (
    <div className="space-y-5">
      <BreadcrumbLabel segment={id} label={project.name} />
      <PageHeader
        eyebrow={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge map={PROJECT_STATUS} value={project.status} />
            <PriorityBadge priority={project.priority} />
            {project.sharedWithClient ? <Badge tone="info"><Globe /> No portal</Badge> : null}
            <TagList tags={data.tags} />
          </span>
        }
        title={project.name}
        description={
          <>
            {project.client ? <Link href={`/app/clients/${project.client.id}`} className="hover:underline">{project.client.name}</Link> : "Projeto interno"}
            {project.code ? ` · ${project.code}` : ""}
            {project.opportunity ? <> · origem: <Link href={`/app/opportunities/${project.opportunity.id}`} className="hover:underline">{project.opportunity.title}</Link></> : null}
          </>
        }
        actions={
          <>
            <FavoriteButton entityType="project" entityId={id} label={project.name} href={pathname} initial={fav} />
            {writable && ctx.permissions.has("playbooks.run") ? <StartPlaybookButton target={{ projectId: id, clientId: project.clientId ?? undefined }} /> : null}
            {canTasks ? (
              <CreateButton kind="task" defaults={{ projectId: id, clientId: project.clientId, __clientLabel: project.client?.name, __stay: true }} className={buttonVariants({ size: "sm" })}>
                <Plus /> Tarefa
              </CreateButton>
            ) : null}
            <ProjectActions
              id={id}
              clientLabel={project.client?.name ?? null}
              opportunityLabel={project.opportunity?.title ?? null}
              canWrite={canWrite}
              canDelete={writable && ctx.permissions.has("projects.delete")}
              values={{
                name: project.name,
                code: project.code,
                clientId: project.clientId,
                opportunityId: project.opportunityId,
                managerId: project.managerId,
                memberIds: project.members.map((m) => m.userId),
                description: project.description,
                priority: project.priority,
                status: project.status,
                startDate: project.startDate ? dateOnlyKey(project.startDate) : null,
                dueDate: project.dueDate ? dateOnlyKey(project.dueDate) : null,
                progress: project.progress,
                budget,
                actualCost: cost,
                sharedWithClient: project.sharedWithClient,
                tags: data.tags.map((t) => t.name),
              }}
            />
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card px-4 py-3.5">
          <p className="text-xs font-medium text-muted-foreground">Progresso</p>
          <p className="tabular mt-2 text-[22px] font-semibold leading-none">{health.effectiveProgress}%</p>
          <Progress value={health.effectiveProgress} className="mt-2" />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {health.taskCount ? `${health.doneCount}/${health.taskCount} tarefas` : "Progresso manual"}
            {health.expectedProgress !== null ? ` · esperado ~${health.expectedProgress}%` : ""}
          </p>
        </div>
        <MetricCard label="Prazo" value={project.dueDate ? formatDate(project.dueDate) : "—"} hint={project.startDate ? `Início ${formatDate(project.startDate)}` : undefined} tone={project.dueDate && project.status !== "COMPLETED" && dateOnlyKey(project.dueDate) < todayKey ? "danger" : "default"} />
        <MetricCard label="Tarefas atrasadas" value={health.overdueTasks} tone={health.overdueTasks ? "danger" : "default"} />
        <MetricCard
          label="Orçamento"
          value={finance ? (budget !== null ? formatCurrency(budget, ctx.org.currency, { compact: true }) : "—") : "•••"}
          hint={finance && budget ? `Realizado ${formatCurrency(cost ?? 0, ctx.org.currency, { compact: true })} (${Math.round(((cost ?? 0) / budget) * 100)}%)` : undefined}
          tone={finance && budget && cost && cost > budget ? "danger" : "default"}
        />
      </div>
      <LinkTabs
        pathname={pathname}
        searchParams={sp}
        active={tab}
        tabs={[
          { key: "overview", label: "Visão geral" },
          { key: "tasks", label: "Tarefas", count: topTasks.filter((t) => t.status !== "DONE" && t.status !== "CANCELED").length },
          { key: "risks", label: "Registro de riscos", count: data.risks.filter((r) => r.status === "OPEN" || r.status === "MITIGATING").length },
          { key: "team", label: "Equipe", count: project.members.length },
          { key: "documents", label: "Documentos", count: data.documents.length },
          ...(finance ? [{ key: "finance", label: "Financeiro", count: data.receivables.length }] : []),
          { key: "memory", label: "Memory", count: data.memory.length },
          { key: "timeline", label: "Timeline" },
        ]}
      />
      {tab === "overview" ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <Section title="Próximas tarefas" actions={<Link href={`${pathname}?tab=tasks`} className="text-xs text-primary hover:underline">Ver todas</Link>}>
              <TaskChecklist
                todayKey={todayKey}
                canWrite={canTasks}
                tasks={topTasks
                  .filter((t) => t.status !== "DONE" && t.status !== "CANCELED")
                  .slice(0, 8)
                  .map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate ? dateOnlyKey(t.dueDate) : null, assigneeName: t.assignee?.name ?? null, subtasks: t._count.subtasks }))}
              />
            </Section>
            {project.description ? (
              <Section title="Descrição">
                <p className="whitespace-pre-line text-sm text-muted-foreground">{project.description}</p>
              </Section>
            ) : null}
            {canWrite ? <InteractionComposer target={{ projectId: id }} compact /> : null}
          </div>
          <div className="space-y-4">
            <HealthCard title="Project Health" score={health.score} label={health.label} factors={health.factors} footnote="Parte de 100 e desconta prazo, tarefas atrasadas, entregas próximas, bloqueios, orçamento, riscos e carga da equipe." />
            {health.risks.length ? (
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-warning"><AlertTriangle className="size-3.5" /> Riscos detectados</p>
                <ul className="mt-2 space-y-1.5 text-[13px]">
                  {health.risks.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {tab === "tasks" ? (
        <TaskChecklist
          todayKey={todayKey}
          canWrite={canTasks}
          quickAdd={{ projectId: id, clientId: project.clientId ?? undefined }}
          tasks={topTasks.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate ? dateOnlyKey(t.dueDate) : null, assigneeName: t.assignee?.name ?? null, subtasks: t._count.subtasks }))}
        />
      ) : null}
      {tab === "risks" ? <RiskRegister target={{ projectId: id }} canWrite={canWrite} risks={data.risks.map((r) => ({ ...r, ownerName: r.owner?.name ?? null }))} /> : null}
      {tab === "team" ? (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {project.members.map((m) => {
            const open = data.tasks.filter((t) => t.assignee?.id === m.userId && t.status !== "DONE" && t.status !== "CANCELED");
            return (
              <li key={m.userId} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                <UserAvatar name={m.user.name} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.user.name}{m.userId === project.managerId ? <span className="ml-1 text-xs text-muted-foreground">(gerente)</span> : null}</p>
                  <p className="text-xs text-muted-foreground">{open.length} tarefa(s) aberta(s) neste projeto</p>
                </div>
              </li>
            );
          })}
          {!project.members.length ? <p className="text-sm text-muted-foreground">Nenhum membro na equipe do projeto.</p> : null}
        </ul>
      ) : null}
      {tab === "documents" ? (
        <div className="space-y-3">
          {writable && ctx.permissions.has("documents.write") ? <DocumentUploadButton defaults={{ projectId: id, clientId: project.clientId ?? undefined, category: "PROJECT" }} /> : null}
          <DocumentList documents={data.documents} tz={tz} canDelete={writable && ctx.permissions.has("documents.delete")} />
        </div>
      ) : null}
      {tab === "finance" && finance ? (
        <div className="space-y-3">
          <ul className="divide-y rounded-lg border bg-card">
            {data.receivables.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="flex-1">{r.description}</span>
                <StatusBadge map={RECEIVABLE_STATUS} value={r.status} />
                <span className="text-xs text-muted-foreground">vence {formatDate(r.dueDate)}</span>
                <span className="tabular font-medium">{formatCurrency(r.amount, ctx.org.currency)}</span>
              </li>
            ))}
            {!data.receivables.length ? <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum recebível vinculado. Registre em Financeiro.</li> : null}
          </ul>
        </div>
      ) : null}
      {tab === "memory" ? <MemoryPanel target={{ projectId: id, clientId: project.clientId ?? undefined }} canWrite={writable && ctx.permissions.has("memory.write")} facts={data.memory.map((m) => ({ ...m, authorName: m.author?.name ?? null }))} /> : null}
      {tab === "timeline" ? <ActivityTimeline tz={tz} items={data.activities.map((a) => ({ ...a, actorName: a.actor?.name }))} /> : null}
    </div>
  );
}
