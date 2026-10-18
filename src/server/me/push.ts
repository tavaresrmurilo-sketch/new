import "server-only";
import { prisma } from "@/server/db";
import type { PushSubscriptionInput } from "./schemas";

/** Máximo de dispositivos com push por conta (assinaturas antigas são descartadas). */
export const MAX_PUSH_DEVICES = 10;

/**
 * Registra (ou reatribui) a inscrição de push deste navegador à pessoa logada.
 * O endpoint é único: se o mesmo navegador já estava inscrito por outra conta,
 * a inscrição passa a ser desta conta (quem está no aparelho agora).
 */
export async function savePushSubscription(userId: string, input: PushSubscriptionInput, userAgent: string | null) {
  const sub = await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: { userId, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent: userAgent?.slice(0, 400) ?? null },
    update: { userId, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent: userAgent?.slice(0, 400) ?? null },
    select: { id: true },
  });

  const subs = await prisma.pushSubscription.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } });
  const stale = subs.slice(MAX_PUSH_DEVICES).map((s) => s.id);
  if (stale.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: stale }, userId } });

  // Quem ativa o push num aparelho quer recebê-lo.
  await prisma.user.update({ where: { id: userId }, data: { notifyPush: true } });
  return sub;
}

/** Remove a inscrição deste navegador — somente se pertencer à pessoa logada. */
export async function removePushSubscription(userId: string, endpoint: string): Promise<boolean> {
  const res = await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
  return res.count > 0;
}
