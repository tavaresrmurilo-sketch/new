import "server-only";
import type { PlanTier } from "@prisma/client";
import type Stripe from "stripe";
import { audit } from "@/server/audit";
import { assertOrgRole } from "@/server/auth/guards";
import { prisma } from "@/server/db";
import { appUrl, integrations } from "@/server/env";
import { activeEventCount, boostsUsedThisMonth, getPlans } from "./plans";
import { getStripe } from "./stripe";
import { isEntitled } from "./sync";

export class BillingError extends Error {
  constructor(
    message: string,
    public code: "NOT_CONFIGURED" | "UNAVAILABLE" | "USE_PORTAL" | "NO_CUSTOMER" | "STRIPE" = "UNAVAILABLE",
  ) {
    super(message);
  }
}

export type BillingInterval = "month" | "year";

/** Dados da página /painel/plano (uso real da organização + configuração dos planos). */
export async function billingOverview(organizationId: string) {
  const [org, plans, subscription, activeEvents, members, venues, boostsUsed] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { id: true, name: true, plan: true, stripeCustomerId: true } }),
    getPlans(),
    prisma.subscription.findUnique({ where: { organizationId } }),
    activeEventCount(organizationId),
    prisma.membership.count({ where: { organizationId } }),
    prisma.venue.count({ where: { organizationId } }),
    boostsUsedThisMonth(organizationId),
  ]);
  const visiblePlans = plans.filter((p) => p.active || p.tier === org.plan);
  const current = plans.find((p) => p.tier === org.plan) ?? plans[0];
  const i = integrations();
  return {
    org,
    plans: visiblePlans,
    current,
    subscription,
    hasActiveSubscription: Boolean(subscription && isEntitled(subscription.status)),
    usage: { activeEvents, members, venues, boostsUsed },
    stripe: {
      enabled: i.stripe,
      webhook: i.stripeWebhook,
      portal: i.stripe && Boolean(org.stripeCustomerId),
      webhookUrl: appUrl("/api/billing/webhook"),
    },
  };
}

export type BillingOverview = Awaited<ReturnType<typeof billingOverview>>;

type StripeLike = Pick<Stripe, "customers" | "checkout" | "billingPortal">;

async function ensureCustomer(stripe: StripeLike, org: { id: string; name: string; contactEmail: string | null; stripeCustomerId: string | null }, fallbackEmail: string) {
  if (org.stripeCustomerId) return org.stripeCustomerId;
  const customer = await stripe.customers.create(
    { name: org.name, email: org.contactEmail ?? fallbackEmail, metadata: { organizationId: org.id }, preferred_locales: ["pt-BR"] },
    { idempotencyKey: `mixtour-customer-${org.id}` },
  );
  // Grava só se ainda estiver vazio (duas abas ao mesmo tempo não criam vínculos diferentes).
  const res = await prisma.organization.updateMany({ where: { id: org.id, stripeCustomerId: null }, data: { stripeCustomerId: customer.id } });
  if (res.count === 0) {
    const fresh = await prisma.organization.findUniqueOrThrow({ where: { id: org.id }, select: { stripeCustomerId: true } });
    return fresh.stripeCustomerId ?? customer.id;
  }
  return customer.id;
}

/** Cria a sessão do Stripe Checkout para assinar um plano pago. Somente OWNER/ADMIN. */
export async function startCheckout(
  actor: { id: string; email: string },
  organizationId: string,
  tier: PlanTier,
  interval: BillingInterval,
  stripe: StripeLike | null = getStripe(),
): Promise<{ url: string }> {
  await assertOrgRole(actor.id, organizationId, "ADMIN");
  if (!stripe) throw new BillingError("Pagamentos online ainda não estão configurados nesta instalação.", "NOT_CONFIGURED");
  if (tier === "FREE") throw new BillingError("O plano Gratuito não precisa de assinatura.");

  const plan = await prisma.plan.findUnique({ where: { tier } });
  if (!plan || !plan.active) throw new BillingError("Este plano não está disponível no momento.");
  const priceId = interval === "year" ? plan.stripePriceYearly : plan.stripePriceMonthly;
  if (!priceId) {
    throw new BillingError(
      interval === "year" ? `O plano ${plan.name} ainda não tem cobrança anual disponível.` : `O plano ${plan.name} ainda não está disponível para assinatura online.`,
    );
  }

  const [org, subscription] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { id: true, name: true, contactEmail: true, stripeCustomerId: true } }),
    prisma.subscription.findUnique({ where: { organizationId }, select: { status: true } }),
  ]);
  if (subscription && isEntitled(subscription.status)) {
    throw new BillingError("Sua organização já tem uma assinatura ativa. Para trocar de plano ou de forma de pagamento, use o portal de cobrança.", "USE_PORTAL");
  }

  try {
    const customer = await ensureCustomer(stripe, org, actor.email);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: organizationId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata: { organizationId, tier } },
      metadata: { organizationId, tier },
      allow_promotion_codes: true,
      locale: "pt-BR",
      success_url: appUrl("/painel/plano?checkout=sucesso"),
      cancel_url: appUrl("/painel/plano?checkout=cancelado"),
    });
    if (!session.url) throw new BillingError("O Stripe não retornou o endereço do checkout. Tente de novo.", "STRIPE");
    await audit({ actorId: actor.id, action: "billing.checkout_started", targetType: "Organization", targetId: organizationId, metadata: { tier, interval } });
    return { url: session.url };
  } catch (err) {
    if (err instanceof BillingError) throw err;
    console.error("[billing] checkout", err);
    throw new BillingError("Não foi possível abrir o pagamento agora. Tente de novo em instantes.", "STRIPE");
  }
}

/** Portal de cobrança do Stripe (trocar plano, cartão, cancelar, notas fiscais). Somente OWNER/ADMIN. */
export async function openBillingPortal(actorId: string, organizationId: string, stripe: StripeLike | null = getStripe()): Promise<{ url: string }> {
  await assertOrgRole(actorId, organizationId, "ADMIN");
  if (!stripe) throw new BillingError("Pagamentos online ainda não estão configurados nesta instalação.", "NOT_CONFIGURED");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { stripeCustomerId: true } });
  if (!org.stripeCustomerId) throw new BillingError("Esta organização ainda não tem cobrança no Stripe. Assine um plano para começar.", "NO_CUSTOMER");
  try {
    const session = await stripe.billingPortal.sessions.create({ customer: org.stripeCustomerId, return_url: appUrl("/painel/plano"), locale: "pt-BR" });
    await audit({ actorId, action: "billing.portal_opened", targetType: "Organization", targetId: organizationId });
    return { url: session.url };
  } catch (err) {
    console.error("[billing] portal", err);
    throw new BillingError("Não foi possível abrir o portal de cobrança agora. Tente de novo em instantes.", "STRIPE");
  }
}
