import "server-only";
import type { Prisma, Priority } from "@prisma/client";
import { z } from "zod";
import { AUTOMATION_ACTIONS, OPERATORS, TRIGGER_KEYS, type AutomationTrigger } from "@/lib/automation-catalog";
import { addDaysToKey, dayKeyInTz, keyToDate } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { logActivity } from "@/server/activity";
import { hasFeature } from "@/server/billing/feature-gate";
import { notify, orgManagers } from "@/server/modules/notifications";
import { addTag, type TaggableEntity } from "@/server/modules/tags";
import type { OrgScope } from "@/server/scope";
import { evaluateConditions, type Condition } from "./conditions";

export const MAX_AUTOMATION_DEPTH = 2;

export const conditionSchema = z.object({
  field: z.string().min(1).max(60),
  operator: z.enum(Object.keys(OPERATORS) as [keyof typeof OPERATORS, ...(keyof typeof OPERATORS)[]]),
  value: z.string().max(200),
});

export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_task"),
    params: z.object({
      title: z.string().trim().min(2).max(200),
      dueInDays: z.coerce.number().int().min(0).max(365).default(1),
      assignTo: z.string().min(1).max(80).default("owner"),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
    }),
  }),
  z.object({
    type: z.literal("notify"),
    params: z.object({ to: z.string().min(1).max(80).default("owner"), message: z.string().trim().min(2).max(300) }),
  }),
  z.object({ type: z.literal("add_tag"), params: z.object({ tag: z.string().trim().min(1).max(40) }) }),
  z.object({ type: z.literal("start_playbook"), params: z.object({ playbookId: z.string().min(1) }) }),
]);

export const automationSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome à automação").max(120),
  description: z.string().trim().max(500).nullish(),
  trigger: z.enum(TRIGGER_KEYS as [AutomationTrigger, ...AutomationTrigger[]]),
  conditions: z.array(conditionSchema).max(10).default([]),
  actions: z.array(actionSchema).min(1, "Adicione pelo menos uma ação").max(10),
  enabled: z.boolean().default(true),
});

export type AutomationAction = z.infer<typeof actionSchema>;
export { AUTOMATION_ACTIONS };

/** Dados que um evento fornece para condições e ações. */
export interface EventPayload {
  entityType: TaggableEntity | "proposal" | "meeting";
  entityId: string;
  label: string;
  link: string;
  ownerId?: string | null;
  clientId?: string | null;
  opportunityId?: string | null;
  projectId?: string | null;
  fields: Record<string, string | number | boolean | null>;
}

async function resolveUsers(scope: OrgScope, target: string, payload: EventPayload): Promise<string[]> {
  if (target === "owner") return payload.ownerId ? [payload.ownerId] : scope.actorId ? [scope.actorId] : [];
  if (target === "actor") return scope.actorId ? [scope.actorId] : [];
  if (target === "managers") return orgManagers(scope.org.id);
  if (target.startsWith("user:")) {
    const userId = target.slice(5);
    const member = await scope.db.organizationMember.count({ where: { userId, status: "ACTIVE" } });
    return member ? [userId] : [];
  }
  return [];
}

