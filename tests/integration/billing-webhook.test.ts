import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/server/env";
import { testSignatureHeader, verifyWebhookEvent, WebhookSignatureError } from "@/server/billing/stripe";
import { syncSubscription, type SubscriptionLike } from "@/server/billing/sync";
import { processStripeEvent } from "@/server/billing/webhook";
import { createOrg, createUser, prisma, resetDb } from "../helpers";

const SECRET = "whsec_test_mixtour_secret";
let seq = 0;

beforeEach(async () => {
  await resetDb();
  await prisma.plan.update({ where: { tier: "PRO" }, data: { stripePriceMonthly: "price_pro_m", stripePriceYearly: "price_pro_y" } });
  await prisma.plan.update({ where: { tier: "BUSINESS" }, data: { stripePriceMonthly: "price_biz_m", stripePriceYearly: "price_biz_y" } });
});

function subscription(orgId: string | null, over: Partial<SubscriptionLike> = {}): SubscriptionLike {
  return {
    id: "sub_A",
    status: "active",
    customer: "cus_A",
    metadata: orgId ? { organizationId: orgId, tier: "PRO" } : {},
    cancel_at_period_end: false,
    items: { data: [{ price: { id: "price_pro_m", recurring: { interval: "month" } }, current_period_end: 1_900_000_000 }] },
    ...over,
  };
}

function event(type: string, object: unknown, id = `evt_${++seq}`): Stripe.Event {
  return { id, object: "event", type, created: 1_800_000_000, livemode: false, pending_webhooks: 1, request: null, api_version: null, data: { object } } as unknown as Stripe.Event;
}

async function setup() {
  const owner = await createUser({ name: "Dona da Casa" });
  const admin = await createUser({ name: "Admin da Casa" });
  const editor = await createUser({ name: "Editor da Casa" });
  const org = await createOrg(owner.id, { name: "Casa de Shows" });
  await prisma.membership.createMany({
    data: [
      { organizationId: org.id, userId: admin.id, role: "ADMIN" },
      { organizationId: org.id, userId: editor.id, role: "EDITOR" },
    ],
  });
  return { owner, admin, editor, org };
}

describe("assinatura do webhook", () => {
  it("aceita assinatura válida e rejeita corpo adulterado, segredo errado ou cabeçalho ausente", () => {
    const payload = JSON.stringify({ id: "evt_sig", object: "event", type: "invoice.paid", data: { object: {} } });
    const header = testSignatureHeader(payload, SECRET);
    expect(verifyWebhookEvent(payload, header, SECRET).id).toBe("evt_sig");
    expect(() => verifyWebhookEvent(payload.replace("invoice.paid", "invoice.payment_failed"), header, SECRET)).toThrow(WebhookSignatureError);
    expect(() => verifyWebhookEvent(payload, header, "whsec_outro")).toThrow(WebhookSignatureError);
    expect(() => verifyWebhookEvent(payload, null, SECRET)).toThrow(WebhookSignatureError);
    expect(() => verifyWebhookEvent(payload, header, undefined)).toThrow(WebhookSignatureError);
  });

  it("rejeita assinatura antiga (fora da tolerância)", () => {
    const payload = JSON.stringify({ id: "evt_old", object: "event" });
    const header = testSignatureHeader(payload, SECRET, Math.floor(Date.now() / 1000) - 3600);
    expect(() => verifyWebhookEvent(payload, header, SECRET)).toThrow(WebhookSignatureError);
  });
});

