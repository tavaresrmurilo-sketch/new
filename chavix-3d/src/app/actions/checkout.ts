"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { buildCartView, CART_COOKIE, getCurrentCart, readCartToken } from "@/lib/cart/service";
import { lookupCep } from "@/lib/cep";
import { grantOrderAccess } from "@/lib/orders/access";
import { OrderError, placeOrder } from "@/lib/orders/service";
import { getClientIp } from "@/lib/security/request";
import { rateLimit } from "@/lib/security/rate-limit";
import { getStoreSettings } from "@/lib/settings";
import { quoteShipping, type ShippingQuote } from "@/lib/shipping";
import { checkoutSchema } from "@/lib/validation/checkout";
import { fieldErrors } from "@/lib/validation/common";

const quoteSchema = z.object({
  cep: z.string().max(12).optional(),
  city: z.string().max(80).optional(),
  state: z.string().max(2).optional(),
});

/** Opções de frete para o carrinho atual (valores sempre calculados no servidor). */
export async function getShippingQuotes(input: z.input<typeof quoteSchema>): Promise<{ quotes: ShippingQuote[]; city?: string; state?: string }> {
  const parsed = quoteSchema.safeParse(input);
  const data = parsed.success ? parsed.data : {};
  const [cart, settings] = await Promise.all([getCurrentCart(), getStoreSettings()]);
  const view = await buildCartView(cart, settings);

  let city = data.city;
  let state = data.state;
  if (data.cep && !city) {
    const ip = await getClientIp();
    if ((await rateLimit(`cep:${ip}`, 40, 600)).allowed) {
      const found = await lookupCep(data.cep).catch(() => null);
      city = found?.city;
      state = found?.state;
    }
  }
  const quotes = await quoteShipping(settings.shipping, { subtotalCents: view.subtotalCents - view.discountCents, city, state, cep: data.cep });
  return { quotes, city, state };
}

export type PlaceOrderResult = { ok: true; code: string } | { ok: false; error: string; fields?: Record<string, string> };

export async function placeOrderAction(input: unknown): Promise<PlaceOrderResult> {
  const ip = await getClientIp();
  const limit = await rateLimit(`checkout:${ip}`, 6, 600);
  if (!limit.allowed) return { ok: false, error: "Muitas tentativas de pedido. Aguarde alguns minutos." };

  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revise os campos destacados", fields: fieldErrors(parsed.error) };

  const token = await readCartToken();
  if (!token) return { ok: false, error: "Seu carrinho está vazio" };

  try {
    const { code } = await placeOrder(token, parsed.data);
    await grantOrderAccess(code);
    // Próxima compra começa com um carrinho novo.
    (await cookies()).delete(CART_COOKIE);
    return { ok: true, code };
  } catch (error) {
    if (error instanceof OrderError) return { ok: false, error: error.message };
    console.error("placeOrder", error);
    return { ok: false, error: "Não foi possível criar o pedido agora. Tente de novo em instantes." };
  }
}
