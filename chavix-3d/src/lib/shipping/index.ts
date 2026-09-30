import type { ShippingMethod } from "@/generated/prisma/enums";
import type { ShippingConfig } from "./config";
import { localDeliveryProvider, nationalProvider, pickupProvider } from "./providers";
import type { ShippingContext, ShippingProvider, ShippingQuote } from "./types";

export * from "./config";
export type { ShippingContext, ShippingProvider, ShippingQuote } from "./types";

/** Provedores ativos, na ordem em que aparecem no checkout. */
const PROVIDERS: ShippingProvider[] = [pickupProvider, localDeliveryProvider, nationalProvider];

export async function quoteShipping(config: ShippingConfig, ctx: ShippingContext): Promise<ShippingQuote[]> {
  const quotes = await Promise.all(PROVIDERS.map((provider) => provider.quote(config, ctx)));
  return quotes.filter((quote): quote is ShippingQuote => quote !== null);
}

export async function quoteShippingMethod(
  config: ShippingConfig,
  method: ShippingMethod,
  ctx: ShippingContext,
): Promise<ShippingQuote | null> {
  const provider = PROVIDERS.find((p) => p.method === method);
  if (!provider) return null;
  return provider.quote(config, ctx);
}

export const SHIPPING_METHOD_LABEL: Record<ShippingMethod, string> = {
  PICKUP: "Retirada",
  LOCAL_DELIVERY: "Entrega local",
  NATIONAL: "Envio nacional",
};
