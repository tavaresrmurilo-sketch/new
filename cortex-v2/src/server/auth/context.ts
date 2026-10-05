import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Plan, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseOrgSettings, type OrgSettings } from "@/lib/org-settings";
import { ALL_PERMISSIONS, type Permission } from "@/lib/permissions";
import { computeAccess, type Access } from "@/server/billing/access";
import { tenantDb, type TenantDb } from "@/server/db/tenant";
import { AppError } from "@/server/errors";
import { getSession, setActiveOrganization } from "./session";

export interface Ctx {
  via: "session" | "api_key";
  sessionId: string | null;
  user: { id: string; name: string; email: string; avatarUrl: string | null; isSuperAdmin: boolean };
  org: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    currency: string;
    logoUrl: string | null;
    segment: string | null;
    isDemo: boolean;
    onboardingCompletedAt: Date | null;
    onboardingStep: number;
    settings: OrgSettings;
  };
  member: {
    id: string;
    roleKey: string;
    roleName: string;
    title: string | null;
    department: string | null;
    lastActiveAt: Date | null;
    previousVisitAt: Date | null;
  } | null;
  permissions: ReadonlySet<Permission>;
  support: { reason: string | null } | null;
  subscription: { status: SubscriptionStatus; trialEndsAt: Date | null; currentPeriodEnd: Date | null; plan: Plan } | null;
  access: Access;
  db: TenantDb;
}

/** Permissões do modo suporte (SUPER_ADMIN): somente leitura, nunca dados de senha. */
const SUPPORT_PERMISSIONS = ALL_PERMISSIONS.filter((p) => p.endsWith(".read"));

const VISIT_GAP_MS = 4 * 3_600_000;

async function touchMembership(member: { id: string; lastActiveAt: Date | null }) {
  const now = new Date();
  const last = member.lastActiveAt;
  if (last && now.getTime() - last.getTime() < 5 * 60_000) return;
  const newVisit = !last || now.getTime() - last.getTime() > VISIT_GAP_MS;
  await prisma.organizationMember
    .update({ where: { id: member.id }, data: { lastActiveAt: now, ...(newVisit && last ? { previousVisitAt: last } : {}) } })
    .catch(() => undefined);
}

export const getCurrentUser = cache(async () => {
  const session = await getSession();
  return session ? session.user : null;
});

/** Contexto do workspace ativo para a requisição atual (memoizado). null quando não há sessão ou workspace. */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const session = await getSession();
  if (!session) return null;
  const user = session.user;
  const baseUser = { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, isSuperAdmin: user.isSuperAdmin };

  // Modo suporte: SUPER_ADMIN acessando um workspace (somente leitura, auditado)
  if (user.isSuperAdmin && session.supportOrganizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: session.supportOrganizationId },
      include: { subscription: { include: { plan: true } } },
    });
    if (!org) return null;
    return {
      via: "session",
      sessionId: session.id,
      user: baseUser,
      org: orgShape(org),
      member: null,
      permissions: new Set(SUPPORT_PERMISSIONS),
      support: { reason: session.supportReason },
      subscription: org.subscription,
      access: { level: "READ_ONLY", reason: "support", message: "Modo suporte: acesso somente leitura." },
      db: tenantDb(org.id),
    };
  }

  const include = {
    organization: { include: { subscription: { include: { plan: true } } } },
    role: { include: { permissions: { include: { permission: true } } } },
  } as const;

  let membership = session.organizationId
    ? await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: session.organizationId, userId: user.id } },
        include,
      })
    : null;
  if (!membership || membership.status !== "ACTIVE") {
    membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: { joinedAt: "asc" },
      include,
    });
    await setActiveOrganization(session.id, membership?.organizationId ?? null);
  }
  if (!membership) return null;

  const org = membership.organization;
  await touchMembership(membership);
  return {
    via: "session",
    sessionId: session.id,
    user: baseUser,
    org: orgShape(org),
    member: {
      id: membership.id,
      roleKey: membership.role.key,
      roleName: membership.role.name,
      title: membership.title,
      department: membership.department,
      lastActiveAt: membership.lastActiveAt,
      previousVisitAt: membership.previousVisitAt,
    },
    permissions: new Set(membership.role.permissions.map((rp) => rp.permission.key as Permission)),
    support: null,
    subscription: org.subscription,
    access: computeAccess({ blockedAt: org.blockedAt, deletionRequestedAt: org.deletionRequestedAt, subscription: org.subscription }),
    db: tenantDb(org.id),
  };
});

export function orgShape(org: {
  id: string; name: string; slug: string; timezone: string; currency: string; logoUrl: string | null; segment: string | null;
  isDemo: boolean; onboardingCompletedAt: Date | null; onboardingStep: number; settings: unknown;
}): Ctx["org"] {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    timezone: org.timezone,
    currency: org.currency,
    logoUrl: org.logoUrl,
    segment: org.segment,
    isDemo: org.isDemo,
    onboardingCompletedAt: org.onboardingCompletedAt,
    onboardingStep: org.onboardingStep,
    settings: parseOrgSettings(org.settings),
  };
}

export function can(ctx: Pick<Ctx, "permissions">, permission: Permission | Permission[]): boolean {
  const list = Array.isArray(permission) ? permission : [permission];
  return list.every((p) => ctx.permissions.has(p));
}

export function assertCan(ctx: Pick<Ctx, "permissions">, permission: Permission | Permission[]) {
  if (!can(ctx, permission)) throw new AppError("FORBIDDEN", "Você não tem permissão para esta ação.");
}

export function assertWritable(ctx: Pick<Ctx, "access">) {
  if (ctx.access.level !== "FULL") {
    throw new AppError("READ_ONLY", ctx.access.message ?? "Workspace em modo somente leitura.");
  }
}

/** Para Server Components em /app: garante sessão, workspace e (opcionalmente) permissão. */
export async function requireCtx(permission?: Permission | Permission[]): Promise<Ctx> {
  const session = await getSession();
  if (!session) redirect("/login");
  const ctx = await getCtx();
  if (!ctx) redirect(session.user.isSuperAdmin ? "/admin" : "/app/onboarding/workspace");
  if (permission && !can(ctx, permission)) redirect("/app/forbidden");
  return ctx;
}

export async function requireSuperAdmin() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.user.isSuperAdmin) redirect("/app");
  return session;
}
