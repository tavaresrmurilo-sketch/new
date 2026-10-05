import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requestInfo } from "@/server/request";

type Actor = {
  user: { id: string; email: string; isSuperAdmin?: boolean };
  org?: { id: string } | null;
  support?: { reason: string | null } | null;
};

/**
 * Log de auditoria de ações sensíveis (login, permissões, exclusões, alterações financeiras,
 * configurações, plano, modo suporte). Nunca grava senhas ou segredos.
 */
export async function audit(
  actor: Actor | null,
  action: string,
  opts: { organizationId?: string | null; entityType?: string; entityId?: string; metadata?: Record<string, unknown> } = {},
) {
  try {
    const { ip, userAgent } = await requestInfo();
    await prisma.auditLog.create({
      data: {
        organizationId: opts.organizationId !== undefined ? opts.organizationId : (actor?.org?.id ?? null),
        actorId: actor?.user.id ?? null,
        actorEmail: actor?.user.email ?? null,
        impersonatorId: actor?.support ? actor.user.id : null,
        action,
        entityType: opts.entityType,
        entityId: opts.entityId,
        metadata: opts.metadata as Prisma.InputJsonValue | undefined,
        ip,
        userAgent,
      },
    });
  } catch (error) {
    logger.error("audit.write_failed", { action, error });
  }
}
