import { describe, expect, it } from "vitest";
import { formatBRL, parseBRL, percentOf } from "@/lib/money";
import { computeTotals, effectivePriceCents, resolveCustomizations, tierPercent, type CustomizationDef } from "@/lib/pricing";
import { couponDiscountCents, evaluateCoupon, type CouponRule } from "@/lib/coupons";
import { DEFAULT_CUSTOM_BUILDER, quoteCustomKeychain } from "@/lib/custom-builder";

describe("dinheiro em centavos", () => {
  it("formata em reais", () => {
    expect(formatBRL(1990)).toBe("R$ 19,90");
    expect(formatBRL(123456)).toBe("R$ 1.234,56");
  });
  it("lê valores digitados", () => {
    expect(parseBRL("19,90")).toBe(1990);
    expect(parseBRL("R$ 1.234,56")).toBe(123456);
    expect(parseBRL("20")).toBe(2000);
    expect(parseBRL("0,1")).toBe(10);
    expect(parseBRL("abc")).toBeNull();
    expect(parseBRL("-5")).toBeNull();
  });
  it("0,1 + 0,2 não vira 0,30000000000000004", () => {
    expect(10 + 20).toBe(30);
    expect(percentOf(3333, 10)).toBe(333);
  });
});

describe("preço efetivo", () => {
  it("usa promocional só quando menor", () => {
    expect(effectivePriceCents(2990, 2490)).toBe(2490);
    expect(effectivePriceCents(2990, 3500)).toBe(2990);
    expect(effectivePriceCents(2990, null)).toBe(2990);
    expect(effectivePriceCents(2990, 0)).toBe(2990);
  });
});

describe("personalizações do produto", () => {
  const defs: CustomizationDef[] = [
    { id: "nome", label: "Nome", type: "TEXT", required: true, maxLength: 12, priceCents: 500, options: [] },
    {
      id: "argola",
      label: "Argola",
      type: "SELECT",
      required: false,
      maxLength: null,
      priceCents: 0,
      options: [
        { label: "Prata", priceCents: 0 },
        { label: "Mosquetão", priceCents: 300 },
      ],
    },
  ];
  it("soma adicionais a partir do cadastro, não do navegador", () => {
    const result = resolveCustomizations(defs, { nome: "Ana", argola: "Mosquetão", priceCents: "1" });
    expect(result).toEqual({
      ok: true,
      extraCents: 800,
      chosen: [
        { label: "Nome", value: "Ana", priceCents: 500 },
        { label: "Argola", value: "Mosquetão", priceCents: 300 },
      ],
    });
  });
  it("valida obrigatórios, limites e opções", () => {
    expect(resolveCustomizations(defs, {}).ok).toBe(false);
    expect(resolveCustomizations(defs, { nome: "x".repeat(13) }).ok).toBe(false);
    expect(resolveCustomizations(defs, { nome: "Ana", argola: "Ouro" }).ok).toBe(false);
  });
});

describe("totais do pedido", () => {
  it("subtotal - desconto + frete", () => {
    const totals = computeTotals(
      [
        { unitPriceCents: 2490, quantity: 2 },
        { unitPriceCents: 1990, quantity: 1, setupFeeCents: 1500 },
      ],
      697,
      2490,
    );
    expect(totals).toEqual({ subtotalCents: 8470, discountCents: 697, shippingCents: 2490, totalCents: 10263 });
  });
  it("desconto nunca passa do subtotal", () => {
    expect(computeTotals([{ unitPriceCents: 1000, quantity: 1 }], 5000, 0).totalCents).toBe(0);
  });
});

