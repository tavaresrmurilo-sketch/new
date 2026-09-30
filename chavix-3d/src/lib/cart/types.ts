/** Tipos do carrinho compartilhados entre servidor e cliente (sem dependências de servidor). */

export interface CartLineView {
  id: string;
  kind: "PRODUCT" | "CUSTOM";
  name: string;
  href: string | null;
  imageUrl: string | null;
  variantName: string | null;
  colorHex: string | null;
  options: Array<{ label: string; value: string }>;
  quantity: number;
  minQuantity: number;
  maxQuantity: number;
  unitPriceCents: number;
  setupFeeCents: number;
  totalCents: number;
  /** Problema que impede a compra desta linha (produto inativo, sem estoque...) */
  issue: string | null;
  hasReference: boolean;
}

export interface CartCouponView {
  code: string;
  discountCents: number;
  error: string | null;
}

export interface CartView {
  items: CartLineView[];
  itemCount: number;
  subtotalCents: number;
  discountCents: number;
  coupon: CartCouponView | null;
  hasIssues: boolean;
  /** Maior prazo de produção entre os itens (dias úteis) */
  productionDays: number;
}

export const EMPTY_CART: CartView = {
  items: [],
  itemCount: 0,
  subtotalCents: 0,
  discountCents: 0,
  coupon: null,
  hasIssues: false,
  productionDays: 0,
};

export type CartActionResult = { ok: true; cart: CartView; message?: string } | { ok: false; error: string; cart?: CartView };
