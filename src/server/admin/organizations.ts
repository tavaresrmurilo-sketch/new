import "server-only";
import type { OrgStatus, PlanTier, Prisma } from "@prisma/client";
import { audit } from "@/server/audit";
import { isEntitled } from "@/server/billing/sync";
import { prisma } from "@/server/db";
import { genericMessage } from "@/server/email/templates";
import { notify } from "@/server/notifications";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { AdminError, assertAdminActor, paged, paging, type AdminActor, type Paged } from "./common";

export const ORG_PAGE_SIZE = 20;

export interface OrgListFilters {
  q?: string;
  plan?: PlanTier;
  status?: OrgStatus;
  verified?: "sim" | "nao";
  page?: number;
}

const LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  logoUrl: true,
  city: true,
  state: true,
  status: true,
  plan: true,
  verified: true,
  trustedPublisher: true,
  createdAt: true,
  subscription: { select: { status: true, tier: true, interval: true } },
  _count: { select: { members: true, events: true, followers: true } },
} satisfies Prisma.OrganizationSelect;

export type AdminOrgRow = Prisma.OrganizationGetPayload<{ select: typeof LIST_SELECT }>;

export async function listOrganizations(f: OrgListFilters = {}): Promise<Paged<AdminOrgRow>> {
  const { page, skip, take } = paging(f.page ?? 1, ORG_PAGE_SIZE);
  const where: Prisma.OrganizationWhereInput = {
    ...(f.q
      ? {
          OR: [
            { name: { contains: f.q, mode: "insensitive" } },
            { slug: { contains: f.q.toLowerCase() } },
            { contactEmail: { contains: f.q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(f.plan ? { plan: f.plan } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.verified ? { verified: f.verified === "sim" } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.organization.findMany({ where, select: LIST_SELECT, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip, take }),
    prisma.organization.count({ where }),
  ]);
  return paged(items, total, page, ORG_PAGE_SIZE);
}

export async function getOrganizationDetail(id: string) {
  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      subscription: true,
      members: {
        orderBy: { createdAt: "asc" },
        select: { role: true, createdAt: true, user: { select: { id: true, name: true, email: true, status: true, avatarUrl: true } } },
      },
      _count: { select: { followers: true, venues: true, events: true } },
    },
  });
  if (!org) return null;
  const [events, byStatus, openReports] = await Promise.all([
    prisma.event.findMany({
      where: { organizationId: id },
      orderBy: { startsAt: "desc" },
      take: 12,
      select: { id: true, slug: true, title: true, status: true, startsAt: true, timezone: true, viewsCount: true, goingCount: true },
    }),
    prisma.event.groupBy({ by: ["status"], where: { organizationId: id }, _count: { _all: true } }),
    prisma.report.count({ where: { organizationId: id, status: "OPEN" } }),
  ]);
  return {
    org,
    events,
    eventsByStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) as Record<string, number>,
    openReports,
  };
}

async function loadOrg(id: string) {
  const org = await prisma.organization.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true, status: true, plan: true, verified: true, trustedPublisher: true },
  });
  if (!org) throw new AdminError("Organização não encontrada.", "NOT_FOUND");
  return org;
}

/** OWNER/ADMIN da organização: recebem os avisos sobre a conta. */
async function notifyManagers(organizationId: string, input: { title: string; body: string; url: string; template: string; paragraphs: string[]; cta?: { label: string; path: string } }) {
  const managers = await prisma.membership.findMany({ where: { organizationId, role: { in: ["OWNER", "ADMIN"] } }, select: { userId: true } });
  for (const m of managers) {
    await notify(
      m.userId,
      { type: input.template.startsWith("billing") ? "BILLING" : "SYSTEM", title: input.title, body: input.body, url: input.url },
      { email: genericMessage({ template: input.template, subject: input.title, heading: input.title, paragraphs: input.paragraphs, cta: input.cta }), push: false },
    ).catch((err) => console.error("[admin:org] aviso", err));
  }
}

export async function setOrganizationVerified(actor: AdminActor, organizationId: string, verified: boolean) {
  await assertAdminActor(actor);
  const org = await loadOrg(organizationId);
  if (org.verified === verified) return org;
  await prisma.organization.update({ where: { id: org.id }, data: { verified } });
  await audit({ actorId: actor.id, action: verified ? "admin.org.verify" : "admin.org.unverify", targetType: "Organization", targetId: org.id, metadata: { name: org.name }, ip: actor.ip });
  return { ...org, verified };
}

