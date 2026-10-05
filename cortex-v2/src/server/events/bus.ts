import "server-only";
import { after } from "next/server";
import type { AutomationTrigger, WebhookEvent } from "@/lib/automation-catalog";
import { logger } from "@/lib/logger";
import { runAutomations, type EventPayload } from "@/server/automations/engine";
import { deliverWebhook, enqueueWebhooks } from "@/server/webhooks/dispatch";
import type { OrgScope } from "@/server/scope";

/** Mapeia eventos internos para os eventos públicos de webhook. */
const WEBHOOK_MAP: Partial<Record<AutomationTrigger | "lead.updated" | "proposal.created", WebhookEvent[]>> = {
  "lead.created": ["lead.created"],
  "lead.updated": ["lead.updated"],
  "opportunity.created": ["deal.created"],
  "opportunity.stage_changed": ["deal.stage_changed"],
  "proposal.created": ["proposal.created"],
  "proposal.accepted": ["proposal.accepted"],
  "project.created": ["project.created"],
  "task.completed": ["task.completed"],
  "contract.expiring": ["contract.expiring"],
};

function schedule(fn: () => Promise<void>) {
  try {
    after(fn);
  } catch {
    // fora de uma requisição (jobs/testes): executa sem bloquear
    void fn().catch((error) => logger.error("event.async_failed", { error }));
  }
}

/**
 * Publica um evento de domínio: executa automações (WHEN/IF/THEN) e enfileira webhooks.
 * Erros aqui nunca desfazem a operação que gerou o evento.
 */
export async function emitEvent(
  scope: OrgScope,
  event: AutomationTrigger | "lead.updated" | "proposal.created",
  payload: EventPayload,
  publicData?: Record<string, unknown>,
) {
  try {
    if (event !== "lead.updated" && event !== "proposal.created") await runAutomations(scope, event, payload);
  } catch (error) {
    logger.error("event.automations_failed", { event, error });
  }
  const webhookEvents = WEBHOOK_MAP[event] ?? [];
  if (!webhookEvents.length) return;
  try {
    const data = publicData ?? { id: payload.entityId, type: payload.entityType, ...payload.fields };
    const deliveryIds = (await Promise.all(webhookEvents.map((e) => enqueueWebhooks(scope, e, data)))).flat();
    if (deliveryIds.length) schedule(async () => {
      for (const id of deliveryIds) await deliverWebhook(id);
    });
  } catch (error) {
    logger.error("event.webhooks_failed", { event, error });
  }
}
