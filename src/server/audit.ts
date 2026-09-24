import type { AuditResult, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requestInfo } from "./request";

export interface AuditActor {
  tenantId: string | null;
  userId: string | null;
  userEmail: string | null;
}

export interface AuditEntry {
  action: string;
  resource: string;
  resourceId?: string | null;
  result?: AuditResult;
  metadata?: Prisma.InputJsonValue;
}

/** Registra evento no Audit Log. Falhas de auditoria nunca derrubam a operação, mas são logadas. */
export async function audit(actor: AuditActor, entry: AuditEntry): Promise<void> {
  const info = await requestInfo();
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        userId: actor.userId,
        userEmail: actor.userEmail,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId ?? null,
        result: entry.result ?? "SUCCESS",
        metadata: entry.metadata ?? {},
        ip: info.ip,
        userAgent: info.userAgent,
      },
    });
  } catch (err) {
    logger.error("audit.write_failed", { action: entry.action, err: String(err) });
  }
}
