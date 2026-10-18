"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AuthError, assertUser } from "@/server/auth/guards";
import { destroySession } from "@/server/auth/session";
import { PlanLimitError } from "@/server/billing/plans";
import { setCurrentOrg } from "@/server/organizations/current";
import { requestMeta } from "@/server/request";
import { rateLimit, retryMessage } from "@/server/security/rate-limit";
import type { ActionState } from "@/lib/action";
import { emailSchema } from "@/lib/validation/auth";
import { fieldErrors } from "@/lib/validation/zod-errors";
import { acceptInvite, changeMemberRole, inviteMember, leaveOrganization, removeMember, resendInvite, revokeInvite, TeamError, transferOwnership } from "./service";

const id = z.string().trim().min(1).max(64);
const INVALID: ActionState = { status: "error", message: "Pedido inválido. Atualize a página e tente de novo." };

const inviteSchema = z.object({
  organizationId: id,
  email: emailSchema,
  role: z.enum(["ADMIN", "EDITOR"], { error: "Escolha um papel." }),
});
const tokenSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{10,200}$/);
const memberSchema = z.object({ organizationId: id, userId: id });
const roleSchema = memberSchema.extend({ role: z.enum(["ADMIN", "EDITOR"], { error: "Escolha um papel." }) });

function failure(err: unknown, scope: string): ActionState {
  if (err instanceof TeamError) return { status: "error", message: err.message, fieldErrors: err.fieldErrors };
  if (err instanceof PlanLimitError) return { status: "error", message: err.message, fieldErrors: { _code: "PLAN_LIMIT", _upgrade: err.upgradeTo ?? "" } };
  if (err instanceof AuthError) return { status: "error", message: err.message };
  console.error(`[team:${scope}]`, err);
  return { status: "error", message: "Não foi possível concluir agora. Tente de novo em instantes." };
}

async function actor(limit: "mutation" | "invite" = "mutation") {
  const user = await assertUser();
  const rl = await rateLimit(limit, `user:${user.id}`);
  if (!rl.allowed) throw new TeamError(retryMessage(rl.retryAfterSeconds));
  const { ip } = await requestMeta();
  return { user, ctx: { ip } };
}

function values(fd: FormData) {
  return Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
}

export async function inviteMemberAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { user, ctx } = await actor("invite");
    const parsed = inviteSchema.safeParse(values(fd));
    if (!parsed.success) return { status: "error", message: "Revise os campos destacados.", fieldErrors: fieldErrors(parsed.error) };
    const { organizationId, ...input } = parsed.data;
    await inviteMember(user.id, organizationId, input, ctx);
    revalidatePath("/painel/equipe");
    return { status: "success", message: `Convite enviado para ${input.email}.` };
  } catch (err) {
    return failure(err, "invite");
  }
}

export async function resendInviteAction(inviteId: string): Promise<ActionState> {
  const parsed = id.safeParse(inviteId);
  if (!parsed.success) return INVALID;
  try {
    const { user, ctx } = await actor("invite");
    const { invite } = await resendInvite(user.id, parsed.data, ctx);
    revalidatePath("/painel/equipe");
    return { status: "success", message: `Novo link enviado para ${invite.email}.` };
  } catch (err) {
    return failure(err, "resend");
  }
}

export async function revokeInviteAction(inviteId: string): Promise<ActionState> {
  const parsed = id.safeParse(inviteId);
  if (!parsed.success) return INVALID;
  try {
    const { user, ctx } = await actor();
    await revokeInvite(user.id, parsed.data, ctx);
    revalidatePath("/painel/equipe");
    return { status: "success", message: "Convite cancelado." };
  } catch (err) {
    return failure(err, "revoke");
  }
}

export async function changeRoleAction(input: { organizationId: string; userId: string; role: string }): Promise<ActionState> {
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  try {
    const { user, ctx } = await actor();
    await changeMemberRole(user.id, parsed.data.organizationId, parsed.data.userId, parsed.data.role, ctx);
    revalidatePath("/painel/equipe");
    return { status: "success", message: "Papel atualizado." };
  } catch (err) {
    return failure(err, "role");
  }
}

export async function transferOwnershipAction(input: { organizationId: string; userId: string }): Promise<ActionState> {
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  try {
    const { user, ctx } = await actor();
    await transferOwnership(user.id, parsed.data.organizationId, parsed.data.userId, ctx);
    revalidatePath("/painel", "layout");
    return { status: "success", message: "Propriedade transferida. Agora você é administrador(a)." };
  } catch (err) {
    return failure(err, "transfer");
  }
}

export async function removeMemberAction(input: { organizationId: string; userId: string }): Promise<ActionState> {
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  try {
    const { user, ctx } = await actor();
    await removeMember(user.id, parsed.data.organizationId, parsed.data.userId, ctx);
    revalidatePath("/painel/equipe");
    return { status: "success", message: "Pessoa removida da equipe." };
  } catch (err) {
    return failure(err, "remove");
  }
}

export async function leaveOrganizationAction(organizationId: string): Promise<ActionState> {
  const parsed = id.safeParse(organizationId);
  if (!parsed.success) return INVALID;
  try {
    const { user, ctx } = await actor();
    await leaveOrganization(user.id, parsed.data, ctx);
  } catch (err) {
    return failure(err, "leave");
  }
  revalidatePath("/painel", "layout");
  redirect("/painel");
}

/** Aceita o convite, define a organização atual e leva ao painel. */
export async function acceptInviteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const token = tokenSchema.safeParse(fd.get("token"));
  if (!token.success) return INVALID;
  try {
    const { user, ctx } = await actor("invite");
    const { organizationId } = await acceptInvite(user.id, token.data, ctx);
    await setCurrentOrg(user.id, organizationId);
  } catch (err) {
    return failure(err, "accept");
  }
  revalidatePath("/painel", "layout");
  redirect("/painel?bem-vindo=equipe");
}

/** Logado com outro e-mail: encerra a sessão e volta ao convite pelo login. */
export async function switchAccountForInviteAction(fd: FormData): Promise<void> {
  const token = tokenSchema.safeParse(fd.get("token"));
  await destroySession();
  redirect(token.success ? `/entrar?next=${encodeURIComponent(`/convite/${token.data}`)}` : "/entrar");
}
