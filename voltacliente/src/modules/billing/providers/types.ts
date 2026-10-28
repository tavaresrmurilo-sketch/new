/**
 * Contrato de provedores de cobrança recorrente.
 *
 * Nesta fase NENHUM provedor está ativo: o VoltaCliente não realiza cobranças.
 * A interface existe para que a integração com o Mercado Pago (ou outro
 * provedor) seja adicionada sem alterar o restante do sistema.
 */
export type CheckoutRequest = {
  companyId: string;
  planCode: "INICIAL" | "PROFISSIONAL" | "BUSINESS";
  payerEmail: string;
  backUrl: string;
};

export type BillingWebhookResult =
  { handled: true; providerSubscriptionId: string; status: "ACTIVE" | "PAST_DUE" | "CANCELED" } | { handled: false; reason: string };

export interface BillingProviderAdapter {
  readonly id: "MERCADO_PAGO";
  isConfigured(): boolean;
  createSubscriptionCheckout(request: CheckoutRequest): Promise<{ checkoutUrl: string; providerSubscriptionId: string }>;
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
  parseWebhook(request: Request): Promise<BillingWebhookResult>;
}
