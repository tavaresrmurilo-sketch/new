"use server";

import type { EventStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AuthError, assertUser } from "@/server/auth/guards";
import { PlanLimitError } from "@/server/billing/plans";
import { OrgError } from "@/server/organizations/service";
import { requestMeta } from "@/server/request";
import { rateLimit, retryMessage } from "@/server/security/rate-limit";
import type { ActionState } from "@/lib/action";
import { cancelEventSchema, eventDraftSchema, eventPublishSchema } from "@/lib/validation/event";
import { fieldErrors } from "@/lib/validation/zod-errors";
import {
  boostEvent,
  cancelEvent,
  createEvent,
  deleteEvent,
  duplicateEvent,
  EventError,
  publishEvent,
  updateEvent,
  withdrawEvent,
} from "./service";

/**
 * Server Actions do painel (finas): sessão, limite de taxa e validação aqui;
 * regras de negócio e autorização por organização em service.ts.
 */

const idSchema = z.string().trim().min(1).max(64);
const INVALID: ActionState<never> = { status: "error", message: "Pedido inválido. Atualize a página e tente de novo." };

function failure(err: unknown, scope: string): ActionState<never> {
  if (err instanceof EventError) return { status: "error", message: err.message, fieldErrors: { ...err.fieldErrors, _code: err.code } };
  if (err instanceof PlanLimitError) return { status: "error", message: err.message, fieldErrors: { _code: "PLAN_LIMIT", _upgrade: err.upgradeTo ?? "" } };
  if (err instanceof OrgError) return { status: "error", message: err.message, fieldErrors: err.fieldErrors };
  if (err instanceof AuthError) return { status: "error", message: err.message };
  console.error(`[events:${scope}]`, err);
  return { status: "error", message: "Não foi possível concluir agora. Tente de novo em instantes." };
}

async function actor() {
  const user = await assertUser();
  const rl = await rateLimit("mutation", `user:${user.id}`);
  if (!rl.allowed) throw new EventError(retryMessage(rl.retryAfterSeconds), "INVALID");
  return user;
}

async function revalidateEvent(eventId: string) {
  revalidatePath("/painel", "layout");
  const e = await prisma.event.findUnique({ where: { id: eventId }, select: { slug: true, organization: { select: { slug: true } } } });
  if (e) {
    revalidatePath(`/evento/${e.slug}`);
    revalidatePath(`/organizador/${e.organization.slug}`);
  }
}

const saveInput = z.object({
  eventId: idSchema.optional(),
  organizationId: idSchema.optional(),
  intent: z.enum(["draft", "publish", "save"]),
  values: z.record(z.string(), z.unknown()),
});

export type SaveEventResult = { eventId: string; status: EventStatus; notified: number };

/**
 * Salva o editor. intent:
 * - "draft": salva como está (rascunho/recusado);
 * - "save": salva evento no ar/em análise (exige completude);
 * - "publish": salva e publica/envia para análise.
 */
export async function saveEventAction(input: unknown): Promise<ActionState<SaveEventResult>> {
  const parsedInput = saveInput.safeParse(input);
  if (!parsedInput.success) return INVALID;
  const { eventId, organizationId, intent, values } = parsedInput.data;
  try {
    const user = await actor();
    const schema = intent === "publish" ? eventPublishSchema : eventDraftSchema;
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      return { status: "error", message: "Revise os campos destacados.", fieldErrors: fieldErrors(parsed.error) };
    }
    const meta = await requestMeta();

    let id: string;
    let status: EventStatus;
    let notified = 0;
    if (eventId) {
      const res = await updateEvent(user.id, eventId, parsed.data);
      id = res.event.id;
      status = res.event.status;
      notified = res.notified;
    } else {
      if (!organizationId) return INVALID;
      const created = await createEvent(user.id, organizationId, parsed.data);
      id = created.id;
      status = created.status;
    }

    if (intent === "publish" && (status === "DRAFT" || status === "REJECTED")) {
      try {
        const res = await publishEvent(user.id, id, new Date(), meta);
        status = res.status;
        notified += res.notified;
      } catch (err) {
        // O rascunho foi salvo; devolvemos o id para o editor não perder o vínculo.
        await revalidateEvent(id);
        const f = failure(err, "publish");
        return { status: "error", message: f.status === "error" ? f.message : "Não foi possível publicar.", fieldErrors: { ...(f.status === "error" ? f.fieldErrors : {}), _eventId: id } };
      }
    }
    await revalidateEvent(id);
    const message =
      intent === "publish"
        ? status === "PUBLISHED"
          ? "Evento publicado! Ele já aparece no mapa."
          : "Enviado para análise. Avisaremos você assim que for aprovado."
        : status === "PUBLISHED"
          ? notified
            ? `Alterações salvas. Avisamos ${notified} ${notified === 1 ? "pessoa" : "pessoas"} sobre a mudança.`
            : "Alterações salvas."
          : "Rascunho salvo.";
    return { status: "success", message, data: { eventId: id, status, notified } };
  } catch (err) {
    return failure(err, "save");
  }
}

