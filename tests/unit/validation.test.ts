import { describe, expect, it } from "vitest";
import { loginSchema, passwordSchema, registerSchema } from "@/lib/validation/auth";

describe("validação de autenticação", () => {
  it("senha forte", () => {
    expect(passwordSchema.safeParse("curta1").success).toBe(false);
    expect(passwordSchema.safeParse("somenteletras").success).toBe(false);
    expect(passwordSchema.safeParse("12345678").success).toBe(false);
    expect(passwordSchema.safeParse("senha123").success).toBe(false); // comum
    expect(passwordSchema.safeParse("festa2026x").success).toBe(true);
  });
  it("cadastro normaliza e-mail e exige termos", () => {
    const ok = registerSchema.safeParse({ name: " Ana ", email: " ANA@Email.COM ", password: "senha12345", acceptTerms: "on" });
    expect(ok.success && ok.data.email).toBe("ana@email.com");
    expect(ok.success && ok.data.name).toBe("Ana");
    expect(registerSchema.safeParse({ name: "Ana", email: "ana@email.com", password: "senha12345" }).success).toBe(false);
  });
  it("login rejeita e-mail inválido", () => {
    expect(loginSchema.safeParse({ email: "nao-e-email", password: "x" }).success).toBe(false);
  });
});
