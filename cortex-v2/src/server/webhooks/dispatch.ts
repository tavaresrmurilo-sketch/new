import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { WebhookEvent } from "@/lib/automation-catalog";
import { hasFeature } from "@/server/billing/feature-gate";
import { decryptSecret, hmacSign, randomToken } from "@/server/security/crypto";
import { assertPublicUrl } from "@/server/security/url-guard";
import type { OrgScope } from "@/server/scope";

export const MAX_WEBHOOK_ATTEMPTS = 6;
const BACKOFF_MINUTES = [1, 5, 30, 120, 720];

/** Cria as entregas para os webhooks inscritos no evento. A entrega acontece fora do fluxo da requisição. */
export async function enqueueWebhooks(scope: OrgScope, event: WebhookEvent, data: Record<string, unknown>): Promise<string[]> {
  if (!hasFeature(scope, "webhooks")) return [];
  const hooks = await scope.db.webhook.findMany({ where: { enabled: true, events: { has: event } }, select: { id: true } });
  const ids: string[] = [];
  for (const hook of hooks) {
    const delivery = await scope.db.webhookDelivery.create({
      data: {
        organizationId: scope.org.id,
        webhookId: hook.id,
        event,
        payload: { id: `evt_${randomToken(12)}`, event, createdAt: new Date().toISOString(), organizationId: scope.org.id, data } as Prisma.InputJsonValue,
        status: "PENDING",
        nextAttemptAt: new Date(),
      },
    });
    ids.push(delivery.id);
  }
  return ids;
}

/** Envia uma entrega (assinatura HMAC-SHA256: header X-Cortex-Signature: t=<unix>,v1=<hex>). */
export async function deliverWebhook(deliveryId: string) {
  const delivery = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { webhook: true } });
  if (!delivery || delivery.status === "SUCCESS" || !delivery.webhook.enabled) return;
  const body = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(Date.now() / 1000);
  let status: number | null = null;
  let responseBody: string | null = null;
  let error: string | null = null;
  try {
    await assertPublicUrl(delivery.webhook.url);
    const secret = decryptSecret(delivery.webhook.secretEncrypted);
    const res = await fetch(delivery.webhook.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "JR-Cortex-Webhooks/2.0",
        "X-Cortex-Event": delivery.event,
        "X-Cortex-Delivery": delivery.id,
        "X-Cortex-Signature": `t=${timestamp},v1=${hmacSign(secret, `${timestamp}.${body}`)}`,
      },
      body,
    });
    status = res.status;
    responseBody = (await res.text().catch(() => "")).slice(0, 1000);
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 300) : "Falha de rede";
  }
  const attempts = delivery.attempts + 1;
  const success = !error;
  const giveUp = !success && attempts >= MAX_WEBHOOK_ATTEMPTS;
  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      attempts,
      responseStatus: status,
      responseBody,
      error,
      status: success ? "SUCCESS" : giveUp ? "FAILED" : "PENDING",
      deliveredAt: success ? new Date() : null,
      nextAttemptAt: success || giveUp ? null : new Date(Date.now() + (BACKOFF_MINUTES[attempts - 1] ?? 720) * 60_000),
    },
  });
  await prisma.webhook.update({
    where: { id: delivery.webhookId },
    data: { lastDeliveryAt: new Date(), consecutiveFailures: success ? 0 : { increment: 1 } },
  });
  if (!success) logger.warn("webhook.delivery_failed", { deliveryId, attempts, error });
}

/** Rotina: reenvia entregas pendentes cujo horário de nova tentativa chegou. */
export async function retryPendingWebhooks(limit = 100) {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
    select: { id: true },
    take: limit,
    orderBy: { nextAttemptAt: "asc" },
  });
  for (const d of due) await deliverWebhook(d.id);
  return { processed: due.length };
}