export async function publishEventAction(eventId: string): Promise<ActionState<{ status: EventStatus }>> {
  const id = idSchema.safeParse(eventId);
  if (!id.success) return INVALID;
  try {
    const user = await actor();
    const res = await publishEvent(user.id, id.data, new Date(), await requestMeta());
    await revalidateEvent(id.data);
    return {
      status: "success",
      message: res.status === "PUBLISHED" ? "Evento publicado! Ele já aparece no mapa." : "Enviado para análise. Avisaremos você assim que for aprovado.",
      data: { status: res.status },
    };
  } catch (err) {
    return failure(err, "publish");
  }
}

export async function cancelEventAction(eventId: string, reason?: string): Promise<ActionState<{ notified: number }>> {
  const parsed = cancelEventSchema.safeParse({ eventId, reason });
  if (!parsed.success) return { status: "error", message: "Revise o motivo.", fieldErrors: fieldErrors(parsed.error) };
  try {
    const user = await actor();
    const res = await cancelEvent(user.id, parsed.data.eventId, parsed.data.reason, new Date(), await requestMeta());
    await revalidateEvent(parsed.data.eventId);
    return {
      status: "success",
      message: res.notified ? `Evento cancelado. Avisamos ${res.notified} ${res.notified === 1 ? "pessoa" : "pessoas"}.` : "Evento cancelado.",
      data: res,
    };
  } catch (err) {
    return failure(err, "cancel");
  }
}

export async function deleteEventAction(eventId: string): Promise<ActionState> {
  const id = idSchema.safeParse(eventId);
  if (!id.success) return INVALID;
  try {
    const user = await actor();
    await deleteEvent(user.id, id.data, await requestMeta());
    revalidatePath("/painel", "layout");
    return { status: "success", message: "Evento excluído." };
  } catch (err) {
    return failure(err, "delete");
  }
}

export async function duplicateEventAction(eventId: string): Promise<ActionState<{ eventId: string }>> {
  const id = idSchema.safeParse(eventId);
  if (!id.success) return INVALID;
  try {
    const user = await actor();
    const copy = await duplicateEvent(user.id, id.data);
    revalidatePath("/painel", "layout");
    return { status: "success", message: "Cópia criada como rascunho. Defina as novas datas.", data: { eventId: copy.id } };
  } catch (err) {
    return failure(err, "duplicate");
  }
}

export async function boostEventAction(eventId: string): Promise<ActionState<{ featuredUntil: string; used: number; limit: number }>> {
  const id = idSchema.safeParse(eventId);
  if (!id.success) return INVALID;
  try {
    const user = await actor();
    const res = await boostEvent(user.id, id.data, new Date(), await requestMeta());
    await revalidateEvent(id.data);
    return {
      status: "success",
      message: `Destaque ativado. Você usou ${res.used} de ${res.limit} destaques deste mês.`,
      data: { featuredUntil: res.featuredUntil.toISOString(), used: res.used, limit: res.limit },
    };
  } catch (err) {
    return failure(err, "boost");
  }
}

export async function withdrawEventAction(eventId: string): Promise<ActionState> {
  const id = idSchema.safeParse(eventId);
  if (!id.success) return INVALID;
  try {
    const user = await actor();
    await withdrawEvent(user.id, id.data);
    revalidatePath("/painel", "layout");
    return { status: "success", message: "Evento retirado da análise e salvo como rascunho." };
  } catch (err) {
    return failure(err, "withdraw");
  }
}
