import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Modelos que pertencem a um tenant: toda operação recebe organizationId automaticamente. */
export const TENANT_MODELS = new Set<string>([
  "Lead", "Client", "Contact", "Pipeline", "PipelineStage", "Opportunity", "Activity",
  "Project", "ProjectMember", "Risk", "Task", "TaskComment", "Meeting", "Proposal", "ProposalItem",
  "Contract", "Receivable", "Document", "Tag", "TagAssignment", "Notification", "Decision",
  "MemoryFact", "SavedView", "Favorite", "MetricSnapshot", "RoiScenario", "ImportJob", "PortalAccess",
  "Automation", "AutomationExecution", "Playbook", "PlaybookStep", "PlaybookRun", "AIConversation",
  "AIMessage", "AIUsage", "Webhook", "WebhookDelivery", "ApiKey", "Role", "OrganizationMember", "Invitation",
]);

/** Modelos com lixeira: leituras ignoram registros com deletedAt, salvo quando o filtro é explícito. */
export const SOFT_DELETE_MODELS = new Set<string>([
  "Lead", "Client", "Contact", "Opportunity", "Project", "Risk", "Task", "TaskComment", "Meeting",
  "Proposal", "Contract", "Receivable", "Document", "MemoryFact", "Automation", "Playbook",
]);

const READ_OPERATIONS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy",
]);

type Args = Record<string, unknown> & { where?: Record<string, unknown>; data?: unknown };

function scopeWhere(model: string, operation: string, where: Record<string, unknown> | undefined, organizationId: string) {
  const scoped: Record<string, unknown> = { ...(where ?? {}), organizationId };
  if (SOFT_DELETE_MODELS.has(model) && READ_OPERATIONS.has(operation) && !(where && "deletedAt" in where)) {
    scoped.deletedAt = null;
  }
  return scoped;
}

function withOrg<T>(data: T, organizationId: string): T {
  return { ...(data as object), organizationId } as T;
}

/**
 * Cliente Prisma com isolamento de tenant (defesa em profundidade contra IDOR):
 * - leituras/atualizações/remoções recebem `organizationId` no where;
 * - criações têm `organizationId` forçado para o tenant atual (qualquer valor enviado é sobrescrito).
 * Relações aninhadas (include/nested create) não passam pela extensão: os serviços validam as FKs
 * recebidas com `assertOwned` antes de gravar.
 */
export function tenantDb(organizationId: string) {
  if (!organizationId) throw new Error("tenantDb requer organizationId");
  return prisma.$extends({
    name: "tenant-isolation",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const a = { ...((args ?? {}) as Args) };
          switch (operation) {
            case "create":
              a.data = withOrg(a.data, organizationId);
              break;
            case "createMany":
            case "createManyAndReturn":
              a.data = Array.isArray(a.data)
                ? a.data.map((d) => withOrg(d, organizationId))
                : withOrg(a.data, organizationId);
              break;
            case "upsert":
              a.where = { ...(a.where ?? {}), organizationId };
              a.create = withOrg(a.create, organizationId);
              break;
            default:
              a.where = scopeWhere(model, operation, a.where, organizationId);
          }
          return query(a as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
export type TxClient = Omit<TenantDb, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
export type { Prisma };