describe("cupons", () => {
  const base: CouponRule = {
    code: "CHAVIX10",
    type: "PERCENT",
    value: 10,
    active: true,
    minSubtotalCents: null,
    maxUses: null,
    usedCount: 0,
    startsAt: null,
    expiresAt: null,
    firstPurchaseOnly: false,
  };
  const now = new Date("2026-10-01T12:00:00Z");

  it("percentual arredonda para baixo", () => {
    expect(couponDiscountCents(base, 4999)).toBe(499);
  });
  it("valor fixo limitado ao subtotal", () => {
    expect(couponDiscountCents({ type: "FIXED", value: 1500 }, 1000)).toBe(1000);
  });
  it("respeita ativo, validade, limite, mínimo e primeira compra", () => {
    expect(evaluateCoupon(base, { subtotalCents: 5000, now })).toEqual({ ok: true, discountCents: 500 });
    expect(evaluateCoupon({ ...base, active: false }, { subtotalCents: 5000, now }).ok).toBe(false);
    expect(evaluateCoupon({ ...base, expiresAt: new Date("2026-09-30") }, { subtotalCents: 5000, now }).ok).toBe(false);
    expect(evaluateCoupon({ ...base, startsAt: new Date("2026-10-02") }, { subtotalCents: 5000, now }).ok).toBe(false);
    expect(evaluateCoupon({ ...base, maxUses: 3, usedCount: 3 }, { subtotalCents: 5000, now }).ok).toBe(false);
    expect(evaluateCoupon({ ...base, minSubtotalCents: 8000 }, { subtotalCents: 5000, now }).ok).toBe(false);
    expect(evaluateCoupon({ ...base, firstPurchaseOnly: true }, { subtotalCents: 5000, now, isFirstPurchase: false }).ok).toBe(false);
    expect(evaluateCoupon({ ...base, firstPurchaseOnly: true }, { subtotalCents: 5000, now, isFirstPurchase: true }).ok).toBe(true);
  });
});

describe("chaveiro personalizado", () => {
  const config = DEFAULT_CUSTOM_BUILDER;

  it("calcula a estimativa com adicionais", () => {
    const quote = quoteCustomKeychain(config, { shapeId: "hexagono", colorId: "seda-dourada", text: "Maria Eduarda", notes: "", quantity: 1 }, false);
    // base 2490 + formato 200 + cor 300 + 2 caracteres extra (12 letras - 10 inclusas) × 50
    expect(quote.ok && quote.unitPriceCents).toBe(3090);
    expect(quote.ok && quote.totalCents).toBe(3090);
  });

  it("aplica desconto por quantidade e taxa única de referência", () => {
    const quote = quoteCustomKeychain(config, { shapeId: "tag", colorId: "grafite", text: "Ana", notes: "", quantity: 10 }, true);
    expect(tierPercent(config.quantityTiers, 10)).toBe(10);
    expect(quote.ok && quote.unitPriceCents).toBe(2241); // 2490 - 10% (249)
    expect(quote.ok && quote.setupFeeCents).toBe(1500);
    expect(quote.ok && quote.totalCents).toBe(2241 * 10 + 1500);
  });

  it("valida formato, cor, texto e referência obrigatória", () => {
    expect(quoteCustomKeychain(config, { shapeId: "x", colorId: "grafite", text: "Ana", notes: "", quantity: 1 }, false).ok).toBe(false);
    expect(quoteCustomKeychain(config, { shapeId: "tag", colorId: "x", text: "Ana", notes: "", quantity: 1 }, false).ok).toBe(false);
    expect(quoteCustomKeychain(config, { shapeId: "tag", colorId: "grafite", text: "", notes: "", quantity: 1 }, false).ok).toBe(false);
    expect(quoteCustomKeychain(config, { shapeId: "livre", colorId: "grafite", text: "Ana", notes: "", quantity: 1 }, false).ok).toBe(false);
    expect(quoteCustomKeychain(config, { shapeId: "tag", colorId: "grafite", text: "x".repeat(19), notes: "", quantity: 1 }, false).ok).toBe(false);
    expect(quoteCustomKeychain(config, { shapeId: "tag", colorId: "grafite", text: "Ana", notes: "", quantity: 999 }, false).ok).toBe(false);
  });
});
