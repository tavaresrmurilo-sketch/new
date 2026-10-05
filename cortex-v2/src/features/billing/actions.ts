"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { AppError } from "@/server/errors";
import { createCheckoutSession, createPortalSession, stripeConfigured } from "@/services/billing/stripe";

export const startCheckoutAction = defineAction({ schema: z.object({ planId: z.string().min(1), interval: z.enum(["monthly", "yearly"]) }), permission: "billing.manage", mode: "read" }, async ({ planId, interval }, ctx) => {
  if (!stripeConfigured()) throw new AppError("FEATURE_UNAVAILABLE", "Pagamento online ainda não está configurado nesta instalação. Fale com o suporte para contratar.");
  const plan = await prisma.plan.findFirst({ where: { id: planId, isActive: true } });
  if (!plan) throw new AppError("NOT_FOUND", "Plano não encontrado.");
  const priceId = interval === "yearly" ? plan.stripePriceYearlyId : plan.stripePriceMonthlyId;
  if (!priceId) throw new AppError("FEATURE_UNAVAILABLE", "Este plano ainda não está disponível para contratação online.");
  const sub = await prisma.subscription.findUnique({ where: { organizationId: ctx.org.id } });
  const session = await createCheckoutSession({ priceId, organizationId: ctx.org.id, planId: plan.id, customerEmail: ctx.user.email, customerId: sub?.externalCustomerId, successUrl: `${appUrl()}/app/settings/billing?checkout=success`, cancelUrl: `${appUrl()}/app/settings/billing?checkout=canceled` });
  await audit(ctx, "billing.checkout_started", { metadata: { plan: plan.key, interval } });
  return { url: session.url };
});

export const openBillingPortalAction = defineAction({ schema: z.object({}), permission: "billing.manage", mode: "read" }, async (_i, ctx) => {
  const sub = await prisma.subscription.findUnique({ where: { organizationId: ctx.org.id } });
  if (!stripeConfigured() || !sub?.externalCustomerId) throw new AppError("FEATURE_UNAVAILABLE", "Portal de cobrança indisponível para esta assinatura.");
  const s = await createPortalSession(sub.externalCustomerId, `${appUrl()}/app/settings/billing`);
  return { url: s.url };
});
