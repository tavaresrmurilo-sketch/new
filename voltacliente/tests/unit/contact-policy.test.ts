import { describe, expect, it } from "vitest";
import { emailDecision, phoneCallDecision, whatsappDecision } from "@/lib/contact-policy";

const base = { contactPreference: "WHATSAPP" as const, marketingConsent: true, doNotContact: false, email: "a@b.com" };

describe("política de contato", () => {
  it("permite WhatsApp com consentimento e preferência compatível", () => {
    expect(whatsappDecision(base).allowed).toBe(true);
    expect(whatsappDecision({ ...base, contactPreference: "ANY" }).allowed).toBe(true);
  });

  it("bloqueia quando o cliente pediu para não ser contatado", () => {
    const subject = { ...base, doNotContact: true };
    expect(whatsappDecision(subject).allowed).toBe(false);
    expect(phoneCallDecision(subject).allowed).toBe(false);
    expect(emailDecision({ ...subject, contactPreference: "EMAIL" }).allowed).toBe(false);
  });

  it("bloqueia WhatsApp sem consentimento", () => {
    const decision = whatsappDecision({ ...base, marketingConsent: false });
    expect(decision.allowed).toBe(false);
  });

  it("respeita a preferência de canal", () => {
    expect(whatsappDecision({ ...base, contactPreference: "PHONE" }).allowed).toBe(false);
    expect(phoneCallDecision({ ...base, contactPreference: "PHONE" }).allowed).toBe(true);
    expect(emailDecision({ ...base, contactPreference: "EMAIL" }).allowed).toBe(true);
    expect(emailDecision({ ...base, contactPreference: "EMAIL", email: null }).allowed).toBe(false);
  });
});