async function executeAction(scope: OrgScope, action: AutomationAction, payload: EventPayload, automationName: string) {
  switch (action.type) {
    case "create_task": {
      const [assigneeId] = await resolveUsers(scope, action.params.assignTo, payload);
      const due = keyToDate(addDaysToKey(dayKeyInTz(new Date(), scope.org.timezone), action.params.dueInDays));
      const task = await scope.db.task.create({
        data: {
          organizationId: scope.org.id,
          title: action.params.title.replace("{registro}", payload.label),
          description: `Criada automaticamente pela automação “${automationName}” (${payload.label}).`,
          assigneeId: assigneeId ?? null,
          priority: action.params.priority as Priority,
          priorityIsManual: false,
          dueDate: due,
          source: "AUTOMATION",
          clientId: payload.clientId ?? null,
          opportunityId: payload.opportunityId ?? null,
          projectId: payload.projectId ?? null,
          createdById: scope.actorId,
        },
      });
      await logActivity(scope.db, { organizationId: scope.org.id, userId: null }, {
        action: "task.created",
        title: `Tarefa “${task.title}” criada pela automação “${automationName}”`,
        entityType: "task",
        entityId: task.id,
        taskId: task.id,
        clientId: task.clientId,
        opportunityId: task.opportunityId,
        projectId: task.projectId,
      });
      if (assigneeId) {
        await notify({
          organizationId: scope.org.id,
          userId: assigneeId,
          type: "task.assigned",
          title: `Nova tarefa: ${task.title}`,
          body: `Criada pela automação “${automationName}”.`,
          link: `/app/tasks/${task.id}`,
          entityType: "task",
          entityId: task.id,
        });
      }
      return { taskId: task.id };
    }
    case "notify": {
      const users = await resolveUsers(scope, action.params.to, payload);
      for (const userId of users) {
        await notify({
          organizationId: scope.org.id,
          userId,
          type: "automation.alert",
          title: action.params.message.replace("{registro}", payload.label),
          body: `Automação “${automationName}” · ${payload.label}`,
          link: payload.link,
          entityType: payload.entityType,
          entityId: payload.entityId,
        });
      }
      return { notified: users.length };
    }
    case "add_tag": {
      const taggable: string[] = ["client", "lead", "opportunity", "project", "task", "contact", "document", "contract"];
      if (!taggable.includes(payload.entityType)) return { skipped: "registro não aceita tags" };
      await addTag(scope.db, scope.org.id, payload.entityType as TaggableEntity, payload.entityId, action.params.tag);
      return { tag: action.params.tag };
    }
    case "start_playbook": {
      const { runPlaybook } = await import("@/server/modules/playbooks");
      const run = await runPlaybook(scope, action.params.playbookId, {
        clientId: payload.clientId ?? null,
        projectId: payload.projectId ?? null,
        opportunityId: payload.opportunityId ?? null,
        ownerId: payload.ownerId ?? null,
      });
      return { playbookRunId: run.id, tasks: run.taskCount };
    }
  }
}

/** Executa as automações ativas do workspace para um evento. Falhas são registradas e nunca interrompem a operação original. */
export async function runAutomations(scope: OrgScope, trigger: AutomationTrigger, payload: EventPayload) {
  if (scope.depth >= MAX_AUTOMATION_DEPTH) return;
  if (!hasFeature(scope, "automations")) return;
  const automations = await scope.db.automation.findMany({ where: { trigger, enabled: true } });
  for (const automation of automations) {
    const conditions = (automation.conditions as unknown as Condition[]) ?? [];
    if (!evaluateConditions(conditions, payload.fields)) continue;
    const parsedActions = z.array(actionSchema).safeParse(automation.actions);
    if (!parsedActions.success) {
      await scope.db.automationExecution.create({
        data: { organizationId: scope.org.id, automationId: automation.id, event: trigger, entityType: payload.entityType, entityId: payload.entityId, status: "FAILED", error: "Configuração de ações inválida." },
      });
      continue;
    }
    const nested: OrgScope = { ...scope, depth: scope.depth + 1 };
    try {
      const results = [];
      for (const action of parsedActions.data) results.push({ type: action.type, result: await executeAction(nested, action, payload, automation.name) });
      await scope.db.automationExecution.create({
        data: {
          organizationId: scope.org.id,
          automationId: automation.id,
          event: trigger,
          entityType: payload.entityType,
          entityId: payload.entityId,
          status: "SUCCESS",
          result: results as unknown as Prisma.InputJsonValue,
        },
      });
      await scope.db.automation.update({ where: { id: automation.id }, data: { runCount: { increment: 1 }, lastRunAt: new Date() } });
    } catch (error) {
      logger.error("automation.failed", { automationId: automation.id, error });
      await scope.db.automationExecution.create({
        data: {
          organizationId: scope.org.id,
          automationId: automation.id,
          event: trigger,
          entityType: payload.entityType,
          entityId: payload.entityId,
          status: "FAILED",
          error: error instanceof Error ? error.message.slice(0, 500) : "Erro desconhecido",
        },
      });
    }
  }
}
