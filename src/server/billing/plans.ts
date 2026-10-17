import "server-only";
import { cache } from "react";
import type { Plan, PlanTier } from "@prisma/client";
import { prisma } from "@/server/db";
import { PLAN_SEED } from "@/lib/plans";

export class PlanLimitError extends Error {
  constructor(
    message: string,
    public upgradeTo: PlanTier | null = "PRO",
  ) {
    super(message);
  }
}

/** Planos ativos (banco), com fallback aos valores padrão caso a tabela ainda esteja vazia. */
export const getPlans = cache(async (): Promise<Plan[]> => {
  const rows = await prisma.plan.findMany({ orderBy: { priceMonthlyCents: "asc" } });
  if (rows.length) return rows;
  return PLAN_SEED.map((p) => ({
    ...p,
    stripePriceMonthly: null,
    stripePriceYearly: null,
    active: true,
    updatedAt: new Date(0),
  }));
});

export async function getPlan(tier: PlanTier): Promise<Plan> {
  const plans = await getPlans();
  return plans.find((p) => p.tier === tier) ?? plans[0];
}

/** Eventos que contam no limite do plano: publicados ou em análise que ainda não terminaram. */
export async function activeEventCount(organizationId: string, excludeEventId?: string): Promise<number> {
  return prisma.event.count({
    where: {
      organizationId,
      status: { in: ["PUBLISHED", "PENDING_REVIEW"] },
      endsAt: { gte: new Date() },
      ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
    },
  });
}

export async function assertCanActivateEvent(organizationId: string, eventId?: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { plan: true } });
  const plan = await getPlan(org.plan);
  if (plan.maxActiveEvents == null) return;
  const count = await activeEventCount(organizationId, eventId);
  if (count >= plan.maxActiveEvents) {
    throw new PlanLimitError(
      `O plano ${plan.name} permite até ${plan.maxActiveEvents} eventos ativos ao mesmo tempo. Faça upgrade para publicar mais.`,
      org.plan === "FREE" ? "PRO" : "BUSINESS",
    );
  }
}

export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function boostsUsedThisMonth(organizationId: string): Promise<number> {
  return prisma.eventBoost.count({ where: { organizationId, createdAt: { gte: monthStart() } } });
}

export async function assertCanAddMember(organizationId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { plan: true } });
  const plan = await getPlan(org.plan);
  const [members, pending] = await Promise.all([
    prisma.membership.count({ where: { organizationId } }),
    prisma.orgInvite.count({ where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
  ]);
  if (members + pending >= plan.maxMembers) {
    throw new PlanLimitError(
      plan.maxMembers === 1
        ? `O plano ${plan.name} é individual. Faça upgrade para convidar sua equipe.`
        : `O plano ${plan.name} permite até ${plan.maxMembers} pessoas na equipe.`,
      org.plan === "FREE" ? "PRO" : "BUSINESS",
    );
  }
}

export async function assertCanAddVenue(organizationId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { plan: true } });
  const plan = await getPlan(org.plan);
  if (plan.maxVenues == null) return;
  const count = await prisma.venue.count({ where: { organizationId } });
  if (count >= plan.maxVenues) {
    throw new PlanLimitError(`O plano ${plan.name} permite até ${plan.maxVenues} locais salvos.`, org.plan === "FREE" ? "PRO" : "BUSINESS");
  }
}
