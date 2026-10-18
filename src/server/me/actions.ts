"use server";

import type { RsvpStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/server/audit";
import { AuthError, assertUser } from "@/server/auth/guards";
import type { SessionUser } from "@/server/auth/session";
import { EngagementError, setFollow, setRsvp, setSaved } from "@/server/engagement/service";
import { requestMeta } from "@/server/request";
import { rateLimit, retryMessage, type LimitName } from "@/server/security/rate-limit";
import type { ActionState } from "@/lib/action";
import { fieldErrors } from "@/lib/validation/zod-errors";
import { preferenceKeySchema, profileSchema } from "./schemas";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  MeError,
  revokeOtherSessions,
  revokeSession,
  setAvatar,
  setPreference,
  updateProfile,
  type NotificationItem,
} from "./service";

/**
 * Server Actions da área do explorador (finas): sessão, limite de taxa e
 * validação aqui; regras em agenda.ts / service.ts e no serviço
 * de engajamento (contadores). O usuário vem SEMPRE da sessão.
 * Exportação e exclusão da conta: /api/me/export e /api/me/delete.
 */

const idSchema = z.string().trim().min(1).max(64);
const INVALID: ActionState<never> = { status: "error", message: "Pedido inválido. Atualize a página e tente de novo." };
const GENERIC: ActionState<never> = { status: "error", message: "Não foi possível concluir agora. Tente de novo em instantes." };

async function run<T>(limit: LimitName, fn: (user: SessionUser) => Promise<ActionState<T>>): Promise<ActionState<T>> {
  try {
    const user = await assertUser();
    const rl = await rateLimit(limit, limit === "engagement" ? `user:${user.id}` : `me:${user.id}`);
    if (!rl.allowed) return { status: "error", message: retryMessage(rl.retryAfterSeconds) };
    return await fn(user);
  } catch (err) {
    if (err instanceof AuthError) return { status: "error", message: err.message, fieldErrors: err.code === "UNAUTHENTICATED" ? { auth: "required" } : undefined };
    if (err instanceof EngagementError || err instanceof MeError) return { status: "error", message: err.message, fieldErrors: err instanceof MeError ? err.fieldErrors : undefined };
    console.error("[me]", err);
    return GENERIC;
  }
}

function form(fd: FormData) {
  return Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
}

// ─────────────────────────────────────────────────────────────
// Agenda (usa o serviço de engajamento: contadores consistentes)
// ─────────────────────────────────────────────────────────────

export async function agendaRsvpAction(eventId: string, status: RsvpStatus | null): Promise<ActionState<{ status: RsvpStatus | null }>> {
  const parsed = z.object({ eventId: idSchema, status: z.enum(["GOING", "INTERESTED"]).nullable() }).safeParse({ eventId, status });
  if (!parsed.success) return INVALID;
  return run("engagement", async (user) => {
    const res = await setRsvp(user.id, parsed.data.eventId, parsed.data.status);
    revalidatePath("/salvos");
    return { status: "success", data: { status: res.status } };
  });
}

export async function agendaSaveAction(eventId: string, saved: boolean): Promise<ActionState<{ saved: boolean }>> {
  const parsed = z.object({ eventId: idSchema, saved: z.boolean() }).safeParse({ eventId, saved });
  if (!parsed.success) return INVALID;
  return run("engagement", async (user) => {
    const res = await setSaved(user.id, parsed.data.eventId, parsed.data.saved);
    revalidatePath("/salvos");
    return { status: "success", data: { saved: res.saved } };
  });
}

export async function agendaFollowAction(organizationId: string, follow: boolean): Promise<ActionState<{ following: boolean }>> {
  const parsed = z.object({ organizationId: idSchema, follow: z.boolean() }).safeParse({ organizationId, follow });
  if (!parsed.success) return INVALID;
  return run("engagement", async (user) => {
    const res = await setFollow(user.id, parsed.data.organizationId, parsed.data.follow);
    revalidatePath("/salvos");
    return { status: "success", data: { following: res.following } };
  });
}

// ─────────────────────────────────────────────────────────────
// Notificações
// ─────────────────────────────────────────────────────────────

