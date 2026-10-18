import "server-only";
import type { Plan, PlanTier, Prisma, SubscriptionStatus } from "@prisma/client";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { notify } from "@/server/notifications";

/**
 * Sincronização de assinaturas Stripe → banco do Mixtour.
 * As funções puras (sem banco) ficam no topo para serem testadas isoladamente.
 */

/** Formato mínimo de uma assinatura do Stripe (compatível com `Stripe.Subscription` antigas e novas). */
export interface SubscriptionLike {
  id: string;
  status: string;
  customer: string | { id: string } | null;
  metadata?: Record<string, string> | null;
  cancel_at_period_end?: boolean | null;
  cancel_at?: number | null;
  /** Versões antigas da API: no objeto da assinatura. */
  current_period_end?: number | null;
  items?: {
    data: Array<{
      price: { id: string; recurring?: { interval: string } | null };
      /** Versões recentes da API: em cada item. */
      current_period_end?: number | null;
    }>;
  } | null;
}

const STATUS_MAP: Record<string, SubscriptionStatus> = {
  trialing: "TRIALING",
  active: "ACTIVE",
  past_due: "PAST_DUE",
  canceled: "CANCELED",
  incomplete: "INCOMPLETE",
  incomplete_expired: "INCOMPLETE_EXPIRED",
  unpaid: "UNPAID",
  paused: "PAUSED",
};

/** Status que mantêm os recursos do plano pago (em atraso ainda tem carência). */
export const ENTITLED_STATUSES: readonly SubscriptionStatus[] = ["ACTIVE", "TRIALING", "PAST_DUE"];

export function isEntitled(status: SubscriptionStatus): boolean {
  return ENTITLED_STATUSES.includes(status);
}

export function mapStripeStatus(status: string): SubscriptionStatus {
  // Status desconhecido (versão futura da API) não concede recursos.
  return STATUS_MAP[status] ?? "INCOMPLETE";
}

function toDate(seconds: number | null | undefined): Date | null {
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
}

/** Fim do período atual: no objeto (API antiga) ou nos itens (API atual — usa o maior). */
export function subscriptionPeriodEnd(sub: Pick<SubscriptionLike, "current_period_end" | "items">): Date | null {
  const top = toDate(sub.current_period_end);
  if (top) return top;
  const ends = (sub.items?.data ?? []).map((i) => i.current_period_end).filter((v): v is number => typeof v === "number" && v > 0);
  return ends.length ? toDate(Math.max(...ends)) : null;
}

const PAID_TIERS: readonly PlanTier[] = ["PRO", "BUSINESS"];

/** Plano pelo id do preço (tabela Plan) e, na falta, pelo metadata gravado no checkout. */
export function resolveTier(
  priceId: string | null | undefined,
  plans: Pick<Plan, "tier" | "stripePriceMonthly" | "stripePriceYearly">[],
  metadataTier?: string | null,
): PlanTier | null {
  if (priceId) {
    const match = plans.find((p) => p.stripePriceMonthly === priceId || p.stripePriceYearly === priceId);
    if (match) return match.tier;
  }
  const meta = metadataTier?.toUpperCase();
  return meta && (PAID_TIERS as readonly string[]).includes(meta) ? (meta as PlanTier) : null;
}

/** Plano efetivo da organização para um status de assinatura. */
export function effectivePlan(status: SubscriptionStatus, tier: PlanTier | null): PlanTier {
  return tier && isEntitled(status) ? tier : "FREE";
}

export function customerIdOf(sub: Pick<SubscriptionLike, "customer">): string | null {
  if (!sub.customer) return null;
  return typeof sub.customer === "string" ? sub.customer : sub.customer.id;
}

export interface SubscriptionSnapshot {
  stripeSubscriptionId: string;
  stripePriceId: string;
  customerId: string | null;
  organizationId: string | null;
  tier: PlanTier | null;
  status: SubscriptionStatus;
  interval: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

/** Converte a assinatura do Stripe no formato do banco (puro). */
export function snapshotSubscription(
  sub: SubscriptionLike,
  plans: Pick<Plan, "tier" | "stripePriceMonthly" | "stripePriceYearly">[],
): SubscriptionSnapshot {
  const item = sub.items?.data?.[0];
  const priceId = item?.price.id ?? "";
  return {
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
    customerId: customerIdOf(sub),
    organizationId: sub.metadata?.organizationId?.trim() || null,
    tier: resolveTier(priceId, plans, sub.metadata?.tier),
    status: mapStripeStatus(sub.status),
    interval: item?.price.recurring?.interval === "year" ? "year" : "month",
    currentPeriodEnd: subscriptionPeriodEnd(sub),
    // APIs recentes agendam o cancelamento com `cancel_at` em vez de `cancel_at_period_end`.
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end) || (typeof sub.cancel_at === "number" && sub.cancel_at > 0 && sub.status !== "canceled"),
  };
}

// ─────────────────────────────────────────────────────────────
// Banco
// ─────────────────────────────────────────────────────────────

export type SyncResult =
  | { status: "synced"; organizationId: string; plan: PlanTier; previousPlan: PlanTier; changed: boolean }
  | { status: "ignored"; reason: "org_not_found" | "superseded" };