export async function setOrganizationTrusted(actor: AdminActor, organizationId: string, trusted: boolean) {
  await assertAdminActor(actor);
  const org = await loadOrg(organizationId);
  if (org.trustedPublisher === trusted) return org;
  await prisma.organization.update({ where: { id: org.id }, data: { trustedPublisher: trusted } });
  await audit({ actorId: actor.id, action: trusted ? "admin.org.trust" : "admin.org.untrust", targetType: "Organization", targetId: org.id, metadata: { name: org.name }, ip: actor.ip });
  return { ...org, trustedPublisher: trusted };
}

/** Suspensa, a organização some do público (regras de visibilidade) e a equipe perde acesso ao painel. */
export async function suspendOrganization(actor: AdminActor, organizationId: string, reason: string) {
  await assertAdminActor(actor);
  const org = await loadOrg(organizationId);
  if (org.status === "SUSPENDED") throw new AdminError("Esta organização já está suspensa.");
  await prisma.organization.update({ where: { id: org.id }, data: { status: "SUSPENDED" } });
  await audit({ actorId: actor.id, action: "admin.org.suspend", targetType: "Organization", targetId: org.id, metadata: { name: org.name, reason }, ip: actor.ip });
  await notifyManagers(org.id, {
    title: `${org.name} foi suspensa no Mixtour`,
    body: reason,
    url: "/painel",
    template: "org-suspended",
    paragraphs: [
      `A organização ${org.name} foi suspensa pela equipe Mixtour e seus eventos deixaram de aparecer para o público.`,
      `Motivo: ${reason}`,
      `Se você acredita que houve um engano, escreva para ${SUPPORT_EMAIL}.`,
    ],
  });
  return { ...org, status: "SUSPENDED" as const };
}

export async function reactivateOrganization(actor: AdminActor, organizationId: string) {
  await assertAdminActor(actor);
  const org = await loadOrg(organizationId);
  if (org.status === "ACTIVE") throw new AdminError("Esta organização já está ativa.");
  await prisma.organization.update({ where: { id: org.id }, data: { status: "ACTIVE" } });
  await audit({ actorId: actor.id, action: "admin.org.reactivate", targetType: "Organization", targetId: org.id, metadata: { name: org.name }, ip: actor.ip });
  await notifyManagers(org.id, {
    title: `${org.name} foi reativada`,
    body: "Seus eventos publicados voltaram a aparecer no Mixtour.",
    url: "/painel",
    template: "org-reactivated",
    paragraphs: [`A organização ${org.name} foi reativada pela equipe Mixtour. Os eventos publicados voltaram a aparecer para o público.`],
    cta: { label: "Abrir o painel", path: "/painel" },
  });
  return { ...org, status: "ACTIVE" as const };
}

const PLAN_NAMES: Record<PlanTier, string> = { FREE: "Gratuito", PRO: "Pro", BUSINESS: "Business" };

/**
 * Altera o plano manualmente (cortesia, parceria, cobrança fora do Stripe).
 * Se houver assinatura vigente no Stripe, o próximo webhook pode sobrescrever — a interface avisa.
 */
export async function changeOrganizationPlan(actor: AdminActor, organizationId: string, plan: PlanTier, reason: string) {
  await assertAdminActor(actor);
  const org = await loadOrg(organizationId);
  if (org.plan === plan) throw new AdminError(`A organização já está no plano ${PLAN_NAMES[plan]}.`);
  const sub = await prisma.subscription.findUnique({ where: { organizationId: org.id }, select: { status: true, tier: true, stripeSubscriptionId: true } });
  const activeSubscription = Boolean(sub && isEntitled(sub.status));
  await prisma.organization.update({ where: { id: org.id }, data: { plan } });
  await audit({
    actorId: actor.id,
    action: "admin.org.plan_changed",
    targetType: "Organization",
    targetId: org.id,
    metadata: { from: org.plan, to: plan, reason, source: "manual", activeSubscription, subscriptionTier: sub?.tier ?? null },
    ip: actor.ip,
  });
  await notifyManagers(org.id, {
    title: `Plano ${PLAN_NAMES[plan]} aplicado a ${org.name}`,
    body: "A equipe Mixtour ajustou o plano da sua organização.",
    url: "/painel/plano",
    template: "billing-manual-plan",
    paragraphs: [`A equipe Mixtour alterou o plano de ${org.name} de ${PLAN_NAMES[org.plan]} para ${PLAN_NAMES[plan]}.`, "Os novos limites já valem no seu painel."],
    cta: { label: "Ver plano", path: "/painel/plano" },
  });
  return { ...org, plan, previousPlan: org.plan, activeSubscription };
}
