import { describe, expect, it } from "vitest";
import { parseLocalDateTime, resolveDateRange, toLocalInputs, tzOffsetMinutes, zonedTimeToUtc } from "@/lib/dates";

// Quarta-feira, 14/10/2026, 15:00 em São Paulo (UTC-3) = 18:00Z
const NOW = new Date("2026-10-14T18:00:00.000Z");

describe("datas com fuso horário", () => {
  it("calcula o deslocamento de São Paulo e Manaus", () => {
    expect(tzOffsetMinutes(NOW, "America/Sao_Paulo")).toBe(-180);
    expect(tzOffsetMinutes(NOW, "America/Manaus")).toBe(-240);
  });

  it("converte horário local para UTC", () => {
    expect(zonedTimeToUtc(2026, 10, 18, 21, 30, "America/Sao_Paulo").toISOString()).toBe("2026-10-19T00:30:00.000Z");
    expect(zonedTimeToUtc(2026, 10, 18, 21, 30, "America/Manaus").toISOString()).toBe("2026-10-19T01:30:00.000Z");
  });

  it("valida datas locais", () => {
    expect(parseLocalDateTime("2026-02-31", "10:00")).toBeNull();
    expect(parseLocalDateTime("2026-10-18", "25:00")).toBeNull();
    expect(parseLocalDateTime("2026-10-18", "21:30")?.toISOString()).toBe("2026-10-19T00:30:00.000Z");
    expect(toLocalInputs(new Date("2026-10-19T00:30:00.000Z"))).toEqual({ date: "2026-10-18", time: "21:30" });
  });

  it("hoje vai de agora até o fim do dia local", () => {
    const r = resolveDateRange("today", NOW);
    expect(r.from).toEqual(NOW);
    expect(r.to.toISOString()).toBe("2026-10-15T02:59:59.999Z");
  });

  it("amanhã cobre o dia local inteiro", () => {
    const r = resolveDateRange("tomorrow", NOW);
    expect(r.from.toISOString()).toBe("2026-10-15T03:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-16T02:59:59.999Z");
  });

  it("fim de semana começa sexta às 18h e termina domingo 23h59", () => {
    const r = resolveDateRange("weekend", NOW);
    expect(r.from.toISOString()).toBe("2026-10-16T21:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-19T02:59:59.999Z");
  });

  it("no sábado, fim de semana começa agora", () => {
    const sat = new Date("2026-10-17T15:00:00.000Z");
    const r = resolveDateRange("weekend", sat);
    expect(r.from).toEqual(sat);
    expect(r.to.toISOString()).toBe("2026-10-19T02:59:59.999Z");
  });

  it("esta semana termina no domingo", () => {
    expect(resolveDateRange("week", NOW).to.toISOString()).toBe("2026-10-19T02:59:59.999Z");
  });

  it("aceita data específica e intervalo", () => {
    const one = resolveDateRange("2026-10-20", NOW);
    expect(one.from.toISOString()).toBe("2026-10-20T03:00:00.000Z");
    expect(one.to.toISOString()).toBe("2026-10-21T02:59:59.999Z");
    const range = resolveDateRange("2026-10-20..2026-10-22", NOW);
    expect(range.to.toISOString()).toBe("2026-10-23T02:59:59.999Z");
  });

  it("valor inválido cai em 'em breve'", () => {
    const r = resolveDateRange("bobagem", NOW);
    expect(r.from).toEqual(NOW);
    expect(r.to.getTime()).toBeGreaterThan(NOW.getTime());
  });
});
