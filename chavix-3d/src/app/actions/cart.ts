"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import {
  buildCartView,
  getCurrentCart,
  getOrCreateCart,
  hashCartToken,
  loadCart,
  MAX_CART_LINES,
  priceCart,
  sameCustomization,
  toCustomizationDefs,
} from "@/lib/cart/service";
import type { CartActionResult } from "@/lib/cart/types";
import { normalizeCouponCode } from "@/lib/coupons";
import { customSelectionSchema, quoteCustomKeychain } from "@/lib/custom-builder";
import { resolveCustomizations } from "@/lib/pricing";
import { getClientIp } from "@/lib/security/request";
import { rateLimit } from "@/lib/security/rate-limit";
import { getStoreSettings } from "@/lib/settings";

async function view(token: string | null): Promise<CartActionResult & { ok: true }> {
  const [cart, settings] = await Promise.all([loadCart(token), getStoreSettings()]);
  return { ok: true, cart: await buildCartView(cart, settings) };
}

async function guard(limit = 60): Promise<string | null> {
  const ip = await getClientIp();
  const result = await rateLimit(`cart:${ip}`, limit, 60);
  return result.allowed ? null : "Muitas alterações seguidas. Aguarde um instante.";
}

const addProductSchema = z.object({
  productId: z.string().min(1).max(40),
  variantId: z.string().max(40).nullable().optional(),
  quantity: z.number().int().min(1).max(999),
  customizations: z.record(z.string().max(40), z.string().max(200)).optional(),
});

export async function addProductToCart(input: z.input<typeof addProductSchema>): Promise<CartActionResult> {
  const limited = await guard();
  if (limited) return { ok: false, error: limited };
  const parsed = addProductSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Não foi possível adicionar este item" };
  const { productId, variantId, quantity, customizations } = parsed.data;

  const product = await db.product.findFirst({
    where: { id: productId, active: true, category: { active: true } },
    include: { variants: { where: { active: true } }, customizations: true },
  });
  if (!product) return { ok: false, error: "Produto indisponível" };

  if (product.variants.length > 0 && !product.variants.some((v) => v.id === variantId)) {
    return { ok: false, error: "Escolha uma cor" };
  }
  const resolved = resolveCustomizations(toCustomizationDefs(product.customizations), customizations ?? {});
  if (!resolved.ok) return { ok: false, error: resolved.error };

  // Guarda só os valores das personalizações que existem neste produto
  const values: Record<string, string> = {};
  for (const def of product.customizations) {
    const value = customizations?.[def.id]?.replace(/\s+/g, " ").trim();
    if (value) values[def.id] = value;
  }

  const cart = await getOrCreateCart();
  const same = cart.items.find(
    (item) =>
      item.kind === "PRODUCT" &&
      item.productId === productId &&
      (item.variantId ?? null) === (product.variants.length ? variantId : null) &&
      sameCustomization(item.customizationValues, values),
  );
  const maxQuantity = product.allowBackorder ? product.maxQuantity : Math.min(product.maxQuantity, product.stock);
  const nextQuantity = (same?.quantity ?? 0) + quantity;
  if (maxQuantity < product.minQuantity) return { ok: false, error: "Esgotado no momento" };
  if (nextQuantity > maxQuantity) return { ok: false, error: `Você pode levar até ${maxQuantity} unidade(s)` };
  if (nextQuantity < product.minQuantity) return { ok: false, error: `Pedido mínimo de ${product.minQuantity} unidade(s)` };

  if (same) {
    await db.cartItem.update({ where: { id: same.id }, data: { quantity: nextQuantity } });
  } else {
    if (cart.items.length >= MAX_CART_LINES) return { ok: false, error: "Seu carrinho atingiu o limite de itens" };
    await db.cartItem.create({
      data: {
        cartId: cart.id,
        kind: "PRODUCT",
        productId,
        variantId: product.variants.length ? variantId : null,
        quantity,
        customizationValues: values,
      },
    });
  }
  const result = await view(cart.token);
  return { ...result, message: `${product.name} no carrinho` };
}

const addCustomSchema = z.object({
  selection: customSelectionSchema,
  referenceFileId: z.string().max(40).nullable().optional(),
});

