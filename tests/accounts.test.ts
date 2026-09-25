import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { homeFor } from "@/server/auth/session";
import { ensureAdmin } from "@/server/bootstrap/admin";
import { registerSchema } from "@/server/schemas";
import { verifyPassword } from "@/server/auth/password";

const email = `admin-test-${Date.now()}@example.com`;

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("tipos de conta", () => {
  it("cadastro de Pessoa exige nome e sobrenome", () => {
    const ok = registerSchema.safeParse({ accountType: "PERSON", firstName: "Ana", lastName: "Silva", email: "ana@x.com", password: "SenhaForte123", acceptTerms: true });
    expect(ok.success).toBe(true);
    const bad = registerSchema.safeParse({ accountType: "PERSON", firstName: "Ana", email: "ana@x.com", password: "SenhaForte123", acceptTerms: true });
    expect(bad.success).toBe(false);
  });
  it("cadastro de Empresa não exige CNPJ", () => {
    const r = registerSchema.safeParse({ accountType: "COMPANY", companyName: "ACME", name: "João", email: "j@acme.com", password: "SenhaForte123", acceptTerms: true });
    expect(r.success).toBe(true);
  });
  it("cadastro público nunca cria ADMIN", () => {
    const r = registerSchema.safeParse({ accountType: "ADMIN", firstName: "X", lastName: "Y", email: "x@y.com", password: "SenhaForte123", acceptTerms: true });
    expect(r.success).toBe(false);
  });
  it("destino após login por perfil", () => {
    expect(homeFor("ADMIN", false, true)).toBe("/admin");
    expect(homeFor("PERSON", true, true)).toBe("/dashboard");
    expect(homeFor("COMPANY", true, false)).toBe("/onboarding");
  });
});

describe("administrador via .env", () => {
  it("não cria sem variáveis e não usa senha fixa", async () => {
    const r = await ensureAdmin(prisma, {});
    expect(r.status).toBe("skipped");
  });
  it("cria com hash bcrypt e é idempotente", async () => {
    const env = { ADMIN_NAME: "Admin Teste", ADMIN_EMAIL: email, ADMIN_PASSWORD: "SenhaAdmin12345" };
    expect((await ensureAdmin(prisma, env)).status).toBe("created");
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(u.userRole).toBe("ADMIN");
    expect(u.passwordHash).not.toContain("SenhaAdmin12345");
    expect(await verifyPassword("SenhaAdmin12345", u.passwordHash)).toBe(true);
    expect((await ensureAdmin(prisma, env)).status).toBe("exists");
  });
});
