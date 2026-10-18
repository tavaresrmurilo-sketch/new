import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@/server/auth/guards";
import { billingOverview, BillingError, openBillingPortal, startCheckout } from "@/server/billing/service";
import { createEvent, createOrg, createUser, prisma, resetDb, setPlan } from "../helpers";

beforeEach(async () => {
  await resetDb();
  await prisma.plan.update({ where: { tier: "PRO" }, data: { stripePriceMonthly: "price_pro_m", stripePriceYearly: "price_pro_y" } });
});

/** Cliente Stripe falso (sem rede) que registra as chamadas. */
function fakeStripe() {
  const customersCreate = vi.fn(async (params: Stripe.CustomerCreateParams) => ({ id: "cus_new", ...params }));
  const sessionsCreate = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => ({ id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1", ...params }));
  const portalCreate = vi.fn(async (params: Stripe.BillingPortal.SessionCreateParams) => ({ id: "bps_1", url: "https://billing.stripe.com/p/session/bps_1", ...params }));
  const stripe = {
    customers: { create: customersCreate },
    checkout: { sessions: { create: sessionsCreate } },
    billingPortal: { sessions: { create: portalCreate } },
  } as unknown as Pick<Stripe, "customers" | "checkout" | "billingPortal">;
  return { stripe, customersCreate, sessionsCreate, portalCreate };
}

async function setup() {
  const owner = await createUser({ name: "Dona" });
  const editor = await createUser({ name: "Editor" });
  const org = await createOrg(owner.id, { name: "Bar do Centro" });
  await prisma.membership.create({ data: { organizationId: org.id, userId: editor.id, role: "EDITOR" } });
  return { owner, editor, org };
}

describe("checkout", () => {
  it("cria o cliente uma vez, grava o vínculo e abre a sessão com os parâmetros certos", async () => {
    const { owner, org } = await setup();
    const f = fakeStripe();
    const res = await startCheckout(owner, org.id, "PRO", "year", f.stripe);
    expect(res.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);

    expect(f.customersCreate).toHaveBeenCalledTimes(1);
    expect(f.customersCreate.mock.calls[0][0].metadata).toEqual({ organizationId: org.id });
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).stripeCustomerId).toBe("cus_new");

    const params = f.sessionsCreate.mock.calls[0][0];
    expect(params).toMatchObject({
      mode: "subscription",
      customer: "cus_new",
      client_reference_id: org.id,
      line_items: [{ price: "price_pro_y", quantity: 1 }],
      subscription_data: { metadata: { organizationId: org.id, tier: "PRO" } },
      allow_promotion_codes: true,
      locale: "pt-BR",
    });
    expect(params.success_url).toMatch(/^https?:\/\/.+\/painel\/plano\?checkout=sucesso$/);
    expect(params.cancel_url).toMatch(/^https?:\/\/.+\/painel\/plano\?checkout=cancelado$/);

    // Segunda tentativa reaproveita o cliente.
    await startCheckout(owner, org.id, "PRO", "month", f.stripe);
    expect(f.customersCreate).toHaveBeenCalledTimes(1);
    expect(f.sessionsCreate.mock.calls[1][0].line_items).toEqual([{ price: "price_pro_m", quantity: 1 }]);
    expect(await prisma.auditLog.count({ where: { action: "billing.checkout_started" } })).toBe(2);
  });

  it("somente OWNER/ADMIN; sem Stripe configurado avisa claramente", async () => {
    const { owner, editor, org } = await setup();
    const f = fakeStripe();
    await expect(startCheckout(editor, org.id, "PRO", "month", f.stripe)).rejects.toBeInstanceOf(AuthError);
    const err = await startCheckout(owner, org.id, "PRO", "month", null).catch((e) => e);
    expect(err).toBeInstanceOf(BillingError);
    expect((err as BillingError).code).toBe("NOT_CONFIGURED");
    expect(f.sessionsCreate).not.toHaveBeenCalled();
  });

  it("plano sem preço configurado não abre checkout", async () => {
    const { owner, org } = await setup();
    const f = fakeStripe();
    await expect(startCheckout(owner, org.id, "BUSINESS", "month", f.stripe)).rejects.toThrow(/não está disponível/);
  });

  it("com assinatura vigente, mudanças vão pelo portal", async () => {
    const { owner, org } = await setup();
    await prisma.organization.update({ where: { id: org.id }, data: { stripeCustomerId: "cus_x", plan: "PRO" } });
    await prisma.subscription.create({ data: { organizationId: org.id, stripeSubscriptionId: "sub_x", stripePriceId: "price_pro_m", tier: "PRO", status: "ACTIVE" } });
    const f = fakeStripe();
    const err = await startCheckout(owner, org.id, "BUSINESS", "month", f.stripe).catch((e) => e);
    expect((err as BillingError).code).toBe("USE_PORTAL");

    const portal = await openBillingPortal(owner.id, org.id, f.stripe);
    expect(portal.url).toMatch(/^https:\/\/billing\.stripe\.com\//);
    expect(f.portalCreate.mock.calls[0][0]).toMatchObject({ customer: "cus_x" });
    expect(f.portalCreate.mock.calls[0][0].return_url).toMatch(/\/painel\/plano$/);
  });

  it("portal exige cliente Stripe e papel de gestão", async () => {
    const { owner, editor, org } = await setup();
    const f = fakeStripe();
    await expect(openBillingPortal(owner.id, org.id, f.stripe)).rejects.toMatchObject({ code: "NO_CUSTOMER" });
    await expect(openBillingPortal(editor.id, org.id, f.stripe)).rejects.toBeInstanceOf(AuthError);
  });
});

describe("visão geral do plano", () => {
  it("reflete o uso real da organização", async () => {
    const { org } = await setup();
    await setPlan(org.id, "PRO");
    await createEvent(org.id);
    await createEvent(org.id, { status: "DRAFT", publishedAt: null });
    await createEvent(org.id, { startsAt: new Date(Date.now() - 10 * 86_400_000), endsAt: new Date(Date.now() - 9 * 86_400_000) });
    const o = await billingOverview(org.id);
    expect(o.current.tier).toBe("PRO");
    expect(o.usage).toEqual({ activeEvents: 1, members: 2, venues: 0, boostsUsed: 0 });
    expect(o.hasActiveSubscription).toBe(false);
    expect(o.stripe.webhookUrl).toMatch(/\/api\/billing\/webhook$/);
  });
});
