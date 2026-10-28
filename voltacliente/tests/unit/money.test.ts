import { describe, expect, it } from "vitest";
import { centsToInput, formatBRL, parseMoneyToCents } from "@/lib/money";

describe("valores monetários", () => {
  it.each([
    ["150", 15000],
    ["150,5", 15050],
    ["1.234,56", 123456],
    ["1,234.56", 123456],
    ["1234.56", 123456],
    ["R$ 89,90", 8990],
    ["1.500", 150000],
    ["0,99", 99],
  ])("%s → %d centavos", (input, cents) => {
    expect(parseMoneyToCents(input)).toBe(cents);
  });

  it("vazio é nulo e texto inválido é undefined", () => {
    expect(parseMoneyToCents("")).toBeNull();
    expect(parseMoneyToCents(null)).toBeNull();
    expect(parseMoneyToCents("abc")).toBeUndefined();
    expect(parseMoneyToCents("-10")).toBeUndefined();
    expect(parseMoneyToCents("1,2,3")).toBeUndefined();
  });

  it("formata em reais", () => {
    expect(formatBRL(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
    expect(centsToInput(8990)).toBe("89,90");
    expect(centsToInput(null)).toBe("");
  });
});

describe("formato compacto para eixos", () => {
  it("abrevia a partir de mil reais", async () => {
    const { formatBRLCompact } = await import("@/lib/money");
    expect(formatBRLCompact(15000).replace(/\s/g, " ")).toBe("R$ 150");
    expect(formatBRLCompact(120000).replace(/\s/g, " ")).toBe("R$ 1,2 mil");
  });
});
