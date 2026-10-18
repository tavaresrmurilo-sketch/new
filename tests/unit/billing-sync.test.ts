import { describe, expect, it } from "vitest";
import { bestYearlySavingsPct, displayPrice, hasYearlyOption, yearlySavings } from "@/components/pricing/pricing";
import { effectivePlan, isEntitled, mapStripeStatus, resolveTier, snapshotSubscription, subscriptionPeriodEnd, type SubscriptionLike } from "@/server/billing/sync";

const plans = [
  { tier: "FREE" as const, stripePriceMonthly: null, stripePriceYearly: null },
  { tier: "PRO" as const, stripePriceMonthly: "price_pro_m", stripePriceYearly: "price_pro_y" },
  { tier: "BUSINESS" as const, stripePriceMonthly: "price_biz_m", stripePriceYearly: "price_biz_y" },
];

function sub(over: Partial<SubscriptionLike> = {}): SubscriptionLike {
  return {
    id: "sub_1",
    status: "active",
    customer: "cus_1",
    metadata: { organizationId: "org_1", tier: "PRO" },
    cancel_at_period_end: false,
    items: { data: [{ price: { id: "price_pro_m", recurring: { interval: "month" } }, current_period_end: 1_900_000_000 }] },
    ...over,
  };
}

describe("status do Stripe → SubscriptionStatus", () => {
  it("mapeia todos os status conhecidos", () => {
    expect(mapStripeStatus("active")).toBe("ACTIVE");
    expect(mapStripeStatus("trialing")).toBe("TRIALING");
    expect(mapStripeStatus("past_due")).toBe("PAST_DUE");
    expect(mapStripeStatus("canceled")).toBe("CANCELED");
    expect(mapStripeStatus("incomplete")).toBe("INCOMPLETE");
    expect(mapStripeStatus("incomplete_expired")).toBe("INCOMPLETE_EXPIRED");
    expect(mapStripeStatus("unpaid")).toBe("UNPAID");
    expect(mapStripeStatus("paused")).toBe("PAUSED");
  });

  it("status desconhecido não concede recursos", () => {
    expect(mapStripeStatus("algo_novo")).toBe("INCOMPLETE");
    expect(isEntitled(mapStripeStatus("algo_novo"))).toBe(false);
  });

  it("plano efetivo: pago só com ativo, teste ou em atraso", () => {
    expect(effectivePlan("ACTIVE", "PRO")).toBe("PRO");
    expect(effectivePlan("TRIALING", "BUSINESS")).toBe("BUSINESS");
    expect(effectivePlan("PAST_DUE", "PRO")).toBe("PRO");
    for (const s of ["CANCELED", "INCOMPLETE", "INCOMPLETE_EXPIRED", "UNPAID", "PAUSED"] as const) expect(effectivePlan(s, "PRO")).toBe("FREE");
    expect(effectivePlan("ACTIVE", null)).toBe("FREE");
  });
});

describe("plano pelo preço", () => {
  it("usa o id do preço mensal ou anual", () => {
    expect(resolveTier("price_pro_m", plans)).toBe("PRO");
    expect(resolveTier("price_pro_y", plans)).toBe("PRO");
    expect(resolveTier("price_biz_y", plans)).toBe("BUSINESS");
  });

  it("cai no metadata quando o preço não está cadastrado; ignora metadata inválido", () => {
    expect(resolveTier("price_desconhecido", plans, "business")).toBe("BUSINESS");
    expect(resolveTier("price_desconhecido", plans, "FREE")).toBeNull();
    expect(resolveTier("price_desconhecido", plans, "ENTERPRISE")).toBeNull();
    expect(resolveTier(null, plans, null)).toBeNull();
  });

  it("o preço tem prioridade sobre o metadata", () => {
    expect(resolveTier("price_biz_m", plans, "PRO")).toBe("BUSINESS");
  });
});

describe("fim do período", () => {
  it("lê do item (API atual)", () => {
    expect(subscriptionPeriodEnd(sub())?.toISOString()).toBe(new Date(1_900_000_000 * 1000).toISOString());
  });

  it("lê do objeto (API antiga)", () => {
    const s = sub({ current_period_end: 1_800_000_000, items: { data: [{ price: { id: "price_pro_m" } }] } });
    expect(subscriptionPeriodEnd(s)?.getTime()).toBe(1_800_000_000 * 1000);
  });

  it("vários itens: usa o maior; sem dado: null", () => {
    const s = sub({ items: { data: [{ price: { id: "a" }, current_period_end: 10 }, { price: { id: "b" }, current_period_end: 20 }] } });
    expect(subscriptionPeriodEnd(s)?.getTime()).toBe(20_000);
    expect(subscriptionPeriodEnd({ items: { data: [] } })).toBeNull();
  });
});

describe("snapshot da assinatura", () => {
  it("converte assinatura anual com cancelamento agendado por cancel_at", () => {
    const snap = snapshotSubscription(
      sub({ cancel_at: 1_900_000_000, items: { data: [{ price: { id: "price_biz_y", recurring: { interval: "year" } }, current_period_end: 1_900_000_000 }] } }),
      plans,
    );
    expect(snap).toMatchObject({ tier: "BUSINESS", interval: "year", status: "ACTIVE", cancelAtPeriodEnd: true, organizationId: "org_1", customerId: "cus_1", stripePriceId: "price_biz_y" });
  });

  it("aceita customer expandido e metadata ausente", () => {
    const snap = snapshotSubscription(sub({ customer: { id: "cus_x" }, metadata: null }), plans);
    expect(snap.customerId).toBe("cus_x");
    expect(snap.organizationId).toBeNull();
    expect(snap.tier).toBe("PRO");
    expect(snap.cancelAtPeriodEnd).toBe(false);
  });
});

describe("economia do plano anual", () => {
  it("calcula a partir dos preços reais", () => {
    expect(yearlySavings(5900, 59000)).toEqual({ savedCents: 11800, pct: 16, monthlyEquivalentCents: 4917 });
    expect(yearlySavings(5900, null)).toBeNull();
    expect(yearlySavings(5900, 70800)).toBeNull(); // sem desconto, não anuncia economia
    expect(yearlySavings(0, 0)).toBeNull();
  });

  it("maior economia e disponibilidade do anual", () => {
    const list = [
      { priceMonthlyCents: 0, priceYearlyCents: null },
      { priceMonthlyCents: 5900, priceYearlyCents: 59000 },
      { priceMonthlyCents: 19900, priceYearlyCents: 199000 },
    ];
    expect(bestYearlySavingsPct(list)).toBe(16);
    expect(hasYearlyOption(list)).toBe(true);
    expect(hasYearlyOption([{ priceMonthlyCents: 5900, priceYearlyCents: null }])).toBe(false);
    expect(bestYearlySavingsPct([{ priceMonthlyCents: 5900, priceYearlyCents: null }])).toBeNull();
  });

  it("rótulos de preço", () => {
    expect(displayPrice({ priceMonthlyCents: 0, priceYearlyCents: null }, "month").amount).toBe("R$ 0");
    expect(displayPrice({ priceMonthlyCents: 5900, priceYearlyCents: 59000 }, "month")).toMatchObject({ amount: "R$ 59", suffix: "/mês" });
    const y = displayPrice({ priceMonthlyCents: 5900, priceYearlyCents: 59000 }, "year");
    expect(y.amount).toBe("R$ 49,17");
    expect(y.note).toContain("R$ 590 cobrados por ano");
    expect(y.note).toContain("R$ 118");
  });
});