/** Marca como lida e devolve o destino (somente caminhos internos). */
export async function openNotificationAction(id: string): Promise<ActionState<{ url: string | null }>> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return INVALID;
  return run("engagement", async (user) => {
    const res = await markNotificationRead(user.id, parsed.data);
    if (!res) return { status: "error", message: "Notificação não encontrada." };
    revalidatePath("/", "layout");
    return { status: "success", data: { url: res.url } };
  });
}

export async function markAllNotificationsReadAction(): Promise<ActionState<{ count: number }>> {
  return run("mutation", async (user) => {
    const count = await markAllNotificationsRead(user.id);
    revalidatePath("/", "layout");
    return { status: "success", message: count ? "Tudo em dia por aqui." : undefined, data: { count } };
  });
}

export async function loadMoreNotificationsAction(before: string): Promise<ActionState<{ items: NotificationItem[]; nextCursor: string | null }>> {
  const parsed = idSchema.safeParse(before);
  if (!parsed.success) return INVALID;
  return run("publicApi", async (user) => ({ status: "success", data: await listNotifications(user.id, { before: parsed.data }) }));
}

// ─────────────────────────────────────────────────────────────
// Perfil, foto e preferências
// ─────────────────────────────────────────────────────────────

export async function updateProfileAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = profileSchema.safeParse({
    ...form(fd),
    favoriteCategories: fd.getAll("favoriteCategories").filter((v): v is string => typeof v === "string"),
  });
  if (!parsed.success) return { status: "error", message: "Revise os campos destacados.", fieldErrors: fieldErrors(parsed.error) };
  return run("mutation", async (user) => {
    await updateProfile(user.id, parsed.data);
    revalidatePath("/", "layout");
    return { status: "success", message: "Perfil atualizado." };
  });
}

export async function setAvatarAction(url: string | null): Promise<ActionState<{ avatarUrl: string | null }>> {
  const parsed = z.string().trim().min(1).max(500).nullable().safeParse(url);
  if (!parsed.success) return INVALID;
  return run("mutation", async (user) => {
    const res = await setAvatar(user.id, parsed.data);
    revalidatePath("/", "layout");
    return { status: "success", message: parsed.data ? "Foto atualizada." : "Foto removida.", data: res };
  });
}

export async function setPreferenceAction(key: string, value: boolean): Promise<ActionState<{ notifyEmail: boolean; notifyPush: boolean; marketingOptIn: boolean }>> {
  const parsed = z.object({ key: preferenceKeySchema, value: z.boolean() }).safeParse({ key, value });
  if (!parsed.success) return INVALID;
  return run("mutation", async (user) => {
    const prefs = await setPreference(user.id, parsed.data.key, parsed.data.value);
    revalidatePath("/perfil/notificacoes");
    return { status: "success", data: prefs };
  });
}

// ─────────────────────────────────────────────────────────────
// Sessões
// ─────────────────────────────────────────────────────────────

export async function revokeSessionAction(sessionId: string): Promise<ActionState> {
  const parsed = idSchema.safeParse(sessionId);
  if (!parsed.success) return INVALID;
  return run("mutation", async (user) => {
    const ok = await revokeSession(user.id, parsed.data, user.sessionId);
    if (!ok) return { status: "error", message: "Essa sessão já tinha sido encerrada." };
    const meta = await requestMeta();
    await audit({ actorId: user.id, action: "user.session_revoked", targetType: "Session", targetId: parsed.data, ip: meta.ip });
    revalidatePath("/perfil/conta");
    return { status: "success", message: "Sessão encerrada." };
  });
}

export async function revokeOtherSessionsAction(): Promise<ActionState<{ count: number }>> {
  return run("mutation", async (user) => {
    const count = await revokeOtherSessions(user.id, user.sessionId);
    const meta = await requestMeta();
    await audit({ actorId: user.id, action: "user.sessions_revoked", targetType: "User", targetId: user.id, metadata: { count }, ip: meta.ip });
    revalidatePath("/perfil/conta");
    return {
      status: "success",
      message: count ? (count === 1 ? "1 sessão encerrada." : `${count} sessões encerradas.`) : "Não havia outras sessões abertas.",
      data: { count },
    };
  });
}
