import { NextResponse } from "next/server";
import { env, integrations } from "@/server/env";
import { verifyWebhookEvent, WebhookSignatureError } from "@/server/billing/stripe";
import { processStripeEvent } from "@/server/billing/webhook";

const MAX_BODY_BYTES = 1_000_000;

/**
 * Webhook do Stripe. A autenticidade vem da assinatura (`stripe-signature`) sobre o corpo
 * bruto — por isso não há verificação de origem/sessão aqui.
 * 2xx = recebido; 400 = assinatura inválida; 500 = falha interna (o Stripe reenvia).
 */
export async function POST(req: Request) {
  if (!integrations().stripeWebhook) {
    return NextResponse.json({ error: "Webhook do Stripe não configurado nesta instalação." }, { status: 503 });
  }
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return NextResponse.json({ error: "Corpo muito grande." }, { status: 413 });

  const payload = await req.text();
  let event;
  try {
    event = verifyWebhookEvent(payload, req.headers.get("stripe-signature"), env().STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof WebhookSignatureError ? err.message : "Assinatura inválida.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const outcome = await processStripeEvent(event);
    return NextResponse.json({ received: true, duplicate: outcome.duplicate });
  } catch (err) {
    console.error("[billing:webhook]", event.type, event.id, err);
    return NextResponse.json({ error: "Falha ao processar o evento." }, { status: 500 });
  }
}
