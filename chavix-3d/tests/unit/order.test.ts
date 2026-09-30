import { describe, expect, it } from "vitest";
import { generateOrderCode, normalizeOrderCode, ORDER_CODE_ALPHABET, orderCodeToTxid } from "@/lib/order-code";
import {
  adminTransitionsFor,
  canAdminTransition,
  canCustomerTransition,
  ORDER_STATUSES,
  STATUS_LABEL,
  timelineSteps,
} from "@/lib/order-status";

describe("código do pedido", () => {
  it("segue o formato CHX-XXXXXX sem caracteres ambíguos", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateOrderCode();
      expect(code).toMatch(/^CHX-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
    }
    expect(ORDER_CODE_ALPHABET).not.toMatch(/[01IO]/);
  });

  it("não é sequencial e praticamente não repete", () => {
    const codes = new Set(Array.from({ length: 5000 }, generateOrderCode));
    expect(codes.size).toBeGreaterThan(4990);
  });

  it("normaliza o que o cliente digita", () => {
    expect(normalizeOrderCode(" chx-a82f9b ")).toBe("CHX-A82F9B");
    expect(normalizeOrderCode("CHXA82F9B")).toBe("CHX-A82F9B");
    expect(normalizeOrderCode("ABC")).toBeNull();
  });

  it("vira txid Pix válido (só alfanumérico)", () => {
    expect(orderCodeToTxid("CHX-A82F91")).toBe("CHXA82F91");
  });
});

describe("máquina de status", () => {
  it("todos os status têm rótulo em português", () => {
    expect(ORDER_STATUSES.map((s) => STATUS_LABEL[s])).toEqual([
      "Aguardando pagamento",
      "Pagamento em análise",
      "Pago",
      "Em produção",
      "Pronto",
      "Enviado",
      "Entregue",
      "Cancelado",
    ]);
  });

  it("cliente só consegue avisar que pagou", () => {
    expect(canCustomerTransition("PENDING_PAYMENT", "PAYMENT_REVIEW")).toBe(true);
    for (const from of ORDER_STATUSES) {
      expect(canCustomerTransition(from, "PAID")).toBe(false);
      expect(canCustomerTransition(from, "CANCELLED")).toBe(false);
    }
    expect(canCustomerTransition("PAYMENT_REVIEW", "PAYMENT_REVIEW")).toBe(false);
  });

  it("admin segue o fluxo de produção", () => {
    expect(canAdminTransition("PAYMENT_REVIEW", "PAID", "NATIONAL")).toBe(true);
    expect(canAdminTransition("PENDING_PAYMENT", "PAID", "NATIONAL")).toBe(true);
    expect(canAdminTransition("PAID", "IN_PRODUCTION", "NATIONAL")).toBe(true);
    expect(canAdminTransition("IN_PRODUCTION", "READY", "NATIONAL")).toBe(true);
    expect(canAdminTransition("READY", "SHIPPED", "NATIONAL")).toBe(true);
    expect(canAdminTransition("SHIPPED", "DELIVERED", "NATIONAL")).toBe(true);
  });

  it("bloqueia saltos e estados finais", () => {
    expect(canAdminTransition("PENDING_PAYMENT", "IN_PRODUCTION", "NATIONAL")).toBe(false);
    expect(canAdminTransition("READY", "DELIVERED", "NATIONAL")).toBe(false);
    expect(canAdminTransition("READY", "SHIPPED", "PICKUP")).toBe(false);
    expect(canAdminTransition("READY", "DELIVERED", "PICKUP")).toBe(true);
    expect(adminTransitionsFor("DELIVERED", "NATIONAL")).toEqual([]);
    expect(adminTransitionsFor("CANCELLED", "NATIONAL")).toEqual([]);
    expect(canAdminTransition("SHIPPED", "CANCELLED", "NATIONAL")).toBe(false);
  });

  it("linha do tempo muda para retirada", () => {
    expect(timelineSteps("PICKUP")).not.toContain("SHIPPED");
    expect(timelineSteps("NATIONAL")).toContain("SHIPPED");
  });
});
