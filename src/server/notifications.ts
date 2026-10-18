import "server-only";
import webpush from "web-push";
import type { NotificationType } from "@prisma/client";
import { prisma } from "@/server/db";
import { sendEmail, type EmailMessage } from "@/server/email";
import { env, integrations } from "@/server/env";
import { sendNativePush } from "@/server/push/native";

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string;
  url?: string;
}

let vapidReady = false;
function ensureVapid() {
  if (vapidReady || !integrations().push) return integrations().push;
  const e = env();
  webpush.setVapidDetails(e.VAPID_SUBJECT ?? "mailto:contato@mixtour.app", e.VAPID_PUBLIC_KEY!, e.VAPID_PRIVATE_KEY!);
  vapidReady = true;
  return true;
}

/**
 * Notifica um usuário: sempre in-app; por e-mail e push conforme preferências
 * do usuário e integrações configuradas.
 */
export async function notify(userId: string, input: NotifyInput, opts: { email?: EmailMessage; push?: boolean } = {}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, status: true, notifyEmail: true, notifyPush: true, emailVerifiedAt: true },
  });
  if (!user || user.status !== "ACTIVE") return null;

  const notification = await prisma.notification.create({
    data: { userId, type: input.type, title: input.title.slice(0, 160), body: input.body?.slice(0, 500), url: input.url },
  });

  if (opts.email && user.notifyEmail) {
    await sendEmail(user.email, opts.email).catch((err) => console.error("[notify] e-mail", err));
  }
  if (opts.push !== false && user.notifyPush) {
    const payload = { title: input.title, body: input.body ?? "", url: input.url ?? "/notificacoes" };
    await Promise.all([
      sendPush(userId, payload).catch((err) => console.error("[notify] web push", err)),
      sendNativePush(userId, payload).catch((err) => console.error("[notify] push nativo", err)),
    ]);
  }
  return notification;
}

export async function sendPush(userId: string, payload: { title: string; body: string; url: string }) {
  if (!ensureVapid()) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 12 },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
      }
    }),
  );
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
