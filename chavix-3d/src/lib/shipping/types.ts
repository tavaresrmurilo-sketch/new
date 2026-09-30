import type { ShippingMethod } from "@/generated/prisma/enums";
import type { ShippingConfig } from "./config";

export interface ShippingContext {
  /** Subtotal dos produtos já com desconto, em centavos */
  subtotalCents: number;
  city?: string;
  state?: string;
  cep?: string;
}

export interface ShippingQuote {
  method: ShippingMethod;
  label: string;
  description: string;
  priceCents: number;
  /** Dias úteis após a produção. null = combinar */
  estimatedDays: number | null;
  available: boolean;
  /** Motivo quando indisponível (ex.: "Entrega local só em Goiânia/GO") */
  unavailableReason?: string;
  requiresAddress: boolean;
  free: boolean;
}

/**
 * Contrato de um provedor de frete. Para integrar uma transportadora/plataforma
 * logística (Correios, Melhor Envio, etc.), crie um provedor que implemente esta
 * interface — o `quote` pode chamar a API externa — e registre-o em `index.ts`.
 */
export interface ShippingProvider {
  method: ShippingMethod;
  quote(config: ShippingConfig, ctx: ShippingContext): Promise<ShippingQuote | null> | ShippingQuote | null;
}
