import { describe, expect, it } from "vitest";
import { eventWhenLabel, formatDistance, formatMoney, priceLabel } from "@/lib/format";

const NOW = new Date("2026-10-14T18:00:00.000Z"); // qua 15:00 BRT

describe("formatação", () => {
  it("preços", () => {
    expect(priceLabel(true, null, null)).toBe("Grátis");
    expect(priceLabel(false, 4000, null)).toBe("R$ 40");
    expect(priceLabel(false, 4000, 12050)).toBe("R$ 40 – R$ 120,50");
    expect(priceLabel(false, null, null)).toBe("Pago");
    expect(formatMoney(5900)).toBe("R$ 59");
  });

  it("distâncias", () => {
    expect(formatDistance(0.234)).toBe("230 m");
    expect(formatDistance(2.46)).toBe("2,5 km");
    expect(formatDistance(23.4)).toBe("23 km");
  });

  it("quando: agora, hoje, amanhã, data e vários dias", () => {
    const h = 3_600_000;
    expect(eventWhenLabel(new Date(NOW.getTime() - h), new Date(NOW.getTime() + h), NOW)).toBe("Acontecendo agora");
    expect(eventWhenLabel(new Date("2026-10-14T23:00:00Z"), new Date("2026-10-15T03:00:00Z"), NOW)).toBe("Hoje · 20:00");
    expect(eventWhenLabel(new Date("2026-10-15T23:00:00Z"), new Date("2026-10-16T02:00:00Z"), NOW)).toBe("Amanhã · 20:00");
    expect(eventWhenLabel(new Date("2026-10-18T00:30:00Z"), new Date("2026-10-18T04:00:00Z"), NOW)).toMatch(/^sáb, 17 out · 21:30$/);
    expect(eventWhenLabel(new Date("2026-10-20T13:00:00Z"), new Date("2026-10-22T22:00:00Z"), NOW)).toBe("20 – 22 out");
  });
});