describe("eventos do Stripe", () => {
  it("checkout concluído busca a assinatura, ativa o plano, vincula o cliente e avisa a gestão", async () => {
    const { owner, admin, editor, org } = await setup();
    const retrieve = vi.fn(async () => subscription(org.id));
    const session = { id: "cs_1", object: "checkout.session", mode: "subscription", subscription: "sub_A", customer: "cus_A", client_reference_id: org.id, metadata: {} };
    const out = await processStripeEvent(event("checkout.session.completed", session), { retrieveSubscription: retrieve });

    expect(out).toMatchObject({ duplicate: false, handled: true, sync: { status: "synced", plan: "PRO", changed: true } });
    expect(retrieve).toHaveBeenCalledWith("sub_A");
    const updated = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(updated.plan).toBe("PRO");
    expect(updated.stripeCustomerId).toBe("cus_A");
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { organizationId: org.id } });
    expect(sub).toMatchObject({ stripeSubscriptionId: "sub_A", tier: "PRO", status: "ACTIVE", interval: "month", cancelAtPeriodEnd: false });
    expect(sub.currentPeriodEnd?.getTime()).toBe(1_900_000_000 * 1000);
    expect(await prisma.auditLog.count({ where: { action: "billing.plan_changed", targetId: org.id } })).toBe(1);
    const notified = await prisma.notification.findMany({ where: { type: "BILLING" }, select: { userId: true } });
    expect(notified.map((n) => n.userId).sort()).toEqual([owner.id, admin.id].sort());
    expect(notified.some((n) => n.userId === editor.id)).toBe(false);
  });

  it("checkout sem assinatura (pagamento avulso) é ignorado", async () => {
    const out = await processStripeEvent(event("checkout.session.completed", { mode: "payment", subscription: null }), {});
    expect(out).toMatchObject({ duplicate: false, handled: false });
  });

  it("atualizações: em atraso mantém o plano; cancelada volta ao Gratuito; troca para Business pelo preço", async () => {
    const { org } = await setup();
    const deps = {};
    await processStripeEvent(event("customer.subscription.created", subscription(org.id)), deps);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).plan).toBe("PRO");

    await processStripeEvent(event("customer.subscription.updated", subscription(org.id, { status: "past_due" })), deps);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).plan).toBe("PRO");
    expect((await prisma.subscription.findUniqueOrThrow({ where: { organizationId: org.id } })).status).toBe("PAST_DUE");

    const biz = subscription(org.id, { items: { data: [{ price: { id: "price_biz_y", recurring: { interval: "year" } }, current_period_end: 1_950_000_000 }] } });
    await processStripeEvent(event("customer.subscription.updated", { ...biz, status: "active" }), deps);
    const s = await prisma.subscription.findUniqueOrThrow({ where: { organizationId: org.id } });
    expect(s).toMatchObject({ tier: "BUSINESS", interval: "year", status: "ACTIVE" });
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).plan).toBe("BUSINESS");

    await processStripeEvent(event("customer.subscription.updated", subscription(org.id, { status: "unpaid" })), deps);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).plan).toBe("FREE");
  });

  it("cancelamento (deleted) volta ao Gratuito e registra auditoria", async () => {
    const { org } = await setup();
    await processStripeEvent(event("customer.subscription.created", subscription(org.id)), {});
    await processStripeEvent(event("customer.subscription.deleted", subscription(org.id, { status: "canceled" })), {});
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).plan).toBe("FREE");
    expect((await prisma.subscription.findUniqueOrThrow({ where: { organizationId: org.id } })).status).toBe("CANCELED");
    const logs = await prisma.auditLog.findMany({ where: { action: "billing.plan_changed", targetId: org.id }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => (l.metadata as { to: string }).to)).toEqual(["PRO", "FREE"]);
  });

  it("cancelamento agendado fica marcado sem perder o plano", async () => {
    const { org } = await setup();
    await processStripeEvent(event("customer.subscription.updated", subscription(org.id, { cancel_at_period_end: true })), {});
    const s = await prisma.subscription.findUniqueOrThrow({ where: { organizationId: org.id } });
    expect(s.cancelAtPeriodEnd).toBe(true);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).plan).toBe("PRO");
  });

  it("evento de uma assinatura antiga não derruba a assinatura vigente", async () => {
    const { org } = await setup();
    await processStripeEvent(event("customer.subscription.created", subscription(org.id, { id: "sub_NOVA" })), {});
    const out = await processStripeEvent(event("customer.subscription.deleted", subscription(org.id, { id: "sub_VELHA", status: "canceled" })), {});
    expect(out).toMatchObject({ sync: { status: "ignored", reason: "superseded" } });
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).plan).toBe("PRO");
  });

  it("encontra a organização pelo cliente Stripe quando falta metadata", async () => {
    const { org } = await setup();
    await prisma.organization.update({ where: { id: org.id }, data: { stripeCustomerId: "cus_A" } });
    const out = await syncSubscription(subscription(null, { current_period_end: 1_800_000_000, items: { data: [{ price: { id: "price_pro_y", recurring: { interval: "year" } } }] } }));
    expect(out).toMatchObject({ status: "synced", organizationId: org.id, plan: "PRO" });
    const s = await prisma.subscription.findUniqueOrThrow({ where: { organizationId: org.id } });
    expect(s.currentPeriodEnd?.getTime()).toBe(1_800_000_000 * 1000);
    expect(s.interval).toBe("year");
  });

  it("assinatura sem organização correspondente é ignorada sem erro", async () => {
    expect(await syncSubscription(subscription("org_inexistente", { customer: "cus_zzz" }))).toEqual({ status: "ignored", reason: "org_not_found" });
  });

  it("idempotência: o mesmo evento duas vezes é processado uma vez", async () => {
    const { org } = await setup();
    const e = event("customer.subscription.created", subscription(org.id), "evt_repetido");
    expect(await processStripeEvent(e, {})).toMatchObject({ duplicate: false });
    expect(await processStripeEvent(e, {})).toEqual({ duplicate: true });
    expect(await prisma.stripeEvent.count({ where: { id: "evt_repetido" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "billing.plan_changed" } })).toBe(1);
  });

  it("falha no processamento desfaz o registro para o reenvio do Stripe funcionar", async () => {
    const { org } = await setup();
    const e = event("customer.subscription.updated", subscription(org.id), "evt_falha");
    const failing = { retrieveSubscription: vi.fn(async () => Promise.reject(new Error("rede indisponível"))) };
    await expect(processStripeEvent(e, failing)).rejects.toThrow("rede indisponível");
    expect(await prisma.stripeEvent.count({ where: { id: "evt_falha" } })).toBe(0);
    expect(await processStripeEvent(e, { retrieveSubscription: async () => subscription(org.id) })).toMatchObject({ duplicate: false, handled: true });
  });

  it("pagamento recusado avisa OWNER e ADMIN (app + e-mail), não o EDITOR", async () => {
    const { owner, admin, editor, org } = await setup();
    await prisma.organization.update({ where: { id: org.id }, data: { stripeCustomerId: "cus_A" } });
    const invoice = { id: "in_1", object: "invoice", customer: "cus_A", amount_due: 5900, attempt_count: 1, hosted_invoice_url: "https://invoice.stripe.com/i/abc" };
    const out = await processStripeEvent(event("invoice.payment_failed", invoice), {});
    expect(out).toMatchObject({ handled: true });
    const n = await prisma.notification.findMany({ where: { type: "BILLING" } });
    expect(n.map((x) => x.userId).sort()).toEqual([owner.id, admin.id].sort());
    expect(n.some((x) => x.userId === editor.id)).toBe(false);
    expect(n[0].url).toBe("/painel/plano");
    const emails = await prisma.emailOutbox.findMany({ where: { template: "billing-payment-failed" } });
    expect(emails.map((e) => e.to).sort()).toEqual([owner.email, admin.email].sort());
    expect(emails[0].text).toContain("R$ 59");
    expect(await prisma.auditLog.count({ where: { action: "billing.payment_failed", targetId: org.id } })).toBe(1);
  });

  it("fatura paga ressincroniza a assinatura (sai de em atraso)", async () => {
    const { org } = await setup();
    await processStripeEvent(event("customer.subscription.updated", subscription(org.id, { status: "past_due" })), {});
    const invoice = { id: "in_2", object: "invoice", customer: "cus_A", parent: { type: "subscription_details", subscription_details: { subscription: "sub_A" } } };
    await processStripeEvent(event("invoice.paid", invoice), { retrieveSubscription: async () => subscription(org.id) });
    expect((await prisma.subscription.findUniqueOrThrow({ where: { organizationId: org.id } })).status).toBe("ACTIVE");
  });

  it("eventos não tratados são registrados e ignorados", async () => {
    const out = await processStripeEvent(event("customer.created", { id: "cus_1" }), {});
    expect(out).toMatchObject({ duplicate: false, handled: false });
  });
});

