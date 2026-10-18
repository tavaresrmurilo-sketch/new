import { beforeEach, describe, expect, it } from "vitest";
import { AuthError } from "@/server/auth/guards";
import { createCategory, getAdminSettings, updateCategory, updatePlan, updateSettings } from "@/server/admin/catalog";
import { estimateMrr } from "@/server/admin/metrics";
import { resendEmail } from "@/server/admin/ops";
import {
  changeOrganizationPlan,
  listOrganizations,
  reactivateOrganization,
  setOrganizationTrusted,
  setOrganizationVerified,
  suspendOrganization,
} from "@/server/admin/organizations";
import { getAdminOverview } from "@/server/admin/overview";
import { parseMoneyToCents, planSchema } from "@/server/admin/schemas";
import { listUsers, reactivateUser, suspendUser } from "@/server/admin/users";
import { listedEventWhere } from "@/server/events/visibility";
import { getSetting } from "@/server/settings";
import { createEvent, createOrg, createUser, prisma, resetDb } from "../helpers";

async function adminActor() {
  const admin = await createUser({ role: "ADMIN", name: "Equipe" });
  return { admin, actor: { id: admin.id, ip: "198.51.100.7" } };
}

async function openSession(userId: string, n = 1) {
  for (let i = 0; i < n; i++) {
    await prisma.session.create({ data: { userId, tokenHash: `hash-${userId}-${i}-${Math.random()}`, expiresAt: new Date(Date.now() + 86_400_000) } });
  }
}

beforeEach(async () => {
  await resetDb();
});

describe("usuários", () => {
  it("suspender encerra todas as sessões; reativar devolve o acesso", async () => {
    const { actor } = await adminActor();
    const user = await createUser({ name: "Ana" });
    await openSession(user.id, 3);
    const res = await suspendUser(actor, user.id, "Spam em massa nos eventos");
    expect(res.sessionsEnded).toBe(3);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe("SUSPENDED");
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "admin.user.suspend", targetId: user.id } });
    expect(log.actorId).toBe(actor.id);
    expect(log.ip).toBe("198.51.100.7");
    expect(log.metadata).toMatchObject({ reason: "Spam em massa nos eventos", sessionsEnded: 3 });

    await reactivateUser(actor, user.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe("ACTIVE");
    expect(await prisma.auditLog.count({ where: { action: "admin.user.reactivate" } })).toBe(1);
  });

  it("admin não suspende a si mesmo nem outro admin", async () => {
    const { actor, admin } = await adminActor();
    const other = await createUser({ role: "ADMIN" });
    await openSession(other.id);
    await expect(suspendUser(actor, admin.id, "teste de motivo")).rejects.toThrow(/própria conta/);
    await expect(suspendUser(actor, other.id, "teste de motivo")).rejects.toThrow(/equipe Mixtour/);
    expect(await prisma.session.count({ where: { userId: other.id } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("ACTIVE");
  });

  it("não-admin é bloqueado", async () => {
    const user = await createUser();
    const victim = await createUser();
    await expect(suspendUser({ id: user.id }, victim.id, "qualquer motivo")).rejects.toBeInstanceOf(AuthError);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: victim.id } })).status).toBe("ACTIVE");
  });

  it("busca por nome/e-mail e filtra por status e verificação", async () => {
    await createUser({ name: "Joana Prado", email: "joana@exemplo.dev" });
    await createUser({ name: "Carlos", email: "carlos@exemplo.dev", emailVerifiedAt: null });
    await createUser({ name: "Bia", status: "SUSPENDED" });
    expect((await listUsers({ q: "joana" })).total).toBe(1);
    expect((await listUsers({ q: "EXEMPLO.dev" })).total).toBe(2);
    expect((await listUsers({ verified: "nao" })).items.map((u) => u.name)).toEqual(["Carlos"]);
    expect((await listUsers({ status: "SUSPENDED" })).items.map((u) => u.name)).toEqual(["Bia"]);
  });
});

