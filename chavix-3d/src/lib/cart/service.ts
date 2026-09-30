import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db, type Tx } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { evaluateCoupon, normalizeCouponCode } from "@/lib/coupons";
import { customSelectionSchema, quoteCustomKeychain, type CustomBuilderConfig } from "@/lib/custom-builder";
import {
  effectivePriceCents,
  lineTotalCents,
  resolveCustomizations,
  type ChosenOption,
  type CustomizationDef,
  type SelectOption,
} from "@/lib/pricing";
import type { StoreSettingsView } from "@/lib/settings";
import type { CartLineView, CartView } from "./types";

export const CART_COOKIE = "chx_cart";
export const MAX_CART_LINES = 30;

export const cartInclude = {
  items: {
    orderBy: { createdAt: "asc" },
    include: {
      variant: true,
      product: {
        include: {
          category: { select: { name: true } },
          images: { orderBy: { position: "asc" }, take: 1 },
          customizations: { orderBy: { position: "asc" } },
          variants: { where: { active: true }, orderBy: { position: "asc" } },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

export type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;
type CartItemWithProduct = CartWithItems["items"][number];

export function hashCartToken(token: string): string {
  return createHash("sha256").update(`cart:${token}`).digest("hex");
}

export async function readCartToken(): Promise<string | null> {
  const token = (await cookies()).get(CART_COOKIE)?.value;
  return token && /^[A-Za-z0-9_-]{20,64}$/.test(token) ? token : null;
}

export async function loadCart(token: string | null, client: Tx | typeof db = db): Promise<CartWithItems | null> {
  if (!token) return null;
  return client.cart.findUnique({ where: { token }, include: cartInclude });
}

export async function getCurrentCart(): Promise<CartWithItems | null> {
  return loadCart(await readCartToken());
}

/** Busca ou cria o carrinho do visitante. Só em Server Actions/Route Handlers (grava cookie). */
export async function getOrCreateCart(): Promise<CartWithItems> {
  const existing = await getCurrentCart();
  if (existing) return existing;
  const token = randomBytes(24).toString("base64url");
  const cart = await db.cart.create({ data: { token }, include: cartInclude });
  (await cookies()).set(CART_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });
  return cart;
}

export function toCustomizationDefs(
  customizations: Array<{
    id: string;
    label: string;
    type: "TEXT" | "SELECT";
    required: boolean;
    maxLength: number | null;
    priceCents: number;
    options: Prisma.JsonValue;
  }>,
): CustomizationDef[] {
  return customizations.map((c) => ({
    id: c.id,
    label: c.label,
    type: c.type,
    required: c.required,
    maxLength: c.maxLength,
    priceCents: c.priceCents,
    options: Array.isArray(c.options)
      ? (c.options as unknown[]).flatMap((o): SelectOption[] => {
          if (o && typeof o === "object" && "label" in o && typeof (o as { label: unknown }).label === "string") {
            const price = Number((o as { priceCents?: unknown }).priceCents ?? 0);
            return [{ label: (o as { label: string }).label, priceCents: Number.isSafeInteger(price) && price >= 0 ? price : 0 }];
          }
          return [];
        })
      : [],
  }));
}

/** Linha do carrinho com preço recalculado a partir do banco. */
export interface PricedLine {
  itemId: string;
  kind: "PRODUCT" | "CUSTOM";
  productId: string | null;
  variantId: string | null;
  name: string;
  sku: string | null;
  href: string | null;
  imageUrl: string | null;
  categoryName: string | null;
  variantName: string | null;
  colorHex: string | null;
  options: ChosenOption[];
  customData: Record<string, string> | null;
  referenceFileId: string | null;
  quantity: number;
  minQuantity: number;
  maxQuantity: number;
  unitPriceCents: number;
  setupFeeCents: number;
  totalCents: number;
  productionDays: number;
  /** Para baixa de estoque */
  stock: number;
  allowBackorder: boolean;
  issue: string | null;
}

function priceProductLine(item: CartItemWithProduct): PricedLine {
  const product = item.product;
  const base: PricedLine = {
    itemId: item.id,
    kind: "PRODUCT",
    productId: item.productId,
    variantId: item.variantId,
    name: product?.name ?? "Produto removido",
    sku: product?.sku ?? null,
    href: product ? `/produto/${product.slug}` : null,
    imageUrl: product?.images[0]?.thumbUrl ?? null,
    categoryName: product?.category.name ?? null,
    variantName: item.variant?.name ?? null,
    colorHex: item.variant?.colorHex ?? null,
    options: [],
    customData: null,
    referenceFileId: null,
    quantity: item.quantity,
    minQuantity: product?.minQuantity ?? 1,
    maxQuantity: product?.maxQuantity ?? 1,
    unitPriceCents: 0,
    setupFeeCents: 0,
    totalCents: 0,
    productionDays: product?.productionDays ?? 0,
    stock: product?.stock ?? 0,
    allowBackorder: product?.allowBackorder ?? false,
    issue: null,
  };
  if (!product || !product.active) return { ...base, issue: "Este produto não está mais disponível" };

  let unit = effectivePriceCents(product.priceCents, product.promoPriceCents);
  if (product.variants.length > 0) {
    const variant = product.variants.find((v) => v.id === item.variantId);
    if (!variant) return { ...base, issue: "Escolha uma cor disponível" };
    unit += variant.priceDeltaCents;
  }

  const custom = resolveCustomizations(
    toCustomizationDefs(product.customizations),
    (item.customizationValues ?? {}) as Record<string, unknown>,
  );
  if (!custom.ok) return { ...base, issue: custom.error };
  unit += custom.extraCents;

  const maxQuantity = product.allowBackorder ? product.maxQuantity : Math.min(product.maxQuantity, product.stock);
  let issue: string | null = null;
  if (maxQuantity < product.minQuantity) issue = "Esgotado no momento";
  else if (item.quantity > maxQuantity) issue = `Disponível até ${maxQuantity} unidade(s)`;
  else if (item.quantity < product.minQuantity) issue = `Pedido mínimo de ${product.minQuantity} unidade(s)`;

  const line = { unitPriceCents: unit, quantity: item.quantity };
  return {
    ...base,
    options: custom.chosen,
    maxQuantity: Math.max(maxQuantity, 0),
    unitPriceCents: unit,
    totalCents: lineTotalCents(line),
    issue,
  };
}

function priceCustomLine(item: CartItemWithProduct, config: CustomBuilderConfig): PricedLine {
  const parsed = customSelectionSchema.safeParse({ ...(item.customData as object), quantity: item.quantity });
  const base: PricedLine = {
    itemId: item.id,
    kind: "CUSTOM",
    productId: null,
    variantId: null,
    name: "Chaveiro personalizado",
    sku: null,
    href: "/personalizar",
    imageUrl: null,
    categoryName: "Personalizados",
    variantName: null,
    colorHex: null,
    options: [],
    customData: null,
    referenceFileId: item.referenceFileId,
    quantity: item.quantity,
    minQuantity: config.minQuantity,
    maxQuantity: config.maxQuantity,
    unitPriceCents: 0,
    setupFeeCents: 0,
    totalCents: 0,
    productionDays: config.productionDays,
    stock: 0,
    allowBackorder: true,
    issue: null,
  };
  if (!parsed.success) return { ...base, issue: "Refaça esta personalização" };

  const quote = quoteCustomKeychain(config, parsed.data, Boolean(item.referenceFileId));
  if (!quote.ok) return { ...base, issue: quote.error };

  const color = config.colors.find((c) => c.id === parsed.data.colorId);
  const options: ChosenOption[] = [
    { label: "Formato", value: quote.shapeName, priceCents: 0 },
    { label: "Cor", value: quote.colorName, priceCents: 0 },
  ];
  if (quote.text) options.push({ label: "Texto", value: quote.text, priceCents: 0 });
  if (item.referenceFileId) options.push({ label: "Referência", value: "Imagem enviada", priceCents: quote.setupFeeCents });
  if (quote.notes) options.push({ label: "Observações", value: quote.notes, priceCents: 0 });
  if (quote.percentOff) options.push({ label: "Desconto por quantidade", value: `${quote.percentOff}%`, priceCents: 0 });

  return {
    ...base,
    colorHex: color?.hex ?? null,
    options,
    customData: {
      shapeId: parsed.data.shapeId,
      colorId: parsed.data.colorId,
      text: quote.text,
      notes: quote.notes,
    },
    unitPriceCents: quote.unitPriceCents,
    setupFeeCents: quote.setupFeeCents,
    totalCents: quote.totalCents,
  };
}

export function priceCart(cart: CartWithItems | null, settings: StoreSettingsView): PricedLine[] {
  if (!cart) return [];
  return cart.items.map((item) =>
    item.kind === "CUSTOM" ? priceCustomLine(item, settings.customBuilder) : priceProductLine(item),
  );
}

export async function buildCartView(
  cart: CartWithItems | null,
  settings: StoreSettingsView,
  options: { isFirstPurchase?: boolean } = {},
): Promise<CartView> {
  const lines = priceCart(cart, settings);
  const valid = lines.filter((line) => !line.issue);
  const subtotalCents = valid.reduce((sum, line) => sum + line.totalCents, 0);

  let coupon: CartView["coupon"] = null;
  if (cart?.couponCode) {
    const code = normalizeCouponCode(cart.couponCode);
    const row = await db.coupon.findUnique({ where: { code } });
    if (!row) coupon = { code, discountCents: 0, error: "Cupom não encontrado" };
    else {
      const result = evaluateCoupon(row, { subtotalCents, now: new Date(), isFirstPurchase: options.isFirstPurchase });
      coupon = result.ok ? { code, discountCents: result.discountCents, error: null } : { code, discountCents: 0, error: result.reason };
    }
  }

  const items: CartLineView[] = lines.map((line) => ({
    id: line.itemId,
    kind: line.kind,
    name: line.name,
    href: line.href,
    imageUrl: line.imageUrl,
    variantName: line.variantName,
    colorHex: line.colorHex,
    options: line.options.map((o) => ({ label: o.label, value: o.value })),
    quantity: line.quantity,
    minQuantity: line.minQuantity,
    maxQuantity: line.maxQuantity,
    unitPriceCents: line.unitPriceCents,
    setupFeeCents: line.setupFeeCents,
    totalCents: line.totalCents,
    issue: line.issue,
    hasReference: Boolean(line.referenceFileId),
  }));

  return {
    items,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotalCents,
    discountCents: coupon?.discountCents ?? 0,
    coupon,
    hasIssues: lines.some((line) => line.issue),
    productionDays: valid.reduce((max, line) => Math.max(max, line.productionDays), 0),
  };
}

/** Compara valores de personalização ignorando ordem das chaves e espaços. */
export function sameCustomization(a: unknown, b: unknown): boolean {
  const norm = (value: unknown) =>
    JSON.stringify(
      Object.entries((value ?? {}) as Record<string, string>)
        .map(([k, v]) => [k, String(v).trim()])
        .filter(([, v]) => v !== "")
        .sort(([x], [y]) => x.localeCompare(y)),
    );
  return norm(a) === norm(b);
}
