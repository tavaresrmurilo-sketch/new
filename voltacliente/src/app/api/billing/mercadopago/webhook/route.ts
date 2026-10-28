import { mercadoPagoProvider } from "@/modules/billing/providers/mercadopago";
import { logger } from "@/server/logger";

/**
 * Webhook do Mercado Pago (preparado para uma versão futura).
 * Enquanto a cobrança não estiver ativada, responde 501 e não altera
 * nenhuma assinatura.
 */
export async function POST() {
  if (!mercadoPagoProvider.isConfigured()) {
    return Response.json({ error: "Integração de pagamentos não configurada." }, { status: 501 });
  }
  logger.warn("billing_webhook_ignored", { provider: "MERCADO_PAGO" });
  return Response.json({ error: "Processamento de pagamentos ainda não ativado." }, { status: 501 });
}
