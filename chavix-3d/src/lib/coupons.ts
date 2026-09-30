import { formatBRL, percentOf } from "@/lib/money";

export interface CouponRule {
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  active: boolean;
  minSubtotalCents: number | null;
  maxUses: number | null;
  usedCount: number;
  startsAt: Date | null;
  expiresAt: Date | null;
  firstPurchaseOnly: boolean;
}

export type CouponEvaluation = { ok: true; discountCents: number } | { ok: false; reason: string };

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

export function couponDiscountCents(coupon: Pick<CouponRule, "type" | "value">, subtotalCents: number): number {
  const raw = coupon.type === "PERCENT" ? percentOf(subtotalCents, Math.min(100, Math.max(0, coupon.value))) : coupon.value;
  return Math.max(0, Math.min(raw, subtotalCents));
}

/**
 * Regras do cupom avaliadas no servidor. `isFirstPurchase` só é conhecido no checkout
 * (depende do e-mail/telefone); no carrinho usamos `undefined` e a regra é conferida depois.
 */
export function evaluateCoupon(
  coupon: CouponRule,
  ctx: { subtotalCents: number; now: Date; isFirstPurchase?: boolean },
): CouponEvaluation {
  if (!coupon.active) return { ok: false, reason: "Cupom inválido ou inativo" };
  if (coupon.startsAt && ctx.now < coupon.startsAt) return { ok: false, reason: "Este cupom ainda não começou a valer" };
  if (coupon.expiresAt && ctx.now > coupon.expiresAt) return { ok: false, reason: "Este cupom expirou" };
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, reason: "Este cupom atingiu o limite de usos" };
  }
  if (coupon.minSubtotalCents != null && ctx.subtotalCents < coupon.minSubtotalCents) {
    return { ok: false, reason: `Cupom válido para compras a partir de ${formatBRL(coupon.minSubtotalCents)}` };
  }
  if (coupon.firstPurchaseOnly && ctx.isFirstPurchase === false) {
    return { ok: false, reason: "Cupom válido apenas na primeira compra" };
  }
  const discountCents = couponDiscountCents(coupon, ctx.subtotalCents);
  if (discountCents <= 0) return { ok: false, reason: "Cupom sem desconto para este carrinho" };
  return { ok: true, discountCents };
}
