import { NextResponse } from "next/server";
import type { SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { audit } from "@/server/audit";
import { verifyStripeSignature } from "@/services/billing/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUS: Record<string, SubscriptionStatus> = { trialing: "TRIALING", active: "ACTIVE", past_due: "PAST_DUE", unpaid: "PAST_DUE", canceled: "CANCELED", incomplete_expired: "CANCELED", paused: "SUSPENDED" };

type StripeObj = Record<string, unknown> & { id: string; metadata?: Record<string, string> };

/** Webhook Stripe: assinatura verificada; idempotente por externalId. */
export async function POST(req: Request) {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook não configurado" }, { status: 503 });
  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret)) return NextResponse.json({ error: "Assinatura inválida" }, { status: 400 });
  const event = JSON.parse(payload) as { type: string; data: { object: StripeObj } };
  const o = event.data.object;
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const orgId = o.metadata?.organizationId;
        const planId = o.metadata?.planId;
        if (orgId && planId) {
          await prisma.subscription.upsert({
            where: { organizationId: orgId },
            create: { organizationId: orgId, planId, status: "ACTIVE", provider: "STRIPE", externalId: String(o.subscription ?? ""), externalCustomerId: String(o.customer ?? "") },
            update: { planId, status: "ACTIVE", provider: "STRIPE", externalId: String(o.subscription ?? ""), externalCustomerId: String(o.customer ?? ""), canceledAt: null },
          });
          await audit(null, "billing.subscription_activated", { organizationId: orgId, metadata: { planId } });
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = await prisma.subscription.findUnique({ where: { externalId: o.id } });
        if (!sub) break;
        const status = event.type === "customer.subscription.deleted" ? "CANCELED" : (STATUS[String(o.status)] ?? sub.status);
        const items = (o.items as { data?: { price?: { unit_amount?: number; recurring?: { interval?: string } } }[] } | undefined)?.data?.[0]?.price;
        const mrrCents = items?.unit_amount ? (items.recurring?.interval === "year" ? Math.round(items.unit_amount / 12) : items.unit_amount) : sub.mrrCents;
        await prisma.subscription.update({
          where: { id: sub.id },
          data: {
            status,
            mrrCents: status === "ACTIVE" ? mrrCents : 0,
            cancelAtPeriodEnd: Boolean(o.cancel_at_period_end),
            currentPeriodStart: o.current_period_start ? new Date(Number(o.current_period_start) * 1000) : sub.currentPeriodStart,
            currentPeriodEnd: o.current_period_end ? new Date(Number(o.current_period_end) * 1000) : sub.currentPeriodEnd,
            canceledAt: status === "CANCELED" ? new Date() : null,
            billingInterval: items?.recurring?.interval === "year" ? "yearly" : "monthly",
          },
        });
        await audit(null, "billing.subscription_updated", { organizationId: sub.organizationId, metadata: { status } });
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const sub = o.subscription ? await prisma.subscription.findUnique({ where: { externalId: String(o.subscription) } }) : null;
        if (!sub) break;
        await prisma.invoiceReference.upsert({
          where: { externalId: o.id },
          create: { organizationId: sub.organizationId, subscriptionId: sub.id, provider: "STRIPE", externalId: o.id, amountCents: Number(o.amount_due ?? 0), currency: String(o.currency ?? "brl").toUpperCase(), status: event.type === "invoice.paid" ? "paid" : "failed", hostedUrl: (o.hosted_invoice_url as string) ?? null, issuedAt: new Date(Number(o.created ?? Date.now() / 1000) * 1000), paidAt: event.type === "invoice.paid" ? new Date() : null },
          update: { status: event.type === "invoice.paid" ? "paid" : "failed", paidAt: event.type === "invoice.paid" ? new Date() : null },
        });
        if (event.type === "invoice.payment_failed") await prisma.subscription.update({ where: { id: sub.id }, data: { status: "PAST_DUE" } });
        break;
      }
    }
  } catch (error) {
    logger.error("stripe.webhook_failed", { type: event.type, error });
    return NextResponse.json({ error: "Falha ao processar" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
