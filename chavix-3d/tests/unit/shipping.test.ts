import { describe, expect, it } from "vitest";
import { DEFAULT_SHIPPING_CONFIG, quoteShipping, quoteShippingMethod, type ShippingConfig } from "@/lib/shipping";
import { isLocalCity } from "@/lib/shipping/providers";

const config: ShippingConfig = {
  pickup: { enabled: true, instructions: "Combinar" },
  local: { enabled: true, priceCents: 1000, freeAboveCents: 12000, estimatedDays: 2, cities: ["Goiânia/GO", "Aparecida de Goiânia/GO"] },
  national: { enabled: true, priceCents: 2490, freeAboveCents: 19900, estimatedDays: 8 },
};

describe("frete", () => {
  it("lista as opções habilitadas", async () => {
    const quotes = await quoteShipping(config, { subtotalCents: 5000, city: "Goiania", state: "GO" });
    expect(quotes.map((q) => q.method)).toEqual(["PICKUP", "LOCAL_DELIVERY", "NATIONAL"]);
    expect(quotes.find((q) => q.method === "PICKUP")?.priceCents).toBe(0);
  });

  it("entrega local só nas cidades cadastradas (ignora acentos)", async () => {
    expect(isLocalCity(config.local.cities, "GOIANIA", "go")).toBe(true);
    expect(isLocalCity(config.local.cities, "Anápolis", "GO")).toBe(false);
    const quote = await quoteShippingMethod(config, "LOCAL_DELIVERY", { subtotalCents: 5000, city: "Anápolis", state: "GO" });
    expect(quote?.available).toBe(false);
  });

  it("frete grátis acima do valor configurado", async () => {
    const paid = await quoteShippingMethod(config, "NATIONAL", { subtotalCents: 19899 });
    const free = await quoteShippingMethod(config, "NATIONAL", { subtotalCents: 19900 });
    expect(paid?.priceCents).toBe(2490);
    expect(free?.priceCents).toBe(0);
    expect(free?.free).toBe(true);
  });

  it("método desabilitado não aparece", async () => {
    const quotes = await quoteShipping({ ...config, national: { ...config.national, enabled: false } }, { subtotalCents: 1 });
    expect(quotes.map((q) => q.method)).not.toContain("NATIONAL");
  });

  it("padrão tem retirada e envio nacional", async () => {
    const quotes = await quoteShipping(DEFAULT_SHIPPING_CONFIG, { subtotalCents: 1000 });
    expect(quotes.map((q) => q.method)).toEqual(["PICKUP", "NATIONAL"]);
  });
});
