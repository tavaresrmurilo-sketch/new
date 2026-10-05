import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { ActivityTimeline } from "@/components/common/activity-timeline";
import { DetailList, PageHeader, Section } from "@/components/common/page-header";
import { PriorityBadge } from "@/components/common/badges";
import { TagList } from "@/components/common/tag-list";
import { BreadcrumbLabel } from "@/components/shell/shell-context";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DocumentList } from "@/features/documents/components/document-list";
import { DocumentUploadButton } from "@/features/documents/components/document-upload";
import { CommentsPanel, TaskHeaderActions, TaskStatusSelect } from "@/features/tasks/components/task-detail-client";
import { TaskChecklist } from "@/features/tasks/components/task-checklist";
import { dateOnlyKey, dayKeyInTz } from "@/lib/dates";
import { formatDate, formatDateTime } from "@/lib/format";
import { PRIORITY } from "@/lib/labels";
import { toNumber } from "@/lib/utils";
import { requireCtx } from "@/server/auth/context";
import { getTaskDetail } from "@/server/modules/tasks";

const SOURCE_LABEL: Record<string, string> = { MANUAL: "Criada manualmente", AI: "Criada pela IA (confirmada)", PLAYBOOK: "Criada por playbook", AUTOMATION: "Criada por automação", MEETING: "Criada a partir de reunião", COMMAND: "Criada pelo Command Center" };

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx("tasks.read");
  const { id } = await params;
  const data = await getTaskDetail(ctx, id);
  if (!data) notFound();
  const { task, recommendation } = data;
  const tz = ctx.org.timezone;
  const todayKey = dayKeyInTz(new Date(), tz);
  const writable = ctx.access.level === "FULL";
  const canWrite = writable && ctx.permissions.has("tasks.write");
  const members = await ctx.db.organizationMember.findMany({ where: { status: "ACTIVE" }, select: { user: { select: { name: true } } } });
  const overdue = task.status !== "DONE" && task.dueDate && dateOnlyKey(task.dueDate) < todayKey;
  return (
    <div className="space-y-5">
      <BreadcrumbLabel segment={id} label={task.title} />
      <PageHeader
        eyebrow={task.parent ? <Link href={`/app/tasks/${task.parent.id}`} className="hover:underline">Subtarefa de: {task.parent.title}</Link> : SOURCE_LABEL[task.source]}
        title={task.title}
        actions={
          <>
            <TaskStatusSelect id={id} status={task.status} disabled={!canWrite} />
            <TaskHeaderActions
              id={id}
              canWrite={canWrite}
              canDelete={writable && ctx.permissions.has("tasks.delete")}
              labels={{ client: task.client?.name ?? null, opportunity: task.opportunity?.title ?? null }}
              values={{
                title: task.title,
                description: task.description,
                projectId: task.projectId,
                clientId: task.clientId,
                opportunityId: task.opportunityId,
                parentId: task.parentId,
                assigneeId: task.assigneeId,
                priority: task.priorityIsManual ? task.priority : "AUTO",
                status: task.status,
                dueDate: task.dueDate ? dateOnlyKey(task.dueDate) : null,
                estimateHours: task.estimateHours ? toNumber(task.estimateHours) : null,
                blocksProject: task.blocksProject,
                tags: data.tags.map((t) => t.name),
              }}
            />
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {task.description ? <p className="whitespace-pre-line rounded-lg border bg-card p-4 text-sm">{task.description}</p> : null}
          <Section title="Subtarefas">
            <TaskChecklist
              todayKey={todayKey}
              canWrite={canWrite}
              quickAdd={{ parentId: id, projectId: task.projectId ?? undefined, clientId: task.clientId ?? undefined, opportunityId: task.opportunityId ?? undefined }}
              tasks={task.subtasks.map((s) => ({ id: s.id, title: s.title, status: s.status, priority: s.priority, dueDate: s.dueDate ? dateOnlyKey(s.dueDate) : null, assigneeName: s.assignee?.name ?? null }))}
            />
          </Section>
          <Section title="Anexos" actions={writable && ctx.permissions.has("documents.write") ? <DocumentUploadButton defaults={{ taskId: id, projectId: task.projectId ?? undefined, clientId: task.clientId ?? undefined }} label="Anexar" /> : null}>
            <DocumentList documents={task.documents} tz={tz} canDelete={writable && ctx.permissions.has("documents.delete")} />
          </Section>
          <Section title="Comentários">
            <CommentsPanel
              taskId={id}
              comments={task.comments}
              currentUserId={ctx.user.id}
              canComment={writable && Boolean(ctx.member)}
              canModerate={ctx.permissions.has("tasks.delete")}
              members={members.map((m) => m.user.name).filter((n) => n !== ctx.user.name)}
            />
          </Section>
          <Section title="Histórico">
            <ActivityTimeline tz={tz} items={data.activities.map((a) => ({ ...a, actorName: a.actor?.name }))} />
          </Section>
        </div>
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-2 pt-4">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Sparkles className="size-3.5" /> Smart Priority Engine
              </p>
              <p className="text-sm">
                Prioridade recomendada: <strong className="uppercase">{PRIORITY[recommendation.priority]?.label}</strong>
                <span className="text-muted-foreground"> ({recommendation.points} pts)</span>
              </p>
              <ul className="list-inside list-disc text-[13px] text-muted-foreground">
                {recommendation.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
              <p className="border-t pt-2 text-xs">
                Prioridade atual: <PriorityBadge priority={task.priority} />{" "}
                {task.priorityIsManual ? <Badge tone="outline">definida manualmente</Badge> : <Badge tone="primary">automática</Badge>}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <DetailList
                className="sm:grid-cols-1"
                items={[
                  { label: "Responsável", value: task.assignee?.name ?? "Sem responsável" },
                  { label: "Prazo", value: task.dueDate ? <span className={overdue ? "font-medium text-destructive" : ""}>{formatDate(task.dueDate)}{overdue ? " (atrasada)" : ""}</span> : "Sem prazo" },
                  { label: "Estimativa", value: task.estimateHours ? `${toNumber(task.estimateHours)} h` : "—" },
                  { label: "Projeto", value: task.project ? <Link href={`/app/projects/${task.project.id}`} className="hover:underline">{task.project.name}</Link> : "—" },
                  { label: "Cliente", value: task.client ? <Link href={`/app/clients/${task.client.id}`} className="hover:underline">{task.client.name}</Link> : "—" },
                  { label: "Oportunidade", value: task.opportunity ? <Link href={`/app/opportunities/${task.opportunity.id}`} className="hover:underline">{task.opportunity.title}</Link> : "—" },
                  { label: "Bloqueia projeto", value: task.blocksProject ? "Sim" : "Não" },
                  { label: "Criada em", value: formatDateTime(task.createdAt, tz) },
                  ...(task.completedAt ? [{ label: "Concluída em", value: formatDateTime(task.completedAt, tz) }] : []),
                  { label: "Tags", value: <TagList tags={data.tags} max={10} /> },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