describe("rota POST /api/billing/webhook", () => {
  afterEach(() => {
    process.env.STRIPE_SECRET_KEY = "";
    process.env.STRIPE_WEBHOOK_SECRET = "";
    resetEnvCache();
  });

  async function post(body: string, signature: string | null) {
    const { POST } = await import("@/app/api/billing/webhook/route");
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (signature) headers["stripe-signature"] = signature;
    return POST(new Request("http://localhost:3000/api/billing/webhook", { method: "POST", headers, body }));
  }

  it("sem configuração responde 503", async () => {
    resetEnvCache();
    const res = await post("{}", "t=1,v1=abc");
    expect(res.status).toBe(503);
  });

  it("assinatura inválida → 400; válida → 200; repetida → 200 duplicada", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_sem_rede";
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    resetEnvCache();
    const { org } = await setup();
    const body = JSON.stringify(event("customer.subscription.deleted", subscription(org.id, { status: "canceled" }), "evt_rota"));

    expect((await post(body, "t=1,v1=assinatura-falsa")).status).toBe(400);
    expect((await post(body, null)).status).toBe(400);

    const ok = await post(body, testSignatureHeader(body, SECRET));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ received: true, duplicate: false });

    const again = await post(body, testSignatureHeader(body, SECRET));
    expect(await again.json()).toEqual({ received: true, duplicate: true });
    expect((await prisma.subscription.findUniqueOrThrow({ where: { organizationId: org.id } })).status).toBe("CANCELED");
  });
});
