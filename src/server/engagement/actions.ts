"use server";

import type { RsvpStatus } from "@prisma/client";
import { z } from "zod";
import { AuthError, assertUser } from "@/server/auth/guards";
import { getSessionUser } from "@/server/auth/session";
import { ReportError, submitEventReport } from "@/server/engagement/report";
import { EngagementError, setFollow, setRsvp, setSaved } from "@/server/engagement/service";
import { requestMeta } from "@/server/request";
import { rateLimit, retryMessage } from "@/server/security/rate-limit";
import type { ActionState } from "@/lib/action";

/**
 * Server Actions de engajamento (finas): autenticação, limite de taxa e
 * validação aqui; regras de negócio em service.ts / report.ts.
 * Sem login, devolvem `fieldErrors.auth = "required"` para o cliente levar ao /entrar.
 */

const idSchema = z.string().trim().min(1).max(64);
const INVALID: ActionState<never> = { status: "error", message: "Pedido inválido. Atualize a página e tente de novo." };
const AUTH_REQUIRED: ActionState<never> = {
  status: "error",
  message: "Entre na sua conta para continuar.",
  fieldErrors: { auth: "required" },
};

async function engage<T>(fn: (userId: string) => Promise<T>): Promise<ActionState<T>> {
  try {
    const user = await assertUser();
    const rl = await rateLimit("engagement", `user:${user.id}`);
    if (!rl.allowed) return { status: "error", message: retryMessage(rl.retryAfterSeconds) };
    return { status: "success", data: await fn(user.id) };
  } catch (err) {
    if (err instanceof AuthError) return err.code === "UNAUTHENTICATED" ? AUTH_REQUIRED : { status: "error", message: err.message };
    if (err instanceof EngagementError) return { status: "error", message: err.message };
    console.error("[engagement]", err);
    return { status: "error", message: "Não foi possível concluir agora. Tente de novo em instantes." };
  }
}

export async function toggleSaveAction(eventId: string, saved: boolean): Promise<ActionState<{ saved: boolean; savesCount: number }>> {
  const parsed = z.object({ eventId: idSchema, saved: z.boolean() }).safeParse({ eventId, saved });
  if (!parsed.success) return INVALID;
  return engage((userId) => setSaved(userId, parsed.data.eventId, parsed.data.saved));
}

export async function setRsvpAction(
  eventId: string,
  status: RsvpStatus | null,
): Promise<ActionState<{ status: RsvpStatus | null; goingCount: number }>> {
  const parsed = z.object({ eventId: idSchema, status: z.enum(["GOING", "INTERESTED"]).nullable() }).safeParse({ eventId, status });
  if (!parsed.success) return INVALID;
  return engage((userId) => setRsvp(userId, parsed.data.eventId, parsed.data.status));
}

export async function toggleFollowAction(organizationId: string, follow: boolean): Promise<ActionState<{ following: boolean; followers: number }>> {
  const parsed = z.object({ organizationId: idSchema, follow: z.boolean() }).safeParse({ organizationId, follow });
  if (!parsed.success) return INVALID;
  return engage((userId) => setFollow(userId, parsed.data.organizationId, parsed.data.follow));
}

/** Denúncia de evento (funciona sem login: o visitante é identificado por hash do IP). */
export async function reportEventAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const [user, meta] = await Promise.all([getSessionUser(), requestMeta()]);
  try {
    const { duplicate } = await submitEventReport(
      { eventId: String(fd.get("eventId") ?? ""), reason: String(fd.get("reason") ?? ""), details: String(fd.get("details") ?? "") },
      { userId: user?.id ?? null, ip: meta.ip },
    );
    return {
      status: "success",
      message: duplicate
        ? "Já tínhamos recebido sua denúncia — atualizamos com as novas informações."
        : "Obrigado por avisar! Nossa equipe vai analisar e, se for o caso, tirar o evento do ar.",
    };
  } catch (err) {
    if (err instanceof ReportError) return { status: "error", message: err.message, fieldErrors: err.fieldErrors };
    console.error("[report]", err);
    return { status: "error", message: "Não foi possível enviar a denúncia agora. Tente de novo em instantes." };
  }
}
