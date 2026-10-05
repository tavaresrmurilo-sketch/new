import "server-only";
import type { InteractionChannel, Prisma } from "@prisma/client";
import type { TenantDb, TxClient } from "@/server/db/tenant";

export interface ActivityInput {
  action: string;
  title: string;
  entityType: string;
  entityId: string;
  body?: string | null;
  channel?: InteractionChannel | null;
  isInteraction?: boolean;
  clientId?: string | null;
  leadId?: string | null;
  opportunityId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}

/** Registra um item na timeline/feed de atividades do workspace. */
export async function logActivity(
  db: TenantDb | TxClient,
  actor: { organizationId: string; userId: string | null },
  input: ActivityInput,
) {
  return db.activity.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: input.action,
      title: input.title.slice(0, 300),
      body: input.body ?? null,
      channel: input.channel ?? null,
      isInteraction: input.isInteraction ?? false,
      entityType: input.entityType,
      entityId: input.entityId,
      clientId: input.clientId ?? null,
      leadId: input.leadId ?? null,
      opportunityId: input.opportunityId ?? null,
      projectId: input.projectId ?? null,
      taskId: input.taskId ?? null,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });
}