const PLAN_NAMES: Record<PlanTier, string> = { FREE: "Gratuito", PRO: "Pro", BUSINESS: "Business" };

/**
 * Grava a assinatura e ajusta `Organization.plan`.
 * A organização vem do metadata da assinatura, da dica (client_reference_id do checkout)
 * ou do cliente Stripe já vinculado.
 */
export async function syncSubscription(sub: SubscriptionLike, opts: { organizationIdHint?: string | null } = {}): Promise<SyncResult> {
  const plans = await prisma.plan.findMany({ select: { tier: true, name: true, stripePriceMonthly: true, stripePriceYearly: true } });
  const snap = snapshotSubscription(sub, plans);

  const org = await findOrganization([snap.organizationId, opts.organizationIdHint ?? null], snap.customerId);
  if (!org) {
    console.warn("[billing] assinatura sem organização correspondente", sub.id);
    return { status: "ignored", reason: "org_not_found" };
  }

  const existing = await prisma.subscription.findUnique({ where: { organizationId: org.id } });
  // Outra assinatura vigente da mesma organização: um evento de uma assinatura antiga
  // (abandonada ou cancelada) não pode derrubar o plano atual.
  if (existing && existing.stripeSubscriptionId !== snap.stripeSubscriptionId && isEntitled(existing.status) && !isEntitled(snap.status)) {
    return { status: "ignored", reason: "superseded" };
  }

  const tier = snap.tier ?? (existing?.stripeSubscriptionId === snap.stripeSubscriptionId ? existing.tier : null);
  if (!tier && isEntitled(snap.status)) {
    console.warn("[billing] preço sem plano correspondente — confira os IDs de preço em /admin", snap.stripePriceId);
  }
  const plan = effectivePlan(snap.status, tier);

  const data = {
    stripeSubscriptionId: snap.stripeSubscriptionId,
    stripePriceId: snap.stripePriceId,
    tier: tier ?? "FREE",
    status: snap.status,
    interval: snap.interval,
    currentPeriodEnd: snap.currentPeriodEnd,
    cancelAtPeriodEnd: snap.cancelAtPeriodEnd,
  } satisfies Omit<Prisma.SubscriptionUncheckedCreateInput, "organizationId">;

  const orgUpdate: Prisma.OrganizationUpdateInput = { plan };
  if (!org.stripeCustomerId && snap.customerId) {
    const taken = await prisma.organization.findUnique({ where: { stripeCustomerId: snap.customerId }, select: { id: true } });
    if (!taken) orgUpdate.stripeCustomerId = snap.customerId;
  }

  await prisma.$transaction([
    // Remove um registro antigo que ocupe o mesmo stripeSubscriptionId em outra organização (não deveria existir).
    prisma.subscription.deleteMany({ where: { stripeSubscriptionId: snap.stripeSubscriptionId, organizationId: { not: org.id } } }),
    prisma.subscription.upsert({ where: { organizationId: org.id }, create: { organizationId: org.id, ...data }, update: data }),
    prisma.organization.update({ where: { id: org.id }, data: orgUpdate }),
  ]);

  const changed = org.plan !== plan;
  if (changed) {
    await audit({
      action: "billing.plan_changed",
      targetType: "Organization",
      targetId: org.id,
      metadata: { from: org.plan, to: plan, subscriptionStatus: snap.status, stripeSubscriptionId: snap.stripeSubscriptionId, source: "stripe" },
    });
    await notifyManagers(org.id, {
      title: plan === "FREE" ? "Sua organização voltou ao plano Gratuito" : `Plano ${PLAN_NAMES[plan]} ativado`,
      body:
        plan === "FREE"
          ? `A assinatura de ${org.name} foi encerrada. Os eventos continuam publicados dentro dos limites do plano Gratuito.`
          : `${org.name} agora tem os recursos do plano ${PLAN_NAMES[plan]}.`,
    });
  }

  return { status: "synced", organizationId: org.id, plan, previousPlan: org.plan, changed };
}

async function findOrganization(ids: (string | null)[], customerId: string | null) {
  const select = { id: true, name: true, plan: true, stripeCustomerId: true } as const;
  for (const id of ids) {
    if (!id) continue;
    const org = await prisma.organization.findUnique({ where: { id }, select });
    if (org) return org;
  }
  if (customerId) return prisma.organization.findUnique({ where: { stripeCustomerId: customerId }, select });
  return null;
}

/** OWNER/ADMIN da organização (quem gerencia a cobrança). */
export async function billingManagers(organizationId: string) {
  return prisma.membership.findMany({
    where: { organizationId, role: { in: ["OWNER", "ADMIN"] } },
    select: { userId: true, user: { select: { name: true } } },
  });
}

async function notifyManagers(organizationId: string, input: { title: string; body: string }) {
  const managers = await billingManagers(organizationId);
  await Promise.all(
    managers.map((m) => notify(m.userId, { type: "BILLING", title: input.title, body: input.body, url: "/painel/plano" }, { push: false }).catch(() => null)),
  );
}
