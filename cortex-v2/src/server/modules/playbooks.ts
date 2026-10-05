import "server-only";
import { addDaysToKey, dayKeyInTz, keyToDate } from "@/lib/dates";
import { logActivity } from "@/server/activity";
import { AppError } from "@/server/errors";
import { notify } from "@/server/modules/notifications";
import type { OrgScope } from "@/server/scope";

export interface PlaybookTarget {
  clientId?: string | null;
  projectId?: string | null;
  opportunityId?: string | null;
  /** responsável do registro (para passos ENTITY_OWNER) */
  ownerId?: string | null;
}

/** Inicia um playbook: cria uma tarefa por passo, com prazo relativo e responsável conforme a regra do passo. */
export async function runPlaybook(scope: OrgScope, playbookId: string, target: PlaybookTarget) {
  const playbook = await scope.db.playbook.findFirst({
    where: { id: playbookId },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  if (!playbook) throw new AppError("NOT_FOUND", "Playbook não encontrado.");
  if (!playbook.enabled) throw new AppError("VALIDATION", "Este playbook está desativado.");
  if (!playbook.steps.length) throw new AppError("VALIDATION", "O playbook não possui passos.");

  const activeMembers = new Set(
    (await scope.db.organizationMember.findMany({ where: { status: "ACTIVE" }, select: { userId: true } })).map((m) => m.userId),
  );
  const todayKey = dayKeyInTz(new Date(), scope.org.timezone);

  const run = await scope.db.playbookRun.create({
    data: {
      organizationId: scope.org.id,
      playbookId,
      clientId: target.clientId ?? null,
      projectId: target.projectId ?? null,
      opportunityId: target.opportunityId ?? null,
      startedById: scope.actorId,
    },
  });

  let created = 0;
  for (const step of playbook.steps) {
    let assigneeId: string | null = null;
    if (step.assigneeMode === "USER" && step.assigneeId && activeMembers.has(step.assigneeId)) assigneeId = step.assigneeId;
    else if (step.assigneeMode === "ENTITY_OWNER" && target.ownerId && activeMembers.has(target.ownerId)) assigneeId = target.ownerId;
    else if (scope.actorId && activeMembers.has(scope.actorId)) assigneeId = scope.actorId;

    const task = await scope.db.task.create({
      data: {
        organizationId: scope.org.id,
        title: step.title,
        description: step.description ? `${step.description}\n\nPlaybook: ${playbook.name}` : `Playbook: ${playbook.name}`,
        assigneeId,
        priority: step.priority,
        dueDate: keyToDate(addDaysToKey(todayKey, step.offsetDays)),
        estimateHours: step.estimateHours,
        source: "PLAYBOOK",
        playbookRunId: run.id,
        sortOrder: step.order,
        clientId: target.clientId ?? null,
        projectId: target.projectId ?? null,
        opportunityId: target.opportunityId ?? null,
        createdById: scope.actorId,
      },
    });
    created++;
    if (assigneeId && assigneeId !== scope.actorId) {
      await notify({
        organizationId: scope.org.id,
        userId: assigneeId,
        type: "task.assigned",
        title: `Nova tarefa: ${task.title}`,
        body: `Playbook “${playbook.name}”`,
        link: `/app/tasks/${task.id}`,
        entityType: "task",
        entityId: task.id,
      });
    }
  }

  await logActivity(scope.db, { organizationId: scope.org.id, userId: scope.actorId }, {
    action: "playbook.started",
    title: `Playbook “${playbook.name}” iniciado (${created} tarefas)`,
    entityType: "playbook",
    entityId: playbook.id,
    clientId: target.clientId ?? null,
    projectId: target.projectId ?? null,
    opportunityId: target.opportunityId ?? null,
  });
  return { id: run.id, taskCount: created };
}