describe("organizações", () => {
  it("suspensa some do público (listedEventWhere) e volta ao reativar", async () => {
    const { actor } = await adminActor();
    const owner = await createUser();
    const org = await createOrg(owner.id, { name: "Bar Suspeito" });
    const event = await createEvent(org.id);
    expect(await prisma.event.count({ where: { id: event.id, ...listedEventWhere() } })).toBe(1);

    await suspendOrganization(actor, org.id, "Golpes recorrentes com ingressos");
    expect(await prisma.event.count({ where: { id: event.id, ...listedEventWhere() } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: owner.id, type: "SYSTEM" } })).toBe(1);
    await expect(suspendOrganization(actor, org.id, "de novo aqui")).rejects.toThrow(/já está suspensa/);

    await reactivateOrganization(actor, org.id);
    expect(await prisma.event.count({ where: { id: event.id, ...listedEventWhere() } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { targetId: org.id, action: { in: ["admin.org.suspend", "admin.org.reactivate"] } } })).toBe(2);
  });

  it("alteração manual de plano registra audit com motivo e avisa a gestão", async () => {
    const { actor } = await adminActor();
    const owner = await createUser();
    const org = await createOrg(owner.id);
    const res = await changeOrganizationPlan(actor, org.id, "PRO", "Parceria com festival local");
    expect(res.activeSubscription).toBe(false);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).plan).toBe("PRO");
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "admin.org.plan_changed", targetId: org.id } });
    expect(log.metadata).toMatchObject({ from: "FREE", to: "PRO", reason: "Parceria com festival local", source: "manual" });
    expect(log.actorId).toBe(actor.id);
    expect(await prisma.notification.count({ where: { userId: owner.id, type: "BILLING" } })).toBe(1);
    await expect(changeOrganizationPlan(actor, org.id, "PRO", "Mesmo plano")).rejects.toThrow(/já está no plano/);

    await prisma.subscription.create({ data: { organizationId: org.id, stripeSubscriptionId: "sub_x", stripePriceId: "price_x", tier: "PRO", status: "ACTIVE" } });
    const again = await changeOrganizationPlan(actor, org.id, "BUSINESS", "Upgrade de cortesia");
    expect(again.activeSubscription).toBe(true);
  });

  it("selo verificado e publicador confiável com audit; filtros da lista", async () => {
    const { actor } = await adminActor();
    const owner = await createUser();
    const org = await createOrg(owner.id, { name: "Teatro Central" });
    await setOrganizationVerified(actor, org.id, true);
    await setOrganizationTrusted(actor, org.id, true);
    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(after.verified && after.trustedPublisher).toBe(true);
    expect(await prisma.auditLog.count({ where: { targetId: org.id, action: { in: ["admin.org.verify", "admin.org.trust"] } } })).toBe(2);
    expect((await listOrganizations({ verified: "sim" })).total).toBe(1);
    expect((await listOrganizations({ q: "teatro" })).total).toBe(1);
    expect((await listOrganizations({ plan: "PRO" })).total).toBe(0);
  });
});

describe("catálogo e configurações", () => {
  it("categoria: slug único e edição auditada", async () => {
    const { actor } = await adminActor();
    await expect(createCategory(actor, { slug: "shows", name: "Shows", color: "#112233", icon: "music", sortOrder: 1, active: true })).rejects.toThrow(/identificador/);
    const created = await createCategory(actor, { slug: "samba", name: "Samba", color: "#112233", icon: "music", sortOrder: 20, active: true });
    await updateCategory(actor, created.id, { name: "Samba e pagode", color: "#AA00FF", icon: "music", sortOrder: 21, active: false });
    const after = await prisma.category.findUniqueOrThrow({ where: { id: created.id } });
    expect(after).toMatchObject({ name: "Samba e pagode", active: false, sortOrder: 21 });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "admin.category.update" } });
    expect(log.metadata).toMatchObject({ changes: { name: { from: "Samba", to: "Samba e pagode" } } });
  });

  it("plano: valida preços e IDs do Stripe", async () => {
    const { actor } = await adminActor();
    const base = { name: "Pro", tagline: "x", priceMonthlyCents: "79,90", priceYearlyCents: "", maxActiveEvents: "", maxMembers: "5", maxVenues: "10", boostsPerMonth: "3", fullAnalytics: "on", csvExport: "on", highlightBadge: "on", stripePriceMonthly: "price_ABC12345", stripePriceYearly: "", active: "on" };
    const parsed = planSchema.parse(base);
    expect(parsed.priceMonthlyCents).toBe(7990);
    expect(parsed.priceYearlyCents).toBeNull();
    expect(parsed.maxActiveEvents).toBeNull();
    await updatePlan(actor, "PRO", parsed);
    expect((await prisma.plan.findUniqueOrThrow({ where: { tier: "PRO" } })).priceMonthlyCents).toBe(7990);
    await expect(updatePlan(actor, "BUSINESS", { ...planSchema.parse({ ...base, name: "Business" }) })).rejects.toThrow(/já está no plano/);
    await expect(updatePlan(actor, "FREE", planSchema.parse({ ...base, stripePriceMonthly: "" }))).rejects.toThrow(/Gratuito/);
    expect(planSchema.safeParse({ ...base, stripePriceMonthly: "prod_123" }).success).toBe(false);
    expect(parseMoneyToCents("R$ 1.299,00")).toBe(129900);
    expect(parseMoneyToCents("1.299")).toBe(129900);
    expect(parseMoneyToCents("59.9")).toBe(5990);
    expect(Number.isNaN(parseMoneyToCents("abc"))).toBe(true);
  });

  it("configurações: modo de moderação e e-mail verificado", async () => {
    const { actor } = await adminActor();
    await updateSettings(actor, { moderationMode: "all", requireVerifiedEmail: false });
    expect(await getSetting("moderation.mode")).toBe("all");
    expect((await getAdminSettings()).requireVerifiedEmail).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: "admin.settings.update" } })).toBe(1);
  });
});

