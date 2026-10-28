import { describe, expect, it } from "vitest";
import { appointmentSchema } from "@/modules/appointments/schema";
import { verifyMercadoPagoSignature } from "@/modules/billing/providers/mercadopago";
import { passwordPolicyError } from "@/lib/validation";
import { createHmac } from "node:crypto";

describe("política de senha", () => {
  it("exige 8+ caracteres com letras e números", () => {
    expect(passwordPolicyError("abc123")).not.toBeNull();
    expect(passwordPolicyError("abcdefgh")).not.toBeNull();
    expect(passwordPolicyError("12345678")).not.toBeNull();
    expect(passwordPolicyError("senhaforte123")).toBeNull();
  });
});

describe("validação de atendimento", () => {
  const base = { customerId: "c1", serviceId: "s1", date: "2026-10-28" };

  it("exige data posterior no retorno manual", () => {
    expect(appointmentSchema.safeParse({ ...base, returnMode: "manual", nextReturnDate: "2026-10-28" }).success).toBe(false);
    expect(appointmentSchema.safeParse({ ...base, returnMode: "manual" }).success).toBe(false);
    expect(appointmentSchema.safeParse({ ...base, returnMode: "manual", nextReturnDate: "2026-11-28" }).success).toBe(true);
  });

  it("converte valor em centavos", () => {
    const parsed = appointmentSchema.parse({ ...base, amount: "1.250,00" });
    expect(parsed.amount).toBe(125000);
    expect(parsed.returnMode).toBe("auto");
  });
});

describe("assinatura de webhook do Mercado Pago (camada futura)", () => {
  it("valida o cabeçalho x-signature", () => {
    const secret = "segredo-de-teste";
    const manifest = "id:123;request-id:req-1;ts:1700000000;";
    const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
    expect(verifyMercadoPagoSignature({ signatureHeader: `ts=1700000000,v1=${v1}`, requestId: "req-1", dataId: "123", secret })).toBe(true);
    expect(verifyMercadoPagoSignature({ signatureHeader: `ts=1700000000,v1=${v1}`, requestId: "req-2", dataId: "123", secret })).toBe(
      false,
    );
    expect(verifyMercadoPagoSignature({ signatureHeader: null, requestId: "req-1", dataId: "123", secret })).toBe(false);
  });
});
