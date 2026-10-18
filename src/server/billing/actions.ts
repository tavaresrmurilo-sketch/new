"use server";

import { z } from "zod";
import { AuthError, assertUser } from "@/server/auth/guards";
import { rateLimit, retryMessage } from "@/server/security/rate-limit";
import type { ActionState } from "@/lib/action";
import { BillingError, openBillingPortal, startCheckout } from "./service";

const orgId = z.string().trim().min(1).max(64);
const checkoutSchema = z.object({
  organizationId: orgId,
  tier: z.enum(["PRO", "BUSINESS"], { error: "Escolha um plano válido." }),
  interval: z.enum(["month", "year"]).default("month"),
});

function failure(err: unknown, scope: string): ActionState<{ url: string }> {
  if (err instanceof BillingError || err instanceof AuthError) return { status: "error", message: err.message, fieldErrors: err instanceof BillingError ? { _code: err.code } : undefined };
  console.error(`[billing:${scope}]`, err);
  return { status: "error", message: "Não foi possível concluir agora. Tente de novo em instantes." };
}

/** Abre o Stripe Checkout. O cliente redireciona para `data.url`. */
export async function startCheckoutAction(_prev: ActionState<{ url: string }>, fd: FormData): Promise<ActionState<{ url: string }>> {
  try {
    const user = await assertUser();
    const rl = await rateLimit("checkout", `user:${user.id}`);
    if (!rl.allowed) return { status: "error", message: retryMessage(rl.retryAfterSeconds) };
    const parsed = checkoutSchema.safeParse({ organizationId: fd.get("organizationId"), tier: fd.get("tier"), interval: fd.get("interval") ?? undefined });
    if (!parsed.success) return { status: "error", message: "Pedido inválido. Atualize a página e tente de novo." };
    const { url } = await startCheckout(user, parsed.data.organizationId, parsed.data.tier, parsed.data.interval);
    return { status: "success", data: { url } };
  } catch (err) {
    return failure(err, "checkout");
  }
}

/** Abre o portal de cobrança do Stripe. */
export async function openPortalAction(_prev: ActionState<{ url: string }>, fd: FormData): Promise<ActionState<{ url: string }>> {
  try {
    const user = await assertUser();
    const rl = await rateLimit("checkout", `user:${user.id}`);
    if (!rl.allowed) return { status: "error", message: retryMessage(rl.retryAfterSeconds) };
    const parsed = orgId.safeParse(fd.get("organizationId"));
    if (!parsed.success) return { status: "error", message: "Pedido inválido. Atualize a página e tente de novo." };
    const { url } = await openBillingPortal(user.id, parsed.data);
    return { status: "success", data: { url } };
  } catch (err) {
    return failure(err, "portal");
  }
}