describe("e-mails e visão geral", () => {
  it("reenvia FAILED/SKIPPED criando novo registro e recusa SENT", async () => {
    const { actor } = await adminActor();
    const failed = await prisma.emailOutbox.create({ data: { to: "a@teste.dev", subject: "Oi", template: "generic", html: "<p>Oi</p>", text: "Oi", status: "FAILED", error: "timeout" } });
    const sent = await prisma.emailOutbox.create({ data: { to: "b@teste.dev", subject: "Oi", template: "generic", html: "<p>Oi</p>", text: "Oi", status: "SENT" } });
    const res = await resendEmail(actor, failed.id);
    expect(res.status).toBe("SKIPPED"); // sem provedor no ambiente de teste
    expect(await prisma.emailOutbox.count({ where: { to: "a@teste.dev" } })).toBe(2);
    await expect(resendEmail(actor, sent.id)).rejects.toThrow(/Só e-mails/);
    expect(await prisma.auditLog.count({ where: { action: "admin.email.resend", targetId: failed.id } })).toBe(1);
  });

  it("KPIs e MRR (anual ÷ 12; cancelada não conta)", async () => {
    await adminActor();
    const owner = await createUser();
    const a = await createOrg(owner.id);
    const b = await createOrg(owner.id);
    const c = await createOrg(owner.id);
    await prisma.subscription.create({ data: { organizationId: a.id, stripeSubscriptionId: "sub_a", stripePriceId: "p", tier: "PRO", status: "ACTIVE", interval: "month" } });
    await prisma.subscription.create({ data: { organizationId: b.id, stripeSubscriptionId: "sub_b", stripePriceId: "p", tier: "BUSINESS", status: "TRIALING", interval: "year" } });
    await prisma.subscription.create({ data: { organizationId: c.id, stripeSubscriptionId: "sub_c", stripePriceId: "p", tier: "PRO", status: "CANCELED", interval: "month" } });
    await createEvent(a.id, { status: "PENDING_REVIEW", publishedAt: null });
    await createEvent(a.id);
    const ov = await getAdminOverview();
    expect(ov.mrr.subscriptions).toBe(2);
    expect(ov.mrr.cents).toBe(5900 + Math.round(199000 / 12));
    expect(ov.events.pendingReview).toBe(1);
    expect(ov.events.upcomingPublished).toBe(1);
    expect(ov.users.new7d).toBe(2);
    expect(ov.series).toHaveLength(30);
    expect(ov.series.at(-1)?.signups).toBe(2);
    expect(ov.series.at(-1)?.events).toBe(2);
    expect(estimateMrr([{ tier: "FREE", status: "ACTIVE", interval: "month" }], [{ tier: "FREE", priceMonthlyCents: 0, priceYearlyCents: null }]).cents).toBe(0);
  });
});
