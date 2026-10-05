import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export interface NotifyInput {
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** quando informado, a mesma notificação não é criada duas vezes para o usuário */
  dedupeKey?: string | null;
}

/** Cria uma notificação in-app. Idempotente por (userId, dedupeKey). Nunca envia mensagens externas. */
export async function notify(input: NotifyInput) {
  try {
    if (input.dedupeKey) {
      return await prisma.notification.upsert({
        where: { userId_dedupeKey: { userId: input.userId, dedupeKey: input.dedupeKey } },
        create: { ...input, body: input.body ?? null, link: input.link ?? null },
        update: {},
      });
    }
    return await prisma.notification.create({ data: { ...input, body: input.body ?? null, link: input.link ?? null } });
  } catch (error) {
    logger.error("notification.create_failed", { error, type: input.type });
    return null;
  }
}

export async function notifyMany(userIds: (string | null | undefined)[], input: Omit<NotifyInput, "userId">) {
  const unique = [...new Set(userIds.filter((u): u is string => Boolean(u)))];
  await Promise.all(unique.map((userId) => notify({ ...input, userId })));
}

/** Usuários com determinado papel-chave no workspace (ex.: gestores para alertas de risco). */
export async function orgManagers(organizationId: string): Promise<string[]> {
  const members = await prisma.organizationMember.findMany({
    where: { organizationId, status: "ACTIVE", role: { key: { in: ["OWNER", "ADMIN", "MANAGER"] } } },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}
