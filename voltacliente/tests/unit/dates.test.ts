import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  computeNextReturnDate,
  diffInDays,
  formatDate,
  humanizeElapsed,
  isISODate,
  parseFlexibleDate,
  periodRange,
  relativeDayLabel,
  startOfDayInZone,
  startOfWeek,
  todayIn,
} from "@/lib/dates";

describe("datas de calendário", () => {
  it("valida datas ISO reais", () => {
    expect(isISODate("2026-02-28")).toBe(true);
    expect(isISODate("2026-02-29")).toBe(false);
    expect(isISODate("2024-02-29")).toBe(true);
    expect(isISODate("2026-13-01")).toBe(false);
    expect(isISODate("28/10/2026")).toBe(false);
  });

  it("soma dias atravessando meses e anos", () => {
    expect(addDays("2026-12-25", 10)).toBe("2027-01-04");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("soma meses respeitando o último dia do mês", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-03-15", -3)).toBe("2025-12-15");
  });

  it("calcula diferença em dias", () => {
    expect(diffInDays("2026-10-28", "2026-10-01")).toBe(27);
    expect(diffInDays("2026-01-01", "2026-12-31")).toBe(-364);
  });

  it("começa a semana na segunda-feira", () => {
    expect(startOfWeek("2026-10-28")).toBe("2026-10-26"); // quarta → segunda
    expect(startOfWeek("2026-11-01")).toBe("2026-10-26"); // domingo → segunda anterior
  });
});

describe("cálculo do retorno", () => {
  it("soma o intervalo do serviço à data do atendimento", () => {
    expect(computeNextReturnDate("2026-04-12", 180)).toBe("2026-10-09");
    expect(computeNextReturnDate("2026-10-28", 30)).toBe("2026-11-27");
    expect(computeNextReturnDate("2024-02-29", 365)).toBe("2025-02-28");
  });

  it("rejeita intervalos inválidos", () => {
    expect(() => computeNextReturnDate("2026-10-28", 0)).toThrow();
    expect(() => computeNextReturnDate("2026-10-28", 1.5)).toThrow();
  });
});

describe("fuso horário da empresa", () => {
  it("usa a data local do fuso, não a do servidor", () => {
    // 02:30 UTC de 29/10 ainda é 28/10 em São Paulo (UTC-3).
    const instant = new Date("2026-10-29T02:30:00Z");
    expect(todayIn("America/Sao_Paulo", instant)).toBe("2026-10-28");
    expect(todayIn("UTC", instant)).toBe("2026-10-29");
    expect(todayIn("America/Manaus", new Date("2026-10-29T03:30:00Z"))).toBe("2026-10-28");
  });

  it("converte meia-noite local em instante UTC", () => {
    expect(startOfDayInZone("2026-10-28", "America/Sao_Paulo").toISOString()).toBe("2026-10-28T03:00:00.000Z");
    // Lisboa em horário de verão (UTC+1) e de inverno (UTC+0).
    expect(startOfDayInZone("2026-07-01", "Europe/Lisbon").toISOString()).toBe("2026-06-30T23:00:00.000Z");
    expect(startOfDayInZone("2026-12-01", "Europe/Lisbon").toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
});

describe("formatação", () => {
  it("formata e interpreta datas brasileiras", () => {
    expect(formatDate("2026-04-12")).toBe("12/04/2026");
    expect(parseFlexibleDate("5/3/2025")).toBe("2025-03-05");
    expect(parseFlexibleDate("2025-03-05")).toBe("2025-03-05");
    expect(parseFlexibleDate("31/02/2025")).toBeNull();
  });

  it("gera rótulos relativos", () => {
    expect(relativeDayLabel("2026-10-28", "2026-10-28")).toBe("Hoje");
    expect(relativeDayLabel("2026-10-29", "2026-10-28")).toBe("Amanhã");
    expect(relativeDayLabel("2026-10-20", "2026-10-28")).toBe("há 8 dias");
    expect(relativeDayLabel("2026-11-02", "2026-10-28")).toBe("em 5 dias");
  });

  it("humaniza o tempo decorrido", () => {
    expect(humanizeElapsed("2026-09-13", "2026-10-28")).toBe("45 dias");
    expect(humanizeElapsed("2026-04-12", "2026-10-28")).toBe("6 meses");
    expect(humanizeElapsed("2025-10-28", "2026-10-28")).toBe("1 ano");
    expect(humanizeElapsed("2025-08-20", "2026-10-28")).toBe("1 ano e 2 meses");
    expect(humanizeElapsed("2026-08-28", "2026-10-27")).toBe("1 mês");
  });

  it("calcula intervalos de período terminando hoje", () => {
    expect(periodRange("7d", "2026-10-28")).toEqual({ from: "2026-10-22", to: "2026-10-28" });
    expect(periodRange("12m", "2026-10-28")).toEqual({ from: "2025-11-01", to: "2026-10-28" });
    expect(periodRange("ytd", "2026-10-28")).toEqual({ from: "2026-01-01", to: "2026-10-28" });
  });
});
