import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone, whatsappUrl } from "@/lib/phone";

describe("normalização de telefones", () => {
  it.each([
    ["(11) 98765-4321", "5511987654321"],
    ["11987654321", "5511987654321"],
    ["+55 11 98765-4321", "5511987654321"],
    ["55 (21) 3333-4444", "552133334444"],
    ["011 98765-4321", "5511987654321"],
    ["0055 11 98765 4321", "5511987654321"],
    ["+351 912 345 678", "351912345678"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["", "123", "(11) 8765-432", "(01) 98765-4321", "(10) 98765-4321", "11 88765-4321", "(11) 9876-5432", "abc"])(
    "rejeita %s",
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );

  it("formata para exibição", () => {
    expect(formatPhone("5511987654321")).toBe("(11) 98765-4321");
    expect(formatPhone("552133334444")).toBe("(21) 3333-4444");
    expect(formatPhone("351912345678")).toBe("+351912345678");
  });
});

describe("link do WhatsApp (envio assistido)", () => {
  it("gera wa.me com o texto codificado", () => {
    const url = whatsappUrl("5511987654321", "Olá, João! Tudo bem? 50% & mais");
    expect(url).toBe("https://wa.me/5511987654321?text=Ol%C3%A1%2C%20Jo%C3%A3o!%20Tudo%20bem%3F%2050%25%20%26%20mais");
    expect(new URL(url).searchParams.get("text")).toBe("Olá, João! Tudo bem? 50% & mais");
  });

  it("preserva quebras de linha", () => {
    expect(new URL(whatsappUrl("5511987654321", "linha 1\nlinha 2")).searchParams.get("text")).toBe("linha 1\nlinha 2");
  });
});
