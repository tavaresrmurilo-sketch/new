import { beforeEach, describe, expect, it } from "vitest";
import { PLAN_CATALOG } from "@/lib/plans";
import { changePlan, getSubscription } from "@/modules/billing/service";
import { completeOnboarding } from "@/modules/company/service";
import { createCustomer } from "@/modules/customers/service";
import { db } from "@/server/db";
import { createTenant, createUser, nextPhone, resetDb } from "./helpers";

beforeEach(resetDb);

describe("onboarding", () => {
  it("cria empresa, dono, assinatura de lançamento, serviços e modelos", async () => {
    const tenant = await createTenant("ClimaTech");
    const company = await db.company.findUniqueOrThrow({
      where: { id: tenant.companyId },
      include: { memberships: true, services: true, templates: true, subscription: true },
    });
    expect(company.memberships).toHaveLength(1);
    expect(company.memberships[0].role).toBe("OWNER");
    expect(company.services.map((s) => s.name).sort()).toEqual(["Instalação", "Limpeza"]);
    expect(company.templates.filter((t) => t.isDefault)).toHaveLength(1);
    expect(company.subscription).toMatchObject({ planCode: "INICIAL", status: "TRIAL", provider: "NONE" });
    expect(company.phone).toBe("(11) 3333-4444");
  });

  it("não permite configurar a empresa duas vezes", async () => {
    const user = await createUser();
    const input = {
      companyName: "Empresa A",
      segment: "OUTRO" as const,
      phone: "11987654321",
      timezone: "America/Sao_Paulo",
      defaultReturnIntervalDays: 30,
      services: [{ name: "Serviço", returnIntervalDays: 30 }],
    };
    await completeOnboarding(user.id, input);
    await expect(completeOnboarding(user.id, input)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(Promise.all([completeOnboarding(user.id, input), completeOnboarding(user.id, input)])).rejects.toBeTruthy();
    expect(await db.membership.count({ where: { userId: user.id } })).toBe(1);
  });

  it("rejeita dados inválidos no servidor", async () => {
    const user = await createUser();
    await expect(
      completeOnboarding(user.id, {
        companyName: "X",
        segment: "OUTRO",
        phone: "123",
        timezone: "Mars/Olympus",
        defaultReturnIntervalDays: 0,
        services: [],
      }),
    ).rejects.toThrow();
  });
});

describe("planos e limites", () => {
  it("planos do banco correspondem ao catálogo comercial", async () => {
    const plans = await db.plan.findMany({ orderBy: { sortOrder: "asc" } });
    expect(
      plans.map((p) => ({ code: p.code, priceCents: p.priceCents, customerLimit: p.customerLimit, advancedReports: p.advancedReports })),
    ).toEqual(
      PLAN_CATALOG.map((p) => ({
        code: p.code,
        priceCents: p.priceCents,
        customerLimit: p.customerLimit,
        advancedReports: p.advancedReports,
      })),
    );
  });

  it("aplica o limite de clientes do plano Inicial (100) e libera ao trocar de plano", async () => {
    const tenant = await createTenant("Limites");
    await db.customer.createMany({
      data: Array.from({ length: 100 }, (_, i) => ({
        companyId: tenant.companyId,
        name: `Cliente ${i}`,
        phone: "x",
        phoneNormalized: `55119${String(10000000 + i)}`,
      })),
    });
    await expect(createCustomer(tenant, { name: "Excedente", phone: nextPhone() })).rejects.toMatchObject({ code: "PLAN_LIMIT" });
    await changePlan(tenant, "PROFISSIONAL");
    await expect(createCustomer(tenant, { name: "Agora cabe", phone: nextPhone() })).resolves.toBeTruthy();
    expect((await getSubscription(tenant)).planCode).toBe("PROFISSIONAL");
  });

  it("impede rebaixar para um plano com limite menor que a base atual", async () => {
    const tenant = await createTenant("Downgrade");
    await changePlan(tenant, "BUSINESS");
    await db.customer.createMany({
      data: Array.from({ length: 101 }, (_, i) => ({
        companyId: tenant.companyId,
        name: `C${i}`,
        phone: "x",
        phoneNormalized: `55219${String(10000000 + i)}`,
      })),
    });
    await expect(changePlan(tenant, "INICIAL")).rejects.toMatchObject({ code: "PLAN_LIMIT" });
  });

  it("apenas dono/admin troca o plano", async () => {
    const tenant = await createTenant("Papéis");
    await expect(changePlan({ ...tenant, role: "MEMBER" }, "BUSINESS")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