export async function addCustomToCart(input: z.input<typeof addCustomSchema>): Promise<CartActionResult> {
  const limited = await guard();
  if (limited) return { ok: false, error: limited };
  const parsed = addCustomSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revise as escolhas da personalização" };

  const settings = await getStoreSettings();
  const cart = await getOrCreateCart();

  let referenceFileId: string | null = null;
  if (parsed.data.referenceFileId) {
    const file = await db.storedFile.findFirst({
      where: { id: parsed.data.referenceFileId, kind: "CUSTOMER_REFERENCE", ownerHash: hashCartToken(cart.token) },
      select: { id: true },
    });
    if (!file) return { ok: false, error: "Envie a imagem de referência novamente" };
    referenceFileId = file.id;
  }

  const quote = quoteCustomKeychain(settings.customBuilder, parsed.data.selection, Boolean(referenceFileId));
  if (!quote.ok) return { ok: false, error: quote.error };
  if (cart.items.length >= MAX_CART_LINES) return { ok: false, error: "Seu carrinho atingiu o limite de itens" };

  await db.cartItem.create({
    data: {
      cartId: cart.id,
      kind: "CUSTOM",
      quantity: parsed.data.selection.quantity,
      customData: {
        shapeId: parsed.data.selection.shapeId,
        colorId: parsed.data.selection.colorId,
        text: quote.text,
        notes: quote.notes,
      },
      referenceFileId,
    },
  });
  const result = await view(cart.token);
  return { ...result, message: "Chaveiro personalizado no carrinho" };
}

export async function updateCartItemQuantity(itemId: string, quantity: number): Promise<CartActionResult> {
  const limited = await guard();
  if (limited) return { ok: false, error: limited };
  if (typeof itemId !== "string" || !Number.isInteger(quantity) || quantity < 1 || quantity > 5000) {
    return { ok: false, error: "Quantidade inválida" };
  }
  const cart = await getCurrentCart();
  const item = cart?.items.find((i) => i.id === itemId);
  if (!cart || !item) return { ok: false, error: "Item não encontrado" };

  const settings = await getStoreSettings();
  const line = priceCart({ ...cart, items: [{ ...item, quantity }] }, settings)[0];
  if (quantity > line.maxQuantity) return { ok: false, error: `Disponível até ${line.maxQuantity} unidade(s)`, cart: (await view(cart.token)).cart };
  if (quantity < line.minQuantity) return { ok: false, error: `Mínimo de ${line.minQuantity} unidade(s)`, cart: (await view(cart.token)).cart };

  await db.cartItem.update({ where: { id: item.id }, data: { quantity } });
  return view(cart.token);
}

export async function removeCartItem(itemId: string): Promise<CartActionResult> {
  const limited = await guard();
  if (limited) return { ok: false, error: limited };
  const cart = await getCurrentCart();
  if (!cart) return { ok: false, error: "Carrinho não encontrado" };
  await db.cartItem.deleteMany({ where: { id: String(itemId), cartId: cart.id } });
  return view(cart.token);
}

export async function applyCoupon(code: string): Promise<CartActionResult> {
  const ip = await getClientIp();
  const limit = await rateLimit(`coupon:${ip}`, 12, 600);
  if (!limit.allowed) return { ok: false, error: "Muitas tentativas de cupom. Tente de novo em alguns minutos." };

  const normalized = normalizeCouponCode(String(code ?? "")).slice(0, 40);
  if (!normalized) return { ok: false, error: "Digite o código do cupom" };
  const cart = await getCurrentCart();
  if (!cart || cart.items.length === 0) return { ok: false, error: "Adicione itens antes de usar um cupom" };

  const coupon = await db.coupon.findUnique({ where: { code: normalized } });
  if (!coupon || !coupon.active) return { ok: false, error: "Cupom inválido ou inativo" };

  await db.cart.update({ where: { id: cart.id }, data: { couponCode: normalized } });
  const result = await view(cart.token);
  if (result.cart.coupon?.error) {
    // Não deixa aplicado um cupom que não vale para este carrinho
    await db.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
    return { ok: false, error: result.cart.coupon.error, cart: (await view(cart.token)).cart };
  }
  return { ...result, message: `Cupom ${normalized} aplicado` };
}

export async function removeCoupon(): Promise<CartActionResult> {
  const cart = await getCurrentCart();
  if (!cart) return { ok: false, error: "Carrinho não encontrado" };
  await db.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
  return view(cart.token);
}
