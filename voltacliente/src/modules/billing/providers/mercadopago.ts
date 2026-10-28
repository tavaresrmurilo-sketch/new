import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingProviderAdapter } from "./types";

/**
 * Integração futura com o Mercado Pago (assinaturas / preapproval).
 *
 * Variáveis de ambiente previstas (NUNCA versione valores reais):
 *   MERCADOPAGO_ACCESS_TOKEN   — token de acesso da aplicação
 *   MERCADOPAGO_WEBHOOK_SECRET — assinatura secreta das notificações
 *
 * Enquanto a cobrança não for ativada, os métodos de cobrança lançam erro
 * explícito. Nenhuma assinatura é simulada como paga.
 */
class NotEnabledError extends Error {
  constructor() {
    super("Cobrança via Mercado Pago ainda não está ativada nesta versão do VoltaCliente.");
    this.name = "NotEnabledError";
  }
}

/**
 * Valida o cabeçalho `x-signature` das notificações do Mercado Pago.
 * Manifesto: `id:{data.id};request-id:{x-request-id};ts:{ts};`
 */
export function verifyMercadoPagoSignature(input: {
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string;
  secret: string;
}): boolean {
  if (!input.signatureHeader || !input.requestId) return false;
  const parts = Object.fromEntries(
    input.signatureHeader.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  const manifest = `id:${input.dataId.toLowerCase()};request-id:${input.requestId};ts:${ts};`;
  const expected = createHmac("sha256", input.secret).update(manifest).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const mercadoPagoProvider: BillingProviderAdapter = {
  id: "MERCADO_PAGO",
  isConfigured() {
    return Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN && process.env.MERCADOPAGO_WEBHOOK_SECRET);
  },
  async createSubscriptionCheckout() {
    throw new NotEnabledError();
  },
  async cancelSubscription() {
    throw new NotEnabledError();
  },
  async parseWebhook() {
    return { handled: false, reason: "Cobrança ainda não ativada." };
  },
};
