import { createHmac } from "node:crypto";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { ROLE_DEFAULTS } from "@/lib/permissions";
import { can } from "@/server/auth/context";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { computeAccess } from "@/server/billing/access";
import { hasFeature } from "@/server/billing/feature-gate";
import { toCsv, toXlsx } from "@/server/reports/export";
import { decryptSecret, encryptSecret, hashToken } from "@/server/security/crypto";
import { verifyStripeSignature } from "@/services/billing/stripe";

describe("autenticação", () => {
  it("senha nunca é armazenada em texto puro e é verificada corretamente", async () => {
    const h = await hashPassword("SenhaForte123");
    expect(h).not.toContain("SenhaForte123");
    expect(await verifyPassword("SenhaForte123", h)).toBe(true);
    expect(await verifyPassword("errada", h)).toBe(false);
    expect(await verifyPassword("x", null)).toBe(false);
  });
  it("tokens são armazenados como hash", () => {
    expect(hashToken("abc")).not.toBe("abc");
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });
  it("segredos de webhook são cifrados de forma reversível apenas no servidor", () => {
    const enc = encryptSecret("whsec_123");
    expect(enc).not.toContain("whsec_123");
    expect(decryptSecret(enc)).toBe("whsec_123");
  });
});

describe("permissões (RBAC)", () => {
  const ctxOf = (role: keyof typeof ROLE_DEFAULTS) => ({ permissions: new Set(ROLE_DEFAULTS[role].permissions) });
  it("leitor não escreve nem vê financeiro", () => {
    expect(can(ctxOf("VIEWER"), "clients.read")).toBe(true);
    expect(can(ctxOf("VIEWER"), "clients.write")).toBe(false);
    expect(can(ctxOf("VIEWER"), "finance.read")).toBe(false);
  });
  it("administrador não gerencia cobrança nem exclui a conta", () => {
    expect(can(ctxOf("ADMIN"), "billing.manage")).toBe(false);
    expect(can(ctxOf("ADMIN"), "organization.delete")).toBe(false);
    expect(can(ctxOf("OWNER"), ["billing.manage", "organization.delete"])).toBe(true);
  });
  it("membro não aprova propostas", () => {
    expect(can(ctxOf("MEMBER"), "proposals.approve")).toBe(false);
    expect(can(ctxOf("MANAGER"), "proposals.approve")).toBe(true);
  });
});

describe("FeatureGate e política de acesso", () => {
  it("recurso só existe se estiver no plano", () => {
    const ctx = { subscription: { plan: { features: ["automations"] } } } as never;
    expect(hasFeature(ctx, "automations")).toBe(true);
    expect(hasFeature(ctx, "webhooks")).toBe(false);
    expect(hasFeature({ subscription: null } as never, "automations")).toBe(false);
  });
  it("teste expirado deixa somente leitura; suspensão bloqueia; dados nunca são apagados", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    expect(computeAccess({ blockedAt: null, deletionRequestedAt: null, subscription: { status: "TRIALING", trialEndsAt: new Date("2026-10-01"), currentPeriodEnd: null }, now }).level).toBe("READ_ONLY");
    expect(computeAccess({ blockedAt: null, deletionRequestedAt: null, subscription: { status: "TRIALING", trialEndsAt: new Date("2026-10-20"), currentPeriodEnd: null }, now }).level).toBe("FULL");
    expect(computeAccess({ blockedAt: null, deletionRequestedAt: null, subscription: { status: "SUSPENDED", trialEndsAt: null, currentPeriodEnd: null }, now }).level).toBe("BLOCKED");
    expect(computeAccess({ blockedAt: null, deletionRequestedAt: null, subscription: { status: "CANCELED", trialEndsAt: null, currentPeriodEnd: null }, now }).level).toBe("READ_ONLY");
    expect(computeAccess({ blockedAt: now, deletionRequestedAt: null, subscription: null, now }).level).toBe("BLOCKED");
  });
});

describe("exportações", () => {
  const cols = [{ key: "name", label: "Nome", type: "text" as const }, { key: "v", label: "Valor", type: "money" as const }];
  it("CSV neutraliza fórmulas e usa padrão brasileiro", () => {
    const csv = new TextDecoder("utf-8", { ignoreBOM: true }).decode(toCsv(cols, [{ name: "=HYPERLINK(\"x\")", v: 1234.5 }]));
    expect(csv.startsWith("﻿Nome;Valor")).toBe(true);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("1234,50");
  });
  it("XLSX é um pacote OOXML válido com números como números", () => {
    const files = unzipSync(toXlsx("Teste", cols, [{ name: "A & B", v: 10 }]));
    expect(Object.keys(files)).toContain("xl/worksheets/sheet1.xml");
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]!);
    expect(sheet).toContain("A &amp; B");
    expect(sheet).toMatch(/<c r="B2" s="2"><v>10<\/v><\/c>/);
  });
});

describe("webhook do Stripe", () => {
  it("aceita somente assinaturas válidas e recentes", () => {
    const secret = "whsec_test";
    const payload = '{"id":"evt_1"}';
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
    expect(verifyStripeSignature(payload, `t=${t},v1=${sig}`, secret)).toBe(true);
    expect(verifyStripeSignature(payload + "x", `t=${t},v1=${sig}`, secret)).toBe(false);
    expect(verifyStripeSignature(payload, `t=${t - 3600},v1=${createHmac("sha256", secret).update(`${t - 3600}.${payload}`).digest("hex")}`, secret)).toBe(false);
    expect(verifyStripeSignature(payload, null, secret)).toBe(false);
  });
});
