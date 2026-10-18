import "server-only";
import type Stripe from "stripe";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { genericMessage } from "@/server/email/templates";
import { notify } from "@/server/notifications";
import { formatMoney } from "@/lib/format";
import { getStripe } from "./stripe";
import { billingManagers, syncSubscription, type SubscriptionLike, type SyncResult } from "./sync";

export interface WebhookDeps {
  /** Busca a versão mais recente da assinatura (evita estados antigos quando eventos chegam fora de ordem). */
  retrieveSubscription?: (id: string) => Promise<SubscriptionLike>;
}

export type WebhookOutcome =
  | { duplicate: true }
  | { duplicate: false; handled: boolean; sync?: SyncResult; detail?: string };

function defaultDeps(): WebhookDeps {
  const stripe = getStripe();
  return stripe ? { retrieveSubscription: (id) => stripe.subscriptions.retrieve(id) } : {};
}

const idOf = (v: string | { id: string } | null | undefined) => (v ? (typeof v === "string" ? v : v.id) : null);

/**
 * Processa um evento já verificado. Idempotente: cada `event.id` é registrado em
 * StripeEvent antes do processamento; repetições são ignoradas. Se o processamento
 * falhar, o registro é desfeito para que o reenvio do Stripe tente de novo.
 */
export async function processStripeEvent(event: Stripe.Event, deps: WebhookDeps = defaultDeps()): Promise<WebhookOutcome> {
  const created = await prisma.stripeEvent.createMany({ data: [{ id: event.id, type: event.type }], skipDuplicates: true });
  if (created.count === 0) return { duplicate: true };

  try {
    return { duplicate: false, ...(await handle(event, deps)) };
  } catch (err) {
    await prisma.stripeEvent.delete({ where: { id: event.id } }).catch(() => undefined);
    throw err;
  }
}

async function freshSubscription(id: string, fallback: SubscriptionLike | null, deps: WebhookDeps): Promise<SubscriptionLike> {
  if (deps.retrieveSubscription) return deps.retrieveSubscription(id);
  if (fallback) return fallback;
  throw new Error(`Não foi possível obter a assinatura ${id}: Stripe não configurado.`);
}

async function handle(event: Stripe.Event, deps: WebhookDeps): Promise<{ handled: boolean; sync?: SyncResult; detail?: string }> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode !== "subscription" || !session.subscription) return { handled: false, detail: "checkout sem assinatura" };
      const subId = idOf(session.subscription)!;
      const embedded = typeof session.subscription === "object" ? (session.subscription as SubscriptionLike) : null;
      const sub = await freshSubscription(subId, embedded, deps);
      const sync = await syncSubscription(sub, { organizationIdHint: session.client_reference_id ?? session.metadata?.organizationId ?? null });
      return { handled: true, sync };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const obj = event.data.object as SubscriptionLike;
      const sub = await freshSubscription(obj.id, obj, deps);
      return { handled: true, sync: await syncSubscription(sub) };
    }

    case "customer.subscription.deleted": {
      // O objeto do evento já é o estado final (cancelada).
      return { handled: true, sync: await syncSubscription(event.data.object as SubscriptionLike) };
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const customerId = idOf(invoice.customer);
      const org = customerId
        ? await prisma.organization.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true, name: true, plan: true } })
        : null;
      if (!org) return { handled: false, detail: "fatura sem organização" };
      await notifyPaymentFailed(org, invoice.amount_due, invoice.hosted_invoice_url ?? null);
      await audit({
        action: "billing.payment_failed",
        targetType: "Organization",
        targetId: org.id,
        metadata: { invoiceId: invoice.id ?? null, amountDue: invoice.amount_due, attempt: invoice.attempt_count },
      });
      return { handled: true };
    }

    case "invoice.paid": {
      // Pagamento regularizado: ressincroniza a assinatura (ex.: sai de "em atraso").
      const invoice = event.data.object;
      const subRef = invoice.parent?.subscription_details?.subscription ?? (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
      const subId = idOf(subRef ?? null);
      if (!subId || !deps.retrieveSubscription) return { handled: false, detail: "fatura sem assinatura" };
      return { handled: true, sync: await syncSubscription(await deps.retrieveSubscription(subId)) };
    }

    default:
      return { handled: false, detail: `evento ignorado: ${event.type}` };
  }
}

async function notifyPaymentFailed(org: { id: string; name: string }, amountDueCents: number, invoiceUrl: string | null) {
  const managers = await billingManagers(org.id);
  const amount = amountDueCents > 0 ? ` de ${formatMoney(amountDueCents)}` : "";
  const safeInvoiceUrl = invoiceUrl && /^https:\/\//i.test(invoiceUrl) ? invoiceUrl : null;
  await Promise.all(
    managers.map((m) =>
      notify(
        m.userId,
        {
          type: "BILLING",
          title: "Não conseguimos cobrar a assinatura",
          body: `A cobrança${amount} de ${org.name} falhou. Atualize a forma de pagamento para manter os recursos do plano.`,
          url: "/painel/plano",
        },
        {
          email: genericMessage({
            template: "billing-payment-failed",
            subject: `Pagamento não aprovado — ${org.name}`,
            heading: "Não conseguimos cobrar sua assinatura",
            paragraphs: [
              `Oi, ${m.user.name.split(/\s+/)[0]}. A cobrança${amount} da assinatura de ${org.name} no Mixtour não foi aprovada.`,
              "O Stripe vai tentar de novo automaticamente nos próximos dias. Para evitar a perda dos recursos do plano, confira ou troque a forma de pagamento no portal de cobrança.",
              ...(safeInvoiceUrl ? [`Fatura: ${safeInvoiceUrl}`] : []),
            ],
            cta: { label: "Atualizar pagamento", path: "/painel/plano" },
            footnote: "Você recebe este aviso porque administra a cobrança desta organização no Mixtour.",
          }),
        },
      ).catch((err) => console.error("[billing] aviso de falha de pagamento", err)),
    ),
  );
}
