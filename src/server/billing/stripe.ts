import "server-only";
import Stripe from "stripe";
import { env, integrations } from "@/server/env";

/**
 * Cliente do Stripe. Só existe quando STRIPE_SECRET_KEY está configurada —
 * sem chave, os recursos de pagamento ficam visivelmente desativados (nunca simulados).
 */
let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!integrations().stripe) return null;
  client ??= new Stripe(env().STRIPE_SECRET_KEY!, {
    appInfo: { name: "Mixtour", url: env().APP_URL },
    maxNetworkRetries: 2,
    timeout: 20_000,
  });
  return client;
}

export class WebhookSignatureError extends Error {}

/**
 * Valida a assinatura do webhook (cabeçalho `stripe-signature`) sobre o corpo bruto.
 * Usa a função estática do SDK: não depende da chave secreta nem de rede.
 */
export function verifyWebhookEvent(payload: string, signature: string | null, secret: string | undefined): Stripe.Event {
  if (!secret) throw new WebhookSignatureError("Webhook do Stripe não configurado.");
  if (!signature) throw new WebhookSignatureError("Assinatura ausente.");
  try {
    return Stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    throw new WebhookSignatureError("Assinatura inválida.");
  }
}

/** Somente para testes: gera um cabeçalho de assinatura válido (sem rede). */
export function testSignatureHeader(payload: string, secret: string, timestamp?: number): string {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp });
}
